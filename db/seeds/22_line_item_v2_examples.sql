-- ============================================
-- Line Item v2 Examples - Scope Intelligence
-- Claims IQ Sketch - Executable Scope Logic
-- ============================================
--
-- This file contains example line items demonstrating the new v2 schema:
-- - quantity_formula: Auto-calculation from zone geometry
-- - scope_conditions: When items auto-apply to scope
-- - requires_items, auto_add_items, excludes_items, replaces_items: Dependencies
--
-- EXAMPLES INCLUDED:
-- 1. Water extraction - basic mitigation with auto-add drying
-- 2. Drywall flood cut 2ft - demo with quantity formula
-- 3. Antimicrobial treatment - conditional on water category
-- 4. Interior wall paint - replacement for partial paint
-- ============================================

-- ============================================
-- EXAMPLE 1: Water Extraction (Portable)
-- Demonstrates: scope_conditions, auto_add_items, quantity_formula
-- ============================================
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-INIT", "WTR-DRY-SETUP"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["WTR-EXTRACT-TRUCK"]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 10,
    "max_quantity_per_zone": 5000,
    "requires_photo": false
  }'::jsonb
WHERE code = 'WTR-EXTRACT-PORT';

-- ============================================
-- EXAMPLE 2: Drywall Flood Cut 2ft
-- Demonstrates: quantity_formula with perimeter, requires_items
-- ============================================
UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "waterCategory": [1, 2]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-BASE"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 4,
    "max_quantity_multiplier": 1.5,
    "typical_waste_factor": 1.0
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD';

-- ============================================
-- EXAMPLE 3: Drywall Flood Cut 4ft
-- Demonstrates: Higher water category, excludes 2ft version
-- ============================================
UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "waterCategory": [2, 3],
    "damageSeverity": ["moderate", "severe"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-BASE", "DEM-INSUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-DRY-FLOOD", "DEM-DRY-FULL"]'::jsonb,
  replaces_items = '["DEM-DRY-FLOOD"]'::jsonb,
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 4,
    "max_quantity_multiplier": 1.5,
    "requires_category_documentation": true
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD-4';

-- ============================================
-- EXAMPLE 4: Antimicrobial Treatment
-- Demonstrates: Conditional on water category 2/3
-- ============================================
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [2, 3],
    "affectedSurfaces": ["wall", "walls", "floor", "flooring"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-EXTRACT-PORT"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "requires_category_documentation": true,
    "requires_photo": true,
    "carrier_notes": "Required for Cat 2/3 per IICRC S500"
  }'::jsonb
WHERE code = 'WTR-ANTIMICROB';

-- ============================================
-- EXAMPLE 5: Drywall Install (1/2" HTT)
-- Demonstrates: Dependency on demo, quantity from walls
-- ============================================
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) * 0.25',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '["PAINT-PRIME-STD"]'::jsonb,
  requires_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]'::jsonb,
  excludes_items = '["DRY-HTT-58", "DRY-HTT-MR", "DRY-HTT-FIRE"]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "note": "Quantity is 25% of net wall SF for flood cut repairs (2ft cut on 8ft wall)"
  }'::jsonb
WHERE code = 'DRY-HTT-12';

-- ============================================
-- EXAMPLE 6: Interior Wall Paint - 2 Coats
-- Demonstrates: Replaces single coat, requires primer
-- ============================================
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire", "smoke"],
    "affectedSurfaces": ["wall", "walls", "drywall", "paint"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["PAINT-PRIME-STD", "PAINT-PRIME-STAIN", "PAINT-PRIME-MOLD"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '["PAINT-INT-WALL-1"]'::jsonb,
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "note": "Typically requires primer first"
  }'::jsonb
WHERE code = 'PAINT-INT-WALL';

-- ============================================
-- EXAMPLE 7: Dehumidifier (LGR) per day
-- Demonstrates: Fixed quantity per zone, auto-added by extraction
-- ============================================
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 500))',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-DAILY"]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '["WTR-DRY-DEHU-CON"]'::jsonb,
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 14,
    "note": "Minimum 3 days, max 14 days typical. Calculate 1 LGR per 500 SF"
  }'::jsonb
WHERE code = 'WTR-DRY-DEHU';

-- ============================================
-- EXAMPLE 8: Air Mover per day
-- Demonstrates: Formula based on floor SF
-- ============================================
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 100)) * 3',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "note": "1 air mover per 100 SF, minimum 3 days drying"
  }'::jsonb
WHERE code = 'WTR-DRY-AIRMOV';

-- ============================================
-- EXAMPLE 9: Baseboard Removal
-- Demonstrates: Perimeter-based quantity
-- ============================================
UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "flooring", "wall", "walls", "baseboard"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "note": "90% of perimeter (accounting for doorways)"
  }'::jsonb
WHERE code = 'DEM-BASE';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Seed 22: Line Item v2 Examples applied successfully!';
  RAISE NOTICE 'Updated items with scope intelligence: WTR-EXTRACT-PORT, DEM-DRY-FLOOD, DEM-DRY-FLOOD-4, WTR-ANTIMICROB, DRY-HTT-12, PAINT-INT-WALL, WTR-DRY-DEHU, WTR-DRY-AIRMOV, DEM-BASE';
END $$;
