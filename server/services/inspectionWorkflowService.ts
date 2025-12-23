/**
 * Inspection Workflow Service
 *
 * Generates step-by-step inspection workflows derived from FNOL, Policy,
 * Endorsements, existing AI Claim Briefing, and peril inspection rules.
 *
 * Purpose:
 * - Create actionable, editable inspection checklists for field adjusters
 * - Integrate with claim briefing for consistency
 * - Support room-based workflow expansion
 * - Maintain versioning for audit trail
 *
 * Rules:
 * - NO coverage determinations
 * - Uses peril-specific inspection rules
 * - Integrates carrier overlays when available
 * - Preserves previous versions on regeneration
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  PromptKey,
  InspectionWorkflowJson,
  InspectionPhase,
  InspectionStepType,
  InspectionWorkflowStatus,
  InspectionStepStatus,
  WorkflowGeneratedFrom,
  InspectionWorkflow,
  InspectionWorkflowStep,
  InspectionWorkflowRoom,
  InspectionWorkflowAsset,
} from '../../shared/schema';
import {
  buildPerilAwareClaimContext,
  PerilAwareClaimContext,
} from './perilAwareContext';
import {
  getInspectionRulesForPeril,
  getMergedInspectionGuidance,
  PERIL_INSPECTION_RULES,
} from '../config/perilInspectionRules';
import { getPromptWithFallback, substituteVariables } from './promptService';
import { getClaimBriefing } from './claimBriefingService';
import { getCarrierOverlays } from './carrierOverlayService';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface GenerateWorkflowResult {
  success: boolean;
  workflow?: InspectionWorkflow;
  workflowId?: string;
  version?: number;
  error?: string;
  model?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface WorkflowWithSteps extends InspectionWorkflow {
  steps: InspectionWorkflowStep[];
  rooms: InspectionWorkflowRoom[];
}

export interface StepWithAssets extends InspectionWorkflowStep {
  assets: InspectionWorkflowAsset[];
}

export interface FullWorkflow {
  workflow: InspectionWorkflow;
  steps: StepWithAssets[];
  rooms: InspectionWorkflowRoom[];
  stats: {
    totalSteps: number;
    completedSteps: number;
    pendingSteps: number;
    requiredAssets: number;
    capturedAssets: number;
    estimatedMinutes: number;
    actualMinutes: number;
  };
}

// AI response structure
interface AIWorkflowResponse {
  metadata: {
    claim_number: string;
    primary_peril: string;
    secondary_perils: string[];
    property_type?: string;
    estimated_total_time_minutes: number;
    generated_at: string;
  };
  phases: {
    phase: string;
    title: string;
    description: string;
    estimated_minutes: number;
    step_count: number;
  }[];
  steps: {
    phase: string;
    step_type: string;
    title: string;
    instructions: string;
    required: boolean;
    tags?: string[];
    estimated_minutes: number;
    assets?: {
      asset_type: string;
      label: string;
      required: boolean;
      metadata?: Record<string, unknown>;
    }[];
    peril_specific?: string;
  }[];
  room_template?: {
    standard_steps: {
      step_type: string;
      title: string;
      instructions: string;
      required: boolean;
      estimated_minutes: number;
    }[];
    peril_specific_steps?: Record<string, {
      step_type: string;
      title: string;
      instructions: string;
      required: boolean;
      estimated_minutes: number;
    }[]>;
  };
  tools_and_equipment: {
    category: string;
    items: {
      name: string;
      required: boolean;
      purpose: string;
    }[];
  }[];
  open_questions?: {
    question: string;
    context: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a hash of the inputs used to generate the workflow
 */
