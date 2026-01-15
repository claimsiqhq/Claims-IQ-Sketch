/**
 * Export Readiness Validation
 *
 * Defines what is checked before export, how results are surfaced,
 * and how overrides/waivers are handled.
 *
 * KEY PRINCIPLES:
 * 1. Blocking issues MUST be resolved or waived
 * 2. Warnings are surfaced but don't block
 * 3. All waivers are audited with reason
 * 4. Defensibility score reflects carrier risk
 */

import type {
  WorkflowState,
  EvidenceBucket,
  ExportReadiness,
  ExportIssue,
} from './redesignedWorkflowSchema';

// ============================================
// 1. VALIDATION RULES
// ============================================

/**
 * Categories of validation checks.
 */
export type ValidationCategory =
  | 'identity'           // Property/claim identity
  | 'safety'             // Safety documentation
  | 'coverage'           // Coverage area documentation
  | 'peril'              // Peril-specific requirements
  | 'endorsement'        // Endorsement-driven requirements
  | 'source_tracing'     // Damage source documentation
  | 'measurements'       // Required measurements
  | 'completeness';      // General completeness

/**
 * Individual validation rule.
 */
export interface ValidationRule {
  id: string;
  category: ValidationCategory;
  name: string;
  description: string;

  /** Severity if rule fails */
  severity: 'blocking' | 'warning' | 'advisory';

  /** When this rule is active */
  activeWhen: ValidationCondition;

  /** What to check */
  check: ValidationCheck;

  /** Resolution guidance */
  resolution: string;

  /** Can this be waived? */
  waivable: boolean;

  /** Waiver requirements */
  waiverRequirements?: {
    requireReason: boolean;
    minReasonLength: number;
    requireSupervisor: boolean;
  };
}

export interface ValidationCondition {
  always?: boolean;
  perils?: string[];
  endorsements?: string[];
  propertyTypes?: string[];
  hasGeometry?: { type: 'room' | 'zone'; withDamage?: boolean };
}

export interface ValidationCheck {
  type: 'bucket_fulfilled' | 'evidence_count' | 'field_present' | 'custom';
  bucketCategory?: string;
  minCount?: number;
  field?: string;
  customCheckId?: string;
}

// ============================================
// 2. CANONICAL VALIDATION RULES
// ============================================

