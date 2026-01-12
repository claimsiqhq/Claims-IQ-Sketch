// Polygon Math Utilities for Room Geometry
import type {
  Point,
  RoomShape,
  WallDirection,
  PositionType,
  PositionFromType,
  LShapeConfig,
  TShapeConfig,
  CornerPosition,
  WallEntity,
  WallType,
  WallOrientation,
  RoomGeometry
} from '../types/geometry';

// Generate unique ID using crypto.randomUUID for better uniqueness
// Falls back to timestamp-based ID for environments without crypto support
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Generate rectangle polygon from dimensions
export function generateRectanglePolygon(width_ft: number, length_ft: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width_ft, y: 0 },
    { x: width_ft, y: length_ft },
    { x: 0, y: length_ft },
  ];
}

// Generate L-shape polygon with configurable notch corner
export function generateLShapePolygon(
  width_ft: number,
  length_ft: number,
  config?: LShapeConfig
): Point[] {
  // Default to northeast corner notch (legacy behavior)
  const notch_corner: CornerPosition = config?.notch_corner ?? 'southeast';
  const notch_width = config?.notch_width_ft ?? width_ft / 2;
  const notch_length = config?.notch_length_ft ?? length_ft / 2;

  // Generate points based on notch corner position
  // Coordinate system: origin at northwest, x increases east, y increases south
  switch (notch_corner) {
    case 'northeast':
      // Notch in top-right corner
      return [
        { x: 0, y: 0 },
        { x: width_ft - notch_width, y: 0 },
        { x: width_ft - notch_width, y: notch_length },
        { x: width_ft, y: notch_length },
        { x: width_ft, y: length_ft },
        { x: 0, y: length_ft },
      ];
    case 'northwest':
      // Notch in top-left corner
      return [
        { x: notch_width, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft },
        { x: 0, y: length_ft },
        { x: 0, y: notch_length },
        { x: notch_width, y: notch_length },
      ];
    case 'southeast':
      // Notch in bottom-right corner (legacy default)
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft - notch_length },
        { x: width_ft - notch_width, y: length_ft - notch_length },
        { x: width_ft - notch_width, y: length_ft },
        { x: 0, y: length_ft },
      ];
    case 'southwest':
      // Notch in bottom-left corner
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft },
        { x: notch_width, y: length_ft },
        { x: notch_width, y: length_ft - notch_length },
        { x: 0, y: length_ft - notch_length },
      ];
    default:
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft - notch_length },
        { x: width_ft - notch_width, y: length_ft - notch_length },
        { x: width_ft - notch_width, y: length_ft },
        { x: 0, y: length_ft },
      ];
  }
}

