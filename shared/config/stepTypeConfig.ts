/**
 * Step Type Configuration
 *
 * Single source of truth for step type behavior, UI rendering, and evidence requirements.
 * This configuration ensures that different step types render appropriate UI elements
 * and enforce correct validation rules.
 *
 * Key Principles:
 * - Step type determines default evidence requirements
 * - Evidence requirements from workflow JSON override defaults
 * - UI elements are conditionally rendered based on step type
 * - Validation rules respect step type capabilities
 */

import { InspectionStepType } from '../schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Evidence requirement configuration for a step type
 */
export interface EvidenceConfig {
  photos: {
    required: boolean;
    defaultMinCount: number;
    defaultMaxCount?: number;
    showOnlyIfDamageRelated?: boolean; // Only show if tags include 'damage'
  };
  notes: {
    required: boolean;
    defaultMinLength: number;
    showAlways: boolean; // Even if not required, show the field
  };
  measurements: {
    required: boolean;
    defaultUnit?: string;
  };
  checklist: {
    required: boolean;
    defaultItems?: string[];
  };
}

/**
 * UI elements configuration for a step type
 */
export interface UIElementsConfig {
  showPhotoCapture: boolean;
  showDamageSeverity: boolean; // Only shown if step is damage-related (tags include 'damage')
  showNotesField: boolean;
  showMeasurementInput: boolean;
  showChecklist: boolean;
}

/**
 * Validation rules for a step type
 */
export interface ValidationConfig {
  canCompleteWithoutPhotos: boolean; // If photos are not required, can step complete without any?
  canCompleteWithoutNotes: boolean; // If notes are not required, can step complete without any?
  requiresGeometryBinding: boolean; // Must be bound to a room/zone?
  requiresDamageSeverity: boolean; // Must have damage severity selected?
}

/**
 * Complete step type configuration
 */
export interface StepTypeConfiguration {
  stepType: InspectionStepType;
  displayName: string;
  description: string;
  defaultEvidence: EvidenceConfig;
  uiElements: UIElementsConfig;
  validation: ValidationConfig;
  promptGuidance: string; // Guidance for AI prompt generation
}

// ============================================
// STEP TYPE CONFIGURATIONS
// ============================================

/**
 * Configuration for each step type
 * This is the single source of truth for step behavior
 */
