/**
 * Policy Validation Service
 *
 * Validates estimate line items against the effective policy for a claim.
 * This service provides ADVISORY validation only - it does NOT block estimates.
 *
 * Validation rules:
 * - Flag items excluded by endorsements
 * - Flag items subject to depreciation schedules
 * - Flag items missing required documentation
 *
 * IMPORTANT:
 * - Validation is ADVISORY only - estimates are never blocked
 * - All validations include recommended actions for the adjuster
 * - Results are persisted for audit trail
 */

import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  EffectivePolicy,
  PolicyValidationResult,
  PolicyValidationResponse,
  PolicyValidationSeverity,
  EstimateLineItem,
} from '../../shared/schema';
import {
  getEffectivePolicyForClaim,
  getEffectivePolicyFlags,
} from './effectivePolicyService';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Estimate line item from database
 */
interface EstimateLineItemRow {
  id: string;
  estimate_id: string;
  line_item_id?: string;
  line_item_code: string;
  line_item_description: string;
  category_id?: string;
  quantity: string;
  unit: string;
  unit_price: string;
  material_cost?: string;
  labor_cost?: string;
  equipment_cost?: string;
  subtotal: string;
  source?: string;
  damage_zone_id?: string;
  room_name?: string;
  notes?: string;
  is_approved?: boolean;
  sort_order?: number;
}

/**
 * Validation context passed to validation rules
 */
interface ValidationContext {
  claimId: string;
  organizationId: string;
  effectivePolicy: EffectivePolicy;
  roofAge?: number;  // Years since roof installation
}

/**
 * Result of validation service
 */
export interface ValidateEstimateResult {
  success: boolean;
  response?: PolicyValidationResponse;
  error?: string;
}

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Validate estimate line items against the effective policy
 *
 * This function:
 * 1. Loads the effective policy for the claim
 * 2. Applies validation rules to each line item
 * 3. Returns advisory results (never blocks)
 * 4. Persists results to claims table
 */
