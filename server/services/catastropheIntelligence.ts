/**
 * Catastrophe Intelligence Service
 *
 * Analyzes historical claims from the same catastrophe event
 * to provide baseline damage patterns and typical scope.
 *
 * Based on validation from 60-claim dataset spanning 7 catastrophe events.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';

export interface CATIntelligence {
  catastropheNumber: string;
  historicalClaimCount: number;
  avgRoofSquares?: number;
  avgTotalRCV?: number;
  commonDamageTypes: string[];
  commonPerils: string[];
  suggestedBaselineScope?: string;
  stateBreakdown?: Record<string, number>;
}

/**
 * Extract catastrophe number from claim number
 * Format: "01-002-161543 (CAT-PCS2532-2532)" or similar
 */
export function extractCatastropheNumber(claimNumber: string): string | null {
  if (!claimNumber) return null;

  // Match CAT-XXX patterns
  const catMatch = claimNumber.match(/CAT-[A-Z0-9-]+/i);
  return catMatch ? catMatch[0].toUpperCase() : null;
}

/**
 * Get intelligence from historical claims in same CAT event
 */
export async function getCATIntelligence(
  catastropheNumber: string,
  organizationId: string
): Promise<CATIntelligence | null> {

  if (!catastropheNumber) return null;

  // Query historical claims with same CAT number
  const { data: historicalClaims } = await supabaseAdmin
    .from('claims')
    .select(`
      id,
      primary_peril,
      property_state,
      total_rcv,
      loss_context
    `)
    .eq('catastrophe_number', catastropheNumber)
    .eq('organization_id', organizationId)
    .not('loss_context', 'is', null)
    .limit(50);

  if (!historicalClaims || historicalClaims.length < 3) {
    // Need at least 3 claims for meaningful patterns
    return null;
  }

  // Extract patterns
  const perils = historicalClaims
    .map(c => c.primary_peril)
    .filter(Boolean) as string[];

  const commonPerils = [...new Set(perils)];

  // State breakdown
  const stateBreakdown: Record<string, number> = {};
  for (const claim of historicalClaims) {
    const state = claim.property_state;
    if (state) {
      stateBreakdown[state] = (stateBreakdown[state] || 0) + 1;
    }
  }

  // Calculate average RCV if available
  const rcvValues = historicalClaims
    .map(c => parseFloat(c.total_rcv || '0'))
    .filter(v => v > 0);

  const avgTotalRCV = rcvValues.length > 0
    ? Math.round(rcvValues.reduce((a, b) => a + b, 0) / rcvValues.length)
    : undefined;

  // Extract common damage types from loss context
  const damageTypes: string[] = [];
  for (const claim of historicalClaims) {
    const lossContext = claim.loss_context as Record<string, any> | null;
    if (lossContext?.property_damage_information?.roof_damage) {
      if (!damageTypes.includes('roof damage')) {
        damageTypes.push('roof damage');
      }
    }
    if (lossContext?.property_damage_information?.exterior_damages === 'Yes') {
      if (!damageTypes.includes('siding')) {
        damageTypes.push('siding');
      }
    }
  }

  // Add common damage types based on peril
  if (commonPerils.includes('wind_hail')) {
    if (!damageTypes.includes('gutters')) {
      damageTypes.push('gutters');
    }
  }

  // Build suggested baseline scope
  let suggestedBaselineScope = `Based on ${historicalClaims.length} previous claims in ${catastropheNumber}`;

  if (damageTypes.length > 0) {
    suggestedBaselineScope += `, typical damage includes ${damageTypes.join(', ')}`;
  }

  if (avgTotalRCV) {
    suggestedBaselineScope += `. Average claim RCV: $${avgTotalRCV.toLocaleString()}`;
  }

  suggestedBaselineScope += '.';

  return {
    catastropheNumber,
    historicalClaimCount: historicalClaims.length,
    avgTotalRCV,
    commonPerils,
    commonDamageTypes: damageTypes,
    suggestedBaselineScope,
    stateBreakdown,
  };
}

/**
 * Store catastrophe number for a claim
 */
export async function storeCatastropheNumber(
  claimId: string,
  catastropheNumber: string | null
): Promise<void> {
  if (!catastropheNumber) return;

  await supabaseAdmin
    .from('claims')
    .update({
      catastrophe_number: catastropheNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId);

  console.log(`[CAT Intelligence] Stored catastrophe number ${catastropheNumber} for claim ${claimId}`);
}
