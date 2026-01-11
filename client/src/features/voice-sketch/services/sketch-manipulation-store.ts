// Sketch Manipulation Store
// Zustand store for advanced sketch interactions: room manipulation, multi-select, snapping
// This completes professional sketch UX parity with Verisk/Xactimate

import { create } from 'zustand';
import type {
  RoomGeometry,
  Opening,
  Point,
  WallDirection,
  WallEntity,
} from '../types/geometry';
import {
  generateId,
  generatePolygon,
  getPolygonBounds,
  snapToGrid,
  distanceBetweenPoints,
  calculatePositionInFeet,
  getWallLength,
  calculatePolygonArea,
} from '../utils/polygon-math';

// ============================================
// TYPE DEFINITIONS
// ============================================

export type SketchToolMode =
  | 'select'           // Default: click to select rooms/walls/openings
  | 'pan'              // Pan the canvas
  | 'move_room'        // Drag room to move
  | 'move_wall'        // Drag wall perpendicular
  | 'move_opening'     // Drag opening along wall
  | 'draw_room'        // Draw new room/polygon
  | 'draw_door'        // Click on wall to add door
  | 'draw_window'      // Click on wall to add window
  | 'rotate_room';     // Rotate selected room

// Zone types for the zone type dropdown
export type ZoneType = 'room' | 'garage' | 'porch' | 'deck' | 'structure';

export type SelectableEntityType = 'room' | 'wall' | 'opening' | 'feature';

export interface SelectedEntity {
  type: SelectableEntityType;
  id: string;
  roomId: string;
  wallDirection?: WallDirection;  // For walls and openings
  index?: number;                  // For openings/features by index
}

export interface AlignmentGuide {
  id: string;
  type: 'horizontal' | 'vertical' | 'parallel' | 'collinear';
  position: number;               // X for vertical, Y for horizontal
  start: Point;
  end: Point;
  sourceEntityId: string;
  targetEntityId: string;
}

export interface SnapResult {
  snappedPoint: Point;
  guides: AlignmentGuide[];
  snappedToGrid: boolean;
  snappedToEntity: boolean;
}

export interface RoomManipulationOperation {
  id: string;
  type: 'move' | 'rotate' | 'copy' | 'delete';
  roomId: string;
  previousState: Partial<RoomGeometry>;
  newState: Partial<RoomGeometry>;
  timestamp: string;
}

export interface OpeningManipulationOperation {
  id: string;
  type: 'move' | 'resize' | 'delete';
  roomId: string;
  openingId: string;
  previousState: Partial<Opening>;
  newState: Partial<Opening>;
  timestamp: string;
}

export interface BatchOperation {
  id: string;
  type: 'align' | 'equalize_lengths' | 'distribute';
  entityIds: string[];
  axis?: 'horizontal' | 'vertical';
  timestamp: string;
}

export interface SketchCompletenessIssue {
  type: 'missing_ceiling_height' | 'missing_wall' | 'no_openings' | 'no_dimensions';
  roomId: string;
  roomName: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface WallStatus {
  wallId: string;
  roomId: string;
  direction: WallDirection;
  isExterior: boolean;
  isMissing: boolean;
  length_ft: number;
  height_ft: number;
}

// ============================================
// SNAPPING CONFIGURATION
// ============================================

export interface SnappingConfig {
  enabled: boolean;
  gridSize: number;           // Snap to grid (default 0.5 ft)
  gridEnabled: boolean;
  parallelSnapEnabled: boolean;
  parallelSnapThreshold: number;  // Distance threshold for parallel snap (default 0.25 ft)
  collinearSnapEnabled: boolean;
  collinearSnapThreshold: number; // Distance threshold for collinear snap (default 0.25 ft)
  cornerSnapEnabled: boolean;
  cornerSnapThreshold: number;    // Distance threshold for corner snap (default 0.5 ft)
}

const DEFAULT_SNAPPING_CONFIG: SnappingConfig = {
  enabled: true,
  gridSize: 0.5,
  gridEnabled: true,
  parallelSnapEnabled: true,
  parallelSnapThreshold: 0.25,
  collinearSnapEnabled: true,
  collinearSnapThreshold: 0.25,
  cornerSnapEnabled: true,
  cornerSnapThreshold: 0.5,
};

// ============================================
// STORE STATE
// ============================================

interface SketchManipulationState {
  // Selection state
  selectedEntities: SelectedEntity[];
  hoveredEntity: SelectedEntity | null;
  isMultiSelectMode: boolean;  // Shift key held

  // Tool mode
  toolMode: SketchToolMode;

  // Zone type for drawing (Room, Garage, Porch, Deck, Structure)
  selectedZoneType: ZoneType;

  // Drag state
  isDragging: boolean;
  dragStartPoint: Point | null;
  dragCurrentPoint: Point | null;
  dragEntityId: string | null;

  // Alignment guides (rendered during drag)
  activeGuides: AlignmentGuide[];

  // Snapping
  snappingConfig: SnappingConfig;

  // Wall status (exterior/missing tracking)
  wallStatuses: WallStatus[];

  // Undo/Redo for manipulation operations
  undoStack: (RoomManipulationOperation | OpeningManipulationOperation | BatchOperation)[];
  redoStack: (RoomManipulationOperation | OpeningManipulationOperation | BatchOperation)[];

  // Sketch completeness
  completenessIssues: SketchCompletenessIssue[];
  isSketchComplete: boolean;

  // ============================================
  // SELECTION ACTIONS
  // ============================================

  selectEntity: (entity: SelectedEntity, isShiftClick: boolean) => void;
  selectEntities: (entities: SelectedEntity[]) => void;
  deselectAll: () => void;
  setHoveredEntity: (entity: SelectedEntity | null) => void;

  // Room selection by click inside polygon
  selectRoomAtPoint: (point: Point, rooms: RoomGeometry[], isShiftClick: boolean) => RoomGeometry | null;

  // Opening selection
  selectOpeningAtPoint: (point: Point, rooms: RoomGeometry[], scale: number, isShiftClick: boolean) => Opening | null;

  // ============================================
  // TOOL MODE ACTIONS
  // ============================================

  setToolMode: (mode: SketchToolMode) => void;
  setSelectedZoneType: (zoneType: ZoneType) => void;

  // ============================================
  // ROOM MANIPULATION ACTIONS
  // ============================================

  // Move room without distorting walls
  moveRoom: (roomId: string, deltaX: number, deltaY: number, rooms: RoomGeometry[]) => RoomGeometry[];

  // Copy room with offset
  copyRoom: (roomId: string, offsetX: number, offsetY: number, rooms: RoomGeometry[]) => { newRoom: RoomGeometry; updatedRooms: RoomGeometry[] };

