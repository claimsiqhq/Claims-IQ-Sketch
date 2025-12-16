/**
 * Rules Evaluation Engine - Claims IQ Sketch v3
 *
 * Deterministic carrier and jurisdiction rules evaluation.
 * This is NOT AI - this is institutional logic written down.
 *
 * EVALUATION ORDER:
 * 1. Carrier rules first (most specific)
 * 2. Jurisdiction rules second (regional constraints)
 * 3. Line item defaults last (catalog-level)
 *
 * DESIGN PRINCIPLES:
 * - Every rule application is logged
 * - Original values are preserved
 * - Explanations are human-readable and carrier-safe
 * - No silent overrides - everything is explicit
 */

import { pool } from '../db';
import type {
  CarrierProfile,
  CarrierRule,
  Jurisdiction,
  JurisdictionRule,
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
  CarrierExcludedItem,
  CarrierItemCap,
} from '../../shared/schema';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Line item input for rules evaluation
 */
export interface LineItemForRules {
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

  // Context for condition evaluation
  damageType?: string;
  waterCategory?: number;
}

/**
 * Zone context for rules evaluation
 */
export interface ZoneForRules {
  id: string;
  name: string;
  zoneType: string;
  roomType?: string;
  damageType?: string;
  damageSeverity?: string;
  waterCategory?: number;
}

/**
 * Estimate context for rules evaluation
 */
export interface EstimateForRules {
  id: string;
  carrierProfileId?: string;
  jurisdictionId?: string;
  claimTotal?: number;
  lineItems: LineItemForRules[];
  zones: ZoneForRules[];
}

/**
 * Internal working state for a line item during evaluation
 */
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
// MAIN API
// ============================================

/**
 * Evaluate all carrier and jurisdiction rules for an estimate
 *
 * @param estimate - The estimate with line items and zone context
 * @returns Evaluation result with all modifications and audit trail
 */
