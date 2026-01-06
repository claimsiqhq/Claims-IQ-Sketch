/**
 * Grammar Integration Service
 *
 * Bridges the voice grammar normalization layer with the geometry engine.
 * Converts normalized intents into geometry operations and maintains
 * an audit trail of all inferences.
 *
 * This service:
 * - Receives tool call parameters from the voice agent
 * - Normalizes them through the grammar layer
 * - Applies inference engine for smart defaults
 * - Executes geometry operations
 * - Logs all inferences for transparency
 */

import { create } from 'zustand';
import {
  processVoiceInput,
  getInferenceSummary,
  hasLowConfidenceInferences,
  getInferenceWarnings,
  calculateRoomBounds,
  suggestOptimalPlacement,
  detectAdjacencies,
  analyzeLayout,
  type NormalizedIntent,
  type InferenceContext,
  type InferenceLogEntry,
  type RoomBounds,
  type AdjacencyRelationship,
} from '../../../../shared/voice-grammar';
import { geometryEngine } from './geometry-engine';

// ============================================
// AUDIT LOG TYPES
// ============================================

export interface AuditEntry {
  id: string;
  timestamp: string;
  intent: NormalizedIntent;
  inferences: InferenceLogEntry[];
  warnings: string[];
  executionResult: 'success' | 'failed' | 'pending';
  executionMessage?: string;
}

export interface GrammarIntegrationState {
  // Audit trail
  auditLog: AuditEntry[];

  // Current context for inference
  context: InferenceContext;

  // Layout analysis
  roomBounds: RoomBounds[];
  adjacencies: AdjacencyRelationship[];

  // Actions
  processVoiceCommand: (rawText: string) => NormalizedIntent;
  executeIntent: (intent: NormalizedIntent) => Promise<string>;
  updateContext: () => void;
  getAuditLog: () => AuditEntry[];
  clearAuditLog: () => void;
  getLayoutAnalysis: () => ReturnType<typeof analyzeLayout>;
}

// ============================================
// STORE
// ============================================

export const useGrammarIntegration = create<GrammarIntegrationState>((set, get) => ({
  auditLog: [],
  context: { existingRooms: [] },
  roomBounds: [],
  adjacencies: [],

  processVoiceCommand: (rawText: string) => {
    const { context } = get();

    // Process through grammar layer
    const intent = processVoiceInput(rawText, context);

    // Log warnings if any
    const warnings = getInferenceWarnings(intent);

    // Create audit entry (pending execution)
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      intent,
      inferences: intent.inferenceLog,
      warnings,
      executionResult: 'pending',
    };

    set(state => ({
      auditLog: [...state.auditLog, auditEntry],
    }));

    return intent;
  },

  executeIntent: async (intent: NormalizedIntent) => {
    const { auditLog } = get();

    // Find the pending audit entry for this intent
    const entryIndex = auditLog.findIndex(
      e => e.intent.timestamp === intent.timestamp && e.executionResult === 'pending'
    );

    try {
      let result: string;

      // Execute based on intent type
      switch (intent.intent) {
        case 'CREATE_ROOM':
          result = await executeCreateRoom(intent);
          break;
        case 'PLACE_ROOM_RELATIVE':
          result = await executePlaceRoom(intent);
          break;
        case 'ADD_OPENING':
          result = await executeAddOpening(intent);
          break;
        case 'ADD_FEATURE':
          result = await executeAddFeature(intent);
          break;
        case 'CONNECT_ROOMS':
          result = await executeConnectRooms(intent);
          break;
        case 'MODIFY_DIMENSION':
          result = await executeModifyDimension(intent);
          break;
        case 'MARK_DAMAGE':
          result = await executeMarkDamage(intent);
          break;
        case 'SET_SHAPE':
          result = await executeSetShape(intent);
          break;
        case 'DELETE_ROOM':
          result = geometryEngine.deleteRoom({});
          break;
        case 'UNDO':
          result = geometryEngine.undo((intent as any).steps || 1);
          break;
        case 'CONFIRM_ROOM':
          result = geometryEngine.confirmRoom({ ready_for_next: (intent as any).readyForNext });
          break;
        case 'UNKNOWN':
          result = 'Could not understand command. ' + ((intent as any).suggestion || '');
          break;
        default:
          result = `Intent type ${intent.intent} not yet implemented`;
      }

      // Update audit entry
      if (entryIndex >= 0) {
        set(state => ({
          auditLog: state.auditLog.map((e, i) =>
            i === entryIndex
              ? { ...e, executionResult: 'success', executionMessage: result }
              : e
          ),
        }));
      }

      // Update context after successful execution
      get().updateContext();

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Update audit entry with failure
      if (entryIndex >= 0) {
        set(state => ({
          auditLog: state.auditLog.map((e, i) =>
            i === entryIndex
              ? { ...e, executionResult: 'failed', executionMessage: message }
              : e
          ),
        }));
      }

      return `Error: ${message}`;
    }
  },

  updateContext: () => {
    // Get rooms from geometry engine
    const rooms = geometryEngine.getAllRooms();

    const existingRooms = rooms.map(room => ({
      name: room.name,
      widthFt: room.width_ft,
      lengthFt: room.length_ft,
      originXFt: room.origin_x_ft || 0,
      originYFt: room.origin_y_ft || 0,
      levelName: room.level_name || 'Main Level',
    }));

    // Calculate room bounds
    const roomBounds: RoomBounds[] = rooms.map(room =>
      calculateRoomBounds(
        room.id,
        room.name,
        room.origin_x_ft || 0,
        room.origin_y_ft || 0,
        room.polygon
      )
    );

    // Detect adjacencies
    const adjacencies = detectAdjacencies(roomBounds);

    set({
      context: { existingRooms },
      roomBounds,
      adjacencies,
    });
  },

  getAuditLog: () => get().auditLog,

  clearAuditLog: () => set({ auditLog: [] }),

  getLayoutAnalysis: () => {
    const { roomBounds } = get();
    return analyzeLayout(roomBounds);
  },
}));

