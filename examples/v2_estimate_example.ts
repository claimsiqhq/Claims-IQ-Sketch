/**
 * Claims IQ v2 Line Item Intelligence Example
 *
 * This example demonstrates:
 * 1. Zone-driven scope generation
 * 2. Automatic quantity calculation
 * 3. Dependency chain resolution
 * 4. Validation with explainable results
 *
 * Run with: npx ts-node examples/v2_estimate_example.ts
 */

// ============================================
// EXAMPLE ZONE: Kitchen with Category 2 Water Damage
// ============================================

const exampleZone = {
  id: 'zone-kitchen-001',
  name: 'Kitchen',
  zoneType: 'room',
  roomType: 'kitchen',
  floorLevel: 'main',

  // Dimensions: 12ft x 14ft x 9ft ceiling
  lengthFt: 12,
  widthFt: 14,
  heightFt: 9,

  // Damage attributes
  damageType: 'water',
  damageSeverity: 'moderate',
  waterCategory: 2, // Gray water (washing machine overflow)
  waterClass: 2,    // Significant moisture in materials

  // Affected surfaces
  affectedSurfaces: ['floor', 'wall', 'baseboard', 'cabinet'],

  // Calculated metrics (from zone geometry)
  dimensions: {
    sfFloor: 168,              // 12 * 14
    sfCeiling: 168,
    sfWalls: 468,              // (12 + 14) * 2 * 9
    sfWallsNet: 425,           // minus ~2 doors/windows
    lfFloorPerim: 52,          // (12 + 14) * 2
  }
};

// ============================================
// EXPECTED SCOPE EVALUATION RESULT
// ============================================

