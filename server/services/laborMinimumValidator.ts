/**
 * Labor Minimum Validator Service
 *
 * Validates scope items against labor minimum requirements.
 * Warns before adding single items that trigger costly minimums.
 *
 * Based on Claim #3 validation:
 * - Window labor minimum: $190.40
 * - Electrical labor minimum: $226.58
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'laborMinimumValidator' });

export interface LaborMinimumWarning {
  triggersMinimum: boolean;
  minimumType: 'window' | 'electrical' | 'plumbing' | 'hvac';
  minimumAmount: number;
  currentItemCount: number;
  proposedItemCount: number;
  suggestion: string;
}

/**
 * Labor minimum thresholds by trade
 */
const LABOR_MINIMUMS: Record<string, { threshold: number; amount: number }> = {
  window: { threshold: 1, amount: 190.40 },
  electrical: { threshold: 1, amount: 226.58 },
  plumbing: { threshold: 1, amount: 185.00 },
  hvac: { threshold: 1, amount: 275.00 }
};

/**
 * Get current scope item count for a specific trade from the database
 */
async function getCurrentItemCount(
  claimId: string,
  tradeCode: string
): Promise<number> {
  try {
    // First, get the estimate ID(s) for this claim
    const { data: estimates, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id')
      .eq('claim_id', claimId);

    if (estimateError) {
      log.error({ error: estimateError, claimId }, 'Error fetching estimates for claim');
      return 0;
    }

    if (!estimates || estimates.length === 0) {
      return 0;
    }

    const estimateIds = estimates.map(e => e.id);

    // Now count scope items for this trade across all estimates for the claim
    const { count, error: countError } = await supabaseAdmin
      .from('scope_items')
      .select('id', { count: 'exact', head: true })
      .in('estimate_id', estimateIds)
      .eq('trade_code', tradeCode);

    if (countError) {
      log.error({ error: countError, claimId, tradeCode }, 'Error counting scope items');
      return 0;
    }

    return count || 0;
  } catch (error) {
    log.error({ error, claimId, tradeCode }, 'Exception in getCurrentItemCount');
    return 0;
  }
}

/**
 * Check if adding scope items will trigger labor minimum
 */
export async function checkLaborMinimum(
  claimId: string,
  tradeType: 'window' | 'electrical' | 'plumbing' | 'hvac',
  proposedItemCount: number = 1
): Promise<LaborMinimumWarning | null> {

  const minimum = LABOR_MINIMUMS[tradeType];
  if (!minimum) return null;

  // Get current scope item count for this trade from the database
  const currentItemCount = await getCurrentItemCount(claimId, tradeType);

  const totalItems = currentItemCount + proposedItemCount;
  const triggersMinimum = totalItems > 0 && totalItems <= minimum.threshold;

  if (!triggersMinimum) return null;

  let suggestion: string;

  if (currentItemCount === 0 && proposedItemCount === 1) {
    suggestion = `Adding one ${tradeType} item will trigger $${minimum.amount.toFixed(2)} labor minimum. Consider documenting additional ${tradeType} work to justify trip charge.`;
  } else {
    suggestion = `Current scope has insufficient ${tradeType} work to justify labor minimum of $${minimum.amount.toFixed(2)}.`;
  }

  return {
    triggersMinimum: true,
    minimumType: tradeType,
    minimumAmount: minimum.amount,
    currentItemCount,
    proposedItemCount,
    suggestion
  };
}

/**
 * Validate all proposed scope items for labor minimums
 */
export async function validateScopeForLaborMinimums(
  claimId: string,
  proposedItems: Array<{ trade: string; description: string }>
): Promise<LaborMinimumWarning[]> {

  const warnings: LaborMinimumWarning[] = [];

  // Group items by trade
  const itemsByTrade = proposedItems.reduce((acc, item) => {
    const trade = classifyItemTrade(item.description);
    if (trade) {
      acc[trade] = (acc[trade] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Check each trade
  for (const [trade, count] of Object.entries(itemsByTrade)) {
    if (trade in LABOR_MINIMUMS) {
      const warning = await checkLaborMinimum(
        claimId,
        trade as 'window' | 'electrical' | 'plumbing' | 'hvac',
        count
      );
      if (warning) warnings.push(warning);
    }
  }

  return warnings;
}

/**
 * Classify scope item by trade based on description
 */
export function classifyItemTrade(description: string): string | null {
  const lower = description.toLowerCase();

  if (lower.includes('window') || lower.includes('glass') || lower.includes('pane')) return 'window';
  if (lower.includes('electrical') || lower.includes('fixture') || lower.includes('outlet') || lower.includes('switch') || lower.includes('wire')) return 'electrical';
  if (lower.includes('plumbing') || lower.includes('pipe') || lower.includes('faucet') || lower.includes('drain') || lower.includes('toilet')) return 'plumbing';
  if (lower.includes('hvac') || lower.includes('furnace') || lower.includes('ac') || lower.includes('air condition') || lower.includes('duct')) return 'hvac';

  return null;
}

/**
 * Get all labor minimum thresholds
 */
export function getLaborMinimumThresholds(): Record<string, { threshold: number; amount: number }> {
  return { ...LABOR_MINIMUMS };
}