  // Rotate room in 90° increments
  rotateRoom: (roomId: string, degrees: 90 | 180 | 270, rooms: RoomGeometry[]) => RoomGeometry[];

  // ============================================
  // OPENING MANIPULATION ACTIONS
  // ============================================

  // Move opening along its wall
  moveOpeningAlongWall: (roomId: string, openingId: string, newPositionFt: number, rooms: RoomGeometry[]) => RoomGeometry[];

  // Update opening dimensions (numeric inputs)
  updateOpeningDimensions: (
    roomId: string,
    openingId: string,
    width?: number,
    height?: number,
    offset?: number,
    rooms?: RoomGeometry[]
  ) => RoomGeometry[];

  // ============================================
  // MULTI-SELECT BATCH OPERATIONS
  // ============================================

  // Align selected rooms/walls
  alignSelected: (axis: 'left' | 'right' | 'top' | 'bottom' | 'center_h' | 'center_v', rooms: RoomGeometry[]) => RoomGeometry[];

  // Equalize wall lengths
  equalizeWallLengths: (targetLength: number | 'average' | 'max' | 'min', rooms: RoomGeometry[]) => RoomGeometry[];

  // Distribute spacing evenly
  distributeSelected: (axis: 'horizontal' | 'vertical', rooms: RoomGeometry[]) => RoomGeometry[];

  // ============================================
  // SNAPPING & ALIGNMENT
  // ============================================

  setSnappingConfig: (config: Partial<SnappingConfig>) => void;

  // Snap a point considering all snap targets
  snapPoint: (point: Point, rooms: RoomGeometry[], excludeRoomId?: string) => SnapResult;

  // Find parallel walls for snapping
  findParallelWalls: (wall: { start: Point; end: Point }, rooms: RoomGeometry[], excludeRoomId?: string) => WallEntity[];

  // Calculate alignment guides
  calculateAlignmentGuides: (dragPoint: Point, rooms: RoomGeometry[], excludeRoomId?: string) => AlignmentGuide[];

  // ============================================
  // EXTERIOR / MISSING WALL MANAGEMENT
  // ============================================

  // Auto-detect exterior walls (walls with single room)
  detectExteriorWalls: (rooms: RoomGeometry[]) => WallStatus[];

  // Toggle wall as missing
  toggleWallMissing: (roomId: string, wallDirection: WallDirection, rooms: RoomGeometry[]) => RoomGeometry[];

  // Toggle wall as exterior
  toggleWallExterior: (roomId: string, wallDirection: WallDirection, rooms: RoomGeometry[]) => RoomGeometry[];

  // Get wall status
  getWallStatus: (roomId: string, wallDirection: WallDirection) => WallStatus | null;

  // ============================================
  // SKETCH COMPLETENESS
  // ============================================

  // Check sketch completeness and return issues
  checkSketchCompleteness: (rooms: RoomGeometry[]) => SketchCompletenessIssue[];

  // Update completeness issues
  updateCompletenessIssues: (rooms: RoomGeometry[]) => void;

  // ============================================
  // DRAG OPERATIONS
  // ============================================

  startDrag: (entityId: string, startPoint: Point) => void;
  updateDrag: (currentPoint: Point, rooms: RoomGeometry[]) => { updatedRooms: RoomGeometry[] | null; guides: AlignmentGuide[] };
  endDrag: () => void;
  cancelDrag: () => void;

  // ============================================
  // UNDO/REDO
  // ============================================

  undo: (rooms: RoomGeometry[]) => RoomGeometry[] | null;
  redo: (rooms: RoomGeometry[]) => RoomGeometry[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushOperation: (operation: RoomManipulationOperation | OpeningManipulationOperation | BatchOperation) => void;

  // ============================================
  // RESET
  // ============================================

  reset: () => void;
}

// ============================================
// GEOMETRY HELPERS
// ============================================

// Check if point is inside polygon using ray casting
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Rotate a point around origin by degrees
function rotatePoint(point: Point, degrees: number, origin: Point = { x: 0, y: 0 }): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

// Get polygon centroid
function getPolygonCentroid(polygon: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / polygon.length, y: cy / polygon.length };
}

// Check if two line segments are parallel
function areSegmentsParallel(s1Start: Point, s1End: Point, s2Start: Point, s2End: Point, threshold: number): boolean {
  const d1x = s1End.x - s1Start.x;
  const d1y = s1End.y - s1Start.y;
  const d2x = s2End.x - s2Start.x;
  const d2y = s2End.y - s2Start.y;

  const cross = Math.abs(d1x * d2y - d1y * d2x);
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

  if (len1 === 0 || len2 === 0) return false;

  return cross / (len1 * len2) < threshold;
}

// Check if point is on line segment
function pointOnSegment(point: Point, segStart: Point, segEnd: Point, threshold: number): boolean {
  const d1 = distanceBetweenPoints(point, segStart);
  const d2 = distanceBetweenPoints(point, segEnd);
  const lineLen = distanceBetweenPoints(segStart, segEnd);

  return Math.abs(d1 + d2 - lineLen) < threshold;
}

// Find perpendicular distance from point to line
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) return distanceBetweenPoints(point, lineStart);

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len;
}

// ============================================
// INITIAL STATE
// ============================================

