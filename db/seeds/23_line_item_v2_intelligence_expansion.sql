-- ============================================
-- Line Item v2 Intelligence Expansion
-- Claims IQ Sketch - Domain-Encoded Knowledge Base
-- ============================================
--
-- This file transforms line items from static cost entries into
-- a domain-encoded knowledge base for claims estimation.
--
-- Each line item encodes:
-- * When it applies (scope_conditions)
-- * How quantity is derived (quantity_formula)
-- * What it requires (requires_items)
-- * What it auto-adds (auto_add_items)
-- * What it conflicts with (excludes_items)
-- * What it replaces (replaces_items)
-- * How carriers react (carrier_sensitivity_level)
-- * Validation rules (validation_rules)
--
-- ORGANIZED BY LOSS TYPE:
-- Part A: Water Mitigation (Interior)
-- Part B: Fire/Smoke Restoration (Interior)
-- Part C: Rebuild (Interior Finish)
-- ============================================

-- ============================================
-- PART A: WATER MITIGATION (INTERIOR)
-- Per IICRC S500 Standards for Water Damage
-- ============================================

-- --------------------------------------------
-- A1. Emergency Water Extraction (Carpet/Pad)
-- --------------------------------------------
-- RATIONALE: First response for standing water on carpet/pad.
-- Extraction is calculated per floor SF. Category 3 water requires
-- more aggressive extraction methods (truck mount).

UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring", "pad"],
    "waterCategory": [1, 2]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-INIT", "WTR-DRY-SETUP", "WTR-CARPET-LIFT"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["WTR-EXTRACT-TRUCK"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 5000,
    "requires_photo": false,
    "carrier_notes": "Standard extraction for Category 1-2 water per IICRC S500",
    "documentation_required": ["moisture_readings", "water_source_identified"]
  }'::jsonb
WHERE code = 'WTR-EXTRACT-PORT';

-- Truck mount extraction for severe water damage
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring"],
    "waterCategory": [3],
    "damageSeverity": ["severe"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-INIT", "WTR-DRY-SETUP", "WTR-DRY-HEPA", "WTR-ANTIMICROB"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["WTR-EXTRACT-PORT"]'::jsonb,
  replaces_items = '["WTR-EXTRACT-PORT"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 10000,
    "requires_photo": true,
    "requires_category_documentation": true,
    "carrier_notes": "Truck mount required for Category 3 per IICRC S500 Section 10"
  }'::jsonb
WHERE code = 'WTR-EXTRACT-TRUCK';

-- Carpet extraction specific item
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["carpet"],
    "waterCategory": [1, 2]
  }'::jsonb,
  auto_add_items = '["WTR-CARPET-LIFT"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 3000,
    "requires_photo": false,
    "carrier_notes": "Carpet-specific extraction method"
  }'::jsonb
WHERE code = 'WTR-EXTRACT-CARPET';

-- --------------------------------------------
-- A2. Drywall Removal (Flood Cut)
-- --------------------------------------------
-- RATIONALE: Flood cut height is based on water intrusion depth.
-- Standard 2ft cut for Category 1-2 with minor wicking.
-- 4ft cut for Category 2-3 or significant wicking above waterline.
-- Full height removal for severe fire/water damage.

UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "waterCategory": [1, 2],
    "damageSeverity": ["minor", "moderate"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-BASE", "DEM-INSUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "typical_waste_factor": 1.0,
    "carrier_notes": "Standard 2ft flood cut per IICRC S500 for Cat 1-2 water. 90% of perimeter accounts for doorways.",
    "documentation_required": ["moisture_readings_at_24in", "photo_of_cut_line"]
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD';

UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
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
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "requires_category_documentation": true,
    "carrier_notes": "4ft flood cut required when moisture readings show wicking above 24in per IICRC S500. Typically Cat 2-3 water.",
    "documentation_required": ["moisture_readings_at_48in", "water_category_determination", "photo_of_cut_line"]
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD-4';

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "damageSeverity": ["severe"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-BASE", "DEM-INSUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4"]'::jsonb,
  replaces_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Full height removal for severe damage. Document structural damage or contamination requiring complete removal."
  }'::jsonb
WHERE code = 'DEM-DRY-FULL';

-- --------------------------------------------
-- A3. Antimicrobial Treatment
-- --------------------------------------------
-- RATIONALE: Required for Category 2-3 water per IICRC S500.
-- Applied to all affected surfaces (walls + floor).
-- High carrier sensitivity - requires documentation.

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [2, 3],
    "affectedSurfaces": ["wall", "walls", "floor", "flooring", "subfloor"]
  }'::jsonb,
  auto_add_items = '["WTR-DRY-HEPA"]'::jsonb,
  requires_items = '["WTR-EXTRACT-PORT", "WTR-EXTRACT-TRUCK"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_category_documentation": true,
    "requires_photo": true,
    "carrier_notes": "Required for Category 2-3 water per IICRC S500 Section 11.5. Must document water source and contamination level.",
    "documentation_required": ["water_category_determination", "contamination_source", "product_used", "application_method"]
  }'::jsonb
WHERE code = 'WTR-ANTIMICROB';

-- Antimicrobial cavity treatment
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) * 0.5',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [3],
    "affectedSurfaces": ["wall", "walls", "wall_cavity"]
  }'::jsonb,
  auto_add_items = '["DRY-HOLE-DRILL"]'::jsonb,
  requires_items = '["WTR-ANTIMICROB"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "requires_category_documentation": true,
    "requires_photo": true,
    "carrier_notes": "Wall cavity treatment required for Category 3. Must document injection points and product concentration."
  }'::jsonb
WHERE code = 'WTR-ANTIMICROB-CAV';

-- --------------------------------------------
-- A4. Air Mover Placement
-- --------------------------------------------
-- RATIONALE: IICRC S500 specifies 1 air mover per 10-16 LF of wall
-- or 1 per 100-150 SF of floor. Using 1 per 100 SF as standard.
-- Minimum 3 days drying per IICRC guidelines.

UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 100)) * 3',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring", "wall", "walls"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 9,
    "max_quantity": 150,
    "carrier_notes": "IICRC S500 specifies 1 air mover per 100 SF. Minimum 3 days drying. Formula: (SF/100) * 3 days.",
    "documentation_required": ["daily_moisture_readings", "equipment_placement_photos"],
    "max_days_guidance": 5,
    "extended_drying_requires_justification": true
  }'::jsonb
WHERE code = 'WTR-DRY-AIRMOV';

-- --------------------------------------------
-- A5. Dehumidifier Placement
-- --------------------------------------------
-- RATIONALE: IICRC S500 specifies dehumidifier sizing based on
-- volume and moisture load. Standard: 1 LGR per 500 SF.
-- Minimum 3 days, typical 3-5 days for Class 2-3 water.

UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 500)) * MAX(1, CEIL(FLOOR_SF(zone) / 1000))',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring", "wall", "walls"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-DAILY"]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '["WTR-DRY-DEHU-CONV"]'::jsonb,
  replaces_items = '["WTR-DRY-DEHU-CONV"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 56,
    "carrier_notes": "LGR dehumidifier: 1 unit per 500 SF minimum. Days based on water class and moisture readings. Formula accounts for unit count and days.",
    "documentation_required": ["daily_moisture_readings", "psychrometric_logs", "equipment_specs"],
    "extended_drying_threshold_days": 5
  }'::jsonb
WHERE code = 'WTR-DRY-DEHU';

-- Conventional dehumidifier (for minor water damage)
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 300)) * MAX(1, CEIL(FLOOR_SF(zone) / 800))',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [1],
    "damageSeverity": ["minor"],
    "affectedSurfaces": ["floor", "carpet", "flooring"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-DAILY"]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '["WTR-DRY-DEHU"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 30,
    "carrier_notes": "Conventional dehu appropriate for Category 1, Class 1-2 water only. LGR required for higher categories."
  }'::jsonb
WHERE code = 'WTR-DRY-DEHU-CONV';


