/**
 * Redesigned Inspection Workflow Schema
 *
 * This file defines the canonical schema for the redesigned inspection workflow.
 *
 * KEY DESIGN CHANGES:
 * 1. Evidence Buckets replace step completion (fulfillment vs checkbox)
 * 2. Intent-specific step types with strict field rules
 * 3. Inline evidence capture (no modal-driven completion)
 * 4. Live mutation via hooks
 * 5. Export readiness at workflow level
 *
 * @see docs/WORKFLOW_REDESIGN.md for full specification
 */

// ============================================
// 1. EVIDENCE BUCKET MODEL
// ============================================

/**
 * Evidence bucket - the fundamental unit of inspection documentation.
 * Buckets are "satisfied" by accumulating evidence, not by checking a box.
 */
export interface EvidenceBucket {
  /** Unique bucket identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** What this bucket documents */
  purpose: string;

  /** Bucket category determines UI behavior and grouping */
  category: EvidenceBucketCategory;

  /** Scope binding - what geometry element this bucket is for */
  scope: BucketScope;

  /** Evidence requirements to satisfy this bucket */
  requirements: EvidenceRequirement[];

  /** Blocking behavior at export time */
  blocking: BucketBlockingBehavior;

  /** Conditions that make this bucket required */
  requiredWhen: BucketCondition;

  /** Origin tracking for explainability */
  origin: BucketOrigin;

  /** Tags for filtering and AI context */
  tags: string[];
}

export type EvidenceBucketCategory =
  | 'identity'           // Property/address verification
  | 'safety'             // Safety assessment
  | 'exterior_overview'  // Exterior elevation documentation
  | 'roof'               // Roof documentation
  | 'interior_overview'  // Room overview documentation
  | 'damage_detail'      // Specific damage documentation
  | 'source_tracing'     // Damage source linkage
  | 'measurement'        // Dimensional measurements
  | 'peril_specific'     // Peril-driven requirements
  | 'endorsement'        // Endorsement-driven requirements
  | 'synthesis';         // Gap-filling at end

export interface BucketScope {
  level: 'claim' | 'structure' | 'room' | 'zone' | 'exterior_face';
  structureId?: string;
  roomId?: string;
  roomName?: string;
  zoneId?: string;
  exteriorFace?: 'north' | 'south' | 'east' | 'west' | 'roof';
}

export interface BucketBlockingBehavior {
  type: 'always' | 'conditional' | 'advisory';
  /** For conditional, when is it blocking */
  condition?: BucketCondition;
  /** User-facing reason for blocking */
  blockingReason?: string;
}

export interface BucketCondition {
  always?: boolean;
  perils?: string[];
  endorsements?: string[];
  geometry?: { type: 'structure' | 'room' | 'zone'; withDamage?: boolean };
  custom?: { source: string; field: string; operator: string; value: unknown };
}

export interface BucketOrigin {
  type: 'base' | 'peril' | 'endorsement' | 'geometry' | 'discovery' | 'manual';
  ruleId?: string;
  endorsementCode?: string;
  discoveryId?: string;
}

// ============================================
// 2. EVIDENCE REQUIREMENT MODEL
// ============================================

/**
 * Evidence requirement within a bucket.
 * Each requirement specifies what evidence satisfies it.
 */
export interface EvidenceRequirement {
  id: string;
  type: EvidenceType;
  label: string;
  description?: string;

  /** Whether this is mandatory for bucket fulfillment */
  mandatory: boolean;

  /** Type-specific configuration */
  photo?: PhotoEvidenceConfig;
  measurement?: MeasurementEvidenceConfig;
  note?: NoteEvidenceConfig;
  document?: DocumentEvidenceConfig;

  /** Fulfillment tracking */
  fulfillment?: RequirementFulfillment;
}

export type EvidenceType = 'photo' | 'measurement' | 'note' | 'document' | 'signature';

