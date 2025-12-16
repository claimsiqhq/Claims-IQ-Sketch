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
 */

import { pool } from '../db';
import type { PoolClient } from 'pg';
import type {
  EstimateZone,
  EstimateMissingWall,
  ZoneDimensions,
} from '../../shared/schema';

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
async function getOrCreateInteriorArea(client: PoolClient, estimateId: string): Promise<string> {
  // First, try to find existing interior area
  const existingArea = await client.query(`
    SELECT ea.id
    FROM estimate_areas ea
    JOIN estimate_structures es ON ea.structure_id = es.id
    WHERE es.estimate_id = $1 AND ea.area_type = 'interior'
    LIMIT 1
  `, [estimateId]);

  if (existingArea.rows.length > 0) {
    return existingArea.rows[0].id;
  }

  // Need to create the hierarchy - first check for structure
  let structureId: string;
  const existingStructure = await client.query(`
    SELECT id FROM estimate_structures WHERE estimate_id = $1 LIMIT 1
  `, [estimateId]);

  if (existingStructure.rows.length > 0) {
    structureId = existingStructure.rows[0].id;
  } else {
    // Create a default structure
    const newStructure = await client.query(`
      INSERT INTO estimate_structures (estimate_id, name, sort_order)
      VALUES ($1, 'Main Structure', 0)
      RETURNING id
    `, [estimateId]);
    structureId = newStructure.rows[0].id;
  }

  // Create the interior area
  const newArea = await client.query(`
    INSERT INTO estimate_areas (structure_id, name, area_type, sort_order)
    VALUES ($1, 'Interior', 'interior', 0)
    RETURNING id
  `, [structureId]);

  return newArea.rows[0].id;
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
  const client = await pool.connect();
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
    const estimateCheck = await client.query(
      'SELECT id, is_locked FROM estimates WHERE id = $1',
      [input.estimate_id]
    );

    if (estimateCheck.rows.length === 0) {
      return { success: false, error: `Estimate ${input.estimate_id} not found` };
    }

    if (estimateCheck.rows[0].is_locked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const heightFt = 8; // Default ceiling height
    const dimensions = calculateZoneDimensions(input.length_ft, input.width_ft, heightFt);

    // Check if zone with this room_id already exists
    const existingZone = await client.query(`
      SELECT ez.id, ez.area_id
      FROM estimate_zones ez
      JOIN estimate_areas ea ON ez.area_id = ea.id
      JOIN estimate_structures es ON ea.structure_id = es.id
      WHERE es.estimate_id = $1 AND ez.zone_code = $2
    `, [input.estimate_id, input.room_id]);

    let zoneId: string;

    if (existingZone.rows.length > 0) {
      // Update existing zone
      zoneId = existingZone.rows[0].id;
      await client.query(`
        UPDATE estimate_zones SET
          name = $2,
          length_ft = $3,
          width_ft = $4,
          height_ft = $5,
          dimensions = $6,
          updated_at = NOW()
        WHERE id = $1
      `, [
        zoneId,
        input.name,
        input.length_ft,
        input.width_ft,
        heightFt,
        JSON.stringify(dimensions),
      ]);
    } else {
      // Create new zone
      const areaId = await getOrCreateInteriorArea(client, input.estimate_id);

      // Get next sort order
      const orderResult = await client.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_zones WHERE area_id = $1',
        [areaId]
      );
      const sortOrder = orderResult.rows[0].next_order;

      const insertResult = await client.query(`
        INSERT INTO estimate_zones (
          area_id, name, zone_code, zone_type, status,
          length_ft, width_ft, height_ft, dimensions, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        areaId,
        input.name,
        input.room_id,
        'room',
        'measured',
        input.length_ft,
        input.width_ft,
        heightFt,
        JSON.stringify(dimensions),
        sortOrder,
      ]);
      zoneId = insertResult.rows[0].id;
    }

    // Fetch the complete room state
    const roomResult = await client.query(`
      SELECT ez.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'id', emw.id,
          'type', emw.opening_type,
          'wall', emw.name,
          'width_ft', emw.width_ft,
          'height_ft', emw.height_ft
        )) FILTER (WHERE emw.id IS NOT NULL), '[]') as openings
      FROM estimate_zones ez
      LEFT JOIN estimate_missing_walls emw ON ez.id = emw.zone_id
      WHERE ez.id = $1
      GROUP BY ez.id
    `, [zoneId]);

    const row = roomResult.rows[0];
    const room: SketchStateRoom = {
      id: row.zone_code || row.id,
      name: row.name,
      length_ft: parseFloat(row.length_ft) || 0,
      width_ft: parseFloat(row.width_ft) || 0,
      height_ft: parseFloat(row.height_ft) || 8,
      dimensions: row.dimensions || {},
      openings: row.openings
        .filter((o: any) => o.id && o.type !== 'missing_wall')
        .map((o: any) => ({
          id: o.id,
          type: o.type,
          wall: o.wall,
          width_ft: parseFloat(o.width_ft) || 0,
          height_ft: parseFloat(o.height_ft) || 0,
        })),
      missing_walls: row.openings
        .filter((o: any) => o.id && o.type === 'missing_wall')
        .map((o: any) => ({
          id: o.id,
          wall: o.wall,
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
  } finally {
    client.release();
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
  const client = await pool.connect();
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

    // Find the zone by room_id (zone_code)
    const zoneResult = await client.query(`
      SELECT ez.id, es.estimate_id, e.is_locked
      FROM estimate_zones ez
      JOIN estimate_areas ea ON ez.area_id = ea.id
      JOIN estimate_structures es ON ea.structure_id = es.id
      JOIN estimates e ON es.estimate_id = e.id
      WHERE ez.zone_code = $1 OR ez.id::text = $1
    `, [input.room_id]);

    if (zoneResult.rows.length === 0) {
      return { success: false, error: `Room ${input.room_id} not found` };
    }

    if (zoneResult.rows[0].is_locked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const zoneId = zoneResult.rows[0].id;

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

    // Check for duplicate opening on same wall
    const existingOpening = await client.query(`
      SELECT id FROM estimate_missing_walls
      WHERE zone_id = $1 AND name = $2 AND opening_type = $3
    `, [zoneId, input.wall, input.type]);

    if (existingOpening.rows.length > 0) {
      return {
        success: false,
        error: `A ${input.type} already exists on the ${input.wall} wall. Use add_missing_wall for multiple openings or update the existing one.`,
      };
    }

    const { opensInto } = getWallMetadata(input.wall);

    // Get next sort order
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_missing_walls WHERE zone_id = $1',
      [zoneId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    // Insert the opening
    const insertResult = await client.query(`
      INSERT INTO estimate_missing_walls (
        zone_id, name, opening_type, width_ft, height_ft,
        quantity, goes_to_floor, goes_to_ceiling, opens_into, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, opening_type as type, name as wall, width_ft, height_ft
    `, [
      zoneId,
      input.wall,
      input.type,
      widthFt,
      heightFt,
      1,
      input.type === 'door' || input.type === 'cased_opening',
      false,
      opensInto,
      sortOrder,
    ]);

    const row = insertResult.rows[0];
    return {
      success: true,
      data: {
        id: row.id,
        type: row.type,
        wall: row.wall,
        width_ft: parseFloat(row.width_ft),
        height_ft: parseFloat(row.height_ft),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add opening: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  } finally {
    client.release();
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
  const client = await pool.connect();
  try {
    // Validate input
    if (!input.room_id) {
      return { success: false, error: 'room_id is required' };
    }

    const validWalls = ['north', 'south', 'east', 'west'];
    if (!input.wall || !validWalls.includes(input.wall)) {
      return { success: false, error: `wall must be one of: ${validWalls.join(', ')}` };
    }

    // Find the zone by room_id (zone_code)
    const zoneResult = await client.query(`
      SELECT ez.id, ez.length_ft, ez.width_ft, ez.height_ft, es.estimate_id, e.is_locked
      FROM estimate_zones ez
      JOIN estimate_areas ea ON ez.area_id = ea.id
      JOIN estimate_structures es ON ea.structure_id = es.id
      JOIN estimates e ON es.estimate_id = e.id
      WHERE ez.zone_code = $1 OR ez.id::text = $1
    `, [input.room_id]);

    if (zoneResult.rows.length === 0) {
      return { success: false, error: `Room ${input.room_id} not found` };
    }

    if (zoneResult.rows[0].is_locked) {
      return { success: false, error: 'Cannot modify a locked estimate' };
    }

    const zone = zoneResult.rows[0];
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
    const existingWall = await client.query(`
      SELECT id FROM estimate_missing_walls
      WHERE zone_id = $1 AND name = $2 AND opening_type = 'missing_wall'
    `, [zoneId, input.wall]);

    if (existingWall.rows.length > 0) {
      return {
        success: false,
        error: `A missing wall already exists on the ${input.wall} wall`,
      };
    }

    // Get next sort order
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_missing_walls WHERE zone_id = $1',
      [zoneId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    // Insert the missing wall
    const insertResult = await client.query(`
      INSERT INTO estimate_missing_walls (
        zone_id, name, opening_type, width_ft, height_ft,
        quantity, goes_to_floor, goes_to_ceiling, opens_into, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name as wall, width_ft, height_ft
    `, [
      zoneId,
      input.wall,
      'missing_wall',
      wallWidthFt,
      wallHeightFt,
      1,
      true,
      true,
      'Adjacent Room',
      sortOrder,
    ]);

    const row = insertResult.rows[0];
    return {
      success: true,
      data: {
        id: row.id,
        wall: row.wall,
        width_ft: parseFloat(row.width_ft),
        height_ft: parseFloat(row.height_ft),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add missing wall: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  } finally {
    client.release();
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
  const client = await pool.connect();
  try {
    // Validate input
    if (!estimateId) {
      return { success: false, error: 'estimate_id is required' };
    }

    // Check if estimate exists
    const estimateCheck = await client.query(
      'SELECT id FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (estimateCheck.rows.length === 0) {
      return { success: false, error: `Estimate ${estimateId} not found` };
    }

    // Fetch all zones with their openings
    const zonesResult = await client.query(`
      SELECT
        ez.id,
        ez.zone_code,
        ez.name,
        ez.length_ft,
        ez.width_ft,
        ez.height_ft,
        ez.dimensions,
        ez.updated_at,
        COALESCE(json_agg(
          DISTINCT jsonb_build_object(
            'id', emw.id,
            'type', emw.opening_type,
            'wall', emw.name,
            'width_ft', emw.width_ft,
            'height_ft', emw.height_ft
          )
        ) FILTER (WHERE emw.id IS NOT NULL), '[]') as openings
      FROM estimate_zones ez
      JOIN estimate_areas ea ON ez.area_id = ea.id
      JOIN estimate_structures es ON ea.structure_id = es.id
      LEFT JOIN estimate_missing_walls emw ON ez.id = emw.zone_id
      WHERE es.estimate_id = $1 AND ez.zone_type = 'room'
      GROUP BY ez.id
      ORDER BY ez.sort_order, ez.created_at
    `, [estimateId]);

    let lastUpdated: string | null = null;
    const rooms: SketchStateRoom[] = zonesResult.rows.map((row: any) => {
      if (row.updated_at && (!lastUpdated || row.updated_at > lastUpdated)) {
        lastUpdated = row.updated_at;
      }

      const openings = row.openings || [];
      return {
        id: row.zone_code || row.id,
        name: row.name,
        length_ft: parseFloat(row.length_ft) || 0,
        width_ft: parseFloat(row.width_ft) || 0,
        height_ft: parseFloat(row.height_ft) || 8,
        dimensions: row.dimensions || {},
        openings: openings
          .filter((o: any) => o.id && o.type !== 'missing_wall')
          .map((o: any) => ({
            id: o.id,
            type: o.type,
            wall: o.wall,
            width_ft: parseFloat(o.width_ft) || 0,
            height_ft: parseFloat(o.height_ft) || 0,
          })),
        missing_walls: openings
          .filter((o: any) => o.id && o.type === 'missing_wall')
          .map((o: any) => ({
            id: o.id,
            wall: o.wall,
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
  } finally {
    client.release();
  }
}
