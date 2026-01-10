/**
 * Scope Quantity Engine - Claims IQ Sketch
 *
 * Derives quantities from zone geometry for scope items.
 * Quantities are computed deterministically from measurements.
 *
 * DESIGN PRINCIPLES:
 * - All quantities MUST be derived from geometry, never typed manually
 * - Deterministic math only - no AI, no randomness
 * - Full provenance tracking for audit
 * - NO pricing calculations - this is scope only
 *
 * QUANTITY FORMULAS:
 * - FLOOR_SF: Floor square footage
 * - CEILING_SF: Ceiling square footage
 * - WALL_SF: Gross wall square footage
 * - WALL_SF_NET: Wall SF minus openings
 * - WALLS_CEILING_SF: Combined walls and ceiling
 * - PERIMETER_LF: Floor perimeter linear feet
 * - HEIGHT_FT: Room height
 * - ROOF_SF: Roof square footage (with pitch)
 * - ROOF_SQ: Roofing squares (100 SF)
 *
 * See: docs/SCOPE_ENGINE.md for architecture details.
 */

import {
  ZoneMetrics,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
  computeZoneMetrics,
  getMetricValue,
} from './zoneMetrics';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Quantity formula types - references to zone metrics
 */
export type QuantityFormula =
  | 'FLOOR_SF'
  | 'CEILING_SF'
  | 'WALL_SF'
  | 'WALL_SF_NET'
  | 'WALLS_CEILING_SF'
  | 'PERIMETER_LF'
  | 'HEIGHT_FT'
  | 'LONG_WALL_SF'
  | 'SHORT_WALL_SF'
  | 'ROOF_SF'
  | 'ROOF_SQ';

/**
 * Unit types matching scope_line_items.unit
 */
export type ScopeUnit = 'SF' | 'LF' | 'SY' | 'SQ' | 'EA' | 'HR' | 'DAY' | 'WK';

/**
 * Result of quantity extraction from geometry
 */
export interface QuantityExtractionResult {
  /** Computed quantity (before waste) */
  quantity: number;

  /** Quantity with waste factor applied */
  quantityWithWaste: number;

  /** Waste factor used (e.g., 0.10 for 10%) */
  wasteFactor: number;

  /** Unit of measure */
  unit: ScopeUnit;

  /** Formula used to compute quantity */
  formula: QuantityFormula | null;

  /** Source metric from zone */
  sourceMetric: string;

  /** Whether computation succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Provenance details for audit */
  provenance: {
    computedAt: string;
    sourceType: 'geometry_derived' | 'manual' | 'default';
    metricsSnapshot: Partial<ZoneMetrics>;
  };
}

/**
 * Batch extraction result for a zone
 */
export interface ZoneQuantityExtraction {
  zoneId: string;
  zoneName: string;
  metrics: ZoneMetrics;
  extractions: Map<string, QuantityExtractionResult>;
}

/**
 * Line item definition for extraction
 */
export interface LineItemForExtraction {
  code: string;
  unit: ScopeUnit;
  quantityFormula: QuantityFormula | null;
  defaultWasteFactor: number;
}

// ============================================
// FORMULA MAPPING
// ============================================

/**
 * Maps formula names to ZoneMetrics properties
 */
const FORMULA_TO_METRIC: Record<QuantityFormula, keyof ZoneMetrics> = {
  FLOOR_SF: 'floorSquareFeet',
  CEILING_SF: 'ceilingSquareFeet',
  WALL_SF: 'wallSquareFeet',
  WALL_SF_NET: 'wallSquareFeetNet',
  WALLS_CEILING_SF: 'wallsAndCeilingSquareFeet',
  PERIMETER_LF: 'perimeterLinearFeet',
  HEIGHT_FT: 'heightFeet',
  LONG_WALL_SF: 'longWallSquareFeet',
  SHORT_WALL_SF: 'shortWallSquareFeet',
  ROOF_SF: 'roofSquareFeet',
  ROOF_SQ: 'roofSquares',
};

/**
 * Default unit for each formula
 */
const FORMULA_DEFAULT_UNIT: Record<QuantityFormula, ScopeUnit> = {
  FLOOR_SF: 'SF',
  CEILING_SF: 'SF',
  WALL_SF: 'SF',
  WALL_SF_NET: 'SF',
  WALLS_CEILING_SF: 'SF',
  PERIMETER_LF: 'LF',
  HEIGHT_FT: 'LF',
  LONG_WALL_SF: 'SF',
  SHORT_WALL_SF: 'SF',
  ROOF_SF: 'SF',
  ROOF_SQ: 'SQ',
};

