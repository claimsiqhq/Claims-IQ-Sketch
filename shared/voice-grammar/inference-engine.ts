/**
 * Auto-Room Inference Engine
 *
 * Provides intelligent defaults and inferences for partial voice inputs.
 * All inferences are logged, transparent, reversible, and auditable.
 *
 * Key capabilities:
 * - Infer room type from name (Kitchen → certain dimensions likely)
 * - Infer ceiling heights from context (basement = lower, cathedral = higher)
 * - Suggest opening positions based on room type
 * - Auto-position rooms relative to existing layout
 * - Validate inferences against physical constraints
 */

import type {
  NormalizedIntent,
  CreateRoomIntent,
  PlaceRoomRelativeIntent,
  AddOpeningIntent,
  InferenceLogEntry,
  CardinalDirection,
  RoomDimensions,
} from './types';
import { GRAMMAR_DEFAULTS } from './types';

// ============================================
// ROOM TYPE INFERENCE DATA
// ============================================

export interface RoomTypeProfile {
  typicalDimensions: RoomDimensions;
  typicalShape: 'RECT' | 'L_SHAPE' | 'T_SHAPE' | 'POLY';
  commonOpenings: {
    type: 'DOOR' | 'WINDOW';
    wall: CardinalDirection;
    count: number;
  }[];
  commonFeatures: string[];
  adjacentRooms: string[];
  typicalLevel: string;
}

export const ROOM_TYPE_PROFILES: Record<string, RoomTypeProfile> = {
  'kitchen': {
    typicalDimensions: { widthFt: 12, lengthFt: 14, ceilingHeightFt: 9 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 1 },
      { type: 'DOOR', wall: 'EAST', count: 1 },
    ],
    commonFeatures: ['island', 'pantry'],
    adjacentRooms: ['dining room', 'living room', 'garage'],
    typicalLevel: 'Main Level',
  },
  'living room': {
    typicalDimensions: { widthFt: 16, lengthFt: 20, ceilingHeightFt: 9 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 2 },
      { type: 'WINDOW', wall: 'WEST', count: 1 },
      { type: 'DOOR', wall: 'NORTH', count: 1 },
    ],
    commonFeatures: ['fireplace'],
    adjacentRooms: ['kitchen', 'dining room', 'foyer', 'hallway'],
    typicalLevel: 'Main Level',
  },
  'master bedroom': {
    typicalDimensions: { widthFt: 14, lengthFt: 16, ceilingHeightFt: 9 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 2 },
      { type: 'DOOR', wall: 'NORTH', count: 1 },
    ],
    commonFeatures: ['closet'],
    adjacentRooms: ['master bathroom', 'hallway'],
    typicalLevel: 'Upper Level',
  },
  'bedroom': {
    typicalDimensions: { widthFt: 11, lengthFt: 12, ceilingHeightFt: 8 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 1 },
      { type: 'DOOR', wall: 'NORTH', count: 1 },
    ],
    commonFeatures: ['closet'],
    adjacentRooms: ['hallway', 'bathroom'],
    typicalLevel: 'Upper Level',
  },
  'bathroom': {
    typicalDimensions: { widthFt: 8, lengthFt: 10, ceilingHeightFt: 8 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'EAST', count: 1 },
      { type: 'DOOR', wall: 'WEST', count: 1 },
    ],
    commonFeatures: [],
    adjacentRooms: ['bedroom', 'hallway', 'master bedroom'],
    typicalLevel: 'Upper Level',
  },
  'master bathroom': {
    typicalDimensions: { widthFt: 10, lengthFt: 12, ceilingHeightFt: 9 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'EAST', count: 1 },
      { type: 'DOOR', wall: 'WEST', count: 1 },
    ],
    commonFeatures: ['closet'],
    adjacentRooms: ['master bedroom'],
    typicalLevel: 'Upper Level',
  },
  'dining room': {
    typicalDimensions: { widthFt: 12, lengthFt: 14, ceilingHeightFt: 9 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 1 },
    ],
    commonFeatures: [],
    adjacentRooms: ['kitchen', 'living room'],
    typicalLevel: 'Main Level',
  },
  'garage': {
    typicalDimensions: { widthFt: 20, lengthFt: 22, ceilingHeightFt: 10 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'DOOR', wall: 'NORTH', count: 1 },
    ],
    commonFeatures: [],
    adjacentRooms: ['kitchen', 'laundry room'],
    typicalLevel: 'Main Level',
  },
  'laundry room': {
    typicalDimensions: { widthFt: 6, lengthFt: 8, ceilingHeightFt: 8 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'DOOR', wall: 'EAST', count: 1 },
    ],
    commonFeatures: [],
    adjacentRooms: ['garage', 'kitchen', 'hallway'],
    typicalLevel: 'Main Level',
  },
  'hallway': {
    typicalDimensions: { widthFt: 4, lengthFt: 12, ceilingHeightFt: 8 },
    typicalShape: 'RECT',
    commonOpenings: [],
    commonFeatures: [],
    adjacentRooms: ['bedroom', 'bathroom', 'living room'],
    typicalLevel: 'Main Level',
  },
  'foyer': {
    typicalDimensions: { widthFt: 8, lengthFt: 10, ceilingHeightFt: 10 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'DOOR', wall: 'SOUTH', count: 1 },
    ],
    commonFeatures: [],
    adjacentRooms: ['living room', 'hallway'],
    typicalLevel: 'Main Level',
  },
  'basement': {
    typicalDimensions: { widthFt: 30, lengthFt: 40, ceilingHeightFt: 7.5 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 2 },
    ],
    commonFeatures: [],
    adjacentRooms: [],
    typicalLevel: 'Basement',
  },
  'office': {
    typicalDimensions: { widthFt: 10, lengthFt: 12, ceilingHeightFt: 8 },
    typicalShape: 'RECT',
    commonOpenings: [
      { type: 'WINDOW', wall: 'SOUTH', count: 1 },
      { type: 'DOOR', wall: 'NORTH', count: 1 },
    ],
    commonFeatures: ['built-in'],
    adjacentRooms: ['hallway', 'living room'],
    typicalLevel: 'Main Level',
  },
};

