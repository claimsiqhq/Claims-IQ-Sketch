import { pool } from '../db';
import {
  calculateMaterialCost,
  calculateLaborCost,
  calculateEquipmentCost,
  calculateBasePrice
} from './pricing';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface EstimateLineItemInput {
  lineItemCode: string;
  quantity: number;
  notes?: string;
  roomName?: string;
  damageZoneId?: string;
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
  notes?: string;
  roomName?: string;
  damageZoneId?: string;
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
    // Fetch carrier profile if provided
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

    // Calculate each line item
    const calculatedItems: CalculatedLineItem[] = [];
    const categoryBreakdown: Record<string, { count: number; subtotal: number }> = {};

    for (const inputItem of input.lineItems) {
      const def = lineItemMap.get(inputItem.lineItemCode);
      if (!def) {
        console.warn(`Line item ${inputItem.lineItemCode} not found, skipping`);
        continue;
      }

      const quantity = inputItem.quantity;

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

      // Calculate totals for this quantity
      const totalMaterial = materialCost * quantity;
      const totalLabor = laborCost * quantity;
      const totalEquipment = equipmentCost * quantity;
      const unitPrice = materialCost + laborCost + equipmentCost;
      let subtotal = totalMaterial + totalLabor + totalEquipment;

      // Apply minimum charge
      const minCharge = parseFloat(def.minimum_charge || '0');
      if (subtotal < minCharge) {
        subtotal = minCharge;
      }

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
        notes: inputItem.notes,
        roomName: inputItem.roomName,
        damageZoneId: inputItem.damageZoneId,
      };

      calculatedItems.push(calculatedItem);

      // Update category breakdown
      const categoryId = def.category_id.split('.')[0]; // Get parent category
      if (!categoryBreakdown[categoryId]) {
        categoryBreakdown[categoryId] = { count: 0, subtotal: 0 };
      }
      categoryBreakdown[categoryId].count++;
      categoryBreakdown[categoryId].subtotal += calculatedItem.subtotal;
    }

    // Calculate totals
    const subtotal = calculatedItems.reduce((sum, item) => sum + item.subtotal, 0);

    // Get O&P percentages (from input, carrier profile, or defaults)
    const overheadPct = input.overheadPct ??
      (carrierProfile ? parseFloat(carrierProfile.overhead_pct) : 10);
    const profitPct = input.profitPct ??
      (carrierProfile ? parseFloat(carrierProfile.profit_pct) : 10);

    // Calculate O&P
    const overheadAmount = subtotal * (overheadPct / 100);
    const profitAmount = subtotal * (profitPct / 100);

    // Calculate tax (if applicable from carrier)
    const taxPct = carrierProfile?.applies_tax
      ? parseFloat(carrierProfile.tax_rate || '0')
      : 0;
    const taxableAmount = carrierProfile?.tax_on_materials_only
      ? calculatedItems.reduce((sum, item) => sum + item.materialCost, 0)
      : subtotal;
    const taxAmount = taxableAmount * (taxPct / 100);

    const grandTotal = subtotal + overheadAmount + profitAmount + taxAmount;

    return {
      lineItems: calculatedItems,
      subtotal: round(subtotal),
      overheadAmount: round(overheadAmount),
      overheadPct,
      profitAmount: round(profitAmount),
      profitPct,
      taxAmount: round(taxAmount),
      taxPct,
      grandTotal: round(grandTotal),
      regionId,
      carrierProfileId: input.carrierProfileId,
      lineItemCount: calculatedItems.length,
      categoryBreakdown,
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

    // Insert line items
    for (let i = 0; i < calculation.lineItems.length; i++) {
      const item = calculation.lineItems[i];
      await client.query(
        `INSERT INTO estimate_line_items (
          estimate_id, line_item_code, line_item_description,
          category_id, quantity, unit,
          unit_price, material_cost, labor_cost, equipment_cost, subtotal,
          source, room_name, damage_zone_id, notes, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
          'manual',
          item.roomName || null,
          item.damageZoneId || null,
          item.notes || null,
          i,
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

    // Get line items
    const itemsResult = await client.query(
      `SELECT * FROM estimate_line_items
       WHERE estimate_id = $1
       ORDER BY sort_order`,
      [estimateId]
    );

    const lineItems: CalculatedLineItem[] = itemsResult.rows.map((row: any) => ({
      code: row.line_item_code,
      description: row.line_item_description,
      categoryId: row.category_id,
      unit: row.unit,
      quantity: parseFloat(row.quantity),
      materialCost: parseFloat(row.material_cost),
      laborCost: parseFloat(row.labor_cost),
      equipmentCost: parseFloat(row.equipment_cost),
      unitPrice: parseFloat(row.unit_price),
      subtotal: parseFloat(row.subtotal),
      notes: row.notes,
      roomName: row.room_name,
      damageZoneId: row.damage_zone_id,
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

    return {
      id: estimate.id,
      claimId: estimate.claim_id,
      claimNumber: estimate.claim_number,
      propertyAddress: estimate.property_address,
      status: estimate.status,
      version: estimate.version,
      createdAt: estimate.created_at,
      lineItems,
      subtotal: parseFloat(estimate.subtotal),
      overheadAmount: parseFloat(estimate.overhead_amount),
      overheadPct: parseFloat(estimate.overhead_pct),
      profitAmount: parseFloat(estimate.profit_amount),
      profitPct: parseFloat(estimate.profit_pct),
      taxAmount: parseFloat(estimate.tax_amount),
      taxPct: parseFloat(estimate.tax_pct),
      grandTotal: parseFloat(estimate.grand_total),
      regionId: estimate.region_id,
      carrierProfileId: estimate.carrier_profile_id,
      lineItemCount: lineItems.length,
      categoryBreakdown,
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

    // Delete existing line items
    await client.query(
      'DELETE FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );

    // Insert new line items
    for (let i = 0; i < calculation.lineItems.length; i++) {
      const item = calculation.lineItems[i];
      await client.query(
        `INSERT INTO estimate_line_items (
          estimate_id, line_item_code, line_item_description,
          category_id, quantity, unit,
          unit_price, material_cost, labor_cost, equipment_cost, subtotal,
          source, room_name, damage_zone_id, notes, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
          'manual',
          item.roomName || null,
          item.damageZoneId || null,
          item.notes || null,
          i,
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