const initialState = {
  selectedEntities: [] as SelectedEntity[],
  hoveredEntity: null as SelectedEntity | null,
  isMultiSelectMode: false,
  toolMode: 'select' as SketchToolMode,
  selectedZoneType: 'room' as ZoneType,
  isDragging: false,
  dragStartPoint: null as Point | null,
  dragCurrentPoint: null as Point | null,
  dragEntityId: null as string | null,
  activeGuides: [] as AlignmentGuide[],
  snappingConfig: DEFAULT_SNAPPING_CONFIG,
  wallStatuses: [] as WallStatus[],
  undoStack: [] as (RoomManipulationOperation | OpeningManipulationOperation | BatchOperation)[],
  redoStack: [] as (RoomManipulationOperation | OpeningManipulationOperation | BatchOperation)[],
  completenessIssues: [] as SketchCompletenessIssue[],
  isSketchComplete: false,
};

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useSketchManipulationStore = create<SketchManipulationState>((set, get) => ({
  ...initialState,

  // ============================================
  // SELECTION ACTIONS
  // ============================================

  selectEntity: (entity, isShiftClick) => {
    set((state) => {
      if (isShiftClick) {
        // Multi-select: toggle entity in selection
        const existingIndex = state.selectedEntities.findIndex(
          e => e.type === entity.type && e.id === entity.id
        );

        if (existingIndex >= 0) {
          // Remove from selection
          return {
            selectedEntities: state.selectedEntities.filter((_, i) => i !== existingIndex),
            isMultiSelectMode: true,
          };
        } else {
          // Add to selection
          return {
            selectedEntities: [...state.selectedEntities, entity],
            isMultiSelectMode: true,
          };
        }
      } else {
        // Single select: replace selection
        return {
          selectedEntities: [entity],
          isMultiSelectMode: false,
        };
      }
    });
  },

  selectEntities: (entities) => {
    set({ selectedEntities: entities, isMultiSelectMode: entities.length > 1 });
  },

  deselectAll: () => {
    set({ selectedEntities: [], isMultiSelectMode: false });
  },

  setHoveredEntity: (entity) => {
    set({ hoveredEntity: entity });
  },

  selectRoomAtPoint: (point, rooms, isShiftClick) => {
    // Find ALL rooms that contain the click point
    const matchingRooms: { room: RoomGeometry; area: number }[] = [];

    for (const room of rooms) {
      // Account for room's floor plan position
      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;

      // Translate point to room's local coordinates
      const localPoint = {
        x: point.x - originX,
        y: point.y - originY,
      };

      if (pointInPolygon(localPoint, room.polygon)) {
        // Calculate the area of this room's polygon
        const area = calculatePolygonArea(room.polygon);
        matchingRooms.push({ room, area });
      }
    }

    // If multiple rooms match, select the smallest one (most intuitive for nested rooms)
    if (matchingRooms.length > 0) {
      // Sort by area ascending and pick the smallest
      matchingRooms.sort((a, b) => a.area - b.area);
      const selectedRoom = matchingRooms[0].room;

      const entity: SelectedEntity = {
        type: 'room',
        id: selectedRoom.id,
        roomId: selectedRoom.id,
      };
      get().selectEntity(entity, isShiftClick);
      return selectedRoom;
    }

    // Clicked outside all rooms - deselect if not shift-clicking
    if (!isShiftClick) {
      get().deselectAll();
    }
    return null;
  },

  selectOpeningAtPoint: (point, rooms, scale, isShiftClick) => {
    const tolerance = 20 / scale; // 20 pixels in feet

    for (const room of rooms) {
      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;

      for (const opening of room.openings) {
        // Calculate opening position
        const wallLen = getWallLength(opening.wall, room.width_ft, room.length_ft);
        const pos = calculatePositionInFeet(opening.position, wallLen, opening.width_ft, opening.position_from ?? 'start');

        let openingCenter: Point;
        switch (opening.wall) {
          case 'north':
            openingCenter = { x: originX + pos, y: originY };
            break;
          case 'south':
            openingCenter = { x: originX + pos, y: originY + room.length_ft };
            break;
          case 'east':
            openingCenter = { x: originX + room.width_ft, y: originY + pos };
            break;
          case 'west':
            openingCenter = { x: originX, y: originY + pos };
            break;
        }

        const dist = distanceBetweenPoints(point, openingCenter);
        if (dist <= tolerance + opening.width_ft / 2) {
          const entity: SelectedEntity = {
            type: 'opening',
            id: opening.id,
            roomId: room.id,
            wallDirection: opening.wall,
          };
          get().selectEntity(entity, isShiftClick);
          return opening;
        }
      }
    }

    return null;
  },

  // ============================================
  // TOOL MODE ACTIONS
  // ============================================

  setToolMode: (mode) => {
    set({ toolMode: mode });
    // Clear selection when switching away from select mode
    if (mode !== 'select' && mode !== 'move_room' && mode !== 'move_opening') {
      get().deselectAll();
    }
  },

  setSelectedZoneType: (zoneType) => {
    set({ selectedZoneType: zoneType });
  },

  // ============================================
  // ROOM MANIPULATION ACTIONS
  // ============================================

  moveRoom: (roomId, deltaX, deltaY, rooms) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const now = new Date().toISOString();

    // Create undo operation
    const operation: RoomManipulationOperation = {
      id: generateId(),
      type: 'move',
      roomId,
      previousState: {
        origin_x_ft: room.origin_x_ft ?? 0,
        origin_y_ft: room.origin_y_ft ?? 0,
      },
      newState: {
        origin_x_ft: (room.origin_x_ft ?? 0) + deltaX,
        origin_y_ft: (room.origin_y_ft ?? 0) + deltaY,
      },
      timestamp: now,
    };
    get().pushOperation(operation);

    // Update room position (origin in floor plan coordinates)
    const updatedRoom: RoomGeometry = {
      ...room,
      origin_x_ft: (room.origin_x_ft ?? 0) + deltaX,
      origin_y_ft: (room.origin_y_ft ?? 0) + deltaY,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    return updatedRooms;
  },

  copyRoom: (roomId, offsetX, offsetY, rooms) => {
    const sourceRoom = rooms.find(r => r.id === roomId);
    if (!sourceRoom) {
      return { newRoom: sourceRoom!, updatedRooms: rooms };
    }

    const now = new Date().toISOString();

    // Create new room as a copy
    const newRoom: RoomGeometry = {
      ...sourceRoom,
      id: generateId(),
      name: `${sourceRoom.name}_copy`,
      origin_x_ft: (sourceRoom.origin_x_ft ?? 0) + offsetX,
      origin_y_ft: (sourceRoom.origin_y_ft ?? 0) + offsetY,
      openings: sourceRoom.openings.map(o => ({ ...o, id: generateId() })),
      features: sourceRoom.features.map(f => ({ ...f, id: generateId() })),
      damageZones: sourceRoom.damageZones.map(d => ({ ...d, id: generateId() })),
      notes: [...sourceRoom.notes],
      subRooms: [],
      objects: [],
      photos: [],
      created_at: now,
      updated_at: now,
    };

    // Create undo operation
    const operation: RoomManipulationOperation = {
      id: generateId(),
      type: 'copy',
      roomId: newRoom.id,
      previousState: {},
      newState: { ...newRoom },
      timestamp: now,
    };
    get().pushOperation(operation);

    return {
      newRoom,
      updatedRooms: [...rooms, newRoom],
    };
  },

  rotateRoom: (roomId, degrees, rooms) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const now = new Date().toISOString();

    // Get polygon centroid for rotation center
    const centroid = getPolygonCentroid(room.polygon);

    // Rotate all polygon points
    const rotatedPolygon = room.polygon.map(p => rotatePoint(p, degrees, centroid));

    // Recalculate bounding box and normalize to origin
    const bounds = getPolygonBounds(rotatedPolygon);
    const normalizedPolygon = rotatedPolygon.map(p => ({
      x: p.x - bounds.minX,
      y: p.y - bounds.minY,
    }));

    // Swap width/length for 90/270 degree rotations
    let newWidth = room.width_ft;
    let newLength = room.length_ft;
    if (degrees === 90 || degrees === 270) {
      newWidth = room.length_ft;
      newLength = room.width_ft;
    }

    // Rotate opening wall directions
    const wallRotationMap: Record<number, Record<WallDirection, WallDirection>> = {
      90: { north: 'east', east: 'south', south: 'west', west: 'north' },
      180: { north: 'south', east: 'west', south: 'north', west: 'east' },
      270: { north: 'west', east: 'north', south: 'east', west: 'south' },
    };

    const rotatedOpenings = room.openings.map(o => ({
      ...o,
      wall: wallRotationMap[degrees][o.wall],
    }));

    const rotatedFeatures = room.features.map(f => ({
      ...f,
      wall: f.wall === 'freestanding' ? 'freestanding' : wallRotationMap[degrees][f.wall as WallDirection],
    }));

    // Create undo operation
    const operation: RoomManipulationOperation = {
      id: generateId(),
      type: 'rotate',
      roomId,
      previousState: {
        polygon: room.polygon,
        width_ft: room.width_ft,
        length_ft: room.length_ft,
        openings: room.openings,
        features: room.features,
      },
      newState: {
        polygon: normalizedPolygon,
        width_ft: newWidth,
        length_ft: newLength,
        openings: rotatedOpenings,
        features: rotatedFeatures,
      },
      timestamp: now,
    };
    get().pushOperation(operation);

    const updatedRoom: RoomGeometry = {
      ...room,
      polygon: normalizedPolygon,
      width_ft: newWidth,
      length_ft: newLength,
      openings: rotatedOpenings,
      features: rotatedFeatures as typeof room.features,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    return updatedRooms;
  },

  // ============================================
  // OPENING MANIPULATION ACTIONS
  // ============================================

  moveOpeningAlongWall: (roomId, openingId, newPositionFt, rooms) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const openingIndex = room.openings.findIndex(o => o.id === openingId);
    if (openingIndex < 0) return rooms;

    const opening = room.openings[openingIndex];
    const wallLen = getWallLength(opening.wall, room.width_ft, room.length_ft);

    // Clamp position to valid range
    const minPos = opening.width_ft / 2;
    const maxPos = wallLen - opening.width_ft / 2;
    const clampedPos = Math.max(minPos, Math.min(maxPos, newPositionFt));

    const now = new Date().toISOString();

    // Create undo operation
    const operation: OpeningManipulationOperation = {
      id: generateId(),
      type: 'move',
      roomId,
      openingId,
      previousState: { position: opening.position },
      newState: { position: clampedPos },
      timestamp: now,
    };
    get().pushOperation(operation);

    const updatedOpening: Opening = {
      ...opening,
      position: clampedPos,
    };

    const updatedOpenings = [...room.openings];
    updatedOpenings[openingIndex] = updatedOpening;

    const updatedRoom: RoomGeometry = {
      ...room,
      openings: updatedOpenings,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    return updatedRooms;
  },

  updateOpeningDimensions: (roomId, openingId, width, height, offset, rooms = []) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const openingIndex = room.openings.findIndex(o => o.id === openingId);
    if (openingIndex < 0) return rooms;

    const opening = room.openings[openingIndex];
    const now = new Date().toISOString();

    const previousState: Partial<Opening> = {};
    const newState: Partial<Opening> = {};

    if (width !== undefined) {
      previousState.width_ft = opening.width_ft;
      newState.width_ft = width;
    }
    if (height !== undefined) {
      previousState.height_ft = opening.height_ft;
      newState.height_ft = height;
    }
    if (offset !== undefined) {
      previousState.position = opening.position;
      newState.position = offset;
    }

    // Create undo operation
    const operation: OpeningManipulationOperation = {
      id: generateId(),
      type: 'resize',
      roomId,
      openingId,
      previousState,
      newState,
      timestamp: now,
    };
    get().pushOperation(operation);

    const updatedOpening: Opening = {
      ...opening,
      ...(width !== undefined && { width_ft: width }),
      ...(height !== undefined && { height_ft: height }),
      ...(offset !== undefined && { position: offset }),
    };

    const updatedOpenings = [...room.openings];
    updatedOpenings[openingIndex] = updatedOpening;

    const updatedRoom: RoomGeometry = {
      ...room,
      openings: updatedOpenings,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    return updatedRooms;
  },

  // ============================================
  // MULTI-SELECT BATCH OPERATIONS
  // ============================================

  alignSelected: (axis, rooms) => {
    const { selectedEntities } = get();
    const roomEntities = selectedEntities.filter(e => e.type === 'room');

    if (roomEntities.length < 2) return rooms;

    // Get selected rooms
    const selectedRooms = roomEntities
      .map(e => rooms.find(r => r.id === e.roomId))
      .filter((r): r is RoomGeometry => r !== undefined);

    if (selectedRooms.length < 2) return rooms;

    // Calculate alignment target based on axis
    let targetValue: number;

    switch (axis) {
      case 'left':
        targetValue = Math.min(...selectedRooms.map(r => r.origin_x_ft ?? 0));
        break;
      case 'right':
        targetValue = Math.max(...selectedRooms.map(r => (r.origin_x_ft ?? 0) + r.width_ft));
        break;
      case 'top':
        targetValue = Math.min(...selectedRooms.map(r => r.origin_y_ft ?? 0));
        break;
      case 'bottom':
        targetValue = Math.max(...selectedRooms.map(r => (r.origin_y_ft ?? 0) + r.length_ft));
        break;
      case 'center_h':
        const avgCenterX = selectedRooms.reduce((sum, r) => sum + (r.origin_x_ft ?? 0) + r.width_ft / 2, 0) / selectedRooms.length;
        targetValue = avgCenterX;
        break;
      case 'center_v':
        const avgCenterY = selectedRooms.reduce((sum, r) => sum + (r.origin_y_ft ?? 0) + r.length_ft / 2, 0) / selectedRooms.length;
        targetValue = avgCenterY;
        break;
    }

    const now = new Date().toISOString();
    let updatedRooms = [...rooms];

    for (const selectedRoom of selectedRooms) {
      const roomIndex = updatedRooms.findIndex(r => r.id === selectedRoom.id);
      if (roomIndex < 0) continue;

      let newOriginX = selectedRoom.origin_x_ft ?? 0;
      let newOriginY = selectedRoom.origin_y_ft ?? 0;

      switch (axis) {
        case 'left':
          newOriginX = targetValue;
          break;
        case 'right':
          newOriginX = targetValue - selectedRoom.width_ft;
          break;
        case 'top':
          newOriginY = targetValue;
          break;
        case 'bottom':
          newOriginY = targetValue - selectedRoom.length_ft;
          break;
        case 'center_h':
          newOriginX = targetValue - selectedRoom.width_ft / 2;
          break;
        case 'center_v':
          newOriginY = targetValue - selectedRoom.length_ft / 2;
          break;
      }

      updatedRooms[roomIndex] = {
        ...selectedRoom,
        origin_x_ft: newOriginX,
        origin_y_ft: newOriginY,
        updated_at: now,
      };
    }

    // Record batch operation
    const operation: BatchOperation = {
      id: generateId(),
      type: 'align',
      entityIds: roomEntities.map(e => e.id),
      axis: axis.includes('center_h') || axis === 'left' || axis === 'right' ? 'horizontal' : 'vertical',
      timestamp: now,
    };
    get().pushOperation(operation);

    return updatedRooms;
  },

  equalizeWallLengths: (targetLength, rooms) => {
    const { selectedEntities } = get();
    const wallEntities = selectedEntities.filter(e => e.type === 'wall');

    if (wallEntities.length < 2) return rooms;

    // Calculate target based on mode
    let target: number;
    if (targetLength === 'average') {
      const lengths = wallEntities.map(e => {
        const room = rooms.find(r => r.id === e.roomId);
        if (!room || !e.wallDirection) return 0;
        return getWallLength(e.wallDirection, room.width_ft, room.length_ft);
      });
      target = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    } else if (targetLength === 'max') {
      const lengths = wallEntities.map(e => {
        const room = rooms.find(r => r.id === e.roomId);
        if (!room || !e.wallDirection) return 0;
        return getWallLength(e.wallDirection, room.width_ft, room.length_ft);
      });
      target = Math.max(...lengths);
    } else if (targetLength === 'min') {
      const lengths = wallEntities.map(e => {
        const room = rooms.find(r => r.id === e.roomId);
        if (!room || !e.wallDirection) return Infinity;
        return getWallLength(e.wallDirection, room.width_ft, room.length_ft);
      });
      target = Math.min(...lengths.filter(l => l !== Infinity));
    } else {
      target = targetLength;
    }

    const now = new Date().toISOString();
    let updatedRooms = [...rooms];

    for (const wallEntity of wallEntities) {
      const roomIndex = updatedRooms.findIndex(r => r.id === wallEntity.roomId);
      if (roomIndex < 0 || !wallEntity.wallDirection) continue;

      const room = updatedRooms[roomIndex];

      // Update room dimensions based on wall direction
      let newWidth = room.width_ft;
      let newLength = room.length_ft;

      if (wallEntity.wallDirection === 'north' || wallEntity.wallDirection === 'south') {
        newWidth = target;
      } else {
        newLength = target;
      }

      updatedRooms[roomIndex] = {
        ...room,
        width_ft: newWidth,
        length_ft: newLength,
        polygon: generatePolygon(room.shape, newWidth, newLength, room.l_shape_config, room.t_shape_config),
        updated_at: now,
      };
    }

    // Record batch operation
    const operation: BatchOperation = {
      id: generateId(),
      type: 'equalize_lengths',
      entityIds: wallEntities.map(e => e.id),
      timestamp: now,
    };
    get().pushOperation(operation);

    return updatedRooms;
  },

  distributeSelected: (axis, rooms) => {
    const { selectedEntities } = get();
    const roomEntities = selectedEntities.filter(e => e.type === 'room');

    if (roomEntities.length < 3) return rooms;

    // Get selected rooms sorted by position
    const selectedRooms = roomEntities
      .map(e => rooms.find(r => r.id === e.roomId))
      .filter((r): r is RoomGeometry => r !== undefined);

    if (selectedRooms.length < 3) return rooms;

    // Sort by position on axis
    const sortedRooms = [...selectedRooms].sort((a, b) => {
      if (axis === 'horizontal') {
        return (a.origin_x_ft ?? 0) - (b.origin_x_ft ?? 0);
      } else {
        return (a.origin_y_ft ?? 0) - (b.origin_y_ft ?? 0);
      }
    });

    // Calculate total space and spacing
    const firstRoom = sortedRooms[0];
    const lastRoom = sortedRooms[sortedRooms.length - 1];

    const firstPos = axis === 'horizontal' ? (firstRoom.origin_x_ft ?? 0) : (firstRoom.origin_y_ft ?? 0);
    const lastPos = axis === 'horizontal'
      ? (lastRoom.origin_x_ft ?? 0) + lastRoom.width_ft
      : (lastRoom.origin_y_ft ?? 0) + lastRoom.length_ft;

    const totalRoomSize = sortedRooms.reduce((sum, r) => {
      return sum + (axis === 'horizontal' ? r.width_ft : r.length_ft);
    }, 0);

    const totalSpace = lastPos - firstPos - totalRoomSize;
    const spacing = totalSpace / (sortedRooms.length - 1);

    const now = new Date().toISOString();
    let updatedRooms = [...rooms];
    let currentPos = firstPos;

    for (const sortedRoom of sortedRooms) {
      const roomIndex = updatedRooms.findIndex(r => r.id === sortedRoom.id);
      if (roomIndex < 0) continue;

      const newOriginX = axis === 'horizontal' ? currentPos : (sortedRoom.origin_x_ft ?? 0);
      const newOriginY = axis === 'vertical' ? currentPos : (sortedRoom.origin_y_ft ?? 0);

      updatedRooms[roomIndex] = {
        ...sortedRoom,
        origin_x_ft: newOriginX,
        origin_y_ft: newOriginY,
        updated_at: now,
      };

      currentPos += (axis === 'horizontal' ? sortedRoom.width_ft : sortedRoom.length_ft) + spacing;
    }

    // Record batch operation
    const operation: BatchOperation = {
      id: generateId(),
      type: 'distribute',
      entityIds: roomEntities.map(e => e.id),
      axis,
      timestamp: now,
    };
    get().pushOperation(operation);

    return updatedRooms;
  },

  // ============================================
  // SNAPPING & ALIGNMENT
  // ============================================

  setSnappingConfig: (config) => {
    set((state) => ({
      snappingConfig: { ...state.snappingConfig, ...config },
    }));
  },

  snapPoint: (point, rooms, excludeRoomId) => {
    const { snappingConfig } = get();
    const guides: AlignmentGuide[] = [];
    let snappedPoint = { ...point };
    let snappedToGrid = false;
    let snappedToEntity = false;

    if (!snappingConfig.enabled) {
      return { snappedPoint, guides, snappedToGrid: false, snappedToEntity: false };
    }

    // Grid snapping
    if (snappingConfig.gridEnabled) {
      snappedPoint = {
        x: snapToGrid(point.x, snappingConfig.gridSize),
        y: snapToGrid(point.y, snappingConfig.gridSize),
      };
      snappedToGrid = true;
    }

    // Corner snapping - snap to room corners
    if (snappingConfig.cornerSnapEnabled) {
      for (const room of rooms) {
        if (room.id === excludeRoomId) continue;

        const originX = room.origin_x_ft ?? 0;
        const originY = room.origin_y_ft ?? 0;

        const corners = room.polygon.map(p => ({
          x: p.x + originX,
          y: p.y + originY,
        }));

        for (const corner of corners) {
          const dist = distanceBetweenPoints(snappedPoint, corner);
          if (dist < snappingConfig.cornerSnapThreshold) {
            snappedPoint = corner;
            snappedToEntity = true;
            break;
          }
        }

        if (snappedToEntity) break;
      }
    }

    // Parallel/collinear wall snapping
    if (snappingConfig.parallelSnapEnabled || snappingConfig.collinearSnapEnabled) {
      const calculatedGuides = get().calculateAlignmentGuides(snappedPoint, rooms, excludeRoomId);
      guides.push(...calculatedGuides);

      // Snap to nearest guide if within threshold
      for (const guide of calculatedGuides) {
        if (guide.type === 'horizontal') {
          const dist = Math.abs(snappedPoint.y - guide.position);
          if (dist < snappingConfig.parallelSnapThreshold) {
            snappedPoint.y = guide.position;
            snappedToEntity = true;
          }
        } else if (guide.type === 'vertical') {
          const dist = Math.abs(snappedPoint.x - guide.position);
          if (dist < snappingConfig.parallelSnapThreshold) {
            snappedPoint.x = guide.position;
            snappedToEntity = true;
          }
        }
      }
    }

    return { snappedPoint, guides, snappedToGrid, snappedToEntity };
  },

  findParallelWalls: (wall, rooms, excludeRoomId) => {
    const parallelWalls: WallEntity[] = [];
    const { snappingConfig } = get();

    for (const room of rooms) {
      if (room.id === excludeRoomId) continue;

      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;

      // Check each wall of the room
      for (let i = 0; i < room.polygon.length; i++) {
        const start = {
          x: room.polygon[i].x + originX,
          y: room.polygon[i].y + originY,
        };
        const end = {
          x: room.polygon[(i + 1) % room.polygon.length].x + originX,
          y: room.polygon[(i + 1) % room.polygon.length].y + originY,
        };

        if (areSegmentsParallel(wall.start, wall.end, start, end, 0.1)) {
          // This is a parallel wall
          const dist = perpendicularDistance(wall.start, start, end);
          if (dist < snappingConfig.parallelSnapThreshold * 10) {
            parallelWalls.push({
              id: `${room.id}_wall_${i}`,
              startPoint: start,
              endPoint: end,
              length_ft: distanceBetweenPoints(start, end),
              height_ft: room.ceiling_height_ft,
              thickness_ft: 0.5,
              type: 'interior',
              orientation: Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? 'horizontal' : 'vertical',
              direction: 'north',
              roomIds: [room.id],
              isShared: false,
              parentRoomId: room.id,
              wallIndex: i,
              created_at: room.created_at,
              updated_at: room.updated_at,
            });
          }
        }
      }
    }

    return parallelWalls;
  },

  calculateAlignmentGuides: (dragPoint, rooms, excludeRoomId) => {
    const guides: AlignmentGuide[] = [];
    const { snappingConfig } = get();

    for (const room of rooms) {
      if (room.id === excludeRoomId) continue;

      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;

      // Check for horizontal alignment (Y matches)
      const roomY = originY;
      const roomY2 = originY + room.length_ft;
      const roomCenterY = originY + room.length_ft / 2;

      for (const y of [roomY, roomY2, roomCenterY]) {
        if (Math.abs(dragPoint.y - y) < snappingConfig.parallelSnapThreshold) {
          guides.push({
            id: generateId(),
            type: 'horizontal',
            position: y,
            start: { x: -1000, y },
            end: { x: 1000, y },
            sourceEntityId: 'drag',
            targetEntityId: room.id,
          });
        }
      }

      // Check for vertical alignment (X matches)
      const roomX = originX;
      const roomX2 = originX + room.width_ft;
      const roomCenterX = originX + room.width_ft / 2;

      for (const x of [roomX, roomX2, roomCenterX]) {
        if (Math.abs(dragPoint.x - x) < snappingConfig.parallelSnapThreshold) {
          guides.push({
            id: generateId(),
            type: 'vertical',
            position: x,
            start: { x, y: -1000 },
            end: { x, y: 1000 },
            sourceEntityId: 'drag',
            targetEntityId: room.id,
          });
        }
      }
    }

    return guides;
  },

  // ============================================
  // EXTERIOR / MISSING WALL MANAGEMENT
  // ============================================

  detectExteriorWalls: (rooms) => {
    const wallStatuses: WallStatus[] = [];

    for (const room of rooms) {
      const directions: WallDirection[] = ['north', 'south', 'east', 'west'];

      for (const direction of directions) {
        // Check if this wall is shared with another room
        const isShared = rooms.some(otherRoom => {
          if (otherRoom.id === room.id) return false;

          // Simple adjacency check based on position
          const thisOriginX = room.origin_x_ft ?? 0;
          const thisOriginY = room.origin_y_ft ?? 0;
          const otherOriginX = otherRoom.origin_x_ft ?? 0;
          const otherOriginY = otherRoom.origin_y_ft ?? 0;

          switch (direction) {
            case 'north':
              return Math.abs(thisOriginY - (otherOriginY + otherRoom.length_ft)) < 0.5;
            case 'south':
              return Math.abs((thisOriginY + room.length_ft) - otherOriginY) < 0.5;
            case 'east':
              return Math.abs((thisOriginX + room.width_ft) - otherOriginX) < 0.5;
            case 'west':
              return Math.abs(thisOriginX - (otherOriginX + otherRoom.width_ft)) < 0.5;
          }
        });

        // Check for missing wall note
        const isMissing = room.notes.some(n =>
          n.target === `wall_${direction}_missing` && n.note.includes('missing')
        );

        wallStatuses.push({
          wallId: `${room.id}_wall_${direction}`,
          roomId: room.id,
          direction,
          isExterior: !isShared,
          isMissing,
          length_ft: getWallLength(direction, room.width_ft, room.length_ft),
          height_ft: room.ceiling_height_ft,
        });
      }
    }

    set({ wallStatuses });
    return wallStatuses;
  },

  toggleWallMissing: (roomId, wallDirection, rooms) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const now = new Date().toISOString();

    // Find existing missing note
    const noteTarget = `wall_${wallDirection}_missing`;
    const existingNoteIndex = room.notes.findIndex(n => n.target === noteTarget);
    const isMissing = existingNoteIndex >= 0 && room.notes[existingNoteIndex].note.includes('missing');

    let updatedNotes = [...room.notes];

    if (existingNoteIndex >= 0) {
      // Toggle: if missing, mark present; if present, mark missing
      updatedNotes[existingNoteIndex] = {
        ...updatedNotes[existingNoteIndex],
        note: isMissing
          ? `${wallDirection} wall marked as present`
          : `${wallDirection} wall marked as missing/open`,
      };
    } else {
      // Add new missing note
      updatedNotes.push({
        id: generateId(),
        target: noteTarget,
        note: `${wallDirection} wall marked as missing/open`,
        created_at: now,
      });
    }

    const updatedRoom: RoomGeometry = {
      ...room,
      notes: updatedNotes,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    // Update wall statuses
    get().detectExteriorWalls(updatedRooms);

    return updatedRooms;
  },

  toggleWallExterior: (roomId, wallDirection, rooms) => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex < 0) return rooms;

    const room = rooms[roomIndex];
    const now = new Date().toISOString();

    // Find existing exterior note
    const noteTarget = `wall_${wallDirection}`;
    const existingNoteIndex = room.notes.findIndex(n => n.target === noteTarget);
    const isExterior = existingNoteIndex >= 0 && room.notes[existingNoteIndex].note.includes('exterior');

    let updatedNotes = [...room.notes];

    if (existingNoteIndex >= 0) {
      updatedNotes[existingNoteIndex] = {
        ...updatedNotes[existingNoteIndex],
        note: isExterior
          ? `${wallDirection} wall marked as interior`
          : `${wallDirection} wall marked as exterior`,
      };
    } else {
      updatedNotes.push({
        id: generateId(),
        target: noteTarget,
        note: `${wallDirection} wall marked as exterior`,
        created_at: now,
      });
    }

    const updatedRoom: RoomGeometry = {
      ...room,
      notes: updatedNotes,
      updated_at: now,
    };

    const updatedRooms = [...rooms];
    updatedRooms[roomIndex] = updatedRoom;

    // Update wall statuses
    get().detectExteriorWalls(updatedRooms);

    return updatedRooms;
  },

  getWallStatus: (roomId, wallDirection) => {
    const { wallStatuses } = get();
    return wallStatuses.find(
      ws => ws.roomId === roomId && ws.direction === wallDirection
    ) ?? null;
  },

  // ============================================
  // SKETCH COMPLETENESS
  // ============================================

  checkSketchCompleteness: (rooms) => {
    const issues: SketchCompletenessIssue[] = [];

    for (const room of rooms) {
      // Check for missing ceiling height (unusual values)
      if (room.ceiling_height_ft < 6 || room.ceiling_height_ft > 20) {
        issues.push({
          type: 'missing_ceiling_height',
          roomId: room.id,
          roomName: room.name,
          message: `${room.name}: Ceiling height (${room.ceiling_height_ft}') may need verification`,
          severity: 'warning',
        });
      }

      // Check for missing walls
      const { wallStatuses } = get();
      const roomWallStatuses = wallStatuses.filter(ws => ws.roomId === room.id);
      const missingWalls = roomWallStatuses.filter(ws => ws.isMissing);

      if (missingWalls.length > 0) {
        issues.push({
          type: 'missing_wall',
          roomId: room.id,
          roomName: room.name,
          message: `${room.name}: Has ${missingWalls.length} missing wall(s) - ${missingWalls.map(w => w.direction).join(', ')}`,
          severity: 'info',
        });
      }

      // Check for rooms with no openings (might be intentional but worth flagging)
      if (room.openings.length === 0) {
        issues.push({
          type: 'no_openings',
          roomId: room.id,
          roomName: room.name,
          message: `${room.name}: No doors or windows defined`,
          severity: 'info',
        });
      }

      // Check for very small or very large dimensions
      if (room.width_ft < 3 || room.length_ft < 3) {
        issues.push({
          type: 'no_dimensions',
          roomId: room.id,
          roomName: room.name,
          message: `${room.name}: Very small dimensions (${room.width_ft}' x ${room.length_ft}')`,
          severity: 'warning',
        });
      }

      if (room.width_ft > 100 || room.length_ft > 100) {
        issues.push({
          type: 'no_dimensions',
          roomId: room.id,
          roomName: room.name,
          message: `${room.name}: Very large dimensions (${room.width_ft}' x ${room.length_ft}')`,
          severity: 'warning',
        });
      }
    }

    return issues;
  },

  updateCompletenessIssues: (rooms) => {
    const issues = get().checkSketchCompleteness(rooms);
    const hasErrors = issues.some(i => i.severity === 'error');

    set({
      completenessIssues: issues,
      isSketchComplete: issues.length === 0 || !hasErrors,
    });
  },

  // ============================================
  // DRAG OPERATIONS
  // ============================================

  startDrag: (entityId, startPoint) => {
    set({
      isDragging: true,
      dragStartPoint: startPoint,
      dragCurrentPoint: startPoint,
      dragEntityId: entityId,
      activeGuides: [],
    });
  },

  updateDrag: (currentPoint, rooms) => {
    const { isDragging, dragStartPoint, dragEntityId, selectedEntities, toolMode, snappingConfig } = get();

    if (!isDragging || !dragStartPoint || !dragEntityId) {
      return { updatedRooms: null, guides: [] };
    }

    // Snap current point
    const { snappedPoint, guides } = get().snapPoint(currentPoint, rooms, dragEntityId);

    set({
      dragCurrentPoint: snappedPoint,
      activeGuides: guides,
    });

    // Calculate delta from drag start
    const deltaX = snappedPoint.x - dragStartPoint.x;
    const deltaY = snappedPoint.y - dragStartPoint.y;

    // Apply movement based on tool mode and selected entity
    const selectedEntity = selectedEntities.find(e => e.id === dragEntityId);

    if (!selectedEntity) {
      return { updatedRooms: null, guides };
    }

    let updatedRooms: RoomGeometry[] | null = null;

    if (selectedEntity.type === 'room' && (toolMode === 'move_room' || toolMode === 'select')) {
      // Move room
      updatedRooms = get().moveRoom(dragEntityId, deltaX, deltaY, rooms);
      // Update drag start for next iteration (relative drag)
      set({ dragStartPoint: snappedPoint });
    } else if (selectedEntity.type === 'opening' && toolMode === 'move_opening') {
      // Move opening along wall
      const room = rooms.find(r => r.id === selectedEntity.roomId);
      const opening = room?.openings.find(o => o.id === dragEntityId);

      if (room && opening) {
        // Calculate new position along wall
        const wallLen = getWallLength(opening.wall, room.width_ft, room.length_ft);
        const originX = room.origin_x_ft ?? 0;
        const originY = room.origin_y_ft ?? 0;

        let newPosition: number;
        if (opening.wall === 'north' || opening.wall === 'south') {
          newPosition = snappedPoint.x - originX;
        } else {
          newPosition = snappedPoint.y - originY;
        }

        // Snap to grid
        if (snappingConfig.gridEnabled) {
          newPosition = snapToGrid(newPosition, snappingConfig.gridSize);
        }

        updatedRooms = get().moveOpeningAlongWall(
          selectedEntity.roomId,
          dragEntityId,
          newPosition,
          rooms
        );
      }
    }

    return { updatedRooms, guides };
  },

  endDrag: () => {
    set({
      isDragging: false,
      dragStartPoint: null,
      dragCurrentPoint: null,
      dragEntityId: null,
      activeGuides: [],
    });
  },

  cancelDrag: () => {
    // Undo the last operation if we were dragging
    const { isDragging } = get();
    if (isDragging) {
      // The undo operation would need access to rooms, so we just reset drag state
      set({
        isDragging: false,
        dragStartPoint: null,
        dragCurrentPoint: null,
        dragEntityId: null,
        activeGuides: [],
      });
    }
  },

  // ============================================
  // UNDO/REDO
  // ============================================

  pushOperation: (operation) => {
    set((state) => ({
      undoStack: [...state.undoStack, operation],
      redoStack: [], // Clear redo stack on new operation
    }));
  },

  undo: (rooms) => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;

    const operation = undoStack[undoStack.length - 1];

    // Apply reverse operation
    let updatedRooms = [...rooms];

    if ('roomId' in operation && 'previousState' in operation) {
      if (operation.type === 'move' || operation.type === 'rotate') {
        const roomOp = operation as RoomManipulationOperation;
        const roomIndex = updatedRooms.findIndex(r => r.id === roomOp.roomId);
        if (roomIndex >= 0) {
          updatedRooms[roomIndex] = {
            ...updatedRooms[roomIndex],
            ...roomOp.previousState,
            updated_at: new Date().toISOString(),
          };
        }
      } else if (operation.type === 'copy') {
        // Remove the copied room
        const roomOp = operation as RoomManipulationOperation;
        updatedRooms = updatedRooms.filter(r => r.id !== roomOp.roomId);
      }
    }

    if ('openingId' in operation && 'previousState' in operation) {
      const openingOp = operation as OpeningManipulationOperation;
      const roomIndex = updatedRooms.findIndex(r => r.id === openingOp.roomId);
      if (roomIndex >= 0) {
        const room = updatedRooms[roomIndex];
        const openingIndex = room.openings.findIndex(o => o.id === openingOp.openingId);
        if (openingIndex >= 0) {
          const updatedOpenings = [...room.openings];
          updatedOpenings[openingIndex] = {
            ...updatedOpenings[openingIndex],
            ...openingOp.previousState,
          };
          updatedRooms[roomIndex] = {
            ...room,
            openings: updatedOpenings,
            updated_at: new Date().toISOString(),
          };
        }
      }
    }

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, operation],
    }));

    return updatedRooms;
  },

  redo: (rooms) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;

    const operation = redoStack[redoStack.length - 1];

    // Apply forward operation
    let updatedRooms = [...rooms];

    if ('roomId' in operation && 'newState' in operation) {
      if (operation.type === 'move' || operation.type === 'rotate') {
        const roomOp = operation as RoomManipulationOperation;
        const roomIndex = updatedRooms.findIndex(r => r.id === roomOp.roomId);
        if (roomIndex >= 0) {
          updatedRooms[roomIndex] = {
            ...updatedRooms[roomIndex],
            ...roomOp.newState,
            updated_at: new Date().toISOString(),
          };
        }
      } else if (operation.type === 'copy') {
        // Re-add the copied room
        const roomOp = operation as RoomManipulationOperation;
        updatedRooms.push(roomOp.newState as RoomGeometry);
      }
    }

    if ('openingId' in operation && 'newState' in operation) {
      const openingOp = operation as OpeningManipulationOperation;
      const roomIndex = updatedRooms.findIndex(r => r.id === openingOp.roomId);
      if (roomIndex >= 0) {
        const room = updatedRooms[roomIndex];
        const openingIndex = room.openings.findIndex(o => o.id === openingOp.openingId);
        if (openingIndex >= 0) {
          const updatedOpenings = [...room.openings];
          updatedOpenings[openingIndex] = {
            ...updatedOpenings[openingIndex],
            ...openingOp.newState,
          };
          updatedRooms[roomIndex] = {
            ...room,
            openings: updatedOpenings,
            updated_at: new Date().toISOString(),
          };
        }
      }
    }

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, operation],
    }));

    return updatedRooms;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  // ============================================
  // RESET
  // ============================================

  reset: () => {
    set(initialState);
  },
}));

