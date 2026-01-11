/**
 * Scope Assembly Service - Claims IQ Sketch
 *
 * Assembles scope from zones and line items.
 * This service creates scope_items by combining:
 * - Zone geometry (from estimate_zones)
 * - Line item catalog (from scope_line_items)
 * - Quantity extraction (from scopeQuantityEngine)
 *
 * DESIGN PRINCIPLES:
 * - NO pricing calculations
 * - Deterministic assembly
 * - Full provenance tracking
 * - Quantities derived from geometry
 *
 * See: docs/SCOPE_ENGINE.md for architecture details.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  extractQuantity,
  extractZoneQuantities,
  QuantityFormula,
  ScopeUnit,
  LineItemForExtraction,
  QuantityExtractionResult,
} from './scopeQuantityEngine';
import {
  ZoneMetrics,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
  computeZoneMetrics,
} from './zoneMetrics';
import type {
  ScopeItem,
  ScopeLineItem,
  ScopeTrade,
  ScopeSummary,
  ScopeProvenance,
  ScopeProvenanceDetails,
  EstimateZone,
} from '../../shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Assembled scope item ready for insertion
 */
export interface AssembledScopeItem {
  estimateId: string;
  zoneId: string | null;
  wallIndex: number | null;
  lineItemId: string;
  lineItemCode: string;
  quantity: number;
  unit: string;
  wasteFactor: number;
  quantityWithWaste: number;
  provenance: ScopeProvenance;
  provenanceDetails: ScopeProvenanceDetails;
  tradeCode: string;
  coverageType: string;
  sortOrder: number;
  status: 'pending' | 'approved' | 'excluded';
}

/**
 * Result of scope assembly for an estimate
 */
export interface ScopeAssemblyResult {
  estimateId: string;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    metrics: ZoneMetrics;
    itemCount: number;
  }>;
  items: AssembledScopeItem[];
  summary: {
    totalItems: number;
    byTrade: Record<string, number>;
    byUnit: Record<string, number>;
  };
  assembledAt: Date;
}

/**
 * Zone with all related data for assembly
 */
interface ZoneWithRelations {
  id: string;
  name: string;
  zoneType: string;
  lengthFt: number | null;
  widthFt: number | null;
  heightFt: number | null;
  ceilingHeightFt: number | null;
  pitch: string | null;
  pitchMultiplier: number | null;
  dimensions: Record<string, number> | null;
  polygonFt: Array<{ x: number; y: number }> | null;
  sketchPolygon: any | null;
  damageType: string | null;
  damageSeverity: string | null;
  waterCategory: number | null;
  waterClass: number | null;
  affectedSurfaces: string[] | null;
  roomType: string | null;
  floorLevel: string | null;
  missingWalls: MissingWallForMetrics[];
  subrooms: SubroomForMetrics[];
}

/**
 * Line item from catalog with all fields
 */
interface CatalogLineItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  tradeCode: string;
  xactCategoryCode: string | null;
  defaultWasteFactor: number;
  quantityFormula: string | null;
  companionRules: Record<string, string[]> | null;
  scopeConditions: Record<string, string[]> | null;
  coverageType: string;
  activityType: string;
  sortOrder: number;
  isActive: boolean;
  notes: string | null;
}

// ============================================
// MAIN ASSEMBLY FUNCTIONS
// ============================================

/**
 * Assemble scope for an entire estimate
 */
export async function assembleEstimateScope(
  estimateId: string
): Promise<ScopeAssemblyResult> {
  // Fetch all zones with related data
  const zones = await fetchZonesWithRelations(estimateId);

  // Fetch active line items from catalog
  const catalogItems = await fetchCatalogLineItems();

  // Assemble scope items for each zone
  const assembledItems: AssembledScopeItem[] = [];
  const zoneResults: ScopeAssemblyResult['zones'] = [];

  for (const zone of zones) {
    const zoneItems = assembleZoneScope(estimateId, zone, catalogItems);
    assembledItems.push(...zoneItems.items);

    zoneResults.push({
      zoneId: zone.id,
      zoneName: zone.name,
      metrics: zoneItems.metrics,
      itemCount: zoneItems.items.length,
    });
  }

  // Calculate summary
  const summary = calculateScopeSummary(assembledItems);

  return {
    estimateId,
    zones: zoneResults,
    items: assembledItems,
    summary,
    assembledAt: new Date(),
  };
}

/**
 * Assemble scope for a single zone
 */
