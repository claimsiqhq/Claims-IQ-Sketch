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
import {
  getEffectivePolicyForClaim,
} from './effectivePolicyService';
import { EffectivePolicy } from '../../shared/schema';

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

    // Step 2.5: Load effective policy (ALWAYS - no feature flag)
    // The effective policy provides deterministic inspection requirements based on endorsements
    // This is computed dynamically from:
    // - policy_form_extractions (base policy)
    // - endorsement_extractions (endorsement modifications)
    let effectivePolicy: EffectivePolicy | null = null;
    let policyBasedSteps: PolicyInspectionStep[] = [];

    try {
      effectivePolicy = await getEffectivePolicyForClaim(claimId, organizationId);
      if (effectivePolicy) {
        // Generate deterministic policy-based inspection steps
        // These are injected PROGRAMMATICALLY, not AI-inferred
        policyBasedSteps = generatePolicyBasedInspectionSteps(effectivePolicy);
        console.log(`[InspectionWorkflow] Generated ${policyBasedSteps.length} policy-based inspection steps for claim ${claimId}`);
      } else {
        console.log(`[InspectionWorkflow] No effective policy available for claim ${claimId} - using peril rules only`);
      }
    } catch (err) {
      console.error('[InspectionWorkflow] Error loading effective policy:', err);
      // Continue without effective policy - not a fatal error
    }

    // Step 3: Check for existing active workflow (unless force regenerate)
    if (!forceRegenerate) {
      try {
        const { data: existingWorkflows, error: existingError } = await supabaseAdmin
          .from('inspection_workflows')
          .select('*')
          .eq('claim_id', claimId)
          .eq('organization_id', organizationId)
          .in('status', ['draft', 'active'])
          .order('version', { ascending: false })
          .limit(1);

        if (!existingError && existingWorkflows && existingWorkflows.length > 0) {
          const existing = mapWorkflowFromDb(existingWorkflows[0]);
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
      const { data: versionData, error: versionError } = await supabaseAdmin
        .from('inspection_workflows')
        .select('version')
        .eq('claim_id', claimId)
        .order('version', { ascending: false })
        .limit(1);

      if (!versionError && versionData && versionData.length > 0) {
        nextVersion = versionData[0].version + 1;
      }
    } catch (err) {
      console.error('Error getting next version:', err);
    }

    // Step 5: Archive previous active workflows
    if (forceRegenerate) {
      try {
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

    // Build effective policy context for AI prompt
    const effectivePolicyContext = formatEffectivePolicyContext(effectivePolicy);

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
      effective_policy_context: effectivePolicyContext,
    };

    // Substitute variables in the prompt template
    let userPrompt = promptConfig.userPromptTemplate
      ? substituteVariables(promptConfig.userPromptTemplate, variables)
      : buildFallbackPrompt(variables);

    // Append wizard context if available (for more specific workflow generation)
    if (wizardContextText) {
      userPrompt += `\n\n## FIELD ADJUSTER INPUT (HIGH PRIORITY)\nThe following information was gathered by the field adjuster during their initial assessment. Use this to create a more targeted workflow:\n\n${wizardContextText}`;
    }

    // Append effective policy context if available
    if (effectivePolicy) {
      userPrompt += `\n\n## EFFECTIVE POLICY (RESOLVED)\n${effectivePolicyContext}`;
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
    const { data: workflowData, error: workflowError } = await supabaseAdmin
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
      .select()
      .single();

    if (workflowError || !workflowData) {
      return {
        success: false,
        error: `Failed to create workflow: ${workflowError?.message}`,
      };
    }

    const workflow = mapWorkflowFromDb(workflowData);

    // Step 9: Insert the steps
    let stepIndex = 0;
    for (const step of aiResponse.steps) {
      try {
        const { data: insertedStepData, error: stepError } = await supabaseAdmin
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
          .select()
          .single();

        if (stepError || !insertedStepData) {
          console.error('Error inserting step:', stepError?.message);
          continue;
        }

        const insertedStep = mapStepFromDb(insertedStepData);

        // Insert assets for this step
        if (step.assets && step.assets.length > 0) {
          const assetInserts = step.assets.map(asset => ({
            step_id: insertedStep.id,
            asset_type: asset.asset_type,
            label: asset.label,
            required: asset.required,
            metadata: asset.metadata || {},
            status: 'pending',
          }));

          try {
            await supabaseAdmin.from('inspection_workflow_assets').insert(assetInserts);
          } catch (assetsError) {
            console.error('Error inserting assets:', assetsError);
          }
        }
      } catch (stepError) {
        console.error('Error inserting step:', stepError);
        continue;
      }
    }

    // Step 10: Inject policy-based inspection steps (DETERMINISTIC, not AI-inferred)
    // These steps are derived programmatically from the effective policy
    // and are added AFTER the AI-generated steps
    if (policyBasedSteps.length > 0) {
      console.log(`[InspectionWorkflow] Injecting ${policyBasedSteps.length} policy-based steps for claim ${claimId}`);

      for (const policyStep of policyBasedSteps) {
        try {
          const { error: policyStepError } = await supabaseAdmin
            .from('inspection_workflow_steps')
            .insert({
              workflow_id: workflow.id,
              step_index: stepIndex++,
              phase: policyStep.phase,
              step_type: policyStep.step_type,
              title: policyStep.title,
              instructions: policyStep.instructions,
              required: policyStep.required,
              tags: [...policyStep.tags, 'policy_injected'],  // Mark as policy-injected
              estimated_minutes: policyStep.estimated_minutes,
              peril_specific: policyStep.peril_specific || null,
              status: InspectionStepStatus.PENDING,
            });

          if (policyStepError) {
            console.error('[InspectionWorkflow] Error inserting policy step:', policyStepError.message);
          }
        } catch (policyStepErr) {
          console.error('[InspectionWorkflow] Error inserting policy step:', policyStepErr);
        }
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

    // Get the current max step index
    const { data: maxIndexData, error: maxIndexError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('step_index')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: false })
      .limit(1);

    let nextIndex = (!maxIndexError && maxIndexData && maxIndexData.length > 0) ? maxIndexData[0].step_index + 1 : 0;

    let addedSteps = 0;

    for (const roomName of roomNames) {
      // Create the room record
      const { data: roomData, error: roomError } = await supabaseAdmin
        .from('inspection_workflow_rooms')
        .insert({
          workflow_id: workflowId,
          name: roomName,
          sort_order: addedSteps,
        })
        .select()
        .single();

      if (roomError || !roomData) {
        console.error('Error creating room:', roomError?.message);
        continue;
      }

      const room = mapRoomFromDb(roomData);
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
        try {
          await supabaseAdmin.from('inspection_workflow_steps').insert(standardSteps);
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

        try {
          await supabaseAdmin.from('inspection_workflow_steps').insert(perilSpecificSteps);
          addedSteps += perilSpecificSteps.length;
        } catch (perilStepsError) {
          console.error('Error inserting peril-specific steps:', perilStepsError);
        }
      }
    }

    // Update the workflow updated_at
    try {
      await supabaseAdmin
        .from('inspection_workflows')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', workflowId);
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

    // Get all assets for these steps
    const stepIds = stepsData.map(s => s.id);
    let assetsData: any[] = [];
    if (stepIds.length > 0) {
      const { data: assetsResult, error: assetsError } = await supabaseAdmin
        .from('inspection_workflow_assets')
        .select('*')
        .in('step_id', stepIds);

      if (!assetsError && assetsResult) {
        assetsData = assetsResult;
      }
    }

    // Map assets to their steps
    const assetsByStepId = new Map<string, InspectionWorkflowAsset[]>();
    for (const asset of assetsData) {
      const mappedAsset = mapAssetFromDb(asset);
      if (!assetsByStepId.has(mappedAsset.stepId)) {
        assetsByStepId.set(mappedAsset.stepId, []);
      }
      assetsByStepId.get(mappedAsset.stepId)!.push(mappedAsset);
    }

    const steps: StepWithAssets[] = stepsData.map(r => ({
      ...mapStepFromDb(r),
      assets: assetsByStepId.get(r.id) || [],
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
    const { data: maxIndexData, error: maxIndexError } = await supabaseAdmin
      .from('inspection_workflow_steps')
      .select('step_index')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: false })
      .limit(1);

    const nextIndex = (!maxIndexError && maxIndexData && maxIndexData.length > 0) ? maxIndexData[0].step_index + 1 : 0;

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
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding workflow step:', error?.message);
      return null;
    }

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

    // Get the current claim to check for peril changes
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

    // Check if endorsements have changed since workflow was generated
    if (workflow.createdAt) {
      const { data: newEndorsements, error: endorsementsError } = await supabaseAdmin
        .from('endorsement_extractions')
        .select('id')
        .eq('claim_id', claimId)
        .gt('created_at', workflow.createdAt)
        .limit(1);

      if (!endorsementsError && newEndorsements && newEndorsements.length > 0) {
        return {
          shouldRegenerate: true,
          reason: 'New endorsements added since workflow generation',
        };
      }

      // Check if policy forms have changed
      const { data: newPolicyForms, error: policyFormsError } = await supabaseAdmin
        .from('policy_form_extractions')
        .select('id')
        .eq('claim_id', claimId)
        .gt('created_at', workflow.createdAt)
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
