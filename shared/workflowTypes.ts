/**
 * Dynamic Inspection Workflow Types
 *
 * Defines the type system for rule-driven, evidence-enforced inspection workflows.
 *
 * Key Concepts:
 * - WorkflowCondition: Rules that determine when steps appear
 * - EvidenceRequirement: What evidence is required to complete a step
 * - GeometryBinding: How steps relate to rooms/walls/zones
 * - WorkflowRule: The complete rule definition for generating steps
 */

// ============================================
// CONDITION TYPES
// ============================================

/**
 * Condition operators for rule evaluation
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'exists'
  | 'not_exists'
  | 'in'
  | 'not_in'
  | 'matches_regex';

/**
 * Source of condition data
 */
export type ConditionSource =
  | 'fnol'           // FNOL / loss context data
  | 'policy'         // Policy form / coverage data
  | 'endorsement'    // Endorsement extraction data
  | 'geometry'       // Room/wall/zone geometry
  | 'damage'         // Damage zone data
  | 'claim'          // Claim metadata
  | 'discovery';     // Runtime discoveries during inspection

/**
 * Individual condition for step applicability
 */
export interface WorkflowCondition {
  id: string;
  source: ConditionSource;
  field: string;                    // Path to field (e.g., "peril.primary", "property.roof.ageAtLoss")
  operator: ConditionOperator;
  value: unknown;                   // Comparison value
  description?: string;             // Human-readable explanation
}

/**
 * Combined condition group with logic operators
 */
export interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (WorkflowCondition | ConditionGroup)[];
}

// ============================================
// EVIDENCE REQUIREMENT TYPES
// ============================================

/**
 * Evidence types that can be required
 */
export type EvidenceType =
  | 'photo'
  | 'measurement'
  | 'note'
  | 'signature'
  | 'document'
  | 'checklist';

/**
 * Photo angle/perspective requirements
 */
export type PhotoAngle =
  | 'overview'       // Wide shot showing context
  | 'detail'         // Close-up of specific damage
  | 'measurement'    // Photo with scale reference
  | 'before_after'   // Comparison shot
  | 'north'          // Directional exterior shots
  | 'south'
  | 'east'
  | 'west'
  | 'aerial'         // Drone/roof view
  | 'cross_section'; // Cut-away or section view

/**
 * Photo requirement specification
 */
export interface PhotoRequirement {
  minCount: number;
  maxCount?: number;
  angles?: PhotoAngle[];
  subjects?: string[];              // What should be in the photo (e.g., "damage boundary", "material type")
  quality?: {
    minResolution?: number;         // Minimum megapixels
    requireFlash?: boolean;
    requireNoBlur?: boolean;
  };
  metadata?: {
    requireGps?: boolean;
    requireTimestamp?: boolean;
  };
}

/**
 * Measurement requirement specification
 */
export interface MeasurementRequirement {
  type: 'linear' | 'area' | 'volume' | 'moisture' | 'temperature';
  unit: string;                     // 'ft', 'sf', 'cf', '%', 'F'
  minReadings?: number;             // Number of readings required
  locations?: string[];             // Where to measure (e.g., "floor center", "wall base")
  tolerance?: number;               // Acceptable variance
}

/**
 * Note requirement specification
 */
export interface NoteRequirement {
  minLength?: number;               // Minimum character count
  promptText: string;               // What to document
  structuredFields?: {              // Required structured data
    field: string;
    type: 'text' | 'number' | 'boolean' | 'select';
    required: boolean;
    options?: string[];             // For select type
  }[];
}

/**
 * Complete evidence requirement for a step
 */
export interface EvidenceRequirement {
  type: EvidenceType;
  label: string;
  description?: string;
  required: boolean;                // Must be fulfilled to complete step
  photo?: PhotoRequirement;
  measurement?: MeasurementRequirement;
  note?: NoteRequirement;
}

// ============================================
// GEOMETRY BINDING TYPES
// ============================================