export function assembleZoneScope(
  estimateId: string,
  zone: ZoneWithRelations,
  catalogItems: CatalogLineItem[]
): {
  items: AssembledScopeItem[];
  metrics: ZoneMetrics;
} {
  // Convert zone to ZoneForMetrics format
  const zoneForMetrics: ZoneForMetrics = {
    id: zone.id,
    zoneType: zone.zoneType,
    lengthFt: zone.lengthFt,
    widthFt: zone.widthFt,
    heightFt: zone.heightFt || zone.ceilingHeightFt,
    pitch: zone.pitch,
    pitchMultiplier: zone.pitchMultiplier,
    dimensions: zone.dimensions as any,
    sketchPolygon: zone.sketchPolygon || (zone.polygonFt ? { coordinates: [zone.polygonFt.map(p => [p.x, p.y])] } : null),
    damageType: zone.damageType,
    damageSeverity: zone.damageSeverity,
    waterCategory: zone.waterCategory,
    waterClass: zone.waterClass,
    affectedSurfaces: zone.affectedSurfaces,
  };

  // Compute zone metrics
  const metrics = computeZoneMetrics(
    zoneForMetrics,
    zone.missingWalls,
    zone.subrooms
  );

  // Filter catalog items that match zone conditions
  const matchingItems = filterMatchingLineItems(catalogItems, zone);

  // Extract quantities and create assembled items
  const items: AssembledScopeItem[] = [];
  let sortOrder = 0;

  for (const catalogItem of matchingItems) {
    const lineItem: LineItemForExtraction = {
      code: catalogItem.code,
      unit: catalogItem.unit as ScopeUnit,
      quantityFormula: catalogItem.quantityFormula as QuantityFormula | null,
      defaultWasteFactor: catalogItem.defaultWasteFactor,
    };

    const extraction = extractQuantity(metrics, lineItem);

    // Skip items with zero quantity
    if (extraction.quantity === 0 && !extraction.success) {
      continue;
    }

    items.push({
      estimateId,
      zoneId: zone.id,
      wallIndex: null,
      lineItemId: catalogItem.id,
      lineItemCode: catalogItem.code,
      quantity: extraction.quantity,
      unit: extraction.unit,
      wasteFactor: extraction.wasteFactor,
      quantityWithWaste: extraction.quantityWithWaste,
      provenance: 'geometry_derived',
      provenanceDetails: {
        source_metric: extraction.sourceMetric,
        formula: extraction.formula || undefined,
        computed_at: extraction.provenance.computedAt,
      },
      tradeCode: catalogItem.tradeCode,
      coverageType: catalogItem.coverageType,
      sortOrder: sortOrder++,
      status: 'pending',
    });
  }

  return { items, metrics };
}

/**
 * Filter line items that match zone conditions
 */
