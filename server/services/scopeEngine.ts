/**
 * Scope Engine - Claims IQ Sketch v2
 *
 * Deterministic scope evaluation engine that determines which line items
 * apply to a zone based on damage attributes and conditions.
 *
 * DESIGN DECISIONS:
 * - Completely deterministic - no AI, no randomness
 * - Every decision is explainable with clear reasons
 * - Handles dependencies, exclusions, and automatic additions
 * - Outputs a complete scope recommendation with explanations
 *
 * SCOPE CONDITIONS SCHEMA:
 * {
 *   damageType: ["water", "fire"],       // Any of these damage types
 *   waterCategory: [2, 3],               // IICRC water categories
 *   waterClass: [2, 3, 4],               // IICRC water classes
 *   affectedSurfaces: ["wall", "floor"], // Affected surfaces
 *   damageSeverity: ["moderate", "severe"],
 *   minQuantity: 100,                    // Minimum quantity threshold
 *   zoneType: ["room", "elevation"],     // Zone types
 * }
 */

import { pool } from '../db';
import {
  ZoneMetrics,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
  computeZoneMetrics,
} from './zoneMetrics';
import {
  calculateQuantityFromMetrics,
  QuantityResult,
} from './quantityEngine';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Scope conditions for a line item
 * All conditions are optional - item applies if ALL specified conditions match
 */
export interface ScopeConditions {
  /** Damage types that trigger this item */
  damageType?: string[];

  /** IICRC water categories (1=clean, 2=gray, 3=black) */
  waterCategory?: number[];

  /** IICRC water classes (1-4, evaporation potential) */
  waterClass?: number[];

  /** Affected surfaces that trigger this item */
  affectedSurfaces?: string[];

  /** Damage severity levels */
  damageSeverity?: string[];

  /** Minimum quantity threshold (item only applies if qty >= this) */
  minQuantity?: number;

  /** Zone types where this item applies */
  zoneType?: string[];

  /** Room types where this item applies */
  roomType?: string[];

  /** Floor levels where this item applies */
  floorLevel?: string[];

  /** Custom conditions (for extensibility) */
  custom?: Record<string, any>;
}

/**
 * Line item from the catalog with v2 fields
 */
export interface CatalogLineItem {
  id: string;
  code: string;
  description: string;
  categoryId: string;
  unit: string;

  // v2 fields
  quantityFormula?: string | null;
  scopeConditions?: ScopeConditions | null;
  requiresItems?: string[] | null;
  autoAddItems?: string[] | null;
  excludesItems?: string[] | null;
  replacesItems?: string[] | null;

  // Classification
  defaultCoverageCode?: string;
  defaultTrade?: string;
  carrierSensitivityLevel?: string;
}

/**
 * Zone damage attributes for scope evaluation
 */
export interface ZoneDamageAttributes {
  damageType?: string;
  damageSeverity?: string;
  waterCategory?: number;
  waterClass?: number;
  affectedSurfaces?: string[];
  zoneType?: string;
  roomType?: string;
  floorLevel?: string;
}

/**
 * Reason why an item was included or excluded
 */
export interface ScopeReason {
  type: 'condition_match' | 'dependency' | 'auto_add' | 'exclusion' | 'replacement' | 'manual';
  description: string;
  matchedConditions?: string[];
  triggeredBy?: string;
}

/**
 * A suggested line item from scope evaluation
 */
export interface SuggestedLineItem {
  lineItem: CatalogLineItem;
  quantity: QuantityResult;
  reasons: ScopeReason[];
  priority: number;
  isRequired: boolean;
  isAutoAdded: boolean;
  excludedBy?: string[];
  replacedBy?: string;
}

/**
 * Result of scope evaluation for a zone
 */
export interface ScopeEvaluationResult {
  zoneId: string;
  zoneName: string;
  metrics: ZoneMetrics;
  damageAttributes: ZoneDamageAttributes;

  /** Items that should be included */
  suggestedItems: SuggestedLineItem[];

  /** Items that were excluded and why */
  excludedItems: Array<{
    code: string;
    reason: string;
    excludedBy?: string;
  }>;

  /** Items that were replaced by others */
  replacedItems: Array<{
    code: string;
    replacedBy: string;
  }>;