// Generate T-shape polygon with configurable stem
export function generateTShapePolygon(
  width_ft: number,
  length_ft: number,
  config?: TShapeConfig
): Point[] {
  // Default: stem extends from south wall, centered
  const stem_wall = config?.stem_wall ?? 'south';
  const stem_width = config?.stem_width_ft ?? width_ft / 3;
  const stem_length = config?.stem_length_ft ?? length_ft / 3;
  // Default position: centered on the wall
  const stem_position = config?.stem_position_ft ?? (
    (stem_wall === 'north' || stem_wall === 'south')
      ? (width_ft - stem_width) / 2
      : (length_ft - stem_width) / 2
  );

  // Coordinate system: origin at northwest, x increases east, y increases south
  // The base rectangle is width_ft x length_ft
  // The stem extends outward from the specified wall
  switch (stem_wall) {
    case 'north':
      // Stem extends upward (negative y) from north wall
      return [
        { x: stem_position, y: -stem_length },
        { x: stem_position + stem_width, y: -stem_length },
        { x: stem_position + stem_width, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft },
        { x: 0, y: length_ft },
        { x: 0, y: 0 },
        { x: stem_position, y: 0 },
      ];
    case 'south':
      // Stem extends downward (positive y) from south wall (legacy default)
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft },
        { x: stem_position + stem_width, y: length_ft },
        { x: stem_position + stem_width, y: length_ft + stem_length },
        { x: stem_position, y: length_ft + stem_length },
        { x: stem_position, y: length_ft },
        { x: 0, y: length_ft },
      ];
    case 'east':
      // Stem extends rightward (positive x) from east wall
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: stem_position },
        { x: width_ft + stem_length, y: stem_position },
        { x: width_ft + stem_length, y: stem_position + stem_width },
        { x: width_ft, y: stem_position + stem_width },
        { x: width_ft, y: length_ft },
        { x: 0, y: length_ft },
      ];
    case 'west':
      // Stem extends leftward (negative x) from west wall
      return [
        { x: 0, y: stem_position },
        { x: -stem_length, y: stem_position },
        { x: -stem_length, y: stem_position + stem_width },
        { x: 0, y: stem_position + stem_width },
        { x: 0, y: length_ft },
        { x: width_ft, y: length_ft },
        { x: width_ft, y: 0 },
        { x: 0, y: 0 },
      ];
    default:
      // Default to south stem
      return [
        { x: 0, y: 0 },
        { x: width_ft, y: 0 },
        { x: width_ft, y: length_ft },
        { x: stem_position + stem_width, y: length_ft },
        { x: stem_position + stem_width, y: length_ft + stem_length },
        { x: stem_position, y: length_ft + stem_length },
        { x: stem_position, y: length_ft },
        { x: 0, y: length_ft },
      ];
  }
}

// Generate polygon based on shape with optional shape-specific configuration
export function generatePolygon(
  shape: RoomShape,
  width_ft: number,
  length_ft: number,
  l_shape_config?: LShapeConfig,
  t_shape_config?: TShapeConfig
): Point[] {
  switch (shape) {
    case 'rectangle':
      return generateRectanglePolygon(width_ft, length_ft);
    case 'l_shape':
      return generateLShapePolygon(width_ft, length_ft, l_shape_config);
    case 't_shape':
      return generateTShapePolygon(width_ft, length_ft, t_shape_config);
    case 'irregular':
      // Default to rectangle for irregular, can be modified later
      return generateRectanglePolygon(width_ft, length_ft);
    default:
      return generateRectanglePolygon(width_ft, length_ft);
  }
}

// Get wall coordinates for a rectangular room
export function getWallCoordinates(
  wall: WallDirection,
  width_ft: number,
  length_ft: number
): { start: Point; end: Point; length: number } {
  switch (wall) {
    case 'north':
      return {
        start: { x: 0, y: 0 },
        end: { x: width_ft, y: 0 },
        length: width_ft,
      };
    case 'south':
      return {
        start: { x: 0, y: length_ft },
        end: { x: width_ft, y: length_ft },
        length: width_ft,
      };
    case 'east':
      return {
        start: { x: width_ft, y: 0 },
        end: { x: width_ft, y: length_ft },
        length: length_ft,
      };
    case 'west':
      return {
        start: { x: 0, y: 0 },
        end: { x: 0, y: length_ft },
        length: length_ft,
      };
  }
}

// Calculate position in feet from wall start
// position_from: 'start' = from north/west corner (default), 'end' = from south/east corner
export function calculatePositionInFeet(
  position: PositionType,
  wallLength: number,
  elementWidth: number,
  positionFrom: PositionFromType = 'start'
): number {
  let positionInFeet: number;

  if (typeof position === 'number') {
    // If position_from is 'end', convert to position from start
    if (positionFrom === 'end') {
      positionInFeet = wallLength - position;
    } else {
      positionInFeet = position;
    }
  } else {
    switch (position) {
      case 'left':
        positionInFeet = elementWidth / 2 + 0.5; // 6 inches from corner
        break;
      case 'center':
        positionInFeet = wallLength / 2;
        break;
      case 'right':
        positionInFeet = wallLength - elementWidth / 2 - 0.5;
        break;
      default:
        positionInFeet = wallLength / 2;
    }
  }

  // Ensure position stays within wall bounds (accounting for element width)
  const minPos = elementWidth / 2;
  const maxPos = wallLength - elementWidth / 2;
  return Math.max(minPos, Math.min(maxPos, positionInFeet));
}

