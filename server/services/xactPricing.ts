import { supabaseAdmin } from "../lib/supabaseAdmin";

interface ComponentPrice {
  code: string;
  type: string;
  description: string;
  unit: string;
  amount: number;
  quantity: number;
  total: number;
}

interface XactPriceBreakdown {
  lineItemCode: string;
  description: string;
  unit: string;
  categoryCode: string;
  
  materialTotal: number;
  laborTotal: number;
  equipmentTotal: number;
  unitPrice: number;
  
  materialComponents: ComponentPrice[];
  laborComponents: ComponentPrice[];
  equipmentComponents: ComponentPrice[];
  
  laborEfficiencyMinutes: number | null;
  materialDistributionPct: number | null;
  opEligible: boolean;
  taxable: boolean;
}

interface XactSearchResult {
  id: string;
  fullCode: string;
  description: string;
  unit: string;
  categoryCode: string;
  categoryDescription: string;
  unitPrice: number;
  materialCost: number;
  laborCost: number;
  opEligible: boolean;
  taxable: boolean;
}

const componentCache = new Map<string, { type: string; amount: number; description: string; unit: string; code: string }>();
const componentByShortId = new Map<string, { type: string; amount: number; description: string; unit: string; code: string }>();

async function loadComponentCache(): Promise<void> {
  if (componentCache.size > 0) return;
  
  const { data: components, error } = await supabaseAdmin
    .from('xact_components')
    .select('*');
    
  if (error) {
    console.error('Failed to load component cache:', error.message);
    return;
  }
  
  for (const comp of components || []) {
    const entry = {
      type: comp.component_type,
      amount: parseFloat(comp.amount || "0"),
      description: comp.description,
      unit: comp.unit || "EA",
      code: comp.code,
    };
    componentCache.set(comp.code.toUpperCase(), entry);
    
    if (comp.xact_id) {
      const match = comp.xact_id.match(/^(\d+)(.+)$/);
      if (match) {
        const shortId = match[2];
        if (!componentByShortId.has(shortId.toUpperCase())) {
          componentByShortId.set(shortId.toUpperCase(), entry);
        }
      }
    }
  }
  console.log(`Loaded ${componentCache.size} components, ${componentByShortId.size} short IDs into cache`);
}

function parseFormula(formula: string): Array<{ code: string; quantity: number }> {
  if (!formula) return [];
  
  const parts = formula.split("|");
  const result: Array<{ code: string; quantity: number }> = [];
  
  for (const part of parts) {
    const match = part.match(/^([A-Za-z0-9_]+),?([\d.]+)?/);
    if (match) {
      const code = match[1];
      const qty = match[2] ? parseFloat(match[2]) : 1;
      result.push({ code, quantity: qty });
    }
  }
  
  return result;
}

const BASE_UNIT_QUANTITY = 100;
const DEFAULT_LABOR_RATE = 65;

function calculatePerUnitPrice(aggregate: number): number {
  return aggregate / BASE_UNIT_QUANTITY;
}

