/**
 * Adjacency Reasoning Module
 *
 * Provides geometry intelligence for room layout and adjacency.
 * Analyzes spatial relationships, suggests optimal placements,
 * and validates geometric constraints.
 *
 * Key capabilities:
 * - Calculate room positions from relative descriptions
 * - Detect wall adjacencies and shared walls
 * - Suggest optimal room connections
 * - Validate room placement for overlaps
 * - Snap rooms to alignment grid
 */

import type { CardinalDirection, InferenceLogEntry } from './types';
import type { Point } from '../geometry';

// ============================================
// TYPES
// ============================================

export interface RoomBounds {
  id: string;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  originX: number;
  originY: number;
  width: number;
  length: number;
}

export interface WallSegment {
  roomId: string;
  roomName: string;
  wall: CardinalDirection;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  length: number;
}

export interface AdjacencyRelationship {
  room1: string;
  room2: string;
  wall1: CardinalDirection;
  wall2: CardinalDirection;
  sharedLength: number;
  overlapStart: Point;
  overlapEnd: Point;
  gapFt: number;
}

export interface PlacementSuggestion {
  originX: number;
  originY: number;
  direction: CardinalDirection;
  relativeTo: string;
  alignedEdge: CardinalDirection;
  inferenceLog: InferenceLogEntry[];
  confidence: number;
}

export interface OverlapResult {
  hasOverlap: boolean;
  overlappingRooms: string[];
  overlapArea?: number;
}

// ============================================
// ROOM BOUNDS CALCULATION
// ============================================

/**
 * Calculate bounding box for a room
 */
export function calculateRoomBounds(
  roomId: string,
  roomName: string,
  originX: number,
  originY: number,
  polygon: Point[]
): RoomBounds {
  if (polygon.length === 0) {
    return {
      id: roomId,
      name: roomName,
      minX: originX,
      maxX: originX,
      minY: originY,
      maxY: originY,
      originX,
      originY,
      width: 0,
      length: 0,
    };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const point of polygon) {
    const absX = originX + point.x;
    const absY = originY + point.y;
    minX = Math.min(minX, absX);
    maxX = Math.max(maxX, absX);
    minY = Math.min(minY, absY);
    maxY = Math.max(maxY, absY);
  }

  return {
    id: roomId,
    name: roomName,
    minX,
    maxX,
    minY,
    maxY,
    originX,
    originY,
    width: maxX - minX,
    length: maxY - minY,
  };
}

/**
 * Get wall segments from room bounds (simplified for rectangular rooms)
 */
export function getWallSegments(bounds: RoomBounds): WallSegment[] {
  return [
    // South wall (bottom)
    {
      roomId: bounds.id,
      roomName: bounds.name,
      wall: 'SOUTH',
      startX: bounds.minX,
      startY: bounds.minY,
      endX: bounds.maxX,
      endY: bounds.minY,
      length: bounds.width,
    },
    // East wall (right)
    {
      roomId: bounds.id,
      roomName: bounds.name,
      wall: 'EAST',
      startX: bounds.maxX,
      startY: bounds.minY,
      endX: bounds.maxX,
      endY: bounds.maxY,
      length: bounds.length,
    },
    // North wall (top)
    {
      roomId: bounds.id,
      roomName: bounds.name,
      wall: 'NORTH',
      startX: bounds.minX,
      startY: bounds.maxY,
      endX: bounds.maxX,
      endY: bounds.maxY,
      length: bounds.width,
    },
    // West wall (left)
    {
      roomId: bounds.id,
      roomName: bounds.name,
      wall: 'WEST',
      startX: bounds.minX,
      startY: bounds.minY,
      endX: bounds.minX,
      endY: bounds.maxY,
      length: bounds.length,
    },
  ];
}

// ============================================
// POSITION CALCULATION
// ============================================

/**
 * Calculate absolute position for a room placed relative to another
 */
