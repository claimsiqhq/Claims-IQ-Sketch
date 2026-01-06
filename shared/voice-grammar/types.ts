/**
 * Voice Grammar Types
 *
 * Defines the constrained grammar constructs and normalized intent objects
 * for voice-first sketch creation. These types form the intermediate representation
 * between raw voice input and geometry execution.
 *
 * Design Principles:
 * - All intents are normalized to canonical form
 * - Dimensions default to feet
 * - Directions normalize to N/S/E/W
 * - Shape defaults to RECT
 * - All inference is explicit and auditable
 */

// ============================================
// CORE ENUMS AND PRIMITIVES
// ============================================

export type CardinalDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export type RelativeDirection = CardinalDirection | 'ABOVE' | 'BELOW' | 'LEFT' | 'RIGHT' | 'ADJACENT';
export type ShapeType = 'RECT' | 'L_SHAPE' | 'T_SHAPE' | 'POLY';
export type OpeningType = 'DOOR' | 'WINDOW' | 'ARCHWAY' | 'SLIDING_DOOR' | 'FRENCH_DOOR' | 'CASED_OPENING';
export type FeatureType = 'CLOSET' | 'ALCOVE' | 'BUMP_OUT' | 'ISLAND' | 'PENINSULA' | 'FIREPLACE' | 'BUILT_IN';
export type DamageType = 'WATER' | 'FIRE' | 'SMOKE' | 'MOLD' | 'WIND' | 'IMPACT';
export type IICRCCategory = '1' | '2' | '3';

export type WallPosition = 'LEFT' | 'CENTER' | 'RIGHT' | number; // number = feet from reference

// ============================================
// DIMENSION TYPES
// ============================================

export interface Dimension {
  valueFt: number;
  unit: 'FT' | 'IN' | 'M'; // Canonical unit, source may vary
  originalText?: string;   // For audit trail
}

export interface RoomDimensions {
  widthFt: number;
  lengthFt: number;
  ceilingHeightFt: number;
}

// ============================================
// INTENT TYPES
// ============================================

export type VoiceIntentType =
  | 'CREATE_ROOM'
  | 'PLACE_ROOM_RELATIVE'
  | 'ADD_OPENING'
  | 'ADD_FEATURE'
  | 'CONNECT_ROOMS'
  | 'MODIFY_DIMENSION'
  | 'MARK_DAMAGE'
  | 'SET_SHAPE'
  | 'DELETE_ROOM'
  | 'DELETE_OPENING'
  | 'DELETE_FEATURE'
  | 'CREATE_STRUCTURE'
  | 'CREATE_FLOOR_PLAN'
  | 'UNDO'
  | 'CONFIRM_ROOM'
  | 'ADD_NOTE'
  | 'UNKNOWN';

// ============================================
// NORMALIZED INTENT OBJECTS
// ============================================

/**
 * Base intent with common fields
 */
export interface BaseIntent {
  intent: VoiceIntentType;
  confidence: number;        // 0-1, how confident we are in the parse
  rawText?: string;          // Original spoken text
  timestamp: string;         // ISO timestamp
  sessionId?: string;        // Voice session tracking
  inferenceLog: InferenceLogEntry[]; // What defaults/inferences were applied
}

/**
 * Inference log entry for audit trail
 */
export interface InferenceLogEntry {
  field: string;
  inferredValue: unknown;
  reason: string;
  confidence: number;
  reversible: boolean;
}

/**
 * CREATE_ROOM intent
 * Example: "Create a 12 by 15 kitchen with a 9 foot ceiling"
 */
export interface CreateRoomIntent extends BaseIntent {
  intent: 'CREATE_ROOM';
  roomName: string;
  dimensions: RoomDimensions;
  shape: ShapeType;
  lShapeConfig?: {
    notchCorner: 'NORTHEAST' | 'NORTHWEST' | 'SOUTHEAST' | 'SOUTHWEST';
    notchWidthFt: number;
    notchLengthFt: number;
  };
  tShapeConfig?: {
    stemWall: CardinalDirection;
    stemWidthFt: number;
    stemLengthFt: number;
    stemPositionFt: number;
  };
  levelName?: string;
}

