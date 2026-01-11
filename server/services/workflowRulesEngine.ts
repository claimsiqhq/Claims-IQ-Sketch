/**
 * Workflow Rules Engine
 *
 * A deterministic, rule-driven engine for generating and mutating inspection workflows.
 * This engine evaluates conditions against claim context and generates appropriate
 * workflow steps with evidence requirements.
 *
 * Key Principles:
 * - Rules first, AI as helper (no hallucination)
 * - All enforcement must be explainable
 * - Dynamic mutation based on real-time changes
 * - Evidence requirements are enforced, not suggested
 */

import {
  WorkflowRule,
  WorkflowCondition,
  ConditionGroup,
  ConditionOperator,
  ConditionSource,
  RuleEvaluationContext,
  DynamicWorkflowStep,
  EvidenceRequirement,
  GeometryBinding,
  StepOrigin,
  BlockingBehavior,
  WorkflowMutationEvent,
  WorkflowMutationResult,
  ExportValidationResult,
  ExportRiskLevel,
  EvidenceGap,
} from '../../shared/workflowTypes';
import { PERIL_INSPECTION_RULES } from '../config/perilInspectionRules';

// ============================================
// CONDITION EVALUATION
// ============================================

/**
 * Safely get a value from an object using a dot-notation path
 */
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a single condition against a value
 */
function evaluateOperator(
  actualValue: unknown,
  operator: ConditionOperator,
  expectedValue: unknown
): boolean {
  switch (operator) {
    case 'equals':
      return actualValue === expectedValue;

    case 'not_equals':
      return actualValue !== expectedValue;

    case 'contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }
      return false;

    case 'not_contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return !actualValue.toLowerCase().includes(expectedValue.toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(expectedValue);
      }
      return true;

    case 'greater_than':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue > expectedValue;
      }
      return false;

    case 'less_than':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue < expectedValue;
      }
      return false;

    case 'exists':
      return actualValue !== null && actualValue !== undefined;

    case 'not_exists':
      return actualValue === null || actualValue === undefined;

    case 'in':
      if (Array.isArray(expectedValue)) {
        return expectedValue.includes(actualValue);
      }
      return false;

    case 'not_in':
      if (Array.isArray(expectedValue)) {
        return !expectedValue.includes(actualValue);
      }
      return true;

    case 'matches_regex':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        try {
          const regex = new RegExp(expectedValue, 'i');
          return regex.test(actualValue);
        } catch {
          return false;
        }
      }
      return false;

    default:
      return false;
  }
}

/**
 * Get the context object for a condition source
 */
function getContextForSource(
  context: RuleEvaluationContext,
  source: ConditionSource
): Record<string, unknown> {
  switch (source) {
    case 'fnol':
      return context.fnol as Record<string, unknown>;
    case 'policy':
      return context.policy as Record<string, unknown>;
    case 'endorsement':
      return { endorsements: context.endorsements } as Record<string, unknown>;
    case 'geometry':
      return context.geometry as Record<string, unknown>;
    case 'damage':
      return { damageZones: context.geometry.damageZones } as Record<string, unknown>;
    case 'claim':
      return {
        peril: context.peril,
        property: context.property,
      } as Record<string, unknown>;
    case 'discovery':
      return { discoveries: context.discoveries } as Record<string, unknown>;
    default:
      return {};
  }
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  condition: WorkflowCondition,
  context: RuleEvaluationContext
): boolean {
  const sourceContext = getContextForSource(context, condition.source);
  const actualValue = getValueByPath(sourceContext, condition.field);
  return evaluateOperator(actualValue, condition.operator, condition.value);
}

/**
 * Evaluate a condition group (with AND/OR logic)
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: RuleEvaluationContext
): boolean {
  if (group.conditions.length === 0) {
    return true; // Empty conditions always pass
  }

  const results = group.conditions.map((condition) => {
    if ('logic' in condition) {
      // Nested group
      return evaluateConditionGroup(condition, context);
    } else {
      // Single condition
      return evaluateCondition(condition, context);
    }
  });

  if (group.logic === 'and') {
    return results.every((r) => r);
  } else {
    return results.some((r) => r);
  }
}

// ============================================
// RULE DEFINITIONS
// ============================================

/**
 * Base inspection rules that apply to most claims
 */
