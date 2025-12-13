-- Water Mitigation, Demolition, Drywall, and Interior Painting Categories, Materials, and Line Items
-- This seed file adds the missing categories and line items for a complete estimate generation system

-- ============================================
-- PART 1: ADD MISSING CATEGORIES
-- ============================================

-- Water Mitigation Categories (01)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('01', NULL, 'Water Mitigation', 'Water damage mitigation and drying', 1),
('01.1', '01', 'Emergency Services', 'Emergency water extraction', 1),
('01.2', '01', 'Water Extraction', 'Standing water removal', 2),
('01.3', '01', 'Structural Drying', 'Dehumidification and air movement', 3),
('01.4', '01', 'Moisture Monitoring', 'Moisture detection and documentation', 4),
('01.5', '01', 'Content Manipulation', 'Move out, pack out, protection', 5),
('01.6', '01', 'Antimicrobial', 'Antimicrobial treatment and prevention', 6)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Demolition Category (02)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('02', NULL, 'Demolition & Debris', 'Selective demolition and debris removal', 2),
('02.1', '02', 'Selective Demo', 'Targeted removal of damaged materials', 1),
('02.2', '02', 'Debris Removal', 'Hauling and disposal', 2),
('02.3', '02', 'Containment', 'Dust barriers and protection', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- General Cleaning (03)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('03', NULL, 'General Cleaning', 'Surface and content cleaning', 3),
('03.1', '03', 'Surface Cleaning', 'Walls, ceilings, floors cleaning', 1),
('03.2', '03', 'Content Cleaning', 'Personal property cleaning', 2),
('03.3', '03', 'Deodorization', 'Odor removal treatments', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Drywall Category (06)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('06', NULL, 'Drywall & Walls', 'Drywall installation and repair', 6),
('06.1', '06', 'Drywall Removal', 'Drywall demolition', 1),
('06.2', '06', 'Drywall Installation', 'New drywall hanging', 2),
('06.3', '06', 'Drywall Finishing', 'Tape, mud, and texture', 3),
('06.4', '06', 'Wall Repairs', 'Patching and minor repairs', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Interior Painting (14)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('14', NULL, 'Interior Painting', 'Interior paint and finishes', 14),
('14.1', '14', 'Wall Painting', 'Interior wall painting', 1),
('14.2', '14', 'Ceiling Painting', 'Ceiling painting', 2),
('14.3', '14', 'Trim Painting', 'Trim, door, and detail painting', 3),
('14.4', '14', 'Primer Application', 'Primer and sealers', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Cabinets & Countertops (15) - Standalone category
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('15', NULL, 'Cabinets & Countertops', 'Kitchen and bath cabinetry', 15),
('15.1', '15', 'Base Cabinets', 'Kitchen and bath base cabinets', 1),
('15.2', '15', 'Wall Cabinets', 'Kitchen and bath wall cabinets', 2),
('15.3', '15', 'Countertops', 'All countertop types', 3),
('15.4', '15', 'Cabinet Hardware', 'Pulls, hinges, accessories', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Trim & Millwork (16)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('16', NULL, 'Trim & Millwork', 'Interior trim and millwork', 16),
('16.1', '16', 'Baseboard', 'Base trim installation', 1),
('16.2', '16', 'Crown Molding', 'Crown molding installation', 2),
('16.3', '16', 'Door Casing', 'Door and window casing', 3),
('16.4', '16', 'Chair Rail', 'Chair rail and wainscoting', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- ============================================
-- PART 2: ADD MISSING MATERIALS
-- ============================================

-- Water Mitigation Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'DEHU-LGR', 'LGR Dehumidifier rental/day', 'DAY', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'DEHU-CONV', 'Conventional Dehumidifier rental/day', 'DAY', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'AIR-MOVER', 'Air mover rental/day', 'DAY', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'HEPA-AIR', 'HEPA air scrubber rental/day', 'DAY', 95.00, 'baseline_2024'),
(gen_random_uuid(), 'EXTRACTOR-PORT', 'Portable extractor rental/day', 'DAY', 75.00, 'baseline_2024'),
(gen_random_uuid(), 'ANTIMICROB', 'Antimicrobial solution gallon', 'GAL', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'PLASTIC-6MIL', 'Plastic sheeting 6mil 20x100', 'ROLL', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'MOISTURE-LOG', 'Moisture documentation form', 'EA', 0.00, 'baseline_2024'),
(gen_random_uuid(), 'INJECT-PANEL', 'Injection drying panel', 'EA', 45.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Drywall Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'DRY-REG-12', 'Drywall 1/2" regular 4x8', 'EA', 12.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-REG-58', 'Drywall 5/8" regular 4x8', 'EA', 14.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-MR-12', 'Drywall 1/2" moisture resistant 4x8', 'EA', 16.00, 'baseline_2024'),
(gen_random_uuid(), 'DRY-MR-58', 'Drywall 5/8" moisture resistant 4x8', 'EA', 18.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-FIRE-58', 'Drywall 5/8" Type X fire rated 4x8', 'EA', 16.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-TAPE', 'Drywall tape roll 500ft', 'ROLL', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-MUD', 'Joint compound 5gal bucket', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'DRY-SCREW', 'Drywall screws 1lb box', 'LB', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'DRY-CORNER', 'Corner bead metal 8ft', 'EA', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'DRY-FLEX-CORNER', 'Flexible corner bead 8ft', 'EA', 8.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Interior Paint Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'PAINT-INT-FLAT', 'Interior paint flat gallon', 'GAL', 38.00, 'baseline_2024'),
(gen_random_uuid(), 'PAINT-INT-EGG', 'Interior paint eggshell gallon', 'GAL', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'PAINT-INT-SEMI', 'Interior paint semi-gloss gallon', 'GAL', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'PAINT-INT-SATIN', 'Interior paint satin gallon', 'GAL', 44.00, 'baseline_2024'),
(gen_random_uuid(), 'PAINT-CEIL', 'Ceiling paint flat gallon', 'GAL', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'PRIMER-INT', 'Interior primer gallon', 'GAL', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'PRIMER-STAIN', 'Stain blocking primer gallon', 'GAL', 48.00, 'baseline_2024'),
(gen_random_uuid(), 'PRIMER-PVA', 'PVA drywall primer gallon', 'GAL', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'CAULK-PAINT', 'Paintable caulk tube', 'TUBE', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'TAPE-PAINTER', 'Painters tape roll', 'ROLL', 6.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Trim & Baseboard Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'BASE-MDF-314', 'MDF baseboard 3-1/4" 16ft', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'BASE-MDF-514', 'MDF baseboard 5-1/4" 16ft', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'BASE-PINE-314', 'Pine baseboard 3-1/4" 16ft', 'EA', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'CROWN-MDF-314', 'MDF crown molding 3-1/4" 16ft', 'EA', 15.00, 'baseline_2024'),
(gen_random_uuid(), 'CASING-MDF-214', 'MDF door casing 2-1/4" 7ft', 'EA', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'QUARTER-RND', 'Quarter round 8ft', 'EA', 3.00, 'baseline_2024'),
(gen_random_uuid(), 'SHOE-MOLD', 'Shoe molding 8ft', 'EA', 2.50, 'baseline_2024'),
(gen_random_uuid(), 'FINISH-NAILS', 'Finish nails 2" box', 'BOX', 8.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Cleaning Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'CLEANER-GEN', 'General purpose cleaner gallon', 'GAL', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'CLEANER-DISINFECT', 'Disinfectant cleaner gallon', 'GAL', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'RAGS-BOX', 'Cleaning rags box', 'BOX', 25.00, 'baseline_2024'),
(gen_random_uuid(), 'TSP-BOX', 'TSP cleaner 4lb box', 'BOX', 12.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- ============================================
-- PART 3: WATER MITIGATION LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Emergency Services (01.1)
(gen_random_uuid(), 'WTR-EMERG-RESP', '01.1', 'Emergency response - after hours', 'HR', '[]'::jsonb, '[{"task": "emergency_response", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 250.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY['WTR-EXTRACT-PORT'], true),

(gen_random_uuid(), 'WTR-EMERG-BOARD', '01.1', 'Emergency board up per opening', 'EA', '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "board_up", "hours_per_unit": 0.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WTR-SHUTOFF', '01.1', 'Emergency water shutoff', 'EA', '[]'::jsonb, '[{"task": "shutoff", "hours_per_unit": 0.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY['WTR-EXTRACT-PORT'], true),

-- Water Extraction (01.2)
(gen_random_uuid(), 'WTR-EXTRACT-PORT', '01.2', 'Water extraction - portable extractor', 'SF', '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[{"type": "portable_extractor", "cost_per_unit": 0.08}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water", "water_category": 1}, {"damage_type": "water", "water_category": 2}]'::jsonb, ARRAY['WTR-DRY-SETUP'], true),

(gen_random_uuid(), 'WTR-EXTRACT-TRUCK', '01.2', 'Water extraction - truck mount', 'SF', '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.01, "trade": "general"}]'::jsonb, '[{"type": "truck_mount", "cost_per_unit": 0.12}]'::jsonb, 1.00, 250.00, '[{"damage_type": "water", "severity": "severe"}]'::jsonb, ARRAY['WTR-DRY-SETUP'], true),

(gen_random_uuid(), 'WTR-EXTRACT-SUBFLR', '01.2', 'Water extraction - subfloor/cavity', 'SF', '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "injection_extraction", "cost_per_unit": 0.15}]'::jsonb, 1.00, 200.00, '[{"damage_type": "water", "surface": "subfloor"}]'::jsonb, ARRAY['WTR-DRY-INJECT'], true),

(gen_random_uuid(), 'WTR-EXTRACT-CARPET', '01.2', 'Water extraction from carpet', 'SF', '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[{"type": "wand_extractor", "cost_per_unit": 0.06}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['WTR-DRY-SETUP', 'FLR-CARPET-LIFT'], true),

-- Structural Drying (01.3)
(gen_random_uuid(), 'WTR-DRY-SETUP', '01.3', 'Drying equipment setup/takedown', 'EA', '[]'::jsonb, '[{"task": "equipment_setup", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-DEHU', 'WTR-DRY-AIRMOV'], true),

(gen_random_uuid(), 'WTR-DRY-DEHU', '01.3', 'Dehumidifier - LGR per day', 'DAY', '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[{"type": "lgr_dehumidifier", "cost_per_unit": 85.00}]'::jsonb, 1.00, 85.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-AIRMOV'], true),

(gen_random_uuid(), 'WTR-DRY-DEHU-CONV', '01.3', 'Dehumidifier - conventional per day', 'DAY', '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[{"type": "conv_dehumidifier", "cost_per_unit": 55.00}]'::jsonb, 1.00, 55.00, '[{"damage_type": "water", "severity": "minor"}]'::jsonb, ARRAY['WTR-DRY-AIRMOV'], true),

(gen_random_uuid(), 'WTR-DRY-AIRMOV', '01.3', 'Air mover per day', 'DAY', '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.10, "trade": "general"}]'::jsonb, '[{"type": "air_mover", "cost_per_unit": 35.00}]'::jsonb, 1.00, 35.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-DEHU'], true),

(gen_random_uuid(), 'WTR-DRY-HEPA', '01.3', 'HEPA air scrubber per day', 'DAY', '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.15, "trade": "general"}]'::jsonb, '[{"type": "hepa_scrubber", "cost_per_unit": 95.00}]'::jsonb, 1.00, 95.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-ANTIMICROB'], true),

(gen_random_uuid(), 'WTR-DRY-INJECT', '01.3', 'Injection drying system per day', 'DAY', '[{"sku": "INJECT-PANEL", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[{"type": "injection_system", "cost_per_unit": 125.00}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "wall_cavity"}]'::jsonb, ARRAY['DRY-HOLE-DRILL'], true),

(gen_random_uuid(), 'WTR-DRY-HARDWOOD', '01.3', 'Hardwood floor drying system per day', 'DAY', '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.3, "trade": "specialty"}]'::jsonb, '[{"type": "floor_mat_system", "cost_per_unit": 150.00}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water", "surface": "hardwood"}]'::jsonb, ARRAY[]::text[], true),

-- Moisture Monitoring (01.4)
(gen_random_uuid(), 'WTR-MOIST-INIT', '01.4', 'Initial moisture inspection/mapping', 'SF', '[]'::jsonb, '[{"task": "moisture_inspection", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "moisture_meter", "cost_per_unit": 0.05}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-DAILY'], true),

(gen_random_uuid(), 'WTR-MOIST-DAILY', '01.4', 'Daily moisture monitoring', 'DAY', '[]'::jsonb, '[{"task": "moisture_monitoring", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[{"type": "moisture_meter", "cost_per_unit": 15.00}]'::jsonb, 1.00, 95.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-LOG'], true),

(gen_random_uuid(), 'WTR-MOIST-LOG', '01.4', 'Moisture documentation/psychrometric log', 'EA', '[]'::jsonb, '[{"task": "documentation", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WTR-THERMAL-IMG', '01.4', 'Thermal imaging inspection', 'SF', '[]'::jsonb, '[{"task": "thermal_imaging", "hours_per_unit": 0.01, "trade": "specialty"}]'::jsonb, '[{"type": "thermal_camera", "cost_per_unit": 0.08}]'::jsonb, 1.00, 175.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-INIT'], true),

-- Content Manipulation (01.5)
(gen_random_uuid(), 'WTR-CONTENT-MOVE', '01.5', 'Content move out - per room', 'EA', '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "content_move", "hours_per_unit": 2.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[{"damage_type": "water", "surface": "contents"}]'::jsonb, ARRAY['WTR-CONTENT-BACK'], true),

(gen_random_uuid(), 'WTR-CONTENT-BACK', '01.5', 'Content move back - per room', 'EA', '[]'::jsonb, '[{"task": "content_move", "hours_per_unit": 1.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WTR-CONTENT-BLOCK', '01.5', 'Block and protect contents', 'SF', '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "content_protect", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WTR-CARPET-LIFT', '01.5', 'Carpet lift and block', 'SF', '[]'::jsonb, '[{"task": "carpet_lift", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['WTR-CARPET-RELAY'], true),

(gen_random_uuid(), 'WTR-CARPET-RELAY', '01.5', 'Carpet relay after drying', 'SF', '[]'::jsonb, '[{"task": "carpet_relay", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Antimicrobial (01.6)
(gen_random_uuid(), 'WTR-ANTIMICROB', '01.6', 'Antimicrobial treatment - surfaces', 'SF', '[{"sku": "ANTIMICROB", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "antimicrobial_apply", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "sprayer", "cost_per_unit": 0.03}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "water_category": 2}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-DRY-HEPA'], true),

(gen_random_uuid(), 'WTR-ANTIMICROB-CAV', '01.6', 'Antimicrobial treatment - wall cavity', 'SF', '[{"sku": "ANTIMICROB", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "antimicrobial_inject", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "injection_equip", "cost_per_unit": 0.05}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "water_category": 3, "surface": "wall_cavity"}]'::jsonb, ARRAY['DRY-HOLE-DRILL'], true),

(gen_random_uuid(), 'WTR-ANTIMICROB-SEAL', '01.6', 'Antimicrobial sealer application', 'SF', '[{"sku": "ANTIMICROB", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "sealer_apply", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY[]::text[], true);

-- ============================================
-- PART 4: DEMOLITION LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Selective Demo (02.1)
(gen_random_uuid(), 'DEM-DRY-FLOOD', '02.1', 'Drywall removal - flood cut 2ft', 'LF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.06, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "wall"}]'::jsonb, ARRAY['DRY-HTT-12', 'WTR-ANTIMICROB'], true),

(gen_random_uuid(), 'DEM-DRY-FLOOD-4', '02.1', 'Drywall removal - flood cut 4ft', 'LF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.10, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "wall", "severity": "moderate"}]'::jsonb, ARRAY['DRY-HTT-12', 'WTR-ANTIMICROB'], true),

(gen_random_uuid(), 'DEM-DRY-FULL', '02.1', 'Drywall removal - full height', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "fire", "surface": "wall"}, {"damage_type": "water", "severity": "severe"}]'::jsonb, ARRAY['DRY-HTT-12'], true),

(gen_random_uuid(), 'DEM-DRY-CEIL', '02.1', 'Ceiling drywall removal', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.035, "trade": "general"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.05}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['DRY-HTT-CEIL'], true),

(gen_random_uuid(), 'DEM-INSUL', '02.1', 'Insulation removal - wet/contaminated', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[{"type": "disposal_bags", "cost_per_unit": 0.10}]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY['INSUL-BATT-R13'], true),

(gen_random_uuid(), 'DEM-BASE', '02.1', 'Baseboard removal', 'LF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['TRIM-BASE'], true),

(gen_random_uuid(), 'DEM-FLOOR-VNL', '02.1', 'Vinyl/LVP flooring removal', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.018, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-LAM-STD'], true),

(gen_random_uuid(), 'DEM-FLOOR-TILE', '02.1', 'Ceramic tile flooring removal', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.05, "trade": "general"}]'::jsonb, '[{"type": "tile_removal_equip", "cost_per_unit": 0.05}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "tile"}]'::jsonb, ARRAY['FLR-TILE-CER'], true),

(gen_random_uuid(), 'DEM-FLOOR-CARPET', '02.1', 'Carpet and pad removal', 'SF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['FLR-CARPET'], true),

(gen_random_uuid(), 'DEM-CABINET', '02.1', 'Cabinet removal - base', 'LF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "cabinet"}]'::jsonb, ARRAY['CAB-BASE-STD'], true),

(gen_random_uuid(), 'DEM-CABINET-WALL', '02.1', 'Cabinet removal - wall', 'LF', '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.30, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "water", "surface": "cabinet"}]'::jsonb, ARRAY['CAB-WALL-STD'], true),

-- Debris Removal (02.2)
(gen_random_uuid(), 'DEM-HAUL', '02.2', 'Debris haul off - per load', 'EA', '[]'::jsonb, '[{"task": "hauling", "hours_per_unit": 2.0, "trade": "general"}]'::jsonb, '[{"type": "dump_fees", "cost_per_unit": 85.00}]'::jsonb, 1.00, 250.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DEM-DUMPSTER-10', '02.2', 'Dumpster rental - 10yd', 'DAY', '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 85.00}]'::jsonb, 1.00, 85.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DEM-DUMPSTER-20', '02.2', 'Dumpster rental - 20yd', 'DAY', '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 125.00}]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DEM-DUMPSTER-30', '02.2', 'Dumpster rental - 30yd', 'DAY', '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 165.00}]'::jsonb, 1.00, 165.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Containment (02.3)
(gen_random_uuid(), 'DEM-CONTAIN', '02.3', 'Dust containment barrier', 'SF', '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "containment_setup", "hours_per_unit": 0.04, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "fire"}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-DRY-HEPA'], true),

(gen_random_uuid(), 'DEM-FLOOR-PROT', '02.3', 'Floor protection', 'SF', '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "floor_protection", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DEM-NEGATIVE-AIR', '02.3', 'Negative air pressure setup', 'EA', '[]'::jsonb, '[{"task": "negative_air_setup", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[{"type": "neg_air_machine", "cost_per_unit": 125.00}]'::jsonb, 1.00, 275.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['DEM-CONTAIN'], true);

-- ============================================
-- PART 5: DRYWALL LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Drywall Installation (06.2)
(gen_random_uuid(), 'DRY-HTT-12', '06.2', 'Drywall 1/2" hang, tape, texture - walls', 'SF', '[{"sku": "DRY-REG-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.025, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, '[{"damage_type": "water", "surface": "wall"}, {"damage_type": "fire", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL', 'INSUL-BATT-R13'], true),

(gen_random_uuid(), 'DRY-HTT-58', '06.2', 'Drywall 5/8" hang, tape, texture - walls', 'SF', '[{"sku": "DRY-REG-58", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.004}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.028, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, '[{"damage_type": "fire", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-HTT-MR', '06.2', 'Drywall 1/2" moisture resistant - HTT', 'SF', '[{"sku": "DRY-MR-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.025, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-HTT-CEIL', '06.2', 'Drywall 1/2" ceiling - HTT', 'SF', '[{"sku": "DRY-REG-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.038, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.022, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.08}]'::jsonb, 1.10, 200.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['PAINT-INT-CEIL'], true),

(gen_random_uuid(), 'DRY-FIRE-58', '06.2', 'Drywall 5/8" Type X fire rated - HTT', 'SF', '[{"sku": "DRY-FIRE-58", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.004}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.030, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 185.00, '[{"damage_type": "fire", "surface": "garage"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-HANG-ONLY', '06.2', 'Drywall hang only - 1/2"', 'SF', '[{"sku": "DRY-REG-12", "qty_per_unit": 0.03125}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.022, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[]'::jsonb, ARRAY['DRY-TAPE-ONLY'], true),

-- Drywall Finishing (06.3)
(gen_random_uuid(), 'DRY-TAPE-ONLY', '06.3', 'Drywall tape and finish only', 'SF', '[{"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "tape", "hours_per_unit": 0.022, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[]'::jsonb, ARRAY['DRY-TEXT-MATCH'], true),

(gen_random_uuid(), 'DRY-TEXT-MATCH', '06.3', 'Texture match - knockdown/orange peel', 'SF', '[{"sku": "DRY-MUD", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "texture", "hours_per_unit": 0.025, "trade": "specialty"}]'::jsonb, '[{"type": "texture_gun", "cost_per_unit": 0.05}]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-TEXT-SMOOTH', '06.3', 'Skim coat - smooth finish', 'SF', '[{"sku": "DRY-MUD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "skim_coat", "hours_per_unit": 0.035, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-TEXT-POPCORN', '06.3', 'Popcorn texture ceiling', 'SF', '[{"sku": "DRY-MUD", "qty_per_unit": 0.004}]'::jsonb, '[{"task": "texture", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[{"type": "texture_hopper", "cost_per_unit": 0.04}]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY['PAINT-INT-CEIL'], true),

-- Drywall Repairs (06.4)
(gen_random_uuid(), 'DRY-PATCH-SM', '06.4', 'Drywall patch repair - small (<2 SF)', 'EA', '[{"sku": "DRY-MUD", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "patch", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "impact", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-PATCH-MED', '06.4', 'Drywall patch repair - medium (2-6 SF)', 'EA', '[{"sku": "DRY-REG-12", "qty_per_unit": 0.125}, {"sku": "DRY-MUD", "qty_per_unit": 0.2}]'::jsonb, '[{"task": "patch", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "impact", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-PATCH-LG', '06.4', 'Drywall patch repair - large (6-16 SF)', 'EA', '[{"sku": "DRY-REG-12", "qty_per_unit": 0.5}, {"sku": "DRY-TAPE", "qty_per_unit": 0.002}, {"sku": "DRY-MUD", "qty_per_unit": 0.3}]'::jsonb, '[{"task": "patch", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[{"damage_type": "impact", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'DRY-HOLE-DRILL', '06.4', 'Drill inspection/injection holes', 'EA', '[]'::jsonb, '[{"task": "drill", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 15.00, '[{"damage_type": "water", "surface": "wall_cavity"}]'::jsonb, ARRAY['WTR-DRY-INJECT'], true),

(gen_random_uuid(), 'DRY-CORNER', '06.4', 'Corner bead - replace', 'LF', '[{"sku": "DRY-CORNER", "qty_per_unit": 0.125}, {"sku": "DRY-MUD", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.07, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 35.00, '[{"damage_type": "impact", "surface": "corner"}]'::jsonb, ARRAY['DRY-TAPE-ONLY'], true),

(gen_random_uuid(), 'DRY-ARCH-CORNER', '06.4', 'Flexible corner bead - arched', 'LF', '[{"sku": "DRY-FLEX-CORNER", "qty_per_unit": 0.125}, {"sku": "DRY-MUD", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 55.00, '[]'::jsonb, ARRAY['DRY-TAPE-ONLY'], true);

-- ============================================
-- PART 6: INTERIOR PAINTING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Wall Painting (14.1)
(gen_random_uuid(), 'PAINT-INT-WALL', '14.1', 'Interior wall paint - 2 coats', 'SF', '[{"sku": "PAINT-INT-EGG", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.016, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 125.00, '[{"damage_type": "water", "surface": "wall"}, {"damage_type": "fire", "surface": "wall"}, {"damage_type": "smoke", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-PRIME'], true),

(gen_random_uuid(), 'PAINT-INT-WALL-1', '14.1', 'Interior wall paint - 1 coat', 'SF', '[{"sku": "PAINT-INT-EGG", "qty_per_unit": 0.0015}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.010, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-INT-WALL-SEMI', '14.1', 'Interior wall paint semi-gloss - 2 coats', 'SF', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.018, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 135.00, '[{"damage_type": "water", "surface": "bathroom"}, {"damage_type": "water", "surface": "kitchen"}]'::jsonb, ARRAY['PAINT-INT-PRIME'], true),

(gen_random_uuid(), 'PAINT-INT-WALL-FLAT', '14.1', 'Interior wall paint flat - 2 coats', 'SF', '[{"sku": "PAINT-INT-FLAT", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 115.00, '[]'::jsonb, ARRAY['PAINT-INT-PRIME'], true),

(gen_random_uuid(), 'PAINT-INT-ACCENT', '14.1', 'Interior accent wall - different color', 'SF', '[{"sku": "PAINT-INT-EGG", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.012, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.020, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, '[]'::jsonb, ARRAY['PAINT-INT-PRIME'], true),

-- Ceiling Painting (14.2)
(gen_random_uuid(), 'PAINT-INT-CEIL', '14.2', 'Ceiling paint - 2 coats', 'SF', '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.020, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.03}]'::jsonb, 1.10, 150.00, '[{"damage_type": "water", "surface": "ceiling"}, {"damage_type": "smoke", "surface": "ceiling"}]'::jsonb, ARRAY['PAINT-INT-PRIME-STAIN'], true),

(gen_random_uuid(), 'PAINT-INT-CEIL-1', '14.2', 'Ceiling paint - 1 coat', 'SF', '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.0015}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-INT-CEIL-HIGH', '14.2', 'Ceiling paint - high ceiling (>10ft)', 'SF', '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.012, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.028, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.08}]'::jsonb, 1.10, 200.00, '[]'::jsonb, ARRAY['PAINT-INT-PRIME'], true),

-- Trim Painting (14.3)
(gen_random_uuid(), 'PAINT-INT-TRIM', '14.3', 'Trim/baseboard paint - 2 coats', 'LF', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.015, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.035, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-DOOR', '14.3', 'Interior door paint - both sides', 'EA', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.15}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.25, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.65, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "water", "surface": "door"}, {"damage_type": "smoke", "surface": "door"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-DOOR-1SIDE', '14.3', 'Interior door paint - one side', 'EA', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.08}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.15, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 55.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-DOOR-FRAME', '14.3', 'Door frame/jamb paint', 'EA', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.30, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 55.00, '[]'::jsonb, ARRAY['PAINT-DOOR'], true),

(gen_random_uuid(), 'PAINT-CROWN', '14.3', 'Crown molding paint', 'LF', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.02, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.04, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 85.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-WINDOW-FRAME', '14.3', 'Window frame/casing paint', 'EA', '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.08}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.15, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PAINT-CLOSET-INT', '14.3', 'Paint closet interior - standard', 'EA', '[{"sku": "PAINT-INT-FLAT", "qty_per_unit": 0.3}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.25, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.75, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Primer (14.4)
(gen_random_uuid(), 'PAINT-INT-PRIME', '14.4', 'Interior primer - walls', 'SF', '[{"sku": "PRIMER-INT", "qty_per_unit": 0.0025}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.010, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'PAINT-INT-PRIME-PVA', '14.4', 'PVA drywall primer', 'SF', '[{"sku": "PRIMER-PVA", "qty_per_unit": 0.0025}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.008, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 65.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL'], true),

(gen_random_uuid(), 'PAINT-INT-PRIME-STAIN', '14.4', 'Stain blocking primer', 'SF', '[{"sku": "PRIMER-STAIN", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "surface": "ceiling"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['PAINT-INT-CEIL'], true),

(gen_random_uuid(), 'PAINT-INT-PRIME-TRIM', '14.4', 'Primer - trim/woodwork', 'LF', '[{"sku": "PRIMER-INT", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM'], true);

-- ============================================
-- PART 7: TRIM & BASEBOARD LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Baseboard (16.1)
(gen_random_uuid(), 'TRIM-BASE', '16.1', 'Baseboard 3-1/4" MDF - install', 'LF', '[{"sku": "BASE-MDF-314", "qty_per_unit": 0.0625}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.04, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-TRIM'], true),

(gen_random_uuid(), 'TRIM-BASE-514', '16.1', 'Baseboard 5-1/4" MDF - install', 'LF', '[{"sku": "BASE-MDF-514", "qty_per_unit": 0.0625}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 55.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-TRIM'], true),

(gen_random_uuid(), 'TRIM-BASE-PINE', '16.1', 'Baseboard 3-1/4" pine - install', 'LF', '[{"sku": "BASE-PINE-314", "qty_per_unit": 0.0625}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 60.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM'], true),

(gen_random_uuid(), 'TRIM-SHOE', '16.1', 'Shoe molding - install', 'LF', '[{"sku": "SHOE-MOLD", "qty_per_unit": 0.125}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 35.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM'], true),

(gen_random_uuid(), 'TRIM-QUARTER', '16.1', 'Quarter round - install', 'LF', '[{"sku": "QUARTER-RND", "qty_per_unit": 0.125}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 35.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM'], true),

-- Crown Molding (16.2)
(gen_random_uuid(), 'TRIM-CROWN', '16.2', 'Crown molding 3-1/4" - install', 'LF', '[{"sku": "CROWN-MDF-314", "qty_per_unit": 0.0625}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.15, 75.00, '[]'::jsonb, ARRAY['PAINT-CROWN'], true),

-- Door Casing (16.3)
(gen_random_uuid(), 'TRIM-CASING', '16.3', 'Door casing 2-1/4" - install', 'EA', '[{"sku": "CASING-MDF-214", "qty_per_unit": 3.0}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.03}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.6, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 65.00, '[]'::jsonb, ARRAY['PAINT-DOOR-FRAME'], true),

(gen_random_uuid(), 'TRIM-CASING-WINDOW', '16.3', 'Window casing - install', 'EA', '[{"sku": "CASING-MDF-214", "qty_per_unit": 4.0}, {"sku": "FINISH-NAILS", "qty_per_unit": 0.04}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.8, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 85.00, '[]'::jsonb, ARRAY['PAINT-WINDOW-FRAME'], true);

-- ============================================
-- PART 8: GENERAL CLEANING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

-- Surface Cleaning (03.1)
(gen_random_uuid(), 'CLEAN-WALL', '03.1', 'Wall cleaning - general', 'SF', '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water"}, {"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CLEAN-CEIL', '03.1', 'Ceiling cleaning', 'SF', '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.02}]'::jsonb, 1.00, 75.00, '[{"damage_type": "smoke", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CLEAN-FLOOR', '03.1', 'Floor cleaning - general', 'SF', '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.001}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CLEAN-DISINFECT', '03.1', 'Disinfectant cleaning - surfaces', 'SF', '[{"sku": "CLEANER-DISINFECT", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "water_category": 2}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY[]::text[], true),

-- Content Cleaning (03.2)
(gen_random_uuid(), 'CLEAN-CONTENT-LIGHT', '03.2', 'Content cleaning - light', 'HR', '[{"sku": "RAGS-BOX", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "content_clean", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CLEAN-CONTENT-HEAVY', '03.2', 'Content cleaning - heavy (smoke/soot)', 'HR', '[{"sku": "RAGS-BOX", "qty_per_unit": 0.1}, {"sku": "DEGREASER", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "content_clean", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[], true),

-- Deodorization (03.3)
(gen_random_uuid(), 'CLEAN-DEODOR', '03.3', 'Deodorization treatment - room', 'EA', '[]'::jsonb, '[{"task": "deodorization", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[{"type": "deodorizer", "cost_per_unit": 25.00}]'::jsonb, 1.00, 75.00, '[{"damage_type": "smoke"}, {"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true);

-- ============================================
-- PART 9: INSULATION LINE ITEMS (Additional)
-- ============================================

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES

(gen_random_uuid(), 'INSUL-BATT-R13', '05.1', 'Batt insulation R-13 - walls', 'SF', '[{"sku": "INSUL-R13", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 50.00, '[{"damage_type": "water", "surface": "wall_cavity"}]'::jsonb, ARRAY['DRY-HTT-12'], true),

(gen_random_uuid(), 'INSUL-BATT-R19', '05.1', 'Batt insulation R-19 - walls', 'SF', '[{"sku": "INSUL-R19", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.018, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 55.00, '[]'::jsonb, ARRAY['DRY-HTT-12'], true),

(gen_random_uuid(), 'INSUL-BATT-R30', '05.1', 'Batt insulation R-30 - attic', 'SF', '[{"sku": "INSUL-R30", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 75.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'INSUL-BLOWN', '05.2', 'Blown insulation - attic', 'SF', '[{"sku": "INSUL-BLOWN", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[{"type": "blower_rental", "cost_per_unit": 0.05}]'::jsonb, 1.00, 100.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'INSUL-VAPOR', '05.4', 'Vapor barrier 6mil - install', 'SF', '[{"sku": "VAPOR-BARR", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.01, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  material_components = EXCLUDED.material_components,
  labor_components = EXCLUDED.labor_components,
  equipment_components = EXCLUDED.equipment_components;
