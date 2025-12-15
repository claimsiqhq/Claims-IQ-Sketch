-- ============================================
-- Seed 24: Claims IQ Intelligent Seed Expansion
-- Maximum Intelligence via Data - No Schema Changes
-- ============================================
--
-- This seed file enriches existing data to maximize engine functionality:
-- - Line item v2 intelligence with complete field population
-- - Category enrichment with coverage codes and trades
-- - Zone/room reference normalization
-- - Enhanced carrier and jurisdiction profiles
-- - Validation rules seeding
--
-- ============================================

-- ============================================
-- PART 1: LINE ITEM SEED ENRICHMENT
-- ============================================

-- ============================================
-- SECTION 1A: WATER MITIGATION
-- Per IICRC S500 Standards
-- ============================================

-- --------------------------------------------
-- Emergency Water Extraction (Carpet & Pad)
-- First response for standing water. Category determines method.
-- --------------------------------------------

UPDATE line_items SET
  quantity_formula = 'FLOOR_SF(zone)',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["floor", "carpet", "flooring", "pad"],
    "waterCategory": [1, 2],
    "damageSeverity": ["minor", "moderate"]
  }'::jsonb,
  auto_add_items = '["WTR-MOIST-INIT", "WTR-DRY-SETUP", "WTR-CARPET-LIFT"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '["WTR-EXTRACT-TRUCK"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 5000,
    "requires_photo": false,
    "carrier_notes": "Standard extraction for Category 1-2 water per IICRC S500 Section 10",
    "documentation_required": ["moisture_readings", "water_source_identified"],
    "quantity_validation": {
      "formula": "FLOOR_SF",
      "tolerance_pct": 10
    }
  }'::jsonb
WHERE code = 'WTR-EXTRACT-PORT';

-- Emergency extraction - truck mount for severe/Cat3
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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_per_zone": 10000,
    "requires_photo": true,
    "requires_category_documentation": true,
    "carrier_notes": "Truck mount required for Category 3 per IICRC S500 Section 10. Document contamination source.",
    "documentation_required": ["moisture_readings", "water_category_determination", "contamination_photos"]
  }'::jsonb
WHERE code = 'WTR-EXTRACT-TRUCK';

-- --------------------------------------------
-- Drywall Flood Cut Removal
-- Height based on water intrusion and wicking
-- --------------------------------------------

-- 2ft flood cut - standard for Cat 1-2
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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "typical_waste_factor": 1.0,
    "carrier_notes": "Standard 2ft flood cut per IICRC S500 for Cat 1-2 water. 90% of perimeter accounts for doorways.",
    "documentation_required": ["moisture_readings_at_24in", "photo_of_cut_line"],
    "validation_checks": [
      {"type": "geometry_match", "source": "PERIMETER_LF", "tolerance": 0.15},
      {"type": "prerequisite_damage", "requires": "water_damage_documented"}
    ]
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD';

-- 4ft flood cut - Cat 2-3 or significant wicking
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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "requires_category_documentation": true,
    "carrier_notes": "4ft flood cut when moisture readings show wicking above 24in per IICRC S500. Typically Cat 2-3.",
    "documentation_required": ["moisture_readings_at_48in", "water_category_determination", "photo_of_cut_line"],
    "validation_checks": [
      {"type": "geometry_match", "source": "PERIMETER_LF", "tolerance": 0.15},
      {"type": "justification_required", "when": "water_category < 2"}
    ]
  }'::jsonb
WHERE code = 'DEM-DRY-FLOOD-4';

-- --------------------------------------------
-- Antimicrobial Application
-- Required for Cat 2-3 per IICRC S500 Section 11.5
-- HIGH CARRIER SENSITIVITY
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_category_documentation": true,
    "requires_photo": true,
    "carrier_notes": "Required for Category 2-3 water per IICRC S500 Section 11.5. Must document water source and contamination level.",
    "documentation_required": ["water_category_determination", "contamination_source", "product_used", "application_method"],
    "carrier_caps": {
      "NATL-STD": {"requires_preapproval": true, "max_sf_per_zone": 2000},
      "REG-PREF": {"requires_preapproval": false}
    },
    "validation_checks": [
      {"type": "category_required", "min_category": 2},
      {"type": "extraction_completed", "requires": ["WTR-EXTRACT-PORT", "WTR-EXTRACT-TRUCK"]}
    ]
  }'::jsonb
WHERE code = 'WTR-ANTIMICROB';

-- Antimicrobial - cavity treatment
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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "requires_category_documentation": true,
    "requires_photo": true,
    "carrier_notes": "Wall cavity treatment required for Category 3. Must document injection points and product concentration.",
    "documentation_required": ["injection_point_photos", "product_sds", "application_rate"]
  }'::jsonb
WHERE code = 'WTR-ANTIMICROB-CAV';

-- --------------------------------------------
-- Air Mover Placement
-- IICRC S500: 1 per 10-16 LF wall or 1 per 100-150 SF floor
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 9,
    "max_quantity": 150,
    "max_quantity_per_zone": 45,
    "carrier_notes": "IICRC S500 specifies 1 air mover per 100 SF. Minimum 3 days drying. Formula: (SF/100) * 3 days.",
    "documentation_required": ["daily_moisture_readings", "equipment_placement_photos"],
    "max_days_guidance": 5,
    "extended_drying_requires_justification": true,
    "carrier_caps": {
      "NATL-STD": {"max_days": 5, "max_units_per_zone": 10},
      "REG-PREF": {"max_days": 7, "max_units_per_zone": 15}
    }
  }'::jsonb