export interface PhotoEvidenceConfig {
  minCount: number;
  maxCount?: number;
  angles?: PhotoAngle[];
  subjects?: string[];
  quality?: {
    minResolution?: number;
    requireGps?: boolean;
    requireTimestamp?: boolean;
  };
}

export type PhotoAngle =
  | 'overview' | 'detail' | 'measurement'
  | 'north' | 'south' | 'east' | 'west'
  | 'aerial' | 'cross_section';

export interface MeasurementEvidenceConfig {
  type: 'linear' | 'area' | 'moisture' | 'temperature' | 'count';
  unit: string;
  minReadings?: number;
  locations?: string[];
}

export interface NoteEvidenceConfig {
  promptText: string;
  minLength?: number;
  structuredFields?: StructuredField[];
}

export interface StructuredField {
  field: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface DocumentEvidenceConfig {
  acceptedTypes: string[];
  description: string;
}

export interface RequirementFulfillment {
  fulfilled: boolean;
  current: number;
  required: number;
  evidenceIds: string[];
  lastUpdated: string;
}

// ============================================
// 3. WORKFLOW STEP TYPES (Redesigned)
// ============================================

/**
 * Step type defines UI behavior, NOT evidence requirements.
 * Evidence comes from the bucket's requirements, not the step type.
 */
export type WorkflowStepType =
  | 'capture'        // Primary evidence capture (photos, measurements)
  | 'assess'         // Assessment/observation with notes
  | 'verify'         // Verification/confirmation
  | 'classify'       // Classification/categorization
  | 'interview'      // Conversation with insured/contractor
  | 'review';        // Document review

/**
 * Step type UI behavior rules.
 * These define what UI elements appear, NOT what evidence is required.
 */
export const STEP_TYPE_UI_RULES: Record<WorkflowStepType, StepTypeUIRule> = {
  capture: {
    showCameraFab: true,
    showMeasurementInput: true,
    showQuickNotes: true,
    showDamageSeverity: 'if_damage_tagged',
    notesPrompt: 'Quick notes (optional)',
    primaryAction: 'camera',
  },
  assess: {
    showCameraFab: true,
    showMeasurementInput: false,
    showQuickNotes: true,
    showDamageSeverity: 'if_damage_tagged',
    notesPrompt: 'Describe your assessment',
    primaryAction: 'notes',
  },
  verify: {
    showCameraFab: true,
    showMeasurementInput: false,
    showQuickNotes: true,
    showDamageSeverity: 'never',
    notesPrompt: 'Verification notes',
    primaryAction: 'confirm',
  },
  classify: {
    showCameraFab: false,
    showMeasurementInput: false,
    showQuickNotes: true,
    showDamageSeverity: 'always',
    notesPrompt: 'Classification notes',
    primaryAction: 'select',
  },
  interview: {
    showCameraFab: false,
    showMeasurementInput: false,
    showQuickNotes: true,
    showDamageSeverity: 'never',
    notesPrompt: 'Interview notes (required)',
    primaryAction: 'voice',
  },
  review: {
    showCameraFab: false,
    showMeasurementInput: false,
    showQuickNotes: true,
    showDamageSeverity: 'never',
    notesPrompt: 'Review findings',
    primaryAction: 'checklist',
  },
};

export interface StepTypeUIRule {
  showCameraFab: boolean;
  showMeasurementInput: boolean;
  showQuickNotes: boolean;
  showDamageSeverity: 'always' | 'if_damage_tagged' | 'never';
  notesPrompt: string;
  primaryAction: 'camera' | 'notes' | 'confirm' | 'select' | 'voice' | 'checklist';
}

// ============================================
// 4. WORKFLOW STEP MODEL (Redesigned)
// ============================================

/**
 * Workflow step - now a lightweight pointer to evidence bucket(s).
 * Steps guide the adjuster; buckets track evidence.
 */
export interface WorkflowStep {
  id: string;
  index: number;

