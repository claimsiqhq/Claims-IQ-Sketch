/**
 * Claim Autofill Service
 *
 * Populates claim coverage fields from FNOL/Policy extraction data.
 *
 * Purpose:
 * - Autofill coverageA, coverageB, coverageC, coverageD, deductible, dwellingLimit
 * - Called after FNOL or policy documents are processed
 * - Uses FNOL extraction (claim.loss_context.policy_coverage.coverages) as primary source
 *
 * Rules:
 * - Parse numeric values from currency strings (strip $ and ,)
 * - dwellingLimit stored as formatted string (e.g., "$793,200")
 * - Other coverage fields stored as numbers
 * - Only update fields that are currently null/empty to avoid overwriting manual edits
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface AutofillResult {
  success: boolean;
  claimId: string;
  fieldsUpdated: string[];
  error?: string;
}

export interface CoverageData {
  coverageA?: number | null;
  coverageB?: number | null;
  coverageC?: number | null;
  coverageD?: number | null;
  deductible?: number | null;
  dwellingLimit?: string | null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse currency string to numeric value
 * Handles formats like:
 * - "$500,000"
 * - "500000"
 * - "$1,000.00"
 * - "Personal Property $187,900" (extracts the dollar amount)
 * - "Loss Of Use $94,000" (extracts the dollar amount)
 * Returns null if parsing fails or no dollar amount found
 */
export function parseCurrencyToNumber(value: string | null | undefined): number | null {
  if (!value) return null;

  // First, try to extract a dollar amount using regex
  // This handles cases like "Personal Property $187,900" or "$469,600"
  const dollarMatch = value.match(/\$[\d,]+(?:\.\d{2})?/);

  let amountStr: string;
  if (dollarMatch) {
    // Found a dollar amount - use it
    amountStr = dollarMatch[0];
  } else {
    // No dollar sign - check if it's a pure number
    amountStr = value;
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();

  // If it contains non-numeric chars (except decimal point), return null
  if (!/^[\d.]+$/.test(cleaned)) return null;

  // Parse the number
  const parsed = parseFloat(cleaned);

  // Return null if not a valid number
  if (isNaN(parsed) || !isFinite(parsed)) return null;

  // Return the parsed value (rounded to 2 decimal places for currency)
  return Math.round(parsed * 100) / 100;
}

/**
 * Parse deductible string, handling percentage values
 * Examples:
 * - "$2,348 (0%)" -> 2348
 * - "$4,696 (1%)" -> 4696
 * - "1%" -> null (percentage only, need dwelling limit to calculate)
 * - "$5,000" -> 5000
 */
export function parseDeductible(value: string | null | undefined, dwellingLimit?: number | null): number | null {
  if (!value) return null;

  // Try to extract dollar amount first
  const dollarMatch = value.match(/\$[\d,]+(?:\.\d{2})?/);
  if (dollarMatch) {
    return parseCurrencyToNumber(dollarMatch[0]);
  }

  // Check for percentage-only format (e.g., "1%")
  const percentMatch = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch && dwellingLimit) {
    const percentage = parseFloat(percentMatch[1]);
    return Math.round((dwellingLimit * percentage / 100) * 100) / 100;
  }

  // Try parsing as plain number
  return parseCurrencyToNumber(value);
}

/**
 * Format a number as a currency string (e.g., "$793,200")
 */