WHERE code = 'WTR-DRY-AIRMOV';

-- --------------------------------------------
-- Dehumidifier Placement
-- IICRC S500: 1 LGR per 500 SF minimum
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 56,
    "max_quantity_per_zone": 15,
    "carrier_notes": "LGR dehumidifier: 1 unit per 500 SF minimum. Days based on water class and moisture readings.",
    "documentation_required": ["daily_moisture_readings", "psychrometric_logs", "equipment_specs"],
    "extended_drying_threshold_days": 5,
    "carrier_caps": {
      "NATL-STD": {"max_days": 5, "max_unit_price": 75.00},
      "REG-PREF": {"max_days": 7, "max_unit_price": 95.00}
    }
  }'::jsonb
WHERE code = 'WTR-DRY-DEHU';

-- Conventional dehumidifier (minor damage only)
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
  default_coverage_code = 'A',
  default_trade = 'WTR',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 30,
    "carrier_notes": "Conventional dehu appropriate for Category 1, Class 1-2 water only. LGR required for higher categories.",
    "validation_checks": [
      {"type": "category_max", "max_category": 1},
      {"type": "severity_max", "max_severity": "minor"}
    ]
  }'::jsonb
WHERE code = 'WTR-DRY-DEHU-CONV';


-- ============================================
-- SECTION 1B: FIRE / SMOKE RESTORATION
-- Per IICRC S540 Standards
-- ============================================

-- --------------------------------------------
-- Contents Manipulation
-- HIGH CARRIER SENSITIVITY - potential for padding
-- --------------------------------------------

UPDATE line_items SET
  quantity_formula = '1',
  scope_conditions = '{
    "damageType": ["fire", "smoke"],
    "affectedSurfaces": ["contents", "furniture"],
    "damageSeverity": ["minor", "moderate", "severe"]
  }'::jsonb,
  auto_add_items = '["WTR-CONTENT-BACK"]'::jsonb,
  requires_items = '[]'::jsonb,
  excludes_items = '[]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = 'C',
  default_trade = 'GEN',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity_per_zone": 1,
    "requires_photo": true,
    "carrier_notes": "Contents manipulation is per room. Must document room contents and reason for manipulation. Excessive rooms require justification.",
    "documentation_required": ["contents_inventory", "before_photos", "manipulation_reason"],
    "validation_checks": [
      {"type": "one_per_zone", "enforce": true},
      {"type": "contents_documented", "requires": "photo_inventory"}
    ],
    "carrier_caps": {
      "NATL-STD": {"requires_photo": true, "requires_inventory": true},
      "REG-PREF": {"requires_photo": false}
    }
  }'::jsonb
WHERE code = 'WTR-CONTENT-MOVE';

-- --------------------------------------------
-- Soot Cleaning - Walls & Ceilings
-- Method depends on soot type
-- --------------------------------------------

-- Light soot (dry sponge method)
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
  default_coverage_code = 'A',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": false,
    "carrier_notes": "Dry soot removal for light smoke film. Method: chemical sponge. No seal/paint required for minor smoke.",
    "validation_checks": [
      {"type": "geometry_match", "source": "WALL_SF_NET + CEILING_SF", "tolerance": 0.15},
      {"type": "mutually_exclusive", "excludes": ["FIRE-SOOT-WET"]}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Heavy soot requires wet cleaning followed by seal and paint. Document soot type (wet/oily vs dry).",
    "documentation_required": ["soot_type_assessment", "cleaning_method_used"],
    "validation_checks": [
      {"type": "severity_required", "min_severity": "moderate"},
      {"type": "auto_adds_required", "items": ["FIRE-ODOR-SEAL"]}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'CLN',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Protein residue from kitchen/cooking fires. Requires enzymatic degreaser and likely multiple cleanings.",
    "documentation_required": ["fire_origin_documentation", "cleaning_products_used"],
    "room_type_required": ["kitchen"]
  }'::jsonb
WHERE code = 'FIRE-SOOT-PROT';

-- --------------------------------------------
-- Seal & Paint (Fire Damage)
-- HIGH CARRIER SENSITIVITY when applied without cleaning
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'high',
  validation_rules = '{
    "min_quantity": 50,
    "max_quantity_multiplier": 1.15,
    "requires_photo": true,
    "carrier_notes": "Odor sealer required after heavy soot cleaning. Must be applied before finish paint. Document product used (shellac-based recommended).",
    "documentation_required": ["soot_cleaning_completed", "sealer_product_used"],
    "validation_checks": [
      {"type": "prerequisite_required", "requires_one_of": ["FIRE-SOOT-WET", "FIRE-SOOT-PROT"]},
      {"type": "sequence_check", "must_follow": "soot_cleaning"}
    ]
  }'::jsonb
WHERE code = 'FIRE-ODOR-SEAL';

-- --------------------------------------------
-- Fire-Damaged Drywall Removal
-- Full height when structural integrity compromised
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Full drywall removal for fire damage. Document charring depth and structural compromise. Cleaning-only may be appropriate for light damage.",
    "documentation_required": ["charring_depth_photos", "structural_assessment"],
    "validation_checks": [
      {"type": "severity_required", "min_severity": "severe"},
      {"type": "replaces_cleaning", "note": "If removing drywall, cleaning items should not be included"}
    ]
  }'::jsonb
WHERE code = 'DEM-DRY-FULL';

