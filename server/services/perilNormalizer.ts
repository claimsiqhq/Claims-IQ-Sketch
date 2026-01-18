/**
 * Peril Normalizer Service
 *
 * This service provides first-class peril inference and normalization,
 * ensuring ALL perils are treated equally without wind/hail bias.
 *
 * Used during FNOL ingestion to:
 * - Infer primary peril from extracted data
 * - Identify secondary perils that commonly co-occur
 * - Generate peril-specific metadata
 * - Provide confidence scores for inference quality
 */

import {
  Peril,
  SECONDARY_PERIL_MAP,
  PerilMetadata,
  WaterPerilMetadata,
  FirePerilMetadata,
  FloodPerilMetadata,
  WindHailPerilMetadata,
  SmokePerilMetadata,
  MoldPerilMetadata,
  ImpactPerilMetadata,
} from '../../shared/schema';

// Keywords for peril inference (case-insensitive)
const PERIL_KEYWORDS: Record<Peril, string[]> = {
  [Peril.WIND_HAIL]: [
    'wind', 'hail', 'storm', 'tornado', 'hurricane', 'cyclone', 'gust',
    'roof damage', 'shingle', 'siding damage', 'blown off', 'wind driven'
  ],
  [Peril.FIRE]: [
    'fire', 'burn', 'flame', 'arson', 'lightning strike', 'electrical fire',
    'grease fire', 'cooking fire', 'ignite', 'combustion', 'charred'
  ],
  [Peril.WATER]: [
    'water damage', 'pipe burst', 'leak', 'plumbing', 'overflow', 'toilet',
    'washing machine', 'dishwasher', 'water heater', 'sprinkler', 'condensation',
    'hvac leak', 'roof leak', 'supply line', 'drain backup'
  ],
  [Peril.FLOOD]: [
    'flood', 'rising water', 'storm surge', 'flash flood', 'river overflow',
    'mudslide', 'surface runoff', 'tidal', 'levee breach', 'inundation'
  ],
  [Peril.SMOKE]: [
    'smoke damage', 'soot', 'smoke odor', 'wildfire smoke', 'smoke migration',
    'smoke residue', 'neighboring fire smoke'
  ],
  [Peril.MOLD]: [
    'mold', 'mildew', 'fungus', 'fungi', 'microbial growth', 'black mold',
    'mold remediation', 'spores'
  ],
  [Peril.IMPACT]: [
    'vehicle impact', 'car crash', 'tree fell', 'fallen tree', 'debris impact',
    'aircraft', 'vandalism', 'riot', 'struck by', 'collision'
  ],
  [Peril.OTHER]: []
};

// Damage location hints for peril inference
const LOCATION_HINTS: Record<string, Peril[]> = {
  'roof': [Peril.WIND_HAIL, Peril.IMPACT],
  'exterior': [Peril.WIND_HAIL, Peril.IMPACT],
  'interior': [Peril.WATER, Peril.FIRE, Peril.SMOKE],
  'basement': [Peril.WATER, Peril.FLOOD],
  'kitchen': [Peril.FIRE, Peril.WATER],
  'bathroom': [Peril.WATER, Peril.MOLD],
  'attic': [Peril.WATER, Peril.WIND_HAIL],
};

export interface PerilInferenceResult {
  primaryPeril: Peril;
  secondaryPerils: Peril[];
  confidence: number;
  perilMetadata: PerilMetadata;
  inferenceReasoning: string;
}

export interface PerilInferenceInput {
  causeOfLoss?: string;
  lossDescription?: string;
  damageLocation?: string;
  dwellingDamageDescription?: string;
  otherStructureDamageDescription?: string;
  fullText?: string;
}

/**
 * Count keyword matches for a given peril in the text
 */
