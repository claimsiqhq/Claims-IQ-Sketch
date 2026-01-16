import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { ClaimRoom, ClaimDamageZone, ClaimStructure, InsertClaimRoom, InsertClaimDamageZone, InsertClaimStructure } from '@shared/schema';

// ============================================
// STRUCTURE TYPES AND MAPPING
// ============================================

interface StructureRow {
  id: string;
  claim_id: string;
  organization_id: string;
  name: string;
  structure_type: string;
  description: string | null;
  address: string | null;
  stories: number | null;
  year_built: number | null;
  construction_type: string | null;
  roof_type: string | null;
  photos: unknown;
  notes: unknown;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToStructure(row: StructureRow): ClaimStructure {
  return {
    id: row.id,
    claimId: row.claim_id,
    organizationId: row.organization_id,
    name: row.name,
    structureType: row.structure_type,
    description: row.description,
    address: row.address,
    stories: row.stories,
    yearBuilt: row.year_built,
    constructionType: row.construction_type,
    roofType: row.roof_type,
    photos: row.photos,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RoomRow {
  id: string;
  claim_id: string;
  organization_id: string;
  structure_id: string | null;
  name: string;
  room_type: string | null;
  floor_level: string | null;
  shape: string;
  width_ft: string;
  length_ft: string;
  ceiling_height_ft: string | null;
  origin_x_ft: string | null;
  origin_y_ft: string | null;
  polygon: unknown;
  l_shape_config: unknown;
  t_shape_config: unknown;
  openings: unknown;
  features: unknown;
  notes: unknown;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

interface DamageZoneRow {
  id: string;
  claim_id: string;
  room_id: string | null;
  organization_id: string;
  damage_type: string;
  category: string | null;
  affected_walls: unknown;
  floor_affected: boolean;
  ceiling_affected: boolean;
  extent_ft: string | null;
  severity: string | null;
  source: string | null;
  polygon: unknown;
  is_freeform: boolean;
  notes: string | null;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToRoom(row: RoomRow): ClaimRoom {
  return {
    id: row.id,
    claimId: row.claim_id,
    organizationId: row.organization_id,
    structureId: row.structure_id,
    name: row.name,
    roomType: row.room_type,
    floorLevel: row.floor_level,
    shape: row.shape,
    widthFt: row.width_ft,
    lengthFt: row.length_ft,
    ceilingHeightFt: row.ceiling_height_ft,
    originXFt: row.origin_x_ft,
    originYFt: row.origin_y_ft,
    polygon: row.polygon,
    lShapeConfig: row.l_shape_config,
    tShapeConfig: row.t_shape_config,
    openings: row.openings,
    features: row.features,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToDamageZone(row: DamageZoneRow): ClaimDamageZone {
  return {
    id: row.id,
    claimId: row.claim_id,
    roomId: row.room_id,
    organizationId: row.organization_id,
    damageType: row.damage_type,
    category: row.category,
    affectedWalls: row.affected_walls,
    floorAffected: row.floor_affected,
    ceilingAffected: row.ceiling_affected,
    extentFt: row.extent_ft,
    severity: row.severity,
    source: row.source,
    polygon: row.polygon,
    isFreeform: row.is_freeform,
    notes: row.notes,
    sortOrder: row.sort_order,
    associatedPeril: (row as any).associated_peril,
    perilConfidence: (row as any).peril_confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// STRUCTURE CRUD OPERATIONS
// ============================================

export async function getStructuresByClaimId(claimId: string): Promise<ClaimStructure[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_structures')
    .select('*')
    .eq('claim_id', claimId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToStructure);
}

export async function createStructure(structure: Omit<InsertClaimStructure, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClaimStructure> {
  const { data, error } = await supabaseAdmin
    .from('claim_structures')
    .insert({
      claim_id: structure.claimId,
      organization_id: structure.organizationId,
      name: structure.name,
      structure_type: structure.structureType,
      description: structure.description || null,
      address: structure.address || null,
      stories: structure.stories || 1,
      year_built: structure.yearBuilt || null,
      construction_type: structure.constructionType || null,
      roof_type: structure.roofType || null,
      photos: structure.photos || [],
      notes: structure.notes || [],
      sort_order: structure.sortOrder || 0,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRowToStructure(data);
}

export async function deleteStructuresByClaimId(claimId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('claim_structures')
    .delete()
    .eq('claim_id', claimId)
    .select();

  if (error) throw error;
  return data?.length ?? 0;
}

// ============================================
// ROOM CRUD OPERATIONS
// ============================================

export async function getRoomsByClaimId(claimId: string): Promise<ClaimRoom[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_rooms')
    .select('*')
    .eq('claim_id', claimId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToRoom);
}

export async function getDamageZonesByClaimId(claimId: string): Promise<ClaimDamageZone[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_damage_zones')
    .select('*')
    .eq('claim_id', claimId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToDamageZone);
}

export async function getDamageZonesByRoomId(roomId: string): Promise<ClaimDamageZone[]> {
  const { data, error } = await supabaseAdmin
    .from('claim_damage_zones')
    .select('*')
    .eq('room_id', roomId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRowToDamageZone);
}

export async function createRoom(
  room: Omit<InsertClaimRoom, 'id' | 'createdAt' | 'updatedAt'> & {
    flowInstanceId?: string;
    movementId?: string;
  }
): Promise<ClaimRoom> {
  const { data, error } = await supabaseAdmin
    .from('claim_rooms')
    .insert({
      claim_id: room.claimId,
      organization_id: room.organizationId,
      structure_id: room.structureId || null,
      name: room.name,
      room_type: room.roomType || null,
      floor_level: room.floorLevel || '1',
      shape: room.shape || 'rectangular',
      width_ft: room.widthFt,
      length_ft: room.lengthFt,
      ceiling_height_ft: room.ceilingHeightFt || 8.0,
      origin_x_ft: room.originXFt || 0,
      origin_y_ft: room.originYFt || 0,
      polygon: room.polygon || [],
      l_shape_config: room.lShapeConfig || null,
      t_shape_config: room.tShapeConfig || null,
      openings: room.openings || [],
      features: room.features || [],
      notes: room.notes || [],
      sort_order: room.sortOrder || 0,
      flow_instance_id: room.flowInstanceId || null,
      movement_id: room.movementId || null,
      created_during_inspection: !!(room.flowInstanceId && room.movementId),
    })
    .select('*')
    .single();

  if (error) throw error;
  
  const createdRoom = mapRowToRoom(data);
  
  // If created during flow, also add to movement_evidence
  if (room.flowInstanceId && room.movementId) {
    await supabaseAdmin.from('movement_evidence').insert({
      flow_instance_id: room.flowInstanceId,
      movement_id: room.movementId,
      evidence_type: 'sketch_zone',
      reference_id: createdRoom.id,
      evidence_data: {
        name: room.name,
        roomType: room.roomType,
        widthFt: room.widthFt,
        lengthFt: room.lengthFt,
      },
    }).catch(err => {
      console.error('[rooms] Failed to create movement_evidence for room:', err);
      // Don't throw - room creation succeeded
    });
  }
  
  return createdRoom;
}

export async function createDamageZone(
  zone: Omit<InsertClaimDamageZone, 'id' | 'createdAt' | 'updatedAt'> & {
    flowInstanceId?: string;
    movementId?: string;
  }
): Promise<ClaimDamageZone> {
  const { data, error } = await supabaseAdmin
    .from('claim_damage_zones')
    .insert({
      claim_id: zone.claimId,
      room_id: zone.roomId || null,
      organization_id: zone.organizationId,
      damage_type: zone.damageType,
      category: zone.category || null,
      affected_walls: zone.affectedWalls || [],
      floor_affected: zone.floorAffected || false,
      ceiling_affected: zone.ceilingAffected || false,
      extent_ft: zone.extentFt || 0,
      severity: zone.severity || null,
      source: zone.source || null,
      polygon: zone.polygon || [],
      is_freeform: zone.isFreeform || false,
      notes: zone.notes || null,
      sort_order: zone.sortOrder || 0,
      flow_instance_id: zone.flowInstanceId || null,
      movement_id: zone.movementId || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  
  const createdZone = mapRowToDamageZone(data);
  
  // If created during flow, also add to movement_evidence
  if (zone.flowInstanceId && zone.movementId) {
    await supabaseAdmin.from('movement_evidence').insert({
      flow_instance_id: zone.flowInstanceId,
      movement_id: zone.movementId,
      evidence_type: 'damage_marker',
      reference_id: createdZone.id,
      evidence_data: {
        damageType: zone.damageType,
        severity: zone.severity,
        category: zone.category,
        affectedWalls: zone.affectedWalls,
      },
    }).catch(err => {
      console.error('[rooms] Failed to create movement_evidence for damage zone:', err);
      // Don't throw - zone creation succeeded
    });
  }
  
  return createdZone;
}

export async function updateRoom(id: string, updates: Partial<InsertClaimRoom>): Promise<ClaimRoom | null> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    roomType: 'room_type',
    floorLevel: 'floor_level',
    shape: 'shape',
    widthFt: 'width_ft',
    lengthFt: 'length_ft',
    ceilingHeightFt: 'ceiling_height_ft',
    originXFt: 'origin_x_ft',
    originYFt: 'origin_y_ft',
    polygon: 'polygon',
    lShapeConfig: 'l_shape_config',
    tShapeConfig: 't_shape_config',
    openings: 'openings',
    features: 'features',
    notes: 'notes',
    sortOrder: 'sort_order',
  };

  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key] && value !== undefined) {
      updateData[fieldMap[key]] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('claim_rooms')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data ? mapRowToRoom(data) : null;
}

export async function updateDamageZone(id: string, updates: Partial<InsertClaimDamageZone>): Promise<ClaimDamageZone | null> {
  const fieldMap: Record<string, string> = {
    roomId: 'room_id',
    damageType: 'damage_type',
    category: 'category',
    affectedWalls: 'affected_walls',
    floorAffected: 'floor_affected',
    ceilingAffected: 'ceiling_affected',
    extentFt: 'extent_ft',
    severity: 'severity',
    source: 'source',
    polygon: 'polygon',
    isFreeform: 'is_freeform',
    notes: 'notes',
    sortOrder: 'sort_order',
  };

  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key] && value !== undefined) {
      updateData[fieldMap[key]] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('claim_damage_zones')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data ? mapRowToDamageZone(data) : null;
}

export async function deleteRoom(id: string): Promise<boolean> {
  // Delete related damage zones first
  await supabaseAdmin
    .from('claim_damage_zones')
    .delete()
    .eq('room_id', id);

  // Then delete the room
  const { data, error } = await supabaseAdmin
    .from('claim_rooms')
    .delete()
    .eq('id', id)
    .select();

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function deleteDamageZone(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('claim_damage_zones')
    .delete()
    .eq('id', id)
    .select();

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function deleteRoomsByClaimId(claimId: string): Promise<number> {
  // Delete related damage zones first
  await supabaseAdmin
    .from('claim_damage_zones')
    .delete()
    .eq('claim_id', claimId);

  // Then delete the rooms
  const { data, error } = await supabaseAdmin
    .from('claim_rooms')
    .delete()
    .eq('claim_id', claimId)
    .select();

  if (error) throw error;
  return data?.length ?? 0;
}

// Input types for hierarchy save
interface RoomInput {
  id?: string;
  name: string;
  shape?: string;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft?: number;
  polygon?: Array<{ x: number; y: number }>;
  openings?: unknown[];
  features?: unknown[];
  damageZones?: Array<{
    id?: string;
    type: string;
    category?: string;
    severity?: string;
    affected_walls?: string[];
    floor_affected?: boolean;
    ceiling_affected?: boolean;
    extent_ft?: number;
    source?: string;
    notes?: string;
    polygon?: Array<{ x: number; y: number }>;
    is_freeform?: boolean;
  }>;
  notes?: unknown[];
  origin_x_ft?: number;
  origin_y_ft?: number;
  l_shape_config?: unknown;
  t_shape_config?: unknown;
  structure_id?: string; // Reference to parent structure (local id for mapping)
}

interface StructureInput {
  id?: string; // Local id for mapping rooms
  name: string;
  type: string;
  description?: string;
  address?: string;
  stories?: number;
  year_built?: number;
  construction_type?: string;
  roof_type?: string;
  photos?: unknown[];
  notes?: unknown[];
  rooms?: RoomInput[]; // Nested rooms
}

export async function saveClaimHierarchy(
  claimId: string,
  organizationId: string,
  structures: StructureInput[],
  rooms: RoomInput[] = [] // Rooms not associated with a structure
): Promise<{ 
  structures: ClaimStructure[]; 
  rooms: ClaimRoom[]; 
  damageZones: ClaimDamageZone[] 
}> {
  // Delete existing data
  await deleteStructuresByClaimId(claimId);
  await deleteRoomsByClaimId(claimId);

  const savedStructures: ClaimStructure[] = [];
  const savedRooms: ClaimRoom[] = [];
  const savedDamageZones: ClaimDamageZone[] = [];
  
  // Map of local structure IDs to saved structure IDs
  const structureIdMap = new Map<string, string>();

  // Save structures first
  for (let i = 0; i < structures.length; i++) {
    const structure = structures[i];
    const savedStructure = await createStructure({
      claimId,
      organizationId,
      name: structure.name,
      structureType: structure.type,
      description: structure.description || null,
      address: structure.address || null,
      stories: structure.stories || 1,
      yearBuilt: structure.year_built || null,
      constructionType: structure.construction_type || null,
      roofType: structure.roof_type || null,
      photos: structure.photos || [],
      notes: structure.notes || [],
      sortOrder: i,
    });
    savedStructures.push(savedStructure);
    
    // Map local ID to saved ID
    if (structure.id) {
      structureIdMap.set(structure.id, savedStructure.id);
    }

    // Save rooms within this structure
    if (structure.rooms && structure.rooms.length > 0) {
      for (let j = 0; j < structure.rooms.length; j++) {
        const room = structure.rooms[j];
        const { savedRoom, savedZones } = await saveRoomWithDamageZones(
          claimId,
          organizationId,
          room,
          savedStructure.id,
          j
        );
        savedRooms.push(savedRoom);
        savedDamageZones.push(...savedZones);
      }
    }
  }

  // Save rooms not associated with any structure (or with structure_id reference)
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const structureId = room.structure_id ? structureIdMap.get(room.structure_id) : null;
    const { savedRoom, savedZones } = await saveRoomWithDamageZones(
      claimId,
      organizationId,
      room,
      structureId || null,
      i + (structures.length * 100) // Offset sort order
    );
    savedRooms.push(savedRoom);
    savedDamageZones.push(...savedZones);
  }

  return { structures: savedStructures, rooms: savedRooms, damageZones: savedDamageZones };
}

async function saveRoomWithDamageZones(
  claimId: string,
  organizationId: string,
  room: RoomInput,
  structureId: string | null,
  sortOrder: number
): Promise<{ savedRoom: ClaimRoom; savedZones: ClaimDamageZone[] }> {
  const savedRoom = await createRoom({
    claimId,
    organizationId,
    structureId,
    name: room.name,
    shape: room.shape || 'rectangular',
    widthFt: String(room.width_ft),
    lengthFt: String(room.length_ft),
    ceilingHeightFt: room.ceiling_height_ft ? String(room.ceiling_height_ft) : '8.0',
    polygon: room.polygon || [],
    openings: room.openings || [],
    features: room.features || [],
    notes: room.notes || [],
    originXFt: room.origin_x_ft ? String(room.origin_x_ft) : '0',
    originYFt: room.origin_y_ft ? String(room.origin_y_ft) : '0',
    lShapeConfig: room.l_shape_config || null,
    tShapeConfig: room.t_shape_config || null,
    sortOrder,
  });

  const savedZones: ClaimDamageZone[] = [];
  if (room.damageZones && room.damageZones.length > 0) {
    for (let j = 0; j < room.damageZones.length; j++) {
      const zone = room.damageZones[j];
      const savedZone = await createDamageZone({
        claimId,
        roomId: savedRoom.id,
        organizationId,
        damageType: zone.type,
        category: zone.category || null,
        severity: zone.severity || null,
        affectedWalls: zone.affected_walls || [],
        floorAffected: zone.floor_affected || false,
        ceilingAffected: zone.ceiling_affected || false,
        extentFt: zone.extent_ft ? String(zone.extent_ft) : '0',
        source: zone.source || null,
        polygon: zone.polygon || [],
        isFreeform: zone.is_freeform || false,
        notes: zone.notes || null,
        sortOrder: j,
      });
      savedZones.push(savedZone);
    }
  }

  return { savedRoom, savedZones };
}

// Legacy function for backwards compatibility
export async function saveClaimRoomsAndZones(
  claimId: string,
  organizationId: string,
  rooms: RoomInput[]
): Promise<{ rooms: ClaimRoom[]; damageZones: ClaimDamageZone[] }> {
  await deleteRoomsByClaimId(claimId);

  const savedRooms: ClaimRoom[] = [];
  const savedDamageZones: ClaimDamageZone[] = [];

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const savedRoom = await createRoom({
      claimId,
      organizationId,
      name: room.name,
      shape: room.shape || 'rectangular',
      widthFt: String(room.width_ft),
      lengthFt: String(room.length_ft),
      ceilingHeightFt: room.ceiling_height_ft ? String(room.ceiling_height_ft) : '8.0',
      polygon: room.polygon || [],
      openings: room.openings || [],
      features: room.features || [],
      notes: room.notes || [],
      originXFt: room.origin_x_ft ? String(room.origin_x_ft) : '0',
      originYFt: room.origin_y_ft ? String(room.origin_y_ft) : '0',
      lShapeConfig: room.l_shape_config || null,
      tShapeConfig: room.t_shape_config || null,
      sortOrder: i,
    });
    savedRooms.push(savedRoom);

    if (room.damageZones && room.damageZones.length > 0) {
      for (let j = 0; j < room.damageZones.length; j++) {
        const zone = room.damageZones[j];
        const savedZone = await createDamageZone({
          claimId,
          roomId: savedRoom.id,
          organizationId,
          damageType: zone.type,
          category: zone.category || null,
          severity: zone.severity || null,
          affectedWalls: zone.affected_walls || [],
          floorAffected: zone.floor_affected || false,
          ceilingAffected: zone.ceiling_affected || false,
          extentFt: zone.extent_ft ? String(zone.extent_ft) : '0',
          source: zone.source || null,
          polygon: zone.polygon || [],
          isFreeform: zone.is_freeform || false,
          notes: zone.notes || null,
          sortOrder: j,
        });
        savedDamageZones.push(savedZone);
      }
    }
  }

  return { rooms: savedRooms, damageZones: savedDamageZones };
}

export async function getClaimRoomsAndZones(claimId: string): Promise<{
  rooms: ClaimRoom[];
  damageZones: ClaimDamageZone[];
}> {
  const rooms = await getRoomsByClaimId(claimId);
  const damageZones = await getDamageZonesByClaimId(claimId);
  return { rooms, damageZones };
}

export async function getClaimHierarchy(claimId: string): Promise<{
  structures: ClaimStructure[];
  rooms: ClaimRoom[];
  damageZones: ClaimDamageZone[];
}> {
  const structures = await getStructuresByClaimId(claimId);
  const rooms = await getRoomsByClaimId(claimId);
  const damageZones = await getDamageZonesByClaimId(claimId);
  return { structures, rooms, damageZones };
}
