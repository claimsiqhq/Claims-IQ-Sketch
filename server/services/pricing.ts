import { pool } from '../db';

interface MaterialComponent {
  sku: string;
  qty_per_unit: number;
}

interface LaborComponent {
  trade: string;
  hours_per_unit: number;
}

interface EquipmentComponent {
  cost_per_unit: number;
}

interface PriceBreakdown {
  material: number;
  labor: number;
  equipment: number;
}

interface PriceCalculationResult {
  lineItemCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  breakdown: PriceBreakdown;
  regionId: string;
  carrierId?: string;
}

interface LineItemRow {
  id: string;
  code: string;
  category_id: string;
  category_name: string;
  description: string;
  unit: string;
  material_components: MaterialComponent[] | string;
  labor_components: LaborComponent[] | string;
  equipment_components: EquipmentComponent[] | string;
  waste_factor: string | number;
  minimum_charge: string | number;
  is_active: boolean;
}

function parseJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

export async function calculateMaterialCost(
  components: MaterialComponent[] | string, 
  regionId: string
): Promise<number> {
  const parsed = parseJsonField(components);
  if (!parsed || !Array.isArray(parsed)) return 0;
  
  const client = await pool.connect();
  try {
    let total = 0;
    for (const comp of parsed) {
      const priceRow = await client.query(`
        SELECT mrp.price 
        FROM material_regional_prices mrp
        JOIN materials m ON m.id = mrp.material_id
        WHERE m.sku = $1 AND mrp.region_id = $2
        ORDER BY mrp.effective_date DESC
        LIMIT 1
      `, [comp.sku, regionId]);
      
      if (priceRow.rows.length > 0) {
        total += parseFloat(priceRow.rows[0].price) * comp.qty_per_unit;
      } else {
        const baseRow = await client.query(
          'SELECT base_price FROM materials WHERE sku = $1',
          [comp.sku]
        );
        if (baseRow.rows.length > 0) {
          total += parseFloat(baseRow.rows[0].base_price) * comp.qty_per_unit;
        }
      }
    }
    return total;
  } finally {
    client.release();
  }
}

export async function calculateLaborCost(
  components: LaborComponent[] | string, 
  regionId: string
): Promise<number> {
  const parsed = parseJsonField(components);
  if (!parsed || !Array.isArray(parsed)) return 0;
  
  const client = await pool.connect();
  try {
    const regionRow = await client.query(
      'SELECT indices FROM regions WHERE id = $1',
      [regionId]
    );
    const indices = regionRow.rows[0]?.indices || {};
    
    let total = 0;
    for (const comp of parsed) {
      const trade = comp.trade || 'general';
      
      const rateRow = await client.query(`
        SELECT hourly_rate FROM labor_rates 
        WHERE region_id = 'US-NATIONAL' AND trade = $1
        ORDER BY effective_date DESC LIMIT 1
      `, [trade]);
      
      const baseRate = rateRow.rows.length > 0 
        ? parseFloat(rateRow.rows[0].hourly_rate) 
        : 45.0;
      
      const indexKey = `labor_${trade}`;
      const regionalIndex = parseFloat(
        indices[indexKey] || indices['labor_general'] || 1.0
      );
      
      total += baseRate * regionalIndex * comp.hours_per_unit;
    }
    return total;
  } finally {
    client.release();
  }
}

export function calculateEquipmentCost(
  components: EquipmentComponent[] | string
): number {
  const parsed = parseJsonField(components);
  if (!parsed || !Array.isArray(parsed)) return 0;
  
  return parsed.reduce((sum, comp) => sum + (comp.cost_per_unit || 0), 0);
}

export function applyCarrierAdjustments(
  unitPrice: number,
  carrier: any,
  categoryId: string,
  regionId: string
): number {
  let adjusted = unitPrice * parseFloat(carrier.labor_adjustment_factor || 1.0);
  
  const categoryAdj = carrier.category_adjustments || {};
  if (categoryAdj[categoryId]) {
    adjusted *= parseFloat(categoryAdj[categoryId].factor || 1.0);
  }
  
  const regionalAdj = carrier.regional_adjustments || {};
  for (const [pattern, adj] of Object.entries(regionalAdj)) {
    const prefix = pattern.replace('*', '');
    if (regionId.startsWith(prefix)) {
      adjusted *= parseFloat((adj as any).factor || 1.0);
      break;
    }
  }
  
  return adjusted;
}

export async function calculateBasePrice(
  lineItemCode: string, 
  regionId: string
): Promise<number> {
  const client = await pool.connect();
  try {
    const row = await client.query(
      'SELECT * FROM line_items WHERE code = $1',
      [lineItemCode]
    );
    
    if (row.rows.length === 0) return 0;
    
    const item = row.rows[0];
    const material = await calculateMaterialCost(item.material_components, regionId);
    const labor = await calculateLaborCost(item.labor_components, regionId);
    const equipment = calculateEquipmentCost(item.equipment_components);
    const wasteFactor = parseFloat(item.waste_factor || 1);
    
    return Math.round((material + labor + equipment) * wasteFactor * 100) / 100;
  } finally {
    client.release();
  }
}

