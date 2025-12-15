/**
 * Estimate Validator - Claims IQ Sketch v2
 *
 * Validation and linting engine for estimates.
 * Flags logical errors, missing dependencies, and implausible quantities.
 *
 * DESIGN DECISIONS:
 * - Warnings only - does not block save
 * - Severity levels for prioritization
 * - Carrier-aware rules (some carriers are stricter)
 * - Every warning is actionable
 *
 * VALIDATION CATEGORIES:
 * 1. Dependency violations (install without prep, etc.)
 * 2. Quantity validation (exceeds plausible geometry)
 * 3. Exclusion conflicts (mutually exclusive items together)
 * 4. Replacement conflicts (replacement without removal)
 * 5. Completeness checks (missing common companions)
 */

import { pool } from '../db';
import {
  ZoneMetrics,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
  computeZoneMetrics,
} from './zoneMetrics';
import type { CatalogLineItem } from './scopeEngine';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Categories of validation issues
 */
export type ValidationCategory =
  | 'dependency'
  | 'quantity'
  | 'exclusion'
  | 'replacement'
  | 'completeness'
  | 'depreciation'
  | 'coverage';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Unique identifier for this issue type */
  code: string;

  /** Severity level */
  severity: ValidationSeverity;

  /** Category of the issue */
  category: ValidationCategory;

  /** Human-readable message */
  message: string;

  /** Detailed explanation */
  details?: string;

  /** Suggested fix */
  suggestion?: string;

  /** Related line item codes */
  relatedItems?: string[];

  /** Related zone ID */
  zoneId?: string;

  /** Related zone name */
  zoneName?: string;

  /** Carrier sensitivity - some carriers flag this more strictly */
  carrierSensitive?: boolean;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  /** Whether the estimate passed validation (no errors) */
  isValid: boolean;

  /** Total number of issues */
  issueCount: number;

  /** Issues by severity */
  errorCount: number;
  warningCount: number;
  infoCount: number;

  /** All issues */
  issues: ValidationIssue[];

  /** Issues grouped by category */
  byCategory: Record<ValidationCategory, ValidationIssue[]>;

  /** Issues grouped by zone */
  byZone: Record<string, ValidationIssue[]>;

  /** Validation metadata */
  meta: {
    validatedAt: Date;
    estimateId: string;
    lineItemCount: number;
    zoneCount: number;
  };
}

/**
 * Line item with zone context for validation
 */
export interface LineItemForValidation {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  categoryId?: string;
  zoneId?: string;
  zoneName?: string;
  coverageCode?: string;

  // Depreciation fields
  ageYears?: number;
  usefulLifeYears?: number;
  depreciationPct?: number;
  depreciationReason?: string;

  // Catalog reference
  catalogItem?: CatalogLineItem;
}

/**
 * Estimate context for validation
 */