export async function calculateXactPrice(lineItemCode: string): Promise<XactPriceBreakdown | null> {
  await loadComponentCache();
  
  const { data: items, error } = await supabaseAdmin
    .from('xact_line_items')
    .select('*')
    .eq('full_code', lineItemCode.toUpperCase())
    .limit(1);
  
  if (error || !items || items.length === 0) return null;
  
  const item = items[0];
  const activities = (item.activities as any[]) || [];
  
  const materialComponents: ComponentPrice[] = [];
  const laborComponents: ComponentPrice[] = [];
  const equipmentComponents: ComponentPrice[] = [];
  
  let aggregateMaterial = 0;
  let aggregateEquipment = 0;
  
  for (const activity of activities) {
    if (activity.materialFormula) {
      const matParts = parseFormula(activity.materialFormula);
      for (const part of matParts) {
        const comp = componentCache.get(part.code.toUpperCase()) 
          || componentByShortId.get(part.code.toUpperCase());
        if (comp) {
          const total = comp.amount * part.quantity;
          materialComponents.push({
            code: comp.code,
            type: "material",
            description: comp.description,
            unit: comp.unit,
            amount: comp.amount,
            quantity: part.quantity,
            total,
          });
          aggregateMaterial += total;
        }
      }
    }
    
    if (activity.equipmentFormula) {
      const eqParts = parseFormula(activity.equipmentFormula);
      for (const part of eqParts) {
        const comp = componentCache.get(part.code.toUpperCase()) 
          || componentByShortId.get(part.code.toUpperCase());
        if (comp) {
          const total = comp.amount * part.quantity;
          equipmentComponents.push({
            code: comp.code,
            type: "equipment",
            description: comp.description,
            unit: comp.unit,
            amount: comp.amount,
            quantity: part.quantity,
            total,
          });
          aggregateEquipment += total;
        }
      }
    }
  }
  
  const laborEffMin = item.labor_efficiency || 0;
  const perUnitLabor = (laborEffMin / 60 / BASE_UNIT_QUANTITY) * DEFAULT_LABOR_RATE;
  
  if (laborEffMin > 0) {
    laborComponents.push({
      code: "LABOR",
      type: "labor",
      description: `Labor - ${item.description}`,
      unit: "HR",
      amount: DEFAULT_LABOR_RATE,
      quantity: laborEffMin / 60 / BASE_UNIT_QUANTITY,
      total: perUnitLabor,
    });
  }
  
  const perUnitMaterial = calculatePerUnitPrice(aggregateMaterial);
  const perUnitEquipment = calculatePerUnitPrice(aggregateEquipment);
  const unitPrice = perUnitMaterial + perUnitLabor + perUnitEquipment;
  
  return {
    lineItemCode: item.full_code,
    description: item.description,
    unit: item.unit,
    categoryCode: item.category_code,
    
    materialTotal: Math.round(perUnitMaterial * 100) / 100,
    laborTotal: Math.round(perUnitLabor * 100) / 100,
    equipmentTotal: Math.round(perUnitEquipment * 100) / 100,
    unitPrice: Math.round(unitPrice * 100) / 100,
    
    materialComponents,
    laborComponents,
    equipmentComponents,
    
    laborEfficiencyMinutes: item.labor_efficiency,
    materialDistributionPct: item.material_dist_pct,
    opEligible: item.op_eligible ?? true,
    taxable: item.taxable ?? true,
  };
}

export async function searchXactItemsWithPricing(
  query: string,
  options: {
    category?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: XactSearchResult[]; total: number }> {
  await loadComponentCache();
  
  const { category, limit = 50, offset = 0 } = options;
  const searchTerm = query.toLowerCase();
  
  let itemQuery = supabaseAdmin
    .from('xact_line_items')
    .select('*', { count: 'exact' });
  
  if (query) {
    itemQuery = itemQuery.or(`description.ilike.%${searchTerm}%,full_code.ilike.%${searchTerm}%`);
  }
  
  if (category) {
    itemQuery = itemQuery.eq('category_code', category.toUpperCase());
  }
  
  const { data: items, error, count } = await itemQuery
    .order('full_code')
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('Error searching xact items:', error.message);
    return { items: [], total: 0 };
  }
  
  const categoryMap = new Map<string, string>();
  const { data: categories } = await supabaseAdmin
    .from('xact_categories')
    .select('code, description');
  for (const cat of categories || []) {
    categoryMap.set(cat.code, cat.description);
  }
  
  // Batch calculate prices in parallel to avoid N+1 query issue
  const results: XactSearchResult[] = await Promise.all(
    (items || []).map(async (item) => {
      const price = await calculateXactPrice(item.full_code);
      
      return {
        id: item.id,
        fullCode: item.full_code,
        description: item.description,
        unit: item.unit,
        categoryCode: item.category_code,
        categoryDescription: categoryMap.get(item.category_code) || item.category_code,
        unitPrice: price?.unitPrice || 0,
        materialCost: price?.materialTotal || 0,
        laborCost: price?.laborTotal || 0,
        opEligible: item.op_eligible ?? true,
        taxable: item.taxable ?? true,
      };
    })
  );
  
  return {
    items: results,
    total: count || 0,
  };
}

export async function getXactItemForEstimate(
  lineItemCode: string,
  quantity: number
): Promise<{
  code: string;
  description: string;
  unit: string;
  categoryCode: string;
  quantity: number;
  unitPrice: number;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  subtotal: number;
  opEligible: boolean;
  taxable: boolean;
} | null> {
  const price = await calculateXactPrice(lineItemCode);
  if (!price) return null;
  
  return {
    code: price.lineItemCode,
    description: price.description,
    unit: price.unit,
    categoryCode: price.categoryCode,
    quantity,
    unitPrice: price.unitPrice,
    materialCost: Math.round(price.materialTotal * quantity * 100) / 100,
    laborCost: Math.round(price.laborTotal * quantity * 100) / 100,
    equipmentCost: Math.round(price.equipmentTotal * quantity * 100) / 100,
    subtotal: Math.round(price.unitPrice * quantity * 100) / 100,
    opEligible: price.opEligible,
    taxable: price.taxable,
  };
}
