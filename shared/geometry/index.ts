/**
 * Shared Geometry Normalization Module
 *
 * Provides canonical geometry operations for voice-first sketch creation.
 * All coordinates use FEET as the canonical unit.
 *
 * KEY RESPONSIBILITIES:
 * - Validate polygon closure (>= 3 points)
 * - Normalize winding order (counter-clockwise)
 * - Snap near-zero decimals
 * - Derive wall segments from polygon edges
 * - Validate openings align to walls
 * - Ensure global coordinates are consistent
 *
 * See: docs/sketch-esx-architecture.md for full architecture details.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  index: number;
  start: Point;
  end: Point;
  lengthFt: number;
  direction: 'north' | 'south' | 'east' | 'west' | 'diagonal';
  normalizedDirection: Point; // Unit vector perpendicular to wall (outward)
}

export interface Opening {
  openingType: string;
  wallIndex: number;
  offsetFromVertexFt: number;
  widthFt: number;
  heightFt: number;
  sillHeightFt?: number;
}

export interface SketchGeometry {
  polygonFt: Point[];
  originXFt: number;
  originYFt: number;
  ceilingHeightFt: number;
  shapeType: 'RECT' | 'L' | 'T' | 'POLY';
  levelName: string;
  openings?: Opening[];
}

export interface NormalizedGeometry extends SketchGeometry {
  walls: Wall[];
  perimeterFt: number;
  areaFt: number;
  isValid: boolean;
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  warnings: ValidationWarning[];
  normalizedGeometry?: NormalizedGeometry;
}

// ============================================
// CONSTANTS
// ============================================

const SNAP_THRESHOLD = 0.001; // Feet (about 0.012 inches)
const MIN_POLYGON_POINTS = 3;
const MIN_WALL_LENGTH = 0.5; // Minimum wall length in feet (6 inches)

// ============================================
// CORE GEOMETRY FUNCTIONS
// ============================================

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate signed area of polygon (positive = CCW, negative = CW)
 * Uses the shoelace formula
 */
export function signedArea(polygon: Point[]): number {
  if (polygon.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

/**
 * Check if polygon is wound counter-clockwise
 */
export function isCounterClockwise(polygon: Point[]): boolean {
  return signedArea(polygon) > 0;
}

/**
 * Reverse polygon winding order
 */
export function reversePolygon(polygon: Point[]): Point[] {
  return [...polygon].reverse();
}

/**
 * Ensure polygon is wound counter-clockwise
 */
export function ensureCCW(polygon: Point[]): Point[] {
  if (isCounterClockwise(polygon)) {
    return polygon;
  }
  return reversePolygon(polygon);
}

/**
 * Snap near-zero values to zero
 */
export function snapToZero(value: number, threshold = SNAP_THRESHOLD): number {
  return Math.abs(value) < threshold ? 0 : value;
}

/**
 * Snap point coordinates to avoid floating point issues
 */
export function snapPoint(point: Point, threshold = SNAP_THRESHOLD): Point {
  return {
    x: snapToZero(point.x, threshold),
    y: snapToZero(point.y, threshold),
  };
}

/**
 * Snap all polygon points
 */
export function snapPolygon(polygon: Point[], threshold = SNAP_THRESHOLD): Point[] {
  return polygon.map(p => snapPoint(p, threshold));
}

/**
 * Calculate perimeter of polygon
 */
export function calculatePerimeter(polygon: Point[]): number {
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    perimeter += distance(polygon[i], polygon[j]);
  }
  return perimeter;
}

/**
 * Calculate area of polygon (absolute value)
 */
export function calculateArea(polygon: Point[]): number {
  return Math.abs(signedArea(polygon));
}

/**
 * Determine wall direction based on start and end points
 */
export function getWallDirection(start: Point, end: Point): Wall['direction'] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Snap small differences
  const snappedDx = snapToZero(dx, 0.01);
  const snappedDy = snapToZero(dy, 0.01);

  if (snappedDx === 0 && snappedDy > 0) return 'north';
  if (snappedDx === 0 && snappedDy < 0) return 'south';
  if (snappedDy === 0 && snappedDx > 0) return 'east';
  if (snappedDy === 0 && snappedDx < 0) return 'west';
  return 'diagonal';
}

/**
 * Calculate outward-facing normal for a wall segment
 * For CCW polygon, outward normal is perpendicular to the right
 */
