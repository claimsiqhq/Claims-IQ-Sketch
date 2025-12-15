/**
 * Quantity Engine Tests
 *
 * Unit tests for safe formula parsing and quantity calculation.
 * Run with: npx vitest run server/services/__tests__/quantityEngine.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  calculateQuantityFromMetrics,
  validateFormula,
  getAvailableMetrics,
  getAvailableFunctions,
} from '../quantityEngine';
import { computeZoneMetrics, ZoneMetrics } from '../zoneMetrics';

// Helper to create a standard test metrics object
function createTestMetrics(): ZoneMetrics {
  return computeZoneMetrics({
    id: 'test',
    zoneType: 'room',
    lengthFt: 12,
    widthFt: 10,
    heightFt: 8,
  });
}

describe('QuantityEngine', () => {
  describe('calculateQuantityFromMetrics', () => {
    it('evaluates simple metric reference', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('FLOOR_SF(zone)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(120);
      expect(result.source).toBe('formula');
    });

    it('evaluates metric with multiplier', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('WALL_SF(zone) * 1.05', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBeCloseTo(352 * 1.05, 2);
    });

    it('evaluates addition of metrics', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('FLOOR_SF(zone) + CEILING_SF(zone)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(240); // 120 + 120
    });

    it('evaluates perimeter formula', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('PERIMETER_LF(zone)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(44);
    });

    it('evaluates MAX function', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('MAX(FLOOR_SF(zone), 200)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(200); // MAX(120, 200) = 200
    });

    it('evaluates MIN function', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('MIN(FLOOR_SF(zone), 200)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(120); // MIN(120, 200) = 120
    });

    it('evaluates CEIL function', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('CEIL(FLOOR_SF(zone) / 9)', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(14); // CEIL(120/9) = CEIL(13.33) = 14
    });

    it('evaluates complex formula', () => {
      const metrics = createTestMetrics();
      // 1 dehu per 500 SF, minimum 3 days
      const result = calculateQuantityFromMetrics('MAX(3, CEIL(FLOOR_SF(zone) / 500))', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(3); // MAX(3, 1) = 3
    });

    it('handles division by zero gracefully', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('FLOOR_SF(zone) / 0', metrics);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(0);
      expect(result.warnings).toContain('Division by zero, using 0');
    });

    it('handles empty formula', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('', metrics);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty formula');
    });

    it('provides breakdown of values used', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('FLOOR_SF(zone) + WALL_SF(zone)', metrics);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown!['FLOOR_SF']).toBe(120);
      expect(result.breakdown!['WALL_SF']).toBe(352);
    });

    it('includes explanation', () => {
      const metrics = createTestMetrics();
      const result = calculateQuantityFromMetrics('FLOOR_SF(zone) * 1.1', metrics);

      expect(result.explanation).toContain('Formula:');
      expect(result.explanation).toContain('FLOOR_SF');
    });
  });

  describe('validateFormula', () => {
    it('validates correct formula', () => {
      const result = validateFormula('FLOOR_SF(zone) * 1.05');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.referencedMetrics).toContain('FLOOR_SF');
    });

    it('detects unknown metric', () => {
      const result = validateFormula('UNKNOWN_METRIC(zone)');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown metric: UNKNOWN_METRIC');
    });

    it('detects unknown function', () => {
      const result = validateFormula('UNKNOWN_FUNC(FLOOR_SF(zone))');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown function: UNKNOWN_FUNC');
    });

    it('validates complex formula', () => {
      const result = validateFormula('MAX(FLOOR_SF(zone), MIN(WALL_SF(zone), 500))');

      expect(result.valid).toBe(true);
      expect(result.referencedMetrics).toContain('FLOOR_SF');
      expect(result.referencedMetrics).toContain('WALL_SF');
      expect(result.referencedFunctions).toContain('MAX');
      expect(result.referencedFunctions).toContain('MIN');
    });
  });

  describe('documentation helpers', () => {
    it('returns available metrics', () => {
      const metrics = getAvailableMetrics();

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.find(m => m.name === 'FLOOR_SF')).toBeDefined();
      expect(metrics.find(m => m.name === 'WALL_SF')).toBeDefined();
    });

    it('returns available functions', () => {
      const functions = getAvailableFunctions();

      expect(functions.length).toBeGreaterThan(0);
      expect(functions.find(f => f.name === 'MAX')).toBeDefined();
      expect(functions.find(f => f.name === 'MIN')).toBeDefined();
      expect(functions.find(f => f.name === 'CEIL')).toBeDefined();
    });
  });
});
