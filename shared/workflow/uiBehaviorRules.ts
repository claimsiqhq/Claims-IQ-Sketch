/**
 * UI Behavior Rules for Redesigned Inspection Workflow
 *
 * This file defines the canonical UI behavior rules that eliminate
 * modal-driven step completion in favor of inline evidence capture.
 *
 * KEY PRINCIPLES:
 * 1. No completion modals - evidence flows inline
 * 2. Camera FAB is always available
 * 3. Requirements panel shows fulfillment status
 * 4. Export readiness is always visible
 * 5. Step type determines UI layout, bucket determines requirements
 */

import type {
  WorkflowStepType,
  EvidenceBucket,
  WorkflowStep,
  InspectionPhase,
  ExportReadiness,
} from './redesignedWorkflowSchema';

// ============================================
// 1. SCREEN ARCHITECTURE
// ============================================

/**
 * Primary inspection screen surfaces.
 * Replaces the current modal-driven workflow.
 */
export interface InspectionScreenSurfaces {
  /** Primary surface: the main inspection view */
  primary: PrimaryInspectionScreen;

  /** Secondary surfaces that slide/overlay */
  secondary: {
    /** Evidence gallery for reviewing captured evidence */
    evidenceGallery: EvidenceGallerySheet;
    /** Export validation panel */
    exportValidation: ExportValidationSheet;
    /** Room/geometry navigator */
    geometryNavigator: GeometryNavigatorSheet;
    /** Step list (alternative to bucket focus) */
    stepList: StepListSheet;
  };
}

export interface PrimaryInspectionScreen {
  /** Header: always visible */
  header: {
    claimInfo: { number: string; address: string };
    phaseNavigation: PhaseNavigationConfig;
    progressIndicator: ProgressIndicatorConfig;
    exportButton: ExportButtonConfig;
  };

  /** Main content area */
  content: {
    mode: ContentMode;
    bucketFocusView?: BucketFocusConfig;
    stepListView?: StepListConfig;
    evidenceGridView?: EvidenceGridConfig;
  };

  /** Requirements sidebar/bottom panel */
  requirementsPanel: RequirementsPanelConfig;

  /** Floating action buttons */
  fab: FabConfig;

  /** Bottom info bar */
  bottomBar: BottomBarConfig;
}

export type ContentMode = 'bucket_focus' | 'step_list' | 'evidence_grid';

// ============================================
// 2. PHASE NAVIGATION
// ============================================

export interface PhaseNavigationConfig {
  phases: PhaseConfig[];
  currentPhase: InspectionPhase;
  allowPhaseJump: boolean;
  showPhaseCoverage: boolean;
}

export interface PhaseConfig {
  id: InspectionPhase;
  label: string;
  icon: string;
  coveragePercent: number;
  hasBlockers: boolean;
  isCurrent: boolean;
  isAccessible: boolean;
}

/**
 * Phase navigation rules.
 * Users can jump between phases but get warnings.
 */
export const PHASE_NAVIGATION_RULES = {
  // Phases in order
  phaseOrder: ['arrival', 'orientation', 'exterior', 'interior', 'synthesis', 'departure'] as InspectionPhase[],

  // Phase labels
  phaseLabels: {
    arrival: 'Arrival',
    orientation: 'Orientation',
    exterior: 'Exterior',
    interior: 'Interior',
    synthesis: 'Review',
    departure: 'Wrap Up',
  } as Record<InspectionPhase, string>,

  // Can skip forward?
  canSkipForward: true,

  // Warn on skip?
  warnOnSkip: true,

  // Skip warning message
  skipWarningMessage: 'You have unfulfilled requirements in earlier phases. Continue anyway?',
};

// ============================================
// 3. BUCKET FOCUS VIEW (Primary Mode)
// ============================================

export interface BucketFocusConfig {
  /** Currently focused bucket */
  currentBucket: EvidenceBucket;

