/**
 * Estimate Submission Service
 *
 * Handles the estimate finalization workflow:
 * 1. Run server-side validation
 * 2. Block submission if validation errors exist
 * 3. Lock estimate to prevent further edits
 * 4. Update status to pending_review
 */

import { supabaseAdmin } from '../lib/supabaseAdmin';
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
  // Update estimate: status, submitted_at, is_locked
  const submittedAt = new Date();
  const { error: updateError } = await supabaseAdmin
    .from('estimates')
    .update({
      status: 'pending_review',
      submitted_at: submittedAt.toISOString(),
      is_locked: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateId);

  if (updateError) {
    throw new Error(`Failed to update estimate: ${updateError.message}`);
  }

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
}

// ============================================
// LOCK STATUS HELPERS
// ============================================

/**
 * Get the lock status of an estimate
 */
export async function getEstimateLockStatus(estimateId: string): Promise<EstimateLockStatus> {
  const { data, error } = await supabaseAdmin
    .from('estimates')
    .select('status, finalized_at')
    .eq('id', estimateId)
    .single();

  if (error || !data) {
    throw new Error(`Estimate not found: ${estimateId}`);
  }

  const isLocked = data.status === 'submitted' || data.status === 'finalized' || data.finalized_at !== null;

  return {
    isLocked,
    status: data.status || 'draft',
    submittedAt: data.finalized_at ? new Date(data.finalized_at) : undefined,
  };
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
  const { data: zone, error: zoneError } = await supabaseAdmin
    .from('estimate_zones')
    .select('area_id')
    .eq('id', zoneId)
    .single();

  if (zoneError || !zone) {
    return null;
  }

  const { data: area, error: areaError } = await supabaseAdmin
    .from('estimate_areas')
    .select('structure_id')
    .eq('id', zone.area_id)
    .single();

  if (areaError || !area) {
    return null;
  }

  const { data: structure, error: structureError } = await supabaseAdmin
    .from('estimate_structures')
    .select('estimate_id')
    .eq('id', area.structure_id)
    .single();

  if (structureError || !structure) {
    return null;
  }

  return structure.estimate_id;
}

/**
 * Get the estimate ID from a line item ID
 */
export async function getEstimateIdFromLineItem(lineItemId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_line_items')
    .select('estimate_id')
    .eq('id', lineItemId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.estimate_id;
}

/**
 * Get the estimate ID from a structure ID
 */
export async function getEstimateIdFromStructure(structureId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('estimate_structures')
    .select('estimate_id')
    .eq('id', structureId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.estimate_id;
}

/**
 * Get the estimate ID from an area ID
 */
export async function getEstimateIdFromArea(areaId: string): Promise<string | null> {
  const { data: area, error: areaError } = await supabaseAdmin
    .from('estimate_areas')
    .select('structure_id')
    .eq('id', areaId)
    .single();

  if (areaError || !area) {
    return null;
  }

  const { data: structure, error: structureError } = await supabaseAdmin
    .from('estimate_structures')
    .select('estimate_id')
    .eq('id', area.structure_id)
    .single();

  if (structureError || !structure) {
    return null;
  }

  return structure.estimate_id;
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
  // Get all line items for this estimate with their associated line_items data
  const { data: estimateLineItems, error: lineItemsError } = await supabaseAdmin
    .from('estimate_line_items')
    .select(`
      id,
      line_item_code,
      line_item_description,
      quantity,
      unit,
      category_id,
      damage_zone_id,
      room_name,
      line_items (
        default_coverage_code
      )
    `)
    .eq('estimate_id', estimateId);

  if (lineItemsError) {
    throw new Error(`Failed to fetch line items: ${lineItemsError.message}`);
  }

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
    lineItems: (estimateLineItems || []).map(item => ({
      id: item.id,
      code: item.line_item_code,
      description: item.line_item_description,
      quantity: parseFloat(item.quantity) || 0,
      unit: item.unit,
      categoryId: item.category_id,
      zoneId: item.damage_zone_id,
      zoneName: item.room_name,
      coverageCode: (item.line_items as any)?.default_coverage_code,
    })),
    zones,
  };
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