// ============================================
// INFERENCE CONTEXT
// ============================================

export interface InferenceContext {
  existingRooms: Array<{
    name: string;
    widthFt: number;
    lengthFt: number;
    originXFt: number;
    originYFt: number;
    levelName: string;
  }>;
  currentStructure?: string;
  currentLevel?: string;
  sessionHistory?: NormalizedIntent[];
}

// ============================================
// MAIN INFERENCE ENGINE
// ============================================

/**
 * Apply inferences to a normalized intent
 * Returns the intent with inferred values filled in
 */
export function applyInferences(
  intent: NormalizedIntent,
  context: InferenceContext
): NormalizedIntent {
  switch (intent.intent) {
    case 'CREATE_ROOM':
      return inferCreateRoom(intent, context);
    case 'PLACE_ROOM_RELATIVE':
      return inferPlaceRoom(intent, context);
    case 'ADD_OPENING':
      return inferAddOpening(intent, context);
    default:
      return intent;
  }
}

// ============================================
// ROOM CREATION INFERENCE
// ============================================

function inferCreateRoom(
  intent: CreateRoomIntent,
  context: InferenceContext
): CreateRoomIntent {
  const inferenceLog = [...intent.inferenceLog];
  const roomNameLower = intent.roomName.toLowerCase();

  // Find matching room type profile
  let profile: RoomTypeProfile | undefined;
  for (const [typeName, typeProfile] of Object.entries(ROOM_TYPE_PROFILES)) {
    if (roomNameLower.includes(typeName)) {
      profile = typeProfile;
      break;
    }
  }

  let updatedDimensions = { ...intent.dimensions };

  // Infer dimensions from room type if not explicitly provided
  if (profile) {
    // Only apply inference if dimensions look like defaults
    const hasDefaultWidth = intent.dimensions.widthFt === 10;
    const hasDefaultLength = intent.dimensions.lengthFt === 10;
    const hasDefaultCeiling = intent.dimensions.ceilingHeightFt === GRAMMAR_DEFAULTS.ceilingHeightFt;

    if (hasDefaultWidth && hasDefaultLength) {
      updatedDimensions.widthFt = profile.typicalDimensions.widthFt;
      updatedDimensions.lengthFt = profile.typicalDimensions.lengthFt;
      inferenceLog.push({
        field: 'dimensions',
        inferredValue: {
          widthFt: profile.typicalDimensions.widthFt,
          lengthFt: profile.typicalDimensions.lengthFt,
        },
        reason: `Inferred typical ${roomNameLower} dimensions`,
        confidence: 0.7,
        reversible: true,
      });
    }

    if (hasDefaultCeiling) {
      updatedDimensions.ceilingHeightFt = profile.typicalDimensions.ceilingHeightFt;
      inferenceLog.push({
        field: 'ceilingHeightFt',
        inferredValue: profile.typicalDimensions.ceilingHeightFt,
        reason: `Inferred typical ${roomNameLower} ceiling height`,
        confidence: 0.7,
        reversible: true,
      });
    }
  }

  // Infer level from room type
  let levelName = intent.levelName;
  if (!levelName && profile) {
    levelName = profile.typicalLevel;
    inferenceLog.push({
      field: 'levelName',
      inferredValue: levelName,
      reason: `Inferred typical level for ${roomNameLower}`,
      confidence: 0.6,
      reversible: true,
    });
  } else if (!levelName && context.currentLevel) {
    levelName = context.currentLevel;
    inferenceLog.push({
      field: 'levelName',
      inferredValue: levelName,
      reason: 'Using current session level',
      confidence: 0.8,
      reversible: true,
    });
  }

  return {
    ...intent,
    dimensions: updatedDimensions,
    levelName,
    inferenceLog,
    confidence: Math.min(intent.confidence, profile ? 0.85 : 0.7),
  };
}

