// Polygon Math Utilities for Room Geometry
import type { Point, RoomShape, WallDirection, PositionType } from '../types/geometry';

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

// Generate L-shape polygon
export function generateLShapePolygon(
  width_ft: number,
  length_ft: number,
  cutout_width: number = width_ft / 2,
  cutout_length: number = length_ft / 2
): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width_ft, y: 0 },
    { x: width_ft, y: length_ft - cutout_length },
    { x: width_ft - cutout_width, y: length_ft - cutout_length },
    { x: width_ft - cutout_width, y: length_ft },
    { x: 0, y: length_ft },
  ];
}

// Generate T-shape polygon
export function generateTShapePolygon(
  width_ft: number,
  length_ft: number,
  stem_width: number = width_ft / 3
): Point[] {
  const stemOffset = (width_ft - stem_width) / 2;
  const crossbarHeight = length_ft / 3;

  return [
    { x: 0, y: 0 },
    { x: width_ft, y: 0 },
    { x: width_ft, y: crossbarHeight },
    { x: stemOffset + stem_width, y: crossbarHeight },
    { x: stemOffset + stem_width, y: length_ft },
    { x: stemOffset, y: length_ft },
    { x: stemOffset, y: crossbarHeight },
    { x: 0, y: crossbarHeight },
  ];
}

// Generate polygon based on shape
export function generatePolygon(
  shape: RoomShape,
  width_ft: number,
  length_ft: number
): Point[] {
  switch (shape) {
    case 'rectangle':
      return generateRectanglePolygon(width_ft, length_ft);
    case 'l_shape':
      return generateLShapePolygon(width_ft, length_ft);
    case 't_shape':
      return generateTShapePolygon(width_ft, length_ft);
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
export function calculatePositionInFeet(
  position: PositionType,
  wallLength: number,
  elementWidth: number
): number {
  if (typeof position === 'number') {
    return position;
  }

  switch (position) {
    case 'left':
      return elementWidth / 2 + 0.5; // 6 inches from corner
    case 'center':
      return wallLength / 2;
    case 'right':
      return wallLength - elementWidth / 2 - 0.5;
    default:
      return wallLength / 2;
  }
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
