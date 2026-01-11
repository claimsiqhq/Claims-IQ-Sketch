/**
 * Estimate Pricing Engine - Claims IQ Sketch
 *
 * Converts scope items (what work is needed) into priced estimates.
 * This is the bridge between the Scope Engine and the Estimate Calculator.
 *
 * DESIGN DECISIONS:
 * - Scope defines WHAT work is needed
 * - Pricing Engine attaches prices based on region, carrier, and line item catalog
 * - Supports labor/material split for transparency
 * - Calculates waste factors, minimums, and regional adjustments
 *
 * Flow: Scope Engine -> Pricing Engine -> Estimate Calculator -> Settlement
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  ScopeEvaluationResult,
  SuggestedLineItem,
  EstimateScopeResult,
} from './scopeEngine';
import {
  calculateMaterialCost,
  calculateLaborCost,
  calculateEquipmentCost,
} from './pricing';
import {
  getRegionalMultipliers,
  getTaxRate,
  getCarrierOpRules,
  calculateSettlement,
  type SettlementResult,
  type CoverageSummary,
} from './depreciationEngine';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Region-based price set configuration
 */
export interface RegionalPriceSet {
  regionId: string;
  regionName: string;
  materialMultiplier: number;
  laborMultiplier: number;
  equipmentMultiplier: number;
  taxRate: number;
  effectiveDate: Date;
}

/**
 * Line item unit price breakdown
 */
export interface UnitPriceBreakdown {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  wasteFactor: number;
  adjustedMaterial: number;
  adjustedLabor: number;
  adjustedEquipment: number;
  unitPrice: number;
  minimumCharge: number;
}

/**
 * A priced line item ready for estimate
 */
export interface PricedLineItem {
  // From scope
  lineItemCode: string;
  description: string;
  categoryId: string;
  unit: string;
  quantity: number;
  quantitySource: string;

  // Pricing breakdown
  unitPriceBreakdown: UnitPriceBreakdown;
  unitPrice: number;
  subtotal: number;

  // Totals by cost type
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;

  // Tax
  taxAmount: number;
  taxableAmount: number;

  // RCV (before depreciation)
  rcv: number;

  // Classification
  coverageCode: string;
  tradeCode: string | null;

  // Source info
  reasons: string[];
  isAutoAdded: boolean;
  zoneId?: string;
  zoneName?: string;

  // For depreciation (optional)
  ageYears?: number;
  condition?: 'Good' | 'Average' | 'Poor';
}

/**
 * Trade-level totals
 */
export interface TradeTotals {
  tradeCode: string;
  tradeName: string;
  lineItemCount: number;
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
  subtotal: number;
  taxAmount: number;
  rcv: number;
  opEligible: boolean;
}

/**
 * Estimate pricing configuration
 */
export interface EstimatePricingConfig {
  regionId: string;
  carrierProfileId?: string;
  overheadPct?: number;
  profitPct?: number;
  defaultAgeYears?: number;
  defaultCondition?: 'Good' | 'Average' | 'Poor';
  deductibles?: {
    covA?: number;
    covB?: number;
    covC?: number;
  };
}

/**
 * Complete priced estimate result
 */
export interface PricedEstimateResult {
  // Line items with pricing
  lineItems: PricedLineItem[];

  // Totals by trade
  tradeBreakdown: TradeTotals[];

  // Coverage breakdown
  coverageBreakdown: {
    coverageCode: string;
    lineItemCount: number;
    subtotal: number;
    taxAmount: number;
    rcv: number;
  }[];

  // Aggregate totals
  totals: {
    lineItemCount: number;
    subtotalMaterial: number;
    subtotalLabor: number;
    subtotalEquipment: number;
    subtotalBeforeTax: number;
    taxAmount: number;
    taxRate: number;
    subtotalAfterTax: number;
    wasteIncluded: number;
  };

  // O&P (if applicable)
  overheadAndProfit: {
    qualifiesForOp: boolean;
    tradesInvolved: string[];
    opThreshold: number;
    opTradeMinimum: number;
    overheadPct: number;
    profitPct: number;
    overheadAmount: number;
    profitAmount: number;
  };

  // RCV / ACV
  rcvTotal: number;

  // Configuration used
  config: {
    regionId: string;
    carrierProfileId?: string;
    calculatedAt: Date;
  };

  // Settlement (if carrier rules applied)
  settlement?: SettlementResult;
}

// ============================================
// MAIN API
// ============================================

/**
 * Price a single zone's scope result
 */
