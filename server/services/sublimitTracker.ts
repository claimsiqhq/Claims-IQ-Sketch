/**
 * Sublimit Tracker Service
 *
 * Tracks scope accumulation against policy sublimits in real-time.
 * Validates claims against Coverage A, windstorm/hail limits, roof schedules, etc.
 *
 * Based on validation from Claim #1 and #3 showing sublimit violations.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

export interface SublimitAlert {
  limitExceeded: boolean;
  limitType: 'windstorm_hail' | 'roof_schedule' | 'coverage_a' | 'other_structures';
  limit: number;
  currentEstimate: number;
  overage: number;
  overagePercentage: number;
  warningThreshold: boolean;  // True if estimate > 60% of limit
  criticalThreshold: boolean;  // True if estimate > 90% of limit
  blocked: boolean;           // True if overage not allowed
  message: string;
}

/**
 * Check if current scope estimate exceeds policy sublimits
 *
 * @param claimId - Claim ID
 * @param currentEstimate - Current RCV estimate total
 * @param coverageType - Type of coverage to check
 * @returns Alert with limit status
 */
export async function checkSublimitStatus(
  claimId: string,
  currentEstimate: number,
  coverageType: 'windstorm_hail' | 'roof_schedule' | 'coverage_a' | 'other_structures' = 'windstorm_hail'
): Promise<SublimitAlert | null> {

  // Get effective policy data
  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('organization_id, effective_policy')
    .eq('id', claimId)
    .single();

  if (!claim?.effective_policy) return null;

  const policy = claim.effective_policy as Record<string, any>;

  // Extract relevant limit based on coverage type
  let limit: number | undefined;
  let limitLabel: string;

  switch (coverageType) {
    case 'windstorm_hail':
      // Check for Limited Loss Settlement endorsement
      const endorsements = policy.endorsements as Array<any> | undefined;
      const windstormLimit = endorsements?.find((e: any) =>
        e.formCode?.includes('LIMITED LOSS') ||
        e.category === 'loss_settlement'
      )?.impacts?.find((i: any) =>
        i.affectedCoverage === 'windstorm' || i.affectedCoverage === 'hail'
      )?.newLimit;

      limit = windstormLimit;
      limitLabel = 'Limited Loss Settlement for Windstorm/Hail';
      break;

    case 'coverage_a':
      limit = policy.coverages?.coverageA;
      limitLabel = 'Coverage A - Dwelling';
      break;

    case 'other_structures':
      limit = policy.coverages?.coverageB;
      limitLabel = 'Coverage B - Other Structures';
      break;

    case 'roof_schedule':
      // More complex - needs roof age and material
      // For now, return null (implement in phase 2)
      return null;
  }

  if (!limit || limit === 0) return null;

  const overage = currentEstimate - limit;
  const overagePercentage = (overage / limit) * 100;
  const utilizationPercentage = (currentEstimate / limit) * 100;

  const warningThreshold = utilizationPercentage >= 60;
  const criticalThreshold = utilizationPercentage >= 90;
  const limitExceeded = overage > 0;

  let message: string;

  if (limitExceeded) {
    message = `ALERT: Estimated damage $${currentEstimate.toLocaleString()} exceeds ${limitLabel} of $${limit.toLocaleString()}. Overage of $${overage.toLocaleString()} (${overagePercentage.toFixed(1)}%) will NOT be covered. Recommend reviewing additional coverage options with insured.`;
  } else if (criticalThreshold) {
    message = `WARNING: Estimated damage $${currentEstimate.toLocaleString()} is ${utilizationPercentage.toFixed(1)}% of ${limitLabel} ($${limit.toLocaleString()}). Approaching limit.`;
  } else if (warningThreshold) {
    message = `NOTICE: Estimated damage $${currentEstimate.toLocaleString()} is ${utilizationPercentage.toFixed(1)}% of ${limitLabel} ($${limit.toLocaleString()}).`;
  } else {
    message = `Estimate within limits: $${currentEstimate.toLocaleString()} of $${limit.toLocaleString()} ${limitLabel}.`;
  }

  return {
    limitExceeded,
    limitType: coverageType,
    limit,
    currentEstimate,
    overage: Math.max(0, overage),
    overagePercentage: Math.max(0, overagePercentage),
    warningThreshold,
    criticalThreshold,
    blocked: limitExceeded, // Block export if exceeded
    message
  };
}

/**
 * Get all sublimit alerts for a claim's current estimate
 */
export async function getAllSublimitAlerts(
  claimId: string,
  currentEstimate: number
): Promise<SublimitAlert[]> {
  const alerts: SublimitAlert[] = [];

  const types: ('windstorm_hail' | 'coverage_a' | 'other_structures')[] = [
    'windstorm_hail',
    'coverage_a',
    'other_structures'
  ];

  for (const type of types) {
    const alert = await checkSublimitStatus(claimId, currentEstimate, type);
    if (alert) alerts.push(alert);
  }

  return alerts.filter(a => a.warningThreshold || a.limitExceeded);
}
