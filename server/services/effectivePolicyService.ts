/**
 * Effective Policy Resolution Service (DYNAMIC ONLY)
 *
 * Resolves FNOL + Policy + Endorsements into a deterministic, claim-specific
 * Effective Policy JSON. This service merges base policy provisions with
 * endorsement modifications according to precedence rules.
 *
 * Precedence order (highest to lowest):
 * 1. Loss settlement / schedule endorsements (priority 1-10)
 * 2. Coverage-specific endorsements (priority 11-30)
 * 3. State amendatory endorsements (priority 31-50)
 * 4. Base policy form (priority 51-100)
 *
 * Conflicts resolved using "most specific rule wins"
 *
 * IMPORTANT:
 * - This service NEVER writes to the database
 * - Effective policy is computed dynamically on each request
 * - Uses ONLY canonical data from:
 *   - claims.loss_context (FNOL truth)
 *   - policy_form_extractions (base policy)
 *   - endorsement_extractions (endorsement modifications)
 * - All changes are additive and auditable
 * - No automated coverage approvals or denials are made
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  EffectivePolicy,
  CoverageRules,
  RoofingSystemLossSettlement,
  LossSettlementBasis,
  PolicySectionI,
  EffectivePolicyFeatureFlags,
} from '../../shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Endorsement extraction row from database
 */
