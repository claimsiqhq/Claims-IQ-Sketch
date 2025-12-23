import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  calculateMaterialCost,
  calculateLaborCost,
  calculateEquipmentCost,
  calculateBasePrice
} from './pricing';
import {
  calculateDepreciation,
  getTaxRate,
  getRegionalMultipliers,
  getCarrierOpRules,
  calculateSettlement,
  type DepreciationResult,
  type CoverageSummary,
  type SettlementResult
} from './depreciationEngine';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface EstimateLineItemInput {
  lineItemCode: string;
  quantity: number;
  notes?: string;
  roomName?: string;
  damageZoneId?: string;
  coverageCode?: string;  // A, B, C, D override
  ageYears?: number;      // Age of item for depreciation
  condition?: 'Good' | 'Average' | 'Poor';
}

export interface EstimateCalculationInput {
  claimId?: string;
  claimNumber?: string;
  propertyAddress?: string;
  lineItems: EstimateLineItemInput[];
  regionId?: string;
  carrierProfileId?: string;
  overheadPct?: number;
  profitPct?: number;
  deductibles?: {
    covA?: number;
    covB?: number;
    covC?: number;
  };
  defaultAgeYears?: number;
  defaultCondition?: 'Good' | 'Average' | 'Poor';
}

export interface CalculatedLineItem {
  code: string;
  description: string;
  categoryId: string;
  unit: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  rcv: number;
  coverageCode: string;
  tradeCode: string | null;
  depreciationType: string | null;
  ageYears: number;
  condition: 'Good' | 'Average' | 'Poor';
  depreciation: DepreciationResult;
  acv: number;
  notes?: string;
  roomName?: string;
  damageZoneId?: string;
  xactimateCode?: string;
}

export interface EstimateCalculationResult {
  lineItems: CalculatedLineItem[];
  subtotal: number;
  overheadAmount: number;
  overheadPct: number;
  profitAmount: number;
  profitPct: number;
  taxAmount: number;
  taxPct: number;
  grandTotal: number;
  regionId: string;
  carrierProfileId?: string;
  lineItemCount: number;
  categoryBreakdown: Record<string, { count: number; subtotal: number }>;
  // Settlement and depreciation data
  settlement: SettlementResult;
  coverageSummaries: CoverageSummary[];
  totals: {
    subtotalMaterials: number;
    subtotalLabor: number;
    subtotalEquipment: number;
    totalRcv: number;
    totalDepreciation: number;
    totalAcv: number;
    recoverableDepreciation: number;
    nonRecoverableDepreciation: number;
    netClaimTotal: number;
  };
}

export interface SavedEstimate extends EstimateCalculationResult {
  id: string;
  claimId?: string;
  claimNumber?: string;
  propertyAddress?: string;
  status: string;
  version: number;
  createdAt: Date;
}

// ============================================
// ESTIMATE CALCULATION
// ============================================

