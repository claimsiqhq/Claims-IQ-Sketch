/**
 * Sketch Service
 *
 * Handles sketch geometry persistence and retrieval for estimates.
 * Supports voice-first sketch creation workflow with canonical geometry model.
 *
 * KEY ENDPOINTS SUPPORTED:
 * - GET /api/estimates/:id/sketch - Retrieve sketch geometry
 * - PUT /api/estimates/:id/sketch - Update sketch geometry
 * - POST /api/estimates/:id/sketch/validate - Validate sketch for export
 *
 * See: docs/sketch-esx-architecture.md for architecture details.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  normalizeSketchGeometry,
  validateSketchForExport,
  calculateZoneDimensions,
  type SketchGeometry,
  type ValidationResult,
  type Point,
  type Opening,
} from '../../shared/geometry/index';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ZoneSketch {
  id: string;
  name: string;
  zoneCode?: string;
  zoneType: string;
  levelName: string;
  // Geometry
  originXFt: number;
  originYFt: number;
  polygonFt: Point[];
  shapeType: string;
  ceilingHeightFt: number;
  // Dimensions
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  // Openings
  openings: ZoneOpeningData[];
  // Connections
  connections: ZoneConnectionData[];
}

export interface ZoneOpeningData {
  id: string;
  openingType: string;
  wallIndex: number;
  offsetFromVertexFt: number;
  widthFt: number;
  heightFt: number;
  sillHeightFt?: number;
  connectsToZoneId?: string;
}

export interface ZoneConnectionData {
  id: string;
  toZoneId: string;
  toZoneName?: string;
  connectionType: string;
  openingId?: string;
}

export interface EstimateSketch {
  estimateId: string;
  lastUpdated: string | null;
  zones: ZoneSketch[];
  connections: ZoneConnectionData[];
  validation?: ValidationResult;
}

export interface SketchUpdateInput {
  zones: Array<{
    id?: string;
    name: string;
    zoneCode?: string;
    levelName?: string;
    originXFt: number;
    originYFt: number;
    polygonFt: Point[];
    shapeType?: string;
    ceilingHeightFt?: number;
    openings?: Array<{
      id?: string;
      openingType: string;
      wallIndex: number;
      offsetFromVertexFt: number;
      widthFt: number;
      heightFt: number;
      sillHeightFt?: number;
      connectsToZoneId?: string;
    }>;
  }>;
  connections?: Array<{
    id?: string;
    fromZoneId: string;
    toZoneId: string;
    connectionType: string;
    openingId?: string;
  }>;
}

// ============================================
// GET SKETCH
// ============================================

/**
 * Retrieve sketch geometry for an estimate
 */
