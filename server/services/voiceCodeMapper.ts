/**
 * Voice Command to Xactimate Code Mapper
 *
 * Maps natural language voice input to standardized Xactimate room/component codes.
 * Supports fuzzy matching for voice recognition variations.
 */

/**
 * Room code mapping for Xactimate compatibility
 */
export const ROOM_CODE_MAP: Record<string, string> = {
  // Common rooms
  'kitchen': 'KITCHEN',
  'master bedroom': 'MASTER_BEDROOM',
  'master bath': 'MASTER_BATH',
  'master bathroom': 'MASTER_BATH',
  'living room': 'LIVING',
  'living': 'LIVING',
  'family room': 'FAMILY_ROOM',
  'dining room': 'DINING',
  'bedroom': 'BEDROOM',
  'bedroom one': 'BEDROOM_1',
  'bedroom two': 'BEDROOM_2',
  'bedroom three': 'BEDROOM_3',
  'bedroom 1': 'BEDROOM_1',
  'bedroom 2': 'BEDROOM_2',
  'bedroom 3': 'BEDROOM_3',
  'bathroom': 'BATHROOM',
  'bath': 'BATHROOM',
  'half bath': 'HALF_BATH',
  'powder room': 'HALF_BATH',
  'laundry room': 'LAUNDRY',
  'laundry': 'LAUNDRY',
  'utility room': 'LAUNDRY',
  'hallway': 'HALL',
  'hall': 'HALL',
  'closet': 'CLOSET',
  'walk in closet': 'WALK_IN_CLOSET',
  'office': 'OFFICE',
  'den': 'DEN',
  'study': 'OFFICE',
  'basement': 'BASEMENT',
  'attic': 'ATTIC',
  'garage': 'GARAGE',
  'mudroom': 'MUDROOM',
  'entry': 'ENTRY',
  'foyer': 'ENTRY',
  'sunroom': 'SUNROOM',

  // Exterior areas
  'front elevation': 'FRONT_ELEVATION',
  'rear elevation': 'REAR_ELEVATION',
  'left elevation': 'LEFT_ELEVATION',
  'right elevation': 'RIGHT_ELEVATION',
  'roofing': 'ROOFING',
  'roof': 'ROOFING',
  'siding': 'SIDING',
  'gutters': 'GUTTERING',
  'gutter': 'GUTTERING',
  'fascia': 'FASCIA',
  'soffit': 'SOFFIT',
  'deck': 'DECK',
  'porch': 'PORCH',
  'patio': 'PATIO',
  'fence': 'FENCE',
  'driveway': 'DRIVEWAY'
};

/**
 * Common voice variations for normalization
 */
const VOICE_VARIATIONS: Record<string, string> = {
  'main bedroom': 'master bedroom',
  'primary bedroom': 'master bedroom',
  'primary bath': 'master bath',
  'main bath': 'master bath',
  'living area': 'living room',
  'tv room': 'family room',
  'guest bedroom': 'bedroom',
  'guest bath': 'bathroom',
  'front porch': 'porch',
  'back porch': 'porch',
  'carport': 'garage',
  'storage room': 'closet',
  'pantry': 'closet',
  'bonus room': 'family room',
  'rec room': 'family room',
  'recreation room': 'family room',
  'media room': 'family room',
  'theater room': 'family room',
  'dining': 'dining room',
  'breakfast nook': 'kitchen',
  'eat in kitchen': 'kitchen',
  'upstairs hallway': 'hall',
  'downstairs hallway': 'hall',
  'stairway': 'hall',
  'stairs': 'hall',
  'landing': 'hall',
  'breezeway': 'hall',
  'covered patio': 'patio',
  'screened porch': 'porch',
  'back deck': 'deck',
  'front deck': 'deck',
  'workshop': 'garage',
  'shed': 'SHED', // Direct mapping for structure
  'pool house': 'POOL_HOUSE',
  'guest house': 'GUEST_HOUSE'
};

/**
 * Fuzzy match voice input to Xactimate code
 * Handles:
 * - Case insensitivity
 * - Extra whitespace
 * - Common speech variations ("master" vs "main")
 */
