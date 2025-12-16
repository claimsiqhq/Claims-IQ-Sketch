/**
 * Peril-Specific Inspection Intelligence Layer
 *
 * This module provides structured, deterministic inspection heuristics per peril.
 * These rules supplement AI outputs and standardize adjuster guidance.
 *
 * Purpose:
 * - Create INSTITUTIONAL MEMORY for inspection best practices
 * - Prevent "LLM vibes" with consistent, predictable behavior
 * - Enable both AI and UI to behave consistently
 *
 * Rules:
 * - NO carrier-specific logic (use carrier overlays for that)
 * - NO estimate math
 * - NO policy decisions
 * - INSPECTION intelligence ONLY
 */

import { Peril } from '../../shared/schema';

/**
 * Inspection priority area - where to start and what to examine
 */
export interface InspectionPriorityArea {
  area: string;
  description: string;
  criticalityLevel: 'high' | 'medium' | 'low';
}

/**
 * Required photo category with specific items
 */
export interface PhotoRequirement {
  category: string;
  items: string[];
  notes?: string;
}

/**
 * Common inspection mistake to avoid
 */
export interface CommonMiss {
  issue: string;
  description: string;
  consequence: string;
}

/**
 * Trigger condition for escalation
 */
export interface EscalationTrigger {
  condition: string;
  action: string;
  urgency: 'immediate' | 'same_day' | 'within_48h';
}

/**
 * Sketch requirement for the peril type
 */
export interface SketchRequirement {
  type: string;
  description: string;
  required: boolean;
}

/**
 * Depreciation consideration specific to peril
 */
export interface DepreciationGuidance {
  item: string;
  guidance: string;
}

/**
 * Complete inspection rule set for a peril
 */
export interface PerilInspectionRule {
  peril: Peril;
  displayName: string;
  priorityAreas: InspectionPriorityArea[];
  requiredPhotos: PhotoRequirement[];
  commonMisses: CommonMiss[];
  escalationTriggers: EscalationTrigger[];
  sketchRequirements: SketchRequirement[];
  depreciationGuidance: DepreciationGuidance[];
  inspectionTips: string[];
  safetyConsiderations: string[];
}

/**
 * The master inspection rules registry
 */
