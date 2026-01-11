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
 * Check if adding scope items will trigger labor minimum
 */
export async function checkLaborMinimum(
  claimId: string,
  tradeType: 'window' | 'electrical' | 'plumbing' | 'hvac',
  proposedItemCount: number = 1
): Promise<LaborMinimumWarning | null> {

  const minimum = LABOR_MINIMUMS[tradeType];
  if (!minimum) return null;

  // Get current scope item count for this trade
  // This would query scope_line_items table in real implementation
  const currentItemCount = 0; // Placeholder - would query from database

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