  /** Display elements */
  display: {
    /** Bucket name and purpose */
    header: {
      name: string;
      purpose: string;
      category: string;
      scope: string; // e.g., "Kitchen" or "North Elevation"
    };

    /** Instructions card */
    instructionsCard: {
      visible: boolean;
      instructions: string;
      tips: string[];
      collapsible: boolean;
    };

    /** Fulfillment progress */
    progressRing: {
      visible: boolean;
      current: number;
      total: number;
      color: 'green' | 'yellow' | 'red';
    };

    /** Quick notes area */
    quickNotes: {
      visible: boolean;
      placeholder: string;
      voiceEnabled: boolean;
    };

    /** Damage severity selector */
    damageSeverity: {
      visible: boolean;
      options: ('none' | 'minor' | 'moderate' | 'severe')[];
      selectedValue?: string;
    };

    /** Captured evidence thumbnails */
    evidenceThumbnails: {
      visible: boolean;
      maxVisible: number;
      showMoreCount: boolean;
    };
  };

  /** Actions available */
  actions: {
    skipBucket: boolean;
    addNote: boolean;
    viewEvidence: boolean;
    nextBucket: boolean;
    prevBucket: boolean;
  };
}

/**
 * Rules for what shows in bucket focus view.
 * Based on bucket category and step type.
 */
export function getBucketFocusDisplay(
  bucket: EvidenceBucket,
  stepType: WorkflowStepType
): BucketFocusConfig['display'] {
  const baseDisplay: BucketFocusConfig['display'] = {
    header: {
      name: bucket.name,
      purpose: bucket.purpose,
      category: formatCategory(bucket.category),
      scope: formatScope(bucket.scope),
    },
    instructionsCard: {
      visible: true,
      instructions: '',
      tips: [],
      collapsible: true,
    },
    progressRing: {
      visible: true,
      current: 0,
      total: bucket.requirements.length,
      color: 'yellow',
    },
    quickNotes: {
      visible: true,
      placeholder: 'Add notes...',
      voiceEnabled: true,
    },
    damageSeverity: {
      visible: false,
      options: ['none', 'minor', 'moderate', 'severe'],
    },
    evidenceThumbnails: {
      visible: true,
      maxVisible: 4,
      showMoreCount: true,
    },
  };

  // Adjust based on category
  if (bucket.category === 'damage_detail') {
    baseDisplay.damageSeverity.visible = true;
  }

  // Adjust based on step type
  if (stepType === 'classify') {
    baseDisplay.damageSeverity.visible = true;
  }

  if (stepType === 'interview') {
    baseDisplay.quickNotes.placeholder = 'Interview notes (required)...';
    baseDisplay.damageSeverity.visible = false;
    baseDisplay.evidenceThumbnails.visible = false;
  }

  if (stepType === 'review') {
    baseDisplay.quickNotes.placeholder = 'Review findings...';
    baseDisplay.damageSeverity.visible = false;
  }

  return baseDisplay;
}

function formatCategory(category: string): string {
  const labels: Record<string, string> = {
    identity: 'Identity',
    safety: 'Safety',
    exterior_overview: 'Exterior',
    roof: 'Roof',
    interior_overview: 'Interior',
    damage_detail: 'Damage',
    source_tracing: 'Source',
    measurement: 'Measurement',
    peril_specific: 'Peril',
    endorsement: 'Policy',
    synthesis: 'Review',
  };
  return labels[category] || category;
}

function formatScope(scope: { level: string; roomName?: string; exteriorFace?: string }): string {
  if (scope.roomName) return scope.roomName;
  if (scope.exteriorFace) return `${scope.exteriorFace.charAt(0).toUpperCase() + scope.exteriorFace.slice(1)} Elevation`;
  if (scope.level === 'claim') return 'Property';
  return scope.level;
}

// ============================================
// 4. REQUIREMENTS PANEL
// ============================================

export interface RequirementsPanelConfig {
  position: 'right' | 'bottom';
  requirements: RequirementDisplayItem[];
  showFulfillmentProgress: boolean;
  allowReorder: boolean;
  allowTapToFocus: boolean;
}

export interface RequirementDisplayItem {
  id: string;
  type: 'photo' | 'measurement' | 'note' | 'document';
  label: string;
  mandatory: boolean;
  fulfillment: {
    status: 'empty' | 'partial' | 'fulfilled' | 'exceeded';
    current: number;
    required: number;
  };
  thumbnailUrl?: string;
  tapAction: 'camera' | 'measurement' | 'note' | 'gallery';
}