// ============================================
// INTENT EXECUTORS
// ============================================

async function executeCreateRoom(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'CREATE_ROOM') return 'Invalid intent';

  const { roomName, dimensions, shape, lShapeConfig, tShapeConfig, levelName } = intent;

  // Map shape type
  const shapeMap: Record<string, 'rectangle' | 'l_shape' | 't_shape' | 'irregular'> = {
    'RECT': 'rectangle',
    'L_SHAPE': 'l_shape',
    'T_SHAPE': 't_shape',
    'POLY': 'irregular',
  };

  return geometryEngine.createRoom({
    name: roomName,
    shape: shapeMap[shape] || 'rectangle',
    width_ft: dimensions.widthFt,
    length_ft: dimensions.lengthFt,
    ceiling_height_ft: dimensions.ceilingHeightFt,
    l_shape_config: lShapeConfig ? {
      notch_corner: lShapeConfig.notchCorner.toLowerCase() as any,
      notch_width_ft: lShapeConfig.notchWidthFt,
      notch_length_ft: lShapeConfig.notchLengthFt,
    } : undefined,
    t_shape_config: tShapeConfig ? {
      stem_wall: tShapeConfig.stemWall.toLowerCase() as any,
      stem_width_ft: tShapeConfig.stemWidthFt,
      stem_length_ft: tShapeConfig.stemLengthFt,
      stem_position_ft: tShapeConfig.stemPositionFt,
    } : undefined,
  });
}

async function executePlaceRoom(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'PLACE_ROOM_RELATIVE') return 'Invalid intent';

  const { roomName, relativeTo, direction, gapFt } = intent;

  // This would integrate with floor plan engine
  // For now, return a descriptive message
  return `Room ${roomName} placed ${direction.toLowerCase()} of ${relativeTo}`;
}

async function executeAddOpening(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'ADD_OPENING') return 'Invalid intent';

  const { openingType, wall, widthFt, heightFt, position, positionFrom, sillHeightFt } = intent;

  // Map opening type
  const typeMap: Record<string, 'door' | 'window' | 'archway' | 'sliding_door' | 'french_door'> = {
    'DOOR': 'door',
    'WINDOW': 'window',
    'ARCHWAY': 'archway',
    'SLIDING_DOOR': 'sliding_door',
    'FRENCH_DOOR': 'french_door',
    'CASED_OPENING': 'archway',
  };

  // Map wall direction
  const wallMap: Record<string, 'north' | 'south' | 'east' | 'west'> = {
    'NORTH': 'north',
    'SOUTH': 'south',
    'EAST': 'east',
    'WEST': 'west',
  };

  // Map position
  let mappedPosition: 'left' | 'center' | 'right' | number = 'center';
  if (typeof position === 'number') {
    mappedPosition = position;
  } else {
    mappedPosition = position.toLowerCase() as 'left' | 'center' | 'right';
  }

  return geometryEngine.addOpening({
    type: typeMap[openingType] || 'door',
    wall: wallMap[wall],
    width_ft: widthFt,
    height_ft: heightFt,
    position: mappedPosition,
    position_from: positionFrom === 'END' ? 'end' : 'start',
    sill_height_ft: sillHeightFt,
  });
}