  /** Dependency warnings (required items missing) */
  dependencyWarnings: Array<{
    itemCode: string;
    missingDependency: string;
    message: string;
  }>;

  /** Evaluation metadata */
  meta: {
    evaluatedAt: Date;
    itemsEvaluated: number;
    itemsMatched: number;
    isComplete: boolean;
  };
}

/**
 * Scope evaluation for an entire estimate
 */
export interface EstimateScopeResult {
  estimateId: string;
  zones: ScopeEvaluationResult[];
  summary: {
    totalSuggestedItems: number;
    totalExcludedItems: number;
    dependencyWarnings: number;
    coverageBreakdown: Record<string, number>;
  };
  evaluatedAt: Date;
}

// ============================================
// MAIN API
// ============================================

/**
 * Evaluate scope for a single zone
 */
export async function evaluateZoneScope(
  zone: ZoneForMetrics & ZoneDamageAttributes & { id: string; name: string },
  missingWalls: MissingWallForMetrics[] = [],
  subrooms: SubroomForMetrics[] = [],
  catalogItems?: CatalogLineItem[]
): Promise<ScopeEvaluationResult> {
  // Get catalog items if not provided
  const items = catalogItems || (await getCatalogItemsWithV2Fields());

  // Compute zone metrics
  const metrics = computeZoneMetrics(zone, missingWalls, subrooms);

  // Extract damage attributes
  const damageAttributes: ZoneDamageAttributes = {
    damageType: zone.damageType,
    damageSeverity: zone.damageSeverity,
    waterCategory: zone.waterCategory,
    waterClass: zone.waterClass,
    affectedSurfaces: zone.affectedSurfaces,
    zoneType: zone.zoneType,
    roomType: zone.roomType,
    floorLevel: zone.floorLevel,
  };

  // Phase 1: Evaluate conditions for all items
  const conditionMatches = evaluateConditions(items, damageAttributes, metrics);

  // Phase 2: Calculate quantities for matched items
  const withQuantities = calculateQuantities(conditionMatches, metrics);

  // Phase 3: Process dependencies and auto-adds
  const withDependencies = processDependencies(withQuantities, items);

  // Phase 4: Process exclusions and replacements
  const { suggested, excluded, replaced } = processExclusions(withDependencies);

  // Phase 5: Check for missing dependencies
  const dependencyWarnings = checkDependencies(suggested, items);

  // Sort by priority
  suggested.sort((a, b) => b.priority - a.priority);

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    metrics,
    damageAttributes,
    suggestedItems: suggested,
    excludedItems: excluded,
    replacedItems: replaced,
    dependencyWarnings,
    meta: {
      evaluatedAt: new Date(),
      itemsEvaluated: items.length,
      itemsMatched: suggested.length,
      isComplete: dependencyWarnings.length === 0,
    },
  };
}

/**
 * Evaluate scope for an entire estimate
 */
export async function evaluateEstimateScope(
  estimateId: string,
  zones: Array<
    ZoneForMetrics &
      ZoneDamageAttributes & {
        id: string;
        name: string;
        missingWalls?: MissingWallForMetrics[];
        subrooms?: SubroomForMetrics[];
      }
  >
): Promise<EstimateScopeResult> {
  // Get catalog items once for all zones
  const catalogItems = await getCatalogItemsWithV2Fields();

  // Evaluate each zone
  const zoneResults = await Promise.all(
    zones.map((zone) =>
      evaluateZoneScope(
        zone,
        zone.missingWalls || [],
        zone.subrooms || [],
        catalogItems
      )
    )
  );

  // Calculate summary
  const coverageBreakdown: Record<string, number> = {};
  let totalSuggested = 0;
  let totalExcluded = 0;
  let totalWarnings = 0;

  for (const result of zoneResults) {
    totalSuggested += result.suggestedItems.length;
    totalExcluded += result.excludedItems.length;
    totalWarnings += result.dependencyWarnings.length;

    for (const item of result.suggestedItems) {
      const coverage = item.lineItem.defaultCoverageCode || 'A';
      coverageBreakdown[coverage] = (coverageBreakdown[coverage] || 0) + 1;
    }
  }

  return {
    estimateId,
    zones: zoneResults,
    summary: {
      totalSuggestedItems: totalSuggested,
      totalExcludedItems: totalExcluded,
      dependencyWarnings: totalWarnings,
      coverageBreakdown,
    },
    evaluatedAt: new Date(),
  };
}

