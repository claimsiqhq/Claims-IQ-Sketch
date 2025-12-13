// Voice Sketch Geometry Types
// These types define the structures for voice-driven room sketching

export type WallDirection = 'north' | 'south' | 'east' | 'west';
export type RoomShape = 'rectangle' | 'l_shape' | 't_shape' | 'irregular';
export type OpeningType = 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door';
export type FeatureType = 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in';
export type DamageType = 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact';
export type WaterDamageCategory = '1' | '2' | '3'; // IICRC S500 categories
export type PositionType = 'left' | 'center' | 'right' | number;

export interface Point {
  x: number;
  y: number;
}

export interface Opening {
  id: string;
  type: OpeningType;
  wall: WallDirection;
  width_ft: number;
  height_ft: number;
  position: PositionType;
  sill_height_ft?: number; // For windows
}

export interface Feature {
  id: string;
  type: FeatureType;
  wall: WallDirection | 'freestanding';
  width_ft: number;
  depth_ft: number;
  position: PositionType;
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
  | 'confirm_room';

export interface CreateRoomParams {
  name: string;
  shape: RoomShape;
  width_ft: number;
  length_ft: number;
  ceiling_height_ft?: number;
}

export interface AddOpeningParams {
  type: OpeningType;
  wall: WallDirection;
  width_ft: number;
  height_ft?: number;
  position: PositionType;
  sill_height_ft?: number;
}

export interface AddFeatureParams {
  type: FeatureType;
  wall: WallDirection | 'freestanding';
  width_ft: number;
  depth_ft: number;
  position: PositionType;
}

export interface MarkDamageParams {
  type: DamageType;
  category?: WaterDamageCategory;
  affected_walls: WallDirection[];
  floor_affected?: boolean;
  ceiling_affected?: boolean;
  extent_ft: number;
  source?: string;
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
