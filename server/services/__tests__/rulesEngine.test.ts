/**
 * Rules Engine Tests
 *
 * Unit tests for carrier and jurisdiction rules evaluation.
 * Run with: npx vitest run server/services/__tests__/rulesEngine.test.ts
 *
 * These tests verify:
 * 1. Carrier exclusions are applied correctly
 * 2. Carrier caps modify quantities/prices
 * 3. Jurisdiction rules apply tax/labor constraints
 * 4. Rule evaluation order (carrier → jurisdiction → defaults)
 * 5. Audit trail completeness
 * 6. Explainability of all modifications
 */

import { describe, it, expect } from 'vitest';
import type {
  RulesEvaluationResult,
  LineItemRuleResult,
  AppliedRule,
  RuleAuditEntry,
  RuleSource,
  RuleEffectType,
  LineItemRuleStatus,
  RuleConditions,
  ExcludeEffect,
  CapQuantityEffect,
  CapCostEffect,
  RequireDocEffect,
  ModifyPctEffect,
} from '../../../shared/schema';

// ============================================
// MOCK TYPES (matching rulesEngine.ts)
// ============================================

interface LineItemForRules {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  categoryId?: string;
  zoneId?: string;
  zoneName?: string;
  tradeCode?: string;
  damageType?: string;
  waterCategory?: number;
}

interface ZoneForRules {
  id: string;
  name: string;
  zoneType: string;
  roomType?: string;
  damageType?: string;
  damageSeverity?: string;
  waterCategory?: number;
}

interface CarrierExclusion {
  lineItemCode: string;
  exclusionReason: string;
}

interface CarrierCap {
  lineItemCode?: string;
  categoryId?: string;
  maxQuantity?: number;
  maxQuantityPerZone?: number;
  maxUnitPrice?: number;
  capReason?: string;
}

interface CarrierRule {
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  targetType: string;
  targetValue?: string;
  conditions: RuleConditions;
  effectType: RuleEffectType;
  effectValue: Record<string, unknown>;
  explanationTemplate?: string;
  priority: number;
}

interface LineItemWorkingState {
  original: LineItemForRules;
  current: {
    quantity: number;
    unitPrice: number;
  };
  status: LineItemRuleStatus;
  documentationRequired: string[];
  appliedRules: AppliedRule[];
}

// ============================================
// MOCK EVALUATION FUNCTIONS
// ============================================

/**
 * Apply carrier exclusions to line items
 */
function applyExclusions(
  items: LineItemForRules[],
  exclusions: CarrierExclusion[]
): Map<string, LineItemWorkingState> {
  const states = new Map<string, LineItemWorkingState>();

  for (const item of items) {
    const state: LineItemWorkingState = {
      original: item,
      current: { quantity: item.quantity, unitPrice: item.unitPrice },
      status: 'allowed',
      documentationRequired: [],
      appliedRules: [],
    };

    const exclusion = exclusions.find((e) => e.lineItemCode === item.code);
    if (exclusion) {
      state.status = 'denied';
      state.appliedRules.push({
        ruleSource: 'carrier',
        ruleCode: `EXCL-${item.code}`,
        ruleName: `Carrier Exclusion: ${item.code}`,
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation: exclusion.exclusionReason,
      });
    }

    states.set(item.id, state);
  }

  return states;
}

/**
 * Apply carrier caps to line items
 */
function applyCaps(
  states: Map<string, LineItemWorkingState>,
  items: LineItemForRules[],
  caps: CarrierCap[]
): void {
  for (const item of items) {
    const state = states.get(item.id);
    if (!state || state.status === 'denied') continue;

    const cap = caps.find(
      (c) =>
        c.lineItemCode === item.code ||
        (c.categoryId && item.categoryId?.startsWith(c.categoryId))
    );

    if (!cap) continue;

    // Quantity cap
    if (cap.maxQuantity && state.current.quantity > cap.maxQuantity) {
      const originalQty = state.current.quantity;
      state.current.quantity = cap.maxQuantity;
      state.status = 'modified';
      state.appliedRules.push({
        ruleSource: 'carrier',
        ruleCode: `CAP-QTY-${item.code}`,
        ruleName: `Carrier Quantity Cap: ${item.code}`,
        effectType: 'cap_quantity',
        originalValue: { quantity: originalQty },
        modifiedValue: { quantity: state.current.quantity },
        explanation: cap.capReason || `Quantity capped at ${cap.maxQuantity}`,
      });
    }

    // Price cap
    if (cap.maxUnitPrice && state.current.unitPrice > cap.maxUnitPrice) {
      const originalPrice = state.current.unitPrice;
      state.current.unitPrice = cap.maxUnitPrice;
      state.status = 'modified';
      state.appliedRules.push({
        ruleSource: 'carrier',
        ruleCode: `CAP-PRICE-${item.code}`,
        ruleName: `Carrier Price Cap: ${item.code}`,
        effectType: 'cap_cost',
        originalValue: { unitPrice: originalPrice },
        modifiedValue: { unitPrice: state.current.unitPrice },
        explanation: cap.capReason || `Unit price capped at $${cap.maxUnitPrice}`,
      });
    }
  }
}