function generateInputHash(
  context: PerilAwareClaimContext,
  briefingId?: string,
  carrierOverlayId?: string
): string {
  const hashInput = {
    claimId: context.claimId,
    primaryPeril: context.primaryPeril,
    secondaryPerils: context.secondaryPerils,
    lossDescription: context.lossDescription,
    dateOfLoss: context.dateOfLoss,
    endorsements: context.endorsements.map(e => e.id),
    policyNumber: context.policyContext.policyNumber,
    briefingId,
    carrierOverlayId,
    updatedAt: context.updatedAt,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex');
}

/**
 * Format endorsements for the AI prompt
 */
function formatEndorsements(context: PerilAwareClaimContext): string {
  if (context.endorsements.length === 0) {
    return 'No endorsements';
  }

  return context.endorsements
    .map(e => `- ${e.formNumber}: ${e.documentTitle || 'No title'}\n  ${e.description || 'No description'}\n  Key Changes: ${JSON.stringify(e.keyChanges)}`)
    .join('\n');
}

/**
 * Format peril inspection rules for the AI prompt
 */
function formatPerilRules(primaryPeril: string, secondaryPerils: string[]): string {
  const allPerils = [primaryPeril, ...secondaryPerils];
  const rulesText: string[] = [];

  for (const peril of allPerils) {
    const rules = PERIL_INSPECTION_RULES[peril];
    if (rules) {
      rulesText.push(`\n### ${rules.displayName} Inspection Rules`);
      rulesText.push(`Priority Areas: ${rules.priorityAreas.slice(0, 3).map(a => a.area).join(', ')}`);
      rulesText.push(`Required Photos: ${rules.requiredPhotos.slice(0, 3).map(p => p.category).join(', ')}`);
      rulesText.push(`Common Misses: ${rules.commonMisses.slice(0, 3).map(m => m.issue).join(', ')}`);
      rulesText.push(`Safety: ${rules.safetyConsiderations.slice(0, 2).join(', ')}`);
    }
  }

  return rulesText.join('\n');
}

/**
 * Format carrier requirements from overlay
 */
async function formatCarrierRequirements(organizationId: string): Promise<string> {
  try {
    const overlays = await getCarrierOverlays(organizationId);
    if (!overlays || overlays.length === 0) {
      return 'No carrier-specific requirements';
    }

    return overlays
      .map((o: any) => `- ${o.category}: ${o.description || o.title}`)
      .join('\n');
  } catch {
    return 'No carrier-specific requirements';
  }
}

/**
 * Validate the AI response matches the expected schema
 */
function validateWorkflowSchema(response: unknown): response is AIWorkflowResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const obj = response as Record<string, unknown>;

  // Check required top-level fields
  if (!obj.metadata || !obj.phases || !obj.steps || !obj.tools_and_equipment) {
    return false;
  }

  // Check metadata
  const metadata = obj.metadata as Record<string, unknown>;
  if (!metadata.claim_number || !metadata.primary_peril) {
    return false;
  }

  // Check phases array
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) {
    return false;
  }

  // Check steps array
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    return false;
  }

  return true;
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Generate an inspection workflow for a claim
 *
 * @param claimId - The UUID of the claim
 * @param organizationId - The organization ID
 * @param userId - The user generating the workflow
 * @param forceRegenerate - Skip cache and regenerate
 * @returns GenerateWorkflowResult
 */
