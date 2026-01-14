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
  UnifiedClaimContext,
  EndorsementImpact,
  RoofPaymentScheduleEntry,
  EffectivePolicy,
  WorkflowJsonStep,
} from '../../shared/schema';
import { PERIL_INSPECTION_RULES } from '../config/perilInspectionRules';
import { getPromptWithFallback } from './promptService';
import { getClaimBriefing } from './claimBriefingService';
import { buildUnifiedClaimContext } from './unifiedClaimContextService';
import { generateStepTypeGuidanceForPrompt } from '../../shared/config/stepTypeConfig';

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

// NO LEGACY ASSETS - StepWithAssets deprecated, use InspectionWorkflowStep with evidenceRequirements
// Kept for type compatibility during transition
export interface StepWithAssets extends InspectionWorkflowStep {
  assets: InspectionWorkflowAsset[]; // DEPRECATED - use evidenceRequirements instead
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

function mapWorkflowFromDb(data: any): InspectionWorkflow {
  return {
    id: data.id,
    organizationId: data.organization_id,
    claimId: data.claim_id,
    version: data.version,
    status: data.status,
    primaryPeril: data.primary_peril,
    secondaryPerils: data.secondary_perils,
    sourceBriefingId: data.source_briefing_id,
    workflowJson: data.workflow_json,
    generatedFrom: data.generated_from,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    completedAt: data.completed_at,
    archivedAt: data.archived_at,
  };
}

function mapStepFromDb(data: any): InspectionWorkflowStep {
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
    // Dynamic workflow fields
    origin: data.origin,
    sourceRuleId: data.source_rule_id,
    conditions: data.conditions,
    evidenceRequirements: data.evidence_requirements,
    blocking: data.blocking,
    blockingCondition: data.blocking_condition,
    geometryBinding: data.geometry_binding,
    endorsementSource: data.endorsement_source,
  };
}

function mapRoomFromDb(data: any): InspectionWorkflowRoom {
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
}