function filterMatchingLineItems(
  catalogItems: CatalogLineItem[],
  zone: ZoneWithRelations
): CatalogLineItem[] {
  return catalogItems.filter((item) => {
    const conditions = item.scopeConditions;
    if (!conditions || Object.keys(conditions).length === 0) {
      // Items without conditions only apply if manually added
      return false;
    }

    // Check damage type
    if (conditions.damage_types && conditions.damage_types.length > 0) {
      if (!zone.damageType || !conditions.damage_types.includes(zone.damageType.toLowerCase())) {
        return false;
      }
    }

    // Check surfaces
    if (conditions.surfaces && conditions.surfaces.length > 0) {
      const zoneSurfaces = zone.affectedSurfaces || [];
      const hasMatch = conditions.surfaces.some(s =>
        zoneSurfaces.map(zs => zs.toLowerCase()).includes(s.toLowerCase())
      );
      if (!hasMatch && zoneSurfaces.length > 0) {
        return false;
      }
    }

    // Check severity
    if (conditions.severity && conditions.severity.length > 0) {
      if (!zone.damageSeverity || !conditions.severity.includes(zone.damageSeverity.toLowerCase())) {
        return false;
      }
    }

    // Check zone types
    if (conditions.zone_types && conditions.zone_types.length > 0) {
      if (!zone.zoneType || !conditions.zone_types.includes(zone.zoneType.toLowerCase())) {
        return false;
      }
    }

    // Check room types
    if (conditions.room_types && conditions.room_types.length > 0) {
      if (!zone.roomType || !conditions.room_types.map(r => r.toLowerCase()).includes(zone.roomType.toLowerCase())) {
        return false;
      }
    }

    // Check floor levels
    if (conditions.floor_levels && conditions.floor_levels.length > 0) {
      if (!zone.floorLevel || !conditions.floor_levels.includes(zone.floorLevel.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Fetch zones with all related data for an estimate
 */
async function fetchZonesWithRelations(estimateId: string): Promise<ZoneWithRelations[]> {
  // Fetch zones
  const { data: zones, error: zonesError } = await supabaseAdmin
    .from('estimate_zones')
    .select(`
      id,
      name,
      zone_type,
      length_ft,
      width_ft,
      height_ft,
      ceiling_height_ft,
      pitch,
      pitch_multiplier,
      dimensions,
      polygon_ft,
      sketch_polygon,
      damage_type,
      damage_severity,
      water_category,
      water_class,
      affected_surfaces,
      room_type,
      floor_level,
      area_id
    `)
    .eq('area_id', estimateId) // Note: We join through area -> structure -> estimate
    .order('sort_order');

  if (zonesError) {
    // Fallback: Try direct query
    const { data: directZones, error: directError } = await supabaseAdmin
      .from('estimate_zones')
      .select('*')
      .order('sort_order');

    if (directError) {
      throw new Error(`Failed to fetch zones: ${directError.message}`);
    }

    return (directZones || []).map(mapZoneFromDB);
  }

  // Map zones and fetch related data
  const result: ZoneWithRelations[] = [];

  for (const zone of zones || []) {
    // Fetch openings for this zone (including missing walls, doors, windows)
    const { data: openings } = await supabaseAdmin
      .from('zone_openings')
      .select('width_ft, height_ft, opening_type')
      .eq('zone_id', zone.id);

    // Fetch subrooms for this zone
    const { data: subrooms } = await supabaseAdmin
      .from('estimate_subrooms')
      .select('length_ft, width_ft, height_ft, is_addition')
      .eq('zone_id', zone.id);

    result.push({
      id: zone.id,
      name: zone.name,
      zoneType: zone.zone_type,
      lengthFt: parseFloat(zone.length_ft) || null,
      widthFt: parseFloat(zone.width_ft) || null,
      heightFt: parseFloat(zone.height_ft) || null,
      ceilingHeightFt: parseFloat(zone.ceiling_height_ft) || null,
      pitch: zone.pitch,
      pitchMultiplier: parseFloat(zone.pitch_multiplier) || null,
      dimensions: zone.dimensions,
      polygonFt: zone.polygon_ft,
      sketchPolygon: zone.sketch_polygon,
      damageType: zone.damage_type,
      damageSeverity: zone.damage_severity,
      waterCategory: zone.water_category,
      waterClass: zone.water_class,
      affectedSurfaces: zone.affected_surfaces,
      roomType: zone.room_type,
      floorLevel: zone.floor_level,
      missingWalls: (openings || []).map(op => ({
        widthFt: parseFloat(String(op.width_ft)),
        heightFt: parseFloat(String(op.height_ft)),
        quantity: 1, // zone_openings are individual items
      })),
      subrooms: (subrooms || []).map(sr => ({
        lengthFt: parseFloat(String(sr.length_ft)),
        widthFt: parseFloat(String(sr.width_ft)),
        heightFt: sr.height_ft ? parseFloat(String(sr.height_ft)) : undefined,
        isAddition: sr.is_addition,
      })),
    });
  }

  return result;
}

/**
 * Map zone from database format to internal format
 */
function mapZoneFromDB(zone: any): ZoneWithRelations {
  return {
    id: zone.id,
    name: zone.name,
    zoneType: zone.zone_type,
    lengthFt: parseFloat(zone.length_ft) || null,
    widthFt: parseFloat(zone.width_ft) || null,
    heightFt: parseFloat(zone.height_ft) || null,
    ceilingHeightFt: parseFloat(zone.ceiling_height_ft) || null,
    pitch: zone.pitch,
    pitchMultiplier: parseFloat(zone.pitch_multiplier) || null,
    dimensions: zone.dimensions,
    polygonFt: zone.polygon_ft,
    sketchPolygon: zone.sketch_polygon,
    damageType: zone.damage_type,
    damageSeverity: zone.damage_severity,
    waterCategory: zone.water_category,
    waterClass: zone.water_class,
    affectedSurfaces: zone.affected_surfaces,
    roomType: zone.room_type,
    floorLevel: zone.floor_level,
    missingWalls: [],
    subrooms: [],
  };
}

/**
 * Fetch active line items from catalog
 */
async function fetchCatalogLineItems(): Promise<CatalogLineItem[]> {
  const { data, error } = await supabaseAdmin
    .from('line_items')
    .select(`
      id,
      code,
      description,
      unit,
      trade_code,
      xactimate_code,
      quantity_formula,
      requires_items,
      auto_add_items,
      excludes_items,
      replaces_items,
      scope_conditions,
      default_coverage_code,
      is_active
    `)
    .eq('is_active', true)
    .order('trade_code')
    .order('code');

  if (error) {
    throw new Error(`Failed to fetch catalog: ${error.message}`);
  }

  return (data || []).map((item) => ({
    id: item.id,
    code: item.code,
    description: item.description,
    unit: item.unit,
    tradeCode: item.trade_code,
    xactCategoryCode: item.xactimate_code,
    defaultWasteFactor: 0, // Not in DB
    quantityFormula: item.quantity_formula,
    companionRules: {
      requires: item.requires_items,
      auto_adds: item.auto_add_items,
      excludes: item.excludes_items,
    },
    scopeConditions: item.scope_conditions,
    coverageType: item.default_coverage_code,
    activityType: 'install', // Default
    sortOrder: 0, // Not in DB
    isActive: item.is_active,
    notes: null,
  }));
}

/**
 * Save assembled scope items to database
 */
export async function saveScopeItems(
  items: AssembledScopeItem[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const { error } = await supabaseAdmin
      .from('scope_items')
      .insert(
        batch.map((item) => ({
          estimate_id: item.estimateId,
          zone_id: item.zoneId,
          wall_index: item.wallIndex,
          line_item_id: item.lineItemId,
          line_item_code: item.lineItemCode,
          quantity: item.quantity,
          unit: item.unit,
          waste_factor: item.wasteFactor,
          quantity_with_waste: item.quantityWithWaste,
          provenance: item.provenance,
          provenance_details: item.provenanceDetails,
          trade_code: item.tradeCode,
          coverage_type: item.coverageType,
          sort_order: item.sortOrder,
          status: item.status,
        }))
      );

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

/**
 * Clear existing scope items for an estimate
 */
export async function clearEstimateScope(estimateId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('scope_items')
    .delete()
    .eq('estimate_id', estimateId);

  if (error) {
    throw new Error(`Failed to clear scope: ${error.message}`);
  }
}

/**
 * Get scope items for an estimate
 */
export async function getScopeItems(estimateId: string): Promise<ScopeItem[]> {
  const { data, error } = await supabaseAdmin
    .from('scope_items')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('trade_code')
    .order('sort_order');

  if (error) {
    throw new Error(`Failed to fetch scope items: ${error.message}`);
  }

  return (data || []) as ScopeItem[];
}

// ============================================
// SUMMARY CALCULATIONS
// ============================================

/**
 * Calculate scope summary from assembled items
 */
function calculateScopeSummary(items: AssembledScopeItem[]): ScopeAssemblyResult['summary'] {
  const byTrade: Record<string, number> = {};
  const byUnit: Record<string, number> = {};

  for (const item of items) {
    byTrade[item.tradeCode] = (byTrade[item.tradeCode] || 0) + 1;
    byUnit[item.unit] = (byUnit[item.unit] || 0) + item.quantityWithWaste;
  }

  return {
    totalItems: items.length,
    byTrade,
    byUnit,
  };
}

/**
 * Update scope summary table for an estimate
 */
export async function updateScopeSummary(estimateId: string): Promise<void> {
  // Get all scope items grouped by trade
  const { data: items, error } = await supabaseAdmin
    .from('scope_items')
    .select('trade_code, unit, quantity_with_waste, status')
    .eq('estimate_id', estimateId);

  if (error) {
    throw new Error(`Failed to fetch scope items: ${error.message}`);
  }

  // Group by trade
  const tradeGroups = new Map<string, typeof items>();
  for (const item of items || []) {
    const existing = tradeGroups.get(item.trade_code) || [];
    existing.push(item);
    tradeGroups.set(item.trade_code, existing);
  }

  // Delete existing summaries
  await supabaseAdmin
    .from('scope_summary')
    .delete()
    .eq('estimate_id', estimateId);

  // Insert new summaries
  for (const [tradeCode, tradeItems] of tradeGroups) {
    const quantitiesByUnit: Record<string, number> = {};
    let pendingCount = 0;
    let approvedCount = 0;
    let excludedCount = 0;

    for (const item of tradeItems) {
      quantitiesByUnit[item.unit] = (quantitiesByUnit[item.unit] || 0) + parseFloat(item.quantity_with_waste);

      if (item.status === 'pending') pendingCount++;
      else if (item.status === 'approved') approvedCount++;
      else if (item.status === 'excluded') excludedCount++;
    }

    await supabaseAdmin
      .from('scope_summary')
      .insert({
        estimate_id: estimateId,
        trade_code: tradeCode,
        line_item_count: tradeItems.length,
        zone_count: new Set(tradeItems.map(i => i.zone_id)).size,
        quantities_by_unit: quantitiesByUnit,
        pending_count: pendingCount,
        approved_count: approvedCount,
        excluded_count: excludedCount,
      });
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  CatalogLineItem,
  ZoneWithRelations,
};