export const STEP_TYPE_CONFIG: Record<InspectionStepType, StepTypeConfiguration> = {
  [InspectionStepType.INTERVIEW]: {
    stepType: InspectionStepType.INTERVIEW,
    displayName: 'Interview',
    description: 'Meeting with insured, contractor, or other parties',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: true,
        defaultMinLength: 10,
        showAlways: true,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: false,
      },
    },
    uiElements: {
      showPhotoCapture: false,
      showDamageSeverity: false,
      showNotesField: true,
      showMeasurementInput: false,
      showChecklist: false,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: false,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Interview steps require notes documenting the conversation. NO photos required unless ID verification or specific documentation is needed.',
  },

  [InspectionStepType.DOCUMENTATION]: {
    stepType: InspectionStepType.DOCUMENTATION,
    displayName: 'Documentation',
    description: 'Reviewing documents, policy forms, or claim files',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: false,
        defaultMinLength: 1,
        showAlways: true,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: true,
        defaultItems: ['Documents reviewed', 'Key findings noted', 'Policy provisions checked'],
      },
    },
    uiElements: {
      showPhotoCapture: false,
      showDamageSeverity: false,
      showNotesField: true,
      showMeasurementInput: false,
      showChecklist: true,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: true,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Documentation steps require checklist completion. Notes are optional. NO photos required unless specific document photos are needed.',
  },

  [InspectionStepType.PHOTO]: {
    stepType: InspectionStepType.PHOTO,
    displayName: 'Photo',
    description: 'Capturing photographic evidence of damage or conditions',
    defaultEvidence: {
      photos: {
        required: true,
        defaultMinCount: 1,
        defaultMaxCount: 10,
        showOnlyIfDamageRelated: false, // Photos always shown for photo steps
      },
      notes: {
        required: true,
        defaultMinLength: 10,
        showAlways: true,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: false,
      },
    },
    uiElements: {
      showPhotoCapture: true,
      showDamageSeverity: true, // Shown if tags include 'damage'
      showNotesField: true,
      showMeasurementInput: false,
      showChecklist: false,
    },
    validation: {
      canCompleteWithoutPhotos: false,
      canCompleteWithoutNotes: false,
      requiresGeometryBinding: false, // Can be general or room-specific
      requiresDamageSeverity: false, // Only if damage-related
    },
    promptGuidance: 'Photo steps REQUIRE photos (minimum 1). Notes required to describe what was photographed. Damage severity shown if step is damage-related (check tags).',
  },

  [InspectionStepType.OBSERVATION]: {
    stepType: InspectionStepType.OBSERVATION,
    displayName: 'Observation',
    description: 'Visual inspection and assessment of conditions',
    defaultEvidence: {
      photos: {
        required: true,
        defaultMinCount: 1,
        defaultMaxCount: 10,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: true,
        defaultMinLength: 20,
        showAlways: true,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: false,
      },
    },
    uiElements: {
      showPhotoCapture: true,
      showDamageSeverity: true, // Shown if tags include 'damage'
      showNotesField: true,
      showMeasurementInput: false,
      showChecklist: false,
    },
    validation: {
      canCompleteWithoutPhotos: false,
      canCompleteWithoutNotes: false,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false, // Only if damage-related
    },
    promptGuidance: 'Observation steps require photos and detailed notes. Damage severity shown if observation is damage-related (check tags).',
  },

  [InspectionStepType.MEASUREMENT]: {
    stepType: InspectionStepType.MEASUREMENT,
    displayName: 'Measurement',
    description: 'Taking measurements of dimensions, moisture, or other quantifiable data',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: true,
        defaultMinLength: 10,
        showAlways: true,
      },
      measurements: {
        required: true,
        defaultUnit: 'ft',
      },
      checklist: {
        required: false,
      },
    },
    uiElements: {
      showPhotoCapture: false, // Optional - can be enabled via evidence requirements
      showDamageSeverity: false,
      showNotesField: true,
      showMeasurementInput: true,
      showChecklist: false,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: false,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Measurement steps REQUIRE a measurement value. Notes required to document measurement location and context. Photos optional unless visual reference needed.',
  },

  [InspectionStepType.SAFETY_CHECK]: {
    stepType: InspectionStepType.SAFETY_CHECK,
    displayName: 'Safety Check',
    description: 'Assessing safety hazards and conditions',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: true,
        defaultMinLength: 10,
        showAlways: true,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: true,
        defaultItems: ['Hazard identified', 'Safety measures taken', 'Access verified'],
      },
    },
    uiElements: {
      showPhotoCapture: false, // Optional - can show if hazard visible
      showDamageSeverity: false,
      showNotesField: true,
      showMeasurementInput: false,
      showChecklist: true,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: false,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Safety check steps require checklist completion and notes. Photos optional if hazard is visible and needs documentation. NO damage severity.',
  },

  [InspectionStepType.CHECKLIST]: {
    stepType: InspectionStepType.CHECKLIST,
    displayName: 'Checklist',
    description: 'Completing a structured checklist of items',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: false,
        defaultMinLength: 1,
        showAlways: false, // Only show if checklist items need notes
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: true,
        defaultItems: [], // Will be provided by workflow JSON
      },
    },
    uiElements: {
      showPhotoCapture: false,
      showDamageSeverity: false,
      showNotesField: false, // Only if checklist items require notes
      showMeasurementInput: false,
      showChecklist: true,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: true,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Checklist steps require ONLY checklist completion. NO photos, NO measurements, NO damage severity. Notes only if checklist items require additional context.',
  },

  [InspectionStepType.EQUIPMENT]: {
    stepType: InspectionStepType.EQUIPMENT,
    displayName: 'Equipment',
    description: 'Documenting equipment, tools, or materials needed or used',
    defaultEvidence: {
      photos: {
        required: false,
        defaultMinCount: 0,
        showOnlyIfDamageRelated: false,
      },
      notes: {
        required: false,
        defaultMinLength: 1,
        showAlways: false,
      },
      measurements: {
        required: false,
      },
      checklist: {
        required: true,
        defaultItems: ['Equipment listed', 'Availability confirmed', 'Purpose documented'],
      },
    },
    uiElements: {
      showPhotoCapture: false, // Optional - can show if equipment damage
      showDamageSeverity: false,
      showNotesField: false,
      showMeasurementInput: false,
      showChecklist: true,
    },
    validation: {
      canCompleteWithoutPhotos: true,
      canCompleteWithoutNotes: true,
      requiresGeometryBinding: false,
      requiresDamageSeverity: false,
    },
    promptGuidance: 'Equipment steps require checklist completion. NO photos unless equipment damage needs documentation. NO damage severity.',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get configuration for a step type
 */
export function getStepTypeConfig(stepType: InspectionStepType | string): StepTypeConfiguration {
  const normalizedType = stepType as InspectionStepType;
  return STEP_TYPE_CONFIG[normalizedType] || STEP_TYPE_CONFIG[InspectionStepType.OBSERVATION]; // Default fallback
}

/**
 * Determine if photo capture should be shown for a step
 * Evidence requirements override step type defaults
 * NO LEGACY ASSETS SUPPORT - only uses evidenceRequirements or step type config
 */
export function shouldShowPhotoCapture(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean; photo?: { minCount?: number } }>
): boolean {
  // First check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const photoReq = evidenceRequirements.find(r => r.type === 'photo');
    if (photoReq) {
      return photoReq.required === true || (photoReq.photo?.minCount ?? 0) > 0;
    }
    // If evidence requirements exist but no photo requirement, don't show photos
    return false;
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.uiElements.showPhotoCapture;
}

