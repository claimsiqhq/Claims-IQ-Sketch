import { supabaseAdmin } from '../lib/supabaseAdmin';

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

  let total = 0;
  for (const comp of parsed) {
    // First, get the material ID from the SKU
    const { data: materials, error: matError } = await supabaseAdmin
      .from('materials')
      .select('id, base_price')
      .eq('sku', comp.sku)
      .limit(1);

    if (matError || !materials || materials.length === 0) continue;

    const material = materials[0];

    // Try to get regional price
    const { data: regionalPrices, error: priceError } = await supabaseAdmin
      .from('material_regional_prices')
      .select('price')
      .eq('material_id', material.id)
      .eq('region_id', regionId)
      .order('effective_date', { ascending: false })
      .limit(1);

    if (!priceError && regionalPrices && regionalPrices.length > 0) {
      total += parseFloat(regionalPrices[0].price) * comp.qty_per_unit;
    } else if (material.base_price) {
      total += parseFloat(material.base_price) * comp.qty_per_unit;
    }
  }
  return total;
}

export async function calculateLaborCost(
  components: LaborComponent[] | string,
  regionId: string
): Promise<number> {
  const parsed = parseJsonField(components);
  if (!parsed || !Array.isArray(parsed)) return 0;

  const { data: regions, error: regionError } = await supabaseAdmin
    .from('regions')
    .select('indices')
    .eq('id', regionId)
    .limit(1);

  const indices = (regions && regions.length > 0) ? regions[0]?.indices || {} : {};

  let total = 0;
  for (const comp of parsed) {
    const trade = comp.trade || 'general';

    const { data: rates, error: rateError } = await supabaseAdmin
      .from('labor_rates_enhanced')
      .select('base_hourly_rate')
      .eq('region_code', 'NATIONAL')
      .eq('trade_code', trade)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1);

    const baseRate = (rates && rates.length > 0)
      ? parseFloat(rates[0].hourly_rate)
      : 45.0;

    const indexKey = `labor_${trade}`;
    const regionalIndex = parseFloat(
      indices[indexKey] || indices['labor_general'] || 1.0
    );

    total += baseRate * regionalIndex * comp.hours_per_unit;
  }
  return total;
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
  const { data, error } = await supabaseAdmin
    .from('line_items')
    .select('*')
    .eq('code', lineItemCode)
    .limit(1);

  if (error || !data || data.length === 0) return 0;

  const item = data[0];
  const material = await calculateMaterialCost(item.material_components, regionId);
  const labor = await calculateLaborCost(item.labor_components, regionId);
  const equipment = calculateEquipmentCost(item.equipment_components);
  const wasteFactor = parseFloat(item.waste_factor || 1);

  return Math.round((material + labor + equipment) * wasteFactor * 100) / 100;
}

export async function calculatePrice(
  lineItemCode: string,
  quantity: number,
  regionId: string,
  carrierId?: string
): Promise<PriceCalculationResult> {
  const { data: lineItems, error: itemError } = await supabaseAdmin
    .from('line_items')
    .select('*')
    .eq('code', lineItemCode)
    .eq('is_active', true)
    .limit(1);

  if (itemError || !lineItems || lineItems.length === 0) {
    throw new Error(`Line item ${lineItemCode} not found`);
  }

  const lineItem = lineItems[0];

  const { data: regions, error: regionError } = await supabaseAdmin
    .from('regions')
    .select('*')
    .eq('id', regionId)
    .limit(1);

  if (regionError || !regions || regions.length === 0) {
    throw new Error(`Region ${regionId} not found`);
  }

  let materialCost = await calculateMaterialCost(lineItem.material_components, regionId);
  const laborCost = await calculateLaborCost(lineItem.labor_components, regionId);
  const equipmentCost = calculateEquipmentCost(lineItem.equipment_components);

  materialCost *= parseFloat(lineItem.waste_factor || 1);

  let unitPrice = materialCost + laborCost + equipmentCost;

  if (carrierId) {
    const { data: carriers, error: carrierError } = await supabaseAdmin
      .from('carrier_profiles')
      .select('*')
      .eq('id', carrierId)
      .limit(1);

    if (!carrierError && carriers && carriers.length > 0) {
      unitPrice = applyCarrierAdjustments(
        unitPrice,
        carriers[0],
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
}

export async function searchLineItems(options: {
  q?: string;
  category?: string;
  damageType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const { q, category, limit = 50, offset = 0 } = options;

  // Build the query
  let query = supabaseAdmin
    .from('xact_line_items')
    .select('id, full_code, category_code, selector_code, description, unit, op_eligible, labor_efficiency', { count: 'exact' });

  // Apply filters
  if (q) {
    query = query.or(`full_code.ilike.%${q}%,description.ilike.%${q}%,selector_code.ilike.%${q}%`);
  }

  if (category) {
    const categoryUpper = category.toUpperCase();
    query = query.or(`category_code.eq.${categoryUpper},category_code.ilike.${category}%`);
  }

  // Apply ordering and pagination
  query = query
    .order('category_code', { ascending: true })
    .order('selector_code', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to search line items: ${error.message}`);
  }

  const items = (data || []).map(row => ({
    id: row.id,
    code: row.full_code,
    categoryId: row.category_code,
    categoryName: row.category_code,
    selectorCode: row.selector_code,
    description: row.description,
    unit: row.unit,
    opEligible: row.op_eligible,
    laborEfficiency: row.labor_efficiency,
    basePrice: null
  }));

  return { items, total: count || 0 };
}

export async function getCategories(): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('xact_categories')
    .select('id, code, description, coverage_type, op_eligible')
    .order('code', { ascending: true });

  if (error) {
    throw new Error(`Failed to get categories: ${error.message}`);
  }

  return (data || []).map(row => ({
    id: row.code,
    code: row.code,
    name: row.description,
    description: row.description,
    coverageType: row.coverage_type,
    opEligible: row.op_eligible
  }));
}

export async function getRegionByZip(zipCode: string): Promise<any> {
  const prefix = zipCode.substring(0, 3);

  const { data, error } = await supabaseAdmin
    .from('regions')
    .select('*')
    .contains('zip_postal_prefixes', [prefix])
    .limit(1);

  if (error || !data || data.length === 0) {
    // Fallback to US-NATIONAL
    const { data: nationalData, error: nationalError } = await supabaseAdmin
      .from('regions')
      .select('*')
      .eq('id', 'US-NATIONAL')
      .limit(1);

    return (nationalData && nationalData.length > 0) ? nationalData[0] : null;
  }

  return data[0];
}