export async function priceScopeResult(
  scopeResult: ScopeEvaluationResult,
  config: EstimatePricingConfig
): Promise<PricedEstimateResult> {
  const pricedItems = await priceLineItems(scopeResult.suggestedItems, config, {
    zoneId: scopeResult.zoneId,
    zoneName: scopeResult.zoneName,
  });

  return buildPricedEstimate(pricedItems, config);
}

/**
 * Price an entire estimate's scope (multiple zones)
 */
export async function priceEstimateScope(
  estimateScopeResult: EstimateScopeResult,
  config: EstimatePricingConfig
): Promise<PricedEstimateResult> {
  const allPricedItems: PricedLineItem[] = [];

  for (const zoneResult of estimateScopeResult.zones) {
    const zonePricedItems = await priceLineItems(
      zoneResult.suggestedItems,
      config,
      {
        zoneId: zoneResult.zoneId,
        zoneName: zoneResult.zoneName,
      }
    );
    allPricedItems.push(...zonePricedItems);
  }

  return buildPricedEstimate(allPricedItems, config);
}

/**
 * Price a list of suggested line items from scope engine
 */
export async function priceLineItems(
  suggestedItems: SuggestedLineItem[],
  config: EstimatePricingConfig,
  zoneInfo?: { zoneId: string; zoneName: string }
): Promise<PricedLineItem[]> {
  const regionId = config.regionId || 'US-NATIONAL';

  // Get regional multipliers and tax rate
  const multipliers = await getRegionalMultipliers(regionId);
  const taxRate = await getTaxRate(regionId);

  // Get carrier rules for tax calculation
  const carrierRules = await getCarrierOpRules(config.carrierProfileId || null);

  // Fetch line item definitions for all codes
  const codes = suggestedItems.map((item) => item.lineItem.code);
  const lineItemDefs = await getLineItemDefinitions(codes);

  const pricedItems: PricedLineItem[] = [];

  for (const suggested of suggestedItems) {
    const def = lineItemDefs.get(suggested.lineItem.code);
    if (!def) {
      console.warn(`Line item ${suggested.lineItem.code} not found in catalog, skipping pricing`);
      continue;
    }

    const quantity = suggested.quantity.quantity;

    // Calculate base costs
    const materialCost = await calculateMaterialCost(def.material_components, regionId);
    const laborCost = await calculateLaborCost(def.labor_components, regionId);
    const equipmentCost = calculateEquipmentCost(def.equipment_components);

    // Get waste factor
    const wasteFactor = parseFloat(def.waste_factor || '1.0');

    // Apply waste to material only
    const adjustedMaterial = materialCost * wasteFactor * multipliers.material;
    const adjustedLabor = laborCost * multipliers.labor;
    const adjustedEquipment = equipmentCost * multipliers.equipment;

    const unitPrice = adjustedMaterial + adjustedLabor + adjustedEquipment;

    // Calculate totals
    let totalMaterial = adjustedMaterial * quantity;
    let totalLabor = adjustedLabor * quantity;
    let totalEquipment = adjustedEquipment * quantity;
    let subtotal = totalMaterial + totalLabor + totalEquipment;

    // Apply minimum charge
    const minimumCharge = parseFloat(def.minimum_charge || '0');
    if (subtotal < minimumCharge && minimumCharge > 0) {
      // Scale up proportionally to meet minimum
      const scaleFactor = minimumCharge / subtotal;
      totalMaterial *= scaleFactor;
      totalLabor *= scaleFactor;
      totalEquipment *= scaleFactor;
      subtotal = minimumCharge;
    }

    // Calculate tax (on materials only if carrier rules dictate)
    const taxableAmount = carrierRules.taxOnMaterialsOnly ? totalMaterial : subtotal;
    const taxAmount = round(taxableAmount * taxRate);

    // RCV = subtotal + tax (O&P added at settlement level)
    const rcv = subtotal + taxAmount;

    const pricedItem: PricedLineItem = {
      lineItemCode: suggested.lineItem.code,
      description: suggested.lineItem.description || def.description,
      categoryId: suggested.lineItem.categoryId || def.category_id,
      unit: suggested.lineItem.unit || def.unit,
      quantity,
      quantitySource: suggested.quantity.source,

      unitPriceBreakdown: {
        materialCost: round(materialCost),
        laborCost: round(laborCost),
        equipmentCost: round(equipmentCost),
        wasteFactor,
        adjustedMaterial: round(adjustedMaterial),
        adjustedLabor: round(adjustedLabor),
        adjustedEquipment: round(adjustedEquipment),
        unitPrice: round(unitPrice),
        minimumCharge,
      },
      unitPrice: round(unitPrice),
      subtotal: round(subtotal),

      totalMaterial: round(totalMaterial),
      totalLabor: round(totalLabor),
      totalEquipment: round(totalEquipment),

      taxAmount: round(taxAmount),
      taxableAmount: round(taxableAmount),
      rcv: round(rcv),

      coverageCode: def.default_coverage_code || 'A',
      tradeCode: def.trade_code || null,

      reasons: suggested.reasons.map((r) => r.description),
      isAutoAdded: suggested.isAutoAdded,
      zoneId: zoneInfo?.zoneId,
      zoneName: zoneInfo?.zoneName,

      ageYears: config.defaultAgeYears,
      condition: config.defaultCondition,
    };

    pricedItems.push(pricedItem);
  }

  return pricedItems;
}

