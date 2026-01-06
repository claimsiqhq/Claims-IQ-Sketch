/**
 * Voice Grammar Parser
 *
 * Normalizes free-form voice input into constrained intent objects.
 * This layer sits BEFORE intent execution and ensures all inputs
 * conform to our canonical grammar.
 *
 * Key responsibilities:
 * - Parse dimensions from various formats (12 feet, 12', 12 ft, etc.)
 * - Normalize directions to cardinal (N/S/E/W)
 * - Apply sensible defaults for missing values
 * - Log all inferences for audit trail
 * - Return structured intent objects
 */

import type {
  NormalizedIntent,
  CreateRoomIntent,
  PlaceRoomRelativeIntent,
  AddOpeningIntent,
  AddFeatureIntent,
  ConnectRoomsIntent,
  ModifyDimensionIntent,
  MarkDamageIntent,
  SetShapeIntent,
  UnknownIntent,
  CardinalDirection,
  ShapeType,
  OpeningType,
  FeatureType,
  DamageType,
  IICRCCategory,
  WallPosition,
  InferenceLogEntry,
} from './types';

import {
  GRAMMAR_DEFAULTS,
  DIRECTION_ALIASES,
  SHAPE_ALIASES,
  OPENING_TYPE_ALIASES,
  FEATURE_TYPE_ALIASES,
  DAMAGE_TYPE_ALIASES,
} from './types';

// ============================================
// DIMENSION PARSING
// ============================================

/**
 * Parse a dimension value from text
 * Handles: "12", "12 feet", "12'", "12 ft", "twelve", "12.5", etc.
 */
export function parseDimension(text: string): number | null {
  if (!text) return null;

  const normalized = text.toLowerCase().trim();

  // Try numeric first
  const numMatch = normalized.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  // Try word numbers
  const wordNumbers: Record<string, number> = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'twenty-one': 21,
    'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
    'twenty-five': 25, 'thirty': 30, 'forty': 40, 'fifty': 50,
  };

  for (const [word, value] of Object.entries(wordNumbers)) {
    if (normalized.startsWith(word)) {
      return value;
    }
  }

  // Try feet-inches format: 6'8" or 6 feet 8 inches
  const ftInMatch = normalized.match(/(\d+)['']?\s*(?:feet|ft)?\s*(\d+)[""]?\s*(?:inches?|in)?/);
  if (ftInMatch) {
    return parseFloat(ftInMatch[1]) + parseFloat(ftInMatch[2]) / 12;
  }

  return null;
}

/**
 * Parse dimension with unit, returning feet
 */
export function parseDimensionToFeet(text: string): number | null {
  if (!text) return null;

  const normalized = text.toLowerCase().trim();
  const value = parseDimension(normalized);

  if (value === null) return null;

  // Check for unit indicators
  if (normalized.includes('inch') || normalized.endsWith('"') || normalized.endsWith('in')) {
    return value / 12;
  }
  if (normalized.includes('meter') || normalized.endsWith('m')) {
    return value * 3.28084;
  }

  // Default to feet
  return value;
}

// ============================================
// DIRECTION PARSING
// ============================================

/**
 * Parse direction text to cardinal direction
 */
export function parseDirection(text: string): CardinalDirection | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();
  return DIRECTION_ALIASES[normalized] || null;
}

/**
 * Normalize direction with aliases
 */
export function normalizeDirection(text: string): CardinalDirection | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();

  // Direct match
  if (DIRECTION_ALIASES[normalized]) {
    return DIRECTION_ALIASES[normalized];
  }

  // Partial match
  for (const [alias, direction] of Object.entries(DIRECTION_ALIASES)) {
    if (normalized.includes(alias)) {
      return direction;
    }
  }

  return null;
}

// ============================================
// TYPE PARSING
// ============================================

export function parseShape(text: string): ShapeType | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();
  return SHAPE_ALIASES[normalized] || null;
}

export function parseOpeningType(text: string): OpeningType | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();
  return OPENING_TYPE_ALIASES[normalized] || null;
}

export function parseFeatureType(text: string): FeatureType | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();
  return FEATURE_TYPE_ALIASES[normalized] || null;
}

export function parseDamageType(text: string): DamageType | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();
  return DAMAGE_TYPE_ALIASES[normalized] || null;
}

