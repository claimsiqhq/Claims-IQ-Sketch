/**
 * Sketch Tools Service
 *
 * Provides API-callable tools for autonomous sketch creation from structured output.
 * These tools are designed to be called by the OpenAI agent for floorplan creation.
 *
 * Tools:
 * - generate_floorplan_data: Generate structured floorplan data (rooms and connections)
 * - create_or_update_room: Create or update a room in the estimate sketch
 * - add_room_opening: Add an opening (door/window/cased) to a room wall
 * - add_missing_wall: Mark a missing wall segment for a room
 * - get_sketch_state: Retrieve current sketch state for an estimate
 *
 * VOICE-FIRST ARCHITECTURE:
 * =========================
 * This module supports the voice-first sketch creation workflow:
 * 1. User speaks room dimensions via OpenAI Realtime API
 * 2. Client-side geometry engine builds room polygons
 * 3. These tools persist geometry to estimate_zones table
 * 4. Geometry is stored in feet with CCW polygon winding
 *
 * All dimensions use feet as the canonical unit.
 * See: docs/sketch-esx-architecture.md for full architecture details.
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
import type {
  EstimateZone,
  EstimateMissingWall,
  ZoneDimensions,
} from '../../shared/schema';
import type { Point } from '../../shared/geometry';
import { distance } from '../../shared/geometry';
import type { Point } from '../../shared/geometry';
import { getWallDirection, distance } from '../../shared/geometry';
import type { Point } from '../../shared/geometry';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface RoomDimensions {
  length_ft: number;
  width_ft: number;
}

export interface RoomFeature {
  type: 'door' | 'window' | 'cased_opening' | 'missing_wall';
  wall: 'north' | 'south' | 'east' | 'west';
  width_inches?: number;
}

export interface FloorplanRoom {
  id: string;
  name: string;
  dimensions: RoomDimensions;
  features?: RoomFeature[];
}

export interface RoomConnection {
  from_room_id: string;
  to_room_id: string;
  via?: 'door' | 'cased_opening' | 'hallway' | 'open_plan';
}

export interface FloorplanData {
  rooms: FloorplanRoom[];
  connections?: RoomConnection[];
}

export interface CreateOrUpdateRoomInput {
  estimate_id: string;
  room_id: string;
  name: string;
  length_ft: number;
  width_ft: number;
}

export interface AddRoomOpeningInput {
  room_id: string;
  type: 'door' | 'window' | 'cased_opening';
  wall: 'north' | 'south' | 'east' | 'west';
  width_inches?: number;
}

export interface AddMissingWallInput {
  room_id: string;
  wall: 'north' | 'south' | 'east' | 'west';
}

export interface SketchStateRoom {
  id: string;
  name: string;
  length_ft: number;
  width_ft: number;
  height_ft: number;
  dimensions: ZoneDimensions;
  openings: SketchStateOpening[];
  missing_walls: SketchStateMissingWall[];
}

export interface SketchStateOpening {
  id: string;
  type: string;
  wall?: string;
  width_ft: number;
  height_ft: number;
}

export interface SketchStateMissingWall {
  id: string;
  wall: string;
  width_ft: number;
  height_ft: number;
}

export interface SketchState {
  estimate_id: string;
  rooms: SketchStateRoom[];
  room_count: number;
  last_updated: string | null;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the default interior area ID for an estimate, creating hierarchy if needed
 */
async function getOrCreateInteriorArea(estimateId: string): Promise<string> {
  // First, try to find existing interior area
  const { data: existingArea, error: areaError } = await supabaseAdmin
    .from('estimate_areas')
    .select('id, estimate_structures!inner(estimate_id)')
    .eq('estimate_structures.estimate_id', estimateId)
    .eq('area_type', 'interior')
    .limit(1)
    .maybeSingle();

  if (existingArea) {
    return existingArea.id;
  }

  // Need to create the hierarchy - first check for structure
  let structureId: string;
  const { data: existingStructure, error: structureError } = await supabaseAdmin
    .from('estimate_structures')
    .select('id')
    .eq('estimate_id', estimateId)
    .limit(1)
    .maybeSingle();

  if (existingStructure) {
    structureId = existingStructure.id;
  } else {
    // Create a default structure
    const { data: newStructure, error: createStructureError } = await supabaseAdmin
      .from('estimate_structures')
      .insert({
        estimate_id: estimateId,
        name: 'Main Structure',
        sort_order: 0
      })
      .select('id')
      .single();

    if (createStructureError || !newStructure) {
      throw new Error(`Failed to create structure: ${createStructureError?.message}`);
    }
    structureId = newStructure.id;
  }

  // Create the interior area
  const { data: newArea, error: createAreaError } = await supabaseAdmin
    .from('estimate_areas')
    .insert({
      structure_id: structureId,
      name: 'Interior',
      area_type: 'interior',
      sort_order: 0
    })
    .select('id')
    .single();

  if (createAreaError || !newArea) {
    throw new Error(`Failed to create area: ${createAreaError?.message}`);
  }

  return newArea.id;
}