function mapAssetFromDb(data: any): InspectionWorkflowAsset {
  return {
    id: data.id,
    stepId: data.step_id,
    assetType: data.asset_type,
    label: data.label,
    description: data.description,
    required: data.required,
    metadata: data.metadata,
    fileId: data.file_id,
    filePath: data.file_path,
    fileUrl: data.file_url,
    status: data.status,
    capturedBy: data.captured_by,
    capturedAt: data.captured_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

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

// ============================================
// EFFECTIVE POLICY INSPECTION REQUIREMENTS
// ============================================

/**
 * Policy-based inspection step to inject
 */
interface PolicyInspectionStep {
  phase: string;
  step_type: string;
  title: string;
  instructions: string;
  required: boolean;
  tags: string[];
  estimated_minutes: number;
  peril_specific?: string;
  policySource: string;  // Endorsement form code or "base_policy"
}

/**
 * Generate deterministic inspection requirements based on effective policy
 *
 * This function injects policy-driven inspection steps that are NOT based on
 * AI inference. Requirements are derived programmatically from the resolved
 * effective policy.
 *
 * IMPORTANT: AI may phrase steps, but requirements MUST be injected programmatically.
 */
function generatePolicyBasedInspectionSteps(
  effectivePolicy: EffectivePolicy
): PolicyInspectionStep[] {
  const steps: PolicyInspectionStep[] = [];
  const roofingSystem = effectivePolicy.lossSettlement?.roofingSystem;

  // Rule: If roofing is on scheduled basis, require specific documentation
  // Precedence: This is deterministic from endorsement, not AI-inferred
  if (roofingSystem?.applies && roofingSystem.basis === 'SCHEDULED') {
    // Require roof material confirmation
    steps.push({
      phase: 'exterior',
      step_type: 'observation',
      title: 'Confirm Roof Material Type',
      instructions: `POLICY REQUIREMENT: This claim has a roofing schedule endorsement (${roofingSystem.sourceEndorsement || 'see policy'}). Document the exact roof material type as it affects settlement percentage. Common materials: asphalt shingle, wood shake, metal, tile, slate.`,
      required: true,
      tags: ['policy_requirement', 'roof_schedule', 'material_confirmation'],
      estimated_minutes: 5,
      policySource: roofingSystem.sourceEndorsement || 'roofing_schedule',
    });

    // Require roof age indicators
    steps.push({
      phase: 'exterior',
      step_type: 'documentation',
      title: 'Document Roof Age Indicators',
      instructions: `POLICY REQUIREMENT: Roofing schedule requires age verification. Document: 1) Any visible installation date markers, 2) Condition indicators suggesting age, 3) Roof vents and flashing age, 4) Photos of granule loss or wear patterns. Check declarations page for Year Roof Install if available.`,
      required: true,
      tags: ['policy_requirement', 'roof_schedule', 'age_verification'],
      estimated_minutes: 10,
      policySource: roofingSystem.sourceEndorsement || 'roofing_schedule',
    });

    // Require roof plane segmentation
    steps.push({
      phase: 'exterior',
      step_type: 'photo',
      title: 'Photograph All Roof Planes',
      instructions: `POLICY REQUIREMENT: For scheduled roofing settlement, document each roof plane separately. Capture: 1) Front slope, 2) Back slope, 3) All side slopes, 4) Any dormers or additional planes. This enables accurate square footage calculation for schedule application.`,
      required: true,
      tags: ['policy_requirement', 'roof_schedule', 'plane_segmentation'],
      estimated_minutes: 15,
      policySource: roofingSystem.sourceEndorsement || 'roofing_schedule',
    });

    // Require roof and metal component photos
    steps.push({
      phase: 'exterior',
      step_type: 'photo',
      title: 'Document Metal Components Separately',
      instructions: `POLICY REQUIREMENT: Metal components may have different settlement rules under the roofing schedule. Photograph separately: 1) Gutters, 2) Downspouts, 3) Metal flashing, 4) Metal vents, 5) Any other metal roof components. Note any damage to each.`,
      required: true,
      tags: ['policy_requirement', 'roof_schedule', 'metal_components'],
      estimated_minutes: 10,
      policySource: roofingSystem.sourceEndorsement || 'roofing_schedule',
    });
  }

  // Rule: Metal components with special coverage conditions
  if (roofingSystem?.metalComponentRule?.coveredOnlyIf) {
    const condition = roofingSystem.metalComponentRule.coveredOnlyIf;

    steps.push({
      phase: 'exterior',
      step_type: 'observation',
      title: 'Verify Metal Component Coverage Condition',
      instructions: `POLICY REQUIREMENT: Metal components (gutters, downspouts, metal trim) are only covered if: "${condition}". Document evidence of this condition: 1) Water stains inside, 2) Water entry points, 3) Interior damage related to metal component failure. Photos required.`,
      required: true,
      tags: ['policy_requirement', 'metal_exclusion', 'water_intrusion'],
      estimated_minutes: 10,
      policySource: roofingSystem.sourceEndorsement || 'metal_component_rule',
    });

    steps.push({
      phase: 'interior',
      step_type: 'photo',
      title: 'Document Interior Water Intrusion Evidence',
      instructions: `POLICY REQUIREMENT: If claiming metal component damage, document interior water intrusion evidence: 1) Water stains on walls/ceilings near roof edge, 2) Moisture meter readings if available, 3) Any mold or mildew growth, 4) Damaged contents from water entry.`,
      required: true,
      tags: ['policy_requirement', 'metal_exclusion', 'interior_evidence'],
      estimated_minutes: 10,
      policySource: roofingSystem.sourceEndorsement || 'metal_component_rule',
    });
  }

  // Rule: ACV roofing requires depreciation documentation
  if (roofingSystem?.applies && roofingSystem.basis === 'ACV') {
    steps.push({
      phase: 'exterior',
      step_type: 'observation',
      title: 'Document Roof Condition for Depreciation',
      instructions: `POLICY REQUIREMENT: Roof is settled on Actual Cash Value (ACV) basis. Document condition factors affecting depreciation: 1) Overall wear and condition, 2) Missing or damaged shingles (pre-existing vs. new), 3) Moss, algae, or debris accumulation, 4) Flashing condition, 5) Estimated remaining useful life.`,
      required: true,
      tags: ['policy_requirement', 'acv_settlement', 'depreciation'],
      estimated_minutes: 10,
      policySource: roofingSystem.sourceEndorsement || 'acv_roofing',
    });
  }

  return steps;
}

/**
 * Format effective policy context for the AI prompt
 * Provides policy information to AI without duplicating deterministic requirements
 */
function formatEffectivePolicyContext(effectivePolicy: EffectivePolicy | null): string {
  if (!effectivePolicy) {
    return 'No effective policy resolved - standard inspection procedures apply.';
  }

  const sections: string[] = ['### EFFECTIVE POLICY CONTEXT'];

  // Jurisdiction
  if (effectivePolicy.jurisdiction) {
    sections.push(`Jurisdiction: ${effectivePolicy.jurisdiction}`);
  }

  // Loss settlement info
  const ls = effectivePolicy.lossSettlement;
  if (ls.roofingSystem?.applies) {
    sections.push(`\nRoofing Settlement: ${ls.roofingSystem.basis}`);
    if (ls.roofingSystem.sourceEndorsement) {
      sections.push(`  Source: ${ls.roofingSystem.sourceEndorsement}`);
    }
    if (ls.roofingSystem.ageBasedSchedule && ls.roofingSystem.ageBasedSchedule.length > 0) {
      sections.push(`  Schedule: Age-based depreciation applies`);
    }
    if (ls.roofingSystem.metalComponentRule) {
      sections.push(`  Metal Components: Special conditions apply`);
    }
  }

  // Key exclusions
  if (effectivePolicy.exclusions.length > 0) {
    sections.push(`\nKey Exclusions (${effectivePolicy.exclusions.length} total):`);
    sections.push(effectivePolicy.exclusions.slice(0, 5).map(e => `  - ${e.substring(0, 80)}...`).join('\n'));
  }

  // Deductibles
  if (effectivePolicy.deductibles.windHail) {
    sections.push(`\nWind/Hail Deductible: ${effectivePolicy.deductibles.windHail}`);
  }

  sections.push('\nNOTE: Deterministic policy requirements are injected automatically. Focus on peril-specific and property-specific inspection steps.');

  return sections.join('\n');
}

/**
 * Normalize AI response to handle different schema formats.
 * The prompt generates steps nested inside phases, but downstream code expects
 * a flat top-level steps array. This function extracts steps from phases ONLY
 * when no top-level steps array exists, preserving AI-provided data.
 */
function normalizeAIResponse(response: Record<string, unknown>): AIWorkflowResponse | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const normalized: Record<string, unknown> = { ...response };

  // Only extract steps from nested phases if NO top-level steps array exists
  const hasTopLevelSteps = Array.isArray(normalized.steps) && normalized.steps.length > 0;
  
  if (!hasTopLevelSteps && Array.isArray(normalized.phases)) {
    const phasesWithNestedSteps = (normalized.phases as any[]).some(p => p.steps && Array.isArray(p.steps));
    
    if (phasesWithNestedSteps) {
      const extractedSteps: unknown[] = [];
      for (const phase of normalized.phases as any[]) {
        if (phase.steps && Array.isArray(phase.steps)) {
          const phaseId = phase.phase_id || phase.phase || 'unknown';
          for (const step of phase.steps) {
            // Preserve AI-provided fields, use safe defaults for required fields
            extractedSteps.push({
              phase: phaseId,
              step_type: step.step_type ?? 'observation',
              title: step.title ?? 'Untitled Step',
              instructions: step.instructions ?? '',
              required: step.required ?? true,
              estimated_minutes: step.estimated_minutes ?? 5,
              tags: step.tags ?? [],
              peril_specific: step.peril_specific || step.endorsement_related || null,
              // NO LEGACY ASSETS - only use evidence_requirements from AI response
              evidence_requirements: step.required_evidence || step.evidence_requirements || [],
            });
          }
        }
      }
      normalized.steps = extractedSteps;
      console.log(`[InspectionWorkflow] Extracted ${extractedSteps.length} steps from nested phases (no top-level steps found)`);

      // Normalize phases to the expected format (without nested steps)
      normalized.phases = (normalized.phases as any[]).map(p => ({
        phase: p.phase_id || p.phase,
        title: p.phase_name || p.title || p.phase_id || p.phase || 'Untitled Phase',
        description: p.description ?? '',
        estimated_minutes: p.estimated_minutes ?? 0,
        step_count: p.steps?.length || 0,
      }));
    }
  }

  // Normalize tools_required to tools_and_equipment format
  // Preserve AI-provided fields, use safe defaults for required contract fields
  if (!normalized.tools_and_equipment && normalized.tools_required) {
    const toolsRequired = normalized.tools_required as (string | Record<string, unknown>)[];

    // Group by category if objects have category, otherwise use 'General'
    const categoryMap = new Map<string, { name: string; required: boolean; purpose: string }[]>();

    for (const tool of toolsRequired) {
      if (typeof tool === 'string') {
        const items = categoryMap.get('General') || [];
        items.push({ name: tool, required: true, purpose: '' });
        categoryMap.set('General', items);
      } else if (typeof tool === 'object' && tool !== null) {
        const category = (tool.category as string) || 'General';
        const items = categoryMap.get(category) || [];
        // Preserve AI-provided fields, use defaults for missing required fields
        items.push({
          name: (tool.name as string) ?? 'Tool',
          required: (tool.required as boolean) ?? true,
          purpose: (tool.purpose as string) ?? '',
        });
        categoryMap.set(category, items);
      }
    }

    normalized.tools_and_equipment = Array.from(categoryMap.entries()).map(([category, items]) => ({
      category,
      items,
    }));
    console.log(`[InspectionWorkflow] Converted tools_required to tools_and_equipment format (${categoryMap.size} categories)`);
  }

  // Ensure tools_and_equipment has a default if AI didn't return any tools
  if (!normalized.tools_and_equipment) {
    normalized.tools_and_equipment = [{
      category: 'General',
      items: [
        { name: 'Camera/Smartphone', required: true, purpose: 'Photo documentation' },
        { name: 'Measuring tape', required: true, purpose: 'Measurements' },
        { name: 'Flashlight', required: true, purpose: 'Inspection of dark areas' },
      ],
    }];
    console.log('[InspectionWorkflow] Added default tools_and_equipment (AI did not return tools)');
  }

  // Handle metadata field name variations
  if (normalized.metadata) {
    const meta = normalized.metadata as Record<string, unknown>;
    if (meta.estimated_total_minutes && !meta.estimated_total_time_minutes) {
      meta.estimated_total_time_minutes = meta.estimated_total_minutes;
    }
  }

  // Handle room_template field name variations (AI returns default_steps, code expects standard_steps)
  if (normalized.room_template) {
    const roomTemplate = normalized.room_template as Record<string, unknown>;
    if (roomTemplate.default_steps && !roomTemplate.standard_steps) {
      roomTemplate.standard_steps = roomTemplate.default_steps;
      console.log('[InspectionWorkflow] Converted room_template.default_steps to standard_steps');
    }
  }

  // Normalize open_questions: handle both old format (string[]) and new format (object[])
  if (normalized.open_questions) {
    const openQuestions = normalized.open_questions as (string | Record<string, unknown>)[];
    const normalizedQuestions: { question: string; context: string; priority: 'high' | 'medium' | 'low' }[] = [];
    
    for (const item of openQuestions) {
      if (typeof item === 'string') {
        // Old format: convert string to object
        normalizedQuestions.push({
          question: item,
          context: 'Question needs to be answered during inspection',
          priority: 'medium'
        });
      } else if (typeof item === 'object' && item !== null) {
        // New format: validate and normalize
        normalizedQuestions.push({
          question: (item.question as string) || 'Unspecified question',
          context: (item.context as string) || 'Question needs to be answered during inspection',
          priority: (['high', 'medium', 'low'].includes(item.priority as string) 
            ? item.priority 
            : 'medium') as 'high' | 'medium' | 'low'
        });
      }
    }
    normalized.open_questions = normalizedQuestions;
    console.log(`[InspectionWorkflow] Normalized open_questions (${normalizedQuestions.length} questions)`);
  } else {
    // Set default empty array if missing
    normalized.open_questions = [];
  }

  return normalized as unknown as AIWorkflowResponse;
}

/**
 * Validate and normalize the AI response to match the expected schema.
 * Returns the normalized AIWorkflowResponse or null if validation fails.
 */
function validateAndNormalizeWorkflowSchema(response: unknown): AIWorkflowResponse | null {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    console.error('[InspectionWorkflow] Validation failed: response is not an object', typeof response);
    return null;
  }

  // Normalize the response
  const normalized = normalizeAIResponse(response as Record<string, unknown>);
  if (!normalized) {
    console.error('[InspectionWorkflow] Normalization failed');
    return null;
  }

  // Check required top-level fields
  if (!normalized.metadata) errors.push('missing metadata');
  if (!normalized.phases) errors.push('missing phases');
  if (!normalized.steps) errors.push('missing steps');
  if (!normalized.tools_and_equipment) errors.push('missing tools_and_equipment');

  if (errors.length > 0) {
    console.error('[InspectionWorkflow] Validation failed - missing top-level fields:', errors.join(', '));
    console.error('[InspectionWorkflow] Response keys:', Object.keys(normalized));
    return null;
  }

  // Check metadata
  const metadata = normalized.metadata;
  if (!metadata.claim_number) errors.push('metadata.claim_number missing');
  if (!metadata.primary_peril) errors.push('metadata.primary_peril missing');

  if (errors.length > 0) {
    console.error('[InspectionWorkflow] Validation failed - metadata issues:', errors.join(', '));
    return null;
  }

  // Check phases array
  if (!Array.isArray(normalized.phases)) {
    console.error('[InspectionWorkflow] Validation failed: phases is not an array');
    return null;
  }
  if (normalized.phases.length === 0) {
    console.error('[InspectionWorkflow] Validation failed: phases array is empty');
    return null;
  }

  // Check steps array
  if (!Array.isArray(normalized.steps)) {
    console.error('[InspectionWorkflow] Validation failed: steps is not an array');
    return null;
  }
  if (normalized.steps.length === 0) {
    console.error('[InspectionWorkflow] Validation failed: steps array is empty');
    return null;
  }

  return normalized;
}