// Calculate area of polygon using shoelace formula
export function calculatePolygonArea(polygon: Point[]): number {
  let area = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }

  return Math.abs(area / 2);
}

// Calculate perimeter of polygon
export function calculatePerimeter(polygon: Point[]): number {
  let perimeter = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return perimeter;
}

// Get wall length for a given direction
export function getWallLength(
  wall: WallDirection,
  width_ft: number,
  length_ft: number
): number {
  if (wall === 'north' || wall === 'south') {
    return width_ft;
  }
  return length_ft;
}

// Format dimensions for display
export function formatDimension(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);

  if (inches === 0) {
    return `${wholeFeet}'`;
  } else if (inches === 12) {
    return `${wholeFeet + 1}'`;
  }

  return `${wholeFeet}' ${inches}"`;
}

// Parse dimension string to feet
export function parseDimensionToFeet(input: string): number | null {
  // Handle various formats: "14", "14.5", "14'6\"", "14 6", "14 feet 6 inches"
  const cleanInput = input.toLowerCase().trim();

  // Try parsing as simple number
  const simpleNum = parseFloat(cleanInput);
  if (!isNaN(simpleNum) && cleanInput.match(/^[\d.]+$/)) {
    return simpleNum;
  }

  // Try feet and inches format: 14'6" or 14' 6"
  const feetInchMatch = cleanInput.match(/^(\d+(?:\.\d+)?)'?\s*(\d+(?:\.\d+)?)?["']?$/);
  if (feetInchMatch) {
    const feet = parseFloat(feetInchMatch[1]);
    const inches = feetInchMatch[2] ? parseFloat(feetInchMatch[2]) : 0;
    return feet + inches / 12;
  }

  // Try "X feet Y inches" format
  const wordMatch = cleanInput.match(/^(\d+(?:\.\d+)?)\s*(?:feet|ft|foot)?\s*(?:and\s*)?(\d+(?:\.\d+)?)?\s*(?:inches|in)?$/);
  if (wordMatch) {
    const feet = parseFloat(wordMatch[1]);
    const inches = wordMatch[2] ? parseFloat(wordMatch[2]) : 0;
    return feet + inches / 12;
  }

  return null;
}