function countKeywordMatches(text: string, peril: Peril): number {
  const keywords = PERIL_KEYWORDS[peril];
  const lowerText = text.toLowerCase();
  let count = 0;

  for (const keyword of keywords) {
    // Count all occurrences of each keyword
    const regex = new RegExp(keyword.toLowerCase(), 'g');
    const matches = lowerText.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Get peril scores based on keyword matching
 */
function getPerilScores(input: PerilInferenceInput): Map<Peril, number> {
  const scores = new Map<Peril, number>();

  // Combine all text sources for analysis
  const combinedText = [
    input.causeOfLoss || '',
    input.lossDescription || '',
    input.dwellingDamageDescription || '',
    input.otherStructureDamageDescription || '',
    input.damageLocation || ''
  ].join(' ');

  // Score each peril based on keyword matches
  for (const peril of Object.values(Peril)) {
    const keywordScore = countKeywordMatches(combinedText, peril);
    scores.set(peril, keywordScore);
  }

  // Boost score based on causeOfLoss field (most reliable)
  if (input.causeOfLoss) {
    const causeLower = input.causeOfLoss.toLowerCase();
    for (const peril of Object.values(Peril)) {
      const keywords = PERIL_KEYWORDS[peril];
      for (const keyword of keywords) {
        if (causeLower.includes(keyword.toLowerCase())) {
          scores.set(peril, (scores.get(peril) || 0) + 5); // Heavy boost for causeOfLoss match
        }
      }
    }
  }

  // Location-based hints
  if (input.damageLocation) {
    const locLower = input.damageLocation.toLowerCase();
    for (const [location, perils] of Object.entries(LOCATION_HINTS)) {
      if (locLower.includes(location)) {
        for (const peril of perils) {
          scores.set(peril, (scores.get(peril) || 0) + 1);
        }
      }
    }
  }

  return scores;
}

/**
 * Infer water-specific metadata from text
 */
function inferWaterMetadata(text: string): WaterPerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: WaterPerilMetadata = {};

  // Infer source
  if (lowerText.includes('pipe') || lowerText.includes('plumbing') || lowerText.includes('supply line')) {
    metadata.source = 'plumbing';
  } else if (lowerText.includes('appliance') || lowerText.includes('washing machine') ||
             lowerText.includes('dishwasher') || lowerText.includes('water heater')) {
    metadata.source = 'appliance';
  } else if (lowerText.includes('rain') || lowerText.includes('storm') || lowerText.includes('roof leak')) {
    metadata.source = 'weather';
  } else if (lowerText.includes('hvac') || lowerText.includes('ac') || lowerText.includes('air condition')) {
    metadata.source = 'hvac';
  } else {
    metadata.source = 'unknown';
  }

  // Infer duration
  if (lowerText.includes('sudden') || lowerText.includes('burst') || lowerText.includes('broke')) {
    metadata.duration = 'sudden';
  } else if (lowerText.includes('slow') || lowerText.includes('gradual') || lowerText.includes('over time')) {
    metadata.duration = 'gradual';
  } else if (lowerText.includes('repeated') || lowerText.includes('ongoing')) {
    metadata.duration = 'repeated';
  } else {
    metadata.duration = 'unknown';
  }

  // Infer contamination level (IICRC categories)
  if (lowerText.includes('sewage') || lowerText.includes('black water') || lowerText.includes('toilet overflow')) {
    metadata.contamination_level = 'black';
  } else if (lowerText.includes('gray water') || lowerText.includes('washing machine') || lowerText.includes('dishwasher')) {
    metadata.contamination_level = 'gray';
  } else if (lowerText.includes('clean') || lowerText.includes('supply line') || lowerText.includes('fresh water')) {
    metadata.contamination_level = 'clean';
  } else {
    metadata.contamination_level = 'unknown';
  }

  // Mold risk assessment
  metadata.mold_risk = lowerText.includes('mold') ||
                       metadata.duration === 'gradual' ||
                       metadata.duration === 'repeated';

  return metadata;
}

/**
 * Infer fire-specific metadata from text
 */
function inferFireMetadata(text: string): FirePerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: FirePerilMetadata = {};

  // Infer cause
  if (lowerText.includes('electrical') || lowerText.includes('wire') || lowerText.includes('outlet')) {
    metadata.cause = 'electrical';
  } else if (lowerText.includes('cooking') || lowerText.includes('stove') || lowerText.includes('grease')) {
    metadata.cause = 'cooking';
  } else if (lowerText.includes('heating') || lowerText.includes('furnace') || lowerText.includes('space heater')) {
    metadata.cause = 'heating';
  } else if (lowerText.includes('lightning')) {
    metadata.cause = 'lightning';
  } else if (lowerText.includes('arson') || lowerText.includes('intentional')) {
    metadata.cause = 'arson';
  } else {
    metadata.cause = 'unknown';
  }

  // Infer damage types
  const damageTypes: ("flame" | "smoke" | "heat" | "soot")[] = [];
  if (lowerText.includes('flame') || lowerText.includes('burn') || lowerText.includes('charred')) {
    damageTypes.push('flame');
  }
  if (lowerText.includes('smoke')) {
    damageTypes.push('smoke');
  }
  if (lowerText.includes('heat') || lowerText.includes('melted')) {
    damageTypes.push('heat');
  }
  if (lowerText.includes('soot')) {
    damageTypes.push('soot');
  }
  metadata.damage_types = damageTypes.length > 0 ? damageTypes : ['flame', 'smoke'];

  // Infer habitability
  if (lowerText.includes('uninhabitable') || lowerText.includes('total loss') || lowerText.includes('condemned')) {
    metadata.habitability = 'uninhabitable';
  } else if (lowerText.includes('partial') || lowerText.includes('some rooms')) {
    metadata.habitability = 'partial';
  } else {
    metadata.habitability = 'habitable';
  }

  // Try to extract origin room
  const roomMatches = lowerText.match(/(?:kitchen|bedroom|living room|garage|basement|attic|bathroom|laundry)/);
  if (roomMatches) {
    metadata.origin_room = roomMatches[0].charAt(0).toUpperCase() + roomMatches[0].slice(1);
  }

  return metadata;
}