/**
 * PLACE_ROOM_RELATIVE intent
 * Example: "Place the kitchen east of the living room"
 */
export interface PlaceRoomRelativeIntent extends BaseIntent {
  intent: 'PLACE_ROOM_RELATIVE';
  roomName: string;
  relativeTo: string;
  direction: CardinalDirection;
  gapFt?: number;  // Optional gap between rooms
}

/**
 * ADD_OPENING intent
 * Example: "Add a 3 foot door on the north wall"
 */
export interface AddOpeningIntent extends BaseIntent {
  intent: 'ADD_OPENING';
  openingType: OpeningType;
  wall: CardinalDirection;
  widthFt: number;
  heightFt?: number;
  position: WallPosition;
  positionFrom: 'START' | 'END';
  sillHeightFt?: number; // For windows
  roomName?: string;      // If targeting specific room
}

/**
 * ADD_FEATURE intent
 * Example: "Add a closet on the east wall, 4 feet wide and 2 feet deep"
 */
export interface AddFeatureIntent extends BaseIntent {
  intent: 'ADD_FEATURE';
  featureType: FeatureType;
  wall: CardinalDirection | 'FREESTANDING';
  widthFt: number;
  depthFt: number;
  position: WallPosition;
  positionFrom: 'START' | 'END';
  xOffsetFt?: number; // For freestanding
  yOffsetFt?: number; // For freestanding
  roomName?: string;
}

/**
 * CONNECT_ROOMS intent
 * Example: "Connect the living room to the kitchen with a doorway"
 */
export interface ConnectRoomsIntent extends BaseIntent {
  intent: 'CONNECT_ROOMS';
  fromRoom: string;
  toRoom: string;
  connectionType: 'DOOR' | 'ARCHWAY' | 'HALLWAY' | 'STAIRWAY' | 'OPENING';
  openingType?: OpeningType;
}

/**
 * MODIFY_DIMENSION intent
 * Example: "Make the width 14 feet"
 */
export interface ModifyDimensionIntent extends BaseIntent {
  intent: 'MODIFY_DIMENSION';
  target: string; // 'room_width', 'room_length', 'ceiling_height', 'opening_0', etc.
  newValueFt: number;
  roomName?: string;
}

/**
 * MARK_DAMAGE intent
 * Example: "Mark water damage on the north and east walls, 3 feet extent, category 2"
 */
export interface MarkDamageIntent extends BaseIntent {
  intent: 'MARK_DAMAGE';
  damageType: DamageType;
  category?: IICRCCategory;
  affectedWalls: CardinalDirection[];
  floorAffected: boolean;
  ceilingAffected: boolean;
  extentFt: number;
  source?: string;
  roomName?: string;
}

/**
 * SET_SHAPE intent
 * Example: "This room is L-shaped"
 */
export interface SetShapeIntent extends BaseIntent {
  intent: 'SET_SHAPE';
  shape: ShapeType;
  roomName?: string;
}

/**
 * DELETE_ROOM intent
 */
export interface DeleteRoomIntent extends BaseIntent {
  intent: 'DELETE_ROOM';
  roomName?: string;
}

/**
 * DELETE_OPENING intent
 */
export interface DeleteOpeningIntent extends BaseIntent {
  intent: 'DELETE_OPENING';
  wall?: CardinalDirection;
  openingType?: OpeningType;
  openingIndex?: number;
  roomName?: string;
}

/**
 * DELETE_FEATURE intent
 */
export interface DeleteFeatureIntent extends BaseIntent {
  intent: 'DELETE_FEATURE';
  featureType?: FeatureType;
  featureIndex?: number;
  roomName?: string;
}

/**
 * CREATE_STRUCTURE intent
 */