export const EXPORT_VALIDATION_RULES: ValidationRule[] = [
  // ----------------------------------------
  // IDENTITY (Always Blocking)
  // ----------------------------------------
  {
    id: 'identity-address',
    category: 'identity',
    name: 'Address Verification',
    description: 'Property address must be verified with photo',
    severity: 'blocking',
    activeWhen: { always: true },
    check: { type: 'bucket_fulfilled', bucketCategory: 'identity' },
    resolution: 'Capture a clear photo of the property address',
    waivable: false,
  },

  // ----------------------------------------
  // SAFETY (Always Blocking)
  // ----------------------------------------
  {
    id: 'safety-assessment',
    category: 'safety',
    name: 'Safety Assessment',
    description: 'Safety assessment must be documented',
    severity: 'blocking',
    activeWhen: { always: true },
    check: { type: 'bucket_fulfilled', bucketCategory: 'safety' },
    resolution: 'Complete safety assessment checklist',
    waivable: false,
  },

  // ----------------------------------------
  // COVERAGE (Conditional)
  // ----------------------------------------
  {
    id: 'coverage-all-elevations',
    category: 'coverage',
    name: 'All Elevations Documented',
    description: 'All four exterior elevations must be photographed',
    severity: 'blocking',
    activeWhen: { perils: ['wind_hail'] },
    check: { type: 'evidence_count', bucketCategory: 'exterior_overview', minCount: 4 },
    resolution: 'Photograph north, south, east, and west elevations',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 20,
      requireSupervisor: false,
    },
  },
  {
    id: 'coverage-roof',
    category: 'coverage',
    name: 'Roof Documentation',
    description: 'Roof must be documented (ground level if inaccessible)',
    severity: 'blocking',
    activeWhen: { perils: ['wind_hail'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'roof' },
    resolution: 'Photograph roof planes from ground or roof level',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 20,
      requireSupervisor: false,
    },
  },
  {
    id: 'coverage-affected-rooms',
    category: 'coverage',
    name: 'Affected Rooms Documented',
    description: 'All rooms with damage must be documented',
    severity: 'blocking',
    activeWhen: { hasGeometry: { type: 'room', withDamage: true } },
    check: { type: 'custom', customCheckId: 'all_damaged_rooms_documented' },
    resolution: 'Document all rooms identified as having damage',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 20,
      requireSupervisor: false,
    },
  },

  // ----------------------------------------
  // PERIL-SPECIFIC (Conditional)
  // ----------------------------------------
  {
    id: 'peril-water-source',
    category: 'peril',
    name: 'Water Source Documented',
    description: 'Water damage source/entry point must be documented',
    severity: 'blocking',
    activeWhen: { perils: ['water', 'flood'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'source_tracing' },
    resolution: 'Identify and photograph water source/entry point',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 30,
      requireSupervisor: false,
    },
  },
  {
    id: 'peril-water-category',
    category: 'peril',
    name: 'Water Category Classified',
    description: 'Water contamination category must be documented',
    severity: 'blocking',
    activeWhen: { perils: ['water', 'flood'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'peril_specific' },
    resolution: 'Classify water as Category 1 (clean), 2 (gray), or 3 (black)',
    waivable: false,
  },
  {
    id: 'peril-water-moisture',
    category: 'peril',
    name: 'Moisture Readings',
    description: 'Moisture meter readings must be documented',
    severity: 'blocking',
    activeWhen: { perils: ['water', 'flood'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'measurement' },
    resolution: 'Record moisture readings in affected areas',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 20,
      requireSupervisor: false,
    },
  },
  {
    id: 'peril-hail-test-square',
    category: 'peril',
    name: 'Hail Test Square',
    description: 'Hail test square must be documented for hail claims',
    severity: 'warning',
    activeWhen: { perils: ['wind_hail'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'peril_specific' },
    resolution: 'Mark and document 10x10 test square with hail hit count',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 20,
      requireSupervisor: false,
    },
  },
  {
    id: 'peril-fire-origin',
    category: 'peril',
    name: 'Fire Origin',
    description: 'Fire origin area must be documented',
    severity: 'blocking',
    activeWhen: { perils: ['fire'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'peril_specific' },
    resolution: 'Document fire origin area and burn patterns',
    waivable: false,
  },

  // ----------------------------------------
  // ENDORSEMENT (Conditional)
  // ----------------------------------------
  {
    id: 'endorsement-roof-schedule',
    category: 'endorsement',
    name: 'Roof Schedule Documentation',
    description: 'Roof age and material must be documented for scheduled settlement',
    severity: 'blocking',
    activeWhen: { endorsements: ['roof_schedule'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'endorsement' },
    resolution: 'Document roof material type and estimated age',
    waivable: false,
  },
  {
    id: 'endorsement-matching',
    category: 'endorsement',
    name: 'Matching Documentation',
    description: 'Existing materials must be documented for matching endorsement',
    severity: 'blocking',
    activeWhen: { endorsements: ['matching'] },
    check: { type: 'bucket_fulfilled', bucketCategory: 'endorsement' },
    resolution: 'Photograph existing materials for matching comparison',
    waivable: false,
  },

  // ----------------------------------------
  // SOURCE TRACING (Conditional)
  // ----------------------------------------
  {
    id: 'source-interior-damage',
    category: 'source_tracing',
    name: 'Interior Damage Source',
    description: 'Interior damage must have documented source connection',
    severity: 'blocking',
    activeWhen: { hasGeometry: { type: 'zone', withDamage: true } },
    check: { type: 'custom', customCheckId: 'interior_damage_traced' },
    resolution: 'Document how interior damage connects to damage source',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 30,
      requireSupervisor: false,
    },
  },

  // ----------------------------------------
  // COMPLETENESS (Advisory)
  // ----------------------------------------
  {
    id: 'completeness-photo-count',
    category: 'completeness',
    name: 'Minimum Photo Count',
    description: 'Claim should have adequate photo documentation',
    severity: 'advisory',
    activeWhen: { always: true },
    check: { type: 'evidence_count', minCount: 10 },
    resolution: 'Consider capturing additional photos for thorough documentation',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 10,
      requireSupervisor: false,
    },
  },
  {
    id: 'completeness-notes',
    category: 'completeness',
    name: 'Documentation Notes',
    description: 'Key findings should be documented with notes',
    severity: 'advisory',
    activeWhen: { always: true },
    check: { type: 'custom', customCheckId: 'has_damage_notes' },
    resolution: 'Add notes describing key findings and damage observations',
    waivable: true,
    waiverRequirements: {
      requireReason: true,
      minReasonLength: 10,
      requireSupervisor: false,
    },
  },
];