// ============================================
// ROOM PLACEMENT INFERENCE
// ============================================

function inferPlaceRoom(
  intent: PlaceRoomRelativeIntent,
  context: InferenceContext
): PlaceRoomRelativeIntent {
  const inferenceLog = [...intent.inferenceLog];

  // If relative_to is vague ("previous room", "that room"), try to resolve
  const relativeToLower = intent.relativeTo.toLowerCase();
  if (relativeToLower === 'previous room' || relativeToLower === 'that room') {
    if (context.existingRooms.length > 0) {
      const lastRoom = context.existingRooms[context.existingRooms.length - 1];
      inferenceLog.push({
        field: 'relativeTo',
        inferredValue: lastRoom.name,
        reason: 'Resolved "previous room" to last created room',
        confidence: 0.8,
        reversible: true,
      });
      return {
        ...intent,
        relativeTo: lastRoom.name,
        inferenceLog,
      };
    }
  }

  // Try to find the best adjacent room based on room type profiles
  const roomNameLower = intent.roomName.toLowerCase();
  let profile: RoomTypeProfile | undefined;
  for (const [typeName, typeProfile] of Object.entries(ROOM_TYPE_PROFILES)) {
    if (roomNameLower.includes(typeName)) {
      profile = typeProfile;
      break;
    }
  }

  if (profile && context.existingRooms.length > 0) {
    // Check if relative_to matches a common adjacent room
    const relativeRoom = context.existingRooms.find(
      r => r.name.toLowerCase() === relativeToLower
    );

    if (!relativeRoom) {
      // Try to find a better match from adjacent room suggestions
      for (const adjacentName of profile.adjacentRooms) {
        const matchedRoom = context.existingRooms.find(
          r => r.name.toLowerCase().includes(adjacentName)
        );
        if (matchedRoom) {
          inferenceLog.push({
            field: 'relativeTo',
            inferredValue: matchedRoom.name,
            reason: `Suggested adjacent room for ${roomNameLower}`,
            confidence: 0.6,
            reversible: true,
          });
          return {
            ...intent,
            relativeTo: matchedRoom.name,
            inferenceLog,
          };
        }
      }
    }
  }

  return {
    ...intent,
    inferenceLog,
  };
}