export async function calculateEstimate(
  input: EstimateCalculationInput
): Promise<EstimateCalculationResult> {
  const regionId = input.regionId || 'US-NATIONAL';

  // Get regional multipliers and tax rate
  const regionalMultipliers = await getRegionalMultipliers(regionId);
  const taxRate = await getTaxRate(regionId);

  // Get carrier O&P rules
  const carrierRules = await getCarrierOpRules(input.carrierProfileId || null);

  // Fetch carrier profile if provided (for backward compatibility)
  let carrierProfile = null;
  if (input.carrierProfileId) {
    const { data: carrierData, error: carrierError } = await supabaseAdmin
      .from('carrier_profiles')
      .select('*')
      .eq('id', input.carrierProfileId)
      .eq('is_active', true)
      .single();

    if (!carrierError && carrierData) {
      carrierProfile = carrierData;
    }
  }

  // Fetch all line item definitions for the codes provided
  const lineItemCodes = input.lineItems.map(li => li.lineItemCode);
  const { data: lineItemsData, error: lineItemsError } = await supabaseAdmin
    .from('line_items')
    .select('*')
    .in('code', lineItemCodes)
    .eq('is_active', true);

  if (lineItemsError) {
    throw new Error(`Failed to fetch line items: ${lineItemsError.message}`);
  }

  const lineItemMap = new Map(
    (lineItemsData || []).map((li: any) => [li.code, li])
  );

  // Default age and condition
  const defaultAge = input.defaultAgeYears ?? 5;
  const defaultCondition = input.defaultCondition ?? 'Average';

  // Calculate each line item with depreciation
  const calculatedItems: CalculatedLineItem[] = [];
  const categoryBreakdown: Record<string, { count: number; subtotal: number }> = {};

  for (const inputItem of input.lineItems) {
    const def = lineItemMap.get(inputItem.lineItemCode);
    if (!def) {
      console.warn(`Line item ${inputItem.lineItemCode} not found, skipping`);
      continue;
    }

    const quantity = inputItem.quantity;
    const ageYears = inputItem.ageYears ?? defaultAge;
    const condition = inputItem.condition ?? defaultCondition;
    const coverageCode = inputItem.coverageCode ?? def.default_coverage_code ?? 'A';
    const tradeCode = def.trade_code || null;
    const depreciationType = def.depreciation_type || null;

    // Calculate costs using existing pricing functions
    let materialCost = await calculateMaterialCost(
      def.material_components,
      regionId
    );
    const laborCost = await calculateLaborCost(
      def.labor_components,
      regionId
    );
    const equipmentCost = calculateEquipmentCost(def.equipment_components);

    // Apply waste factor to materials
    const wasteFactor = parseFloat(def.waste_factor || '1.0');
    materialCost *= wasteFactor;

    // Apply regional multipliers
    const adjustedMaterial = materialCost * regionalMultipliers.material;
    const adjustedLabor = laborCost * regionalMultipliers.labor;
    const adjustedEquipment = equipmentCost * regionalMultipliers.equipment;

    // Calculate totals for this quantity
    const totalMaterial = adjustedMaterial * quantity;
    const totalLabor = adjustedLabor * quantity;
    const totalEquipment = adjustedEquipment * quantity;
    const unitPrice = adjustedMaterial + adjustedLabor + adjustedEquipment;
    let subtotal = totalMaterial + totalLabor + totalEquipment;

    // Apply minimum charge
    const minCharge = parseFloat(def.minimum_charge || '0');
    if (subtotal < minCharge) {
      subtotal = minCharge;
    }

    // Calculate tax on materials
    const taxAmount = carrierRules.taxOnMaterialsOnly
      ? totalMaterial * taxRate
      : subtotal * taxRate;

    // RCV = subtotal + tax (O&P added at settlement level)
    const rcv = subtotal;

    // Calculate depreciation
    const depreciation = await calculateDepreciation({
      categoryCode: def.category_id.split('.')[0],
      depreciationType,
      ageYears,
      condition,
      rcv: rcv + taxAmount
    });

    const calculatedItem: CalculatedLineItem = {
      code: def.code,
      description: def.description,
      categoryId: def.category_id,
      unit: def.unit,
      quantity,
      materialCost: round(totalMaterial),
      laborCost: round(totalLabor),
      equipmentCost: round(totalEquipment),
      unitPrice: round(unitPrice),
      subtotal: round(subtotal),
      taxAmount: round(taxAmount),
      rcv: round(rcv + taxAmount),
      coverageCode,
      tradeCode,
      depreciationType,
      ageYears,
      condition,
      depreciation,
      acv: depreciation.acv,
      notes: inputItem.notes,
      roomName: inputItem.roomName,
      damageZoneId: inputItem.damageZoneId,
      xactimateCode: def.xactimate_code || undefined,
    };

    calculatedItems.push(calculatedItem);

    // Update category breakdown
    const categoryId = def.category_id.split('.')[0];
    if (!categoryBreakdown[categoryId]) {
      categoryBreakdown[categoryId] = { count: 0, subtotal: 0 };
    }
    categoryBreakdown[categoryId].count++;
    categoryBreakdown[categoryId].subtotal += calculatedItem.subtotal;
  }

  // Prepare line items for settlement calculation
  const settlementLineItems = calculatedItems.map(item => ({
    coverageCode: item.coverageCode,
    materialCost: item.materialCost,
    laborCost: item.laborCost,
    equipmentCost: item.equipmentCost,
    lineRcv: item.subtotal,
    taxAmount: item.taxAmount,
    depreciationAmount: item.depreciation.depreciationAmount,
    isRecoverable: item.depreciation.isRecoverable,
    tradeCode: item.tradeCode,
  }));

  // Calculate settlement with O&P eligibility
  const settlement = calculateSettlement(
    settlementLineItems,
    {
      overheadPct: input.overheadPct ?? carrierRules.overheadPct,
      profitPct: input.profitPct ?? carrierRules.profitPct,
      opThreshold: carrierRules.opThreshold,
      opTradeMinimum: carrierRules.opTradeMinimum,
    },
    {
      covA: input.deductibles?.covA ?? 0,
      covB: input.deductibles?.covB ?? 0,
      covC: input.deductibles?.covC ?? 0,
    }
  );

  // Calculate totals
  const subtotal = calculatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalTax = calculatedItems.reduce((sum, item) => sum + item.taxAmount, 0);

  // Get O&P percentages from settlement
  const overheadPct = input.overheadPct ?? carrierRules.overheadPct;
  const profitPct = input.profitPct ?? carrierRules.profitPct;

  return {
    lineItems: calculatedItems,
    subtotal: round(subtotal),
    overheadAmount: settlement.totals.overheadAmount,
    overheadPct,
    profitAmount: settlement.totals.profitAmount,
    profitPct,
    taxAmount: round(totalTax),
    taxPct: round(taxRate * 100),
    grandTotal: settlement.totals.totalRcv,
    regionId,
    carrierProfileId: input.carrierProfileId,
    lineItemCount: calculatedItems.length,
    categoryBreakdown,
    settlement,
    coverageSummaries: settlement.coverageSummaries,
    totals: {
      subtotalMaterials: settlement.totals.subtotalMaterials,
      subtotalLabor: settlement.totals.subtotalLabor,
      subtotalEquipment: settlement.totals.subtotalEquipment,
      totalRcv: settlement.totals.totalRcv,
      totalDepreciation: settlement.totals.totalDepreciation,
      totalAcv: settlement.totals.totalAcv,
      recoverableDepreciation: settlement.totals.recoverableDepreciation,
      nonRecoverableDepreciation: settlement.totals.nonRecoverableDepreciation,
      netClaimTotal: settlement.totals.netClaimTotal,
    },
  };
}