// Convert room name to display format
export function formatRoomName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Normalize room name for storage
export function normalizeRoomName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Generate damage zone polygon from wall-extent specification
// Creates a polygon that extends inward from affected walls by the specified extent
export function generateDamageZonePolygon(
  roomWidth: number,
  roomLength: number,
  affectedWalls: WallDirection[],
  extentFt: number
): Point[] {
  // If no walls specified, return empty
  if (affectedWalls.length === 0) return [];

  // For single wall damage, create a simple rectangle along that wall
  if (affectedWalls.length === 1) {
    const wall = affectedWalls[0];
    switch (wall) {
      case 'north':
        return [
          { x: 0, y: 0 },
          { x: roomWidth, y: 0 },
          { x: roomWidth, y: extentFt },
          { x: 0, y: extentFt },
        ];
      case 'south':
        return [
          { x: 0, y: roomLength - extentFt },
          { x: roomWidth, y: roomLength - extentFt },
          { x: roomWidth, y: roomLength },
          { x: 0, y: roomLength },
        ];
      case 'east':
        return [
          { x: roomWidth - extentFt, y: 0 },
          { x: roomWidth, y: 0 },
          { x: roomWidth, y: roomLength },
          { x: roomWidth - extentFt, y: roomLength },
        ];
      case 'west':
        return [
          { x: 0, y: 0 },
          { x: extentFt, y: 0 },
          { x: extentFt, y: roomLength },
          { x: 0, y: roomLength },
        ];
    }
  }

  // For corner damage (2 adjacent walls), create an L-shaped zone
  const hasNorth = affectedWalls.includes('north');
  const hasSouth = affectedWalls.includes('south');
  const hasEast = affectedWalls.includes('east');
  const hasWest = affectedWalls.includes('west');

  // Two adjacent walls form a corner
  if (affectedWalls.length === 2) {
    if (hasNorth && hasWest) {
      return [
        { x: 0, y: 0 },
        { x: roomWidth, y: 0 },
        { x: roomWidth, y: extentFt },
        { x: extentFt, y: extentFt },
        { x: extentFt, y: roomLength },
        { x: 0, y: roomLength },
      ];
    }
    if (hasNorth && hasEast) {
      return [
        { x: 0, y: 0 },
        { x: roomWidth, y: 0 },
        { x: roomWidth, y: roomLength },
        { x: roomWidth - extentFt, y: roomLength },
        { x: roomWidth - extentFt, y: extentFt },
        { x: 0, y: extentFt },
      ];
    }
    if (hasSouth && hasWest) {
      return [
        { x: 0, y: 0 },
        { x: extentFt, y: 0 },
        { x: extentFt, y: roomLength - extentFt },
        { x: roomWidth, y: roomLength - extentFt },
        { x: roomWidth, y: roomLength },
        { x: 0, y: roomLength },
      ];
    }
    if (hasSouth && hasEast) {
      return [
        { x: roomWidth - extentFt, y: 0 },
        { x: roomWidth, y: 0 },
        { x: roomWidth, y: roomLength },
        { x: 0, y: roomLength },
        { x: 0, y: roomLength - extentFt },
        { x: roomWidth - extentFt, y: roomLength - extentFt },
      ];
    }
    // Opposite walls (north-south or east-west)
    if (hasNorth && hasSouth) {
      // Two separate rectangles - return the combined polygon
      return [
        { x: 0, y: 0 },
        { x: roomWidth, y: 0 },
        { x: roomWidth, y: extentFt },
        { x: 0, y: extentFt },
        // Gap in the middle
        { x: 0, y: roomLength - extentFt },
        { x: roomWidth, y: roomLength - extentFt },
        { x: roomWidth, y: roomLength },
        { x: 0, y: roomLength },
      ];
    }
    if (hasEast && hasWest) {
      return [
        { x: 0, y: 0 },
        { x: extentFt, y: 0 },
        { x: extentFt, y: roomLength },
        { x: 0, y: roomLength },
        // Gap in the middle
        { x: roomWidth - extentFt, y: 0 },
        { x: roomWidth, y: 0 },
        { x: roomWidth, y: roomLength },
        { x: roomWidth - extentFt, y: roomLength },
      ];
    }
  }

  // Three or four walls - create a perimeter zone
  const points: Point[] = [];
  
  // Outer perimeter (clockwise)
  points.push({ x: 0, y: 0 });
  points.push({ x: roomWidth, y: 0 });
  points.push({ x: roomWidth, y: roomLength });
  points.push({ x: 0, y: roomLength });

  // If all walls affected, add inner cutout
  if (hasNorth && hasSouth && hasEast && hasWest) {
    // Inner rectangle (counterclockwise for cutout)
    const innerPoints = [
      { x: extentFt, y: extentFt },
      { x: extentFt, y: roomLength - extentFt },
      { x: roomWidth - extentFt, y: roomLength - extentFt },
      { x: roomWidth - extentFt, y: extentFt },
    ];
    // Connect outer to inner with a line and back
    points.push({ x: 0, y: 0 }); // back to start
    points.push({ x: extentFt, y: extentFt }); // to inner
    points.push(...innerPoints);
  }

  return points;
}

// Calculate bounding box of a polygon
export function getPolygonBounds(polygon: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = polygon[0].x, maxX = polygon[0].x;
  let minY = polygon[0].y, maxY = polygon[0].y;

  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
}

// ============================================================================
// Wall-First Sketch Model Utilities
// ============================================================================