-- ============================================
-- PART B: FIRE/SMOKE RESTORATION (INTERIOR)
-- Per IICRC S540 Standards for Fire Damage
-- ============================================

-- --------------------------------------------
-- B1. Contents Manipulation
-- --------------------------------------------
-- RATIONALE: Fire restoration requires contents to be moved
-- for cleaning and to prevent cross-contamination.
-- High carrier sensitivity due to potential for padding.

UPDATE line_items SET
  quantity_formula = '1',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "affectedSurfaces": ["contents", "furniture"]
  }'::jsonb,
  auto_add_items = '["WTR-CONTENT-BACK"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'GEN',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity_per_zone": 1,
    "requires_photo": true,
    "carrier_notes": "Contents manipulation is per room. Must document room contents and reason for manipulation. Excessive rooms require justification.",
    "documentation_required": ["contents_inventory", "before_photos", "manipulation_reason"]
  }'::jsonb
WHERE code = 'WTR-CONTENT-MOVE';

-- --------------------------------------------
-- B2. Soot Cleaning (Walls/Ceilings)
-- --------------------------------------------
-- RATIONALE: Soot type determines cleaning method.
-- Dry soot (furnace puff-back): dry sponge method
-- Wet soot (plastic fire): requires detergent solution
-- Protein (kitchen fire): specialized degreaser

-- Light soot (dry sponge cleaning)
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "affectedSurfaces": ["wall", "walls", "ceiling"],
    "damageSeverity": ["minor"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["FIRE-SOOT-WET", "FIRE-ODOR-SEAL"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": false,
    "carrier_notes": "Dry soot removal for light smoke film. Method: chemical sponge. No seal/paint required for minor smoke."
  }'::jsonb
WHERE code = 'FIRE-SOOT-DRY';

-- Heavy soot (wet cleaning required)
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "affectedSurfaces": ["wall", "walls", "ceiling"],
    "damageSeverity": ["moderate", "severe"]
  }'::jsonb,
  auto_add_items = '["FIRE-ODOR-SEAL", "FIRE-ODOR-FOG"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["FIRE-SOOT-DRY"]'::jsonb,
  replaces_items = '["FIRE-SOOT-DRY"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Heavy soot requires wet cleaning followed by seal and paint. Document soot type (wet/oily vs dry)."
  }'::jsonb
WHERE code = 'FIRE-SOOT-WET';

-- Protein residue (kitchen fires)
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "roomType": ["kitchen"],
    "affectedSurfaces": ["wall", "walls", "ceiling", "cabinet"]
  }'::jsonb,
  auto_add_items = '["FIRE-ODOR-SEAL", "FIRE-ODOR-FOG", "CLN-DEODOR"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["FIRE-SOOT-DRY"]'::jsonb,
  replaces_items = '["FIRE-SOOT-DRY", "FIRE-SOOT-WET"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Protein residue from kitchen/cooking fires. Requires enzymatic degreaser and likely multiple cleanings."
  }'::jsonb
WHERE code = 'FIRE-SOOT-PROT';

-- --------------------------------------------
-- B3. Seal & Paint (Fire Damage)
-- --------------------------------------------
-- RATIONALE: After soot cleaning, sealer is required to block
-- residual odor and staining before finish paint.
-- High carrier sensitivity when applied without cleaning.

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "affectedSurfaces": ["wall", "walls", "ceiling"],
    "damageSeverity": ["moderate", "severe"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["FIRE-SOOT-WET", "FIRE-SOOT-PROT"]'::jsonb,
  excludes_items = '["PAINT-INT-PRIME"]'::jsonb,
  replaces_items = '["PAINT-INT-PRIME", "PAINT-INT-PRIME-PVA"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Odor sealer required after heavy soot cleaning. Must be applied before finish paint. Document product used (shellac-based recommended).",
    "documentation_required": ["soot_cleaning_completed", "sealer_product_used"]
  }'::jsonb
WHERE code = 'FIRE-ODOR-SEAL';