-- --------------------------------------------
-- Insulation Replacement (Fire/Water Damage)
-- Required when contaminated or heat damaged
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'INSUL',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "requires_photo": true,
    "carrier_notes": "Insulation removal after drywall demo. Document contamination type (soot, water, mold).",
    "documentation_required": ["contamination_type", "removal_photos"],
    "validation_checks": [
      {"type": "prerequisite_required", "requires_one_of": ["DEM-DRY-FULL", "DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4"]}
    ]
  }'::jsonb
WHERE code = 'DEM-INSUL';


-- ============================================
-- SECTION 1C: REBUILD (INTERIOR FINISH)
-- Standard Interior Reconstruction
-- ============================================

-- --------------------------------------------
-- Drywall Install
-- Quantity depends on demo scope
-- --------------------------------------------

-- 1/2" drywall for flood cut repair
UPDATE line_items SET
  quantity_formula = 'WALL_SF_NET(zone) * 0.25',
  scope_conditions = '{
    "damageType": ["water"],
    "affectedSurfaces": ["wall", "walls", "drywall"]
  }'::jsonb,
  auto_add_items = '["PAINT-INT-PRIME-PVA"]'::jsonb,
  requires_items = '["DEM-DRY-FLOOD"]'::jsonb,
  excludes_items = '["DRY-HTT-58", "DRY-HTT-MR", "DRY-FIRE-58"]'::jsonb,
  replaces_items = '[]'::jsonb,
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "1/2\" drywall for flood cut repair (2ft on 8ft wall = 25% of wall SF). HTT = Hang, Tape, Texture.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "DEM-DRY-FLOOD"},
      {"type": "geometry_proportional", "source": "WALL_SF_NET", "factor": 0.25, "tolerance": 0.1}
    ]
  }'::jsonb
WHERE code = 'DRY-HTT-12';

-- 5/8" drywall for full height (fire/severe water)
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
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "5/8\" drywall for full height replacement. Common after fire damage or severe water.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "DEM-DRY-FULL"},
      {"type": "severity_required", "min_severity": "severe"}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceiling drywall. Higher labor rate due to overhead work. Include scaffolding if ceiling height > 10ft.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "DEM-DRY-CEIL"},
      {"type": "scaffolding_check", "when": "ceiling_height > 10"}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Moisture resistant (green board) required in bathrooms per building code. Do not use for tile backer.",
    "room_type_required": ["bathroom", "laundry", "utility"],
    "validation_checks": [
      {"type": "room_type_match", "requires": ["bathroom", "laundry", "utility"]}
    ]
  }'::jsonb
WHERE code = 'DRY-HTT-MR';

-- Fire-rated drywall (garage/utility)
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
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Type X (5/8\" fire-rated) required in garages and furnace rooms per building code.",
    "room_type_required": ["garage", "utility"],
    "code_requirement": "IBC/IRC fire separation"
  }'::jsonb
WHERE code = 'DRY-FIRE-58';

-- --------------------------------------------
-- Drywall Finish
-- Texture matching is critical for seamless repair
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'DRY',
  carrier_sensitivity_level = 'medium',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Texture matching (knockdown, orange peel, etc). Document existing texture type. Matching multiple textures may require additional cost.",
    "documentation_required": ["existing_texture_photo"],
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "DRY-TAPE-ONLY"}
    ]
  }'::jsonb
WHERE code = 'DRY-TEXT-MATCH';

-- --------------------------------------------
-- Paint (Walls & Ceilings)
-- Requires primer on new drywall
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Standard 2-coat interior wall paint. Primer required on new drywall or after smoke damage.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires_one_of": ["PAINT-INT-PRIME", "PAINT-INT-PRIME-PVA", "PAINT-INT-PRIME-STAIN", "FIRE-ODOR-SEAL"]},
      {"type": "geometry_match", "source": "WALL_SF_NET", "tolerance": 0.1}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'PAINT',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 32,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceiling paint - 2 coats. Flat finish standard. Include scaffolding for heights > 10ft.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires_one_of": ["PAINT-INT-PRIME", "PAINT-INT-PRIME-PVA", "FIRE-ODOR-SEAL"]}
    ]
  }'::jsonb
WHERE code = 'PAINT-INT-CEIL';

-- --------------------------------------------
-- Baseboard Remove & Replace
-- 90% of perimeter accounts for doorways
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "Baseboard removal. 90% of perimeter accounts for doorways. Salvage if possible for reuse.",
    "validation_checks": [
      {"type": "geometry_match", "source": "PERIMETER_LF * 0.9", "tolerance": 0.15}
    ]
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
  default_coverage_code = 'A',
  default_trade = 'TRIM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 8,
    "max_quantity_multiplier": 1.2,
    "carrier_notes": "MDF baseboard 3-1/4\" standard. Match existing profile and height. Paint included separately.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "DEM-BASE"},
      {"type": "install_requires_removal", "removal_item": "DEM-BASE"}
    ]
  }'::jsonb
WHERE code = 'TRIM-BASE-MDF';

-- --------------------------------------------
-- Hard Surface Flooring Remove & Replace
-- Based on floor SF
-- --------------------------------------------

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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Vinyl/LVP flooring removal. Check for asbestos in pre-1980 vinyl.",
    "regulatory_check": "asbestos_pre_1980",
    "validation_checks": [
      {"type": "geometry_match", "source": "FLOOR_SF", "tolerance": 0.1}
    ]
  }'::jsonb
WHERE code = 'DEM-FLOOR-VNL';

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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Ceramic/porcelain tile removal. More labor-intensive than vinyl. May damage subfloor.",
    "validation_checks": [
      {"type": "geometry_match", "source": "FLOOR_SF", "tolerance": 0.1}
    ]
  }'::jsonb
