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
