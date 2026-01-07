// Voice Sketch Geometry Types
// These types define the structures for voice-driven room sketching
// Hierarchy: Structure > Room > Sub-room > Object

export type WallDirection = 'north' | 'south' | 'east' | 'west';
export type RoomShape = 'rectangle' | 'l_shape' | 't_shape' | 'irregular';
export type OpeningType = 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door';
export type FeatureType = 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in';
export type ObjectType = 'appliance' | 'fixture' | 'cabinet' | 'counter' | 'furniture' | 'equipment' | 'other';
export type DamageType = 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact';
export type WaterDamageCategory = '1' | '2' | '3'; // IICRC S500 categories
export type PositionType = 'left' | 'center' | 'right' | number;
export type PositionFromType = 'start' | 'end';
export type StructureType = 'main_dwelling' | 'detached_garage' | 'attached_garage' | 'shed' | 'pool_house' | 'guest_house' | 'barn' | 'other';
export type FlooringType = 'hardwood' | 'carpet' | 'tile' | 'vinyl' | 'laminate' | 'concrete' | 'stone' | 'other';

// Hierarchy level for organizing sketch elements
export type HierarchyLevel = 'structure' | 'room' | 'subroom' | 'object';

// Corner positions for L-shape notch placement
export type CornerPosition = 'northeast' | 'northwest' | 'southeast' | 'southwest';

export interface Point {
  x: number;
  y: number;
}

// L-Shape configuration: main rectangle with a notch cut out of one corner
export interface LShapeConfig {
  notch_corner: CornerPosition; // Which corner has the cutout
  notch_width_ft: number; // Width of the notch (along the width axis)
  notch_length_ft: number; // Length of the notch (along the length axis)
}

// T-Shape configuration: main rectangle with a stem extending from one wall
export interface TShapeConfig {
  stem_wall: WallDirection; // Which wall the stem extends from
  stem_width_ft: number; // Width of the stem (perpendicular to the wall)
  stem_length_ft: number; // How far the stem extends out
  stem_position_ft: number; // Position along the wall (from start)
}

export interface Opening {
  id: string;
  type: OpeningType;
  wall: WallDirection;
  width_ft: number;
  height_ft: number;
  position: PositionType;
  position_from?: PositionFromType; // 'start' = from north/west corner, 'end' = from south/east corner
  sill_height_ft?: number; // For windows
}

export interface Feature {
  id: string;
  type: FeatureType;
  wall: WallDirection | 'freestanding';
  width_ft: number;
  depth_ft: number;
  position: PositionType;
  position_from?: PositionFromType; // 'start' = from north/west corner, 'end' = from south/east corner
  x_offset_ft?: number; // For freestanding features: distance from west wall (left edge)
  y_offset_ft?: number; // For freestanding features: distance from south wall (bottom edge)
}

export interface VoiceDamageZone {
  id: string;
  type: DamageType;
  category?: WaterDamageCategory;
  affected_walls: WallDirection[];
  floor_affected: boolean;
  ceiling_affected: boolean;
  extent_ft: number;
  source?: string;
  notes?: string;
  // Optional polygon for precise damage zone boundaries (overrides wall-extent calculation)
  polygon?: Point[];
  // For irregular damage zones that don't follow walls
  is_freeform?: boolean;
}

// Object within a room (appliances, fixtures, furniture, etc.)
export interface SketchObject {
  id: string;
  name: string;
  type: ObjectType;
  description?: string;
  width_ft?: number;
  depth_ft?: number;
  height_ft?: number;
  position?: {
    wall?: WallDirection | 'freestanding';
    x_offset_ft?: number;
    y_offset_ft?: number;
  };
  condition?: 'good' | 'fair' | 'poor' | 'damaged';
  damageNotes?: string;
  photos: SketchPhoto[];
  created_at: string;
  updated_at: string;
}

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed' | 'concerns';

// Photo captured during sketch session
export interface SketchPhoto {
  id: string;
  storageUrl?: string; // Supabase storage URL
  storagePath?: string; // Supabase storage path
  localUri?: string; // Local file URI before upload
  label: string; // User-provided or auto-generated label
  autoLabel?: string; // Auto-generated from hierarchy context
  hierarchyPath: string; // e.g., "Main House > Master Bedroom > Walk-in Closet"
  structureId?: string;
  roomId?: string;
  subRoomId?: string;
  objectId?: string;
  damageZoneId?: string;
  capturedAt: string;
  uploadedAt?: string;
  analyzedAt?: string;
  // GPS coordinates
  latitude?: number | null;
  longitude?: number | null;
  geoAddress?: string | null; // Reverse geocoded address
  // User who uploaded the photo
  uploadedBy?: string | null;
  // AI analysis results
  aiAnalysis?: PhotoAIAnalysis | null;
  // Analysis status
  analysisStatus?: AnalysisStatus | null;
  analysisError?: string | null;
}