-- --------------------------------------------
-- B4. Drywall Removal (Fire Damage)
-- --------------------------------------------
-- RATIONALE: Fire-damaged drywall must be removed when:
-- - Structural integrity compromised (charring)
-- - Heavy soot penetration through paint
-- - Smoke odor embedded in gypsum core

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "damageSeverity": ["severe"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-INSUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4"]'::jsonb,
  replaces_items = '["FIRE-SOOT-WET", "FIRE-SOOT-DRY"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Full drywall removal for fire damage. Document charring depth and structural compromise. Cleaning-only may be appropriate for light damage."
  }'::jsonb
WHERE code = 'DEM-DRY-FULL';

-- Ceiling demo for fire damage
UPDATE line_items SET
  quantity_formula = 'CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "water"],
    "affectedSurfaces": ["ceiling"],
    "damageSeverity": ["moderate", "severe"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL", "DEM-INSUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Ceiling drywall removal. More labor-intensive due to overhead work. Document damage extent."
  }'::jsonb
WHERE code = 'DEM-DRY-CEIL';

-- --------------------------------------------
-- B5. Insulation Replacement (Fire Damage)
-- --------------------------------------------
-- RATIONALE: Insulation must be replaced when:
-- - Fire/heat damaged
-- - Smoke contaminated (absorbs odor)
-- - Wet from fire suppression

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["fire", "water"],
    "affectedSurfaces": ["insulation", "wall_cavity"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DEM-DRY-FULL", "DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Insulation removal after drywall demo. Document contamination type (soot, water, mold)."
  }'::jsonb
WHERE code = 'DEM-INSUL';


-- ============================================
-- PART C: REBUILD (INTERIOR FINISH)
-- Standard interior reconstruction items
-- ============================================

-- --------------------------------------------
-- C1. Drywall Install
-- --------------------------------------------
-- RATIONALE: Drywall install quantity depends on the demo scope.
-- Flood cut repairs: 25% of wall SF (2ft cut on 8ft wall)
-- Full height: 100% of wall SF
-- Must follow demo, auto-adds primer.

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) * 0.25',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-FLOOD"]'::jsonb,
  excludes_items = '["DRY-HTT-58", "DRY-HTT-MR", "DRY-HTT-FIRE"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "1/2\" drywall for flood cut repair (2ft on 8ft wall = 25% of wall SF). HTT = Hang, Tape, Texture."
  }'::jsonb
WHERE code = 'DRY-HTT-12';

-- Full height drywall (fire or severe water)
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["fire", "water"],
    "affectedSurfaces": ["wall", "walls", "drywall"],
    "damageSeverity": ["severe"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-FULL"]'::jsonb,
  excludes_items = '["DRY-HTT-12", "DRY-HTT-MR"]'::jsonb,
  replaces_items = '["DRY-HTT-12"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "5/8\" drywall for full height replacement. Common after fire damage or severe water."
  }'::jsonb
WHERE code = 'DRY-HTT-58';

-- Ceiling drywall
UPDATE line_items SET
  quantity_formula = 'CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "water"],
    "affectedSurfaces": ["ceiling"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-CEIL"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceiling drywall. Higher labor rate due to overhead work. Include scaffolding if ceiling height > 10ft."
  }'::jsonb
WHERE code = 'DRY-HTT-CEIL';

-- Moisture resistant drywall (bathrooms)
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "roomType": ["bathroom", "laundry", "utility"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4", "DEM-DRY-FULL"]'::jsonb,
  excludes_items = '["DRY-HTT-12", "DRY-HTT-58"]'::jsonb,
  replaces_items = '["DRY-HTT-12"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Moisture resistant (green board) required in bathrooms per building code. Do not use for tile backer."
  }'::jsonb
WHERE code = 'DRY-HTT-MR';

-- Fire-rated drywall
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["fire"],
    "roomType": ["garage", "utility"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-FULL"]'::jsonb,
  excludes_items = '["DRY-HTT-12", "DRY-HTT-58", "DRY-HTT-MR"]'::jsonb,
  replaces_items = '["DRY-HTT-12", "DRY-HTT-58"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Type X (5/8\" fire-rated) required in garages and furnace rooms per building code."
  }'::jsonb