export async function generateInspectionWorkflow(
  claimId: string,
  organizationId: string,
  userId?: string,
  forceRegenerate: boolean = false
): Promise<GenerateWorkflowResult> {
  try {
    // Step 1: Build the peril-aware claim context
    const context = await buildPerilAwareClaimContext(claimId);
    if (!context) {
      return {
        success: false,
        error: 'Claim not found or unable to build context',
      };
    }

    // Step 2: Get existing briefing if available
    const briefing = await getClaimBriefing(claimId, organizationId);
    const briefingSummary = briefing
      ? `Primary Peril: ${briefing.briefingJson?.claim_summary?.primary_peril || 'Unknown'}
Overview: ${briefing.briefingJson?.claim_summary?.overview?.join('; ') || 'No overview'}
Priorities: ${briefing.briefingJson?.inspection_strategy?.what_to_prioritize?.join('; ') || 'No priorities'}`
      : 'No briefing available - generate a comprehensive workflow based on FNOL and peril rules';

    // Step 3: Check for existing active workflow (unless force regenerate)
    if (!forceRegenerate) {
      const { data: existingWorkflows, error: existingError } = await supabaseAdmin
        .from('inspection_workflows')
        .select('*')
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active'])
        .order('version', { ascending: false })
        .limit(1);

      if (existingError) {
        console.error('Error checking for existing workflow:', existingError);
      }

      if (existingWorkflows && existingWorkflows.length > 0) {
        const existing = existingWorkflows[0];
        return {
          success: true,
          workflow: {
            id: existing.id,
            organizationId: existing.organization_id,
            claimId: existing.claim_id,
            version: existing.version,
            status: existing.status,
            primaryPeril: existing.primary_peril,
            secondaryPerils: existing.secondary_perils,
            sourceBriefingId: existing.source_briefing_id,
            workflowJson: existing.workflow_json,
            generatedFrom: existing.generated_from,
            createdBy: existing.created_by,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
            completedAt: existing.completed_at,
            archivedAt: existing.archived_at,
          },
          workflowId: existing.id,
          version: existing.version,
        };
      }
    }

    // Step 4: Get the next version number
    const { data: versionData, error: versionError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('version')
      .eq('claim_id', claimId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = versionError || !versionData ? 1 : versionData.version + 1;

    // Step 5: Archive previous active workflows
    if (forceRegenerate) {
      const { error: archiveError } = await supabaseAdmin
        .from('inspection_workflows')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active']);

      if (archiveError) {
        console.error('Error archiving previous workflows:', archiveError);
      }
    }

    // Step 6: Generate new workflow with AI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!process.env.OPENAI_API_KEY) {
      return {
        success: false,
        error: 'OpenAI API key not configured',
      };
    }

    // Get prompt configuration
    const promptConfig = await getPromptWithFallback(PromptKey.INSPECTION_WORKFLOW_GENERATOR);

    // Build carrier requirements
    const carrierRequirements = await formatCarrierRequirements(organizationId);

    // Build the prompt variables
    const variables = {
      claim_number: context.claimNumber,
      primary_peril: context.primaryPeril,
      secondary_perils: context.secondaryPerils.join(', ') || 'None',
      property_address: [context.propertyAddress, context.propertyCity, context.propertyState, context.propertyZip].filter(Boolean).join(', ') || 'Unknown',
      date_of_loss: context.dateOfLoss || 'Unknown',
      loss_description: context.lossDescription || 'No description provided',
      policy_number: context.policyContext.policyNumber || 'Unknown',
      coverage_a: context.policyContext.dwellingLimit || 'Unknown',
      coverage_b: context.policyContext.otherStructuresLimit || 'Unknown',
      coverage_c: context.policyContext.personalPropertyLimit || 'Unknown',
      coverage_d: context.policyContext.lossOfUseLimit || 'Unknown',
      deductible: context.policyContext.deductible || 'Unknown',
      endorsements_list: formatEndorsements(context),
      briefing_summary: briefingSummary,
      peril_inspection_rules: formatPerilRules(context.primaryPeril, context.secondaryPerils),
      carrier_requirements: carrierRequirements,
    };

    // Substitute variables in the prompt template
    const userPrompt = promptConfig.userPromptTemplate
      ? substituteVariables(promptConfig.userPromptTemplate, variables)
      : buildFallbackPrompt(variables);

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: promptConfig.model || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: promptConfig.systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: promptConfig.temperature || 0.3,
      max_tokens: promptConfig.maxTokens || 8000,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      return {
        success: false,
        error: 'No response from AI',
      };
    }

    // Parse and validate the response
    let aiResponse: AIWorkflowResponse;
    try {
      aiResponse = JSON.parse(responseContent);
      if (!validateWorkflowSchema(aiResponse)) {
        return {
          success: false,
          error: 'Invalid workflow structure from AI',
        };
      }
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      };
    }

    // Step 7: Build the workflow JSON
    const workflowJson: InspectionWorkflowJson = {
      metadata: {
        claim_number: aiResponse.metadata.claim_number,
        primary_peril: aiResponse.metadata.primary_peril,
        secondary_perils: aiResponse.metadata.secondary_perils || [],
        property_type: aiResponse.metadata.property_type,
        estimated_total_time_minutes: aiResponse.metadata.estimated_total_time_minutes || 0,
        generated_at: new Date().toISOString(),
      },
      phases: aiResponse.phases.map(p => ({
        phase: p.phase as InspectionPhase,
        title: p.title,
        description: p.description,
        estimated_minutes: p.estimated_minutes,
        step_count: p.step_count,
      })),
      room_template: aiResponse.room_template
        ? {
            standard_steps: aiResponse.room_template.standard_steps.map(s => ({
              step_type: s.step_type as InspectionStepType,
              title: s.title,
              instructions: s.instructions,
              required: s.required,
              estimated_minutes: s.estimated_minutes,
            })),
            peril_specific_steps: aiResponse.room_template.peril_specific_steps
              ? Object.fromEntries(
                  Object.entries(aiResponse.room_template.peril_specific_steps).map(([peril, steps]) => [
                    peril,
                    steps.map(s => ({
                      step_type: s.step_type as InspectionStepType,
                      title: s.title,
                      instructions: s.instructions,
                      required: s.required,
                      estimated_minutes: s.estimated_minutes,
                    })),
                  ])
                )
              : undefined,
          }
        : undefined,
      tools_and_equipment: aiResponse.tools_and_equipment,
      open_questions: aiResponse.open_questions,
    };

    // Build generated_from metadata
    const generatedFrom: WorkflowGeneratedFrom = {
      briefing_id: briefing?.id,
      peril_rules_version: '1.0',
      generated_at: new Date().toISOString(),
      model: completion.model,
      prompt_version: promptConfig.version || 1,
    };

    // Step 8: Insert the workflow
    const { data: workflow, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .insert({
        organization_id: organizationId,
        claim_id: claimId,
        version: nextVersion,
        status: InspectionWorkflowStatus.DRAFT,
        primary_peril: context.primaryPeril,
        secondary_perils: context.secondaryPerils,
        source_briefing_id: briefing?.id || null,
        workflow_json: workflowJson,
        generated_from: generatedFrom,
        created_by: userId || null,
      })
      .select('*')
      .single();

    if (workflowError || !workflow) {
      return {
        success: false,
        error: `Failed to create workflow: ${workflowError?.message || 'Unknown error'}`,
      };
    }

    // Step 9: Insert the steps
    let stepIndex = 0;
    for (const step of aiResponse.steps) {
      const { data: insertedStep, error: stepError } = await supabaseAdmin
        .from('inspection_workflow_steps')
        .insert({
          workflow_id: workflow.id,
          step_index: stepIndex++,
          phase: step.phase,
          step_type: step.step_type,
          title: step.title,
          instructions: step.instructions,
          required: step.required,
          tags: step.tags || [],
          estimated_minutes: step.estimated_minutes,
          peril_specific: step.peril_specific || null,
          status: InspectionStepStatus.PENDING,
        })
        .select('id')
        .single();

      if (stepError || !insertedStep) {
        console.error('Error inserting step:', stepError);
        continue;
      }

      const stepId = insertedStep.id;

      // Insert assets for this step
      if (step.assets && step.assets.length > 0) {
        const assetInserts = step.assets.map(asset => ({
          step_id: stepId,
          asset_type: asset.asset_type,
          label: asset.label,
          required: asset.required,
          metadata: asset.metadata || {},
          status: 'pending',
        }));

        const { error: assetsError } = await supabaseAdmin
          .from('inspection_workflow_assets')
          .insert(assetInserts);

        if (assetsError) {
          console.error('Error inserting assets:', assetsError);
        }
      }
    }

    return {
      success: true,
      workflow: {
        id: workflow.id,
        organizationId: workflow.organization_id,
        claimId: workflow.claim_id,
        version: workflow.version,
        status: workflow.status,
        primaryPeril: workflow.primary_peril,
        secondaryPerils: workflow.secondary_perils,
        sourceBriefingId: workflow.source_briefing_id,
        workflowJson: workflow.workflow_json,
        generatedFrom: workflow.generated_from,
        createdBy: workflow.created_by,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
        completedAt: workflow.completed_at,
        archivedAt: workflow.archived_at,
      },
      workflowId: workflow.id,
      version: workflow.version,
      model: completion.model,
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    console.error('Error generating inspection workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Regenerate a workflow when claim data changes
 */
export async function regenerateWorkflow(
  claimId: string,
  organizationId: string,
  reason: string,
  userId?: string
): Promise<GenerateWorkflowResult> {
  try {
    // First, get current workflows to merge archived_reason into generated_from
    const { data: currentWorkflows } = await supabaseAdmin
      .from('inspection_workflows')
      .select('id, generated_from')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'active']);

    // Archive the current workflow with the reason
    if (currentWorkflows && currentWorkflows.length > 0) {
      for (const wf of currentWorkflows) {
        const updatedGeneratedFrom = {
          ...(wf.generated_from || {}),
          archived_reason: reason,
        };

        await supabaseAdmin
          .from('inspection_workflows')
          .update({
            status: 'archived',
            archived_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            generated_from: updatedGeneratedFrom,
          })
          .eq('id', wf.id);
      }
    }

    // Generate a new workflow
    return await generateInspectionWorkflow(claimId, organizationId, userId, true);
  } catch (error) {
    console.error('Error regenerating workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Expand a workflow by adding room-specific steps
 */
export async function expandWorkflowForRooms(
  workflowId: string,
  roomNames: string[],
  userId?: string
): Promise<{ success: boolean; addedSteps: number; error?: string }> {
  try {
    // Get the workflow
    const { data: workflow, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return { success: false, addedSteps: 0, error: 'Workflow not found' };
    }

    const workflowJson = workflow.workflow_json as InspectionWorkflowJson;

    if (!workflowJson.room_template) {
      return { success: false, addedSteps: 0, error: 'Workflow has no room template' };
    }

    // Get the current max step index
    const { data: maxIndexData } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('step_index')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: false })
      .limit(1)
      .single();

    let nextIndex = maxIndexData ? maxIndexData.step_index + 1 : 0;

    let addedSteps = 0;

    for (const roomName of roomNames) {
      // Create the room record
      const { data: room, error: roomError } = await supabaseAdmin
        .from('inspection_workflow_rooms')
        .insert({
          workflow_id: workflowId,
          name: roomName,
          sort_order: addedSteps,
        })
        .select('id')
        .single();

      if (roomError || !room) {
        console.error('Error creating room:', roomError);
        continue;
      }

      const roomId = room.id;

      // Add standard room steps
      const standardSteps = workflowJson.room_template.standard_steps.map(step => ({
        workflow_id: workflowId,
        step_index: nextIndex++,
        phase: 'interior',
        step_type: step.step_type,
        title: `${roomName}: ${step.title}`,
        instructions: step.instructions.replace('{room}', roomName),
        required: step.required,
        estimated_minutes: step.estimated_minutes,
        room_id: roomId,
        room_name: roomName,
        status: 'pending',
      }));

      if (standardSteps.length > 0) {
        const { error: stepsError } = await supabaseAdmin
          .from('inspection_workflow_steps')
          .insert(standardSteps);

        if (stepsError) {
          console.error('Error inserting standard steps:', stepsError);
        } else {
          addedSteps += standardSteps.length;
        }
      }

      // Add peril-specific steps if applicable
      const primaryPeril = workflow.primary_peril;
      const perilSteps = workflowJson.room_template.peril_specific_steps?.[primaryPeril];

      if (perilSteps && perilSteps.length > 0) {
        const perilSpecificSteps = perilSteps.map(step => ({
          workflow_id: workflowId,
          step_index: nextIndex++,
          phase: 'interior',
          step_type: step.step_type,
          title: `${roomName}: ${step.title}`,
          instructions: step.instructions.replace('{room}', roomName),
          required: step.required,
          estimated_minutes: step.estimated_minutes,
          room_id: roomId,
          room_name: roomName,
          peril_specific: primaryPeril,
          status: 'pending',
        }));

        const { error: perilStepsError } = await supabaseAdmin
          .from('inspection_workflow_steps')
          .insert(perilSpecificSteps);

        if (perilStepsError) {
          console.error('Error inserting peril-specific steps:', perilStepsError);
        } else {
          addedSteps += perilSpecificSteps.length;
        }
      }
    }

    // Update the workflow updated_at
    const { error: updateError } = await supabaseAdmin
      .from('inspection_workflows')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', workflowId);

    if (updateError) {
      console.error('Error updating workflow timestamp:', updateError);
    }

    return { success: true, addedSteps };
  } catch (error) {
    console.error('Error expanding workflow for rooms:', error);
    return {
      success: false,
      addedSteps: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate workflow JSON structure
 */
export function validateWorkflowJson(workflowJson: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!workflowJson || typeof workflowJson !== 'object') {
    errors.push('Workflow JSON must be an object');
    return { valid: false, errors };
  }

  const wf = workflowJson as Record<string, unknown>;

  // Check metadata
  if (!wf.metadata) {
    errors.push('Missing metadata field');
  } else {
    const metadata = wf.metadata as Record<string, unknown>;
    if (!metadata.claim_number) errors.push('Missing metadata.claim_number');
    if (!metadata.primary_peril) errors.push('Missing metadata.primary_peril');
    if (typeof metadata.estimated_total_time_minutes !== 'number') {
      errors.push('metadata.estimated_total_time_minutes must be a number');
    }
  }

  // Check phases
  if (!Array.isArray(wf.phases)) {
    errors.push('phases must be an array');
  } else if (wf.phases.length === 0) {
    errors.push('phases array cannot be empty');
  }

  // Check tools_and_equipment
  if (!Array.isArray(wf.tools_and_equipment)) {
    errors.push('tools_and_equipment must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get a workflow with all its steps and rooms
 */
export async function getWorkflow(
  workflowId: string,
  organizationId: string
): Promise<FullWorkflow | null> {
  try {
    // Get the workflow
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('organization_id', organizationId)
      .single();

    if (workflowError || !workflowData) {
      return null;
    }

    const workflow: InspectionWorkflow = {
      id: workflowData.id,
      organizationId: workflowData.organization_id,
      claimId: workflowData.claim_id,
      version: workflowData.version,
      status: workflowData.status,
      primaryPeril: workflowData.primary_peril,
      secondaryPerils: workflowData.secondary_perils,
      sourceBriefingId: workflowData.source_briefing_id,
      workflowJson: workflowData.workflow_json,
      generatedFrom: workflowData.generated_from,
      createdBy: workflowData.created_by,
      createdAt: workflowData.created_at,
      updatedAt: workflowData.updated_at,
      completedAt: workflowData.completed_at,
      archivedAt: workflowData.archived_at,
    };

    // Get steps
    const { data: stepsData, error: stepsError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: true });

    if (stepsError) {
      console.error('Error fetching steps:', stepsError);
      return null;
    }

    // Get all assets for these steps
    const { data: assetsData } = await supabaseAdmin
      .from('inspection_workflow_assets')
      .select('*')
      .in('step_id', stepsData?.map(s => s.id) || []);

    // Map assets to their steps
    const assetsByStepId = new Map<string, InspectionWorkflowAsset[]>();
    if (assetsData) {
      for (const asset of assetsData) {
        if (!assetsByStepId.has(asset.step_id)) {
          assetsByStepId.set(asset.step_id, []);
        }
        assetsByStepId.get(asset.step_id)!.push({
          id: asset.id,
          stepId: asset.step_id,
          assetType: asset.asset_type,
          label: asset.label,
          description: asset.description,
          required: asset.required,
          metadata: asset.metadata,
          fileId: asset.file_id,
          filePath: asset.file_path,
          fileUrl: asset.file_url,
          status: asset.status,
          capturedBy: asset.captured_by,
          capturedAt: asset.captured_at,
          createdAt: asset.created_at,
          updatedAt: asset.updated_at,
        });
      }
    }

    const steps: StepWithAssets[] = (stepsData || []).map(r => ({
      id: r.id,
      workflowId: r.workflow_id,
      stepIndex: r.step_index,
      phase: r.phase,
      stepType: r.step_type,
      title: r.title,
      instructions: r.instructions,
      required: r.required,
      tags: r.tags,
      dependencies: r.dependencies,
      estimatedMinutes: r.estimated_minutes,
      actualMinutes: r.actual_minutes,
      status: r.status,
      completedBy: r.completed_by,
      completedAt: r.completed_at,
      notes: r.notes,
      roomId: r.room_id,
      roomName: r.room_name,
      perilSpecific: r.peril_specific,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assets: assetsByStepId.get(r.id) || [],
    }));

    // Get rooms
    const { data: roomsData } = await supabaseAdmin
      .from('inspection_workflow_rooms')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: true });

    const rooms: InspectionWorkflowRoom[] = (roomsData || []).map(r => ({
      id: r.id,
      workflowId: r.workflow_id,
      name: r.name,
      level: r.level,
      roomType: r.room_type,
      lengthFt: r.length_ft,
      widthFt: r.width_ft,
      heightFt: r.height_ft,
      notes: r.notes,
      claimRoomId: r.claim_room_id,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // Calculate stats
    const totalSteps = steps.length;
    const completedSteps = steps.filter(s => s.status === InspectionStepStatus.COMPLETED).length;
    const pendingSteps = steps.filter(s => s.status === InspectionStepStatus.PENDING).length;
    const allAssets = steps.flatMap(s => s.assets);
    const requiredAssets = allAssets.filter(a => a.required).length;
    const capturedAssets = allAssets.filter(a => a.status === 'captured' || a.status === 'approved').length;
    const estimatedMinutes = steps.reduce((sum, s) => sum + (s.estimatedMinutes || 0), 0);
    const actualMinutes = steps.reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

    return {
      workflow,
      steps,
      rooms,
      stats: {
        totalSteps,
        completedSteps,
        pendingSteps,
        requiredAssets,
        capturedAssets,
        estimatedMinutes,
        actualMinutes,
      },
    };
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return null;
  }
}

/**
 * Get the latest workflow for a claim
 */
export async function getClaimWorkflow(
  claimId: string,
  organizationId: string
): Promise<FullWorkflow | null> {
  try {
    // Get the latest non-archived workflow
    const { data, error } = await supabaseAdmin
      .from('inspection_workflows')
      .select('id')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .neq('status', 'archived')
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return await getWorkflow(data.id, organizationId);
  } catch (error) {
    console.error('Error fetching claim workflow:', error);
    return null;
  }
}

/**
 * Update a workflow step
 */
export async function updateWorkflowStep(
  stepId: string,
  updates: Partial<{
    status: string;
    notes: string;
    actualMinutes: number;
    completedBy: string;
  }>
): Promise<InspectionWorkflowStep | null> {
  try {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === InspectionStepStatus.COMPLETED) {
        updateData.completed_at = new Date().toISOString();
      }
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes;
    }

    if (updates.actualMinutes !== undefined) {
      updateData.actual_minutes = updates.actualMinutes;
    }

    if (updates.completedBy !== undefined) {
      updateData.completed_by = updates.completedBy;
    }

    const { data, error } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .update(updateData)
      .eq('id', stepId)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error updating workflow step:', error);
      return null;
    }

    return {
      id: data.id,
      workflowId: data.workflow_id,
      stepIndex: data.step_index,
      phase: data.phase,
      stepType: data.step_type,
      title: data.title,
      instructions: data.instructions,
      required: data.required,
      tags: data.tags,
      dependencies: data.dependencies,
      estimatedMinutes: data.estimated_minutes,
      actualMinutes: data.actual_minutes,
      status: data.status,
      completedBy: data.completed_by,
      completedAt: data.completed_at,
      notes: data.notes,
      roomId: data.room_id,
      roomName: data.room_name,
      perilSpecific: data.peril_specific,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error('Error updating workflow step:', error);
    return null;
  }
}

/**
 * Add a custom step to a workflow
 */
export async function addWorkflowStep(
  workflowId: string,
  step: {
    phase: string;
    stepType: string;
    title: string;
    instructions?: string;
    required?: boolean;
    estimatedMinutes?: number;
    roomId?: string;
    roomName?: string;
  }
): Promise<InspectionWorkflowStep | null> {
  try {
    // Get the next step index
    const { data: maxIndexData } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('step_index')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: false })
      .limit(1)
      .single();

    const nextIndex = maxIndexData ? maxIndexData.step_index + 1 : 0;

    const { data, error } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .insert({
        workflow_id: workflowId,
        step_index: nextIndex,
        phase: step.phase,
        step_type: step.stepType,
        title: step.title,
        instructions: step.instructions || null,
        required: step.required ?? true,
        estimated_minutes: step.estimatedMinutes ?? 5,
        room_id: step.roomId || null,
        room_name: step.roomName || null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error adding workflow step:', error);
      return null;
    }

    return {
      id: data.id,
      workflowId: data.workflow_id,
      stepIndex: data.step_index,
      phase: data.phase,
      stepType: data.step_type,
      title: data.title,
      instructions: data.instructions,
      required: data.required,
      tags: data.tags,
      dependencies: data.dependencies,
      estimatedMinutes: data.estimated_minutes,
      actualMinutes: data.actual_minutes,
      status: data.status,
      completedBy: data.completed_by,
      completedAt: data.completed_at,
      notes: data.notes,
      roomId: data.room_id,
      roomName: data.room_name,
      perilSpecific: data.peril_specific,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error('Error adding workflow step:', error);
    return null;
  }
}

/**
 * Add a room to a workflow
 */
export async function addWorkflowRoom(
  workflowId: string,
  room: {
    name: string;
    level?: string;
    roomType?: string;
    notes?: string;
  }
): Promise<InspectionWorkflowRoom | null> {
  try {
    // Get the next sort order
    const { data: maxOrderData } = await supabaseAdmin
      .from('inspection_workflow_rooms')
      .select('sort_order')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = maxOrderData ? maxOrderData.sort_order + 1 : 0;

    const { data, error } = await supabaseAdmin
      .from('inspection_workflow_rooms')
      .insert({
        workflow_id: workflowId,
        name: room.name,
        level: room.level || null,
        room_type: room.roomType || null,
        notes: room.notes || null,
        sort_order: nextOrder,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error adding workflow room:', error);
      return null;
    }

    return {
      id: data.id,
      workflowId: data.workflow_id,
      name: data.name,
      level: data.level,
      roomType: data.room_type,
      lengthFt: data.length_ft,
      widthFt: data.width_ft,
      heightFt: data.height_ft,
      notes: data.notes,
      claimRoomId: data.claim_room_id,
      sortOrder: data.sort_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error('Error adding workflow room:', error);
    return null;
  }
}

/**
 * Check if a workflow should be regenerated based on claim changes
 */
export async function shouldRegenerateWorkflow(
  claimId: string,
  organizationId: string
): Promise<{ shouldRegenerate: boolean; reason?: string }> {
  try {
    // Get the current workflow
    const { data: workflow, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'active'])
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (workflowError || !workflow) {
      return { shouldRegenerate: false };
    }

    // Get the current claim to check for peril changes
    const { data: claim } = await supabaseAdmin
      .from('claims')
      .select('primary_peril')
      .eq('id', claimId)
      .single();

    // Check if peril has changed
    if (claim && workflow.primary_peril !== claim.primary_peril) {
      return {
        shouldRegenerate: true,
        reason: `Primary peril changed from ${workflow.primary_peril} to ${claim.primary_peril}`,
      };
    }

    // Check if endorsements have changed since workflow was generated
    const { data: newEndorsements, error: endorsementsError } = await supabaseAdmin
      .from('endorsements')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claimId)
      .gt('created_at', workflow.created_at);

    if (!endorsementsError && newEndorsements && newEndorsements.length > 0) {
      return {
        shouldRegenerate: true,
        reason: 'New endorsements added since workflow generation',
      };
    }

    // Check if policy forms have changed
    const { data: newPolicyForms, error: policyFormsError } = await supabaseAdmin
      .from('policy_forms')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claimId)
      .gt('created_at', workflow.created_at);

    if (!policyFormsError && newPolicyForms && newPolicyForms.length > 0) {
      return {
        shouldRegenerate: true,
        reason: 'New policy forms added since workflow generation',
      };
    }

    return { shouldRegenerate: false };
  } catch (error) {
    console.error('Error checking if workflow should regenerate:', error);
    return { shouldRegenerate: false };
  }
}

/**
 * Fallback prompt builder when no template is available
 */
function buildFallbackPrompt(variables: Record<string, string>): string {
  return `Generate an inspection workflow for the following claim:

## Claim Information
Claim Number: ${variables.claim_number}
Primary Peril: ${variables.primary_peril}
Secondary Perils: ${variables.secondary_perils}
Property Address: ${variables.property_address}
Loss Date: ${variables.date_of_loss}
Loss Description: ${variables.loss_description}

## Policy Information
Policy Number: ${variables.policy_number}
Coverage A (Dwelling): ${variables.coverage_a}
Coverage B (Other Structures): ${variables.coverage_b}
Coverage C (Contents): ${variables.coverage_c}
Coverage D (Additional Living Expense): ${variables.coverage_d}
Deductible: ${variables.deductible}

## Endorsements
${variables.endorsements_list}

## Claim Briefing Summary
${variables.briefing_summary}

## Peril-Specific Inspection Rules
${variables.peril_inspection_rules}

## Carrier-Specific Requirements
${variables.carrier_requirements}

Generate a comprehensive inspection workflow JSON.`;
}
