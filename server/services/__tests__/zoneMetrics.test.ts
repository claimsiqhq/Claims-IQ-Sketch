/**
 * Zone Metrics Tests
 *
 * Unit tests for zone metric computation.
 * Run with: npx vitest run server/services/__tests__/zoneMetrics.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  computeZoneMetrics,
  getMetricValue,
  DEFAULT_HEIGHT_FEET,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
} from '../zoneMetrics';

describe('ZoneMetrics', () => {
  describe('computeZoneMetrics', () => {
    it('computes basic rectangular room metrics', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-1',
        zoneType: 'room',
        lengthFt: 12,
        widthFt: 10,
        heightFt: 8,
      };

      const metrics = computeZoneMetrics(zone);

      expect(metrics.floorSquareFeet).toBe(120);
      expect(metrics.ceilingSquareFeet).toBe(120);
      expect(metrics.perimeterLinearFeet).toBe(44);
      expect(metrics.wallSquareFeet).toBe(352); // 44 * 8
      expect(metrics.heightFeet).toBe(8);
      expect(metrics.defaultHeightUsed).toBe(false);
      expect(metrics.computedFrom).toBe('dimensions');
    });

    it('uses default height when not specified', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-2',
        zoneType: 'room',
        lengthFt: 10,
        widthFt: 10,
        heightFt: null,
      };

      const metrics = computeZoneMetrics(zone);

      expect(metrics.heightFeet).toBe(DEFAULT_HEIGHT_FEET);
      expect(metrics.defaultHeightUsed).toBe(true);
    });

    it('deducts opening area from walls', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-3',
        zoneType: 'room',
        lengthFt: 10,
        widthFt: 10,
        heightFt: 8,
      };

      const missingWalls: MissingWallForMetrics[] = [
        { widthFt: 3, heightFt: 7, quantity: 1 }, // Door: 21 SF
        { widthFt: 4, heightFt: 3, quantity: 2 }, // 2 Windows: 24 SF
      ];

      const metrics = computeZoneMetrics(zone, missingWalls);

      expect(metrics.openingSquareFeet).toBe(45); // 21 + 24
      expect(metrics.openingCount).toBe(3);
      expect(metrics.wallSquareFeetNet).toBe(metrics.wallSquareFeet - 45);
    });

    it('adds/subtracts subroom areas', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-4',
        zoneType: 'room',
        lengthFt: 12,
        widthFt: 10,
        heightFt: 8,
      };

      const subrooms: SubroomForMetrics[] = [
        { lengthFt: 4, widthFt: 3, isAddition: false }, // Closet cut-out: -12 SF
        { lengthFt: 2, widthFt: 3, isAddition: true }, // Bay window add: +6 SF
      ];

      const metrics = computeZoneMetrics(zone, [], subrooms);

      expect(metrics.subroomNetSquareFeet).toBe(-6); // -12 + 6
      expect(metrics.floorSquareFeet).toBe(114); // 120 - 6
    });

    it('computes roof metrics with pitch multiplier', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-5',
        zoneType: 'roof',
        lengthFt: 40,
        widthFt: 25,
        pitch: '6/12',
      };

      const metrics = computeZoneMetrics(zone);

      expect(metrics.floorSquareFeet).toBe(1000);
      expect(metrics.roofPitchMultiplier).toBeCloseTo(1.118, 2);
      expect(metrics.roofSquareFeet).toBeCloseTo(1118, 0);
      expect(metrics.roofSquares).toBeCloseTo(11.18, 1);
    });

    it('returns empty metrics when no geometry', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-6',
        zoneType: 'room',
        lengthFt: null,
        widthFt: null,
      };

      const metrics = computeZoneMetrics(zone);

      expect(metrics.floorSquareFeet).toBe(0);
      expect(metrics.computedFrom).toBe('unknown');
    });
  });

  describe('getMetricValue', () => {
    it('resolves metric aliases', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-7',
        zoneType: 'room',
        lengthFt: 10,
        widthFt: 10,
        heightFt: 8,
      };

      const metrics = computeZoneMetrics(zone);

      expect(getMetricValue(metrics, 'FLOOR_SF')).toBe(100);
      expect(getMetricValue(metrics, 'WALL_SF')).toBe(320);
      expect(getMetricValue(metrics, 'PERIMETER_LF')).toBe(40);
      expect(getMetricValue(metrics, 'HEIGHT_FT')).toBe(8);
    });

    it('returns 0 for unknown metrics', () => {
      const zone: ZoneForMetrics = {
        id: 'test-zone-8',
        zoneType: 'room',
        lengthFt: 10,
        widthFt: 10,
      };

      const metrics = computeZoneMetrics(zone);

      expect(getMetricValue(metrics, 'UNKNOWN_METRIC')).toBe(0);
    });
  });
});