WHERE code = 'DRY-FIRE-58';

-- --------------------------------------------
-- C2. Drywall Finish
-- --------------------------------------------
-- RATIONALE: Finishing includes tape, mud, and texture.
-- Texture matching is critical for seamless repair.

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) * 0.25',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DRY-HTT-12", "DRY-HTT-58", "DRY-HTT-MR", "DRY-FIRE-58"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Tape and finish included in HTT line items. This is for additional finishing only."
  }'::jsonb
WHERE code = 'DRY-TAPE-ONLY';

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DRY-TAPE-ONLY"]'::jsonb,
  excludes_items = '["DRY-TEXT-SMOOTH"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Texture matching (knockdown, orange peel, etc). Document existing texture type. Matching multiple textures may require additional cost."
  }'::jsonb
WHERE code = 'DRY-TEXT-MATCH';

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DRY-TAPE-ONLY"]'::jsonb,
  excludes_items = '["DRY-TEXT-MATCH"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Skim coat for smooth finish. More labor intensive than texture. Level 5 finish for critical areas."
  }'::jsonb
WHERE code = 'DRY-TEXT-SMOOTH';

-- --------------------------------------------
-- C3. Paint (Walls & Ceilings)
-- --------------------------------------------
-- RATIONALE: Paint quantity based on wall/ceiling area.
-- Requires primer on new drywall. 2 coats standard.

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire", "smoke"],
    "affectedSurfaces": ["wall", "walls", "drywall", "paint"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["PAINT-INT-PRIME", "PAINT-INT-PRIME-PVA", "PAINT-INT-PRIME-STAIN", "FIRE-ODOR-SEAL"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '["PAINT-INT-WALL-1"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Standard 2-coat interior wall paint. Primer required on new drywall or after smoke damage."
  }'::jsonb
WHERE code = 'PAINT-INT-WALL';

UPDATE line_items SET
  quantity_formula = 'CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire", "smoke"],
    "affectedSurfaces": ["ceiling"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["PAINT-INT-PRIME", "PAINT-INT-PRIME-PVA", "FIRE-ODOR-SEAL"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '["PAINT-INT-CEIL-1"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceiling paint - 2 coats. Flat finish standard. Include scaffolding for heights > 10ft."
  }'::jsonb
WHERE code = 'PAINT-INT-CEIL';

-- Primer items
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["PAINT-INT-PRIME-STAIN", "FIRE-ODOR-SEAL"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Standard interior primer for repainted surfaces."
  }'::jsonb
WHERE code = 'PAINT-INT-PRIME';

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["drywall"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DRY-HTT-12", "DRY-HTT-58", "DRY-HTT-MR", "DRY-HTT-CEIL", "DRY-FIRE-58"]'::jsonb,
  excludes_items = '["FIRE-ODOR-SEAL"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "PVA primer for new drywall. Seals paper and mud for even finish paint absorption."
  }'::jsonb
WHERE code = 'PAINT-INT-PRIME-PVA';

UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["water", "smoke"],
    "waterCategory": [3],
    "affectedSurfaces": ["wall", "walls", "ceiling"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["PAINT-INT-PRIME", "FIRE-ODOR-SEAL"]'::jsonb,
  replaces_items = '["PAINT-INT-PRIME"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Stain-blocking primer required for water stains or smoke. Shellac-based products like Zinsser BIN recommended."
  }'::jsonb
WHERE code = 'PAINT-INT-PRIME-STAIN';

-- --------------------------------------------
-- C4. Baseboard Remove & Replace
-- --------------------------------------------
-- RATIONALE: Baseboards damaged by water must be replaced.
-- Quantity based on perimeter minus doorway openings (~90%).

UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "flooring", "wall", "walls", "baseboard", "trim"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "Baseboard removal. 90% of perimeter accounts for doorways. Salvage if possible for reuse."
  }'::jsonb
WHERE code = 'DEM-BASE';

UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["trim", "baseboard"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-TRIM"]'::jsonb,
  requires_items = '["DEM-BASE"]'::jsonb,
  excludes_items = '["TRIM-BASE-MDF-5", "TRIM-BASE-PINE"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'TRIM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "MDF baseboard 3-1/4\" standard. Match existing profile and height. Paint included separately."
  }'::jsonb
WHERE code = 'TRIM-BASE-MDF';

UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["trim", "baseboard"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-TRIM"]'::jsonb,
  requires_items = '["DEM-BASE"]'::jsonb,
  excludes_items = '["TRIM-BASE-MDF", "TRIM-BASE-PINE"]'::jsonb,
  replaces_items = '["TRIM-BASE-MDF"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'TRIM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "MDF baseboard 5-1/4\" for taller profile. Match existing."
  }'::jsonb
WHERE code = 'TRIM-BASE-MDF-5';

-- Trim painting
UPDATE line_items SET
  quantity_formula = 'PERIMETER_LF(zone) * 0.9',
  scope_conditions = '{
    "damageType": ["water", "fire", "smoke"],
    "affectedSurfaces": ["trim", "baseboard"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["TRIM-BASE-MDF", "TRIM-BASE-MDF-5", "TRIM-BASE-PINE"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "Trim paint - 2 coats semi-gloss. Primer required on raw MDF."
  }'::jsonb
WHERE code = 'PAINT-INT-TRIM';

-- --------------------------------------------
-- C5. Flooring Remove & Replace (Hard Surface)
-- --------------------------------------------
-- RATIONALE: Flooring replacement based on floor SF.
-- Must demo existing before install.

-- LVP/Vinyl removal
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "flooring", "vinyl", "lvp"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-FLOOR-TILE", "DEM-FLOOR-CARPET"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Vinyl/LVP flooring removal. Check for asbestos in pre-1980 vinyl."
  }'::jsonb
WHERE code = 'DEM-FLOOR-VNL';

-- Tile removal
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "affectedSurfaces": ["floor", "flooring", "tile"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-FLOOR-VNL", "DEM-FLOOR-CARPET"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceramic/porcelain tile removal. More labor-intensive than vinyl. May damage subfloor."
  }'::jsonb
WHERE code = 'DEM-FLOOR-TILE';

-- Carpet removal
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "waterCategory": [3],
    "affectedSurfaces": ["floor", "carpet"]
  }'::jsonb,
  auto_add_items = '["DEM-HAUL"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["DEM-FLOOR-VNL", "DEM-FLOOR-TILE", "WTR-CARPET-LIFT"]'::jsonb,
  replaces_items = '["WTR-CARPET-LIFT"]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Carpet and pad removal. Cat 3 water requires disposal. Cat 1-2 may allow cleaning if within 24-48 hours."
  }'::jsonb
