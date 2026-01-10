// Wall Store - Zustand store for wall-first sketch editing
// Manages wall selection, editing state, and undo/redo history

import { create } from 'zustand';
import type {
  WallEntity,
  WallEditOperation,
  WallType,
  RoomGeometry,
  Point,
} from '../types/geometry';
import {
  generateId,
  extractAllWalls,
  pointNearWall,
  moveWallPerpendicular,
  calculateWallMoveConstraints,
  snapToGrid,
  formatDimension,
} from '../utils/polygon-math';

// Tool modes for the sketch canvas
export type SketchToolMode = 'select' | 'move_wall' | 'draw_room' | 'pan';

interface WallStoreState {
  // Derived wall entities from rooms
  walls: WallEntity[];

  // Selection state
  selectedWallIds: string[];
  hoveredWallId: string | null;
  isMultiSelect: boolean;

  // Tool state
  toolMode: SketchToolMode;

  // Edit history for undo/redo
  undoStack: WallEditOperation[];
  redoStack: WallEditOperation[];

  // Move wall state
  isDraggingWall: boolean;
  dragStartPosition: Point | null;
  dragWallId: string | null;

  // Actions
  // Wall derivation
  deriveWallsFromRooms: (rooms: RoomGeometry[]) => void;

  // Selection actions
  selectWall: (wallId: string, isShiftClick: boolean) => void;
  selectWalls: (wallIds: string[]) => void;
  deselectAll: () => void;
  setHoveredWall: (wallId: string | null) => void;

  // Tool actions
  setToolMode: (mode: SketchToolMode) => void;

  // Wall editing actions
  updateWallLength: (wallId: string, newLength: number, rooms: RoomGeometry[]) => RoomGeometry[];
  updateWallHeight: (wallId: string, newHeight: number) => void;
  updateWallType: (wallId: string, newType: WallType) => void;
  moveWall: (wallId: string, deltaFt: number, rooms: RoomGeometry[]) => RoomGeometry[];

  // Drag actions
  startWallDrag: (wallId: string, startPosition: Point) => void;
  updateWallDrag: (currentPosition: Point, rooms: RoomGeometry[]) => RoomGeometry[] | null;
  endWallDrag: () => void;

