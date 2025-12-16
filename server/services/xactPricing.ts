import { db } from "../db";
import { xactLineItems, xactComponents, xactCategories } from "@shared/schema";
import { eq, sql, and, ilike, or } from "drizzle-orm";

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

const componentCache = new Map<string, { type: string; amount: number; description: string; unit: string }>();

async function loadComponentCache(): Promise<void> {
  if (componentCache.size > 0) return;
  
  const components = await db.select().from(xactComponents);
  for (const comp of components) {
    componentCache.set(comp.code.toUpperCase(), {
      type: comp.componentType,
      amount: parseFloat(comp.amount || "0"),
      description: comp.description,
      unit: comp.unit || "EA",
    });
  }
  console.log(`Loaded ${componentCache.size} components into cache`);
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

function parseLaborFormula(formula: string): { hours: number; rate: number } {
  if (!formula) return { hours: 0, rate: 0 };
  
  const match = formula.match(/([A-Za-z0-9]+),?([\d.]+)?/);
  if (match) {
    const efficiency = match[2] ? parseFloat(match[2]) : 0;
    return { hours: efficiency / 60, rate: 65 };
  }
  
  return { hours: 0, rate: 0 };
}

export async function calculateXactPrice(lineItemCode: string): Promise<XactPriceBreakdown | null> {
  await loadComponentCache();
  
  const items = await db
    .select()
    .from(xactLineItems)
    .where(eq(xactLineItems.fullCode, lineItemCode.toUpperCase()))
    .limit(1);
  
  if (items.length === 0) return null;
  
  const item = items[0];
  const activities = (item.activities as any[]) || [];
  
  const materialComponents: ComponentPrice[] = [];
  const laborComponents: ComponentPrice[] = [];
  const equipmentComponents: ComponentPrice[] = [];
  
  let materialTotal = 0;
  let laborTotal = 0;
  let equipmentTotal = 0;
  
  for (const activity of activities) {
    if (activity.materialFormula) {
      const matParts = parseFormula(activity.materialFormula);
      for (const part of matParts) {
        const comp = componentCache.get(part.code.toUpperCase());
        if (comp) {
          const total = comp.amount * part.quantity;
          materialComponents.push({
            code: part.code,
            type: "material",
            description: comp.description,
            unit: comp.unit,
            amount: comp.amount,
            quantity: part.quantity,
            total,
          });
          materialTotal += total;
        }
      }
    }
    
    if (activity.laborFormula) {
      const labor = parseLaborFormula(activity.laborFormula);
      if (labor.hours > 0) {
        const total = labor.hours * labor.rate;
        laborComponents.push({
          code: "LABOR",
          type: "labor",
          description: `Labor - ${activity.description || "Installation"}`,
          unit: "HR",
          amount: labor.rate,
          quantity: labor.hours,
          total,
        });
        laborTotal += total;
      }
    }
  }
  
  const unitPrice = materialTotal + laborTotal + equipmentTotal;
  
  return {
    lineItemCode: item.fullCode,
    description: item.description,
    unit: item.unit,
    categoryCode: item.categoryCode,
    
    materialTotal: Math.round(materialTotal * 100) / 100,
    laborTotal: Math.round(laborTotal * 100) / 100,
    equipmentTotal: Math.round(equipmentTotal * 100) / 100,
    unitPrice: Math.round(unitPrice * 100) / 100,
    
    materialComponents,
    laborComponents,
    equipmentComponents,
    
    laborEfficiencyMinutes: item.laborEfficiency,
    materialDistributionPct: item.materialDistPct,
    opEligible: item.opEligible ?? true,
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
  const searchTerm = `%${query.toLowerCase()}%`;
  
  const conditions: any[] = [];
  
  if (query) {
    conditions.push(
      or(
        sql`LOWER(${xactLineItems.description}) LIKE ${searchTerm}`,
        sql`LOWER(${xactLineItems.fullCode}) LIKE ${searchTerm}`
      )
    );
  }
  
  if (category) {
    conditions.push(eq(xactLineItems.categoryCode, category.toUpperCase()));
  }
  
  let itemQuery = db.select().from(xactLineItems);
  if (conditions.length > 0) {
    itemQuery = itemQuery.where(and(...conditions)) as any;
  }
  
  const items = await itemQuery
    .orderBy(xactLineItems.fullCode)
    .limit(limit)
    .offset(offset);
  
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(xactLineItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  
  const categoryMap = new Map<string, string>();
  const categories = await db.select().from(xactCategories);
  for (const cat of categories) {
    categoryMap.set(cat.code, cat.description);
  }
  
  const results: XactSearchResult[] = [];
  
  for (const item of items) {
    const price = await calculateXactPrice(item.fullCode);
    
    results.push({
      id: item.id,
      fullCode: item.fullCode,
      description: item.description,
      unit: item.unit,
      categoryCode: item.categoryCode,
      categoryDescription: categoryMap.get(item.categoryCode) || item.categoryCode,
      unitPrice: price?.unitPrice || 0,
      materialCost: price?.materialTotal || 0,
      laborCost: price?.laborTotal || 0,
      opEligible: item.opEligible ?? true,
      taxable: item.taxable ?? true,
    });
  }
  
  return {
    items: results,
    total: Number(countResult[0]?.count || 0),
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