  /** Step type determines UI, not evidence */
  type: WorkflowStepType;

  /** Display information */
  title: string;
  instructions: string;

  /** Phase for navigation */
  phase: InspectionPhase;

  /** Associated evidence bucket(s) */
  bucketIds: string[];

  /** Primary bucket (for single-focus steps) */
  primaryBucketId?: string;

  /** Geometry binding */
  roomId?: string;
  roomName?: string;
  structureId?: string;
  exteriorFace?: string;

  /** Tags for context */
  tags: string[];

  /** Estimated time */
  estimatedMinutes: number;

  /** Completion tracking - derived from bucket fulfillment */
  status: StepStatus;

  /** Origin for explainability */
  origin: StepOrigin;
}

export type InspectionPhase =
  | 'arrival'
  | 'orientation'
  | 'exterior'
  | 'interior'
  | 'synthesis'
  | 'departure';

export type StepStatus =
  | 'pending'      // Not started
  | 'active'       // Currently working on
  | 'satisfied'    // Bucket requirements met
  | 'skipped'      // Explicitly skipped
  | 'blocked';     // Cannot proceed (dependency)

export type StepOrigin =
  | 'base_rule'
  | 'peril_rule'
  | 'policy_rule'
  | 'geometry'
  | 'discovery'
  | 'manual';

// ============================================
// 5. WORKFLOW STATE MODEL (Redesigned)
// ============================================

/**
 * Complete workflow state - single source of truth.
 */
export interface WorkflowState {
  /** Workflow identification */
  id: string;
  claimId: string;
  version: number;

  /** Overall status */
  status: 'draft' | 'active' | 'completed' | 'exported';

  /** Evidence buckets (the actual documentation) */
  buckets: EvidenceBucket[];

  /** Steps (navigation guide) */
  steps: WorkflowStep[];

  /** Active phase and step */
  navigation: {
    currentPhase: InspectionPhase;
    currentStepId?: string;
    currentBucketId?: string;
  };

  /** Progress metrics */
  progress: {
    bucketsTotal: number;
    bucketsSatisfied: number;
    bucketsPartial: number;
    bucketsEmpty: number;
    photosCapture: number;
    measurementsCapture: number;
    notesCapture: number;
  };

  /** Export readiness */
  exportState: ExportReadiness;

