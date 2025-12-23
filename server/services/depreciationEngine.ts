// Depreciation Engine for Claims IQ Sketch
// Calculates RCV, ACV, and recoverable depreciation

import { supabaseAdmin } from '../lib/supabaseAdmin';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface DepreciationInput {
  categoryCode: string;
  depreciationType: string | null;
  ageYears: number;
  condition: 'Good' | 'Average' | 'Poor';
  rcv: number;
}

export interface DepreciationResult {
  depreciationPct: number;
  depreciationAmount: number;
  acv: number;
  usefulLifeYears: number;
  isDepreciable: boolean;
  isRecoverable: boolean;
}

export interface CoverageSummary {
  coverageCode: string;
  subtotalRcv: number;
  taxAmount: number;
  overheadAmount: number;
  profitAmount: number;
  totalRcv: number;
  recoverableDepreciation: number;
  nonRecoverableDepreciation: number;
  totalDepreciation: number;
  totalAcv: number;
  deductible: number;
  netClaim: number;
}

export interface SettlementResult {
  coverageSummaries: CoverageSummary[];
  totals: {
    subtotalMaterials: number;
    subtotalLabor: number;
    subtotalEquipment: number;
    subtotalBeforeOp: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    totalRcv: number;
    totalDepreciation: number;
    totalAcv: number;
    recoverableDepreciation: number;
    nonRecoverableDepreciation: number;
    netClaimCovA: number;
    netClaimCovB: number;
    netClaimCovC: number;
    netClaimTotal: number;
  };
  meta: {
    tradesInvolved: string[];
    qualifiesForOp: boolean;
    opThreshold: number;
    opTradeMinimum: number;
  };
}

// ============================================
// DEPRECIATION CALCULATION
// ============================================

/**
 * Calculate depreciation for a single line item
 */
export async function calculateDepreciation(
  input: DepreciationInput
): Promise<DepreciationResult> {
  // Find matching depreciation schedule
  let schedule = null;

  if (input.depreciationType) {
    const { data, error } = await supabaseAdmin
      .from('depreciation_schedules')
      .select('*')
      .eq('category_code', input.categoryCode)
      .eq('item_type', input.depreciationType)
      .limit(1)
      .single();

    if (data && !error) {
      schedule = data;
    }
  }

  // If no specific schedule, try category default
  if (!schedule) {
    const { data, error } = await supabaseAdmin
      .from('depreciation_schedules')
      .select('*')
      .eq('category_code', input.categoryCode)
      .order('useful_life_years', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      schedule = data;
    }
  }

  // No depreciation if no schedule found or item is not depreciable
  if (!schedule || !schedule.is_depreciable || schedule.useful_life_years <= 0) {
    return {
      depreciationPct: 0,
      depreciationAmount: 0,
      acv: input.rcv,
      usefulLifeYears: 0,
      isDepreciable: false,
      isRecoverable: true
    };
  }

  const usefulLifeYears = schedule.useful_life_years;
  const maxDepPct = parseFloat(schedule.max_depreciation_pct || '80');

  // Calculate base depreciation (straight-line)
  let basePct = (input.ageYears / usefulLifeYears) * 100;

  // Apply condition adjustment
  let conditionFactor = 1.0;
  if (input.condition === 'Good') {
    conditionFactor = parseFloat(schedule.condition_adjustment_good || '0.85');
  } else if (input.condition === 'Poor') {
    conditionFactor = parseFloat(schedule.condition_adjustment_poor || '1.15');
  }

  let depreciationPct = basePct * conditionFactor;

  // Cap at maximum depreciation
  depreciationPct = Math.min(depreciationPct, maxDepPct);
  depreciationPct = Math.max(depreciationPct, 0); // Can't be negative

  // Calculate amounts
  const depreciationAmount = input.rcv * (depreciationPct / 100);
  const acv = input.rcv - depreciationAmount;

  return {
    depreciationPct: round(depreciationPct),
    depreciationAmount: round(depreciationAmount),
    acv: round(acv),
    usefulLifeYears,
    isDepreciable: true,
    isRecoverable: true // Most residential items are recoverable
  };
}

/**
 * Get tax rate for a region
 */
