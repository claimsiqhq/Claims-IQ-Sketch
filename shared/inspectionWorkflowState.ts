/**
 * Inspection Workflow State Model
 *
 * This file defines the CANONICAL runtime state for dynamic inspection workflows.
 *
 * Design Principles:
 * - Evidence fulfillment replaces step completion
 * - State changes trigger workflow mutations
 * - Blocking enforcement happens at export, not during capture
 * - All consumers (voice agents, UI panels, export) read from this unified state
 *
 * @see docs/DYNAMIC_WORKFLOW_ENGINE.md for rules architecture
 * @see docs/INSPECTION_FLOW_DESIGN.md for phase definitions
 */

import type {
  ConditionGroup,
  EvidenceRequirement,
  EvidenceType,
  ExportRiskLevel,
  GeometryBinding,
  MutationTrigger,
  StepOrigin,
  BlockingBehavior,
} from './workflowTypes';

// ============================================
// 1. CANONICAL WORKFLOW STATE
// ============================================

/**
 * The minimal canonical workflow state object.
 * This is the single source of truth for inspection progress.
 */
export interface InspectionWorkflowState {
  /** Unique workflow identifier */
  workflowId: string;

  /** Claim reference */
  claimId: string;
  claimNumber: string;

  /** Workflow version (increments on mutation) */
  version: number;

  /** Overall workflow status */
  status: WorkflowStatus;

  /** Known facts about the claim (immutable during inspection) */
  claimFacts: ClaimFacts;

  /** Current inspection progress */
  progress: InspectionProgress;

  /** Evidence buckets and fulfillment state */
  evidenceBuckets: EvidenceBucketState[];

  /** Active risks and blockers */
  activeBlockers: WorkflowBlocker[];

  /** Export readiness */
  exportState: ExportReadinessState;

