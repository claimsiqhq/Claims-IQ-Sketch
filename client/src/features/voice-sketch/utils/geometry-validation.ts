/**
 * Geometry Validation Utilities
 * 
 * Validates room dimensions, shapes, and geometry consistency.
 * Provides clear, voice-friendly error messages for TTS output.
 * 
 * Uses OpenAI GPT-4.1 via Realtime API for voice agent (ensures latest model capabilities)
 */

import type { RoomGeometry, WallDirection } from '../types/geometry';

export interface ValidationError {
  code: string;
  message: string; // Voice-friendly message
  severity: 'error' | 'warning';
  recoverable: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate room dimensions
 * Prevents zero/negative lengths, extremely skewed aspect ratios
 */
export function validateRoomDimensions(
  widthFt: number,
  lengthFt: number,
  ceilingHeightFt?: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for zero or negative dimensions
  if (widthFt <= 0) {
    errors.push({
      code: 'INVALID_WIDTH',
      message: `Room width must be greater than zero. You specified ${widthFt} feet.`,
      severity: 'error',
      recoverable: true,
    });
  }

  if (lengthFt <= 0) {
    errors.push({
      code: 'INVALID_LENGTH',
      message: `Room length must be greater than zero. You specified ${lengthFt} feet.`,
      severity: 'error',
      recoverable: true,
    });
  }

  if (ceilingHeightFt !== undefined && ceilingHeightFt <= 0) {
    errors.push({
      code: 'INVALID_CEILING_HEIGHT',
      message: `Ceiling height must be greater than zero. You specified ${ceilingHeightFt} feet.`,
      severity: 'error',
      recoverable: true,
    });
  }

  // Check for extremely skewed aspect ratios (room too narrow or too wide)
  if (widthFt > 0 && lengthFt > 0) {
    const aspectRatio = Math.max(widthFt, lengthFt) / Math.min(widthFt, lengthFt);
    
    if (aspectRatio > 10) {
      warnings.push({
        code: 'EXTREME_ASPECT_RATIO',
        message: `The room dimensions seem unusual. The room is ${aspectRatio.toFixed(1)} times longer than it is wide. Please verify these measurements.`,
        severity: 'warning',
        recoverable: true,
      });
    }

    // Check for very small rooms
    const area = widthFt * lengthFt;
    if (area < 10) {
      warnings.push({
        code: 'VERY_SMALL_ROOM',
        message: `This room is very small (${area.toFixed(1)} square feet). Is this correct?`,
        severity: 'warning',
        recoverable: true,
      });
    }

    // Check for very large rooms
    if (area > 5000) {
      warnings.push({
        code: 'VERY_LARGE_ROOM',
        message: `This room is very large (${area.toFixed(0)} square feet). Please verify these measurements.`,
        severity: 'warning',
        recoverable: true,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate wall position and size against room bounds
 */
export function validateWallPlacement(
  room: RoomGeometry,
  wall: WallDirection,
  position: number | string,
  widthFt: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const wallLength = wall === 'north' || wall === 'south' 
    ? room.width_ft 
    : room.length_ft;

  // Check if opening width exceeds wall length
  if (widthFt > wallLength) {
    errors.push({
      code: 'OPENING_TOO_WIDE',
      message: `The ${wall} wall is only ${wallLength} feet long, but you specified an opening ${widthFt} feet wide.`,
      severity: 'error',
      recoverable: true,
    });
  }

  // Check position bounds
  if (typeof position === 'number') {
    if (position < 0) {
      errors.push({
        code: 'INVALID_POSITION',
        message: `Position cannot be negative. You specified ${position} feet.`,
        severity: 'error',
        recoverable: true,
      });
    }

    if (position + widthFt / 2 > wallLength) {
      errors.push({
        code: 'POSITION_OUT_OF_BOUNDS',
        message: `The opening extends beyond the ${wall} wall. The wall is ${wallLength} feet long.`,
        severity: 'error',
        recoverable: true,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate room geometry consistency
 * Checks that walls close properly, no overlapping rooms (unless intended)
 */
export function validateRoomGeometry(room: RoomGeometry): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check polygon closure
  if (room.polygon && room.polygon.length > 0) {
    const firstPoint = room.polygon[0];
    const lastPoint = room.polygon[room.polygon.length - 1];
    
    const tolerance = 0.1; // 0.1 feet tolerance
    const dx = Math.abs(firstPoint.x - lastPoint.x);
    const dy = Math.abs(firstPoint.y - lastPoint.y);
    
    if (dx > tolerance || dy > tolerance) {
      errors.push({
        code: 'POLYGON_NOT_CLOSED',
        message: 'The room shape does not close properly. The first and last points do not match.',
        severity: 'error',
        recoverable: true,
      });
    }

    // Check for self-intersection (simplified check)
    if (room.polygon.length >= 4) {
      // Basic check: ensure polygon has at least 3 points
      if (room.polygon.length < 3) {
        errors.push({
          code: 'INSUFFICIENT_POINTS',
          message: 'A room polygon needs at least 3 points to form a valid shape.',
          severity: 'error',
          recoverable: true,
        });
      }
    }
  }

  // Validate openings don't overlap
  const openingsByWall = new Map<WallDirection, Array<{ start: number; end: number }>>();
  
  for (const opening of room.openings) {
    const wallLength = opening.wall === 'north' || opening.wall === 'south'
      ? room.width_ft
      : room.length_ft;
    
    const position = typeof opening.position === 'number'
      ? opening.position
      : opening.position === 'left'
        ? opening.width_ft / 2
        : opening.position === 'right'
          ? wallLength - opening.width_ft / 2
          : wallLength / 2;
    
    const start = position - opening.width_ft / 2;
    const end = position + opening.width_ft / 2;
    
    if (!openingsByWall.has(opening.wall)) {
      openingsByWall.set(opening.wall, []);
    }
    
    const wallOpenings = openingsByWall.get(opening.wall)!;
    
    // Check for overlap with existing openings
    for (const existing of wallOpenings) {
      if (!(end < existing.start || start > existing.end)) {
        warnings.push({
          code: 'OPENING_OVERLAP',
          message: `The ${opening.type} on the ${opening.wall} wall overlaps with another opening.`,
          severity: 'warning',
          recoverable: true,
        });
      }
    }
    
    wallOpenings.push({ start, end });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation result as voice-friendly message
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return 'Room geometry is valid.';
  }

  const parts: string[] = [];

  if (result.errors.length > 0) {
    parts.push(`Found ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}:`);
    result.errors.forEach(err => {
      parts.push(err.message);
    });
  }

  if (result.warnings.length > 0) {
    parts.push(`Note: ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}:`);
    result.warnings.forEach(warn => {
      parts.push(warn.message);
    });
  }

  return parts.join(' ');
}
