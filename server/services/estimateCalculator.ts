import { pool } from '../db';
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
  const client = await pool.connect();

  try {
    // Get regional multipliers and tax rate
    const regionalMultipliers = await getRegionalMultipliers(regionId);
    const taxRate = await getTaxRate(regionId);

    // Get carrier O&P rules
    const carrierRules = await getCarrierOpRules(input.carrierProfileId || null);

    // Fetch carrier profile if provided (for backward compatibility)
    let carrierProfile = null;
    if (input.carrierProfileId) {
      const carrierRow = await client.query(
        'SELECT * FROM carrier_profiles WHERE id = $1 AND is_active = true',
        [input.carrierProfileId]
      );
      if (carrierRow.rows.length > 0) {
        carrierProfile = carrierRow.rows[0];
      }
    }

    // Fetch all line item definitions for the codes provided
    const lineItemCodes = input.lineItems.map(li => li.lineItemCode);
    const lineItemsResult = await client.query(
      `SELECT * FROM line_items WHERE code = ANY($1) AND is_active = true`,
      [lineItemCodes]
    );

    const lineItemMap = new Map(
      lineItemsResult.rows.map((li: any) => [li.code, li])
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
  } finally {
    client.release();
  }
}

// ============================================
// SAVE ESTIMATE
// ============================================

export async function saveEstimate(
  input: EstimateCalculationInput,
  calculation: EstimateCalculationResult
): Promise<SavedEstimate> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create estimate record
    const estimateResult = await client.query(
      `INSERT INTO estimates (
        claim_id, claim_number, property_address,
        status, version,
        subtotal, overhead_amount, overhead_pct,
        profit_amount, profit_pct,
        tax_amount, tax_pct, grand_total,
        region_id, carrier_profile_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        input.claimId || null,
        input.claimNumber || null,
        input.propertyAddress || null,
        'draft',
        1,
        calculation.subtotal,
        calculation.overheadAmount,
        calculation.overheadPct,
        calculation.profitAmount,
        calculation.profitPct,
        calculation.taxAmount,
        calculation.taxPct,
        calculation.grandTotal,
        calculation.regionId,
        calculation.carrierProfileId || null,
      ]
    );

    const estimate = estimateResult.rows[0];

    // Insert line items with depreciation data
    for (let i = 0; i < calculation.lineItems.length; i++) {
      const item = calculation.lineItems[i];
      await client.query(
        `INSERT INTO estimate_line_items (
          estimate_id, line_item_code, line_item_description,
          category_id, quantity, unit,
          unit_price, material_cost, labor_cost, equipment_cost, subtotal,
          tax_amount, rcv, acv,
          coverage_code, trade_code, depreciation_type,
          age_years, condition,
          depreciation_pct, depreciation_amount,
          useful_life_years, is_depreciable, is_recoverable,
          xactimate_code,
          source, room_name, damage_zone_id, notes, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)`,
        [
          estimate.id,
          item.code,
          item.description,
          item.categoryId,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.materialCost,
          item.laborCost,
          item.equipmentCost,
          item.subtotal,
          item.taxAmount,
          item.rcv,
          item.acv,
          item.coverageCode,
          item.tradeCode,
          item.depreciationType,
          item.ageYears,
          item.condition,
          item.depreciation.depreciationPct,
          item.depreciation.depreciationAmount,
          item.depreciation.usefulLifeYears,
          item.depreciation.isDepreciable,
          item.depreciation.isRecoverable,
          item.xactimateCode || null,
          'manual',
          item.roomName || null,
          item.damageZoneId || null,
          item.notes || null,
          i,
        ]
      );
    }

    // Insert coverage summaries
    for (const coverage of calculation.coverageSummaries) {
      await client.query(
        `INSERT INTO estimate_coverage_summary (
          estimate_id, coverage_code,
          subtotal_rcv, tax_amount, overhead_amount, profit_amount, total_rcv,
          recoverable_depreciation, non_recoverable_depreciation, total_depreciation,
          total_acv, deductible, net_claim
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          estimate.id,
          coverage.coverageCode,
          coverage.subtotalRcv,
          coverage.taxAmount,
          coverage.overheadAmount,
          coverage.profitAmount,
          coverage.totalRcv,
          coverage.recoverableDepreciation,
          coverage.nonRecoverableDepreciation,
          coverage.totalDepreciation,
          coverage.totalAcv,
          coverage.deductible,
          coverage.netClaim,
        ]
      );
    }

    await client.query('COMMIT');

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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// GET ESTIMATE
// ============================================