// ============================================
// OPENING INFERENCE
// ============================================

function inferAddOpening(
  intent: AddOpeningIntent,
  context: InferenceContext
): AddOpeningIntent {
  const inferenceLog = [...intent.inferenceLog];

  // If no room specified, infer from context
  let roomName = intent.roomName;
  if (!roomName && context.existingRooms.length > 0) {
    roomName = context.existingRooms[context.existingRooms.length - 1].name;
    inferenceLog.push({
      field: 'roomName',
      inferredValue: roomName,
      reason: 'Targeting most recently created room',
      confidence: 0.85,
      reversible: true,
    });
  }

  // Infer height if not provided
  let heightFt = intent.heightFt;
  if (!heightFt) {
    if (intent.openingType === 'WINDOW') {
      heightFt = GRAMMAR_DEFAULTS.windowHeightFt;
    } else {
      heightFt = GRAMMAR_DEFAULTS.doorHeightFt;
    }
    inferenceLog.push({
      field: 'heightFt',
      inferredValue: heightFt,
      reason: `Default ${intent.openingType.toLowerCase()} height`,
      confidence: 0.8,
      reversible: true,
    });
  }

  // Infer sill height for windows
  let sillHeightFt = intent.sillHeightFt;
  if (intent.openingType === 'WINDOW' && sillHeightFt === undefined) {
    sillHeightFt = GRAMMAR_DEFAULTS.windowSillHeightFt;
    inferenceLog.push({
      field: 'sillHeightFt',
      inferredValue: sillHeightFt,
      reason: 'Default window sill height',
      confidence: 0.8,
      reversible: true,
    });
  }

  return {
    ...intent,
    roomName,
    heightFt,
    sillHeightFt,
    inferenceLog,
  };
}

// ============================================
// ADJACENCY INFERENCE
// ============================================

/**
 * Suggest optimal position for a new room based on adjacency rules
 */
export function suggestRoomPosition(
  newRoomName: string,
  existingRooms: InferenceContext['existingRooms']
): {
  relativeTo: string | null;
  direction: CardinalDirection;
  confidence: number;
  reason: string;
} {
  if (existingRooms.length === 0) {
    return {
      relativeTo: null,
      direction: 'EAST',
      confidence: 0.5,
      reason: 'No existing rooms, starting at origin',
    };
  }

  const newRoomLower = newRoomName.toLowerCase();

  // Find room type profile
  let profile: RoomTypeProfile | undefined;
  for (const [typeName, typeProfile] of Object.entries(ROOM_TYPE_PROFILES)) {
    if (newRoomLower.includes(typeName)) {
      profile = typeProfile;
      break;
    }
  }

  if (profile) {
    // Look for a matching adjacent room
    for (const adjacentName of profile.adjacentRooms) {
      const matchedRoom = existingRooms.find(
        r => r.name.toLowerCase().includes(adjacentName)
      );
      if (matchedRoom) {
        // Determine best direction based on room types
        const direction = suggestDirectionForAdjacency(newRoomLower, adjacentName);
        return {
          relativeTo: matchedRoom.name,
          direction,
          confidence: 0.75,
          reason: `${newRoomName} is commonly adjacent to ${matchedRoom.name}`,
        };
      }
    }
  }

  // Default: place east of the last room
  const lastRoom = existingRooms[existingRooms.length - 1];
  return {
    relativeTo: lastRoom.name,
    direction: 'EAST',
    confidence: 0.5,
    reason: 'Default placement east of last room',
  };
}