WHERE code = 'DEM-FLOOR-TILE';

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
  default_coverage_code = 'A',
  default_trade = 'DEM',
  carrier_sensitivity_level = 'low',
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Carpet and pad removal. Cat 3 water requires disposal. Cat 1-2 may allow cleaning if within 24-48 hours.",
    "validation_checks": [
      {"type": "category_required", "min_category": 3, "note": "Cat 1-2 should use carpet lift/clean"},
      {"type": "replaces_check", "replaces": "WTR-CARPET-LIFT"}
    ]
  }'::jsonb
WHERE code = 'DEM-FLOOR-CARPET';


-- ============================================
-- PART 2: CATEGORY ENRICHMENT
-- Add coverage codes and trade alignment
-- ============================================

-- Water Mitigation Categories -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'WTR'
WHERE id LIKE '01%';

-- Demolition Categories -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'DEM'
WHERE id LIKE '02%';

-- General Cleaning -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'CLN'
WHERE id LIKE '03%';

-- Fire & Smoke Restoration -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'CLN'
WHERE id LIKE '04%';

-- Insulation -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'INSUL'
WHERE id LIKE '05%';

-- Drywall & Walls -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'DRY'
WHERE id LIKE '06%';

-- Flooring -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'FLR'
WHERE id LIKE '07%';

-- Windows & Doors -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'CARP'
WHERE id LIKE '08%';

-- Plumbing -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'PLMB'
WHERE id LIKE '09%';

-- Electrical -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'ELEC'
WHERE id LIKE '10%';

-- HVAC -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'HVAC'
WHERE id LIKE '11%';

-- Roofing -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'ROOF'
WHERE id LIKE '12%';

-- Exterior & Siding -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'EXT'
WHERE id LIKE '13%';

-- Interior Painting -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'PAINT'
WHERE id LIKE '14%';

-- Cabinets -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'CAB'
WHERE id LIKE '15%';

-- Trim & Millwork -> Coverage A
UPDATE line_item_categories SET
  default_coverage_code = 'A',
  default_trade = 'TRIM'
WHERE id LIKE '16%';


-- ============================================
-- PART 3: ZONE / ROOM REFERENCE NORMALIZATION
-- ============================================

-- Create reference table for canonical room types if not exists
-- This uses a temporary approach since we can't modify schema
-- We'll use the estimate_zones table's existing fields

-- Insert canonical room type reference data via a reference comment block
-- The scope engine should recognize these room types:

/*
CANONICAL ROOM TYPES (for scope_conditions.roomType matching):
- kitchen        : Kitchen, cooking areas
- bathroom       : Full bath, half bath, powder room
- bedroom        : Master bedroom, bedroom, guest room
- living_room    : Living room, family room, great room
- dining_room    : Dining room, breakfast nook
- hallway        : Hallway, corridor, foyer
- basement       : Basement, cellar
- garage         : Garage, carport
- utility        : Utility room, laundry room, mechanical room
- closet         : Walk-in closet, reach-in closet
- attic          : Attic, attic space
- office         : Home office, study

DEFAULT CEILING HEIGHTS:
- Standard: 8 ft (96 in)
- Vaulted: 10-12 ft
- Basement: 7.5 ft

NORMALIZED AFFECTED SURFACES:
- wall           : Interior wall surfaces
- ceiling        : Ceiling surfaces
- floor          : Floor surfaces (generic)
- carpet         : Carpeted floor
- tile           : Tile floor
- hardwood       : Hardwood floor
- vinyl          : Vinyl/LVP floor
- baseboard      : Baseboard trim
- trim           : General trim/millwork
- drywall        : Drywall specifically
- paint          : Painted surfaces
- insulation     : Wall/ceiling insulation
- subfloor       : Subfloor material
- cabinet        : Cabinetry
- contents       : Room contents/furniture
*/


-- ============================================
-- PART 4: CARRIER RULE SEED PROFILES (ENHANCED)
-- ============================================

-- Add more rules to National Standard (strict carrier)
DO $$
DECLARE
  v_carrier_id UUID;