export async function getEstimate(estimateId: string): Promise<SavedEstimate | null> {
  const client = await pool.connect();

  try {
    // Get estimate
    const estimateResult = await client.query(
      'SELECT * FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (estimateResult.rows.length === 0) {
      return null;
    }

    const estimate = estimateResult.rows[0];

    // Get line items with depreciation data
    const itemsResult = await client.query(
      `SELECT * FROM estimate_line_items
       WHERE estimate_id = $1
       ORDER BY sort_order`,
      [estimateId]
    );

    const lineItems: CalculatedLineItem[] = itemsResult.rows.map((row: any) => {
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
    const coverageResult = await client.query(
      `SELECT * FROM estimate_coverage_summary WHERE estimate_id = $1`,
      [estimateId]
    );

    const coverageSummaries: CoverageSummary[] = coverageResult.rows.map((row: any) => ({
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
  } finally {
    client.release();
  }
}

// ============================================
// UPDATE ESTIMATE
// ============================================

export async function updateEstimate(
  estimateId: string,
  input: EstimateCalculationInput
): Promise<SavedEstimate> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current estimate to check version
    const currentEstimate = await client.query(
      'SELECT version FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (currentEstimate.rows.length === 0) {
      throw new Error('Estimate not found');
    }

    const newVersion = currentEstimate.rows[0].version + 1;

    // Calculate new totals
    const calculation = await calculateEstimate(input);

    // Update estimate
    await client.query(
      `UPDATE estimates SET
        claim_id = $1, claim_number = $2, property_address = $3,
        version = $4, updated_at = NOW(),
        subtotal = $5, overhead_amount = $6, overhead_pct = $7,
        profit_amount = $8, profit_pct = $9,
        tax_amount = $10, tax_pct = $11, grand_total = $12,
        region_id = $13, carrier_profile_id = $14
      WHERE id = $15`,
      [
        input.claimId || null,
        input.claimNumber || null,
        input.propertyAddress || null,
        newVersion,
        calculation.subtotal,
        calculation.overheadAmount,
        calculation.overheadPct,
        calculation.profitAmount,
        calculation.profitPct,
        calculation.taxAmount,
        calculation.taxPct,
        calculation.grandTotal,
        calculation.regionId,
        calculation.carrierProfileId || null,
        estimateId,
      ]
    );

    // Delete existing line items and coverage summaries
    await client.query(
      'DELETE FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );
    await client.query(
      'DELETE FROM estimate_coverage_summary WHERE estimate_id = $1',
      [estimateId]
    );

    // Insert new line items with depreciation data
    for (let i = 0; i < calculation.lineItems.length; i++) {
      const item = calculation.lineItems[i];
      await client.query(
        `INSERT INTO estimate_line_items (
          estimate_id, line_item_code, line_item_description,
          category_id, quantity, unit,
          unit_price, material_cost, labor_cost, equipment_cost, subtotal,
          tax_amount, rcv, acv,
          coverage_code, trade_code, depreciation_type,
          age_years, condition,
          depreciation_pct, depreciation_amount,
          useful_life_years, is_depreciable, is_recoverable,
          xactimate_code,
          source, room_name, damage_zone_id, notes, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)`,
        [
          estimateId,
          item.code,
          item.description,
          item.categoryId,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.materialCost,
          item.laborCost,
          item.equipmentCost,
          item.subtotal,
          item.taxAmount,
          item.rcv,
          item.acv,
          item.coverageCode,
          item.tradeCode,
          item.depreciationType,
          item.ageYears,
          item.condition,
          item.depreciation.depreciationPct,
          item.depreciation.depreciationAmount,
          item.depreciation.usefulLifeYears,
          item.depreciation.isDepreciable,
          item.depreciation.isRecoverable,
          item.xactimateCode || null,
          'manual',
          item.roomName || null,
          item.damageZoneId || null,
          item.notes || null,
          i,
        ]
      );
    }

    // Insert coverage summaries
    for (const coverage of calculation.coverageSummaries) {
      await client.query(
        `INSERT INTO estimate_coverage_summary (
          estimate_id, coverage_code,
          subtotal_rcv, tax_amount, overhead_amount, profit_amount, total_rcv,
          recoverable_depreciation, non_recoverable_depreciation, total_depreciation,
          total_acv, deductible, net_claim
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          estimateId,
          coverage.coverageCode,
          coverage.subtotalRcv,
          coverage.taxAmount,
          coverage.overheadAmount,
          coverage.profitAmount,
          coverage.totalRcv,
          coverage.recoverableDepreciation,
          coverage.nonRecoverableDepreciation,
          coverage.totalDepreciation,
          coverage.totalAcv,
          coverage.deductible,
          coverage.netClaim,
        ]
      );
    }

    await client.query('COMMIT');

    // Return updated estimate
    return (await getEstimate(estimateId))!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// ADD LINE ITEM TO ESTIMATE
// ============================================

export async function addLineItemToEstimate(
  estimateId: string,
  lineItem: EstimateLineItemInput
): Promise<SavedEstimate> {
  const client = await pool.connect();

  try {
    // Get current line items
    const currentItems = await client.query(
      'SELECT line_item_code, quantity FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );

    // Get estimate's region
    const estimateRow = await client.query(
      'SELECT region_id, carrier_profile_id FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (estimateRow.rows.length === 0) {
      throw new Error('Estimate not found');
    }

    // Combine existing items with new item
    const existingItems: EstimateLineItemInput[] = currentItems.rows.map((row: any) => ({
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
      regionId: estimateRow.rows[0].region_id,
      carrierProfileId: estimateRow.rows[0].carrier_profile_id,
      lineItems: existingItems,
    });
  } finally {
    client.release();
  }
}

// ============================================
// REMOVE LINE ITEM FROM ESTIMATE
// ============================================

export async function removeLineItemFromEstimate(
  estimateId: string,
  lineItemCode: string
): Promise<SavedEstimate> {
  const client = await pool.connect();

  try {
    // Get current line items
    const currentItems = await client.query(
      'SELECT line_item_code, quantity, notes, room_name FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );

    // Get estimate's region
    const estimateRow = await client.query(
      'SELECT region_id, carrier_profile_id FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (estimateRow.rows.length === 0) {
      throw new Error('Estimate not found');
    }

    // Filter out the item to remove
    const remainingItems: EstimateLineItemInput[] = currentItems.rows
      .filter((row: any) => row.line_item_code !== lineItemCode)
      .map((row: any) => ({
        lineItemCode: row.line_item_code,
        quantity: parseFloat(row.quantity),
        notes: row.notes,
        roomName: row.room_name,
      }));

    // Recalculate and update
    return updateEstimate(estimateId, {
      regionId: estimateRow.rows[0].region_id,
      carrierProfileId: estimateRow.rows[0].carrier_profile_id,
      lineItems: remainingItems,
    });
  } finally {
    client.release();
  }
}

// ============================================
// GET ESTIMATE TEMPLATES
// ============================================

export async function getEstimateTemplates(damageType?: string): Promise<any[]> {
  const client = await pool.connect();

  try {
    let query = 'SELECT * FROM estimate_templates WHERE is_public = true';
    const params: any[] = [];

    if (damageType) {
      query += ' AND damage_type = $1';
      params.push(damageType);
    }

    query += ' ORDER BY usage_count DESC, name';

    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================
// CREATE ESTIMATE FROM TEMPLATE
// ============================================

export async function createEstimateFromTemplate(
  templateId: string,
  quantities: Record<string, number>,
  input: Partial<EstimateCalculationInput>
): Promise<SavedEstimate> {
  const client = await pool.connect();

  try {
    // Get template
    const templateResult = await client.query(
      'SELECT * FROM estimate_templates WHERE id = $1',
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      throw new Error('Template not found');
    }

    const template = templateResult.rows[0];
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
    await client.query(
      'UPDATE estimate_templates SET usage_count = usage_count + 1 WHERE id = $1',
      [templateId]
    );

    // Calculate and save
    const calculation = await calculateEstimate({
      ...input,
      lineItems,
    });

    return saveEstimate(
      { ...input, lineItems },
      calculation
    );
  } finally {
    client.release();
  }
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
  const client = await pool.connect();

  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }

    if (options.claimId) {
      conditions.push(`claim_id = $${paramIndex}`);
      params.push(options.claimId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM estimates ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get estimates
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    params.push(limit, offset);
    const estimatesResult = await client.query(
      `SELECT
        e.*,
        (SELECT COUNT(*) FROM estimate_line_items WHERE estimate_id = e.id) as line_item_count
       FROM estimates e
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      estimates: estimatesResult.rows,
      total,
    };
  } finally {
    client.release();
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