// ============================================
// CONDITION EVALUATION
// ============================================

/**
 * Evaluate scope conditions for all items against zone attributes
 */
function evaluateConditions(
  items: CatalogLineItem[],
  damage: ZoneDamageAttributes,
  metrics: ZoneMetrics
): Array<{ item: CatalogLineItem; reasons: ScopeReason[]; priority: number }> {
  const matches: Array<{ item: CatalogLineItem; reasons: ScopeReason[]; priority: number }> = [];

  for (const item of items) {
    const conditions = item.scopeConditions;

    // If no conditions, item doesn't auto-apply (must be manually added)
    if (!conditions || Object.keys(conditions).length === 0) {
      continue;
    }

    const matchResult = evaluateSingleCondition(conditions, damage, metrics);

    if (matchResult.matches) {
      matches.push({
        item,
        reasons: [
          {
            type: 'condition_match',
            description: `Matched scope conditions: ${matchResult.matchedConditions.join(', ')}`,
            matchedConditions: matchResult.matchedConditions,
          },
        ],
        priority: calculatePriority(item, matchResult.matchedConditions.length),
      });
    }
  }

  return matches;
}

/**
 * Evaluate a single item's conditions against zone attributes
 */
function evaluateSingleCondition(
  conditions: ScopeConditions,
  damage: ZoneDamageAttributes,
  metrics: ZoneMetrics
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

  // Check water class
  if (conditions.waterClass && conditions.waterClass.length > 0) {
    if (!damage.waterClass || !conditions.waterClass.includes(damage.waterClass)) {
      return { matches: false, matchedConditions };
    }
    matchedConditions.push(`waterClass=${damage.waterClass}`);
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

  // Check damage severity
  if (conditions.damageSeverity && conditions.damageSeverity.length > 0) {
    if (
      !damage.damageSeverity ||
      !conditions.damageSeverity.map((s) => s.toLowerCase()).includes(damage.damageSeverity.toLowerCase())
    ) {
      return { matches: false, matchedConditions };
    }
    matchedConditions.push(`damageSeverity=${damage.damageSeverity}`);
  }

  // Check zone type
  if (conditions.zoneType && conditions.zoneType.length > 0) {
    if (!damage.zoneType || !conditions.zoneType.includes(damage.zoneType.toLowerCase())) {
      return { matches: false, matchedConditions };
    }
    matchedConditions.push(`zoneType=${damage.zoneType}`);
  }

  // Check room type
  if (conditions.roomType && conditions.roomType.length > 0) {
    if (!damage.roomType || !conditions.roomType.map((r) => r.toLowerCase()).includes(damage.roomType.toLowerCase())) {
      return { matches: false, matchedConditions };
    }
    matchedConditions.push(`roomType=${damage.roomType}`);
  }

  // Check floor level
  if (conditions.floorLevel && conditions.floorLevel.length > 0) {
    if (
      !damage.floorLevel ||
      !conditions.floorLevel.map((f) => f.toLowerCase()).includes(damage.floorLevel.toLowerCase())
    ) {
      return { matches: false, matchedConditions };
    }
    matchedConditions.push(`floorLevel=${damage.floorLevel}`);
  }

  // If we got here with at least one matched condition, it's a match
  return {
    matches: matchedConditions.length > 0,
    matchedConditions,
  };
}

/**
 * Calculate priority for sorting (higher = more important)
 */
function calculatePriority(item: CatalogLineItem, conditionCount: number): number {
  let priority = conditionCount * 10;

  // Emergency/setup items get higher priority
  if (item.code.includes('EMERG') || item.code.includes('SETUP')) {
    priority += 100;
  }

  // Mitigation items before rebuild
  if (item.categoryId?.startsWith('01')) {
    priority += 50;
  }

  // Demo before install
  if (item.categoryId?.startsWith('02')) {
    priority += 40;
  }

  return priority;
}

// ============================================
// QUANTITY CALCULATION
// ============================================

/**
 * Calculate quantities for matched items
 */
function calculateQuantities(
  matches: Array<{ item: CatalogLineItem; reasons: ScopeReason[]; priority: number }>,
  metrics: ZoneMetrics
): Array<{ item: CatalogLineItem; quantity: QuantityResult; reasons: ScopeReason[]; priority: number }> {
  return matches.map((match) => {
    let quantity: QuantityResult;

    if (match.item.quantityFormula) {
      quantity = calculateQuantityFromMetrics(match.item.quantityFormula, metrics);
    } else {
      // Default quantity based on unit type
      quantity = getDefaultQuantity(match.item.unit, metrics);
    }

    return {
      ...match,
      quantity,
    };
  });
}

/**
 * Get default quantity based on unit type and metrics
 */
function getDefaultQuantity(unit: string, metrics: ZoneMetrics): QuantityResult {
  const unitUpper = unit.toUpperCase();

  switch (unitUpper) {
    case 'SF':
      return {
        quantity: metrics.floorSquareFeet,
        source: 'default',
        explanation: 'Default: floor square footage',
        success: true,
      };

    case 'LF':
      return {
        quantity: metrics.perimeterLinearFeet,
        source: 'default',
        explanation: 'Default: floor perimeter',
        success: true,
      };

    case 'SY':
      return {
        quantity: Math.ceil(metrics.floorSquareFeet / 9),
        source: 'default',
        explanation: 'Default: floor SF / 9 (square yards)',
        success: true,
      };

    case 'SQ':
      return {
        quantity: metrics.roofSquares || Math.ceil(metrics.floorSquareFeet / 100),
        source: 'default',
        explanation: 'Default: roofing squares',
        success: true,
      };

    case 'EA':
    case 'HR':
    case 'DAY':
    case 'WK':
      return {
        quantity: 1,
        source: 'default',
        explanation: `Default: 1 ${unit}`,
        success: true,
      };

    default:
      return {
        quantity: 1,
        source: 'default',
        explanation: `Default: 1 (unknown unit ${unit})`,
        success: true,
      };
  }
}

// ============================================
// DEPENDENCY PROCESSING
// ============================================

/**
 * Process auto-add items and build dependency tree
 */
function processDependencies(
  matches: Array<{ item: CatalogLineItem; quantity: QuantityResult; reasons: ScopeReason[]; priority: number }>,
  allItems: CatalogLineItem[]
): Array<{ item: CatalogLineItem; quantity: QuantityResult; reasons: ScopeReason[]; priority: number; isAutoAdded: boolean }> {
  const itemMap = new Map(allItems.map((item) => [item.code, item]));
  const matchedCodes = new Set(matches.map((m) => m.item.code));
  const result = matches.map((m) => ({ ...m, isAutoAdded: false }));
  const added = new Set<string>();

  // Process auto-adds from matched items
  for (const match of matches) {
    if (match.item.autoAddItems) {
      for (const code of match.item.autoAddItems) {
        if (!matchedCodes.has(code) && !added.has(code)) {
          const autoItem = itemMap.get(code);
          if (autoItem) {
            added.add(code);
            result.push({
              item: autoItem,
              quantity: getDefaultQuantity(autoItem.unit, {} as ZoneMetrics),
              reasons: [
                {
                  type: 'auto_add',
                  description: `Auto-added by ${match.item.code}`,
                  triggeredBy: match.item.code,
                },
              ],
              priority: match.priority - 1,
              isAutoAdded: true,
            });
          }
        }
      }
    }
  }

  return result;
}

/**
 * Check for missing required dependencies
 */
function checkDependencies(
  suggested: SuggestedLineItem[],
  allItems: CatalogLineItem[]
): Array<{ itemCode: string; missingDependency: string; message: string }> {
  const warnings: Array<{ itemCode: string; missingDependency: string; message: string }> = [];
  const suggestedCodes = new Set(suggested.map((s) => s.lineItem.code));

  for (const item of suggested) {
    if (item.lineItem.requiresItems) {
      for (const requiredCode of item.lineItem.requiresItems) {
        if (!suggestedCodes.has(requiredCode)) {
          warnings.push({
            itemCode: item.lineItem.code,
            missingDependency: requiredCode,
            message: `${item.lineItem.code} requires ${requiredCode} which is not in scope`,
          });
        }
      }
    }
  }

  return warnings;
}

// ============================================
// EXCLUSION PROCESSING
// ============================================

/**
 * Process exclusions and replacements
 */
function processExclusions(
  items: Array<{
    item: CatalogLineItem;
    quantity: QuantityResult;
    reasons: ScopeReason[];
    priority: number;
    isAutoAdded: boolean;
  }>
): {
  suggested: SuggestedLineItem[];
  excluded: Array<{ code: string; reason: string; excludedBy?: string }>;
  replaced: Array<{ code: string; replacedBy: string }>;
} {
  const suggested: SuggestedLineItem[] = [];
  const excluded: Array<{ code: string; reason: string; excludedBy?: string }> = [];
  const replaced: Array<{ code: string; replacedBy: string }> = [];

  // Build sets for lookups
  const allCodes = new Set(items.map((i) => i.item.code));
  const excludedCodes = new Set<string>();
  const replacedCodes = new Map<string, string>();

  // First pass: identify exclusions and replacements
  for (const item of items) {
    // Process exclusions
    if (item.item.excludesItems) {
      for (const excludedCode of item.item.excludesItems) {
        if (allCodes.has(excludedCode)) {
          excludedCodes.add(excludedCode);
          excluded.push({
            code: excludedCode,
            reason: `Excluded by ${item.item.code}`,
            excludedBy: item.item.code,
          });
        }
      }
    }

    // Process replacements
    if (item.item.replacesItems) {
      for (const replacedCode of item.item.replacesItems) {
        if (allCodes.has(replacedCode)) {
          replacedCodes.set(replacedCode, item.item.code);
          replaced.push({
            code: replacedCode,
            replacedBy: item.item.code,
          });
        }
      }
    }
  }

  // Second pass: build suggested list excluding removed items
  for (const item of items) {
    if (excludedCodes.has(item.item.code)) {
      continue;
    }
    if (replacedCodes.has(item.item.code)) {
      continue;
    }

    suggested.push({
      lineItem: item.item,
      quantity: item.quantity,
      reasons: item.reasons,
      priority: item.priority,
      isRequired: item.item.requiresItems?.length ? true : false,
      isAutoAdded: item.isAutoAdded,
    });
  }

  return { suggested, excluded, replaced };
}

// ============================================
// DATABASE HELPERS
// ============================================

/**
 * Get catalog items with v2 fields from database
 */
export async function getCatalogItemsWithV2Fields(): Promise<CatalogLineItem[]> {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        code,
        description,
        category_id as "categoryId",
        unit,
        quantity_formula as "quantityFormula",
        scope_conditions as "scopeConditions",
        requires_items as "requiresItems",
        auto_add_items as "autoAddItems",
        excludes_items as "excludesItems",
        replaces_items as "replacesItems",
        default_coverage_code as "defaultCoverageCode",
        trade_code as "defaultTrade",
        carrier_sensitivity_level as "carrierSensitivityLevel"
      FROM line_items
      WHERE is_active = true
      ORDER BY category_id, code
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Format scope result for human-readable output
 */
export function formatScopeResult(result: ScopeEvaluationResult): string {
  const lines: string[] = [
    `=== Scope Evaluation: ${result.zoneName} ===`,
    `Zone ID: ${result.zoneId}`,
    `Damage: ${result.damageAttributes.damageType || 'N/A'} (${result.damageAttributes.damageSeverity || 'N/A'})`,
    '',
    `Suggested Items (${result.suggestedItems.length}):`,
  ];

  for (const item of result.suggestedItems) {
    lines.push(
      `  - ${item.lineItem.code}: ${item.quantity.quantity} ${item.lineItem.unit}`
    );
    lines.push(`    ${item.reasons.map((r) => r.description).join('; ')}`);
  }

  if (result.excludedItems.length > 0) {
    lines.push('');
    lines.push(`Excluded Items (${result.excludedItems.length}):`);
    for (const item of result.excludedItems) {
      lines.push(`  - ${item.code}: ${item.reason}`);
    }
  }

  if (result.dependencyWarnings.length > 0) {
    lines.push('');
    lines.push(`Warnings (${result.dependencyWarnings.length}):`);
    for (const warning of result.dependencyWarnings) {
      lines.push(`  - ${warning.message}`);
    }
  }

  return lines.join('\n');
}
