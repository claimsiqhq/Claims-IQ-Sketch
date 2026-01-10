-- Migration: Seed Scope Line Items Catalog
--
-- PURPOSE: Populate the scope_line_items table with a minimal real catalog
-- of 50-100 line items covering common restoration work.
--
-- DESIGN: Line items are organized by trade and include:
-- - Xactimate-style codes
-- - Quantity formulas referencing zone metrics
-- - Default waste factors where applicable
-- - Companion rules for dependencies
--
-- See: docs/SCOPE_ENGINE.md for architecture details.

BEGIN;

-- ============================================
-- MITIGATION (MIT) - Emergency & Water Mitigation
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('MIT-EMRG-SETUP', 'Emergency service call / setup', 'EA', 'MIT', NULL, 0.000, 'setup', '{"damage_types": ["water", "fire", "mold"]}', 1),
  ('MIT-WTEX-SF', 'Water extraction - standing water', 'SF', 'MIT', 'FLOOR_SF', 0.000, 'extract', '{"damage_types": ["water"], "severity": ["moderate", "severe"]}', 2),
  ('MIT-WTEX-CAR', 'Water extraction - carpet & pad', 'SF', 'MIT', 'FLOOR_SF', 0.000, 'extract', '{"damage_types": ["water"], "surfaces": ["floor"]}', 3),
  ('MIT-DEHU-DAY', 'Dehumidifier - per day', 'DAY', 'MIT', NULL, 0.000, 'dry', '{"damage_types": ["water"]}', 4),
  ('MIT-AFAN-DAY', 'Air mover / fan - per day', 'DAY', 'MIT', NULL, 0.000, 'dry', '{"damage_types": ["water"]}', 5),
  ('MIT-MOIST-EA', 'Moisture monitoring', 'EA', 'MIT', NULL, 0.000, 'monitor', '{"damage_types": ["water"]}', 6),
  ('MIT-ANTI-SF', 'Apply antimicrobial treatment', 'SF', 'MIT', 'FLOOR_SF', 0.050, 'treat', '{"damage_types": ["water", "mold"]}', 7),
  ('MIT-SANI-SF', 'Sanitize affected surfaces', 'SF', 'MIT', 'WALLS_CEILING_SF', 0.000, 'clean', '{"damage_types": ["water"]}', 8),
  ('MIT-CONT-SF', 'Containment barrier setup', 'SF', 'MIT', NULL, 0.100, 'setup', '{"damage_types": ["water", "mold", "fire"]}', 9),
  ('MIT-HEPA-DAY', 'HEPA air scrubber - per day', 'DAY', 'MIT', NULL, 0.000, 'clean', '{"damage_types": ["mold", "fire", "smoke"]}', 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- DEMOLITION (DEM) - Demo & Removal
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('DEM-DRY-SF', 'Remove drywall - standard', 'SF', 'DEM', 'WALL_SF_NET', 0.000, 'remove', '{"surfaces": ["wall"]}', 1),
  ('DEM-DRY-CEIL', 'Remove drywall - ceiling', 'SF', 'DEM', 'CEILING_SF', 0.000, 'remove', '{"surfaces": ["ceiling"]}', 2),
  ('DEM-INS-SF', 'Remove insulation - batt', 'SF', 'DEM', 'WALL_SF_NET', 0.000, 'remove', '{"surfaces": ["wall"]}', 3),
  ('DEM-CAR-SF', 'Remove carpet and pad', 'SF', 'DEM', 'FLOOR_SF', 0.000, 'remove', '{"surfaces": ["floor"]}', 4),
  ('DEM-VIN-SF', 'Remove vinyl flooring', 'SF', 'DEM', 'FLOOR_SF', 0.000, 'remove', '{"surfaces": ["floor"]}', 5),
  ('DEM-TIL-SF', 'Remove ceramic tile flooring', 'SF', 'DEM', 'FLOOR_SF', 0.000, 'remove', '{"surfaces": ["floor"]}', 6),
  ('DEM-HWD-SF', 'Remove hardwood flooring', 'SF', 'DEM', 'FLOOR_SF', 0.000, 'remove', '{"surfaces": ["floor"]}', 7),
  ('DEM-LAM-SF', 'Remove laminate flooring', 'SF', 'DEM', 'FLOOR_SF', 0.000, 'remove', '{"surfaces": ["floor"]}', 8),
  ('DEM-BASE-LF', 'Remove baseboard', 'LF', 'DEM', 'PERIMETER_LF', 0.000, 'remove', '{}', 9),
  ('DEM-CABS-LF', 'Remove base cabinets', 'LF', 'DEM', NULL, 0.000, 'remove', '{"room_types": ["kitchen", "bathroom"]}', 10),
  ('DEM-HAUL-EA', 'Haul debris - per load', 'EA', 'DEM', NULL, 0.000, 'haul', '{}', 11)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- DRYWALL (DRY)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, companion_rules, sort_order) VALUES
  ('DRY-1/2-SF', 'Drywall 1/2" - hang, tape, texture', 'SF', 'DRY', 'WALL_SF_NET', 0.100, 'install', '{"surfaces": ["wall"]}', '{"auto_adds": ["DRY-TAPE-SF"]}', 1),
  ('DRY-5/8-SF', 'Drywall 5/8" - hang, tape, texture', 'SF', 'DRY', 'WALL_SF_NET', 0.100, 'install', '{"surfaces": ["wall"]}', '{"auto_adds": ["DRY-TAPE-SF"]}', 2),
  ('DRY-CEIL-SF', 'Drywall ceiling - hang, tape, texture', 'SF', 'DRY', 'CEILING_SF', 0.100, 'install', '{"surfaces": ["ceiling"]}', '{"auto_adds": ["DRY-TAPE-SF"]}', 3),
  ('DRY-TAPE-SF', 'Tape and finish drywall', 'SF', 'DRY', 'WALL_SF_NET', 0.000, 'finish', '{"surfaces": ["wall", "ceiling"]}', '{}', 4),
  ('DRY-TEXT-SF', 'Texture - orange peel / knockdown', 'SF', 'DRY', 'WALL_SF_NET', 0.000, 'finish', '{"surfaces": ["wall", "ceiling"]}', '{}', 5),
  ('DRY-TEXT-POP', 'Texture - popcorn ceiling', 'SF', 'DRY', 'CEILING_SF', 0.000, 'finish', '{"surfaces": ["ceiling"]}', '{}', 6),
  ('DRY-PATCH-SM', 'Drywall patch - small (< 2 SF)', 'EA', 'DRY', NULL, 0.000, 'repair', '{"surfaces": ["wall", "ceiling"]}', '{}', 7),
  ('DRY-PATCH-LG', 'Drywall patch - large (2-16 SF)', 'EA', 'DRY', NULL, 0.000, 'repair', '{"surfaces": ["wall", "ceiling"]}', '{}', 8),
  ('DRY-MOLD-SF', 'Mold-resistant drywall', 'SF', 'DRY', 'WALL_SF_NET', 0.100, 'install', '{"damage_types": ["water", "mold"], "surfaces": ["wall"]}', '{}', 9)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- PAINTING (PNT)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, companion_rules, sort_order) VALUES
  ('PNT-WALL-SF', 'Paint walls - 2 coats', 'SF', 'PNT', 'WALL_SF_NET', 0.050, 'paint', '{"surfaces": ["wall"]}', '{"requires": ["DRY-1/2-SF"]}', 1),
  ('PNT-CEIL-SF', 'Paint ceiling - 2 coats', 'SF', 'PNT', 'CEILING_SF', 0.050, 'paint', '{"surfaces": ["ceiling"]}', '{}', 2),
  ('PNT-PRIM-SF', 'Prime surfaces - stain block', 'SF', 'PNT', 'WALLS_CEILING_SF', 0.050, 'prime', '{"damage_types": ["water", "smoke", "fire"]}', '{}', 3),
  ('PNT-BASE-LF', 'Paint baseboard - 2 coats', 'LF', 'PNT', 'PERIMETER_LF', 0.000, 'paint', '{}', '{}', 4),
  ('PNT-DOOR-EA', 'Paint door - both sides', 'EA', 'PNT', NULL, 0.000, 'paint', '{}', '{}', 5),
  ('PNT-CLOS-EA', 'Paint closet interior', 'EA', 'PNT', NULL, 0.000, 'paint', '{}', '{}', 6),
  ('PNT-SEAL-SF', 'Seal surfaces - smoke/odor', 'SF', 'PNT', 'WALLS_CEILING_SF', 0.050, 'seal', '{"damage_types": ["fire", "smoke"]}', '{}', 7),
  ('PNT-MASK-HR', 'Mask and protect - per hour', 'HR', 'PNT', NULL, 0.000, 'prep', '{}', '{}', 8)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- FLOORING (FLR)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('FLR-CAR-SF', 'Carpet - standard grade', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 1),
  ('FLR-CAR-PAD', 'Carpet pad - standard', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 2),
  ('FLR-VIN-SF', 'Vinyl plank flooring', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 3),
  ('FLR-VIN-SH', 'Sheet vinyl flooring', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 4),
  ('FLR-TIL-SF', 'Ceramic tile flooring', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 5),
  ('FLR-HWD-SF', 'Hardwood flooring - prefinished', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 6),
  ('FLR-LAM-SF', 'Laminate flooring', 'SF', 'FLR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 7),
  ('FLR-ULAY-SF', 'Flooring underlayment', 'SF', 'FLR', 'FLOOR_SF', 0.050, 'install', '{"surfaces": ["floor"]}', 8),
  ('FLR-TRAN-EA', 'Transition strip', 'EA', 'FLR', NULL, 0.000, 'install', '{}', 9),
  ('FLR-BASE-LF', 'Baseboard - standard', 'LF', 'FLR', 'PERIMETER_LF', 0.100, 'install', '{}', 10),
  ('FLR-SHOE-LF', 'Shoe molding', 'LF', 'FLR', 'PERIMETER_LF', 0.100, 'install', '{}', 11),
  ('FLR-QRND-LF', 'Quarter round molding', 'LF', 'FLR', 'PERIMETER_LF', 0.100, 'install', '{}', 12)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- INSULATION (INS)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('INS-BATT-SF', 'Batt insulation - R-13', 'SF', 'INS', 'WALL_SF_NET', 0.100, 'install', '{"surfaces": ["wall"]}', 1),
  ('INS-BATT-R19', 'Batt insulation - R-19', 'SF', 'INS', 'WALL_SF_NET', 0.100, 'install', '{"surfaces": ["wall"]}', 2),
  ('INS-BATT-R30', 'Batt insulation - R-30 (attic)', 'SF', 'INS', 'CEILING_SF', 0.100, 'install', '{"surfaces": ["ceiling"]}', 3),
  ('INS-BLOW-SF', 'Blown insulation - attic', 'SF', 'INS', 'CEILING_SF', 0.050, 'install', '{"zone_types": ["attic"]}', 4),
  ('INS-FOAM-SF', 'Spray foam insulation', 'SF', 'INS', 'WALL_SF_NET', 0.050, 'install', '{"surfaces": ["wall"]}', 5)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- CARPENTRY (CAR)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('CAR-FRME-LF', 'Wall framing - 2x4 standard', 'LF', 'CAR', 'PERIMETER_LF', 0.100, 'install', '{"surfaces": ["wall"]}', 1),
  ('CAR-FRME-EXT', 'Wall framing - 2x6 exterior', 'LF', 'CAR', 'PERIMETER_LF', 0.100, 'install', '{"surfaces": ["wall"]}', 2),
  ('CAR-CEIL-LF', 'Ceiling framing / joists', 'LF', 'CAR', NULL, 0.100, 'install', '{"surfaces": ["ceiling"]}', 3),
  ('CAR-SUBF-SF', 'Subfloor - plywood', 'SF', 'CAR', 'FLOOR_SF', 0.100, 'install', '{"surfaces": ["floor"]}', 4),
  ('CAR-DOOR-EA', 'Interior door - pre-hung', 'EA', 'CAR', NULL, 0.000, 'install', '{}', 5),
  ('CAR-DOOR-EXT', 'Exterior door - pre-hung', 'EA', 'CAR', NULL, 0.000, 'install', '{}', 6),
  ('CAR-TRIM-LF', 'Door/window trim - standard', 'LF', 'CAR', NULL, 0.100, 'install', '{}', 7),
  ('CAR-CRWN-LF', 'Crown molding', 'LF', 'CAR', 'PERIMETER_LF', 0.100, 'install', '{}', 8),
  ('CAR-CLOS-EA', 'Closet shelving system', 'EA', 'CAR', NULL, 0.000, 'install', '{}', 9)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- CABINETRY (CAB)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('CAB-BASE-LF', 'Base cabinet - standard', 'LF', 'CAB', NULL, 0.000, 'install', '{"room_types": ["kitchen", "bathroom"]}', 1),
  ('CAB-WALL-LF', 'Wall cabinet - standard', 'LF', 'CAB', NULL, 0.000, 'install', '{"room_types": ["kitchen"]}', 2),
  ('CAB-TALL-EA', 'Tall/pantry cabinet', 'EA', 'CAB', NULL, 0.000, 'install', '{"room_types": ["kitchen"]}', 3),
  ('CAB-VAN-EA', 'Bathroom vanity cabinet', 'EA', 'CAB', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 4)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- COUNTERTOPS (CTR)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('CTR-LAM-SF', 'Laminate countertop', 'SF', 'CTR', NULL, 0.100, 'install', '{"room_types": ["kitchen", "bathroom"]}', 1),
  ('CTR-GRAN-SF', 'Granite countertop', 'SF', 'CTR', NULL, 0.100, 'install', '{"room_types": ["kitchen", "bathroom"]}', 2),
  ('CTR-QRTZ-SF', 'Quartz countertop', 'SF', 'CTR', NULL, 0.100, 'install', '{"room_types": ["kitchen", "bathroom"]}', 3),
  ('CTR-BUBL-SF', 'Butcher block countertop', 'SF', 'CTR', NULL, 0.100, 'install', '{"room_types": ["kitchen"]}', 4),
  ('CTR-SINK-EA', 'Undermount sink cutout', 'EA', 'CTR', NULL, 0.000, 'install', '{}', 5)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- ROOFING (RFG)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('RFG-SHIN-SQ', 'Asphalt shingles - 3-tab', 'SQ', 'RFG', 'ROOF_SQ', 0.100, 'install', '{"zone_types": ["roof"]}', 1),
  ('RFG-SHIN-AR', 'Asphalt shingles - architectural', 'SQ', 'RFG', 'ROOF_SQ', 0.100, 'install', '{"zone_types": ["roof"]}', 2),
  ('RFG-FELT-SQ', 'Roofing felt underlayment', 'SQ', 'RFG', 'ROOF_SQ', 0.100, 'install', '{"zone_types": ["roof"]}', 3),
  ('RFG-ICE-SQ', 'Ice and water shield', 'SQ', 'RFG', NULL, 0.100, 'install', '{"zone_types": ["roof"]}', 4),
  ('RFG-DECK-SF', 'Roof decking - plywood', 'SF', 'RFG', 'ROOF_SF', 0.100, 'install', '{"zone_types": ["roof"]}', 5),
  ('RFG-RIDG-LF', 'Ridge cap shingles', 'LF', 'RFG', NULL, 0.100, 'install', '{"zone_types": ["roof"]}', 6),
  ('RFG-DRIP-LF', 'Drip edge', 'LF', 'RFG', NULL, 0.050, 'install', '{"zone_types": ["roof"]}', 7),
  ('RFG-VENT-EA', 'Roof vent', 'EA', 'RFG', NULL, 0.000, 'install', '{"zone_types": ["roof"]}', 8),
  ('RFG-BOOT-EA', 'Pipe boot / flashing', 'EA', 'RFG', NULL, 0.000, 'install', '{"zone_types": ["roof"]}', 9),
  ('RFG-STEP-LF', 'Step flashing', 'LF', 'RFG', NULL, 0.050, 'install', '{"zone_types": ["roof"]}', 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- WINDOWS (WIN)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('WIN-SING-EA', 'Window - single hung, standard', 'EA', 'WIN', NULL, 0.000, 'install', '{}', 1),
  ('WIN-DOUB-EA', 'Window - double hung, standard', 'EA', 'WIN', NULL, 0.000, 'install', '{}', 2),
  ('WIN-SLID-EA', 'Window - sliding', 'EA', 'WIN', NULL, 0.000, 'install', '{}', 3),
  ('WIN-CASE-EA', 'Window - casement', 'EA', 'WIN', NULL, 0.000, 'install', '{}', 4),
  ('WIN-PICT-EA', 'Window - picture (fixed)', 'EA', 'WIN', NULL, 0.000, 'install', '{}', 5),
  ('WIN-SEAL-LF', 'Window seal / caulk', 'LF', 'WIN', NULL, 0.050, 'install', '{}', 6)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- EXTERIORS (EXT)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('EXT-SDIN-SF', 'Vinyl siding', 'SF', 'EXT', 'WALL_SF', 0.100, 'install', '{"zone_types": ["elevation"]}', 1),
  ('EXT-HDIE-SF', 'HardiePlank siding', 'SF', 'EXT', 'WALL_SF', 0.100, 'install', '{"zone_types": ["elevation"]}', 2),
  ('EXT-SOFIT-LF', 'Soffit - vinyl', 'LF', 'EXT', NULL, 0.100, 'install', '{"zone_types": ["elevation"]}', 3),
  ('EXT-FASC-LF', 'Fascia board', 'LF', 'EXT', NULL, 0.100, 'install', '{"zone_types": ["elevation"]}', 4),
  ('EXT-GUTTER-LF', 'Gutters - seamless aluminum', 'LF', 'EXT', NULL, 0.050, 'install', '{"zone_types": ["elevation"]}', 5),
  ('EXT-DSPOUT-LF', 'Downspouts', 'LF', 'EXT', NULL, 0.050, 'install', '{"zone_types": ["elevation"]}', 6)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- ELECTRICAL (ELE)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('ELE-OUTL-EA', 'Electrical outlet - standard', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 1),
  ('ELE-OUTL-GFI', 'Electrical outlet - GFCI', 'EA', 'ELE', NULL, 0.000, 'install', '{"room_types": ["kitchen", "bathroom"]}', 2),
  ('ELE-SWCH-EA', 'Light switch - single pole', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 3),
  ('ELE-SWCH-3W', 'Light switch - 3-way', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 4),
  ('ELE-LITE-EA', 'Light fixture - standard', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 5),
  ('ELE-FAN-EA', 'Ceiling fan with light', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 6),
  ('ELE-RECAN-EA', 'Recessed light (can)', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 7),
  ('ELE-SMOK-EA', 'Smoke detector - hardwired', 'EA', 'ELE', NULL, 0.000, 'install', '{}', 8)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- PLUMBING (PLM)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('PLM-SINK-EA', 'Kitchen sink - stainless', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["kitchen"]}', 1),
  ('PLM-FAUCET-EA', 'Kitchen faucet', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["kitchen"]}', 2),
  ('PLM-DISP-EA', 'Garbage disposal', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["kitchen"]}', 3),
  ('PLM-TOIL-EA', 'Toilet - standard', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 4),
  ('PLM-LAV-EA', 'Bathroom lavatory/sink', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 5),
  ('PLM-BFAUCET-EA', 'Bathroom faucet', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 6),
  ('PLM-TUB-EA', 'Bathtub - standard', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 7),
  ('PLM-SHWR-EA', 'Shower stall - prefab', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 8),
  ('PLM-SHVL-EA', 'Shower valve / trim', 'EA', 'PLM', NULL, 0.000, 'install', '{"room_types": ["bathroom"]}', 9),
  ('PLM-WH-EA', 'Water heater - 50 gallon', 'EA', 'PLM', NULL, 0.000, 'install', '{}', 10)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- HVAC (HVAC)
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('HVAC-DUCT-LF', 'Ductwork - flexible', 'LF', 'HVAC', NULL, 0.100, 'install', '{}', 1),
  ('HVAC-DUCT-RG', 'Ductwork - rigid', 'LF', 'HVAC', NULL, 0.100, 'install', '{}', 2),
  ('HVAC-VENT-EA', 'Supply vent / register', 'EA', 'HVAC', NULL, 0.000, 'install', '{}', 3),
  ('HVAC-RETN-EA', 'Return air grille', 'EA', 'HVAC', NULL, 0.000, 'install', '{}', 4),
  ('HVAC-THERM-EA', 'Thermostat - standard', 'EA', 'HVAC', NULL, 0.000, 'install', '{}', 5)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- GENERAL (GEN) - General Conditions
-- ============================================

INSERT INTO scope_line_items (code, description, unit, trade_code, quantity_formula, default_waste_factor, activity_type, scope_conditions, sort_order) VALUES
  ('GEN-PROT-SF', 'Floor protection - temporary', 'SF', 'GEN', 'FLOOR_SF', 0.050, 'protect', '{}', 1),
  ('GEN-CLEAN-SF', 'Final cleaning', 'SF', 'GEN', 'FLOOR_SF', 0.000, 'clean', '{}', 2),
  ('GEN-SUPER-HR', 'Supervision / project management', 'HR', 'GEN', NULL, 0.000, 'manage', '{}', 3),
  ('GEN-PERMIT-EA', 'Building permit', 'EA', 'GEN', NULL, 0.000, 'admin', '{}', 4)
ON CONFLICT (code) DO NOTHING;

COMMIT;