export async function getTaxRate(regionCode: string): Promise<number> {
  // Try exact region match first
  const { data, error } = await supabaseAdmin
    .from('tax_rates')
    .select('rate')
    .eq('region_code', regionCode)
    .eq('tax_type', 'material_sales')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data && !error) {
    return parseFloat(data.rate);
  }

  // Fall back to NATIONAL
  const { data: nationalData, error: nationalError } = await supabaseAdmin
    .from('tax_rates')
    .select('rate')
    .eq('region_code', 'NATIONAL')
    .eq('tax_type', 'material_sales')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (nationalData && !nationalError) {
    return parseFloat(nationalData.rate);
  }

  return 0.0625; // Default 6.25%
}

/**
 * Get regional multipliers
 */
export async function getRegionalMultipliers(regionCode: string): Promise<{
  material: number;
  labor: number;
  equipment: number;
}> {
  const { data, error } = await supabaseAdmin
    .from('regional_multipliers')
    .select('material_multiplier, labor_multiplier, equipment_multiplier')
    .eq('region_code', regionCode)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data && !error) {
    return {
      material: parseFloat(data.material_multiplier || '1.0'),
      labor: parseFloat(data.labor_multiplier || '1.0'),
      equipment: parseFloat(data.equipment_multiplier || '1.0')
    };
  }

  return { material: 1.0, labor: 1.0, equipment: 1.0 };
}

/**
 * Get carrier O&P rules
 */
export async function getCarrierOpRules(carrierProfileId: string | null): Promise<{
  overheadPct: number;
  profitPct: number;
  opThreshold: number;
  opTradeMinimum: number;
  taxOnMaterialsOnly: boolean;
  maxDepreciationPct: number;
}> {
  let data = null;
  let error = null;

  if (carrierProfileId) {
    const result = await supabaseAdmin
      .from('carrier_profiles')
      .select('overhead_pct, profit_pct, op_threshold, op_trade_minimum, tax_on_materials_only, max_depreciation_pct')
      .eq('id', carrierProfileId)
      .eq('is_active', true)
      .limit(1)
      .single();

    data = result.data;
    error = result.error;
  }

  if (!data) {
    // Fall back to DEFAULT profile
    const result = await supabaseAdmin
      .from('carrier_profiles')
      .select('overhead_pct, profit_pct, op_threshold, op_trade_minimum, tax_on_materials_only, max_depreciation_pct')
      .eq('code', 'DEFAULT')
      .eq('is_active', true)
      .limit(1)
      .single();

    data = result.data;
    error = result.error;
  }

  if (data && !error) {
    return {
      overheadPct: parseFloat(data.overhead_pct || '10'),
      profitPct: parseFloat(data.profit_pct || '10'),
      opThreshold: parseFloat(data.op_threshold || '0'),
      opTradeMinimum: parseInt(data.op_trade_minimum || '3'),
      taxOnMaterialsOnly: data.tax_on_materials_only !== false,
      maxDepreciationPct: parseFloat(data.max_depreciation_pct || '80')
    };
  }

  // Ultimate fallback
  return {
    overheadPct: 10,
    profitPct: 10,
    opThreshold: 0,
    opTradeMinimum: 3,
    taxOnMaterialsOnly: true,
    maxDepreciationPct: 80
  };
}

/**
 * Calculate settlement totals including O&P eligibility
 */
