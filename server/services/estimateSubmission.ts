/**
 * Estimate Submission Service
 *
 * Handles the estimate finalization workflow:
 * 1. Run server-side validation
 * 2. Block submission if validation errors exist
 * 3. Lock estimate to prevent further edits
 * 4. Update status to pending_review
 */

import { pool } from '../db';
import { getEstimate } from './estimateCalculator';
import { getEstimateHierarchy } from './estimateHierarchy';
import {
  validateEstimateWithRules,
  type EstimateForExtendedValidation,
  type ExtendedValidationResult,
  type ValidationIssue,
} from './estimateValidator';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface SubmissionResult {
  success: boolean;
  estimateId: string;
  status: string;
  submittedAt?: Date;
  isLocked: boolean;
  validation: {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  message: string;
}

export interface EstimateLockStatus {
  isLocked: boolean;
  status: string;
  submittedAt?: Date;
}

// ============================================
// MAIN SUBMISSION FUNCTION
// ============================================

/**
 * Submit an estimate for review
 *
 * This function:
 * 1. Loads the estimate and its hierarchy
 * 2. Runs full validation (standard + carrier/jurisdiction rules)
 * 3. If validation errors exist, returns HTTP 400 with details
 * 4. If only warnings or none, proceeds with submission:
 *    - Updates status to 'pending_review'
 *    - Sets submitted_at to NOW()
 *    - Sets is_locked to true
 */
export async function submitEstimate(estimateId: string): Promise<SubmissionResult> {
  const client = await pool.connect();

  try {
    // Check if estimate exists and is not already locked
    const lockStatus = await getEstimateLockStatus(estimateId);

    if (lockStatus.isLocked) {
      return {
        success: false,
        estimateId,
        status: lockStatus.status,
        submittedAt: lockStatus.submittedAt,
        isLocked: true,
        validation: {
          isValid: false,
          errorCount: 1,
          warningCount: 0,
          errors: [{
            code: 'ALREADY_SUBMITTED',
            severity: 'error',
            category: 'dependency',
            message: 'This estimate has already been submitted and is locked',
            details: `Submitted at: ${lockStatus.submittedAt?.toISOString() || 'unknown'}`,
          }],
          warnings: [],
        },
        message: 'This estimate has already been finalized and cannot be edited.',
      };
    }

    // Load estimate data
    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      throw new Error(`Estimate not found: ${estimateId}`);
    }

    // Load hierarchy to get zones
    const hierarchy = await getEstimateHierarchy(estimateId);

    // Prepare data for validation
    const estimateForValidation = await prepareEstimateForValidation(
      estimateId,
      estimate,
      hierarchy
    );

    // Run full validation
    const validationResult = await validateEstimateWithRules(estimateForValidation);

    // Extract errors and warnings
    const errors = validationResult.issues.filter(i => i.severity === 'error');
    const warnings = validationResult.issues.filter(i => i.severity === 'warning' || i.severity === 'info');

    // If there are validation errors, block submission
    if (errors.length > 0) {
      return {
        success: false,
        estimateId,
        status: estimate.status || 'draft',
        isLocked: false,
        validation: {
          isValid: false,
          errorCount: errors.length,
          warningCount: warnings.length,
          errors,
          warnings,
        },
        message: `Submission blocked: ${errors.length} validation error(s) must be resolved before submission.`,
      };
    }

    // No blocking errors - proceed with submission
    await client.query('BEGIN');

    try {
      // Update estimate: status, submitted_at, is_locked
      const submittedAt = new Date();
      await client.query(
        `UPDATE estimates
         SET status = 'pending_review',
             submitted_at = $1,
             is_locked = true,
             updated_at = NOW()
         WHERE id = $2`,
        [submittedAt, estimateId]
      );

      await client.query('COMMIT');

      console.log(`Estimate ${estimateId} submitted successfully. Warnings: ${warnings.length}`);

      return {
        success: true,
        estimateId,
        status: 'pending_review',
        submittedAt,
        isLocked: true,
        validation: {
          isValid: true,
          errorCount: 0,
          warningCount: warnings.length,
          errors: [],
          warnings,
        },
        message: warnings.length > 0
          ? `Estimate submitted successfully with ${warnings.length} warning(s).`
          : 'Estimate submitted successfully.',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

// ============================================
// LOCK STATUS HELPERS
// ============================================

/**
 * Get the lock status of an estimate
 */
export async function getEstimateLockStatus(estimateId: string): Promise<EstimateLockStatus> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT status, finalized_at
       FROM estimates
       WHERE id = $1`,
      [estimateId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Estimate not found: ${estimateId}`);
    }

    const row = result.rows[0];
    const isLocked = row.status === 'submitted' || row.status === 'finalized' || row.finalized_at !== null;
    
    return {
      isLocked,
      status: row.status || 'draft',
      submittedAt: row.finalized_at ? new Date(row.finalized_at) : undefined,
    };
  } finally {
    client.release();
  }
}