export interface EstimateForValidation {
  id: string;
  lineItems: LineItemForValidation[];
  zones: Array<
    ZoneForMetrics & {
      id: string;
      name: string;
      missingWalls?: MissingWallForMetrics[];
      subrooms?: SubroomForMetrics[];
    }
  >;
  carrierProfileId?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Maximum plausible quantity multipliers by unit type */
const MAX_QUANTITY_MULTIPLIERS: Record<string, number> = {
  SF: 1.5, // 150% of computed area
  LF: 2.0, // 200% of perimeter
  SY: 1.5,
  SQ: 1.5,
  EA: 50, // Max 50 each items per zone
  HR: 100, // Max 100 hours per item per zone
  DAY: 30, // Max 30 days per item
  WK: 8, // Max 8 weeks
};

/** Common item pairs that should go together */
const COMMON_COMPANIONS: Record<string, string[]> = {
  // Drywall install typically needs paint
  'DRY-HTT-12': ['PAINT-INT-WALL', 'PAINT-PRIME-STD'],
  'DRY-HTT-58': ['PAINT-INT-WALL', 'PAINT-PRIME-STD'],
  'DRY-HTT-CEIL': ['PAINT-INT-CEIL'],

  // Floor demo typically needs haul
  'DEM-FLOOR-CARP': ['DEM-HAUL'],
  'DEM-FLOOR-VNL': ['DEM-HAUL'],
  'DEM-FLOOR-TILE': ['DEM-HAUL'],
  'DEM-FLOOR-HARD': ['DEM-HAUL'],

  // Water extraction typically needs drying
  'WTR-EXTRACT-PORT': ['WTR-DRY-DEHU', 'WTR-DRY-AIRMOV'],
  'WTR-EXTRACT-TRUCK': ['WTR-DRY-DEHU', 'WTR-DRY-AIRMOV'],

  // Category 2/3 water needs antimicrobial
  'WTR-ANTIMICROB': ['WTR-EXTRACT-PORT'],
};

/** Items that typically shouldn't be alone */
const STANDALONE_WARNINGS = new Set([
  'WTR-DRY-DEHU', // Dehu without extraction
  'WTR-DRY-AIRMOV', // Air mover without extraction
  'PAINT-INT-WALL', // Paint without primer (sometimes okay)
  'DEM-HAUL', // Haul without demo
]);

// ============================================
// MAIN API
// ============================================

/**
 * Validate an estimate
 */
export async function validateEstimate(
  estimate: EstimateForValidation
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // Get catalog items for reference
  const catalogItems = await getCatalogItems();
  const catalogMap = new Map(catalogItems.map((item) => [item.code, item]));

  // Enhance line items with catalog references
  const enhancedItems = estimate.lineItems.map((item) => ({
    ...item,
    catalogItem: catalogMap.get(item.code),
  }));

  // Compute zone metrics
  const zoneMetricsMap = new Map<string, ZoneMetrics>();
  for (const zone of estimate.zones) {
    const metrics = computeZoneMetrics(
      zone,
      zone.missingWalls || [],
      zone.subrooms || []
    );
    zoneMetricsMap.set(zone.id, metrics);
  }

  // Run all validations
  issues.push(...validateDependencies(enhancedItems, catalogMap));
  issues.push(...validateQuantities(enhancedItems, zoneMetricsMap, estimate.zones));
  issues.push(...validateExclusions(enhancedItems, catalogMap));
  issues.push(...validateReplacements(enhancedItems, catalogMap));
  issues.push(...validateCompleteness(enhancedItems));
  issues.push(...validateDepreciation(enhancedItems));
  issues.push(...validateCoverage(enhancedItems));

  // Calculate counts
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // Group by category
  const byCategory: Record<ValidationCategory, ValidationIssue[]> = {
    dependency: [],
    quantity: [],
    exclusion: [],
    replacement: [],
    completeness: [],
    depreciation: [],
    coverage: [],
  };

  for (const issue of issues) {
    byCategory[issue.category].push(issue);
  }

  // Group by zone
  const byZone: Record<string, ValidationIssue[]> = {};
  for (const issue of issues) {
    const zoneKey = issue.zoneId || 'global';
    if (!byZone[zoneKey]) {
      byZone[zoneKey] = [];
    }
    byZone[zoneKey].push(issue);
  }

  return {
    isValid: errorCount === 0,
    issueCount: issues.length,
    errorCount,
    warningCount,
    infoCount,
    issues,
    byCategory,
    byZone,
    meta: {
      validatedAt: new Date(),
      estimateId: estimate.id,
      lineItemCount: estimate.lineItems.length,
      zoneCount: estimate.zones.length,
    },
  };
}

// ============================================
// DEPENDENCY VALIDATION
// ============================================

/**
 * Validate that required dependencies are present
 */
function validateDependencies(
  items: LineItemForValidation[],
  catalogMap: Map<string, CatalogLineItem>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentCodes = new Set(items.map((i) => i.code));

  for (const item of items) {
    const catalog = catalogMap.get(item.code);
    if (!catalog?.requiresItems) continue;

    for (const requiredCode of catalog.requiresItems) {
      if (!presentCodes.has(requiredCode)) {
        issues.push({
          code: 'DEP001',
          severity: 'warning',
          category: 'dependency',
          message: `${item.code} requires ${requiredCode} which is missing`,
          details: `The line item "${item.description}" typically requires "${requiredCode}" as a prerequisite.`,
          suggestion: `Consider adding ${requiredCode} to the estimate`,
          relatedItems: [item.code, requiredCode],
          zoneId: item.zoneId,
          zoneName: item.zoneName,
          carrierSensitive: true,
        });
      }
    }
  }

  return issues;
}

// ============================================
// QUANTITY VALIDATION
// ============================================

/**
 * Validate quantities are within plausible ranges
 */
function validateQuantities(
  items: LineItemForValidation[],
  zoneMetrics: Map<string, ZoneMetrics>,
  zones: EstimateForValidation['zones']
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Group items by zone
  const itemsByZone = new Map<string, LineItemForValidation[]>();
  for (const item of items) {
    if (item.zoneId) {
      if (!itemsByZone.has(item.zoneId)) {
        itemsByZone.set(item.zoneId, []);
      }
      itemsByZone.get(item.zoneId)!.push(item);
    }
  }

  // Validate each zone's items
  for (const [zoneId, zoneItems] of itemsByZone) {
    const metrics = zoneMetrics.get(zoneId);
    if (!metrics) continue;

    const zone = zones.find((z) => z.id === zoneId);

    for (const item of zoneItems) {
      const maxMultiplier = MAX_QUANTITY_MULTIPLIERS[item.unit.toUpperCase()] || 10;
      let maxPlausible: number;

      switch (item.unit.toUpperCase()) {
        case 'SF':
          // For SF items, max is based on total paintable surface
          maxPlausible = (metrics.floorSquareFeet + metrics.ceilingSquareFeet + metrics.wallSquareFeet) * maxMultiplier;
          break;

        case 'LF':
          maxPlausible = metrics.perimeterLinearFeet * maxMultiplier;
          break;

        case 'SY':
          maxPlausible = (metrics.floorSquareFeet / 9) * maxMultiplier;
          break;

        case 'SQ':
          maxPlausible = ((metrics.roofSquareFeet || metrics.floorSquareFeet) / 100) * maxMultiplier;
          break;

        default:
          maxPlausible = maxMultiplier;
      }

      if (item.quantity > maxPlausible) {
        issues.push({
          code: 'QTY001',
          severity: 'warning',
          category: 'quantity',
          message: `Quantity ${item.quantity} ${item.unit} for ${item.code} exceeds plausible maximum`,
          details: `Based on zone geometry, maximum expected is ~${Math.round(maxPlausible)} ${item.unit}`,
          suggestion: 'Verify the quantity is correct or that the zone dimensions are accurate',
          relatedItems: [item.code],
          zoneId,
          zoneName: zone?.name,
          carrierSensitive: true,
        });
      }

      // Check for zero quantities
      if (item.quantity <= 0) {
        issues.push({
          code: 'QTY002',
          severity: 'error',
          category: 'quantity',
          message: `${item.code} has zero or negative quantity`,
          details: `Quantity is ${item.quantity}, which is invalid`,
          suggestion: 'Remove the item or correct the quantity',
          relatedItems: [item.code],
          zoneId,
          zoneName: zone?.name,
        });
      }
    }
  }

  return issues;
}

// ============================================
// EXCLUSION VALIDATION
// ============================================

/**
 * Validate that mutually exclusive items aren't both present
 */
function validateExclusions(
  items: LineItemForValidation[],
  catalogMap: Map<string, CatalogLineItem>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentCodes = new Set(items.map((i) => i.code));

  for (const item of items) {
    const catalog = catalogMap.get(item.code);
    if (!catalog?.excludesItems) continue;

    for (const excludedCode of catalog.excludesItems) {
      if (presentCodes.has(excludedCode)) {
        // Only report once per pair
        if (item.code < excludedCode) {
          issues.push({
            code: 'EXC001',
            severity: 'warning',
            category: 'exclusion',
            message: `${item.code} and ${excludedCode} are mutually exclusive`,
            details: 'These items should not typically appear together on the same estimate',
            suggestion: 'Review whether both items are necessary',
            relatedItems: [item.code, excludedCode],
            carrierSensitive: true,
          });
        }
      }
    }
  }

  return issues;
}

// ============================================
// REPLACEMENT VALIDATION
// ============================================

/**
 * Validate that replacement items properly replace their targets
 */
function validateReplacements(
  items: LineItemForValidation[],
  catalogMap: Map<string, CatalogLineItem>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentCodes = new Set(items.map((i) => i.code));

  for (const item of items) {
    const catalog = catalogMap.get(item.code);
    if (!catalog?.replacesItems) continue;

    for (const replacedCode of catalog.replacesItems) {
      if (presentCodes.has(replacedCode)) {
        issues.push({
          code: 'REP001',
          severity: 'warning',
          category: 'replacement',
          message: `${item.code} should replace ${replacedCode}, but both are present`,
          details: `${item.code} is intended to replace ${replacedCode}, which should be removed`,
          suggestion: `Remove ${replacedCode} from the estimate`,
          relatedItems: [item.code, replacedCode],
          carrierSensitive: true,
        });
      }
    }
  }

  return issues;
}

// ============================================
// COMPLETENESS VALIDATION
// ============================================

/**
 * Validate common companion items and standalone warnings
 */
function validateCompleteness(items: LineItemForValidation[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const presentCodes = new Set(items.map((i) => i.code));

  // Check for missing common companions
  for (const item of items) {
    const companions = COMMON_COMPANIONS[item.code];
    if (companions) {
      const missingCompanions = companions.filter((c) => !presentCodes.has(c));
      if (missingCompanions.length > 0 && missingCompanions.length === companions.length) {
        issues.push({
          code: 'CMP001',
          severity: 'info',
          category: 'completeness',
          message: `${item.code} typically includes companion items`,
          details: `Common companions: ${companions.join(', ')}`,
          suggestion: 'Consider if these items should be added',
          relatedItems: [item.code, ...companions],
          zoneId: item.zoneId,
          zoneName: item.zoneName,
        });
      }
    }
  }

  // Check for standalone warnings
  for (const item of items) {
    if (STANDALONE_WARNINGS.has(item.code)) {
      // Check if any related items are present
      const hasRelated = Object.entries(COMMON_COMPANIONS).some(
        ([code, companions]) =>
          companions.includes(item.code) && presentCodes.has(code)
      );

      if (!hasRelated) {
        issues.push({
          code: 'CMP002',
          severity: 'info',
          category: 'completeness',
          message: `${item.code} is present without related setup items`,
          details: 'This item is typically used in conjunction with other items',
          suggestion: 'Verify this item is needed independently',
          relatedItems: [item.code],
          zoneId: item.zoneId,
          zoneName: item.zoneName,
        });
      }
    }
  }

  return issues;
}

// ============================================
// DEPRECIATION VALIDATION
// ============================================

/**
 * Validate depreciation calculations
 */
function validateDepreciation(items: LineItemForValidation[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const item of items) {
    // Check for missing depreciation reason
    if (item.depreciationPct && item.depreciationPct > 0 && !item.depreciationReason) {
      issues.push({
        code: 'DEP001',
        severity: 'info',
        category: 'depreciation',
        message: `${item.code} has depreciation but no explanation`,
        details: `Depreciation is ${item.depreciationPct}% but no reason is documented`,
        suggestion: 'Add a depreciation reason for audit trail',
        relatedItems: [item.code],
        zoneId: item.zoneId,
        zoneName: item.zoneName,
      });
    }

    // Check for age exceeding useful life
    if (item.ageYears && item.usefulLifeYears && item.ageYears > item.usefulLifeYears) {
      issues.push({
        code: 'DEP002',
        severity: 'warning',
        category: 'depreciation',
        message: `${item.code} age (${item.ageYears}y) exceeds useful life (${item.usefulLifeYears}y)`,
        details: 'Item may be at maximum depreciation',
        relatedItems: [item.code],
        zoneId: item.zoneId,
        zoneName: item.zoneName,
      });
    }

    // Check for high depreciation without age
    if (item.depreciationPct && item.depreciationPct > 50 && !item.ageYears) {
      issues.push({
        code: 'DEP003',
        severity: 'warning',
        category: 'depreciation',
        message: `${item.code} has high depreciation (${item.depreciationPct}%) but no age documented`,
        details: 'Age should be documented for significant depreciation',
        suggestion: 'Add age_years to support the depreciation calculation',
        relatedItems: [item.code],
        zoneId: item.zoneId,
        zoneName: item.zoneName,
        carrierSensitive: true,
      });
    }
  }

  return issues;
}

// ============================================
// COVERAGE VALIDATION
// ============================================

/**
 * Validate coverage assignments
 */
function validateCoverage(items: LineItemForValidation[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for items without coverage assignment
  const noCoverage = items.filter((i) => !i.coverageCode);
  if (noCoverage.length > 0) {
    issues.push({
      code: 'COV001',
      severity: 'info',
      category: 'coverage',
      message: `${noCoverage.length} item(s) have no coverage assignment`,
      details: `Items: ${noCoverage.slice(0, 5).map((i) => i.code).join(', ')}${noCoverage.length > 5 ? '...' : ''}`,
      suggestion: 'Assign coverage codes (A, B, C) to all items',
      relatedItems: noCoverage.map((i) => i.code),
    });
  }

  return issues;
}

// ============================================
// DATABASE HELPERS
// ============================================

/**
 * Get catalog items from database
 */
async function getCatalogItems(): Promise<CatalogLineItem[]> {
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
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================
// FORMATTING
// ============================================

/**
 * Format validation result for human-readable output
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [
    `=== Estimate Validation ===`,
    `Status: ${result.isValid ? 'PASSED' : 'FAILED'}`,
    `Issues: ${result.errorCount} errors, ${result.warningCount} warnings, ${result.infoCount} info`,
    '',
  ];

  if (result.issues.length === 0) {
    lines.push('No issues found.');
    return lines.join('\n');
  }

  // Group by severity
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  const infos = result.issues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    lines.push('ERRORS:');
    for (const issue of errors) {
      lines.push(`  [${issue.code}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    Suggestion: ${issue.suggestion}`);
      }
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('WARNINGS:');
    for (const issue of warnings) {
      lines.push(`  [${issue.code}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    Suggestion: ${issue.suggestion}`);
      }
    }
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push('INFO:');
    for (const issue of infos) {
      lines.push(`  [${issue.code}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get a summary of validation issues for API response
 */
export function getValidationSummary(result: ValidationResult): {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  topIssues: Array<{ code: string; severity: string; message: string }>;
} {
  return {
    isValid: result.isValid,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    infoCount: result.infoCount,
    topIssues: result.issues.slice(0, 10).map((i) => ({
      code: i.code,
      severity: i.severity,
      message: i.message,
    })),
  };
}