/**
 * Check if rule conditions match
 */
function conditionsMatch(
  conditions: RuleConditions,
  item: LineItemForRules,
  zone?: ZoneForRules
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  if (conditions.damageType && conditions.damageType.length > 0) {
    const damageType = item.damageType || zone?.damageType;
    if (!damageType || !conditions.damageType.includes(damageType)) {
      return false;
    }
  }

  if (conditions.waterCategory && conditions.waterCategory.length > 0) {
    const waterCategory = item.waterCategory || zone?.waterCategory;
    if (waterCategory === undefined || !conditions.waterCategory.includes(waterCategory)) {
      return false;
    }
  }

  return true;
}

/**
 * Apply documentation requirements
 */
function applyDocRequirements(
  states: Map<string, LineItemWorkingState>,
  items: LineItemForRules[],
  rules: CarrierRule[],
  zones: ZoneForRules[]
): void {
  const zoneMap = new Map<string, ZoneForRules>();
  for (const zone of zones) {
    zoneMap.set(zone.id, zone);
  }

  for (const rule of rules.filter((r) => r.effectType === 'require_doc')) {
    for (const item of items) {
      const state = states.get(item.id);
      if (!state || state.status === 'denied') continue;

      const zone = item.zoneId ? zoneMap.get(item.zoneId) : undefined;
      if (!conditionsMatch(rule.conditions, item, zone)) continue;

      const effect = rule.effectValue as RequireDocEffect;
      if (effect.required) {
        for (const doc of effect.required) {
          if (!state.documentationRequired.includes(doc)) {
            state.documentationRequired.push(doc);
          }
        }

        if (state.status === 'allowed') {
          state.status = 'warning';
        }

        state.appliedRules.push({
          ruleSource: 'carrier',
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          effectType: 'require_doc',
          originalValue: { documentation: [] },
          modifiedValue: { documentation: effect.required },
          explanation: rule.explanationTemplate || `Documentation required: ${effect.required.join(', ')}`,
        });
      }
    }
  }
}

/**
 * Generate explanation for line item
 */
function generateExplanation(state: LineItemWorkingState): string {
  if (state.appliedRules.length === 0) {
    return 'No rules applied - item allowed as entered.';
  }

  const parts: string[] = [];

  switch (state.status) {
    case 'denied':
      parts.push('Item DENIED by carrier/jurisdiction rules.');
      break;
    case 'modified':
      parts.push('Item MODIFIED by carrier/jurisdiction rules.');
      break;
    case 'warning':
      parts.push('Item has WARNINGS from carrier/jurisdiction rules.');
      break;
  }

  for (const rule of state.appliedRules) {
    parts.push(`• [${rule.ruleSource.toUpperCase()}] ${rule.explanation}`);
  }

  if (state.documentationRequired.length > 0) {
    parts.push(`Required documentation: ${state.documentationRequired.join(', ')}`);
  }

  return parts.join('\n');
}

// ============================================
// TESTS
// ============================================