/**
 * Determine if damage severity selector should be shown
 * Only shown if UI elements allow AND step is damage-related (tags include 'damage')
 */
export function shouldShowDamageSeverity(
  stepType: InspectionStepType | string,
  tags?: string[]
): boolean {
  const config = getStepTypeConfig(stepType);
  
  // Must be enabled in UI elements config
  if (!config.uiElements.showDamageSeverity) {
    return false;
  }

  // Must be damage-related (check tags)
  if (tags && tags.length > 0) {
    const damageTags = tags.filter(t => 
      t.toLowerCase().includes('damage') || 
      t.toLowerCase().includes('hail') ||
      t.toLowerCase().includes('wind') ||
      t.toLowerCase().includes('water') ||
      t.toLowerCase().includes('fire')
    );
    return damageTags.length > 0;
  }

  // If no tags, don't show damage severity (conservative approach)
  return false;
}

/**
 * Get required photo count for a step
 * Evidence requirements override step type defaults
 * NO LEGACY ASSETS SUPPORT - only uses evidenceRequirements or step type config
 */
export function getRequiredPhotoCount(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean; photo?: { minCount?: number } }>
): number {
  // First check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const photoReq = evidenceRequirements.find(r => r.type === 'photo' && r.required);
    if (photoReq?.photo?.minCount !== undefined) {
      return photoReq.photo.minCount;
    }
    // If evidence requirements exist but no photo requirement, return 0
    if (evidenceRequirements.some(r => r.type === 'photo')) {
      return 0; // Photo requirement exists but not required
    }
    // No photo requirement in evidence requirements
    return 0;
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  if (config.defaultEvidence.photos.required) {
    return config.defaultEvidence.photos.defaultMinCount;
  }

  return 0; // No photos required
}

/**
 * Determine if notes field should be shown
 */