/**
 * Infer flood-specific metadata from text
 */
function inferFloodMetadata(text: string): FloodPerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: FloodPerilMetadata = {};

  // Infer source
  if (lowerText.includes('rising water') || lowerText.includes('river') || lowerText.includes('creek')) {
    metadata.source = 'rising_water';
  } else if (lowerText.includes('storm surge') || lowerText.includes('tidal') || lowerText.includes('coastal')) {
    metadata.source = 'storm_surge';
  } else if (lowerText.includes('overflow') || lowerText.includes('drain')) {
    metadata.source = 'overflow';
  } else if (lowerText.includes('runoff') || lowerText.includes('surface water')) {
    metadata.source = 'surface_runoff';
  }

  // CRITICAL: Add coverage warning for flood claims
  metadata.coverage_warning = 'Flood damage typically excluded under HO policies unless separate flood coverage exists.';

  return metadata;
}

/**
 * Infer wind/hail-specific metadata from text
 */
function inferWindHailMetadata(text: string): WindHailPerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: WindHailPerilMetadata = {};

  // Check for specific damage areas
  metadata.roof_damage = lowerText.includes('roof') || lowerText.includes('shingle');
  metadata.siding_damage = lowerText.includes('siding') || lowerText.includes('exterior wall');
  metadata.window_damage = lowerText.includes('window') || lowerText.includes('glass');

  // Determine if exterior only
  metadata.exterior_only = !lowerText.includes('interior') &&
                           (metadata.roof_damage || metadata.siding_damage || metadata.window_damage);

  // Try to extract hail size
  const hailSizeMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*(?:inch|")\s*hail/);
  if (hailSizeMatch) {
    metadata.hail_size_inches = parseFloat(hailSizeMatch[1]);
  }

  // Try to extract wind speed
  const windSpeedMatch = lowerText.match(/(\d+)\s*(?:mph|miles per hour)/);
  if (windSpeedMatch) {
    metadata.wind_speed_mph = parseInt(windSpeedMatch[1]);
  }

  return metadata;
}

/**
 * Infer smoke-specific metadata from text
 */
