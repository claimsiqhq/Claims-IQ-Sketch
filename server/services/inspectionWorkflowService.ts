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
import { db } from '../db';
import { eq, and, desc, inArray, ne, gt, sql as drizzleSql } from 'drizzle-orm';
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
  inspectionWorkflows,
  inspectionWorkflowSteps,
  inspectionWorkflowAssets,
  inspectionWorkflowRooms,
  claims,
  endorsements as endorsementsTable,
  policyForms,
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
    const result = await getCarrierOverlays(organizationId);
    if (!result || !result.overlays) {
      return 'No carrier-specific requirements';
    }

    const overlays = result.overlays;
    const requirements: string[] = [];

    for (const [perilKey, overlay] of Object.entries(overlays)) {
      if (!overlay) continue;

      const perilRequirements: string[] = [];

      if (overlay.require_test_squares) {
        perilRequirements.push(`Test squares required${overlay.test_square_count ? ` (${overlay.test_square_count})` : ''}`);
      }
      if (overlay.require_moisture_readings) {
        perilRequirements.push('Moisture readings required');
      }
      if (overlay.require_origin_documentation) {
        perilRequirements.push('Origin documentation required');
      }
      if (overlay.require_high_water_mark) {
        perilRequirements.push('High water mark documentation required');
      }
      if (overlay.require_mold_testing) {
        perilRequirements.push('Mold testing required');
      }
      if (overlay.emphasis && overlay.emphasis.length > 0) {
        perilRequirements.push(`Emphasis: ${overlay.emphasis.join(', ')}`);
      }
      if (overlay.notes) {
        perilRequirements.push(`Notes: ${overlay.notes}`);
      }

      if (perilRequirements.length > 0) {
        requirements.push(`${perilKey}: ${perilRequirements.join('; ')}`);
      }
    }

    return requirements.length > 0 ? requirements.join('\n') : 'No carrier-specific requirements';
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
// WIZARD CONTEXT TYPES
// ============================================

export interface WizardContext {
  propertyInfo?: {
    propertyType: string;
    stories: number;
    hasBasement: boolean;
    hasAttic: boolean;
    hasGarage: boolean;
    hasPool: boolean;
    hasOutbuildings: boolean;
    roofType: string;
    sidingType: string;
  };
  affectedAreas?: {
    roof: boolean;
    roofDetails?: string;
    exteriorNorth: boolean;
    exteriorSouth: boolean;
    exteriorEast: boolean;
    exteriorWest: boolean;
    exteriorDetails?: string;
    interior: boolean;
    basement: boolean;
    attic: boolean;
    garage: boolean;
    otherStructures: boolean;
    otherStructuresDetails?: string;
    landscaping: boolean;
  };
  rooms?: Array<{
    name: string;
    level: string;
    hasDamage: boolean;
    damageType?: string;
  }>;
  safetyInfo?: {
    activeLeaks: boolean;
    standingWater: boolean;
    electricalHazard: boolean;
    structuralConcern: boolean;
    moldVisible: boolean;
    gasSmell: boolean;
    animalsConcern: boolean;
    accessIssues: boolean;
    safetyNotes?: string;
    powerStatus: string;
    waterStatus: string;
  };
  homeownerInput?: {
    primaryConcern?: string;
    previousDamage: boolean;
    previousDamageDetails?: string;
    temporaryRepairs: boolean;
    temporaryRepairsDetails?: string;
    contentsDamage: boolean;
    additionalNotes?: string;
  };
}

/**
 * Format wizard context for inclusion in the AI prompt
 */