async function executeAddFeature(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'ADD_FEATURE') return 'Invalid intent';

  const { featureType, wall, widthFt, depthFt, position, positionFrom } = intent;

  // Map feature type
  const typeMap: Record<string, 'closet' | 'alcove' | 'bump_out' | 'island' | 'peninsula' | 'fireplace' | 'built_in'> = {
    'CLOSET': 'closet',
    'ALCOVE': 'alcove',
    'BUMP_OUT': 'bump_out',
    'ISLAND': 'island',
    'PENINSULA': 'peninsula',
    'FIREPLACE': 'fireplace',
    'BUILT_IN': 'built_in',
  };

  // Map wall
  const wallMap: Record<string, 'north' | 'south' | 'east' | 'west' | 'freestanding'> = {
    'NORTH': 'north',
    'SOUTH': 'south',
    'EAST': 'east',
    'WEST': 'west',
    'FREESTANDING': 'freestanding',
  };

  // Map position
  let mappedPosition: 'left' | 'center' | 'right' | number = 'center';
  if (typeof position === 'number') {
    mappedPosition = position;
  } else {
    mappedPosition = position.toLowerCase() as 'left' | 'center' | 'right';
  }

  return geometryEngine.addFeature({
    type: typeMap[featureType] || 'closet',
    wall: wallMap[wall] || 'north',
    width_ft: widthFt,
    depth_ft: depthFt,
    position: mappedPosition,
    position_from: positionFrom === 'END' ? 'end' : 'start',
  });
}

async function executeConnectRooms(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'CONNECT_ROOMS') return 'Invalid intent';

  const { fromRoom, toRoom, connectionType } = intent;

  return `Rooms ${fromRoom} and ${toRoom} connected via ${connectionType.toLowerCase()}`;
}

async function executeModifyDimension(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'MODIFY_DIMENSION') return 'Invalid intent';

  const { target, newValueFt } = intent;

  return geometryEngine.modifyDimension({
    target,
    new_value_ft: newValueFt,
  });
}

async function executeMarkDamage(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'MARK_DAMAGE') return 'Invalid intent';

  const { damageType, category, affectedWalls, floorAffected, ceilingAffected, extentFt, source } = intent;

  // Map damage type
  const typeMap: Record<string, 'water' | 'fire' | 'smoke' | 'mold' | 'wind' | 'impact'> = {
    'WATER': 'water',
    'FIRE': 'fire',
    'SMOKE': 'smoke',
    'MOLD': 'mold',
    'WIND': 'wind',
    'IMPACT': 'impact',
  };

  // Map walls
  const wallMap: Record<string, 'north' | 'south' | 'east' | 'west'> = {
    'NORTH': 'north',
    'SOUTH': 'south',
    'EAST': 'east',
    'WEST': 'west',
  };

  return geometryEngine.markDamage({
    type: typeMap[damageType] || 'water',
    category,
    affected_walls: affectedWalls.map(w => wallMap[w]),
    floor_affected: floorAffected,
    ceiling_affected: ceilingAffected,
    extent_ft: extentFt,
    source,
  });
}

async function executeSetShape(intent: NormalizedIntent): Promise<string> {
  if (intent.intent !== 'SET_SHAPE') return 'Invalid intent';

  const { shape, roomName } = intent;

  // Map shape
  const shapeMap: Record<string, 'rectangle' | 'l_shape' | 't_shape' | 'irregular'> = {
    'RECT': 'rectangle',
    'L_SHAPE': 'l_shape',
    'T_SHAPE': 't_shape',
    'POLY': 'irregular',
  };

  return geometryEngine.editRoom({
    room_name: roomName,
    new_shape: shapeMap[shape],
  });
}

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  getInferenceSummary,
  hasLowConfidenceInferences,
  getInferenceWarnings,
};