export async function getEstimateSketch(estimateId: string): Promise<EstimateSketch> {
  // Verify estimate exists
  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .eq('id', estimateId)
    .maybeSingle();

  if (!estimate) {
    throw new Error(`Estimate ${estimateId} not found`);
  }

  // Fetch zones with their openings via the canonical geometry tables
  const { data: zones, error: zonesError } = await supabaseAdmin
    .from('estimate_zones')
    .select(`
      id,
      name,
      zone_code,
      zone_type,
      level_name,
      origin_x_ft,
      origin_y_ft,
      polygon_ft,
      shape_type,
      ceiling_height_ft,
      length_ft,
      width_ft,
      height_ft,
      updated_at,
      estimate_areas!inner(
        estimate_structures!inner(
          estimate_id
        )
      )
    `)
    .eq('estimate_areas.estimate_structures.estimate_id', estimateId)
    .eq('zone_type', 'room');

  if (zonesError) {
    throw new Error(`Failed to fetch zones: ${zonesError.message}`);
  }

  // Fetch openings for these zones
  const zoneIds = (zones || []).map((z: any) => z.id);
  let openingsMap: Map<string, ZoneOpeningData[]> = new Map();

  if (zoneIds.length > 0) {
    const { data: openings, error: openingsError } = await supabaseAdmin
      .from('zone_openings')
      .select('*')
      .in('zone_id', zoneIds)
      .order('sort_order', { ascending: true });

    if (openingsError) {
      console.warn(`Warning: Failed to fetch openings: ${openingsError.message}`);
    } else {
      // Group openings by zone
      for (const opening of openings || []) {
        const zoneOpenings = openingsMap.get(opening.zone_id) || [];
        zoneOpenings.push({
          id: opening.id,
          openingType: opening.opening_type,
          wallIndex: opening.wall_index,
          offsetFromVertexFt: parseFloat(opening.offset_from_vertex_ft) || 0,
          widthFt: parseFloat(opening.width_ft) || 0,
          heightFt: parseFloat(opening.height_ft) || 0,
          sillHeightFt: opening.sill_height_ft ? parseFloat(opening.sill_height_ft) : undefined,
          connectsToZoneId: opening.connects_to_zone_id || undefined,
        });
        openingsMap.set(opening.zone_id, zoneOpenings);
      }
    }
  }

  // Fetch connections
  const { data: connections, error: connectionsError } = await supabaseAdmin
    .from('zone_connections')
    .select(`
      id,
      from_zone_id,
      to_zone_id,
      connection_type,
      opening_id
    `)
    .eq('estimate_id', estimateId);

  if (connectionsError) {
    console.warn(`Warning: Failed to fetch connections: ${connectionsError.message}`);
  }

  // Build connections map (from zone's perspective)
  const connectionsMap: Map<string, ZoneConnectionData[]> = new Map();
  for (const conn of connections || []) {
    // Add to from_zone
    const fromConns = connectionsMap.get(conn.from_zone_id) || [];
    fromConns.push({
      id: conn.id,
      toZoneId: conn.to_zone_id,
      connectionType: conn.connection_type,
      openingId: conn.opening_id || undefined,
    });
    connectionsMap.set(conn.from_zone_id, fromConns);

    // Add reverse connection to to_zone
    const toConns = connectionsMap.get(conn.to_zone_id) || [];
    toConns.push({
      id: conn.id,
      toZoneId: conn.from_zone_id,
      connectionType: conn.connection_type,
      openingId: conn.opening_id || undefined,
    });
    connectionsMap.set(conn.to_zone_id, toConns);
  }

  // Transform zones
  let lastUpdated: string | null = null;
  const transformedZones: ZoneSketch[] = (zones || []).map((zone: any) => {
    if (zone.updated_at && (!lastUpdated || zone.updated_at > lastUpdated)) {
      lastUpdated = zone.updated_at;
    }

    return {
      id: zone.id,
      name: zone.name,
      zoneCode: zone.zone_code || undefined,
      zoneType: zone.zone_type,
      levelName: zone.level_name || 'Main Level',
      originXFt: parseFloat(zone.origin_x_ft) || 0,
      originYFt: parseFloat(zone.origin_y_ft) || 0,
      polygonFt: Array.isArray(zone.polygon_ft) ? zone.polygon_ft : [],
      shapeType: zone.shape_type || 'RECT',
      ceilingHeightFt: parseFloat(zone.ceiling_height_ft) || parseFloat(zone.height_ft) || 8,
      lengthFt: parseFloat(zone.length_ft) || 0,
      widthFt: parseFloat(zone.width_ft) || 0,
      heightFt: parseFloat(zone.height_ft) || 8,
      openings: openingsMap.get(zone.id) || [],
      connections: connectionsMap.get(zone.id) || [],
    };
  });

  // All connections for the estimate
  const allConnections: ZoneConnectionData[] = (connections || []).map((conn: any) => ({
    id: conn.id,
    toZoneId: conn.to_zone_id,
    connectionType: conn.connection_type,
    openingId: conn.opening_id || undefined,
  }));

  return {
    estimateId,
    lastUpdated,
    zones: transformedZones,
    connections: allConnections,
  };
}

// ============================================
// UPDATE SKETCH
// ============================================

/**
 * Update sketch geometry for an estimate
 * Supports partial updates - only zones included in the input are modified
 */