// Derive wall direction from two points
export function getWallDirectionFromPoints(start: Point, end: Point): WallDirection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Determine if wall is horizontal or vertical based on dominant direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal wall - determine facing direction
    // In our coordinate system, +y is south, so a wall running horizontally
    // at the top of a room faces north, at the bottom faces south
    return dy >= 0 ? 'north' : 'south';
  } else {
    // Vertical wall
    return dx >= 0 ? 'west' : 'east';
  }
}

// Get wall orientation from two points
export function getWallOrientation(start: Point, end: Point): WallOrientation {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx > dy ? 'horizontal' : 'vertical';
}

// Calculate distance between two points
export function distanceBetweenPoints(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Extract walls from a room's polygon
export function extractWallsFromRoom(
  room: RoomGeometry,
  allRooms: RoomGeometry[]
): WallEntity[] {
  const walls: WallEntity[] = [];
  const polygon = room.polygon;
  const now = new Date().toISOString();

  if (polygon.length < 3) return walls;

  // Get room's origin for absolute positioning
  const originX = room.origin_x_ft ?? 0;
  const originY = room.origin_y_ft ?? 0;

  for (let i = 0; i < polygon.length; i++) {
    const startPoint = {
      x: polygon[i].x + originX,
      y: polygon[i].y + originY
    };
    const endPoint = {
      x: polygon[(i + 1) % polygon.length].x + originX,
      y: polygon[(i + 1) % polygon.length].y + originY
    };

    const length = distanceBetweenPoints(startPoint, endPoint);
    const orientation = getWallOrientation(startPoint, endPoint);
    const direction = getWallDirectionFromSegment(startPoint, endPoint, polygon, i);

    // Check if this wall is shared with another room
    const sharedRoomIds = findSharedRoomIds(startPoint, endPoint, room.id, allRooms);
    const isShared = sharedRoomIds.length > 0;
    const roomIds = [room.id, ...sharedRoomIds];

    // Determine wall type
    const wallType: WallType = isShared ? 'interior' : 'exterior';

    walls.push({
      id: `wall-${room.id}-${i}`,
      startPoint,
      endPoint,
      length_ft: length,
      height_ft: room.ceiling_height_ft,
      thickness_ft: 0.5, // Default 6 inches
      type: wallType,
      orientation,
      direction,
      roomIds,
      isShared,
      parentRoomId: room.id,
      wallIndex: i,
      created_at: now,
      updated_at: now,
    });
  }

  return walls;
}

// Get wall direction from segment within polygon context
function getWallDirectionFromSegment(
  start: Point,
  end: Point,
  polygon: Point[],
  segmentIndex: number
): WallDirection {
  // Calculate polygon centroid
  let centroidX = 0, centroidY = 0;
  for (const p of polygon) {
    centroidX += p.x;
    centroidY += p.y;
  }
  centroidX /= polygon.length;
  centroidY /= polygon.length;

  // Get wall midpoint
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Calculate normal direction (pointing outward from polygon)
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Normal perpendicular to wall
  let normalX = -dy;
  let normalY = dx;

  // Check if normal points away from centroid (outward)
  const toCentroidX = centroidX - midX;
  const toCentroidY = centroidY - midY;
  const dotProduct = normalX * toCentroidX + normalY * toCentroidY;

  // If normal points toward centroid, flip it
  if (dotProduct > 0) {
    normalX = -normalX;
    normalY = -normalY;
  }

  // Determine direction based on outward-facing normal
  if (Math.abs(normalX) > Math.abs(normalY)) {
    return normalX > 0 ? 'east' : 'west';
  } else {
    return normalY > 0 ? 'south' : 'north';
  }
}

// Find room IDs that share a wall segment
function findSharedRoomIds(
  wallStart: Point,
  wallEnd: Point,
  excludeRoomId: string,
  allRooms: RoomGeometry[]
): string[] {
  const sharedIds: string[] = [];
  const tolerance = 0.1; // 0.1 foot tolerance for matching

  for (const room of allRooms) {
    if (room.id === excludeRoomId) continue;

    const originX = room.origin_x_ft ?? 0;
    const originY = room.origin_y_ft ?? 0;

    for (let i = 0; i < room.polygon.length; i++) {
      const otherStart = {
        x: room.polygon[i].x + originX,
        y: room.polygon[i].y + originY
      };
      const otherEnd = {
        x: room.polygon[(i + 1) % room.polygon.length].x + originX,
        y: room.polygon[(i + 1) % room.polygon.length].y + originY
      };

      // Check if walls overlap (considering both directions)
      if (wallsOverlap(wallStart, wallEnd, otherStart, otherEnd, tolerance)) {
        sharedIds.push(room.id);
        break;
      }
    }
  }

  return sharedIds;
}

// Check if two wall segments overlap
function wallsOverlap(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
  tolerance: number
): boolean {
  // Check if walls are collinear and overlapping
  // First, check if points are close enough to be considered the same line

  // Check forward match (a1-a2 matches b1-b2)
  const forwardMatch = (
    pointsClose(a1, b1, tolerance) && pointsClose(a2, b2, tolerance)
  );

  // Check reverse match (a1-a2 matches b2-b1)
  const reverseMatch = (
    pointsClose(a1, b2, tolerance) && pointsClose(a2, b1, tolerance)
  );

  if (forwardMatch || reverseMatch) return true;

  // Check for partial overlap on collinear segments
  if (areSegmentsCollinear(a1, a2, b1, b2, tolerance)) {
    return segmentsOverlap(a1, a2, b1, b2);
  }

  return false;
}

// Check if two points are close within tolerance
function pointsClose(p1: Point, p2: Point, tolerance: number): boolean {
  return Math.abs(p1.x - p2.x) <= tolerance && Math.abs(p1.y - p2.y) <= tolerance;
}

// Check if two segments are collinear
function areSegmentsCollinear(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
  tolerance: number
): boolean {
  // Check if all four points lie on the same line
  // Using cross product to check collinearity
  const cross1 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const cross2 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);

  const length = distanceBetweenPoints(a1, a2);
  const normalizedTolerance = tolerance * length;

  return Math.abs(cross1) <= normalizedTolerance && Math.abs(cross2) <= normalizedTolerance;
}