export function calculateRelativePosition(
  newRoomWidth: number,
  newRoomLength: number,
  referenceRoom: RoomBounds,
  direction: CardinalDirection,
  gapFt: number = 0,
  alignment: 'start' | 'center' | 'end' = 'center'
): { originX: number; originY: number } {
  let originX: number;
  let originY: number;

  // Calculate alignment offset
  const alignOffset = (refDim: number, newDim: number): number => {
    switch (alignment) {
      case 'start': return 0;
      case 'center': return (refDim - newDim) / 2;
      case 'end': return refDim - newDim;
    }
  };

  switch (direction) {
    case 'NORTH':
      // Place new room above (north of) reference
      originX = referenceRoom.minX + alignOffset(referenceRoom.width, newRoomWidth);
      originY = referenceRoom.maxY + gapFt;
      break;

    case 'SOUTH':
      // Place new room below (south of) reference
      originX = referenceRoom.minX + alignOffset(referenceRoom.width, newRoomWidth);
      originY = referenceRoom.minY - newRoomLength - gapFt;
      break;

    case 'EAST':
      // Place new room to the right (east of) reference
      originX = referenceRoom.maxX + gapFt;
      originY = referenceRoom.minY + alignOffset(referenceRoom.length, newRoomLength);
      break;

    case 'WEST':
      // Place new room to the left (west of) reference
      originX = referenceRoom.minX - newRoomWidth - gapFt;
      originY = referenceRoom.minY + alignOffset(referenceRoom.length, newRoomLength);
      break;
  }

  return { originX, originY };
}

/**
 * Snap position to alignment grid
 */
export function snapToGrid(
  position: { originX: number; originY: number },
  gridSizeFt: number = 0.5
): { originX: number; originY: number } {
  return {
    originX: Math.round(position.originX / gridSizeFt) * gridSizeFt,
    originY: Math.round(position.originY / gridSizeFt) * gridSizeFt,
  };
}

// ============================================
// ADJACENCY DETECTION
// ============================================

/**
 * Detect adjacency relationships between rooms
 */
export function detectAdjacencies(
  rooms: RoomBounds[],
  toleranceFt: number = 0.5
): AdjacencyRelationship[] {
  const adjacencies: AdjacencyRelationship[] = [];

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const room1 = rooms[i];
      const room2 = rooms[j];

      // Check each wall combination
      const walls1 = getWallSegments(room1);
      const walls2 = getWallSegments(room2);

      for (const wall1 of walls1) {
        for (const wall2 of walls2) {
          const adjacency = checkWallAdjacency(wall1, wall2, toleranceFt);
          if (adjacency) {
            adjacencies.push({
              room1: room1.name,
              room2: room2.name,
              wall1: wall1.wall,
              wall2: wall2.wall,
              sharedLength: adjacency.sharedLength,
              overlapStart: adjacency.overlapStart,
              overlapEnd: adjacency.overlapEnd,
              gapFt: adjacency.gapFt,
            });
          }
        }
      }
    }
  }

  return adjacencies;
}

/**
 * Check if two walls are adjacent
 */