export function shouldShowNotesField(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean; note?: { minLength?: number } }>
): boolean {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const noteReq = evidenceRequirements.find(r => r.type === 'note');
    if (noteReq) {
      return true; // Show if note requirement exists
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.uiElements.showNotesField || config.defaultEvidence.notes.showAlways;
}

/**
 * Get note requirement configuration
 */
export function getNoteRequirement(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean; note?: { minLength?: number } }>
): { required: boolean; minLength: number } {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const noteReq = evidenceRequirements.find(r => r.type === 'note');
    if (noteReq) {
      return {
        required: noteReq.required === true,
        minLength: noteReq.note?.minLength || 1,
      };
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return {
    required: config.defaultEvidence.notes.required,
    minLength: config.defaultEvidence.notes.defaultMinLength,
  };
}

/**
 * Determine if measurement input should be shown
 */
export function shouldShowMeasurementInput(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean; measurement?: { type?: string; unit?: string } }>
): boolean {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const measurementReq = evidenceRequirements.find(r => r.type === 'measurement');
    if (measurementReq) {
      return true;
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.uiElements.showMeasurementInput;
}

/**
 * Determine if checklist should be shown
 */
export function shouldShowChecklist(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean }>
): boolean {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const checklistReq = evidenceRequirements.find(r => r.type === 'checklist');
    if (checklistReq) {
      return true;
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.uiElements.showChecklist;
}

/**
 * Check if step can complete without photos
 */
export function canCompleteWithoutPhotos(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean }>
): boolean {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const photoReq = evidenceRequirements.find(r => r.type === 'photo' && r.required === true);
    if (photoReq) {
      return false; // Photo is required
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.validation.canCompleteWithoutPhotos;
}

/**
 * Check if step can complete without notes
 */
export function canCompleteWithoutNotes(
  stepType: InspectionStepType | string,
  evidenceRequirements?: Array<{ type: string; required?: boolean }>
): boolean {
  // Check explicit evidence requirements
  if (evidenceRequirements && evidenceRequirements.length > 0) {
    const noteReq = evidenceRequirements.find(r => r.type === 'note' && r.required === true);
    if (noteReq) {
      return false; // Notes are required
    }
  }

  // Fall back to step type config
  const config = getStepTypeConfig(stepType);
  return config.validation.canCompleteWithoutNotes;
}

/**
 * Generate step type guidance text for AI prompt
 * This helps the AI understand what evidence requirements to set for each step type
 */
export function generateStepTypeGuidanceForPrompt(): string {
  const sections: string[] = [];

  sections.push('CRITICAL: Step type determines default evidence requirements. Only override defaults when a specific step needs different requirements.');

  for (const [stepType, config] of Object.entries(STEP_TYPE_CONFIG)) {
    sections.push(`\n${config.displayName.toUpperCase()} (step_type: "${stepType}"):`);
    sections.push(`- Default Evidence: ${config.promptGuidance}`);
    sections.push(`- Photos Required: ${config.defaultEvidence.photos.required ? `Yes (min ${config.defaultEvidence.photos.defaultMinCount})` : 'No'}`);
    sections.push(`- Notes Required: ${config.defaultEvidence.notes.required ? `Yes (min ${config.defaultEvidence.notes.defaultMinLength} chars)` : 'Optional'}`);
    sections.push(`- Measurements Required: ${config.defaultEvidence.measurements.required ? 'Yes' : 'No'}`);
    sections.push(`- Checklist Required: ${config.defaultEvidence.checklist.required ? 'Yes' : 'No'}`);
    sections.push(`- Damage Severity: ${config.uiElements.showDamageSeverity ? 'Shown if step is damage-related (tags include "damage")' : 'Never shown'}`);
  }

  sections.push('\nCORRECT Examples:');
  sections.push('- Interview step: { "step_type": "interview", "assets": [] } - NO photos');
  sections.push('- Documentation step: { "step_type": "documentation", "assets": [{ "asset_type": "checklist", "required": true }] } - NO photos');
  sections.push('- Photo step: { "step_type": "photo", "assets": [{ "asset_type": "photo", "required": true }] } - Photos REQUIRED');
  sections.push('- Measurement step: { "step_type": "measurement", "assets": [{ "asset_type": "measurement", "required": true }] } - Measurement REQUIRED, NO photos');

  sections.push('\nWRONG Examples:');
  sections.push('- Interview step with photos: { "step_type": "interview", "assets": [{ "asset_type": "photo", "required": true }] } - WRONG: Interview steps do NOT need photos');
  sections.push('- Documentation step with photos: { "step_type": "documentation", "assets": [{ "asset_type": "photo", "required": true }] } - WRONG: Documentation steps do NOT need photos');
  sections.push('- Checklist step with photos: { "step_type": "checklist", "assets": [{ "asset_type": "photo", "required": true }] } - WRONG: Checklist steps do NOT need photos');

  return sections.join('\n');
}