export function calculateSettlement(
  lineItems: Array<{
    coverageCode: string;
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    lineRcv: number;
    taxAmount: number;
    depreciationAmount: number;
    isRecoverable: boolean;
    tradeCode: string | null;
  }>,
  carrierRules: {
    overheadPct: number;
    profitPct: number;
    opThreshold: number;
    opTradeMinimum: number;
  },
  deductibles: {
    covA: number;
    covB: number;
    covC: number;
  }
): SettlementResult {
  // Count unique trades
  const trades = new Set<string>();
  for (const item of lineItems) {
    if (item.tradeCode) {
      trades.add(item.tradeCode);
    }
  }

  const tradesInvolved = Array.from(trades);

  // Aggregate by coverage
  const coverageMap = new Map<string, CoverageSummary>();

  // Calculate totals
  let subtotalMaterials = 0;
  let subtotalLabor = 0;
  let subtotalEquipment = 0;

  for (const item of lineItems) {
    subtotalMaterials += item.materialCost;
    subtotalLabor += item.laborCost;
    subtotalEquipment += item.equipmentCost;

    if (!coverageMap.has(item.coverageCode)) {
      coverageMap.set(item.coverageCode, {
        coverageCode: item.coverageCode,
        subtotalRcv: 0,
        taxAmount: 0,
        overheadAmount: 0,
        profitAmount: 0,
        totalRcv: 0,
        recoverableDepreciation: 0,
        nonRecoverableDepreciation: 0,
        totalDepreciation: 0,
        totalAcv: 0,
        deductible: 0,
        netClaim: 0
      });
    }

    const summary = coverageMap.get(item.coverageCode)!;
    summary.subtotalRcv += item.lineRcv;
    summary.taxAmount += item.taxAmount;

    if (item.isRecoverable) {
      summary.recoverableDepreciation += item.depreciationAmount;
    } else {
      summary.nonRecoverableDepreciation += item.depreciationAmount;
    }
    summary.totalDepreciation += item.depreciationAmount;
    summary.totalAcv += item.lineRcv + item.taxAmount - item.depreciationAmount;
  }

  // Check O&P eligibility
  const subtotalBeforeOp = Array.from(coverageMap.values())
    .reduce((sum, s) => sum + s.subtotalRcv + s.taxAmount, 0);

  const qualifiesForOp = tradesInvolved.length >= carrierRules.opTradeMinimum &&
    subtotalBeforeOp >= carrierRules.opThreshold;

  // Apply O&P to each coverage
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalTax = 0;

  for (const [code, summary] of coverageMap) {
    const baseForOp = summary.subtotalRcv + summary.taxAmount;

    if (qualifiesForOp) {
      summary.overheadAmount = round(baseForOp * (carrierRules.overheadPct / 100));
      summary.profitAmount = round(baseForOp * (carrierRules.profitPct / 100));
    }

    summary.totalRcv = round(baseForOp + summary.overheadAmount + summary.profitAmount);

    // Apply deductible
    if (code === 'A') {
      summary.deductible = deductibles.covA;
    } else if (code === 'B') {
      summary.deductible = deductibles.covB;
    } else if (code === 'C') {
      summary.deductible = deductibles.covC;
    }

    // Net claim = ACV - deductible (minimum 0)
    summary.netClaim = round(Math.max(0, summary.totalAcv - summary.deductible));

    totalOverhead += summary.overheadAmount;
    totalProfit += summary.profitAmount;
    totalTax += summary.taxAmount;
  }

  const coverageSummaries = Array.from(coverageMap.values());

  return {
    coverageSummaries,
    totals: {
      subtotalMaterials: round(subtotalMaterials),
      subtotalLabor: round(subtotalLabor),
      subtotalEquipment: round(subtotalEquipment),
      subtotalBeforeOp: round(subtotalBeforeOp),
      overheadAmount: round(totalOverhead),
      profitAmount: round(totalProfit),
      taxAmount: round(totalTax),
      totalRcv: round(coverageSummaries.reduce((s, c) => s + c.totalRcv, 0)),
      totalDepreciation: round(coverageSummaries.reduce((s, c) => s + c.totalDepreciation, 0)),
      totalAcv: round(coverageSummaries.reduce((s, c) => s + c.totalAcv, 0)),
      recoverableDepreciation: round(coverageSummaries.reduce((s, c) => s + c.recoverableDepreciation, 0)),
      nonRecoverableDepreciation: round(coverageSummaries.reduce((s, c) => s + c.nonRecoverableDepreciation, 0)),
      netClaimCovA: coverageSummaries.find(s => s.coverageCode === 'A')?.netClaim || 0,
      netClaimCovB: coverageSummaries.find(s => s.coverageCode === 'B')?.netClaim || 0,
      netClaimCovC: coverageSummaries.find(s => s.coverageCode === 'C')?.netClaim || 0,
      netClaimTotal: round(coverageSummaries.reduce((s, c) => s + c.netClaim, 0))
    },
    meta: {
      tradesInvolved,
      qualifiesForOp,
      opThreshold: carrierRules.opThreshold,
      opTradeMinimum: carrierRules.opTradeMinimum
    }
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