/**
 * Calculate zone dimensions based on room dimensions
 */
function calculateZoneDimensions(lengthFt: number, widthFt: number, heightFt: number = 8): ZoneDimensions {
  const perimeterLf = 2 * (lengthFt + widthFt);
  const floorSf = lengthFt * widthFt;
  const wallSf = perimeterLf * heightFt;
  const longWallLength = Math.max(lengthFt, widthFt);
  const shortWallLength = Math.min(lengthFt, widthFt);

  return {
    sfFloor: floorSf,
    syFloor: floorSf / 9, // Square yards
    lfFloorPerim: perimeterLf,
    sfCeiling: floorSf,
    lfCeilingPerim: perimeterLf,
    sfWalls: wallSf,
    sfWallsCeiling: wallSf + floorSf,
    sfLongWall: longWallLength * heightFt,
    sfShortWall: shortWallLength * heightFt,
    sfTotal: floorSf + wallSf + floorSf, // Floor + walls + ceiling
  };
}

/**
 * Map wall direction to opening metadata
 */
function getWallMetadata(wall: string): { opensInto: string } {
  const wallMap: Record<string, string> = {
    north: 'North Exterior',
    south: 'South Exterior',
    east: 'East Exterior',
    west: 'West Exterior',
  };
  return { opensInto: wallMap[wall] || 'Exterior' };
}

/**
 * Convert wall name (north/south/east/west) to wall index based on polygon
 * For rectangular rooms, this maps:
 * - north -> wall 0 (top edge)
 * - east -> wall 1 (right edge)
 * - south -> wall 2 (bottom edge)
 * - west -> wall 3 (left edge)
 * 
 * For non-rectangular rooms, we analyze the polygon to find the matching wall
 */
async function getWallIndexFromName(
  zoneId: string,
  wallName: string,
  polygonFt?: Point[]
): Promise<number> {
  // If polygon provided, use it; otherwise fetch from database
  let polygon: Point[];
  
  if (polygonFt) {
    polygon = polygonFt;
  } else {
    const { data: zone, error } = await supabaseAdmin
      .from('estimate_zones')
      .select('polygon_ft')
      .eq('id', zoneId)
      .single();
    
    if (error || !zone || !zone.polygon_ft) {
      throw new Error(`Zone ${zoneId} not found or has no polygon`);
    }
    
    polygon = zone.polygon_ft as Point[];
  }
  
  if (polygon.length < 3) {
    throw new Error(`Invalid polygon for zone ${zoneId}`);
  }
  
  // For rectangular rooms (4 points), use simple mapping
  if (polygon.length === 4) {
    const wallMap: Record<string, number> = {
      north: 0, // Top edge
      east: 1,  // Right edge
      south: 2, // Bottom edge
      west: 3,  // Left edge
    };
    
    if (wallMap[wallName] !== undefined) {
      return wallMap[wallName];
    }
  }
  
  // For non-rectangular rooms, analyze polygon to find matching wall
  // Calculate bounding box to determine orientation
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  
  // Find wall that matches the direction
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    
    // Check if this wall matches the requested direction
    if (wallName === 'north' && Math.abs(dy) < 0.1 && p1.y < (minY + maxY) / 2) {
      return i;
    }
    if (wallName === 'south' && Math.abs(dy) < 0.1 && p1.y > (minY + maxY) / 2) {
      return i;
    }
    if (wallName === 'east' && Math.abs(dx) < 0.1 && p1.x > (minX + maxX) / 2) {
      return i;
    }
    if (wallName === 'west' && Math.abs(dx) < 0.1 && p1.x < (minX + maxX) / 2) {
      return i;
    }
  }
  
  // Fallback: return first wall
  return 0;
}

