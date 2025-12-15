// Polygon Math Utilities for Room Geometry
import type { Point, RoomShape, WallDirection, PositionType, PositionFromType, LShapeConfig, TShapeConfig, CornerPosition } from '../types/geometry';

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