WHERE code = 'DEM-FLOOR-CARPET';


-- ============================================
-- ADDITIONAL SUPPORTING ITEMS
-- ============================================

-- Drying setup
UPDATE line_items SET
  quantity_formula = '1',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '["WTR-DRY-DEHU", "WTR-DRY-AIRMOV"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity_per_zone": 1,
    "carrier_notes": "Drying equipment setup/takedown. One-time charge per affected area."
  }'::jsonb
WHERE code = 'WTR-DRY-SETUP';

-- Initial moisture inspection
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-LOG"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Initial moisture mapping required per IICRC S500. Document baseline readings."
  }'::jsonb
WHERE code = 'WTR-MOIST-INIT';

-- Daily moisture monitoring
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 500))',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 14,
    "carrier_notes": "Daily monitoring required for proper drying documentation. Minimum 3 days."
  }'::jsonb
WHERE code = 'WTR-MOIST-DAILY';

-- Thermal fogging for fire
UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone) + WALL_SF_NET(zone) + CEILING_SF(zone)',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "damageSeverity": ["moderate", "severe"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["FIRE-SOOT-WET"]'::jsonb,
  excludes_items = '["FIRE-ODOR-OZONE"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 100,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Thermal fogging for smoke odor. Calculate total surface area (walls + ceiling + floor)."
  }'::jsonb
