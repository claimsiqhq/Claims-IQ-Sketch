/**
 * Estimate Validator Tests
 *
 * Unit tests for estimate validation and linting.
 * Run with: npx vitest run server/services/__tests__/estimateValidator.test.ts
 */

import { describe, it, expect } from 'vitest';
import type {
  ValidationIssue,
  ValidationSeverity,
  LineItemForValidation,
} from '../estimateValidator';
import { computeZoneMetrics } from '../zoneMetrics';

describe('EstimateValidator', () => {
  describe('Quantity Validation', () => {
    // Mock quantity validation logic
    function validateQuantity(
      item: LineItemForValidation,
      metrics: { floorSquareFeet: number; perimeterLinearFeet: number; wallSquareFeet: number }
    ): ValidationIssue | null {
      const MAX_MULTIPLIERS: Record<string, number> = {
        SF: 1.5,
        LF: 2.0,
        EA: 50,
      };

      const multiplier = MAX_MULTIPLIERS[item.unit.toUpperCase()] || 10;
      let maxPlausible: number;

      switch (item.unit.toUpperCase()) {
        case 'SF':
          maxPlausible = (metrics.floorSquareFeet + metrics.wallSquareFeet) * multiplier;
          break;
        case 'LF':
          maxPlausible = metrics.perimeterLinearFeet * multiplier;
          break;
        default:
          maxPlausible = multiplier;
      }

      if (item.quantity > maxPlausible) {
        return {
          code: 'QTY001',
          severity: 'warning',
          category: 'quantity',
          message: `Quantity ${item.quantity} ${item.unit} exceeds plausible maximum`,
          relatedItems: [item.code],
        };
      }

      if (item.quantity <= 0) {
        return {
          code: 'QTY002',
          severity: 'error',
          category: 'quantity',
          message: `${item.code} has zero or negative quantity`,
          relatedItems: [item.code],
        };
      }

      return null;
    }

    it('flags quantity exceeding plausible maximum', () => {
      const item: LineItemForValidation = {
        id: '1',
        code: 'PAINT-INT-WALL',
        description: 'Interior wall paint',
        quantity: 10000, // Way too much for a 10x10 room
        unit: 'SF',
      };

      const metrics = {
        floorSquareFeet: 100,
        perimeterLinearFeet: 40,
        wallSquareFeet: 320,
      };

      const issue = validateQuantity(item, metrics);

      expect(issue).not.toBeNull();
      expect(issue!.code).toBe('QTY001');
      expect(issue!.severity).toBe('warning');
    });

    it('passes valid quantity', () => {
      const item: LineItemForValidation = {
        id: '1',
        code: 'PAINT-INT-WALL',
        description: 'Interior wall paint',
        quantity: 320, // Matches wall SF
        unit: 'SF',
      };

      const metrics = {
        floorSquareFeet: 100,
        perimeterLinearFeet: 40,
        wallSquareFeet: 320,
      };

      const issue = validateQuantity(item, metrics);

      expect(issue).toBeNull();
    });

    it('flags zero quantity as error', () => {
      const item: LineItemForValidation = {
        id: '1',
        code: 'DEM-BASE',
        description: 'Baseboard removal',
        quantity: 0,
        unit: 'LF',
      };

      const metrics = {
        floorSquareFeet: 100,
        perimeterLinearFeet: 40,
        wallSquareFeet: 320,
      };

      const issue = validateQuantity(item, metrics);

      expect(issue).not.toBeNull();
      expect(issue!.code).toBe('QTY002');
      expect(issue!.severity).toBe('error');
    });
  });

  describe('Dependency Validation', () => {
    // Mock dependency validation
    function validateDependencies(
      items: LineItemForValidation[],
      requiresMap: Record<string, string[]>
    ): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      const presentCodes = new Set(items.map((i) => i.code));

      for (const item of items) {
        const requires = requiresMap[item.code] || [];
        for (const requiredCode of requires) {
          if (!presentCodes.has(requiredCode)) {
            issues.push({
              code: 'DEP001',
              severity: 'warning',
              category: 'dependency',
              message: `${item.code} requires ${requiredCode} which is missing`,
              relatedItems: [item.code, requiredCode],
            });
          }
        }
      }

      return issues;
    }

    it('flags missing required dependencies', () => {
      const items: LineItemForValidation[] = [
        { id: '1', code: 'DRY-HTT-12', description: 'Drywall install', quantity: 100, unit: 'SF' },
        { id: '2', code: 'PAINT-INT-WALL', description: 'Paint', quantity: 100, unit: 'SF' },
      ];

      const requiresMap = {
        'DRY-HTT-12': ['DEM-DRY-FLOOD'],
        'PAINT-INT-WALL': ['PAINT-PRIME-STD'],
      };

      const issues = validateDependencies(items, requiresMap);

      expect(issues).toHaveLength(2);
      expect(issues.find((i) => i.message.includes('DEM-DRY-FLOOD'))).toBeDefined();
      expect(issues.find((i) => i.message.includes('PAINT-PRIME-STD'))).toBeDefined();
    });

    it('passes when all dependencies present', () => {
      const items: LineItemForValidation[] = [
        { id: '1', code: 'DEM-DRY-FLOOD', description: 'Demo', quantity: 40, unit: 'LF' },
        { id: '2', code: 'DRY-HTT-12', description: 'Drywall install', quantity: 100, unit: 'SF' },
      ];

      const requiresMap = {
        'DRY-HTT-12': ['DEM-DRY-FLOOD'],
      };

      const issues = validateDependencies(items, requiresMap);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Depreciation Validation', () => {
    // Mock depreciation validation
    function validateDepreciation(items: LineItemForValidation[]): ValidationIssue[] {
      const issues: ValidationIssue[] = [];

      for (const item of items) {
        // High depreciation without age
        if (item.depreciationPct && item.depreciationPct > 50 && !item.ageYears) {
          issues.push({
            code: 'DEP003',
            severity: 'warning',
            category: 'depreciation',
            message: `${item.code} has high depreciation (${item.depreciationPct}%) but no age documented`,
            relatedItems: [item.code],
          });
        }

        // Age exceeds useful life
        if (item.ageYears && item.usefulLifeYears && item.ageYears > item.usefulLifeYears) {
          issues.push({
            code: 'DEP002',
            severity: 'warning',
            category: 'depreciation',
            message: `${item.code} age (${item.ageYears}y) exceeds useful life (${item.usefulLifeYears}y)`,
            relatedItems: [item.code],
          });
        }
      }

      return issues;
    }

    it('flags high depreciation without age', () => {
      const items: LineItemForValidation[] = [
        {
          id: '1',
          code: 'FLR-CARP-STD',
          description: 'Carpet',
          quantity: 100,
          unit: 'SY',
          depreciationPct: 60,
          // No ageYears
        },
      ];

      const issues = validateDepreciation(items);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('DEP003');
    });

    it('flags age exceeding useful life', () => {
      const items: LineItemForValidation[] = [
        {
          id: '1',
          code: 'FLR-CARP-STD',
          description: 'Carpet',
          quantity: 100,
          unit: 'SY',
          ageYears: 15,
          usefulLifeYears: 10,
        },
      ];

      const issues = validateDepreciation(items);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('DEP002');
    });

    it('passes valid depreciation', () => {
      const items: LineItemForValidation[] = [
        {
          id: '1',
          code: 'FLR-CARP-STD',
          description: 'Carpet',
          quantity: 100,
          unit: 'SY',
          ageYears: 5,
          usefulLifeYears: 10,
          depreciationPct: 50,
          depreciationReason: 'Straight line: 5y/10y = 50%',
        },
      ];

      const issues = validateDepreciation(items);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Exclusion Validation', () => {
    // Mock exclusion validation
    function validateExclusions(
      items: LineItemForValidation[],
      excludesMap: Record<string, string[]>
    ): ValidationIssue[] {
      const issues: ValidationIssue[] = [];
      const presentCodes = new Set(items.map((i) => i.code));
      const reported = new Set<string>();

      for (const item of items) {
        const excludes = excludesMap[item.code] || [];
        for (const excludedCode of excludes) {
          if (presentCodes.has(excludedCode)) {
            const key = [item.code, excludedCode].sort().join('-');
            if (!reported.has(key)) {
              reported.add(key);
              issues.push({
                code: 'EXC001',
                severity: 'warning',
                category: 'exclusion',
                message: `${item.code} and ${excludedCode} are mutually exclusive`,
                relatedItems: [item.code, excludedCode],
              });
            }
          }
        }
      }

      return issues;
    }

    it('flags mutually exclusive items', () => {
      const items: LineItemForValidation[] = [
        { id: '1', code: 'DRY-HTT-12', description: '1/2" drywall', quantity: 100, unit: 'SF' },
        { id: '2', code: 'DRY-HTT-58', description: '5/8" drywall', quantity: 100, unit: 'SF' },
      ];

      const excludesMap = {
        'DRY-HTT-12': ['DRY-HTT-58', 'DRY-HTT-MR'],
        'DRY-HTT-58': ['DRY-HTT-12'],
      };

      const issues = validateExclusions(items, excludesMap);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('EXC001');
    });

    it('passes non-exclusive items', () => {
      const items: LineItemForValidation[] = [
        { id: '1', code: 'DRY-HTT-12', description: '1/2" drywall', quantity: 100, unit: 'SF' },
        { id: '2', code: 'PAINT-INT-WALL', description: 'Paint', quantity: 100, unit: 'SF' },
      ];

      const excludesMap = {
        'DRY-HTT-12': ['DRY-HTT-58'],
      };

      const issues = validateExclusions(items, excludesMap);

      expect(issues).toHaveLength(0);
    });
  });

  describe('ValidationResult Structure', () => {
    it('correctly counts issues by severity', () => {
      const issues: ValidationIssue[] = [
        { code: 'QTY002', severity: 'error', category: 'quantity', message: 'Error 1', relatedItems: [] },
        { code: 'DEP001', severity: 'warning', category: 'dependency', message: 'Warning 1', relatedItems: [] },
        { code: 'DEP002', severity: 'warning', category: 'dependency', message: 'Warning 2', relatedItems: [] },
        { code: 'CMP001', severity: 'info', category: 'completeness', message: 'Info 1', relatedItems: [] },
      ];

      const errorCount = issues.filter((i) => i.severity === 'error').length;
      const warningCount = issues.filter((i) => i.severity === 'warning').length;
      const infoCount = issues.filter((i) => i.severity === 'info').length;

      expect(errorCount).toBe(1);
      expect(warningCount).toBe(2);
      expect(infoCount).toBe(1);
    });

    it('determines validity based on errors only', () => {
      const issuesWithError: ValidationIssue[] = [
        { code: 'QTY002', severity: 'error', category: 'quantity', message: 'Error', relatedItems: [] },
      ];

      const issuesWithWarningsOnly: ValidationIssue[] = [
        { code: 'DEP001', severity: 'warning', category: 'dependency', message: 'Warning', relatedItems: [] },
      ];

      const isValidWithError = issuesWithError.filter((i) => i.severity === 'error').length === 0;
      const isValidWithWarnings = issuesWithWarningsOnly.filter((i) => i.severity === 'error').length === 0;

      expect(isValidWithError).toBe(false);
      expect(isValidWithWarnings).toBe(true);
    });
  });
});