// ============================================
// SAVE ESTIMATE
// ============================================

export async function saveEstimate(
  input: EstimateCalculationInput,
  calculation: EstimateCalculationResult
): Promise<SavedEstimate> {
  // Create estimate record
  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .insert({
      claim_id: input.claimId || null,
      claim_number: input.claimNumber || null,
      property_address: input.propertyAddress || null,
      status: 'draft',
      version: 1,
      subtotal: calculation.subtotal,
      overhead_amount: calculation.overheadAmount,
      overhead_pct: calculation.overheadPct,
      profit_amount: calculation.profitAmount,
      profit_pct: calculation.profitPct,
      tax_amount: calculation.taxAmount,
      tax_pct: calculation.taxPct,
      grand_total: calculation.grandTotal,
      region_id: calculation.regionId,
      carrier_profile_id: calculation.carrierProfileId || null,
    })
    .select('*')
    .single();

  if (estimateError || !estimate) {
    throw new Error(`Failed to create estimate: ${estimateError?.message}`);
  }

  // Insert line items with depreciation data
  const lineItemsToInsert = calculation.lineItems.map((item, i) => ({
    estimate_id: estimate.id,
    line_item_code: item.code,
    line_item_description: item.description,
    category_id: item.categoryId,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unitPrice,
    material_cost: item.materialCost,
    labor_cost: item.laborCost,
    equipment_cost: item.equipmentCost,
    subtotal: item.subtotal,
    tax_amount: item.taxAmount,
    rcv: item.rcv,
    acv: item.acv,
    coverage_code: item.coverageCode,
    trade_code: item.tradeCode,
    depreciation_type: item.depreciationType,
    age_years: item.ageYears,
    condition: item.condition,
    depreciation_pct: item.depreciation.depreciationPct,
    depreciation_amount: item.depreciation.depreciationAmount,
    useful_life_years: item.depreciation.usefulLifeYears,
    is_depreciable: item.depreciation.isDepreciable,
    is_recoverable: item.depreciation.isRecoverable,
    xactimate_code: item.xactimateCode || null,
    source: 'manual',
    room_name: item.roomName || null,
    damage_zone_id: item.damageZoneId || null,
    notes: item.notes || null,
    sort_order: i,
  }));

  if (lineItemsToInsert.length > 0) {
    const { error: lineItemsError } = await supabaseAdmin
      .from('estimate_line_items')
      .insert(lineItemsToInsert);

    if (lineItemsError) {
      throw new Error(`Failed to insert line items: ${lineItemsError.message}`);
    }
  }

  // Insert coverage summaries
  const coverageSummariesToInsert = calculation.coverageSummaries.map(coverage => ({
    estimate_id: estimate.id,
    coverage_code: coverage.coverageCode,
    subtotal_rcv: coverage.subtotalRcv,
    tax_amount: coverage.taxAmount,
    overhead_amount: coverage.overheadAmount,
    profit_amount: coverage.profitAmount,
    total_rcv: coverage.totalRcv,
    recoverable_depreciation: coverage.recoverableDepreciation,
    non_recoverable_depreciation: coverage.nonRecoverableDepreciation,
    total_depreciation: coverage.totalDepreciation,
    total_acv: coverage.totalAcv,
    deductible: coverage.deductible,
    net_claim: coverage.netClaim,
  }));

  if (coverageSummariesToInsert.length > 0) {
    const { error: coverageError } = await supabaseAdmin
      .from('estimate_coverage_summary')
      .insert(coverageSummariesToInsert);

    if (coverageError) {
      throw new Error(`Failed to insert coverage summaries: ${coverageError.message}`);
    }
  }

  return {
    id: estimate.id,
    claimId: estimate.claim_id,
    claimNumber: estimate.claim_number,
    propertyAddress: estimate.property_address,
    status: estimate.status,
    version: estimate.version,
    createdAt: estimate.created_at,
    ...calculation,
  };
}