function checkWallAdjacency(
  wall1: WallSegment,
  wall2: WallSegment,
  toleranceFt: number
): {
  sharedLength: number;
  overlapStart: Point;
  overlapEnd: Point;
  gapFt: number;
} | null {
  // Walls must be parallel and facing each other
  const oppositePairs: Array<[CardinalDirection, CardinalDirection]> = [
    ['NORTH', 'SOUTH'],
    ['SOUTH', 'NORTH'],
    ['EAST', 'WEST'],
    ['WEST', 'EAST'],
  ];

  const isOpposite = oppositePairs.some(
    ([a, b]) => wall1.wall === a && wall2.wall === b
  );

  if (!isOpposite) return null;

  // Check if walls are close enough
  let gapFt: number;
  let overlapStart: Point;
  let overlapEnd: Point;

  if (wall1.wall === 'NORTH' || wall1.wall === 'SOUTH') {
    // Horizontal walls - check Y distance
    gapFt = Math.abs(wall1.startY - wall2.startY);
    if (gapFt > toleranceFt) return null;

    // Check X overlap
    const xStart = Math.max(wall1.startX, wall2.startX);
    const xEnd = Math.min(wall1.endX, wall2.endX);
    if (xStart >= xEnd) return null;

    overlapStart = { x: xStart, y: (wall1.startY + wall2.startY) / 2 };
    overlapEnd = { x: xEnd, y: (wall1.startY + wall2.startY) / 2 };
  } else {
    // Vertical walls - check X distance
    gapFt = Math.abs(wall1.startX - wall2.startX);
    if (gapFt > toleranceFt) return null;

    // Check Y overlap
    const yStart = Math.max(wall1.startY, wall2.startY);
    const yEnd = Math.min(wall1.endY, wall2.endY);
    if (yStart >= yEnd) return null;

    overlapStart = { x: (wall1.startX + wall2.startX) / 2, y: yStart };
    overlapEnd = { x: (wall1.startX + wall2.startX) / 2, y: yEnd };
  }

  const sharedLength = Math.sqrt(
    Math.pow(overlapEnd.x - overlapStart.x, 2) +
    Math.pow(overlapEnd.y - overlapStart.y, 2)
  );

  return { sharedLength, overlapStart, overlapEnd, gapFt };
}

// ============================================
// OVERLAP DETECTION
// ============================================

/**
 * Check if a new room would overlap with existing rooms
 */
export function checkOverlap(
  newRoom: RoomBounds,
  existingRooms: RoomBounds[],
  toleranceFt: number = 0.01
): OverlapResult {
  const overlappingRooms: string[] = [];
  let totalOverlapArea = 0;

  for (const existing of existingRooms) {
    // Calculate overlap rectangle
    const overlapMinX = Math.max(newRoom.minX + toleranceFt, existing.minX + toleranceFt);
    const overlapMaxX = Math.min(newRoom.maxX - toleranceFt, existing.maxX - toleranceFt);
    const overlapMinY = Math.max(newRoom.minY + toleranceFt, existing.minY + toleranceFt);
    const overlapMaxY = Math.min(newRoom.maxY - toleranceFt, existing.maxY - toleranceFt);

    if (overlapMinX < overlapMaxX && overlapMinY < overlapMaxY) {
      const overlapArea = (overlapMaxX - overlapMinX) * (overlapMaxY - overlapMinY);
      totalOverlapArea += overlapArea;
      overlappingRooms.push(existing.name);
    }
  }

  return {
    hasOverlap: overlappingRooms.length > 0,
    overlappingRooms,
    overlapArea: totalOverlapArea > 0 ? totalOverlapArea : undefined,
  };
}

// ============================================
// SMART PLACEMENT SUGGESTIONS
// ============================================

/**
 * Suggest optimal placement for a new room
 */
