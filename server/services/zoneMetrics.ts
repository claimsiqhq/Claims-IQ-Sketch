/**
 * Zone Metrics Module - Claims IQ Sketch v2
 *
 * Computes derived metrics from zone geometry.
 * These metrics drive quantity calculations for line items.
 *
 * DESIGN DECISIONS:
 * - Metrics are computed on-demand, not stored redundantly
 * - Supports both rectangular (L x W) and polygon-based zones
 * - Missing wall deductions are computed but optional
 * - Default height of 8ft if not specified (industry standard)
 */

import type { EstimateZone, EstimateMissingWall, EstimateSubroom, ZoneDimensions } from '../../shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * ZoneMetrics - computed values from zone geometry
 * These are the canonical metrics used by QuantityEngine
 */
export interface ZoneMetrics {
  // Core surface areas
  floorSquareFeet: number;
  ceilingSquareFeet: number;
  wallSquareFeet: number;           // Total wall area (all 4 walls for rectangular)
  wallSquareFeetNet: number;        // Walls minus openings
  wallsAndCeilingSquareFeet: number;

  // Linear measurements
  perimeterLinearFeet: number;

  // Individual walls (for rectangular zones)
  longWallSquareFeet: number;
  shortWallSquareFeet: number;

  // Height
  heightFeet: number;               // Actual or default
  defaultHeightUsed: boolean;       // Whether default was applied

  // Opening deductions
  openingSquareFeet: number;        // Total area deducted for doors/windows
  openingCount: number;             // Number of openings

  // Subroom adjustments
  subroomNetSquareFeet: number;     // Net adjustment from subrooms

  // Roof-specific (when applicable)
  roofSquareFeet?: number;
  roofSquares?: number;             // Roofing squares (100 SF)
  roofPitchMultiplier?: number;

  // Source tracking (for explainability)
  computedFrom: 'dimensions' | 'polygon' | 'stored' | 'unknown';
  computedAt: Date;
}

/**
 * Zone data needed for metric computation
 * Can come from database or be constructed for testing
 */
export interface ZoneForMetrics {
  id: string;
  zoneType: string;
  lengthFt?: number | string | null;
  widthFt?: number | string | null;
  heightFt?: number | string | null;
  pitch?: string | null;
  pitchMultiplier?: number | string | null;
  dimensions?: ZoneDimensions | null;
  sketchPolygon?: any | null;
}

export interface MissingWallForMetrics {
  widthFt: number | string;
  heightFt: number | string;
  quantity?: number;
}