/**
 * Scope of geometry binding
 */
export type GeometryScope =
  | 'structure'      // Applies to entire structure
  | 'room'           // Applies to specific room
  | 'wall'           // Applies to specific wall
  | 'zone'           // Applies to damage zone
  | 'feature'        // Applies to room feature (door, window)
  | 'exterior';      // Applies to building exterior

/**
 * Binding between workflow step and geometry element
 */
export interface GeometryBinding {
  scope: GeometryScope;
  structureId?: string;
  roomId?: string;
  wallDirection?: 'north' | 'south' | 'east' | 'west';
  zoneId?: string;
  featureId?: string;
  exteriorFace?: 'north' | 'south' | 'east' | 'west' | 'roof';
}

// ============================================
// WORKFLOW RULE TYPES
// ============================================

/**
 * Origin of a workflow step
 */
export type StepOrigin =
  | 'base_rule'      // Standard rule from rules engine
  | 'policy_rule'    // Generated from policy/endorsement requirement
  | 'peril_rule'     // Generated from peril-specific rules
  | 'discovery'      // Added during inspection based on findings
  | 'geometry'       // Added when room/zone added
  | 'manual';        // Manually added by adjuster

/**
 * Blocking behavior for a step
 */
export type BlockingBehavior =
  | 'blocking'       // Must complete to proceed/export
  | 'advisory'       // Recommended but not required
  | 'conditional';   // Blocking only if certain conditions met

/**
 * Complete workflow rule definition
 */
export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  version: string;

  // When this rule applies
  conditions: ConditionGroup;

  // What step to create
  step: {
    phase: string;
    stepType: string;
    title: string;
    instructions: string;
    estimatedMinutes: number;
    tags: string[];
    perilSpecific?: string;
  };

  // Evidence requirements
  evidence: EvidenceRequirement[];

  // Blocking behavior
  blocking: BlockingBehavior;
  blockingCondition?: ConditionGroup;  // For conditional blocking

  // Geometry scope
  geometryScope?: GeometryScope;       // If set, step is created per geometry element

  // Priority for ordering
  priority: number;

  // Source tracking
  origin: StepOrigin;
  sourceReference?: string;            // Endorsement code, peril rule ID, etc.
}

// ============================================
// WORKFLOW STEP EXTENDED TYPES
// ============================================

/**
 * Extended step data with rule enforcement
 */
export interface DynamicWorkflowStep {
  id: string;
  workflowId: string;
  stepIndex: number;

  // Basic step info
  phase: string;
  stepType: string;
  title: string;
  instructions: string;
  required: boolean;
  estimatedMinutes: number;
  tags: string[];

  // Rule-driven properties
  origin: StepOrigin;
  sourceRuleId?: string;
  conditions?: ConditionGroup;

  // Evidence requirements
  evidenceRequirements: EvidenceRequirement[];
  evidenceFulfilled: {
    requirementId: string;
    fulfilled: boolean;
    fulfilledBy?: string[];          // IDs of photos/measurements/notes
    fulfilledAt?: string;
  }[];

  // Blocking behavior
  blocking: BlockingBehavior;
  blockingCondition?: ConditionGroup;
  isCurrentlyBlocking: boolean;      // Evaluated at runtime

  // Geometry binding
  geometryBinding?: GeometryBinding;

  // Completion status
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  completedBy?: string;
  completedAt?: string;
  notes?: string;

  // Room association
  roomId?: string;
  roomName?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ============================================
// EVIDENCE FULFILLMENT TYPES
// ============================================

/**
 * Record of evidence attached to a step
 */
export interface StepEvidenceRecord {
  id: string;
  stepId: string;
  requirementId: string;            // Which evidence requirement this fulfills
  evidenceType: EvidenceType;

  // Reference to actual evidence
  photoId?: string;                 // claim_photos.id
  measurementData?: {
    type: string;
    value: number;
    unit: string;
    location?: string;
    capturedAt: string;
  };
  noteData?: {
    text: string;
    structuredData?: Record<string, unknown>;
    capturedAt: string;
  };