export function formatAsCurrency(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Extract coverage data from FNOL loss_context
 *
 * @param lossContext - The claim's loss_context JSONB containing FNOL extraction
 * @returns Parsed coverage data
 */
export function extractCoverageFromFNOL(lossContext: any): CoverageData {
  if (!lossContext) return {};

  const policyCoverage = lossContext.policy_coverage?.coverages || {};
  const policyInfo = lossContext.policy_information || {};

  // Extract coverage limits
  const coverageALimit = policyCoverage.coverage_a_dwelling?.limit;
  const coverageBScheduled = policyCoverage.coverage_b_scheduled_structures?.limit;
  const coverageBUnscheduled = policyCoverage.coverage_b_unscheduled_structures?.limit;
  const coverageCLimit = policyCoverage.coverage_c_personal_property?.limit;
  const coverageDLimit = policyCoverage.coverage_d_loss_of_use?.limit;

  // Parse coverage A to numeric
  const coverageANumeric = parseCurrencyToNumber(coverageALimit);

  // For coverage B, use scheduled if available, otherwise unscheduled
  // Or combine them if both exist (depends on policy structure)
  let coverageBNumeric: number | null = null;
  if (coverageBScheduled) {
    coverageBNumeric = parseCurrencyToNumber(coverageBScheduled);
  } else if (coverageBUnscheduled) {
    coverageBNumeric = parseCurrencyToNumber(coverageBUnscheduled);
  }

  // Parse other coverages
  const coverageCNumeric = parseCurrencyToNumber(coverageCLimit);
  const coverageDNumeric = parseCurrencyToNumber(coverageDLimit);

  // Parse deductible (using coverage A as base for percentage calculation)
  const deductibleValue = parseDeductible(
    policyInfo.deductibles?.policy_deductible,
    coverageANumeric
  );

  // Format dwelling limit as currency string
  const dwellingLimit = coverageANumeric ? formatAsCurrency(coverageANumeric) : null;

  return {
    coverageA: coverageANumeric,
    coverageB: coverageBNumeric,
    coverageC: coverageCNumeric,
    coverageD: coverageDNumeric,
    deductible: deductibleValue,
    dwellingLimit,
  };
}

/**
 * Autofill claim coverage fields from FNOL data
 *
 * This function updates the claims table with coverage values extracted from FNOL.
 * It only updates fields that are currently null/empty to avoid overwriting manual edits.
 *
 * @param claimId - The UUID of the claim to update
 * @param organizationId - The organization ID for security
 * @param forceUpdate - If true, overwrite existing values (default: false)
 * @returns AutofillResult indicating success and which fields were updated
 */
export async function autofillClaimCoverage(
  claimId: string,
  organizationId: string,
  forceUpdate: boolean = false
): Promise<AutofillResult> {
  try {
    // Fetch the claim with its loss_context
    const { data: claim, error: fetchError } = await supabaseAdmin
      .from('claims')
      .select('id, loss_context, coverage_a, coverage_b, coverage_c, coverage_d, deductible, dwelling_limit')
      .eq('id', claimId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchError || !claim) {
      return {
        success: false,
        claimId,
        fieldsUpdated: [],
        error: `Claim not found: ${fetchError?.message || 'No data'}`,
      };
    }

    // Extract coverage data from FNOL
    const coverageData = extractCoverageFromFNOL(claim.loss_context);

    // Build update object (only include fields that have data and need updating)
    const updates: Record<string, any> = {};
    const fieldsUpdated: string[] = [];

    // Helper to check if we should update a field
    const shouldUpdate = (existingValue: any, newValue: any): boolean => {
      if (forceUpdate) return newValue !== null && newValue !== undefined;
      return (existingValue === null || existingValue === undefined || existingValue === '') &&
             (newValue !== null && newValue !== undefined);
    };

    if (shouldUpdate(claim.coverage_a, coverageData.coverageA)) {
      updates.coverage_a = coverageData.coverageA;
      fieldsUpdated.push('coverageA');
    }

    if (shouldUpdate(claim.coverage_b, coverageData.coverageB)) {
      updates.coverage_b = coverageData.coverageB;
      fieldsUpdated.push('coverageB');
    }

    if (shouldUpdate(claim.coverage_c, coverageData.coverageC)) {
      updates.coverage_c = coverageData.coverageC;
      fieldsUpdated.push('coverageC');
    }

    if (shouldUpdate(claim.coverage_d, coverageData.coverageD)) {
      updates.coverage_d = coverageData.coverageD;
      fieldsUpdated.push('coverageD');
    }

    if (shouldUpdate(claim.deductible, coverageData.deductible)) {
      updates.deductible = coverageData.deductible;
      fieldsUpdated.push('deductible');
    }

    if (shouldUpdate(claim.dwelling_limit, coverageData.dwellingLimit)) {
      updates.dwelling_limit = coverageData.dwellingLimit;
      fieldsUpdated.push('dwellingLimit');
    }

    // If no updates needed, return early
    if (Object.keys(updates).length === 0) {
      console.log(`[ClaimAutofill] No updates needed for claim ${claimId} - all fields already populated`);
      return {
        success: true,
        claimId,
        fieldsUpdated: [],
      };
    }

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();

    // Perform the update
    const { error: updateError } = await supabaseAdmin
      .from('claims')
      .update(updates)
      .eq('id', claimId)
      .eq('organization_id', organizationId);

    if (updateError) {
      return {
        success: false,
        claimId,
        fieldsUpdated: [],
        error: `Failed to update claim: ${updateError.message}`,
      };
    }

    console.log(`[ClaimAutofill] Updated claim ${claimId} with fields: ${fieldsUpdated.join(', ')}`);

    return {
      success: true,
      claimId,
      fieldsUpdated,
    };
  } catch (error) {
    console.error(`[ClaimAutofill] Error autofilling claim ${claimId}:`, error);
    return {
      success: false,
      claimId,
      fieldsUpdated: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Autofill coverage for all claims in an organization that have FNOL data but missing coverage fields
 *
 * This is useful for backfilling existing claims.
 *
 * @param organizationId - The organization ID
 * @returns Array of AutofillResults for each claim processed
 */
export async function autofillAllClaimsCoverage(
  organizationId: string
): Promise<{ processed: number; updated: number; errors: number }> {
  // Find claims with loss_context but missing coverage data
  const { data: claims, error } = await supabaseAdmin
    .from('claims')
    .select('id')
    .eq('organization_id', organizationId)
    .not('loss_context', 'is', null)
    .or('coverage_a.is.null,coverage_b.is.null,coverage_c.is.null,coverage_d.is.null,deductible.is.null,dwelling_limit.is.null');

  if (error || !claims) {
    console.error('[ClaimAutofill] Error fetching claims for backfill:', error);
    return { processed: 0, updated: 0, errors: 1 };
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const claim of claims) {
    const result = await autofillClaimCoverage(claim.id, organizationId);
    processed++;

    if (result.success) {
      if (result.fieldsUpdated.length > 0) {
        updated++;
      }
    } else {
      errors++;
    }
  }

  console.log(`[ClaimAutofill] Backfill complete: ${processed} processed, ${updated} updated, ${errors} errors`);
  return { processed, updated, errors };
}