  /** Mutation history (audit trail) */
  mutationLog: WorkflowMutation[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type WorkflowStatus =
  | 'draft'           // Generated but not started
  | 'active'          // Inspection in progress
  | 'paused'          // Temporarily paused
  | 'completed'       // All evidence captured, ready for export
  | 'exported'        // Successfully exported
  | 'archived';       // Closed/archived

// ============================================
// 2. CLAIM FACTS (Known at workflow start)
// ============================================

/**
 * Immutable facts known at workflow generation time.
 * These shape the workflow but don't change during inspection.
 */
export interface ClaimFacts {
  /** FNOL data */
  fnol: FNOLFacts;

  /** Policy and coverage data */
  policy: PolicyFacts;

  /** Active endorsements that affect inspection */
  endorsements: EndorsementFacts[];

  /** Property information */
  property: PropertyFacts;

  /** Peril classification */
  peril: PerilFacts;
}

export interface FNOLFacts {
  dateOfLoss: string;
  lossDescription?: string;
  reportedDamageAreas: string[];
  reportedPeril?: string;
  weatherEventConfirmed?: boolean;
  weatherEventDetails?: string;
}

export interface PolicyFacts {
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;

  /** Coverage limits */
  coverageA?: number;  // Dwelling
  coverageB?: number;  // Other structures
  coverageC?: number;  // Personal property
  coverageD?: number;  // Loss of use

  /** Deductibles */
  deductible: number;
  perilSpecificDeductibles?: Record<string, number>;

  /** Loss settlement basis */
  lossSettlement: {
    dwellingBasis: 'rcv' | 'acv' | 'functional';
    roofBasis?: 'rcv' | 'acv' | 'scheduled' | 'functional';
    roofScheduleApplies?: boolean;
    roofAgeAtLoss?: number;
    personalPropertyBasis: 'rcv' | 'acv';
  };
}

export interface EndorsementFacts {
  formCode: string;
  title: string;
  category: EndorsementCategory;

  /** How this endorsement affects inspection requirements */
  inspectionImpact: EndorsementInspectionImpact;

  /** Conditions that activate this endorsement's requirements */
  activationConditions?: ConditionGroup;

  /** Whether currently active based on claim context */
  isActive: boolean;
}

export type EndorsementCategory =
  | 'roof_schedule'           // Roof depreciation schedule
  | 'loss_settlement'         // Settlement basis modification
  | 'ordinance_law'           // Code upgrade coverage
  | 'water_damage'            // Water damage limitations
  | 'mold_exclusion'          // Mold coverage limitations
  | 'matching'                // Matching/uniformity requirements
  | 'coverage_specific'       // Coverage modifications
  | 'state_amendatory'        // State-required amendments
  | 'other';

export interface EndorsementInspectionImpact {
  /** Additional evidence requirements */
  additionalRequirements: string[];

  /** Documentation that must be captured */
  requiredDocumentation: string[];

  /** Blocking requirements from this endorsement */
  blockingRequirements: string[];

  /** Advisory notes to surface during inspection */
  advisoryNotes: string[];
}

export interface PropertyFacts {
  address: string;
  city: string;
  state: string;
  zip: string;

  propertyType: 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'mobile_home' | 'commercial';
  yearBuilt?: number;
  stories?: number;
  squareFootage?: number;

  constructionType?: string;
  roofType?: string;
  roofAge?: number;

  /** Known structures from FNOL/policy */
  knownStructures: KnownStructure[];
}

export interface KnownStructure {
  id: string;
  name: string;
  structureType: 'main_dwelling' | 'detached_garage' | 'shed' | 'fence' | 'pool' | 'other_structure';
  coverageType: 'coverage_a' | 'coverage_b';
  reportedDamage: boolean;
}

export interface PerilFacts {
  primary: PerilType;
  secondary: PerilType[];

  /** Peril-specific metadata */
  metadata?: PerilMetadata;

  /** Confidence in peril classification */
  confidence: 'confirmed' | 'likely' | 'suspected';
}

export type PerilType =
  | 'wind_hail'
  | 'fire'
  | 'water'
  | 'flood'
  | 'smoke'
  | 'mold'
  | 'impact'
  | 'theft'
  | 'vandalism'
  | 'other';

export type PerilMetadata =
  | WaterPerilMetadata
  | WindHailPerilMetadata
  | FirePerilMetadata
  | FloodPerilMetadata;

export interface WaterPerilMetadata {
  perilType: 'water';
  source?: 'plumbing' | 'appliance' | 'roof_leak' | 'hvac' | 'unknown';
  category?: 1 | 2 | 3;  // IICRC water category
  duration?: 'acute' | 'chronic' | 'unknown';
  moldRisk: boolean;
}

export interface WindHailPerilMetadata {
  perilType: 'wind_hail';
  windSpeedMph?: number;
  hailSizeInches?: number;
  stormDate?: string;
  weatherVerified: boolean;
}

export interface FirePerilMetadata {
  perilType: 'fire';
  originKnown: boolean;
  originRoom?: string;
  damageTypes: ('flame' | 'heat' | 'smoke' | 'soot' | 'water')[];
  habitability: 'habitable' | 'uninhabitable' | 'partial';
}

export interface FloodPerilMetadata {
  perilType: 'flood';
  source: 'rising_water' | 'storm_surge' | 'overflow' | 'mudflow';
  floodZone?: string;
  waterDepthInches?: number;
}

// ============================================
// 3. INSPECTION PROGRESS
// ============================================

/**
 * Current state of inspection progress.
 * Tracks coverage, not step completion.
 */
export interface InspectionProgress {
  /** Phase coverage (not gates) */
  phases: PhaseProgress[];

  /** Discovered geometry during inspection */
  discoveredGeometry: DiscoveredGeometry;

  /** Active discoveries (things found that weren't in FNOL) */
  discoveries: InspectionDiscovery[];

  /** Time tracking */
  timeTracking: TimeTracking;
}

export interface PhaseProgress {
  phase: InspectionPhase;

  /** Coverage percentage (0-100) */
  coveragePercent: number;

  /** What's been covered */
  coveredAreas: string[];

  /** What's still missing */
  gaps: string[];

  /** Phase entered timestamp */
  enteredAt?: string;

  /** Whether phase requirements are satisfied */
  requirementsSatisfied: boolean;
}

export type InspectionPhase =
  | 'arrival'
  | 'orientation'
  | 'exterior'
  | 'interior'
  | 'synthesis'
  | 'departure';

export interface DiscoveredGeometry {
  /** Structures confirmed/added during inspection */
  structures: DiscoveredStructure[];

  /** Rooms discovered during inspection */
  rooms: DiscoveredRoom[];

  /** Damage zones documented */
  damageZones: DiscoveredDamageZone[];
}

export interface DiscoveredStructure {
  id: string;
  name: string;
  structureType: string;

  /** Whether this was in FNOL or discovered */
  origin: 'fnol' | 'discovered';

  /** Documentation status */
  documented: boolean;

  /** Linked evidence bucket IDs */
  evidenceBucketIds: string[];
}

export interface DiscoveredRoom {
  id: string;
  structureId: string;
  name: string;
  level: string;
  roomType: string;

  /** Whether this was in FNOL or discovered */
  origin: 'fnol' | 'discovered';

  /** Has damage in this room */
  hasDamage: boolean;

  /** Damage types found in this room */
  damageTypes: string[];

  /** Documentation status */
  documented: boolean;

  /** Linked evidence bucket IDs */
  evidenceBucketIds: string[];
}

export interface DiscoveredDamageZone {
  id: string;
  roomId?: string;
  structureId?: string;

  /** Location description */
  location: string;

  /** Damage classification */
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe';

  /** Associated peril */
  associatedPeril: PerilType;

  /** Source traced (for interior damage) */
  sourceTraced: boolean;
  sourceDescription?: string;
  linkedExteriorZoneId?: string;

  /** Documentation status */
  documented: boolean;

  /** Linked evidence bucket ID */
  evidenceBucketId?: string;
}

export interface InspectionDiscovery {
  id: string;
  type: DiscoveryType;
  timestamp: string;

  /** What was discovered */
  description: string;

  /** Details about the discovery */
  details: Record<string, unknown>;

  /** What workflow mutation this triggered */
  triggeredMutation?: string;

  /** Whether discovery was acknowledged/processed */
  processed: boolean;
}

export type DiscoveryType =
  | 'additional_damage'          // Damage not in FNOL
  | 'additional_room'            // Room not in FNOL
  | 'additional_structure'       // Structure not in FNOL
  | 'pre_existing_condition'     // Pre-existing damage found
  | 'secondary_peril'            // Additional peril detected
  | 'access_limitation'          // Cannot access area
  | 'safety_concern'             // Safety issue found
  | 'code_violation'             // Code violation observed
  | 'other';

export interface TimeTracking {
  inspectionStarted?: string;
  inspectionEnded?: string;

  /** Time spent in each phase (minutes) */
  phaseTime: Record<InspectionPhase, number>;

  /** Total active inspection time (minutes) */
  totalActiveMinutes: number;

  /** Estimated remaining time (minutes) */
  estimatedRemainingMinutes?: number;
}

// ============================================
// 4. EVIDENCE BUCKETS
// ============================================

/**
 * Evidence bucket - replaces step completion with fulfillment tracking.
 *
 * Key insight: A bucket is "satisfied" not by checking a box,
 * but by accumulating sufficient evidence that meets requirements.
 */
export interface EvidenceBucketState {
  /** Unique bucket identifier */
  id: string;

  /** Human-readable bucket name */
  name: string;

  /** What this bucket is for */
  description: string;

  /** Category of evidence */
  category: EvidenceBucketCategory;

  /** Bucket scope binding */
  scope: EvidenceBucketScope;

  /** What makes this bucket required */
  requiredConditions: BucketRequiredCondition;

  /** Whether bucket is currently required */
  isRequired: boolean;

  /** Requirements to satisfy this bucket */
  requirements: BucketRequirement[];

  /** Current fulfillment state */
  fulfillment: BucketFulfillmentState;

  /** Blocking behavior */
  blocking: BlockingBehavior;

  /** Current blocking evaluation */
  isCurrentlyBlocking: boolean;
  blockingReason?: string;

  /** Origin of this bucket */
  origin: StepOrigin;
  sourceRuleId?: string;
  endorsementSource?: string;

  /** Tags for filtering/grouping */
  tags: string[];
}

export type EvidenceBucketCategory =
  | 'safety'              // Safety documentation
  | 'identification'      // Property/claim identification
  | 'exterior_elevation'  // Exterior elevation documentation
  | 'roof'                // Roof documentation
  | 'interior_room'       // Room-level documentation
  | 'damage_detail'       // Specific damage documentation
  | 'measurement'         // Dimensional measurements
  | 'peril_specific'      // Peril-specific requirements
  | 'endorsement'         // Endorsement-driven requirements
  | 'source_tracing'      // Damage source documentation
  | 'synthesis'           // Gap-filling and verification
  | 'departure';          // Final documentation

/**
 * Scope binding for evidence bucket
 */
export interface EvidenceBucketScope {
  /** Scope level */
  level: 'claim' | 'structure' | 'room' | 'zone' | 'exterior_face';

  /** Bound entity (if scope is not claim-level) */
  structureId?: string;
  structureName?: string;
  roomId?: string;
  roomName?: string;
  zoneId?: string;
  zoneName?: string;
  exteriorFace?: 'north' | 'south' | 'east' | 'west' | 'roof';
}

/**
 * Conditions that make a bucket required
 */
export interface BucketRequiredCondition {
  /** Always required regardless of context */
  always?: boolean;

  /** Required only if specific perils present */
  perils?: PerilType[];

  /** Required only if specific endorsements active */
  endorsements?: string[];

  /** Required only if geometry element exists */
  geometryExists?: {
    type: 'structure' | 'room' | 'zone';
    withDamage?: boolean;
  };

  /** Required only if discovery type present */
  discoveries?: DiscoveryType[];

  /** Complex condition group */
  conditions?: ConditionGroup;
}

/**
 * Individual requirement within a bucket
 */
export interface BucketRequirement {
  id: string;
  type: EvidenceType;
  label: string;
  description?: string;

  /** Whether this specific requirement is mandatory for bucket fulfillment */
  mandatory: boolean;

  /** Detailed requirement specification */
  specification: EvidenceRequirement;

  /** Current fulfillment status */
  fulfilled: boolean;

  /** Partial fulfillment tracking */
  partialFulfillment?: {
    current: number;
    required: number;
    unit: string;  // 'photos', 'readings', 'notes'
  };

  /** Evidence IDs that fulfill this requirement */
  fulfilledBy: string[];
}

/**
 * Bucket fulfillment state
 */
export interface BucketFulfillmentState {
  /** Overall fulfillment status */
  status: BucketFulfillmentStatus;

  /** Percentage complete (0-100) */
  percentComplete: number;

  /** Mandatory requirements fulfilled */
  mandatoryFulfilled: number;
  mandatoryTotal: number;

  /** Optional requirements fulfilled */
  optionalFulfilled: number;
  optionalTotal: number;

  /** Evidence count */
  evidenceCount: {
    photos: number;
    measurements: number;
    notes: number;
    documents: number;
  };

  /** What's still missing */
  missingItems: string[];

  /** Last updated */
  lastUpdated: string;
}

export type BucketFulfillmentStatus =
  | 'empty'           // No evidence captured
  | 'partial'         // Some evidence, not complete
  | 'satisfied'       // All mandatory requirements met
  | 'exceeded'        // More than required (good)
  | 'waived';         // Explicitly waived (with reason)

// ============================================
// 5. WORKFLOW BLOCKERS
// ============================================

/**
 * Active blocker preventing export
 */
export interface WorkflowBlocker {
  id: string;
  type: BlockerType;
  severity: 'blocking' | 'warning' | 'advisory';

  /** What's blocked */
  description: string;

  /** How to resolve */
  resolution: string;

  /** Source of the blocker */
  source: {
    bucketId?: string;
    requirementId?: string;
    endorsementCode?: string;
    ruleId?: string;
  };

  /** Can this be waived with explanation */
  waivable: boolean;

  /** Has user acknowledged this blocker */
  acknowledged: boolean;
  acknowledgementReason?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export type BlockerType =
  | 'missing_evidence'           // Required evidence not captured
  | 'incomplete_bucket'          // Bucket not satisfied
  | 'untraced_damage'            // Interior damage without source
  | 'missing_endorsement_req'    // Endorsement requirement not met
  | 'safety_unconfirmed'         // Safety assessment incomplete
  | 'identity_unconfirmed'       // Property/address not confirmed
  | 'access_not_documented'      // Inaccessible area not documented
  | 'discovery_unprocessed';     // Discovery not addressed

// ============================================
// 6. EXPORT READINESS STATE
// ============================================

/**
 * Export readiness evaluation
 */
export interface ExportReadinessState {
  /** Can export right now */
  canExport: boolean;

  /** Overall risk level */
  riskLevel: ExportRiskLevel;

  /** Blocking issues (must resolve) */
  blockingIssues: ExportIssue[];

  /** Warning issues (should resolve) */
  warningIssues: ExportIssue[];

  /** Advisory issues (nice to resolve) */
  advisoryIssues: ExportIssue[];

  /** Summary statistics */
  summary: ExportSummary;

  /** Carrier defensibility score (0-100) */
  defensibilityScore: number;

  /** Areas that need attention for defensibility */
  defensibilityGaps: string[];

  /** Last validation timestamp */
  lastValidated: string;
}

export interface ExportIssue {
  id: string;
  type: BlockerType;
  severity: 'blocking' | 'warning' | 'advisory';
  title: string;
  description: string;
  resolution: string;

  /** Related bucket */
  bucketId?: string;

  /** Can be waived */
  waivable: boolean;
}

export interface ExportSummary {
  /** Bucket statistics */
  bucketsTotal: number;
  bucketsSatisfied: number;
  bucketsPartial: number;
  bucketsEmpty: number;

  /** Evidence statistics */
  photosTotal: number;
  measurementsTotal: number;
  notesTotal: number;

  /** Coverage statistics */
  structuresDocumented: number;
  structuresTotal: number;
  roomsDocumented: number;
  roomsTotal: number;
  damageZonesDocumented: number;
  damageZonesTotal: number;

  /** Peril-specific completion */
  perilRequirementsMet: boolean;

  /** Endorsement-specific completion */
  endorsementRequirementsMet: boolean;
}

// ============================================
// 7. WORKFLOW MUTATIONS
// ============================================

/**
 * Record of a workflow mutation
 */
export interface WorkflowMutation {
  id: string;
  timestamp: string;
  triggeredBy: string;  // userId or 'system'

  /** What triggered the mutation */
  trigger: MutationTrigger;

  /** Trigger details */
  triggerData: MutationTriggerData;

  /** What changed */
  changes: MutationChanges;

  /** What did NOT change (explicitly) */
  preserved: string[];

  /** User-visible effect (if any) */
  userVisibleEffect?: UserVisibleEffect;
}

export interface MutationTriggerData {
  /** For room_added / room_removed */
  roomId?: string;
  roomName?: string;

  /** For damage_zone_added / damage_zone_updated */
  zoneId?: string;
  damageType?: string;
  severity?: string;

  /** For photo_added */
  photoId?: string;
  photoContext?: string;

  /** For discovery_logged */
  discoveryType?: DiscoveryType;
  discoveryDetails?: Record<string, unknown>;

  /** For endorsement_added */
  endorsementCode?: string;

  /** For peril escalation */
  previousPeril?: PerilType;
  newPeril?: PerilType;
}

export interface MutationChanges {
  /** Buckets added */
  bucketsAdded: string[];

  /** Buckets removed */
  bucketsRemoved: string[];

  /** Buckets modified */
  bucketsModified: {
    bucketId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];

  /** Requirements activated */
  requirementsActivated: string[];

  /** Requirements deactivated */
  requirementsDeactivated: string[];

  /** Blockers added */
  blockersAdded: string[];

  /** Blockers resolved */
  blockersResolved: string[];
}

export interface UserVisibleEffect {
  /** Type of UI notification */
  type: 'toast' | 'banner' | 'modal' | 'silent';

  /** Message to display */
  message?: string;

  /** Actions available to user */
  actions?: {
    label: string;
    action: string;
  }[];

  /** Whether this requires user acknowledgement */
  requiresAcknowledgement: boolean;
}

// ============================================
// 8. MUTATION TRIGGER SPECIFICATIONS
// ============================================

/**
 * Specification of what each mutation trigger does.
 * This is the contract that mutation handlers implement.
 */
export const MUTATION_TRIGGER_SPECS: Record<MutationTrigger, MutationTriggerSpec> = {
  room_added: {
    description: 'A new room was added to the claim geometry',
    whatChanges: [
      'New evidence bucket created for room documentation',
      'If room has damage, damage detail bucket created',
      'Room added to progress.discoveredGeometry.rooms',
    ],
    whatDoesNotChange: [
      'Existing bucket fulfillment status',
      'Previously captured evidence',
      'Export blocker acknowledgements',
    ],
    userVisibleEffect: {
      type: 'toast',
      message: 'Room added: {roomName}. Documentation requirements updated.',
      requiresAcknowledgement: false,
    },
  },

  room_removed: {
    description: 'A room was removed from the claim geometry',
    whatChanges: [
      'Room evidence bucket deactivated (not deleted)',
      'Damage buckets associated with room deactivated',
      'Room removed from progress tracking',
    ],
    whatDoesNotChange: [
      'Evidence already captured (orphaned but retained)',
      'Other room buckets',
      'Export validation rules',
    ],
    userVisibleEffect: {
      type: 'toast',
      message: 'Room removed: {roomName}. Evidence retained but bucket deactivated.',
      requiresAcknowledgement: false,
    },
  },

  damage_zone_added: {
    description: 'A new damage zone was documented',
    whatChanges: [
      'Damage detail bucket created for zone',
      'If interior damage, source tracing requirement activated',
      'Associated peril requirements may activate',
      'Zone added to progress.discoveredGeometry.damageZones',
    ],
    whatDoesNotChange: [
      'Existing damage zone buckets',
      'Room-level documentation requirements',
      'Safety/identification requirements',
    ],
    userVisibleEffect: {
      type: 'toast',
      message: 'Damage zone added: {damageType} in {location}',
      requiresAcknowledgement: false,
    },
  },

  damage_zone_updated: {
    description: 'An existing damage zone was modified (severity, type, extent)',
    whatChanges: [
      'Bucket requirements may increase/decrease',
      'Severity escalation may add blocking requirements',
      'Peril-specific requirements may change',
    ],
    whatDoesNotChange: [
      'Evidence already captured',
      'Other damage zone buckets',
      'Room/structure documentation requirements',
    ],
    userVisibleEffect: {
      type: 'silent',
      requiresAcknowledgement: false,
    },
  },

  photo_added: {
    description: 'A new photo was captured and categorized',
    whatChanges: [
      'Bucket fulfillment recalculated',
      'Requirement fulfillment updated',
      'Export readiness recalculated',
      'Blockers may be resolved',
    ],
    whatDoesNotChange: [
      'Bucket structure',
      'Requirement definitions',
      'Other evidence items',
    ],
    userVisibleEffect: {
      type: 'silent',
      requiresAcknowledgement: false,
    },
  },

  scope_inferred: {
    description: 'Scope items were automatically inferred from evidence',
    whatChanges: [
      'Related damage zones may be created',
      'Line item suggestions generated',
      'Measurement requirements may activate',
    ],
    whatDoesNotChange: [
      'Manual scope entries',
      'Existing evidence',
      'User-defined damage zones',
    ],
    userVisibleEffect: {
      type: 'toast',
      message: 'Scope items inferred from captured evidence. Review recommended.',
      requiresAcknowledgement: false,
    },
  },

  discovery_logged: {
    description: 'An inspection discovery was logged (additional damage, pre-existing, etc)',
    whatChanges: [
      'Discovery added to progress.discoveries',
      'If additional damage: new damage bucket created',
      'If pre-existing: documentation bucket created',
      'If access limitation: waiver bucket created',
      'Workflow mutations triggered based on discovery type',
    ],
    whatDoesNotChange: [
      'Existing evidence',
      'Completed bucket fulfillment',
      'FNOL data (immutable)',
    ],
    userVisibleEffect: {
      type: 'banner',
      message: 'Discovery logged: {discoveryType}. Workflow updated.',
      requiresAcknowledgement: true,
    },
  },

  policy_updated: {
    description: 'Policy information was updated (rare, usually re-extraction)',
    whatChanges: [
      'claimFacts.policy updated',
      'Endorsement-driven requirements recalculated',
      'Blocking conditions re-evaluated',
    ],
    whatDoesNotChange: [
      'Captured evidence',
      'Bucket fulfillment',
      'Geometry',
    ],
    userVisibleEffect: {
      type: 'banner',
      message: 'Policy information updated. Requirements may have changed.',
      requiresAcknowledgement: true,
    },
  },

  endorsement_added: {
    description: 'A new endorsement was identified that affects inspection',
    whatChanges: [
      'New endorsement added to claimFacts.endorsements',
      'Endorsement-specific buckets created',
      'May activate blocking requirements',
    ],
    whatDoesNotChange: [
      'Existing evidence',
      'Non-endorsement buckets',
      'Completed requirements',
    ],
    userVisibleEffect: {
      type: 'banner',
      message: 'Endorsement identified: {endorsementTitle}. Additional requirements activated.',
      requiresAcknowledgement: true,
    },
  },
};

export interface MutationTriggerSpec {
  description: string;
  whatChanges: string[];
  whatDoesNotChange: string[];
  userVisibleEffect: UserVisibleEffect;
}

// ============================================
// 9. BLOCKING VS NON-BLOCKING LOGIC
// ============================================

/**
 * Explicit definitions of what blocks export vs what warns.
 */
export interface BlockingLogicDefinition {
  category: string;
  alwaysBlocking: BlockingRule[];
  conditionallyBlocking: ConditionalBlockingRule[];
  warning: WarningRule[];
  advisoryOnly: AdvisoryRule[];
}

export interface BlockingRule {
  id: string;
  description: string;
  rationale: string;
}

export interface ConditionalBlockingRule {
  id: string;
  description: string;
  blockingWhen: ConditionGroup;
  rationale: string;
}

export interface WarningRule {
  id: string;
  description: string;
  warningMessage: string;
}

export interface AdvisoryRule {
  id: string;
  description: string;
  suggestion: string;
}

/**
 * Canonical blocking logic definitions
 */
export const BLOCKING_LOGIC: BlockingLogicDefinition[] = [
  {
    category: 'Identity & Safety',
    alwaysBlocking: [
      {
        id: 'address_confirmation',
        description: 'Property address must be visually confirmed',
        rationale: 'Fundamental claim validity - ensures inspection matches claim',
      },
      {
        id: 'safety_assessment',
        description: 'Safety assessment must be completed',
        rationale: 'Liability protection - must document safe to proceed or hazards present',
      },
    ],
    conditionallyBlocking: [],
    warning: [],
    advisoryOnly: [],
  },
  {
    category: 'Exterior Documentation',
    alwaysBlocking: [
      {
        id: 'primary_damage_photo',
        description: 'Primary reported damage must be photographed',
        rationale: 'Cannot process claim without evidence of reported loss',
      },
    ],
    conditionallyBlocking: [
      {
        id: 'all_elevations',
        description: 'All four elevations must be documented',
        blockingWhen: {
          logic: 'or',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'wind_hail' },
            { id: '2', source: 'claim', field: 'property.exteriorDamaged', operator: 'equals', value: true },
          ],
        },
        rationale: 'Wind/hail and exterior damage claims require comprehensive exterior documentation',
      },
      {
        id: 'roof_documentation',
        description: 'Roof must be documented (ground level acceptable if inaccessible)',
        blockingWhen: {
          logic: 'or',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'wind_hail' },
            { id: '2', source: 'fnol', field: 'reportedDamageAreas', operator: 'contains', value: 'roof' },
          ],
        },
        rationale: 'Roof damage claims require roof evidence',
      },
    ],
    warning: [
      {
        id: 'elevation_count',
        description: 'Less than 3 photos per elevation',
        warningMessage: 'Consider capturing additional elevation photos for comprehensive documentation',
      },
    ],
    advisoryOnly: [
      {
        id: 'soft_metal_check',
        description: 'Check for soft metal damage (gutters, vents, AC units)',
        suggestion: 'Documenting soft metal damage helps establish hail size and intensity',
      },
    ],
  },
  {
    category: 'Interior Documentation',
    alwaysBlocking: [],
    conditionallyBlocking: [
      {
        id: 'source_tracing',
        description: 'Interior damage must have traced source',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'geometry', field: 'damageZones.location', operator: 'equals', value: 'interior' },
            { id: '2', source: 'claim', field: 'peril.primary', operator: 'in', value: ['water', 'wind_hail'] },
          ],
        },
        rationale: 'Interior damage without source connection is indefensible',
      },
      {
        id: 'affected_rooms',
        description: 'All affected rooms must be documented',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'geometry', field: 'rooms.hasDamage', operator: 'equals', value: true },
          ],
        },
        rationale: 'Cannot exclude rooms with damage from documentation',
      },
    ],
    warning: [
      {
        id: 'room_overview',
        description: 'Room missing overview photo',
        warningMessage: 'Room {roomName} has detail photos but no overview shot',
      },
    ],
    advisoryOnly: [
      {
        id: 'material_documentation',
        description: 'Document material types in affected rooms',
        suggestion: 'Material type photos help with accurate estimate pricing',
      },
    ],
  },
  {
    category: 'Endorsement Requirements',
    alwaysBlocking: [],
    conditionallyBlocking: [
      {
        id: 'roof_schedule_documentation',
        description: 'Roof age, material, and condition must be documented',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'endorsement', field: 'category', operator: 'equals', value: 'roof_schedule' },
            { id: '2', source: 'fnol', field: 'reportedDamageAreas', operator: 'contains', value: 'roof' },
          ],
        },
        rationale: 'Roof schedule endorsement requires specific documentation for depreciation calculation',
      },
      {
        id: 'matching_documentation',
        description: 'Existing materials must be documented for matching',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'endorsement', field: 'category', operator: 'equals', value: 'matching' },
          ],
        },
        rationale: 'Matching endorsement requires evidence of existing materials',
      },
    ],
    warning: [],
    advisoryOnly: [],
  },
  {
    category: 'Peril-Specific Requirements',
    alwaysBlocking: [],
    conditionallyBlocking: [
      {
        id: 'water_category',
        description: 'Water category must be documented',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'water' },
          ],
        },
        rationale: 'IICRC water category affects remediation scope and cost',
      },
      {
        id: 'moisture_readings',
        description: 'Moisture readings required for water damage',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'water' },
          ],
        },
        rationale: 'Moisture readings document extent and support drying protocols',
      },
      {
        id: 'test_square',
        description: 'Hail test square required',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'wind_hail' },
            { id: '2', source: 'claim', field: 'peril.metadata.hailSizeInches', operator: 'exists', value: true },
          ],
        },
        rationale: 'Test square documents hail density for threshold analysis',
      },
      {
        id: 'fire_origin',
        description: 'Fire origin must be documented',
        blockingWhen: {
          logic: 'and',
          conditions: [
            { id: '1', source: 'claim', field: 'peril.primary', operator: 'equals', value: 'fire' },
          ],
        },
        rationale: 'Fire origin documentation supports cause/origin investigation',
      },
    ],
    warning: [],
    advisoryOnly: [],
  },
];