WHERE code = 'FIRE-ODOR-FOG';

-- Ozone treatment
UPDATE line_items SET
  quantity_formula = 'MAX(1, CEIL(FLOOR_SF(zone) / 500))',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "damageSeverity": ["severe"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["FIRE-SOOT-WET", "FIRE-ODOR-FOG"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity": 5,
    "requires_photo": true,
    "carrier_notes": "Ozone treatment for severe smoke odor. Space must be unoccupied. Document treatment duration."
  }'::jsonb
WHERE code = 'FIRE-ODOR-OZONE';

-- HEPA air scrubber
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 1000)) * MAX(1, CEIL(FLOOR_SF(zone) / 2000))',
  scope_conditions = '{
    "damageType": ["water", "fire"],
    "waterCategory": [3]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-DRY-SETUP"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 28,
    "carrier_notes": "HEPA air scrubber required for Category 3 water or fire soot. 1 unit per 1000-2000 SF."
  }'::jsonb
WHERE code = 'WTR-DRY-HEPA';

-- Debris haul
UPDATE line_items SET
  quantity_formula = 'CEIL(FLOOR_SF(zone) / 500)',
  scope_conditions = '{
    "damageType": ["water", "fire"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4", "DEM-DRY-FULL", "DEM-FLOOR-VNL", "DEM-FLOOR-TILE", "DEM-FLOOR-CARPET"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity": 10,
    "carrier_notes": "Debris haul per load. Estimate 1 load per 500 SF of demo."
  }'::jsonb
WHERE code = 'DEM-HAUL';

-- Moisture log documentation
UPDATE line_items SET
  quantity_formula = 'MAX(3, CEIL(FLOOR_SF(zone) / 500))',
  scope_conditions = '{
    "damageType": ["water"]
  }'::jsonb,
  auto_add_items = '[]'::jsonb,
  requires_items = '["WTR-MOIST-INIT"]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = '0',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity_per_zone": 10,
    "carrier_notes": "Psychrometric documentation. One per monitoring visit."
  }'::jsonb
WHERE code = 'WTR-MOIST-LOG';


-- ============================================
-- INSERT NEW LINE ITEMS (if not exist)
-- These are additional items needed for complete v2 coverage
-- ============================================

-- Insert default coverage code and trade columns if they don't exist
-- Note: These should already exist from migration 006