export function mapVoiceToXactimateCode(voiceInput: string): string | null {
  if (!voiceInput) return null;

  // Normalize input
  const normalized = voiceInput.toLowerCase().trim().replace(/\s+/g, ' ');

  // Direct match
  if (normalized in ROOM_CODE_MAP) {
    return ROOM_CODE_MAP[normalized];
  }

  // Check voice variations first
  if (normalized in VOICE_VARIATIONS) {
    const replaced = VOICE_VARIATIONS[normalized];
    if (replaced in ROOM_CODE_MAP) {
      return ROOM_CODE_MAP[replaced];
    }
    // Some variations map directly to codes
    if (replaced.toUpperCase() === replaced) {
      return replaced;
    }
  }

  // Partial matching for numbered rooms
  const bedroomMatch = normalized.match(/bedroom\s*(\d+)/);
  if (bedroomMatch) {
    const num = bedroomMatch[1];
    const key = `bedroom ${num}`;
    if (key in ROOM_CODE_MAP) return ROOM_CODE_MAP[key];
    // Support higher bedroom numbers
    return `BEDROOM_${num}`;
  }

  // Bathroom matching
  const bathroomMatch = normalized.match(/bath(?:room)?\s*(\d+)/);
  if (bathroomMatch) {
    const num = bathroomMatch[1];
    return `BATHROOM_${num}`;
  }

  // Substring matching (last resort)
  for (const [key, code] of Object.entries(ROOM_CODE_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return code;
    }
  }

  return null;
}

/**
 * Get suggestions for ambiguous voice input
 */
export function getSuggestions(voiceInput: string, maxSuggestions: number = 5): string[] {
  if (!voiceInput) return [];

  const normalized = voiceInput.toLowerCase().trim();
  const suggestions: string[] = [];

  for (const [key, code] of Object.entries(ROOM_CODE_MAP)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      suggestions.push(code);
      if (suggestions.length >= maxSuggestions) break;
    }
  }

  return [...new Set(suggestions)]; // Remove duplicates
}

/**
 * Validate that a code is a valid Xactimate room code
 */
export function isValidXactimateCode(code: string): boolean {
  return Object.values(ROOM_CODE_MAP).includes(code);
}

/**
 * Process room creation voice command
 * Returns the code and suggestions if ambiguous
 */
export function processRoomVoiceCommand(voiceInput: string): {
  code: string | null;
  suggestions: string[];
  needsConfirmation: boolean;
} {
  const code = mapVoiceToXactimateCode(voiceInput);
  const suggestions = code ? [] : getSuggestions(voiceInput);

  return {
    code,
    suggestions,
    needsConfirmation: !code && suggestions.length > 0
  };
}

/**
 * Get all available room codes
 */
export function getAllRoomCodes(): Record<string, string> {
  return { ...ROOM_CODE_MAP };
}

/**
 * Get common room categories for UI display
 */
export function getRoomCategories(): Record<string, string[]> {
  return {
    'Living Spaces': ['LIVING', 'FAMILY_ROOM', 'DINING', 'DEN', 'OFFICE', 'SUNROOM'],
    'Bedrooms': ['MASTER_BEDROOM', 'BEDROOM', 'BEDROOM_1', 'BEDROOM_2', 'BEDROOM_3'],
    'Bathrooms': ['MASTER_BATH', 'BATHROOM', 'HALF_BATH'],
    'Utility': ['KITCHEN', 'LAUNDRY', 'MUDROOM', 'CLOSET', 'WALK_IN_CLOSET'],
    'Circulation': ['ENTRY', 'HALL', 'BASEMENT', 'ATTIC', 'GARAGE'],
    'Exterior': ['FRONT_ELEVATION', 'REAR_ELEVATION', 'LEFT_ELEVATION', 'RIGHT_ELEVATION', 'ROOFING', 'SIDING', 'GUTTERING', 'DECK', 'PORCH', 'PATIO', 'FENCE', 'DRIVEWAY']
  };
}