function formatWizardContext(wizard: WizardContext): string {
  const sections: string[] = [];

  // Property information
  if (wizard.propertyInfo) {
    const p = wizard.propertyInfo;
    sections.push(`### PROPERTY DETAILS (from field inspection)
- Type: ${p.propertyType.replace('_', ' ')}
- Stories: ${p.stories}
- Features: ${[
      p.hasBasement && 'Basement',
      p.hasAttic && 'Attic',
      p.hasGarage && 'Garage',
      p.hasPool && 'Pool',
      p.hasOutbuildings && 'Outbuildings'
    ].filter(Boolean).join(', ') || 'None noted'}
- Roof Type: ${p.roofType}
- Siding Type: ${p.sidingType}`);
  }

  // Affected areas
  if (wizard.affectedAreas) {
    const a = wizard.affectedAreas;
    const affected: string[] = [];
    if (a.roof) affected.push(`Roof${a.roofDetails ? ` (${a.roofDetails})` : ''}`);
    if (a.exteriorNorth) affected.push('Exterior - North');
    if (a.exteriorSouth) affected.push('Exterior - South');
    if (a.exteriorEast) affected.push('Exterior - East');
    if (a.exteriorWest) affected.push('Exterior - West');
    if (a.exteriorDetails) affected.push(`Exterior notes: ${a.exteriorDetails}`);
    if (a.interior) affected.push('Interior');
    if (a.basement) affected.push('Basement');
    if (a.attic) affected.push('Attic');
    if (a.garage) affected.push('Garage');
    if (a.otherStructures) affected.push(`Other Structures${a.otherStructuresDetails ? ` (${a.otherStructuresDetails})` : ''}`);
    if (a.landscaping) affected.push('Landscaping');

    if (affected.length > 0) {
      sections.push(`### AFFECTED AREAS (confirmed by adjuster)
${affected.map(a => `- ${a}`).join('\n')}`);
    }
  }

  // Rooms needing inspection
  if (wizard.rooms && wizard.rooms.length > 0) {
    const damagedRooms = wizard.rooms.filter(r => r.hasDamage);
    if (damagedRooms.length > 0) {
      sections.push(`### ROOMS REQUIRING INSPECTION
${damagedRooms.map(r => `- ${r.name} (${r.level} floor)${r.damageType ? `: ${r.damageType}` : ''}`).join('\n')}`);
    }
  }

  // Safety concerns
  if (wizard.safetyInfo) {
    const s = wizard.safetyInfo;
    const hazards: string[] = [];
    if (s.electricalHazard) hazards.push('ELECTRICAL HAZARD - exercise extreme caution');
    if (s.gasSmell) hazards.push('GAS SMELL DETECTED - verify utility status');
    if (s.structuralConcern) hazards.push('STRUCTURAL CONCERN - assess stability before entry');
    if (s.activeLeaks) hazards.push('Active water leaks present');
    if (s.standingWater) hazards.push('Standing water present');
    if (s.moldVisible) hazards.push('Visible mold growth');
    if (s.animalsConcern) hazards.push('Animals on property - use caution');
    if (s.accessIssues) hazards.push('Access issues reported');

    if (hazards.length > 0 || s.safetyNotes) {
      sections.push(`### SAFETY CONCERNS (CRITICAL)
${hazards.map(h => `- ${h}`).join('\n')}
${s.safetyNotes ? `\nNotes: ${s.safetyNotes}` : ''}
- Power Status: ${s.powerStatus}
- Water Status: ${s.waterStatus}`);
    }
  }

  // Homeowner input
  if (wizard.homeownerInput) {
    const h = wizard.homeownerInput;
    const notes: string[] = [];
    if (h.primaryConcern) notes.push(`Primary Concern: "${h.primaryConcern}"`);
    if (h.previousDamage) notes.push(`Previous Damage: Yes${h.previousDamageDetails ? ` - ${h.previousDamageDetails}` : ''}`);
    if (h.temporaryRepairs) notes.push(`Temporary Repairs Made: Yes${h.temporaryRepairsDetails ? ` - ${h.temporaryRepairsDetails}` : ''}`);
    if (h.contentsDamage) notes.push('Contents damage reported');
    if (h.additionalNotes) notes.push(`Additional Notes: ${h.additionalNotes}`);

    if (notes.length > 0) {
      sections.push(`### HOMEOWNER INPUT
${notes.join('\n')}`);
    }
  }

  return sections.join('\n\n');
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
 * @param wizardContext - Optional context from the pre-generation wizard
 * @returns GenerateWorkflowResult
 */
export async function generateInspectionWorkflow(
  claimId: string,
  organizationId: string,
  userId?: string,
  forceRegenerate: boolean = false,
  wizardContext?: WizardContext
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
      try {
        const existingWorkflows = await db
          .select()
          .from(inspectionWorkflows)
          .where(
            and(
              eq(inspectionWorkflows.claimId, claimId),
              eq(inspectionWorkflows.organizationId, organizationId),
              inArray(inspectionWorkflows.status, ['draft', 'active'])
            )
          )
          .orderBy(desc(inspectionWorkflows.version))
          .limit(1);

        if (existingWorkflows.length > 0) {
          const existing = existingWorkflows[0];
          return {
            success: true,
            workflow: existing,
            workflowId: existing.id,
            version: existing.version,
          };
        }
      } catch (err) {
        console.error('Error checking for existing workflow:', err);
      }
    }

    // Step 4: Get the next version number
    let nextVersion = 1;
    try {
      const versionData = await db
        .select({ version: inspectionWorkflows.version })
        .from(inspectionWorkflows)
        .where(eq(inspectionWorkflows.claimId, claimId))
        .orderBy(desc(inspectionWorkflows.version))
        .limit(1);

      if (versionData.length > 0) {
        nextVersion = versionData[0].version + 1;
      }
    } catch (err) {
      console.error('Error getting next version:', err);
    }

    // Step 5: Archive previous active workflows
    if (forceRegenerate) {
      try {
        await db
          .update(inspectionWorkflows)
          .set({
            status: 'archived',
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inspectionWorkflows.claimId, claimId),
              eq(inspectionWorkflows.organizationId, organizationId),
              inArray(inspectionWorkflows.status, ['draft', 'active'])
            )
          );
      } catch (err) {
        console.error('Error archiving previous workflows:', err);
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
    // Build wizard context section if available
    const wizardContextText = wizardContext ? formatWizardContext(wizardContext) : '';

    const variables = {
      claim_number: context.claimNumber,
      primary_peril: context.primaryPeril,
      secondary_perils: context.secondaryPerils.join(', ') || 'None',
      property_address: [context.propertyAddress, context.propertyCity, context.propertyState, context.propertyZip].filter(Boolean).join(', ') || 'Unknown',
      date_of_loss: context.dateOfLoss || 'Unknown',
      loss_description: context.lossDescription || 'No description provided',
      policy_number: context.policyContext.policyNumber || 'Unknown',
      coverage_a: context.policyContext.dwellingLimit || context.policyContext.coverageA || 'Unknown',
      coverage_b: context.policyContext.coverageB || 'Unknown',
      coverage_c: context.policyContext.coverageC || 'Unknown',
      coverage_d: context.policyContext.coverageD || 'Unknown',
      deductible: context.policyContext.deductible || 'Unknown',
      endorsements_list: formatEndorsements(context),
      briefing_summary: briefingSummary,
      peril_inspection_rules: formatPerilRules(context.primaryPeril, context.secondaryPerils),
      carrier_requirements: carrierRequirements,
      wizard_context: wizardContextText,
    };

    // Substitute variables in the prompt template
    let userPrompt = promptConfig.userPromptTemplate
      ? substituteVariables(promptConfig.userPromptTemplate, variables)
      : buildFallbackPrompt(variables);

    // Append wizard context if available (for more specific workflow generation)
    if (wizardContextText) {
      userPrompt += `\n\n## FIELD ADJUSTER INPUT (HIGH PRIORITY)\nThe following information was gathered by the field adjuster during their initial assessment. Use this to create a more targeted workflow:\n\n${wizardContextText}`;
    }

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
    const [workflow] = await db
      .insert(inspectionWorkflows)
      .values({
        organizationId,
        claimId,
        version: nextVersion,
        status: InspectionWorkflowStatus.DRAFT,
        primaryPeril: context.primaryPeril,
        secondaryPerils: context.secondaryPerils,
        sourceBriefingId: briefing?.id || null,
        workflowJson,
        generatedFrom,
        createdBy: userId || null,
      })
      .returning();

    if (!workflow) {
      return {
        success: false,
        error: 'Failed to create workflow',
      };
    }

    // Step 9: Insert the steps
    let stepIndex = 0;
    for (const step of aiResponse.steps) {
      try {
        const [insertedStep] = await db
          .insert(inspectionWorkflowSteps)
          .values({
            workflowId: workflow.id,
            stepIndex: stepIndex++,
            phase: step.phase,
            stepType: step.step_type,
            title: step.title,
            instructions: step.instructions,
            required: step.required,
            tags: step.tags || [],
            estimatedMinutes: step.estimated_minutes,
            perilSpecific: step.peril_specific || null,
            status: InspectionStepStatus.PENDING,
          })
          .returning();

        if (!insertedStep) {
          console.error('Error inserting step: no result returned');
          continue;
        }

        // Insert assets for this step
        if (step.assets && step.assets.length > 0) {
          const assetInserts = step.assets.map(asset => ({
            stepId: insertedStep.id,
            assetType: asset.asset_type,
            label: asset.label,
            required: asset.required,
            metadata: asset.metadata || {},
            status: 'pending',
          }));

          try {
            await db.insert(inspectionWorkflowAssets).values(assetInserts);
          } catch (assetsError) {
            console.error('Error inserting assets:', assetsError);
          }
        }
      } catch (stepError) {
        console.error('Error inserting step:', stepError);
        continue;
      }
    }

    return {
      success: true,
      workflow,
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
    const currentWorkflows = await db
      .select({ id: inspectionWorkflows.id, generatedFrom: inspectionWorkflows.generatedFrom })
      .from(inspectionWorkflows)
      .where(
        and(
          eq(inspectionWorkflows.claimId, claimId),
          eq(inspectionWorkflows.organizationId, organizationId),
          inArray(inspectionWorkflows.status, ['draft', 'active'])
        )
      );

    // Archive the current workflow with the reason
    if (currentWorkflows && currentWorkflows.length > 0) {
      for (const wf of currentWorkflows) {
        const updatedGeneratedFrom = {
          ...(wf.generatedFrom as Record<string, unknown> || {}),
          archived_reason: reason,
        };

        await db
          .update(inspectionWorkflows)
          .set({
            status: 'archived',
            archivedAt: new Date(),
            updatedAt: new Date(),
            generatedFrom: updatedGeneratedFrom,
          })
          .where(eq(inspectionWorkflows.id, wf.id));
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
    const [workflow] = await db
      .select()
      .from(inspectionWorkflows)
      .where(eq(inspectionWorkflows.id, workflowId))
      .limit(1);

    if (!workflow) {
      return { success: false, addedSteps: 0, error: 'Workflow not found' };
    }

    const workflowJson = workflow.workflowJson as InspectionWorkflowJson;

    if (!workflowJson.room_template) {
      return { success: false, addedSteps: 0, error: 'Workflow has no room template' };
    }

    // Get the current max step index
    const maxIndexData = await db
      .select({ stepIndex: inspectionWorkflowSteps.stepIndex })
      .from(inspectionWorkflowSteps)
      .where(eq(inspectionWorkflowSteps.workflowId, workflowId))
      .orderBy(desc(inspectionWorkflowSteps.stepIndex))
      .limit(1);

    let nextIndex = maxIndexData.length > 0 ? maxIndexData[0].stepIndex + 1 : 0;

    let addedSteps = 0;

    for (const roomName of roomNames) {
      // Create the room record
      const [room] = await db
        .insert(inspectionWorkflowRooms)
        .values({
          workflowId,
          name: roomName,
          sortOrder: addedSteps,
        })
        .returning();

      if (!room) {
        console.error('Error creating room');
        continue;
      }

      const roomId = room.id;

      // Add standard room steps
      const standardSteps = workflowJson.room_template.standard_steps.map(step => ({
        workflowId,
        stepIndex: nextIndex++,
        phase: 'interior',
        stepType: step.step_type,
        title: `${roomName}: ${step.title}`,
        instructions: step.instructions.replace('{room}', roomName),
        required: step.required,
        estimatedMinutes: step.estimated_minutes,
        roomId,
        roomName,
        status: 'pending',
      }));

      if (standardSteps.length > 0) {
        try {
          await db.insert(inspectionWorkflowSteps).values(standardSteps);
          addedSteps += standardSteps.length;
        } catch (stepsError) {
          console.error('Error inserting standard steps:', stepsError);
        }
      }

      // Add peril-specific steps if applicable
      const primaryPeril = workflow.primaryPeril;
      const perilSteps = primaryPeril ? workflowJson.room_template.peril_specific_steps?.[primaryPeril] : null;

      if (perilSteps && perilSteps.length > 0) {
        const perilSpecificSteps = perilSteps.map(step => ({
          workflowId,
          stepIndex: nextIndex++,
          phase: 'interior',
          stepType: step.step_type,
          title: `${roomName}: ${step.title}`,
          instructions: step.instructions.replace('{room}', roomName),
          required: step.required,
          estimatedMinutes: step.estimated_minutes,
          roomId,
          roomName,
          perilSpecific: primaryPeril,
          status: 'pending',
        }));

        try {
          await db.insert(inspectionWorkflowSteps).values(perilSpecificSteps);
          addedSteps += perilSpecificSteps.length;
        } catch (perilStepsError) {
          console.error('Error inserting peril-specific steps:', perilStepsError);
        }
      }
    }

    // Update the workflow updated_at
    try {
      await db
        .update(inspectionWorkflows)
        .set({ updatedAt: new Date() })
        .where(eq(inspectionWorkflows.id, workflowId));
    } catch (updateError) {
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
    const [workflowData] = await db
      .select()
      .from(inspectionWorkflows)
      .where(
        and(
          eq(inspectionWorkflows.id, workflowId),
          eq(inspectionWorkflows.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!workflowData) {
      return null;
    }

    const workflow: InspectionWorkflow = workflowData;

    // Get steps
    const stepsData = await db
      .select()
      .from(inspectionWorkflowSteps)
      .where(eq(inspectionWorkflowSteps.workflowId, workflowId))
      .orderBy(inspectionWorkflowSteps.stepIndex);

    // Get all assets for these steps
    const stepIds = stepsData.map(s => s.id);
    let assetsData: InspectionWorkflowAsset[] = [];
    if (stepIds.length > 0) {
      assetsData = await db
        .select()
        .from(inspectionWorkflowAssets)
        .where(inArray(inspectionWorkflowAssets.stepId, stepIds));
    }

    // Map assets to their steps
    const assetsByStepId = new Map<string, InspectionWorkflowAsset[]>();
    for (const asset of assetsData) {
      if (!assetsByStepId.has(asset.stepId)) {
        assetsByStepId.set(asset.stepId, []);
      }
      assetsByStepId.get(asset.stepId)!.push(asset);
    }

    const steps: StepWithAssets[] = stepsData.map(r => ({
      ...r,
      assets: assetsByStepId.get(r.id) || [],
    }));

    // Get rooms
    const roomsData = await db
      .select()
      .from(inspectionWorkflowRooms)
      .where(eq(inspectionWorkflowRooms.workflowId, workflowId))
      .orderBy(inspectionWorkflowRooms.sortOrder);

    const rooms: InspectionWorkflowRoom[] = roomsData;

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
    const [data] = await db
      .select({ id: inspectionWorkflows.id })
      .from(inspectionWorkflows)
      .where(
        and(
          eq(inspectionWorkflows.claimId, claimId),
          eq(inspectionWorkflows.organizationId, organizationId),
          ne(inspectionWorkflows.status, 'archived')
        )
      )
      .orderBy(desc(inspectionWorkflows.version))
      .limit(1);

    if (!data) {
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
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === InspectionStepStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes;
    }

    if (updates.actualMinutes !== undefined) {
      updateData.actualMinutes = updates.actualMinutes;
    }

    if (updates.completedBy !== undefined) {
      updateData.completedBy = updates.completedBy;
    }

    const [data] = await db
      .update(inspectionWorkflowSteps)
      .set(updateData)
      .where(eq(inspectionWorkflowSteps.id, stepId))
      .returning();

    if (!data) {
      console.error('Error updating workflow step: no result returned');
      return null;
    }

    return data;
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
    const maxIndexData = await db
      .select({ stepIndex: inspectionWorkflowSteps.stepIndex })
      .from(inspectionWorkflowSteps)
      .where(eq(inspectionWorkflowSteps.workflowId, workflowId))
      .orderBy(desc(inspectionWorkflowSteps.stepIndex))
      .limit(1);

    const nextIndex = maxIndexData.length > 0 ? maxIndexData[0].stepIndex + 1 : 0;

    const [data] = await db
      .insert(inspectionWorkflowSteps)
      .values({
        workflowId,
        stepIndex: nextIndex,
        phase: step.phase,
        stepType: step.stepType,
        title: step.title,
        instructions: step.instructions || null,
        required: step.required ?? true,
        estimatedMinutes: step.estimatedMinutes ?? 5,
        roomId: step.roomId || null,
        roomName: step.roomName || null,
        status: 'pending',
      })
      .returning();

    if (!data) {
      console.error('Error adding workflow step: no result returned');
      return null;
    }

    return data;
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
    const maxOrderData = await db
      .select({ sortOrder: inspectionWorkflowRooms.sortOrder })
      .from(inspectionWorkflowRooms)
      .where(eq(inspectionWorkflowRooms.workflowId, workflowId))
      .orderBy(desc(inspectionWorkflowRooms.sortOrder))
      .limit(1);

    const nextOrder = maxOrderData.length > 0 ? (maxOrderData[0].sortOrder || 0) + 1 : 0;

    const [data] = await db
      .insert(inspectionWorkflowRooms)
      .values({
        workflowId,
        name: room.name,
        level: room.level || null,
        roomType: room.roomType || null,
        notes: room.notes || null,
        sortOrder: nextOrder,
      })
      .returning();

    if (!data) {
      console.error('Error adding workflow room: no result returned');
      return null;
    }

    return data;
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
    const [workflow] = await db
      .select()
      .from(inspectionWorkflows)
      .where(
        and(
          eq(inspectionWorkflows.claimId, claimId),
          eq(inspectionWorkflows.organizationId, organizationId),
          inArray(inspectionWorkflows.status, ['draft', 'active'])
        )
      )
      .orderBy(desc(inspectionWorkflows.version))
      .limit(1);

    if (!workflow) {
      return { shouldRegenerate: false };
    }

    // Get the current claim to check for peril changes
    const [claim] = await db
      .select({ primaryPeril: claims.primaryPeril })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    // Check if peril has changed
    if (claim && workflow.primaryPeril !== claim.primaryPeril) {
      return {
        shouldRegenerate: true,
        reason: `Primary peril changed from ${workflow.primaryPeril} to ${claim.primaryPeril}`,
      };
    }

    // Check if endorsements have changed since workflow was generated
    if (workflow.createdAt) {
      const newEndorsements = await db
        .select({ id: endorsementsTable.id })
        .from(endorsementsTable)
        .where(
          and(
            eq(endorsementsTable.claimId, claimId),
            gt(endorsementsTable.createdAt, workflow.createdAt)
          )
        )
        .limit(1);

      if (newEndorsements.length > 0) {
        return {
          shouldRegenerate: true,
          reason: 'New endorsements added since workflow generation',
        };
      }

      // Check if policy forms have changed
      const newPolicyForms = await db
        .select({ id: policyForms.id })
        .from(policyForms)
        .where(
          and(
            eq(policyForms.claimId, claimId),
            gt(policyForms.createdAt, workflow.createdAt)
          )
        )
        .limit(1);

      if (newPolicyForms.length > 0) {
        return {
          shouldRegenerate: true,
          reason: 'New policy forms added since workflow generation',
        };
      }
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