function inferSmokeMetadata(text: string): SmokePerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: SmokePerilMetadata = {};

  // Infer source
  if (lowerText.includes('wildfire')) {
    metadata.source = 'wildfire';
  } else if (lowerText.includes('neighbor') || lowerText.includes('adjacent')) {
    metadata.source = 'neighboring_fire';
  } else if (lowerText.includes('fire')) {
    metadata.source = 'fire';
  } else {
    metadata.source = 'other';
  }

  // Infer residue type
  if (lowerText.includes('oily') || lowerText.includes('greasy')) {
    metadata.residue_type = 'oily';
  } else if (lowerText.includes('wet smoke')) {
    metadata.residue_type = 'wet';
  } else {
    metadata.residue_type = 'dry';
  }

  return metadata;
}

/**
 * Infer mold-specific metadata from text
 */
function inferMoldMetadata(text: string): MoldPerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: MoldPerilMetadata = {};

  // Infer cause
  if (lowerText.includes('flood')) {
    metadata.cause = 'flood';
  } else if (lowerText.includes('water') || lowerText.includes('leak') || lowerText.includes('pipe')) {
    metadata.cause = 'water_damage';
  } else if (lowerText.includes('humid') || lowerText.includes('condensation')) {
    metadata.cause = 'humidity';
  } else {
    metadata.cause = 'unknown';
  }

  // Check if testing mentioned
  metadata.testing_required = lowerText.includes('test') || lowerText.includes('sample') ||
                              lowerText.includes('black mold') || lowerText.includes('toxic');

  return metadata;
}

/**
 * Infer impact-specific metadata from text
 */
function inferImpactMetadata(text: string): ImpactPerilMetadata {
  const lowerText = text.toLowerCase();
  const metadata: ImpactPerilMetadata = {};

  // Infer impact source
  if (lowerText.includes('vehicle') || lowerText.includes('car') || lowerText.includes('truck')) {
    metadata.impact_source = 'vehicle';
  } else if (lowerText.includes('tree') || lowerText.includes('branch') || lowerText.includes('limb')) {
    metadata.impact_source = 'tree';
  } else if (lowerText.includes('debris')) {
    metadata.impact_source = 'debris';
  } else if (lowerText.includes('aircraft') || lowerText.includes('plane')) {
    metadata.impact_source = 'aircraft';
  } else {
    metadata.impact_source = 'other';
  }

  // Check for structural damage
  metadata.structural_damage = lowerText.includes('structural') || lowerText.includes('foundation') ||
                               lowerText.includes('wall collapse') || lowerText.includes('load bearing');

  return metadata;
}

/**
 * Main function: Infer peril from extracted claim data
 *
 * This function provides peril-balanced inference, treating all perils equally
 * and not assuming wind/hail or any other specific peril.
 */
export function inferPeril(input: PerilInferenceInput): PerilInferenceResult {
  const scores = getPerilScores(input);

  // Find the peril with the highest score
  let maxScore = 0;
  let primaryPeril = Peril.OTHER;

  for (const [peril, score] of scores.entries()) {
    if (score > maxScore) {
      maxScore = score;
      primaryPeril = peril;
    }
  }

  // Calculate confidence based on score distribution
  const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  let confidence = totalScore > 0 ? Math.min(maxScore / totalScore, 0.95) : 0.30;

  // Boost confidence if causeOfLoss explicitly states the peril
  if (input.causeOfLoss && maxScore >= 5) {
    confidence = Math.min(confidence + 0.20, 0.95);
  }

  // If no clear winner, default to OTHER with low confidence
  if (maxScore === 0) {
    primaryPeril = Peril.OTHER;
    confidence = 0.30;
  }

  // Determine secondary perils from the map
  const secondaryPerils = SECONDARY_PERIL_MAP[primaryPeril] || [];

  // Build peril metadata
  const combinedText = [
    input.causeOfLoss || '',
    input.lossDescription || '',
    input.dwellingDamageDescription || '',
    input.otherStructureDamageDescription || '',
    input.fullText || ''
  ].join(' ');

  const perilMetadata: PerilMetadata = {};

  switch (primaryPeril) {
    case Peril.WATER:
      perilMetadata.water = inferWaterMetadata(combinedText);
      break;
    case Peril.FIRE:
      perilMetadata.fire = inferFireMetadata(combinedText);
      break;
    case Peril.FLOOD:
      perilMetadata.flood = inferFloodMetadata(combinedText);
      break;
    case Peril.WIND_HAIL:
      perilMetadata.wind_hail = inferWindHailMetadata(combinedText);
      break;
    case Peril.SMOKE:
      perilMetadata.smoke = inferSmokeMetadata(combinedText);
      break;
    case Peril.MOLD:
      perilMetadata.mold = inferMoldMetadata(combinedText);
      break;
    case Peril.IMPACT:
      perilMetadata.impact = inferImpactMetadata(combinedText);
      break;
  }

  // Build reasoning string
  const reasoning = buildInferenceReasoning(primaryPeril, maxScore, input);

  return {
    primaryPeril,
    secondaryPerils,
    confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
    perilMetadata,
    inferenceReasoning: reasoning
  };
}