// ============================================
// 10. CONSUMER SUPPORT INTERFACES
// ============================================

/**
 * Interface for voice agents to read workflow state
 */
export interface VoiceAgentStateView {
  /** Current phase the adjuster is in */
  currentPhase: InspectionPhase;

  /** What should be captured now (priority ordered) */
  suggestedCaptures: SuggestedCapture[];

  /** Active gaps that need attention */
  activeGaps: string[];

  /** Blocking issues that must be resolved */
  blockingIssues: string[];

  /** Context for voice prompts */
  voiceContext: {
    currentRoom?: string;
    currentStructure?: string;
    lastCapture?: string;
    timeInPhase: number;
  };

  /** Quick status for voice summary */
  quickStatus: {
    photosCapured: number;
    bucketsComplete: number;
    bucketsTotal: number;
    canExport: boolean;
  };
}

export interface SuggestedCapture {
  type: 'photo' | 'measurement' | 'note';
  label: string;
  priority: 'high' | 'medium' | 'low';
  bucketId: string;
  requirementId: string;
  context?: string;
}

/**
 * Interface for UI panels to render workflow state
 */
export interface UIPanelStateView {
  /** Workflow header information */
  header: {
    claimNumber: string;
    propertyAddress: string;
    peril: string;
    status: WorkflowStatus;
  };