// ============================================
// CORE EXTRACTION FUNCTIONS
// ============================================

/**
 * Extract quantity from zone metrics for a single line item
 */
export function extractQuantity(
  metrics: ZoneMetrics,
  lineItem: LineItemForExtraction
): QuantityExtractionResult {
  const { code, unit, quantityFormula, defaultWasteFactor } = lineItem;
  const computedAt = new Date().toISOString();

  // If no formula, return default quantity of 1
  if (!quantityFormula) {
    return {
      quantity: 1,
      quantityWithWaste: 1,
      wasteFactor: 0,
      unit,
      formula: null,
      sourceMetric: 'none',
      success: true,
      provenance: {
        computedAt,
        sourceType: 'default',
        metricsSnapshot: {},
      },
    };
  }

  // Validate formula
  if (!FORMULA_TO_METRIC[quantityFormula]) {
    return {
      quantity: 0,
      quantityWithWaste: 0,
      wasteFactor: 0,
      unit,
      formula: quantityFormula,
      sourceMetric: 'unknown',
      success: false,
      error: `Unknown formula: ${quantityFormula}`,
      provenance: {
        computedAt,
        sourceType: 'geometry_derived',
        metricsSnapshot: {},
      },
    };
  }

  // Get metric value
  const metricKey = FORMULA_TO_METRIC[quantityFormula];
  const rawValue = metrics[metricKey];
  const quantity = typeof rawValue === 'number' ? rawValue : 0;

  // Handle zero/undefined values
  if (quantity === 0 && rawValue === undefined) {
    return {
      quantity: 0,
      quantityWithWaste: 0,
      wasteFactor: defaultWasteFactor,
      unit,
      formula: quantityFormula,
      sourceMetric: metricKey,
      success: false,
      error: `Metric ${metricKey} not available for this zone`,
      provenance: {
        computedAt,
        sourceType: 'geometry_derived',
        metricsSnapshot: {
          [metricKey]: rawValue,
        },
      },
    };
  }

  // Apply waste factor
  const wasteFactor = defaultWasteFactor || 0;
  const quantityWithWaste = round(quantity * (1 + wasteFactor));

  return {
    quantity: round(quantity),
    quantityWithWaste,
    wasteFactor,
    unit,
    formula: quantityFormula,
    sourceMetric: metricKey,
    success: true,
    provenance: {
      computedAt,
      sourceType: 'geometry_derived',
      metricsSnapshot: {
        [metricKey]: quantity,
        computedFrom: metrics.computedFrom,
      },
    },
  };
}

/**
 * Extract quantities for multiple line items from a zone
 */
export function extractZoneQuantities(
  zone: ZoneForMetrics & { name: string },
  missingWalls: MissingWallForMetrics[],
  subrooms: SubroomForMetrics[],
  lineItems: LineItemForExtraction[]
): ZoneQuantityExtraction {
  // Compute zone metrics
  const metrics = computeZoneMetrics(zone, missingWalls, subrooms);

  // Extract quantities for each line item
  const extractions = new Map<string, QuantityExtractionResult>();

  for (const lineItem of lineItems) {
    const result = extractQuantity(metrics, lineItem);
    extractions.set(lineItem.code, result);
  }

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    metrics,
    extractions,
  };
}

// ============================================
// SPECIALIZED EXTRACTORS
// ============================================

/**
 * Extract wall square footage (gross - before opening deductions)
 */
export function extractWallSF(metrics: ZoneMetrics): number {
  return metrics.wallSquareFeet;
}

/**
 * Extract wall square footage (net - after opening deductions)
 */
export function extractWallSFNet(metrics: ZoneMetrics): number {
  return metrics.wallSquareFeetNet;
}

/**
 * Extract ceiling square footage
 */
export function extractCeilingSF(metrics: ZoneMetrics): number {
  return metrics.ceilingSquareFeet;
}

/**
 * Extract floor square footage
 */
export function extractFloorSF(metrics: ZoneMetrics): number {
  return metrics.floorSquareFeet;
}

/**
 * Extract perimeter linear feet
 */
export function extractPerimeterLF(metrics: ZoneMetrics): number {
  return metrics.perimeterLinearFeet;
}

