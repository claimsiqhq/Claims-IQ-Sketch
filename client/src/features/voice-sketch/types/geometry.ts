// Voice Sketch Geometry Types
// These types define the structures for voice-driven room sketching

export type WallDirection = 'north' | 'south' | 'east' | 'west';
export type RoomShape = 'rectangle' | 'l_shape' | 't_shape' | 'irregular';
export type OpeningType = 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door';
export type FeatureType = 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in';
export type DamageType = 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact';
export type WaterDamageCategory = '1' | '2' | '3'; // IICRC S500 categories
export type PositionType = 'left' | 'center' | 'right' | number;
export type PositionFromType = 'start' | 'end';

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

export interface RoomGeometry {
  id: string;
  name: string;
  shape: RoomShape;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft: number;
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
}

export interface RoomNote {
  id: string;
  target: string; // 'room' | 'wall_north' | feature_name | 'damage_zone'
  note: string;
  created_at: string;
}

// Voice Command Types
export type VoiceCommandType =
  | 'create_room'
  | 'add_opening'
  | 'add_feature'
  | 'mark_damage'
  | 'modify_dimension'
  | 'add_note'
  | 'undo'
  | 'confirm_room'
  | 'delete_room'
  | 'edit_room'
  | 'delete_opening'
  | 'delete_feature'
  | 'edit_damage_zone';

export interface CreateRoomParams {
  name: string;
  shape: RoomShape;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft?: number;
  // L-shape configuration
  l_shape_config?: LShapeConfig;
  // T-shape configuration
  t_shape_config?: TShapeConfig;
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