/**
 * Build a human-readable reasoning string for the inference
 */
function buildInferenceReasoning(peril: Peril, score: number, input: PerilInferenceInput): string {
  const reasons: string[] = [];

  if (input.causeOfLoss) {
    reasons.push(`causeOfLoss field: "${input.causeOfLoss}"`);
  }

  if (score > 0) {
    reasons.push(`${score} keyword match(es) found`);
  }

  if (input.damageLocation) {
    reasons.push(`damage location: "${input.damageLocation}"`);
  }

  if (reasons.length === 0) {
    return `Defaulted to "${peril}" due to insufficient data`;
  }

  return `Inferred "${peril}" based on: ${reasons.join(', ')}`;
}

/**
 * Map damage type string to canonical peril
 * Used for damage zone peril association
 */
export function mapDamageTypeToPeril(damageType: string): Peril {
  const lower = damageType.toLowerCase();

  if (lower === 'wind' || lower === 'hail') {
    return Peril.WIND_HAIL;
  } else if (lower === 'fire') {
    return Peril.FIRE;
  } else if (lower === 'water') {
    return Peril.WATER;
  } else if (lower === 'smoke') {
    return Peril.SMOKE;
  } else if (lower === 'mold') {
    return Peril.MOLD;
  } else if (lower === 'impact') {
    return Peril.IMPACT;
  } else {
    return Peril.OTHER;
  }
}

/**
 * Get default peril for zone type
 * Interior zones default to water/fire/smoke, exterior to wind/hail/impact
 */
export function getDefaultPerilForZoneType(zoneType: string, areaType?: string): Peril {
  const lowerZone = zoneType.toLowerCase();
  const lowerArea = areaType?.toLowerCase() || '';

  // Exterior zones default to wind/hail
  if (lowerZone === 'elevation' || lowerArea === 'exterior' || lowerArea === 'roofing') {
    return Peril.WIND_HAIL;
  }

  // Roof zones default to wind/hail
  if (lowerZone === 'roof') {
    return Peril.WIND_HAIL;
  }

  // Interior zones - no default, require explicit selection
  // This avoids assuming water just because it's interior
  return Peril.OTHER;
}

/**
 * Normalize peril value from database to Peril enum
 * Handles various formats: "Wind/Hail", "WATER", "wind_hail", etc.
 */
export function normalizePeril(value: string | null | undefined): Peril {
  if (!value) return Peril.OTHER;

  const normalized = value.toLowerCase().trim();

  // Direct matches
  if (Object.values(Peril).includes(normalized as Peril)) {
    return normalized as Peril;
  }

  // Handle common variations
  if (normalized.includes('wind') || normalized.includes('hail')) return Peril.WIND_HAIL;
  if (normalized.includes('fire')) return Peril.FIRE;
  if (normalized.includes('water') && !normalized.includes('flood')) return Peril.WATER;
  if (normalized.includes('flood')) return Peril.FLOOD;
  if (normalized.includes('smoke')) return Peril.SMOKE;
  if (normalized.includes('mold') || normalized.includes('mildew')) return Peril.MOLD;
  if (normalized.includes('impact') || normalized.includes('tree') || normalized.includes('vehicle')) return Peril.IMPACT;

  return Peril.OTHER;
}