/**
 * Build the complete priced estimate from priced line items
 */
async function buildPricedEstimate(
  pricedItems: PricedLineItem[],
  config: EstimatePricingConfig
): Promise<PricedEstimateResult> {
  const regionId = config.regionId || 'US-NATIONAL';
  const taxRate = await getTaxRate(regionId);
  const carrierRules = await getCarrierOpRules(config.carrierProfileId || null);

  // Calculate trade breakdown
  const tradeMap = new Map<string, TradeTotals>();
  const tradeNames = await getTradeNames();

  for (const item of pricedItems) {
    const tradeCode = item.tradeCode || 'GEN';
    if (!tradeMap.has(tradeCode)) {
      tradeMap.set(tradeCode, {
        tradeCode,
        tradeName: tradeNames.get(tradeCode) || tradeCode,
        lineItemCount: 0,
        totalMaterial: 0,
        totalLabor: 0,
        totalEquipment: 0,
        subtotal: 0,
        taxAmount: 0,
        rcv: 0,
        opEligible: true, // Will be determined by carrier rules
      });
    }
    const trade = tradeMap.get(tradeCode)!;
    trade.lineItemCount++;
    trade.totalMaterial += item.totalMaterial;
    trade.totalLabor += item.totalLabor;
    trade.totalEquipment += item.totalEquipment;
    trade.subtotal += item.subtotal;
    trade.taxAmount += item.taxAmount;
    trade.rcv += item.rcv;
  }

  const tradeBreakdown = Array.from(tradeMap.values()).map((t) => ({
    ...t,
    totalMaterial: round(t.totalMaterial),
    totalLabor: round(t.totalLabor),
    totalEquipment: round(t.totalEquipment),
    subtotal: round(t.subtotal),
    taxAmount: round(t.taxAmount),
    rcv: round(t.rcv),
  }));

  // Calculate coverage breakdown
  const coverageMap = new Map<string, { count: number; subtotal: number; tax: number; rcv: number }>();
  for (const item of pricedItems) {
    const code = item.coverageCode || 'A';
    if (!coverageMap.has(code)) {
      coverageMap.set(code, { count: 0, subtotal: 0, tax: 0, rcv: 0 });
    }
    const coverage = coverageMap.get(code)!;
    coverage.count++;
    coverage.subtotal += item.subtotal;
    coverage.tax += item.taxAmount;
    coverage.rcv += item.rcv;
  }

  const coverageBreakdown = Array.from(coverageMap.entries()).map(([code, data]) => ({
    coverageCode: code,
    lineItemCount: data.count,
    subtotal: round(data.subtotal),
    taxAmount: round(data.tax),
    rcv: round(data.rcv),
  }));

  // Calculate totals
  const subtotalMaterial = pricedItems.reduce((sum, i) => sum + i.totalMaterial, 0);
  const subtotalLabor = pricedItems.reduce((sum, i) => sum + i.totalLabor, 0);
  const subtotalEquipment = pricedItems.reduce((sum, i) => sum + i.totalEquipment, 0);
  const subtotalBeforeTax = subtotalMaterial + subtotalLabor + subtotalEquipment;
  const taxAmount = pricedItems.reduce((sum, i) => sum + i.taxAmount, 0);
  const subtotalAfterTax = subtotalBeforeTax + taxAmount;

  // Calculate waste included (difference between adjusted and base material)
  const wasteIncluded = pricedItems.reduce((sum, i) => {
    const waste = i.totalMaterial * (i.unitPriceBreakdown.wasteFactor - 1);
    return sum + waste;
  }, 0);

  // Determine O&P eligibility
  const tradesInvolved = Array.from(tradeMap.keys());
  const qualifiesForOp =
    tradesInvolved.length >= carrierRules.opTradeMinimum &&
    subtotalAfterTax >= carrierRules.opThreshold;

  const overheadPct = config.overheadPct ?? carrierRules.overheadPct;
  const profitPct = config.profitPct ?? carrierRules.profitPct;

  const overheadAmount = qualifiesForOp ? round(subtotalAfterTax * (overheadPct / 100)) : 0;
  const profitAmount = qualifiesForOp ? round(subtotalAfterTax * (profitPct / 100)) : 0;

  const rcvTotal = round(subtotalAfterTax + overheadAmount + profitAmount);

  // Build settlement if deductibles provided
  let settlement: SettlementResult | undefined;
  if (config.deductibles) {
    const settlementLineItems = pricedItems.map((item) => ({
      coverageCode: item.coverageCode,
      materialCost: item.totalMaterial,
      laborCost: item.totalLabor,
      equipmentCost: item.totalEquipment,
      lineRcv: item.subtotal,
      taxAmount: item.taxAmount,
      depreciationAmount: 0, // Will be calculated if depreciation is applied
      isRecoverable: true,
      tradeCode: item.tradeCode,
    }));

    settlement = calculateSettlement(
      settlementLineItems,
      {
        overheadPct,
        profitPct,
        opThreshold: carrierRules.opThreshold,
        opTradeMinimum: carrierRules.opTradeMinimum,
      },
      {
        covA: config.deductibles.covA || 0,
        covB: config.deductibles.covB || 0,
        covC: config.deductibles.covC || 0,
      }
    );
  }

  return {
    lineItems: pricedItems,
    tradeBreakdown,
    coverageBreakdown,
    totals: {
      lineItemCount: pricedItems.length,
      subtotalMaterial: round(subtotalMaterial),
      subtotalLabor: round(subtotalLabor),
      subtotalEquipment: round(subtotalEquipment),
      subtotalBeforeTax: round(subtotalBeforeTax),
      taxAmount: round(taxAmount),
      taxRate: round(taxRate * 100),
      subtotalAfterTax: round(subtotalAfterTax),
      wasteIncluded: round(wasteIncluded),
    },
    overheadAndProfit: {
      qualifiesForOp,
      tradesInvolved,
      opThreshold: carrierRules.opThreshold,
      opTradeMinimum: carrierRules.opTradeMinimum,
      overheadPct,
      profitPct,
      overheadAmount,
      profitAmount,
    },
    rcvTotal,
    config: {
      regionId,
      carrierProfileId: config.carrierProfileId,
      calculatedAt: new Date(),
    },
    settlement,
  };
}

