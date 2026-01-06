/**
 * Geometry Constants
 * 
 * Centralized constants for sketch geometry calculations and rendering.
 * All measurements are in FEET unless otherwise specified.
 */

// ============================================
// PDF RENDERING CONSTANTS
// ============================================

/** PDF page dimensions (Letter size in points: 612 x 792) */
export const PDF_PAGE_WIDTH = 612;
export const PDF_PAGE_HEIGHT = 792;
export const PDF_MARGIN = 50;
export const PDF_HEADER_HEIGHT = 80;

/** Grid spacing for PDF rendering (feet) */
export const PDF_GRID_SPACING_FT = 10;

/** Scale legend length (points, equivalent to 1 inch) */
export const PDF_SCALE_LEGEND_LENGTH = 72;

// ============================================
// GEOMETRY VALIDATION CONSTANTS
// ============================================

/** Minimum polygon points required */
export const MIN_POLYGON_POINTS = 3;

/** Minimum wall length in feet (6 inches) */
export const MIN_WALL_LENGTH_FT = 0.5;

/** Maximum polygon vertices (performance limit) */
export const MAX_POLYGON_VERTICES = 100;

/** Snap threshold for near-zero values (feet, about 0.012 inches) */
export const SNAP_THRESHOLD_FT = 0.001;

/** Minimum opening clearance from wall corner (feet) */
export const MIN_OPENING_CLEARANCE_FT = 0.5;

// ============================================
// CEILING HEIGHT CONSTANTS
// ============================================

/** Default ceiling height (feet) */
export const DEFAULT_CEILING_HEIGHT_FT = 8;

/** Minimum ceiling height (feet) */
export const MIN_CEILING_HEIGHT_FT = 6;

/** Maximum ceiling height (feet) */
export const MAX_CEILING_HEIGHT_FT = 30;

// ============================================
// ORIGIN VALIDATION CONSTANTS
// ============================================

/** Maximum reasonable origin coordinate (feet) */
export const MAX_ORIGIN_COORDINATE_FT = 1000;

/** Minimum reasonable origin coordinate (feet) */
export const MIN_ORIGIN_COORDINATE_FT = -1000;

// ============================================
// CANVAS RENDERING CONSTANTS
// ============================================

/** Pixels per foot for canvas rendering */
export const PIXELS_PER_FOOT = 12;

/** Canvas padding (pixels) */
export const CANVAS_PADDING = 80;

/** Wall stroke width (pixels) */
export const WALL_STROKE_WIDTH = 2;

/** Minimum zoom level */
export const MIN_ZOOM = 0.3;

/** Maximum zoom level */
export const MAX_ZOOM = 3;

// ============================================
// OPENING DIMENSIONS
// ============================================

/** Default door width (feet) */
export const DEFAULT_DOOR_WIDTH_FT = 3;

/** Default door height (feet) */
export const DEFAULT_DOOR_HEIGHT_FT = 7;

/** Default window width (feet) */
export const DEFAULT_WINDOW_WIDTH_FT = 3;

/** Default window height (feet) */
export const DEFAULT_WINDOW_HEIGHT_FT = 4;

// ============================================
// AREA CALCULATION CONSTANTS
// ============================================

/** Square yards per square foot (1/9) */
export const SQ_YARDS_PER_SQ_FOOT = 1 / 9;

// ============================================
// COLOR CODES (RGB 0-1 range for PDF)
// ============================================

export const PDF_COLORS = {
  WALL: '0 0 0',                    // Black
  ROOM_FILL: '0.95 0.95 1',        // Light blue
  GRID: '0.9 0.9 0.9',              // Light gray
  DOOR: '0.8 0.5 0.2',             // Brown
  WINDOW: '0.2 0.6 0.9',           // Blue
  OPENING_OTHER: '0.5 0.5 0.5',    // Gray
  CONNECTION_LINE: '0.8 0.6 0.4',  // Tan/gold
} as const;