/**
 * Legacy validation wrapper for backward compatibility.
 * @deprecated Use validateAndNormalizeWorkflowSchema instead
 */
function validateWorkflowSchema(response: unknown): response is AIWorkflowResponse {
  const normalized = validateAndNormalizeWorkflowSchema(response);
  if (normalized) {
    // Copy normalized fields back to the original response object for backward compatibility
    Object.assign(response as Record<string, unknown>, normalized);
    return true;
  }
  return false;
}

/**
 * Validate that workflow_json.steps exists and is non-empty.
 * This is a CRITICAL invariant: inspection_workflow_steps can ONLY be created
 * if workflow_json.steps is present and non-empty.
 *
 * @throws Error if workflow_json.steps is missing or empty
 */
function validateWorkflowJsonSteps(workflowJson: InspectionWorkflowJson): void {
  if (!workflowJson.steps) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is missing. ' +
      'Cannot create inspection_workflow_steps without a source of truth.'
    );
  }

  if (!Array.isArray(workflowJson.steps)) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is not an array. ' +
      'Cannot create inspection_workflow_steps without a valid steps array.'
    );
  }

  if (workflowJson.steps.length === 0) {
    throw new Error(
      'WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps is empty. ' +
      'Cannot create inspection_workflow_steps without at least one step in the source of truth.'
    );
  }

  // Validate each step has required fields
  for (let i = 0; i < workflowJson.steps.length; i++) {
    const step = workflowJson.steps[i];
    if (!step.phase || !step.step_type || !step.title || !step.instructions) {
      throw new Error(
        `WORKFLOW_JSON_STEPS_INVARIANT_VIOLATION: workflow_json.steps[${i}] is missing required fields. ` +
        `Required: phase, step_type, title, instructions. Got: ${JSON.stringify(Object.keys(step))}`
      );
    }
  }

  console.log(`[InspectionWorkflow] Validated workflow_json.steps: ${workflowJson.steps.length} steps`);
}

/**
 * Creates inspection_workflow_steps from workflow_json.steps (source of truth).
 * step_index is assigned based on array position (1-indexed).
 *
 * @throws Error if workflow_json.steps validation fails
 */