export function getWallNormal(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  // Perpendicular to the right (for CCW winding)
  return {
    x: dy / length,
    y: -dx / length,
  };
}

// ============================================
// WALL DERIVATION
// ============================================

/**
 * Derive wall segments from polygon edges
 */
export function deriveWallsFromPolygon(polygon: Point[]): Wall[] {
  if (polygon.length < MIN_POLYGON_POINTS) {
    return [];
  }

  const walls: Wall[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const lengthFt = distance(start, end);

    walls.push({
      index: i,
      start,
      end,
      lengthFt,
      direction: getWallDirection(start, end),
      normalizedDirection: getWallNormal(start, end),
    });
  }

  return walls;
}

// ============================================
// NORMALIZATION
// ============================================

/**
 * Normalize sketch geometry for canonical storage and export
 *
 * Operations performed:
 * 1. Validate polygon has >= 3 points
 * 2. Snap near-zero coordinates
 * 3. Ensure CCW winding order
 * 4. Derive walls from polygon
 * 5. Calculate perimeter and area
 */
export function normalizeSketchGeometry(geometry: SketchGeometry): NormalizedGeometry {
  // Snap polygon coordinates
  let polygon = snapPolygon(geometry.polygonFt);

  // Ensure CCW winding
  polygon = ensureCCW(polygon);

  // Derive walls
  const walls = deriveWallsFromPolygon(polygon);

  // Calculate metrics
  const perimeterFt = calculatePerimeter(polygon);
  const areaFt = calculateArea(polygon);

  return {
    ...geometry,
    polygonFt: polygon,
    walls,
    perimeterFt,
    areaFt,
    isValid: polygon.length >= MIN_POLYGON_POINTS,
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate opening position on wall
 */
function validateOpening(opening: Opening, walls: Wall[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check wall index is valid
  if (opening.wallIndex < 0 || opening.wallIndex >= walls.length) {
    warnings.push({
      code: 'INVALID_WALL_INDEX',
      message: `Opening references wall index ${opening.wallIndex} but polygon only has ${walls.length} walls`,
      severity: 'error',
      field: `openings[${opening.wallIndex}].wallIndex`,
    });
    return warnings;
  }

  const wall = walls[opening.wallIndex];

  // Check offset is within wall bounds
  if (opening.offsetFromVertexFt < 0) {
    warnings.push({
      code: 'NEGATIVE_OFFSET',
      message: `Opening offset ${opening.offsetFromVertexFt}ft is negative`,
      severity: 'error',
      field: `openings[${opening.wallIndex}].offsetFromVertexFt`,
      suggestion: 'Offset should be a positive distance from wall start',
    });
  }

  // Check opening fits on wall
  const requiredSpace = opening.offsetFromVertexFt + opening.widthFt;
  if (requiredSpace > wall.lengthFt) {
    warnings.push({
      code: 'OPENING_EXCEEDS_WALL',
      message: `Opening requires ${requiredSpace.toFixed(2)}ft but wall is only ${wall.lengthFt.toFixed(2)}ft`,
      severity: 'error',
      field: `openings[${opening.wallIndex}]`,
      suggestion: 'Reduce opening width or offset',
    });
  }

  // Warn about openings that nearly touch wall end
  const remainingSpace = wall.lengthFt - requiredSpace;
  if (remainingSpace > 0 && remainingSpace < 0.5) {
    warnings.push({
      code: 'OPENING_NEAR_CORNER',
      message: `Opening ends only ${remainingSpace.toFixed(2)}ft from wall corner`,
      severity: 'warning',
      field: `openings[${opening.wallIndex}]`,
      suggestion: 'Consider adjusting opening position',
    });
  }

  return warnings;
}

/**
 * Validate polygon structure
 */
function validatePolygon(polygon: Point[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check minimum points
  if (polygon.length < MIN_POLYGON_POINTS) {
    warnings.push({
      code: 'INSUFFICIENT_POINTS',
      message: `Polygon has only ${polygon.length} points, minimum is ${MIN_POLYGON_POINTS}`,
      severity: 'error',
      field: 'polygonFt',
    });
    return warnings;
  }

  // Check for duplicate consecutive points
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const d = distance(polygon[i], polygon[j]);
    if (d < MIN_WALL_LENGTH) {
      warnings.push({
        code: 'SHORT_WALL',
        message: `Wall ${i} is only ${d.toFixed(3)}ft, minimum is ${MIN_WALL_LENGTH}ft`,
        severity: 'warning',
        field: `polygonFt[${i}]`,
        suggestion: 'Consider removing duplicate or nearly duplicate points',
      });
    }
  }

  // Check for self-intersection (simplified check)
  // A full implementation would check all edge pairs, but that's O(n^2)
  // For now, we just check that area is positive
  const area = calculateArea(polygon);
  if (area < 0.1) {
    warnings.push({
      code: 'DEGENERATE_POLYGON',
      message: `Polygon area is only ${area.toFixed(3)} sq ft`,
      severity: 'warning',
      field: 'polygonFt',
      suggestion: 'Check for self-intersecting edges',
    });
  }

  return warnings;
}

/**
 * Validate sketch geometry for export
 *
 * Returns structured warnings, not silent failures.
 */
export function validateSketchForExport(geometry: SketchGeometry): ValidationResult {
  const warnings: ValidationWarning[] = [];

  // Validate polygon
  warnings.push(...validatePolygon(geometry.polygonFt));

  // If polygon is invalid, don't continue
  const hasPolygonErrors = warnings.some(w => w.severity === 'error');
  if (hasPolygonErrors) {
    return {
      isValid: false,
      warnings,
    };
  }

  // Normalize geometry
  const normalizedGeometry = normalizeSketchGeometry(geometry);

  // Validate openings
  if (geometry.openings) {
    for (const opening of geometry.openings) {
      warnings.push(...validateOpening(opening, normalizedGeometry.walls));
    }
  }

  // Validate ceiling height
  if (geometry.ceilingHeightFt < 6) {
    warnings.push({
      code: 'LOW_CEILING',
      message: `Ceiling height ${geometry.ceilingHeightFt}ft is unusually low`,
      severity: 'warning',
      field: 'ceilingHeightFt',
    });
  }

  if (geometry.ceilingHeightFt > 30) {
    warnings.push({
      code: 'HIGH_CEILING',
      message: `Ceiling height ${geometry.ceilingHeightFt}ft is unusually high`,
      severity: 'warning',
      field: 'ceilingHeightFt',
    });
  }

  // Validate origin
  if (geometry.originXFt < -1000 || geometry.originXFt > 1000) {
    warnings.push({
      code: 'UNUSUAL_ORIGIN_X',
      message: `Origin X ${geometry.originXFt}ft is unusually large`,
      severity: 'info',
      field: 'originXFt',
    });
  }

  if (geometry.originYFt < -1000 || geometry.originYFt > 1000) {
    warnings.push({
      code: 'UNUSUAL_ORIGIN_Y',
      message: `Origin Y ${geometry.originYFt}ft is unusually large`,
      severity: 'info',
      field: 'originYFt',
    });
  }

  const hasErrors = warnings.some(w => w.severity === 'error');

  return {
    isValid: !hasErrors,
    warnings,
    normalizedGeometry: hasErrors ? undefined : normalizedGeometry,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a rectangular polygon from width and length
 * Origin at (0, 0), vertices ordered CCW
 */
export function generateRectangularPolygon(widthFt: number, lengthFt: number): Point[] {
  return [
    { x: 0, y: 0 },           // SW corner
    { x: widthFt, y: 0 },     // SE corner
    { x: widthFt, y: lengthFt }, // NE corner
    { x: 0, y: lengthFt },    // NW corner
  ];
}

/**
 * Generate L-shaped polygon
 * Main rectangle with a notch cut from one corner
 */
export function generateLShapePolygon(
  widthFt: number,
  lengthFt: number,
  notchCorner: 'northeast' | 'northwest' | 'southeast' | 'southwest',
  notchWidthFt: number,
  notchLengthFt: number
): Point[] {
  // Start with rectangle and cut out the notch
  // CCW winding order
  switch (notchCorner) {
    case 'northeast':
      return [
        { x: 0, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt - notchLengthFt },
        { x: widthFt - notchWidthFt, y: lengthFt - notchLengthFt },
        { x: widthFt - notchWidthFt, y: lengthFt },
        { x: 0, y: lengthFt },
      ];
    case 'northwest':
      return [
        { x: 0, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt },
        { x: notchWidthFt, y: lengthFt },
        { x: notchWidthFt, y: lengthFt - notchLengthFt },
        { x: 0, y: lengthFt - notchLengthFt },
      ];
    case 'southeast':
      return [
        { x: 0, y: 0 },
        { x: widthFt - notchWidthFt, y: 0 },
        { x: widthFt - notchWidthFt, y: notchLengthFt },
        { x: widthFt, y: notchLengthFt },
        { x: widthFt, y: lengthFt },
        { x: 0, y: lengthFt },
      ];
    case 'southwest':
      return [
        { x: notchWidthFt, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt },
        { x: 0, y: lengthFt },
        { x: 0, y: notchLengthFt },
        { x: notchWidthFt, y: notchLengthFt },
      ];
    default:
      return generateRectangularPolygon(widthFt, lengthFt);
  }
}

/**
 * Generate T-shaped polygon
 * Main rectangle with a stem extending from one wall
 */
export function generateTShapePolygon(
  widthFt: number,
  lengthFt: number,
  stemWall: 'north' | 'south' | 'east' | 'west',
  stemWidthFt: number,
  stemLengthFt: number,
  stemPositionFt: number
): Point[] {
  // CCW winding order with stem extending outward
  switch (stemWall) {
    case 'north':
      return [
        { x: 0, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt },
        { x: stemPositionFt + stemWidthFt, y: lengthFt },
        { x: stemPositionFt + stemWidthFt, y: lengthFt + stemLengthFt },
        { x: stemPositionFt, y: lengthFt + stemLengthFt },
        { x: stemPositionFt, y: lengthFt },
        { x: 0, y: lengthFt },
      ];
    case 'south':
      return [
        { x: stemPositionFt, y: 0 },
        { x: stemPositionFt, y: -stemLengthFt },
        { x: stemPositionFt + stemWidthFt, y: -stemLengthFt },
        { x: stemPositionFt + stemWidthFt, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt },
        { x: 0, y: lengthFt },
        { x: 0, y: 0 },
      ];
    case 'east':
      return [
        { x: 0, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: stemPositionFt },
        { x: widthFt + stemLengthFt, y: stemPositionFt },
        { x: widthFt + stemLengthFt, y: stemPositionFt + stemWidthFt },
        { x: widthFt, y: stemPositionFt + stemWidthFt },
        { x: widthFt, y: lengthFt },
        { x: 0, y: lengthFt },
      ];
    case 'west':
      return [
        { x: 0, y: stemPositionFt + stemWidthFt },
        { x: -stemLengthFt, y: stemPositionFt + stemWidthFt },
        { x: -stemLengthFt, y: stemPositionFt },
        { x: 0, y: stemPositionFt },
        { x: 0, y: 0 },
        { x: widthFt, y: 0 },
        { x: widthFt, y: lengthFt },
        { x: 0, y: lengthFt },
      ];
    default:
      return generateRectangularPolygon(widthFt, lengthFt);
  }
}

/**
 * Convert cardinal direction to wall index for a rectangular room
 * Assumes CCW winding starting from SW corner
 */
export function cardinalToWallIndex(direction: 'north' | 'south' | 'east' | 'west'): number {
  switch (direction) {
    case 'south': return 0; // Bottom edge
    case 'east': return 1;  // Right edge
    case 'north': return 2; // Top edge
    case 'west': return 3;  // Left edge
  }
}

/**
 * Calculate zone dimensions from normalized geometry
 * Returns Xactimate-compatible dimension calculations
 */
export function calculateZoneDimensions(normalized: NormalizedGeometry): {
  sfFloor: number;
  syFloor: number;
  lfFloorPerim: number;
  sfCeiling: number;
  lfCeilingPerim: number;
  sfWalls: number;
  sfWallsCeiling: number;
  sfLongWall: number;
  sfShortWall: number;
  sfTotal: number;
} {
  const sfFloor = normalized.areaFt;
  const lfPerim = normalized.perimeterFt;

  // Find longest and shortest walls
  const wallLengths = normalized.walls.map(w => w.lengthFt).sort((a, b) => b - a);
  const longWallLength = wallLengths[0] || 0;
  const shortWallLength = wallLengths[wallLengths.length - 1] || 0;

  const height = normalized.ceilingHeightFt;

  return {
    sfFloor,
    syFloor: sfFloor / 9,
    lfFloorPerim: lfPerim,
    sfCeiling: sfFloor,
    lfCeilingPerim: lfPerim,
    sfWalls: lfPerim * height,
    sfWallsCeiling: (lfPerim * height) + sfFloor,
    sfLongWall: longWallLength * height,
    sfShortWall: shortWallLength * height,
    sfTotal: sfFloor + (lfPerim * height) + sfFloor, // Floor + walls + ceiling
  };
}
