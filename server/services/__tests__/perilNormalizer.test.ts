/**
 * Peril Normalizer Tests
 *
 * Unit tests for the peril normalization system.
 * Run with: npx vitest run server/services/__tests__/perilNormalizer.test.ts
 *
 * These tests verify:
 * 1. Invalid peril values fail normalization (map to 'other')
 * 2. Unknown peril maps to 'unknown' (actually 'other' in our implementation)
 * 3. Downstream logic never consumes free-text peril
 * 4. Peril conflicts are properly detected and flagged
 * 5. Guardrails prevent peril re-derivation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Peril } from '../../../shared/schema';
import {
  validatePerilCode,
  normalizePerilFromFnol,
  guardAgainstPerilRederivation,
  checkInspectionPerilConflict,
  getCanonicalPerilCode,
  inferPeril,
  VALID_PERIL_CODES,
  type PerilInferenceResult,
  type NormalizedPerilContext,
} from '../perilNormalizer';

// ============================================
// PART 5 - TESTS / VALIDATION
// ============================================

describe('Peril Normalization System', () => {
  // Capture console warnings for testing guardrails
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('validatePerilCode', () => {
    it('should validate known peril codes', () => {
      const result = validatePerilCode('water');
      expect(result.is_valid).toBe(true);
      expect(result.peril_code).toBe(Peril.WATER);
      expect(result.warning).toBeUndefined();
    });

    it('should validate all enum values', () => {
      for (const peril of Object.values(Peril)) {
        const result = validatePerilCode(peril);
        expect(result.is_valid).toBe(true);
        expect(result.peril_code).toBe(peril);
      }
    });

    it('should map unknown peril values to "other"', () => {
      const result = validatePerilCode('unknown_peril_xyz');
      expect(result.is_valid).toBe(false);
      expect(result.peril_code).toBe(Peril.OTHER);
      expect(result.warning).toContain('Unknown peril code');
    });

    it('should map empty/null values to "other"', () => {
      expect(validatePerilCode(null).peril_code).toBe(Peril.OTHER);
      expect(validatePerilCode(undefined).peril_code).toBe(Peril.OTHER);
      expect(validatePerilCode('').peril_code).toBe(Peril.OTHER);
    });

    it('should normalize common variations', () => {
      // Wind/Hail variations
      expect(validatePerilCode('Wind').peril_code).toBe(Peril.WIND_HAIL);
      expect(validatePerilCode('Hail').peril_code).toBe(Peril.WIND_HAIL);
      expect(validatePerilCode('Wind/Hail').peril_code).toBe(Peril.WIND_HAIL);

      // Fire variations
      expect(validatePerilCode('FIRE').peril_code).toBe(Peril.FIRE);
      expect(validatePerilCode('Fire Damage').peril_code).toBe(Peril.FIRE);

      // Water variations
      expect(validatePerilCode('Water Damage').peril_code).toBe(Peril.WATER);
      expect(validatePerilCode('WATER').peril_code).toBe(Peril.WATER);

      // Flood variations
      expect(validatePerilCode('Flood').peril_code).toBe(Peril.FLOOD);
    });

    it('should log warning for unknown peril codes', () => {
      validatePerilCode('totally_fake_peril');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown peril code')
      );
    });
  });

  describe('normalizePerilFromFnol', () => {
    it('should create canonical peril context from valid inference', () => {
      const inference: PerilInferenceResult = {
        primaryPeril: Peril.WATER,
        secondaryPerils: [Peril.MOLD],
        confidence: 0.85,
        perilMetadata: { water: { source: 'plumbing' } },
        inferenceReasoning: 'Matched "pipe burst" keywords',
      };

      const result = normalizePerilFromFnol(inference);

      expect(result.primary_peril_code).toBe(Peril.WATER);
      expect(result.secondary_peril_codes).toContain(Peril.MOLD);
      expect(result.peril_confidence).toBe(0.85);
      expect(result.is_valid).toBe(true);
      expect(result.peril_conflicts).toHaveLength(0);
      expect(result.inference_reasoning).toBe('Matched "pipe burst" keywords');
    });

    it('should preserve raw values for audit trail', () => {
      const inference: PerilInferenceResult = {
        primaryPeril: Peril.FIRE,
        secondaryPerils: [Peril.SMOKE, Peril.WATER],
        confidence: 0.75,
        perilMetadata: {},
        inferenceReasoning: 'Test',
      };

      const result = normalizePerilFromFnol(inference);

      expect(result.raw_values.primary_peril).toBe(Peril.FIRE);
      expect(result.raw_values.secondary_perils).toEqual([Peril.SMOKE, Peril.WATER]);
    });

    it('should deduplicate secondary perils', () => {
      const inference: PerilInferenceResult = {
        primaryPeril: Peril.FIRE,
        secondaryPerils: [Peril.SMOKE, Peril.SMOKE, Peril.WATER, Peril.WATER],
        confidence: 0.80,
        perilMetadata: {},
        inferenceReasoning: 'Test',
      };

      const result = normalizePerilFromFnol(inference);

      expect(result.secondary_peril_codes).toHaveLength(2);
      expect(result.secondary_peril_codes).toContain(Peril.SMOKE);
      expect(result.secondary_peril_codes).toContain(Peril.WATER);
    });

    it('should remove primary from secondary perils', () => {
      const inference: PerilInferenceResult = {
        primaryPeril: Peril.FIRE,
        secondaryPerils: [Peril.FIRE, Peril.SMOKE], // Primary included in secondary
        confidence: 0.80,
        perilMetadata: {},
        inferenceReasoning: 'Test',
      };

      const result = normalizePerilFromFnol(inference);

      expect(result.secondary_peril_codes).not.toContain(Peril.FIRE);
      expect(result.secondary_peril_codes).toContain(Peril.SMOKE);
    });
  });

  describe('guardAgainstPerilRederivation', () => {
    it('should return existing peril when canonical peril exists', () => {
      const result = guardAgainstPerilRederivation(
        Peril.WATER,
        'legacy causeOfLoss field',
        'claim-123'
      );

      expect(result.peril).toBe(Peril.WATER);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.source).toBe('ai_inference');
      expect(result.conflict?.status).toBe('resolved');
    });

    it('should log warning when blocking re-derivation', () => {
      guardAgainstPerilRederivation(
        Peril.FIRE,
        'lossDescription text',
        'claim-456'
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Blocked peril re-derivation')
      );
    });

    it('should return OTHER when no existing peril (initial derivation allowed)', () => {
      const result = guardAgainstPerilRederivation(
        null,
        'initial extraction'
      );

      expect(result.peril).toBe(Peril.OTHER);
      expect(result.conflict).toBeUndefined();
    });
  });

  describe('checkInspectionPerilConflict', () => {
    it('should detect no conflict when perils match', () => {
      const result = checkInspectionPerilConflict(
        Peril.WATER,
        Peril.WATER,
        'Found water damage from pipe',
        'claim-123'
      );

      expect(result.has_conflict).toBe(false);
      expect(result.fnol_peril).toBe(Peril.WATER);
      expect(result.action).toBe('none');
      expect(result.conflict).toBeUndefined();
    });

    it('should detect conflict when inspection peril differs from FNOL', () => {
      const result = checkInspectionPerilConflict(
        Peril.WATER,
        Peril.FLOOD,
        'Evidence of rising water, not pipe failure',
        'claim-123'
      );

      expect(result.has_conflict).toBe(true);
      expect(result.fnol_peril).toBe(Peril.WATER);
      expect(result.inspection_peril).toBe(Peril.FLOOD);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.requires_review).toBe(true);
      expect(result.conflict?.status).toBe('pending');
    });

    it('should escalate when flood vs non-flood conflict detected', () => {
      const result = checkInspectionPerilConflict(
        Peril.WATER,
        Peril.FLOOD,
        'Evidence of rising water',
        'claim-123'
      );

      expect(result.action).toBe('escalate');
    });

    it('should escalate when fire vs non-fire conflict detected', () => {
      const result = checkInspectionPerilConflict(
        Peril.SMOKE,
        Peril.FIRE,
        'Found fire origin, not just smoke migration',
        'claim-123'
      );

      expect(result.action).toBe('escalate');
    });

    it('should flag for review on less significant conflicts', () => {
      const result = checkInspectionPerilConflict(
        Peril.WIND_HAIL,
        Peril.IMPACT,
        'Damage from tree impact, not wind/hail',
        'claim-123'
      );

      expect(result.action).toBe('flag_for_review');
    });

    it('should log warning when conflict detected', () => {
      checkInspectionPerilConflict(
        Peril.WATER,
        Peril.MOLD,
        'Found mold growth',
        'claim-789'
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PerilConflict]')
      );
    });
  });

  describe('getCanonicalPerilCode', () => {
    it('should return validated peril code for valid input', () => {
      expect(getCanonicalPerilCode('water')).toBe(Peril.WATER);
      expect(getCanonicalPerilCode('fire')).toBe(Peril.FIRE);
      expect(getCanonicalPerilCode('wind_hail')).toBe(Peril.WIND_HAIL);
    });

    it('should return OTHER for invalid input', () => {
      expect(getCanonicalPerilCode('invalid')).toBe(Peril.OTHER);
      expect(getCanonicalPerilCode(null)).toBe(Peril.OTHER);
      expect(getCanonicalPerilCode(undefined)).toBe(Peril.OTHER);
    });
  });

  describe('VALID_PERIL_CODES constant', () => {
    it('should contain all Peril enum values', () => {
      for (const peril of Object.values(Peril)) {
        expect(VALID_PERIL_CODES.has(peril)).toBe(true);
      }
    });

    it('should not contain invalid values', () => {
      expect(VALID_PERIL_CODES.has('invalid')).toBe(false);
      expect(VALID_PERIL_CODES.has('unknown')).toBe(false);
      expect(VALID_PERIL_CODES.has('earthquake')).toBe(false);
    });
  });

  describe('inferPeril - existing function integration', () => {
    it('should return valid Peril enum for water damage', () => {
      const result = inferPeril({
        causeOfLoss: 'Water damage from pipe burst',
        lossDescription: 'Pipe burst in bathroom causing water damage',
      });

      expect(result.primaryPeril).toBe(Peril.WATER);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return OTHER for empty input', () => {
      const result = inferPeril({
        causeOfLoss: '',
        lossDescription: '',
      });

      expect(result.primaryPeril).toBe(Peril.OTHER);
    });

    it('should work with normalizePerilFromFnol', () => {
      const inference = inferPeril({
        causeOfLoss: 'Fire',
        lossDescription: 'Kitchen fire from cooking accident',
      });

      const normalized = normalizePerilFromFnol(inference);

      expect(normalized.primary_peril_code).toBe(Peril.FIRE);
      expect(normalized.is_valid).toBe(true);
    });
  });
});

describe('Downstream Logic Validation', () => {
  it('downstream code should use primary_peril_code, not free-text', () => {
    // This test documents the expected pattern for downstream consumers
    const mockClaim = {
      id: 'claim-123',
      primary_peril: 'water', // Canonical peril code from FNOL normalization
      loss_description: 'Pipe burst causing water damage', // Free-text, should NOT be used for logic
    };

    // CORRECT: Use canonical peril code for logic
    const perilCode = getCanonicalPerilCode(mockClaim.primary_peril);
    expect(perilCode).toBe(Peril.WATER);

    // Pattern validation: downstream logic should look like this
    const shouldUseWaterFlow = perilCode === Peril.WATER;
    expect(shouldUseWaterFlow).toBe(true);

    // Anti-pattern: NEVER do this
    // if (mockClaim.loss_description.includes('water')) { ... }
    // This would re-derive peril from text
  });
});