  /** Mutation log for audit */
  mutations: WorkflowMutation[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ============================================
// 6. EXPORT READINESS MODEL
// ============================================

export interface ExportReadiness {
  /** Can export now */
  canExport: boolean;

  /** Overall risk level */
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'blocked';

  /** Defensibility score (0-100) */
  defensibilityScore: number;

  /** Issues by severity */
  issues: {
    blocking: ExportIssue[];
    warning: ExportIssue[];
    advisory: ExportIssue[];
  };

  /** Summary for UI */
  summary: {
    totalBuckets: number;
    satisfiedBuckets: number;
    blockingGaps: number;
    warningGaps: number;
  };

  /** Last validation */
  lastValidated: string;
}

export interface ExportIssue {
  id: string;
  severity: 'blocking' | 'warning' | 'advisory';
  title: string;
  description: string;
  resolution: string;
  bucketId?: string;
  requirementId?: string;
  waivable: boolean;
  waived?: boolean;
  waiverReason?: string;
}

// ============================================
// 7. WORKFLOW MUTATION MODEL
// ============================================

export interface WorkflowMutation {
  id: string;
  timestamp: string;
  triggeredBy: string;

  trigger: MutationTrigger;
  triggerData: Record<string, unknown>;

  changes: {
    bucketsAdded: string[];
    bucketsRemoved: string[];
    stepsAdded: string[];
    stepsRemoved: string[];
    requirementsActivated: string[];
    requirementsDeactivated: string[];
  };

  /** User notification (if any) */
  notification?: {
    type: 'toast' | 'banner' | 'silent';
    message: string;
  };
}

export type MutationTrigger =
  | 'room_added'
  | 'room_removed'
  | 'damage_zone_added'
  | 'damage_zone_updated'
  | 'photo_captured'
  | 'measurement_recorded'
  | 'discovery_logged'
  | 'endorsement_activated'
  | 'manual_step_added';

// ============================================
// 8. UI PANEL CONFIGURATIONS
// ============================================

/**
 * Primary inspection screen layout.
 * Replaces modal-driven step completion.
 */
export interface InspectionScreenLayout {
  /** Header: claim info, phase indicator, progress */
  header: HeaderConfig;

  /** Main area: current bucket/step focus */
  mainPanel: MainPanelConfig;

  /** Right/Bottom panel: evidence requirements list */
  requirementsPanel: RequirementsPanelConfig;

  /** Floating action: camera, voice */
  fab: FabConfig;

  /** Bottom sheet: export readiness, blockers */
  bottomSheet: BottomSheetConfig;
}

export interface HeaderConfig {
  showClaimNumber: boolean;
  showPropertyAddress: boolean;
  showPhaseNavigation: boolean;
  showProgressBar: boolean;
  showExportButton: boolean;
}

export interface MainPanelConfig {
  mode: 'bucket_focus' | 'step_list' | 'evidence_gallery';
  showBucketProgress: boolean;
  showInstructionCard: boolean;
  showQuickNotes: boolean;
  showDamageSeverity: boolean;
}

export interface RequirementsPanelConfig {
  position: 'right' | 'bottom';
  showFulfillmentStatus: boolean;
  showPhotoThumbnails: boolean;
  allowReorder: boolean;
}

export interface FabConfig {
  primaryAction: 'camera' | 'voice' | 'measurement';
  showSecondaryActions: boolean;
  position: 'bottom_right' | 'bottom_center';
}

export interface BottomSheetConfig {
  defaultState: 'collapsed' | 'peek' | 'expanded';
  showBlockerCount: boolean;
  showDefensibilityScore: boolean;
}

// ============================================
// 9. EVIDENCE CAPTURE FLOW (No Modal)
// ============================================

/**
 * Evidence capture happens inline, not in a modal.
 * This is the flow for capturing photos/measurements/notes.
 */
export interface EvidenceCaptureFlow {
  /** Step 1: User taps camera FAB or requirement row */
  trigger: 'fab_tap' | 'requirement_tap' | 'voice_command';

  /** Step 2: Camera opens (fullscreen on mobile, overlay on desktop) */
  captureMode: 'fullscreen_camera' | 'inline_camera' | 'measurement_input' | 'voice_note';

  /** Step 3: Evidence captured - auto-tagged to active bucket */
  autoTagging: {
    bucketId: string;
    requirementId: string;
    suggestedAngle?: PhotoAngle;
  };

  /** Step 4: Brief confirmation toast, return to inspection */
  confirmation: {
    type: 'toast';
    message: string;
    duration: 2000;
  };

  /** Step 5: Requirements panel updates fulfillment */
  postCapture: {
    updateFulfillment: boolean;
    checkBucketSatisfied: boolean;
    advanceToNextIfSatisfied: boolean;
  };
}

// ============================================
// 10. BUCKET INTENT TEMPLATES
// ============================================

/**
 * Predefined bucket templates for common inspection intents.
 * These replace generic "photo or note" steps.
 */
export const BUCKET_TEMPLATES: Record<string, BucketTemplate> = {
  // Identity & Safety
  ADDRESS_VERIFICATION: {
    name: 'Property Address',
    purpose: 'Verify correct property address for claim validity',
    category: 'identity',
    requirements: [
      { type: 'photo', label: 'Address Photo', mandatory: true, photo: { minCount: 1, subjects: ['address numbers'] } },
    ],
    blocking: { type: 'always', blockingReason: 'Address verification is required for claim validity' },
    tags: ['verification', 'address', 'blocking'],
  },

  SAFETY_ASSESSMENT: {
    name: 'Safety Assessment',
    purpose: 'Document property safety before inspection',
    category: 'safety',
    requirements: [
      { type: 'note', label: 'Safety Notes', mandatory: true, note: { promptText: 'Document any safety hazards or confirm safe to inspect', minLength: 20 } },
    ],
    blocking: { type: 'always', blockingReason: 'Safety assessment is required before inspection' },
    tags: ['safety', 'blocking'],
  },

  // Exterior
  ELEVATION_NORTH: {
    name: 'North Elevation',
    purpose: 'Document north-facing exterior of structure',
    category: 'exterior_overview',
    requirements: [
      { type: 'photo', label: 'North Overview', mandatory: true, photo: { minCount: 1, angles: ['north', 'overview'] } },
      { type: 'photo', label: 'North Details', mandatory: false, photo: { minCount: 0, maxCount: 5, angles: ['north', 'detail'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] }, blockingReason: 'All elevations required for wind/hail claims' },
    tags: ['exterior', 'elevation', 'north'],
  },

  ELEVATION_SOUTH: {
    name: 'South Elevation',
    purpose: 'Document south-facing exterior of structure',
    category: 'exterior_overview',
    requirements: [
      { type: 'photo', label: 'South Overview', mandatory: true, photo: { minCount: 1, angles: ['south', 'overview'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] } },
    tags: ['exterior', 'elevation', 'south'],
  },

  ELEVATION_EAST: {
    name: 'East Elevation',
    purpose: 'Document east-facing exterior of structure',
    category: 'exterior_overview',
    requirements: [
      { type: 'photo', label: 'East Overview', mandatory: true, photo: { minCount: 1, angles: ['east', 'overview'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] } },
    tags: ['exterior', 'elevation', 'east'],
  },

  ELEVATION_WEST: {
    name: 'West Elevation',
    purpose: 'Document west-facing exterior of structure',
    category: 'exterior_overview',
    requirements: [
      { type: 'photo', label: 'West Overview', mandatory: true, photo: { minCount: 1, angles: ['west', 'overview'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] } },
    tags: ['exterior', 'elevation', 'west'],
  },

  // Roof
  ROOF_OVERVIEW: {
    name: 'Roof Overview',
    purpose: 'Document overall roof condition',
    category: 'roof',
    requirements: [
      { type: 'photo', label: 'Roof Planes', mandatory: true, photo: { minCount: 2, angles: ['overview'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] } },
    tags: ['roof', 'exterior'],
  },

  HAIL_TEST_SQUARE: {
    name: 'Hail Test Square',
    purpose: 'Document hail impact density per 10x10 square',
    category: 'peril_specific',
    requirements: [
      { type: 'photo', label: 'Test Square Photo', mandatory: true, photo: { minCount: 1, subjects: ['10x10 marked area', 'hail impacts'] } },
      { type: 'measurement', label: 'Impact Count', mandatory: true, measurement: { type: 'count', unit: 'hits', minReadings: 1 } },
      { type: 'note', label: 'Storm Direction', mandatory: true, note: { promptText: 'Document storm direction and test square location' } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['wind_hail'] } },
    tags: ['hail', 'test_square', 'blocking'],
  },

  // Water Damage
  WATER_SOURCE: {
    name: 'Water Source',
    purpose: 'Document origin point of water intrusion',
    category: 'source_tracing',
    requirements: [
      { type: 'photo', label: 'Source Photo', mandatory: true, photo: { minCount: 2, angles: ['overview', 'detail'] } },
      { type: 'note', label: 'Source Description', mandatory: true, note: {
        promptText: 'Describe the water source and entry point',
        structuredFields: [
          { field: 'sourceType', type: 'select', required: true, options: ['plumbing', 'appliance', 'hvac', 'roof', 'window', 'foundation', 'unknown'] },
        ]
      }},
    ],
    blocking: { type: 'conditional', condition: { perils: ['water', 'flood'] } },
    tags: ['water', 'source', 'blocking'],
  },

  WATER_CATEGORY: {
    name: 'Water Category Classification',
    purpose: 'Classify water contamination per IICRC S500',
    category: 'peril_specific',
    requirements: [
      { type: 'note', label: 'Category Classification', mandatory: true, note: {
        promptText: 'Select water category and document evidence',
        structuredFields: [
          { field: 'waterCategory', type: 'select', required: true, options: ['category_1_clean', 'category_2_gray', 'category_3_black'] },
          { field: 'categoryEvidence', type: 'text', required: true },
        ]
      }},
    ],
    blocking: { type: 'conditional', condition: { perils: ['water', 'flood'] } },
    tags: ['water', 'iicrc', 'classification', 'blocking'],
  },

  MOISTURE_READINGS: {
    name: 'Moisture Readings',
    purpose: 'Document moisture levels in affected materials',
    category: 'measurement',
    requirements: [
      { type: 'measurement', label: 'Moisture %', mandatory: true, measurement: { type: 'moisture', unit: '%', minReadings: 4, locations: ['wall_base', 'wall_mid', 'wall_top', 'floor'] } },
      { type: 'photo', label: 'Meter Display', mandatory: true, photo: { minCount: 2, subjects: ['moisture meter display'] } },
    ],
    blocking: { type: 'conditional', condition: { perils: ['water', 'flood'] } },
    tags: ['water', 'moisture', 'measurement', 'blocking'],
  },

  // Interior Room
  ROOM_OVERVIEW: {
    name: 'Room Overview',
    purpose: 'Document overall room condition',
    category: 'interior_overview',
    requirements: [
      { type: 'photo', label: 'Room Overview', mandatory: true, photo: { minCount: 1, angles: ['overview'] } },
    ],
    blocking: { type: 'advisory' },
    tags: ['room', 'interior', 'overview'],
  },

  ROOM_DAMAGE_DETAIL: {
    name: 'Room Damage Detail',
    purpose: 'Document specific damage in room',
    category: 'damage_detail',
    requirements: [
      { type: 'photo', label: 'Damage Photos', mandatory: true, photo: { minCount: 3, angles: ['detail', 'measurement'] } },
      { type: 'note', label: 'Damage Description', mandatory: true, note: { promptText: 'Describe damage extent, materials affected', minLength: 20 } },
    ],
    blocking: { type: 'conditional', condition: { geometry: { type: 'room', withDamage: true } } },
    tags: ['room', 'damage', 'detail', 'blocking'],
  },

  ROOM_MEASUREMENTS: {
    name: 'Room Dimensions',
    purpose: 'Capture room measurements for scope',
    category: 'measurement',
    requirements: [
      { type: 'measurement', label: 'Dimensions', mandatory: true, measurement: { type: 'linear', unit: 'ft', minReadings: 3, locations: ['length', 'width', 'height'] } },
    ],
    blocking: { type: 'advisory' },
    tags: ['room', 'measurement', 'dimensions'],
  },

  // Fire
  FIRE_ORIGIN: {
    name: 'Fire Origin',
    purpose: 'Document fire origin area and burn patterns',
    category: 'peril_specific',
    requirements: [
      { type: 'photo', label: 'Origin Photos', mandatory: true, photo: { minCount: 4, angles: ['overview', 'detail'] } },
      { type: 'note', label: 'Origin Documentation', mandatory: true, note: {
        promptText: 'Document fire origin area and investigation status',
        structuredFields: [
          { field: 'originRoom', type: 'text', required: true },
          { field: 'investigationPending', type: 'boolean', required: true },
        ]
      }},
    ],
    blocking: { type: 'conditional', condition: { perils: ['fire'] } },
    tags: ['fire', 'origin', 'blocking'],
  },

  // Endorsement
  ROOF_SCHEDULE_DOCUMENTATION: {
    name: 'Roof Age & Material',
    purpose: 'Document roof for scheduled depreciation calculation',
    category: 'endorsement',
    requirements: [
      { type: 'photo', label: 'Material Close-up', mandatory: true, photo: { minCount: 2, subjects: ['roof material'] } },
      { type: 'photo', label: 'Age Indicators', mandatory: true, photo: { minCount: 2, subjects: ['age marker', 'manufacturer stamp'] } },
      { type: 'note', label: 'Roof Assessment', mandatory: true, note: {
        promptText: 'Document roof material and estimated age',
        structuredFields: [
          { field: 'roofMaterial', type: 'select', required: true, options: ['asphalt_3tab', 'asphalt_architectural', 'wood_shake', 'metal', 'tile', 'slate', 'other'] },
          { field: 'estimatedAge', type: 'number', required: true },
        ]
      }},
    ],
    blocking: { type: 'conditional', condition: { endorsements: ['roof_schedule'] } },
    tags: ['endorsement', 'roof_schedule', 'blocking'],
  },
};

export interface BucketTemplate {
  name: string;
  purpose: string;
  category: EvidenceBucketCategory;
  requirements: Omit<EvidenceRequirement, 'id' | 'fulfillment'>[];
  blocking: BucketBlockingBehavior;
  tags: string[];
}

// ============================================
// 11. STEP TYPE → BUCKET MAPPING
// ============================================

/**
 * Maps legacy step types to new bucket templates.
 * Used during migration.
 */
export const LEGACY_STEP_TYPE_MAPPING: Record<string, { bucketTemplate: string; stepType: WorkflowStepType }> = {
  // Legacy type → New bucket + step type
  'interview': { bucketTemplate: 'SAFETY_ASSESSMENT', stepType: 'interview' },
  'documentation': { bucketTemplate: 'ROOM_OVERVIEW', stepType: 'review' },
  'photo': { bucketTemplate: 'ROOM_DAMAGE_DETAIL', stepType: 'capture' },
  'observation': { bucketTemplate: 'ROOM_DAMAGE_DETAIL', stepType: 'assess' },
  'measurement': { bucketTemplate: 'ROOM_MEASUREMENTS', stepType: 'capture' },
  'safety_check': { bucketTemplate: 'SAFETY_ASSESSMENT', stepType: 'verify' },
  'checklist': { bucketTemplate: 'ROOM_OVERVIEW', stepType: 'review' },
  'equipment': { bucketTemplate: 'ROOM_OVERVIEW', stepType: 'review' },
};

// ============================================
// 12. FORBIDDEN FIELD COMBINATIONS
// ============================================

/**
 * Strict rules for what fields are FORBIDDEN per step type.
 * This prevents invalid UI states.
 */
export const FORBIDDEN_FIELDS: Record<WorkflowStepType, ForbiddenFieldRules> = {
  capture: {
    forbiddenFields: [],
    allowedFields: ['camera', 'measurement', 'quickNotes', 'damageSeverity'],
  },
  assess: {
    forbiddenFields: ['measurement'],
    allowedFields: ['camera', 'quickNotes', 'damageSeverity'],
  },
  verify: {
    forbiddenFields: ['measurement', 'damageSeverity'],
    allowedFields: ['camera', 'quickNotes', 'confirmButton'],
  },
  classify: {
    forbiddenFields: ['camera', 'measurement'],
    allowedFields: ['quickNotes', 'damageSeverity', 'classificationSelect'],
  },
  interview: {
    forbiddenFields: ['camera', 'measurement', 'damageSeverity'],
    allowedFields: ['quickNotes', 'voiceInput'],
  },
  review: {
    forbiddenFields: ['camera', 'measurement', 'damageSeverity'],
    allowedFields: ['quickNotes', 'checklist'],
  },
};

export interface ForbiddenFieldRules {
  forbiddenFields: string[];
  allowedFields: string[];
}