// ============================================
// GET ESTIMATE
// ============================================

export async function getEstimate(estimateId: string): Promise<SavedEstimate | null> {
  // Get estimate
  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimate) {
    return null;
  }

  // Get line items with depreciation data
  const { data: lineItemsData, error: lineItemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order');

  if (lineItemsError) {
    throw new Error(`Failed to fetch line items: ${lineItemsError.message}`);
  }

  const lineItems: CalculatedLineItem[] = (lineItemsData || []).map((row: any) => {
      const subtotal = parseFloat(row.subtotal || '0');
      const taxAmount = parseFloat(row.tax_amount || '0');
      const depreciationPct = parseFloat(row.depreciation_pct || '0');
      const depreciationAmount = parseFloat(row.depreciation_amount || '0');
      const rcv = parseFloat(row.rcv || subtotal);
      const acv = parseFloat(row.acv || (rcv - depreciationAmount));

      return {
        code: row.line_item_code,
        description: row.line_item_description,
        categoryId: row.category_id,
        unit: row.unit,
        quantity: parseFloat(row.quantity),
        materialCost: parseFloat(row.material_cost || '0'),
        laborCost: parseFloat(row.labor_cost || '0'),
        equipmentCost: parseFloat(row.equipment_cost || '0'),
        unitPrice: parseFloat(row.unit_price || '0'),
        subtotal,
        taxAmount,
        rcv,
        coverageCode: row.coverage_code || 'A',
        tradeCode: row.trade_code || null,
        depreciationType: row.depreciation_type || null,
        ageYears: parseInt(row.age_years || '5'),
        condition: row.condition || 'Average',
        depreciation: {
          depreciationPct,
          depreciationAmount,
          acv,
          usefulLifeYears: parseInt(row.useful_life_years || '0'),
          isDepreciable: row.is_depreciable !== false,
          isRecoverable: row.is_recoverable !== false,
        },
        acv,
        notes: row.notes,
        roomName: row.room_name,
        damageZoneId: row.damage_zone_id,
        xactimateCode: row.xactimate_code || undefined,
      };
    });

  // Get coverage summaries
  const { data: coverageData, error: coverageError } = await supabaseAdmin
    .from('estimate_coverage_summary')
    .select('*')
    .eq('estimate_id', estimateId);

  if (coverageError) {
    throw new Error(`Failed to fetch coverage summaries: ${coverageError.message}`);
  }

  const coverageSummaries: CoverageSummary[] = (coverageData || []).map((row: any) => ({
    coverageCode: row.coverage_code,
    subtotalRcv: parseFloat(row.subtotal_rcv || '0'),
    taxAmount: parseFloat(row.tax_amount || '0'),
    overheadAmount: parseFloat(row.overhead_amount || '0'),
    profitAmount: parseFloat(row.profit_amount || '0'),
    totalRcv: parseFloat(row.total_rcv || '0'),
    recoverableDepreciation: parseFloat(row.recoverable_depreciation || '0'),
    nonRecoverableDepreciation: parseFloat(row.non_recoverable_depreciation || '0'),
    totalDepreciation: parseFloat(row.total_depreciation || '0'),
    totalAcv: parseFloat(row.total_acv || '0'),
    deductible: parseFloat(row.deductible || '0'),
    netClaim: parseFloat(row.net_claim || '0'),
  }));

  // Calculate category breakdown
  const categoryBreakdown: Record<string, { count: number; subtotal: number }> = {};
  for (const item of lineItems) {
    const categoryId = item.categoryId.split('.')[0];
    if (!categoryBreakdown[categoryId]) {
      categoryBreakdown[categoryId] = { count: 0, subtotal: 0 };
    }
    categoryBreakdown[categoryId].count++;
    categoryBreakdown[categoryId].subtotal += item.subtotal;
  }

  // Build settlement result
  const trades = new Set<string>();
  lineItems.forEach(item => {
    if (item.tradeCode) trades.add(item.tradeCode);
  });

  const settlement: SettlementResult = {
    coverageSummaries,
    totals: {
      subtotalMaterials: lineItems.reduce((s, i) => s + i.materialCost, 0),
      subtotalLabor: lineItems.reduce((s, i) => s + i.laborCost, 0),
      subtotalEquipment: lineItems.reduce((s, i) => s + i.equipmentCost, 0),
      subtotalBeforeOp: lineItems.reduce((s, i) => s + i.subtotal + i.taxAmount, 0),
      overheadAmount: parseFloat(estimate.overhead_amount || '0'),
      profitAmount: parseFloat(estimate.profit_amount || '0'),
      taxAmount: parseFloat(estimate.tax_amount || '0'),
      totalRcv: parseFloat(estimate.grand_total || '0'),
      totalDepreciation: coverageSummaries.reduce((s, c) => s + c.totalDepreciation, 0),
      totalAcv: coverageSummaries.reduce((s, c) => s + c.totalAcv, 0),
      recoverableDepreciation: coverageSummaries.reduce((s, c) => s + c.recoverableDepreciation, 0),
      nonRecoverableDepreciation: coverageSummaries.reduce((s, c) => s + c.nonRecoverableDepreciation, 0),
      netClaimCovA: coverageSummaries.find(c => c.coverageCode === 'A')?.netClaim || 0,
      netClaimCovB: coverageSummaries.find(c => c.coverageCode === 'B')?.netClaim || 0,
      netClaimCovC: coverageSummaries.find(c => c.coverageCode === 'C')?.netClaim || 0,
      netClaimTotal: coverageSummaries.reduce((s, c) => s + c.netClaim, 0),
    },
    meta: {
      tradesInvolved: Array.from(trades),
      qualifiesForOp: parseFloat(estimate.overhead_amount || '0') > 0,
      opThreshold: 0,
      opTradeMinimum: 3,
    },
  };

  return {
    id: estimate.id,
    claimId: estimate.claim_id,
    claimNumber: estimate.claim_number,
    propertyAddress: estimate.property_address,
    status: estimate.status,
    version: estimate.version,
    createdAt: estimate.created_at,
    lineItems,
    subtotal: parseFloat(estimate.subtotal || '0'),
    overheadAmount: parseFloat(estimate.overhead_amount || '0'),
    overheadPct: parseFloat(estimate.overhead_pct || '10'),
    profitAmount: parseFloat(estimate.profit_amount || '0'),
    profitPct: parseFloat(estimate.profit_pct || '10'),
    taxAmount: parseFloat(estimate.tax_amount || '0'),
    taxPct: parseFloat(estimate.tax_pct || '0'),
    grandTotal: parseFloat(estimate.grand_total || '0'),
    regionId: estimate.region_id || 'US-NATIONAL',
    carrierProfileId: estimate.carrier_profile_id,
    lineItemCount: lineItems.length,
    categoryBreakdown,
    settlement,
    coverageSummaries,
    totals: {
      subtotalMaterials: settlement.totals.subtotalMaterials,
      subtotalLabor: settlement.totals.subtotalLabor,
      subtotalEquipment: settlement.totals.subtotalEquipment,
      totalRcv: settlement.totals.totalRcv,
      totalDepreciation: settlement.totals.totalDepreciation,
      totalAcv: settlement.totals.totalAcv,
      recoverableDepreciation: settlement.totals.recoverableDepreciation,
      nonRecoverableDepreciation: settlement.totals.nonRecoverableDepreciation,
      netClaimTotal: settlement.totals.netClaimTotal,
    },
  };
}