// ============================================
// REGIONAL PRICE SETS
// ============================================

/**
 * Get available regional price sets
 */
export async function getRegionalPriceSets(): Promise<RegionalPriceSet[]> {
  const { data, error } = await supabaseAdmin
    .from('regions')
    .select('id, name, indices')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Failed to fetch regions:', error);
    return [];
  }

  const priceSets: RegionalPriceSet[] = [];

  for (const region of data || []) {
    const multipliers = await getRegionalMultipliers(region.id);
    const taxRate = await getTaxRate(region.id);

    priceSets.push({
      regionId: region.id,
      regionName: region.name,
      materialMultiplier: multipliers.material,
      laborMultiplier: multipliers.labor,
      equipmentMultiplier: multipliers.equipment,
      taxRate,
      effectiveDate: new Date(),
    });
  }

  return priceSets;
}

/**
 * Get a specific regional price set
 */
export async function getRegionalPriceSet(regionId: string): Promise<RegionalPriceSet | null> {
  const { data, error } = await supabaseAdmin
    .from('regions')
    .select('id, name, indices')
    .eq('id', regionId)
    .single();

  if (error || !data) {
    return null;
  }

  const multipliers = await getRegionalMultipliers(regionId);
  const taxRate = await getTaxRate(regionId);

  return {
    regionId: data.id,
    regionName: data.name,
    materialMultiplier: multipliers.material,
    laborMultiplier: multipliers.labor,
    equipmentMultiplier: multipliers.equipment,
    taxRate,
    effectiveDate: new Date(),
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Get line item definitions from catalog
 */
async function getLineItemDefinitions(
  codes: string[]
): Promise<Map<string, any>> {
  if (codes.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('line_items')
    .select(`
      code,
      description,
      category_id,
      unit,
      material_components,
      labor_components,
      equipment_components,
      waste_factor,
      minimum_charge,
      default_coverage_code,
      trade_code
    `)
    .in('code', codes)
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch line items:', error);
    return new Map();
  }

  return new Map((data || []).map((item) => [item.code, item]));
}

/**
 * Get trade names
 */
async function getTradeNames(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('scope_trades')
    .select('code, name')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch trades:', error);
    return new Map();
  }

  return new Map((data || []).map((t) => [t.code, t.name]));
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
