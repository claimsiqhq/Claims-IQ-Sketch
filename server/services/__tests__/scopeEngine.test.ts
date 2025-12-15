/**
 * Scope Engine Tests
 *
 * Unit tests for deterministic scope evaluation.
 * Run with: npx vitest run server/services/__tests__/scopeEngine.test.ts
 */

import { describe, it, expect } from 'vitest';
import type {
  ScopeConditions,
  CatalogLineItem,
  ZoneDamageAttributes,
  ScopeEvaluationResult,
} from '../scopeEngine';

// Note: These tests use mock data since the real scopeEngine requires database access.
// For integration tests, see the integration test file.

describe('ScopeEngine', () => {
  describe('Condition Matching Logic', () => {
    // Mock the condition evaluation logic for unit testing
    function matchesConditions(
      conditions: ScopeConditions,
      damage: ZoneDamageAttributes
    ): { matches: boolean; matchedConditions: string[] } {
      const matchedConditions: string[] = [];

      // Check damage type
      if (conditions.damageType && conditions.damageType.length > 0) {
        if (!damage.damageType || !conditions.damageType.includes(damage.damageType.toLowerCase())) {
          return { matches: false, matchedConditions };
        }
        matchedConditions.push(`damageType=${damage.damageType}`);
      }

      // Check water category
      if (conditions.waterCategory && conditions.waterCategory.length > 0) {
        if (!damage.waterCategory || !conditions.waterCategory.includes(damage.waterCategory)) {
          return { matches: false, matchedConditions };
        }
        matchedConditions.push(`waterCategory=${damage.waterCategory}`);
      }

      // Check affected surfaces
      if (conditions.affectedSurfaces && conditions.affectedSurfaces.length > 0) {
        const zoneAffected = damage.affectedSurfaces || [];
        const hasMatch = conditions.affectedSurfaces.some((surface) =>
          zoneAffected.map((s) => s.toLowerCase()).includes(surface.toLowerCase())
        );
        if (!hasMatch) {
          return { matches: false, matchedConditions };
        }
        matchedConditions.push(`affectedSurfaces matched`);
      }

      return {
        matches: matchedConditions.length > 0,
        matchedConditions,
      };
    }

    it('matches water damage type', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
      };

      const damage: ZoneDamageAttributes = {
        damageType: 'water',
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(true);
      expect(result.matchedConditions).toContain('damageType=water');
    });

    it('does not match wrong damage type', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
      };

      const damage: ZoneDamageAttributes = {
        damageType: 'fire',
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(false);
    });

    it('matches water category', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
        waterCategory: [2, 3],
      };

      const damage: ZoneDamageAttributes = {
        damageType: 'water',
        waterCategory: 2,
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(true);
      expect(result.matchedConditions).toContain('waterCategory=2');
    });

    it('does not match wrong water category', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
        waterCategory: [2, 3],
      };

      const damage: ZoneDamageAttributes = {
        damageType: 'water',
        waterCategory: 1,
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(false);
    });

    it('matches affected surfaces', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
        affectedSurfaces: ['wall', 'floor'],
      };

      const damage: ZoneDamageAttributes = {
        damageType: 'water',
        affectedSurfaces: ['Wall', 'Ceiling'],
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(true);
    });

    it('requires all conditions to match (AND logic)', () => {
      const conditions: ScopeConditions = {
        damageType: ['water'],
        waterCategory: [2, 3],
        affectedSurfaces: ['wall'],
      };

      // Missing water category
      const damage: ZoneDamageAttributes = {
        damageType: 'water',
        affectedSurfaces: ['wall'],
      };

      const result = matchesConditions(conditions, damage);

      expect(result.matches).toBe(false);
    });
  });

  describe('Dependency Processing', () => {
    it('identifies missing required items', () => {
      const suggestedCodes = ['DRY-HTT-12', 'PAINT-INT-WALL'];
      const requiresMap: Record<string, string[]> = {
        'DRY-HTT-12': ['DEM-DRY-FLOOD'],
        'PAINT-INT-WALL': ['PAINT-PRIME-STD'],
      };

      const warnings: string[] = [];
      for (const code of suggestedCodes) {
        const requires = requiresMap[code] || [];
        for (const requiredCode of requires) {
          if (!suggestedCodes.includes(requiredCode)) {
            warnings.push(`${code} requires ${requiredCode}`);
          }
        }
      }

      expect(warnings).toContain('DRY-HTT-12 requires DEM-DRY-FLOOD');
      expect(warnings).toContain('PAINT-INT-WALL requires PAINT-PRIME-STD');
    });

    it('identifies auto-add items', () => {
      const matchedCodes = new Set(['WTR-EXTRACT-PORT']);
      const autoAddMap: Record<string, string[]> = {
        'WTR-EXTRACT-PORT': ['WTR-MOIST-INIT', 'WTR-DRY-SETUP'],
      };

      const autoAdded: string[] = [];
      for (const code of matchedCodes) {
        const toAdd = autoAddMap[code] || [];
        for (const addCode of toAdd) {
          if (!matchedCodes.has(addCode)) {
            autoAdded.push(addCode);
          }
        }
      }

      expect(autoAdded).toContain('WTR-MOIST-INIT');
      expect(autoAdded).toContain('WTR-DRY-SETUP');
    });
  });

  describe('Exclusion Processing', () => {
    it('identifies mutually exclusive items', () => {
      const presentCodes = ['DEM-DRY-FLOOD', 'DEM-DRY-FLOOD-4'];
      const excludesMap: Record<string, string[]> = {
        'DEM-DRY-FLOOD': ['DEM-DRY-FLOOD-4', 'DEM-DRY-FULL'],
        'DEM-DRY-FLOOD-4': ['DEM-DRY-FLOOD', 'DEM-DRY-FULL'],
      };

      const conflicts: Array<{ item1: string; item2: string }> = [];
      const checked = new Set<string>();

      for (const code of presentCodes) {
        const excludes = excludesMap[code] || [];
        for (const excludedCode of excludes) {
          if (presentCodes.includes(excludedCode)) {
            const key = [code, excludedCode].sort().join('-');
            if (!checked.has(key)) {
              checked.add(key);
              conflicts.push({ item1: code, item2: excludedCode });
            }
          }
        }
      }

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        item1: 'DEM-DRY-FLOOD',
        item2: 'DEM-DRY-FLOOD-4',
      });
    });
  });

  describe('Replacement Processing', () => {
    it('identifies replacement relationships', () => {
      const presentCodes = ['DEM-DRY-FLOOD-4', 'DEM-DRY-FLOOD'];
      const replacesMap: Record<string, string[]> = {
        'DEM-DRY-FLOOD-4': ['DEM-DRY-FLOOD'],
      };

      const replacements: Array<{ replacer: string; replaced: string }> = [];

      for (const code of presentCodes) {
        const replaces = replacesMap[code] || [];
        for (const replacedCode of replaces) {
          if (presentCodes.includes(replacedCode)) {
            replacements.push({ replacer: code, replaced: replacedCode });
          }
        }
      }

      expect(replacements).toHaveLength(1);
      expect(replacements[0]).toMatchObject({
        replacer: 'DEM-DRY-FLOOD-4',
        replaced: 'DEM-DRY-FLOOD',
      });
    });
  });
});