export interface CreateStructureIntent extends BaseIntent {
  intent: 'CREATE_STRUCTURE';
  structureName: string;
  structureType: 'MAIN_DWELLING' | 'DETACHED_GARAGE' | 'ATTACHED_GARAGE' | 'SHED' | 'GUEST_HOUSE' | 'POOL_HOUSE' | 'BARN' | 'OTHER';
  stories?: number;
}

/**
 * CREATE_FLOOR_PLAN intent
 */
export interface CreateFloorPlanIntent extends BaseIntent {
  intent: 'CREATE_FLOOR_PLAN';
  name: string;
  level: number; // 0 = ground, 1 = second floor, -1 = basement
}

/**
 * UNDO intent
 */
export interface UndoIntent extends BaseIntent {
  intent: 'UNDO';
  steps: number;
}

/**
 * CONFIRM_ROOM intent
 */
export interface ConfirmRoomIntent extends BaseIntent {
  intent: 'CONFIRM_ROOM';
  readyForNext: boolean;
}

/**
 * ADD_NOTE intent
 */
export interface AddNoteIntent extends BaseIntent {
  intent: 'ADD_NOTE';
  target: string;
  note: string;
}

/**
 * UNKNOWN intent - for phrases that couldn't be parsed
 */
export interface UnknownIntent extends BaseIntent {
  intent: 'UNKNOWN';
  possibleIntents?: VoiceIntentType[];
  suggestion?: string;
}

/**
 * Union type of all intents
 */
export type NormalizedIntent =
  | CreateRoomIntent
  | PlaceRoomRelativeIntent
  | AddOpeningIntent
  | AddFeatureIntent
  | ConnectRoomsIntent
  | ModifyDimensionIntent
  | MarkDamageIntent
  | SetShapeIntent
  | DeleteRoomIntent
  | DeleteOpeningIntent
  | DeleteFeatureIntent
  | CreateStructureIntent
  | CreateFloorPlanIntent
  | UndoIntent
  | ConfirmRoomIntent
  | AddNoteIntent
  | UnknownIntent;

// ============================================
// GRAMMAR CONSTRUCT PATTERNS
// ============================================

/**
 * Supported grammar construct patterns
 * These are the canonical forms we normalize to
 */
export const GRAMMAR_CONSTRUCTS = {
  CREATE_ROOM: [
    'Create a <width> by <length> <room_name>',
    'Create a <width> by <length> <room_name> with a <ceiling_height> ceiling',
    '<room_name> is <width> by <length>',
    'Start a new <room_name>',
  ],
  PLACE_ROOM_RELATIVE: [
    'Place the <room_name> <direction> of the <other_room>',
    'The <room_name> is <direction> of the <other_room>',
    '<room_name> goes <direction> of <other_room>',
  ],
  ADD_OPENING: [
    'Add a <width> <opening_type> on the <wall> wall',
    '<width> <opening_type> on the <wall>',
    'Put a <opening_type> on the <wall> wall <position> feet from the <reference>',
  ],
  ADD_FEATURE: [
    'Add a <feature_type> on the <wall> wall',
    '<feature_type> on the <wall>, <width> wide and <depth> deep',
    'There is a <feature_type> on the <wall>',
  ],
  CONNECT_ROOMS: [
    'Connect the <room1> to the <room2> with a <connection_type>',
    '<room1> and <room2> are connected by a <connection_type>',
    'There is a <connection_type> between <room1> and <room2>',
  ],
  SET_SHAPE: [
    'This room is <shape>',
    'The <room_name> is <shape>',
    'Make it <shape>',
  ],
} as const;

// ============================================
// DEFAULTS
// ============================================

export const GRAMMAR_DEFAULTS = {
  ceilingHeightFt: 8,
  doorWidthFt: 3,
  doorHeightFt: 6.67, // 6'8"
  windowWidthFt: 3,
  windowHeightFt: 4,
  windowSillHeightFt: 3,
  closetDepthFt: 2,
  shape: 'RECT' as ShapeType,
  damageExtentFt: 2,
  unit: 'FT' as const,
  positionFrom: 'START' as const,
} as const;