async function createStepsFromWorkflowJson(
  workflowId: string,
  workflowJson: InspectionWorkflowJson
): Promise<{ stepsCreated: number; error?: string }> {
  // CRITICAL: Validate workflow_json.steps before creating any step records
  validateWorkflowJsonSteps(workflowJson);

  let stepsCreated = 0;

  for (let i = 0; i < workflowJson.steps.length; i++) {
    const step = workflowJson.steps[i];
    // step_index is 1-indexed: steps[0] → step_index=1, steps[n-1] → step_index=n
    const stepIndex = i + 1;

    try {
      const { data: insertedStepData, error: stepError } = await supabaseAdmin
        .from('inspection_workflow_steps')
        .insert({
          workflow_id: workflowId,
          step_index: stepIndex,
          phase: step.phase,
          step_type: step.step_type,
          title: step.title,
          instructions: step.instructions,
          required: step.required,
          tags: step.tags || [],
          estimated_minutes: step.estimated_minutes,
          peril_specific: step.peril_specific || null,
          status: InspectionStepStatus.PENDING,
          endorsement_source: step.endorsement_source || null,
          // Dynamic workflow fields
          origin: step.origin || null,
          source_rule_id: step.source_rule_id || null,
          conditions: step.conditions || null,
          evidence_requirements: step.evidence_requirements || null,
          blocking: step.blocking || null,
          blocking_condition: step.blocking_condition || null,
          geometry_binding: step.geometry_binding || null,
          room_id: step.room_id || null,
          room_name: step.room_name || null,
        })
        .select()
        .single();

      if (stepError || !insertedStepData) {
        console.error(`[InspectionWorkflow] Error inserting step ${stepIndex}:`, stepError?.message);
        continue;
      }

      const insertedStep = mapStepFromDb(insertedStepData);
      stepsCreated++;

      // NO LEGACY ASSETS INSERTION - evidence_requirements are stored in workflow_json
      // Assets table is deprecated - all evidence requirements come from workflow_json.evidence_requirements
    } catch (stepError) {
      console.error(`[InspectionWorkflow] Exception inserting step ${stepIndex}:`, stepError);
      continue;
    }
  }

  // Final invariant check: verify all steps were created
  if (stepsCreated !== workflowJson.steps.length) {
    console.warn(
      `[InspectionWorkflow] Step count mismatch: workflow_json.steps has ${workflowJson.steps.length} steps, ` +
      `but only ${stepsCreated} were created in inspection_workflow_steps.`
    );
  }

  return { stepsCreated };
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
 * ENHANCED VERSION - Uses UnifiedClaimContext for rich policy, endorsement, and depreciation data.
 * Now includes endorsement-driven steps and full briefing context.
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
    // Step 1: Build UnifiedClaimContext (rich context with endorsements, depreciation, etc.)
    const context = await buildUnifiedClaimContext(claimId, organizationId);
    if (!context) {
      return {
        success: false,
        error: 'Claim not found or unable to build UnifiedClaimContext',
      };
    }

    // Auto-detect rooms and hazards from loss description if not provided in wizard
    if (context.lossDescription) {
      const description = context.lossDescription;
      
      // Initialize wizardContext if undefined
      if (!wizardContext) {
        wizardContext = {};
      }

      // Detect rooms
      if (!wizardContext.rooms) {
        const detectedRooms = detectRoomsFromDescription(description);
        if (detectedRooms.length > 0) {
          console.log(`[InspectionWorkflow] Auto-detected rooms from description: ${detectedRooms.join(', ')}`);
          wizardContext.rooms = detectedRooms.map(name => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            level: 'Unknown',
            hasDamage: true,
            damageType: 'Potential damage based on description'
          }));
        }
      }

      // Detect hazards
      if (!wizardContext.safetyInfo) {
        const hazards = detectHazardsFromDescription(description);
        if (Object.values(hazards).some(v => v)) {
          console.log('[InspectionWorkflow] Auto-detected hazards from description');
          wizardContext.safetyInfo = {
            activeLeaks: hazards.activeLeaks || false,
            standingWater: false,
            electricalHazard: hazards.electricalHazard || false,
            structuralConcern: hazards.structuralConcern || false,
            moldVisible: hazards.moldVisible || false,
            gasSmell: hazards.gasSmell || false,
            animalsConcern: false,
            accessIssues: false,
            powerStatus: 'Unknown',
            waterStatus: 'Unknown',
            safetyNotes: 'Hazards detected from loss description - Verify on site'
          };
        }
      }
    }

    // Step 2: Generate endorsement-driven steps FIRST (deterministic, policy-based)
    const endorsementSteps = generateEndorsementDrivenSteps(context);
    console.log(`[InspectionWorkflow] Generated ${endorsementSteps.length} endorsement-driven steps for claim ${claimId}`);

    // Step 3: Get existing briefing for full context integration
    const briefing = await getClaimBriefing(claimId, organizationId);

    // Step 4: Check for existing active workflow (unless force regenerate)
    if (!forceRegenerate) {
      const { data: existingWorkflows } = await supabaseAdmin
        .from('inspection_workflows')
        .select('*')
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active'])
        .order('version', { ascending: false })
        .limit(1);

      if (existingWorkflows && existingWorkflows.length > 0) {
        const existing = mapWorkflowFromDb(existingWorkflows[0]);
        return {
          success: true,
          workflow: existing,
          workflowId: existing.id,
          version: existing.version,
        };
      }
    }

    // Step 5: Get the next version number
    const { data: versionData } = await supabaseAdmin
      .from('inspection_workflows')
      .select('version')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (versionData?.[0]?.version || 0) + 1;

    // Step 6: Archive previous active workflows if force regenerating
    if (forceRegenerate) {
      await supabaseAdmin
        .from('inspection_workflows')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('claim_id', claimId)
        .eq('organization_id', organizationId)
        .in('status', ['draft', 'active']);
    }

    // Step 7: Generate new workflow with AI using ENHANCED prompt
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    const promptConfig = await getPromptWithFallback(PromptKey.INSPECTION_WORKFLOW_GENERATOR);

    // Build ENHANCED prompt with full context
    const userPrompt = buildEnhancedWorkflowPrompt(context, briefing, wizardContext);

    const completion = await openai.chat.completions.create({
      model: promptConfig.model || 'gpt-4o',
      messages: [
        { role: 'system', content: promptConfig.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: promptConfig.temperature || 0.3,
      max_tokens: promptConfig.maxTokens || 8000,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      return { success: false, error: 'No response from AI' };
    }

    // Parse and validate the response
    let aiResponse: AIWorkflowResponse;
    try {
      const parsedResponse = JSON.parse(responseContent);
      const normalizedResponse = validateAndNormalizeWorkflowSchema(parsedResponse);
      if (!normalizedResponse) {
        console.error('[InspectionWorkflow] Invalid workflow structure from AI');
        return { success: false, error: 'Invalid workflow structure from AI' };
      }
      aiResponse = normalizedResponse;
    } catch (parseError) {
      console.error('[InspectionWorkflow] Failed to parse AI response:', parseError);
      return { success: false, error: `Failed to parse AI response: ${(parseError as Error).message}` };
    }

    // Step 8: Build the STEPS array FIRST (source of truth)
    // Endorsement-driven steps come first, then AI-generated steps
    const workflowSteps: WorkflowJsonStep[] = [];

    // 8a: Add endorsement-driven steps (policy requirements take priority)
    for (const step of endorsementSteps) {
      workflowSteps.push({
        phase: step.phase as InspectionPhase,
        step_type: step.step_type as InspectionStepType,
        title: step.title,
        instructions: step.instructions,
        required: step.required,
        tags: [...(step.tags || []), 'endorsement_requirement'],
        estimated_minutes: step.estimated_minutes,
        peril_specific: step.peril_specific || null,
        endorsement_source: step.policySource,
      });
    }

    // 8b: Add AI-generated steps
    for (const step of (aiResponse.steps || [])) {
      workflowSteps.push({
        phase: step.phase as InspectionPhase,
        step_type: step.step_type as InspectionStepType,
        title: step.title,
        instructions: step.instructions,
        required: step.required,
        tags: step.tags || [],
        estimated_minutes: step.estimated_minutes,
        peril_specific: step.peril_specific || null,
        // NO LEGACY ASSETS - evidence_requirements stored in workflow_json
        evidenceRequirements: step.evidence_requirements || [],
      });
    }

    // Step 9: Build the workflow JSON with steps as SOURCE OF TRUTH
    // Debug logging to identify what's failing
    console.log('[InspectionWorkflow] Building workflowJson...');
    console.log('[InspectionWorkflow] aiResponse.phases:', Array.isArray(aiResponse.phases) ? `array(${aiResponse.phases.length})` : typeof aiResponse.phases);
    console.log('[InspectionWorkflow] aiResponse.room_template:', aiResponse.room_template ? 'present' : 'undefined');
    if (aiResponse.room_template) {
      console.log('[InspectionWorkflow] room_template.standard_steps:', 
        Array.isArray(aiResponse.room_template.standard_steps) 
          ? `array(${aiResponse.room_template.standard_steps.length})` 
          : typeof aiResponse.room_template.standard_steps);
    }

    // Safely build phases array with null checks
    const normalizedPhases = (aiResponse.phases || [])
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map(p => ({
        phase: (p.phase || 'unknown') as InspectionPhase,
        title: p.title || 'Untitled Phase',
        description: p.description || '',
        estimated_minutes: p.estimated_minutes || 0,
        step_count: p.step_count || 0,
      }));

    // Safely build room_template
    let normalizedRoomTemplate: InspectionWorkflowJson['room_template'] = undefined;
    if (aiResponse.room_template && Array.isArray(aiResponse.room_template.standard_steps) && aiResponse.room_template.standard_steps.length > 0) {
      normalizedRoomTemplate = {
        standard_steps: aiResponse.room_template.standard_steps
          .filter((s): s is NonNullable<typeof s> => s != null)
          .map(s => ({
            step_type: (s.step_type || 'observation') as InspectionStepType,
            title: s.title || 'Untitled Step',
            instructions: s.instructions || '',
            required: s.required ?? true,
            estimated_minutes: s.estimated_minutes || 5,
          })),
        peril_specific_steps: aiResponse.room_template.peril_specific_steps
          ? Object.fromEntries(
              Object.entries(aiResponse.room_template.peril_specific_steps)
                .filter(([, steps]) => Array.isArray(steps))
                .map(([peril, steps]) => [
                  peril,
                  steps
                    .filter((s): s is NonNullable<typeof s> => s != null)
                    .map(s => ({
                      step_type: (s.step_type || 'observation') as InspectionStepType,
                      title: s.title || 'Untitled Step',
                      instructions: s.instructions || '',
                      required: s.required ?? true,
                      estimated_minutes: s.estimated_minutes || 5,
                    })),
                ])
            )
          : undefined,
      };
    }

    const workflowJson: InspectionWorkflowJson = {
      metadata: {
        claim_number: context.claimNumber,
        primary_peril: context.peril.primary,
        secondary_perils: context.peril.secondary || [],
        property_type: aiResponse.metadata?.property_type,
        estimated_total_time_minutes: aiResponse.metadata?.estimated_total_time_minutes || 0,
        generated_at: new Date().toISOString(),
        data_completeness: context.meta.dataCompleteness.completenessScore,
        endorsement_driven_steps: endorsementSteps.length,
      },
      phases: normalizedPhases,
      steps: workflowSteps,
      room_template: normalizedRoomTemplate,
      tools_and_equipment: aiResponse.tools_and_equipment,
      open_questions: aiResponse.open_questions,
    };

    console.log('[InspectionWorkflow] workflowJson built successfully, phases:', normalizedPhases.length, 'steps:', workflowSteps.length);

    // CRITICAL INVARIANT: Validate workflow_json.steps BEFORE saving
    // This throws if steps is missing or empty - generation will abort
    try {
      validateWorkflowJsonSteps(workflowJson);
    } catch (validationError) {
      console.error('[InspectionWorkflow] Workflow JSON steps validation failed:', validationError);
      return { success: false, error: (validationError as Error).message };
    }

    // Build generated_from metadata
    const generatedFrom: WorkflowGeneratedFrom = {
      briefing_id: briefing?.id,
      peril_rules_version: '1.0',
      generated_at: new Date().toISOString(),
      model: completion.model,
      prompt_version: promptConfig.version || 1,
      endorsement_ids: context.endorsements.extracted.map(e => e.formCode),
    };

    // Step 10: Insert the workflow with workflow_json containing steps
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .insert({
        organization_id: organizationId,
        claim_id: claimId,
        version: nextVersion,
        status: InspectionWorkflowStatus.DRAFT,
        primary_peril: context.peril.primary,
        secondary_perils: context.peril.secondary,
        source_briefing_id: briefing?.id || null,
        workflow_json: workflowJson,
        generated_from: generatedFrom,
        created_by: userId || null,
      })
      .select()
      .single();

    if (workflowError || !workflowData) {
      return { success: false, error: `Failed to create workflow: ${workflowError?.message}` };
    }

    const workflow = mapWorkflowFromDb(workflowData);

    // Step 11: Create inspection_workflow_steps FROM workflow_json.steps (source of truth)
    // This function validates that workflow_json.steps exists and is non-empty,
    // and creates step records with step_index matching array position (1-indexed)
    const { stepsCreated, error: stepsError } = await createStepsFromWorkflowJson(
      workflow.id,
      workflowJson
    );

    if (stepsError) {
      console.error('[InspectionWorkflow] Error creating steps from workflow_json:', stepsError);
      // Return error - workflow without steps is unusable
      return { success: false, error: `Failed to create workflow steps: ${stepsError}` };
    }

    // Check if any steps were actually created
    if (stepsCreated === 0 && workflowJson.steps.length > 0) {
      console.error('[InspectionWorkflow] No steps were created despite having steps in workflow_json');
      return { success: false, error: 'Failed to create any workflow steps - please try again' };
    }

    // Increment claim's workflow_version for cache invalidation
    // This allows voice agents to detect when the workflow has been updated
    try {
      const { error: rpcError } = await supabaseAdmin.rpc('increment_claim_version', {
        p_claim_id: claimId,
        p_version_type: 'workflow',
      });
      if (rpcError) {
        // Fallback: If RPC doesn't exist, do manual increment
        // Check if column exists first (migration 042 may not have run)
        const { data: claimData, error: selectError } = await supabaseAdmin
          .from('claims')
          .select('workflow_version')
          .eq('id', claimId)
          .single();
        
        // If column doesn't exist, skip version increment (migration needs to be run)
        if (selectError && selectError.message?.includes('does not exist')) {
          console.warn('[InspectionWorkflow] workflow_version column does not exist. Please run migration 042_add_briefing_workflow_versions.sql');
        } else if (claimData) {
          const currentVersion = claimData?.workflow_version || 0;
          await supabaseAdmin
            .from('claims')
            .update({
              workflow_version: currentVersion + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', claimId);
        }
      }
    } catch (err) {
      // Version increment is non-critical, log but don't fail
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('does not exist')) {
        console.warn('[InspectionWorkflow] workflow_version column does not exist. Please run migration 042_add_briefing_workflow_versions.sql');
      } else {
        console.error('[InspectionWorkflow] Failed to increment workflow_version:', err);
      }
    }

    console.log(`[InspectionWorkflow] Generated enhanced workflow v${nextVersion} for claim ${claimId}: ${stepsCreated} steps created from workflow_json.steps (${workflowJson.steps.length} in source, ${endorsementSteps.length} endorsement-driven), data completeness: ${context.meta.dataCompleteness.completenessScore}%`);

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
    console.error('[InspectionWorkflow] Error generating workflow:', error);
    return {
      success: false,
      error: (error as Error).message,
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
    const { data: currentWorkflows, error: currentError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('id, generated_from')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'active']);

    // Archive the current workflow with the reason
    if (!currentError && currentWorkflows && currentWorkflows.length > 0) {
      for (const wf of currentWorkflows) {
        const updatedGeneratedFrom = {
          ...(wf.generated_from as Record<string, unknown> || {}),
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
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*')
      .eq('id', workflowId)
      .limit(1)
      .single();

    if (workflowError || !workflowData) {
      return { success: false, addedSteps: 0, error: 'Workflow not found' };
    }

    const workflow = mapWorkflowFromDb(workflowData);
    const workflowJson = workflow.workflowJson as InspectionWorkflowJson;

    if (!workflowJson.room_template) {
      return { success: false, addedSteps: 0, error: 'Workflow has no room template' };
    }

    // Ensure workflow_json.steps exists (source of truth)
    if (!workflowJson.steps) {
      workflowJson.steps = [];
    }

    // Track new steps to add to workflow_json.steps
    const newSteps: WorkflowJsonStep[] = [];
    let addedSteps = 0;
    let roomSortOrder = 0;

    // First, collect all steps to add and create room records
    const roomRecords: { roomId: string; roomName: string }[] = [];

    for (const roomName of roomNames) {
      // Create the room record
      const { data: roomData, error: roomError } = await supabaseAdmin
        .from('inspection_workflow_rooms')
        .insert({
          workflow_id: workflowId,
          name: roomName,
          sort_order: roomSortOrder++,
        })
        .select()
        .single();

      if (roomError || !roomData) {
        console.error('Error creating room:', roomError?.message);
        continue;
      }

      const room = mapRoomFromDb(roomData);
      roomRecords.push({ roomId: room.id, roomName });

      // Build standard room steps for workflow_json.steps
      for (const step of workflowJson.room_template.standard_steps) {
        newSteps.push({
          phase: 'interior' as InspectionPhase,
          step_type: step.step_type,
          title: `${roomName}: ${step.title}`,
          instructions: step.instructions.replace('{room}', roomName),
          required: step.required,
          estimated_minutes: step.estimated_minutes,
          tags: ['room_step'],
          room_id: room.id,
          room_name: roomName,
        });
      }

      // Build peril-specific steps for workflow_json.steps
      const primaryPeril = workflow.primaryPeril;
      const perilSteps = primaryPeril ? workflowJson.room_template.peril_specific_steps?.[primaryPeril] : null;

      if (perilSteps && perilSteps.length > 0) {
        for (const step of perilSteps) {
          newSteps.push({
            phase: 'interior' as InspectionPhase,
            step_type: step.step_type,
            title: `${roomName}: ${step.title}`,
            instructions: step.instructions.replace('{room}', roomName),
            required: step.required,
            estimated_minutes: step.estimated_minutes,
            tags: ['room_step', 'peril_specific'],
            peril_specific: primaryPeril,
            room_id: room.id,
            room_name: roomName,
          });
        }
      }
    }

    if (newSteps.length === 0) {
      return { success: true, addedSteps: 0 };
    }

    // Update workflow_json.steps with new steps (source of truth first)
    const updatedSteps = [...workflowJson.steps, ...newSteps];
    workflowJson.steps = updatedSteps;

    // Update workflow with new workflow_json
    const { error: updateWorkflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .update({
        workflow_json: workflowJson,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateWorkflowError) {
      console.error('Error updating workflow_json:', updateWorkflowError);
      return { success: false, addedSteps: 0, error: 'Failed to update workflow_json' };
    }

    // Now create step records from the new steps in workflow_json.steps
    // step_index is based on position in workflow_json.steps (1-indexed)
    const baseIndex = workflowJson.steps.length - newSteps.length;
    const stepsToInsert = newSteps.map((step, i) => ({
      workflow_id: workflowId,
      // step_index = position in workflow_json.steps + 1 (1-indexed)
      step_index: baseIndex + i + 1,
      phase: step.phase,
      step_type: step.step_type,
      title: step.title,
      instructions: step.instructions,
      required: step.required,
      estimated_minutes: step.estimated_minutes,
      tags: step.tags || [],
      room_id: step.room_id,
      room_name: step.room_name,
      peril_specific: step.peril_specific || null,
      status: InspectionStepStatus.PENDING,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .insert(stepsToInsert);

    if (insertError) {
      console.error('Error inserting room steps:', insertError);
      return { success: false, addedSteps: 0, error: 'Failed to insert step records' };
    }

    addedSteps = stepsToInsert.length;
    console.log(`[InspectionWorkflow] expandWorkflowForRooms: Added ${addedSteps} steps to workflow_json.steps and created step records`);

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
      .limit(1)
      .single();

    if (workflowError || !workflowData) {
      return null;
    }

    const workflow = mapWorkflowFromDb(workflowData);

    // Get steps
    const { data: stepsData, error: stepsError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: true });

    if (stepsError || !stepsData) {
      return null;
    }

    // NO LEGACY ASSETS - assets table deprecated
    // Evidence requirements are stored in workflow_json.evidence_requirements
    // Return empty assets array for backward compatibility during transition
    const steps: StepWithAssets[] = stepsData.map(r => ({
      ...mapStepFromDb(r),
      assets: [], // DEPRECATED - use evidenceRequirements from workflow_json instead
    }));

    // Get rooms
    const { data: roomsData, error: roomsError } = await supabaseAdmin
      .from('inspection_workflow_rooms')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: true });

    const rooms: InspectionWorkflowRoom[] = (roomsData || []).map(mapRoomFromDb);

    // Calculate stats
    const totalSteps = steps.length;
    const completedSteps = steps.filter(s => s.status === InspectionStepStatus.COMPLETED).length;
    const pendingSteps = steps.filter(s => s.status === InspectionStepStatus.PENDING).length;
    // NO LEGACY ASSETS - stats calculated from evidenceRequirements in workflow_json
    const requiredAssets = 0; // DEPRECATED - calculate from evidenceRequirements if needed
    const capturedAssets = 0; // DEPRECATED - calculate from evidenceRequirements if needed
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
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return await getWorkflow(data[0].id, organizationId);
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
      .select()
      .single();

    if (error || !data) {
      console.error('Error updating workflow step:', error?.message);
      return null;
    }

    return mapStepFromDb(data);
  } catch (error) {
    console.error('Error updating workflow step:', error);
    return null;
  }
}

/**
 * Add a custom step to a workflow
 * Updates workflow_json.steps (source of truth) first, then creates step record
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
    // Get the workflow to update workflow_json.steps
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('workflow_json')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflowData) {
      console.error('Error getting workflow:', workflowError?.message);
      return null;
    }

    const workflowJson = workflowData.workflow_json as InspectionWorkflowJson;
    if (!workflowJson.steps) {
      workflowJson.steps = [];
    }

    // Build the new step for workflow_json.steps
    const newStep: WorkflowJsonStep = {
      phase: step.phase as InspectionPhase,
      step_type: step.stepType as InspectionStepType,
      title: step.title,
      instructions: step.instructions || '',
      required: step.required ?? true,
      estimated_minutes: step.estimatedMinutes ?? 5,
      tags: ['manual'],
      room_id: step.roomId,
      room_name: step.roomName,
      origin: 'manual',
    };

    // Add to workflow_json.steps (source of truth)
    workflowJson.steps.push(newStep);
    const stepIndex = workflowJson.steps.length; // 1-indexed

    // Update workflow with new workflow_json
    const { error: updateError } = await supabaseAdmin
      .from('inspection_workflows')
      .update({
        workflow_json: workflowJson,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateError) {
      console.error('Error updating workflow_json:', updateError);
      return null;
    }

    // Now create the step record with step_index matching workflow_json.steps position
    const { data, error } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .insert({
        workflow_id: workflowId,
        step_index: stepIndex,
        phase: step.phase,
        step_type: step.stepType,
        title: step.title,
        instructions: step.instructions || null,
        required: step.required ?? true,
        estimated_minutes: step.estimatedMinutes ?? 5,
        room_id: step.roomId || null,
        room_name: step.roomName || null,
        status: 'pending',
        origin: 'manual',
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding workflow step:', error?.message);
      return null;
    }

    console.log(`[InspectionWorkflow] addWorkflowStep: Added step to workflow_json.steps[${stepIndex - 1}] and created step record with step_index=${stepIndex}`);

    return mapStepFromDb(data);
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
    const { data: maxOrderData, error: maxOrderError } = await supabaseAdmin
      .from('inspection_workflow_rooms')
      .select('sort_order')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (!maxOrderError && maxOrderData && maxOrderData.length > 0) ? (maxOrderData[0].sort_order || 0) + 1 : 0;

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
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding workflow room:', error?.message);
      return null;
    }

    return mapRoomFromDb(data);
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
    const { data: workflowData, error: workflowError } = await supabaseAdmin
      .from('inspection_workflows')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'active'])
      .order('version', { ascending: false })
      .limit(1);

    if (workflowError || !workflowData || workflowData.length === 0) {
      return { shouldRegenerate: false };
    }

    const workflow = mapWorkflowFromDb(workflowData[0]);

    // Check if workflow was created very recently (grace period)
    // This prevents "Regenerate" loop during initial claim creation when documents are processed in parallel
    if (workflow.createdAt) {
      const createdTime = new Date(workflow.createdAt).getTime();
      const now = Date.now();
      const gracePeriodMs = 5 * 60 * 1000; // 5 minutes

      if (now - createdTime < gracePeriodMs) {
        return { shouldRegenerate: false };
      }
    }

    // Check if peril has changed
    const { data: claimData, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('primary_peril')
      .eq('id', claimId)
      .limit(1)
      .single();

    // Check if peril has changed
    if (!claimError && claimData && workflow.primaryPeril !== claimData.primary_peril) {
      return {
        shouldRegenerate: true,
        reason: `Primary peril changed from ${workflow.primaryPeril} to ${claimData.primary_peril}`,
      };
    }

    // Check if NEW documents with endorsements were uploaded after workflow generation
    // We check the SOURCE DOCUMENT upload time, not extraction completion time
    // This prevents false positives from async processing of documents uploaded together
    if (workflow.createdAt) {
      // Get endorsements with their source document upload times
      const { data: newEndorsements, error: endorsementsError } = await supabaseAdmin
        .from('endorsement_extractions')
        .select('id, document_id, documents!inner(created_at)')
        .eq('claim_id', claimId)
        .gt('documents.created_at', workflow.createdAt)
        .limit(1);

      if (!endorsementsError && newEndorsements && newEndorsements.length > 0) {
        return {
          shouldRegenerate: true,
          reason: 'New endorsements added since workflow generation',
        };
      }

      // Check if NEW documents with policy forms were uploaded after workflow generation
      const { data: newPolicyForms, error: policyFormsError } = await supabaseAdmin
        .from('policy_form_extractions')
        .select('id, document_id, documents!inner(created_at)')
        .eq('claim_id', claimId)
        .gt('documents.created_at', workflow.createdAt)
        .limit(1);

      if (!policyFormsError && newPolicyForms && newPolicyForms.length > 0) {
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

// ============================================
// ENHANCED WORKFLOW GENERATION WITH UNIFIED CLAIM CONTEXT
// ============================================

/**
 * Generate endorsement-driven inspection steps from UnifiedClaimContext
 *
 * This extends the policy-based steps by using the rich endorsement analysis
 * from UnifiedClaimContext to inject precise inspection requirements.
 */
function generateEndorsementDrivenSteps(context: UnifiedClaimContext): PolicyInspectionStep[] {
  const steps: PolicyInspectionStep[] = [];

  // Process each endorsement with inspection requirements
  for (const endorsement of context.endorsements.extracted) {
    if (endorsement.inspectionRequirements.length === 0) continue;

    // Create steps based on endorsement requirements
    for (const requirement of endorsement.inspectionRequirements) {
      const step = createStepFromEndorsementRequirement(endorsement, requirement);
      if (step) {
        steps.push(step);
      }
    }
  }

  // Add depreciation documentation steps if scheduled basis
  if (context.lossSettlement.roofing.isScheduled && context.property.roof.ageAtLoss !== undefined) {
    const roofAge = context.property.roof.ageAtLoss;
    const paymentPct = context.lossSettlement.roofing.calculatedPaymentPct || 100;
    const depreciation = 100 - paymentPct;

    steps.push({
      phase: 'exterior',
      step_type: 'documentation',
      title: 'Document Roof Schedule Depreciation Factors',
      instructions: `CRITICAL - ROOF SCHEDULE APPLIES:

Based on the policy endorsement (${context.lossSettlement.roofing.sourceEndorsement || 'roof schedule'}):
- Roof Age at Loss: ${roofAge} years
- Estimated Payment: ${paymentPct}% of replacement cost
- Depreciation: ${depreciation}%

REQUIRED DOCUMENTATION:
1. Confirm roof age through visible date stamps, permit records, or condition assessment
2. Identify exact material type (architectural shingle, 3-tab, metal, tile, wood, rubber)
3. Photograph any manufacturer markings that indicate age
4. Note any mixed materials that may have different schedule rates
5. Document condition that supports the age assessment`,
      required: true,
      tags: ['policy_requirement', 'roof_schedule', 'depreciation', 'critical'],
      estimated_minutes: 15,
      policySource: context.lossSettlement.roofing.sourceEndorsement || 'roof_schedule',
    });
  }

  // Add metal functional requirement step if applicable
  if (context.lossSettlement.roofing.metalFunctionalRequirement) {
    steps.push({
      phase: 'exterior',
      step_type: 'observation',
      title: 'Metal Component Functional Damage Verification',
      instructions: `POLICY REQUIREMENT - METAL COSMETIC EXCLUSION:

${context.lossSettlement.roofing.metalFunctionalRuleText || 'Metal roofing and siding only covered if water intrusion occurs or actual holes/openings exist.'}

FOR EACH METAL COMPONENT (gutters, downspouts, vents, flashing):
1. Document if damage is cosmetic (dents only) or functional (holes, penetrations)
2. Test for water flow - run water through gutters if possible
3. Look for interior water stains near metal components
4. Photograph any actual penetrations through metal
5. Note if damage prevents water management function

WARNING: Cosmetic denting alone is typically NOT covered under this endorsement.`,
      required: true,
      tags: ['policy_requirement', 'metal_functional', 'water_intrusion', 'critical'],
      estimated_minutes: 20,
      policySource: context.lossSettlement.roofing.sourceEndorsement || 'metal_functional_rule',
    });
  }

  // Add O&L documentation if coverage exists
  if (context.insights.hasOandLCoverage) {
    steps.push({
      phase: 'exterior',
      step_type: 'observation',
      title: 'Document Code Compliance Issues (O&L Coverage)',
      instructions: `ORDINANCE OR LAW COVERAGE AVAILABLE: $${context.insights.oandLLimit?.toLocaleString() || 'See Policy'}

Since O&L coverage is available, document any:
1. Visible code violations or non-conforming conditions
2. Older materials that may not meet current code (e.g., single-pane windows, old electrical)
3. Structural elements that would require upgrade during repair
4. Building department requirements that might apply

This documentation supports potential O&L claims if repairs trigger code upgrades.`,
      required: false,
      tags: ['policy_coverage', 'ordinance_law', 'code_compliance'],
      estimated_minutes: 10,
      policySource: 'ordinance_or_law_coverage',
    });
  }

  // Add special limits awareness steps
  if (context.insights.specialLimitsToWatch.length > 0) {
    steps.push({
      phase: 'interior',
      step_type: 'documentation',
      title: 'Document High-Value Personal Property',
      instructions: `SPECIAL LIMITS APPLY - Document carefully:

${context.insights.specialLimitsToWatch.map(l => `- ${l}`).join('\n')}

For each category with special limits:
1. Ask insured if any high-value items were damaged
2. Photograph any damaged items in these categories
3. Document approximate value and age
4. Note if items are scheduled separately on policy

Items exceeding special limits may not be fully covered unless scheduled.`,
      required: false,
      tags: ['special_limits', 'personal_property', 'documentation'],
      estimated_minutes: 10,
      policySource: 'special_limits_of_liability',
    });
  }

  return steps;
}

/**
 * Create a step from an endorsement requirement
 */
function createStepFromEndorsementRequirement(
  endorsement: EndorsementImpact,
  requirement: string
): PolicyInspectionStep | null {
  // Determine phase based on requirement content
  let phase: 'pre_inspection' | 'exterior' | 'interior' | 'documentation' = 'exterior';
  if (requirement.toLowerCase().includes('interior')) phase = 'interior';
  if (requirement.toLowerCase().includes('document') || requirement.toLowerCase().includes('verify')) phase = 'documentation';

  // Determine step type
  let stepType: 'photo' | 'observation' | 'documentation' | 'measurement' = 'observation';
  if (requirement.toLowerCase().includes('photo')) stepType = 'photo';
  if (requirement.toLowerCase().includes('measure')) stepType = 'measurement';
  if (requirement.toLowerCase().includes('document')) stepType = 'documentation';

  return {
    phase,
    step_type: stepType,
    title: `[${endorsement.formCode}] ${requirement.substring(0, 50)}...`,
    instructions: `ENDORSEMENT REQUIREMENT (${endorsement.formCode}):

${requirement}

Related Endorsement: ${endorsement.title}
Category: ${endorsement.category.replace(/_/g, ' ')}`,
    required: true,
    tags: ['endorsement_requirement', endorsement.formCode.replace(/\s/g, '_')],
    estimated_minutes: 5,
    policySource: endorsement.formCode,
  };
}

/**
 * Build enhanced workflow prompt using UnifiedClaimContext
 * Now includes full briefing content and wizard context for comprehensive workflow generation
 */
function buildEnhancedWorkflowPrompt(
  context: UnifiedClaimContext,
  briefing?: { briefingJson?: any; id?: string } | null,
  wizardContext?: WizardContext
): string {
  const perilRules = PERIL_INSPECTION_RULES[context.peril.primary];

  // Build briefing section with FULL content (not just 3 fields)
  let briefingSection = '';
  if (briefing?.briefingJson) {
    const b = briefing.briefingJson;
    briefingSection = `
## AI CLAIM BRIEFING (Full Context)
${b.claim_summary ? `
**Claim Summary:**
- Primary Peril: ${b.claim_summary.primary_peril || context.peril.primary}
- Overview: ${b.claim_summary.overview?.join('; ') || 'Not available'}
` : ''}
${b.inspection_strategy ? `
**Inspection Strategy:**
- Where to Start: ${b.inspection_strategy.where_to_start?.join(', ') || 'Standard approach'}
- What to Prioritize: ${b.inspection_strategy.what_to_prioritize?.join(', ') || 'All damage areas'}
- What to Watch For: ${b.inspection_strategy.what_to_watch_for?.join(', ') || 'Standard items'}
- Common Misses: ${b.inspection_strategy.common_misses?.join(', ') || 'Check thoroughly'}
` : ''}
${b.photo_requirements?.length > 0 ? `
**Photo Requirements from Briefing:**
${b.photo_requirements.map((pr: { category: string; items: string[] }) => `- ${pr.category}: ${pr.items.join(', ')}`).join('\n')}
` : ''}
${b.endorsement_watchouts?.length > 0 ? `
**Endorsement Watchouts from Briefing:**
${b.endorsement_watchouts.map((ew: { endorsement_id: string; impact: string; inspection_implications: string[] }) => `- ${ew.endorsement_id}: ${ew.impact}
  Implications: ${ew.inspection_implications?.join('; ') || 'Review carefully'}`).join('\n')}
` : ''}
${b.depreciation_notes?.length > 0 ? `
**Depreciation Notes:**
${b.depreciation_notes.map((n: string) => `- ${n}`).join('\n')}
` : ''}
${b.open_questions_for_adjuster?.length > 0 ? `
**Open Questions to Address:**
${b.open_questions_for_adjuster.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}
` : ''}`;
  }

  // Build wizard context section if available
  // Use formatWizardContext() which correctly handles nested structure
  let wizardSection = '';
  if (wizardContext) {
    wizardSection = `
## FIELD ADJUSTER INPUT (HIGH PRIORITY)
${formatWizardContext(wizardContext)}
`;
  }

  return `You are an expert property insurance inspection planner. Generate a STEP-BY-STEP, EXECUTABLE INSPECTION WORKFLOW for a field adjuster.

This workflow is NOT a narrative. It is NOT a summary. It is an ordered execution plan.

## EXECUTIVE SUMMARY
${briefingSection ? `
${briefingSection.split('\n').slice(1).join('\n')}
` : `
- Claim: ${context.claimNumber}
- Peril: ${context.peril.primaryDisplay}
- Property: ${context.property.address}
`}

## CRITICAL ALERTS & REQUIREMENTS
${context.endorsements.extracted.length > 0 ? `
**ENDORSEMENTS REQUIRING SPECIFIC INSPECTION STEPS:**
${context.endorsements.extracted.map(e => `
[${e.formCode}] ${e.title}
  Inspection Requirements:
${e.inspectionRequirements.map(r => `    - ${r}`).join('\n') || '    - Standard inspection'}`).join('\n')}
` : 'No endorsements with special inspection requirements'}

${context.alerts.length > 0 ? `
**COVERAGE ALERTS:**
${context.alerts.map(a => `[${a.severity.toUpperCase()}] ${a.title}: ${a.description}`).join('\n')}
` : ''}

${wizardSection}
## STEP TYPE REQUIREMENTS
${generateStepTypeGuidanceForPrompt()}

IMPORTANT RULES FOR EVIDENCE REQUIREMENTS:
- Match step_type to the appropriate category above
- Set required_evidence based on step_type defaults
- ONLY override defaults when a specific step genuinely needs different requirements
- DO NOT add photo requirements to interview, documentation, checklist, or equipment steps unless specifically needed (e.g., ID verification for interview)
- DO NOT add damage_severity to non-damage steps (only photo and observation steps show damage severity, and only if tags include "damage")
- Measurement steps require measurement values, NOT photos (photos optional for visual reference only)
- Safety check steps require checklist completion, photos optional only if hazard is visible

## REFERENCE DATA (For Details Only)
- Claim Number: ${context.claimNumber}
- Policy Number: ${context.policyNumber || 'Unknown'}
- Insured: ${context.insured.name}${context.insured.name2 ? ` & ${context.insured.name2}` : ''}
- Date of Loss: ${context.dateOfLossFormatted || 'Unknown'}
- Property: ${context.property.address}
  - Year Built: ${context.property.yearBuilt || 'Unknown'}
  - Stories: ${context.property.stories || 'Unknown'}
  - Roof Year: ${context.property.roof.yearInstalled || 'Unknown'} (Age: ${context.property.roof.ageAtLoss ?? 'Unknown'} years)
  - Wood Roof: ${context.property.roof.isWoodRoof ? 'Yes' : 'No'}

- Primary Peril: ${context.peril.primaryDisplay}
- Secondary Perils: ${context.peril.secondaryDisplay.join(', ') || 'None'}
- Applicable Deductible: ${context.deductibles.applicableForPeril.formatted}
- Exterior Damaged: ${context.property.exteriorDamaged ? 'Yes' : 'No'}
- Interior Damaged: ${context.property.interiorDamaged ? 'Yes' : 'No'}

- Coverage Limits:
  - Dwelling: ${context.coverages.dwelling?.limitFormatted || 'Unknown'}
  - Other Structures: ${context.coverages.otherStructures?.limitFormatted || 'Unknown'}
  - Personal Property: ${context.coverages.personalProperty?.limitFormatted || 'Unknown'}

- Loss Settlement:
  - Dwelling: ${context.lossSettlement.dwelling.basis}
  - Roofing: ${context.lossSettlement.roofing.basis}${context.lossSettlement.roofing.isScheduled ? ' (SCHEDULED - DEPRECIATION APPLIES)' : ''}
${context.lossSettlement.roofing.calculatedPaymentPct !== undefined ? `  - Estimated Payment: ${context.lossSettlement.roofing.calculatedPaymentPct}% of RCV` : ''}
${context.lossSettlement.roofing.metalFunctionalRequirement ? '  - Metal Functional Requirement: APPLIES (cosmetic excluded)' : ''}
  - Personal Property: ${context.lossSettlement.personalProperty.basis}

- Peril-Specific Guidance:
  - Priority Areas: ${perilRules?.priorityAreas?.slice(0, 5).map(a => a.area).join(', ') || 'Standard areas'}
  - Common Misses: ${perilRules?.commonMisses?.slice(0, 3).map(m => m.issue).join(', ') || 'Standard items'}
  - Safety: ${perilRules?.safetyConsiderations?.slice(0, 2).join('; ') || 'Standard safety protocols'}

## WORKFLOW REQUIREMENTS (MANDATORY)
1. Workflow MUST be divided into ordered PHASES: pre_inspection, initial_walkthrough, exterior, roof, interior, utilities, mitigation, closeout
2. Each phase MUST contain ordered, atomic steps with clear instructions
3. Each step MUST include required flag, estimated time, and explicit evidence requirements
4. Endorsement requirements MUST be reflected in specific steps (not just mentioned)
5. If roofing is on SCHEDULED basis, include steps for age verification and material documentation
6. If metal functional requirement applies, include steps for water intrusion documentation

Generate a JSON workflow matching this exact schema:
{
  "metadata": {
    "claim_number": "string",
    "primary_peril": "string",
    "secondary_perils": ["array"],
    "estimated_total_minutes": number,
    "generation_notes": ["array of key considerations"]
  },
  "phases": [
    {
      "phase_id": "pre_inspection | initial_walkthrough | exterior | roof | interior | utilities | mitigation | closeout",
      "phase_name": "string",
      "steps": [
        {
          "step_type": "photo | measurement | checklist | observation | documentation | safety | interview",
          "title": "string - action-oriented title",
          "instructions": "string - specific, actionable instructions",
          "required": boolean,
          "estimated_minutes": number,
          "assets": [
            {
              "asset_type": "photo | document | measurement | note",
              "description": "string - what to capture",
              "required": boolean
            }
          ],
          "peril_specific": boolean,
          "endorsement_related": "form code if applicable" | null
        }
      ]
    }
  ],
  "room_template": {
    "default_steps": [
      {
        "step_type": "string",
        "title": "string",
        "instructions": "string",
        "required": boolean,
        "assets": []
      }
    ]
  },
  "tools_required": ["array of tools/equipment needed"],
  "open_questions": [
    {
      "question": "string - the question that needs to be answered",
      "context": "string - why this question matters for the inspection",
      "priority": "high | medium | low"
    }
  ]
}

Respond ONLY with valid JSON. No explanation, no markdown.`;
}

// NOTE: generateEnhancedInspectionWorkflow has been merged into generateInspectionWorkflow
// The main function now uses UnifiedClaimContext for rich policy, endorsement, and depreciation data

/**
 * Detect rooms mentioned in loss description
 */
function detectRoomsFromDescription(description: string): string[] {
  const commonRooms = [
    'kitchen', 'bathroom', 'bath', 'bedroom', 'living room', 'dining room',
    'basement', 'garage', 'attic', 'roof', 'den', 'office', 'laundry', 'hallway', 'foyer'
  ];
  const detected: string[] = [];
  const lower = description.toLowerCase();
  
  for (const room of commonRooms) {
    if (lower.includes(room)) {
      // Normalize 'bath' to 'bathroom'
      const normalized = room === 'bath' ? 'bathroom' : room;
      if (!detected.includes(normalized)) {
        detected.push(normalized);
      }
    }
  }
  return detected;
}

/**
 * Detect hazards mentioned in loss description
 */
function detectHazardsFromDescription(description: string): Partial<NonNullable<WizardContext['safetyInfo']>> {
  const lower = description.toLowerCase();
  return {
    electricalHazard: lower.includes('spark') || lower.includes('shock') || lower.includes('electric') || lower.includes('wire'),
    gasSmell: lower.includes('gas') || lower.includes('fume') || lower.includes('odor'),
    activeLeaks: lower.includes('leak') || lower.includes('gushing') || lower.includes('dripping') || lower.includes('burst'),
    moldVisible: lower.includes('mold') || lower.includes('fungi') || lower.includes('black spot'),
    structuralConcern: lower.includes('collapse') || lower.includes('sagging') || lower.includes('unstable') || lower.includes('cave in'),
  };
}

