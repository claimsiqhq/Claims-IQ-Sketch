// Geometry Engine Service
// Zustand store for voice-driven room sketching state management

import { create } from 'zustand';
import type {
  RoomGeometry,
  Opening,
  Feature,
  VoiceDamageZone,
  RoomNote,
  GeometryCommand,
  TranscriptEntry,
  VoiceSessionState,
  CreateRoomParams,
  AddOpeningParams,
  AddFeatureParams,
  MarkDamageParams,
  ModifyDimensionParams,
  AddNoteParams,
  ConfirmRoomParams,
} from '../types/geometry';
import {
  generateId,
  generatePolygon,
  getWallLength,
  calculatePositionInFeet,
  normalizeRoomName,
  formatRoomName,
  formatDimension,
} from '../utils/polygon-math';

interface GeometryEngineState {
  // Current room being edited
  currentRoom: RoomGeometry | null;

  // All confirmed rooms in the session
  rooms: RoomGeometry[];

  // Command history for undo/redo
  commandHistory: GeometryCommand[];
  undoStack: RoomGeometry[];

  // Transcript of voice interactions
  transcript: TranscriptEntry[];

  // Voice session state
  sessionState: VoiceSessionState;

  // Actions called by voice agent tools
  createRoom: (params: CreateRoomParams) => string;
  addOpening: (params: AddOpeningParams) => string;
  addFeature: (params: AddFeatureParams) => string;
  markDamage: (params: MarkDamageParams) => string;
  modifyDimension: (params: ModifyDimensionParams) => string;
  addNote: (params: AddNoteParams) => string;
  undo: (steps: number) => string;
  confirmRoom: (params: ConfirmRoomParams) => string;

