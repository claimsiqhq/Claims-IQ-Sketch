/**
 * Voice Grammar Module
 *
 * Provides constrained grammar layer for voice-first sketch creation.
 * This module sits BEFORE intent execution and normalizes all inputs
 * to canonical form.
 *
 * Exports:
 * - Types for normalized intents and grammar constructs
 * - Parser for converting raw voice to normalized intents
 * - Inference engine for auto-completion and smart defaults
 * - Adjacency reasoning for geometry intelligence
 */

// Types
export * from './types';

// Parser
export {
  parseVoiceInput,
  parseDimension,
  parseDimensionToFeet,
  parseDirection,
  normalizeDirection,
  parseShape,
  parseOpeningType,
  parseFeatureType,
  parseDamageType,
  extractRoomName,
  parseWallPosition,
} from './parser';

export type { ParserOptions } from './parser';

// Inference Engine
export {
  applyInferences,
  suggestRoomPosition,
  validateInference,
  formatInferenceLog,
  summarizeInferences,
  ROOM_TYPE_PROFILES,
} from './inference-engine';

export type {
  RoomTypeProfile,
  InferenceContext,
} from './inference-engine';

// Adjacency Reasoning
export {
  calculateRoomBounds,
  getWallSegments,
  calculateRelativePosition,
  snapToGrid,
  detectAdjacencies,
  checkOverlap,
  suggestOptimalPlacement,
  suggestOpeningPosition,
  analyzeLayout,
} from './adjacency-reasoning';

export type {
  RoomBounds,
  WallSegment,
  AdjacencyRelationship,
  PlacementSuggestion,
  OverlapResult,
} from './adjacency-reasoning';

// Audit Trail
export {
  auditTrail,
  formatAuditRecord,
  formatAuditSummary,
} from './audit-trail';

export type {
  AuditRecord,
  ReversalRecord,
  AuditSummary,
} from './audit-trail';

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

import type { NormalizedIntent, InferenceLogEntry } from './types';
import { parseVoiceInput, type ParserOptions } from './parser';
import { applyInferences, type InferenceContext } from './inference-engine';

/**
 * Process voice input through the full grammar pipeline
 *
 * 1. Parse raw voice to normalized intent
 * 2. Apply inference engine for smart defaults
 * 3. Return intent with audit trail
 */
export function processVoiceInput(
  rawText: string,
  context: InferenceContext = { existingRooms: [] },
  options: ParserOptions = {}
): NormalizedIntent {
  // Parse the raw text
  const parsedIntent = parseVoiceInput(rawText, options);

  // Apply inference engine
  const enhancedIntent = applyInferences(parsedIntent, context);

  return enhancedIntent;
}

/**
 * Get a human-readable summary of what was inferred
 */
export function getInferenceSummary(intent: NormalizedIntent): string {
  const log = intent.inferenceLog;
  if (log.length === 0) {
    return 'No inferences were applied - all values were explicitly specified.';
  }

  const lines = [
    `Intent: ${intent.intent}`,
    `Confidence: ${Math.round(intent.confidence * 100)}%`,
    '',
    'Inferred values:',
  ];

  for (const entry of log) {
    const value = typeof entry.inferredValue === 'object'
      ? JSON.stringify(entry.inferredValue)
      : String(entry.inferredValue);
    lines.push(`  - ${entry.field}: ${value}`);
    lines.push(`    Reason: ${entry.reason}`);
    lines.push(`    Reversible: ${entry.reversible ? 'Yes' : 'No'}`);
  }

  return lines.join('\n');
}

/**
 * Check if an intent has any low-confidence inferences
 */
export function hasLowConfidenceInferences(
  intent: NormalizedIntent,
  threshold: number = 0.5
): boolean {
  return intent.inferenceLog.some(entry => entry.confidence < threshold);
}

/**
 * Get warnings for inferences that should be verified
 */
export function getInferenceWarnings(intent: NormalizedIntent): string[] {
  const warnings: string[] = [];

  for (const entry of intent.inferenceLog) {
    if (entry.confidence < 0.6) {
      warnings.push(
        `Low confidence (${Math.round(entry.confidence * 100)}%) inference for ${entry.field}: ${entry.reason}`
      );
    }
  }

  if (intent.confidence < 0.7) {
    warnings.push(
      `Overall intent confidence is low (${Math.round(intent.confidence * 100)}%). ` +
      'Consider rephrasing the command.'
    );
  }

  return warnings;
}