export async function evaluateRules(
  estimate: EstimateForRules
): Promise<RulesEvaluationResult> {
  const auditLog: RuleAuditEntry[] = [];
  const estimateEffects: AppliedRule[] = [];
  const evaluatedAt = new Date();

  // Load carrier and jurisdiction data
  const carrierProfile = estimate.carrierProfileId
    ? await getCarrierProfile(estimate.carrierProfileId)
    : null;

  const jurisdiction = estimate.jurisdictionId
    ? await getJurisdiction(estimate.jurisdictionId)
    : null;

  // Load rules
  const carrierRules = carrierProfile
    ? await getCarrierRules(carrierProfile.id)
    : [];

  const carrierExclusions = carrierProfile
    ? await getCarrierExclusions(carrierProfile.id)
    : [];

  const carrierCaps = carrierProfile
    ? await getCarrierCaps(carrierProfile.id)
    : [];

  const jurisdictionRules = jurisdiction
    ? await getJurisdictionRules(jurisdiction.id)
    : [];

  // Create zone lookup map
  const zoneMap = new Map<string, ZoneForRules>();
  for (const zone of estimate.zones) {
    zoneMap.set(zone.id, zone);
  }

  // Initialize working state for each line item
  const workingStates = new Map<string, LineItemWorkingState>();
  for (const item of estimate.lineItems) {
    workingStates.set(item.id, {
      original: item,
      current: {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      },
      status: 'allowed',
      documentationRequired: [],
      appliedRules: [],
    });
  }

  // ============================================
  // PHASE 1: Apply carrier exclusions (quick lookup)
  // ============================================
  for (const item of estimate.lineItems) {
    const state = workingStates.get(item.id)!;
    const exclusion = carrierExclusions.find(
      (e) => e.lineItemCode === item.code
    );

    if (exclusion) {
      const rule: AppliedRule = {
        ruleSource: 'carrier',
        ruleCode: `EXCL-${item.code}`,
        ruleName: `Carrier Exclusion: ${item.code}`,
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation: exclusion.exclusionReason,
      };

      state.status = 'denied';
      state.appliedRules.push(rule);

      auditLog.push({
        timestamp: evaluatedAt,
        ruleSource: 'carrier',
        ruleCode: rule.ruleCode,
        targetType: 'line_item',
        targetId: item.id,
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation: exclusion.exclusionReason,
      });
    }
  }

  // ============================================
  // PHASE 2: Apply carrier caps (quick lookup)
  // ============================================
  for (const item of estimate.lineItems) {
    const state = workingStates.get(item.id)!;
    if (state.status === 'denied') continue;

    // Find applicable cap (by code or category)
    const cap = carrierCaps.find(
      (c) =>
        c.lineItemCode === item.code ||
        (c.categoryId && item.categoryId?.startsWith(c.categoryId))
    );

    if (cap) {
      // Apply quantity cap
      if (cap.maxQuantity && state.current.quantity > Number(cap.maxQuantity)) {
        const originalQty = state.current.quantity;
        state.current.quantity = Number(cap.maxQuantity);

        const rule: AppliedRule = {
          ruleSource: 'carrier',
          ruleCode: `CAP-QTY-${item.code}`,
          ruleName: `Carrier Quantity Cap: ${item.code}`,
          effectType: 'cap_quantity',
          originalValue: { quantity: originalQty },
          modifiedValue: { quantity: state.current.quantity },
          explanation:
            cap.capReason ||
            `Quantity capped at ${cap.maxQuantity} per carrier guidelines`,
        };

        state.status = 'modified';
        state.appliedRules.push(rule);

        auditLog.push({
          timestamp: evaluatedAt,
          ruleSource: 'carrier',
          ruleCode: rule.ruleCode,
          targetType: 'line_item',
          targetId: item.id,
          effectType: 'cap_quantity',
          originalValue: { quantity: originalQty },
          modifiedValue: { quantity: state.current.quantity },
          explanation: rule.explanation,
        });
      }

      // Apply unit price cap
      if (cap.maxUnitPrice && state.current.unitPrice > Number(cap.maxUnitPrice)) {
        const originalPrice = state.current.unitPrice;
        state.current.unitPrice = Number(cap.maxUnitPrice);

        const rule: AppliedRule = {
          ruleSource: 'carrier',
          ruleCode: `CAP-PRICE-${item.code}`,
          ruleName: `Carrier Price Cap: ${item.code}`,
          effectType: 'cap_cost',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation:
            cap.capReason ||
            `Unit price capped at $${cap.maxUnitPrice} per carrier guidelines`,
        };

        state.status = 'modified';
        state.appliedRules.push(rule);

        auditLog.push({
          timestamp: evaluatedAt,
          ruleSource: 'carrier',
          ruleCode: rule.ruleCode,
          targetType: 'line_item',
          targetId: item.id,
          effectType: 'cap_cost',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation: rule.explanation,
        });
      }
    }
  }

  // ============================================
  // PHASE 3: Apply carrier rules (complex conditions)
  // ============================================
  for (const rule of carrierRules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) {
    for (const item of estimate.lineItems) {
      const state = workingStates.get(item.id)!;
      if (state.status === 'denied') continue;

      // Check if rule applies to this item
      if (!ruleAppliesToItem(rule, item, zoneMap.get(item.zoneId || ''), estimate)) {
        continue;
      }

      // Apply rule effect
      applyRuleEffect(
        state,
        rule,
        'carrier',
        item,
        auditLog,
        evaluatedAt
      );
    }
  }

  // ============================================
  // PHASE 4: Apply jurisdiction rules
  // ============================================
  for (const rule of jurisdictionRules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) {
    for (const item of estimate.lineItems) {
      const state = workingStates.get(item.id)!;
      if (state.status === 'denied') continue;

      // Check if rule applies to this item
      if (!jurisdictionRuleAppliesToItem(rule, item, zoneMap.get(item.zoneId || ''), estimate)) {
        continue;
      }

      // Apply rule effect
      applyJurisdictionRuleEffect(
        state,
        rule,
        item,
        auditLog,
        evaluatedAt
      );
    }
  }

  // ============================================
  // PHASE 5: Apply estimate-level jurisdiction rules
  // ============================================
  if (jurisdiction) {
    // Tax on labor check
    if (jurisdiction.laborTaxable) {
      estimateEffects.push({
        ruleSource: 'jurisdiction',
        ruleCode: 'JUR-LABOR-TAX',
        ruleName: 'Labor Taxable',
        effectType: 'modify_pct',
        originalValue: { laborTaxable: false },
        modifiedValue: { laborTaxable: true },
        explanation: `Labor is taxable in ${jurisdiction.name}`,
      });

      auditLog.push({
        timestamp: evaluatedAt,
        ruleSource: 'jurisdiction',
        ruleCode: 'JUR-LABOR-TAX',
        targetType: 'estimate',
        effectType: 'modify_pct',
        originalValue: { laborTaxable: false },
        modifiedValue: { laborTaxable: true },
        explanation: `Labor is taxable in ${jurisdiction.name}`,
      });
    }

    // O&P threshold override
    if (jurisdiction.opThresholdOverride) {
      estimateEffects.push({
        ruleSource: 'jurisdiction',
        ruleCode: 'JUR-OP-THRESHOLD',
        ruleName: 'O&P Threshold Override',
        effectType: 'modify_pct',
        originalValue: { opThreshold: carrierProfile?.opThreshold || 2500 },
        modifiedValue: { opThreshold: Number(jurisdiction.opThresholdOverride) },
        explanation: `O&P threshold is $${jurisdiction.opThresholdOverride} in ${jurisdiction.name}`,
      });
    }

    // Minimum charge
    if (jurisdiction.minimumCharge && estimate.claimTotal && estimate.claimTotal < Number(jurisdiction.minimumCharge)) {
      estimateEffects.push({
        ruleSource: 'jurisdiction',
        ruleCode: 'JUR-MIN-CHARGE',
        ruleName: 'Regional Minimum Charge',
        effectType: 'warn',
        originalValue: { total: estimate.claimTotal },
        modifiedValue: { minimumCharge: Number(jurisdiction.minimumCharge) },
        explanation: `Regional minimum charge of $${jurisdiction.minimumCharge} applies in ${jurisdiction.name}`,
      });
    }
  }

  // ============================================
  // PHASE 6: Compile results
  // ============================================
  const lineItemResults: LineItemRuleResult[] = [];
  let allowedItems = 0;
  let modifiedItems = 0;
  let deniedItems = 0;
  let warningItems = 0;

  for (const [id, state] of workingStates) {
    // Generate combined explanation
    const explanation = generateExplanation(state);

    lineItemResults.push({
      lineItemId: id,
      lineItemCode: state.original.code,
      status: state.status,
      originalQuantity: state.original.quantity,
      modifiedQuantity:
        state.current.quantity !== state.original.quantity
          ? state.current.quantity
          : undefined,
      originalUnitPrice: state.original.unitPrice,
      modifiedUnitPrice:
        state.current.unitPrice !== state.original.unitPrice
          ? state.current.unitPrice
          : undefined,
      documentationRequired: state.documentationRequired,
      appliedRules: state.appliedRules,
      explanation,
    });

    switch (state.status) {
      case 'allowed':
        allowedItems++;
        break;
      case 'modified':
        modifiedItems++;
        break;
      case 'denied':
        deniedItems++;
        break;
      case 'warning':
        warningItems++;
        break;
    }
  }

  return {
    estimateId: estimate.id,
    carrierProfileId: estimate.carrierProfileId,
    jurisdictionId: estimate.jurisdictionId,
    evaluatedAt,
    totalItems: estimate.lineItems.length,
    allowedItems,
    modifiedItems,
    deniedItems,
    warningItems,
    lineItemResults,
    estimateEffects,
    auditLog,
  };
}