// ============================================
// NORMALIZED PERIL CONTEXT (PART 1 - CANONICAL PERIL)
// ============================================

/**
 * Valid peril codes from the Peril enum.
 * This acts as the source of truth for valid peril codes.
 * In production, this could be replaced by a database table query.
 */
export const VALID_PERIL_CODES: ReadonlySet<string> = new Set(Object.values(Peril));

/**
 * Canonical normalized peril context.
 * This is the SINGLE SOURCE OF TRUTH for peril after FNOL extraction.
 * All downstream systems MUST consume this, not free-text peril strings.
 */
export interface NormalizedPerilContext {
  /** Validated primary peril code from Peril enum */
  primary_peril_code: Peril;
  /** Validated secondary peril codes */
  secondary_peril_codes: Peril[];
  /** Confidence score 0.00-1.00 from peril inference */
  peril_confidence: number;
  /** Conflicts detected during normalization or inspection */
  peril_conflicts: PerilConflict[];
  /** Whether normalization was successful (all perils validated) */
  is_valid: boolean;
  /** Original raw peril values before normalization (for audit trail) */
  raw_values: {
    primary_peril?: string;
    secondary_perils?: string[];
  };
  /** Reasoning for how peril was inferred */
  inference_reasoning?: string;
}

/**
 * Represents a conflict in peril determination.
 * Used when inspection findings disagree with FNOL peril.
 */
export interface PerilConflict {
  /** Source of the conflicting peril */
  source: 'fnol' | 'inspection' | 'adjuster_override' | 'ai_inference';
  /** The conflicting peril value */
  peril_value: string;
  /** Timestamp when conflict was detected */
  detected_at: string;
  /** Human-readable description of the conflict */
  description: string;
  /** Whether this conflict requires human review */
  requires_review: boolean;
  /** Resolution status */
  status: 'pending' | 'resolved' | 'escalated';
}

/**
 * Result of peril code validation
 */
export interface PerilValidationResult {
  /** Whether the peril code is valid */
  is_valid: boolean;
  /** The validated/normalized peril code */
  peril_code: Peril;
  /** Original value before validation */
  original_value: string | null | undefined;
  /** Warning message if validation had issues */
  warning?: string;
}

/**
 * Validate a peril code against the valid peril codes.
 * Maps unknown perils to 'other' and logs a warning.
 *
 * @param perilValue - The peril value to validate
 * @returns PerilValidationResult with validation status and normalized code
 */
export function validatePerilCode(perilValue: string | null | undefined): PerilValidationResult {
  if (!perilValue) {
    return {
      is_valid: false,
      peril_code: Peril.OTHER,
      original_value: perilValue,
      warning: 'Empty peril value, mapped to "other"',
    };
  }

  const normalized = perilValue.toLowerCase().trim();

  // Direct match against valid codes
  if (VALID_PERIL_CODES.has(normalized)) {
    return {
      is_valid: true,
      peril_code: normalized as Peril,
      original_value: perilValue,
    };
  }

  // Try to normalize common variations
  const normalizedPeril = normalizePeril(perilValue);

  if (normalizedPeril !== Peril.OTHER) {
    return {
      is_valid: true,
      peril_code: normalizedPeril,
      original_value: perilValue,
      warning: `Peril "${perilValue}" normalized to "${normalizedPeril}"`,
    };
  }

  // Unknown peril - map to 'other' but flag it
  console.warn(`[PerilNormalizer] Unknown peril code "${perilValue}" mapped to "other"`);
  return {
    is_valid: false,
    peril_code: Peril.OTHER,
    original_value: perilValue,
    warning: `Unknown peril code "${perilValue}" mapped to "other"`,
  };
}

/**
 * Normalize peril data from FNOL extraction into canonical NormalizedPerilContext.
 * This is the PRIMARY normalization function called immediately after FNOL extraction.
 *
 * IMPORTANT: This function is the SINGLE POINT of peril normalization.
 * All downstream systems MUST use the output of this function.
 *
 * @param fnolPerilAnalysis - The peril inference result from FNOL extraction
 * @returns NormalizedPerilContext - The canonical peril context for the claim
 */
