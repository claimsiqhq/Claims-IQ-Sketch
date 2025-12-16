import { pool } from '../db';
import type {
  EstimateZone,
  EstimateStructure,
  EstimateArea,
  EstimateMissingWall,
  EstimateSubroom,
  ZoneDimensions,
  ZoneType,
  ZoneStatus,
} from '../../shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface CreateStructureInput {
  estimateId: string;
  coverageId?: string;
  name: string;
  description?: string;
  sketchName?: string;
  sketchPage?: number;
  yearBuilt?: number;
  constructionType?: string;
  stories?: number;
}

export interface CreateAreaInput {
  structureId: string;
  name: string;
  areaType: string;
}

export interface CreateZoneInput {
  areaId: string;
  name: string;
  zoneCode?: string;
  zoneType?: ZoneType;
  roomType?: string;
  floorLevel?: string;
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  pitch?: string;
  damageType?: string;
  damageSeverity?: string;
  waterCategory?: number;
  waterClass?: number;
  affectedSurfaces?: string[];
  notes?: string;
}

export interface UpdateZoneInput {
  name?: string;
  zoneCode?: string;
  zoneType?: ZoneType;
  status?: ZoneStatus;
  roomType?: string;
  floorLevel?: string;
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  pitch?: string;
  damageType?: string;
  damageSeverity?: string;
  waterCategory?: number;
  waterClass?: number;
  affectedSurfaces?: string[];
  sketchPolygon?: any;
  notes?: string;
}

export interface CreateMissingWallInput {
  zoneId: string;
  name?: string;
  openingType?: string;
  widthFt: number;
  heightFt: number;
  quantity?: number;
  goesToFloor?: boolean;
  goesToCeiling?: boolean;
  opensInto?: string;
}

export interface CreateSubroomInput {
  zoneId: string;
  name: string;
  subroomType?: string;
  lengthFt: number;
  widthFt: number;
  heightFt?: number;
  isAddition?: boolean;
}

export interface ZoneWithChildren extends Omit<EstimateZone, 'dimensions'> {
  dimensions: ZoneDimensions;
  missingWalls: EstimateMissingWall[];
  subrooms: EstimateSubroom[];
  lineItemCount: number;
  zoneTotals: {
    rcvTotal: number;
    acvTotal: number;
  };
}

export interface AreaWithChildren extends EstimateArea {
  zones: ZoneWithChildren[];
}

export interface StructureWithChildren extends EstimateStructure {
  areas: AreaWithChildren[];
}

export interface EstimateHierarchy {
  estimateId: string;
  structures: StructureWithChildren[];
}

// ============================================
// STRUCTURE MANAGEMENT
// ============================================

