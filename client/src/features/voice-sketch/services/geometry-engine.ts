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
  DeleteDamageZoneParams,
  Structure,
  SketchObject,
  SketchPhoto,
  CreateStructureParams,
  EditStructureParams,
  DeleteStructureParams,
  SelectStructureParams,
  AddObjectParams,
  EditObjectParams,
  DeleteObjectParams,
  CapturePhotoParams,
  HierarchyLevel,
  SelectWallParams,
  UpdateWallPropertiesParams,
  MoveWallParams,
  UpdateOpeningParams,
  WallDirection,
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
  // Track which claim ID rooms were loaded for (to detect cross-claim navigation)
  loadedForClaimId: string | null;
  
  // Hierarchy: Structures contain rooms
  structures: Structure[];
  currentStructure: Structure | null;
  
  // Current room being edited
  currentRoom: RoomGeometry | null;

  // All confirmed rooms in the session (flat list for backward compatibility)
  rooms: RoomGeometry[];
  
  // All photos in the session
  photos: SketchPhoto[];

  // Command history for undo/redo
  commandHistory: GeometryCommand[];
  undoStack: RoomGeometry[];

  // Transcript of voice interactions
  transcript: TranscriptEntry[];

  // Voice session state
  sessionState: VoiceSessionState;

  // Structure actions
  createStructure: (params: CreateStructureParams) => string;
  editStructure: (params: EditStructureParams) => string;
  deleteStructure: (params: DeleteStructureParams) => string;
  selectStructure: (params: SelectStructureParams) => string;

  // Room actions
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
  deleteDamageZone: (params: DeleteDamageZoneParams) => string;
  
  // Object actions
  addObject: (params: AddObjectParams) => string;
  editObject: (params: EditObjectParams) => string;
  deleteObject: (params: DeleteObjectParams) => string;
  
  // Wall-first editing actions
  selectedWallId: string | null;
  selectWall: (params: SelectWallParams) => string;
  updateWallProperties: (params: UpdateWallPropertiesParams) => string;
  moveWall: (params: MoveWallParams) => string;
  updateOpening: (params: UpdateOpeningParams) => string;
  
  // Photo actions
  capturePhoto: (params: CapturePhotoParams, file?: File) => Promise<string>;
  addPhoto: (photo: SketchPhoto) => void;
  updatePhotoAnalysis: (photoId: string, analysis: SketchPhoto['aiAnalysis']) => void;

  // Transcript management
  addTranscriptEntry: (entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => void;
  clearTranscript: () => void;

  // Session state management
  setSessionState: (state: Partial<VoiceSessionState>) => void;
  
  // Hierarchy helpers
  getCurrentHierarchyPath: () => string;
  getHierarchyContext: () => { structureId?: string; roomId?: string; subRoomId?: string };

  // Reset state
  resetSession: () => void;
  
  // Reset and load for a specific claim (handles cross-claim navigation)
  resetAndLoadForClaim: (claimId: string, rooms: RoomGeometry[]) => void;

  // Load from existing claim data
  loadFromClaimData: (structures: Structure[], rooms: RoomGeometry[]) => void;

  // Load existing rooms (for editing saved sketches)
  loadRooms: (rooms: RoomGeometry[]) => void;
}

const initialSessionState: VoiceSessionState = {
  isConnected: false,
  isListening: false,
  isSpeaking: false,
  error: null,
};