  /** Phase navigation */
  phases: {
    phase: InspectionPhase;
    label: string;
    coveragePercent: number;
    hasBlockers: boolean;
    isCurrent: boolean;
  }[];

  /** Bucket list for current phase (or all) */
  buckets: UIBucketView[];

  /** Export readiness panel */
  exportPanel: {
    canExport: boolean;
    riskLevel: ExportRiskLevel;
    blockingCount: number;
    warningCount: number;
    advisoryCount: number;
    defensibilityScore: number;
  };

  /** Progress summary */
  progressSummary: {
    evidenceCount: number;
    bucketsComplete: number;
    bucketsTotal: number;
    timeElapsed: number;
    estimatedRemaining?: number;
  };
}

export interface UIBucketView {
  id: string;
  name: string;
  category: EvidenceBucketCategory;
  scope: string;  // Human-readable scope (e.g., "Kitchen" or "North Elevation")

  status: BucketFulfillmentStatus;
  percentComplete: number;

  isBlocking: boolean;
  isRequired: boolean;

  evidenceCount: number;
  missingCount: number;

  /** For expandable detail view */
  requirements?: {
    label: string;
    fulfilled: boolean;
    current?: number;
    required?: number;
  }[];
}

/**
 * Interface for export validation
 */
export interface ExportValidationView {
  /** Overall result */
  canExport: boolean;
  riskLevel: ExportRiskLevel;