// Singleton export for non-React contexts
export const sketchManipulationStore = {
  get state() {
    return useSketchManipulationStore.getState();
  },
  selectEntity: (entity: SelectedEntity, isShiftClick: boolean) =>
    useSketchManipulationStore.getState().selectEntity(entity, isShiftClick),
  deselectAll: () => useSketchManipulationStore.getState().deselectAll(),
  setToolMode: (mode: SketchToolMode) =>
    useSketchManipulationStore.getState().setToolMode(mode),
  setSelectedZoneType: (zoneType: ZoneType) =>
    useSketchManipulationStore.getState().setSelectedZoneType(zoneType),
  moveRoom: (roomId: string, deltaX: number, deltaY: number, rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().moveRoom(roomId, deltaX, deltaY, rooms),
  copyRoom: (roomId: string, offsetX: number, offsetY: number, rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().copyRoom(roomId, offsetX, offsetY, rooms),
  rotateRoom: (roomId: string, degrees: 90 | 180 | 270, rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().rotateRoom(roomId, degrees, rooms),
  moveOpeningAlongWall: (roomId: string, openingId: string, newPositionFt: number, rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().moveOpeningAlongWall(roomId, openingId, newPositionFt, rooms),
  updateOpeningDimensions: (roomId: string, openingId: string, width?: number, height?: number, offset?: number, rooms?: RoomGeometry[]) =>
    useSketchManipulationStore.getState().updateOpeningDimensions(roomId, openingId, width, height, offset, rooms),
  toggleWallMissing: (roomId: string, wallDirection: WallDirection, rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().toggleWallMissing(roomId, wallDirection, rooms),
  checkSketchCompleteness: (rooms: RoomGeometry[]) =>
    useSketchManipulationStore.getState().checkSketchCompleteness(rooms),
  reset: () => useSketchManipulationStore.getState().reset(),
};