export async function createStructure(input: CreateStructureInput): Promise<EstimateStructure> {
  const client = await pool.connect();
  try {
    // Get next sort order
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_structures WHERE estimate_id = $1',
      [input.estimateId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO estimate_structures (
        estimate_id, coverage_id, name, description,
        sketch_name, sketch_page, year_built, construction_type, stories,
        sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.estimateId,
        input.coverageId || null,
        input.name,
        input.description || null,
        input.sketchName || null,
        input.sketchPage || 1,
        input.yearBuilt || null,
        input.constructionType || null,
        input.stories || 1,
        sortOrder,
      ]
    );

    return mapStructureRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function getStructure(structureId: string): Promise<EstimateStructure | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_structures WHERE id = $1',
      [structureId]
    );
    return result.rows.length > 0 ? mapStructureRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function updateStructure(
  structureId: string,
  updates: Partial<CreateStructureInput>
): Promise<EstimateStructure | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.coverageId !== undefined) {
      setClauses.push(`coverage_id = $${paramIndex++}`);
      values.push(updates.coverageId);
    }
    if (updates.sketchName !== undefined) {
      setClauses.push(`sketch_name = $${paramIndex++}`);
      values.push(updates.sketchName);
    }
    if (updates.yearBuilt !== undefined) {
      setClauses.push(`year_built = $${paramIndex++}`);
      values.push(updates.yearBuilt);
    }
    if (updates.constructionType !== undefined) {
      setClauses.push(`construction_type = $${paramIndex++}`);
      values.push(updates.constructionType);
    }

    if (setClauses.length === 0) {
      return getStructure(structureId);
    }

    setClauses.push('updated_at = NOW()');
    values.push(structureId);

    const result = await client.query(
      `UPDATE estimate_structures SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows.length > 0 ? mapStructureRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteStructure(structureId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_structures WHERE id = $1',
      [structureId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

// ============================================
// AREA MANAGEMENT
// ============================================

export async function createArea(input: CreateAreaInput): Promise<EstimateArea> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_areas WHERE structure_id = $1',
      [input.structureId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO estimate_areas (structure_id, name, area_type, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.structureId, input.name, input.areaType, sortOrder]
    );

    return mapAreaRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function getArea(areaId: string): Promise<EstimateArea | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_areas WHERE id = $1',
      [areaId]
    );
    return result.rows.length > 0 ? mapAreaRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function updateArea(
  areaId: string,
  updates: Partial<CreateAreaInput>
): Promise<EstimateArea | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.areaType !== undefined) {
      setClauses.push(`area_type = $${paramIndex++}`);
      values.push(updates.areaType);
    }

    if (setClauses.length === 0) {
      return getArea(areaId);
    }

    setClauses.push('updated_at = NOW()');
    values.push(areaId);

    const result = await client.query(
      `UPDATE estimate_areas SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows.length > 0 ? mapAreaRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteArea(areaId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_areas WHERE id = $1',
      [areaId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

// ============================================
// ZONE MANAGEMENT
// ============================================

export async function createZone(input: CreateZoneInput): Promise<EstimateZone> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_zones WHERE area_id = $1',
      [input.areaId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    // Calculate pitch multiplier if pitch provided
    let pitchMultiplier = 1.0;
    if (input.pitch) {
      pitchMultiplier = calculatePitchMultiplier(input.pitch);
    }

    const result = await client.query(
      `INSERT INTO estimate_zones (
        area_id, name, zone_code, zone_type, room_type, floor_level,
        length_ft, width_ft, height_ft, pitch, pitch_multiplier,
        damage_type, damage_severity, water_category, water_class,
        affected_surfaces, notes, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        input.areaId,
        input.name,
        input.zoneCode || null,
        input.zoneType || 'room',
        input.roomType || null,
        input.floorLevel || 'main',
        input.lengthFt || null,
        input.widthFt || null,
        input.heightFt || 8.0,
        input.pitch || null,
        pitchMultiplier,
        input.damageType || null,
        input.damageSeverity || null,
        input.waterCategory || null,
        input.waterClass || null,
        JSON.stringify(input.affectedSurfaces || []),
        input.notes || null,
        sortOrder,
      ]
    );

    const zone = mapZoneRow(result.rows[0]);

    // Trigger dimension calculation (done by trigger, but we'll also do client-side)
    if (input.lengthFt && input.widthFt) {
      await recalculateZoneDimensions(zone.id);
    }

    // Refetch to get calculated dimensions
    const updated = await getZone(zone.id);
    return updated || zone;
  } finally {
    client.release();
  }
}

export async function getZone(zoneId: string): Promise<EstimateZone | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_zones WHERE id = $1',
      [zoneId]
    );
    return result.rows.length > 0 ? mapZoneRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function getZoneWithChildren(zoneId: string): Promise<ZoneWithChildren | null> {
  const client = await pool.connect();
  try {
    // Get zone
    const zoneResult = await client.query(
      'SELECT * FROM estimate_zones WHERE id = $1',
      [zoneId]
    );

    if (zoneResult.rows.length === 0) {
      return null;
    }

    const zone = mapZoneRow(zoneResult.rows[0]);

    // Get missing walls
    const wallsResult = await client.query(
      'SELECT * FROM estimate_missing_walls WHERE zone_id = $1 ORDER BY sort_order',
      [zoneId]
    );

    // Get subrooms
    const subroomsResult = await client.query(
      'SELECT * FROM estimate_subrooms WHERE zone_id = $1 ORDER BY sort_order',
      [zoneId]
    );

    // Get line item count and totals
    const totalsResult = await client.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(rcv), 0) as rcv_total,
        COALESCE(SUM(acv), 0) as acv_total
       FROM estimate_line_items WHERE zone_id = $1 AND is_approved = true`,
      [zoneId]
    );

    return {
      ...zone,
      dimensions: (zone.dimensions as ZoneDimensions) || {},
      missingWalls: wallsResult.rows.map(mapMissingWallRow),
      subrooms: subroomsResult.rows.map(mapSubroomRow),
      lineItemCount: parseInt(totalsResult.rows[0].count),
      zoneTotals: {
        rcvTotal: parseFloat(totalsResult.rows[0].rcv_total || '0'),
        acvTotal: parseFloat(totalsResult.rows[0].acv_total || '0'),
      },
    };
  } finally {
    client.release();
  }
}

export async function updateZone(
  zoneId: string,
  updates: UpdateZoneInput
): Promise<EstimateZone | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      name: 'name',
      zoneCode: 'zone_code',
      zoneType: 'zone_type',
      status: 'status',
      roomType: 'room_type',
      floorLevel: 'floor_level',
      lengthFt: 'length_ft',
      widthFt: 'width_ft',
      heightFt: 'height_ft',
      pitch: 'pitch',
      damageType: 'damage_type',
      damageSeverity: 'damage_severity',
      waterCategory: 'water_category',
      waterClass: 'water_class',
      notes: 'notes',
    };

    for (const [key, dbColumn] of Object.entries(fieldMappings)) {
      if ((updates as any)[key] !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex++}`);
        values.push((updates as any)[key]);
      }
    }

    if (updates.affectedSurfaces !== undefined) {
      setClauses.push(`affected_surfaces = $${paramIndex++}`);
      values.push(JSON.stringify(updates.affectedSurfaces));
    }

    if (updates.sketchPolygon !== undefined) {
      setClauses.push(`sketch_polygon = $${paramIndex++}`);
      values.push(JSON.stringify(updates.sketchPolygon));
    }

    // Calculate pitch multiplier if pitch changed
    if (updates.pitch !== undefined) {
      const pitchMult = calculatePitchMultiplier(updates.pitch);
      setClauses.push(`pitch_multiplier = $${paramIndex++}`);
      values.push(pitchMult);
    }

    if (setClauses.length === 0) {
      return getZone(zoneId);
    }

    setClauses.push('updated_at = NOW()');
    values.push(zoneId);

    const result = await client.query(
      `UPDATE estimate_zones SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Recalculate dimensions if relevant fields changed
    if (updates.lengthFt !== undefined || updates.widthFt !== undefined ||
        updates.heightFt !== undefined || updates.pitch !== undefined ||
        updates.zoneType !== undefined) {
      await recalculateZoneDimensions(zoneId);
      return getZone(zoneId);
    }

    return mapZoneRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteZone(zoneId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_zones WHERE id = $1',
      [zoneId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

export async function recalculateZoneDimensions(zoneId: string): Promise<ZoneDimensions> {
  const client = await pool.connect();
  try {
    // Use the database function
    const result = await client.query(
      `SELECT calculate_zone_dimensions($1) as dimensions`,
      [zoneId]
    );

    const dimensions = result.rows[0].dimensions || {};

    // Update the zone with calculated dimensions
    await client.query(
      `UPDATE estimate_zones SET dimensions = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(dimensions), zoneId]
    );

    return dimensions;
  } finally {
    client.release();
  }
}

// ============================================
// MISSING WALL MANAGEMENT
// ============================================

export async function createMissingWall(input: CreateMissingWallInput): Promise<EstimateMissingWall> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_missing_walls WHERE zone_id = $1',
      [input.zoneId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO estimate_missing_walls (
        zone_id, name, opening_type, width_ft, height_ft, quantity,
        goes_to_floor, goes_to_ceiling, opens_into, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.zoneId,
        input.name || null,
        input.openingType || 'door',
        input.widthFt,
        input.heightFt,
        input.quantity || 1,
        input.goesToFloor !== false,
        input.goesToCeiling === true,
        input.opensInto || null,
        sortOrder,
      ]
    );

    // Trigger will recalculate zone dimensions
    return mapMissingWallRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function getMissingWall(wallId: string): Promise<EstimateMissingWall | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_missing_walls WHERE id = $1',
      [wallId]
    );
    return result.rows.length > 0 ? mapMissingWallRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function updateMissingWall(
  wallId: string,
  updates: Partial<CreateMissingWallInput>
): Promise<EstimateMissingWall | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.openingType !== undefined) {
      setClauses.push(`opening_type = $${paramIndex++}`);
      values.push(updates.openingType);
    }
    if (updates.widthFt !== undefined) {
      setClauses.push(`width_ft = $${paramIndex++}`);
      values.push(updates.widthFt);
    }
    if (updates.heightFt !== undefined) {
      setClauses.push(`height_ft = $${paramIndex++}`);
      values.push(updates.heightFt);
    }
    if (updates.quantity !== undefined) {
      setClauses.push(`quantity = $${paramIndex++}`);
      values.push(updates.quantity);
    }
    if (updates.goesToFloor !== undefined) {
      setClauses.push(`goes_to_floor = $${paramIndex++}`);
      values.push(updates.goesToFloor);
    }
    if (updates.goesToCeiling !== undefined) {
      setClauses.push(`goes_to_ceiling = $${paramIndex++}`);
      values.push(updates.goesToCeiling);
    }
    if (updates.opensInto !== undefined) {
      setClauses.push(`opens_into = $${paramIndex++}`);
      values.push(updates.opensInto);
    }

    if (setClauses.length === 0) {
      return getMissingWall(wallId);
    }

    values.push(wallId);

    const result = await client.query(
      `UPDATE estimate_missing_walls SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Trigger will recalculate zone dimensions
    return result.rows.length > 0 ? mapMissingWallRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteMissingWall(wallId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_missing_walls WHERE id = $1',
      [wallId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

// ============================================
// SUBROOM MANAGEMENT
// ============================================

export async function createSubroom(input: CreateSubroomInput): Promise<EstimateSubroom> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_subrooms WHERE zone_id = $1',
      [input.zoneId]
    );
    const sortOrder = orderResult.rows[0].next_order;

    const result = await client.query(
      `INSERT INTO estimate_subrooms (
        zone_id, name, subroom_type, length_ft, width_ft, height_ft,
        is_addition, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        input.zoneId,
        input.name,
        input.subroomType || null,
        input.lengthFt,
        input.widthFt,
        input.heightFt || null,
        input.isAddition !== false,
        sortOrder,
      ]
    );

    return mapSubroomRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function getSubroom(subroomId: string): Promise<EstimateSubroom | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_subrooms WHERE id = $1',
      [subroomId]
    );
    return result.rows.length > 0 ? mapSubroomRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function updateSubroom(
  subroomId: string,
  updates: Partial<CreateSubroomInput>
): Promise<EstimateSubroom | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.subroomType !== undefined) {
      setClauses.push(`subroom_type = $${paramIndex++}`);
      values.push(updates.subroomType);
    }
    if (updates.lengthFt !== undefined) {
      setClauses.push(`length_ft = $${paramIndex++}`);
      values.push(updates.lengthFt);
    }
    if (updates.widthFt !== undefined) {
      setClauses.push(`width_ft = $${paramIndex++}`);
      values.push(updates.widthFt);
    }
    if (updates.heightFt !== undefined) {
      setClauses.push(`height_ft = $${paramIndex++}`);
      values.push(updates.heightFt);
    }
    if (updates.isAddition !== undefined) {
      setClauses.push(`is_addition = $${paramIndex++}`);
      values.push(updates.isAddition);
    }

    if (setClauses.length === 0) {
      return getSubroom(subroomId);
    }

    values.push(subroomId);

    const result = await client.query(
      `UPDATE estimate_subrooms SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows.length > 0 ? mapSubroomRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteSubroom(subroomId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_subrooms WHERE id = $1',
      [subroomId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

// ============================================
// DIMENSION-BASED LINE ITEM CALCULATION
// ============================================

export interface DimensionBasedLineItemInput {
  zoneId: string;
  lineItemCode: string;
  dimensionKey: string; // 'sfFloor', 'sfWalls', etc.
  unitPrice?: number; // optional, will use from line_items table if not provided
  taxRate?: number;
  depreciationPct?: number;
  isRecoverable?: boolean;
  notes?: string;
}

export async function addLineItemFromDimension(
  input: DimensionBasedLineItemInput
): Promise<{ quantity: number; subtotal: number; rcv: number; acv: number }> {
  const client = await pool.connect();
  try {
    // Get the zone with dimensions
    const zoneResult = await client.query(
      `SELECT ez.id, ez.dimensions, ea.structure_id, es.estimate_id
       FROM estimate_zones ez
       JOIN estimate_areas ea ON ez.area_id = ea.id
       JOIN estimate_structures es ON ea.structure_id = es.id
       WHERE ez.id = $1`,
      [input.zoneId]
    );

    if (zoneResult.rows.length === 0) {
      throw new Error('Zone not found');
    }

    const zone = zoneResult.rows[0];
    const estimateId = zone.estimate_id;
    const dimensions = zone.dimensions || {};

    // Get dimension value
    const quantity = parseFloat(dimensions[input.dimensionKey] || '0');
    if (quantity === 0) {
      throw new Error(`Dimension ${input.dimensionKey} not found or is zero`);
    }

    // Get line item definition
    const lineItemResult = await client.query(
      'SELECT * FROM line_items WHERE code = $1 AND is_active = true',
      [input.lineItemCode]
    );

    if (lineItemResult.rows.length === 0) {
      throw new Error(`Line item ${input.lineItemCode} not found`);
    }

    const lineItem = lineItemResult.rows[0];
    const unitPrice = input.unitPrice ?? parseFloat(lineItem.unit_price || '0');
    const taxRate = input.taxRate ?? 0;
    const depreciationPct = input.depreciationPct ?? 0;

    // Calculate totals
    const subtotal = quantity * unitPrice;
    const taxAmount = subtotal * taxRate;
    const rcv = subtotal + taxAmount;
    const depreciationAmount = rcv * (depreciationPct / 100);
    const acv = rcv - depreciationAmount;

    // Get next sort order
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );

    // Insert line item with calculated values
    await client.query(
      `INSERT INTO estimate_line_items (
        estimate_id, zone_id, line_item_code, line_item_description,
        category_id, quantity, unit, unit_price, subtotal,
        tax_amount, rcv, depreciation_pct, depreciation_amount, is_recoverable, acv,
        calc_ref, trade_code, notes, sort_order, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        estimateId,
        input.zoneId,
        lineItem.code,
        lineItem.description,
        lineItem.category_id,
        quantity,
        lineItem.unit,
        unitPrice,
        subtotal,
        taxAmount,
        rcv,
        depreciationPct,
        depreciationAmount,
        input.isRecoverable !== false,
        acv,
        input.dimensionKey,
        lineItem.trade_code || null,
        input.notes || null,
        orderResult.rows[0].next_order,
        'dimension_calc',
      ]
    );

    return { quantity, subtotal, rcv, acv };
  } finally {
    client.release();
  }
}

// ============================================
// COVERAGE MANAGEMENT
// ============================================

export interface CreateCoverageInput {
  estimateId: string;
  coverageType: '0' | '1' | '2'; // 0=Dwelling, 1=Other Structures, 2=Contents
  coverageName: string;
  policyLimit?: number;
  deductible?: number;
}

export async function createCoverage(input: CreateCoverageInput): Promise<any> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO estimate_coverages (
        estimate_id, coverage_type, coverage_name, policy_limit, deductible, sort_order
      ) VALUES ($1, $2, $3, $4, $5,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM estimate_coverages WHERE estimate_id = $1)
      )
      RETURNING *`,
      [
        input.estimateId,
        input.coverageType,
        input.coverageName,
        input.policyLimit || 0,
        input.deductible || 0,
      ]
    );

    return mapCoverageRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function getCoverages(estimateId: string): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM estimate_coverages WHERE estimate_id = $1 ORDER BY sort_order',
      [estimateId]
    );
    return result.rows.map(mapCoverageRow);
  } finally {
    client.release();
  }
}

export async function updateLineItemCoverage(
  lineItemId: string,
  coverageId: string | null
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE estimate_line_items SET coverage_id = $1, updated_at = NOW() WHERE id = $2',
      [coverageId, lineItemId]
    );
  } finally {
    client.release();
  }
}

export async function getLineItemsByCoverage(estimateId: string): Promise<Record<string, any[]>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT eli.*, ec.coverage_name, ec.coverage_type
       FROM estimate_line_items eli
       LEFT JOIN estimate_coverages ec ON eli.coverage_id = ec.id
       WHERE eli.estimate_id = $1
       ORDER BY ec.sort_order, eli.sort_order`,
      [estimateId]
    );

    // Group by coverage
    const grouped: Record<string, any[]> = { unassigned: [] };
    for (const row of result.rows) {
      const key = row.coverage_id || 'unassigned';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(row);
    }

    return grouped;
  } finally {
    client.release();
  }
}

function mapCoverageRow(row: any): any {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    coverageType: row.coverage_type,
    coverageName: row.coverage_name,
    policyLimit: parseFloat(row.policy_limit || '0'),
    deductible: parseFloat(row.deductible || '0'),
    lineItemTotal: parseFloat(row.line_item_total || '0'),
    taxTotal: parseFloat(row.tax_total || '0'),
    overheadTotal: parseFloat(row.overhead_total || '0'),
    profitTotal: parseFloat(row.profit_total || '0'),
    rcvTotal: parseFloat(row.rcv_total || '0'),
    depreciationTotal: parseFloat(row.depreciation_total || '0'),
    acvTotal: parseFloat(row.acv_total || '0'),
    recoverableDepreciation: parseFloat(row.recoverable_depreciation || '0'),
    nonRecoverableDepreciation: parseFloat(row.non_recoverable_depreciation || '0'),
    netClaim: parseFloat(row.net_claim || '0'),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// FULL HIERARCHY RETRIEVAL
// ============================================

export async function getEstimateHierarchy(estimateId: string): Promise<EstimateHierarchy> {
  const client = await pool.connect();
  try {
    // Get all structures
    const structuresResult = await client.query(
      'SELECT * FROM estimate_structures WHERE estimate_id = $1 ORDER BY sort_order',
      [estimateId]
    );

    const structures: StructureWithChildren[] = [];

    for (const structureRow of structuresResult.rows) {
      const structure = mapStructureRow(structureRow);

      // Get areas for this structure
      const areasResult = await client.query(
        'SELECT * FROM estimate_areas WHERE structure_id = $1 ORDER BY sort_order',
        [structure.id]
      );

      const areas: AreaWithChildren[] = [];

      for (const areaRow of areasResult.rows) {
        const area = mapAreaRow(areaRow);

        // Get zones for this area
        const zonesResult = await client.query(
          'SELECT * FROM estimate_zones WHERE area_id = $1 ORDER BY sort_order',
          [area.id]
        );

        const zones: ZoneWithChildren[] = [];

        for (const zoneRow of zonesResult.rows) {
          const zone = mapZoneRow(zoneRow);

          // Get missing walls
          const wallsResult = await client.query(
            'SELECT * FROM estimate_missing_walls WHERE zone_id = $1 ORDER BY sort_order',
            [zone.id]
          );

          // Get subrooms
          const subroomsResult = await client.query(
            'SELECT * FROM estimate_subrooms WHERE zone_id = $1 ORDER BY sort_order',
            [zone.id]
          );

          // Get line item totals
          const totalsResult = await client.query(
            `SELECT
              COUNT(*) as count,
              COALESCE(SUM(rcv), 0) as rcv_total,
              COALESCE(SUM(acv), 0) as acv_total
             FROM estimate_line_items WHERE zone_id = $1 AND is_approved = true`,
            [zone.id]
          );

          zones.push({
            ...zone,
            dimensions: (zone.dimensions as ZoneDimensions) || {},
            missingWalls: wallsResult.rows.map(mapMissingWallRow),
            subrooms: subroomsResult.rows.map(mapSubroomRow),
            lineItemCount: parseInt(totalsResult.rows[0].count),
            zoneTotals: {
              rcvTotal: parseFloat(totalsResult.rows[0].rcv_total || '0'),
              acvTotal: parseFloat(totalsResult.rows[0].acv_total || '0'),
            },
          });
        }

        areas.push({ ...area, zones });
      }

      structures.push({ ...structure, areas });
    }

    return { estimateId, structures };
  } finally {
    client.release();
  }
}

// ============================================
// INITIALIZE ESTIMATE HIERARCHY
// Creates default structure for a new estimate
// ============================================

export async function initializeEstimateHierarchy(
  estimateId: string,
  options?: {
    structureName?: string;
    includeInterior?: boolean;
    includeExterior?: boolean;
    includeRoofing?: boolean;
  }
): Promise<EstimateHierarchy> {
  const opts = {
    structureName: 'Main Structure',
    includeInterior: true,
    includeExterior: true,
    includeRoofing: true,
    ...options,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create default structure
    const structure = await createStructure({
      estimateId,
      name: opts.structureName,
    });

    // Create default areas
    if (opts.includeInterior) {
      await createArea({
        structureId: structure.id,
        name: 'Interior',
        areaType: 'interior',
      });
    }

    if (opts.includeExterior) {
      await createArea({
        structureId: structure.id,
        name: 'Exterior',
        areaType: 'exterior',
      });
    }

    if (opts.includeRoofing) {
      await createArea({
        structureId: structure.id,
        name: 'Roofing',
        areaType: 'roofing',
      });
    }

    await client.query('COMMIT');

    return getEstimateHierarchy(estimateId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// ADD LINE ITEM TO ZONE
// ============================================

export async function addLineItemToZone(
  zoneId: string,
  lineItemData: {
    lineItemCode: string;
    quantity: number;
    calcRef?: string;
    notes?: string;
    isHomeowner?: boolean;
    isCredit?: boolean;
    isNonOp?: boolean;
  }
): Promise<void> {
  const client = await pool.connect();
  try {
    // Get the zone to find estimate_id
    const zoneResult = await client.query(
      `SELECT ez.id, ea.structure_id, es.estimate_id
       FROM estimate_zones ez
       JOIN estimate_areas ea ON ez.area_id = ea.id
       JOIN estimate_structures es ON ea.structure_id = es.id
       WHERE ez.id = $1`,
      [zoneId]
    );

    if (zoneResult.rows.length === 0) {
      throw new Error('Zone not found');
    }

    const estimateId = zoneResult.rows[0].estimate_id;

    // Get line item definition
    const lineItemResult = await client.query(
      'SELECT * FROM line_items WHERE code = $1 AND is_active = true',
      [lineItemData.lineItemCode]
    );

    if (lineItemResult.rows.length === 0) {
      throw new Error(`Line item ${lineItemData.lineItemCode} not found`);
    }

    const lineItem = lineItemResult.rows[0];

    // Get next sort order
    const orderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM estimate_line_items WHERE estimate_id = $1',
      [estimateId]
    );

    // Insert line item with zone reference
    await client.query(
      `INSERT INTO estimate_line_items (
        estimate_id, zone_id, line_item_code, line_item_description,
        category_id, quantity, unit, unit_price, subtotal,
        calc_ref, is_homeowner, is_credit, is_non_op,
        notes, sort_order, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        estimateId,
        zoneId,
        lineItem.code,
        lineItem.description,
        lineItem.category_id,
        lineItemData.quantity,
        lineItem.unit,
        parseFloat(lineItem.unit_price || '0'),
        lineItemData.quantity * parseFloat(lineItem.unit_price || '0'),
        lineItemData.calcRef || null,
        lineItemData.isHomeowner || false,
        lineItemData.isCredit || false,
        lineItemData.isNonOp || false,
        lineItemData.notes || null,
        orderResult.rows[0].next_order,
        'manual',
      ]
    );

    // Update zone line item count
    await client.query(
      `UPDATE estimate_zones SET line_item_count = (
        SELECT COUNT(*) FROM estimate_line_items WHERE zone_id = $1
      ) WHERE id = $1`,
      [zoneId]
    );
  } finally {
    client.release();
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculatePitchMultiplier(pitch: string): number {
  if (!pitch) return 1.0;

  const parts = pitch.split('/');
  if (parts.length !== 2) return 1.0;

  const rise = parseFloat(parts[0]);
  const run = parseFloat(parts[1]);

  if (run === 0) return 1.0;

  // Pitch multiplier = sqrt(1 + (rise/run)^2)
  return Math.sqrt(1 + Math.pow(rise / run, 2));
}

function mapStructureRow(row: any): EstimateStructure {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    coverageId: row.coverage_id,
    name: row.name,
    description: row.description,
    sketchName: row.sketch_name,
    sketchPage: row.sketch_page,
    yearBuilt: row.year_built,
    constructionType: row.construction_type,
    stories: row.stories,
    totalSf: row.total_sf,
    rcvTotal: row.rcv_total,
    acvTotal: row.acv_total,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAreaRow(row: any): EstimateArea {
  return {
    id: row.id,
    structureId: row.structure_id,
    name: row.name,
    areaType: row.area_type,
    totalSf: row.total_sf,
    rcvTotal: row.rcv_total,
    acvTotal: row.acv_total,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapZoneRow(row: any): EstimateZone {
  return {
    id: row.id,
    areaId: row.area_id,
    name: row.name,
    zoneCode: row.zone_code,
    zoneType: row.zone_type,
    status: row.status,
    roomType: row.room_type,
    floorLevel: row.floor_level,
    lengthFt: row.length_ft,
    widthFt: row.width_ft,
    heightFt: row.height_ft,
    pitch: row.pitch,
    pitchMultiplier: row.pitch_multiplier,
    dimensions: row.dimensions || {},
    roomInfo: row.room_info || {},
    sketchPolygon: row.sketch_polygon,
    damageType: row.damage_type,
    damageSeverity: row.damage_severity,
    waterCategory: row.water_category,
    waterClass: row.water_class,
    affectedSurfaces: row.affected_surfaces || [],
    photoIds: row.photo_ids || [],
    lineItemCount: row.line_item_count || 0,
    rcvTotal: row.rcv_total,
    acvTotal: row.acv_total,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMissingWallRow(row: any): EstimateMissingWall {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    openingType: row.opening_type,
    widthFt: row.width_ft,
    heightFt: row.height_ft,
    quantity: row.quantity,
    goesToFloor: row.goes_to_floor,
    goesToCeiling: row.goes_to_ceiling,
    opensInto: row.opens_into,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapSubroomRow(row: any): EstimateSubroom {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    subroomType: row.subroom_type,
    lengthFt: row.length_ft,
    widthFt: row.width_ft,
    heightFt: row.height_ft,
    dimensions: row.dimensions || {},
    isAddition: row.is_addition,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// ============================================
// CLAIM SCOPE HELPERS
// ============================================

export interface ClaimScopeItem {
  id: string;
  lineItemCode: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  roomName?: string;
  notes?: string;
  createdAt: string;
}

export async function getOrCreateDraftEstimate(
  claimId: string,
  organizationId: string
): Promise<{ estimateId: string; defaultZoneId: string }> {
  const client = await pool.connect();
  try {
    // Check for existing draft estimate
    const existingResult = await client.query(
      `SELECT e.id, ez.id as zone_id
       FROM estimates e
       LEFT JOIN estimate_structures es ON es.estimate_id = e.id
       LEFT JOIN estimate_areas ea ON ea.structure_id = es.id
       LEFT JOIN estimate_zones ez ON ez.area_id = ea.id
       WHERE e.claim_id = $1 
         AND e.is_locked = false 
         AND e.status = 'draft'
       ORDER BY e.created_at DESC
       LIMIT 1`,
      [claimId]
    );

    if (existingResult.rows.length > 0 && existingResult.rows[0].zone_id) {
      return {
        estimateId: existingResult.rows[0].id,
        defaultZoneId: existingResult.rows[0].zone_id,
      };
    }

    // Create new draft estimate
    await client.query('BEGIN');

    const estimateResult = await client.query(
      `INSERT INTO estimates (organization_id, claim_id, name, status, region_id)
       VALUES ($1, $2, 'Draft Scope', 'draft', 'US-NATIONAL')
       RETURNING id`,
      [organizationId, claimId]
    );
    const estimateId = estimateResult.rows[0].id;

    // Create default structure
    const structureResult = await client.query(
      `INSERT INTO estimate_structures (estimate_id, name)
       VALUES ($1, 'Main Structure')
       RETURNING id`,
      [estimateId]
    );
    const structureId = structureResult.rows[0].id;

    // Create default area
    const areaResult = await client.query(
      `INSERT INTO estimate_areas (structure_id, name, area_type)
       VALUES ($1, 'Interior', 'interior')
       RETURNING id`,
      [structureId]
    );
    const areaId = areaResult.rows[0].id;

    // Create default zone
    const zoneResult = await client.query(
      `INSERT INTO estimate_zones (area_id, name, zone_type)
       VALUES ($1, 'General', 'room')
       RETURNING id`,
      [areaId]
    );
    const zoneId = zoneResult.rows[0].id;

    await client.query('COMMIT');

    return { estimateId, defaultZoneId: zoneId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addScopeItemToClaim(
  claimId: string,
  organizationId: string,
  item: {
    lineItemCode: string;
    description: string;
    category?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    roomName?: string;
    notes?: string;
  }
): Promise<ClaimScopeItem> {
  const { estimateId, defaultZoneId } = await getOrCreateDraftEstimate(claimId, organizationId);

  const client = await pool.connect();
  try {
    const subtotal = item.quantity * item.unitPrice;

    const result = await client.query(
      `INSERT INTO estimate_line_items 
       (estimate_id, zone_id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')
       RETURNING id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, created_at`,
      [
        estimateId,
        defaultZoneId,
        item.lineItemCode,
        item.description,
        item.category || '',
        item.quantity,
        item.unit,
        item.unitPrice,
        subtotal,
        item.roomName || null,
        item.notes || null,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      lineItemCode: row.line_item_code,
      description: row.line_item_description,
      category: row.category_id || '',
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unitPrice: parseFloat(row.unit_price),
      total: parseFloat(row.subtotal),
      roomName: row.room_name,
      notes: row.notes,
      createdAt: row.created_at,
    };
  } finally {
    client.release();
  }
}

export async function getScopeItemsForClaim(claimId: string): Promise<ClaimScopeItem[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT eli.id, eli.line_item_code, eli.line_item_description, eli.category_id,
              eli.quantity, eli.unit, eli.unit_price, eli.subtotal, eli.room_name, eli.notes, eli.created_at
       FROM estimate_line_items eli
       JOIN estimates e ON eli.estimate_id = e.id
       WHERE e.claim_id = $1 AND e.is_locked = false AND e.status = 'draft'
       ORDER BY eli.created_at ASC`,
      [claimId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      lineItemCode: row.line_item_code,
      description: row.line_item_description,
      category: row.category_id || '',
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unitPrice: parseFloat(row.unit_price),
      total: parseFloat(row.subtotal),
      roomName: row.room_name,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  } finally {
    client.release();
  }
}

export async function updateScopeItem(
  itemId: string,
  data: { quantity?: number; notes?: string }
): Promise<ClaimScopeItem | null> {
  const client = await pool.connect();
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.quantity !== undefined) {
      updates.push(`quantity = $${paramIndex++}`);
      values.push(data.quantity);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = NOW()');
    values.push(itemId);

    // First update quantity, then recalc subtotal
    const result = await client.query(
      `UPDATE estimate_line_items 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, created_at`,
      values
    );

    if (result.rows.length === 0) return null;

    // Recalculate subtotal if quantity changed
    if (data.quantity !== undefined) {
      await client.query(
        `UPDATE estimate_line_items SET subtotal = quantity * unit_price WHERE id = $1`,
        [itemId]
      );
    }

    // Fetch updated row
    const updated = await client.query(
      `SELECT id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, created_at
       FROM estimate_line_items WHERE id = $1`,
      [itemId]
    );

    const row = updated.rows[0];
    return {
      id: row.id,
      lineItemCode: row.line_item_code,
      description: row.line_item_description,
      category: row.category_id || '',
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unitPrice: parseFloat(row.unit_price),
      total: parseFloat(row.subtotal),
      roomName: row.room_name,
      notes: row.notes,
      createdAt: row.created_at,
    };
  } finally {
    client.release();
  }
}

export async function deleteScopeItem(itemId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM estimate_line_items WHERE id = $1',
      [itemId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