interface EndorsementExtractionRow {
  id: string;
  claim_id: string;
  organization_id: string;
  document_id?: string;
  form_code: string;
  title?: string;
  edition_date?: string;
  jurisdiction?: string;
  page_count?: number;
  applies_to_policy_forms?: string[];
  modifications?: EndorsementModifications; // Legacy field
  extraction_data?: any; // Canonical structure (preferred)
  tables?: EndorsementTable[];
  raw_text?: string;
  precedence_priority?: number;
  endorsement_type?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Endorsement modifications structure (canonical schema only)
 */
interface EndorsementModifications {
  definitions?: {
    added?: { term: string; definition: string }[];
    deleted?: string[];
    replaced?: { term: string; new_definition: string }[];
  };
  exclusions?: {
    added?: string[];
    deleted?: string[];
  };
  loss_settlement?: {
    replaces?: Array<{
      section: string;
      new_rule: {
        basis?: string;
        repair_time_limit_months?: number;
        fallback_basis?: string;
        conditions?: string[];
      };
    }>;
  };
}

/**
 * Endorsement table structure (canonical schema only)
 */
interface EndorsementTable {
  table_type: string;
  applies_when?: { coverage?: string[]; peril?: string[] };
  schedule?: any[];
}

/**
 * Policy form extraction row from database
 */
interface PolicyFormExtractionRow {
  id: string;
  claim_id: string;
  organization_id: string;
  document_id?: string;
  document_type?: string;
  policy_form_code?: string;
  policy_form_name?: string;
  edition_date?: string;
  page_count?: number;
  extraction_data?: any; // Canonical structure (preferred)
  policy_structure?: {
    tableOfContents?: string[];
    policyStatement?: string;
    agreement?: string;
  };
  definitions?: Array<{
    term: string;
    definition: string;
    subClauses?: string[];
    exceptions?: string[];
  }> | Record<string, any>; // Canonical uses Record<string, {...}>
  section_i?: PolicySectionI; // Legacy field
  section_ii?: Record<string, unknown>;
  general_conditions?: string[];
  raw_page_text?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Claim row from database
 */
interface ClaimRow {
  id: string;
  organization_id: string;
  claim_number: string;
  policy_number?: string;
  property_state?: string;
  coverage_a?: string;
  coverage_b?: string;
  coverage_c?: string;
  coverage_d?: string;
  deductible?: string;
  wind_hail_deductible?: string;
  dwelling_limit?: string;
  year_roof_install?: string;
}

/**
 * Result of policy resolution
 */
export interface ResolveEffectivePolicyResult {
  success: boolean;
  effectivePolicy?: EffectivePolicy;
  error?: string;
  sourceCounts?: {
    basePolicies: number;
    endorsements: number;
  };
}

// ============================================
// FEATURE FLAG HELPER
// ============================================

/**
 * Check if effective policy resolution is enabled for an organization
 */
export async function isEffectivePolicyEnabled(
  organizationId: string
): Promise<boolean> {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single();

  if (error || !org) {
    return false;
  }

  const settings = org.settings as Record<string, unknown> | null;
  if (!settings) {
    return false;
  }

  const effectivePolicySettings = settings.effectivePolicy as EffectivePolicyFeatureFlags | undefined;
  return effectivePolicySettings?.enabled === true;
}

/**
 * Get effective policy feature flags for an organization
 */
export async function getEffectivePolicyFlags(
  organizationId: string
): Promise<EffectivePolicyFeatureFlags> {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single();

  const settings = org?.settings as Record<string, unknown> | null;
  const effectivePolicySettings = settings?.effectivePolicy as EffectivePolicyFeatureFlags | undefined;

  // Default flags if not configured
  return {
    enabled: effectivePolicySettings?.enabled ?? false,
    version: effectivePolicySettings?.version ?? 1,
    enableInspectionIntegration: effectivePolicySettings?.enableInspectionIntegration ?? false,
    enableEstimateValidation: effectivePolicySettings?.enableEstimateValidation ?? false,
  };
}

// ============================================
// MAIN RESOLUTION FUNCTION
// ============================================

/**
 * Resolve the effective policy for a claim
 *
 * This function:
 * 1. Loads the base policy form extraction for the claim
 * 2. Loads ALL endorsement extractions for the claim
 * 3. Applies rules in precedence order
 * 4. Resolves conflicts using "most specific rule wins"
 * 5. Returns ONE resolved policy object
 *
 * Does NOT mutate or delete existing records
 */
export async function resolveEffectivePolicyForClaim(
  claimId: string,
  organizationId: string
): Promise<ResolveEffectivePolicyResult> {
  try {
    // Check if feature is enabled (but still allow resolution if called directly)
    const flags = await getEffectivePolicyFlags(organizationId);

    // Load claim data for coverage limits and deductibles
    const { data: claimData, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .eq('organization_id', organizationId)
      .single();

    if (claimError || !claimData) {
      return {
        success: false,
        error: `Claim not found: ${claimId}`,
      };
    }

    const claim = claimData as ClaimRow;

    // Load base policy form extractions (filter by extraction_status, not status column which may be unsynced)
    const { data: policyExtractions, error: policyError } = await supabaseAdmin
      .from('policy_form_extractions')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('extraction_status', 'completed')
      .order('created_at', { ascending: false });

    if (policyError) {
      console.error('[EffectivePolicy] Error loading policy extractions:', policyError);
    }

    const basePolicies = (policyExtractions || []) as PolicyFormExtractionRow[];

    // Load endorsement extractions (sorted by precedence priority, filter by extraction_status)
    const { data: endorsementData, error: endorsementError } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .eq('extraction_status', 'completed')
      .order('precedence_priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (endorsementError) {
      console.error('[EffectivePolicy] Error loading endorsement extractions:', endorsementError);
    }

    const endorsements = (endorsementData || []) as EndorsementExtractionRow[];

    // Sort endorsements by precedence
    // Priority 1-10: Loss settlement/schedule endorsements
    // Priority 11-30: Coverage-specific endorsements
    // Priority 31-50: State amendatory endorsements
    // Priority 51-100: General/other endorsements
    const sortedEndorsements = sortEndorsementsByPrecedence(endorsements);

    // Build the effective policy (DYNAMIC ONLY - no DB write)
    const effectivePolicy = buildEffectivePolicy(
      claimId,
      claim,
      basePolicies,
      sortedEndorsements
    );

    console.log(`[EffectivePolicy] Dynamically resolved effective policy for claim ${claimId} from ${basePolicies.length} policies and ${endorsements.length} endorsements`);

    return {
      success: true,
      effectivePolicy,
      sourceCounts: {
        basePolicies: basePolicies.length,
        endorsements: endorsements.length,
      },
    };
  } catch (error) {
    console.error('[EffectivePolicy] Error resolving effective policy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// ENDORSEMENT PRECEDENCE SORTING
// ============================================

/**
 * Determine endorsement type from form code and title
 * Used when endorsement_type is not explicitly set
 */
function classifyEndorsementType(endorsement: EndorsementExtractionRow): string {
  const formCode = (endorsement.form_code || '').toUpperCase();
  const title = (endorsement.title || '').toUpperCase();

  // Loss settlement / schedule endorsements (highest priority)
  if (
    title.includes('LOSS SETTLEMENT') ||
    title.includes('SCHEDULE') ||
    title.includes('ROOF') ||
    title.includes('ACV') ||
    formCode.includes('88 02') // Common roof schedule form
  ) {
    return 'loss_settlement';
  }

  // State amendatory endorsements
  if (
    title.includes('AMENDATORY') ||
    title.includes('STATE') ||
    endorsement.jurisdiction
  ) {
    return 'state_amendatory';
  }

  // Coverage-specific endorsements
  if (
    title.includes('COVERAGE') ||
    title.includes('EXTENSION') ||
    title.includes('ADDITIONAL')
  ) {
    return 'coverage_specific';
  }

  return 'general';
}

/**
 * Get precedence priority for endorsement type
 */
function getPrecedencePriority(endorsementType: string): number {
  // Precedence priority (lower = higher precedence)
  // Priority 1-10: Loss settlement/schedule endorsements
  // Priority 11-30: Coverage-specific endorsements
  // Priority 31-50: State amendatory endorsements
  // Priority 51-100: General/other endorsements
  switch (endorsementType) {
    case 'loss_settlement':
    case 'schedule':
      return 5;
    case 'coverage_specific':
      return 20;
    case 'state_amendatory':
      return 40;
    default:
      return 75;
  }
}

/**
 * Sort endorsements by precedence
 * Highest precedence (lowest number) first
 */
function sortEndorsementsByPrecedence(
  endorsements: EndorsementExtractionRow[]
): EndorsementExtractionRow[] {
  return [...endorsements].sort((a, b) => {
    // Use explicit priority if set
    const priorityA = a.precedence_priority ?? getPrecedencePriority(
      a.endorsement_type || classifyEndorsementType(a)
    );
    const priorityB = b.precedence_priority ?? getPrecedencePriority(
      b.endorsement_type || classifyEndorsementType(b)
    );

    // Lower priority number = higher precedence
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // If same priority, more recent endorsement takes precedence
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ============================================
// EFFECTIVE POLICY BUILDER
// ============================================

/**
 * Build the effective policy from base policies and endorsements
 */
function buildEffectivePolicy(
  claimId: string,
  claim: ClaimRow,
  basePolicies: PolicyFormExtractionRow[],
  endorsements: EndorsementExtractionRow[]
): EffectivePolicy {
  const sourceMap: Record<string, string[]> = {};
  const endorsementIds = endorsements.map(e => e.id);

  // Initialize with base policy provisions
  let effectivePolicy: EffectivePolicy = {
    claimId,
    jurisdiction: claim.property_state || undefined,
    policyNumber: claim.policy_number || undefined,
    effectiveDate: undefined,

    coverages: {
      coverageA: initializeCoverageFromClaim(claim, 'A'),
      coverageB: initializeCoverageFromClaim(claim, 'B'),
      coverageC: initializeCoverageFromClaim(claim, 'C'),
      coverageD: initializeCoverageFromClaim(claim, 'D'),
    },

    lossSettlement: {
      dwellingAndStructures: undefined,
      roofingSystem: undefined,
      personalProperty: undefined,
    },

    deductibles: {
      standard: claim.deductible || undefined,
      windHail: claim.wind_hail_deductible || undefined,
      sourceEndorsements: [],
    },

    exclusions: [],
    conditions: [],
    sourceMap,

    resolvedAt: new Date().toISOString(),
    resolvedFromDocuments: {
      basePolicyId: basePolicies[0]?.id,
      endorsementIds,
    },
  };

  // Apply base policy provisions
  for (const policy of basePolicies) {
    effectivePolicy = applyBasePolicyProvisions(effectivePolicy, policy, sourceMap);
  }

  // Apply endorsements in precedence order (highest precedence first)
  // Endorsements with lower priority number override those with higher
  for (const endorsement of endorsements) {
    effectivePolicy = applyEndorsementModifications(effectivePolicy, endorsement, sourceMap);
  }

  return effectivePolicy;
}

/**
 * Initialize coverage rules from claim data
 */
function initializeCoverageFromClaim(
  claim: ClaimRow,
  coverageType: 'A' | 'B' | 'C' | 'D'
): CoverageRules | undefined {
  const coverageMap: Record<string, string | undefined> = {
    A: claim.coverage_a || claim.dwelling_limit,
    B: claim.coverage_b,
    C: claim.coverage_c,
    D: claim.coverage_d,
  };

  const limit = coverageMap[coverageType];
  if (!limit) {
    return undefined;
  }

  return {
    limit,
    settlementBasis: 'RCV', // Default to RCV, can be overridden by endorsements
  };
}

/**
 * Apply provisions from a base policy form extraction
 * Uses canonical structure only: extraction_data.structure
 */
function applyBasePolicyProvisions(
  policy: EffectivePolicy,
  basePolicy: PolicyFormExtractionRow,
  sourceMap: Record<string, string[]>
): EffectivePolicy {
  // Use canonical structure from extraction_data only
  const structure = basePolicy.extraction_data?.structure;
  if (!structure) {
    return policy;
  }

  // Track source for base policy
  const basePolicyId = basePolicy.id;

  // Apply loss settlement from base policy
  // Canonical format: structure.loss_settlement.default
  if (structure.loss_settlement?.default) {
    const ls = structure.loss_settlement.default;
    if (!policy.lossSettlement.dwellingAndStructures) {
      policy.lossSettlement.dwellingAndStructures = {
        basis: parseLossSettlementBasis(ls.basis) || 'RCV',
        repairTimeLimitMonths: ls.repair_time_limit_months,
      };
      addToSourceMap(sourceMap, 'lossSettlement.dwellingAndStructures', basePolicyId);
    }
  }

  // Apply exclusions from base policy
  // Canonical format: structure.exclusions (array)
  if (Array.isArray(structure.exclusions)) {
    for (const exclusion of structure.exclusions) {
      if (typeof exclusion === 'string' && !policy.exclusions.includes(exclusion)) {
        policy.exclusions.push(exclusion);
        addToSourceMap(sourceMap, `exclusion:${exclusion.substring(0, 50)}`, basePolicyId);
      }
    }
  }

  // Apply conditions from base policy
  // Canonical format: structure.conditions (array)
  if (Array.isArray(structure.conditions)) {
    for (const condition of structure.conditions) {
      if (typeof condition === 'string' && !policy.conditions.includes(condition)) {
        policy.conditions.push(condition);
        addToSourceMap(sourceMap, `condition:${condition.substring(0, 50)}`, basePolicyId);
      }
    }
  }

  // Apply general conditions
  const generalConditions = basePolicy.general_conditions || [];
  for (const condition of generalConditions) {
    if (!policy.conditions.includes(condition)) {
      policy.conditions.push(condition);
      addToSourceMap(sourceMap, `condition:${condition.substring(0, 50)}`, basePolicyId);
    }
  }

  return policy;
}

/**
 * Apply modifications from an endorsement
 * This is the core of the "most specific rule wins" logic
 */
function applyEndorsementModifications(
  policy: EffectivePolicy,
  endorsement: EndorsementExtractionRow,
  sourceMap: Record<string, string[]>
): EffectivePolicy {
  // Use extraction_data (canonical structure) - no fallbacks
  const canonicalData = endorsement.extraction_data || {};
  const modifications = canonicalData.modifications || endorsement.modifications || {};
  const tables = canonicalData.tables || endorsement.tables || [];
  const endorsementId = endorsement.id;
  const formCode = endorsement.form_code;

  // Apply loss settlement modifications (highest precedence)
  // Canonical format: loss_settlement.replaces
  if (modifications.loss_settlement?.replaces) {
    for (const replaced of modifications.loss_settlement.replaces) {
      const section = replaced.section.toLowerCase();
      const newRule = replaced.new_rule;

      // Roofing system loss settlement
      if (section.includes('roof') || section.includes('hail') || section.includes('roofing')) {
        const roofingRules = {
          applies: true,
          basis: (newRule.basis === 'RCV' ? 'RCV' : newRule.basis === 'ACV' ? 'ACV' : 'RCV_WITH_CONDITIONS') as LossSettlementBasis,
          repairTimeLimitMonths: newRule.repair_time_limit_months || 12,
          fallbackBasis: newRule.fallback_basis as LossSettlementBasis | undefined,
          conditions: newRule.conditions || [],
        };
        
        policy.lossSettlement.roofingSystem = {
          ...roofingRules,
          sourceEndorsement: formCode,
        };
        addToSourceMap(sourceMap, 'lossSettlement.roofingSystem', endorsementId);
      }

      // Dwelling and structures
      if (section.includes('dwelling') || section.includes('structure')) {
        const basis = newRule.basis || 'RCV';
        policy.lossSettlement.dwellingAndStructures = {
          ...policy.lossSettlement.dwellingAndStructures,
          basis: basis as LossSettlementBasis,
          sourceEndorsement: formCode,
        };
        addToSourceMap(sourceMap, 'lossSettlement.dwellingAndStructures', endorsementId);
      }
    }
  }

  // Apply schedule tables (roofing schedules) - canonical format only
  for (const table of tables) {
    if (table.table_type && (table.table_type.includes('roof') || table.table_type.includes('schedule'))) {
      const ageBasedSchedule = parseAgeBasedSchedule(table.schedule);
      if (ageBasedSchedule && policy.lossSettlement.roofingSystem) {
        policy.lossSettlement.roofingSystem.ageBasedSchedule = ageBasedSchedule;
        policy.lossSettlement.roofingSystem.basis = 'SCHEDULED';
        addToSourceMap(sourceMap, 'lossSettlement.roofingSystem.schedule', endorsementId);
      }
    }
  }

  // Apply exclusion modifications
  if (modifications?.exclusions) {
    // Add new exclusions
    for (const exclusion of modifications.exclusions.added || []) {
      if (!policy.exclusions.includes(exclusion)) {
        policy.exclusions.push(exclusion);
        addToSourceMap(sourceMap, `exclusion:${exclusion.substring(0, 50)}`, endorsementId);
      }
    }

    // Remove deleted exclusions (endorsement removes base policy exclusion)
    for (const deleted of modifications.exclusions.deleted || []) {
      const index = policy.exclusions.indexOf(deleted);
      if (index > -1) {
        policy.exclusions.splice(index, 1);
        addToSourceMap(sourceMap, `exclusion.removed:${deleted.substring(0, 50)}`, endorsementId);
      }
    }
  }

  // Apply condition modifications
  if (modifications?.conditions) {
    for (const condition of modifications.conditions.added || []) {
      if (!policy.conditions.includes(condition)) {
        policy.conditions.push(condition);
        addToSourceMap(sourceMap, `condition:${condition.substring(0, 50)}`, endorsementId);
      }
    }

    for (const deleted of modifications.conditions.deleted || []) {
      const index = policy.conditions.indexOf(deleted);
      if (index > -1) {
        policy.conditions.splice(index, 1);
        addToSourceMap(sourceMap, `condition.removed:${deleted.substring(0, 50)}`, endorsementId);
      }
    }
  }

  // Apply coverage modifications
  if (modifications?.coverages?.modified) {
    for (const mod of modifications.coverages.modified) {
      const coverage = mod.coverage.toUpperCase();
      if (coverage.includes('A') && policy.coverages.coverageA) {
        policy.coverages.coverageA.sourceEndorsement = formCode;
        addToSourceMap(sourceMap, 'coverages.coverageA', endorsementId);
      }
      if (coverage.includes('B') && policy.coverages.coverageB) {
        policy.coverages.coverageB.sourceEndorsement = formCode;
        addToSourceMap(sourceMap, 'coverages.coverageB', endorsementId);
      }
      if (coverage.includes('C') && policy.coverages.coverageC) {
        policy.coverages.coverageC.sourceEndorsement = formCode;
        addToSourceMap(sourceMap, 'coverages.coverageC', endorsementId);
      }
      if (coverage.includes('D') && policy.coverages.coverageD) {
        policy.coverages.coverageD.sourceEndorsement = formCode;
        addToSourceMap(sourceMap, 'coverages.coverageD', endorsementId);
      }
    }
  }

  // Track jurisdiction from state amendatory endorsements
  if (endorsement.jurisdiction && !policy.jurisdiction) {
    policy.jurisdiction = endorsement.jurisdiction;
    addToSourceMap(sourceMap, 'jurisdiction', endorsementId);
  }

  return policy;
}

// ============================================
// PARSING HELPERS
// ============================================

/**
 * Parse loss settlement basis from text
 */
function parseLossSettlementBasis(text?: string): LossSettlementBasis | undefined {
  if (!text) return undefined;

  const upper = text.toUpperCase();
  if (upper.includes('ACTUAL CASH VALUE') || upper.includes('ACV')) {
    return 'ACV';
  }
  if (upper.includes('REPLACEMENT COST') || upper.includes('RCV')) {
    return 'RCV';
  }
  if (upper.includes('SCHEDULE')) {
    return 'SCHEDULED';
  }
  return undefined;
}

/**
 * Extract settlement basis from rule text
 */
function extractSettlementBasis(ruleText: string): LossSettlementBasis | undefined {
  return parseLossSettlementBasis(ruleText);
}

/**
 * Parse roofing loss settlement rules from endorsement text
 */
function parseRoofingLossSettlement(
  ruleText: string,
  formCode: string
): Partial<RoofingSystemLossSettlement> | undefined {
  const upper = ruleText.toUpperCase();

  // Check for ACV roofing
  if (upper.includes('ACTUAL CASH VALUE') || upper.includes('ACV')) {
    const result: Partial<RoofingSystemLossSettlement> = {
      applies: true,
      basis: 'ACV',
    };

    // Look for metal component exclusions
    if (upper.includes('METAL') && (upper.includes('EXCLUD') || upper.includes('NOT COVER'))) {
      result.metalComponentRule = {
        coveredOnlyIf: 'water intrusion occurs',
        settlementBasis: 'ACV',
      };
    }

    return result;
  }

  // Check for scheduled roofing
  if (upper.includes('SCHEDULE') || upper.includes('PERCENTAGE')) {
    return {
      applies: true,
      basis: 'SCHEDULED',
    };
  }

  // Check for RCV roofing
  if (upper.includes('REPLACEMENT COST') || upper.includes('RCV')) {
    return {
      applies: true,
      basis: 'RCV',
    };
  }

  return undefined;
}

/**
 * Parse age-based depreciation schedule from table data
 */
function parseAgeBasedSchedule(
  data?: Record<string, unknown>
): RoofingSystemLossSettlement['ageBasedSchedule'] | undefined {
  if (!data) return undefined;

  // Try to parse common schedule formats
  const schedule: { minAge: number; maxAge: number; paymentPercentage: number }[] = [];

  // Format 1: { "0-5": 100, "6-10": 80, "11-15": 60, ... }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' && key.includes('-')) {
      const [minStr, maxStr] = key.split('-');
      const minAge = parseInt(minStr, 10);
      const maxAge = parseInt(maxStr, 10);
      if (!isNaN(minAge) && !isNaN(maxAge)) {
        schedule.push({ minAge, maxAge, paymentPercentage: value });
      }
    }
  }

  // Format 2: { rows: [{ ageRange: "0-5", percentage: 100 }, ...] }
  if (Array.isArray(data.rows)) {
    for (const row of data.rows) {
      if (typeof row === 'object' && row.ageRange && row.percentage) {
        const [minStr, maxStr] = String(row.ageRange).split('-');
        const minAge = parseInt(minStr, 10);
        const maxAge = parseInt(maxStr, 10);
        const percentage = typeof row.percentage === 'number'
          ? row.percentage
          : parseInt(String(row.percentage), 10);
        if (!isNaN(minAge) && !isNaN(maxAge) && !isNaN(percentage)) {
          schedule.push({ minAge, maxAge, paymentPercentage: percentage });
        }
      }
    }
  }

  return schedule.length > 0 ? schedule : undefined;
}

/**
 * Add source to source map for auditability
 */
function addToSourceMap(
  sourceMap: Record<string, string[]>,
  key: string,
  sourceId: string
): void {
  if (!sourceMap[key]) {
    sourceMap[key] = [];
  }
  if (!sourceMap[key].includes(sourceId)) {
    sourceMap[key].push(sourceId);
  }
}

// ============================================
// RETRIEVAL FUNCTIONS
// ============================================

/**
 * Get the effective policy for a claim (ALWAYS computed dynamically)
 *
 * This function always computes the effective policy from:
 * - Base policy form extractions
 * - Endorsement extractions (sorted by precedence)
 * - Claim data (coverage limits, deductibles)
 *
 * NO caching is used - policy is resolved fresh each time.
 * This ensures consistency with the latest canonical data.
 */
export async function getEffectivePolicyForClaim(
  claimId: string,
  organizationId: string
): Promise<EffectivePolicy | null> {
  // Always resolve dynamically - no caching
  const result = await resolveEffectivePolicyForClaim(claimId, organizationId);
  return result.effectivePolicy || null;
}

/**
 * Trigger recomputation of effective policy (legacy compatibility)
 * Since effective policy is now ALWAYS computed dynamically, this is a no-op.
 * It's kept for backward compatibility with code that calls it.
 */
export async function recomputeEffectivePolicyIfNeeded(
  claimId: string,
  organizationId: string
): Promise<void> {
  // No-op: Effective policy is now always computed dynamically on each request.
  // This function exists for backward compatibility with documentProcessor.
  console.log(`[EffectivePolicy] Recomputation triggered for claim ${claimId} (dynamic computation active)`);
}

// ============================================
// AI BRIEFING HELPERS
// ============================================

/**
 * Effective policy summary for AI briefings
 * Contains concise, structured data for prompt injection
 */
export interface EffectivePolicySummary {
  coverageLimits: {
    coverageA?: string;
    coverageB?: string;
    coverageC?: string;
    coverageD?: string;
  };
  deductibles: {
    standard?: string;
    windHail?: string;
  };
  roofSettlement: {
    basis: string;
    isScheduled: boolean;
    hasMetalRestrictions: boolean;
    sourceEndorsement?: string;
  };
  majorExclusions: string[];
  endorsementWatchouts: {
    formCode: string;
    summary: string;
  }[];
}

/**
 * Generate a concise summary of the effective policy for AI briefings
 *
 * This summary is designed to be injected into AI prompts.
 * It extracts the most relevant policy information for inspection guidance.
 */
export function generateEffectivePolicySummary(
  effectivePolicy: EffectivePolicy
): EffectivePolicySummary {
  // Extract coverage limits
  const coverageLimits = {
    coverageA: effectivePolicy.coverages.coverageA?.limit,
    coverageB: effectivePolicy.coverages.coverageB?.limit,
    coverageC: effectivePolicy.coverages.coverageC?.limit,
    coverageD: effectivePolicy.coverages.coverageD?.limit,
  };

  // Extract deductibles
  const deductibles = {
    standard: effectivePolicy.deductibles.standard,
    windHail: effectivePolicy.deductibles.windHail,
  };

  // Extract roof settlement rules
  const roofingSystem = effectivePolicy.lossSettlement.roofingSystem;
  const roofSettlement = {
    basis: roofingSystem?.basis || 'RCV',
    isScheduled: roofingSystem?.basis === 'SCHEDULED',
    hasMetalRestrictions: !!roofingSystem?.metalComponentRule,
    sourceEndorsement: roofingSystem?.sourceEndorsement,
  };

  // Extract major exclusions (first 5)
  const majorExclusions = effectivePolicy.exclusions.slice(0, 5);

  // Build endorsement watchouts from source map
  const endorsementWatchouts: { formCode: string; summary: string }[] = [];

  // Find endorsements that modified important provisions
  const importantProvisions = [
    'lossSettlement.roofingSystem',
    'lossSettlement.dwellingAndStructures',
    'lossSettlement.roofingSystem.schedule',
  ];

  for (const provision of importantProvisions) {
    const sources = effectivePolicy.sourceMap[provision];
    if (sources && sources.length > 0) {
      // Get the form code from the resolved data
      if (provision === 'lossSettlement.roofingSystem' && roofingSystem?.sourceEndorsement) {
        endorsementWatchouts.push({
          formCode: roofingSystem.sourceEndorsement,
          summary: `Modifies roof loss settlement to ${roofingSystem.basis}`,
        });
      }
    }
  }

  // Check for metal component restrictions
  if (roofingSystem?.metalComponentRule) {
    endorsementWatchouts.push({
      formCode: roofingSystem.sourceEndorsement || 'Policy Endorsement',
      summary: `Metal components covered only if: ${roofingSystem.metalComponentRule.coveredOnlyIf}`,
    });
  }

  return {
    coverageLimits,
    deductibles,
    roofSettlement,
    majorExclusions,
    endorsementWatchouts,
  };
}

/**
 * Format effective policy summary as a string for AI prompt injection
 */
export function formatEffectivePolicySummaryForPrompt(
  summary: EffectivePolicySummary
): string {
  const lines: string[] = ['## EFFECTIVE POLICY SUMMARY'];

  // Coverage limits
  lines.push('\n### Coverage Limits');
  if (summary.coverageLimits.coverageA) lines.push(`- Coverage A (Dwelling): ${summary.coverageLimits.coverageA}`);
  if (summary.coverageLimits.coverageB) lines.push(`- Coverage B (Other Structures): ${summary.coverageLimits.coverageB}`);
  if (summary.coverageLimits.coverageC) lines.push(`- Coverage C (Personal Property): ${summary.coverageLimits.coverageC}`);
  if (summary.coverageLimits.coverageD) lines.push(`- Coverage D (Loss of Use): ${summary.coverageLimits.coverageD}`);

  // Deductibles
  lines.push('\n### Deductibles');
  if (summary.deductibles.standard) lines.push(`- Standard: ${summary.deductibles.standard}`);
  if (summary.deductibles.windHail) lines.push(`- Wind/Hail: ${summary.deductibles.windHail}`);

  // Roof settlement
  lines.push('\n### Roof Settlement Rules');
  lines.push(`- Settlement Basis: ${summary.roofSettlement.basis}`);
  if (summary.roofSettlement.isScheduled) {
    lines.push('- IMPORTANT: Scheduled depreciation applies - document roof age and condition');
  }
  if (summary.roofSettlement.hasMetalRestrictions) {
    lines.push('- IMPORTANT: Metal components have special restrictions');
  }
  if (summary.roofSettlement.sourceEndorsement) {
    lines.push(`- Source: ${summary.roofSettlement.sourceEndorsement}`);
  }

  // Major exclusions
  if (summary.majorExclusions.length > 0) {
    lines.push('\n### Major Exclusions');
    summary.majorExclusions.forEach(excl => {
      lines.push(`- ${excl.substring(0, 100)}${excl.length > 100 ? '...' : ''}`);
    });
  }

  // Endorsement watchouts
  if (summary.endorsementWatchouts.length > 0) {
    lines.push('\n### Endorsement Watchouts');
    summary.endorsementWatchouts.forEach(watchout => {
      lines.push(`- ${watchout.formCode}: ${watchout.summary}`);
    });
  }

  return lines.join('\n');
}
