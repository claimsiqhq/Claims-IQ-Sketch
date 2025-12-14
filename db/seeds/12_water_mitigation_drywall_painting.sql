-- Water Mitigation, Demolition, Drywall, and Interior Painting Categories, Materials, and Line Items
-- This seed file adds the missing categories and line items for a complete estimate generation system

-- ============================================
-- PART 1: ADD MISSING CATEGORIES
-- ============================================

-- Water Mitigation Categories (01)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('01', NULL, 'Water Mitigation', 1),
('01.1', '01', 'Emergency Services', 1),
('01.2', '01', 'Water Extraction', 2),
('01.3', '01', 'Structural Drying', 3),
('01.4', '01', 'Moisture Monitoring', 4),
('01.5', '01', 'Content Manipulation', 5),
('01.6', '01', 'Antimicrobial', 6)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Demolition Category (02)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('02', NULL, 'Demolition & Debris', 2),
('02.1', '02', 'Selective Demo', 1),
('02.2', '02', 'Debris Removal', 2),
('02.3', '02', 'Containment', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- General Cleaning (03)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('03', NULL, 'General Cleaning', 3),
('03.1', '03', 'Surface Cleaning', 1),
('03.2', '03', 'Content Cleaning', 2),
('03.3', '03', 'Deodorization', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Drywall Category (06)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('06', NULL, 'Drywall & Walls', 6),
('06.1', '06', 'Drywall Removal', 1),
('06.2', '06', 'Drywall Installation', 2),
('06.3', '06', 'Drywall Finishing', 3),
('06.4', '06', 'Wall Repairs', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Interior Painting (14)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('14', NULL, 'Interior Painting', 14),
('14.1', '14', 'Wall Painting', 1),
('14.2', '14', 'Ceiling Painting', 2),
('14.3', '14', 'Trim Painting', 3),
('14.4', '14', 'Primer Application', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Cabinets & Countertops (15)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('15', NULL, 'Cabinets & Countertops', 15),
('15.1', '15', 'Base Cabinets', 1),
('15.2', '15', 'Wall Cabinets', 2),
('15.3', '15', 'Countertops', 3),
('15.4', '15', 'Cabinet Hardware', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Trim & Millwork (16)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('16', NULL, 'Trim & Millwork', 16),
('16.1', '16', 'Baseboard', 1),
('16.2', '16', 'Crown Molding', 2),
('16.3', '16', 'Door Casing', 3),
('16.4', '16', 'Chair Rail', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

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

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Emergency Services (01.1)
(gen_random_uuid(), 'WTR-EMERG-RESP', '01.1', 'Emergency Services', 'Emergency response - after hours', 'HR', 125.00, '[]'::jsonb, '[{"task": "emergency_response", "hours_per_unit": 1.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 250.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY['WTR-EXTRACT-PORT']),

(gen_random_uuid(), 'WTR-EMERG-BOARD', '01.1', 'Emergency Services', 'Emergency board up per opening', 'EA', 75.00, '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "board_up", "hours_per_unit": 0.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'WTR-SHUTOFF', '01.1', 'Emergency Services', 'Emergency water shutoff', 'EA', 95.00, '[]'::jsonb, '[{"task": "shutoff", "hours_per_unit": 0.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[{"damage_type": "water", "severity": "emergency"}]'::jsonb, ARRAY['WTR-EXTRACT-PORT']),

-- Water Extraction (01.2)
(gen_random_uuid(), 'WTR-EXTRACT-PORT', '01.2', 'Water Extraction', 'Water extraction - portable extractor', 'SF', 0.45, '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[{"type": "portable_extractor", "cost_per_unit": 0.08}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water", "water_category": 1}, {"damage_type": "water", "water_category": 2}]'::jsonb, ARRAY['WTR-DRY-SETUP']),

(gen_random_uuid(), 'WTR-EXTRACT-TRUCK', '01.2', 'Water Extraction', 'Water extraction - truck mount', 'SF', 0.65, '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.01, "trade": "general"}]'::jsonb, '[{"type": "truck_mount", "cost_per_unit": 0.12}]'::jsonb, 1.00, 250.00, '[{"damage_type": "water", "severity": "severe"}]'::jsonb, ARRAY['WTR-DRY-SETUP']),

(gen_random_uuid(), 'WTR-EXTRACT-SUBFLR', '01.2', 'Water Extraction', 'Water extraction - subfloor/cavity', 'SF', 0.85, '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "injection_extraction", "cost_per_unit": 0.15}]'::jsonb, 1.00, 200.00, '[{"damage_type": "water", "surface": "subfloor"}]'::jsonb, ARRAY['WTR-DRY-INJECT']),

(gen_random_uuid(), 'WTR-EXTRACT-CARPET', '01.2', 'Water Extraction', 'Water extraction from carpet', 'SF', 0.38, '[]'::jsonb, '[{"task": "extraction", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[{"type": "wand_extractor", "cost_per_unit": 0.06}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['WTR-DRY-SETUP']),

-- Structural Drying (01.3)
(gen_random_uuid(), 'WTR-DRY-SETUP', '01.3', 'Structural Drying', 'Drying equipment setup/takedown', 'EA', 150.00, '[]'::jsonb, '[{"task": "equipment_setup", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-DEHU', 'WTR-DRY-AIRMOV']),

(gen_random_uuid(), 'WTR-DRY-DEHU', '01.3', 'Structural Drying', 'Dehumidifier - LGR per day', 'DAY', 95.00, '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[{"type": "lgr_dehumidifier", "cost_per_unit": 85.00}]'::jsonb, 1.00, 85.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-AIRMOV']),

(gen_random_uuid(), 'WTR-DRY-DEHU-CONV', '01.3', 'Structural Drying', 'Dehumidifier - conventional per day', 'DAY', 65.00, '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[{"type": "conv_dehumidifier", "cost_per_unit": 55.00}]'::jsonb, 1.00, 55.00, '[{"damage_type": "water", "severity": "minor"}]'::jsonb, ARRAY['WTR-DRY-AIRMOV']),

(gen_random_uuid(), 'WTR-DRY-AIRMOV', '01.3', 'Structural Drying', 'Air mover per day', 'DAY', 42.00, '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.10, "trade": "general"}]'::jsonb, '[{"type": "air_mover", "cost_per_unit": 35.00}]'::jsonb, 1.00, 35.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-DRY-DEHU']),

(gen_random_uuid(), 'WTR-DRY-HEPA', '01.3', 'Structural Drying', 'HEPA air scrubber per day', 'DAY', 110.00, '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.15, "trade": "general"}]'::jsonb, '[{"type": "hepa_scrubber", "cost_per_unit": 95.00}]'::jsonb, 1.00, 95.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-ANTIMICROB']),

(gen_random_uuid(), 'WTR-DRY-INJECT', '01.3', 'Structural Drying', 'Injection drying system per day', 'DAY', 145.00, '[{"sku": "INJECT-PANEL", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[{"type": "injection_system", "cost_per_unit": 125.00}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "wall_cavity"}]'::jsonb, ARRAY['DRY-HOLE-DRILL']),

(gen_random_uuid(), 'WTR-DRY-HARDWOOD', '01.3', 'Structural Drying', 'Hardwood floor drying system per day', 'DAY', 175.00, '[]'::jsonb, '[{"task": "monitoring", "hours_per_unit": 0.3, "trade": "specialty"}]'::jsonb, '[{"type": "floor_mat_system", "cost_per_unit": 150.00}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water", "surface": "hardwood"}]'::jsonb, ARRAY[]::text[]),

-- Moisture Monitoring (01.4)
(gen_random_uuid(), 'WTR-MOIST-INIT', '01.4', 'Moisture Monitoring', 'Initial moisture inspection/mapping', 'SF', 0.22, '[]'::jsonb, '[{"task": "moisture_inspection", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "moisture_meter", "cost_per_unit": 0.05}]'::jsonb, 1.00, 150.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-DAILY']),

(gen_random_uuid(), 'WTR-MOIST-DAILY', '01.4', 'Moisture Monitoring', 'Daily moisture monitoring', 'DAY', 110.00, '[]'::jsonb, '[{"task": "moisture_monitoring", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[{"type": "moisture_meter", "cost_per_unit": 15.00}]'::jsonb, 1.00, 95.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-LOG']),

(gen_random_uuid(), 'WTR-MOIST-LOG', '01.4', 'Moisture Monitoring', 'Moisture documentation/psychrometric log', 'EA', 45.00, '[]'::jsonb, '[{"task": "documentation", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'WTR-THERMAL-IMG', '01.4', 'Moisture Monitoring', 'Thermal imaging inspection', 'SF', 0.18, '[]'::jsonb, '[{"task": "thermal_imaging", "hours_per_unit": 0.01, "trade": "specialty"}]'::jsonb, '[{"type": "thermal_camera", "cost_per_unit": 0.08}]'::jsonb, 1.00, 175.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['WTR-MOIST-INIT']),

-- Content Manipulation (01.5)
(gen_random_uuid(), 'WTR-CONTENT-MOVE', '01.5', 'Content Manipulation', 'Content move out - per room', 'EA', 175.00, '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "content_move", "hours_per_unit": 2.0, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[{"damage_type": "water", "surface": "contents"}]'::jsonb, ARRAY['WTR-CONTENT-BACK']),

(gen_random_uuid(), 'WTR-CONTENT-BACK', '01.5', 'Content Manipulation', 'Content move back - per room', 'EA', 125.00, '[]'::jsonb, '[{"task": "content_move", "hours_per_unit": 1.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'WTR-CONTENT-BLOCK', '01.5', 'Content Manipulation', 'Block and protect contents', 'SF', 0.28, '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "content_protect", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'WTR-CARPET-LIFT', '01.5', 'Content Manipulation', 'Carpet lift and block', 'SF', 0.35, '[]'::jsonb, '[{"task": "carpet_lift", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['WTR-CARPET-RELAY']),

(gen_random_uuid(), 'WTR-CARPET-RELAY', '01.5', 'Content Manipulation', 'Carpet relay after drying', 'SF', 0.42, '[]'::jsonb, '[{"task": "carpet_relay", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[]),

-- Antimicrobial (01.6)
(gen_random_uuid(), 'WTR-ANTIMICROB', '01.6', 'Antimicrobial', 'Antimicrobial treatment - surfaces', 'SF', 0.38, '[{"sku": "ANTIMICROB", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "antimicrobial_apply", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "sprayer", "cost_per_unit": 0.03}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "water_category": 2}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-DRY-HEPA']),

(gen_random_uuid(), 'WTR-ANTIMICROB-CAV', '01.6', 'Antimicrobial', 'Antimicrobial treatment - wall cavity', 'SF', 0.52, '[{"sku": "ANTIMICROB", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "antimicrobial_inject", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "injection_equip", "cost_per_unit": 0.05}]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "water_category": 3, "surface": "wall_cavity"}]'::jsonb, ARRAY['DRY-HOLE-DRILL']),

(gen_random_uuid(), 'WTR-ANTIMICROB-SEAL', '01.6', 'Antimicrobial', 'Antimicrobial sealer application', 'SF', 0.45, '[{"sku": "ANTIMICROB", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "sealer_apply", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 4: DEMOLITION LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Selective Demo (02.1)
(gen_random_uuid(), 'DEM-DRY-FLOOD', '02.1', 'Selective Demo', 'Drywall removal - flood cut 2ft', 'LF', 2.85, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.06, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "wall"}]'::jsonb, ARRAY['DRY-HTT-12', 'WTR-ANTIMICROB']),

(gen_random_uuid(), 'DEM-DRY-FLOOD-4', '02.1', 'Selective Demo', 'Drywall removal - flood cut 4ft', 'LF', 4.25, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.10, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "wall", "severity": "moderate"}]'::jsonb, ARRAY['DRY-HTT-12', 'WTR-ANTIMICROB']),

(gen_random_uuid(), 'DEM-DRY-FULL', '02.1', 'Selective Demo', 'Drywall removal - full height', 'SF', 0.85, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "fire", "surface": "wall"}, {"damage_type": "water", "severity": "severe"}]'::jsonb, ARRAY['DRY-HTT-12']),

(gen_random_uuid(), 'DEM-DRY-CEIL', '02.1', 'Selective Demo', 'Ceiling drywall removal', 'SF', 1.15, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.035, "trade": "general"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.05}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['DRY-HTT-CEIL']),

(gen_random_uuid(), 'DEM-INSUL', '02.1', 'Selective Demo', 'Insulation removal - wet/contaminated', 'SF', 0.72, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[{"type": "disposal_bags", "cost_per_unit": 0.10}]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY['INSUL-BATT-R13']),

(gen_random_uuid(), 'DEM-BASE', '02.1', 'Selective Demo', 'Baseboard removal', 'LF', 1.25, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['TRIM-BASE']),

(gen_random_uuid(), 'DEM-FLOOR-VNL', '02.1', 'Selective Demo', 'Vinyl/LVP flooring removal', 'SF', 0.65, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.018, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-LAM-STD']),

(gen_random_uuid(), 'DEM-FLOOR-TILE', '02.1', 'Selective Demo', 'Ceramic tile flooring removal', 'SF', 2.15, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.05, "trade": "general"}]'::jsonb, '[{"type": "tile_removal_equip", "cost_per_unit": 0.05}]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "tile"}]'::jsonb, ARRAY['FLR-TILE-CER']),

(gen_random_uuid(), 'DEM-FLOOR-CARPET', '02.1', 'Selective Demo', 'Carpet and pad removal', 'SF', 0.45, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY['FLR-CARPET']),

(gen_random_uuid(), 'DEM-CABINET', '02.1', 'Selective Demo', 'Cabinet removal - base', 'LF', 18.50, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "cabinet"}]'::jsonb, ARRAY['CAB-BASE-STD']),

(gen_random_uuid(), 'DEM-CABINET-WALL', '02.1', 'Selective Demo', 'Cabinet removal - wall', 'LF', 15.50, '[]'::jsonb, '[{"task": "demolition", "hours_per_unit": 0.30, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "water", "surface": "cabinet"}]'::jsonb, ARRAY['CAB-WALL-STD']),

-- Debris Removal (02.2)
(gen_random_uuid(), 'DEM-HAUL', '02.2', 'Debris Removal', 'Debris haul off - per load', 'EA', 285.00, '[]'::jsonb, '[{"task": "hauling", "hours_per_unit": 2.0, "trade": "general"}]'::jsonb, '[{"type": "dump_fees", "cost_per_unit": 85.00}]'::jsonb, 1.00, 250.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'DEM-DUMPSTER-10', '02.2', 'Debris Removal', 'Dumpster rental - 10yd', 'DAY', 85.00, '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 85.00}]'::jsonb, 1.00, 85.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'DEM-DUMPSTER-20', '02.2', 'Debris Removal', 'Dumpster rental - 20yd', 'DAY', 125.00, '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 125.00}]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'DEM-DUMPSTER-30', '02.2', 'Debris Removal', 'Dumpster rental - 30yd', 'DAY', 165.00, '[]'::jsonb, '[]'::jsonb, '[{"type": "dumpster_rental", "cost_per_unit": 165.00}]'::jsonb, 1.00, 165.00, '[]'::jsonb, ARRAY[]::text[]),

-- Containment (02.3)
(gen_random_uuid(), 'DEM-CONTAIN', '02.3', 'Containment', 'Dust containment barrier', 'SF', 0.85, '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "containment_setup", "hours_per_unit": 0.04, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "fire"}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['WTR-DRY-HEPA']),

(gen_random_uuid(), 'DEM-FLOOR-PROT', '02.3', 'Containment', 'Floor protection', 'SF', 0.35, '[{"sku": "PLASTIC-6MIL", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "floor_protection", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'DEM-NEGATIVE-AIR', '02.3', 'Containment', 'Negative air pressure setup', 'EA', 295.00, '[]'::jsonb, '[{"task": "negative_air_setup", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[{"type": "neg_air_machine", "cost_per_unit": 125.00}]'::jsonb, 1.00, 275.00, '[{"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY['DEM-CONTAIN']);

-- ============================================
-- PART 5: DRYWALL LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Drywall Installation (06.2)
(gen_random_uuid(), 'DRY-HTT-12', '06.2', 'Drywall Installation', 'Drywall 1/2" hang, tape, texture - walls', 'SF', 2.85, '[{"sku": "DRY-REG-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.025, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, '[{"damage_type": "water", "surface": "wall"}, {"damage_type": "fire", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL', 'INSUL-BATT-R13']),

(gen_random_uuid(), 'DRY-HTT-58', '06.2', 'Drywall Installation', 'Drywall 5/8" hang, tape, texture - walls', 'SF', 3.15, '[{"sku": "DRY-REG-58", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.004}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.028, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, '[{"damage_type": "fire", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL']),

(gen_random_uuid(), 'DRY-HTT-MR', '06.2', 'Drywall Installation', 'Drywall 1/2" moisture resistant - HTT', 'SF', 3.45, '[{"sku": "DRY-MR-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.025, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 175.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PAINT-INT-WALL']),

(gen_random_uuid(), 'DRY-HTT-CEIL', '06.2', 'Drywall Installation', 'Drywall 1/2" ceiling - HTT', 'SF', 3.65, '[{"sku": "DRY-REG-12", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.035, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.022, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.08}]'::jsonb, 1.10, 200.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['PAINT-INT-CEIL']),

(gen_random_uuid(), 'DRY-FIRE-58', '06.2', 'Drywall Installation', 'Drywall 5/8" Type X fire rated - HTT', 'SF', 3.55, '[{"sku": "DRY-FIRE-58", "qty_per_unit": 0.03125}, {"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.004}, {"sku": "DRY-SCREW", "qty_per_unit": 0.015}]'::jsonb, '[{"task": "hang", "hours_per_unit": 0.028, "trade": "skilled"}, {"task": "tape", "hours_per_unit": 0.018, "trade": "skilled"}, {"task": "texture", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 185.00, '[{"damage_type": "fire", "surface": "garage"}]'::jsonb, ARRAY['PAINT-INT-WALL']),

-- Drywall Finishing (06.3)
(gen_random_uuid(), 'DRY-TAPE-ONLY', '06.3', 'Drywall Finishing', 'Drywall tape and finish only', 'SF', 1.65, '[{"sku": "DRY-TAPE", "qty_per_unit": 0.005}, {"sku": "DRY-MUD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "tape", "hours_per_unit": 0.022, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[]'::jsonb, ARRAY['DRY-TEXT-MATCH']),

(gen_random_uuid(), 'DRY-TEXT-MATCH', '06.3', 'Drywall Finishing', 'Texture match - knockdown/orange peel', 'SF', 1.85, '[{"sku": "DRY-MUD", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "texture", "hours_per_unit": 0.025, "trade": "specialty"}]'::jsonb, '[{"type": "texture_gun", "cost_per_unit": 0.05}]'::jsonb, 1.00, 125.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL']),

(gen_random_uuid(), 'DRY-TEXT-SMOOTH', '06.3', 'Drywall Finishing', 'Skim coat - smooth finish', 'SF', 2.25, '[{"sku": "DRY-MUD", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "skim_coat", "hours_per_unit": 0.035, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[]'::jsonb, ARRAY['PAINT-INT-WALL']),

-- Repairs (06.4)
(gen_random_uuid(), 'DRY-PATCH-SM', '06.4', 'Wall Repairs', 'Drywall patch repair - small (<2 SF)', 'EA', 85.00, '[{"sku": "DRY-MUD", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "patch", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "impact", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL']),

(gen_random_uuid(), 'DRY-PATCH-MED', '06.4', 'Wall Repairs', 'Drywall patch repair - medium (2-6 SF)', 'EA', 145.00, '[{"sku": "DRY-REG-12", "qty_per_unit": 0.125}, {"sku": "DRY-MUD", "qty_per_unit": 0.5}]'::jsonb, '[{"task": "patch", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "impact", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-WALL']),

(gen_random_uuid(), 'DRY-HOLE-DRILL', '06.4', 'Wall Repairs', 'Drill inspection/injection holes', 'EA', 15.00, '[]'::jsonb, '[{"task": "drill", "hours_per_unit": 0.1, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 15.00, '[{"damage_type": "water", "surface": "wall_cavity"}]'::jsonb, ARRAY['WTR-DRY-INJECT']),

(gen_random_uuid(), 'DRY-CORNER', '06.4', 'Wall Repairs', 'Corner bead - replace', 'LF', 4.85, '[{"sku": "DRY-CORNER", "qty_per_unit": 0.125}, {"sku": "DRY-MUD", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 35.00, '[{"damage_type": "impact", "surface": "corner"}]'::jsonb, ARRAY['DRY-TAPE-ONLY']);

-- ============================================
-- PART 6: INTERIOR PAINTING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Wall Painting (14.1)
(gen_random_uuid(), 'PAINT-INT-WALL', '14.1', 'Wall Painting', 'Interior wall paint - 2 coats', 'SF', 1.45, '[{"sku": "PAINT-INT-EGG", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.018, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 125.00, '[{"damage_type": "water", "surface": "wall"}, {"damage_type": "fire", "surface": "wall"}, {"damage_type": "smoke", "surface": "wall"}]'::jsonb, ARRAY['PAINT-INT-PRIME']),

(gen_random_uuid(), 'PAINT-INT-WALL-1', '14.1', 'Wall Painting', 'Interior wall paint - 1 coat', 'SF', 0.95, '[{"sku": "PAINT-INT-EGG", "qty_per_unit": 0.0015}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PAINT-INT-WALL-SEMI', '14.1', 'Wall Painting', 'Interior wall paint semi-gloss - 2 coats', 'SF', 1.65, '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.008, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 135.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PAINT-INT-PRIME']),

-- Ceiling Painting (14.2)
(gen_random_uuid(), 'PAINT-INT-CEIL', '14.2', 'Ceiling Painting', 'Interior ceiling paint - 2 coats', 'SF', 1.85, '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.01, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.022, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.05}]'::jsonb, 1.10, 150.00, '[{"damage_type": "water", "surface": "ceiling"}, {"damage_type": "smoke", "surface": "ceiling"}]'::jsonb, ARRAY['PAINT-INT-PRIME']),

(gen_random_uuid(), 'PAINT-INT-CEIL-1', '14.2', 'Ceiling Painting', 'Interior ceiling paint - 1 coat', 'SF', 1.25, '[{"sku": "PAINT-CEIL", "qty_per_unit": 0.0015}]'::jsonb, '[{"task": "paint", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.05}]'::jsonb, 1.10, 125.00, '[]'::jsonb, ARRAY[]::text[]),

-- Trim Painting (14.3)
(gen_random_uuid(), 'PAINT-INT-TRIM', '14.3', 'Trim Painting', 'Interior trim paint - 2 coats', 'LF', 2.45, '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.02, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.035, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water", "surface": "trim"}, {"damage_type": "smoke", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-PRIME']),

(gen_random_uuid(), 'PAINT-INT-DOOR', '14.3', 'Trim Painting', 'Interior door paint - per side', 'EA', 65.00, '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.15}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.25, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 55.00, '[{"damage_type": "smoke", "surface": "door"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PAINT-INT-DOORJAMB', '14.3', 'Trim Painting', 'Door jamb and casing paint', 'EA', 45.00, '[{"sku": "PAINT-INT-SEMI", "qty_per_unit": 0.08}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.15, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 40.00, '[]'::jsonb, ARRAY[]::text[]),

-- Primer Application (14.4)
(gen_random_uuid(), 'PAINT-INT-PRIME', '14.4', 'Primer Application', 'Interior primer - walls', 'SF', 0.75, '[{"sku": "PRIMER-INT", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.012, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 85.00, '[{"damage_type": "water", "surface": "wall"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PAINT-INT-PRIME-PVA', '14.4', 'Primer Application', 'PVA drywall primer', 'SF', 0.55, '[{"sku": "PRIMER-PVA", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.01, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PAINT-INT-PRIME-STAIN', '14.4', 'Primer Application', 'Stain blocking primer', 'SF', 1.15, '[{"sku": "PRIMER-STAIN", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.015, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "water_category": 3}, {"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 7: CLEANING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Surface Cleaning (03.1)
(gen_random_uuid(), 'CLN-WALL-LIGHT', '03.1', 'Surface Cleaning', 'Wall cleaning - light', 'SF', 0.35, '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.001}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.01, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[{"damage_type": "smoke", "severity": "light"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'CLN-WALL-HEAVY', '03.1', 'Surface Cleaning', 'Wall cleaning - heavy/smoke', 'SF', 0.65, '[{"sku": "CLEANER-DISINFECT", "qty_per_unit": 0.002}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "smoke", "severity": "heavy"}]'::jsonb, ARRAY['CLN-DEODOR']),

(gen_random_uuid(), 'CLN-CEIL', '03.1', 'Surface Cleaning', 'Ceiling cleaning', 'SF', 0.55, '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.001}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.03}]'::jsonb, 1.00, 65.00, '[{"damage_type": "smoke", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'CLN-FLOOR', '03.1', 'Surface Cleaning', 'Floor cleaning - hard surface', 'SF', 0.28, '[{"sku": "CLEANER-GEN", "qty_per_unit": 0.001}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY[]::text[]),

-- Deodorization (03.3)
(gen_random_uuid(), 'CLN-DEODOR', '03.3', 'Deodorization', 'Odor removal treatment', 'SF', 0.45, '[]'::jsonb, '[{"task": "deodorization", "hours_per_unit": 0.01, "trade": "skilled"}]'::jsonb, '[{"type": "ozone_machine", "cost_per_unit": 0.15}]'::jsonb, 1.00, 85.00, '[{"damage_type": "smoke"}, {"damage_type": "water", "water_category": 3}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'CLN-THERMO-FOG', '03.3', 'Deodorization', 'Thermal fogging treatment', 'SF', 0.35, '[]'::jsonb, '[{"task": "fogging", "hours_per_unit": 0.008, "trade": "skilled"}]'::jsonb, '[{"type": "fogger", "cost_per_unit": 0.12}]'::jsonb, 1.00, 125.00, '[{"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 8: TRIM & MILLWORK LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Baseboard (16.1)
(gen_random_uuid(), 'TRIM-BASE-MDF', '16.1', 'Baseboard', 'Baseboard MDF 3-1/4" - install', 'LF', 4.25, '[{"sku": "BASE-MDF-314", "qty_per_unit": 0.0625}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 50.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-TRIM']),

(gen_random_uuid(), 'TRIM-BASE-MDF-5', '16.1', 'Baseboard', 'Baseboard MDF 5-1/4" - install', 'LF', 5.45, '[{"sku": "BASE-MDF-514", "qty_per_unit": 0.0625}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 55.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-TRIM']),

(gen_random_uuid(), 'TRIM-BASE-PINE', '16.1', 'Baseboard', 'Baseboard pine 3-1/4" - install', 'LF', 5.85, '[{"sku": "BASE-PINE-314", "qty_per_unit": 0.0625}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 60.00, '[{"damage_type": "water", "surface": "trim"}]'::jsonb, ARRAY['PAINT-INT-TRIM']),

-- Crown Molding (16.2)
(gen_random_uuid(), 'TRIM-CROWN-MDF', '16.2', 'Crown Molding', 'Crown molding MDF 3-1/4" - install', 'LF', 6.85, '[{"sku": "CROWN-MDF-314", "qty_per_unit": 0.0625}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "specialty"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 0.05}]'::jsonb, 1.10, 75.00, '[{"damage_type": "water", "surface": "crown"}]'::jsonb, ARRAY['PAINT-INT-TRIM']),

-- Door Casing (16.3)
(gen_random_uuid(), 'TRIM-CASING', '16.3', 'Door Casing', 'Door casing MDF - per opening', 'EA', 85.00, '[{"sku": "CASING-MDF-214", "qty_per_unit": 3.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 75.00, '[{"damage_type": "water", "surface": "door"}]'::jsonb, ARRAY['PAINT-INT-TRIM']),

-- Quarter Round/Shoe (16.4)
(gen_random_uuid(), 'TRIM-QUARTER', '16.4', 'Chair Rail', 'Quarter round - install', 'LF', 2.15, '[{"sku": "QUARTER-RND", "qty_per_unit": 0.125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 35.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM']),

(gen_random_uuid(), 'TRIM-SHOE', '16.4', 'Chair Rail', 'Shoe molding - install', 'LF', 1.95, '[{"sku": "SHOE-MOLD", "qty_per_unit": 0.125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 30.00, '[]'::jsonb, ARRAY['PAINT-INT-TRIM']);