BEGIN
  SELECT id INTO v_carrier_id FROM carrier_profiles WHERE code = 'NATL-STD';

  IF v_carrier_id IS NOT NULL THEN
    -- Rule: Antimicrobial caps
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'NATL-ANTIMICROB-CAP',
      'Antimicrobial Application Cap',
      'cap',
      'line_item',
      'WTR-ANTIMICROB',
      '{"waterCategory": [2, 3]}'::jsonb,
      'cap_quantity',
      '{"maxQuantityPerZone": 2000, "requiresPreApproval": true, "reason": "Antimicrobial limited per carrier mitigation guidelines"}'::jsonb,
      'Antimicrobial application capped at 2,000 SF per zone. Additional coverage requires pre-approval with contamination documentation.',
      'Mitigation Guidelines 3.2',
      15,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value,
      explanation_template = EXCLUDED.explanation_template;

    -- Rule: Contents manipulation requires photos
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'NATL-CONTENTS-DOC',
      'Contents Manipulation Documentation',
      'documentation',
      'line_item',
      'WTR-CONTENT-MOVE',
      '{}'::jsonb,
      'require_doc',
      '{"required": ["contents_photo", "room_inventory", "manipulation_justification"], "photoRequired": true}'::jsonb,
      'Contents manipulation requires photo documentation of room contents and written justification for each room.',
      'Contents Guidelines 2.1',
      18,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Equipment count limits (aggressive)
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'NATL-EQUIP-LIMIT',
      'Drying Equipment Count Limits',
      'combination',
      'category',
      'WTR-DRY',
      '{"damageType": ["water"]}'::jsonb,
      'cap_quantity',
      '{"airMovers": {"maxPerZone": 10, "maxDays": 5}, "dehumidifiers": {"maxPerZone": 3, "maxDays": 5}, "reason": "Equipment counts per IICRC guidelines with carrier limits"}'::jsonb,
      'Drying equipment limited to 10 air movers and 3 dehumidifiers per zone, 5 days maximum. Extended drying requires daily moisture documentation.',
      'Rate Schedule W-3',
      22,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Seal & Paint requires soot cleaning
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'NATL-SEAL-PREREQ',
      'Odor Seal Requires Cleaning',
      'combination',
      'line_item',
      'FIRE-ODOR-SEAL',
      '{"damageType": ["fire", "smoke"]}'::jsonb,
      'require_doc',
      '{"prerequisiteItems": ["FIRE-SOOT-WET", "FIRE-SOOT-PROT"], "reason": "Sealer without cleaning is not covered"}'::jsonb,
      'Odor sealer application requires prior soot cleaning to be completed and documented. Sealer without cleaning will be denied.',
      'Fire Restoration Guidelines 4.1',
      25,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Add more item caps
    INSERT INTO carrier_item_caps (
      carrier_profile_id, line_item_code, category_id,
      max_quantity, max_quantity_per_zone, max_unit_price,
      cap_reason, carrier_reference, is_active
    ) VALUES
      (v_carrier_id, 'WTR-ANTIMICROB', NULL, NULL, 2000, 0.45, 'Antimicrobial capped per zone per carrier guidelines', 'Rate Schedule A-1', true),
      (v_carrier_id, 'FIRE-ODOR-OZONE', NULL, 5, 3, NULL, 'Ozone treatment limited to 3 days per zone, 5 total', 'Rate Schedule F-1', true),
      (v_carrier_id, 'WTR-MOIST-DAILY', NULL, 14, 7, NULL, 'Daily monitoring capped at 7 days per zone', 'Rate Schedule W-4', true)
    ON CONFLICT DO NOTHING;

  END IF;
END $$;

-- Add more rules to Regional Preferred (lenient carrier)
DO $$
DECLARE
  v_carrier_id UUID;