/**
 * Suggest direction based on room adjacency patterns
 */
function suggestDirectionForAdjacency(
  newRoom: string,
  adjacentRoom: string
): CardinalDirection {
  // Kitchen-dining room adjacency
  if ((newRoom.includes('kitchen') && adjacentRoom.includes('dining')) ||
      (newRoom.includes('dining') && adjacentRoom.includes('kitchen'))) {
    return 'EAST';
  }

  // Kitchen-living room adjacency
  if ((newRoom.includes('kitchen') && adjacentRoom.includes('living')) ||
      (newRoom.includes('living') && adjacentRoom.includes('kitchen'))) {
    return 'WEST';
  }

  // Master bedroom-master bath adjacency
  if (newRoom.includes('master bath') && adjacentRoom.includes('master bed')) {
    return 'NORTH';
  }
  if (newRoom.includes('master bed') && adjacentRoom.includes('master bath')) {
    return 'SOUTH';
  }

  // Garage-kitchen adjacency
  if (newRoom.includes('garage') && adjacentRoom.includes('kitchen')) {
    return 'WEST';
  }
  if (newRoom.includes('kitchen') && adjacentRoom.includes('garage')) {
    return 'EAST';
  }

  // Default
  return 'EAST';
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate inferred dimensions against physical constraints
 */
export function validateInference(intent: NormalizedIntent): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (intent.intent === 'CREATE_ROOM') {
    const { dimensions } = intent as CreateRoomIntent;

    // Check minimum dimensions
    if (dimensions.widthFt < 4) {
      warnings.push(`Width ${dimensions.widthFt}ft is unusually small (< 4ft)`);
    }
    if (dimensions.lengthFt < 4) {
      warnings.push(`Length ${dimensions.lengthFt}ft is unusually small (< 4ft)`);
    }
    if (dimensions.ceilingHeightFt < 6) {
      warnings.push(`Ceiling height ${dimensions.ceilingHeightFt}ft is unusually low (< 6ft)`);
    }

    // Check maximum dimensions
    if (dimensions.widthFt > 50) {
      warnings.push(`Width ${dimensions.widthFt}ft is unusually large (> 50ft)`);
    }
    if (dimensions.lengthFt > 50) {
      warnings.push(`Length ${dimensions.lengthFt}ft is unusually large (> 50ft)`);
    }
    if (dimensions.ceilingHeightFt > 20) {
      warnings.push(`Ceiling height ${dimensions.ceilingHeightFt}ft is unusually high (> 20ft)`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// ============================================
// INFERENCE LOG UTILITIES
// ============================================

/**
 * Format inference log for display
 */
export function formatInferenceLog(log: InferenceLogEntry[]): string {
  if (log.length === 0) return 'No inferences applied.';

  return log.map((entry, i) => {
    const reversibleTag = entry.reversible ? '[reversible]' : '[fixed]';
    const confidence = `${Math.round(entry.confidence * 100)}%`;
    return `${i + 1}. ${entry.field}: ${JSON.stringify(entry.inferredValue)} - ${entry.reason} (${confidence}) ${reversibleTag}`;
  }).join('\n');
}

/**
 * Get summary of inferences for audit
 */
export function summarizeInferences(log: InferenceLogEntry[]): {
  totalInferences: number;
  reversibleCount: number;
  averageConfidence: number;
  fields: string[];
} {
  if (log.length === 0) {
    return {
      totalInferences: 0,
      reversibleCount: 0,
      averageConfidence: 1,
      fields: [],
    };
  }

  return {
    totalInferences: log.length,
    reversibleCount: log.filter(e => e.reversible).length,
    averageConfidence: log.reduce((sum, e) => sum + e.confidence, 0) / log.length,
    fields: [...new Set(log.map(e => e.field))],
  };
}