/**
 * Extract roofing squares (100 SF with pitch adjustment)
 */
export function extractRoofSquares(metrics: ZoneMetrics): number {
  return metrics.roofSquares || 0;
}

/**
 * Extract long wall SF (for 2-wall calculations)
 */
export function extractLongWallSF(metrics: ZoneMetrics): number {
  return metrics.longWallSquareFeet;
}

/**
 * Extract short wall SF (for 2-wall calculations)
 */
export function extractShortWallSF(metrics: ZoneMetrics): number {
  return metrics.shortWallSquareFeet;
}

// ============================================
// WALL-SPECIFIC EXTRACTION
// ============================================

/**
 * Extract quantity for a specific wall by index
 */
export function extractWallQuantity(
  zone: ZoneForMetrics & { polygonFt?: { x: number; y: number }[] },
  wallIndex: number,
  unit: ScopeUnit
): QuantityExtractionResult {
  const computedAt = new Date().toISOString();

  // Get polygon vertices
  const polygon = zone.polygonFt;
  if (!polygon || polygon.length < 3) {
    return {
      quantity: 0,
      quantityWithWaste: 0,
      wasteFactor: 0,
      unit,
      formula: null,
      sourceMetric: 'wall_segment',
      success: false,
      error: 'Zone has no polygon geometry',
      provenance: {
        computedAt,
        sourceType: 'geometry_derived',
        metricsSnapshot: {},
      },
    };
  }

  // Validate wall index
  if (wallIndex < 0 || wallIndex >= polygon.length) {
    return {
      quantity: 0,
      quantityWithWaste: 0,
      wasteFactor: 0,
      unit,
      formula: null,
      sourceMetric: 'wall_segment',
      success: false,
      error: `Invalid wall index ${wallIndex}, polygon has ${polygon.length} edges`,
      provenance: {
        computedAt,
        sourceType: 'geometry_derived',
        metricsSnapshot: {},
      },
    };
  }

  // Calculate wall segment length
  const p1 = polygon[wallIndex];
  const p2 = polygon[(wallIndex + 1) % polygon.length];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);

  // Get wall height
  const height = parseFloat(String(zone.heightFt)) || 8.0;

  // Calculate based on unit
  let quantity: number;
  if (unit === 'SF') {
    quantity = wallLength * height;
  } else if (unit === 'LF') {
    quantity = wallLength;
  } else {
    quantity = wallLength * height;
  }

  return {
    quantity: round(quantity),
    quantityWithWaste: round(quantity),
    wasteFactor: 0,
    unit,
    formula: null,
    sourceMetric: `wall_${wallIndex}`,
    success: true,
    provenance: {
      computedAt,
      sourceType: 'geometry_derived',
      metricsSnapshot: {
        wallLength: round(wallLength),
        wallHeight: height,
        wallIndex,
      },
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Convert square feet to square yards
 */
export function sfToSY(sf: number): number {
  return round(sf / 9);
}

/**
 * Convert square feet to roofing squares
 */
export function sfToSQ(sf: number): number {
  return round(sf / 100);
}

/**
 * Apply pitch multiplier to flat roof area
 */
export function applyPitchMultiplier(flatSF: number, pitch: string): number {
  const multipliers: Record<string, number> = {
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

  const multiplier = multipliers[pitch.toLowerCase()] || 1.0;
  return round(flatSF * multiplier);
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate that a formula is known
 */
export function isValidFormula(formula: string): formula is QuantityFormula {
  return formula in FORMULA_TO_METRIC;
}

/**
 * Get expected unit for a formula
 */
export function getExpectedUnit(formula: QuantityFormula): ScopeUnit {
  return FORMULA_DEFAULT_UNIT[formula];
}

/**
 * Validate unit compatibility with formula
 */
export function isUnitCompatible(formula: QuantityFormula, unit: ScopeUnit): boolean {
  const expectedUnit = FORMULA_DEFAULT_UNIT[formula];

  // Direct match
  if (expectedUnit === unit) return true;

  // SF can be converted to SY
  if (expectedUnit === 'SF' && unit === 'SY') return true;

  // LF is always compatible with LF
  if (expectedUnit === 'LF' && unit === 'LF') return true;

  return false;
}

// ============================================
// EXPORT SUMMARY
// ============================================

export {
  FORMULA_TO_METRIC,
  FORMULA_DEFAULT_UNIT,
};