// ============================================
// 3. VALIDATION ENGINE
// ============================================

/**
 * Run all applicable validation rules against workflow state.
 */
export function validateWorkflowForExport(
  state: WorkflowState,
  context: ValidationContext
): ExportReadiness {
  const issues: ExportReadiness['issues'] = {
    blocking: [],
    warning: [],
    advisory: [],
  };

  for (const rule of EXPORT_VALIDATION_RULES) {
    // Check if rule is active for this context
    if (!isRuleActive(rule, context)) {
      continue;
    }

    // Run the check
    const checkResult = runValidationCheck(rule.check, state, context);

    if (!checkResult.passed) {
      const issue: ExportIssue = {
        id: `${rule.id}-${Date.now()}`,
        severity: rule.severity,
        title: rule.name,
        description: rule.description,
        resolution: rule.resolution,
        bucketId: checkResult.bucketId,
        requirementId: checkResult.requirementId,
        waivable: rule.waivable,
      };

      if (rule.severity === 'blocking') {
        issues.blocking.push(issue);
      } else if (rule.severity === 'warning') {
        issues.warning.push(issue);
      } else {
        issues.advisory.push(issue);
      }
    }
  }

  // Calculate overall readiness
  const canExport = issues.blocking.length === 0;
  const riskLevel = calculateRiskLevel(issues);
  const defensibilityScore = calculateDefensibilityScore(state, issues);

  return {
    canExport,
    riskLevel,
    defensibilityScore,
    issues,
    summary: {
      totalBuckets: state.buckets.length,
      satisfiedBuckets: state.buckets.filter(b => isBucketSatisfied(b)).length,
      blockingGaps: issues.blocking.length,
      warningGaps: issues.warning.length,
    },
    lastValidated: new Date().toISOString(),
  };
}

export interface ValidationContext {
  peril: string;
  secondaryPerils: string[];
  endorsements: string[];
  propertyType: string;
  rooms: { id: string; hasDamage: boolean }[];
  damageZones: { id: string; roomId: string; sourceTraced: boolean }[];
}

interface CheckResult {
  passed: boolean;
  bucketId?: string;
  requirementId?: string;
  details?: string;
}

