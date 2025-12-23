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
import { pool } from '../db';
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
  const client = await pool.connect();

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
      const existingResult = await client.query(
        `SELECT * FROM inspection_workflows
         WHERE claim_id = $1 AND organization_id = $2 AND status IN ('draft', 'active')
         ORDER BY version DESC
         LIMIT 1`,
        [claimId, organizationId]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
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
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM inspection_workflows
       WHERE claim_id = $1`,
      [claimId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    // Step 5: Archive previous active workflows
    if (forceRegenerate) {
      await client.query(
        `UPDATE inspection_workflows
         SET status = 'archived', archived_at = NOW(), updated_at = NOW()
         WHERE claim_id = $1 AND organization_id = $2 AND status IN ('draft', 'active')`,
        [claimId, organizationId]
      );
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
    const workflowResult = await client.query(
      `INSERT INTO inspection_workflows (
        organization_id, claim_id, version, status,
        primary_peril, secondary_perils, source_briefing_id,
        workflow_json, generated_from, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        organizationId,
        claimId,
        nextVersion,
        InspectionWorkflowStatus.DRAFT,
        context.primaryPeril,
        JSON.stringify(context.secondaryPerils),
        briefing?.id || null,
        JSON.stringify(workflowJson),
        JSON.stringify(generatedFrom),
        userId || null,
      ]
    );

    const workflow = workflowResult.rows[0];

    // Step 9: Insert the steps
    let stepIndex = 0;
    for (const step of aiResponse.steps) {
      const stepResult = await client.query(
        `INSERT INTO inspection_workflow_steps (
          workflow_id, step_index, phase, step_type, title, instructions,
          required, tags, estimated_minutes, peril_specific, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          workflow.id,
          stepIndex++,
          step.phase,
          step.step_type,
          step.title,
          step.instructions,
          step.required,
          JSON.stringify(step.tags || []),
          step.estimated_minutes,
          step.peril_specific || null,
          InspectionStepStatus.PENDING,
        ]
      );

      const stepId = stepResult.rows[0].id;

      // Insert assets for this step
      if (step.assets && step.assets.length > 0) {
        for (const asset of step.assets) {
          await client.query(
            `INSERT INTO inspection_workflow_assets (
              step_id, asset_type, label, required, metadata, status
            ) VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [
              stepId,
              asset.asset_type,
              asset.label,
              asset.required,
              JSON.stringify(asset.metadata || {}),
            ]
          );
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
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    // Archive the current workflow with the reason
    await client.query(
      `UPDATE inspection_workflows
       SET status = 'archived',
           archived_at = NOW(),
           updated_at = NOW(),
           generated_from = generated_from || $3
       WHERE claim_id = $1 AND organization_id = $2 AND status IN ('draft', 'active')`,
      [claimId, organizationId, JSON.stringify({ archived_reason: reason })]
    );

    // Generate a new workflow
    return await generateInspectionWorkflow(claimId, organizationId, userId, true);
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    // Get the workflow
    const workflowResult = await client.query(
      `SELECT * FROM inspection_workflows WHERE id = $1`,
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      return { success: false, addedSteps: 0, error: 'Workflow not found' };
    }

    const workflow = workflowResult.rows[0];
    const workflowJson = workflow.workflow_json as InspectionWorkflowJson;

    if (!workflowJson.room_template) {
      return { success: false, addedSteps: 0, error: 'Workflow has no room template' };
    }

    // Get the current max step index
    const maxIndexResult = await client.query(
      `SELECT COALESCE(MAX(step_index), -1) + 1 as next_index
       FROM inspection_workflow_steps WHERE workflow_id = $1`,
      [workflowId]
    );
    let nextIndex = maxIndexResult.rows[0].next_index;

    let addedSteps = 0;

    for (const roomName of roomNames) {
      // Create the room record
      const roomResult = await client.query(
        `INSERT INTO inspection_workflow_rooms (workflow_id, name, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [workflowId, roomName, addedSteps]
      );
      const roomId = roomResult.rows[0].id;

      // Add standard room steps
      for (const step of workflowJson.room_template.standard_steps) {
        await client.query(
          `INSERT INTO inspection_workflow_steps (
            workflow_id, step_index, phase, step_type, title, instructions,
            required, estimated_minutes, room_id, room_name, status
          ) VALUES ($1, $2, 'interior', $3, $4, $5, $6, $7, $8, $9, 'pending')`,
          [
            workflowId,
            nextIndex++,
            step.step_type,
            `${roomName}: ${step.title}`,
            step.instructions.replace('{room}', roomName),
            step.required,
            step.estimated_minutes,
            roomId,
            roomName,
          ]
        );
        addedSteps++;
      }

      // Add peril-specific steps if applicable
      const primaryPeril = workflow.primary_peril;
      const perilSteps = workflowJson.room_template.peril_specific_steps?.[primaryPeril];

      if (perilSteps) {
        for (const step of perilSteps) {
          await client.query(
            `INSERT INTO inspection_workflow_steps (
              workflow_id, step_index, phase, step_type, title, instructions,
              required, estimated_minutes, room_id, room_name, peril_specific, status
            ) VALUES ($1, $2, 'interior', $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
            [
              workflowId,
              nextIndex++,
              step.step_type,
              `${roomName}: ${step.title}`,
              step.instructions.replace('{room}', roomName),
              step.required,
              step.estimated_minutes,
              roomId,
              roomName,
              primaryPeril,
            ]
          );
          addedSteps++;
        }
      }
    }

    // Update the workflow updated_at
    await client.query(
      `UPDATE inspection_workflows SET updated_at = NOW() WHERE id = $1`,
      [workflowId]
    );

    return { success: true, addedSteps };
  } catch (error) {
    console.error('Error expanding workflow for rooms:', error);
    return {
      success: false,
      addedSteps: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    // Get the workflow
    const workflowResult = await client.query(
      `SELECT * FROM inspection_workflows
       WHERE id = $1 AND organization_id = $2`,
      [workflowId, organizationId]
    );

    if (workflowResult.rows.length === 0) {
      return null;
    }

    const row = workflowResult.rows[0];
    const workflow: InspectionWorkflow = {
      id: row.id,
      organizationId: row.organization_id,
      claimId: row.claim_id,
      version: row.version,
      status: row.status,
      primaryPeril: row.primary_peril,
      secondaryPerils: row.secondary_perils,
      sourceBriefingId: row.source_briefing_id,
      workflowJson: row.workflow_json,
      generatedFrom: row.generated_from,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
    };

    // Get steps with assets
    const stepsResult = await client.query(
      `SELECT s.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', a.id,
                    'stepId', a.step_id,
                    'assetType', a.asset_type,
                    'label', a.label,
                    'description', a.description,
                    'required', a.required,
                    'metadata', a.metadata,
                    'fileId', a.file_id,
                    'filePath', a.file_path,
                    'fileUrl', a.file_url,
                    'status', a.status,
                    'capturedBy', a.captured_by,
                    'capturedAt', a.captured_at,
                    'createdAt', a.created_at,
                    'updatedAt', a.updated_at
                  )
                ) FILTER (WHERE a.id IS NOT NULL), '[]'
              ) as assets
       FROM inspection_workflow_steps s
       LEFT JOIN inspection_workflow_assets a ON a.step_id = s.id
       WHERE s.workflow_id = $1
       GROUP BY s.id
       ORDER BY s.step_index`,
      [workflowId]
    );

    const steps: StepWithAssets[] = stepsResult.rows.map(r => ({
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
      assets: r.assets || [],
    }));

    // Get rooms
    const roomsResult = await client.query(
      `SELECT * FROM inspection_workflow_rooms
       WHERE workflow_id = $1
       ORDER BY sort_order`,
      [workflowId]
    );

    const rooms: InspectionWorkflowRoom[] = roomsResult.rows.map(r => ({
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
  } finally {
    client.release();
  }
}

/**
 * Get the latest workflow for a claim
 */
export async function getClaimWorkflow(
  claimId: string,
  organizationId: string
): Promise<FullWorkflow | null> {
  const client = await pool.connect();

  try {
    // Get the latest non-archived workflow
    const result = await client.query(
      `SELECT id FROM inspection_workflows
       WHERE claim_id = $1 AND organization_id = $2 AND status != 'archived'
       ORDER BY version DESC
       LIMIT 1`,
      [claimId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return await getWorkflow(result.rows[0].id, organizationId);
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      if (updates.status === InspectionStepStatus.COMPLETED) {
        setClauses.push(`completed_at = NOW()`);
      }
    }

    if (updates.notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }

    if (updates.actualMinutes !== undefined) {
      setClauses.push(`actual_minutes = $${paramIndex++}`);
      values.push(updates.actualMinutes);
    }

    if (updates.completedBy !== undefined) {
      setClauses.push(`completed_by = $${paramIndex++}`);
      values.push(updates.completedBy);
    }

    values.push(stepId);

    const result = await client.query(
      `UPDATE inspection_workflow_steps
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      stepIndex: row.step_index,
      phase: row.phase,
      stepType: row.step_type,
      title: row.title,
      instructions: row.instructions,
      required: row.required,
      tags: row.tags,
      dependencies: row.dependencies,
      estimatedMinutes: row.estimated_minutes,
      actualMinutes: row.actual_minutes,
      status: row.status,
      completedBy: row.completed_by,
      completedAt: row.completed_at,
      notes: row.notes,
      roomId: row.room_id,
      roomName: row.room_name,
      perilSpecific: row.peril_specific,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    // Get the next step index
    const maxResult = await client.query(
      `SELECT COALESCE(MAX(step_index), -1) + 1 as next_index
       FROM inspection_workflow_steps WHERE workflow_id = $1`,
      [workflowId]
    );
    const nextIndex = maxResult.rows[0].next_index;

    const result = await client.query(
      `INSERT INTO inspection_workflow_steps (
        workflow_id, step_index, phase, step_type, title, instructions,
        required, estimated_minutes, room_id, room_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING *`,
      [
        workflowId,
        nextIndex,
        step.phase,
        step.stepType,
        step.title,
        step.instructions || null,
        step.required ?? true,
        step.estimatedMinutes ?? 5,
        step.roomId || null,
        step.roomName || null,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      stepIndex: row.step_index,
      phase: row.phase,
      stepType: row.step_type,
      title: row.title,
      instructions: row.instructions,
      required: row.required,
      tags: row.tags,
      dependencies: row.dependencies,
      estimatedMinutes: row.estimated_minutes,
      actualMinutes: row.actual_minutes,
      status: row.status,
      completedBy: row.completed_by,
      completedAt: row.completed_at,
      notes: row.notes,
      roomId: row.room_id,
      roomName: row.room_name,
      perilSpecific: row.peril_specific,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
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
  const client = await pool.connect();

  try {
    // Get the next sort order
    const maxResult = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
       FROM inspection_workflow_rooms WHERE workflow_id = $1`,
      [workflowId]
    );
    const nextOrder = maxResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO inspection_workflow_rooms (
        workflow_id, name, level, room_type, notes, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        workflowId,
        room.name,
        room.level || null,
        room.roomType || null,
        room.notes || null,
        nextOrder,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      workflowId: row.workflow_id,
      name: row.name,
      level: row.level,
      roomType: row.room_type,
      lengthFt: row.length_ft,
      widthFt: row.width_ft,
      heightFt: row.height_ft,
      notes: row.notes,
      claimRoomId: row.claim_room_id,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
  }
}

/**
 * Check if a workflow should be regenerated based on claim changes
 */
export async function shouldRegenerateWorkflow(
  claimId: string,
  organizationId: string
): Promise<{ shouldRegenerate: boolean; reason?: string }> {
  const client = await pool.connect();

  try {
    // Get the current workflow
    const workflowResult = await client.query(
      `SELECT w.*, c.primary_peril as current_peril, c.updated_at as claim_updated_at
       FROM inspection_workflows w
       JOIN claims c ON c.id = w.claim_id
       WHERE w.claim_id = $1 AND w.organization_id = $2 AND w.status IN ('draft', 'active')
       ORDER BY w.version DESC
       LIMIT 1`,
      [claimId, organizationId]
    );

    if (workflowResult.rows.length === 0) {
      return { shouldRegenerate: false };
    }

    const workflow = workflowResult.rows[0];

    // Check if peril has changed
    if (workflow.primary_peril !== workflow.current_peril) {
      return {
        shouldRegenerate: true,
        reason: `Primary peril changed from ${workflow.primary_peril} to ${workflow.current_peril}`,
      };
    }

    // Check if endorsements have changed since workflow was generated
    const endorsementCountResult = await client.query(
      `SELECT COUNT(*) as count FROM endorsements
       WHERE claim_id = $1 AND created_at > $2`,
      [claimId, workflow.created_at]
    );

    if (parseInt(endorsementCountResult.rows[0].count) > 0) {
      return {
        shouldRegenerate: true,
        reason: 'New endorsements added since workflow generation',
      };
    }

    // Check if policy forms have changed
    const policyFormCountResult = await client.query(
      `SELECT COUNT(*) as count FROM policy_forms
       WHERE claim_id = $1 AND created_at > $2`,
      [claimId, workflow.created_at]
    );

    if (parseInt(policyFormCountResult.rows[0].count) > 0) {
      return {
        shouldRegenerate: true,
        reason: 'New policy forms added since workflow generation',
      };
    }

    return { shouldRegenerate: false };
  } finally {
    client.release();
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