// AI analysis of a photo (matches server PhotoAnalysis response)
export interface PhotoAIAnalysis {
  quality: {
    score: number; // 1-10
    issues: string[];
    suggestions: string[];
  };
  content: {
    description: string;
    damageDetected: boolean;
    damageTypes: string[];
    damageLocations: string[];
    materials: string[];
    recommendedLabel: string;
  };
  metadata: {
    lighting: 'good' | 'fair' | 'poor';
    focus: 'sharp' | 'acceptable' | 'blurry';
    angle: 'optimal' | 'acceptable' | 'suboptimal';
    coverage: 'complete' | 'partial' | 'insufficient';
  };
}

// Structure - Top level of hierarchy (property/building)
export interface Structure {
  id: string;
  name: string;
  type: StructureType;
  description?: string;
  address?: string;
  // Overall dimensions (optional, calculated from rooms)
  width_ft?: number;
  length_ft?: number;
  stories?: number;
  yearBuilt?: number;
  constructionType?: string;
  roofType?: string;
  // Rooms within this structure
  rooms: RoomGeometry[];
  // Exterior photos
  photos: SketchPhoto[];
  notes: RoomNote[];
  created_at: string;
  updated_at: string;
}

export interface RoomGeometry {
  id: string;
  name: string;
  shape: RoomShape;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft: number;
  flooring_type?: FlooringType;
  polygon: Point[];
  openings: Opening[];
  features: Feature[];
  damageZones: VoiceDamageZone[];
  notes: RoomNote[];
  created_at: string;
  updated_at: string;
  // Shape-specific configurations
  l_shape_config?: LShapeConfig;
  t_shape_config?: TShapeConfig;
  // Floor plan positioning (for multi-room layouts)
  origin_x_ft?: number; // X position in floor plan coordinate space
  origin_y_ft?: number; // Y position in floor plan coordinate space
  // Hierarchy relationships
  structureId?: string; // Parent structure
  parentRoomId?: string; // For sub-rooms (closet in bedroom, bathroom off master)
  hierarchyLevel: HierarchyLevel; // 'room' or 'subroom'
  // Sub-rooms within this room
  subRooms: RoomGeometry[];
  // Objects within this room
  objects: SketchObject[];
  // Photos of this room
  photos: SketchPhoto[];
}

export interface RoomNote {
  id: string;
  target: string; // 'room' | 'wall_north' | feature_name | 'damage_zone'
  note: string;
  created_at: string;
}

// Voice Command Types
export type VoiceCommandType =
  | 'create_structure'
  | 'edit_structure'
  | 'delete_structure'
  | 'select_structure'
  | 'create_room'
  | 'add_opening'
  | 'add_feature'
  | 'add_object'
  | 'edit_object'
  | 'delete_object'
  | 'mark_damage'
  | 'modify_dimension'
  | 'add_note'
  | 'undo'
  | 'confirm_room'
  | 'delete_room'
  | 'edit_room'
  | 'delete_opening'
  | 'delete_feature'
  | 'edit_damage_zone'
  | 'capture_photo'
  | 'load_claim';

// Structure command params
export interface CreateStructureParams {
  name: string;
  type: StructureType;
  description?: string;
  address?: string;
  stories?: number;
  yearBuilt?: number;
  constructionType?: string;
  roofType?: string;
}

export interface EditStructureParams {
  structure_id?: string;
  structure_name?: string;
  new_name?: string;
  new_type?: StructureType;
  new_description?: string;
  new_stories?: number;
}

export interface DeleteStructureParams {
  structure_id?: string;
  structure_name?: string;
}

export interface SelectStructureParams {
  structure_id?: string;
  structure_name?: string;
}

export interface CreateRoomParams {
  name: string;
  shape: RoomShape;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft?: number;
  flooring_type?: FlooringType;
  // L-shape configuration
  l_shape_config?: LShapeConfig;
  // T-shape configuration
  t_shape_config?: TShapeConfig;
  // Hierarchy: which structure/room this belongs to
  structure_id?: string; // Parent structure (required for rooms)
  parent_room_id?: string; // For sub-rooms (closet in bedroom)
  is_subroom?: boolean; // Flag to indicate this is a sub-room
}

// Object command params
export interface AddObjectParams {
  name: string;
  type: ObjectType;
  description?: string;
  width_ft?: number;
  depth_ft?: number;
  height_ft?: number;
  wall?: WallDirection | 'freestanding';
  condition?: 'good' | 'fair' | 'poor' | 'damaged';
  damageNotes?: string;
}

export interface EditObjectParams {
  object_id?: string;
  object_name?: string;
  new_name?: string;
  new_type?: ObjectType;
  new_condition?: 'good' | 'fair' | 'poor' | 'damaged';
  new_damageNotes?: string;
}

export interface DeleteObjectParams {
  object_id?: string;
  object_name?: string;
}

// Photo capture params
export interface CapturePhotoParams {
  label?: string; // User-provided label
  // Context is automatically determined from current hierarchy position
}

export interface AddOpeningParams {
  type: OpeningType;
  wall: WallDirection;
  width_ft: number;
  height_ft?: number;
  position: PositionType;
  position_from?: PositionFromType;
  sill_height_ft?: number;
}