export const PERIL_INSPECTION_RULES: Record<string, PerilInspectionRule> = {
  // ============================================================
  // WIND / HAIL
  // ============================================================
  [Peril.WIND_HAIL]: {
    peril: Peril.WIND_HAIL,
    displayName: 'Wind / Hail',
    priorityAreas: [
      {
        area: 'Roof',
        description: 'Start with roof inspection - most common damage point for wind/hail',
        criticalityLevel: 'high',
      },
      {
        area: 'Gutters & Downspouts',
        description: 'Check for hail dents, detachment, misalignment',
        criticalityLevel: 'medium',
      },
      {
        area: 'Siding (All Elevations)',
        description: 'Inspect all four sides - directional wind damage varies',
        criticalityLevel: 'high',
      },
      {
        area: 'Windows & Screens',
        description: 'Check for cracked glass, torn screens, damaged frames',
        criticalityLevel: 'medium',
      },
      {
        area: 'Soft Metals (AC units, vents)',
        description: 'Excellent hail indicators - document denting patterns',
        criticalityLevel: 'medium',
      },
      {
        area: 'Fencing & Other Structures',
        description: 'Check outbuildings, fences, detached garages',
        criticalityLevel: 'low',
      },
    ],
    requiredPhotos: [
      {
        category: 'Overview',
        items: [
          'Front elevation of property',
          'Rear elevation of property',
          'Left side elevation',
          'Right side elevation',
          'Street view with address visible',
        ],
      },
      {
        category: 'Roof',
        items: [
          'Full roof overview (if accessible)',
          'Close-up of damaged shingles',
          'Chalk-circled hail hits (with ruler)',
          'Ridge cap condition',
          'Flashing at penetrations',
          'Roof age indicator (permit sticker, underside date)',
        ],
        notes: 'Include test squares if performed',
      },
      {
        category: 'Gutters & Downspouts',
        items: [
          'Hail dents on gutters (with ruler)',
          'Downspout damage',
          'Splash blocks',
        ],
      },
      {
        category: 'Siding',
        items: [
          'Impact damage per elevation',
          'Directional damage patterns',
          'Window wrap/trim damage',
        ],
      },
      {
        category: 'Soft Metals',
        items: [
          'AC unit (all sides)',
          'Roof vents',
          'Mailbox',
          'Light fixtures',
        ],
        notes: 'Soft metal collateral is critical for hail verification',
      },
    ],
    commonMisses: [
      {
        issue: 'Roof age mismatch',
        description: 'Not verifying roof installation date against policy inception',
        consequence: 'Pre-existing condition dispute, depreciation conflicts',
      },
      {
        issue: 'Single-elevation focus',
        description: 'Only inspecting street-facing or reported damage side',
        consequence: 'Missed damage on other elevations, incomplete scope',
      },
      {
        issue: 'Missing soft metal documentation',
        description: 'Skipping AC unit, vents, and other soft metal photos',
        consequence: 'Difficulty proving hail size/impact without collateral',
      },
      {
        issue: 'No test squares',
        description: 'Not documenting hail hits per 10x10 test square',
        consequence: 'Carrier may dispute damage density claims',
      },
      {
        issue: 'Weather data gap',
        description: 'Not correlating inspection findings with weather reports',
        consequence: 'Causation challenges from carrier',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Structural roof damage (rafters, decking exposed)',
        action: 'Emergency tarping authorization, structural engineer referral',
        urgency: 'immediate',
      },
      {
        condition: 'Active water intrusion through roof',
        action: 'Emergency services, add water damage scope',
        urgency: 'immediate',
      },
      {
        condition: 'Tree on structure',
        action: 'Tree removal authorization, structural assessment',
        urgency: 'same_day',
      },
      {
        condition: 'Total roof replacement indicated',
        action: 'Senior adjuster review, supplemental authorization',
        urgency: 'within_48h',
      },
    ],
    sketchRequirements: [
      {
        type: 'Roof diagram',
        description: 'Include all facets, valleys, ridges, penetrations',
        required: true,
      },
      {
        type: 'Elevation sketches',
        description: 'All four elevations with damage locations marked',
        required: true,
      },
      {
        type: 'Test square locations',
        description: 'Mark where test squares were performed',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Roofing (Asphalt Shingles)',
        guidance: 'Age-based: typically 3-5% per year depending on warranty',
      },
      {
        item: 'Siding (Vinyl)',
        guidance: 'Age and condition based, 2-4% per year typical',
      },
      {
        item: 'Gutters (Aluminum)',
        guidance: 'Minimal depreciation if functional, 1-2% per year',
      },
      {
        item: 'Windows',
        guidance: 'Age-based, verify manufacture date if possible',
      },
    ],
    inspectionTips: [
      'Check weather reports for date of loss - hail size correlates with damage severity',
      'Document wind direction from weather data - damage should align',
      'Photograph any neighbor damage visible from property line',
      'Note roof age from permit records, satellite imagery, or underside dating',
      'Soft metals are your best friend for hail verification - always document',
    ],
    safetyConsiderations: [
      'Assess roof slope and wet conditions before climbing',
      'Use proper fall protection equipment',
      'Watch for loose shingles or damaged decking that could give way',
      'Never walk on a roof after recent rain or with morning dew',
    ],
  },

  // ============================================================
  // FIRE
  // ============================================================
  [Peril.FIRE]: {
    peril: Peril.FIRE,
    displayName: 'Fire',
    priorityAreas: [
      {
        area: 'Origin Point',
        description: 'Document fire origin location - critical for cause determination',
        criticalityLevel: 'high',
      },
      {
        area: 'Fire-Damaged Areas',
        description: 'All areas with direct flame, char, or heat damage',
        criticalityLevel: 'high',
      },
      {
        area: 'Smoke Migration Path',
        description: 'Trace smoke travel through structure - attic, HVAC, between floors',
        criticalityLevel: 'high',
      },
      {
        area: 'HVAC System',
        description: 'Ductwork is primary smoke highway - inspect thoroughly',
        criticalityLevel: 'high',
      },
      {
        area: 'Attic Space',
        description: 'Smoke rises and accumulates - check even distant from origin',
        criticalityLevel: 'medium',
      },
      {
        area: 'Contents',
        description: 'Document salvageable vs total loss items in affected areas',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'Overview',
        items: [
          'Exterior showing fire damage extent',
          'All four elevations',
          'Street view for context',
        ],
      },
      {
        category: 'Origin Area',
        items: [
          'Multiple angles of suspected origin point',
          'Char patterns (V-patterns, pour patterns)',
          'Electrical panel if electrical suspected',
          'Appliances if appliance-related',
        ],
        notes: 'If arson suspected, stop and notify carrier immediately',
      },
      {
        category: 'Fire Damage',
        items: [
          'Each room with direct fire damage',
          'Structural damage (rafters, joists, studs)',
          'Ceiling damage throughout',
          'Floor damage throughout',
        ],
      },
      {
        category: 'Smoke Damage',
        items: [
          'Smoke staining on ceilings/walls',
          'Smoke damage in non-fire rooms',
          'HVAC registers and returns',
          'Attic space smoke presence',
        ],
        notes: 'Smoke often travels further than expected - document all areas',
      },
      {
        category: 'Contents',
        items: [
          'Major appliances condition',
          'Furniture in affected areas',
          'Electronics',
          'Soft goods (bedding, clothing)',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Smoke migration underestimate',
        description: 'Limiting smoke damage scope to visible areas only',
        consequence: 'Missed HVAC cleaning, attic treatment, odor remediation',
      },
      {
        issue: 'HVAC contamination overlooked',
        description: 'Not inspecting ductwork for smoke/soot',
        consequence: 'Ongoing odor issues, air quality problems post-repair',
      },
      {
        issue: 'Attic not inspected',
        description: 'Skipping attic inspection when fire was on lower level',
        consequence: 'Smoke damage to insulation missed, odor persistence',
      },
      {
        issue: 'Electrical system clearance',
        description: 'Not requiring electrician inspection for nearby fire',
        consequence: 'Safety hazard, potential callback issues',
      },
      {
        issue: 'Contents inventory incomplete',
        description: 'Surface-level contents documentation',
        consequence: 'Disputes on contents coverage, missed high-value items',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Suspected arson or suspicious circumstances',
        action: 'Stop inspection, preserve evidence, notify SIU immediately',
        urgency: 'immediate',
      },
      {
        condition: 'Structural instability (roof, walls)',
        action: 'Structural engineer required, do not enter unsafe areas',
        urgency: 'immediate',
      },
      {
        condition: 'Total loss indicated',
        action: 'Carrier notification, ALE consideration, contents specialist',
        urgency: 'same_day',
      },
      {
        condition: 'Habitability concerns',
        action: 'ALE authorization, temporary housing coordination',
        urgency: 'same_day',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'All levels showing fire origin and spread path',
        required: true,
      },
      {
        type: 'Damage zone mapping',
        description: 'Differentiate flame damage vs smoke damage areas',
        required: true,
      },
      {
        type: 'HVAC system layout',
        description: 'Show ductwork paths for smoke migration documentation',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Structural repairs',
        guidance: 'Generally minimal depreciation on structural items',
      },
      {
        item: 'HVAC system',
        guidance: 'Age-based if replacement required, typically 3-5% per year',
      },
      {
        item: 'Contents',
        guidance: 'Age and condition based per item, varies widely',
      },
      {
        item: 'Flooring',
        guidance: 'Age-based, 5-10% per year depending on material',
      },
    ],
    inspectionTips: [
      'Smoke travels through every opening - check behind outlet covers',
      'Smell test: if you smell smoke, there is smoke damage to document',
      'Attic insulation acts like a sponge for smoke - always inspect',
      'HVAC is the #1 missed smoke damage area - inspect ALL ductwork',
      'Document the fire department report number for your file',
    ],
    safetyConsiderations: [
      'Confirm structure is safe to enter with fire department',
      'Wear appropriate PPE (respirator, protective clothing)',
      'Watch for structural hazards - compromised floors, ceilings',
      'Be aware of hidden hot spots - fire can smolder for days',
      'Test for carbon monoxide before extended time inside',
    ],
  },

  // ============================================================
  // WATER (Non-Flood)
  // ============================================================
  [Peril.WATER]: {
    peril: Peril.WATER,
    displayName: 'Water (Non-Flood)',
    priorityAreas: [
      {
        area: 'Water Source',
        description: 'Identify and document the exact source of water intrusion',
        criticalityLevel: 'high',
      },
      {
        area: 'Primary Affected Area',
        description: 'Room/area where water damage is most severe',
        criticalityLevel: 'high',
      },
      {
        area: 'Water Migration Path',
        description: 'Trace water flow through structure - follows gravity',
        criticalityLevel: 'high',
      },
      {
        area: 'Below/Adjacent Areas',
        description: 'Check rooms below and adjacent to primary damage',
        criticalityLevel: 'medium',
      },
      {
        area: 'Subfloor/Structure',
        description: 'Assess water penetration into subfloor and framing',
        criticalityLevel: 'medium',
      },
      {
        area: 'HVAC System',
        description: 'Check if water reached ductwork or equipment',
        criticalityLevel: 'low',
      },
    ],
    requiredPhotos: [
      {
        category: 'Water Source',
        items: [
          'Failed component (pipe, appliance, fixture)',
          'Connection points showing failure mode',
          'Surrounding area for context',
          'Age/condition indicators of source',
        ],
        notes: 'Critical for coverage determination and subrogation',
      },
      {
        category: 'Moisture Readings',
        items: [
          'Moisture meter on affected materials',
          'Moisture meter on unaffected baseline',
          'Reading locations on sketch',
        ],
        notes: 'Document actual readings with photo of meter display',
      },
      {
        category: 'Affected Areas',
        items: [
          'Each affected room overview',
          'Water staining (ceiling, walls, floor)',
          'Baseboards showing damage',
          'Cabinet/vanity interiors',
        ],
      },
      {
        category: 'Secondary Damage',
        items: [
          'Subfloor condition (if accessible)',
          'Mold presence (if any)',
          'Delamination/warping of materials',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Duration uncertainty',
        description: 'Not establishing timeline of water exposure',
        consequence: 'Mold risk assessment gaps, coverage disputes',
      },
      {
        issue: 'Water category misclassification',
        description: 'Not properly categorizing water (clean/gray/black)',
        consequence: 'Under-scoped mitigation, health risks',
      },
      {
        issue: 'Missed migration',
        description: 'Not checking floors below or cavities where water traveled',
        consequence: 'Hidden damage, mold development later',
      },
      {
        issue: 'No moisture documentation',
        description: 'Skipping moisture meter readings',
        consequence: 'Unable to verify dry-out, disputes on affected areas',
      },
      {
        issue: 'Gradual vs sudden unclear',
        description: 'Failing to document evidence of damage timeline',
        consequence: 'Coverage determination issues',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Category 3 (black water) present',
        action: 'Professional mitigation required, health hazard',
        urgency: 'immediate',
      },
      {
        condition: 'Active water source not stopped',
        action: 'Emergency water shutoff, mitigation dispatch',
        urgency: 'immediate',
      },
      {
        condition: 'Visible mold growth',
        action: 'Mold protocol activation, testing consideration',
        urgency: 'same_day',
      },
      {
        condition: 'Water duration > 48 hours',
        action: 'Elevated mold risk, thorough cavity inspection required',
        urgency: 'same_day',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'Show water source, migration path, all affected areas',
        required: true,
      },
      {
        type: 'Moisture map',
        description: 'Indicate moisture reading locations and values',
        required: true,
      },
      {
        type: 'Vertical migration diagram',
        description: 'If multi-floor, show water path through levels',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Flooring (hardwood)',
        guidance: 'Age-based, typically 3-5% per year',
      },
      {
        item: 'Flooring (carpet)',
        guidance: 'Age-based, 10-15% per year typical',
      },
      {
        item: 'Cabinets',
        guidance: 'Age and quality based, 2-5% per year',
      },
      {
        item: 'Drywall/Paint',
        guidance: 'Minimal depreciation on repair items',
      },
    ],
    inspectionTips: [
      'Water ALWAYS migrates - check areas you cannot see (cavities, under flooring)',
      'Duration matters: ask when water was discovered vs when it started',
      'Moisture meter is essential - visual inspection is not enough',
      'Water category can change over time (clean becomes gray becomes black)',
      'Check for evidence of prior water damage in same location',
    ],
    safetyConsiderations: [
      'Do not enter standing water with electrical power on',
      'Category 3 water requires proper PPE',
      'Watch for slip hazards on wet surfaces',
      'Be cautious of compromised structural elements (saturated subfloor)',
    ],
  },

  // ============================================================
  // FLOOD
  // ============================================================
  [Peril.FLOOD]: {
    peril: Peril.FLOOD,
    displayName: 'Flood',
    priorityAreas: [
      {
        area: 'High Water Mark',
        description: 'Document maximum water level throughout structure',
        criticalityLevel: 'high',
      },
      {
        area: 'Ground Floor',
        description: 'Primary damage area for flood events',
        criticalityLevel: 'high',
      },
      {
        area: 'Basement/Crawlspace',
        description: 'Often most severely affected by flood',
        criticalityLevel: 'high',
      },
      {
        area: 'HVAC/Mechanical',
        description: 'Ground-level equipment commonly flood-damaged',
        criticalityLevel: 'medium',
      },
      {
        area: 'Exterior/Foundation',
        description: 'Check for erosion, foundation damage, debris',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'High Water Mark',
        items: [
          'Water line visible on exterior',
          'Water line visible on interior walls',
          'Measurement from floor to high water mark',
        ],
        notes: 'Critical for NFIP and flood claim documentation',
      },
      {
        category: 'Flood Source',
        items: [
          'Source of flooding (river, storm drain, etc.)',
          'External water evidence',
          'Neighboring property conditions',
        ],
      },
      {
        category: 'Damage Documentation',
        items: [
          'Each affected room overview',
          'Flooring damage throughout',
          'Wall damage (drywall, insulation)',
          'Contamination evidence',
        ],
      },
      {
        category: 'Mechanical Systems',
        items: [
          'HVAC equipment',
          'Water heater',
          'Electrical panel',
          'Washer/dryer',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Coverage verification gap',
        description: 'Not confirming flood policy existence before full scope',
        consequence: 'Wasted effort if no flood coverage exists',
      },
      {
        issue: 'High water mark undocumented',
        description: 'Failing to photograph and measure water line',
        consequence: 'Unable to support affected area claims',
      },
      {
        issue: 'External water vs internal water confusion',
        description: 'Mixing flood and water damage in same claim',
        consequence: 'Coverage allocation issues',
      },
      {
        issue: 'Contamination underestimated',
        description: 'Flood water is almost always Category 3',
        consequence: 'Under-scoped mitigation, health risks',
      },
    ],
    escalationTriggers: [
      {
        condition: 'No flood policy confirmed',
        action: 'STOP - verify flood coverage before proceeding',
        urgency: 'immediate',
      },
      {
        condition: 'Foundation damage suspected',
        action: 'Structural engineer referral required',
        urgency: 'same_day',
      },
      {
        condition: 'Contamination present',
        action: 'Professional mitigation with proper disposal protocols',
        urgency: 'immediate',
      },
      {
        condition: 'Multi-unit building affected',
        action: 'Building-wide assessment, HOA notification',
        urgency: 'same_day',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'Show all affected areas with high water mark noted',
        required: true,
      },
      {
        type: 'Site plan',
        description: 'Show flood water source relative to structure',
        required: true,
      },
      {
        type: 'Elevation diagram',
        description: 'Show water level relative to floor heights',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Note',
        guidance: 'NFIP has specific depreciation rules - verify policy type',
      },
      {
        item: 'Flooring',
        guidance: 'Standard age-based per NFIP guidelines',
      },
      {
        item: 'Appliances',
        guidance: 'Age-based, verify actual cash value approach',
      },
    ],
    inspectionTips: [
      'CRITICAL: Flood is typically excluded under HO policies - verify coverage first',
      'Flood water is almost always Category 3 (contaminated) - scope accordingly',
      'Document high water mark multiple times - it is essential evidence',
      'Check for silt/mud deposits which indicate flood vs plumbing water',
      'Foundation and structural concerns are common - inspect carefully',
    ],
    safetyConsiderations: [
      'Flood water is contaminated - full PPE required',
      'Do not enter if structure stability is questionable',
      'Watch for wildlife displacement (snakes, rodents)',
      'Assume all electrical systems are compromised until verified',
      'Be aware of gas leaks - flood can damage gas lines',
    ],
  },

  // ============================================================
  // SMOKE
  // ============================================================
  [Peril.SMOKE]: {
    peril: Peril.SMOKE,
    displayName: 'Smoke',
    priorityAreas: [
      {
        area: 'Smoke Source/Entry Point',
        description: 'Identify how smoke entered the structure',
        criticalityLevel: 'high',
      },
      {
        area: 'HVAC System',
        description: 'Primary smoke distribution system in any structure',
        criticalityLevel: 'high',
      },
      {
        area: 'Soft Contents',
        description: 'Fabrics, bedding, clothing absorb smoke heavily',
        criticalityLevel: 'medium',
      },
      {
        area: 'Horizontal Surfaces',
        description: 'Counters, shelves, tops of items collect soot',
        criticalityLevel: 'medium',
      },
      {
        area: 'Hidden Areas',
        description: 'Attic, inside cabinets, closets, behind furniture',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'Smoke Source',
        items: [
          'External fire source (if neighboring)',
          'Wildfire proximity',
          'Entry points where smoke infiltrated',
        ],
      },
      {
        category: 'Smoke Damage Evidence',
        items: [
          'Soot deposits on surfaces',
          'Smoke staining on ceilings',
          'HVAC registers/returns',
          'Window sills showing smoke entry',
        ],
      },
      {
        category: 'Affected Contents',
        items: [
          'Soft goods (furniture, bedding)',
          'Electronics',
          'Food items (often total loss)',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Underestimating infiltration',
        description: 'Not recognizing smoke travels everywhere air travels',
        consequence: 'Incomplete scope, odor persistence',
      },
      {
        issue: 'HVAC not included',
        description: 'Skipping HVAC cleaning in smoke claims',
        consequence: 'Ongoing odor distribution, air quality issues',
      },
      {
        issue: 'Residue type mismatch',
        description: 'Not identifying wet vs dry vs oily residue',
        consequence: 'Wrong cleaning methods specified',
      },
      {
        issue: 'Contents underscoped',
        description: 'Missing smoke damage to stored/hidden items',
        consequence: 'Incomplete contents inventory',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Oily/protein residue present',
        action: 'Specialized cleaning required, standard methods insufficient',
        urgency: 'same_day',
      },
      {
        condition: 'Wildfire smoke ongoing',
        action: 'Temporary relocation consideration, air quality monitoring',
        urgency: 'immediate',
      },
      {
        condition: 'HVAC contamination confirmed',
        action: 'Professional HVAC cleaning, possibly replacement',
        urgency: 'same_day',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'Show smoke infiltration points and affected areas',
        required: true,
      },
      {
        type: 'HVAC layout',
        description: 'Show duct runs and contamination extent',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'HVAC cleaning',
        guidance: 'Typically no depreciation on cleaning services',
      },
      {
        item: 'Contents',
        guidance: 'Standard age/condition depreciation per item',
      },
      {
        item: 'Soft goods',
        guidance: 'Often total loss - salvage assessment required',
      },
    ],
    inspectionTips: [
      'If you can smell smoke, there is damage to document',
      'White glove test - wipe surfaces to check for residue',
      'Smoke residue type matters: dry (fire), wet (low temp), oily (protein/grease)',
      'Check inside EVERYTHING - cabinets, closets, drawers, appliances',
      'HVAC is almost always affected - do not skip it',
    ],
    safetyConsiderations: [
      'Wear N95 or better respirator for smoke-damaged properties',
      'Limit exposure time in heavily affected areas',
      'Be aware that smoke odor can cause headaches/nausea',
    ],
  },

  // ============================================================
  // MOLD
  // ============================================================
  [Peril.MOLD]: {
    peril: Peril.MOLD,
    displayName: 'Mold',
    priorityAreas: [
      {
        area: 'Visible Growth Areas',
        description: 'Document all visible mold growth locations',
        criticalityLevel: 'high',
      },
      {
        area: 'Moisture Source',
        description: 'Identify what caused the moisture leading to mold',
        criticalityLevel: 'high',
      },
      {
        area: 'Behind Walls/Concealed Spaces',
        description: 'Mold often grows in concealed areas',
        criticalityLevel: 'high',
      },
      {
        area: 'HVAC System',
        description: 'Check for mold in ductwork and air handler',
        criticalityLevel: 'medium',
      },
      {
        area: 'Adjacent Areas',
        description: 'Spores spread - check surrounding spaces',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'Visible Mold',
        items: [
          'All visible mold growth with ruler for scale',
          'Color and texture documentation',
          'Extent of growth on each surface',
        ],
        notes: 'Do not disturb mold colonies during photography',
      },
      {
        category: 'Moisture Evidence',
        items: [
          'Moisture source (if identifiable)',
          'Moisture meter readings',
          'Water staining/damage nearby',
        ],
      },
      {
        category: 'Affected Materials',
        items: [
          'All affected building materials',
          'Contents with mold exposure',
          'HVAC components if affected',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Not identifying moisture source',
        description: 'Documenting mold without finding water origin',
        consequence: 'Mold will return after remediation',
      },
      {
        issue: 'Surface-only assessment',
        description: 'Only documenting visible mold without cavity inspection',
        consequence: 'Concealed mold continues to grow',
      },
      {
        issue: 'Coverage limitation unknown',
        description: 'Not checking policy mold limits/exclusions',
        consequence: 'Scope exceeds coverage, claim disputes',
      },
      {
        issue: 'No testing when indicated',
        description: 'Skipping testing for black mold or health concerns',
        consequence: 'Species identification gaps, liability issues',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Growth > 10 sq ft',
        action: 'Professional remediation required per EPA guidelines',
        urgency: 'same_day',
      },
      {
        condition: 'Black mold suspected (Stachybotrys)',
        action: 'Testing recommended, specialized remediation',
        urgency: 'same_day',
      },
      {
        condition: 'Occupant health complaints',
        action: 'Temporary relocation consideration, industrial hygienist',
        urgency: 'immediate',
      },
      {
        condition: 'HVAC contamination',
        action: 'System isolation, professional assessment',
        urgency: 'immediate',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'Show all mold growth locations and extent',
        required: true,
      },
      {
        type: 'Moisture map',
        description: 'Document moisture readings throughout',
        required: true,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Remediation',
        guidance: 'No depreciation on remediation services',
      },
      {
        item: 'Building materials',
        guidance: 'Standard depreciation if replacement required',
      },
      {
        item: 'Testing',
        guidance: 'No depreciation on testing services',
      },
    ],
    inspectionTips: [
      'Do NOT disturb mold growth - can release millions of spores',
      'Wear proper PPE - N95 minimum, full face for extensive growth',
      'Find the moisture source - mold is a symptom, not the cause',
      'Check policy mold limits BEFORE extensive scoping',
      'Document whether mold is result of covered peril (important for coverage)',
    ],
    safetyConsiderations: [
      'Wear N95 respirator at minimum - P100 for heavy growth',
      'Do not use fans or disturb mold colonies',
      'Consider HVAC isolation during inspection',
      'Those with respiratory conditions should not enter',
      'Limit time in affected areas',
    ],
  },

  // ============================================================
  // IMPACT
  // ============================================================
  [Peril.IMPACT]: {
    peril: Peril.IMPACT,
    displayName: 'Impact',
    priorityAreas: [
      {
        area: 'Impact Point',
        description: 'Exact location of impact with object',
        criticalityLevel: 'high',
      },
      {
        area: 'Structural Elements',
        description: 'Check framing, foundation, load-bearing components',
        criticalityLevel: 'high',
      },
      {
        area: 'Impact Object',
        description: 'Document the object that caused damage (tree, vehicle)',
        criticalityLevel: 'high',
      },
      {
        area: 'Secondary Damage',
        description: 'Water intrusion, interior damage from breach',
        criticalityLevel: 'medium',
      },
      {
        area: 'Adjacent Areas',
        description: 'Check for transferred force damage',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'Impact Zone',
        items: [
          'Point of impact with context',
          'Close-up of impact damage',
          'Impact object (tree, vehicle, etc.)',
          'Debris field documentation',
        ],
      },
      {
        category: 'Structural',
        items: [
          'Affected framing members',
          'Foundation if affected',
          'Roof structure if affected',
          'Wall alignment/plumb check',
        ],
        notes: 'Flag any structural concerns immediately',
      },
      {
        category: 'Secondary Damage',
        items: [
          'Interior damage visible',
          'Water intrusion through breach',
          'Mechanical/electrical damage',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Structural assessment skipped',
        description: 'Not evaluating structural integrity after impact',
        consequence: 'Safety hazard, missed scope',
      },
      {
        issue: 'Secondary damage overlooked',
        description: 'Focusing on impact point, missing consequential damage',
        consequence: 'Incomplete scope, supplement needed',
      },
      {
        issue: 'Object removal coordination',
        description: 'Not coordinating tree/vehicle removal properly',
        consequence: 'Delays, additional damage during removal',
      },
      {
        issue: 'Subrogation evidence lost',
        description: 'Not documenting vehicle/responsible party info',
        consequence: 'Lost recovery opportunity',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Structural damage confirmed or suspected',
        action: 'Structural engineer required before occupancy',
        urgency: 'immediate',
      },
      {
        condition: 'Vehicle impact - driver info available',
        action: 'Document for subrogation, obtain police report',
        urgency: 'immediate',
      },
      {
        condition: 'Object still on structure',
        action: 'Coordinate safe removal, emergency tarping',
        urgency: 'immediate',
      },
      {
        condition: 'Gas line or electrical damage',
        action: 'Utility company notification, make safe',
        urgency: 'immediate',
      },
    ],
    sketchRequirements: [
      {
        type: 'Site plan',
        description: 'Show impact trajectory and object location',
        required: true,
      },
      {
        type: 'Structural diagram',
        description: 'Document affected structural elements',
        required: true,
      },
      {
        type: 'Floor plan',
        description: 'Show interior affected areas',
        required: false,
      },
    ],
    depreciationGuidance: [
      {
        item: 'Structural repairs',
        guidance: 'Generally minimal depreciation on structural items',
      },
      {
        item: 'Tree removal',
        guidance: 'No depreciation on emergency services',
      },
      {
        item: 'Affected materials',
        guidance: 'Standard age-based depreciation',
      },
    ],
    inspectionTips: [
      'Safety first - do not enter structure until stability confirmed',
      'Document the impacting object thoroughly (for subrogation if applicable)',
      'Check for secondary damage - water from breach, utilities affected',
      'Impact can cause hidden structural damage - when in doubt, get an engineer',
      'If vehicle involved, get police report number and other driver info',
    ],
    safetyConsiderations: [
      'Do not enter until structural stability is confirmed',
      'Watch for hanging debris that could fall',
      'Check for gas leaks before entering',
      'Be aware of electrical hazards from damaged wiring',
      'Wear hard hat in active impact zones',
    ],
  },

  // ============================================================
  // OTHER
  // ============================================================
  [Peril.OTHER]: {
    peril: Peril.OTHER,
    displayName: 'Other / Unclassified',
    priorityAreas: [
      {
        area: 'Primary Damage Area',
        description: 'Document the main affected area',
        criticalityLevel: 'high',
      },
      {
        area: 'Cause of Loss',
        description: 'Identify and document what caused the damage',
        criticalityLevel: 'high',
      },
      {
        area: 'Extent Assessment',
        description: 'Determine full scope of damage',
        criticalityLevel: 'medium',
      },
    ],
    requiredPhotos: [
      {
        category: 'Overview',
        items: [
          'Property overview',
          'Damage area context',
          'All affected areas',
        ],
      },
      {
        category: 'Damage Details',
        items: [
          'Close-ups of damage',
          'Cause indicators',
          'Extent documentation',
        ],
      },
    ],
    commonMisses: [
      {
        issue: 'Peril misclassification',
        description: 'Not properly identifying the actual peril type',
        consequence: 'Incorrect coverage application, missed guidance',
      },
    ],
    escalationTriggers: [
      {
        condition: 'Unusual or complex loss',
        action: 'Senior adjuster review, specialist consultation',
        urgency: 'same_day',
      },
    ],
    sketchRequirements: [
      {
        type: 'Floor plan',
        description: 'Show all affected areas',
        required: true,
      },
    ],
    depreciationGuidance: [
      {
        item: 'General',
        guidance: 'Apply standard depreciation guidelines per item',
      },
    ],
    inspectionTips: [
      'Re-evaluate peril classification based on inspection findings',
      'Document thoroughly when cause is unclear',
      'Note any coverage concerns for carrier review',
    ],
    safetyConsiderations: [
      'Assess conditions before entering any damaged structure',
      'Use appropriate PPE based on observed conditions',
    ],
  },
};

/**
 * Get inspection rules for a specific peril
 */
export function getInspectionRulesForPeril(peril: Peril | string): PerilInspectionRule | null {
  const rules = PERIL_INSPECTION_RULES[peril];
  return rules || PERIL_INSPECTION_RULES[Peril.OTHER];
}

/**
 * Get merged inspection guidance for primary + secondary perils
 */
export function getMergedInspectionGuidance(
  primaryPeril: Peril | string,
  secondaryPerils: (Peril | string)[] = []
): {
  priorityAreas: InspectionPriorityArea[];
  requiredPhotos: PhotoRequirement[];
  commonMisses: CommonMiss[];
  inspectionTips: string[];
  safetyConsiderations: string[];
} {
  const primaryRules = getInspectionRulesForPeril(primaryPeril);

  // Start with primary peril rules
  const result = {
    priorityAreas: [...(primaryRules?.priorityAreas || [])],
    requiredPhotos: [...(primaryRules?.requiredPhotos || [])],
    commonMisses: [...(primaryRules?.commonMisses || [])],
    inspectionTips: [...(primaryRules?.inspectionTips || [])],
    safetyConsiderations: [...(primaryRules?.safetyConsiderations || [])],
  };

  // Add unique items from secondary perils
  for (const secondaryPeril of secondaryPerils) {
    const secondaryRules = getInspectionRulesForPeril(secondaryPeril);
    if (!secondaryRules) continue;

    // Add unique priority areas
    for (const area of secondaryRules.priorityAreas) {
      if (!result.priorityAreas.some((a) => a.area === area.area)) {
        result.priorityAreas.push(area);
      }
    }

    // Add unique photo requirements
    for (const photo of secondaryRules.requiredPhotos) {
      if (!result.requiredPhotos.some((p) => p.category === photo.category)) {
        result.requiredPhotos.push(photo);
      }
    }

    // Add unique common misses
    for (const miss of secondaryRules.commonMisses) {
      if (!result.commonMisses.some((m) => m.issue === miss.issue)) {
        result.commonMisses.push(miss);
      }
    }

    // Add unique tips
    for (const tip of secondaryRules.inspectionTips) {
      if (!result.inspectionTips.includes(tip)) {
        result.inspectionTips.push(tip);
      }
    }

    // Add unique safety considerations
    for (const safety of secondaryRules.safetyConsiderations) {
      if (!result.safetyConsiderations.includes(safety)) {
        result.safetyConsiderations.push(safety);
      }
    }
  }

  return result;
}

/**
 * Get quick inspection tips for display in UI
 */
export function getQuickInspectionTips(peril: Peril | string, limit: number = 3): string[] {
  const rules = getInspectionRulesForPeril(peril);
  return rules?.inspectionTips.slice(0, limit) || [];
}

/**
 * Get escalation triggers for a peril
 */
export function getEscalationTriggers(peril: Peril | string): EscalationTrigger[] {
  const rules = getInspectionRulesForPeril(peril);
  return rules?.escalationTriggers || [];
}

/**
 * Check if any escalation triggers match given conditions
 */
export function checkEscalationConditions(
  peril: Peril | string,
  conditions: string[]
): EscalationTrigger[] {
  const triggers = getEscalationTriggers(peril);
  const conditionsLower = conditions.map((c) => c.toLowerCase());

  return triggers.filter((trigger) =>
    conditionsLower.some((c) => trigger.condition.toLowerCase().includes(c))
  );
}