/**
 * Rules for requirements panel behavior.
 */
export const REQUIREMENTS_PANEL_RULES = {
  // Show on right for desktop, bottom for mobile
  positionByBreakpoint: {
    mobile: 'bottom' as const,
    tablet: 'bottom' as const,
    desktop: 'right' as const,
  },

  // Tap behavior
  tapBehavior: {
    photo: 'open_camera',
    measurement: 'open_measurement_input',
    note: 'focus_notes_field',
    document: 'open_document_picker',
  },

  // Fulfillment colors
  fulfillmentColors: {
    empty: '#dc2626',      // red-600
    partial: '#f59e0b',    // amber-500
    fulfilled: '#22c55e',  // green-500
    exceeded: '#22c55e',   // green-500
  },

  // Hide panel when?
  hideWhen: {
    cameraFullscreen: true,
    measurementModal: true,
    voiceActive: false,
  },
};

// ============================================
// 5. FAB (FLOATING ACTION BUTTON)
// ============================================

export interface FabConfig {
  visible: boolean;
  position: 'bottom_right' | 'bottom_center';
  primaryAction: FabAction;
  secondaryActions: FabAction[];
  expandOnLongPress: boolean;
}

export interface FabAction {
  id: string;
  icon: string;
  label: string;
  action: 'camera' | 'voice' | 'measurement' | 'note' | 'gallery';
  badge?: number;
}

/**
 * FAB configuration based on context.
 */
export function getFabConfig(
  bucket: EvidenceBucket,
  stepType: WorkflowStepType,
  isCameraActive: boolean
): FabConfig {
  if (isCameraActive) {
    return {
      visible: false,
      position: 'bottom_right',
      primaryAction: { id: 'camera', icon: 'Camera', label: 'Photo', action: 'camera' },
      secondaryActions: [],
      expandOnLongPress: false,
    };
  }

  // Default: camera primary
  let primaryAction: FabAction = { id: 'camera', icon: 'Camera', label: 'Photo', action: 'camera' };
  let secondaryActions: FabAction[] = [
    { id: 'voice', icon: 'Mic', label: 'Voice', action: 'voice' },
  ];

  // Adjust by step type
  if (stepType === 'interview') {
    primaryAction = { id: 'voice', icon: 'Mic', label: 'Record', action: 'voice' };
    secondaryActions = [];
  }

  if (stepType === 'capture' && bucket.category === 'measurement') {
    secondaryActions = [
      { id: 'voice', icon: 'Mic', label: 'Voice', action: 'voice' },
      { id: 'measurement', icon: 'Ruler', label: 'Measure', action: 'measurement' },
    ];
  }

  if (stepType === 'review') {
    primaryAction = { id: 'note', icon: 'FileText', label: 'Notes', action: 'note' };
    secondaryActions = [];
  }

  return {
    visible: true,
    position: 'bottom_right',
    primaryAction,
    secondaryActions,
    expandOnLongPress: secondaryActions.length > 0,
  };
}

// ============================================
// 6. BOTTOM BAR (EXPORT READINESS)
// ============================================

export interface BottomBarConfig {
  visible: boolean;
  mode: 'collapsed' | 'peek' | 'expanded';
  content: {
    exportReadiness: ExportReadinessSummary;
    blockerCount: number;
    warningCount: number;
    defensibilityScore: number;
  };
  actions: {
    tapToExpand: boolean;
    exportButton: boolean;
    viewBlockers: boolean;
  };
}

export interface ExportReadinessSummary {
  canExport: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'blocked';
  message: string;
}

/**
 * Bottom bar visibility rules.
 */
export const BOTTOM_BAR_RULES = {
  // Always show when blockers exist
  showWhenBlocked: true,

  // Default mode
  defaultMode: 'peek' as const,

  // Expand threshold (number of blockers)
  autoExpandThreshold: 3,

  // Message templates
  messages: {
    blocked: '{count} blocking issues must be resolved',
    high: '{count} recommended items remaining',
    medium: 'Some evidence gaps remain',
    low: 'Ready to export (minor gaps)',
    none: 'Ready to export',
  },

  // Colors
  colors: {
    blocked: '#dc2626',   // red-600
    high: '#f97316',      // orange-500
    medium: '#f59e0b',    // amber-500
    low: '#22c55e',       // green-500
    none: '#22c55e',      // green-500
  },
};