export interface AddFeatureParams {
  type: FeatureType;
  wall: WallDirection | 'freestanding';
  width_ft: number;
  depth_ft: number;
  position: PositionType;
  position_from?: PositionFromType;
  x_offset_ft?: number; // For freestanding features: distance from west wall (left edge)
  y_offset_ft?: number; // For freestanding features: distance from south wall (bottom edge)
}

export interface MarkDamageParams {
  type: DamageType;
  category?: WaterDamageCategory;
  affected_walls: WallDirection[];
  floor_affected?: boolean;
  ceiling_affected?: boolean;
  extent_ft: number;
  source?: string;
  // Optional polygon for precise damage zone boundaries
  polygon?: Point[];
  // For freeform damage zones not attached to walls
  is_freeform?: boolean;
}

export interface ModifyDimensionParams {
  target: string;
  new_value_ft: number;
}

export interface AddNoteParams {
  target: string;
  note: string;
}

export interface UndoParams {
  steps?: number;
}

export interface ConfirmRoomParams {
  ready_for_next: boolean;
}

export interface DeleteRoomParams {
  room_id?: string; // If not specified, deletes current room. Can also identify by name.
  room_name?: string;
}

export interface EditRoomParams {
  room_id?: string; // If not specified, edits current room
  room_name?: string; // Can identify room by name
  new_name?: string;
  new_shape?: RoomShape;
  new_width_ft?: number;
  new_length_ft?: number;
  new_ceiling_height_ft?: number;
  new_flooring_type?: FlooringType;
  // L-shape configuration updates
  new_l_shape_config?: Partial<LShapeConfig>;
  // T-shape configuration updates
  new_t_shape_config?: Partial<TShapeConfig>;
}

export interface DeleteOpeningParams {
  opening_index?: number; // 0-based index
  opening_id?: string;
  wall?: WallDirection; // Can delete by wall + type
  type?: OpeningType;
}

export interface DeleteFeatureParams {
  feature_index?: number; // 0-based index
  feature_id?: string;
  type?: FeatureType; // Can delete by type
}

export interface EditDamageZoneParams {
  damage_index?: number; // 0-based index
  damage_id?: string;
  new_type?: DamageType;
  new_category?: WaterDamageCategory;
  new_affected_walls?: WallDirection[];
  new_floor_affected?: boolean;
  new_ceiling_affected?: boolean;
  new_extent_ft?: number;
  new_source?: string;
  // Optional polygon for precise damage zone boundaries
  new_polygon?: Point[];
  // For freeform damage zones
  new_is_freeform?: boolean;
}

export interface DeleteDamageZoneParams {
  damage_index?: number; // 0-based index
  damage_id?: string;
  type?: DamageType; // Can delete by type
}

// Command History for undo/redo
export interface GeometryCommand {
  id: string;
  type: VoiceCommandType;
  params: unknown;
  timestamp: string;
  result: string;
}

// Transcript Entry
export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  command?: GeometryCommand;
}

// Voice Session State
export interface VoiceSessionState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

// Floor Plan Types - Multi-room layouts with connections

// Connection point defines where two rooms connect
export interface ConnectionPoint {
  room_id: string;
  wall: WallDirection;
  position_ft: number; // Position along the wall from start
  width_ft: number; // Width of the connection (usually matches opening width)
}

// Room connection defines a link between two rooms
export interface RoomConnection {
  id: string;
  type: 'door' | 'archway' | 'hallway' | 'stairway';
  from: ConnectionPoint;
  to: ConnectionPoint;
  notes?: string;
}

// Floor plan contains multiple rooms and their spatial relationships
export interface FloorPlan {
  id: string;
  name: string;
  level: number; // Floor level (0 = ground, 1 = second floor, -1 = basement)
  rooms: RoomGeometry[];
  connections: RoomConnection[];
  // Overall bounds calculated from room positions
  width_ft: number;
  length_ft: number;
  created_at: string;
  updated_at: string;
  notes?: string;
}

// Voice command types for floor plan operations
export type FloorPlanCommandType =
  | 'add_room_to_plan'
  | 'connect_rooms'
  | 'move_room'
  | 'remove_connection'
  | 'set_room_position';

export interface AddRoomToPlanParams {
  room_id?: string; // Existing room ID to add, or create new
  room_name?: string; // If creating new, the room name
  position_x_ft?: number; // Optional absolute position
  position_y_ft?: number;
  relative_to?: string; // Room ID to position relative to
  direction?: WallDirection; // Direction from relative room
}

export interface ConnectRoomsParams {
  from_room_id?: string;
  from_room_name?: string;
  from_wall: WallDirection;
  from_position_ft?: number;
  to_room_id?: string;
  to_room_name?: string;
  to_wall: WallDirection;
  to_position_ft?: number;
  connection_type: 'door' | 'archway' | 'hallway' | 'stairway';
}

export interface MoveRoomParams {
  room_id?: string;
  room_name?: string;
  new_x_ft?: number;
  new_y_ft?: number;
  relative_to?: string;
  direction?: WallDirection;
}

export interface RemoveConnectionParams {
  connection_id?: string;
  from_room?: string;
  to_room?: string;
}

export interface SetRoomPositionParams {
  room_id?: string;
  room_name?: string;
  x_ft: number;
  y_ft: number;
}