export function normalizePerilFromFnol(
  fnolPerilAnalysis: PerilInferenceResult
): NormalizedPerilContext {
  const conflicts: PerilConflict[] = [];
  const rawValues = {
    primary_peril: fnolPerilAnalysis.primaryPeril,
    secondary_perils: fnolPerilAnalysis.secondaryPerils.map(p => p.toString()),
  };

  // Validate primary peril
  const primaryValidation = validatePerilCode(fnolPerilAnalysis.primaryPeril);
  if (!primaryValidation.is_valid && primaryValidation.warning) {
    console.warn(`[PerilNormalizer] Primary peril validation: ${primaryValidation.warning}`);
  }

  // Validate secondary perils
  const validatedSecondary: Peril[] = [];
  for (const secondary of fnolPerilAnalysis.secondaryPerils) {
    const validation = validatePerilCode(secondary);
    if (validation.is_valid || validation.peril_code !== Peril.OTHER) {
      // Only include valid secondary perils (don't include 'other' as secondary)
      if (validation.peril_code !== Peril.OTHER) {
        validatedSecondary.push(validation.peril_code);
      }
    }
    if (validation.warning) {
      console.warn(`[PerilNormalizer] Secondary peril validation: ${validation.warning}`);
    }
  }

  // Deduplicate secondary perils and remove primary if present
  const uniqueSecondary = [...new Set(validatedSecondary)]
    .filter(p => p !== primaryValidation.peril_code);

  const context: NormalizedPerilContext = {
    primary_peril_code: primaryValidation.peril_code,
    secondary_peril_codes: uniqueSecondary,
    peril_confidence: fnolPerilAnalysis.confidence,
    peril_conflicts: conflicts,
    is_valid: primaryValidation.is_valid,
    raw_values: rawValues,
    inference_reasoning: fnolPerilAnalysis.inferenceReasoning,
  };

  console.log(`[PerilNormalizer] Normalized peril context:`, {
    primary: context.primary_peril_code,
    secondary: context.secondary_peril_codes,
    confidence: context.peril_confidence,
    valid: context.is_valid,
  });

  return context;
}

// ============================================
// GUARDRAILS (PART 3 - PREVENT PERIL RE-DERIVATION)
// ============================================

/**
 * Guard against re-deriving peril from narrative text.
 *
 * IMPORTANT: After FNOL extraction, the canonical peril is stored in the claims table.
 * Downstream systems MUST NOT re-derive peril from description/narrative text.
 *
 * This function should be called when any code attempts to infer peril from text
 * when a canonical peril already exists.
 *
 * @param existingPeril - The existing canonical peril from the claim
 * @param attemptedSource - Description of where re-derivation was attempted
 * @param claimId - Optional claim ID for logging
 * @returns The existing peril (never overrides)
 */
export function guardAgainstPerilRederivation(
  existingPeril: Peril | string | null | undefined,
  attemptedSource: string,
  claimId?: string
): { peril: Peril; conflict?: PerilConflict } {
  if (!existingPeril) {
    // No existing peril - this is the initial derivation, allow it
    return { peril: Peril.OTHER };
  }

  const normalizedExisting = validatePerilCode(existingPeril);

  console.warn(
    `[PerilGuardrail] Blocked peril re-derivation attempt from "${attemptedSource}"` +
    (claimId ? ` for claim ${claimId}` : '') +
    `. Using existing peril: ${normalizedExisting.peril_code}`
  );

  const conflict: PerilConflict = {
    source: 'ai_inference',
    peril_value: attemptedSource,
    detected_at: new Date().toISOString(),
    description: `Attempted to re-derive peril from ${attemptedSource} when canonical peril already exists`,
    requires_review: false,
    status: 'resolved',
  };

  return {
    peril: normalizedExisting.peril_code,
    conflict,
  };
}

// ============================================
// INSPECTION CONFLICT HANDLING (PART 4)
// ============================================

/**
 * Result of checking for peril conflicts between FNOL and inspection
 */