  /** Categorized issues */
  issues: {
    blocking: ExportIssueView[];
    warnings: ExportIssueView[];
    advisory: ExportIssueView[];
  };

  /** Summary statistics */
  summary: ExportSummary;

  /** Defensibility analysis */
  defensibility: {
    score: number;  // 0-100
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };

  /** Waivable issues that can be acknowledged */
  waivableIssues: {
    issueId: string;
    title: string;
    waiveReason?: string;
    waived: boolean;
  }[];
}

export interface ExportIssueView {
  id: string;
  title: string;
  description: string;
  resolution: string;
  bucketName?: string;
  waivable: boolean;
}

/**
 * Interface for carrier defensibility analysis
 */
export interface DefensibilityAnalysis {
  /** Overall defensibility score */
  overallScore: number;

  /** Category scores */
  categoryScores: {
    category: string;
    score: number;
    weight: number;
    issues: string[];
  }[];

  /** Documentation completeness */
  documentationCompleteness: {
    requiredEvidence: number;
    capturedEvidence: number;
    percentComplete: number;
  };

  /** Source tracing completeness */
  sourceTracingCompleteness: {
    interiorDamageZones: number;
    tracedToSource: number;
    percentTraced: number;
  };

  /** Endorsement compliance */
  endorsementCompliance: {
    activeEndorsements: number;
    compliantEndorsements: number;
    nonCompliantEndorsements: string[];
  };

  /** Carrier-specific requirements */
  carrierRequirements: {
    total: number;
    met: number;
    unmet: string[];
  };

  /** Risk areas for carrier review */
  riskAreas: {
    area: string;
    risk: 'high' | 'medium' | 'low';
    mitigation?: string;
  }[];
}