  // Undo/Redo actions
  undo: (rooms: RoomGeometry[]) => RoomGeometry[] | null;
  redo: (rooms: RoomGeometry[]) => RoomGeometry[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushUndoOperation: (operation: WallEditOperation) => void;
  clearHistory: () => void;

  // Hit testing
  findWallAtPoint: (point: Point, scale: number, tolerance?: number) => WallEntity | null;

  // Getters
  getSelectedWalls: () => WallEntity[];
  getWallById: (wallId: string) => WallEntity | undefined;

  // Reset
  reset: () => void;
}

const initialState = {
  walls: [],
  selectedWallIds: [],
  hoveredWallId: null,
  isMultiSelect: false,
  toolMode: 'select' as SketchToolMode,
  undoStack: [],
  redoStack: [],
  isDraggingWall: false,
  dragStartPosition: null,
  dragWallId: null,
};

export const useWallStore = create<WallStoreState>((set, get) => ({
  ...initialState,

  // Derive walls from room polygons
  deriveWallsFromRooms: (rooms) => {
    const walls = extractAllWalls(rooms);
    set({ walls });
  },

  // Selection actions
  selectWall: (wallId, isShiftClick) => {
    set((state) => {
      if (isShiftClick) {
        // Multi-select: toggle wall in selection
        const newSelection = state.selectedWallIds.includes(wallId)
          ? state.selectedWallIds.filter(id => id !== wallId)
          : [...state.selectedWallIds, wallId];
        return { selectedWallIds: newSelection, isMultiSelect: true };
      } else {
        // Single select: replace selection
        return { selectedWallIds: [wallId], isMultiSelect: false };
      }
    });
  },

  selectWalls: (wallIds) => {
    set({ selectedWallIds: wallIds, isMultiSelect: wallIds.length > 1 });
  },

  deselectAll: () => {
    set({ selectedWallIds: [], isMultiSelect: false });
  },

  setHoveredWall: (wallId) => {
    set({ hoveredWallId: wallId });
  },

  // Tool actions
  setToolMode: (mode) => {
    set({ toolMode: mode });
    // Clear selection when switching to non-select mode
    if (mode !== 'select' && mode !== 'move_wall') {
      set({ selectedWallIds: [], isMultiSelect: false });
    }
  },

  // Wall editing actions
  updateWallLength: (wallId, newLength, rooms) => {
    const wall = get().walls.find(w => w.id === wallId);
    if (!wall) return rooms;

    const previousLength = wall.length_ft;
    const deltaLength = newLength - previousLength;

    // Create undo operation
    const operation: WallEditOperation = {
      id: generateId(),
      type: 'resize',
      wallId,
      previousState: { length_ft: previousLength },
      newState: { length_ft: newLength },
      affectedRoomIds: wall.roomIds,
      timestamp: new Date().toISOString(),
    };

    get().pushUndoOperation(operation);

    // Update wall in store
    set((state) => ({
      walls: state.walls.map(w =>
        w.id === wallId
          ? { ...w, length_ft: newLength, updated_at: new Date().toISOString() }
          : w
      ),
    }));

    // Update room dimensions (simplified - in real implementation would adjust polygon)
    const updatedRooms = rooms.map(room => {
      if (!wall.roomIds.includes(room.id)) return room;

      // Adjust room dimensions based on wall orientation
      const adjustedRoom = { ...room, updated_at: new Date().toISOString() };
      if (wall.orientation === 'horizontal') {
        // Horizontal wall affects room width
        adjustedRoom.width_ft = Math.max(2, adjustedRoom.width_ft + deltaLength);
      } else {
        // Vertical wall affects room length
        adjustedRoom.length_ft = Math.max(2, adjustedRoom.length_ft + deltaLength);
      }
      return adjustedRoom;
    });

    return updatedRooms;
  },

  updateWallHeight: (wallId, newHeight) => {
    const wall = get().walls.find(w => w.id === wallId);
    if (!wall) return;

    const operation: WallEditOperation = {
      id: generateId(),
      type: 'change_height',
      wallId,
      previousState: { height_ft: wall.height_ft },
      newState: { height_ft: newHeight },
      affectedRoomIds: wall.roomIds,
      timestamp: new Date().toISOString(),
    };

    get().pushUndoOperation(operation);

    set((state) => ({
      walls: state.walls.map(w =>
        w.id === wallId
          ? { ...w, height_ft: newHeight, updated_at: new Date().toISOString() }
          : w
      ),
    }));
  },

  updateWallType: (wallId, newType) => {
    const wall = get().walls.find(w => w.id === wallId);
    if (!wall) return;

    const operation: WallEditOperation = {
      id: generateId(),
      type: 'toggle_type',
      wallId,
      previousState: { type: wall.type },
      newState: { type: newType },
      affectedRoomIds: wall.roomIds,
      timestamp: new Date().toISOString(),
    };

    get().pushUndoOperation(operation);

    set((state) => ({
      walls: state.walls.map(w =>
        w.id === wallId
          ? { ...w, type: newType, updated_at: new Date().toISOString() }
          : w
      ),
    }));
  },

  moveWall: (wallId, deltaFt, rooms) => {
    const wall = get().walls.find(w => w.id === wallId);
    if (!wall) return rooms;

    // Calculate constraints
    const constraints = calculateWallMoveConstraints(wall, rooms);
    const currentPos = wall.orientation === 'horizontal'
      ? wall.startPoint.y
      : wall.startPoint.x;
    const newPos = snapToGrid(currentPos + deltaFt);
    const clampedPos = Math.max(constraints.min, Math.min(constraints.max, newPos));
    const actualDelta = clampedPos - currentPos;

    if (Math.abs(actualDelta) < 0.01) return rooms;

    // Create undo operation
    const operation: WallEditOperation = {
      id: generateId(),
      type: 'move',
      wallId,
      previousState: {
        startPoint: { ...wall.startPoint },
        endPoint: { ...wall.endPoint },
      },
      newState: {
        startPoint: wall.orientation === 'horizontal'
          ? { x: wall.startPoint.x, y: clampedPos }
          : { x: clampedPos, y: wall.startPoint.y },
        endPoint: wall.orientation === 'horizontal'
          ? { x: wall.endPoint.x, y: clampedPos }
          : { x: clampedPos, y: wall.endPoint.y },
      },
      affectedRoomIds: wall.roomIds,
      timestamp: new Date().toISOString(),
    };

    get().pushUndoOperation(operation);

    // Perform the move
    const { updatedWall, updatedRooms } = moveWallPerpendicular(wall, actualDelta, rooms);

    // Update walls in store
    set((state) => ({
      walls: state.walls.map(w => w.id === wallId ? updatedWall : w),
    }));

    return updatedRooms;
  },

  // Drag actions
  startWallDrag: (wallId, startPosition) => {
    set({
      isDraggingWall: true,
      dragStartPosition: startPosition,
      dragWallId: wallId,
    });
  },

  updateWallDrag: (currentPosition, rooms) => {
    const { isDraggingWall, dragStartPosition, dragWallId, walls } = get();
    if (!isDraggingWall || !dragStartPosition || !dragWallId) return null;

    const wall = walls.find(w => w.id === dragWallId);
    if (!wall) return null;

    // Calculate delta in the perpendicular direction
    let delta: number;
    if (wall.orientation === 'horizontal') {
      delta = currentPosition.y - dragStartPosition.y;
    } else {
      delta = currentPosition.x - dragStartPosition.x;
    }

    // Snap to half-foot grid
    delta = snapToGrid(delta);

    if (Math.abs(delta) < 0.25) return null;

    // Update drag start for next iteration
    set({ dragStartPosition: currentPosition });

    // Move the wall
    return get().moveWall(dragWallId, delta, rooms);
  },

  endWallDrag: () => {
    set({
      isDraggingWall: false,
      dragStartPosition: null,
      dragWallId: null,
    });
  },

  // Undo/Redo
  pushUndoOperation: (operation) => {
    set((state) => ({
      undoStack: [...state.undoStack, operation],
      redoStack: [], // Clear redo stack on new operation
    }));
  },

  undo: (rooms) => {
    const { undoStack, walls } = get();
    if (undoStack.length === 0) return null;

    const operation = undoStack[undoStack.length - 1];
    const wall = walls.find(w => w.id === operation.wallId);
    if (!wall) return null;

    // Apply reverse operation to wall
    const restoredWall = {
      ...wall,
      ...operation.previousState,
      updated_at: new Date().toISOString(),
    };

    // Update rooms if this was a move/resize operation
    let updatedRooms = rooms;
    if (operation.type === 'move' && operation.previousState.startPoint) {
      const prevStart = operation.previousState.startPoint as Point;
      const currentStart = wall.startPoint;
      const deltaX = prevStart.x - currentStart.x;
      const deltaY = prevStart.y - currentStart.y;
      const delta = wall.orientation === 'horizontal' ? deltaY : deltaX;

      if (Math.abs(delta) > 0.01) {
        const result = moveWallPerpendicular(wall, delta, rooms);
        updatedRooms = result.updatedRooms;
      }
    }

    set((state) => ({
      walls: state.walls.map(w => w.id === operation.wallId ? restoredWall : w),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, operation],
    }));

    return updatedRooms;
  },

  redo: (rooms) => {
    const { redoStack, walls } = get();
    if (redoStack.length === 0) return null;

    const operation = redoStack[redoStack.length - 1];
    const wall = walls.find(w => w.id === operation.wallId);
    if (!wall) return null;

    // Apply forward operation to wall
    const restoredWall = {
      ...wall,
      ...operation.newState,
      updated_at: new Date().toISOString(),
    };

    // Update rooms if this was a move/resize operation
    let updatedRooms = rooms;
    if (operation.type === 'move' && operation.newState.startPoint) {
      const newStart = operation.newState.startPoint as Point;
      const currentStart = wall.startPoint;
      const deltaX = newStart.x - currentStart.x;
      const deltaY = newStart.y - currentStart.y;
      const delta = wall.orientation === 'horizontal' ? deltaY : deltaX;

      if (Math.abs(delta) > 0.01) {
        const result = moveWallPerpendicular(wall, delta, rooms);
        updatedRooms = result.updatedRooms;
      }
    }

    set((state) => ({
      walls: state.walls.map(w => w.id === operation.wallId ? restoredWall : w),
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, operation],
    }));

    return updatedRooms;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearHistory: () => {
    set({ undoStack: [], redoStack: [] });
  },

  // Hit testing
  findWallAtPoint: (point, scale, tolerance = 10) => {
    const { walls } = get();
    for (const wall of walls) {
      if (pointNearWall(point, wall, tolerance, scale)) {
        return wall;
      }
    }
    return null;
  },

  // Getters
  getSelectedWalls: () => {
    const { walls, selectedWallIds } = get();
    return walls.filter(w => selectedWallIds.includes(w.id));
  },

  getWallById: (wallId) => {
    return get().walls.find(w => w.id === wallId);
  },

  // Reset
  reset: () => {
    set(initialState);
  },
}));

// Singleton export for non-React contexts
export const wallStore = {
  get state() {
    return useWallStore.getState();
  },
  deriveWallsFromRooms: (rooms: RoomGeometry[]) =>
    useWallStore.getState().deriveWallsFromRooms(rooms),
  selectWall: (wallId: string, isShiftClick: boolean) =>
    useWallStore.getState().selectWall(wallId, isShiftClick),
  deselectAll: () => useWallStore.getState().deselectAll(),
  setToolMode: (mode: SketchToolMode) =>
    useWallStore.getState().setToolMode(mode),
  undo: (rooms: RoomGeometry[]) => useWallStore.getState().undo(rooms),
  redo: (rooms: RoomGeometry[]) => useWallStore.getState().redo(rooms),
  reset: () => useWallStore.getState().reset(),
};