/**
 * Check if an estimate is locked
 * Throws an error if locked, for use in guard clauses
 */
export async function assertEstimateNotLocked(estimateId: string): Promise<void> {
  const lockStatus = await getEstimateLockStatus(estimateId);

  if (lockStatus.isLocked) {
    throw new Error('This estimate has been finalized and cannot be edited.');
  }
}

/**
 * Get the estimate ID from a zone ID
 */
export async function getEstimateIdFromZone(zoneId: string): Promise<string | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT e.id as estimate_id
       FROM estimate_zones z
       JOIN estimate_areas a ON z.area_id = a.id
       JOIN estimate_structures s ON a.structure_id = s.id
       JOIN estimates e ON s.estimate_id = e.id
       WHERE z.id = $1`,
      [zoneId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].estimate_id;
  } finally {
    client.release();
  }
}

/**
 * Get the estimate ID from a line item ID
 */
export async function getEstimateIdFromLineItem(lineItemId: string): Promise<string | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT estimate_id FROM estimate_line_items WHERE id = $1`,
      [lineItemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].estimate_id;
  } finally {
    client.release();
  }
}

/**
 * Get the estimate ID from a structure ID
 */
export async function getEstimateIdFromStructure(structureId: string): Promise<string | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT estimate_id FROM estimate_structures WHERE id = $1`,
      [structureId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].estimate_id;
  } finally {
    client.release();
  }
}

/**
 * Get the estimate ID from an area ID
 */
export async function getEstimateIdFromArea(areaId: string): Promise<string | null> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT e.id as estimate_id
       FROM estimate_areas a
       JOIN estimate_structures s ON a.structure_id = s.id
       JOIN estimates e ON s.estimate_id = e.id
       WHERE a.id = $1`,
      [areaId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].estimate_id;
  } finally {
    client.release();
  }
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Prepare estimate data for validation
 */
async function prepareEstimateForValidation(
  estimateId: string,
  estimate: any,
  hierarchy: any
): Promise<EstimateForExtendedValidation> {
  const client = await pool.connect();

  try {
    // Get all line items for this estimate
    const lineItemsResult = await client.query(
      `SELECT
        eli.id,
        eli.line_item_code as code,
        eli.line_item_description as description,
        eli.quantity,
        eli.unit,
        eli.category_id as "categoryId",
        eli.damage_zone_id as "zoneId",
        eli.room_name as "zoneName",
        li.default_coverage_code as "coverageCode"
       FROM estimate_line_items eli
       LEFT JOIN line_items li ON eli.line_item_code = li.code
       WHERE eli.estimate_id = $1`,
      [estimateId]
    );

    // Flatten zones from hierarchy
    const zones: any[] = [];
    if (hierarchy?.structures) {
      for (const structure of hierarchy.structures) {
        if (structure.areas) {
          for (const area of structure.areas) {
            if (area.zones) {
              for (const zone of area.zones) {
                zones.push({
                  id: zone.id,
                  name: zone.name,
                  zoneType: zone.zoneType || 'room',
                  roomType: zone.roomType,
                  lengthFt: zone.lengthFt ? parseFloat(zone.lengthFt) : undefined,
                  widthFt: zone.widthFt ? parseFloat(zone.widthFt) : undefined,
                  heightFt: zone.heightFt ? parseFloat(zone.heightFt) : 8,
                  damageType: zone.damageType,
                  damageSeverity: zone.damageSeverity,
                  waterCategory: zone.waterCategory,
                  missingWalls: zone.missingWalls || [],
                  subrooms: zone.subrooms || [],
                });
              }
            }
          }
        }
      }
    }

    return {
      id: estimateId,
      carrierProfileId: estimate.carrierProfileId,
      jurisdictionId: undefined, // Could be derived from property address state
      claimTotal: estimate.grandTotal,
      lineItems: lineItemsResult.rows.map(row => ({
        id: row.id,
        code: row.code,
        description: row.description,
        quantity: parseFloat(row.quantity) || 0,
        unit: row.unit,
        categoryId: row.categoryId,
        zoneId: row.zoneId,
        zoneName: row.zoneName,
        coverageCode: row.coverageCode,
      })),
      zones,
    };
  } finally {
    client.release();
  }
}

/**
 * Run validation without submitting (for preview)
 */
export async function validateEstimateForSubmission(
  estimateId: string
): Promise<ExtendedValidationResult> {
  // Load estimate data
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error(`Estimate not found: ${estimateId}`);
  }

  // Load hierarchy to get zones
  const hierarchy = await getEstimateHierarchy(estimateId);

  // Prepare data for validation
  const estimateForValidation = await prepareEstimateForValidation(
    estimateId,
    estimate,
    hierarchy
  );

  // Run full validation
  return validateEstimateWithRules(estimateForValidation);
}
