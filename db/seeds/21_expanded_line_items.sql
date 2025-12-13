-- Expanded Line Items Catalog - 150+ Items
-- Claims IQ Sketch - Carrier-Ready Estimate Generation System
-- =============================================================

-- ============================================
-- WATER MITIGATION LINE ITEMS (Category 01)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Emergency Response
(gen_random_uuid(), 'WTR-EMERG-CALL', '01', 'Emergency response / service call', 'EA', '[]'::jsonb, '[{"task": "emergency", "hours_per_unit": 2.5, "trade": "miti"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, 'water_mitigation', 'A', 'MITI', 'WTR EMER', true),
(gen_random_uuid(), 'WTR-EMERG-AFTER', '01', 'Emergency response - after hours', 'EA', '[]'::jsonb, '[{"task": "emergency", "hours_per_unit": 2.5, "trade": "miti"}]'::jsonb, '[{"type": "after_hours", "cost_per_unit": 75.00}]'::jsonb, 1.00, 250.00, 'water_mitigation', 'A', 'MITI', 'WTR EMERA', true),

-- Water Extraction
(gen_random_uuid(), 'WTR-EXTRACT-PORT', '01', 'Water extraction - portable extractor', 'SF', '[]'::jsonb, '[{"task": "extract", "hours_per_unit": 0.008, "trade": "miti"}]'::jsonb, '[{"type": "extractor", "cost_per_unit": 0.10}]'::jsonb, 1.00, 150.00, 'water_mitigation', 'A', 'MITI', 'WTR EXTP', true),
(gen_random_uuid(), 'WTR-EXTRACT-TRUCK', '01', 'Water extraction - truck mount', 'SF', '[]'::jsonb, '[{"task": "extract", "hours_per_unit": 0.006, "trade": "miti"}]'::jsonb, '[{"type": "truck_mount", "cost_per_unit": 0.08}]'::jsonb, 1.00, 250.00, 'water_mitigation', 'A', 'MITI', 'WTR EXTM', true),
(gen_random_uuid(), 'WTR-EXTRACT-SUB', '01', 'Water extraction - subfloor/cavity', 'SF', '[]'::jsonb, '[{"task": "extract", "hours_per_unit": 0.012, "trade": "miti"}]'::jsonb, '[{"type": "specialty", "cost_per_unit": 0.20}]'::jsonb, 1.00, 200.00, 'water_mitigation', 'A', 'MITI', 'WTR EXTS', true),

-- Drying Equipment
(gen_random_uuid(), 'WTR-DRY-SETUP', '01', 'Drying equipment setup/takedown', 'EA', '[]'::jsonb, '[{"task": "setup", "hours_per_unit": 1.5, "trade": "miti"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, 'water_mitigation', 'A', 'MITI', 'WTR DSET', true),
(gen_random_uuid(), 'WTR-DRY-DEHU', '01', 'Dehumidifier - LGR per day', 'DAY', '[{"sku": "DEHU-LGR", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.4, "trade": "miti"}]'::jsonb, '[{"type": "dehu_lgr", "cost_per_unit": 85.00}]'::jsonb, 1.00, 110.00, 'water_mitigation', 'A', 'MITI', 'WTR DLGR', true),
(gen_random_uuid(), 'WTR-DRY-DEHU-CON', '01', 'Dehumidifier - conventional per day', 'DAY', '[]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.3, "trade": "miti"}]'::jsonb, '[{"type": "dehu_con", "cost_per_unit": 55.00}]'::jsonb, 1.00, 75.00, 'water_mitigation', 'A', 'MITI', 'WTR DCON', true),
(gen_random_uuid(), 'WTR-DRY-AIRMOV', '01', 'Air mover per day', 'DAY', '[]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.25, "trade": "miti"}]'::jsonb, '[{"type": "air_mover", "cost_per_unit": 35.00}]'::jsonb, 1.00, 50.00, 'water_mitigation', 'A', 'MITI', 'WTR AMOV', true),
(gen_random_uuid(), 'WTR-DRY-HEPA', '01', 'HEPA air scrubber per day', 'DAY', '[]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.4, "trade": "miti"}]'::jsonb, '[{"type": "hepa", "cost_per_unit": 125.00}]'::jsonb, 1.00, 150.00, 'water_mitigation', 'A', 'MITI', 'WTR HEPA', true),
(gen_random_uuid(), 'WTR-DRY-INJECT', '01', 'Injection drying system per day', 'DAY', '[]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.5, "trade": "miti"}]'::jsonb, '[{"type": "inject", "cost_per_unit": 95.00}]'::jsonb, 1.00, 130.00, 'water_mitigation', 'A', 'MITI', 'WTR INJD', true),

-- Moisture Monitoring
(gen_random_uuid(), 'WTR-MOIST-INIT', '01', 'Initial moisture inspection/mapping', 'SF', '[]'::jsonb, '[{"task": "inspect", "hours_per_unit": 0.003, "trade": "miti"}]'::jsonb, '[{"type": "meters", "cost_per_unit": 0.05}]'::jsonb, 1.00, 125.00, 'water_mitigation', 'A', 'MITI', 'WTR MSTI', true),
(gen_random_uuid(), 'WTR-MOIST-DAILY', '01', 'Daily moisture monitoring', 'DAY', '[]'::jsonb, '[{"task": "monitor", "hours_per_unit": 0.6, "trade": "miti"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, 'water_mitigation', 'A', 'MITI', 'WTR MSTD', true),

-- Antimicrobial
(gen_random_uuid(), 'WTR-ANTIMICROB', '01', 'Antimicrobial treatment - surfaces', 'SF', '[{"sku": "ANTIMICRO", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "apply", "hours_per_unit": 0.004, "trade": "miti"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'water_mitigation', 'A', 'MITI', 'WTR ANTI', true),
(gen_random_uuid(), 'WTR-ANTIMICROB-CAV', '01', 'Antimicrobial treatment - wall cavity', 'LF', '[{"sku": "ANTIMICRO", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "apply", "hours_per_unit": 0.015, "trade": "miti"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, 'water_mitigation', 'A', 'MITI', 'WTR ANTIC', true),

-- Content Manipulation
(gen_random_uuid(), 'WTR-CONTENT-OUT', '01', 'Content manipulation - move out', 'HR', '[]'::jsonb, '[{"task": "move", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 90.00, 'water_mitigation', 'A', 'GEN', 'WTR CMOV', true),
(gen_random_uuid(), 'WTR-CONTENT-BACK', '01', 'Content manipulation - move back', 'HR', '[]'::jsonb, '[{"task": "move", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 90.00, 'water_mitigation', 'A', 'GEN', 'WTR CMBK', true),
(gen_random_uuid(), 'WTR-CONTENT-BLOCK', '01', 'Content blocking/protection', 'HR', '[]'::jsonb, '[{"task": "protect", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[{"type": "materials", "cost_per_unit": 15.00}]'::jsonb, 1.00, 60.00, 'water_mitigation', 'A', 'GEN', 'WTR CBLK', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code,
  xactimate_code = EXCLUDED.xactimate_code;

-- ============================================
-- DEMOLITION LINE ITEMS (Category 02)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Drywall Removal
(gen_random_uuid(), 'DEM-DRY-FLOOD', '02', 'Drywall removal - flood cut 2ft', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.04, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM DW2', true),
(gen_random_uuid(), 'DEM-DRY-FLOOD-4', '02', 'Drywall removal - flood cut 4ft', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.075, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM DW4', true),
(gen_random_uuid(), 'DEM-DRY-FULL', '02', 'Drywall removal - full height', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.011, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM DWF', true),
(gen_random_uuid(), 'DEM-DRY-CEIL', '02', 'Drywall removal - ceiling', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.014, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM DWC', true),

-- Insulation Removal
(gen_random_uuid(), 'DEM-INSUL', '02', 'Insulation removal - wet/contaminated', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.008, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM INS', true),
(gen_random_uuid(), 'DEM-INSUL-BLOW', '02', 'Blown insulation removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.005, "trade": "demo"}]'::jsonb, '[{"type": "vacuum", "cost_per_unit": 0.10}]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM INSB', true),

-- Flooring Removal
(gen_random_uuid(), 'DEM-FLOOR-CARP', '02', 'Carpet & pad removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.006, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, 'demolition', 'A', 'DEMO', 'DEM CRPT', true),
(gen_random_uuid(), 'DEM-FLOOR-VNL', '02', 'Vinyl/LVP flooring removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.011, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM VNL', true),
(gen_random_uuid(), 'DEM-FLOOR-TILE', '02', 'Ceramic tile flooring removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.025, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM TIL', true),
(gen_random_uuid(), 'DEM-FLOOR-HARD', '02', 'Hardwood flooring removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.020, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'demolition', 'A', 'DEMO', 'DEM HWD', true),
(gen_random_uuid(), 'DEM-FLOOR-LAM', '02', 'Laminate flooring removal', 'SF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.008, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM LAM', true),

-- Trim Removal
(gen_random_uuid(), 'DEM-BASE', '02', 'Baseboard removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.012, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, 'demolition', 'A', 'DEMO', 'DEM BSE', true),
(gen_random_uuid(), 'DEM-CROWN', '02', 'Crown molding removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.018, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, 'demolition', 'A', 'DEMO', 'DEM CRN', true),
(gen_random_uuid(), 'DEM-CASING', '02', 'Door/window casing removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.015, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, 'demolition', 'A', 'DEMO', 'DEM CSG', true),

-- Cabinet Removal
(gen_random_uuid(), 'DEM-CABINET-BASE', '02', 'Base cabinet removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.10, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM CABB', true),
(gen_random_uuid(), 'DEM-CABINET-WALL', '02', 'Wall cabinet removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.08, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, 'demolition', 'A', 'DEMO', 'DEM CABW', true),
(gen_random_uuid(), 'DEM-COUNTERTOP', '02', 'Countertop removal', 'LF', '[]'::jsonb, '[{"task": "demo", "hours_per_unit": 0.12, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'demolition', 'A', 'DEMO', 'DEM CNTR', true),

-- Hauling
(gen_random_uuid(), 'DEM-HAUL', '02', 'Debris hauling', 'HR', '[]'::jsonb, '[{"task": "haul", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, 'demolition', 'A', 'GEN', 'DEM HAUL', true),
(gen_random_uuid(), 'DEM-DUMP-WK', '02', 'Dumpster rental per week', 'WK', '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster", "cost_per_unit": 450.00}]'::jsonb, 1.00, 450.00, 'demolition', 'A', 'GEN', 'DEM DMPW', true),
(gen_random_uuid(), 'DEM-CONTAIN', '02', 'Containment barrier setup', 'SF', '[{"sku": "POLY-6MIL", "qty_per_unit": 1.2}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.006, "trade": "demo"}]'::jsonb, '[]'::jsonb, 1.20, 75.00, 'demolition', 'A', 'DEMO', 'DEM CONT', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- DRYWALL LINE ITEMS (Category 03/06)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Drywall Installation
(gen_random_uuid(), 'DRY-HTT-12', '03', 'Drywall 1/2" hang, tape, texture - walls', 'SF', '[{"sku": "DRYWALL-12", "qty_per_unit": 0.033}, {"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.018, "trade": "drywall"}, {"task": "tape", "hours_per_unit": 0.020, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, 'drywall', 'A', 'DRYWALL', 'DW HTT', true),
(gen_random_uuid(), 'DRY-HTT-58', '03', 'Drywall 5/8" hang, tape, texture - walls', 'SF', '[{"sku": "DRYWALL-58", "qty_per_unit": 0.033}, {"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.020, "trade": "drywall"}, {"task": "tape", "hours_per_unit": 0.020, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, 'drywall', 'A', 'DRYWALL', 'DW HTT+', true),
(gen_random_uuid(), 'DRY-HTT-MR', '03', 'Drywall moisture resistant - HTT', 'SF', '[{"sku": "DRYWALL-MR", "qty_per_unit": 0.033}, {"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.020, "trade": "drywall"}, {"task": "tape", "hours_per_unit": 0.020, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, 'drywall', 'A', 'DRYWALL', 'DW HTTMR', true),
(gen_random_uuid(), 'DRY-HTT-FIRE', '03', 'Drywall 5/8" Type X fire rated - HTT', 'SF', '[{"sku": "DRYWALL-FIRE", "qty_per_unit": 0.033}, {"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.021, "trade": "drywall"}, {"task": "tape", "hours_per_unit": 0.021, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, 'drywall', 'A', 'DRYWALL', 'DW HTTFR', true),
(gen_random_uuid(), 'DRY-HTT-CEIL', '03', 'Drywall ceiling - HTT', 'SF', '[{"sku": "DRYWALL-12", "qty_per_unit": 0.033}, {"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.024, "trade": "drywall"}, {"task": "tape", "hours_per_unit": 0.024, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, 'drywall', 'A', 'DRYWALL', 'DW HTTCL', true),

-- Drywall Finishing Only
(gen_random_uuid(), 'DRY-TAPE', '03', 'Drywall tape and finish only', 'SF', '[{"sku": "TAPE-DW", "qty_per_unit": 0.5}, {"sku": "MUD-DW", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "tape", "hours_per_unit": 0.021, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'drywall', 'A', 'DRYWALL', 'DW TF', true),
(gen_random_uuid(), 'DRY-TEXTURE', '03', 'Drywall texture match', 'SF', '[{"sku": "MUD-DW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "texture", "hours_per_unit": 0.014, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'drywall', 'A', 'DRYWALL', 'DW TXM', true),
(gen_random_uuid(), 'DRY-SKIM', '03', 'Drywall skim coat', 'SF', '[{"sku": "MUD-DW", "qty_per_unit": 0.03}]'::jsonb, '[{"task": "skim", "hours_per_unit": 0.024, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'drywall', 'A', 'DRYWALL', 'DW SKM', true),
(gen_random_uuid(), 'DRY-CORNER', '03', 'Corner bead install and finish', 'LF', '[{"sku": "CORNER-BEAD", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.038, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.05, 25.00, 'drywall', 'A', 'DRYWALL', 'DW CBE', true),

-- Drywall Patches
(gen_random_uuid(), 'DRY-PATCH-SM', '03', 'Drywall patch - small (up to 12")', 'EA', '[{"sku": "DRYWALL-12", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "patch", "hours_per_unit": 0.5, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 40.00, 'drywall', 'A', 'DRYWALL', 'DW PTS', true),
(gen_random_uuid(), 'DRY-PATCH-MED', '03', 'Drywall patch - medium (12-24")', 'EA', '[{"sku": "DRYWALL-12", "qty_per_unit": 0.50}]'::jsonb, '[{"task": "patch", "hours_per_unit": 0.8, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, 'drywall', 'A', 'DRYWALL', 'DW PTM', true),
(gen_random_uuid(), 'DRY-PATCH-LG', '03', 'Drywall patch - large (24-48")', 'EA', '[{"sku": "DRYWALL-12", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "patch", "hours_per_unit": 1.2, "trade": "drywall"}]'::jsonb, '[]'::jsonb, 1.00, 105.00, 'drywall', 'A', 'DRYWALL', 'DW PTL', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- PAINTING LINE ITEMS (Category 14)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Wall Painting
(gen_random_uuid(), 'PAINT-INT-WALL', '14', 'Interior wall paint - 2 coats', 'SF', '[{"sku": "PAINT-INT", "qty_per_unit": 0.006}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.009, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'interior_paint', 'A', 'PAINT', 'PNT W2', true),
(gen_random_uuid(), 'PAINT-INT-WALL-1', '14', 'Interior wall paint - 1 coat', 'SF', '[{"sku": "PAINT-INT", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.005, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'interior_paint', 'A', 'PAINT', 'PNT W1', true),
(gen_random_uuid(), 'PAINT-INT-WALL-SG', '14', 'Interior wall paint - semi-gloss 2 coats', 'SF', '[{"sku": "PAINT-INT-SG", "qty_per_unit": 0.006}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.010, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'interior_paint', 'A', 'PAINT', 'PNT W2S', true),

-- Ceiling Painting
(gen_random_uuid(), 'PAINT-INT-CEIL', '14', 'Ceiling paint - 2 coats', 'SF', '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.006}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.011, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'interior_paint', 'A', 'PAINT', 'PNT C2', true),
(gen_random_uuid(), 'PAINT-INT-CEIL-1', '14', 'Ceiling paint - 1 coat', 'SF', '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.006, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'interior_paint', 'A', 'PAINT', 'PNT C1', true),

-- Trim Painting
(gen_random_uuid(), 'PAINT-TRIM', '14', 'Trim/baseboard paint', 'LF', '[{"sku": "PAINT-INT-SG", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.014, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, 'interior_paint', 'A', 'PAINT', 'PNT TRM', true),
(gen_random_uuid(), 'PAINT-DOOR', '14', 'Paint door - both sides', 'EA', '[{"sku": "PAINT-INT-SG", "qty_per_unit": 0.15}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.65, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, 'interior_paint', 'A', 'PAINT', 'PNT DR', true),
(gen_random_uuid(), 'PAINT-DOORFRAME', '14', 'Paint door frame/jamb', 'EA', '[{"sku": "PAINT-INT-SG", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.35, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, 'interior_paint', 'A', 'PAINT', 'PNT DRF', true),
(gen_random_uuid(), 'PAINT-WINDOW', '14', 'Paint window trim', 'EA', '[{"sku": "PAINT-INT-SG", "qty_per_unit": 0.06}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.40, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 30.00, 'interior_paint', 'A', 'PAINT', 'PNT WNT', true),
(gen_random_uuid(), 'PAINT-CABINET', '14', 'Paint cabinet face', 'SF', '[{"sku": "PAINT-CAB", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.025, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'interior_paint', 'A', 'PAINT', 'PNT CAB', true),

-- Primer
(gen_random_uuid(), 'PAINT-PRIME-STD', '14', 'Primer - standard PVA', 'SF', '[{"sku": "PRIMER-STD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.005, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'interior_paint', 'A', 'PAINT', 'PNT PRS', true),
(gen_random_uuid(), 'PAINT-PRIME-STAIN', '14', 'Primer - stain blocking', 'SF', '[{"sku": "PRIMER-STAIN", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.006, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'interior_paint', 'A', 'PAINT', 'PNT PRB', true),
(gen_random_uuid(), 'PAINT-PRIME-MOLD', '14', 'Primer - mold resistant', 'SF', '[{"sku": "PRIMER-MOLD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.006, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'interior_paint', 'A', 'PAINT', 'PNT PRM', true),

-- Exterior Painting
(gen_random_uuid(), 'PAINT-EXT-WALL', '14', 'Exterior paint - 2 coats', 'SF', '[{"sku": "PAINT-EXT", "qty_per_unit": 0.007}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.012, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, 'exterior_paint', 'A', 'PAINT', 'PNT EW2', true),
(gen_random_uuid(), 'PAINT-EXT-TRIM', '14', 'Exterior trim paint', 'LF', '[{"sku": "PAINT-EXT", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.018, "trade": "paint"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'exterior_paint', 'A', 'PAINT', 'PNT ETR', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- FLOORING LINE ITEMS (Category 07)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Carpet
(gen_random_uuid(), 'FLR-CARP-STD', '07', 'Carpet standard grade - remove & replace', 'SY', '[{"sku": "CARPET-STD", "qty_per_unit": 1.10}, {"sku": "CARPET-PAD", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.10, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, 'carpet', 'A', 'FLOOR', 'FLR CPT', true),
(gen_random_uuid(), 'FLR-CARP-PREM', '07', 'Carpet premium grade - remove & replace', 'SY', '[{"sku": "CARPET-PREM", "qty_per_unit": 1.10}, {"sku": "CARPET-PAD-PREM", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.12, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 250.00, 'carpet', 'A', 'FLOOR', 'FLR CPTP', true),
(gen_random_uuid(), 'FLR-CARP-PAD', '07', 'Carpet pad only - replace', 'SY', '[{"sku": "CARPET-PAD", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, 'carpet_pad', 'A', 'FLOOR', 'FLR CPAD', true),

-- LVP/LVT
(gen_random_uuid(), 'FLR-LVP-STD', '07', 'Luxury vinyl plank standard - remove & replace', 'SF', '[{"sku": "LVP-STD", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.010, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.030, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, 'lvp_flooring', 'A', 'FLOOR', 'FLR LVP', true),
(gen_random_uuid(), 'FLR-LVP-PREM', '07', 'Luxury vinyl plank premium - remove & replace', 'SF', '[{"sku": "LVP-PREM", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.010, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.035, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 250.00, 'lvp_flooring', 'A', 'FLOOR', 'FLR LVPP', true),

-- Laminate
(gen_random_uuid(), 'FLR-LAM-STD', '07', 'Laminate flooring standard - remove & replace', 'SF', '[{"sku": "LAMINATE-STD", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.008, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.030, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, 'laminate_flooring', 'A', 'FLOOR', 'FLR LAM', true),

-- Hardwood
(gen_random_uuid(), 'FLR-HARD-OAK', '07', 'Hardwood oak flooring - remove & replace', 'SF', '[{"sku": "HARDWOOD-OAK", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.020, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.072, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 400.00, 'hardwood_flooring', 'A', 'FLOOR', 'FLR HWD', true),
(gen_random_uuid(), 'FLR-HARD-ENG', '07', 'Engineered hardwood - remove & replace', 'SF', '[{"sku": "HARDWOOD-ENG", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.015, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.050, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 300.00, 'engineered_hardwood', 'A', 'FLOOR', 'FLR EHW', true),
(gen_random_uuid(), 'FLR-HARD-REFIN', '07', 'Hardwood floor refinish - sand & finish', 'SF', '[{"sku": "FINISH-POLY", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "sand", "hours_per_unit": 0.025, "trade": "floor"}, {"task": "finish", "hours_per_unit": 0.015, "trade": "floor"}]'::jsonb, '[{"type": "sander", "cost_per_unit": 0.25}]'::jsonb, 1.00, 300.00, 'hardwood_flooring', 'A', 'FLOOR', 'FLR HRFN', true),

-- Tile
(gen_random_uuid(), 'FLR-TILE-CER', '07', 'Ceramic tile flooring - remove & replace', 'SF', '[{"sku": "TILE-CER", "qty_per_unit": 1.15}, {"sku": "THINSET", "qty_per_unit": 0.05}, {"sku": "GROUT", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.025, "trade": "tile"}, {"task": "install", "hours_per_unit": 0.083, "trade": "tile"}]'::jsonb, '[]'::jsonb, 1.15, 300.00, 'ceramic_tile', 'A', 'TILE', 'FLR TIL', true),
(gen_random_uuid(), 'FLR-TILE-PORC', '07', 'Porcelain tile flooring - remove & replace', 'SF', '[{"sku": "TILE-PORC", "qty_per_unit": 1.15}, {"sku": "THINSET", "qty_per_unit": 0.05}, {"sku": "GROUT", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.025, "trade": "tile"}, {"task": "install", "hours_per_unit": 0.095, "trade": "tile"}]'::jsonb, '[]'::jsonb, 1.15, 350.00, 'ceramic_tile', 'A', 'TILE', 'FLR TILP', true),

-- Vinyl Sheet
(gen_random_uuid(), 'FLR-VNL-SHEET', '07', 'Sheet vinyl flooring - remove & replace', 'SF', '[{"sku": "VINYL-SHEET", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.010, "trade": "floor"}, {"task": "install", "hours_per_unit": 0.020, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, 'vinyl_sheet', 'A', 'FLOOR', 'FLR VNL', true),

-- Subfloor
(gen_random_uuid(), 'FLR-SUBFLOOR-PLY', '07', 'Subfloor plywood 3/4" - replace', 'SF', '[{"sku": "PLYWOOD-34", "qty_per_unit": 0.033}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.020, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.030, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, 'drywall', 'A', 'CARP', 'FLR SUBP', true),
(gen_random_uuid(), 'FLR-SUBFLOOR-OSB', '07', 'Subfloor OSB 3/4" - replace', 'SF', '[{"sku": "OSB-34", "qty_per_unit": 0.033}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.020, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.025, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 125.00, 'drywall', 'A', 'CARP', 'FLR SUBO', true),

-- Transitions
(gen_random_uuid(), 'FLR-TRANS-METAL', '07', 'Floor transition - metal', 'LF', '[{"sku": "TRANS-METAL", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.05, 25.00, 'drywall', 'A', 'FLOOR', 'FLR TRN', true),
(gen_random_uuid(), 'FLR-TRANS-WOOD', '07', 'Floor transition - wood', 'LF', '[{"sku": "TRANS-WOOD", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "floor"}]'::jsonb, '[]'::jsonb, 1.05, 30.00, 'drywall', 'A', 'FLOOR', 'FLR TRNW', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- TRIM & MILLWORK LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'TRIM-BASE', '03', 'Baseboard 3-1/4" MDF - install', 'LF', '[{"sku": "BASE-MDF", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, 'drywall', 'A', 'CARP', 'TRM BSE', true),
(gen_random_uuid(), 'TRIM-BASE-WOOD', '03', 'Baseboard wood - install', 'LF', '[{"sku": "BASE-WOOD", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.030, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, 'drywall', 'A', 'CARP', 'TRM BSEW', true),
(gen_random_uuid(), 'TRIM-CROWN', '03', 'Crown molding - install', 'LF', '[{"sku": "CROWN", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, 'drywall', 'A', 'CARP', 'TRM CRN', true),
(gen_random_uuid(), 'TRIM-CASING', '03', 'Door/window casing - install', 'LF', '[{"sku": "CASING", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.028, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, 'drywall', 'A', 'CARP', 'TRM CSG', true),
(gen_random_uuid(), 'TRIM-SHOE', '03', 'Shoe molding - install', 'LF', '[{"sku": "SHOE", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.015, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 25.00, 'drywall', 'A', 'CARP', 'TRM SHO', true),
(gen_random_uuid(), 'TRIM-CHAIR', '03', 'Chair rail - install', 'LF', '[{"sku": "CHAIR-RAIL", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.030, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, 'drywall', 'A', 'CARP', 'TRM CHR', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- INSULATION LINE ITEMS (Category 05)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'INSUL-BATT-R13', '05', 'Batt insulation R-13 - walls', 'SF', '[{"sku": "INSUL-R13", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.010, "trade": "insul"}]'::jsonb, '[]'::jsonb, 1.05, 100.00, 'insulation_batt', 'A', 'INSUL', 'INS R13', true),
(gen_random_uuid(), 'INSUL-BATT-R19', '05', 'Batt insulation R-19 - walls/floors', 'SF', '[{"sku": "INSUL-R19", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.012, "trade": "insul"}]'::jsonb, '[]'::jsonb, 1.05, 100.00, 'insulation_batt', 'A', 'INSUL', 'INS R19', true),
(gen_random_uuid(), 'INSUL-BATT-R30', '05', 'Batt insulation R-30 - attic', 'SF', '[{"sku": "INSUL-R30", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.015, "trade": "insul"}]'::jsonb, '[]'::jsonb, 1.05, 125.00, 'insulation_batt', 'A', 'INSUL', 'INS R30', true),
(gen_random_uuid(), 'INSUL-BLOWN', '05', 'Blown insulation - attic', 'SF', '[{"sku": "INSUL-BLOWN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.005, "trade": "insul"}]'::jsonb, '[{"type": "blower", "cost_per_unit": 0.15}]'::jsonb, 1.00, 150.00, 'insulation_blown', 'A', 'INSUL', 'INS BLO', true),
(gen_random_uuid(), 'INSUL-SPRAY-OPEN', '05', 'Spray foam insulation - open cell', 'SF', '[{"sku": "FOAM-OPEN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.008, "trade": "insul"}]'::jsonb, '[{"type": "spray_rig", "cost_per_unit": 0.50}]'::jsonb, 1.00, 200.00, 'insulation_spray_foam', 'A', 'INSUL', 'INS SFO', true),
(gen_random_uuid(), 'INSUL-SPRAY-CLOSED', '05', 'Spray foam insulation - closed cell', 'SF', '[{"sku": "FOAM-CLOSED", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.012, "trade": "insul"}]'::jsonb, '[{"type": "spray_rig", "cost_per_unit": 0.75}]'::jsonb, 1.00, 250.00, 'insulation_spray_foam', 'A', 'INSUL', 'INS SFC', true),
(gen_random_uuid(), 'INSUL-VAPOR', '05', 'Vapor barrier - 6 mil poly', 'SF', '[{"sku": "VAPOR-6MIL", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.005, "trade": "insul"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, 'insulation_batt', 'A', 'INSUL', 'INS VAP', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- DOORS LINE ITEMS (Category 08)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

-- Interior Doors
(gen_random_uuid(), 'DOOR-INT-HC', '08', 'Interior door hollow core - replace', 'EA', '[{"sku": "DOOR-INT-HC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.75, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, 'interior_door', 'A', 'CARP', 'DR INTHC', true),
(gen_random_uuid(), 'DOOR-INT-SC', '08', 'Interior door solid core - replace', 'EA', '[{"sku": "DOOR-INT-SC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.85, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, 'interior_door', 'A', 'CARP', 'DR INTSC', true),
(gen_random_uuid(), 'DOOR-INT-BIFOLD', '08', 'Bifold closet doors - replace pair', 'EA', '[{"sku": "DOOR-BIFOLD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.20, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.60, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, 'interior_door', 'A', 'CARP', 'DR BIF', true),
(gen_random_uuid(), 'DOOR-INT-SLIDE', '08', 'Sliding closet doors - replace pair', 'EA', '[{"sku": "DOOR-SLIDE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "carp"}, {"task": "install", "hours_per_unit": 0.75, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, 'interior_door', 'A', 'CARP', 'DR SLD', true),

-- Entry Doors
(gen_random_uuid(), 'DOOR-EXT-STEEL', '08', 'Entry door steel - replace', 'EA', '[{"sku": "DOOR-EXT-STEEL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.50, "trade": "carp"}, {"task": "install", "hours_per_unit": 2.0, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, 'entry_door_steel', 'A', 'CARP', 'DR EXTS', true),
(gen_random_uuid(), 'DOOR-EXT-FIBER', '08', 'Entry door fiberglass - replace', 'EA', '[{"sku": "DOOR-EXT-FIBER", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.50, "trade": "carp"}, {"task": "install", "hours_per_unit": 2.25, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 450.00, 'entry_door_fiberglass', 'A', 'CARP', 'DR EXTF', true),
(gen_random_uuid(), 'DOOR-EXT-WOOD', '08', 'Entry door wood - replace', 'EA', '[{"sku": "DOOR-EXT-WOOD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.50, "trade": "carp"}, {"task": "install", "hours_per_unit": 2.5, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 650.00, 'entry_door_wood', 'A', 'CARP', 'DR EXTW', true),

-- Sliding/French Doors
(gen_random_uuid(), 'DOOR-PATIO-SLIDE', '08', 'Sliding patio door 6ft - replace', 'EA', '[{"sku": "DOOR-PATIO", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "carp"}, {"task": "install", "hours_per_unit": 3.0, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 750.00, 'sliding_glass_door', 'A', 'CARP', 'DR PAT', true),
(gen_random_uuid(), 'DOOR-FRENCH', '08', 'French door pair - replace', 'EA', '[{"sku": "DOOR-FRENCH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "carp"}, {"task": "install", "hours_per_unit": 4.0, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 1200.00, 'entry_door_wood', 'A', 'CARP', 'DR FRN', true),

-- Garage Doors
(gen_random_uuid(), 'DOOR-GARAGE-1', '08', 'Garage door single 9x7 - replace', 'EA', '[{"sku": "DOOR-GAR-1", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "carp"}, {"task": "install", "hours_per_unit": 3.0, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 700.00, 'garage_door', 'A', 'CARP', 'DR GAR1', true),
(gen_random_uuid(), 'DOOR-GARAGE-2', '08', 'Garage door double 16x7 - replace', 'EA', '[{"sku": "DOOR-GAR-2", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.5, "trade": "carp"}, {"task": "install", "hours_per_unit": 4.0, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 1300.00, 'garage_door', 'A', 'CARP', 'DR GAR2', true),

-- Hardware
(gen_random_uuid(), 'DOOR-HW-ENTRY', '08', 'Entry door lockset - replace', 'EA', '[{"sku": "LOCK-ENTRY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.50, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, 'interior_door', 'A', 'CARP', 'DR HWE', true),
(gen_random_uuid(), 'DOOR-HW-DEAD', '08', 'Deadbolt - replace', 'EA', '[{"sku": "DEADBOLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.40, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, 'interior_door', 'A', 'CARP', 'DR HWD', true),
(gen_random_uuid(), 'DOOR-HW-PASS', '08', 'Passage/privacy lockset - replace', 'EA', '[{"sku": "LOCK-PASS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "carp"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, 'interior_door', 'A', 'CARP', 'DR HWP', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- WINDOWS LINE ITEMS (Category 08)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'WIN-VNL-DH-SM', '08', 'Vinyl window double-hung small (up to 6SF)', 'EA', '[{"sku": "WIN-VNL-SM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.50, "trade": "glass"}, {"task": "install", "hours_per_unit": 1.25, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 275.00, 'vinyl_window', 'A', 'GLASS', 'WN VNS', true),
(gen_random_uuid(), 'WIN-VNL-DH-MED', '08', 'Vinyl window double-hung medium (6-12SF)', 'EA', '[{"sku": "WIN-VNL-MED", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.60, "trade": "glass"}, {"task": "install", "hours_per_unit": 1.50, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, 'vinyl_window', 'A', 'GLASS', 'WN VNM', true),
(gen_random_uuid(), 'WIN-VNL-DH-LG', '08', 'Vinyl window double-hung large (12-20SF)', 'EA', '[{"sku": "WIN-VNL-LG", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "glass"}, {"task": "install", "hours_per_unit": 2.0, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 450.00, 'vinyl_window', 'A', 'GLASS', 'WN VNL', true),
(gen_random_uuid(), 'WIN-VNL-PIC', '08', 'Vinyl window picture', 'EA', '[{"sku": "WIN-VNL-PIC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.50, "trade": "glass"}, {"task": "install", "hours_per_unit": 1.50, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 375.00, 'vinyl_window', 'A', 'GLASS', 'WN PIC', true),
(gen_random_uuid(), 'WIN-VNL-CASE', '08', 'Vinyl window casement', 'EA', '[{"sku": "WIN-VNL-CASE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.60, "trade": "glass"}, {"task": "install", "hours_per_unit": 1.75, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 425.00, 'vinyl_window', 'A', 'GLASS', 'WN CAS', true),
(gen_random_uuid(), 'WIN-WOOD-DH', '08', 'Wood window double-hung', 'EA', '[{"sku": "WIN-WOOD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "glass"}, {"task": "install", "hours_per_unit": 2.25, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 550.00, 'wood_window', 'A', 'GLASS', 'WN WD', true),
(gen_random_uuid(), 'WIN-GLASS-REP', '08', 'Window glass replacement (IGU)', 'SF', '[{"sku": "GLASS-IGU", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.20, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, 'vinyl_window', 'A', 'GLASS', 'WN GLR', true),
(gen_random_uuid(), 'WIN-SCREEN', '08', 'Window screen - replace', 'EA', '[{"sku": "SCREEN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "glass"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, 'vinyl_window', 'A', 'GLASS', 'WN SCR', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- FENCING LINE ITEMS (Category 32 - Coverage B)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'FNC-WOOD-6', '32', 'Wood privacy fence 6ft - remove & replace', 'LF', '[{"sku": "FENCE-WOOD-6", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.10, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.20, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.10, 250.00, 'fence_wood', 'B', 'FENCE', 'FNC WD6', true),
(gen_random_uuid(), 'FNC-WOOD-4', '32', 'Wood fence 4ft - remove & replace', 'LF', '[{"sku": "FENCE-WOOD-4", "qty_per_unit": 1.10}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.15, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, 'fence_wood', 'B', 'FENCE', 'FNC WD4', true),
(gen_random_uuid(), 'FNC-CLINK-4', '32', 'Chain link fence 4ft galv - remove & replace', 'LF', '[{"sku": "FENCE-CLINK", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.12, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.05, 200.00, 'fence_chain_link', 'B', 'FENCE', 'FNC CL4', true),
(gen_random_uuid(), 'FNC-VNL-6', '32', 'Vinyl privacy fence 6ft - remove & replace', 'LF', '[{"sku": "FENCE-VNL-6", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.17, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.05, 300.00, 'fence_vinyl', 'B', 'FENCE', 'FNC VN6', true),
(gen_random_uuid(), 'FNC-IRON', '32', 'Wrought iron fence - remove & replace', 'LF', '[{"sku": "FENCE-IRON", "qty_per_unit": 1.05}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.15, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.25, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.05, 400.00, 'fence_wrought_iron', 'B', 'FENCE', 'FNC IRN', true),
(gen_random_uuid(), 'FNC-POST-WOOD', '32', 'Fence post 4x4 treated - replace', 'EA', '[{"sku": "POST-4X4", "qty_per_unit": 1.0}, {"sku": "CONCRETE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "fence"}, {"task": "install", "hours_per_unit": 0.50, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.00, 60.00, 'fence_wood', 'B', 'FENCE', 'FNC PST', true),
(gen_random_uuid(), 'FNC-GATE-WOOD', '32', 'Wood fence gate - replace', 'EA', '[{"sku": "GATE-WOOD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "fence"}, {"task": "install", "hours_per_unit": 1.0, "trade": "fence"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, 'fence_wood', 'B', 'FENCE', 'FNC GTW', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- GENERAL CONDITIONS LINE ITEMS (Category 99)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'GEN-PERMIT', '99', 'Building permit', 'EA', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 1.00, 0.00, NULL, 'A', NULL, 'GEN PRMT', true),
(gen_random_uuid(), 'GEN-SUPER', '99', 'Job supervision', 'HR', '[]'::jsonb, '[{"task": "supervise", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 0.00, NULL, 'A', NULL, 'GEN SUP', true),
(gen_random_uuid(), 'GEN-CLEAN-ROUGH', '99', 'Rough cleaning during construction', 'SF', '[]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.002, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, NULL, 'A', 'GEN', 'CLN RGH', true),
(gen_random_uuid(), 'GEN-CLEAN-FINAL', '99', 'Final cleaning after construction', 'SF', '[]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.004, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, NULL, 'A', 'GEN', 'CLN FNL', true),
(gen_random_uuid(), 'GEN-PROTECT', '99', 'Floor/surface protection', 'SF', '[{"sku": "PROTECT-FILM", "qty_per_unit": 1.1}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.003, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, NULL, 'A', 'GEN', 'GEN PRO', true),
(gen_random_uuid(), 'GEN-TEMP-HEAT', '99', 'Temporary heating per day', 'DAY', '[]'::jsonb, '[]'::jsonb, '[{"type": "heater", "cost_per_unit": 75.00}]'::jsonb, 1.00, 75.00, NULL, 'A', NULL, 'GEN HTD', true),
(gen_random_uuid(), 'GEN-TEMP-POWER', '99', 'Temporary power setup', 'EA', '[]'::jsonb, '[{"task": "setup", "hours_per_unit": 2.0, "trade": "elec"}]'::jsonb, '[{"type": "generator", "cost_per_unit": 150.00}]'::jsonb, 1.00, 250.00, NULL, 'A', 'ELEC', 'GEN PWR', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- FIRE & SMOKE RESTORATION (Category 04)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, depreciation_type, default_coverage_code, trade_code, xactimate_code, is_active) VALUES

(gen_random_uuid(), 'FIRE-ASSESS', '04', 'Fire/smoke damage assessment', 'HR', '[]'::jsonb, '[{"task": "assess", "hours_per_unit": 1.0, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, 'fire_restoration', 'A', 'FIRE', 'FIR ASS', true),
(gen_random_uuid(), 'FIRE-SOOT-DRY', '04', 'Dry soot removal - surfaces', 'SF', '[{"sku": "SOOT-SPONGE", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.008, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, 'fire_restoration', 'A', 'FIRE', 'FIR SDR', true),
(gen_random_uuid(), 'FIRE-SOOT-WET', '04', 'Wet soot removal - surfaces', 'SF', '[{"sku": "DEGREASER", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.012, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'fire_restoration', 'A', 'FIRE', 'FIR SWT', true),
(gen_random_uuid(), 'FIRE-SOOT-PROTEIN', '04', 'Protein/grease soot cleaning', 'SF', '[{"sku": "DEGREASER", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.015, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, 'fire_restoration', 'A', 'FIRE', 'FIR SPR', true),
(gen_random_uuid(), 'FIRE-ODOR-FOG', '04', 'Thermal fogging - odor treatment', 'SF', '[{"sku": "FOG-FLUID", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "fog", "hours_per_unit": 0.003, "trade": "fire"}]'::jsonb, '[{"type": "fogger", "cost_per_unit": 0.10}]'::jsonb, 1.00, 100.00, 'fire_restoration', 'A', 'FIRE', 'FIR FOG', true),
(gen_random_uuid(), 'FIRE-ODOR-OZONE', '04', 'Ozone treatment - per day', 'DAY', '[]'::jsonb, '[{"task": "treat", "hours_per_unit": 0.5, "trade": "fire"}]'::jsonb, '[{"type": "ozone", "cost_per_unit": 125.00}]'::jsonb, 1.00, 175.00, 'fire_restoration', 'A', 'FIRE', 'FIR OZN', true),
(gen_random_uuid(), 'FIRE-ODOR-SEAL', '04', 'Odor sealing primer application', 'SF', '[{"sku": "ODOR-SEAL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "seal", "hours_per_unit": 0.006, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, 'fire_restoration', 'A', 'FIRE', 'FIR SEL', true),
(gen_random_uuid(), 'FIRE-HVAC-CLEAN', '04', 'HVAC duct cleaning after fire', 'LF', '[]'::jsonb, '[{"task": "clean", "hours_per_unit": 0.025, "trade": "fire"}]'::jsonb, '[{"type": "vacuum", "cost_per_unit": 0.50}]'::jsonb, 1.00, 200.00, 'fire_restoration', 'A', 'FIRE', 'FIR HVC', true),
(gen_random_uuid(), 'FIRE-ELEC-CLEAN', '04', 'Electronics cleaning/restoration', 'HR', '[{"sku": "ELEC-CLEAN", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "clean", "hours_per_unit": 1.0, "trade": "fire"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, 'fire_restoration', 'A', 'FIRE', 'FIR ELC', true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  depreciation_type = EXCLUDED.depreciation_type,
  default_coverage_code = EXCLUDED.default_coverage_code,
  trade_code = EXCLUDED.trade_code;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$ BEGIN RAISE NOTICE 'Expanded line items loaded: Water Mitigation, Demolition, Drywall, Painting, Flooring, Trim, Insulation, Doors, Windows, Fencing, General Conditions, Fire/Smoke!'; END $$;