// Check if two collinear segments overlap
function segmentsOverlap(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  // Project onto x or y axis depending on segment orientation
  const dx = Math.abs(a2.x - a1.x);
  const dy = Math.abs(a2.y - a1.y);

  if (dx > dy) {
    // Horizontal-ish, project onto x-axis
    const aMin = Math.min(a1.x, a2.x);
    const aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x);
    const bMax = Math.max(b1.x, b2.x);
    return aMin < bMax && bMin < aMax;
  } else {
    // Vertical-ish, project onto y-axis
    const aMin = Math.min(a1.y, a2.y);
    const aMax = Math.max(a1.y, a2.y);
    const bMin = Math.min(b1.y, b2.y);
    const bMax = Math.max(b1.y, b2.y);
    return aMin < bMax && bMin < aMax;
  }
}

// Hit test: check if a point is near a wall segment
export function pointNearWall(
  point: Point,
  wall: WallEntity,
  tolerancePx: number,
  scale: number
): boolean {
  const toleranceFt = tolerancePx / (20 * scale); // Convert pixels to feet
  return pointToSegmentDistance(point, wall.startPoint, wall.endPoint) <= toleranceFt;
}

// Calculate perpendicular distance from point to line segment
export function pointToSegmentDistance(point: Point, segStart: Point, segEnd: Point): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // Segment is a point
    return distanceBetweenPoints(point, segStart);
  }

  // Project point onto line, clamped to segment
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projectedPoint = {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy
  };

  return distanceBetweenPoints(point, projectedPoint);
}

// Extract all walls from multiple rooms, merging shared walls
export function extractAllWalls(rooms: RoomGeometry[]): WallEntity[] {
  const allWalls: WallEntity[] = [];
  const processedPairs = new Set<string>();

  for (const room of rooms) {
    const roomWalls = extractWallsFromRoom(room, rooms);

    for (const wall of roomWalls) {
      // Create a unique key for shared wall pairs to avoid duplicates
      if (wall.isShared) {
        const sortedRoomIds = [...wall.roomIds].sort();
        const pairKey = `${sortedRoomIds.join('-')}-${wall.wallIndex}`;

        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);
      }

      allWalls.push(wall);
    }
  }

  return allWalls;
}