export const useGeometryEngine = create<GeometryEngineState>((set, get) => ({
  loadedForClaimId: null,
  structures: [],
  currentStructure: null,
  currentRoom: null,
  rooms: [],
  photos: [],
  commandHistory: [],
  undoStack: [],
  transcript: [],
  sessionState: initialSessionState,
  selectedWallId: null,

  // Structure actions
  createStructure: (params) => {
    const now = new Date().toISOString();
    const newStructure: Structure = {
      id: generateId(),
      name: params.name,
      type: params.type,
      description: params.description,
      address: params.address,
      stories: params.stories,
      yearBuilt: params.yearBuilt,
      constructionType: params.constructionType,
      roofType: params.roofType,
      rooms: [],
      photos: [],
      notes: [],
      created_at: now,
      updated_at: now,
    };

    const command: GeometryCommand = {
      id: generateId(),
      type: 'create_structure',
      params,
      timestamp: now,
      result: `Created structure: ${params.name} (${params.type})`,
    };

    set((state) => ({
      structures: [...state.structures, newStructure],
      currentStructure: newStructure,
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  editStructure: (params) => {
    const { structures, currentStructure } = get();
    const targetId = params.structure_id || currentStructure?.id;
    const targetName = params.structure_name;

    const structureIndex = structures.findIndex(
      (s) => s.id === targetId || s.name.toLowerCase() === targetName?.toLowerCase()
    );

    if (structureIndex === -1) {
      return 'Error: Structure not found';
    }

    const now = new Date().toISOString();
    const updatedStructure = {
      ...structures[structureIndex],
      ...(params.new_name && { name: params.new_name }),
      ...(params.new_type && { type: params.new_type }),
      ...(params.new_description && { description: params.new_description }),
      ...(params.new_stories && { stories: params.new_stories }),
      updated_at: now,
    };

    const newStructures = [...structures];
    newStructures[structureIndex] = updatedStructure;

    set({
      structures: newStructures,
      currentStructure: currentStructure?.id === updatedStructure.id ? updatedStructure : currentStructure,
    });

    return `Updated structure: ${updatedStructure.name}`;
  },

  deleteStructure: (params) => {
    const { structures, currentStructure } = get();
    const targetId = params.structure_id || currentStructure?.id;
    const targetName = params.structure_name;

    const structureIndex = structures.findIndex(
      (s) => s.id === targetId || s.name.toLowerCase() === targetName?.toLowerCase()
    );

    if (structureIndex === -1) {
      return 'Error: Structure not found';
    }

    const deletedStructure = structures[structureIndex];
    const newStructures = structures.filter((_, i) => i !== structureIndex);

    set({
      structures: newStructures,
      currentStructure: currentStructure?.id === deletedStructure.id ? null : currentStructure,
    });

    return `Deleted structure: ${deletedStructure.name}`;
  },

  selectStructure: (params) => {
    const { structures } = get();
    const targetId = params.structure_id;
    const targetName = params.structure_name;

    const structure = structures.find(
      (s) => s.id === targetId || s.name.toLowerCase() === targetName?.toLowerCase()
    );

    if (!structure) {
      return 'Error: Structure not found';
    }

    set({ currentStructure: structure });
    return `Selected structure: ${structure.name}`;
  },

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

    const { currentStructure } = get();
    const hierarchyLevel: HierarchyLevel = params.is_subroom ? 'subroom' : 'room';
    
    const newRoom: RoomGeometry = {
      id: generateId(),
      name: roomName,
      shape: params.shape,
      width_ft: params.width_ft,
      length_ft: params.length_ft,
      ceiling_height_ft: params.ceiling_height_ft ?? 8,
      flooring_type: params.flooring_type,
      polygon,
      openings: [],
      features: [],
      damageZones: [],
      notes: [],
      created_at: now,
      updated_at: now,
      l_shape_config: params.l_shape_config,
      t_shape_config: params.t_shape_config,
      // Hierarchy fields
      structureId: params.structure_id || currentStructure?.id,
      parentRoomId: params.parent_room_id,
      hierarchyLevel,
      subRooms: [],
      objects: [],
      photos: [],
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
      polygon: params.polygon,
      is_freeform: params.is_freeform,
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
    const { currentRoom, rooms, structures, currentStructure } = get();
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

    // If the room belongs to a structure, add it to the structure's rooms array
    let updatedStructures = structures;
    let updatedCurrentStructure = currentStructure;
    
    if (confirmedRoom.structureId) {
      updatedStructures = structures.map((s) => {
        if (s.id === confirmedRoom.structureId) {
          const updatedStructure = {
            ...s,
            rooms: [...s.rooms, confirmedRoom],
            updated_at: new Date().toISOString(),
          };
          // Update current structure reference if it matches
          if (currentStructure?.id === s.id) {
            updatedCurrentStructure = updatedStructure;
          }
          return updatedStructure;
        }
        return s;
      });
    }

    set((state) => ({
      rooms: [...state.rooms, confirmedRoom],
      structures: updatedStructures,
      currentStructure: updatedCurrentStructure,
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

    if (params.new_flooring_type !== undefined) {
      changes.push(`flooring to ${params.new_flooring_type}`);
      updatedRoom.flooring_type = params.new_flooring_type;
    }

    // Handle L-shape configuration updates
    if (params.new_l_shape_config && updatedRoom.shape === 'l_shape') {
      const currentConfig = updatedRoom.l_shape_config || {
        notch_corner: 'northeast' as const,
        notch_width_ft: 4,
        notch_length_ft: 4,
      };
      const newConfig = {
        ...currentConfig,
        ...params.new_l_shape_config,
      };
      updatedRoom.l_shape_config = newConfig;
      
      const configChanges: string[] = [];
      if (params.new_l_shape_config.notch_corner) {
        configChanges.push(`notch corner to ${params.new_l_shape_config.notch_corner}`);
      }
      if (params.new_l_shape_config.notch_width_ft !== undefined) {
        configChanges.push(`notch width to ${formatDimension(params.new_l_shape_config.notch_width_ft)}`);
      }
      if (params.new_l_shape_config.notch_length_ft !== undefined) {
        configChanges.push(`notch length to ${formatDimension(params.new_l_shape_config.notch_length_ft)}`);
      }
      if (configChanges.length > 0) {
        changes.push(...configChanges);
      }
      
      // Regenerate polygon with new config
      updatedRoom.polygon = generatePolygon(
        updatedRoom.shape,
        updatedRoom.width_ft,
        updatedRoom.length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
    }

    // Handle T-shape configuration updates
    if (params.new_t_shape_config && updatedRoom.shape === 't_shape') {
      const currentConfig = updatedRoom.t_shape_config || {
        stem_wall: 'north' as const,
        stem_width_ft: 6,
        stem_length_ft: 4,
        stem_position_ft: 3,
      };
      const newConfig = {
        ...currentConfig,
        ...params.new_t_shape_config,
      };
      updatedRoom.t_shape_config = newConfig;
      
      const configChanges: string[] = [];
      if (params.new_t_shape_config.stem_wall) {
        configChanges.push(`stem wall to ${params.new_t_shape_config.stem_wall}`);
      }
      if (params.new_t_shape_config.stem_width_ft !== undefined) {
        configChanges.push(`stem width to ${formatDimension(params.new_t_shape_config.stem_width_ft)}`);
      }
      if (params.new_t_shape_config.stem_length_ft !== undefined) {
        configChanges.push(`stem length to ${formatDimension(params.new_t_shape_config.stem_length_ft)}`);
      }
      if (params.new_t_shape_config.stem_position_ft !== undefined) {
        configChanges.push(`stem position to ${formatDimension(params.new_t_shape_config.stem_position_ft)}`);
      }
      if (configChanges.length > 0) {
        changes.push(...configChanges);
      }
      
      // Regenerate polygon with new config
      updatedRoom.polygon = generatePolygon(
        updatedRoom.shape,
        updatedRoom.width_ft,
        updatedRoom.length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
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

    if (params.new_polygon) {
      changes.push(`polygon to custom shape with ${params.new_polygon.length} points`);
      updatedDamageZone.polygon = params.new_polygon;
    }

    if (params.new_is_freeform !== undefined) {
      changes.push(`freeform to ${params.new_is_freeform}`);
      updatedDamageZone.is_freeform = params.new_is_freeform;
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

  deleteDamageZone: (params) => {
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
    } else if (params.type) {
      // Find first damage zone of the type
      damageIndex = currentRoom.damageZones.findIndex(d => d.type === params.type);
      damageZone = damageIndex >= 0 ? currentRoom.damageZones[damageIndex] : null;
    } else if (currentRoom.damageZones.length === 1) {
      // If there's only one damage zone, delete it
      damageIndex = 0;
      damageZone = currentRoom.damageZones[0];
    }

    if (!damageZone || damageIndex < 0) {
      return 'Error: Could not find damage zone to delete. Please specify the damage index, ID, or type.';
    }

    const command: GeometryCommand = {
      id: generateId(),
      type: 'delete_damage',
      params,
      timestamp: new Date().toISOString(),
      result: `Deleted ${damageZone.type} damage zone${damageZone.source ? ` from ${damageZone.source}` : ''}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        damageZones: state.currentRoom!.damageZones.filter((_, i) => i !== damageIndex),
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

  // Object actions
  addObject: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room selected. Please create or select a room first.';

    const now = new Date().toISOString();
    const newObject: SketchObject = {
      id: generateId(),
      name: params.name,
      type: params.type,
      description: params.description,
      width_ft: params.width_ft,
      depth_ft: params.depth_ft,
      height_ft: params.height_ft,
      position: params.wall ? { wall: params.wall } : undefined,
      condition: params.condition,
      damageNotes: params.damageNotes,
      photos: [],
      created_at: now,
      updated_at: now,
    };

    const command: GeometryCommand = {
      id: generateId(),
      type: 'add_object',
      params,
      timestamp: now,
      result: `Added ${params.type}: ${params.name}`,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        objects: [...state.currentRoom!.objects, newObject],
        updated_at: now,
      },
      commandHistory: [...state.commandHistory, command],
    }));

    return command.result;
  },

  editObject: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room selected.';

    const objectIndex = currentRoom.objects.findIndex(
      (o) => o.id === params.object_id || o.name.toLowerCase() === params.object_name?.toLowerCase()
    );

    if (objectIndex === -1) return 'Error: Object not found.';

    const now = new Date().toISOString();
    const updatedObject = {
      ...currentRoom.objects[objectIndex],
      ...(params.new_name && { name: params.new_name }),
      ...(params.new_type && { type: params.new_type }),
      ...(params.new_condition && { condition: params.new_condition }),
      ...(params.new_damageNotes && { damageNotes: params.new_damageNotes }),
      updated_at: now,
    };

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        objects: state.currentRoom!.objects.map((o, i) => i === objectIndex ? updatedObject : o),
        updated_at: now,
      },
    }));

    return `Updated object: ${updatedObject.name}`;
  },

  deleteObject: (params) => {
    const { currentRoom } = get();
    if (!currentRoom) return 'Error: No room selected.';

    const objectIndex = currentRoom.objects.findIndex(
      (o) => o.id === params.object_id || o.name.toLowerCase() === params.object_name?.toLowerCase()
    );

    if (objectIndex === -1) return 'Error: Object not found.';

    const deletedObject = currentRoom.objects[objectIndex];
    const now = new Date().toISOString();

    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        objects: state.currentRoom!.objects.filter((_, i) => i !== objectIndex),
        updated_at: now,
      },
    }));

    return `Deleted object: ${deletedObject.name}`;
  },

  // ============================================
  // WALL-FIRST EDITING ACTIONS
  // ============================================

  selectWall: (params) => {
    const { currentRoom, rooms } = get();
    
    // Find target room
    let targetRoom = currentRoom;
    if (params.room_name) {
      targetRoom = rooms.find(r => r.name.toLowerCase() === params.room_name!.toLowerCase()) || currentRoom;
    }
    
    if (!targetRoom) {
      return 'Error: No room selected. Please create or select a room first.';
    }
    
    // Map wall reference to direction
    const directionMap: Record<string, WallDirection> = {
      north: 'north',
      south: 'south', 
      east: 'east',
      west: 'west',
    };
    
    let wallId: string;
    let wallDirection: string;
    
    if (params.reference === 'nearest') {
      // For nearest, default to north wall
      wallId = `${targetRoom.id}_wall_north`;
      wallDirection = 'north';
    } else if (params.reference.startsWith('wall_')) {
      // Index-based selection
      const index = parseInt(params.reference.replace('wall_', ''), 10);
      const walls = ['north', 'east', 'south', 'west'];
      wallDirection = walls[index % 4];
      wallId = `${targetRoom.id}_wall_${wallDirection}`;
    } else if (directionMap[params.reference]) {
      // Direction-based selection
      wallDirection = params.reference;
      wallId = `${targetRoom.id}_wall_${wallDirection}`;
    } else {
      return `Error: Invalid wall reference "${params.reference}". Use north, south, east, west, nearest, or wall_N.`;
    }
    
    set({ selectedWallId: wallId });
    
    const command: GeometryCommand = {
      id: generateId(),
      type: 'select_wall',
      params,
      timestamp: new Date().toISOString(),
      result: `Selected ${wallDirection} wall of ${formatRoomName(targetRoom.name)}`,
    };
    
    set((state) => ({
      commandHistory: [...state.commandHistory, command],
    }));
    
    return command.result;
  },

  updateWallProperties: (params) => {
    const { currentRoom, selectedWallId } = get();
    
    if (!currentRoom) {
      return 'Error: No room selected. Please create or select a room first.';
    }
    
    // Determine which wall to update
    let wallDirection: WallDirection | null = null;
    
    if (params.reference) {
      const directionMap: Record<string, WallDirection> = {
        north: 'north', south: 'south', east: 'east', west: 'west',
      };
      if (directionMap[params.reference]) {
        wallDirection = directionMap[params.reference];
      } else if (params.reference.startsWith('wall_')) {
        const index = parseInt(params.reference.replace('wall_', ''), 10);
        const walls: WallDirection[] = ['north', 'east', 'south', 'west'];
        wallDirection = walls[index % 4];
      }
    } else if (selectedWallId) {
      // Extract direction from selectedWallId format: roomId_wall_direction
      const match = selectedWallId.match(/_wall_(north|south|east|west)$/);
      if (match) {
        wallDirection = match[1] as WallDirection;
      }
    }
    
    if (!wallDirection) {
      return 'Error: No wall selected. Use select_wall first or provide a wall reference.';
    }
    
    const changes: string[] = [];
    let updatedRoom = { ...currentRoom, updated_at: new Date().toISOString() };
    
    // Handle length change - affects room dimensions
    if (params.length_ft !== undefined) {
      if (wallDirection === 'north' || wallDirection === 'south') {
        updatedRoom.width_ft = params.length_ft;
        changes.push(`width to ${formatDimension(params.length_ft)}`);
      } else {
        updatedRoom.length_ft = params.length_ft;
        changes.push(`length to ${formatDimension(params.length_ft)}`);
      }
      // Regenerate polygon
      updatedRoom.polygon = generatePolygon(
        updatedRoom.shape,
        updatedRoom.width_ft,
        updatedRoom.length_ft,
        updatedRoom.l_shape_config,
        updatedRoom.t_shape_config
      );
    }
    
    // Handle height change
    if (params.height_ft !== undefined) {
      updatedRoom.ceiling_height_ft = params.height_ft;
      changes.push(`${wallDirection} wall height to ${formatDimension(params.height_ft)}`);
    }
    
    // Handle exterior/missing status via notes
    if (params.is_exterior !== undefined) {
      const noteText = params.is_exterior 
        ? `${wallDirection} wall marked as exterior`
        : `${wallDirection} wall marked as interior`;
      const existingNote = updatedRoom.notes.find(n => n.target === `wall_${wallDirection}`);
      if (existingNote) {
        existingNote.note = noteText;
      } else {
        updatedRoom.notes.push({
          id: generateId(),
          target: `wall_${wallDirection}`,
          note: noteText,
          created_at: new Date().toISOString(),
        });
      }
      changes.push(params.is_exterior ? `${wallDirection} wall set to exterior` : `${wallDirection} wall set to interior`);
    }
    
    if (params.is_missing !== undefined) {
      const noteText = params.is_missing
        ? `${wallDirection} wall marked as missing/open`
        : `${wallDirection} wall marked as present`;
      const existingNote = updatedRoom.notes.find(n => n.target === `wall_${wallDirection}_missing`);
      if (existingNote) {
        existingNote.note = noteText;
      } else {
        updatedRoom.notes.push({
          id: generateId(),
          target: `wall_${wallDirection}_missing`,
          note: noteText,
          created_at: new Date().toISOString(),
        });
      }
      changes.push(params.is_missing ? `${wallDirection} wall marked as missing` : `${wallDirection} wall marked as present`);
    }
    
    if (changes.length === 0) {
      return 'No changes specified. Provide length_ft, height_ft, is_exterior, or is_missing.';
    }
    
    const command: GeometryCommand = {
      id: generateId(),
      type: 'update_wall',
      params,
      timestamp: new Date().toISOString(),
      result: `Updated ${wallDirection} wall: ${changes.join(', ')}`,
    };
    
    set((state) => ({
      currentRoom: updatedRoom,
      undoStack: [...state.undoStack, state.currentRoom!],
      commandHistory: [...state.commandHistory, command],
    }));
    
    return command.result;
  },

  moveWall: (params) => {
    const { currentRoom, selectedWallId } = get();
    
    if (!currentRoom) {
      return 'Error: No room selected. Please create or select a room first.';
    }
    
    // Determine which wall to move
    let wallDirection: WallDirection | null = null;
    
    if (params.reference) {
      const directionMap: Record<string, WallDirection> = {
        north: 'north', south: 'south', east: 'east', west: 'west',
      };
      if (directionMap[params.reference]) {
        wallDirection = directionMap[params.reference];
      } else if (params.reference.startsWith('wall_')) {
        const index = parseInt(params.reference.replace('wall_', ''), 10);
        const walls: WallDirection[] = ['north', 'east', 'south', 'west'];
        wallDirection = walls[index % 4];
      }
    } else if (selectedWallId) {
      const match = selectedWallId.match(/_wall_(north|south|east|west)$/);
      if (match) {
        wallDirection = match[1] as WallDirection;
      }
    }
    
    if (!wallDirection) {
      return 'Error: No wall selected. Use select_wall first or provide a wall reference.';
    }
    
    // Calculate dimension change based on direction
    let updatedRoom = { ...currentRoom, updated_at: new Date().toISOString() };
    let offset = params.offset_ft;
    
    // Adjust offset sign based on move direction
    if (params.direction === 'in') {
      offset = -Math.abs(offset);
    } else if (params.direction === 'out') {
      offset = Math.abs(offset);
    } else if (params.direction === 'left') {
      offset = -Math.abs(offset);
    } else if (params.direction === 'right') {
      offset = Math.abs(offset);
    }
    
    // Apply offset to room dimensions
    if (wallDirection === 'north' || wallDirection === 'south') {
      // North/South walls affect room length
      updatedRoom.length_ft = Math.max(2, updatedRoom.length_ft + offset);
    } else {
      // East/West walls affect room width
      updatedRoom.width_ft = Math.max(2, updatedRoom.width_ft + offset);
    }
    
    // Regenerate polygon
    updatedRoom.polygon = generatePolygon(
      updatedRoom.shape,
      updatedRoom.width_ft,
      updatedRoom.length_ft,
      updatedRoom.l_shape_config,
      updatedRoom.t_shape_config
    );
    
    const command: GeometryCommand = {
      id: generateId(),
      type: 'move_wall',
      params,
      timestamp: new Date().toISOString(),
      result: `Moved ${wallDirection} wall ${Math.abs(params.offset_ft)}ft ${params.direction}. Room is now ${formatDimension(updatedRoom.width_ft)} × ${formatDimension(updatedRoom.length_ft)}.`,
    };
    
    set((state) => ({
      currentRoom: updatedRoom,
      undoStack: [...state.undoStack, state.currentRoom!],
      commandHistory: [...state.commandHistory, command],
    }));
    
    return command.result;
  },

  updateOpening: (params) => {
    const { currentRoom } = get();
    
    if (!currentRoom) {
      return 'Error: No room selected. Please create or select a room first.';
    }
    
    // Find the opening to update
    let openingIndex = -1;
    let opening: Opening | null = null;
    
    if (params.opening_id) {
      openingIndex = currentRoom.openings.findIndex(o => o.id === params.opening_id);
      opening = openingIndex >= 0 ? currentRoom.openings[openingIndex] : null;
    } else if (params.wall) {
      // Find by wall and optionally index
      const wallOpenings = currentRoom.openings
        .map((o, i) => ({ opening: o, index: i }))
        .filter(item => item.opening.wall === params.wall);
      
      if (wallOpenings.length === 0) {
        return `Error: No openings found on ${params.wall} wall.`;
      }
      
      const targetIndex = params.opening_index ?? 0;
      if (targetIndex >= wallOpenings.length) {
        return `Error: Opening index ${targetIndex} out of range. ${params.wall} wall has ${wallOpenings.length} opening(s).`;
      }
      
      openingIndex = wallOpenings[targetIndex].index;
      opening = wallOpenings[targetIndex].opening;
    } else {
      return 'Error: Specify opening_id or wall to identify the opening.';
    }
    
    if (!opening || openingIndex < 0) {
      return 'Error: Opening not found.';
    }
    
    const changes: string[] = [];
    let updatedOpening = { ...opening };
    
    if (params.width_ft !== undefined) {
      changes.push(`width to ${formatDimension(params.width_ft)}`);
      updatedOpening.width_ft = params.width_ft;
    }
    
    if (params.height_ft !== undefined) {
      changes.push(`height to ${formatDimension(params.height_ft)}`);
      updatedOpening.height_ft = params.height_ft;
    }
    
    if (params.sill_height_ft !== undefined) {
      changes.push(`sill height to ${formatDimension(params.sill_height_ft)}`);
      updatedOpening.sill_height_ft = params.sill_height_ft;
    }
    
    if (params.type) {
      changes.push(`type to ${params.type}`);
      updatedOpening.type = params.type;
    }
    
    if (changes.length === 0) {
      return 'No changes specified. Provide width_ft, height_ft, sill_height_ft, or type.';
    }
    
    const command: GeometryCommand = {
      id: generateId(),
      type: 'update_opening',
      params,
      timestamp: new Date().toISOString(),
      result: `Updated ${opening.type} on ${opening.wall} wall: ${changes.join(', ')}`,
    };
    
    set((state) => ({
      currentRoom: {
        ...state.currentRoom!,
        openings: state.currentRoom!.openings.map((o, i) => i === openingIndex ? updatedOpening : o),
        updated_at: new Date().toISOString(),
      },
      undoStack: [...state.undoStack, state.currentRoom!],
      commandHistory: [...state.commandHistory, command],
    }));
    
    return command.result;
  },

  // Photo actions
  capturePhoto: async (params, file) => {
    const { currentStructure, currentRoom } = get();
    const now = new Date().toISOString();

    // Build hierarchy path
    const pathParts: string[] = [];
    if (currentStructure) pathParts.push(currentStructure.name);
    if (currentRoom) pathParts.push(currentRoom.name);
    const hierarchyPath = pathParts.length > 0 ? pathParts.join(' > ') : 'Exterior';

    // Auto-label from context
    const autoLabel = currentRoom?.name || currentStructure?.name || 'Exterior';

    const newPhoto: SketchPhoto = {
      id: generateId(),
      label: params.label || autoLabel,
      autoLabel,
      hierarchyPath,
      structureId: currentStructure?.id,
      roomId: currentRoom?.id,
      capturedAt: now,
    };

    // Add to photos array
    set((state) => ({
      photos: [...state.photos, newPhoto],
    }));

    // If in a room, add to room's photos
    if (currentRoom) {
      set((state) => ({
        currentRoom: state.currentRoom ? {
          ...state.currentRoom,
          photos: [...state.currentRoom.photos, newPhoto],
          updated_at: now,
        } : null,
      }));
    }

    return `Photo captured: ${newPhoto.label} (${hierarchyPath})`;
  },

  addPhoto: (photo) => {
    set((state) => {
      const now = new Date().toISOString();
      
      let updatedStructures = state.structures;
      let updatedCurrentStructure = state.currentStructure;
      let updatedCurrentRoom = state.currentRoom;
      let updatedRooms = state.rooms;
      
      if (photo.structureId) {
        updatedStructures = state.structures.map((s) => {
          if (s.id === photo.structureId) {
            let updatedStructure: Structure;
            
            if (photo.roomId) {
              updatedStructure = {
                ...s,
                rooms: s.rooms.map((r) => 
                  r.id === photo.roomId 
                    ? { ...r, photos: [...r.photos, photo], updated_at: now }
                    : r
                ),
                updated_at: now,
              };
            } else {
              updatedStructure = {
                ...s,
                photos: [...s.photos, photo],
                updated_at: now,
              };
            }
            
            if (state.currentStructure?.id === s.id) {
              updatedCurrentStructure = updatedStructure;
            }
            return updatedStructure;
          }
          return s;
        });
      }
      
      if (photo.roomId && state.currentRoom?.id === photo.roomId) {
        updatedCurrentRoom = {
          ...state.currentRoom,
          photos: [...state.currentRoom.photos, photo],
          updated_at: now,
        };
      }
      
      if (photo.roomId) {
        updatedRooms = state.rooms.map((r) =>
          r.id === photo.roomId
            ? { ...r, photos: [...r.photos, photo], updated_at: now }
            : r
        );
      }
      
      return {
        photos: [...state.photos, photo],
        structures: updatedStructures,
        currentStructure: updatedCurrentStructure,
        currentRoom: updatedCurrentRoom,
        rooms: updatedRooms,
      };
    });
  },

  updatePhotoAnalysis: (photoId, analysis) => {
    set((state) => ({
      photos: state.photos.map((p) => 
        p.id === photoId ? { ...p, aiAnalysis: analysis } : p
      ),
    }));
  },

  // Hierarchy helpers
  getCurrentHierarchyPath: () => {
    const { currentStructure, currentRoom } = get();
    const pathParts: string[] = [];
    if (currentStructure) pathParts.push(currentStructure.name);
    if (currentRoom) {
      if (currentRoom.parentRoomId) {
        // Find parent room name
        const parentRoom = get().rooms.find((r) => r.id === currentRoom.parentRoomId);
        if (parentRoom) pathParts.push(parentRoom.name);
      }
      pathParts.push(currentRoom.name);
    }
    return pathParts.length > 0 ? pathParts.join(' > ') : 'Exterior';
  },

  getHierarchyContext: () => {
    const { currentStructure, currentRoom } = get();
    return {
      structureId: currentStructure?.id,
      roomId: currentRoom?.parentRoomId ? currentRoom.parentRoomId : currentRoom?.id,
      subRoomId: currentRoom?.parentRoomId ? currentRoom.id : undefined,
    };
  },

  resetSession: () => {
    set({
      loadedForClaimId: null,
      structures: [],
      currentStructure: null,
      currentRoom: null,
      rooms: [],
      photos: [],
      commandHistory: [],
      undoStack: [],
      transcript: [],
      sessionState: initialSessionState,
    });
  },
  
  resetAndLoadForClaim: (claimId: string, rooms: RoomGeometry[]) => {
    // Reset all state and load rooms for the specified claim
    // This handles cross-claim navigation by tracking which claim was loaded
    set({
      loadedForClaimId: claimId,
      structures: [],
      currentStructure: null,
      currentRoom: null,
      rooms: rooms,
      photos: [],
      commandHistory: [],
      undoStack: [],
      transcript: [],
      sessionState: initialSessionState,
    });
  },

  loadFromClaimData: (structures: Structure[], rooms: RoomGeometry[]) => {
    // Reset current session state and load existing claim data
    set({
      structures,
      rooms,
      currentStructure: structures.length > 0 ? structures[0] : null,
      currentRoom: null,
      photos: [],
      commandHistory: [{
        id: generateId(),
        type: 'load_claim',
        params: { structureCount: structures.length, roomCount: rooms.length },
        timestamp: new Date().toISOString(),
        result: `Loaded ${structures.length} structure(s) and ${rooms.length} room(s) from saved claim`,
      }],
      undoStack: [],
      transcript: [],
      sessionState: initialSessionState,
    });
  },

  loadRooms: (rooms: RoomGeometry[]) => {
    set({
      structures: [],
      currentStructure: null,
      currentRoom: null,
      rooms: rooms,
      photos: [],
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
  // Structure actions
  createStructure: (params: CreateStructureParams) => useGeometryEngine.getState().createStructure(params),
  editStructure: (params: EditStructureParams) => useGeometryEngine.getState().editStructure(params),
  deleteStructure: (params: DeleteStructureParams) => useGeometryEngine.getState().deleteStructure(params),
  selectStructure: (params: SelectStructureParams) => useGeometryEngine.getState().selectStructure(params),
  // Room actions
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
  deleteDamageZone: (params: DeleteDamageZoneParams) => useGeometryEngine.getState().deleteDamageZone(params),
  // Object actions
  addObject: (params: AddObjectParams) => useGeometryEngine.getState().addObject(params),
  editObject: (params: EditObjectParams) => useGeometryEngine.getState().editObject(params),
  deleteObject: (params: DeleteObjectParams) => useGeometryEngine.getState().deleteObject(params),
  // Wall-first editing actions
  selectWall: (params: SelectWallParams) => useGeometryEngine.getState().selectWall(params),
  updateWallProperties: (params: UpdateWallPropertiesParams) => useGeometryEngine.getState().updateWallProperties(params),
  moveWall: (params: MoveWallParams) => useGeometryEngine.getState().moveWall(params),
  updateOpening: (params: UpdateOpeningParams) => useGeometryEngine.getState().updateOpening(params),
  // Photo actions
  capturePhoto: (params: CapturePhotoParams, file?: File) => useGeometryEngine.getState().capturePhoto(params, file),
  // Helpers
  getRoomByName: (name: string) => {
    const state = useGeometryEngine.getState();
    if (state.currentRoom?.name === name) {
      return state.currentRoom;
    }
    return state.rooms.find(r => r.name === name) ?? null;
  },
  getCurrentHierarchyPath: () => useGeometryEngine.getState().getCurrentHierarchyPath(),
  getHierarchyContext: () => useGeometryEngine.getState().getHierarchyContext(),
  loadFromClaimData: (structures: Structure[], rooms: RoomGeometry[]) =>
    useGeometryEngine.getState().loadFromClaimData(structures, rooms),
  resetSession: () => useGeometryEngine.getState().resetSession(),
};