-- Ensure we have carpet lift and relay items
INSERT INTO line_items (code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, quantity_formula, scope_conditions, auto_add_items, requires_items, excludes_items, replaces_items, carrier_sensitivity_level, validation_rules)
VALUES
('WTR-CARPET-LIFT', '01.5', 'Content Manipulation', 'Carpet lift and block for drying', 'SF', 0.35, '[]'::jsonb, '[{"task": "carpet_lift", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['WTR-CARPET-RELAY'], 'FLOOR_SF(zone)', '{"damageType": ["water"], "affectedSurfaces": ["carpet"], "waterCategory": [1, 2]}'::jsonb, '["WTR-CARPET-RELAY"]'::jsonb, '[]'::jsonb, '["DEM-FLOOR-CARPET"]'::jsonb, '[]'::jsonb, 'low', '{"min_quantity": 25, "max_quantity_per_zone": 3000, "carrier_notes": "Carpet lift and block for drying. Cat 1-2 only. Cat 3 requires removal."}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;

-- Carpet relay
INSERT INTO line_items (code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, quantity_formula, scope_conditions, auto_add_items, requires_items, excludes_items, replaces_items, carrier_sensitivity_level, validation_rules)
VALUES
('WTR-CARPET-RELAY', '01.5', 'Content Manipulation', 'Carpet relay after drying', 'SF', 0.42, '[]'::jsonb, '[{"task": "carpet_relay", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], 'FLOOR_SF(zone)', '{"damageType": ["water"], "affectedSurfaces": ["carpet"]}'::jsonb, '[]'::jsonb, '["WTR-CARPET-LIFT"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'low', '{"min_quantity": 25, "max_quantity_per_zone": 3000, "carrier_notes": "Carpet relay after drying complete. Must have moisture readings at acceptable levels."}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;

-- Content move back
INSERT INTO line_items (code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, quantity_formula, scope_conditions, auto_add_items, requires_items, excludes_items, replaces_items, carrier_sensitivity_level, validation_rules)
VALUES
('WTR-CONTENT-BACK', '01.5', 'Content Manipulation', 'Content move back - per room', 'EA', 125.00, '[]'::jsonb, '[{"task": "content_move", "hours_per_unit": 1.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], '1', '{"damageType": ["water", "fire", "smoke"]}'::jsonb, '[]'::jsonb, '["WTR-CONTENT-MOVE"]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'low', '{"min_quantity": 1, "max_quantity_per_zone": 1, "carrier_notes": "Content move back. One per room after restoration complete."}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;


-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Seed 23: Line Item v2 Intelligence Expansion';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'WATER MITIGATION items updated with v2 fields:';
  RAISE NOTICE '  - WTR-EXTRACT-PORT (Emergency extraction)';
  RAISE NOTICE '  - WTR-EXTRACT-TRUCK (Severe extraction)';
  RAISE NOTICE '  - DEM-DRY-FLOOD (2ft flood cut)';
  RAISE NOTICE '  - DEM-DRY-FLOOD-4 (4ft flood cut)';
  RAISE NOTICE '  - WTR-ANTIMICROB (Antimicrobial treatment)';
  RAISE NOTICE '  - WTR-DRY-AIRMOV (Air mover placement)';
  RAISE NOTICE '  - WTR-DRY-DEHU (Dehumidifier placement)';
  RAISE NOTICE '';
  RAISE NOTICE 'FIRE/SMOKE items updated with v2 fields:';
  RAISE NOTICE '  - WTR-CONTENT-MOVE (Contents manipulation)';
  RAISE NOTICE '  - FIRE-SOOT-DRY (Light soot cleaning)';
  RAISE NOTICE '  - FIRE-SOOT-WET (Heavy soot cleaning)';
  RAISE NOTICE '  - FIRE-SOOT-PROT (Protein residue)';
  RAISE NOTICE '  - FIRE-ODOR-SEAL (Seal and paint)';
  RAISE NOTICE '  - DEM-DRY-FULL (Fire drywall removal)';
  RAISE NOTICE '  - DEM-INSUL (Insulation replacement)';
  RAISE NOTICE '';
  RAISE NOTICE 'REBUILD items updated with v2 fields:';
  RAISE NOTICE '  - DRY-HTT-12 (Drywall install 1/2")';
  RAISE NOTICE '  - DRY-HTT-58 (Drywall install 5/8")';
  RAISE NOTICE '  - DRY-HTT-CEIL (Ceiling drywall)';
  RAISE NOTICE '  - DRY-TEXT-MATCH (Texture matching)';
  RAISE NOTICE '  - PAINT-INT-WALL (Wall paint)';
  RAISE NOTICE '  - PAINT-INT-CEIL (Ceiling paint)';
  RAISE NOTICE '  - DEM-BASE (Baseboard removal)';
  RAISE NOTICE '  - TRIM-BASE-MDF (Baseboard install)';
  RAISE NOTICE '  - DEM-FLOOR-VNL (Flooring removal)';
  RAISE NOTICE '';
  RAISE NOTICE 'All items include:';
  RAISE NOTICE '  - scope_conditions (when to apply)';
  RAISE NOTICE '  - quantity_formula (zone-driven)';
  RAISE NOTICE '  - requires_items (dependencies)';
  RAISE NOTICE '  - auto_add_items (companions)';
  RAISE NOTICE '  - excludes_items (conflicts)';
  RAISE NOTICE '  - replaces_items (supersedes)';
  RAISE NOTICE '  - carrier_sensitivity_level';
  RAISE NOTICE '  - validation_rules';
  RAISE NOTICE '';
  RAISE NOTICE 'Line items now encode CLAIMS EXPERIENCE!';
  RAISE NOTICE '================================================';
END $$;