export function suggestOptimalPlacement(
  newRoomName: string,
  newRoomWidth: number,
  newRoomLength: number,
  existingRooms: RoomBounds[],
  preferredAdjacentRooms: string[] = []
): PlacementSuggestion[] {
  const suggestions: PlacementSuggestion[] = [];

  if (existingRooms.length === 0) {
    // First room - place at origin
    suggestions.push({
      originX: 0,
      originY: 0,
      direction: 'EAST',
      relativeTo: 'origin',
      alignedEdge: 'SOUTH',
      inferenceLog: [{
        field: 'position',
        inferredValue: { x: 0, y: 0 },
        reason: 'First room placed at floor plan origin',
        confidence: 1,
        reversible: true,
      }],
      confidence: 1,
    });
    return suggestions;
  }

  // Try each existing room as a reference
  for (const refRoom of existingRooms) {
    // Skip if we have preferred rooms and this isn't one
    if (preferredAdjacentRooms.length > 0) {
      const isPreferred = preferredAdjacentRooms.some(
        pref => refRoom.name.toLowerCase().includes(pref.toLowerCase())
      );
      if (!isPreferred) continue;
    }

    // Try each direction
    const directions: CardinalDirection[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    for (const direction of directions) {
      const position = calculateRelativePosition(
        newRoomWidth,
        newRoomLength,
        refRoom,
        direction,
        0, // No gap - walls touch
        'center'
      );

      // Check for overlaps with existing rooms
      const newBounds: RoomBounds = {
        id: 'new',
        name: newRoomName,
        minX: position.originX,
        maxX: position.originX + newRoomWidth,
        minY: position.originY,
        maxY: position.originY + newRoomLength,
        originX: position.originX,
        originY: position.originY,
        width: newRoomWidth,
        length: newRoomLength,
      };

      const overlap = checkOverlap(newBounds, existingRooms);
      if (!overlap.hasOverlap) {
        // Calculate confidence based on adjacency
        const isPreferredAdjacent = preferredAdjacentRooms.some(
          pref => refRoom.name.toLowerCase().includes(pref.toLowerCase())
        );
        const confidence = isPreferredAdjacent ? 0.9 : 0.6;

        suggestions.push({
          originX: position.originX,
          originY: position.originY,
          direction,
          relativeTo: refRoom.name,
          alignedEdge: getOppositeDirection(direction),
          inferenceLog: [{
            field: 'position',
            inferredValue: position,
            reason: `Placed ${direction.toLowerCase()} of ${refRoom.name}`,
            confidence,
            reversible: true,
          }],
          confidence,
        });
      }
    }
  }

  // Sort by confidence (preferred adjacencies first)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Get opposite direction
 */
function getOppositeDirection(direction: CardinalDirection): CardinalDirection {
  switch (direction) {
    case 'NORTH': return 'SOUTH';
    case 'SOUTH': return 'NORTH';
    case 'EAST': return 'WEST';
    case 'WEST': return 'EAST';
  }
}

// ============================================
// CONNECTION SUGGESTIONS
// ============================================

/**
 * Suggest optimal opening position between two adjacent rooms
 */
export function suggestOpeningPosition(
  adjacency: AdjacencyRelationship
): {
  wall1Position: number;
  wall2Position: number;
  suggestedWidth: number;
  reason: string;
} {
  // Center the opening in the shared wall section
  const sharedMidpoint = adjacency.sharedLength / 2;

  // Standard door width
  const suggestedWidth = 3;

  // Calculate offset from wall start
  const midpointOffset = sharedMidpoint - (suggestedWidth / 2);

  return {
    wall1Position: midpointOffset,
    wall2Position: midpointOffset,
    suggestedWidth,
    reason: `Centered ${suggestedWidth}ft opening in ${adjacency.sharedLength.toFixed(1)}ft shared wall`,
  };
}

// ============================================
// LAYOUT ANALYSIS
// ============================================

/**
 * Analyze floor plan layout
 */
export function analyzeLayout(rooms: RoomBounds[]): {
  totalArea: number;
  boundingBox: { width: number; length: number };
  roomCount: number;
  adjacencyCount: number;
  suggestedConnections: Array<{
    from: string;
    to: string;
    wall: CardinalDirection;
  }>;
} {
  if (rooms.length === 0) {
    return {
      totalArea: 0,
      boundingBox: { width: 0, length: 0 },
      roomCount: 0,
      adjacencyCount: 0,
      suggestedConnections: [],
    };
  }

  // Calculate total area
  const totalArea = rooms.reduce((sum, room) => sum + (room.width * room.length), 0);

  // Calculate bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.minX);
    maxX = Math.max(maxX, room.maxX);
    minY = Math.min(minY, room.minY);
    maxY = Math.max(maxY, room.maxY);
  }

  // Detect adjacencies
  const adjacencies = detectAdjacencies(rooms);

  // Suggest connections for adjacent rooms without openings
  const suggestedConnections = adjacencies
    .filter(adj => adj.sharedLength >= 3) // Need at least 3ft for a door
    .map(adj => ({
      from: adj.room1,
      to: adj.room2,
      wall: adj.wall1,
    }));

  return {
    totalArea,
    boundingBox: {
      width: maxX - minX,
      length: maxY - minY,
    },
    roomCount: rooms.length,
    adjacencyCount: adjacencies.length,
    suggestedConnections,
  };
}