function isRuleActive(rule: ValidationRule, context: ValidationContext): boolean {
  const { activeWhen } = rule;

  if (activeWhen.always) {
    return true;
  }

  if (activeWhen.perils && activeWhen.perils.length > 0) {
    const allPerils = [context.peril, ...context.secondaryPerils];
    if (!activeWhen.perils.some(p => allPerils.includes(p))) {
      return false;
    }
  }

  if (activeWhen.endorsements && activeWhen.endorsements.length > 0) {
    if (!activeWhen.endorsements.some(e => context.endorsements.includes(e))) {
      return false;
    }
  }

  if (activeWhen.propertyTypes && activeWhen.propertyTypes.length > 0) {
    if (!activeWhen.propertyTypes.includes(context.propertyType)) {
      return false;
    }
  }

  if (activeWhen.hasGeometry) {
    if (activeWhen.hasGeometry.type === 'room') {
      const hasMatchingRoom = context.rooms.some(r =>
        activeWhen.hasGeometry!.withDamage ? r.hasDamage : true
      );
      if (!hasMatchingRoom) {
        return false;
      }
    }
    if (activeWhen.hasGeometry.type === 'zone') {
      if (context.damageZones.length === 0) {
        return false;
      }
    }
  }

  return true;
}

function runValidationCheck(
  check: ValidationCheck,
  state: WorkflowState,
  context: ValidationContext
): CheckResult {
  switch (check.type) {
    case 'bucket_fulfilled': {
      const categoryBuckets = state.buckets.filter(b => b.category === check.bucketCategory);
      for (const bucket of categoryBuckets) {
        if (!isBucketSatisfied(bucket)) {
          return { passed: false, bucketId: bucket.id };
        }
      }
      return { passed: true };
    }

    case 'evidence_count': {
      const totalPhotos = state.progress.photosCapture;
      if (totalPhotos < (check.minCount || 0)) {
        return { passed: false, details: `${totalPhotos}/${check.minCount} photos` };
      }
      return { passed: true };
    }

    case 'custom': {
      return runCustomCheck(check.customCheckId!, state, context);
    }

    default:
      return { passed: true };
  }
}

function runCustomCheck(
  checkId: string,
  state: WorkflowState,
  context: ValidationContext
): CheckResult {
  switch (checkId) {
    case 'all_damaged_rooms_documented': {
      const damagedRooms = context.rooms.filter(r => r.hasDamage);
      for (const room of damagedRooms) {
        const roomBuckets = state.buckets.filter(b => b.scope.roomId === room.id);
        const hasOverview = roomBuckets.some(b => b.category === 'interior_overview' && isBucketSatisfied(b));
        if (!hasOverview) {
          return { passed: false, details: `Room ${room.id} not documented` };
        }
      }
      return { passed: true };
    }

    case 'interior_damage_traced': {
      for (const zone of context.damageZones) {
        if (!zone.sourceTraced) {
          return { passed: false, details: `Zone ${zone.id} source not traced` };
        }
      }
      return { passed: true };
    }

    case 'has_damage_notes': {
      const damageDetailBuckets = state.buckets.filter(b => b.category === 'damage_detail');
      for (const bucket of damageDetailBuckets) {
        const noteReq = bucket.requirements.find(r => r.type === 'note');
        if (noteReq && !noteReq.fulfillment?.fulfilled) {
          return { passed: false, bucketId: bucket.id };
        }
      }
      return { passed: true };
    }

    default:
      return { passed: true };
  }
}

function isBucketSatisfied(bucket: EvidenceBucket): boolean {
  return bucket.requirements
    .filter(r => r.mandatory)
    .every(r => r.fulfillment?.fulfilled);
}

function calculateRiskLevel(issues: ExportReadiness['issues']): ExportReadiness['riskLevel'] {
  if (issues.blocking.length > 0) return 'blocked';
  if (issues.warning.length > 5) return 'high';
  if (issues.warning.length > 2) return 'medium';
  if (issues.warning.length > 0 || issues.advisory.length > 3) return 'low';
  return 'none';
}