export async function updateEstimateSketch(
  estimateId: string,
  input: SketchUpdateInput
): Promise<EstimateSketch> {
  // Verify estimate exists and is not locked
  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .select('id, is_locked')
    .eq('id', estimateId)
    .maybeSingle();

  if (!estimate) {
    throw new Error(`Estimate ${estimateId} not found`);
  }

  if (estimate.is_locked) {
    throw new Error('Cannot modify a locked estimate');
  }

  // Get or create interior area
  const areaId = await getOrCreateInteriorArea(estimateId);

  // Process each zone
  for (const zone of input.zones) {
    const polygonFt = zone.polygonFt || [];
    const shapeType = zone.shapeType || 'RECT';
    const ceilingHeightFt = zone.ceilingHeightFt || 8;

    // Normalize and validate geometry
    const geometry: SketchGeometry = {
      polygonFt,
      originXFt: zone.originXFt || 0,
      originYFt: zone.originYFt || 0,
      ceilingHeightFt,
      shapeType: shapeType as 'RECT' | 'L' | 'T' | 'POLY',
      levelName: zone.levelName || 'Main Level',
      openings: zone.openings?.map(o => ({
        openingType: o.openingType,
        wallIndex: o.wallIndex,
        offsetFromVertexFt: o.offsetFromVertexFt,
        widthFt: o.widthFt,
        heightFt: o.heightFt,
        sillHeightFt: o.sillHeightFt,
      })),
    };

    const normalized = normalizeSketchGeometry(geometry);
    const dimensions = calculateZoneDimensions(normalized);

    // Calculate length/width from polygon bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of polygonFt) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const lengthFt = maxY - minY || zone.originYFt || 10;
    const widthFt = maxX - minX || zone.originXFt || 10;

    if (zone.id) {
      // Update existing zone
      const { error: updateError } = await supabaseAdmin
        .from('estimate_zones')
        .update({
          name: zone.name,
          zone_code: zone.zoneCode,
          level_name: zone.levelName || 'Main Level',
          origin_x_ft: zone.originXFt,
          origin_y_ft: zone.originYFt,
          polygon_ft: normalized.polygonFt,
          shape_type: shapeType,
          ceiling_height_ft: ceilingHeightFt,
          length_ft: lengthFt,
          width_ft: widthFt,
          height_ft: ceilingHeightFt,
          dimensions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', zone.id);

      if (updateError) {
        throw new Error(`Failed to update zone ${zone.id}: ${updateError.message}`);
      }

      // Update openings for this zone
      if (zone.openings) {
        await updateZoneOpenings(zone.id, zone.openings);
      }
    } else {
      // Create new zone
      const { data: newZone, error: insertError } = await supabaseAdmin
        .from('estimate_zones')
        .insert({
          area_id: areaId,
          name: zone.name,
          zone_code: zone.zoneCode,
          zone_type: 'room',
          status: 'measured',
          level_name: zone.levelName || 'Main Level',
          origin_x_ft: zone.originXFt,
          origin_y_ft: zone.originYFt,
          polygon_ft: normalized.polygonFt,
          shape_type: shapeType,
          ceiling_height_ft: ceilingHeightFt,
          length_ft: lengthFt,
          width_ft: widthFt,
          height_ft: ceilingHeightFt,
          dimensions,
        })
        .select('id')
        .single();

      if (insertError || !newZone) {
        throw new Error(`Failed to create zone: ${insertError?.message}`);
      }

      // Create openings for new zone
      if (zone.openings && zone.openings.length > 0) {
        await createZoneOpenings(newZone.id, zone.openings);
      }
    }
  }

  // Process connections if provided
  if (input.connections) {
    for (const conn of input.connections) {
      if (conn.id) {
        // Update existing connection
        const { error } = await supabaseAdmin
          .from('zone_connections')
          .update({
            from_zone_id: conn.fromZoneId,
            to_zone_id: conn.toZoneId,
            connection_type: conn.connectionType,
            opening_id: conn.openingId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);

        if (error) {
          console.warn(`Warning: Failed to update connection: ${error.message}`);
        }
      } else {
        // Create new connection
        const { error } = await supabaseAdmin
          .from('zone_connections')
          .insert({
            estimate_id: estimateId,
            from_zone_id: conn.fromZoneId,
            to_zone_id: conn.toZoneId,
            connection_type: conn.connectionType,
            opening_id: conn.openingId,
          });

        if (error) {
          console.warn(`Warning: Failed to create connection: ${error.message}`);
        }
      }
    }
  }

  // Return updated sketch
  return getEstimateSketch(estimateId);
}

// ============================================
// VALIDATE SKETCH
// ============================================

/**
 * Validate sketch geometry for export readiness
 */
export async function validateEstimateSketchForExport(estimateId: string): Promise<{
  isValid: boolean;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    validation: ValidationResult;
  }>;
}> {
  const sketch = await getEstimateSketch(estimateId);

  const zoneValidations = sketch.zones.map(zone => {
    const geometry: SketchGeometry = {
      polygonFt: zone.polygonFt,
      originXFt: zone.originXFt,
      originYFt: zone.originYFt,
      ceilingHeightFt: zone.ceilingHeightFt,
      shapeType: zone.shapeType as 'RECT' | 'L' | 'T' | 'POLY',
      levelName: zone.levelName,
      openings: zone.openings.map(o => ({
        openingType: o.openingType,
        wallIndex: o.wallIndex,
        offsetFromVertexFt: o.offsetFromVertexFt,
        widthFt: o.widthFt,
        heightFt: o.heightFt,
        sillHeightFt: o.sillHeightFt,
      })),
    };

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      validation: validateSketchForExport(geometry),
    };
  });

  const isValid = zoneValidations.every(v => v.validation.isValid);

  return {
    isValid,
    zones: zoneValidations,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get or create interior area for estimate
 */
async function getOrCreateInteriorArea(estimateId: string): Promise<string> {
  // First, try to find existing interior area
  const { data: existingArea } = await supabaseAdmin
    .from('estimate_areas')
    .select('id, estimate_structures!inner(estimate_id)')
    .eq('estimate_structures.estimate_id', estimateId)
    .eq('area_type', 'interior')
    .limit(1)
    .maybeSingle();

  if (existingArea) {
    return existingArea.id;
  }

  // Need to create hierarchy - first check for structure
  let structureId: string;
  const { data: existingStructure } = await supabaseAdmin
    .from('estimate_structures')
    .select('id')
    .eq('estimate_id', estimateId)
    .limit(1)
    .maybeSingle();

  if (existingStructure) {
    structureId = existingStructure.id;
  } else {
    // Create default structure
    const { data: newStructure, error: createStructureError } = await supabaseAdmin
      .from('estimate_structures')
      .insert({
        estimate_id: estimateId,
        name: 'Main Structure',
        sort_order: 0,
      })
      .select('id')
      .single();

    if (createStructureError || !newStructure) {
      throw new Error(`Failed to create structure: ${createStructureError?.message}`);
    }
    structureId = newStructure.id;
  }

  // Create interior area
  const { data: newArea, error: createAreaError } = await supabaseAdmin
    .from('estimate_areas')
    .insert({
      structure_id: structureId,
      name: 'Interior',
      area_type: 'interior',
      sort_order: 0,
    })
    .select('id')
    .single();

  if (createAreaError || !newArea) {
    throw new Error(`Failed to create area: ${createAreaError?.message}`);
  }

  return newArea.id;
}

/**
 * Update openings for a zone (delete existing, create new)
 */
async function updateZoneOpenings(
  zoneId: string,
  openings: Array<{
    id?: string;
    openingType: string;
    wallIndex: number;
    offsetFromVertexFt: number;
    widthFt: number;
    heightFt: number;
    sillHeightFt?: number;
    connectsToZoneId?: string;
  }>
): Promise<void> {
  // Delete existing openings
  const { error: deleteError } = await supabaseAdmin
    .from('zone_openings')
    .delete()
    .eq('zone_id', zoneId);

  if (deleteError) {
    console.warn(`Warning: Failed to delete existing openings: ${deleteError.message}`);
  }

  // Create new openings
  if (openings.length > 0) {
    await createZoneOpenings(zoneId, openings);
  }
}

/**
 * Create openings for a zone
 */
async function createZoneOpenings(
  zoneId: string,
  openings: Array<{
    openingType: string;
    wallIndex: number;
    offsetFromVertexFt: number;
    widthFt: number;
    heightFt: number;
    sillHeightFt?: number;
    connectsToZoneId?: string;
  }>
): Promise<void> {
  const openingRecords = openings.map((o, index) => ({
    zone_id: zoneId,
    opening_type: o.openingType,
    wall_index: o.wallIndex,
    offset_from_vertex_ft: o.offsetFromVertexFt,
    width_ft: o.widthFt,
    height_ft: o.heightFt,
    sill_height_ft: o.sillHeightFt,
    connects_to_zone_id: o.connectsToZoneId,
    sort_order: index,
  }));

  const { error } = await supabaseAdmin
    .from('zone_openings')
    .insert(openingRecords);

  if (error) {
    console.warn(`Warning: Failed to create openings: ${error.message}`);
  }
}