// ============================================
// 7. EVIDENCE CAPTURE FLOW (NO MODAL)
// ============================================

/**
 * Evidence capture happens WITHOUT a modal.
 * Camera/measurement/voice opens inline or fullscreen.
 */
export interface EvidenceCaptureState {
  mode: 'idle' | 'camera' | 'measurement' | 'voice' | 'note';
  targetBucket: string;
  targetRequirement: string;
  captured: CapturedItem[];
}

export interface CapturedItem {
  id: string;
  type: 'photo' | 'measurement' | 'note';
  data: unknown;
  timestamp: string;
  autoTagged: boolean;
}

/**
 * Evidence capture rules - NO MODAL.
 */
export const EVIDENCE_CAPTURE_RULES = {
  // Camera behavior
  camera: {
    mode: 'fullscreen' as const, // Always fullscreen for mobile
    returnTo: 'bucket_focus' as const,
    autoAdvance: true, // Auto-advance if bucket satisfied
    showCountOverlay: true,
    captureHint: 'Capturing for {bucketName}: {requirementLabel}',
  },

  // Measurement behavior
  measurement: {
    mode: 'sheet' as const, // Bottom sheet
    returnTo: 'bucket_focus' as const,
    autoAdvance: true,
  },

  // Voice behavior
  voice: {
    mode: 'inline' as const, // Inline recording indicator
    returnTo: 'bucket_focus' as const,
    autoTranscribe: true,
    showWaveform: true,
  },

  // Post-capture behavior
  postCapture: {
    showToast: true,
    toastDuration: 2000,
    toastMessage: '{type} captured for {requirement}',
    updateFulfillment: true,
    checkBucketSatisfied: true,
    advanceOnSatisfied: true,
    advanceDelay: 500,
  },
};

// ============================================
// 8. STEP LIST VIEW (Alternative Mode)
// ============================================

export interface StepListConfig {
  steps: StepListItem[];
  groupBy: 'phase' | 'bucket_category' | 'none';
  showCompleted: boolean;
  showSkipped: boolean;
  allowReorder: boolean;
}

export interface StepListItem {
  id: string;
  title: string;
  phase: InspectionPhase;
  bucketName: string;
  status: 'pending' | 'active' | 'satisfied' | 'skipped';
  fulfillment: {
    current: number;
    required: number;
  };
  roomName?: string;
  isBlocking: boolean;
  tapAction: 'focus_bucket' | 'view_details';
}

/**
 * Step list view rules.
 */
export const STEP_LIST_RULES = {
  // Default grouping
  defaultGroupBy: 'phase' as const,

  // Status icons
  statusIcons: {
    pending: 'Circle',
    active: 'CircleDot',
    satisfied: 'CheckCircle2',
    skipped: 'XCircle',
  },

  // Status colors
  statusColors: {
    pending: '#6b7280',   // gray-500
    active: '#3b82f6',    // blue-500
    satisfied: '#22c55e', // green-500
    skipped: '#9ca3af',   // gray-400
  },

  // Blocking indicator
  blockingBadge: {
    visible: true,
    icon: 'AlertTriangle',
    color: '#dc2626', // red-600
  },
};

// ============================================
// 9. EXPORT VALIDATION SHEET
// ============================================

export interface ExportValidationSheet {
  visible: boolean;
  mode: 'peek' | 'half' | 'full';
  content: {
    summary: ExportReadiness;
    issues: ExportIssueGroup[];
    waivableIssues: WaivableIssue[];
    exportAction: ExportAction;
  };
}

export interface ExportIssueGroup {
  severity: 'blocking' | 'warning' | 'advisory';
  title: string;
  count: number;
  issues: ExportIssueItem[];
  collapsed: boolean;
}

export interface ExportIssueItem {
  id: string;
  title: string;
  description: string;
  resolution: string;
  bucketId?: string;
  tapAction: 'go_to_bucket' | 'waive' | 'view_details';
}