// ============================================
// ROOM NAME EXTRACTION
// ============================================

const COMMON_ROOM_NAMES = [
  'kitchen', 'living room', 'bedroom', 'master bedroom', 'bathroom',
  'master bathroom', 'dining room', 'family room', 'office', 'den',
  'laundry room', 'laundry', 'garage', 'basement', 'attic', 'foyer',
  'entry', 'entryway', 'hallway', 'hall', 'closet', 'pantry', 'mudroom',
  'sunroom', 'bonus room', 'game room', 'media room', 'guest room',
  'nursery', 'study', 'library', 'exercise room', 'gym', 'utility room',
  'storage room', 'workshop', 'guest bedroom', 'second bedroom',
  'third bedroom', 'half bath', 'full bath', 'powder room',
];

/**
 * Extract room name from text
 */
export function extractRoomName(text: string): string | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();

  // Check for explicit room names
  for (const roomName of COMMON_ROOM_NAMES) {
    if (normalized.includes(roomName)) {
      return formatRoomName(roomName);
    }
  }

  // Check for "the <name>" pattern
  const theMatch = normalized.match(/the\s+(\w+(?:\s+\w+)?)/);
  if (theMatch) {
    return formatRoomName(theMatch[1]);
  }

  return null;
}

/**
 * Format room name to consistent case
 */