  // Transcript management
  addTranscriptEntry: (entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => void;
  clearTranscript: () => void;

  // Session state management
  setSessionState: (state: Partial<VoiceSessionState>) => void;

  // Reset state
  resetSession: () => void;
}

const initialSessionState: VoiceSessionState = {
  isConnected: false,
  isListening: false,
  isSpeaking: false,
  error: null,
};

export const useGeometryEngine = create<GeometryEngineState>((set, get) => ({
  currentRoom: null,
  rooms: [],
  commandHistory: [],
  undoStack: [],
  transcript: [],
  sessionState: initialSessionState,

  createRoom: (params) => {
    const { currentRoom } = get();

    // Save current room to undo stack if exists
    if (currentRoom) {
      set((state) => ({
        undoStack: [...state.undoStack, currentRoom],
      }));
    }

    const now = new Date().toISOString();
    const polygon = generatePolygon(params.shape, params.width_ft, params.length_ft);
    const roomName = normalizeRoomName(params.name);

    const newRoom: RoomGeometry = {
      id: generateId(),
      name: roomName,
      shape: params.shape,
      width_ft: params.width_ft,
      length_ft: params.length_ft,
      ceiling_height_ft: params.ceiling_height_ft ?? 8,
      polygon,
      openings: [],
      features: [],
      damageZones: [],
      notes: [],
      created_at: now,
      updated_at: now,
    };

    const command: GeometryCommand = {
      id: generateId(),
      type: 'create_room',
      params,
      timestamp: now,
      result: `Created ${formatRoomName(roomName)}: ${formatDimension(params.width_ft)} × ${formatDimension(params.length_ft)}`,
    };

    set((state) => ({
      currentRoom: newRoom,
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  addOpening: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save current room state to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    const wallLength = getWallLength(params.wall, currentRoom.width_ft, currentRoom.length_ft);

    // Set default heights based on opening type
    let height = params.height_ft;
    if (!height) {
      height = params.type === 'door' || params.type === 'sliding_door' || params.type === 'french_door'
        ? 6.67
        : 4; // Windows default to 4'
    }

    const opening: Opening = {
      id: generateId(),
      type: params.type,
      wall: params.wall,
      width_ft: params.width_ft,
      height_ft: height,
      position: params.position,
      sill_height_ft: params.sill_height_ft ?? (params.type === 'window' ? 3 : undefined),
    };

    const positionDesc = typeof params.position === 'number'
      ? `${formatDimension(params.position)} from corner`
      : params.position;

    const command: GeometryCommand = {
      id: generateId(),
      type: 'add_opening',
      params,
      timestamp: new Date().toISOString(),
      result: `Added ${formatDimension(params.width_ft)} ${params.type} on ${params.wall} wall (${positionDesc})`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        openings: [...state.currentRoom!.openings, opening],
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  addFeature: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save current room state to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    const feature: Feature = {
      id: generateId(),
      type: params.type,
      wall: params.wall,
      width_ft: params.width_ft,
      depth_ft: params.depth_ft,
      position: params.position,
    };

    const wallDesc = params.wall === 'freestanding' ? 'freestanding' : `on ${params.wall} wall`;

    const command: GeometryCommand = {
      id: generateId(),
      type: 'add_feature',
      params,
      timestamp: new Date().toISOString(),
      result: `Added ${formatDimension(params.width_ft)} × ${formatDimension(params.depth_ft)} ${params.type} ${wallDesc}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        features: [...state.currentRoom!.features, feature],
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  markDamage: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save current room state to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    const damageZone: VoiceDamageZone = {
      id: generateId(),
      type: params.type,
      category: params.category,
      affected_walls: params.affected_walls,
      floor_affected: params.floor_affected ?? true,
      ceiling_affected: params.ceiling_affected ?? false,
      extent_ft: params.extent_ft,
      source: params.source,
    };

    const categoryStr = params.category ? `Category ${params.category} ` : '';
    const wallStr = params.affected_walls.join(', ');
    const surfacesAffected: string[] = [];
    if (params.floor_affected ?? true) surfacesAffected.push('floor');
    if (params.ceiling_affected) surfacesAffected.push('ceiling');
    const surfaceStr = surfacesAffected.length > 0 ? `, affecting ${surfacesAffected.join(' and ')}` : '';

    const command: GeometryCommand = {
      id: generateId(),
      type: 'mark_damage',
      params,
      timestamp: new Date().toISOString(),
      result: `Marked ${categoryStr}${params.type} damage on ${wallStr} wall(s), ${formatDimension(params.extent_ft)} extent${surfaceStr}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        damageZones: [...state.currentRoom!.damageZones, damageZone],
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  modifyDimension: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save current room state to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    let updatedRoom = { ...currentRoom, updated_at: new Date().toISOString() };
    let resultMessage = '';

    switch (params.target) {
      case 'room_width':
        updatedRoom.width_ft = params.new_value_ft;
        updatedRoom.polygon = generatePolygon(updatedRoom.shape, params.new_value_ft, updatedRoom.length_ft);
        resultMessage = `Updated room width to ${formatDimension(params.new_value_ft)}`;
        break;

      case 'room_length':
        updatedRoom.length_ft = params.new_value_ft;
        updatedRoom.polygon = generatePolygon(updatedRoom.shape, updatedRoom.width_ft, params.new_value_ft);
        resultMessage = `Updated room length to ${formatDimension(params.new_value_ft)}`;
        break;

      case 'ceiling_height':
        updatedRoom.ceiling_height_ft = params.new_value_ft;
        resultMessage = `Updated ceiling height to ${formatDimension(params.new_value_ft)}`;
        break;

      default:
        // Try to find a feature or opening by name/index
        if (params.target.startsWith('opening_')) {
          const index = parseInt(params.target.replace('opening_', ''));
          if (index >= 0 && index < currentRoom.openings.length) {
            const updatedOpenings = [...currentRoom.openings];
            updatedOpenings[index] = { ...updatedOpenings[index], width_ft: params.new_value_ft };
            updatedRoom.openings = updatedOpenings;
            resultMessage = `Updated opening ${index + 1} width to ${formatDimension(params.new_value_ft)}`;
          }
        } else if (params.target.startsWith('feature_')) {
          const index = parseInt(params.target.replace('feature_', ''));
          if (index >= 0 && index < currentRoom.features.length) {
            const updatedFeatures = [...currentRoom.features];
            updatedFeatures[index] = { ...updatedFeatures[index], width_ft: params.new_value_ft };
            updatedRoom.features = updatedFeatures;
            resultMessage = `Updated feature ${index + 1} width to ${formatDimension(params.new_value_ft)}`;
          }
        } else {
          resultMessage = `Unknown target: ${params.target}. Use room_width, room_length, ceiling_height, opening_N, or feature_N`;
        }
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'modify_dimension',
      params,
      timestamp: new Date().toISOString(),
      result: resultMessage,
    };

    set((state) => ({
      currentRoom: updatedRoom,
      commandHistory: [...state.commandHistory, command],
    }));

    return resultMessage;
  },

  addNote: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    const note: RoomNote = {
      id: generateId(),
      target: params.target,
      note: params.note,
      created_at: new Date().toISOString(),
    };

    const command: GeometryCommand = {
      id: generateId(),
      type: 'add_note',
      params,
      timestamp: new Date().toISOString(),
      result: `Added note to ${params.target}: "${params.note}"`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        notes: [...state.currentRoom!.notes, note],
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  undo: (steps = 1) => {
    const { undoStack, currentRoom } = get();

    if (undoStack.length === 0) {
      return 'Nothing to undo';
    }

    const actualSteps = Math.min(steps, undoStack.length);
    const newUndoStack = undoStack.slice(0, undoStack.length - actualSteps);
    const restoredRoom = undoStack[undoStack.length - actualSteps] || null;

    const command: GeometryCommand = {
      id: generateId(),
      type: 'undo',
      params: { steps: actualSteps },
      timestamp: new Date().toISOString(),
      result: `Undid ${actualSteps} action(s)`,
    };

    set((state) => ({
      currentRoom: restoredRoom,
      undoStack: newUndoStack,
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  confirmRoom: (params) => {
    const { currentRoom, rooms } = get();
    if (!currentRoom) return 'Error: No room to confirm. Please create a room first.';

    const confirmedRoom = {
      ...currentRoom,
      updated_at: new Date().toISOString(),
    };

    const command: GeometryCommand = {
      id: generateId(),
      type: 'confirm_room',
      params,
      timestamp: new Date().toISOString(),
      result: `${formatRoomName(currentRoom.name)} confirmed and saved`,
    };

    set((state) => ({
      rooms: [...state.rooms, confirmedRoom],
      currentRoom: params.ready_for_next ? null : confirmedRoom,
      undoStack: [], // Clear undo stack when room is confirmed
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  addTranscriptEntry: (entry) => {
    const newEntry: TranscriptEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      transcript: [...state.transcript, newEntry],
    }));
  },

  clearTranscript: () => {
    set({ transcript: [] });
  },

  setSessionState: (newState) => {
    set((state) => ({
      sessionState: { ...state.sessionState, ...newState },
    }));
  },

  resetSession: () => {
    set({
      currentRoom: null,
      rooms: [],
      commandHistory: [],
      undoStack: [],
      transcript: [],
      sessionState: initialSessionState,
    });
  },
}));

// Export a singleton for use in tool execute functions
export const geometryEngine = {
  get state() {
    return useGeometryEngine.getState();
  },
  createRoom: (params: CreateRoomParams) => useGeometryEngine.getState().createRoom(params),
  addOpening: (params: AddOpeningParams) => useGeometryEngine.getState().addOpening(params),
  addFeature: (params: AddFeatureParams) => useGeometryEngine.getState().addFeature(params),
  markDamage: (params: MarkDamageParams) => useGeometryEngine.getState().markDamage(params),
  modifyDimension: (params: ModifyDimensionParams) => useGeometryEngine.getState().modifyDimension(params),
  addNote: (params: AddNoteParams) => useGeometryEngine.getState().addNote(params),
  undo: (steps: number) => useGeometryEngine.getState().undo(steps),
  confirmRoom: (params: ConfirmRoomParams) => useGeometryEngine.getState().confirmRoom(params),
};