export interface InspectionPerilConflictResult {
  /** Whether a conflict was detected */
  has_conflict: boolean;
  /** The FNOL peril (canonical, never changes) */
  fnol_peril: Peril;
  /** The inspection-derived peril (if different) */
  inspection_peril?: Peril;
  /** Conflict record if detected */
  conflict?: PerilConflict;
  /** Recommended action */
  action: 'none' | 'flag_for_review' | 'escalate';
}

/**
 * Check if inspection findings indicate a different peril than FNOL.
 *
 * CRITICAL: This function does NOT change the primary_peril_code.
 * It only flags a conflict for human review.
 *
 * Per requirements:
 * - Do NOT change primary_peril_code based on inspection
 * - Flag a peril_conflict
 * - Require human review or escalation
 *
 * @param fnolPeril - The canonical peril from FNOL
 * @param inspectionFindings - Description of what was found during inspection
 * @param inferredInspectionPeril - What peril the inspection suggests
 * @param claimId - Claim ID for logging
 * @returns InspectionPerilConflictResult with conflict details
 */
export function checkInspectionPerilConflict(
  fnolPeril: Peril | string,
  inferredInspectionPeril: Peril | string,
  inspectionFindings: string,
  claimId: string
): InspectionPerilConflictResult {
  const normalizedFnol = validatePerilCode(fnolPeril);
  const normalizedInspection = validatePerilCode(inferredInspectionPeril);

  // No conflict if perils match
  if (normalizedFnol.peril_code === normalizedInspection.peril_code) {
    return {
      has_conflict: false,
      fnol_peril: normalizedFnol.peril_code,
      action: 'none',
    };
  }

  // Conflict detected - log and flag for review
  console.warn(
    `[PerilConflict] Claim ${claimId}: Inspection suggests "${normalizedInspection.peril_code}" ` +
    `but FNOL peril is "${normalizedFnol.peril_code}". Flagging for human review.`
  );

  const conflict: PerilConflict = {
    source: 'inspection',
    peril_value: normalizedInspection.peril_code,
    detected_at: new Date().toISOString(),
    description: `Inspection findings suggest ${normalizedInspection.peril_code}: "${inspectionFindings}". ` +
      `FNOL reported ${normalizedFnol.peril_code}. Human review required.`,
    requires_review: true,
    status: 'pending',
  };

  // Determine if escalation is needed (significant peril change)
  const requiresEscalation = isSignificantPerilChange(
    normalizedFnol.peril_code,
    normalizedInspection.peril_code
  );

  return {
    has_conflict: true,
    fnol_peril: normalizedFnol.peril_code,
    inspection_peril: normalizedInspection.peril_code,
    conflict,
    action: requiresEscalation ? 'escalate' : 'flag_for_review',
  };
}

/**
 * Determine if a peril change is significant enough to require escalation.
 * Significant changes typically involve coverage implications.
 */
function isSignificantPerilChange(fnolPeril: Peril, inspectionPeril: Peril): boolean {
  // Flood is often excluded from standard HO policies
  if (inspectionPeril === Peril.FLOOD && fnolPeril !== Peril.FLOOD) {
    return true;
  }
  if (fnolPeril === Peril.FLOOD && inspectionPeril !== Peril.FLOOD) {
    return true;
  }

  // Fire vs non-fire is significant
  if (fnolPeril === Peril.FIRE && inspectionPeril !== Peril.FIRE) {
    return true;
  }
  if (inspectionPeril === Peril.FIRE && fnolPeril !== Peril.FIRE) {
    return true;
  }

  // Mold often has coverage limitations
  if (inspectionPeril === Peril.MOLD && fnolPeril !== Peril.MOLD) {
    return true;
  }

  return false;
}

/**
 * Get the canonical peril code for a claim.
 * This is a convenience function that ensures we always return
 * a validated peril code, never a raw string.
 *
 * @param claimPeril - The peril value from the claims table
 * @returns Validated Peril enum value
 */
export function getCanonicalPerilCode(claimPeril: string | null | undefined): Peril {
  const validation = validatePerilCode(claimPeril);
  return validation.peril_code;
}