// ============================================
// UPDATE ESTIMATE
// ============================================

export async function updateEstimate(
  estimateId: string,
  input: EstimateCalculationInput
): Promise<SavedEstimate> {
  // Get current estimate to check version
  const { data: currentEstimate, error: currentError } = await supabaseAdmin
    .from('estimates')
    .select('version')
    .eq('id', estimateId)
    .single();

  if (currentError || !currentEstimate) {
    throw new Error('Estimate not found');
  }

  const newVersion = currentEstimate.version + 1;

  // Calculate new totals
  const calculation = await calculateEstimate(input);

  // Update estimate
  const { error: updateError } = await supabaseAdmin
    .from('estimates')
    .update({
      claim_id: input.claimId || null,
      claim_number: input.claimNumber || null,
      property_address: input.propertyAddress || null,
      version: newVersion,
      updated_at: new Date().toISOString(),
      subtotal: calculation.subtotal,
      overhead_amount: calculation.overheadAmount,
      overhead_pct: calculation.overheadPct,
      profit_amount: calculation.profitAmount,
      profit_pct: calculation.profitPct,
      tax_amount: calculation.taxAmount,
      tax_pct: calculation.taxPct,
      grand_total: calculation.grandTotal,
      region_id: calculation.regionId,
      carrier_profile_id: calculation.carrierProfileId || null,
    })
    .eq('id', estimateId);

  if (updateError) {
    throw new Error(`Failed to update estimate: ${updateError.message}`);
  }

  // Delete existing line items and coverage summaries
  const { error: deleteItemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .delete()
    .eq('estimate_id', estimateId);

  if (deleteItemsError) {
    throw new Error(`Failed to delete line items: ${deleteItemsError.message}`);
  }

  const { error: deleteCoverageError } = await supabaseAdmin
    .from('estimate_coverage_summary')
    .delete()
    .eq('estimate_id', estimateId);

  if (deleteCoverageError) {
    throw new Error(`Failed to delete coverage summaries: ${deleteCoverageError.message}`);
  }

  // Insert new line items with depreciation data
  const lineItemsToInsert = calculation.lineItems.map((item, i) => ({
    estimate_id: estimateId,
    line_item_code: item.code,
    line_item_description: item.description,
    category_id: item.categoryId,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unitPrice,
    material_cost: item.materialCost,
    labor_cost: item.laborCost,
    equipment_cost: item.equipmentCost,
    subtotal: item.subtotal,
    tax_amount: item.taxAmount,
    rcv: item.rcv,
    acv: item.acv,
    coverage_code: item.coverageCode,
    trade_code: item.tradeCode,
    depreciation_type: item.depreciationType,
    age_years: item.ageYears,
    condition: item.condition,
    depreciation_pct: item.depreciation.depreciationPct,
    depreciation_amount: item.depreciation.depreciationAmount,
    useful_life_years: item.depreciation.usefulLifeYears,
    is_depreciable: item.depreciation.isDepreciable,
    is_recoverable: item.depreciation.isRecoverable,
    xactimate_code: item.xactimateCode || null,
    source: 'manual',
    room_name: item.roomName || null,
    damage_zone_id: item.damageZoneId || null,
    notes: item.notes || null,
    sort_order: i,
  }));

  if (lineItemsToInsert.length > 0) {
    const { error: insertItemsError } = await supabaseAdmin
      .from('estimate_line_items')
      .insert(lineItemsToInsert);

    if (insertItemsError) {
      throw new Error(`Failed to insert line items: ${insertItemsError.message}`);
    }
  }

  // Insert coverage summaries
  const coverageSummariesToInsert = calculation.coverageSummaries.map(coverage => ({
    estimate_id: estimateId,
    coverage_code: coverage.coverageCode,
    subtotal_rcv: coverage.subtotalRcv,
    tax_amount: coverage.taxAmount,
    overhead_amount: coverage.overheadAmount,
    profit_amount: coverage.profitAmount,
    total_rcv: coverage.totalRcv,
    recoverable_depreciation: coverage.recoverableDepreciation,
    non_recoverable_depreciation: coverage.nonRecoverableDepreciation,
    total_depreciation: coverage.totalDepreciation,
    total_acv: coverage.totalAcv,
    deductible: coverage.deductible,
    net_claim: coverage.netClaim,
  }));

  if (coverageSummariesToInsert.length > 0) {
    const { error: insertCoverageError } = await supabaseAdmin
      .from('estimate_coverage_summary')
      .insert(coverageSummariesToInsert);

    if (insertCoverageError) {
      throw new Error(`Failed to insert coverage summaries: ${insertCoverageError.message}`);
    }
  }

  // Return updated estimate
  return (await getEstimate(estimateId))!;
}

// ============================================
// ADD LINE ITEM TO ESTIMATE
// ============================================

export async function addLineItemToEstimate(
  estimateId: string,
  lineItem: EstimateLineItemInput
): Promise<SavedEstimate> {
  // Get current line items
  const { data: currentItems, error: itemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('line_item_code, quantity')
    .eq('estimate_id', estimateId);

  if (itemsError) {
    throw new Error(`Failed to fetch line items: ${itemsError.message}`);
  }

  // Get estimate's region
  const { data: estimateData, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .select('region_id, carrier_profile_id')
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimateData) {
    throw new Error('Estimate not found');
  }

  // Combine existing items with new item
  const existingItems: EstimateLineItemInput[] = (currentItems || []).map((row: any) => ({
    lineItemCode: row.line_item_code,
    quantity: parseFloat(row.quantity),
  }));

  // Check if item already exists - if so, add to quantity
  const existingIndex = existingItems.findIndex(
    item => item.lineItemCode === lineItem.lineItemCode
  );

  if (existingIndex >= 0) {
    existingItems[existingIndex].quantity += lineItem.quantity;
    if (lineItem.notes) {
      existingItems[existingIndex].notes = lineItem.notes;
    }
  } else {
    existingItems.push(lineItem);
  }

  // Recalculate and update
  return updateEstimate(estimateId, {
    regionId: estimateData.region_id,
    carrierProfileId: estimateData.carrier_profile_id,
    lineItems: existingItems,
  });
}

// ============================================
// REMOVE LINE ITEM FROM ESTIMATE
// ============================================

export async function removeLineItemFromEstimate(
  estimateId: string,
  lineItemCode: string
): Promise<SavedEstimate> {
  // Get current line items
  const { data: currentItems, error: itemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('line_item_code, quantity, notes, room_name')
    .eq('estimate_id', estimateId);

  if (itemsError) {
    throw new Error(`Failed to fetch line items: ${itemsError.message}`);
  }

  // Get estimate's region
  const { data: estimateData, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .select('region_id, carrier_profile_id')
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimateData) {
    throw new Error('Estimate not found');
  }

  // Filter out the item to remove
  const remainingItems: EstimateLineItemInput[] = (currentItems || [])
    .filter((row: any) => row.line_item_code !== lineItemCode)
    .map((row: any) => ({
      lineItemCode: row.line_item_code,
      quantity: parseFloat(row.quantity),
      notes: row.notes,
      roomName: row.room_name,
    }));

  // Recalculate and update
  return updateEstimate(estimateId, {
    regionId: estimateData.region_id,
    carrierProfileId: estimateData.carrier_profile_id,
    lineItems: remainingItems,
  });
}

// ============================================
// GET ESTIMATE TEMPLATES
// ============================================

export async function getEstimateTemplates(damageType?: string): Promise<any[]> {
  let query = supabaseAdmin
    .from('estimate_templates')
    .select('*')
    .eq('is_public', true);

  if (damageType) {
    query = query.eq('damage_type', damageType);
  }

  const { data, error } = await query.order('usage_count', { ascending: false }).order('name');

  if (error) {
    throw new Error(`Failed to fetch estimate templates: ${error.message}`);
  }

  return data || [];
}

// ============================================
// CREATE ESTIMATE FROM TEMPLATE
// ============================================

export async function createEstimateFromTemplate(
  templateId: string,
  quantities: Record<string, number>,
  input: Partial<EstimateCalculationInput>
): Promise<SavedEstimate> {
  // Get template
  const { data: template, error: templateError } = await supabaseAdmin
    .from('estimate_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    throw new Error('Template not found');
  }

  const templateItems = template.template_items as Array<{
    code: string;
    description: string;
    unit: string;
  }>;

  // Build line items from template
  const lineItems: EstimateLineItemInput[] = templateItems
    .filter(item => quantities[item.code] && quantities[item.code] > 0)
    .map(item => ({
      lineItemCode: item.code,
      quantity: quantities[item.code],
    }));

  // Increment usage count
  const { error: updateError } = await supabaseAdmin
    .from('estimate_templates')
    .update({ usage_count: (template.usage_count || 0) + 1 })
    .eq('id', templateId);

  if (updateError) {
    console.warn(`Failed to increment usage count: ${updateError.message}`);
  }

  // Calculate and save
  const calculation = await calculateEstimate({
    ...input,
    lineItems,
  });

  return saveEstimate(
    { ...input, lineItems },
    calculation
  );
}

// ============================================
// LIST ESTIMATES
// ============================================

export async function listEstimates(options: {
  status?: string;
  claimId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ estimates: any[]; total: number }> {
  // Build count query
  let countQuery = supabaseAdmin
    .from('estimates')
    .select('*', { count: 'exact', head: true });

  if (options.status) {
    countQuery = countQuery.eq('status', options.status);
  }

  if (options.claimId) {
    countQuery = countQuery.eq('claim_id', options.claimId);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    throw new Error(`Failed to count estimates: ${countError.message}`);
  }

  // Build estimates query
  let estimatesQuery = supabaseAdmin
    .from('estimates')
    .select('*');

  if (options.status) {
    estimatesQuery = estimatesQuery.eq('status', options.status);
  }

  if (options.claimId) {
    estimatesQuery = estimatesQuery.eq('claim_id', options.claimId);
  }

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const { data: estimatesData, error: estimatesError } = await estimatesQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (estimatesError) {
    throw new Error(`Failed to fetch estimates: ${estimatesError.message}`);
  }

  // Get line item counts for each estimate
  const estimates = await Promise.all(
    (estimatesData || []).map(async (estimate: any) => {
      const { count: lineItemCount, error: lineItemError } = await supabaseAdmin
        .from('estimate_line_items')
        .select('*', { count: 'exact', head: true })
        .eq('estimate_id', estimate.id);

      return {
        ...estimate,
        line_item_count: lineItemCount || 0,
      };
    })
  );

  return {
    estimates,
    total: count || 0,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