function calculateDefensibilityScore(
  state: WorkflowState,
  issues: ExportReadiness['issues']
): number {
  // Base score from bucket completion
  const totalBuckets = state.buckets.length;
  const satisfiedBuckets = state.buckets.filter(b => isBucketSatisfied(b)).length;
  const baseScore = totalBuckets > 0 ? (satisfiedBuckets / totalBuckets) * 70 : 0;

  // Penalty for blocking issues
  const blockingPenalty = issues.blocking.length * 15;

  // Penalty for warnings
  const warningPenalty = issues.warning.length * 5;

  // Bonus for exceeding requirements
  const exceededBuckets = state.buckets.filter(b =>
    b.requirements.every(r =>
      r.fulfillment && r.fulfillment.current > r.fulfillment.required
    )
  ).length;
  const exceededBonus = exceededBuckets * 3;

  const score = Math.max(0, Math.min(100, baseScore - blockingPenalty - warningPenalty + exceededBonus + 30));
  return Math.round(score);
}

// ============================================
// 4. WAIVER HANDLING
// ============================================

export interface WaiverRequest {
  issueId: string;
  reason: string;
  requestedBy: string;
  supervisorId?: string;
}

export interface WaiverResult {
  success: boolean;
  error?: string;
  waiverId?: string;
}

/**
 * Validate and apply a waiver.
 */
export function validateWaiverRequest(
  request: WaiverRequest,
  rule: ValidationRule
): { valid: boolean; error?: string } {
  if (!rule.waivable) {
    return { valid: false, error: 'This issue cannot be waived' };
  }

  if (rule.waiverRequirements) {
    if (rule.waiverRequirements.requireReason && !request.reason) {
      return { valid: false, error: 'Waiver reason is required' };
    }

    if (
      rule.waiverRequirements.minReasonLength &&
      request.reason.length < rule.waiverRequirements.minReasonLength
    ) {
      return {
        valid: false,
        error: `Waiver reason must be at least ${rule.waiverRequirements.minReasonLength} characters`,
      };
    }

    if (rule.waiverRequirements.requireSupervisor && !request.supervisorId) {
      return { valid: false, error: 'Supervisor approval is required' };
    }
  }

  return { valid: true };
}

// ============================================
// 5. EXPORT READINESS UI HELPERS
// ============================================

/**
 * Get risk level display configuration.
 */
export function getRiskLevelDisplay(level: ExportReadiness['riskLevel']): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  const displays: Record<ExportReadiness['riskLevel'], ReturnType<typeof getRiskLevelDisplay>> = {
    blocked: { label: 'Blocked', color: '#dc2626', bgColor: '#fef2f2', icon: 'XCircle' },
    high: { label: 'High Risk', color: '#f97316', bgColor: '#fff7ed', icon: 'AlertTriangle' },
    medium: { label: 'Medium Risk', color: '#f59e0b', bgColor: '#fffbeb', icon: 'AlertCircle' },
    low: { label: 'Low Risk', color: '#22c55e', bgColor: '#f0fdf4', icon: 'CheckCircle' },
    none: { label: 'Ready', color: '#22c55e', bgColor: '#f0fdf4', icon: 'CheckCircle2' },
  };
  return displays[level];
}

/**
 * Get defensibility score display configuration.
 */
export function getDefensibilityDisplay(score: number): {
  label: string;
  color: string;
  description: string;
} {
  if (score >= 90) {
    return { label: 'Excellent', color: '#22c55e', description: 'Comprehensive documentation' };
  }
  if (score >= 75) {
    return { label: 'Good', color: '#84cc16', description: 'Well documented' };
  }
  if (score >= 60) {
    return { label: 'Fair', color: '#f59e0b', description: 'Some gaps in documentation' };
  }
  return { label: 'Poor', color: '#dc2626', description: 'Significant documentation gaps' };
}

/**
 * Get issue resolution action.
 */
export function getIssueResolutionAction(issue: ExportIssue): {
  label: string;
  action: string;
  params?: Record<string, string>;
} {
  if (issue.bucketId) {
    return {
      label: 'Go to Bucket',
      action: 'navigate_bucket',
      params: { bucketId: issue.bucketId },
    };
  }

  return {
    label: 'View Details',
    action: 'show_details',
    params: { issueId: issue.id },
  };
}