  // Validation status
  validated: boolean;
  validationErrors?: string[];

  // Timestamps
  capturedAt: string;
  capturedBy: string;
  createdAt: string;
}

// ============================================
// WORKFLOW MUTATION TYPES
// ============================================

/**
 * Event types that can trigger workflow mutation
 */
export type MutationTrigger =
  | 'room_added'
  | 'room_removed'
  | 'damage_zone_added'
  | 'damage_zone_updated'
  | 'scope_inferred'
  | 'discovery_logged'
  | 'policy_updated'
  | 'endorsement_added';

/**
 * Mutation event for workflow changes
 */
export interface WorkflowMutationEvent {
  trigger: MutationTrigger;
  timestamp: string;
  data: {
    roomId?: string;
    roomName?: string;
    zoneId?: string;
    damageType?: string;
    discoveryType?: string;
    discoveryDetails?: Record<string, unknown>;
  };
}

/**
 * Result of workflow mutation
 */
export interface WorkflowMutationResult {
  stepsAdded: DynamicWorkflowStep[];
  stepsRemoved: string[];            // Step IDs removed
  stepsModified: {
    stepId: string;
    changes: Partial<DynamicWorkflowStep>;
  }[];
}

// ============================================
// EXPORT VALIDATION TYPES
// ============================================

/**
 * Risk level for export
 */
export type ExportRiskLevel =
  | 'none'           // All evidence complete
  | 'low'            // Minor advisory items missing
  | 'medium'         // Some recommended evidence missing
  | 'high'           // Required evidence missing
  | 'blocked';       // Blocking evidence missing, cannot export

/**
 * Evidence gap in export validation
 */
export interface EvidenceGap {
  stepId: string;
  stepTitle: string;
  requirement: EvidenceRequirement;
  isBlocking: boolean;
  reason: string;
}

/**
 * Export validation result
 */
export interface ExportValidationResult {
  canExport: boolean;
  riskLevel: ExportRiskLevel;
  gaps: EvidenceGap[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    blockedSteps: number;
    evidenceComplete: number;
    evidenceMissing: number;
  };
  warnings: string[];
}

// ============================================
// RULE EVALUATION CONTEXT
// ============================================

/**
 * Context provided to rule evaluation
 */
export interface RuleEvaluationContext {
  // FNOL data
  fnol: {
    dateOfLoss?: string;
    lossDescription?: string;
    reportedDamage?: string[];
  };

  // Peril information
  peril: {
    primary: string;
    secondary: string[];
    metadata?: Record<string, unknown>;
  };

  // Policy information
  policy: {
    number?: string;
    coverageA?: number;
    coverageB?: number;
    coverageC?: number;
    coverageD?: number;
    deductible?: number;
    lossSettlement?: {
      dwelling?: string;
      roofing?: {
        basis: string;
        isScheduled: boolean;
        metalFunctionalRequirement?: boolean;
      };
    };
  };

  // Endorsements
  endorsements: {
    formCode: string;
    title: string;
    category: string;
    inspectionRequirements: string[];
  }[];

  // Property information
  property: {
    type?: string;
    yearBuilt?: number;
    stories?: number;
    roofType?: string;
    roofAge?: number;
    exteriorDamaged?: boolean;
    interiorDamaged?: boolean;
  };

  // Geometry (rooms, walls, zones)
  geometry: {
    structures: {
      id: string;
      name: string;
      type: string;
    }[];
    rooms: {
      id: string;
      name: string;
      structureId: string;
      hasDamage: boolean;
      damageTypes?: string[];
    }[];
    damageZones: {
      id: string;
      roomId: string;
      damageType: string;
      severity?: string;
    }[];
  };

  // Discoveries (runtime findings)
  discoveries: {
    type: string;
    details: Record<string, unknown>;
    timestamp: string;
  }[];
}