export async function calculatePrice(
  lineItemCode: string,
  quantity: number,
  regionId: string,
  carrierId?: string
): Promise<PriceCalculationResult> {
  const client = await pool.connect();
  try {
    const itemRow = await client.query(
      'SELECT * FROM line_items WHERE code = $1 AND is_active = true',
      [lineItemCode]
    );
    
    if (itemRow.rows.length === 0) {
      throw new Error(`Line item ${lineItemCode} not found`);
    }
    
    const lineItem = itemRow.rows[0];
    
    const regionRow = await client.query(
      'SELECT * FROM regions WHERE id = $1',
      [regionId]
    );
    
    if (regionRow.rows.length === 0) {
      throw new Error(`Region ${regionId} not found`);
    }
    
    let materialCost = await calculateMaterialCost(lineItem.material_components, regionId);
    const laborCost = await calculateLaborCost(lineItem.labor_components, regionId);
    const equipmentCost = calculateEquipmentCost(lineItem.equipment_components);
    
    materialCost *= parseFloat(lineItem.waste_factor || 1);
    
    let unitPrice = materialCost + laborCost + equipmentCost;
    
    if (carrierId) {
      const carrierRow = await client.query(
        'SELECT * FROM carrier_profiles WHERE id = $1',
        [carrierId]
      );
      
      if (carrierRow.rows.length > 0) {
        unitPrice = applyCarrierAdjustments(
          unitPrice,
          carrierRow.rows[0],
          lineItem.category_id,
          regionId
        );
      }
    }
    
    let subtotal = unitPrice * quantity;
    const minCharge = parseFloat(lineItem.minimum_charge || 0);
    subtotal = Math.max(subtotal, minCharge);
    
    return {
      lineItemCode,
      quantity,
      unit: lineItem.unit,
      unitPrice: Math.round(unitPrice * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      breakdown: {
        material: Math.round(materialCost * quantity * 100) / 100,
        labor: Math.round(laborCost * quantity * 100) / 100,
        equipment: Math.round(equipmentCost * quantity * 100) / 100
      },
      regionId,
      carrierId
    };
  } finally {
    client.release();
  }
}

export async function searchLineItems(options: {
  q?: string;
  category?: string;
  damageType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const { q, category, damageType, limit = 50, offset = 0 } = options;
  
  const client = await pool.connect();
  try {
    const conditions: string[] = ['li.is_active = true'];
    const params: any[] = [];
    let paramIdx = 1;
    
    if (q) {
      conditions.push(`(li.code ILIKE $${paramIdx} OR li.description ILIKE $${paramIdx})`);
      params.push(`%${q}%`);
      paramIdx++;
    }
    
    if (category) {
      conditions.push(`(li.category_id = $${paramIdx} OR li.category_id LIKE $${paramIdx + 1})`);
      params.push(category, `${category}.%`);
      paramIdx += 2;
    }
    
    if (damageType) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(li.scope_triggers) AS trigger
          WHERE trigger->>'damage_type' = $${paramIdx}
        )
      `);
      params.push(damageType);
      paramIdx++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    const countResult = await client.query(
      `SELECT COUNT(*) FROM line_items li WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    const query = `
      SELECT 
        li.id, li.code, li.category_id, li.description, li.unit,
        lic.name as category_name
      FROM line_items li
      LEFT JOIN line_item_categories lic ON li.category_id = lic.id
      WHERE ${whereClause}
      ORDER BY li.category_id, li.code
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    params.push(limit, offset);
    
    const rows = await client.query(query, params);
    
    const items = [];
    for (const row of rows.rows) {
      const basePrice = await calculateBasePrice(row.code, 'US-NATIONAL');
      items.push({
        id: row.id,
        code: row.code,
        categoryId: row.category_id,
        categoryName: row.category_name,
        description: row.description,
        unit: row.unit,
        basePrice
      });
    }
    
    return { items, total };
  } finally {
    client.release();
  }
}

export async function getCategories(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, parent_id, name, description, sort_order
      FROM line_item_categories
      ORDER BY sort_order, id
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getRegionByZip(zipCode: string): Promise<any> {
  const client = await pool.connect();
  try {
    const prefix = zipCode.substring(0, 3);
    
    let result = await client.query(`
      SELECT * FROM regions 
      WHERE $1 = ANY(zip_postal_prefixes)
      LIMIT 1
    `, [prefix]);
    
    if (result.rows.length === 0) {
      result = await client.query(
        "SELECT * FROM regions WHERE id = 'US-NATIONAL'"
      );
    }
    
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}