// Move a wall perpendicular to its orientation
export function moveWallPerpendicular(
  wall: WallEntity,
  deltaFt: number,
  rooms: RoomGeometry[]
): { updatedWall: WallEntity; updatedRooms: RoomGeometry[] } {
  const updatedWall = { ...wall, updated_at: new Date().toISOString() };
  const updatedRooms: RoomGeometry[] = [];

  // Calculate perpendicular movement vector
  let moveX = 0, moveY = 0;

  if (wall.orientation === 'horizontal') {
    // Horizontal wall moves vertically
    moveY = deltaFt;
  } else {
    // Vertical wall moves horizontally
    moveX = deltaFt;
  }

  // Update wall endpoints
  updatedWall.startPoint = {
    x: wall.startPoint.x + moveX,
    y: wall.startPoint.y + moveY
  };
  updatedWall.endPoint = {
    x: wall.endPoint.x + moveX,
    y: wall.endPoint.y + moveY
  };

  // Update affected rooms
  for (const roomId of wall.roomIds) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) continue;

    const updatedRoom = { ...room, updated_at: new Date().toISOString() };
    const newPolygon = [...room.polygon];

    // Find and update the corresponding wall segment in the room polygon
    if (wall.parentRoomId === roomId && wall.wallIndex !== undefined) {
      const originX = room.origin_x_ft ?? 0;
      const originY = room.origin_y_ft ?? 0;

      // Update the two points that define this wall
      const idx1 = wall.wallIndex;
      const idx2 = (wall.wallIndex + 1) % newPolygon.length;

      newPolygon[idx1] = {
        x: newPolygon[idx1].x + moveX,
        y: newPolygon[idx1].y + moveY
      };
      newPolygon[idx2] = {
        x: newPolygon[idx2].x + moveX,
        y: newPolygon[idx2].y + moveY
      };
    }

    // Recalculate room dimensions from polygon
    const bounds = getPolygonBounds(newPolygon);
    updatedRoom.polygon = newPolygon;
    updatedRoom.width_ft = bounds.maxX - bounds.minX;
    updatedRoom.length_ft = bounds.maxY - bounds.minY;

    updatedRooms.push(updatedRoom);
  }

  return { updatedWall, updatedRooms };
}

// Calculate wall move constraints
export function calculateWallMoveConstraints(
  wall: WallEntity,
  rooms: RoomGeometry[],
  minRoomSize: number = 2 // Minimum room dimension in feet
): { min: number; max: number } {
  let minPos = -Infinity;
  let maxPos = Infinity;

  for (const roomId of wall.roomIds) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) continue;

    const originX = room.origin_x_ft ?? 0;
    const originY = room.origin_y_ft ?? 0;
    const bounds = getPolygonBounds(room.polygon);

    if (wall.orientation === 'horizontal') {
      // Wall moves vertically - constrain by room height
      const roomTop = bounds.minY + originY;
      const roomBottom = bounds.maxY + originY;
      const currentY = wall.startPoint.y;

      // Can't move past room boundaries minus minimum size
      minPos = Math.max(minPos, roomTop + minRoomSize);
      maxPos = Math.min(maxPos, roomBottom - minRoomSize);
    } else {
      // Wall moves horizontally - constrain by room width
      const roomLeft = bounds.minX + originX;
      const roomRight = bounds.maxX + originX;

      minPos = Math.max(minPos, roomLeft + minRoomSize);
      maxPos = Math.min(maxPos, roomRight - minRoomSize);
    }
  }

  return { min: minPos, max: maxPos };
}

// Snap value to grid
export function snapToGrid(value: number, gridSize: number = 0.5): number {
  return Math.round(value / gridSize) * gridSize;
}