export interface WaivableIssue {
  id: string;
  title: string;
  waived: boolean;
  waiverReason?: string;
}

export interface ExportAction {
  enabled: boolean;
  label: string;
  variant: 'primary' | 'warning' | 'disabled';
  confirmRequired: boolean;
}

/**
 * Export validation sheet rules.
 */
export const EXPORT_VALIDATION_RULES = {
  // When to show
  showWhenBlockers: true,
  showWhenWarnings: true,
  autoExpandOnBlocked: true,

  // Waiver requirements
  waiverRequirements: {
    requireReason: true,
    minReasonLength: 10,
    supervisorApproval: false, // Future feature
  },

  // Export button states
  exportButtonStates: {
    blocked: { enabled: false, label: 'Cannot Export', variant: 'disabled' as const },
    warnings: { enabled: true, label: 'Export with Warnings', variant: 'warning' as const },
    ready: { enabled: true, label: 'Export Report', variant: 'primary' as const },
  },

  // Defensibility thresholds
  defensibilityThresholds: {
    excellent: 90,
    good: 75,
    fair: 60,
    poor: 0,
  },
};

// ============================================
// 10. GEOMETRY NAVIGATOR SHEET
// ============================================

export interface GeometryNavigatorSheet {
  visible: boolean;
  structures: StructureItem[];
  rooms: RoomItem[];
  exteriorFaces: ExteriorFaceItem[];
  selectedItem?: { type: 'structure' | 'room' | 'face'; id: string };
}

export interface StructureItem {
  id: string;
  name: string;
  type: string;
  roomCount: number;
  bucketCount: number;
  bucketsSatisfied: number;
}

export interface RoomItem {
  id: string;
  name: string;
  structureId: string;
  hasDamage: boolean;
  damageTypes: string[];
  bucketCount: number;
  bucketsSatisfied: number;
}

export interface ExteriorFaceItem {
  face: 'north' | 'south' | 'east' | 'west' | 'roof';
  documented: boolean;
  photoCount: number;
}

/**
 * Geometry navigator rules.
 */
export const GEOMETRY_NAVIGATOR_RULES = {
  // Show damage indicator
  showDamageIndicator: true,
  damageIndicatorIcon: 'AlertCircle',
  damageIndicatorColor: '#f97316', // orange-500

  // Show progress
  showProgress: true,
  progressFormat: '{satisfied}/{total} complete',

  // Tap action
  tapAction: 'filter_buckets' as const,
};

// ============================================
// 11. RESPONSIVE BREAKPOINTS
// ============================================

export const RESPONSIVE_BREAKPOINTS = {
  mobile: { max: 767 },
  tablet: { min: 768, max: 1023 },
  desktop: { min: 1024 },
};

export const RESPONSIVE_LAYOUT = {
  mobile: {
    requirementsPanel: 'bottom',
    fabPosition: 'bottom_right',
    bottomBarMode: 'peek',
    stepListGrouping: 'phase',
  },
  tablet: {
    requirementsPanel: 'bottom',
    fabPosition: 'bottom_right',
    bottomBarMode: 'peek',
    stepListGrouping: 'phase',
  },
  desktop: {
    requirementsPanel: 'right',
    fabPosition: 'bottom_right',
    bottomBarMode: 'collapsed',
    stepListGrouping: 'phase',
  },
};

// ============================================
// 12. KEYBOARD SHORTCUTS (Desktop)
// ============================================

export const KEYBOARD_SHORTCUTS = {
  // Navigation
  'ArrowRight': 'next_bucket',
  'ArrowLeft': 'prev_bucket',
  'ArrowDown': 'next_requirement',
  'ArrowUp': 'prev_requirement',

  // Actions
  'c': 'open_camera',
  'v': 'start_voice',
  'm': 'open_measurement',
  'n': 'focus_notes',

  // Views
  'Tab': 'toggle_view_mode',
  'e': 'toggle_export_panel',
  'g': 'toggle_geometry_nav',

  // Other
  'Escape': 'close_overlay',
  'Enter': 'confirm_action',
};