// ============================================
// RULE APPLICATION HELPERS
// ============================================

/**
 * Check if a carrier rule applies to a specific line item
 */
function ruleAppliesToItem(
  rule: CarrierRule,
  item: LineItemForRules,
  zone: ZoneForRules | undefined,
  estimate: EstimateForRules
): boolean {
  // Check target type
  switch (rule.targetType) {
    case 'line_item':
      if (rule.targetValue && rule.targetValue !== item.code) {
        return false;
      }
      break;

    case 'category':
      if (rule.targetValue && !item.categoryId?.startsWith(rule.targetValue)) {
        return false;
      }
      break;

    case 'trade':
      if (rule.targetValue && item.tradeCode !== rule.targetValue) {
        return false;
      }
      break;

    case 'estimate':
      // Estimate-level rules apply to all items
      break;

    default:
      return false;
  }

  // Check conditions
  const conditions = rule.conditions as RuleConditions;
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  // Damage type condition
  if (conditions.damageType && conditions.damageType.length > 0) {
    const damageType = item.damageType || zone?.damageType;
    if (!damageType || !conditions.damageType.includes(damageType)) {
      return false;
    }
  }

  // Water category condition
  if (conditions.waterCategory && conditions.waterCategory.length > 0) {
    const waterCategory = item.waterCategory || zone?.waterCategory;
    if (waterCategory === undefined || !conditions.waterCategory.includes(waterCategory)) {
      return false;
    }
  }

  // Claim total conditions
  if (conditions.claimTotalMin !== undefined && estimate.claimTotal !== undefined) {
    if (estimate.claimTotal < conditions.claimTotalMin) {
      return false;
    }
  }

  if (conditions.claimTotalMax !== undefined && estimate.claimTotal !== undefined) {
    if (estimate.claimTotal > conditions.claimTotalMax) {
      return false;
    }
  }

  // Zone type condition
  if (conditions.zoneType && conditions.zoneType.length > 0) {
    if (!zone?.zoneType || !conditions.zoneType.includes(zone.zoneType)) {
      return false;
    }
  }

  // Room type condition
  if (conditions.roomType && conditions.roomType.length > 0) {
    if (!zone?.roomType || !conditions.roomType.includes(zone.roomType)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a jurisdiction rule applies to a specific line item
 */
function jurisdictionRuleAppliesToItem(
  rule: JurisdictionRule,
  item: LineItemForRules,
  zone: ZoneForRules | undefined,
  estimate: EstimateForRules
): boolean {
  // Same logic as carrier rules
  switch (rule.targetType) {
    case 'line_item':
      if (rule.targetValue && rule.targetValue !== item.code) {
        return false;
      }
      break;

    case 'category':
      if (rule.targetValue && !item.categoryId?.startsWith(rule.targetValue)) {
        return false;
      }
      break;

    case 'trade':
      if (rule.targetValue && item.tradeCode !== rule.targetValue) {
        return false;
      }
      break;

    case 'estimate':
    case 'tax':
      break;

    default:
      return false;
  }

  const conditions = rule.conditions as RuleConditions;
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  // Same condition checks as carrier rules
  if (conditions.damageType && conditions.damageType.length > 0) {
    const damageType = item.damageType || zone?.damageType;
    if (!damageType || !conditions.damageType.includes(damageType)) {
      return false;
    }
  }

  return true;
}

/**
 * Apply a carrier rule effect to a line item
 */
function applyRuleEffect(
  state: LineItemWorkingState,
  rule: CarrierRule,
  source: RuleSource,
  item: LineItemForRules,
  auditLog: RuleAuditEntry[],
  timestamp: Date
): void {
  const effectValue = rule.effectValue as Record<string, unknown>;

  switch (rule.effectType) {
    case 'exclude': {
      const effect = effectValue as unknown as ExcludeEffect;
      const appliedRule: AppliedRule = {
        ruleSource: source,
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation:
          rule.explanationTemplate ||
          effect.reason ||
          `Excluded by carrier rule: ${rule.ruleName}`,
      };

      state.status = 'denied';
      state.appliedRules.push(appliedRule);

      auditLog.push({
        timestamp,
        ruleSource: source,
        ruleCode: rule.ruleCode,
        targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
        targetId: item.id,
        effectType: 'exclude',
        originalValue: { included: true },
        modifiedValue: { included: false },
        explanation: appliedRule.explanation,
      });
      break;
    }

    case 'cap_quantity': {
      const effect = effectValue as CapQuantityEffect;
      if (effect.maxQuantity && state.current.quantity > effect.maxQuantity) {
        const originalQty = state.current.quantity;
        state.current.quantity = effect.maxQuantity;

        const appliedRule: AppliedRule = {
          ruleSource: source,
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          effectType: 'cap_quantity',
          originalValue: { quantity: originalQty },
          modifiedValue: { quantity: state.current.quantity },
          explanation:
            rule.explanationTemplate ||
            effect.reason ||
            `Quantity capped at ${effect.maxQuantity}`,
        };

        state.status = 'modified';
        state.appliedRules.push(appliedRule);

        auditLog.push({
          timestamp,
          ruleSource: source,
          ruleCode: rule.ruleCode,
          targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
          targetId: item.id,
          effectType: 'cap_quantity',
          originalValue: { quantity: originalQty },
          modifiedValue: { quantity: state.current.quantity },
          explanation: appliedRule.explanation,
        });
      }
      break;
    }

    case 'cap_cost': {
      const effect = effectValue as CapCostEffect;
      if (effect.maxPerUnit && state.current.unitPrice > effect.maxPerUnit) {
        const originalPrice = state.current.unitPrice;
        state.current.unitPrice = effect.maxPerUnit;

        const appliedRule: AppliedRule = {
          ruleSource: source,
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          effectType: 'cap_cost',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation:
            rule.explanationTemplate ||
            effect.reason ||
            `Unit price capped at $${effect.maxPerUnit}`,
        };

        state.status = 'modified';
        state.appliedRules.push(appliedRule);

        auditLog.push({
          timestamp,
          ruleSource: source,
          ruleCode: rule.ruleCode,
          targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
          targetId: item.id,
          effectType: 'cap_cost',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation: appliedRule.explanation,
        });
      }
      break;
    }

    case 'require_doc': {
      const effect = effectValue as unknown as RequireDocEffect;
      if (effect.required && effect.required.length > 0) {
        for (const doc of effect.required) {
          if (!state.documentationRequired.includes(doc)) {
            state.documentationRequired.push(doc);
          }
        }

        const appliedRule: AppliedRule = {
          ruleSource: source,
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          effectType: 'require_doc',
          originalValue: { documentation: [] },
          modifiedValue: { documentation: effect.required },
          explanation:
            rule.explanationTemplate ||
            `Documentation required: ${effect.required.join(', ')}`,
        };

        if (state.status === 'allowed') {
          state.status = 'warning';
        }
        state.appliedRules.push(appliedRule);

        auditLog.push({
          timestamp,
          ruleSource: source,
          ruleCode: rule.ruleCode,
          targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
          targetId: item.id,
          effectType: 'require_doc',
          originalValue: { documentation: [] },
          modifiedValue: { documentation: effect.required },
          explanation: appliedRule.explanation,
        });
      }
      break;
    }

    case 'warn': {
      const appliedRule: AppliedRule = {
        ruleSource: source,
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        effectType: 'warn',
        explanation:
          rule.explanationTemplate || `Warning: ${rule.ruleName}`,
      };

      if (state.status === 'allowed') {
        state.status = 'warning';
      }
      state.appliedRules.push(appliedRule);

      auditLog.push({
        timestamp,
        ruleSource: source,
        ruleCode: rule.ruleCode,
        targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
        targetId: item.id,
        effectType: 'warn',
        explanation: appliedRule.explanation,
      });
      break;
    }

    case 'modify_pct': {
      const effect = effectValue as unknown as ModifyPctEffect;
      if (effect.multiplier) {
        const originalPrice = state.current.unitPrice;
        state.current.unitPrice = originalPrice * effect.multiplier;

        const appliedRule: AppliedRule = {
          ruleSource: source,
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          effectType: 'modify_pct',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation:
            rule.explanationTemplate ||
            effect.reason ||
            `Price modified by ${(effect.multiplier * 100).toFixed(0)}%`,
        };

        state.status = 'modified';
        state.appliedRules.push(appliedRule);

        auditLog.push({
          timestamp,
          ruleSource: source,
          ruleCode: rule.ruleCode,
          targetType: rule.targetType as 'line_item' | 'category' | 'trade' | 'estimate' | 'tax',
          targetId: item.id,
          effectType: 'modify_pct',
          originalValue: { unitPrice: originalPrice },
          modifiedValue: { unitPrice: state.current.unitPrice },
          explanation: appliedRule.explanation,
        });
      }
      break;
    }
  }
}

/**
 * Apply a jurisdiction rule effect to a line item
 */
function applyJurisdictionRuleEffect(
  state: LineItemWorkingState,
  rule: JurisdictionRule,
  item: LineItemForRules,
  auditLog: RuleAuditEntry[],
  timestamp: Date
): void {
  // Use the same logic as carrier rules
  applyRuleEffect(
    state,
    rule as unknown as CarrierRule,
    'jurisdiction',
    item,
    auditLog,
    timestamp
  );
}

/**
 * Generate a human-readable explanation for a line item's rule results
 */
function generateExplanation(state: LineItemWorkingState): string {
  if (state.appliedRules.length === 0) {
    return 'No rules applied - item allowed as entered.';
  }

  const parts: string[] = [];

  // Status summary
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

  // Rule explanations
  for (const rule of state.appliedRules) {
    parts.push(`• [${rule.ruleSource.toUpperCase()}] ${rule.explanation}`);
  }

  // Documentation requirements
  if (state.documentationRequired.length > 0) {
    parts.push(`Required documentation: ${state.documentationRequired.join(', ')}`);
  }

  return parts.join('\n');
}

// ============================================
// DATABASE ACCESS
// ============================================

/**
 * Get carrier profile by ID
 */
async function getCarrierProfile(id: string): Promise<CarrierProfile | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM carrier_profiles WHERE id = $1 AND is_active = true`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get carrier rules for a profile
 */
async function getCarrierRules(carrierProfileId: string): Promise<CarrierRule[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM carrier_rules
       WHERE carrier_profile_id = $1
         AND is_active = true
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
       ORDER BY priority ASC`,
      [carrierProfileId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get carrier exclusions (quick lookup table)
 */
async function getCarrierExclusions(
  carrierProfileId: string
): Promise<CarrierExcludedItem[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM carrier_excluded_items
       WHERE carrier_profile_id = $1
         AND is_active = true
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)`,
      [carrierProfileId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get carrier caps (quick lookup table)
 */
async function getCarrierCaps(carrierProfileId: string): Promise<CarrierItemCap[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM carrier_item_caps
       WHERE carrier_profile_id = $1
         AND is_active = true
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)`,
      [carrierProfileId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get jurisdiction by ID
 */
async function getJurisdiction(id: string): Promise<Jurisdiction | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM jurisdictions WHERE id = $1 AND is_active = true`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get jurisdiction rules
 */
async function getJurisdictionRules(
  jurisdictionId: string
): Promise<JurisdictionRule[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM jurisdiction_rules
       WHERE jurisdiction_id = $1
         AND is_active = true
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
       ORDER BY priority ASC`,
      [jurisdictionId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Get all active carrier profiles
 */
export async function getActiveCarrierProfiles(): Promise<CarrierProfile[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM carrier_profiles WHERE is_active = true ORDER BY name`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get all active jurisdictions
 */
export async function getActiveJurisdictions(): Promise<Jurisdiction[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM jurisdictions WHERE is_active = true ORDER BY name`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Format rules evaluation result for display
 */
export function formatRulesResult(result: RulesEvaluationResult): string {
  const lines: string[] = [
    '=== Rules Evaluation Result ===',
    `Estimate: ${result.estimateId}`,
    `Evaluated: ${result.evaluatedAt.toISOString()}`,
    '',
    'Summary:',
    `  Total Items: ${result.totalItems}`,
    `  Allowed: ${result.allowedItems}`,
    `  Modified: ${result.modifiedItems}`,
    `  Denied: ${result.deniedItems}`,
    `  Warnings: ${result.warningItems}`,
    '',
  ];

  if (result.deniedItems > 0) {
    lines.push('DENIED ITEMS:');
    for (const item of result.lineItemResults.filter((r) => r.status === 'denied')) {
      lines.push(`  ${item.lineItemCode}: ${item.explanation}`);
    }
    lines.push('');
  }

  if (result.modifiedItems > 0) {
    lines.push('MODIFIED ITEMS:');
    for (const item of result.lineItemResults.filter((r) => r.status === 'modified')) {
      lines.push(`  ${item.lineItemCode}:`);
      if (item.modifiedQuantity !== undefined) {
        lines.push(`    Quantity: ${item.originalQuantity} → ${item.modifiedQuantity}`);
      }
      if (item.modifiedUnitPrice !== undefined) {
        lines.push(`    Unit Price: $${item.originalUnitPrice} → $${item.modifiedUnitPrice}`);
      }
      lines.push(`    ${item.explanation}`);
    }
    lines.push('');
  }

  if (result.estimateEffects.length > 0) {
    lines.push('ESTIMATE-LEVEL EFFECTS:');
    for (const effect of result.estimateEffects) {
      lines.push(`  [${effect.ruleSource.toUpperCase()}] ${effect.explanation}`);
    }
  }

  return lines.join('\n');
}