BEGIN
  SELECT id INTO v_carrier_id FROM carrier_profiles WHERE code = 'REG-PREF';

  IF v_carrier_id IS NOT NULL THEN
    -- Rule: Extended drying allowed with documentation
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'REG-EXTENDED-DRY',
      'Extended Drying Allowance',
      'modification',
      'category',
      'WTR-DRY',
      '{"damageType": ["water"]}'::jsonb,
      'modify_pct',
      '{"allowExtendedDrying": true, "maxDays": 7, "requiresMoistureLog": true}'::jsonb,
      'Extended drying beyond 5 days allowed with daily moisture documentation showing continued elevated readings.',
      'Water Claims Guide 3.1',
      15,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Antimicrobial allowed without pre-approval
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'REG-ANTIMICROB-OK',
      'Antimicrobial Allowance',
      'modification',
      'line_item',
      'WTR-ANTIMICROB',
      '{"waterCategory": [2, 3]}'::jsonb,
      'modify_pct',
      '{"preApprovalRequired": false, "maxQuantityPerZone": 5000}'::jsonb,
      'Antimicrobial application allowed for Category 2-3 water without pre-approval.',
      'Mitigation Guidelines 2.2',
      15,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Higher equipment tolerance
    INSERT INTO carrier_rules (
      carrier_profile_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, carrier_reference, priority, is_active
    ) VALUES (
      v_carrier_id,
      'REG-EQUIP-ALLOW',
      'Equipment Count Allowance',
      'modification',
      'category',
      'WTR-DRY',
      '{"damageType": ["water"]}'::jsonb,
      'modify_pct',
      '{"airMovers": {"maxPerZone": 15, "maxDays": 7}, "dehumidifiers": {"maxPerZone": 5, "maxDays": 7}}'::jsonb,
      'Drying equipment allowed up to 15 air movers and 5 dehumidifiers per zone, 7 days maximum.',
      'Rate Schedule W-1',
      20,
      true
    ) ON CONFLICT (carrier_profile_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

  END IF;
END $$;


-- ============================================
-- PART 5: JURISDICTION RULE SEED PROFILES (ENHANCED)
-- ============================================

-- Add more rules to Texas jurisdiction
DO $$
DECLARE
  v_jurisdiction_id UUID;
BEGIN
  SELECT id INTO v_jurisdiction_id FROM jurisdictions WHERE code = 'US-TX';

  IF v_jurisdiction_id IS NOT NULL THEN
    -- Rule: Permit required for structural work
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'TX-PERMIT-STRUCT',
      'Structural Work Permit Required',
      'regulatory',
      'category',
      'DRY',
      '{"claimTotalMin": 5000}'::jsonb,
      'require_doc',
      '{"required": ["building_permit"], "threshold": 5000}'::jsonb,
      'Structural repair work over $5,000 requires a building permit in Texas.',
      'Texas Local Gov''t Code §214',
      25,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Lead paint testing for pre-1978
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'TX-LEAD-1978',
      'Pre-1978 Lead Paint Testing',
      'regulatory',
      'estimate',
      NULL,
      '{}'::jsonb,
      'warn',
      '{"message": "Properties built before 1978 require lead paint testing before paint disturbance", "propertyYearThreshold": 1978}'::jsonb,
      'Properties constructed before 1978 may contain lead-based paint. Testing required before disturbing painted surfaces per EPA RRP Rule.',
      'EPA 40 CFR 745',
      35,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

  END IF;
END $$;

-- Add more rules to Florida jurisdiction
DO $$
DECLARE
  v_jurisdiction_id UUID;
BEGIN
  SELECT id INTO v_jurisdiction_id FROM jurisdictions WHERE code = 'US-FL';

  IF v_jurisdiction_id IS NOT NULL THEN
    -- Rule: Mold disclosure requirements
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'FL-MOLD-DISC',
      'Florida Mold Disclosure',
      'regulatory',
      'category',
      'MOLD',
      '{}'::jsonb,
      'require_doc',
      '{"required": ["mold_assessment", "remediation_protocol"], "licensedRemediatorRequired": true}'::jsonb,
      'Mold remediation in Florida requires licensed mold assessor and remediator per Florida Statute 468.',
      'Florida Statute 468.84',
      20,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Impact-rated requirements for coastal
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'FL-IMPACT-COAST',
      'Coastal Impact-Rated Requirements',
      'regulatory',
      'category',
      'WIN',
      '{}'::jsonb,
      'warn',
      '{"message": "Window replacement in coastal Florida may require impact-rated glass per Florida Building Code"}'::jsonb,
      'Window replacement in wind-borne debris regions may require impact-rated glazing per Florida Building Code.',
      'Florida Building Code 1609',
      30,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

  END IF;
END $$;

-- Insert additional example jurisdiction: California
INSERT INTO jurisdictions (
  code, name, state_code, country_code,
  sales_tax_rate, labor_taxable, materials_taxable, equipment_taxable,
  op_allowed, op_threshold_override, op_trade_minimum_override, op_max_pct,
  licensed_trades_only, licensed_trades, labor_rate_maximum,
  minimum_charge, service_call_minimum, regulatory_constraints, is_active
) VALUES (
  'US-CA',
  'California',
  'CA',
  'US',
  0.0725,   -- 7.25% base state sales tax (varies by county)
  false,    -- Labor is NOT taxable in California for repairs
  true,
  false,
  true,
  4000.00,  -- California typical O&P threshold
  3,
  20.00,
  true,     -- Licensed trades required
  '["electrical", "plumbing", "hvac", "roofing", "general_contractor"]'::jsonb,
  '{"electrical": 95.00, "plumbing": 90.00, "roofing": 80.00, "general": 75.00}'::jsonb,
  175.00,
  85.00,
  '{"title24EnergyCompliance": true, "seismicRequirements": true, "permitRequired": true, "asbestosNotificationRequired": true}'::jsonb,
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sales_tax_rate = EXCLUDED.sales_tax_rate,
  labor_taxable = EXCLUDED.labor_taxable,
  regulatory_constraints = EXCLUDED.regulatory_constraints,
  updated_at = NOW();

-- Add California jurisdiction rules
DO $$
DECLARE
  v_jurisdiction_id UUID;
BEGIN
  SELECT id INTO v_jurisdiction_id FROM jurisdictions WHERE code = 'US-CA';

  IF v_jurisdiction_id IS NOT NULL THEN
    -- Rule: No labor tax
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'CA-NO-LABOR-TAX',
      'California No Labor Tax',
      'tax',
      'tax',
      'labor',
      '{}'::jsonb,
      'modify_pct',
      '{"taxRate": 0, "appliesTo": "labor"}'::jsonb,
      'California does not apply sales tax to labor for repair services.',
      'California Revenue and Taxation Code 6006',
      10,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Title 24 energy compliance
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'CA-TITLE24',
      'Title 24 Energy Compliance',
      'regulatory',
      'category',
      'HVAC',
      '{}'::jsonb,
      'require_doc',
      '{"required": ["title24_compliance_form", "permit"]}'::jsonb,
      'HVAC replacement in California requires Title 24 energy compliance documentation.',
      'California Building Standards Code Title 24',
      20,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

    -- Rule: Asbestos notification
    INSERT INTO jurisdiction_rules (
      jurisdiction_id, rule_code, rule_name, rule_type,
      target_type, target_value, conditions, effect_type, effect_value,
      explanation_template, regulatory_reference, priority, is_active
    ) VALUES (
      v_jurisdiction_id,
      'CA-ASBESTOS-NOTIFY',
      'Asbestos Notification Required',
      'regulatory',
      'estimate',
      NULL,
      '{}'::jsonb,
      'warn',
      '{"message": "California requires notification to AQMD for demolition/renovation that may disturb asbestos", "propertyYearThreshold": 1980}'::jsonb,
      'Demolition or renovation work in California requires notification to local Air Quality Management District if asbestos may be disturbed.',
      'Cal/OSHA Title 8 CCR 1529',
      25,
      true
    ) ON CONFLICT (jurisdiction_id, rule_code) DO UPDATE SET
      effect_value = EXCLUDED.effect_value;

  END IF;
END $$;


-- ============================================
-- PART 6: VALIDATION RULE SEEDING
-- Data-driven validation rules
-- ============================================

-- Create validation rules reference data
-- These rules are enforced by the validation engine based on line item data

/*
VALIDATION RULE TYPES (encoded in line_items.validation_rules):

1. INSTALL REQUIRES REMOVAL
   - Drywall install requires drywall demo
   - Baseboard install requires baseboard removal
   - Flooring install requires flooring removal

2. PAINT REQUIRES PREP
   - Wall paint requires primer
   - Ceiling paint requires primer
   - Trim paint requires primer (on new trim)

3. REPLACEMENT EXCLUDES CLEANING
   - Drywall replacement excludes soot cleaning (same area)
   - Carpet replacement excludes carpet cleaning

4. QUANTITY GEOMETRY WARNINGS
   - Floor SF exceeds zone geometry
   - Wall SF exceeds calculated wall area
   - Perimeter LF exceeds zone perimeter
*/

-- Update supporting line items with validation rules

-- Drying setup
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity_per_zone": 1,
    "carrier_notes": "Drying equipment setup/takedown. One-time charge per affected area.",
    "validation_checks": [
      {"type": "one_per_zone", "enforce": true},
      {"type": "triggers_equipment", "items": ["WTR-DRY-DEHU", "WTR-DRY-AIRMOV"]}
    ]
  }'::jsonb
WHERE code = 'WTR-DRY-SETUP';

-- Initial moisture inspection
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 25,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Initial moisture mapping required per IICRC S500. Document baseline readings.",
    "validation_checks": [
      {"type": "required_for_water", "enforce": true},
      {"type": "triggers_monitoring", "items": ["WTR-MOIST-DAILY", "WTR-MOIST-LOG"]}
    ]
  }'::jsonb