export const BASE_WORKFLOW_RULES: WorkflowRule[] = [
  // Pre-inspection safety check
  {
    id: 'base-safety-check',
    name: 'Initial Safety Assessment',
    description: 'Verify property is safe to enter and inspect',
    version: '1.0',
    conditions: { logic: 'and', conditions: [] }, // Always applies
    step: {
      phase: 'pre_inspection',
      stepType: 'safety_check',
      title: 'Property Safety Assessment',
      instructions:
        'Before entering, assess for hazards: structural damage, electrical issues, gas leaks, standing water, mold, or unstable surfaces. Document any safety concerns.',
      estimatedMinutes: 5,
      tags: ['safety', 'required', 'pre_inspection'],
    },
    evidence: [
      {
        type: 'note',
        label: 'Safety Assessment Notes',
        description: 'Document any safety hazards or concerns identified',
        required: true,
        note: {
          promptText: 'List any safety hazards observed or confirm property is safe to inspect',
          structuredFields: [
            { field: 'safeToEnter', type: 'boolean', required: true },
            { field: 'hazardsIdentified', type: 'text', required: false },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 1,
    origin: 'base_rule',
  },

  // Exterior overview photos
  {
    id: 'base-exterior-overview',
    name: 'Exterior Overview Documentation',
    description: 'Capture overview photos of all exterior sides',
    version: '1.0',
    conditions: { logic: 'and', conditions: [] },
    step: {
      phase: 'exterior',
      stepType: 'photo',
      title: 'Exterior Overview Photos',
      instructions:
        'Photograph all four sides of the property from a distance to show overall condition. Include roof lines and any visible damage.',
      estimatedMinutes: 10,
      tags: ['photo', 'exterior', 'overview'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'North Elevation',
        required: true,
        photo: { minCount: 1, angles: ['north', 'overview'] },
      },
      {
        type: 'photo',
        label: 'South Elevation',
        required: true,
        photo: { minCount: 1, angles: ['south', 'overview'] },
      },
      {
        type: 'photo',
        label: 'East Elevation',
        required: true,
        photo: { minCount: 1, angles: ['east', 'overview'] },
      },
      {
        type: 'photo',
        label: 'West Elevation',
        required: true,
        photo: { minCount: 1, angles: ['west', 'overview'] },
      },
    ],
    blocking: 'blocking',
    priority: 10,
    origin: 'base_rule',
  },

  // Address verification
  {
    id: 'base-address-verification',
    name: 'Address Verification',
    description: 'Verify and document the property address',
    version: '1.0',
    conditions: { logic: 'and', conditions: [] },
    step: {
      phase: 'pre_inspection',
      stepType: 'photo',
      title: 'Verify Property Address',
      instructions:
        'Photograph address numbers clearly visible. Include mailbox or building signage if applicable.',
      estimatedMinutes: 2,
      tags: ['verification', 'address', 'required'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Address Photo',
        description: 'Clear photo showing property address numbers',
        required: true,
        photo: { minCount: 1, subjects: ['address numbers'] },
      },
    ],
    blocking: 'blocking',
    priority: 2,
    origin: 'base_rule',
  },

  // Multi-Structure Classification (from 60-claim validation)
  {
    id: 'base-006',
    name: 'Multi-Structure Classification',
    description: 'Classify each sketch area as main dwelling or other structure for proper coverage allocation',
    version: '1.0.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'has-other-structures',
          source: 'property',
          field: 'hasOtherStructures',
          operator: 'equals',
          value: true,
        },
      ],
    },
    step: {
      phase: 'pre_inspection',
      stepType: 'observation',
      title: 'Structure Classification',
      instructions: 'For each structure you inspect, classify as: (1) Main Dwelling, or (2) Other Structure (detached garage, shed, deck, etc). This affects coverage allocation. Coverage B limit applies to other structures.',
      estimatedMinutes: 5,
      tags: ['classification', 'coverage', 'multi_structure'],
    },
    evidence: [
      {
        type: 'note',
        label: 'Structure Classification',
        description: 'Document each structure inspected and its classification for coverage allocation',
        required: true,
        note: {
          promptText: 'Document each structure inspected and its classification',
          structuredFields: [
            {
              field: 'structures',
              type: 'text',
              required: true,
              placeholder: 'e.g., Main House: Dwelling, Detached Garage: Other Structure (40% roof shared with dwelling)',
            },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 98,
    origin: 'base_rule',
    sourceReference: 'Claim #29 IL - Multi-structure allocation validation',
  },
];

/**
 * Peril-specific rules for water damage claims
 */
export const WATER_DAMAGE_RULES: WorkflowRule[] = [
  {
    id: 'water-moisture-readings',
    name: 'Moisture Documentation',
    description: 'Document moisture readings in affected areas',
    version: '1.0',
    conditions: {
      logic: 'or',
      conditions: [
        {
          id: 'peril-water',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'water',
        },
        {
          id: 'peril-flood',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'flood',
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'measurement',
      title: 'Moisture Meter Readings',
      instructions:
        'Take moisture readings at multiple points in affected areas. Document readings on walls (base, mid, top), floors, and any affected materials. Mark elevated readings.',
      estimatedMinutes: 15,
      tags: ['measurement', 'moisture', 'water_damage'],
      perilSpecific: 'water',
    },
    evidence: [
      {
        type: 'measurement',
        label: 'Moisture Readings',
        description: 'Record moisture meter readings at multiple locations',
        required: true,
        measurement: {
          type: 'moisture',
          unit: '%',
          minReadings: 4,
          locations: ['wall_base', 'wall_mid', 'wall_top', 'floor'],
        },
      },
      {
        type: 'photo',
        label: 'Moisture Meter Display',
        description: 'Photo of moisture meter showing elevated readings',
        required: true,
        photo: { minCount: 2, subjects: ['moisture meter display', 'measurement location'] },
      },
    ],
    blocking: 'blocking',
    priority: 20,
    origin: 'peril_rule',
    sourceReference: 'water_peril_rules',
  },

  {
    id: 'water-source-documentation',
    name: 'Water Source Documentation',
    description: 'Document the source/origin of water damage',
    version: '1.0',
    conditions: {
      logic: 'or',
      conditions: [
        {
          id: 'peril-water',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'water',
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'documentation',
      title: 'Document Water Source',
      instructions:
        'Identify and document the source of water intrusion. Check plumbing, appliances, HVAC, roof penetrations. Photo the source point and document path of water travel.',
      estimatedMinutes: 10,
      tags: ['documentation', 'water_source', 'critical'],
      perilSpecific: 'water',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Water Source Photo',
        description: 'Clear photo of water source or entry point',
        required: true,
        photo: { minCount: 2, angles: ['detail', 'overview'] },
      },
      {
        type: 'note',
        label: 'Source Description',
        required: true,
        note: {
          promptText: 'Describe the water source, how it was identified, and water travel path',
          structuredFields: [
            {
              field: 'sourceType',
              type: 'select',
              required: true,
              options: ['plumbing', 'appliance', 'hvac', 'roof', 'window', 'foundation', 'unknown'],
            },
            { field: 'sourceDescription', type: 'text', required: true },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 15,
    origin: 'peril_rule',
    sourceReference: 'water_peril_rules',
  },

  {
    id: 'water-category-classification',
    name: 'Water Category Classification',
    description: 'Classify water contamination level per IICRC standards',
    version: '1.0',
    conditions: {
      logic: 'or',
      conditions: [
        {
          id: 'peril-water',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'water',
        },
        {
          id: 'peril-flood',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'flood',
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'observation',
      title: 'Water Category Classification',
      instructions: `Classify water contamination per IICRC S500 standards:
- Category 1 (Clean): Supply line, rainwater, melting ice
- Category 2 (Gray): Dishwasher/washing machine discharge, toilet overflow (urine only), aquarium
- Category 3 (Black): Sewage, rising floodwater, toilet overflow (feces), standing water >48hrs

Document evidence supporting classification.`,
      estimatedMinutes: 5,
      tags: ['classification', 'iicrc', 'water_category'],
      perilSpecific: 'water',
    },
    evidence: [
      {
        type: 'note',
        label: 'Water Category',
        required: true,
        note: {
          promptText: 'Select water category and document supporting evidence',
          structuredFields: [
            {
              field: 'waterCategory',
              type: 'select',
              required: true,
              options: ['category_1_clean', 'category_2_gray', 'category_3_black'],
            },
            { field: 'categoryEvidence', type: 'text', required: true },
            { field: 'standingWaterDuration', type: 'text', required: false },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 16,
    origin: 'peril_rule',
    sourceReference: 'iicrc_s500',
  },
];

/**
 * Peril-specific rules for wind/hail claims
 */
export const WIND_HAIL_RULES: WorkflowRule[] = [
  {
    id: 'roof-overview-photos',
    name: 'Roof Overview Documentation',
    description: 'Document overall roof condition',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'peril-wind-hail',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'wind_hail',
        },
      ],
    },
    step: {
      phase: 'exterior',
      stepType: 'photo',
      title: 'Roof Overview Photos',
      instructions:
        'Photograph each roof slope/plane from ground level. If safe roof access available, photograph overview of each plane from roof level.',
      estimatedMinutes: 10,
      tags: ['photo', 'roof', 'exterior'],
      perilSpecific: 'wind_hail',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Roof Planes',
        description: 'Photos of all roof planes/slopes',
        required: true,
        photo: { minCount: 4, angles: ['overview'], subjects: ['roof slope', 'roof plane'] },
      },
    ],
    blocking: 'blocking',
    priority: 20,
    origin: 'peril_rule',
    sourceReference: 'wind_hail_peril_rules',
  },

  {
    id: 'hail-damage-detail',
    name: 'Hail Damage Detail Photos',
    description: 'Document hail impact damage in detail',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'peril-wind-hail',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'wind_hail',
        },
      ],
    },
    step: {
      phase: 'exterior',
      stepType: 'photo',
      title: 'Hail Impact Documentation',
      instructions:
        'Photograph hail impacts with chalk circles and measurement reference. Document pattern density per square (test squares). Include soft metals (vents, gutters, AC units) for hail verification.',
      estimatedMinutes: 20,
      tags: ['photo', 'hail', 'detail', 'measurement'],
      perilSpecific: 'wind_hail',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Roof Damage Detail',
        description: 'Close-up photos of hail impacts with chalk circles',
        required: true,
        photo: { minCount: 5, angles: ['detail', 'measurement'], subjects: ['hail impact', 'chalk circle'] },
      },
      {
        type: 'photo',
        label: 'Soft Metal Damage',
        description: 'Photos of damage to soft metals (vents, gutters, AC)',
        required: true,
        photo: { minCount: 3, angles: ['detail'], subjects: ['soft metal', 'vent damage', 'gutter damage'] },
      },
      {
        type: 'note',
        label: 'Test Square Results',
        required: false,
        note: {
          promptText: 'Document test square results: impacts per 10x10 square, pattern characteristics',
          structuredFields: [
            { field: 'testSquareLocation', type: 'text', required: false },
            { field: 'impactsPerSquare', type: 'number', required: false },
          ],
        },
      },
    ],
    blocking: 'advisory',
    priority: 25,
    origin: 'peril_rule',
    sourceReference: 'wind_hail_peril_rules',
  },

  // Hail Test Square Documentation (from 60-claim validation)
  {
    id: 'wind-hail-006',
    name: 'Hail Test Square Documentation',
    description: 'Document 10x10 test squares with hail hit counts per InterNACHI standards',
    version: '1.0.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'peril-wind-hail-test-square',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'wind_hail',
        },
        {
          logic: 'or',
          conditions: [
            {
              id: 'fnol-hail-description',
              source: 'fnol',
              field: 'lossDescription',
              operator: 'contains',
              value: 'hail',
            },
            {
              id: 'fnol-hail-cause',
              source: 'fnol',
              field: 'cause',
              operator: 'contains',
              value: 'hail',
            },
          ],
        },
      ],
    },
    step: {
      phase: 'exterior',
      stepType: 'inspection',
      title: 'Hail Test Square Documentation',
      instructions: 'Mark 10×10 foot test squares on each roof facet. Count hail strikes within each square. Document storm direction. Industry standard: 8+ hits typically triggers full replacement.',
      estimatedMinutes: 20,
      tags: ['hail', 'roof', 'test_square', 'critical'],
      perilSpecific: 'wind_hail',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Test Square Photos',
        description: '10x10 test squares marked with chalk showing hail impacts',
        required: true,
        photo: {
          minCount: 1,
          maxCount: 10,
          subjects: ['10x10 test square marked with chalk', 'visible hail impacts'],
          quality: {
            minResolution: 2,
            requireNoBlur: true,
          },
          metadata: {
            requireGps: true,
            requireTimestamp: true,
          },
        },
      },
      {
        type: 'measurement',
        label: 'Hail Hit Count Per Test Square',
        description: 'Count of hail strikes within each 10x10 test square',
        required: true,
        measurement: {
          type: 'count',
          unit: 'hits',
          minReadings: 1,
          locations: ['test_square_alpha', 'test_square_bravo', 'test_square_charlie'],
          threshold: 8,
        },
      },
      {
        type: 'note',
        label: 'Storm Direction and Pattern',
        required: true,
        note: {
          promptText: 'Document storm direction and damage pattern across roof facets',
          minLength: 50,
          structuredFields: [
            {
              field: 'stormDirection',
              type: 'select',
              required: true,
              options: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
            },
            {
              field: 'testSquares',
              type: 'text',
              required: true,
              placeholder: 'e.g., Alpha: 9 hits (front slope), Bravo: 12 hits (south slope)',
            },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 95,
    origin: 'peril_rule',
    sourceReference: 'Claim #3 MO - CAT 2524 Tornado/Hail validation',
  },
];

/**
 * Peril-specific rules for fire claims
 */
export const FIRE_DAMAGE_RULES: WorkflowRule[] = [
  {
    id: 'fire-origin-documentation',
    name: 'Fire Origin Documentation',
    description: 'Document the fire origin area',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'peril-fire',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'fire',
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'documentation',
      title: 'Fire Origin Documentation',
      instructions:
        'Document the area of fire origin. Note burn patterns, char depth, and any fire investigation reports. Do NOT disturb evidence if origin investigation is pending.',
      estimatedMinutes: 15,
      tags: ['documentation', 'fire_origin', 'critical'],
      perilSpecific: 'fire',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Origin Area Photos',
        description: 'Photos of fire origin area showing burn patterns',
        required: true,
        photo: { minCount: 4, angles: ['overview', 'detail'], subjects: ['burn pattern', 'char marks'] },
      },
      {
        type: 'note',
        label: 'Origin Notes',
        required: true,
        note: {
          promptText: 'Document fire origin area characteristics and any available investigation information',
          structuredFields: [
            { field: 'originRoom', type: 'text', required: true },
            { field: 'investigationPending', type: 'boolean', required: true },
            { field: 'fireReportNumber', type: 'text', required: false },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 15,
    origin: 'peril_rule',
    sourceReference: 'fire_peril_rules',
  },

  {
    id: 'smoke-damage-assessment',
    name: 'Smoke Damage Assessment',
    description: 'Document smoke damage throughout structure',
    version: '1.0',
    conditions: {
      logic: 'or',
      conditions: [
        {
          id: 'peril-fire',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'fire',
        },
        {
          id: 'peril-smoke',
          source: 'claim',
          field: 'peril.primary',
          operator: 'equals',
          value: 'smoke',
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'observation',
      title: 'Smoke Damage Assessment',
      instructions:
        'Document smoke migration throughout structure. Check corners, above door frames, inside cabinets, and HVAC system. Note residue type (dry, wet, oily) and odor presence.',
      estimatedMinutes: 20,
      tags: ['observation', 'smoke', 'migration'],
      perilSpecific: 'fire',
    },
    evidence: [
      {
        type: 'photo',
        label: 'Smoke Residue Photos',
        description: 'Photos showing smoke residue patterns',
        required: true,
        photo: { minCount: 4, subjects: ['smoke residue', 'soot', 'smoke staining'] },
      },
      {
        type: 'note',
        label: 'Smoke Assessment',
        required: true,
        note: {
          promptText: 'Describe smoke migration pattern and affected areas',
          structuredFields: [
            {
              field: 'residueType',
              type: 'select',
              required: true,
              options: ['dry', 'wet', 'oily', 'protein', 'mixed'],
            },
            { field: 'affectedRooms', type: 'text', required: true },
            { field: 'hvacContaminated', type: 'boolean', required: true },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 18,
    origin: 'peril_rule',
    sourceReference: 'fire_peril_rules',
  },
];

/**
 * Policy-driven rules (endorsement-based)
 */
export const POLICY_DRIVEN_RULES: WorkflowRule[] = [
  {
    id: 'roof-schedule-documentation',
    name: 'Roof Schedule Documentation',
    description: 'Document roof age and material for scheduled settlement',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'roof-scheduled',
          source: 'policy',
          field: 'lossSettlement.roofing.isScheduled',
          operator: 'equals',
          value: true,
        },
      ],
    },
    step: {
      phase: 'exterior',
      stepType: 'documentation',
      title: 'Roof Age & Material Documentation',
      instructions: `POLICY REQUIREMENT: This claim has a roofing schedule endorsement.

Document:
1. Exact roof material type (asphalt shingle, wood shake, metal, tile, slate, etc.)
2. Evidence of roof age (manufacturer stamps, permit records, condition indicators)
3. Each roof plane separately for accurate SF calculation
4. Metal components separately (may have different settlement rules)`,
      estimatedMinutes: 15,
      tags: ['policy_requirement', 'roof_schedule', 'endorsement'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Roof Material Close-up',
        description: 'Clear photo showing roof material type and condition',
        required: true,
        photo: { minCount: 2, angles: ['detail'], subjects: ['roof material', 'shingle type'] },
      },
      {
        type: 'photo',
        label: 'Age Indicators',
        description: 'Photos of any age markers, manufacturer stamps, or condition indicators',
        required: true,
        photo: { minCount: 2, subjects: ['age marker', 'wear pattern', 'manufacturer stamp'] },
      },
      {
        type: 'note',
        label: 'Roof Age Assessment',
        required: true,
        note: {
          promptText: 'Document roof material and age assessment',
          structuredFields: [
            {
              field: 'roofMaterial',
              type: 'select',
              required: true,
              options: [
                'asphalt_3tab',
                'asphalt_architectural',
                'wood_shake',
                'metal',
                'tile_clay',
                'tile_concrete',
                'slate',
                'rubber_epdm',
                'other',
              ],
            },
            { field: 'estimatedAge', type: 'number', required: true },
            { field: 'ageEvidenceDescription', type: 'text', required: true },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 12,
    origin: 'policy_rule',
    sourceReference: 'roof_schedule_endorsement',
  },

  {
    id: 'metal-functional-documentation',
    name: 'Metal Component Functional Damage',
    description: 'Document functional vs cosmetic damage to metal components',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'metal-functional',
          source: 'policy',
          field: 'lossSettlement.roofing.metalFunctionalRequirement',
          operator: 'equals',
          value: true,
        },
      ],
    },
    step: {
      phase: 'exterior',
      stepType: 'observation',
      title: 'Metal Component Functional Assessment',
      instructions: `POLICY REQUIREMENT: Metal components only covered if functional damage exists.

For each metal component (gutters, downspouts, vents, flashing):
1. Document if damage is cosmetic (dents only) or functional (holes, penetrations)
2. Test water flow if possible
3. Look for interior water stains near metal components
4. Photograph any actual penetrations

WARNING: Cosmetic denting alone is typically NOT covered under this endorsement.`,
      estimatedMinutes: 20,
      tags: ['policy_requirement', 'metal_functional', 'endorsement'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Metal Damage Photos',
        description: 'Photos of each damaged metal component',
        required: true,
        photo: { minCount: 4, angles: ['detail'], subjects: ['metal damage', 'functional damage'] },
      },
      {
        type: 'note',
        label: 'Functional Assessment',
        required: true,
        note: {
          promptText: 'Document functional vs cosmetic damage for each metal component',
          structuredFields: [
            { field: 'guttersDamageType', type: 'select', required: false, options: ['none', 'cosmetic', 'functional'] },
            { field: 'downspoutsDamageType', type: 'select', required: false, options: ['none', 'cosmetic', 'functional'] },
            { field: 'ventsDamageType', type: 'select', required: false, options: ['none', 'cosmetic', 'functional'] },
            { field: 'flashingDamageType', type: 'select', required: false, options: ['none', 'cosmetic', 'functional'] },
            { field: 'waterIntrusionEvidence', type: 'boolean', required: true },
          ],
        },
      },
    ],
    blocking: 'blocking',
    priority: 13,
    origin: 'policy_rule',
    sourceReference: 'metal_functional_endorsement',
  },
];

/**
 * Geometry-driven rules (room-specific)
 */
export const ROOM_INSPECTION_RULES: WorkflowRule[] = [
  {
    id: 'room-overview',
    name: 'Room Overview Documentation',
    description: 'Standard room inspection documentation',
    version: '1.0',
    conditions: { logic: 'and', conditions: [] }, // Applies to all rooms
    step: {
      phase: 'interior',
      stepType: 'photo',
      title: '{roomName} Overview',
      instructions: 'Photograph room from doorway showing overall condition. Capture all four walls and ceiling.',
      estimatedMinutes: 3,
      tags: ['room', 'overview'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Room Overview',
        description: 'Overview photo from doorway',
        required: true,
        photo: { minCount: 1, angles: ['overview'] },
      },
    ],
    blocking: 'advisory',
    priority: 30,
    origin: 'geometry',
    geometryScope: 'room',
  },

  {
    id: 'room-damage-detail',
    name: 'Room Damage Detail',
    description: 'Detailed damage documentation for damaged rooms',
    version: '1.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'room-has-damage',
          source: 'geometry',
          field: 'rooms.hasDamage',
          operator: 'equals',
          value: true,
        },
      ],
    },
    step: {
      phase: 'interior',
      stepType: 'photo',
      title: '{roomName} Damage Detail',
      instructions: 'Photograph all visible damage in this room. Include close-ups with measurement reference.',
      estimatedMinutes: 10,
      tags: ['room', 'damage', 'detail'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Damage Detail Photos',
        description: 'Close-up photos of damage with scale reference',
        required: true,
        photo: { minCount: 3, angles: ['detail', 'measurement'] },
      },
    ],
    blocking: 'blocking',
    priority: 35,
    origin: 'geometry',
    geometryScope: 'room',
  },

  {
    id: 'room-measurements',
    name: 'Room Measurements',
    description: 'Capture room dimensions',
    version: '1.0',
    conditions: { logic: 'and', conditions: [] },
    step: {
      phase: 'interior',
      stepType: 'measurement',
      title: '{roomName} Dimensions',
      instructions: 'Measure room length, width, and ceiling height. Note any irregular shapes or alcoves.',
      estimatedMinutes: 5,
      tags: ['room', 'measurement', 'dimensions'],
    },
    evidence: [
      {
        type: 'measurement',
        label: 'Room Dimensions',
        description: 'Length, width, and height measurements',
        required: true,
        measurement: {
          type: 'linear',
          unit: 'ft',
          minReadings: 3,
          locations: ['length', 'width', 'ceiling_height'],
        },
      },
    ],
    blocking: 'advisory',
    priority: 32,
    origin: 'geometry',
    geometryScope: 'room',
  },
];

/**
 * State-Specific Workflow Rules
 * Based on validation across 10 states (MO, TX, IL, MI, OH, PA, NJ, CT, KY, TN)
 */
export const STATE_SPECIFIC_RULES: Record<string, WorkflowRule[]> = {
  // Missouri - END 584E Age/Condition Depreciation
  MO: [
    {
      id: 'mo-001',
      name: 'Missouri END 584E Roof Documentation',
      description: 'Document roof age and condition for END 584E age-based depreciation calculation',
      version: '1.0.0',
      conditions: {
        logic: 'and',
        conditions: [
          {
            id: 'state-mo',
            source: 'property',
            field: 'state',
            operator: 'equals',
            value: 'MO',
          },
          {
            logic: 'or',
            conditions: [
              {
                id: 'fnol-roof-description',
                source: 'fnol',
                field: 'lossDescription',
                operator: 'contains',
                value: 'roof',
              },
              {
                id: 'peril-wind-hail',
                source: 'claim',
                field: 'peril.primary',
                operator: 'in',
                value: ['wind_hail', 'impact'],
              },
            ],
          },
        ],
      },
      step: {
        phase: 'exterior',
        stepType: 'observation',
        title: 'Missouri Roof Age & Condition Assessment',
        instructions: 'Document roof age and current condition for END 584E depreciation calculation. Missouri requires age-based depreciation schedules.',
        estimatedMinutes: 10,
        tags: ['missouri', 'depreciation', 'roof', 'state_specific'],
      },
      evidence: [
        {
          type: 'note',
          label: 'Roof Age and Condition',
          description: 'Document roof installation year and current condition assessment',
          required: true,
          note: {
            promptText: 'Document roof installation year and current condition assessment',
            structuredFields: [
              {
                field: 'roofInstallYear',
                type: 'number',
                required: true,
                placeholder: 'Year roof was installed or replaced',
              },
              {
                field: 'roofCondition',
                type: 'select',
                required: true,
                options: ['excellent', 'good', 'fair', 'poor'],
              },
              {
                field: 'conditionNotes',
                type: 'text',
                required: false,
                placeholder: 'Observable wear, missing granules, curling, etc.',
              },
            ],
          },
        },
      ],
      blocking: 'blocking',
      priority: 90,
      origin: 'state_rule' as StepOrigin,
      sourceReference: 'Claims #3, #32 MO - END 584E depreciation variance',
    },
  ],

  // Michigan - Steep Roof Safety Equipment
  MI: [
    {
      id: 'mi-001',
      name: 'Michigan Steep Roof Safety Documentation',
      description: 'Document safety equipment usage for steep pitch roofs requiring specialized access',
      version: '1.0.0',
      conditions: {
        logic: 'and',
        conditions: [
          {
            id: 'state-mi',
            source: 'property',
            field: 'state',
            operator: 'equals',
            value: 'MI',
          },
        ],
      },
      step: {
        phase: 'exterior',
        stepType: 'observation',
        title: 'Steep Roof Safety Equipment Documentation',
        instructions: 'Document safety equipment used for steep pitch roof access. Photograph goat/harness equipment. This may trigger $125 safety equipment charge.',
        estimatedMinutes: 5,
        tags: ['michigan', 'safety', 'steep_roof', 'state_specific'],
      },
      evidence: [
        {
          type: 'photo',
          label: 'Safety Equipment Photos',
          description: 'Photos of safety equipment used for steep pitch roof access',
          required: true,
          photo: {
            minCount: 2,
            subjects: ['goat safety equipment', 'harness system', 'steep pitch angle'],
          },
        },
        {
          type: 'note',
          label: 'Roof Pitch and Safety Notes',
          required: true,
          note: {
            promptText: 'Document roof pitch and safety equipment used',
            structuredFields: [
              {
                field: 'roofPitch',
                type: 'text',
                required: true,
                placeholder: 'e.g., 9/12, 10/12, 12/12',
              },
              {
                field: 'safetyEquipmentUsed',
                type: 'select',
                required: true,
                options: ['goat', 'harness', 'ladder_stabilizer', 'roof_jacks', 'scaffolding'],
              },
            ],
          },
        },
      ],
      blocking: 'advisory',
      priority: 85,
      origin: 'state_rule' as StepOrigin,
      sourceReference: 'Claim #6 MI - $125 steep roof assist charge',
    },
  ],

  // Texas - State/Local Tax Documentation
  TX: [
    {
      id: 'tx-001',
      name: 'Texas Tax Documentation',
      description: 'Verify property location for accurate state and local tax calculation',
      version: '1.0.0',
      conditions: {
        logic: 'and',
        conditions: [
          {
            id: 'state-tx',
            source: 'property',
            field: 'state',
            operator: 'equals',
            value: 'TX',
          },
        ],
      },
      step: {
        phase: 'pre_inspection',
        stepType: 'observation',
        title: 'Texas Property Location Verification',
        instructions: 'Verify exact property address and jurisdiction for state/local tax calculation. Texas has varying local tax rates.',
        estimatedMinutes: 3,
        tags: ['texas', 'tax', 'jurisdiction', 'state_specific'],
      },
      evidence: [
        {
          type: 'photo',
          label: 'Address Verification Photo',
          description: 'Clear photo showing property address for tax jurisdiction verification',
          required: true,
          photo: {
            minCount: 1,
            subjects: ['street sign', 'house number', 'mailbox'],
          },
        },
      ],
      blocking: 'advisory',
      priority: 95,
      origin: 'state_rule' as StepOrigin,
      sourceReference: 'Claim #26 TX - Separate state/local tax line item',
    },
  ],
};

/**
 * Get state-specific rules for a given state code
 */
export function getStateSpecificRules(stateCode: string): WorkflowRule[] {
  return STATE_SPECIFIC_RULES[stateCode?.toUpperCase()] || [];
}

/**
 * Regional Expense Rules
 * Auto-populate expense tracking based on geography and claim characteristics
 */
export const REGIONAL_EXPENSE_RULES: WorkflowRule[] = [
  // Rural mileage tracking (OH, PA)
  {
    id: 'regional-001',
    name: 'Rural Area Mileage Tracking',
    description: 'Track mileage for rural inspections requiring significant travel',
    version: '1.0.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'rural-states',
          source: 'property',
          field: 'state',
          operator: 'in',
          value: ['OH', 'PA', 'KY', 'TN'],
        },
      ],
    },
    step: {
      phase: 'post_inspection',
      stepType: 'observation',
      title: 'Mileage Documentation',
      instructions: 'Document round-trip mileage from office to property for reimbursement. Standard rate: $0.70/mile after first 100 miles.',
      estimatedMinutes: 2,
      tags: ['expense', 'mileage', 'rural', 'reimbursement'],
    },
    evidence: [
      {
        type: 'note',
        label: 'Mileage Record',
        required: true,
        note: {
          promptText: 'Record mileage for expense reimbursement',
          structuredFields: [
            {
              field: 'startingOdometer',
              type: 'number',
              required: true,
              placeholder: 'Odometer at office departure',
            },
            {
              field: 'endingOdometer',
              type: 'number',
              required: true,
              placeholder: 'Odometer at office return',
            },
            {
              field: 'totalMiles',
              type: 'number',
              required: true,
              placeholder: 'Total round-trip miles',
            },
          ],
        },
      },
    ],
    blocking: 'advisory',
    priority: 70,
    origin: 'regional_rule' as StepOrigin,
    sourceReference: 'Claims #33 OH ($270.90 / 387 mi), #2 PA ($111.30 / 159 mi)',
  },

  // Urban toll expenses (NJ, Northeast metro areas)
  {
    id: 'regional-002',
    name: 'Urban Toll Expense Tracking',
    description: 'Document toll expenses for urban inspections',
    version: '1.0.0',
    conditions: {
      logic: 'and',
      conditions: [
        {
          id: 'urban-toll-states',
          source: 'property',
          field: 'state',
          operator: 'in',
          value: ['NJ', 'NY', 'MA', 'CT'],
        },
      ],
    },
    step: {
      phase: 'post_inspection',
      stepType: 'observation',
      title: 'Toll Expense Documentation',
      instructions: 'Document toll road expenses incurred during inspection travel. Save receipts or toll transponder records.',
      estimatedMinutes: 2,
      tags: ['expense', 'toll', 'urban', 'reimbursement'],
    },
    evidence: [
      {
        type: 'photo',
        label: 'Toll Receipts',
        required: false,
        photo: {
          minCount: 1,
          subjects: ['toll receipt', 'EZPass statement'],
        },
      },
      {
        type: 'note',
        label: 'Toll Expenses',
        required: true,
        note: {
          promptText: 'Record toll expenses for reimbursement',
          structuredFields: [
            {
              field: 'totalTollExpense',
              type: 'number',
              required: true,
              placeholder: 'Total toll charges',
            },
            {
              field: 'tollDetails',
              type: 'text',
              required: false,
              placeholder: 'Route taken, toll plazas crossed',
            },
          ],
        },
      },
    ],
    blocking: 'advisory',
    priority: 70,
    origin: 'regional_rule' as StepOrigin,
    sourceReference: 'Claim #27 NJ - $44.44 toll expenses',
  },
];

// ============================================
// RULE ENGINE CLASS
// ============================================

/**
 * Main workflow rules engine
 */
export class WorkflowRulesEngine {
  private rules: WorkflowRule[] = [];

  constructor() {
    // Load all rule sets
    this.rules = [
      ...BASE_WORKFLOW_RULES,
      ...WATER_DAMAGE_RULES,
      ...WIND_HAIL_RULES,
      ...FIRE_DAMAGE_RULES,
      ...POLICY_DRIVEN_RULES,
      ...ROOM_INSPECTION_RULES,
      ...REGIONAL_EXPENSE_RULES,
    ];

    // Sort by priority
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Load state-specific rules for a given context
   */
  loadStateRules(stateCode: string): void {
    const stateRules = getStateSpecificRules(stateCode);
    if (stateRules.length > 0) {
      this.rules = [...this.rules, ...stateRules];
      this.rules.sort((a, b) => a.priority - b.priority);
    }
  }

  /**
   * Get all applicable rules for a given context
   */
  getApplicableRules(context: RuleEvaluationContext): WorkflowRule[] {
    return this.rules.filter((rule) => {
      // Skip room-scoped rules here (they're handled separately)
      if (rule.geometryScope === 'room') return false;

      return evaluateConditionGroup(rule.conditions, context);
    });
  }

  /**
   * Get room-specific rules
   */
  getRoomRules(): WorkflowRule[] {
    return this.rules.filter((rule) => rule.geometryScope === 'room');
  }

  /**
   * Generate workflow steps from applicable rules
   */
  generateSteps(context: RuleEvaluationContext): DynamicWorkflowStep[] {
    const steps: DynamicWorkflowStep[] = [];
    let stepIndex = 0;

    // 1. Generate steps from non-geometry rules
    const applicableRules = this.getApplicableRules(context);

    for (const rule of applicableRules) {
      const step = this.createStepFromRule(rule, stepIndex++, context);
      steps.push(step);
    }

    // 2. Generate room-specific steps
    const roomRules = this.getRoomRules();

    for (const room of context.geometry.rooms) {
      for (const rule of roomRules) {
        // Check if rule applies to this room
        const roomContext: RuleEvaluationContext = {
          ...context,
          geometry: {
            ...context.geometry,
            rooms: [room], // Only this room for condition evaluation
          },
        };

        if (evaluateConditionGroup(rule.conditions, roomContext)) {
          const step = this.createStepFromRule(rule, stepIndex++, context, room);
          steps.push(step);
        }
      }
    }

    return steps;
  }

  /**
   * Create a DynamicWorkflowStep from a rule
   */
  private createStepFromRule(
    rule: WorkflowRule,
    stepIndex: number,
    context: RuleEvaluationContext,
    room?: { id: string; name: string }
  ): DynamicWorkflowStep {
    // Replace placeholders in title/instructions
    let title = rule.step.title;
    let instructions = rule.step.instructions;

    if (room) {
      title = title.replace('{roomName}', room.name);
      instructions = instructions.replace('{roomName}', room.name);
    }

    // Evaluate if step is currently blocking
    let isCurrentlyBlocking = rule.blocking === 'blocking';
    if (rule.blocking === 'conditional' && rule.blockingCondition) {
      isCurrentlyBlocking = evaluateConditionGroup(rule.blockingCondition, context);
    }

    const step: DynamicWorkflowStep = {
      id: `step-${rule.id}-${stepIndex}`,
      workflowId: '', // Set by caller
      stepIndex,

      phase: rule.step.phase,
      stepType: rule.step.stepType,
      title,
      instructions,
      required: rule.blocking === 'blocking',
      estimatedMinutes: rule.step.estimatedMinutes,
      tags: rule.step.tags,

      origin: rule.origin,
      sourceRuleId: rule.id,
      conditions: rule.conditions,

      evidenceRequirements: rule.evidence,
      evidenceFulfilled: rule.evidence.map((ev, i) => ({
        requirementId: `${rule.id}-evidence-${i}`,
        fulfilled: false,
      })),

      blocking: rule.blocking,
      blockingCondition: rule.blockingCondition,
      isCurrentlyBlocking,

      geometryBinding: room
        ? { scope: 'room', roomId: room.id }
        : undefined,

      status: 'pending',

      roomId: room?.id,
      roomName: room?.name,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return step;
  }

  /**
   * Handle workflow mutation when data changes
   */
  handleMutation(
    event: WorkflowMutationEvent,
    currentSteps: DynamicWorkflowStep[],
    context: RuleEvaluationContext
  ): WorkflowMutationResult {
    const result: WorkflowMutationResult = {
      stepsAdded: [],
      stepsRemoved: [],
      stepsModified: [],
    };

    switch (event.trigger) {
      case 'room_added': {
        // Add room-specific steps for the new room
        const roomRules = this.getRoomRules();
        const newRoom = {
          id: event.data.roomId!,
          name: event.data.roomName!,
          structureId: '',
          hasDamage: false,
        };

        const maxIndex = Math.max(...currentSteps.map((s) => s.stepIndex), 0);
        let nextIndex = maxIndex + 1;

        for (const rule of roomRules) {
          const roomContext: RuleEvaluationContext = {
            ...context,
            geometry: {
              ...context.geometry,
              rooms: [newRoom],
            },
          };

          if (evaluateConditionGroup(rule.conditions, roomContext)) {
            const step = this.createStepFromRule(rule, nextIndex++, context, newRoom);
            result.stepsAdded.push(step);
          }
        }
        break;
      }

      case 'damage_zone_added': {
        // Add damage-specific steps or modify existing room steps
        const roomId = event.data.roomId;
        const damageType = event.data.damageType;

        // Find room steps and mark room as having damage
        const roomSteps = currentSteps.filter((s) => s.roomId === roomId);
        for (const step of roomSteps) {
          // Re-evaluate blocking status
          const newContext = {
            ...context,
            geometry: {
              ...context.geometry,
              rooms: context.geometry.rooms.map((r) =>
                r.id === roomId ? { ...r, hasDamage: true, damageTypes: [damageType!] } : r
              ),
            },
          };

          if (step.sourceRuleId) {
            const rule = this.rules.find((r) => r.id === step.sourceRuleId);
            if (rule && rule.blocking === 'conditional' && rule.blockingCondition) {
              const wasBlocking = step.isCurrentlyBlocking;
              const nowBlocking = evaluateConditionGroup(rule.blockingCondition, newContext);

              if (wasBlocking !== nowBlocking) {
                result.stepsModified.push({
                  stepId: step.id,
                  changes: { isCurrentlyBlocking: nowBlocking },
                });
              }
            }
          }
        }

        // Add damage-specific rules
        // ... (similar logic for damage-specific rules)
        break;
      }

      case 'discovery_logged': {
        // Add discovery-driven steps based on what was found
        // This enables the workflow to adapt to findings during inspection
        break;
      }
    }

    return result;
  }

  /**
   * Validate workflow for export readiness
   */
  validateForExport(
    steps: DynamicWorkflowStep[],
    context: RuleEvaluationContext
  ): ExportValidationResult {
    const gaps: EvidenceGap[] = [];
    let blockedCount = 0;
    let evidenceComplete = 0;
    let evidenceMissing = 0;

    for (const step of steps) {
      // Skip non-blocking completed/skipped steps
      if (step.status === 'completed' || step.status === 'skipped') {
        for (const ef of step.evidenceFulfilled) {
          if (ef.fulfilled) evidenceComplete++;
          else evidenceMissing++;
        }
        continue;
      }

      // Check each evidence requirement
      for (let i = 0; i < step.evidenceRequirements.length; i++) {
        const requirement = step.evidenceRequirements[i];
        const fulfilled = step.evidenceFulfilled[i]?.fulfilled || false;

        if (!fulfilled) {
          evidenceMissing++;

          if (step.isCurrentlyBlocking && requirement.required) {
            blockedCount++;
            gaps.push({
              stepId: step.id,
              stepTitle: step.title,
              requirement,
              isBlocking: true,
              reason: `Required ${requirement.type} "${requirement.label}" not captured`,
            });
          } else if (requirement.required) {
            gaps.push({
              stepId: step.id,
              stepTitle: step.title,
              requirement,
              isBlocking: false,
              reason: `Recommended ${requirement.type} "${requirement.label}" not captured`,
            });
          }
        } else {
          evidenceComplete++;
        }
      }
    }

    // Determine risk level
    let riskLevel: ExportRiskLevel = 'none';
    if (blockedCount > 0) {
      riskLevel = 'blocked';
    } else if (gaps.filter((g) => g.isBlocking).length > 0) {
      riskLevel = 'high';
    } else if (gaps.length > 3) {
      riskLevel = 'medium';
    } else if (gaps.length > 0) {
      riskLevel = 'low';
    }

    const completedSteps = steps.filter((s) => s.status === 'completed').length;
    const warnings: string[] = [];

    if (riskLevel === 'blocked') {
      warnings.push(`${blockedCount} blocking evidence requirement(s) not fulfilled. Export is blocked.`);
    }
    if (completedSteps < steps.length * 0.8) {
      warnings.push(`Only ${Math.round((completedSteps / steps.length) * 100)}% of steps completed.`);
    }

    return {
      canExport: riskLevel !== 'blocked',
      riskLevel,
      gaps,
      summary: {
        totalSteps: steps.length,
        completedSteps,
        blockedSteps: blockedCount,
        evidenceComplete,
        evidenceMissing,
      },
      warnings,
    };
  }

  /**
   * Get explanation for why a step exists
   */
  explainStep(step: DynamicWorkflowStep): string {
    const explanations: string[] = [];

    // Explain origin
    switch (step.origin) {
      case 'base_rule':
        explanations.push('This is a standard inspection requirement for all claims.');
        break;
      case 'peril_rule':
        explanations.push(
          `This step is required for ${step.tags.find((t) => t.endsWith('_damage')) || 'this peril type'} claims.`
        );
        break;
      case 'policy_rule':
        explanations.push(
          `This step is required by policy endorsement: ${step.sourceRuleId?.replace('_', ' ')}.`
        );
        break;
      case 'geometry':
        explanations.push(`This step applies to room: ${step.roomName || 'Unknown'}.`);
        break;
      case 'discovery':
        explanations.push('This step was added based on findings during inspection.');
        break;
    }

    // Explain blocking
    if (step.isCurrentlyBlocking) {
      explanations.push('⚠️ This step is BLOCKING - export will be prevented if not completed.');
    }

    // Explain evidence
    const requiredEvidence = step.evidenceRequirements.filter((e) => e.required);
    if (requiredEvidence.length > 0) {
      explanations.push(
        `Required evidence: ${requiredEvidence.map((e) => e.label).join(', ')}.`
      );
    }

    return explanations.join(' ');
  }
}

// Export singleton instance
export const workflowRulesEngine = new WorkflowRulesEngine();
