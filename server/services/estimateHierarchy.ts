import { supabaseAdmin } from '../lib/supabaseAdmin';
import { computeZoneMetrics } from './zoneMetrics';
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
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_structures')
    .select('sort_order')
    .eq('estimate_id', input.estimateId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  const { data, error } = await supabaseAdmin
    .from('estimate_structures')
    .insert({
      estimate_id: input.estimateId,
      coverage_id: input.coverageId || null,
      name: input.name,
      description: input.description || null,
      sketch_name: input.sketchName || null,
      sketch_page: input.sketchPage || 1,
      year_built: input.yearBuilt || null,
      construction_type: input.constructionType || null,
      stories: input.stories || 1,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;

  const structure = mapStructureRow(data);
  
  // Recalculate totals after creation
  await recalculateStructureTotals(structure.id);
  
  return structure;
}

export async function getStructure(structureId: string): Promise<EstimateStructure | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_structures')
    .select('*')
    .eq('id', structureId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapStructureRow(data);
}

export async function updateStructure(
  structureId: string,
  updates: Partial<CreateStructureInput>
): Promise<EstimateStructure | null> {
  const updateData: any = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }
  if (updates.coverageId !== undefined) {
    updateData.coverage_id = updates.coverageId;
  }
  if (updates.sketchName !== undefined) {
    updateData.sketch_name = updates.sketchName;
  }
  if (updates.yearBuilt !== undefined) {
    updateData.year_built = updates.yearBuilt;
  }
  if (updates.constructionType !== undefined) {
    updateData.construction_type = updates.constructionType;
  }

  if (Object.keys(updateData).length === 0) {
    return getStructure(structureId);
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('estimate_structures')
    .update(updateData)
    .eq('id', structureId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapStructureRow(data);
}

export async function deleteStructure(structureId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('estimate_structures')
    .delete()
    .eq('id', structureId);

  if (error) throw error;

  return true;
}

// ============================================
// AREA MANAGEMENT
// ============================================

export async function createArea(input: CreateAreaInput): Promise<EstimateArea> {
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_areas')
    .select('sort_order')
    .eq('structure_id', input.structureId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  const { data, error } = await supabaseAdmin
    .from('estimate_areas')
    .insert({
      structure_id: input.structureId,
      name: input.name,
      area_type: input.areaType,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;

  const area = mapAreaRow(data);
  
  // Recalculate structure totals after creating area
  await recalculateStructureTotals(input.structureId).catch(err => {
    console.error('Error recalculating structure totals:', err);
  });
  
  return area;
}

export async function getArea(areaId: string): Promise<EstimateArea | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_areas')
    .select('*')
    .eq('id', areaId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapAreaRow(data);
}

export async function updateArea(
  areaId: string,
  updates: Partial<CreateAreaInput>
): Promise<EstimateArea | null> {
  const updateData: any = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.areaType !== undefined) {
    updateData.area_type = updates.areaType;
  }

  if (Object.keys(updateData).length === 0) {
    return getArea(areaId);
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('estimate_areas')
    .update(updateData)
    .eq('id', areaId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapAreaRow(data);
}

export async function deleteArea(areaId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('estimate_areas')
    .delete()
    .eq('id', areaId);

  if (error) throw error;

  return true;
}

// ============================================
// ZONE MANAGEMENT
// ============================================

export async function createZone(input: CreateZoneInput): Promise<EstimateZone> {
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_zones')
    .select('sort_order')
    .eq('area_id', input.areaId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  // Calculate pitch multiplier if pitch provided
  let pitchMultiplier = 1.0;
  if (input.pitch) {
    pitchMultiplier = calculatePitchMultiplier(input.pitch);
  }

  const { data, error } = await supabaseAdmin
    .from('estimate_zones')
    .insert({
      area_id: input.areaId,
      name: input.name,
      zone_code: input.zoneCode || null,
      zone_type: input.zoneType || 'room',
      room_type: input.roomType || null,
      floor_level: input.floorLevel || 'main',
      length_ft: input.lengthFt || null,
      width_ft: input.widthFt || null,
      height_ft: input.heightFt || 8.0,
      pitch: input.pitch || null,
      pitch_multiplier: pitchMultiplier,
      damage_type: input.damageType || null,
      damage_severity: input.damageSeverity || null,
      water_category: input.waterCategory || null,
      water_class: input.waterClass || null,
      affected_surfaces: input.affectedSurfaces || [],
      notes: input.notes || null,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;

  const zone = mapZoneRow(data);

  // Trigger dimension calculation (done by trigger, but we'll also do client-side)
  if (input.lengthFt && input.widthFt) {
    await recalculateZoneDimensions(zone.id);
  }

  // Refetch to get calculated dimensions
  const updated = await getZone(zone.id);
  const finalZone = updated || zone;
  
  // Recalculate structure totals after creating zone
  const { data: areaData } = await supabaseAdmin
    .from('estimate_areas')
    .select('structure_id')
    .eq('id', input.areaId)
    .single();
  
  if (areaData) {
    await recalculateStructureTotals(areaData.structure_id).catch(err => {
      console.error('Error recalculating structure totals:', err);
    });
  }
  
  return finalZone;
}

export async function getZone(zoneId: string): Promise<EstimateZone | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_zones')
    .select('*')
    .eq('id', zoneId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapZoneRow(data);
}

export async function getZoneWithChildren(zoneId: string): Promise<ZoneWithChildren | null> {
  // Get zone
  const { data: zoneData, error: zoneError } = await supabaseAdmin
    .from('estimate_zones')
    .select('*')
    .eq('id', zoneId)
    .single();

  if (zoneError) {
    if (zoneError.code === 'PGRST116') return null; // Not found
    throw zoneError;
  }

  const zone = mapZoneRow(zoneData);

  // Get missing walls (now from zone_openings)
  const { data: wallsData, error: wallsError } = await supabaseAdmin
    .from('zone_openings')
    .select('*')
    .eq('zone_id', zoneId)
    .order('sort_order');

  if (wallsError) throw wallsError;

  // Get subrooms
  const { data: subroomsData, error: subroomsError } = await supabaseAdmin
    .from('estimate_subrooms')
    .select('*')
    .eq('zone_id', zoneId)
    .order('sort_order');

  if (subroomsError) throw subroomsError;

  // Get line item count and totals
  const { data: lineItems, error: lineItemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('rcv, acv')
    .eq('zone_id', zoneId)
    .eq('is_approved', true);

  if (lineItemsError) throw lineItemsError;

  const count = lineItems?.length || 0;
  const rcvTotal = lineItems?.reduce((sum, item) => sum + (parseFloat(item.rcv?.toString() || '0')), 0) || 0;
  const acvTotal = lineItems?.reduce((sum, item) => sum + (parseFloat(item.acv?.toString() || '0')), 0) || 0;

  return {
    ...zone,
    dimensions: (zone.dimensions as ZoneDimensions) || {},
    missingWalls: (wallsData || []).map(row => mapZoneOpeningToMissingWall(row)),
    subrooms: (subroomsData || []).map(mapSubroomRow),
    lineItemCount: count,
    zoneTotals: {
      rcvTotal,
      acvTotal,
    },
  };
}

export async function updateZone(
  zoneId: string,
  updates: UpdateZoneInput
): Promise<EstimateZone | null> {
  const updateData: any = {};

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
      updateData[dbColumn] = (updates as any)[key];
    }
  }

  if (updates.affectedSurfaces !== undefined) {
    updateData.affected_surfaces = updates.affectedSurfaces;
  }

  if (updates.sketchPolygon !== undefined) {
    updateData.sketch_polygon = updates.sketchPolygon;
  }

  // Calculate pitch multiplier if pitch changed
  if (updates.pitch !== undefined) {
    const pitchMult = calculatePitchMultiplier(updates.pitch);
    updateData.pitch_multiplier = pitchMult;
  }

  if (Object.keys(updateData).length === 0) {
    return getZone(zoneId);
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('estimate_zones')
    .update(updateData)
    .eq('id', zoneId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  // Recalculate dimensions if relevant fields changed
  if (updates.lengthFt !== undefined || updates.widthFt !== undefined ||
      updates.heightFt !== undefined || updates.pitch !== undefined ||
      updates.zoneType !== undefined) {
    await recalculateZoneDimensions(zoneId);
    const updatedZone = await getZone(zoneId);
    
    // Recalculate structure totals after updating zone
    const { data: areaData } = await supabaseAdmin
      .from('estimate_zones')
      .select('estimate_areas!inner(structure_id)')
      .eq('id', zoneId)
      .single();
    
    if (areaData) {
      const structureId = (areaData.estimate_areas as any).structure_id;
      await recalculateStructureTotals(structureId).catch(err => {
        console.error('Error recalculating structure totals:', err);
      });
    }
    
    return updatedZone;
  }

  // Recalculate structure totals after updating zone (even if dimensions didn't change)
  const { data: areaData } = await supabaseAdmin
    .from('estimate_zones')
    .select('estimate_areas!inner(structure_id)')
    .eq('id', zoneId)
    .single();
  
  if (areaData) {
    const structureId = (areaData.estimate_areas as any).structure_id;
    await recalculateStructureTotals(structureId).catch(err => {
      console.error('Error recalculating structure totals:', err);
    });
  }

  return mapZoneRow(data);
}

export async function deleteZone(zoneId: string): Promise<boolean> {
  // Get structure_id before deleting
  const { data: zoneData } = await supabaseAdmin
    .from('estimate_zones')
    .select('estimate_areas!inner(structure_id)')
    .eq('id', zoneId)
    .single();

  const { error } = await supabaseAdmin
    .from('estimate_zones')
    .delete()
    .eq('id', zoneId);

  if (error) throw error;

  // Recalculate structure totals after deleting zone
  if (zoneData) {
    const structureId = (zoneData.estimate_areas as any).structure_id;
    await recalculateStructureTotals(structureId).catch(err => {
      console.error('Error recalculating structure totals:', err);
    });
  }

  return true;
}

export async function recalculateZoneDimensions(zoneId: string): Promise<ZoneDimensions> {
  // Fetch zone, openings (as missing walls), and subrooms
  const zoneWithChildren = await getZoneWithChildren(zoneId);
  
  if (!zoneWithChildren) {
    throw new Error(`Zone ${zoneId} not found`);
  }

  // Convert to metrics input format
  const zoneForMetrics = {
    id: zoneWithChildren.id,
    name: zoneWithChildren.name,
    zoneType: zoneWithChildren.zoneType,
    lengthFt: zoneWithChildren.lengthFt,
    widthFt: zoneWithChildren.widthFt,
    heightFt: zoneWithChildren.heightFt,
    pitch: zoneWithChildren.pitch,
    pitchMultiplier: zoneWithChildren.pitchMultiplier,
    dimensions: zoneWithChildren.dimensions,
    sketchPolygon: zoneWithChildren.sketchPolygon,
    damageType: zoneWithChildren.damageType,
    damageSeverity: zoneWithChildren.damageSeverity,
    waterCategory: zoneWithChildren.waterCategory,
    waterClass: zoneWithChildren.waterClass,
    affectedSurfaces: zoneWithChildren.affectedSurfaces,
  };

  const missingWallsForMetrics = zoneWithChildren.missingWalls.map(mw => ({
    widthFt: mw.widthFt,
    heightFt: mw.heightFt,
    quantity: mw.quantity
  }));

  const subroomsForMetrics = zoneWithChildren.subrooms.map(sr => ({
    lengthFt: sr.lengthFt,
    widthFt: sr.widthFt,
    heightFt: sr.heightFt,
    isAddition: sr.isAddition
  }));

  // Compute metrics locally
  const metrics = computeZoneMetrics(zoneForMetrics, missingWallsForMetrics, subroomsForMetrics);

  // Convert metrics to ZoneDimensions format
  // Note: ZoneDimensions type in schema matches ZoneMetrics fields mostly
  const dimensions: ZoneDimensions = {
    sfFloor: metrics.floorSquareFeet,
    syFloor: Math.ceil(metrics.floorSquareFeet / 9),
    sfCeiling: metrics.ceilingSquareFeet,
    sfWalls: metrics.wallSquareFeet, // gross
    sfWallsCeiling: metrics.wallsAndCeilingSquareFeet,
    lfFloorPerim: metrics.perimeterLinearFeet,
    lfCeilingPerim: metrics.perimeterLinearFeet,
    sfLongWall: metrics.longWallSquareFeet,
    sfShortWall: metrics.shortWallSquareFeet,
    sfTotal: metrics.floorSquareFeet + metrics.wallSquareFeet + metrics.ceilingSquareFeet, // Rough approximation of total surface? Or metrics.wallsAndCeilingSquareFeet + floor?
    // zoneMetrics doesn't output sfTotal in this exact way, but let's approximate or use what's available
    // metrics has wallsAndCeilingSquareFeet (net walls + ceiling). Total usually includes floor too?
    // Let's assume sfTotal = walls + ceiling + floor
    
    // Add roof specific if available
    sfSkRoof: metrics.roofSquareFeet,
    skRoofSquares: metrics.roofSquares,
  };

  // Update the zone with calculated dimensions
  const { error: updateError } = await supabaseAdmin
    .from('estimate_zones')
    .update({
      dimensions: dimensions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', zoneId);

  if (updateError) throw updateError;

  return dimensions;
}

// ============================================
// MISSING WALL MANAGEMENT (Now using zone_openings)
// ============================================

export async function createMissingWall(input: CreateMissingWallInput): Promise<EstimateMissingWall> {
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('zone_openings')
    .select('sort_order')
    .eq('zone_id', input.zoneId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;
  const quantity = input.quantity || 1;
  const openingType = input.openingType || 'door';
  
  // Calculate sill height based on flags
  // If goes to floor, sill is 0. Otherwise, we default to 0 for now as we don't have enough info
  const sillHeight = input.goesToFloor === false ? 3 : 0; 

  let createdId = '';
  let createdData: any = null;

  // Loop to create multiple openings if quantity > 1
  for (let i = 0; i < quantity; i++) {
    const { data, error } = await supabaseAdmin
      .from('zone_openings')
      .insert({
        zone_id: input.zoneId,
        opening_type: openingType,
        wall_index: 0, // Default to 0 as we don't have spatial info here
        offset_from_vertex_ft: 0, // Default to 0
        width_ft: input.widthFt,
        height_ft: input.heightFt,
        sill_height_ft: sillHeight,
        notes: input.name ? `Name: ${input.name}` : null, // Store name in notes
        sort_order: sortOrder + i,
      })
      .select('*')
      .single();

    if (error) throw error;
    
    // Keep track of the first one to return (or the last one)
    createdId = data.id;
    createdData = data;
  }

  // Trigger will recalculate zone dimensions (if set up on zone_openings)
  // We return the last created item mapped to the legacy interface
  return mapZoneOpeningToMissingWall(createdData, quantity);
}

export async function getMissingWall(wallId: string): Promise<EstimateMissingWall | null> {
  const { data, error } = await supabaseAdmin
    .from('zone_openings')
    .select('*')
    .eq('id', wallId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapZoneOpeningToMissingWall(data);
}

export async function updateMissingWall(
  wallId: string,
  updates: Partial<CreateMissingWallInput>
): Promise<EstimateMissingWall | null> {
  const updateData: any = {};

  // Map updates to zone_openings columns
  if (updates.openingType !== undefined) {
    updateData.opening_type = updates.openingType;
  }
  if (updates.widthFt !== undefined) {
    updateData.width_ft = updates.widthFt;
  }
  if (updates.heightFt !== undefined) {
    updateData.height_ft = updates.heightFt;
  }
  if (updates.name !== undefined) {
    updateData.notes = updates.name ? `Name: ${updates.name}` : null;
  }
  // Handle goesToFloor
  if (updates.goesToFloor !== undefined) {
    updateData.sill_height_ft = updates.goesToFloor === false ? 3 : 0;
  }

  if (Object.keys(updateData).length === 0) {
    return getMissingWall(wallId);
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('zone_openings')
    .update(updateData)
    .eq('id', wallId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapZoneOpeningToMissingWall(data);
}

export async function deleteMissingWall(wallId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('zone_openings')
    .delete()
    .eq('id', wallId);

  if (error) throw error;

  return true;
}

// ============================================
// SUBROOM MANAGEMENT
// ============================================

export async function createSubroom(input: CreateSubroomInput): Promise<EstimateSubroom> {
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_subrooms')
    .select('sort_order')
    .eq('zone_id', input.zoneId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  const { data, error } = await supabaseAdmin
    .from('estimate_subrooms')
    .insert({
      zone_id: input.zoneId,
      name: input.name,
      subroom_type: input.subroomType || null,
      length_ft: input.lengthFt,
      width_ft: input.widthFt,
      height_ft: input.heightFt || null,
      is_addition: input.isAddition !== false,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;

  return mapSubroomRow(data);
}

export async function getSubroom(subroomId: string): Promise<EstimateSubroom | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_subrooms')
    .select('*')
    .eq('id', subroomId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapSubroomRow(data);
}

export async function updateSubroom(
  subroomId: string,
  updates: Partial<CreateSubroomInput>
): Promise<EstimateSubroom | null> {
  const updateData: any = {};

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.subroomType !== undefined) {
    updateData.subroom_type = updates.subroomType;
  }
  if (updates.lengthFt !== undefined) {
    updateData.length_ft = updates.lengthFt;
  }
  if (updates.widthFt !== undefined) {
    updateData.width_ft = updates.widthFt;
  }
  if (updates.heightFt !== undefined) {
    updateData.height_ft = updates.heightFt;
  }
  if (updates.isAddition !== undefined) {
    updateData.is_addition = updates.isAddition;
  }

  if (Object.keys(updateData).length === 0) {
    return getSubroom(subroomId);
  }

  const { data, error } = await supabaseAdmin
    .from('estimate_subrooms')
    .update(updateData)
    .eq('id', subroomId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapSubroomRow(data);
}

export async function deleteSubroom(subroomId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('estimate_subrooms')
    .delete()
    .eq('id', subroomId);

  if (error) throw error;

  return true;
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
  // Get the zone with dimensions and estimate_id
  const { data: zoneData, error: zoneError } = await supabaseAdmin
    .from('estimate_zones')
    .select(`
      id,
      dimensions,
      estimate_areas!inner (
        structure_id,
        estimate_structures!inner (
          estimate_id
        )
      )
    `)
    .eq('id', input.zoneId)
    .single();

  if (zoneError || !zoneData) {
    throw new Error('Zone not found');
  }

  const estimateId = (zoneData.estimate_areas as any).estimate_structures.estimate_id;
  const dimensions = zoneData.dimensions || {};

  // Get dimension value
  const quantity = parseFloat(dimensions[input.dimensionKey] || '0');
  if (quantity === 0) {
    throw new Error(`Dimension ${input.dimensionKey} not found or is zero`);
  }

  // Get line item definition
  const { data: lineItem, error: lineItemError } = await supabaseAdmin
    .from('line_items')
    .select('*')
    .eq('code', input.lineItemCode)
    .eq('is_active', true)
    .single();

  if (lineItemError || !lineItem) {
    throw new Error(`Line item ${input.lineItemCode} not found`);
  }

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
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('sort_order')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  // Insert line item with calculated values
  const { error: insertError } = await supabaseAdmin
    .from('estimate_line_items')
    .insert({
      estimate_id: estimateId,
      zone_id: input.zoneId,
      line_item_code: lineItem.code,
      line_item_description: lineItem.description,
      category_id: lineItem.category_id,
      quantity,
      unit: lineItem.unit,
      unit_price: unitPrice,
      subtotal,
      tax_amount: taxAmount,
      rcv,
      depreciation_pct: depreciationPct,
      depreciation_amount: depreciationAmount,
      is_recoverable: input.isRecoverable !== false,
      acv,
      calc_ref: input.dimensionKey,
      trade_code: lineItem.trade_code || null,
      notes: input.notes || null,
      sort_order: sortOrder,
      source: 'dimension_calc',
    });

  if (insertError) throw insertError;

  return { quantity, subtotal, rcv, acv };
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
  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_coverages')
    .select('sort_order')
    .eq('estimate_id', input.estimateId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  const { data, error } = await supabaseAdmin
    .from('estimate_coverages')
    .insert({
      estimate_id: input.estimateId,
      coverage_type: input.coverageType,
      coverage_name: input.coverageName,
      policy_limit: input.policyLimit || 0,
      deductible: input.deductible || 0,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) throw error;

  return mapCoverageRow(data);
}

export async function getCoverages(estimateId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('estimate_coverages')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order');

  if (error) throw error;

  return (data || []).map(mapCoverageRow);
}

export async function updateLineItemCoverage(
  lineItemId: string,
  coverageId: string | null
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('estimate_line_items')
    .update({
      coverage_id: coverageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineItemId);

  if (error) throw error;
}

export async function getLineItemsByCoverage(estimateId: string): Promise<Record<string, any[]>> {
  // Query line items without join (Supabase doesn't have FK relationship)
  const { data, error } = await supabaseAdmin
    .from('estimate_line_items')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order');

  if (error) throw error;

  // Group by coverage
  const grouped: Record<string, any[]> = { unassigned: [] };
  for (const row of data || []) {
    const key = row.coverage_id || 'unassigned';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(row);
  }

  return grouped;
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
  // Get all structures
  const { data: structuresData, error: structuresError } = await supabaseAdmin
    .from('estimate_structures')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order');

  if (structuresError) throw structuresError;

  const structures: StructureWithChildren[] = [];

  for (const structureRow of structuresData || []) {
    const structure = mapStructureRow(structureRow);

    // Get areas for this structure
    const { data: areasData, error: areasError } = await supabaseAdmin
      .from('estimate_areas')
      .select('*')
      .eq('structure_id', structure.id)
      .order('sort_order');

    if (areasError) throw areasError;

    const areas: AreaWithChildren[] = [];

    for (const areaRow of areasData || []) {
      const area = mapAreaRow(areaRow);

      // Get zones for this area
      const { data: zonesData, error: zonesError } = await supabaseAdmin
        .from('estimate_zones')
        .select('*')
        .eq('area_id', area.id)
        .order('sort_order');

      if (zonesError) throw zonesError;

      const zones: ZoneWithChildren[] = [];

      for (const zoneRow of zonesData || []) {
        const zone = mapZoneRow(zoneRow);

        // Get missing walls (from zone_openings)
        const { data: wallsData, error: wallsError } = await supabaseAdmin
          .from('zone_openings')
          .select('*')
          .eq('zone_id', zone.id)
          .order('sort_order');

        if (wallsError) throw wallsError;

        // Get subrooms
        const { data: subroomsData, error: subroomsError } = await supabaseAdmin
          .from('estimate_subrooms')
          .select('*')
          .eq('zone_id', zone.id)
          .order('sort_order');

        if (subroomsError) throw subroomsError;

        // Get line item totals
        const { data: lineItems, error: lineItemsError } = await supabaseAdmin
          .from('estimate_line_items')
          .select('rcv, acv')
          .eq('zone_id', zone.id)
          .eq('is_approved', true);

        if (lineItemsError) throw lineItemsError;

        const count = lineItems?.length || 0;
        const rcvTotal = lineItems?.reduce((sum, item) => sum + (parseFloat(item.rcv?.toString() || '0')), 0) || 0;
        const acvTotal = lineItems?.reduce((sum, item) => sum + (parseFloat(item.acv?.toString() || '0')), 0) || 0;

        zones.push({
          ...zone,
          dimensions: (zone.dimensions as ZoneDimensions) || {},
          missingWalls: (wallsData || []).map(row => mapZoneOpeningToMissingWall(row)),
          subrooms: (subroomsData || []).map(mapSubroomRow),
          lineItemCount: count,
          zoneTotals: {
            rcvTotal,
            acvTotal,
          },
        });
      }

      areas.push({ ...area, zones });
    }

    structures.push({ ...structure, areas });
  }

  return { estimateId, structures };
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

  // Get the claim_id from the estimate to check for saved rooms
  const { data: estimate, error: estError } = await supabaseAdmin
    .from('estimates')
    .select('claim_id')
    .eq('id', estimateId)
    .single();

  if (estError) throw estError;

  // Check if there are saved rooms from Voice Sketch
  let claimRooms: any[] = [];
  let claimStructures: any[] = [];

  if (estimate?.claim_id) {
    const { data: rooms } = await supabaseAdmin
      .from('claim_rooms')
      .select('*')
      .eq('claim_id', estimate.claim_id)
      .order('sort_order', { ascending: true });

    const { data: structures } = await supabaseAdmin
      .from('claim_structures')
      .select('*')
      .eq('claim_id', estimate.claim_id)
      .order('sort_order', { ascending: true });

    claimRooms = rooms || [];
    claimStructures = structures || [];
  }

  // If we have saved rooms from Voice Sketch, import them
  if (claimRooms.length > 0) {
    // Create structures from claim_structures or a default one
    const structureMap = new Map<string | null, EstimateStructure>();

    if (claimStructures.length > 0) {
      for (const cs of claimStructures) {
        const structure = await createStructure({
          estimateId,
          name: cs.name,
          description: cs.description,
          yearBuilt: cs.year_built,
          constructionType: cs.construction_type,
          stories: cs.stories || 1,
        });
        structureMap.set(cs.id, structure);
        // Note: recalculateStructureTotals is already called in createStructure
      }
    }

    // Create a default structure for orphan rooms
    const defaultStructure = await createStructure({
      estimateId,
      name: opts.structureName,
    });
    structureMap.set(null, defaultStructure);

    // Create Interior area for each structure
    const areaMap = new Map<string, EstimateArea>();
    for (const [structureClaimId, structure] of structureMap) {
      const area = await createArea({
        structureId: structure.id,
        name: 'Interior',
        areaType: 'interior',
      });
      areaMap.set(structure.id, area);
    }

    // Create zones from claim_rooms
    for (const room of claimRooms) {
      // Find the corresponding estimate structure
      const estimateStructure = room.structure_id
        ? structureMap.get(room.structure_id) || structureMap.get(null)
        : structureMap.get(null);

      if (!estimateStructure) continue;

      const area = areaMap.get(estimateStructure.id);
      if (!area) continue;

      // Create zone from claim room
      await createZone({
        areaId: area.id,
        name: room.name,
        zoneType: 'room',
        roomType: room.room_type || 'room',
        floorLevel: room.floor_level || '1',
        lengthFt: parseFloat(room.length_ft) || 10,
        widthFt: parseFloat(room.width_ft) || 10,
        heightFt: parseFloat(room.ceiling_height_ft) || 8,
        notes: Array.isArray(room.notes) ? room.notes.join('\n') : room.notes || undefined,
      });
    }

    // Also create Exterior and Roofing areas on the default structure
    if (opts.includeExterior) {
      await createArea({
        structureId: defaultStructure.id,
        name: 'Exterior',
        areaType: 'exterior',
      });
    }

    if (opts.includeRoofing) {
      await createArea({
        structureId: defaultStructure.id,
        name: 'Roofing',
        areaType: 'roofing',
      });
    }
  } else {
    // No saved rooms - create default structure
    // Try to get property info from claim's loss_context
    let yearBuilt: number | undefined;
    let constructionType: string | undefined;
    let description: string | undefined;

    if (estimate?.claim_id) {
      const { data: claimData } = await supabaseAdmin
        .from('claims')
        .select('loss_context')
        .eq('id', estimate.claim_id)
        .single();

      if (claimData?.loss_context) {
        const lossContext = claimData.loss_context as any;
        const propertyInfo = lossContext?.property_damage_information || lossContext?.fnol?.property_damage_information;
        
        if (propertyInfo?.year_built) {
          // Parse year from formats like "01-01-2007" or "2007"
          const yearMatch = propertyInfo.year_built.match(/(\d{4})/);
          if (yearMatch) {
            yearBuilt = parseInt(yearMatch[1]);
          }
        }
        
        if (propertyInfo?.construction_type) {
          constructionType = propertyInfo.construction_type;
        }
        
        if (propertyInfo?.dwelling_incident_damages) {
          description = propertyInfo.dwelling_incident_damages;
        } else if (lossContext?.fnol?.loss_description) {
          description = lossContext.fnol.loss_description;
        }
      }
    }

    const structure = await createStructure({
      estimateId,
      name: opts.structureName,
      yearBuilt,
      constructionType,
      description,
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
  }

  return getEstimateHierarchy(estimateId);
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
  // Get the zone to find estimate_id
  const { data: zoneData, error: zoneError } = await supabaseAdmin
    .from('estimate_zones')
    .select(`
      id,
      estimate_areas!inner (
        structure_id,
        estimate_structures!inner (
          estimate_id
        )
      )
    `)
    .eq('id', zoneId)
    .single();

  if (zoneError || !zoneData) {
    throw new Error('Zone not found');
  }

  const estimateId = (zoneData.estimate_areas as any).estimate_structures.estimate_id;

  // Get line item definition
  const { data: lineItem, error: lineItemError } = await supabaseAdmin
    .from('line_items')
    .select('*')
    .eq('code', lineItemData.lineItemCode)
    .eq('is_active', true)
    .single();

  if (lineItemError || !lineItem) {
    throw new Error(`Line item ${lineItemData.lineItemCode} not found`);
  }

  // Get next sort order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('sort_order')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (orderError) throw orderError;

  const sortOrder = (orderData && orderData.length > 0 ? orderData[0].sort_order : -1) + 1;

  // Insert line item with zone reference
  const { error: insertError } = await supabaseAdmin
    .from('estimate_line_items')
    .insert({
      estimate_id: estimateId,
      zone_id: zoneId,
      line_item_code: lineItem.code,
      line_item_description: lineItem.description,
      category_id: lineItem.category_id,
      quantity: lineItemData.quantity,
      unit: lineItem.unit,
      unit_price: parseFloat(lineItem.unit_price || '0'),
      subtotal: lineItemData.quantity * parseFloat(lineItem.unit_price || '0'),
      calc_ref: lineItemData.calcRef || null,
      is_homeowner: lineItemData.isHomeowner || false,
      is_credit: lineItemData.isCredit || false,
      is_non_op: lineItemData.isNonOp || false,
      notes: lineItemData.notes || null,
      sort_order: sortOrder,
      source: 'manual',
    });

  if (insertError) throw insertError;

  // Update zone line item count
  const { data: countData, error: countError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId);

  if (countError) throw countError;

  // Recalculate structure totals after adding line item
  const { data: zoneData } = await supabaseAdmin
    .from('estimate_zones')
    .select('estimate_areas!inner(structure_id)')
    .eq('id', zoneId)
    .single();

  if (zoneData) {
    const structureId = (zoneData.estimate_areas as any).structure_id;
    await recalculateStructureTotals(structureId).catch(err => {
      console.error('Error recalculating structure totals:', err);
    });
  }

  // Note: The line_item_count might be updated by a database trigger
  // This is just for redundancy if the trigger doesn't exist
}

// ============================================
// STRUCTURE TOTALS RECALCULATION
// ============================================

/**
 * Recalculate structure totals (total_sf, rcv_total, acv_total) from zones and line items
 */
export async function recalculateStructureTotals(structureId: string): Promise<void> {
  // Get all zones for this structure through areas
  const { data: areasData, error: areasError } = await supabaseAdmin
    .from('estimate_areas')
    .select('id')
    .eq('structure_id', structureId);

  if (areasError) throw areasError;

  const areaIds = (areasData || []).map(a => a.id);
  if (areaIds.length === 0) {
    // No areas, set totals to 0
    await supabaseAdmin
      .from('estimate_structures')
      .update({
        total_sf: '0',
        rcv_total: '0',
        acv_total: '0',
        updated_at: new Date().toISOString(),
      })
      .eq('id', structureId);
    return;
  }

  // Get all zones for these areas
  const { data: zonesData, error: zonesError } = await supabaseAdmin
    .from('estimate_zones')
    .select('id, dimensions')
    .in('area_id', areaIds);

  if (zonesError) throw zonesError;

  // Calculate total square footage from zone dimensions
  let totalSf = 0;
  for (const zone of zonesData || []) {
    const dims = zone.dimensions as any;
    if (dims?.sfFloor) {
      totalSf += parseFloat(dims.sfFloor.toString() || '0');
    } else if (dims?.lengthFt && dims?.widthFt) {
      // Calculate from length/width if sfFloor not available
      totalSf += parseFloat(dims.lengthFt.toString() || '0') * parseFloat(dims.widthFt.toString() || '0');
    }
  }

  // Get all line items for these zones
  const zoneIds = (zonesData || []).map(z => z.id);
  let rcvTotal = 0;
  let acvTotal = 0;

  if (zoneIds.length > 0) {
    const { data: lineItemsData, error: lineItemsError } = await supabaseAdmin
      .from('estimate_line_items')
      .select('rcv, acv')
      .in('zone_id', zoneIds)
      .eq('is_approved', true);

    if (lineItemsError) throw lineItemsError;

    for (const item of lineItemsData || []) {
      rcvTotal += parseFloat(item.rcv?.toString() || '0');
      acvTotal += parseFloat(item.acv?.toString() || '0');
    }
  }

  // Update structure totals
  const { error: updateError } = await supabaseAdmin
    .from('estimate_structures')
    .update({
      total_sf: totalSf.toFixed(2),
      rcv_total: rcvTotal.toFixed(2),
      acv_total: acvTotal.toFixed(2),
      updated_at: new Date().toISOString(),
    })
    .eq('id', structureId);

  if (updateError) throw updateError;
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
    associatedPeril: row.associated_peril,
    perilConfidence: row.peril_confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapZoneOpeningToMissingWall(row: any, quantity: number = 1): EstimateMissingWall {
  // Extract name from notes if present (format "Name: X")
  let name = null;
  if (row.notes && row.notes.startsWith('Name: ')) {
    name = row.notes.substring(6);
  }

  return {
    id: row.id,
    zoneId: row.zone_id,
    name: name,
    openingType: row.opening_type,
    widthFt: parseFloat(row.width_ft),
    heightFt: parseFloat(row.height_ft),
    quantity: quantity,
    goesToFloor: parseFloat(row.sill_height_ft || '0') === 0,
    goesToCeiling: false, // Infer?
    opensInto: null, // Not stored in zone_openings
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
  // Check for existing draft estimate
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from('estimates')
    .select(`
      id,
      estimate_structures!inner (
        id,
        estimate_areas!inner (
          id,
          estimate_zones!inner (
            id
          )
        )
      )
    `)
    .eq('claim_id', claimId)
    .eq('is_locked', false)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  if (existingData && existingData.length > 0) {
    const estimate = existingData[0];
    const structures = (estimate.estimate_structures as any[]) || [];
    if (structures.length > 0) {
      const areas = structures[0].estimate_areas || [];
      if (areas.length > 0) {
        const zones = areas[0].estimate_zones || [];
        if (zones.length > 0) {
          return {
            estimateId: estimate.id,
            defaultZoneId: zones[0].id,
          };
        }
      }
    }
  }

  // Create new draft estimate
  const { data: estimateData, error: estimateError } = await supabaseAdmin
    .from('estimates')
    .insert({
      organization_id: organizationId,
      claim_id: claimId,
      name: 'Draft Scope',
      status: 'draft',
      region_id: 'US-NATIONAL',
    })
    .select('id')
    .single();

  if (estimateError) throw estimateError;

  const estimateId = estimateData.id;

  // Create default structure
  const { data: structureData, error: structureError } = await supabaseAdmin
    .from('estimate_structures')
    .insert({
      estimate_id: estimateId,
      name: 'Main Structure',
    })
    .select('id')
    .single();

  if (structureError) throw structureError;

  const structureId = structureData.id;

  // Create default area
  const { data: areaData, error: areaError } = await supabaseAdmin
    .from('estimate_areas')
    .insert({
      structure_id: structureId,
      name: 'Interior',
      area_type: 'interior',
    })
    .select('id')
    .single();

  if (areaError) throw areaError;

  const areaId = areaData.id;

  // Create default zone
  const { data: zoneData, error: zoneError } = await supabaseAdmin
    .from('estimate_zones')
    .insert({
      area_id: areaId,
      name: 'General',
      zone_type: 'room',
    })
    .select('id')
    .single();

  if (zoneError) throw zoneError;

  const zoneId = zoneData.id;

  return { estimateId, defaultZoneId: zoneId };
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

  const subtotal = item.quantity * item.unitPrice;

  const { data, error } = await supabaseAdmin
    .from('estimate_line_items')
    .insert({
      estimate_id: estimateId,
      zone_id: defaultZoneId,
      line_item_code: item.lineItemCode,
      line_item_description: item.description,
      category_id: item.category || '',
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unitPrice,
      subtotal,
      room_name: item.roomName || null,
      notes: item.notes || null,
      source: 'manual',
    })
    .select('id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, created_at')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    lineItemCode: data.line_item_code,
    description: data.line_item_description,
    category: data.category_id || '',
    quantity: parseFloat(data.quantity),
    unit: data.unit,
    unitPrice: parseFloat(data.unit_price),
    total: parseFloat(data.subtotal),
    roomName: data.room_name,
    notes: data.notes,
    createdAt: data.created_at,
  };
}

export async function getScopeItemsForClaim(claimId: string): Promise<ClaimScopeItem[]> {
  // First, get the draft estimate IDs for this claim (Supabase doesn't have FK relationship)
  const { data: estimates, error: estError } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .eq('claim_id', claimId)
    .eq('is_locked', false)
    .eq('status', 'draft');

  if (estError) throw estError;

  if (!estimates || estimates.length === 0) {
    return [];
  }

  const estimateIds = estimates.map(e => e.id);

  // Then get line items for those estimates
  const { data, error } = await supabaseAdmin
    .from('estimate_line_items')
    .select(`
      id,
      line_item_code,
      line_item_description,
      category_id,
      quantity,
      unit,
      unit_price,
      subtotal,
      room_name,
      notes,
      created_at
    `)
    .in('estimate_id', estimateIds)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
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
}

export async function updateScopeItem(
  itemId: string,
  data: { quantity?: number; notes?: string }
): Promise<ClaimScopeItem | null> {
  const updateData: any = {};

  if (data.quantity !== undefined) {
    updateData.quantity = data.quantity;
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes;
  }

  if (Object.keys(updateData).length === 0) return null;

  updateData.updated_at = new Date().toISOString();

  // Update the item
  const { error: updateError } = await supabaseAdmin
    .from('estimate_line_items')
    .update(updateData)
    .eq('id', itemId);

  if (updateError) throw updateError;

  // Recalculate subtotal if quantity changed (via database trigger or manual update)
  if (data.quantity !== undefined) {
    // Get the current unit_price to recalculate subtotal
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('estimate_line_items')
      .select('unit_price, quantity')
      .eq('id', itemId)
      .single();

    if (fetchError) throw fetchError;

    const subtotal = currentData.quantity * currentData.unit_price;

    const { error: subtotalError } = await supabaseAdmin
      .from('estimate_line_items')
      .update({ subtotal })
      .eq('id', itemId);

    if (subtotalError) throw subtotalError;
  }

  // Fetch updated row
  const { data: updated, error: fetchError } = await supabaseAdmin
    .from('estimate_line_items')
    .select('id, line_item_code, line_item_description, category_id, quantity, unit, unit_price, subtotal, room_name, notes, created_at')
    .eq('id', itemId)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') return null; // Not found
    throw fetchError;
  }

  return {
    id: updated.id,
    lineItemCode: updated.line_item_code,
    description: updated.line_item_description,
    category: updated.category_id || '',
    quantity: parseFloat(updated.quantity),
    unit: updated.unit,
    unitPrice: parseFloat(updated.unit_price),
    total: parseFloat(updated.subtotal),
    roomName: updated.room_name,
    notes: updated.notes,
    createdAt: updated.created_at,
  };
}

export async function deleteScopeItem(itemId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('estimate_line_items')
    .delete()
    .eq('id', itemId);

  if (error) throw error;

  return true;
}