WHERE code = 'WTR-MOIST-INIT';

-- Daily moisture monitoring
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 14,
    "carrier_notes": "Daily monitoring required for proper drying documentation. Minimum 3 days.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "WTR-DRY-SETUP"},
      {"type": "matches_drying_days", "source": ["WTR-DRY-DEHU", "WTR-DRY-AIRMOV"]}
    ]
  }'::jsonb
WHERE code = 'WTR-MOIST-DAILY';

-- Debris haul
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity": 10,
    "carrier_notes": "Debris haul per load. Estimate 1 load per 500 SF of demo.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires_one_of": ["DEM-DRY-FLOOD", "DEM-DRY-FLOOD-4", "DEM-DRY-FULL", "DEM-FLOOR-VNL", "DEM-FLOOR-TILE", "DEM-FLOOR-CARPET"]},
      {"type": "quantity_proportional", "ratio": "1 per 500 SF demo"}
    ]
  }'::jsonb
WHERE code = 'DEM-HAUL';

-- Thermal fogging
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 100,
    "max_quantity_multiplier": 1.1,
    "carrier_notes": "Thermal fogging for smoke odor. Calculate total surface area (walls + ceiling + floor).",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "FIRE-SOOT-WET"},
      {"type": "severity_required", "min_severity": "moderate"}
    ]
  }'::jsonb
WHERE code = 'FIRE-ODOR-FOG';

-- Ozone treatment
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 1,
    "max_quantity": 5,
    "requires_photo": true,
    "carrier_notes": "Ozone treatment for severe smoke odor. Space must be unoccupied. Document treatment duration.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires_all": ["FIRE-SOOT-WET", "FIRE-ODOR-FOG"]},
      {"type": "severity_required", "min_severity": "severe"},
      {"type": "safety_warning", "message": "Space must be unoccupied during treatment"}
    ]
  }'::jsonb
WHERE code = 'FIRE-ODOR-OZONE';

-- HEPA air scrubber
UPDATE line_items SET
  validation_rules = '{
    "min_quantity": 3,
    "max_quantity": 28,
    "carrier_notes": "HEPA air scrubber required for Category 3 water or fire soot. 1 unit per 1000-2000 SF.",
    "validation_checks": [
      {"type": "prerequisite_required", "requires": "WTR-DRY-SETUP"},
      {"type": "category_required", "min_category": 3, "or_damage_type": "fire"}
    ]
  }'::jsonb
WHERE code = 'WTR-DRY-HEPA';


-- ============================================
-- PART 7: ADDITIONAL LINE ITEMS FOR COMPLETENESS
-- ============================================

-- Ensure carpet lift/relay items exist with full v2 fields
INSERT INTO line_items (
  code, category_id, category_name, description, unit, base_price,
  material_components, labor_components, equipment_components,
  waste_factor, minimum_charge, scope_triggers, related_items,
  quantity_formula, scope_conditions, auto_add_items, requires_items,
  excludes_items, replaces_items, default_coverage_code, default_trade,
  carrier_sensitivity_level, validation_rules
) VALUES (
  'WTR-CARPET-LIFT',
  '01.5',
  'Content Manipulation',
  'Carpet lift and block for drying',
  'SF',
  0.35,
  '[]'::jsonb,
  '[{"task": "carpet_lift", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb,
  '[]'::jsonb,
  1.00,
  100.00,
  '[{"damage_type": "water", "surface": "carpet"}]'::jsonb,
  ARRAY['WTR-CARPET-RELAY'],
  'FLOOR_SF(zone)',
  '{"damageType": ["water"], "affectedSurfaces": ["carpet"], "waterCategory": [1, 2]}'::jsonb,
  '["WTR-CARPET-RELAY"]'::jsonb,
  '[]'::jsonb,
  '["DEM-FLOOR-CARPET"]'::jsonb,
  '[]'::jsonb,
  'A',
  'WTR',
  'low',
  '{"min_quantity": 25, "max_quantity_per_zone": 3000, "carrier_notes": "Carpet lift and block for drying. Cat 1-2 only. Cat 3 requires removal.", "validation_checks": [{"type": "category_max", "max_category": 2}, {"type": "mutually_exclusive", "excludes": "DEM-FLOOR-CARPET"}]}'::jsonb
) ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  default_coverage_code = EXCLUDED.default_coverage_code,
  default_trade = EXCLUDED.default_trade,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;