export async function validateEstimateAgainstPolicy(
  claimId: string,
  organizationId: string,
  estimateId: string
): Promise<ValidateEstimateResult> {
  try {
    // Check if feature is enabled
    const flags = await getEffectivePolicyFlags(organizationId);
    if (!flags.enabled || !flags.enableEstimateValidation) {
      return {
        success: true,
        response: {
          claimId,
          validatedAt: new Date().toISOString(),
          totalLineItems: 0,
          validationResults: [],
          summary: { infoCount: 0, warningCount: 0 },
        },
      };
    }

    // Load effective policy
    const effectivePolicy = await getEffectivePolicyForClaim(claimId, organizationId);
    if (!effectivePolicy) {
      return {
        success: false,
        error: 'No effective policy found for claim',
      };
    }

    // Load estimate line items
    const { data: lineItemsData, error: lineItemsError } = await supabaseAdmin
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', estimateId);

    if (lineItemsError) {
      return {
        success: false,
        error: `Failed to load estimate line items: ${lineItemsError.message}`,
      };
    }

    const lineItems = (lineItemsData || []) as EstimateLineItemRow[];

    // Get roof age from claim
    const { data: claimData } = await supabaseAdmin
      .from('claims')
      .select('year_roof_install')
      .eq('id', claimId)
      .single();

    const roofAge = calculateRoofAge(claimData?.year_roof_install);

    // Build validation context
    const context: ValidationContext = {
      claimId,
      organizationId,
      effectivePolicy,
      roofAge,
    };

    // Run validations
    const validationResults: PolicyValidationResult[] = [];

    for (const lineItem of lineItems) {
      const itemResults = validateLineItem(lineItem, context);
      validationResults.push(...itemResults);
    }

    // Build response
    const response: PolicyValidationResponse = {
      claimId,
      validatedAt: new Date().toISOString(),
      totalLineItems: lineItems.length,
      validationResults,
      summary: {
        infoCount: validationResults.filter(r => r.severity === 'info').length,
        warningCount: validationResults.filter(r => r.severity === 'warning').length,
      },
    };

    // Persist results to claims table
    const { error: updateError } = await supabaseAdmin
      .from('claims')
      .update({
        policy_validation_results: response,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimId)
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('[PolicyValidation] Error saving validation results:', updateError);
    }

    console.log(`[PolicyValidation] Validated ${lineItems.length} line items for claim ${claimId}: ${response.summary.warningCount} warnings, ${response.summary.infoCount} info`);

    return {
      success: true,
      response,
    };
  } catch (error) {
    console.error('[PolicyValidation] Error validating estimate:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// LINE ITEM VALIDATION
// ============================================

/**
 * Validate a single line item against the effective policy
 */
function validateLineItem(
  lineItem: EstimateLineItemRow,
  context: ValidationContext
): PolicyValidationResult[] {
  const results: PolicyValidationResult[] = [];
  const { effectivePolicy, roofAge } = context;
  const code = lineItem.line_item_code.toUpperCase();
  const description = lineItem.line_item_description.toUpperCase();

  // Rule 1: Check if item is a roofing item subject to schedule
  if (isRoofingItem(code, description)) {
    const roofingResults = validateRoofingItem(lineItem, effectivePolicy, roofAge);
    results.push(...roofingResults);
  }

  // Rule 2: Check for exclusions
  const exclusionResults = validateAgainstExclusions(lineItem, effectivePolicy);
  results.push(...exclusionResults);

  // Rule 3: Check for metal components with special rules
  if (isMetalComponent(code, description)) {
    const metalResults = validateMetalComponent(lineItem, effectivePolicy);
    results.push(...metalResults);
  }

  return results;
}

/**
 * Check if line item is a roofing item
 */
function isRoofingItem(code: string, description: string): boolean {
  const roofingKeywords = [
    'ROOF', 'SHINGLE', 'ASPHALT', 'CEDAR', 'SLATE', 'TILE',
    'FELT', 'UNDERLAYMENT', 'RIDGE', 'FLASHING', 'VALLEY',
    'DRIP EDGE', 'ICE DAM', 'STARTER', 'HIP', 'RAKE'
  ];

  // Check Xactimate category codes for roofing
  const roofingCategories = ['RFG', 'RFS', 'RFC', 'RFL'];
  const categoryPrefix = code.substring(0, 3).toUpperCase();

  if (roofingCategories.includes(categoryPrefix)) {
    return true;
  }

  return roofingKeywords.some(keyword =>
    description.includes(keyword) || code.includes(keyword)
  );
}

/**
 * Check if line item is a metal component
 */
function isMetalComponent(code: string, description: string): boolean {
  const metalKeywords = [
    'METAL', 'ALUMINUM', 'STEEL', 'COPPER', 'ZINC',
    'GUTTER', 'DOWNSPOUT', 'FASCIA', 'SOFFIT', 'SIDING',
    'TRIM', 'FLASHING'
  ];

  return metalKeywords.some(keyword =>
    description.includes(keyword) || code.includes(keyword)
  );
}

/**
 * Validate roofing items against schedule
 */
function validateRoofingItem(
  lineItem: EstimateLineItemRow,
  effectivePolicy: EffectivePolicy,
  roofAge?: number
): PolicyValidationResult[] {
  const results: PolicyValidationResult[] = [];
  const roofingSystem = effectivePolicy.lossSettlement?.roofingSystem;

  if (!roofingSystem?.applies) {
    return results;
  }

  // Check if scheduled depreciation applies
  if (roofingSystem.basis === 'SCHEDULED' && roofingSystem.ageBasedSchedule) {
    const schedule = roofingSystem.ageBasedSchedule;

    if (roofAge !== undefined) {
      // Find applicable schedule tier
      const tier = schedule.find(t => roofAge >= t.minAge && roofAge <= t.maxAge);

      if (tier && tier.paymentPercentage < 100) {
        results.push({
          id: uuidv4(),
          severity: 'warning',
          policyRule: 'Roofing Schedule Depreciation',
          ruleDescription: `Roof age (${roofAge} years) falls under scheduled depreciation`,
          sourceEndorsement: roofingSystem.sourceEndorsement,
          affectedLineItemIds: [lineItem.id],
          affectedLineItemCodes: [lineItem.line_item_code],
          recommendedAction: `This item is subject to ${tier.paymentPercentage}% of RCV payment per the roofing schedule. Document roof age and condition.`,
          context: {
            depreciationSchedule: {
              roofAge,
              depreciationPercentage: 100 - tier.paymentPercentage,
            },
          },
        });
      }
    } else {
      // Roof age unknown - flag for documentation
      results.push({
        id: uuidv4(),
        severity: 'info',
        policyRule: 'Roofing Schedule - Age Unknown',
        ruleDescription: 'Roofing schedule applies but roof age is not documented',
        sourceEndorsement: roofingSystem.sourceEndorsement,
        affectedLineItemIds: [lineItem.id],
        affectedLineItemCodes: [lineItem.line_item_code],
        recommendedAction: 'Document roof age to determine applicable schedule tier. Check declarations page or property records.',
        context: {
          documentationRequired: ['Roof installation date', 'Roof age verification'],
        },
      });
    }
  }

  // Check for ACV settlement
  if (roofingSystem.basis === 'ACV') {
    results.push({
      id: uuidv4(),
      severity: 'info',
      policyRule: 'ACV Roofing Settlement',
      ruleDescription: 'Roofing is settled on Actual Cash Value basis',
      sourceEndorsement: roofingSystem.sourceEndorsement,
      affectedLineItemIds: [lineItem.id],
      affectedLineItemCodes: [lineItem.line_item_code],
      recommendedAction: 'Apply appropriate depreciation to roofing line items per ACV settlement provisions.',
    });
  }

  return results;
}

/**
 * Validate metal components with special rules
 */
function validateMetalComponent(
  lineItem: EstimateLineItemRow,
  effectivePolicy: EffectivePolicy
): PolicyValidationResult[] {
  const results: PolicyValidationResult[] = [];
  const metalRule = effectivePolicy.lossSettlement?.roofingSystem?.metalComponentRule;

  if (!metalRule) {
    return results;
  }

  if (metalRule.coveredOnlyIf) {
    results.push({
      id: uuidv4(),
      severity: 'warning',
      policyRule: 'Metal Component Coverage Restriction',
      ruleDescription: `Metal components covered only if: ${metalRule.coveredOnlyIf}`,
      sourceEndorsement: effectivePolicy.lossSettlement?.roofingSystem?.sourceEndorsement,
      affectedLineItemIds: [lineItem.id],
      affectedLineItemCodes: [lineItem.line_item_code],
      recommendedAction: `Verify condition is met: "${metalRule.coveredOnlyIf}". Document evidence if claiming this item.`,
      context: {
        documentationRequired: ['Evidence of water intrusion', 'Photos of affected metal components'],
      },
    });
  }

  return results;
}

/**
 * Validate line item against policy exclusions
 */
function validateAgainstExclusions(
  lineItem: EstimateLineItemRow,
  effectivePolicy: EffectivePolicy
): PolicyValidationResult[] {
  const results: PolicyValidationResult[] = [];
  const description = lineItem.line_item_description.toUpperCase();

  // Check each exclusion
  for (const exclusion of effectivePolicy.exclusions) {
    const exclusionUpper = exclusion.toUpperCase();

    // Check for potential match between line item and exclusion
    const matchScore = calculateExclusionMatch(description, exclusionUpper);

    if (matchScore > 0.5) {
      results.push({
        id: uuidv4(),
        severity: 'warning',
        policyRule: 'Potential Policy Exclusion',
        ruleDescription: `Line item may be affected by exclusion: "${exclusion.substring(0, 100)}..."`,
        affectedLineItemIds: [lineItem.id],
        affectedLineItemCodes: [lineItem.line_item_code],
        recommendedAction: 'Review policy exclusion and verify this item is covered. Consider documenting coverage justification.',
        context: {
          exclusionReason: exclusion,
        },
      });
    }
  }

  return results;
}

/**
 * Calculate match score between line item and exclusion
 * Returns 0-1 based on keyword overlap
 */
function calculateExclusionMatch(description: string, exclusion: string): number {
  // Extract significant words (length > 3, not common words)
  const commonWords = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THAT', 'THIS', 'WILL',
    'ANY', 'ALL', 'NOT', 'ARE', 'WAS', 'WERE', 'BEEN', 'HAVE',
  ]);

  const descWords = new Set(
    description.split(/\s+/).filter(w => w.length > 3 && !commonWords.has(w))
  );

  const exclusionWords = exclusion
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.has(w));

  if (exclusionWords.length === 0) {
    return 0;
  }

  let matchCount = 0;
  for (const word of exclusionWords) {
    if (descWords.has(word)) {
      matchCount++;
    }
  }

  return matchCount / exclusionWords.length;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate roof age from installation date
 */
function calculateRoofAge(yearRoofInstall?: string): number | undefined {
  if (!yearRoofInstall) {
    return undefined;
  }

  // Try to parse year from various formats
  const yearMatch = yearRoofInstall.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const currentYear = new Date().getFullYear();
    return currentYear - year;
  }

  return undefined;
}

// ============================================
// RETRIEVAL FUNCTIONS
// ============================================

/**
 * Get validation results for a claim
 */
export async function getValidationResults(
  claimId: string,
  organizationId: string
): Promise<PolicyValidationResponse | null> {
  const { data: claim, error } = await supabaseAdmin
    .from('claims')
    .select('policy_validation_results')
    .eq('id', claimId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !claim?.policy_validation_results) {
    return null;
  }

  return claim.policy_validation_results as PolicyValidationResponse;
}

/**
 * Clear validation results for a claim
 * Called when estimate is significantly modified
 */
export async function clearValidationResults(
  claimId: string,
  organizationId: string
): Promise<void> {
  await supabaseAdmin
    .from('claims')
    .update({
      policy_validation_results: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId)
    .eq('organization_id', organizationId);
}