// ============================================
// DIRECTION NORMALIZATION
// ============================================

export const DIRECTION_ALIASES: Record<string, CardinalDirection> = {
  'north': 'NORTH',
  'n': 'NORTH',
  'top': 'NORTH',
  'up': 'NORTH',
  'front': 'NORTH',
  'south': 'SOUTH',
  's': 'SOUTH',
  'bottom': 'SOUTH',
  'down': 'SOUTH',
  'back': 'SOUTH',
  'east': 'EAST',
  'e': 'EAST',
  'right': 'EAST',
  'west': 'WEST',
  'w': 'WEST',
  'left': 'WEST',
};

export const SHAPE_ALIASES: Record<string, ShapeType> = {
  'rectangle': 'RECT',
  'rectangular': 'RECT',
  'rect': 'RECT',
  'square': 'RECT',
  'l': 'L_SHAPE',
  'l-shape': 'L_SHAPE',
  'l shape': 'L_SHAPE',
  'l-shaped': 'L_SHAPE',
  'l shaped': 'L_SHAPE',
  't': 'T_SHAPE',
  't-shape': 'T_SHAPE',
  't shape': 'T_SHAPE',
  't-shaped': 'T_SHAPE',
  't shaped': 'T_SHAPE',
  'irregular': 'POLY',
  'poly': 'POLY',
  'polygon': 'POLY',
  'custom': 'POLY',
};

export const OPENING_TYPE_ALIASES: Record<string, OpeningType> = {
  'door': 'DOOR',
  'doorway': 'DOOR',
  'entry': 'DOOR',
  'entrance': 'DOOR',
  'window': 'WINDOW',
  'archway': 'ARCHWAY',
  'arch': 'ARCHWAY',
  'arched': 'ARCHWAY',
  'sliding door': 'SLIDING_DOOR',
  'slider': 'SLIDING_DOOR',
  'sliding': 'SLIDING_DOOR',
  'french door': 'FRENCH_DOOR',
  'french doors': 'FRENCH_DOOR',
  'double door': 'FRENCH_DOOR',
  'cased opening': 'CASED_OPENING',
  'open': 'CASED_OPENING',
  'opening': 'CASED_OPENING',
};

export const FEATURE_TYPE_ALIASES: Record<string, FeatureType> = {
  'closet': 'CLOSET',
  'pantry': 'CLOSET',
  'storage': 'CLOSET',
  'alcove': 'ALCOVE',
  'nook': 'ALCOVE',
  'recess': 'ALCOVE',
  'bump out': 'BUMP_OUT',
  'bump-out': 'BUMP_OUT',
  'protrusion': 'BUMP_OUT',
  'island': 'ISLAND',
  'kitchen island': 'ISLAND',
  'peninsula': 'PENINSULA',
  'fireplace': 'FIREPLACE',
  'hearth': 'FIREPLACE',
  'built in': 'BUILT_IN',
  'built-in': 'BUILT_IN',
  'builtin': 'BUILT_IN',
  'cabinet': 'BUILT_IN',
  'shelves': 'BUILT_IN',
};

export const DAMAGE_TYPE_ALIASES: Record<string, DamageType> = {
  'water': 'WATER',
  'water damage': 'WATER',
  'flooding': 'WATER',
  'flood': 'WATER',
  'leak': 'WATER',
  'fire': 'FIRE',
  'fire damage': 'FIRE',
  'burn': 'FIRE',
  'smoke': 'SMOKE',
  'smoke damage': 'SMOKE',
  'soot': 'SMOKE',
  'mold': 'MOLD',
  'mildew': 'MOLD',
  'fungus': 'MOLD',
  'wind': 'WIND',
  'wind damage': 'WIND',
  'storm': 'WIND',
  'impact': 'IMPACT',
  'impact damage': 'IMPACT',
  'collision': 'IMPACT',
};