-- Carpet relay after drying
INSERT INTO line_items (
  code, category_id, category_name, description, unit, base_price,
  material_components, labor_components, equipment_components,
  waste_factor, minimum_charge, scope_triggers, related_items,
  quantity_formula, scope_conditions, auto_add_items, requires_items,
  excludes_items, replaces_items, default_coverage_code, default_trade,
  carrier_sensitivity_level, validation_rules
) VALUES (
  'WTR-CARPET-RELAY',
  '01.5',
  'Content Manipulation',
  'Carpet relay after drying',
  'SF',
  0.42,
  '[]'::jsonb,
  '[{"task": "carpet_relay", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb,
  '[]'::jsonb,
  1.00,
  125.00,
  '[]'::jsonb,
  ARRAY[]::text[],
  'FLOOR_SF(zone)',
  '{"damageType": ["water"], "affectedSurfaces": ["carpet"]}'::jsonb,
  '[]'::jsonb,
  '["WTR-CARPET-LIFT"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'A',
  'WTR',
  'low',
  '{"min_quantity": 25, "max_quantity_per_zone": 3000, "carrier_notes": "Carpet relay after drying complete. Must have moisture readings at acceptable levels.", "validation_checks": [{"type": "prerequisite_required", "requires": "WTR-CARPET-LIFT"}, {"type": "drying_complete", "requires": "moisture_readings_normal"}]}'::jsonb
) ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  default_coverage_code = EXCLUDED.default_coverage_code,
  default_trade = EXCLUDED.default_trade,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;

-- Content move back
INSERT INTO line_items (
  code, category_id, category_name, description, unit, base_price,
  material_components, labor_components, equipment_components,
  waste_factor, minimum_charge, scope_triggers, related_items,
  quantity_formula, scope_conditions, auto_add_items, requires_items,
  excludes_items, replaces_items, default_coverage_code, default_trade,
  carrier_sensitivity_level, validation_rules
) VALUES (
  'WTR-CONTENT-BACK',
  '01.5',
  'Content Manipulation',
  'Content move back - per room',
  'EA',
  125.00,
  '[]'::jsonb,
  '[{"task": "content_move", "hours_per_unit": 1.5, "trade": "general"}]'::jsonb,
  '[]'::jsonb,
  1.00,
  125.00,
  '[]'::jsonb,
  ARRAY[]::text[],
  '1',
  '{"damageType": ["water", "fire", "smoke"]}'::jsonb,
  '[]'::jsonb,
  '["WTR-CONTENT-MOVE"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'C',
  'GEN',
  'low',
  '{"min_quantity": 1, "max_quantity_per_zone": 1, "carrier_notes": "Content move back. One per room after restoration complete.", "validation_checks": [{"type": "prerequisite_required", "requires": "WTR-CONTENT-MOVE"}, {"type": "one_per_zone", "enforce": true}]}'::jsonb
) ON CONFLICT (code) DO UPDATE SET
  quantity_formula = EXCLUDED.quantity_formula,
  scope_conditions = EXCLUDED.scope_conditions,
  auto_add_items = EXCLUDED.auto_add_items,
  requires_items = EXCLUDED.requires_items,
  excludes_items = EXCLUDED.excludes_items,
  replaces_items = EXCLUDED.replaces_items,
  default_coverage_code = EXCLUDED.default_coverage_code,
  default_trade = EXCLUDED.default_trade,
  carrier_sensitivity_level = EXCLUDED.carrier_sensitivity_level,
  validation_rules = EXCLUDED.validation_rules;


-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Seed 24: Claims IQ Intelligent Seed Expansion';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 1: Line Item v2 Intelligence';
  RAISE NOTICE '  - Water Mitigation (extraction, flood cut, antimicrobial, air movers, dehu)';
  RAISE NOTICE '  - Fire/Smoke (contents, soot cleaning, seal & paint, drywall, insulation)';
  RAISE NOTICE '  - Rebuild (drywall, finish, paint, baseboard, flooring)';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 2: Category Enrichment';
  RAISE NOTICE '  - All categories now have default_coverage_code';
  RAISE NOTICE '  - All categories now have default_trade';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 3: Zone/Room Reference';
  RAISE NOTICE '  - Canonical room types documented';
  RAISE NOTICE '  - Default ceiling heights documented';
  RAISE NOTICE '  - Normalized surface values documented';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 4: Enhanced Carrier Profiles';
  RAISE NOTICE '  - NATL-STD: Additional rules (antimicrobial cap, contents doc, equipment limits)';
  RAISE NOTICE '  - REG-PREF: Additional rules (extended drying, antimicrobial allowed)';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 5: Enhanced Jurisdiction Profiles';
  RAISE NOTICE '  - US-TX: Additional rules (permit, lead paint)';
  RAISE NOTICE '  - US-FL: Additional rules (mold, impact-rated)';
  RAISE NOTICE '  - US-CA: New jurisdiction (Title 24, asbestos notification)';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 6: Validation Rules';
  RAISE NOTICE '  - Install requires removal';
  RAISE NOTICE '  - Paint requires prep';
  RAISE NOTICE '  - Replacement excludes cleaning';
  RAISE NOTICE '  - Quantity geometry checks';
  RAISE NOTICE '';
  RAISE NOTICE 'All data is now INTELLIGENCE-ENCODED!';
  RAISE NOTICE '================================================';
END $$;
