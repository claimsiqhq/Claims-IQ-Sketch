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
  DeleteRoomParams,
  EditRoomParams,
  DeleteOpeningParams,
  DeleteFeatureParams,
  EditDamageZoneParams,
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
  deleteRoom: (params: DeleteRoomParams) => string;
  editRoom: (params: EditRoomParams) => string;
  deleteOpening: (params: DeleteOpeningParams) => string;
  deleteFeature: (params: DeleteFeatureParams) => string;
  editDamageZone: (params: EditDamageZoneParams) => string;

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
    const polygon = generatePolygon(
      params.shape,
      params.width_ft,
      params.length_ft,
      params.l_shape_config,
      params.t_shape_config
    );
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
      l_shape_config: params.l_shape_config,
      t_shape_config: params.t_shape_config,
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
      position_from: params.position_from ?? 'start',
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
      position_from: params.position_from ?? 'start',
      x_offset_ft: params.x_offset_ft,
      y_offset_ft: params.y_offset_ft,
    };

    // Build description based on wall type
    let wallDesc = params.wall === 'freestanding' ? 'freestanding' : `on ${params.wall} wall`;
    
    // Add position info for freestanding features with offsets
    if (params.wall === 'freestanding' && (params.x_offset_ft !== undefined || params.y_offset_ft !== undefined)) {
      const positionParts: string[] = [];
      if (params.y_offset_ft !== undefined) {
        positionParts.push(`${formatDimension(params.y_offset_ft)} from south wall`);
      }
      if (params.x_offset_ft !== undefined) {
        positionParts.push(`${formatDimension(params.x_offset_ft)} from west wall`);
      }
      if (positionParts.length > 0) {
        wallDesc = `freestanding, ${positionParts.join(', ')}`;
      }
    }

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
        updatedRoom.polygon = generatePolygon(
          updatedRoom.shape,
          params.new_value_ft,
          updatedRoom.length_ft,
          updatedRoom.l_shape_config,
          updatedRoom.t_shape_config
        );
        resultMessage = `Updated room width to ${formatDimension(params.new_value_ft)}`;
        break;

      case 'room_length':
        updatedRoom.length_ft = params.new_value_ft;
        updatedRoom.polygon = generatePolygon(
          updatedRoom.shape,
          updatedRoom.width_ft,
          params.new_value_ft,
          updatedRoom.l_shape_config,
          updatedRoom.t_shape_config
        );
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

  deleteRoom: (params) => {
    const { currentRoom, rooms } = get();

    // Determine which room to delete
    let roomToDelete: RoomGeometry | null = null;
    let isCurrentRoom = false;
    let roomIndex = -1;

    if (params.room_id) {
      // Delete by ID from confirmed rooms
      roomIndex = rooms.findIndex(r => r.id === params.room_id);
      if (roomIndex >= 0) {
        roomToDelete = rooms[roomIndex];
      } else if (currentRoom?.id === params.room_id) {
        roomToDelete = currentRoom;
        isCurrentRoom = true;
      }
    } else if (params.room_name) {
      // Delete by name
      const normalizedName = params.room_name.toLowerCase().replace(/\s+/g, '_');
      roomIndex = rooms.findIndex(r => r.name.toLowerCase() === normalizedName);
      if (roomIndex >= 0) {
        roomToDelete = rooms[roomIndex];
      } else if (currentRoom?.name.toLowerCase() === normalizedName) {
        roomToDelete = currentRoom;
        isCurrentRoom = true;
      }
    } else {
      // Delete current room
      if (currentRoom) {
        roomToDelete = currentRoom;
        isCurrentRoom = true;
      }
    }

    if (!roomToDelete) {
      return 'Error: Could not find room to delete. Please specify a room name or ID.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'delete_room',
      params,
      timestamp: new Date().toISOString(),
      result: `Deleted ${formatRoomName(roomToDelete.name)}`,
    };

    if (isCurrentRoom) {
      set((state) => ({
        currentRoom: null,
        undoStack: [],
        commandHistory: [...state.commandHistory, command],
      }));
    } else {
      set((state) => ({
        rooms: state.rooms.filter((_, i) => i !== roomIndex),
        commandHistory: [...state.commandHistory, command],
      }));
    }

    return command.result;
  },

  editRoom: (params) => {
    const { currentRoom, rooms } = get();

    // Determine which room to edit
    let roomToEdit: RoomGeometry | null = null;
    let isCurrentRoom = false;
    let roomIndex = -1;

    if (params.room_id) {
      roomIndex = rooms.findIndex(r => r.id === params.room_id);
      if (roomIndex >= 0) {
        roomToEdit = rooms[roomIndex];
      } else if (currentRoom?.id === params.room_id) {
        roomToEdit = currentRoom;
        isCurrentRoom = true;
      }
    } else if (params.room_name) {
      const normalizedName = params.room_name.toLowerCase().replace(/\s+/g, '_');
      roomIndex = rooms.findIndex(r => r.name.toLowerCase() === normalizedName);
      if (roomIndex >= 0) {
        roomToEdit = rooms[roomIndex];
      } else if (currentRoom?.name.toLowerCase() === normalizedName) {
        roomToEdit = currentRoom;
        isCurrentRoom = true;
      }
    } else {
      // Edit current room
      if (currentRoom) {
        roomToEdit = currentRoom;
        isCurrentRoom = true;
      }
    }

    if (!roomToEdit) {
      return 'Error: Could not find room to edit. Please specify a room name or create a room first.';
    }

    // Save to undo stack if editing current room
    if (isCurrentRoom && currentRoom) {
      set((state) => ({
        undoStack: [...state.undoStack, state.currentRoom!],
      }));
    }

    const changes: string[] = [];
    let updatedRoom = { ...roomToEdit, updated_at: new Date().toISOString() };

    if (params.new_name) {
      const newName = normalizeRoomName(params.new_name);
      changes.push(`name to ${formatRoomName(newName)}`);
      updatedRoom.name = newName;
    }

    if (params.new_shape) {
      changes.push(`shape to ${params.new_shape}`);
      updatedRoom.shape = params.new_shape;
      updatedRoom.polygon = generatePolygon(
        params.new_shape,
        updatedRoom.width_ft,
        updatedRoom.length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
    }

    if (params.new_width_ft !== undefined) {
      changes.push(`width to ${formatDimension(params.new_width_ft)}`);
      updatedRoom.width_ft = params.new_width_ft;
      updatedRoom.polygon = generatePolygon(
        updatedRoom.shape,
        params.new_width_ft,
        updatedRoom.length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
    }

    if (params.new_length_ft !== undefined) {
      changes.push(`length to ${formatDimension(params.new_length_ft)}`);
      updatedRoom.length_ft = params.new_length_ft;
      updatedRoom.polygon = generatePolygon(
        updatedRoom.shape,
        updatedRoom.width_ft,
        params.new_length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
    }

    if (params.new_ceiling_height_ft !== undefined) {
      changes.push(`ceiling height to ${formatDimension(params.new_ceiling_height_ft)}`);
      updatedRoom.ceiling_height_ft = params.new_ceiling_height_ft;
    }

    if (changes.length === 0) {
      return 'No changes specified. Please provide at least one property to update.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'edit_room',
      params,
      timestamp: new Date().toISOString(),
      result: `Updated ${formatRoomName(roomToEdit.name)}: ${changes.join(', ')}`,
    };

    if (isCurrentRoom) {
      set((state) => ({
        currentRoom: updatedRoom,
        commandHistory: [...state.commandHistory, command],
      }));
    } else {
      set((state) => ({
        rooms: state.rooms.map((r, i) => i === roomIndex ? updatedRoom : r),
        commandHistory: [...state.commandHistory, command],
      }));
    }

    return command.result;
  },

  deleteOpening: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    let openingIndex = -1;
    let openingToDelete: Opening | null = null;

    if (params.opening_index !== undefined) {
      openingIndex = params.opening_index;
      openingToDelete = currentRoom.openings[openingIndex] || null;
    } else if (params.opening_id) {
      openingIndex = currentRoom.openings.findIndex(o => o.id === params.opening_id);
      openingToDelete = openingIndex >= 0 ? currentRoom.openings[openingIndex] : null;
    } else if (params.wall && params.type) {
      // Find by wall and type
      openingIndex = currentRoom.openings.findIndex(o => o.wall === params.wall && o.type === params.type);
      openingToDelete = openingIndex >= 0 ? currentRoom.openings[openingIndex] : null;
    } else if (params.wall) {
      // Find first opening on the wall
      openingIndex = currentRoom.openings.findIndex(o => o.wall === params.wall);
      openingToDelete = openingIndex >= 0 ? currentRoom.openings[openingIndex] : null;
    } else if (params.type) {
      // Find first opening of the type
      openingIndex = currentRoom.openings.findIndex(o => o.type === params.type);
      openingToDelete = openingIndex >= 0 ? currentRoom.openings[openingIndex] : null;
    }

    if (!openingToDelete || openingIndex < 0) {
      return 'Error: Could not find opening to delete. Please specify the opening index, wall, or type.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'delete_opening',
      params,
      timestamp: new Date().toISOString(),
      result: `Deleted ${openingToDelete.type} on ${openingToDelete.wall} wall`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        openings: state.currentRoom!.openings.filter((_, i) => i !== openingIndex),
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  deleteFeature: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    let featureIndex = -1;
    let featureToDelete: Feature | null = null;

    if (params.feature_index !== undefined) {
      featureIndex = params.feature_index;
      featureToDelete = currentRoom.features[featureIndex] || null;
    } else if (params.feature_id) {
      featureIndex = currentRoom.features.findIndex(f => f.id === params.feature_id);
      featureToDelete = featureIndex >= 0 ? currentRoom.features[featureIndex] : null;
    } else if (params.type) {
      // Find first feature of the type
      featureIndex = currentRoom.features.findIndex(f => f.type === params.type);
      featureToDelete = featureIndex >= 0 ? currentRoom.features[featureIndex] : null;
    }

    if (!featureToDelete || featureIndex < 0) {
      return 'Error: Could not find feature to delete. Please specify the feature index or type.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'delete_feature',
      params,
      timestamp: new Date().toISOString(),
      result: `Deleted ${featureToDelete.type}${featureToDelete.wall !== 'freestanding' ? ` on ${featureToDelete.wall} wall` : ''}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        features: state.currentRoom!.features.filter((_, i) => i !== featureIndex),
        updated_at: new Date().toISOString(),
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  editDamageZone: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room started. Please create a room first.';

    // Save to undo stack
    set((state) => ({
      undoStack: [...state.undoStack, state.currentRoom!],
    }));

    let damageIndex = -1;
    let damageZone: VoiceDamageZone | null = null;

    if (params.damage_index !== undefined) {
      damageIndex = params.damage_index;
      damageZone = currentRoom.damageZones[damageIndex] || null;
    } else if (params.damage_id) {
      damageIndex = currentRoom.damageZones.findIndex(d => d.id === params.damage_id);
      damageZone = damageIndex >= 0 ? currentRoom.damageZones[damageIndex] : null;
    } else if (currentRoom.damageZones.length === 1) {
      // If there's only one damage zone, edit it
      damageIndex = 0;
      damageZone = currentRoom.damageZones[0];
    }

    if (!damageZone || damageIndex < 0) {
      return 'Error: Could not find damage zone to edit. Please specify the damage index or ID.';
    }

    const changes: string[] = [];
    let updatedDamageZone = { ...damageZone };

    if (params.new_type) {
      changes.push(`type to ${params.new_type}`);
      updatedDamageZone.type = params.new_type;
    }

    if (params.new_category) {
      changes.push(`category to ${params.new_category}`);
      updatedDamageZone.category = params.new_category;
    }

    if (params.new_affected_walls) {
      changes.push(`affected walls to ${params.new_affected_walls.join(', ')}`);
      updatedDamageZone.affected_walls = params.new_affected_walls;
    }

    if (params.new_floor_affected !== undefined) {
      changes.push(`floor affected to ${params.new_floor_affected}`);
      updatedDamageZone.floor_affected = params.new_floor_affected;
    }

    if (params.new_ceiling_affected !== undefined) {
      changes.push(`ceiling affected to ${params.new_ceiling_affected}`);
      updatedDamageZone.ceiling_affected = params.new_ceiling_affected;
    }

    if (params.new_extent_ft !== undefined) {
      changes.push(`extent to ${formatDimension(params.new_extent_ft)}`);
      updatedDamageZone.extent_ft = params.new_extent_ft;
    }

    if (params.new_source) {
      changes.push(`source to "${params.new_source}"`);
      updatedDamageZone.source = params.new_source;
    }

    if (changes.length === 0) {
      return 'No changes specified. Please provide at least one property to update.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'edit_damage_zone',
      params,
      timestamp: new Date().toISOString(),
      result: `Updated ${damageZone.type} damage zone: ${changes.join(', ')}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        damageZones: state.currentRoom!.damageZones.map((d, i) => i === damageIndex ? updatedDamageZone : d),
        updated_at: new Date().toISOString(),
      },
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
  deleteRoom: (params: DeleteRoomParams) => useGeometryEngine.getState().deleteRoom(params),
  editRoom: (params: EditRoomParams) => useGeometryEngine.getState().editRoom(params),
  deleteOpening: (params: DeleteOpeningParams) => useGeometryEngine.getState().deleteOpening(params),
  deleteFeature: (params: DeleteFeatureParams) => useGeometryEngine.getState().deleteFeature(params),
  editDamageZone: (params: EditDamageZoneParams) => useGeometryEngine.getState().editDamageZone(params),
};