function formatRoomName(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================
// WALL POSITION PARSING
// ============================================

/**
 * Parse wall position (left/center/right or feet measurement)
 */
export function parseWallPosition(text: string): WallPosition | null {
  if (!text) return null;
  const normalized = text.toLowerCase().trim();

  if (normalized === 'left' || normalized.includes('left')) return 'LEFT';
  if (normalized === 'center' || normalized.includes('center') || normalized.includes('middle')) return 'CENTER';
  if (normalized === 'right' || normalized.includes('right')) return 'RIGHT';

  // Try to parse as feet measurement
  const feet = parseDimensionToFeet(text);
  if (feet !== null) return feet;

  return null;
}

// ============================================
// MAIN PARSER
// ============================================

export interface ParserOptions {
  sessionId?: string;
  applyDefaults?: boolean;
  strictMode?: boolean;
}

/**
 * Parse voice input into normalized intent
 */
export function parseVoiceInput(
  rawText: string,
  options: ParserOptions = {}
): NormalizedIntent {
  const { sessionId, applyDefaults = true } = options;
  const inferenceLog: InferenceLogEntry[] = [];
  const timestamp = new Date().toISOString();

  const text = rawText.toLowerCase().trim();

  // Try each intent pattern
  let intent: NormalizedIntent;

  // CREATE_ROOM patterns
  if (matchesCreateRoom(text)) {
    intent = parseCreateRoom(text, inferenceLog, applyDefaults);
  }
  // PLACE_ROOM_RELATIVE patterns
  else if (matchesPlaceRoomRelative(text)) {
    intent = parsePlaceRoomRelative(text, inferenceLog);
  }
  // ADD_OPENING patterns
  else if (matchesAddOpening(text)) {
    intent = parseAddOpening(text, inferenceLog, applyDefaults);
  }
  // ADD_FEATURE patterns
  else if (matchesAddFeature(text)) {
    intent = parseAddFeature(text, inferenceLog, applyDefaults);
  }
  // CONNECT_ROOMS patterns
  else if (matchesConnectRooms(text)) {
    intent = parseConnectRooms(text, inferenceLog);
  }
  // MARK_DAMAGE patterns
  else if (matchesMarkDamage(text)) {
    intent = parseMarkDamage(text, inferenceLog, applyDefaults);
  }
  // SET_SHAPE patterns
  else if (matchesSetShape(text)) {
    intent = parseSetShape(text, inferenceLog);
  }
  // MODIFY_DIMENSION patterns
  else if (matchesModifyDimension(text)) {
    intent = parseModifyDimension(text, inferenceLog);
  }
  // UNDO patterns
  else if (matchesUndo(text)) {
    intent = parseUndo(text, inferenceLog);
  }
  // CONFIRM patterns
  else if (matchesConfirm(text)) {
    intent = parseConfirm(text, inferenceLog);
  }
  // Unknown
  else {
    intent = {
      intent: 'UNKNOWN',
      confidence: 0.3,
      rawText,
      timestamp,
      inferenceLog,
      possibleIntents: suggestPossibleIntents(text),
      suggestion: 'Try using a more specific phrase like "Create a 12 by 15 kitchen"',
    } as UnknownIntent;
  }

  // Add common fields
  intent.rawText = rawText;
  intent.timestamp = timestamp;
  intent.sessionId = sessionId;
  intent.inferenceLog = inferenceLog;

  return intent;
}

// ============================================
// PATTERN MATCHERS
// ============================================

function matchesCreateRoom(text: string): boolean {
  return (
    text.includes('create') ||
    text.includes('new room') ||
    text.includes('start') ||
    /\d+\s*(?:by|x)\s*\d+/.test(text) ||
    text.includes(' is ') && /\d+/.test(text)
  );
}

function matchesPlaceRoomRelative(text: string): boolean {
  return (
    (text.includes('place') && (text.includes(' of ') || text.includes(' next to '))) ||
    (text.includes(' is ') && text.includes(' of the ')) ||
    text.includes('goes ') && text.includes(' of ')
  );
}

function matchesAddOpening(text: string): boolean {
  return (
    (text.includes('add') || text.includes('put')) &&
    (text.includes('door') || text.includes('window') || text.includes('archway'))
  ) || (
    /\d+\s*(?:foot|feet|ft|')?\s*(?:door|window)/.test(text)
  );
}

function matchesAddFeature(text: string): boolean {
  const featureTerms = ['closet', 'pantry', 'alcove', 'island', 'peninsula', 'fireplace', 'built-in'];
  return featureTerms.some(term =>
    text.includes(term) && (text.includes('add') || text.includes('there is') || text.includes('has'))
  );
}

function matchesConnectRooms(text: string): boolean {
  return (
    text.includes('connect') ||
    (text.includes('between') && (text.includes('door') || text.includes('opening')))
  );
}

function matchesMarkDamage(text: string): boolean {
  const damageTerms = ['water damage', 'fire damage', 'smoke damage', 'mold', 'wind damage', 'damage'];
  return damageTerms.some(term => text.includes(term)) ||
    (text.includes('affected') && text.includes('wall'));
}

function matchesSetShape(text: string): boolean {
  return (
    (text.includes('is ') || text.includes('make it')) &&
    (text.includes('l-shape') || text.includes('l shape') || text.includes('t-shape') ||
     text.includes('t shape') || text.includes('rectangular') || text.includes('irregular'))
  );
}

function matchesModifyDimension(text: string): boolean {
  return (
    (text.includes('make') || text.includes('change') || text.includes('set')) &&
    (text.includes('width') || text.includes('length') || text.includes('height') || text.includes('ceiling'))
  );
}

function matchesUndo(text: string): boolean {
  return text.includes('undo') || text.includes('go back') || text.includes('reverse');
}

function matchesConfirm(text: string): boolean {
  return text.includes('confirm') || text.includes('done') || text.includes('finished') ||
    text.includes('next room') || text.includes('that\'s it');
}

// ============================================
// INTENT PARSERS
// ============================================

function parseCreateRoom(
  text: string,
  inferenceLog: InferenceLogEntry[],
  applyDefaults: boolean
): CreateRoomIntent {
  // Extract dimensions: "12 by 15", "12x15", "12 feet by 15 feet"
  const dimMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*(?:by|x)\s*(\d+(?:\.\d+)?)/i);
  let widthFt = dimMatch ? parseFloat(dimMatch[1]) : 10;
  let lengthFt = dimMatch ? parseFloat(dimMatch[2]) : 10;

  if (!dimMatch && applyDefaults) {
    inferenceLog.push({
      field: 'dimensions',
      inferredValue: { widthFt: 10, lengthFt: 10 },
      reason: 'No dimensions specified, using default 10x10',
      confidence: 0.5,
      reversible: true,
    });
  }

  // Extract ceiling height: "9 foot ceiling", "with a 10' ceiling"
  const ceilingMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*ceiling/i);
  let ceilingHeightFt = ceilingMatch
    ? parseFloat(ceilingMatch[1])
    : GRAMMAR_DEFAULTS.ceilingHeightFt;

  if (!ceilingMatch) {
    inferenceLog.push({
      field: 'ceilingHeightFt',
      inferredValue: GRAMMAR_DEFAULTS.ceilingHeightFt,
      reason: 'No ceiling height specified, using default 8ft',
      confidence: 0.7,
      reversible: true,
    });
  }

  // Extract room name
  let roomName = extractRoomName(text);
  if (!roomName) {
    roomName = 'Room';
    inferenceLog.push({
      field: 'roomName',
      inferredValue: 'Room',
      reason: 'No room name detected, using generic name',
      confidence: 0.4,
      reversible: true,
    });
  }

  // Detect shape from text
  let shape: ShapeType = 'RECT';
  for (const [alias, shapeType] of Object.entries(SHAPE_ALIASES)) {
    if (text.includes(alias)) {
      shape = shapeType;
      break;
    }
  }

  if (shape === 'RECT' && !text.includes('rect')) {
    inferenceLog.push({
      field: 'shape',
      inferredValue: 'RECT',
      reason: 'No shape specified, assuming rectangular',
      confidence: 0.8,
      reversible: true,
    });
  }

  return {
    intent: 'CREATE_ROOM',
    confidence: dimMatch ? 0.9 : 0.6,
    roomName,
    dimensions: {
      widthFt,
      lengthFt,
      ceilingHeightFt,
    },
    shape,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parsePlaceRoomRelative(
  text: string,
  inferenceLog: InferenceLogEntry[]
): PlaceRoomRelativeIntent {
  // Extract room name and relative room
  const patterns = [
    /place\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(north|south|east|west|left|right)\s+of\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i,
    /(?:the\s+)?(\w+(?:\s+\w+)?)\s+is\s+(north|south|east|west)\s+of\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i,
    /(\w+(?:\s+\w+)?)\s+goes\s+(north|south|east|west)\s+of\s+(\w+(?:\s+\w+)?)/i,
  ];

  let roomName = 'Room';
  let relativeTo = 'Previous Room';
  let direction: CardinalDirection = 'EAST';

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      roomName = formatRoomName(match[1]);
      direction = normalizeDirection(match[2]) || 'EAST';
      relativeTo = formatRoomName(match[3]);
      break;
    }
  }

  return {
    intent: 'PLACE_ROOM_RELATIVE',
    confidence: 0.85,
    roomName,
    relativeTo,
    direction,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseAddOpening(
  text: string,
  inferenceLog: InferenceLogEntry[],
  applyDefaults: boolean
): AddOpeningIntent {
  // Detect opening type
  let openingType: OpeningType = 'DOOR';
  for (const [alias, type] of Object.entries(OPENING_TYPE_ALIASES)) {
    if (text.includes(alias)) {
      openingType = type;
      break;
    }
  }

  // Extract width
  const widthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*(?:wide|door|window)/i);
  let widthFt = widthMatch
    ? parseFloat(widthMatch[1])
    : (openingType === 'WINDOW' ? GRAMMAR_DEFAULTS.windowWidthFt : GRAMMAR_DEFAULTS.doorWidthFt);

  if (!widthMatch) {
    inferenceLog.push({
      field: 'widthFt',
      inferredValue: widthFt,
      reason: `No width specified, using default ${widthFt}ft for ${openingType.toLowerCase()}`,
      confidence: 0.7,
      reversible: true,
    });
  }

  // Extract wall
  let wall: CardinalDirection = 'NORTH';
  for (const [alias, dir] of Object.entries(DIRECTION_ALIASES)) {
    if (text.includes(alias + ' wall') || text.includes('on the ' + alias)) {
      wall = dir;
      break;
    }
  }

  // Extract position
  let position: WallPosition = 'CENTER';
  const posMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:feet|ft|')?\s*from/i);
  if (posMatch) {
    position = parseFloat(posMatch[1]);
  } else if (text.includes('left')) {
    position = 'LEFT';
  } else if (text.includes('right')) {
    position = 'RIGHT';
  } else {
    inferenceLog.push({
      field: 'position',
      inferredValue: 'CENTER',
      reason: 'No position specified, centering opening on wall',
      confidence: 0.6,
      reversible: true,
    });
  }

  // Determine position reference
  let positionFrom: 'START' | 'END' = 'START';
  if (text.includes('from end') || text.includes('from the end') ||
      text.includes('from south') || text.includes('from east')) {
    positionFrom = 'END';
  }

  return {
    intent: 'ADD_OPENING',
    confidence: 0.85,
    openingType,
    wall,
    widthFt,
    position,
    positionFrom,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseAddFeature(
  text: string,
  inferenceLog: InferenceLogEntry[],
  applyDefaults: boolean
): AddFeatureIntent {
  // Detect feature type
  let featureType: FeatureType = 'CLOSET';
  for (const [alias, type] of Object.entries(FEATURE_TYPE_ALIASES)) {
    if (text.includes(alias)) {
      featureType = type;
      break;
    }
  }

  // Extract wall
  let wall: CardinalDirection | 'FREESTANDING' = 'EAST';
  if (featureType === 'ISLAND' || featureType === 'PENINSULA') {
    wall = 'FREESTANDING';
  } else {
    for (const [alias, dir] of Object.entries(DIRECTION_ALIASES)) {
      if (text.includes(alias + ' wall') || text.includes('on the ' + alias)) {
        wall = dir;
        break;
      }
    }
  }

  // Extract dimensions
  const widthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*wide/i);
  const depthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*deep/i);

  let widthFt = widthMatch ? parseFloat(widthMatch[1]) : 4;
  let depthFt = depthMatch ? parseFloat(depthMatch[1]) : GRAMMAR_DEFAULTS.closetDepthFt;

  if (!widthMatch) {
    inferenceLog.push({
      field: 'widthFt',
      inferredValue: widthFt,
      reason: 'No width specified, using default 4ft',
      confidence: 0.6,
      reversible: true,
    });
  }

  if (!depthMatch) {
    inferenceLog.push({
      field: 'depthFt',
      inferredValue: depthFt,
      reason: 'No depth specified, using default 2ft',
      confidence: 0.6,
      reversible: true,
    });
  }

  return {
    intent: 'ADD_FEATURE',
    confidence: 0.8,
    featureType,
    wall,
    widthFt,
    depthFt,
    position: 'CENTER',
    positionFrom: 'START',
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseConnectRooms(
  text: string,
  inferenceLog: InferenceLogEntry[]
): ConnectRoomsIntent {
  // Extract room names
  const connectMatch = text.match(/connect\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:to|and|with)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i);
  const betweenMatch = text.match(/between\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+and\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i);

  let fromRoom = 'Room 1';
  let toRoom = 'Room 2';

  if (connectMatch) {
    fromRoom = formatRoomName(connectMatch[1]);
    toRoom = formatRoomName(connectMatch[2]);
  } else if (betweenMatch) {
    fromRoom = formatRoomName(betweenMatch[1]);
    toRoom = formatRoomName(betweenMatch[2]);
  }

  // Detect connection type
  let connectionType: 'DOOR' | 'ARCHWAY' | 'HALLWAY' | 'STAIRWAY' | 'OPENING' = 'DOOR';
  if (text.includes('archway') || text.includes('arch')) {
    connectionType = 'ARCHWAY';
  } else if (text.includes('hallway') || text.includes('hall')) {
    connectionType = 'HALLWAY';
  } else if (text.includes('stair')) {
    connectionType = 'STAIRWAY';
  } else if (text.includes('opening') && !text.includes('door')) {
    connectionType = 'OPENING';
  }

  return {
    intent: 'CONNECT_ROOMS',
    confidence: 0.8,
    fromRoom,
    toRoom,
    connectionType,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseMarkDamage(
  text: string,
  inferenceLog: InferenceLogEntry[],
  applyDefaults: boolean
): MarkDamageIntent {
  // Detect damage type
  let damageType: DamageType = 'WATER';
  for (const [alias, type] of Object.entries(DAMAGE_TYPE_ALIASES)) {
    if (text.includes(alias)) {
      damageType = type;
      break;
    }
  }

  // Extract affected walls
  const affectedWalls: CardinalDirection[] = [];
  for (const [alias, dir] of Object.entries(DIRECTION_ALIASES)) {
    if (text.includes(alias + ' wall') || text.includes(alias + ' and')) {
      if (!affectedWalls.includes(dir)) {
        affectedWalls.push(dir);
      }
    }
  }

  if (affectedWalls.length === 0) {
    affectedWalls.push('NORTH');
    inferenceLog.push({
      field: 'affectedWalls',
      inferredValue: ['NORTH'],
      reason: 'No walls specified, defaulting to north wall',
      confidence: 0.4,
      reversible: true,
    });
  }

  // Extract extent
  const extentMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?\s*(?:extent|from|out)/i);
  const extentFt = extentMatch
    ? parseFloat(extentMatch[1])
    : GRAMMAR_DEFAULTS.damageExtentFt;

  if (!extentMatch) {
    inferenceLog.push({
      field: 'extentFt',
      inferredValue: GRAMMAR_DEFAULTS.damageExtentFt,
      reason: 'No extent specified, using default 2ft',
      confidence: 0.6,
      reversible: true,
    });
  }

  // Extract category for water damage
  let category: IICRCCategory | undefined;
  if (damageType === 'WATER') {
    const catMatch = text.match(/category\s*(\d)/i);
    if (catMatch && ['1', '2', '3'].includes(catMatch[1])) {
      category = catMatch[1] as IICRCCategory;
    }
  }

  // Floor/ceiling affected
  const floorAffected = !text.includes('no floor') && !text.includes('floor not');
  const ceilingAffected = text.includes('ceiling');

  return {
    intent: 'MARK_DAMAGE',
    confidence: 0.8,
    damageType,
    category,
    affectedWalls,
    floorAffected,
    ceilingAffected,
    extentFt,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseSetShape(
  text: string,
  inferenceLog: InferenceLogEntry[]
): SetShapeIntent {
  let shape: ShapeType = 'RECT';
  for (const [alias, shapeType] of Object.entries(SHAPE_ALIASES)) {
    if (text.includes(alias)) {
      shape = shapeType;
      break;
    }
  }

  const roomName = extractRoomName(text);

  return {
    intent: 'SET_SHAPE',
    confidence: 0.9,
    shape,
    roomName: roomName || undefined,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseModifyDimension(
  text: string,
  inferenceLog: InferenceLogEntry[]
): ModifyDimensionIntent {
  // Detect target
  let target = 'room_width';
  if (text.includes('length')) target = 'room_length';
  else if (text.includes('ceiling') || text.includes('height')) target = 'ceiling_height';

  // Extract new value
  const valueMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:foot|feet|ft|')?/i);
  const newValueFt = valueMatch ? parseFloat(valueMatch[1]) : 10;

  return {
    intent: 'MODIFY_DIMENSION',
    confidence: 0.85,
    target,
    newValueFt,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseUndo(
  text: string,
  inferenceLog: InferenceLogEntry[]
): NormalizedIntent {
  const stepsMatch = text.match(/(\d+)\s*(?:times|steps)/i);
  const steps = stepsMatch ? parseInt(stepsMatch[1], 10) : 1;

  return {
    intent: 'UNDO',
    confidence: 0.95,
    steps,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

function parseConfirm(
  text: string,
  inferenceLog: InferenceLogEntry[]
): NormalizedIntent {
  const readyForNext = text.includes('next') || text.includes('another');

  return {
    intent: 'CONFIRM_ROOM',
    confidence: 0.9,
    readyForNext,
    rawText: text,
    timestamp: new Date().toISOString(),
    inferenceLog,
  };
}

// ============================================
// SUGGESTIONS
// ============================================

function suggestPossibleIntents(text: string): NormalizedIntent['intent'][] {
  const suggestions: NormalizedIntent['intent'][] = [];

  if (/\d+/.test(text)) {
    suggestions.push('CREATE_ROOM', 'MODIFY_DIMENSION', 'ADD_OPENING');
  }
  if (text.includes('room') || text.includes('kitchen') || text.includes('bedroom')) {
    suggestions.push('CREATE_ROOM', 'PLACE_ROOM_RELATIVE');
  }
  if (text.includes('wall')) {
    suggestions.push('ADD_OPENING', 'ADD_FEATURE', 'MARK_DAMAGE');
  }

  return suggestions.length > 0 ? suggestions : ['CREATE_ROOM'];
}