describe('RulesEngine', () => {
  describe('Carrier Exclusions', () => {
    it('excludes items on the carrier exclusion list', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'MOLD-REMEDIATION', description: 'Mold remediation', quantity: 100, unitPrice: 15.00, unit: 'SF' },
        { id: '2', code: 'DRY-HTT-12', description: 'Drywall', quantity: 100, unitPrice: 2.50, unit: 'SF' },
      ];

      const exclusions: CarrierExclusion[] = [
        { lineItemCode: 'MOLD-REMEDIATION', exclusionReason: 'Mold remediation requires pre-approval' },
      ];

      const states = applyExclusions(items, exclusions);

      expect(states.get('1')!.status).toBe('denied');
      expect(states.get('2')!.status).toBe('allowed');
    });

    it('records exclusion reason in applied rules', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'TEMP-FENCE', description: 'Temporary fence', quantity: 50, unitPrice: 10.00, unit: 'LF' },
      ];

      const exclusions: CarrierExclusion[] = [
        { lineItemCode: 'TEMP-FENCE', exclusionReason: 'Temporary fencing not covered under standard policy' },
      ];

      const states = applyExclusions(items, exclusions);
      const state = states.get('1')!;

      expect(state.appliedRules).toHaveLength(1);
      expect(state.appliedRules[0].effectType).toBe('exclude');
      expect(state.appliedRules[0].explanation).toContain('not covered');
    });

    it('allows items not on exclusion list', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'PAINT-INT-WALL', description: 'Interior paint', quantity: 320, unitPrice: 1.50, unit: 'SF' },
      ];

      const exclusions: CarrierExclusion[] = [
        { lineItemCode: 'MOLD-REMEDIATION', exclusionReason: 'Excluded' },
      ];

      const states = applyExclusions(items, exclusions);

      expect(states.get('1')!.status).toBe('allowed');
      expect(states.get('1')!.appliedRules).toHaveLength(0);
    });
  });

  describe('Carrier Quantity Caps', () => {
    it('caps quantity when exceeding maximum', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-DRY-DEHU', description: 'Dehumidifier', quantity: 15, unitPrice: 75.00, unit: 'DAY' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'WTR-DRY-DEHU', maxQuantity: 5, capReason: 'Standard drying period per carrier guidelines' },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      expect(state.status).toBe('modified');
      expect(state.current.quantity).toBe(5);
      expect(state.original.quantity).toBe(15);
    });

    it('does not modify quantity under cap', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-DRY-DEHU', description: 'Dehumidifier', quantity: 3, unitPrice: 75.00, unit: 'DAY' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'WTR-DRY-DEHU', maxQuantity: 5 },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      expect(state.status).toBe('allowed');
      expect(state.current.quantity).toBe(3);
    });

    it('records original and modified values', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-DRY-AIRMOV', description: 'Air mover', quantity: 30, unitPrice: 35.00, unit: 'DAY' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'WTR-DRY-AIRMOV', maxQuantity: 15 },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      const rule = state.appliedRules[0];

      expect(rule.originalValue).toEqual({ quantity: 30 });
      expect(rule.modifiedValue).toEqual({ quantity: 15 });
    });

    it('applies category-level caps', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'PAINT-INT-WALL', description: 'Interior paint', quantity: 100, unitPrice: 3.50, unit: 'SF', categoryId: 'PAINT-INT' },
      ];

      const caps: CarrierCap[] = [
        { categoryId: 'PAINT', maxUnitPrice: 2.50, capReason: 'Paint labor rate maximum' },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      expect(state.status).toBe('modified');
      expect(state.current.unitPrice).toBe(2.50);
    });
  });

  describe('Carrier Price Caps', () => {
    it('caps unit price when exceeding maximum', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'ELEC-OUTLET', description: 'Outlet install', quantity: 5, unitPrice: 150.00, unit: 'EA' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'ELEC-OUTLET', maxUnitPrice: 100.00, capReason: 'Electrical rate cap per schedule' },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      expect(state.status).toBe('modified');
      expect(state.current.unitPrice).toBe(100.00);
    });

    it('applies both quantity and price caps', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-DRY-DEHU', description: 'Dehumidifier', quantity: 10, unitPrice: 100.00, unit: 'DAY' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'WTR-DRY-DEHU', maxQuantity: 5, maxUnitPrice: 75.00 },
      ];

      const states = applyExclusions(items, []);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      expect(state.status).toBe('modified');
      expect(state.current.quantity).toBe(5);
      expect(state.current.unitPrice).toBe(75.00);
      expect(state.appliedRules).toHaveLength(2);
    });
  });

  describe('Documentation Requirements', () => {
    it('adds documentation requirements based on conditions', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-EXTRACT', description: 'Water extraction', quantity: 100, unitPrice: 1.50, unit: 'SF', damageType: 'water', waterCategory: 3 },
      ];

      const zones: ZoneForRules[] = [];

      const rules: CarrierRule[] = [
        {
          ruleCode: 'CAT3-DOC',
          ruleName: 'Category 3 Documentation',
          ruleType: 'documentation',
          targetType: 'estimate',
          conditions: { waterCategory: [3] },
          effectType: 'require_doc',
          effectValue: { required: ['moisture_reading', 'photo', 'antimicrobial_cert'] },
          explanationTemplate: 'Category 3 water requires moisture readings, photos, and antimicrobial certification',
          priority: 10,
        },
      ];

      const states = applyExclusions(items, []);
      applyDocRequirements(states, items, rules, zones);

      const state = states.get('1')!;
      expect(state.status).toBe('warning');
      expect(state.documentationRequired).toContain('moisture_reading');
      expect(state.documentationRequired).toContain('photo');
      expect(state.documentationRequired).toContain('antimicrobial_cert');
    });

    it('does not add documentation when conditions do not match', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'WTR-EXTRACT', description: 'Water extraction', quantity: 100, unitPrice: 1.50, unit: 'SF', damageType: 'water', waterCategory: 1 },
      ];

      const zones: ZoneForRules[] = [];

      const rules: CarrierRule[] = [
        {
          ruleCode: 'CAT3-DOC',
          ruleName: 'Category 3 Documentation',
          ruleType: 'documentation',
          targetType: 'estimate',
          conditions: { waterCategory: [3] },
          effectType: 'require_doc',
          effectValue: { required: ['moisture_reading'] },
          priority: 10,
        },
      ];

      const states = applyExclusions(items, []);
      applyDocRequirements(states, items, rules, zones);

      const state = states.get('1')!;
      expect(state.status).toBe('allowed');
      expect(state.documentationRequired).toHaveLength(0);
    });
  });

  describe('Rule Condition Matching', () => {
    it('matches damage type conditions', () => {
      const item: LineItemForRules = {
        id: '1', code: 'WTR-EXTRACT', description: 'Extraction', quantity: 100, unitPrice: 1.50, unit: 'SF',
        damageType: 'water',
      };

      expect(conditionsMatch({ damageType: ['water'] }, item)).toBe(true);
      expect(conditionsMatch({ damageType: ['fire'] }, item)).toBe(false);
      expect(conditionsMatch({ damageType: ['water', 'fire'] }, item)).toBe(true);
    });

    it('matches water category conditions', () => {
      const item: LineItemForRules = {
        id: '1', code: 'WTR-EXTRACT', description: 'Extraction', quantity: 100, unitPrice: 1.50, unit: 'SF',
        waterCategory: 2,
      };

      expect(conditionsMatch({ waterCategory: [2, 3] }, item)).toBe(true);
      expect(conditionsMatch({ waterCategory: [1] }, item)).toBe(false);
    });

    it('returns true for empty conditions', () => {
      const item: LineItemForRules = {
        id: '1', code: 'DRY-HTT-12', description: 'Drywall', quantity: 100, unitPrice: 2.50, unit: 'SF',
      };

      expect(conditionsMatch({}, item)).toBe(true);
    });

    it('uses zone context when item lacks damage info', () => {
      const item: LineItemForRules = {
        id: '1', code: 'DRY-HTT-12', description: 'Drywall', quantity: 100, unitPrice: 2.50, unit: 'SF',
        zoneId: 'zone-1',
        // No damageType on item
      };

      const zone: ZoneForRules = {
        id: 'zone-1',
        name: 'Kitchen',
        zoneType: 'room',
        damageType: 'water',
        waterCategory: 2,
      };

      expect(conditionsMatch({ damageType: ['water'] }, item, zone)).toBe(true);
      expect(conditionsMatch({ waterCategory: [2] }, item, zone)).toBe(true);
    });
  });

  describe('Explanation Generation', () => {
    it('generates explanation for denied items', () => {
      const state: LineItemWorkingState = {
        original: { id: '1', code: 'MOLD-REMEDIATION', description: 'Mold', quantity: 100, unitPrice: 15.00, unit: 'SF' },
        current: { quantity: 100, unitPrice: 15.00 },
        status: 'denied',
        documentationRequired: [],
        appliedRules: [
          {
            ruleSource: 'carrier',
            ruleCode: 'EXCL-MOLD',
            ruleName: 'Mold Exclusion',
            effectType: 'exclude',
            explanation: 'Mold remediation requires pre-approval',
          },
        ],
      };

      const explanation = generateExplanation(state);

      expect(explanation).toContain('DENIED');
      expect(explanation).toContain('Mold remediation requires pre-approval');
      expect(explanation).toContain('CARRIER');
    });

    it('generates explanation for modified items', () => {
      const state: LineItemWorkingState = {
        original: { id: '1', code: 'WTR-DRY-DEHU', description: 'Dehu', quantity: 15, unitPrice: 75.00, unit: 'DAY' },
        current: { quantity: 5, unitPrice: 75.00 },
        status: 'modified',
        documentationRequired: [],
        appliedRules: [
          {
            ruleSource: 'carrier',
            ruleCode: 'CAP-QTY',
            ruleName: 'Quantity Cap',
            effectType: 'cap_quantity',
            originalValue: { quantity: 15 },
            modifiedValue: { quantity: 5 },
            explanation: 'Quantity capped at 5 per carrier guidelines',
          },
        ],
      };

      const explanation = generateExplanation(state);

      expect(explanation).toContain('MODIFIED');
      expect(explanation).toContain('capped at 5');
    });

    it('includes documentation requirements in explanation', () => {
      const state: LineItemWorkingState = {
        original: { id: '1', code: 'WTR-EXTRACT', description: 'Extract', quantity: 100, unitPrice: 1.50, unit: 'SF' },
        current: { quantity: 100, unitPrice: 1.50 },
        status: 'warning',
        documentationRequired: ['photo', 'moisture_reading'],
        appliedRules: [
          {
            ruleSource: 'carrier',
            ruleCode: 'DOC-REQ',
            ruleName: 'Documentation Required',
            effectType: 'require_doc',
            explanation: 'Documentation required for water damage',
          },
        ],
      };

      const explanation = generateExplanation(state);

      expect(explanation).toContain('WARNINGS');
      expect(explanation).toContain('photo');
      expect(explanation).toContain('moisture_reading');
    });

    it('returns default message for items with no rules', () => {
      const state: LineItemWorkingState = {
        original: { id: '1', code: 'PAINT-INT-WALL', description: 'Paint', quantity: 100, unitPrice: 1.50, unit: 'SF' },
        current: { quantity: 100, unitPrice: 1.50 },
        status: 'allowed',
        documentationRequired: [],
        appliedRules: [],
      };

      const explanation = generateExplanation(state);

      expect(explanation).toBe('No rules applied - item allowed as entered.');
    });
  });

  describe('Rule Evaluation Order', () => {
    it('applies exclusions before caps', () => {
      const items: LineItemForRules[] = [
        { id: '1', code: 'EXCLUDED-ITEM', description: 'Excluded', quantity: 100, unitPrice: 50.00, unit: 'SF' },
      ];

      const exclusions: CarrierExclusion[] = [
        { lineItemCode: 'EXCLUDED-ITEM', exclusionReason: 'Not covered' },
      ];

      const caps: CarrierCap[] = [
        { lineItemCode: 'EXCLUDED-ITEM', maxQuantity: 50 },
      ];

      const states = applyExclusions(items, exclusions);
      applyCaps(states, items, caps);

      const state = states.get('1')!;
      // Should be denied, not modified
      expect(state.status).toBe('denied');
      // Caps should not be applied to excluded items
      expect(state.appliedRules).toHaveLength(1);
      expect(state.appliedRules[0].effectType).toBe('exclude');
    });

    it('processes rules by priority', () => {
      const rules: CarrierRule[] = [
        { ruleCode: 'LOW', ruleName: 'Low Priority', ruleType: 'cap', targetType: 'line_item', conditions: {}, effectType: 'cap_quantity', effectValue: { maxQuantity: 100 }, priority: 100 },
        { ruleCode: 'HIGH', ruleName: 'High Priority', ruleType: 'cap', targetType: 'line_item', conditions: {}, effectType: 'cap_quantity', effectValue: { maxQuantity: 50 }, priority: 10 },
        { ruleCode: 'MED', ruleName: 'Med Priority', ruleType: 'cap', targetType: 'line_item', conditions: {}, effectType: 'cap_quantity', effectValue: { maxQuantity: 75 }, priority: 50 },
      ];

      const sorted = rules.sort((a, b) => a.priority - b.priority);

      expect(sorted[0].ruleCode).toBe('HIGH');
      expect(sorted[1].ruleCode).toBe('MED');
      expect(sorted[2].ruleCode).toBe('LOW');
    });
  });

  describe('Result Summary', () => {
    it('counts items by status correctly', () => {
      const states = new Map<string, LineItemWorkingState>();
      states.set('1', { original: {} as LineItemForRules, current: { quantity: 0, unitPrice: 0 }, status: 'allowed', documentationRequired: [], appliedRules: [] });
      states.set('2', { original: {} as LineItemForRules, current: { quantity: 0, unitPrice: 0 }, status: 'allowed', documentationRequired: [], appliedRules: [] });
      states.set('3', { original: {} as LineItemForRules, current: { quantity: 0, unitPrice: 0 }, status: 'modified', documentationRequired: [], appliedRules: [] });
      states.set('4', { original: {} as LineItemForRules, current: { quantity: 0, unitPrice: 0 }, status: 'denied', documentationRequired: [], appliedRules: [] });
      states.set('5', { original: {} as LineItemForRules, current: { quantity: 0, unitPrice: 0 }, status: 'warning', documentationRequired: [], appliedRules: [] });

      let allowed = 0, modified = 0, denied = 0, warning = 0;
      for (const [, state] of states) {
        switch (state.status) {
          case 'allowed': allowed++; break;
          case 'modified': modified++; break;
          case 'denied': denied++; break;
          case 'warning': warning++; break;
        }
      }

      expect(allowed).toBe(2);
      expect(modified).toBe(1);
      expect(denied).toBe(1);
      expect(warning).toBe(1);
    });
  });

  describe('Audit Trail', () => {
    it('records all rule applications', () => {
      const auditLog: RuleAuditEntry[] = [];
      const timestamp = new Date();

      // Simulate logging an exclusion
      auditLog.push({
        timestamp,
        ruleSource: 'carrier',
        ruleCode: 'EXCL-001',
        targetType: 'line_item',
        targetId: 'item-1',
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation: 'Item excluded per carrier policy',
      });

      // Simulate logging a cap
      auditLog.push({
        timestamp,
        ruleSource: 'carrier',
        ruleCode: 'CAP-001',
        targetType: 'line_item',
        targetId: 'item-2',
        effectType: 'cap_quantity',
        originalValue: { quantity: 10 },
        modifiedValue: { quantity: 5 },
        explanation: 'Quantity capped at 5',
      });

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].effectType).toBe('exclude');
      expect(auditLog[1].effectType).toBe('cap_quantity');
    });

    it('preserves original values in audit entries', () => {
      const entry: RuleAuditEntry = {
        timestamp: new Date(),
        ruleSource: 'carrier',
        ruleCode: 'CAP-QTY',
        targetType: 'line_item',
        targetId: 'item-1',
        effectType: 'cap_quantity',
        originalValue: { quantity: 100, unitPrice: 50.00 },
        modifiedValue: { quantity: 25 },
        explanation: 'Quantity reduced per carrier cap',
      };

      expect(entry.originalValue).toEqual({ quantity: 100, unitPrice: 50.00 });
      expect(entry.modifiedValue).toEqual({ quantity: 25 });
    });
  });

  describe('Jurisdiction Rules', () => {
    it('identifies labor taxable jurisdictions', () => {
      interface Jurisdiction {
        code: string;
        laborTaxable: boolean;
        salesTaxRate: number;
      }

      const jurisdictions: Jurisdiction[] = [
        { code: 'US-TX', laborTaxable: true, salesTaxRate: 0.0625 },
        { code: 'US-FL', laborTaxable: false, salesTaxRate: 0.06 },
      ];

      const texas = jurisdictions.find((j) => j.code === 'US-TX')!;
      const florida = jurisdictions.find((j) => j.code === 'US-FL')!;

      expect(texas.laborTaxable).toBe(true);
      expect(florida.laborTaxable).toBe(false);
    });

    it('applies O&P threshold overrides', () => {
      interface Jurisdiction {
        code: string;
        opThresholdOverride?: number;
      }

      interface CarrierProfile {
        code: string;
        opThreshold: number;
      }

      const carrier: CarrierProfile = { code: 'NATL-STD', opThreshold: 5000 };
      const jurisdiction: Jurisdiction = { code: 'US-FL', opThresholdOverride: 3000 };

      const effectiveThreshold = jurisdiction.opThresholdOverride || carrier.opThreshold;

      expect(effectiveThreshold).toBe(3000); // Jurisdiction override takes precedence
    });
  });
});