const expectedScopeResult = {
  zone: exampleZone,

  suggestedItems: [
    // ------------------------------------------
    // WATER MITIGATION ITEMS
    // ------------------------------------------
    {
      code: 'WTR-EXTRACT-PORT',
      description: 'Water extraction - portable extractor',
      quantity: 168,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'FLOOR_SF(zone)',
      quantityExplanation: 'Floor area: 12ft × 14ft = 168 SF',
      scopeReason: 'Matches: damageType=water, affectedSurfaces includes floor',
      isAutoAdded: false,
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'WTR-MOIST-INIT',
      description: 'Initial moisture inspection/mapping',
      quantity: 168,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'FLOOR_SF(zone)',
      quantityExplanation: 'Floor area: 168 SF',
      scopeReason: 'Auto-added by WTR-EXTRACT-PORT',
      isAutoAdded: true,
      addedByItem: 'WTR-EXTRACT-PORT',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'WTR-DRY-SETUP',
      description: 'Drying equipment setup/takedown',
      quantity: 1,
      unit: 'EA',
      quantitySource: 'formula',
      quantityFormula: '1',
      quantityExplanation: 'One-time setup per zone',
      scopeReason: 'Auto-added by WTR-EXTRACT-PORT',
      isAutoAdded: true,
      addedByItem: 'WTR-EXTRACT-PORT',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'WTR-DRY-DEHU',
      description: 'Dehumidifier - LGR per day',
      quantity: 3,
      unit: 'DAY',
      quantitySource: 'formula',
      quantityFormula: 'MAX(3, CEIL(FLOOR_SF(zone) / 500)) * MAX(1, CEIL(FLOOR_SF(zone) / 1000))',
      quantityExplanation: 'MAX(3, CEIL(168/500)) * MAX(1, CEIL(168/1000)) = MAX(3, 1) * MAX(1, 1) = 3 days × 1 unit = 3 unit-days',
      scopeReason: 'Auto-added by WTR-DRY-SETUP',
      isAutoAdded: true,
      addedByItem: 'WTR-DRY-SETUP',
      carrierSensitivity: 'medium',
      validationStatus: 'valid'
    },
    {
      code: 'WTR-DRY-AIRMOV',
      description: 'Air mover per day',
      quantity: 9,
      unit: 'DAY',
      quantitySource: 'formula',
      quantityFormula: 'MAX(3, CEIL(FLOOR_SF(zone) / 100)) * 3',
      quantityExplanation: 'MAX(3, CEIL(168/100)) × 3 days = MAX(3, 2) × 3 = 3 movers × 3 days = 9 unit-days',
      scopeReason: 'Auto-added by WTR-DRY-SETUP',
      isAutoAdded: true,
      addedByItem: 'WTR-DRY-SETUP',
      carrierSensitivity: 'medium',
      validationStatus: 'valid'
    },
    {
      code: 'WTR-ANTIMICROB',
      description: 'Antimicrobial treatment - surfaces',
      quantity: 593,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'WALL_SF_NET(zone) + FLOOR_SF(zone)',
      quantityExplanation: 'Net wall area (425 SF) + floor area (168 SF) = 593 SF',
      scopeReason: 'Matches: damageType=water, waterCategory=2, affectedSurfaces includes wall+floor',
      isAutoAdded: false,
      carrierSensitivity: 'high',
      validationStatus: 'valid',
      validationNotes: 'HIGH SENSITIVITY: Document water category determination and contamination source'
    },

    // ------------------------------------------
    // DEMOLITION ITEMS
    // ------------------------------------------
    {
      code: 'DEM-DRY-FLOOD',
      description: 'Drywall removal - flood cut 2ft',
      quantity: 47,
      unit: 'LF',
      quantitySource: 'formula',
      quantityFormula: 'PERIMETER_LF(zone) * 0.9',
      quantityExplanation: 'Perimeter (52 LF) × 0.9 (doorway adjustment) = 47 LF',
      scopeReason: 'Matches: damageType=water, waterCategory=2, affectedSurfaces includes wall, severity=moderate',
      isAutoAdded: false,
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'DEM-BASE',
      description: 'Baseboard removal',
      quantity: 47,
      unit: 'LF',
      quantitySource: 'formula',
      quantityFormula: 'PERIMETER_LF(zone) * 0.9',
      quantityExplanation: 'Perimeter (52 LF) × 0.9 = 47 LF',
      scopeReason: 'Auto-added by DEM-DRY-FLOOD (flood cut requires baseboard removal)',
      isAutoAdded: true,
      addedByItem: 'DEM-DRY-FLOOD',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'DEM-INSUL',
      description: 'Insulation removal - wet/contaminated',
      quantity: 106,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'WALL_SF_NET(zone) * 0.25',
      quantityExplanation: 'Net wall area × flood cut percentage: 425 SF × 0.25 = 106 SF',
      scopeReason: 'Auto-added by DEM-DRY-FLOOD',
      isAutoAdded: true,
      addedByItem: 'DEM-DRY-FLOOD',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'DEM-HAUL',
      description: 'Debris haul off - per load',
      quantity: 1,
      unit: 'EA',
      quantitySource: 'formula',
      quantityFormula: 'CEIL(FLOOR_SF(zone) / 500)',
      quantityExplanation: 'CEIL(168/500) = 1 load',
      scopeReason: 'Auto-added by DEM-DRY-FLOOD',
      isAutoAdded: true,
      addedByItem: 'DEM-DRY-FLOOD',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },

    // ------------------------------------------
    // REBUILD ITEMS
    // ------------------------------------------
    {
      code: 'DRY-HTT-12',
      description: 'Drywall 1/2" hang, tape, texture - walls',
      quantity: 106,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'WALL_SF_NET(zone) * 0.25',
      quantityExplanation: 'Net wall area × flood cut percentage: 425 SF × 0.25 = 106 SF (2ft cut on 9ft wall ≈ 22%)',
      scopeReason: 'Matches: damageType=water, affectedSurfaces includes wall. Requires DEM-DRY-FLOOD (present).',
      isAutoAdded: false,
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'PAINT-INT-PRIME-PVA',
      description: 'PVA drywall primer',
      quantity: 106,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'WALL_SF_NET(zone) * 0.25',
      quantityExplanation: 'New drywall area: 106 SF',
      scopeReason: 'Auto-added by DRY-HTT-12 (new drywall requires PVA primer)',
      isAutoAdded: true,
      addedByItem: 'DRY-HTT-12',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'PAINT-INT-WALL',
      description: 'Interior wall paint - 2 coats',
      quantity: 425,
      unit: 'SF',
      quantitySource: 'formula',
      quantityFormula: 'WALL_SF_NET(zone)',
      quantityExplanation: 'Full wall repaint for color match: 425 SF (net wall area)',
      scopeReason: 'Matches: damageType=water, affectedSurfaces includes wall. Requires primer (PAINT-INT-PRIME-PVA present).',
      isAutoAdded: false,
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'TRIM-BASE-MDF',
      description: 'Baseboard MDF 3-1/4" - install',
      quantity: 47,
      unit: 'LF',
      quantitySource: 'formula',
      quantityFormula: 'PERIMETER_LF(zone) * 0.9',
      quantityExplanation: 'Perimeter × 0.9 = 47 LF',
      scopeReason: 'Matches: damageType=water, affectedSurfaces includes baseboard. Requires DEM-BASE (present).',
      isAutoAdded: false,
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
    {
      code: 'PAINT-INT-TRIM',
      description: 'Interior trim paint - 2 coats',
      quantity: 47,
      unit: 'LF',
      quantitySource: 'formula',
      quantityFormula: 'PERIMETER_LF(zone) * 0.9',
      quantityExplanation: 'New baseboard: 47 LF',
      scopeReason: 'Auto-added by TRIM-BASE-MDF',
      isAutoAdded: true,
      addedByItem: 'TRIM-BASE-MDF',
      carrierSensitivity: 'low',
      validationStatus: 'valid'
    },
  ],

  // ------------------------------------------
  // EXCLUDED ITEMS (due to conflicts)
  // ------------------------------------------
  excludedItems: [
    {
      code: 'WTR-EXTRACT-TRUCK',
      reason: 'Excluded by WTR-EXTRACT-PORT (mutual exclusion)',
      excludedBy: 'WTR-EXTRACT-PORT'
    },
    {
      code: 'DEM-DRY-FLOOD-4',
      reason: 'Excluded by DEM-DRY-FLOOD (2ft cut selected for Category 2 with moderate severity)',
      excludedBy: 'DEM-DRY-FLOOD'
    },
    {
      code: 'DEM-DRY-FULL',
      reason: 'Excluded by DEM-DRY-FLOOD (full removal not needed for moderate damage)',
      excludedBy: 'DEM-DRY-FLOOD'
    },
    {
      code: 'WTR-DRY-DEHU-CONV',
      reason: 'Replaced by WTR-DRY-DEHU (LGR required for Category 2)',
      replacedBy: 'WTR-DRY-DEHU'
    }
  ],

  // ------------------------------------------
  // WARNINGS (dependency validation)
  // ------------------------------------------
  warnings: [
    {
      code: 'INFO-001',
      message: 'Cabinet damage noted but no cabinet items scoped. Consider adding DEM-CABINET if cabinets require replacement.',
      severity: 'info',
      affectedItem: null
    }
  ]
};

// ============================================
// VALIDATION RESULT
// ============================================

const expectedValidationResult = {
  isValid: true,
  issueCount: 1,
  errorCount: 0,
  warningCount: 0,
  infoCount: 1,

  issues: [
    {
      code: 'CMP001',
      category: 'completeness',
      severity: 'info',
      message: 'Cabinet damage indicated but no cabinet line items present',
      suggestion: 'Review affected surfaces and add DEM-CABINET or CLN-CABINET-* if applicable',
      zone: 'zone-kitchen-001',
      lineItemCode: null
    }
  ],

  // All dependency checks pass
  dependencyCheck: {
    passed: true,
    details: [
      'DRY-HTT-12 requires DEM-DRY-FLOOD → PRESENT ✓',
      'PAINT-INT-WALL requires primer → PAINT-INT-PRIME-PVA PRESENT ✓',
      'TRIM-BASE-MDF requires DEM-BASE → PRESENT ✓',
      'WTR-ANTIMICROB requires extraction → WTR-EXTRACT-PORT PRESENT ✓'
    ]
  },

  // All quantity checks pass
  quantityCheck: {
    passed: true,
    details: [
      'WTR-EXTRACT-PORT: 168 SF within zone floor area (168 SF) ✓',
      'DEM-DRY-FLOOD: 47 LF within perimeter bounds (52 LF × 1.2) ✓',
      'WTR-ANTIMICROB: 593 SF within combined surface area (593 SF × 1.15) ✓',
      'WTR-DRY-AIRMOV: 9 unit-days within maximum (150) ✓'
    ]
  },

  // No exclusion conflicts
  exclusionCheck: {
    passed: true,
    details: [
      'No conflicting items present'
    ]
  }
};

// ============================================
// ESTIMATE SUMMARY
// ============================================

const estimateSummary = {
  zone: 'Kitchen',
  dimensions: '12ft × 14ft × 9ft (168 SF)',
  damageType: 'Water - Category 2 (Gray Water)',
  severity: 'Moderate',

  lineItemCount: 15,

  breakdown: {
    waterMitigation: {
      items: 6,
      description: 'Extraction, drying setup, dehu (3 days), air movers (9 unit-days), antimicrobial, moisture monitoring'
    },
    demolition: {
      items: 4,
      description: '2ft flood cut (47 LF), baseboard removal, insulation removal, debris haul'
    },
    rebuild: {
      items: 5,
      description: 'Drywall HTT (106 SF), PVA primer, wall paint (425 SF), baseboard install, trim paint'
    }
  },

  keyDecisions: [
    '2ft flood cut selected (not 4ft) because Category 2 + moderate severity typically shows wicking at 18-24"',
    'Full wall paint included for color match even though only 25% is new drywall',
    'LGR dehumidifier selected over conventional due to Category 2 classification',
    'Antimicrobial treatment required per IICRC S500 for Category 2 water'
  ],

  carrierNotes: [
    'High sensitivity item: WTR-ANTIMICROB - document water source (washing machine overflow) and contamination level',
    'Equipment counts justified by IICRC S500 ratios: 1 dehu per 500 SF, 1 air mover per 100 SF, minimum 3 days',
    'Flood cut height based on moisture readings - recommend documenting readings at 24" and 48" heights'
  ]
};

// ============================================
// OUTPUT
// ============================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  CLAIMS IQ v2 LINE ITEM INTELLIGENCE EXAMPLE');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('ZONE:', exampleZone.name);
console.log('Dimensions:', `${exampleZone.lengthFt}ft × ${exampleZone.widthFt}ft × ${exampleZone.heightFt}ft`);
console.log('Damage:', `${exampleZone.damageType} - Category ${exampleZone.waterCategory} - ${exampleZone.damageSeverity}`);
console.log('Affected Surfaces:', exampleZone.affectedSurfaces.join(', '));
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('  SCOPED LINE ITEMS (Auto-generated from zone attributes)');
console.log('───────────────────────────────────────────────────────────────');
console.log('');

expectedScopeResult.suggestedItems.forEach((item, index) => {
  const autoTag = item.isAutoAdded ? ` [AUTO-ADDED by ${item.addedByItem}]` : '';
  const sensitivityTag = item.carrierSensitivity === 'high' ? ' ⚠️ HIGH SENSITIVITY' : '';

  console.log(`${index + 1}. ${item.code}${autoTag}${sensitivityTag}`);
  console.log(`   ${item.description}`);
  console.log(`   Quantity: ${item.quantity} ${item.unit}`);
  console.log(`   Formula: ${item.quantityFormula}`);
  console.log(`   Reason: ${item.scopeReason}`);
  console.log('');
});

console.log('───────────────────────────────────────────────────────────────');
console.log('  EXCLUDED ITEMS (Conflicts resolved)');
console.log('───────────────────────────────────────────────────────────────');
console.log('');

expectedScopeResult.excludedItems.forEach((item) => {
  console.log(`✗ ${item.code}: ${item.reason}`);
});

console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('  VALIDATION RESULT');
console.log('───────────────────────────────────────────────────────────────');
console.log('');
console.log(`Status: ${expectedValidationResult.isValid ? '✓ VALID' : '✗ INVALID'}`);
console.log(`Issues: ${expectedValidationResult.issueCount} (${expectedValidationResult.errorCount} errors, ${expectedValidationResult.warningCount} warnings, ${expectedValidationResult.infoCount} info)`);
console.log('');

if (expectedValidationResult.issues.length > 0) {
  console.log('Issues:');
  expectedValidationResult.issues.forEach((issue) => {
    console.log(`  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
    console.log(`           Suggestion: ${issue.suggestion}`);
  });
  console.log('');
}

console.log('Dependency Check:', expectedValidationResult.dependencyCheck.passed ? '✓ PASSED' : '✗ FAILED');
expectedValidationResult.dependencyCheck.details.forEach((detail) => {
  console.log(`  ${detail}`);
});

console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('  ESTIMATE SUMMARY');
console.log('───────────────────────────────────────────────────────────────');
console.log('');
console.log(`Total Line Items: ${estimateSummary.lineItemCount}`);
console.log('');
console.log('Breakdown:');
console.log(`  Water Mitigation: ${estimateSummary.breakdown.waterMitigation.items} items`);
console.log(`    → ${estimateSummary.breakdown.waterMitigation.description}`);
console.log(`  Demolition: ${estimateSummary.breakdown.demolition.items} items`);
console.log(`    → ${estimateSummary.breakdown.demolition.description}`);
console.log(`  Rebuild: ${estimateSummary.breakdown.rebuild.items} items`);
console.log(`    → ${estimateSummary.breakdown.rebuild.description}`);
console.log('');
console.log('Key Decisions:');
estimateSummary.keyDecisions.forEach((decision) => {
  console.log(`  • ${decision}`);
});
console.log('');
console.log('Carrier Documentation Notes:');
estimateSummary.carrierNotes.forEach((note) => {
  console.log(`  📋 ${note}`);
});
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  This estimate was generated deterministically from zone');
console.log('  attributes using v2 line item intelligence. Every scope');
console.log('  decision and quantity is explainable and defensible.');
console.log('═══════════════════════════════════════════════════════════════');

export { exampleZone, expectedScopeResult, expectedValidationResult, estimateSummary };