export interface SubroomForMetrics {
  lengthFt: number | string;
  widthFt: number | string;
  heightFt?: number | string | null;
  isAddition: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/** Default ceiling height when not specified (industry standard) */
export const DEFAULT_HEIGHT_FEET = 8.0;

/** Common pitch multipliers for roofing */
export const PITCH_MULTIPLIERS: Record<string, number> = {
  'flat': 1.0,
  '1/12': 1.003,
  '2/12': 1.014,
  '3/12': 1.031,
  '4/12': 1.054,
  '5/12': 1.083,
  '6/12': 1.118,
  '7/12': 1.158,
  '8/12': 1.202,
  '9/12': 1.250,
  '10/12': 1.302,
  '11/12': 1.357,
  '12/12': 1.414,
};

// ============================================
// CORE COMPUTATION FUNCTIONS
// ============================================

/**
 * Compute all metrics for a zone
 * This is the main entry point for zone metric computation
 */
export function computeZoneMetrics(
  zone: ZoneForMetrics,
  missingWalls: MissingWallForMetrics[] = [],
  subrooms: SubroomForMetrics[] = []
): ZoneMetrics {
  // Determine computation source
  const hasStoredDimensions = zone.dimensions && Object.keys(zone.dimensions).length > 0;
  const hasPolygon = zone.sketchPolygon && zone.sketchPolygon.coordinates;
  const hasManualDimensions = zone.lengthFt && zone.widthFt;

  let computedFrom: ZoneMetrics['computedFrom'] = 'unknown';

  // Priority: stored > polygon > manual dimensions
  if (hasStoredDimensions && zone.dimensions?.sfFloor) {
    computedFrom = 'stored';
    return computeFromStoredDimensions(zone, missingWalls, subrooms);
  }

  if (hasPolygon) {
    computedFrom = 'polygon';
    return computeFromPolygon(zone, missingWalls, subrooms);
  }

  if (hasManualDimensions) {
    computedFrom = 'dimensions';
    return computeFromDimensions(zone, missingWalls, subrooms);
  }

  // Return zero metrics if no geometry available
  return createEmptyMetrics('unknown');
}

/**
 * Compute metrics from stored dimensions JSONB
 */
function computeFromStoredDimensions(
  zone: ZoneForMetrics,
  missingWalls: MissingWallForMetrics[],
  subrooms: SubroomForMetrics[]
): ZoneMetrics {
  const dims = zone.dimensions!;
  const height = parseFloat(String(zone.heightFt)) || DEFAULT_HEIGHT_FEET;

  // Calculate opening deductions
  const { totalOpeningArea, openingCount } = calculateOpeningDeductions(missingWalls);

  // Calculate subroom adjustments
  const subroomNetSf = calculateSubroomAdjustments(subrooms);

  // Use stored values where available, compute otherwise
  const floorSf = (dims.sfFloor ?? 0) + subroomNetSf;
  const ceilingSf = dims.sfCeiling ?? floorSf;
  const wallSf = dims.sfWalls ?? 0;
  const wallSfNet = Math.max(0, wallSf - totalOpeningArea);
  const perimeter = dims.lfFloorPerim ?? calculatePerimeterFromArea(floorSf);

  return {
    floorSquareFeet: round(floorSf),
    ceilingSquareFeet: round(ceilingSf),
    wallSquareFeet: round(wallSf),
    wallSquareFeetNet: round(wallSfNet),
    wallsAndCeilingSquareFeet: round(wallSfNet + ceilingSf),
    perimeterLinearFeet: round(perimeter),
    longWallSquareFeet: round(dims.sfLongWall ?? 0),
    shortWallSquareFeet: round(dims.sfShortWall ?? 0),
    heightFeet: height,
    defaultHeightUsed: !zone.heightFt,
    openingSquareFeet: round(totalOpeningArea),
    openingCount,
    subroomNetSquareFeet: round(subroomNetSf),
    roofSquareFeet: dims.sfSkRoof,
    roofSquares: dims.skRoofSquares,
    roofPitchMultiplier: parseFloat(String(zone.pitchMultiplier)) || undefined,
    computedFrom: 'stored',
    computedAt: new Date(),
  };
}

/**
 * Compute metrics from polygon geometry
 * Uses shoelace formula for area calculation
 */
function computeFromPolygon(
  zone: ZoneForMetrics,
  missingWalls: MissingWallForMetrics[],
  subrooms: SubroomForMetrics[]
): ZoneMetrics {
  const polygon = zone.sketchPolygon;
  const height = parseFloat(String(zone.heightFt)) || DEFAULT_HEIGHT_FEET;

  // Extract coordinates (assuming GeoJSON format)
  let coordinates: [number, number][] = [];

  if (polygon.coordinates && polygon.coordinates[0]) {
    coordinates = polygon.coordinates[0];
  } else if (Array.isArray(polygon) && polygon[0]) {
    coordinates = polygon;
  }

  if (coordinates.length < 3) {
    return createEmptyMetrics('polygon');
  }

  // Calculate area using shoelace formula
  const floorSfFromPolygon = calculatePolygonArea(coordinates);

  // Calculate perimeter
  const perimeterFromPolygon = calculatePolygonPerimeter(coordinates);

  // Calculate opening deductions
  const { totalOpeningArea, openingCount } = calculateOpeningDeductions(missingWalls);

  // Calculate subroom adjustments
  const subroomNetSf = calculateSubroomAdjustments(subrooms);

  const floorSf = floorSfFromPolygon + subroomNetSf;
  const wallSf = perimeterFromPolygon * height;
  const wallSfNet = Math.max(0, wallSf - totalOpeningArea);

  return {
    floorSquareFeet: round(floorSf),
    ceilingSquareFeet: round(floorSf),
    wallSquareFeet: round(wallSf),
    wallSquareFeetNet: round(wallSfNet),
    wallsAndCeilingSquareFeet: round(wallSfNet + floorSf),
    perimeterLinearFeet: round(perimeterFromPolygon),
    longWallSquareFeet: 0, // Not applicable for polygons
    shortWallSquareFeet: 0,
    heightFeet: height,
    defaultHeightUsed: !zone.heightFt,
    openingSquareFeet: round(totalOpeningArea),
    openingCount,
    subroomNetSquareFeet: round(subroomNetSf),
    computedFrom: 'polygon',
    computedAt: new Date(),
  };
}

/**
 * Compute metrics from length/width/height dimensions
 * Most common case for manually measured rooms
 */
function computeFromDimensions(
  zone: ZoneForMetrics,
  missingWalls: MissingWallForMetrics[],
  subrooms: SubroomForMetrics[]
): ZoneMetrics {
  const length = parseFloat(String(zone.lengthFt)) || 0;
  const width = parseFloat(String(zone.widthFt)) || 0;
  const height = parseFloat(String(zone.heightFt)) || DEFAULT_HEIGHT_FEET;
  const defaultHeightUsed = !zone.heightFt;

  // Base calculations for rectangular room
  const floorSfBase = length * width;
  const perimeter = 2 * (length + width);

  // Wall calculations
  const longWall = Math.max(length, width);
  const shortWall = Math.min(length, width);
  const longWallSf = longWall * height;
  const shortWallSf = shortWall * height;
  const wallSf = 2 * (longWallSf + shortWallSf);

  // Calculate opening deductions
  const { totalOpeningArea, openingCount } = calculateOpeningDeductions(missingWalls);

  // Calculate subroom adjustments
  const subroomNetSf = calculateSubroomAdjustments(subrooms);

  const floorSf = floorSfBase + subroomNetSf;
  const ceilingSf = floorSf; // Same as floor for flat ceiling
  const wallSfNet = Math.max(0, wallSf - totalOpeningArea);

  // Handle roof zones
  let roofSf: number | undefined;
  let roofSquares: number | undefined;
  let pitchMult: number | undefined;

  if (zone.zoneType === 'roof') {
    pitchMult = zone.pitchMultiplier
      ? parseFloat(String(zone.pitchMultiplier))
      : getPitchMultiplier(zone.pitch || '');
    roofSf = floorSfBase * (pitchMult || 1);
    roofSquares = roofSf / 100;
  }

  return {
    floorSquareFeet: round(floorSf),
    ceilingSquareFeet: round(ceilingSf),
    wallSquareFeet: round(wallSf),
    wallSquareFeetNet: round(wallSfNet),
    wallsAndCeilingSquareFeet: round(wallSfNet + ceilingSf),
    perimeterLinearFeet: round(perimeter),
    longWallSquareFeet: round(longWallSf),
    shortWallSquareFeet: round(shortWallSf),
    heightFeet: height,
    defaultHeightUsed,
    openingSquareFeet: round(totalOpeningArea),
    openingCount,
    subroomNetSquareFeet: round(subroomNetSf),
    roofSquareFeet: roofSf ? round(roofSf) : undefined,
    roofSquares: roofSquares ? round(roofSquares) : undefined,
    roofPitchMultiplier: pitchMult,
    computedFrom: 'dimensions',
    computedAt: new Date(),
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate total opening deductions from missing walls
 */
function calculateOpeningDeductions(missingWalls: MissingWallForMetrics[]): {
  totalOpeningArea: number;
  openingCount: number;
} {
  let totalOpeningArea = 0;
  let openingCount = 0;

  for (const wall of missingWalls) {
    const width = parseFloat(String(wall.widthFt)) || 0;
    const height = parseFloat(String(wall.heightFt)) || 0;
    const qty = wall.quantity || 1;

    totalOpeningArea += width * height * qty;
    openingCount += qty;
  }

  return { totalOpeningArea, openingCount };
}

/**
 * Calculate net adjustment from subrooms
 * Additions add area, subtractions remove area
 */
function calculateSubroomAdjustments(subrooms: SubroomForMetrics[]): number {
  let netAdjustment = 0;

  for (const subroom of subrooms) {
    const length = parseFloat(String(subroom.lengthFt)) || 0;
    const width = parseFloat(String(subroom.widthFt)) || 0;
    const area = length * width;

    if (subroom.isAddition) {
      netAdjustment += area;
    } else {
      netAdjustment -= area;
    }
  }

  return netAdjustment;
}

/**
 * Calculate polygon area using shoelace formula
 * Coordinates should be in feet
 */
function calculatePolygonArea(coordinates: [number, number][]): number {
  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }

  return Math.abs(area / 2);
}

/**
 * Calculate polygon perimeter
 */
function calculatePolygonPerimeter(coordinates: [number, number][]): number {
  let perimeter = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = coordinates[j][0] - coordinates[i][0];
    const dy = coordinates[j][1] - coordinates[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return perimeter;
}

/**
 * Estimate perimeter from floor area (assumes square-ish room)
 * Used when perimeter is not directly available
 */
function calculatePerimeterFromArea(area: number): number {
  // Assume roughly square room: perimeter = 4 * sqrt(area)
  return 4 * Math.sqrt(area);
}

/**
 * Get pitch multiplier from pitch string
 */
function getPitchMultiplier(pitch: string): number {
  if (!pitch) return 1.0;

  // Try direct lookup
  const normalized = pitch.toLowerCase().replace(/\s+/g, '');
  if (PITCH_MULTIPLIERS[normalized]) {
    return PITCH_MULTIPLIERS[normalized];
  }

  // Parse "X/12" or "X:12" format
  const match = pitch.match(/(\d+)[/:]\s*12/);
  if (match) {
    const rise = parseInt(match[1]);
    // Multiplier = sqrt(1 + (rise/12)^2)
    return Math.sqrt(1 + Math.pow(rise / 12, 2));
  }

  return 1.0;
}

/**
 * Create empty metrics when no geometry available
 */
function createEmptyMetrics(computedFrom: ZoneMetrics['computedFrom']): ZoneMetrics {
  return {
    floorSquareFeet: 0,
    ceilingSquareFeet: 0,
    wallSquareFeet: 0,
    wallSquareFeetNet: 0,
    wallsAndCeilingSquareFeet: 0,
    perimeterLinearFeet: 0,
    longWallSquareFeet: 0,
    shortWallSquareFeet: 0,
    heightFeet: DEFAULT_HEIGHT_FEET,
    defaultHeightUsed: true,
    openingSquareFeet: 0,
    openingCount: 0,
    subroomNetSquareFeet: 0,
    computedFrom,
    computedAt: new Date(),
  };
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================
// METRIC RETRIEVAL HELPERS
// ============================================

/**
 * Get a specific metric value by key
 * Used by QuantityEngine to resolve formula references
 */
export function getMetricValue(metrics: ZoneMetrics, key: string): number {
  const keyMap: Record<string, keyof ZoneMetrics> = {
    // Common aliases
    'FLOOR_SF': 'floorSquareFeet',
    'CEILING_SF': 'ceilingSquareFeet',
    'WALL_SF': 'wallSquareFeet',
    'WALL_SF_NET': 'wallSquareFeetNet',
    'WALLS_CEILING_SF': 'wallsAndCeilingSquareFeet',
    'PERIMETER_LF': 'perimeterLinearFeet',
    'HEIGHT_FT': 'heightFeet',
    'LONG_WALL_SF': 'longWallSquareFeet',
    'SHORT_WALL_SF': 'shortWallSquareFeet',
    'ROOF_SF': 'roofSquareFeet',
    'ROOF_SQ': 'roofSquares',

    // Direct property names
    'floorSquareFeet': 'floorSquareFeet',
    'ceilingSquareFeet': 'ceilingSquareFeet',
    'wallSquareFeet': 'wallSquareFeet',
    'wallSquareFeetNet': 'wallSquareFeetNet',
    'perimeterLinearFeet': 'perimeterLinearFeet',
  };

  const mappedKey = keyMap[key] || (key as keyof ZoneMetrics);
  const value = metrics[mappedKey];

  return typeof value === 'number' ? value : 0;
}

/**
 * Format metrics for human-readable explanation
 */
export function formatMetricsExplanation(metrics: ZoneMetrics): string {
  const lines: string[] = [
    `Floor: ${metrics.floorSquareFeet} SF`,
    `Ceiling: ${metrics.ceilingSquareFeet} SF`,
    `Walls (gross): ${metrics.wallSquareFeet} SF`,
    `Walls (net): ${metrics.wallSquareFeetNet} SF`,
    `Perimeter: ${metrics.perimeterLinearFeet} LF`,
    `Height: ${metrics.heightFeet} ft${metrics.defaultHeightUsed ? ' (default)' : ''}`,
  ];

  if (metrics.openingCount > 0) {
    lines.push(`Openings: ${metrics.openingCount} (${metrics.openingSquareFeet} SF deducted)`);
  }

  if (metrics.subroomNetSquareFeet !== 0) {
    lines.push(`Subroom adjustment: ${metrics.subroomNetSquareFeet > 0 ? '+' : ''}${metrics.subroomNetSquareFeet} SF`);
  }

  if (metrics.roofSquareFeet) {
    lines.push(`Roof: ${metrics.roofSquareFeet} SF (${metrics.roofSquares} squares)`);
  }

  lines.push(`Source: ${metrics.computedFrom}`);

  return lines.join('\n');
}