/**
 * Calculate offset from vertex for wall center placement
 */
function getWallCenterOffset(polygon: Point[], wallIndex: number): number {
  if (wallIndex < 0 || wallIndex >= polygon.length) {
    return 0;
  }
  
  const p1 = polygon[wallIndex];
  const p2 = polygon[(wallIndex + 1) % polygon.length];
  
  return distance(p1, p2) / 2;
}

// ============================================
// TOOL #1: GENERATE FLOORPLAN DATA
// ============================================

/**
 * Generate structured floorplan data (rooms and connections) from input.
 * This is a validation/transformation tool that does not persist data.
 *
 * @param data - The floorplan data to validate and structure
 * @returns Validated and structured floorplan data
 */
export async function generateFloorplanData(data: FloorplanData): Promise<ToolResult<FloorplanData>> {
  try {
    // Validate rooms array
    if (!data.rooms || !Array.isArray(data.rooms)) {
      return {
        success: false,
        error: 'Invalid input: rooms array is required',
      };
    }

    if (data.rooms.length === 0) {
      return {
        success: false,
        error: 'Invalid input: at least one room is required',
      };
    }

    // Validate each room
    const validatedRooms: FloorplanRoom[] = [];
    const roomIds = new Set<string>();

    for (const room of data.rooms) {
      // Check required fields
      if (!room.id || typeof room.id !== 'string') {
        return {
          success: false,
          error: `Invalid room: missing or invalid id`,
        };
      }

      if (roomIds.has(room.id)) {
        return {
          success: false,
          error: `Duplicate room id: ${room.id}`,
        };
      }
      roomIds.add(room.id);

      if (!room.name || typeof room.name !== 'string') {
        return {
          success: false,
          error: `Invalid room ${room.id}: missing or invalid name`,
        };
      }

      if (!room.dimensions || typeof room.dimensions !== 'object') {
        return {
          success: false,
          error: `Invalid room ${room.id}: missing dimensions`,
        };
      }

      if (typeof room.dimensions.length_ft !== 'number' || room.dimensions.length_ft <= 0) {
        return {
          success: false,
          error: `Invalid room ${room.id}: length_ft must be a positive number`,
        };
      }

      if (typeof room.dimensions.width_ft !== 'number' || room.dimensions.width_ft <= 0) {
        return {
          success: false,
          error: `Invalid room ${room.id}: width_ft must be a positive number`,
        };
      }

      // Validate features if present
      const validatedFeatures: RoomFeature[] = [];
      if (room.features && Array.isArray(room.features)) {
        for (const feature of room.features) {
          const validTypes = ['door', 'window', 'cased_opening', 'missing_wall'];
          const validWalls = ['north', 'south', 'east', 'west'];

          if (!feature.type || !validTypes.includes(feature.type)) {
            return {
              success: false,
              error: `Invalid feature in room ${room.id}: type must be one of ${validTypes.join(', ')}`,
            };
          }

          if (!feature.wall || !validWalls.includes(feature.wall)) {
            return {
              success: false,
              error: `Invalid feature in room ${room.id}: wall must be one of ${validWalls.join(', ')}`,
            };
          }

          validatedFeatures.push({
            type: feature.type,
            wall: feature.wall,
            width_inches: feature.width_inches,
          });
        }
      }

      validatedRooms.push({
        id: room.id,
        name: room.name,
        dimensions: room.dimensions,
        features: validatedFeatures.length > 0 ? validatedFeatures : undefined,
      });
    }

    // Validate connections if present
    const validatedConnections: RoomConnection[] = [];
    if (data.connections && Array.isArray(data.connections)) {
      for (const conn of data.connections) {
        if (!conn.from_room_id || !roomIds.has(conn.from_room_id)) {
          return {
            success: false,
            error: `Invalid connection: from_room_id "${conn.from_room_id}" does not exist`,
          };
        }

        if (!conn.to_room_id || !roomIds.has(conn.to_room_id)) {
          return {
            success: false,
            error: `Invalid connection: to_room_id "${conn.to_room_id}" does not exist`,
          };
        }

        if (conn.from_room_id === conn.to_room_id) {
          return {
            success: false,
            error: `Invalid connection: room cannot connect to itself`,
          };
        }

        const validVias = ['door', 'cased_opening', 'hallway', 'open_plan'];
        if (conn.via && !validVias.includes(conn.via)) {
          return {
            success: false,
            error: `Invalid connection via: must be one of ${validVias.join(', ')}`,
          };
        }

        validatedConnections.push({
          from_room_id: conn.from_room_id,
          to_room_id: conn.to_room_id,
          via: conn.via,
        });
      }
    }

    return {
      success: true,
      data: {
        rooms: validatedRooms,
        connections: validatedConnections.length > 0 ? validatedConnections : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate floorplan data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// TOOL #2: CREATE OR UPDATE ROOM
// ============================================

/**
 * Create or update a room in the estimate sketch.
 * Creates the room as a zone in the estimate hierarchy.
 *
 * @param input - Room creation/update parameters
 * @returns The created or updated room data
 */
export async function createOrUpdateRoom(input: CreateOrUpdateRoomInput): Promise<ToolResult<SketchStateRoom>> {
  try {
    // Validate input
    if (!input.estimate_id) {
      return { success: false, error: 'estimate_id is required' };
    }
    if (!input.room_id) {
      return { success: false, error: 'room_id is required' };
    }
    if (!input.name || input.name.trim() === '') {
      return { success: false, error: 'name is required' };
    }
    if (typeof input.length_ft !== 'number' || input.length_ft <= 0) {
      return { success: false, error: 'length_ft must be a positive number' };
    }
    if (typeof input.width_ft !== 'number' || input.width_ft <= 0) {
      return { success: false, error: 'width_ft must be a positive number' };
    }

    // Check if estimate exists and is not locked
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id, is_locked')
      .eq('id', input.estimate_id)
      .maybeSingle();

    if (!estimate) {
      return { success: false, error: `Estimate ${input.estimate_id} not found` };
    }

    if (estimate.is_locked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const heightFt = 8; // Default ceiling height
    const dimensions = calculateZoneDimensions(input.length_ft, input.width_ft, heightFt);

    // Check if zone with this room_id already exists
    const { data: existingZone, error: zoneError } = await supabaseAdmin
      .from('estimate_zones')
      .select('id, area_id, estimate_areas!inner(estimate_structures!inner(estimate_id))')
      .eq('estimate_areas.estimate_structures.estimate_id', input.estimate_id)
      .eq('zone_code', input.room_id)
      .maybeSingle();

    let zoneId: string;

    if (existingZone) {
      // Update existing zone
      zoneId = existingZone.id;
      const { error: updateError } = await supabaseAdmin
        .from('estimate_zones')
        .update({
          name: input.name,
          length_ft: input.length_ft,
          width_ft: input.width_ft,
          height_ft: heightFt,
          dimensions: dimensions,
          updated_at: new Date().toISOString()
        })
        .eq('id', zoneId);

      if (updateError) {
        throw new Error(`Failed to update zone: ${updateError.message}`);
      }
    } else {
      // Create new zone
      const areaId = await getOrCreateInteriorArea(input.estimate_id);

      // Get next sort order
      const { data: maxOrderData, error: orderError } = await supabaseAdmin
        .from('estimate_zones')
        .select('sort_order')
        .eq('area_id', areaId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = maxOrderData ? (maxOrderData.sort_order + 1) : 0;

      const { data: insertResult, error: insertError } = await supabaseAdmin
        .from('estimate_zones')
        .insert({
          area_id: areaId,
          name: input.name,
          zone_code: input.room_id,
          zone_type: 'room',
          status: 'measured',
          length_ft: input.length_ft,
          width_ft: input.width_ft,
          height_ft: heightFt,
          dimensions: dimensions,
          sort_order: sortOrder
        })
        .select('id')
        .single();

      if (insertError || !insertResult) {
        throw new Error(`Failed to insert zone: ${insertError?.message}`);
      }
      zoneId = insertResult.id;
    }

    // Fetch the complete room state
    const { data: zone, error: fetchError } = await supabaseAdmin
      .from('estimate_zones')
      .select('*')
      .eq('id', zoneId)
      .single();

    if (fetchError || !zone) {
      throw new Error(`Failed to fetch zone: ${fetchError?.message}`);
    }

    // Fetch openings from zone_openings table
    const { data: openings, error: openingsError } = await supabaseAdmin
      .from('zone_openings')
      .select('*')
      .eq('zone_id', zoneId)
      .order('sort_order', { ascending: true });

    const polygon = zone.polygon_ft as Point[] | null;
    
    // Helper to convert wall index back to wall name (for compatibility)
    const getWallNameFromIndex = (wallIndex: number): string => {
      if (!polygon || polygon.length !== 4) {
        return `wall_${wallIndex}`;
      }
      const wallMap: Record<number, string> = {
        0: 'north',
        1: 'east',
        2: 'south',
        3: 'west',
      };
      return wallMap[wallIndex] || `wall_${wallIndex}`;
    };

    const room: SketchStateRoom = {
      id: zone.zone_code || zone.id,
      name: zone.name,
      length_ft: parseFloat(zone.length_ft) || 0,
      width_ft: parseFloat(zone.width_ft) || 0,
      height_ft: parseFloat(zone.height_ft) || 8,
      dimensions: zone.dimensions || {},
      openings: (openings || [])
        .filter((o: any) => o.opening_type !== 'missing_wall')
        .map((o: any) => ({
          id: o.id,
          type: o.opening_type,
          wall: getWallNameFromIndex(o.wall_index),
          width_ft: parseFloat(o.width_ft) || 0,
          height_ft: parseFloat(o.height_ft) || 0,
        })),
      missing_walls: (openings || [])
        .filter((o: any) => o.opening_type === 'missing_wall')
        .map((o: any) => ({
          id: o.id,
          wall: getWallNameFromIndex(o.wall_index),
          width_ft: parseFloat(o.width_ft) || 0,
          height_ft: parseFloat(o.height_ft) || 0,
        })),
    };

    return { success: true, data: room };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create/update room: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// TOOL #3: ADD ROOM OPENING
// ============================================

/**
 * Add an opening (door/window/cased) to a room wall.
 *
 * @param input - Opening parameters
 * @returns The created opening data
 */
export async function addRoomOpening(input: AddRoomOpeningInput): Promise<ToolResult<SketchStateOpening>> {
  try {
    // Validate input
    if (!input.room_id) {
      return { success: false, error: 'room_id is required' };
    }

    const validTypes = ['door', 'window', 'cased_opening'];
    if (!input.type || !validTypes.includes(input.type)) {
      return { success: false, error: `type must be one of: ${validTypes.join(', ')}` };
    }

    const validWalls = ['north', 'south', 'east', 'west'];
    if (!input.wall || !validWalls.includes(input.wall)) {
      return { success: false, error: `wall must be one of: ${validWalls.join(', ')}` };
    }

    // Find the zone by room_id (zone_code) - try both zone_code and id
    const { data: zoneByCode, error: zoneByCodeError } = await supabaseAdmin
      .from('estimate_zones')
      .select('id, estimate_areas!inner(estimate_structures!inner(estimate_id, estimates!inner(is_locked)))')
      .eq('zone_code', input.room_id)
      .maybeSingle();

    let zone = zoneByCode;

    if (!zone) {
      // Try by id if zone_code didn't match
      const { data: zoneById, error: zoneByIdError } = await supabaseAdmin
        .from('estimate_zones')
        .select('id, estimate_areas!inner(estimate_structures!inner(estimate_id, estimates!inner(is_locked)))')
        .eq('id', input.room_id)
        .maybeSingle();
      zone = zoneById;
    }

    if (!zone) {
      return { success: false, error: `Room ${input.room_id} not found` };
    }

    const estimateData: any = zone.estimate_areas;
    const isLocked = estimateData?.estimate_structures?.estimates?.is_locked;

    if (isLocked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const zoneId = zone.id;

    // Set default dimensions based on opening type
    let widthFt: number;
    let heightFt: number;

    if (input.width_inches && input.width_inches > 0) {
      widthFt = input.width_inches / 12;
    } else {
      // Default widths
      widthFt = input.type === 'window' ? 3 : 3; // 3 feet default for both
    }

    // Default heights
    switch (input.type) {
      case 'door':
        heightFt = 6.67; // 6'8"
        break;
      case 'window':
        heightFt = 4;
        break;
      case 'cased_opening':
        heightFt = 6.67;
        break;
      default:
        heightFt = 6.67;
    }

    // Get zone polygon to determine wall index
    const { data: zoneData, error: zoneDataError } = await supabaseAdmin
      .from('estimate_zones')
      .select('polygon_ft')
      .eq('id', zoneId)
      .single();

    if (zoneDataError || !zoneData || !zoneData.polygon_ft) {
      return { success: false, error: `Zone ${zoneId} not found or has no polygon geometry` };
    }

    const polygon = zoneData.polygon_ft as Point[];
    const wallIndex = await getWallIndexFromName(zoneId, input.wall, polygon);
    const offsetFromVertexFt = getWallCenterOffset(polygon, wallIndex);

    // Check for duplicate opening on same wall at similar position
    const { data: existingOpening, error: checkError } = await supabaseAdmin
      .from('zone_openings')
      .select('id')
      .eq('zone_id', zoneId)
      .eq('wall_index', wallIndex)
      .eq('opening_type', input.type)
      .maybeSingle();

    if (existingOpening) {
      return {
        success: false,
        error: `A ${input.type} already exists on the ${input.wall} wall. Use add_missing_wall for multiple openings or update the existing one.`,
      };
    }

    // Get next sort order
    const { data: maxOrderData, error: orderError } = await supabaseAdmin
      .from('zone_openings')
      .select('sort_order')
      .eq('zone_id', zoneId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = maxOrderData ? (maxOrderData.sort_order + 1) : 0;

    // Insert the opening into zone_openings
    const { data: insertResult, error: insertError } = await supabaseAdmin
      .from('zone_openings')
      .insert({
        zone_id: zoneId,
        opening_type: input.type,
        wall_index: wallIndex,
        offset_from_vertex_ft: offsetFromVertexFt,
        width_ft: widthFt,
        height_ft: heightFt,
        sill_height_ft: input.type === 'window' ? heightFt / 2 : null,
        sort_order: sortOrder
      })
      .select('id, opening_type, wall_index, width_ft, height_ft')
      .single();

    if (insertError || !insertResult) {
      throw new Error(`Failed to insert opening: ${insertError?.message}`);
    }

    return {
      success: true,
      data: {
        id: insertResult.id,
        type: insertResult.opening_type,
        wall: input.wall, // Return the original wall name for compatibility
        width_ft: parseFloat(insertResult.width_ft),
        height_ft: parseFloat(insertResult.height_ft),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add opening: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// TOOL #4: ADD MISSING WALL
// ============================================

/**
 * Mark a missing wall segment for a room.
 * Missing walls are used to indicate open areas where a wall would typically be.
 *
 * @param input - Missing wall parameters
 * @returns The created missing wall data
 */
export async function addMissingWall(input: AddMissingWallInput): Promise<ToolResult<SketchStateMissingWall>> {
  try {
    // Validate input
    if (!input.room_id) {
      return { success: false, error: 'room_id is required' };
    }

    const validWalls = ['north', 'south', 'east', 'west'];
    if (!input.wall || !validWalls.includes(input.wall)) {
      return { success: false, error: `wall must be one of: ${validWalls.join(', ')}` };
    }

    // Find the zone by room_id (zone_code) - try both zone_code and id
    const { data: zoneByCode, error: zoneByCodeError } = await supabaseAdmin
      .from('estimate_zones')
      .select('id, length_ft, width_ft, height_ft, estimate_areas!inner(estimate_structures!inner(estimate_id, estimates!inner(is_locked)))')
      .eq('zone_code', input.room_id)
      .maybeSingle();

    let zone = zoneByCode;

    if (!zone) {
      // Try by id if zone_code didn't match
      const { data: zoneById, error: zoneByIdError } = await supabaseAdmin
        .from('estimate_zones')
        .select('id, length_ft, width_ft, height_ft, estimate_areas!inner(estimate_structures!inner(estimate_id, estimates!inner(is_locked)))')
        .eq('id', input.room_id)
        .maybeSingle();
      zone = zoneById;
    }

    if (!zone) {
      return { success: false, error: `Room ${input.room_id} not found` };
    }

    const estimateData: any = zone.estimate_areas;
    const isLocked = estimateData?.estimate_structures?.estimates?.is_locked;

    if (isLocked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const zoneId = zone.id;

    // Calculate wall width based on wall direction
    let wallWidthFt: number;
    if (input.wall === 'north' || input.wall === 'south') {
      wallWidthFt = parseFloat(zone.width_ft) || 10;
    } else {
      wallWidthFt = parseFloat(zone.length_ft) || 10;
    }
    const wallHeightFt = parseFloat(zone.height_ft) || 8;

    // Check for duplicate missing wall
    const { data: existingWall, error: checkError } = await supabaseAdmin
      .from('estimate_missing_walls')
      .select('id')
      .eq('zone_id', zoneId)
      .eq('name', input.wall)
      .eq('opening_type', 'missing_wall')
      .maybeSingle();

    if (existingWall) {
      return {
        success: false,
        error: `A missing wall already exists on the ${input.wall} wall`,
      };
    }

    // Get next sort order
    const { data: maxOrderData, error: orderError } = await supabaseAdmin
      .from('estimate_missing_walls')
      .select('sort_order')
      .eq('zone_id', zoneId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = maxOrderData ? (maxOrderData.sort_order + 1) : 0;

    // Insert the missing wall
    const { data: insertResult, error: insertError } = await supabaseAdmin
      .from('estimate_missing_walls')
      .insert({
        zone_id: zoneId,
        name: input.wall,
        opening_type: 'missing_wall',
        width_ft: wallWidthFt,
        height_ft: wallHeightFt,
        quantity: 1,
        goes_to_floor: true,
        goes_to_ceiling: true,
        opens_into: 'Adjacent Room',
        sort_order: sortOrder
      })
      .select('id, name, width_ft, height_ft')
      .single();

    if (insertError || !insertResult) {
      throw new Error(`Failed to insert missing wall: ${insertError?.message}`);
    }

    return {
      success: true,
      data: {
        id: insertResult.id,
        wall: insertResult.name,
        width_ft: parseFloat(insertResult.width_ft),
        height_ft: parseFloat(insertResult.height_ft),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add missing wall: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// TOOL #5: GET SKETCH STATE
// ============================================

/**
 * Retrieve current sketch state for an estimate.
 * Returns all rooms with their openings and missing walls.
 *
 * @param estimateId - The estimate ID to get sketch state for
 * @returns The current sketch state
 */
export async function getSketchState(estimateId: string): Promise<ToolResult<SketchState>> {
  try {
    // Validate input
    if (!estimateId) {
      return { success: false, error: 'estimate_id is required' };
    }

    // Check if estimate exists
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id')
      .eq('id', estimateId)
      .maybeSingle();

    if (!estimate) {
      return { success: false, error: `Estimate ${estimateId} not found` };
    }

    // Fetch all zones with their openings
    const { data: zones, error: zonesError } = await supabaseAdmin
      .from('estimate_zones')
      .select(`
        id,
        zone_code,
        name,
        length_ft,
        width_ft,
        height_ft,
        dimensions,
        updated_at,
        created_at,
        sort_order,
        estimate_areas!inner(
          estimate_structures!inner(
            estimate_id
          )
        ),
        estimate_missing_walls(*)
      `)
      .eq('estimate_areas.estimate_structures.estimate_id', estimateId)
      .eq('zone_type', 'room')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (zonesError) {
      throw new Error(`Failed to fetch zones: ${zonesError.message}`);
    }

    let lastUpdated: string | null = null;
    const rooms: SketchStateRoom[] = (zones || []).map((row: any) => {
      if (row.updated_at && (!lastUpdated || row.updated_at > lastUpdated)) {
        lastUpdated = row.updated_at;
      }

      const openings = row.estimate_missing_walls || [];
      return {
        id: row.zone_code || row.id,
        name: row.name,
        length_ft: parseFloat(row.length_ft) || 0,
        width_ft: parseFloat(row.width_ft) || 0,
        height_ft: parseFloat(row.height_ft) || 8,
        dimensions: row.dimensions || {},
        openings: openings
          .filter((o: any) => o.id && o.opening_type !== 'missing_wall')
          .map((o: any) => ({
            id: o.id,
            type: o.opening_type,
            wall: o.name,
            width_ft: parseFloat(o.width_ft) || 0,
            height_ft: parseFloat(o.height_ft) || 0,
          })),
        missing_walls: openings
          .filter((o: any) => o.id && o.opening_type === 'missing_wall')
          .map((o: any) => ({
            id: o.id,
            wall: o.name,
            width_ft: parseFloat(o.width_ft) || 0,
            height_ft: parseFloat(o.height_ft) || 0,
          })),
      };
    });

    return {
      success: true,
      data: {
        estimate_id: estimateId,
        rooms,
        room_count: rooms.length,
        last_updated: lastUpdated,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get sketch state: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
