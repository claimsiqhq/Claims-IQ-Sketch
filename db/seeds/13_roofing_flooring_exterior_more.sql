-- Roofing, Flooring, Exterior/Siding, Windows/Doors, Plumbing, Electrical, HVAC, Insulation
-- Comprehensive expansion of line items for property insurance claims

-- ============================================
-- PART 1: ADDITIONAL CATEGORIES
-- ============================================

-- Insulation (05)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('05', NULL, 'Insulation', 5),
('05.1', '05', 'Batt Insulation', 1),
('05.2', '05', 'Blown-In Insulation', 2),
('05.3', '05', 'Foam Insulation', 3),
('05.4', '05', 'Vapor Barriers', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Flooring (07)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('07', NULL, 'Flooring', 7),
('07.1', '07', 'Hardwood Flooring', 1),
('07.2', '07', 'Tile Flooring', 2),
('07.3', '07', 'Carpet & Pad', 3),
('07.4', '07', 'Vinyl & LVP', 4),
('07.5', '07', 'Subfloor', 5)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Windows & Doors (09)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('09', NULL, 'Windows & Doors', 9),
('09.1', '09', 'Windows', 1),
('09.2', '09', 'Entry Doors', 2),
('09.3', '09', 'Interior Doors', 3),
('09.4', '09', 'Sliding/Patio Doors', 4),
('09.5', '09', 'Hardware', 5)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Plumbing (11)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('11', NULL, 'Plumbing', 11),
('11.1', '11', 'Pipe Repair', 1),
('11.2', '11', 'Fixtures', 2),
('11.3', '11', 'Water Heaters', 3),
('11.4', '11', 'Valves & Connections', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Electrical (12)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('12', NULL, 'Electrical', 12),
('12.1', '12', 'Outlets & Switches', 1),
('12.2', '12', 'Light Fixtures', 2),
('12.3', '12', 'Panel & Wiring', 3),
('12.4', '12', 'Smoke/CO Detectors', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- HVAC (13)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('13', NULL, 'HVAC', 13),
('13.1', '13', 'Ductwork', 1),
('13.2', '13', 'Registers & Grilles', 2),
('13.3', '13', 'Equipment', 3),
('13.4', '13', 'Duct Cleaning', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Roofing (17)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('17', NULL, 'Roofing', 17),
('17.1', '17', 'Shingle Removal', 1),
('17.2', '17', 'Shingle Installation', 2),
('17.3', '17', 'Underlayment', 3),
('17.4', '17', 'Flashing & Trim', 4),
('17.5', '17', 'Decking', 5),
('17.6', '17', 'Ventilation', 6)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Exterior/Siding (18)
INSERT INTO line_item_categories (id, parent_id, name, sort_order) VALUES
('18', NULL, 'Exterior & Siding', 18),
('18.1', '18', 'Vinyl Siding', 1),
('18.2', '18', 'Fiber Cement Siding', 2),
('18.3', '18', 'Wood Siding', 3),
('18.4', '18', 'Soffit & Fascia', 4),
('18.5', '18', 'Gutters & Downspouts', 5)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ============================================
-- PART 2: MATERIALS
-- ============================================

-- Roofing Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'SHNG-3TAB', '3-Tab shingles bundle', 'BDL', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'SHNG-ARCH', 'Architectural shingles bundle', 'BDL', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'SHNG-PREM', 'Premium architectural shingles bundle', 'BDL', 58.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-15', '15lb felt underlayment roll', 'ROLL', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-30', '30lb felt underlayment roll', 'ROLL', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-SYN', 'Synthetic underlayment roll', 'ROLL', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'ICE-WATER', 'Ice & water shield roll', 'ROLL', 95.00, 'baseline_2024'),
(gen_random_uuid(), 'RIDGE-CAP', 'Ridge cap shingles bundle', 'BDL', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'DRIP-EDGE', 'Drip edge aluminum 10ft', 'EA', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'FLASH-STEP', 'Step flashing piece', 'EA', 1.25, 'baseline_2024'),
(gen_random_uuid(), 'FLASH-PIPE', 'Pipe boot flashing', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'VENT-RIDGE', 'Ridge vent 4ft section', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'VENT-BOX', 'Box vent/roof louver', 'EA', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'DECK-OSB', 'Roof deck OSB 7/16" 4x8', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'DECK-PLY', 'Roof deck plywood 1/2" 4x8', 'EA', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'NAILS-ROOF', 'Roofing nails coil box', 'BOX', 45.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Flooring Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'HW-OAK-34', 'Hardwood oak 3/4" unfinished', 'SF', 6.50, 'baseline_2024'),
(gen_random_uuid(), 'HW-OAK-PRE', 'Hardwood oak prefinished', 'SF', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'HW-ENG', 'Engineered hardwood', 'SF', 5.50, 'baseline_2024'),
(gen_random_uuid(), 'TILE-CER-12', 'Ceramic tile 12x12', 'SF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'TILE-PORC-12', 'Porcelain tile 12x12', 'SF', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'TILE-PORC-24', 'Porcelain tile 24x24', 'SF', 4.25, 'baseline_2024'),
(gen_random_uuid(), 'LVP-STD', 'Luxury vinyl plank standard', 'SF', 3.25, 'baseline_2024'),
(gen_random_uuid(), 'LVP-PREM', 'Luxury vinyl plank premium', 'SF', 4.75, 'baseline_2024'),
(gen_random_uuid(), 'CARPET-STD', 'Carpet standard grade', 'SY', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'CARPET-MID', 'Carpet mid grade', 'SY', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'CARPET-PREM', 'Carpet premium grade', 'SY', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'PAD-STD', 'Carpet pad standard 6lb', 'SY', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'PAD-PREM', 'Carpet pad premium 8lb', 'SY', 6.50, 'baseline_2024'),
(gen_random_uuid(), 'SUBFLR-OSB', 'Subfloor OSB 3/4" 4x8', 'EA', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'SUBFLR-PLY', 'Subfloor plywood 3/4" 4x8', 'EA', 48.00, 'baseline_2024'),
(gen_random_uuid(), 'THINSET', 'Thinset mortar 50lb', 'BAG', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'GROUT', 'Tile grout 25lb', 'BAG', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'TRANS-STRIP', 'Transition strip', 'EA', 12.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Exterior/Siding Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'SIDING-VNL', 'Vinyl siding D4 panel', 'SF', 1.85, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-VNL-PREM', 'Vinyl siding premium insulated', 'SF', 3.25, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-HARDIE', 'Fiber cement lap siding', 'SF', 2.45, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-HARDIE-PREM', 'Fiber cement textured siding', 'SF', 3.15, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-WOOD', 'Wood lap siding cedar', 'SF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'SOFFIT-VNL', 'Vinyl soffit panel', 'SF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'SOFFIT-ALU', 'Aluminum soffit panel', 'SF', 2.85, 'baseline_2024'),
(gen_random_uuid(), 'FASCIA-ALU', 'Aluminum fascia cover', 'LF', 2.50, 'baseline_2024'),
(gen_random_uuid(), 'FASCIA-PVC', 'PVC fascia board', 'LF', 3.25, 'baseline_2024'),
(gen_random_uuid(), 'GUTTER-ALU', 'Aluminum gutter 5" K-style', 'LF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'GUTTER-SEAM', 'Seamless aluminum gutter', 'LF', 6.50, 'baseline_2024'),
(gen_random_uuid(), 'DOWNSPOUT', 'Downspout 2x3 aluminum', 'LF', 3.25, 'baseline_2024'),
(gen_random_uuid(), 'HOUSEWRAP', 'House wrap roll', 'ROLL', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'J-CHAN', 'J-channel trim', 'EA', 8.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Window & Door Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'WIN-DH-STD', 'Double hung window standard', 'EA', 285.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-DH-MID', 'Double hung window mid-grade', 'EA', 385.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-DH-PREM', 'Double hung window premium', 'EA', 525.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-CASE', 'Casement window', 'EA', 425.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-PIC', 'Picture window', 'EA', 350.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-SLIDE', 'Sliding window', 'EA', 325.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-STL', 'Entry door steel', 'EA', 385.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-FG', 'Entry door fiberglass', 'EA', 525.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-WOOD', 'Entry door wood', 'EA', 850.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-INT-HC', 'Interior door hollow core', 'EA', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-INT-SC', 'Interior door solid core', 'EA', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-SLIDE', 'Sliding patio door', 'EA', 850.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-FRENCH', 'French patio door', 'EA', 1250.00, 'baseline_2024'),
(gen_random_uuid(), 'LOCKSET-STD', 'Lockset standard', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'LOCKSET-ENTRY', 'Entry lockset with deadbolt', 'EA', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'HINGE-DOOR', 'Door hinge 3.5"', 'EA', 4.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Plumbing Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'PIPE-PVC-2', 'PVC pipe 2" 10ft', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PVC-3', 'PVC pipe 3" 10ft', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PVC-4', 'PVC pipe 4" 10ft', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-CPVC-12', 'CPVC pipe 1/2" 10ft', 'EA', 6.50, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-CPVC-34', 'CPVC pipe 3/4" 10ft', 'EA', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PEX-12', 'PEX pipe 1/2" 100ft', 'ROLL', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PEX-34', 'PEX pipe 3/4" 100ft', 'ROLL', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'TOILET-STD', 'Toilet standard', 'EA', 185.00, 'baseline_2024'),
(gen_random_uuid(), 'TOILET-MID', 'Toilet mid-grade', 'EA', 285.00, 'baseline_2024'),
(gen_random_uuid(), 'SINK-KIT', 'Kitchen sink stainless', 'EA', 225.00, 'baseline_2024'),
(gen_random_uuid(), 'SINK-VAN', 'Vanity sink', 'EA', 125.00, 'baseline_2024'),
(gen_random_uuid(), 'FAUCET-KIT', 'Kitchen faucet', 'EA', 165.00, 'baseline_2024'),
(gen_random_uuid(), 'FAUCET-LAV', 'Lavatory faucet', 'EA', 95.00, 'baseline_2024'),
(gen_random_uuid(), 'WH-40GAL', 'Water heater 40 gal gas', 'EA', 650.00, 'baseline_2024'),
(gen_random_uuid(), 'WH-50GAL', 'Water heater 50 gal gas', 'EA', 785.00, 'baseline_2024'),
(gen_random_uuid(), 'SHUTOFF', 'Shut-off valve', 'EA', 12.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Electrical Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'OUTLET-STD', 'Duplex outlet 15A', 'EA', 2.50, 'baseline_2024'),
(gen_random_uuid(), 'OUTLET-GFCI', 'GFCI outlet', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'OUTLET-USB', 'USB outlet combo', 'EA', 25.00, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-STD', 'Light switch single pole', 'EA', 2.00, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-3WAY', 'Light switch 3-way', 'EA', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-DIM', 'Dimmer switch', 'EA', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'COVER-PLT', 'Cover plate', 'EA', 1.50, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-FLUSH', 'Flush mount light fixture', 'EA', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-PEND', 'Pendant light fixture', 'EA', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-REC', 'Recessed light can', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-LED', 'LED retrofit can light', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'WIRE-14-2', 'Romex 14/2 250ft', 'ROLL', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'WIRE-12-2', 'Romex 12/2 250ft', 'ROLL', 115.00, 'baseline_2024'),
(gen_random_uuid(), 'SMOKE-DET', 'Smoke detector hardwired', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'CO-DET', 'CO detector hardwired', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'COMBO-DET', 'Smoke/CO combo detector', 'EA', 45.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- HVAC Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'DUCT-FLEX-6', 'Flex duct 6" 25ft', 'EA', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-FLEX-8', 'Flex duct 8" 25ft', 'EA', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-RIGID', 'Rigid duct section', 'LF', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'REG-FLOOR', 'Floor register 4x10', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'REG-CEIL', 'Ceiling register 10x10', 'EA', 15.00, 'baseline_2024'),
(gen_random_uuid(), 'GRILLE-RET', 'Return air grille 20x20', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'FILTER-STD', 'Air filter standard', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-TAPE', 'HVAC foil tape', 'ROLL', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-SEAL', 'Duct sealant mastic', 'GAL', 22.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Insulation Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'INSUL-R13', 'Batt insulation R-13 kraft', 'SF', 0.55, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R19', 'Batt insulation R-19 kraft', 'SF', 0.75, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R30', 'Batt insulation R-30 kraft', 'SF', 1.05, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R38', 'Batt insulation R-38 kraft', 'SF', 1.25, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-BLOW', 'Blown cellulose per bag', 'BAG', 15.00, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-FOAM-CC', 'Spray foam closed cell per BF', 'BF', 1.85, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-FOAM-OC', 'Spray foam open cell per BF', 'BF', 0.85, 'baseline_2024'),
(gen_random_uuid(), 'VAPOR-POLY', 'Vapor barrier 6mil poly', 'SF', 0.08, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- ============================================
-- PART 3: ROOFING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Shingle Removal (17.1)
(gen_random_uuid(), 'ROOF-TEAR-1', '17.1', 'Shingle Removal', 'Tear off shingles - 1 layer', 'SQ', 85.00, '[]'::jsonb, '[{"task": "tear_off", "hours_per_unit": 0.75, "trade": "general"}]'::jsonb, '[{"type": "dumpster", "cost_per_unit": 15.00}]'::jsonb, 1.00, 250.00, '[{"damage_type": "wind", "surface": "roof"}, {"damage_type": "hail", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH']),

(gen_random_uuid(), 'ROOF-TEAR-2', '17.1', 'Shingle Removal', 'Tear off shingles - 2 layers', 'SQ', 125.00, '[]'::jsonb, '[{"task": "tear_off", "hours_per_unit": 1.1, "trade": "general"}]'::jsonb, '[{"type": "dumpster", "cost_per_unit": 25.00}]'::jsonb, 1.00, 350.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH']),

-- Shingle Installation (17.2)
(gen_random_uuid(), 'ROOF-SHNG-3TAB', '17.2', 'Shingle Installation', 'Install 3-tab shingles', 'SQ', 185.00, '[{"sku": "SHNG-3TAB", "qty_per_unit": 3.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 350.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-FELT-SYN', 'ROOF-RIDGE']),

(gen_random_uuid(), 'ROOF-SHNG-ARCH', '17.2', 'Shingle Installation', 'Install architectural shingles', 'SQ', 225.00, '[{"sku": "SHNG-ARCH", "qty_per_unit": 3.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 400.00, '[{"damage_type": "wind", "surface": "roof"}, {"damage_type": "hail", "surface": "roof"}]'::jsonb, ARRAY['ROOF-FELT-SYN', 'ROOF-RIDGE']),

(gen_random_uuid(), 'ROOF-SHNG-PREM', '17.2', 'Shingle Installation', 'Install premium architectural shingles', 'SQ', 295.00, '[{"sku": "SHNG-PREM", "qty_per_unit": 3.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 450.00, '[]'::jsonb, ARRAY['ROOF-FELT-SYN', 'ROOF-RIDGE']),

-- Underlayment (17.3)
(gen_random_uuid(), 'ROOF-FELT-15', '17.3', 'Underlayment', 'Install 15lb felt underlayment', 'SQ', 28.00, '[{"sku": "FELT-15", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 75.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-FELT-30', '17.3', 'Underlayment', 'Install 30lb felt underlayment', 'SQ', 38.00, '[{"sku": "FELT-30", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.18, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 85.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-FELT-SYN', '17.3', 'Underlayment', 'Install synthetic underlayment', 'SQ', 55.00, '[{"sku": "FELT-SYN", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 95.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-ICE-WATER', '17.3', 'Underlayment', 'Install ice & water shield', 'SQ', 95.00, '[{"sku": "ICE-WATER", "qty_per_unit": 0.5}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 125.00, '[]'::jsonb, ARRAY[]::text[]),

-- Flashing & Trim (17.4)
(gen_random_uuid(), 'ROOF-DRIP', '17.4', 'Flashing & Trim', 'Install drip edge', 'LF', 3.85, '[{"sku": "DRIP-EDGE", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 45.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-STEP-FLASH', '17.4', 'Flashing & Trim', 'Install step flashing', 'LF', 8.50, '[{"sku": "FLASH-STEP", "qty_per_unit": 1.5}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 65.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-PIPE-BOOT', '17.4', 'Flashing & Trim', 'Install pipe boot flashing', 'EA', 45.00, '[{"sku": "FLASH-PIPE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-RIDGE', '17.4', 'Flashing & Trim', 'Install ridge cap shingles', 'LF', 6.85, '[{"sku": "RIDGE-CAP", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 85.00, '[]'::jsonb, ARRAY[]::text[]),

-- Decking (17.5)
(gen_random_uuid(), 'ROOF-DECK-OSB', '17.5', 'Decking', 'Replace roof deck OSB', 'SF', 3.25, '[{"sku": "DECK-OSB", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 150.00, '[{"damage_type": "water", "surface": "deck"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH']),

(gen_random_uuid(), 'ROOF-DECK-PLY', '17.5', 'Decking', 'Replace roof deck plywood', 'SF', 4.45, '[{"sku": "DECK-PLY", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.028, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 175.00, '[]'::jsonb, ARRAY['ROOF-SHNG-ARCH']),

-- Ventilation (17.6)
(gen_random_uuid(), 'ROOF-VENT-RIDGE', '17.6', 'Ventilation', 'Install ridge vent', 'LF', 8.50, '[{"sku": "VENT-RIDGE", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 95.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ROOF-VENT-BOX', '17.6', 'Ventilation', 'Install box vent', 'EA', 85.00, '[{"sku": "VENT-BOX", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 4: FLOORING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Hardwood (07.1)
(gen_random_uuid(), 'FLR-HW-OAK', '07.1', 'Hardwood Flooring', 'Hardwood oak 3/4" - install', 'SF', 12.50, '[{"sku": "HW-OAK-34", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.10, 350.00, '[{"damage_type": "water", "surface": "hardwood"}]'::jsonb, ARRAY['FLR-HW-FINISH']),

(gen_random_uuid(), 'FLR-HW-PRE', '07.1', 'Hardwood Flooring', 'Hardwood prefinished - install', 'SF', 14.25, '[{"sku": "HW-OAK-PRE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.10, 375.00, '[{"damage_type": "water", "surface": "hardwood"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-HW-ENG', '07.1', 'Hardwood Flooring', 'Engineered hardwood - install', 'SF', 10.50, '[{"sku": "HW-ENG", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.10, 325.00, '[{"damage_type": "water", "surface": "hardwood"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-HW-FINISH', '07.1', 'Hardwood Flooring', 'Hardwood sand and finish', 'SF', 4.85, '[]'::jsonb, '[{"task": "sand", "hours_per_unit": 0.025, "trade": "specialty"}, {"task": "finish", "hours_per_unit": 0.02, "trade": "specialty"}]'::jsonb, '[{"type": "sander_rental", "cost_per_unit": 0.35}]'::jsonb, 1.00, 450.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-HW-SCREEN', '07.1', 'Hardwood Flooring', 'Hardwood screen and recoat', 'SF', 2.45, '[]'::jsonb, '[{"task": "screen", "hours_per_unit": 0.012, "trade": "specialty"}, {"task": "coat", "hours_per_unit": 0.01, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, '[]'::jsonb, ARRAY[]::text[]),

-- Tile (07.2)
(gen_random_uuid(), 'FLR-TILE-CER', '07.2', 'Tile Flooring', 'Ceramic tile 12x12 - install', 'SF', 8.50, '[{"sku": "TILE-CER-12", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.02}, {"sku": "GROUT", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.065, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.12, 300.00, '[{"damage_type": "water", "surface": "tile"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-TILE-PORC', '07.2', 'Tile Flooring', 'Porcelain tile 12x12 - install', 'SF', 10.25, '[{"sku": "TILE-PORC-12", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.02}, {"sku": "GROUT", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.07, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.12, 325.00, '[{"damage_type": "water", "surface": "tile"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-TILE-PORC-LG', '07.2', 'Tile Flooring', 'Porcelain tile 24x24 - install', 'SF', 12.50, '[{"sku": "TILE-PORC-24", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.025}, {"sku": "GROUT", "qty_per_unit": 0.008}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.12, 375.00, '[]'::jsonb, ARRAY[]::text[]),

-- Carpet (07.3)
(gen_random_uuid(), 'FLR-CARPET-STD', '07.3', 'Carpet & Pad', 'Carpet standard grade - install', 'SY', 38.00, '[{"sku": "CARPET-STD", "qty_per_unit": 1.0}, {"sku": "PAD-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.2, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 250.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-CARPET-MID', '07.3', 'Carpet & Pad', 'Carpet mid grade - install', 'SY', 52.00, '[{"sku": "CARPET-MID", "qty_per_unit": 1.0}, {"sku": "PAD-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.22, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 285.00, '[{"damage_type": "water", "surface": "carpet"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-CARPET-PREM', '07.3', 'Carpet & Pad', 'Carpet premium grade - install', 'SY', 72.00, '[{"sku": "CARPET-PREM", "qty_per_unit": 1.0}, {"sku": "PAD-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 325.00, '[]'::jsonb, ARRAY[]::text[]),

-- Vinyl/LVP (07.4)
(gen_random_uuid(), 'FLR-LVP-STD', '07.4', 'Vinyl & LVP', 'LVP standard - install', 'SF', 6.85, '[{"sku": "LVP-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.035, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 275.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-LVP-PREM', '07.4', 'Vinyl & LVP', 'LVP premium - install', 'SF', 9.25, '[{"sku": "LVP-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.038, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 300.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY[]::text[]),

-- Subfloor (07.5)
(gen_random_uuid(), 'FLR-SUBFLR-OSB', '07.5', 'Subfloor', 'Subfloor OSB 3/4" - replace', 'SF', 4.85, '[{"sku": "SUBFLR-OSB", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.035, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 200.00, '[{"damage_type": "water", "surface": "subfloor"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-SUBFLR-PLY', '07.5', 'Subfloor', 'Subfloor plywood 3/4" - replace', 'SF', 6.25, '[{"sku": "SUBFLR-PLY", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.038, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.08, 225.00, '[{"damage_type": "water", "surface": "subfloor"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'FLR-TRANS', '07.5', 'Subfloor', 'Transition strip - install', 'EA', 25.00, '[{"sku": "TRANS-STRIP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, '[]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 5: EXTERIOR/SIDING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Vinyl Siding (18.1)
(gen_random_uuid(), 'EXT-SIDING-VNL', '18.1', 'Vinyl Siding', 'Vinyl siding D4 - install', 'SF', 5.25, '[{"sku": "SIDING-VNL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.04, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.12, 350.00, '[{"damage_type": "wind", "surface": "siding"}, {"damage_type": "hail", "surface": "siding"}]'::jsonb, ARRAY['EXT-HOUSEWRAP']),

(gen_random_uuid(), 'EXT-SIDING-VNL-PREM', '18.1', 'Vinyl Siding', 'Vinyl siding insulated - install', 'SF', 7.85, '[{"sku": "SIDING-VNL-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.12, 400.00, '[{"damage_type": "wind", "surface": "siding"}]'::jsonb, ARRAY['EXT-HOUSEWRAP']),

(gen_random_uuid(), 'EXT-SIDING-VNL-REM', '18.1', 'Vinyl Siding', 'Vinyl siding - remove', 'SF', 0.85, '[]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.018, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[]'::jsonb, ARRAY['EXT-SIDING-VNL']),

-- Fiber Cement (18.2)
(gen_random_uuid(), 'EXT-SIDING-HARDIE', '18.2', 'Fiber Cement Siding', 'Fiber cement lap siding - install', 'SF', 8.50, '[{"sku": "SIDING-HARDIE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 450.00, '[{"damage_type": "wind", "surface": "siding"}, {"damage_type": "hail", "surface": "siding"}]'::jsonb, ARRAY['EXT-HOUSEWRAP']),

(gen_random_uuid(), 'EXT-SIDING-HARDIE-PREM', '18.2', 'Fiber Cement Siding', 'Fiber cement textured - install', 'SF', 10.25, '[{"sku": "SIDING-HARDIE-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 500.00, '[]'::jsonb, ARRAY['EXT-HOUSEWRAP']),

-- Wood Siding (18.3)
(gen_random_uuid(), 'EXT-SIDING-WOOD', '18.3', 'Wood Siding', 'Wood lap siding cedar - install', 'SF', 12.50, '[{"sku": "SIDING-WOOD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.065, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.12, 550.00, '[{"damage_type": "wind", "surface": "siding"}]'::jsonb, ARRAY['EXT-HOUSEWRAP']),

-- Soffit & Fascia (18.4)
(gen_random_uuid(), 'EXT-SOFFIT-VNL', '18.4', 'Soffit & Fascia', 'Vinyl soffit - install', 'SF', 6.25, '[{"sku": "SOFFIT-VNL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.045, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.05}]'::jsonb, 1.10, 200.00, '[{"damage_type": "wind", "surface": "soffit"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'EXT-SOFFIT-ALU', '18.4', 'Soffit & Fascia', 'Aluminum soffit - install', 'SF', 7.45, '[{"sku": "SOFFIT-ALU", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.048, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.05}]'::jsonb, 1.10, 225.00, '[{"damage_type": "wind", "surface": "soffit"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'EXT-FASCIA-ALU', '18.4', 'Soffit & Fascia', 'Aluminum fascia cover - install', 'LF', 6.85, '[{"sku": "FASCIA-ALU", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.08}]'::jsonb, 1.08, 125.00, '[{"damage_type": "wind", "surface": "fascia"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'EXT-FASCIA-PVC', '18.4', 'Soffit & Fascia', 'PVC fascia board - install', 'LF', 8.50, '[{"sku": "FASCIA-PVC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.08}]'::jsonb, 1.08, 150.00, '[]'::jsonb, ARRAY[]::text[]),

-- Gutters (18.5)
(gen_random_uuid(), 'EXT-GUTTER-ALU', '18.5', 'Gutters & Downspouts', 'Aluminum gutter 5" - install', 'LF', 9.50, '[{"sku": "GUTTER-ALU", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.06, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.1}]'::jsonb, 1.05, 175.00, '[{"damage_type": "wind", "surface": "gutter"}]'::jsonb, ARRAY['EXT-DOWNSPOUT']),

(gen_random_uuid(), 'EXT-GUTTER-SEAM', '18.5', 'Gutters & Downspouts', 'Seamless aluminum gutter - install', 'LF', 12.50, '[{"sku": "GUTTER-SEAM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "specialty"}]'::jsonb, '[{"type": "gutter_machine", "cost_per_unit": 0.5}]'::jsonb, 1.03, 250.00, '[{"damage_type": "wind", "surface": "gutter"}]'::jsonb, ARRAY['EXT-DOWNSPOUT']),

(gen_random_uuid(), 'EXT-DOWNSPOUT', '18.5', 'Gutters & Downspouts', 'Downspout 2x3 - install', 'LF', 7.85, '[{"sku": "DOWNSPOUT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.055, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.08}]'::jsonb, 1.05, 95.00, '[{"damage_type": "wind", "surface": "downspout"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'EXT-HOUSEWRAP', '18.5', 'Gutters & Downspouts', 'House wrap - install', 'SF', 0.65, '[{"sku": "HOUSEWRAP", "qty_per_unit": 0.0011}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.08, 150.00, '[]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 6: WINDOWS & DOORS LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Windows (09.1)
(gen_random_uuid(), 'WIN-DH-STD', '09.1', 'Windows', 'Double hung window standard - install', 'EA', 425.00, '[{"sku": "WIN-DH-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 425.00, '[{"damage_type": "wind", "surface": "window"}, {"damage_type": "hail", "surface": "window"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'WIN-DH-MID', '09.1', 'Windows', 'Double hung window mid-grade - install', 'EA', 565.00, '[{"sku": "WIN-DH-MID", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.75, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 565.00, '[{"damage_type": "wind", "surface": "window"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'WIN-DH-PREM', '09.1', 'Windows', 'Double hung window premium - install', 'EA', 750.00, '[{"sku": "WIN-DH-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 2.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 750.00, '[]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'WIN-CASE', '09.1', 'Windows', 'Casement window - install', 'EA', 625.00, '[{"sku": "WIN-CASE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 2.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 625.00, '[{"damage_type": "wind", "surface": "window"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'WIN-PIC', '09.1', 'Windows', 'Picture window - install', 'EA', 525.00, '[{"sku": "WIN-PIC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.75, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 525.00, '[]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'WIN-SLIDE', '09.1', 'Windows', 'Sliding window - install', 'EA', 485.00, '[{"sku": "WIN-SLIDE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 485.00, '[]'::jsonb, ARRAY['TRIM-CASING']),

-- Entry Doors (09.2)
(gen_random_uuid(), 'DOOR-EXT-STL', '09.2', 'Entry Doors', 'Entry door steel - install', 'EA', 685.00, '[{"sku": "DOOR-EXT-STL", "qty_per_unit": 1.0}, {"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 3.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 685.00, '[{"damage_type": "break-in", "surface": "door"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'DOOR-EXT-FG', '09.2', 'Entry Doors', 'Entry door fiberglass - install', 'EA', 875.00, '[{"sku": "DOOR-EXT-FG", "qty_per_unit": 1.0}, {"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 3.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 875.00, '[{"damage_type": "wind", "surface": "door"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'DOOR-EXT-WOOD', '09.2', 'Entry Doors', 'Entry door wood - install', 'EA', 1250.00, '[{"sku": "DOOR-EXT-WOOD", "qty_per_unit": 1.0}, {"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 4.0, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 1250.00, '[]'::jsonb, ARRAY['TRIM-CASING']),

-- Interior Doors (09.3)
(gen_random_uuid(), 'DOOR-INT-HC', '09.3', 'Interior Doors', 'Interior door hollow core - install', 'EA', 185.00, '[{"sku": "DOOR-INT-HC", "qty_per_unit": 1.0}, {"sku": "LOCKSET-STD", "qty_per_unit": 1.0}, {"sku": "HINGE-DOOR", "qty_per_unit": 3.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 185.00, '[{"damage_type": "water", "surface": "door"}]'::jsonb, ARRAY['TRIM-CASING']),

(gen_random_uuid(), 'DOOR-INT-SC', '09.3', 'Interior Doors', 'Interior door solid core - install', 'EA', 295.00, '[{"sku": "DOOR-INT-SC", "qty_per_unit": 1.0}, {"sku": "LOCKSET-STD", "qty_per_unit": 1.0}, {"sku": "HINGE-DOOR", "qty_per_unit": 3.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 295.00, '[{"damage_type": "fire", "surface": "door"}]'::jsonb, ARRAY['TRIM-CASING']),

-- Sliding/Patio Doors (09.4)
(gen_random_uuid(), 'DOOR-SLIDE', '09.4', 'Sliding/Patio Doors', 'Sliding patio door - install', 'EA', 1450.00, '[{"sku": "DOOR-SLIDE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 4.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 1450.00, '[{"damage_type": "wind", "surface": "door"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'DOOR-FRENCH', '09.4', 'Sliding/Patio Doors', 'French patio door - install', 'EA', 1950.00, '[{"sku": "DOOR-FRENCH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 5.0, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 1950.00, '[]'::jsonb, ARRAY[]::text[]),

-- Hardware (09.5)
(gen_random_uuid(), 'HDW-LOCKSET', '09.5', 'Hardware', 'Lockset standard - install', 'EA', 65.00, '[{"sku": "LOCKSET-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HDW-LOCKSET-ENTRY', '09.5', 'Hardware', 'Entry lockset with deadbolt - install', 'EA', 145.00, '[{"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 145.00, '[{"damage_type": "break-in", "surface": "door"}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 7: PLUMBING LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Pipe Repair (11.1)
(gen_random_uuid(), 'PLMB-PIPE-PVC', '11.1', 'Pipe Repair', 'PVC drain pipe repair', 'LF', 18.50, '[{"sku": "PIPE-PVC-2", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "repair", "hours_per_unit": 0.15, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 185.00, '[{"damage_type": "water", "surface": "pipe"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-PIPE-CPVC', '11.1', 'Pipe Repair', 'CPVC supply pipe repair', 'LF', 15.50, '[{"sku": "PIPE-CPVC-12", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "repair", "hours_per_unit": 0.12, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 165.00, '[{"damage_type": "water", "surface": "pipe"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-PIPE-PEX', '11.1', 'Pipe Repair', 'PEX supply pipe repair', 'LF', 12.50, '[{"sku": "PIPE-PEX-12", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "repair", "hours_per_unit": 0.1, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 145.00, '[{"damage_type": "water", "surface": "pipe"}]'::jsonb, ARRAY[]::text[]),

-- Fixtures (11.2)
(gen_random_uuid(), 'PLMB-TOILET-STD', '11.2', 'Fixtures', 'Toilet standard - install', 'EA', 385.00, '[{"sku": "TOILET-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 2.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 385.00, '[{"damage_type": "water", "surface": "toilet"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-TOILET-MID', '11.2', 'Fixtures', 'Toilet mid-grade - install', 'EA', 525.00, '[{"sku": "TOILET-MID", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 2.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 525.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-SINK-KIT', '11.2', 'Fixtures', 'Kitchen sink stainless - install', 'EA', 425.00, '[{"sku": "SINK-KIT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 2.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 425.00, '[{"damage_type": "water", "surface": "sink"}]'::jsonb, ARRAY['PLMB-FAUCET-KIT']),

(gen_random_uuid(), 'PLMB-SINK-VAN', '11.2', 'Fixtures', 'Vanity sink - install', 'EA', 285.00, '[{"sku": "SINK-VAN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.75, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 285.00, '[{"damage_type": "water", "surface": "sink"}]'::jsonb, ARRAY['PLMB-FAUCET-LAV']),

(gen_random_uuid(), 'PLMB-FAUCET-KIT', '11.2', 'Fixtures', 'Kitchen faucet - install', 'EA', 285.00, '[{"sku": "FAUCET-KIT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 285.00, '[{"damage_type": "water", "surface": "faucet"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-FAUCET-LAV', '11.2', 'Fixtures', 'Lavatory faucet - install', 'EA', 185.00, '[{"sku": "FAUCET-LAV", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 185.00, '[{"damage_type": "water", "surface": "faucet"}]'::jsonb, ARRAY[]::text[]),

-- Water Heaters (11.3)
(gen_random_uuid(), 'PLMB-WH-40', '11.3', 'Water Heaters', 'Water heater 40 gal gas - install', 'EA', 1250.00, '[{"sku": "WH-40GAL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 4.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1250.00, '[{"damage_type": "water", "surface": "water_heater"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'PLMB-WH-50', '11.3', 'Water Heaters', 'Water heater 50 gal gas - install', 'EA', 1450.00, '[{"sku": "WH-50GAL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 4.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1450.00, '[]'::jsonb, ARRAY[]::text[]),

-- Valves (11.4)
(gen_random_uuid(), 'PLMB-SHUTOFF', '11.4', 'Valves & Connections', 'Shut-off valve - install', 'EA', 85.00, '[{"sku": "SHUTOFF", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 8: ELECTRICAL LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Outlets & Switches (12.1)
(gen_random_uuid(), 'ELEC-OUTLET', '12.1', 'Outlets & Switches', 'Duplex outlet - replace', 'EA', 45.00, '[{"sku": "OUTLET-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[{"damage_type": "water", "surface": "electrical"}, {"damage_type": "fire", "surface": "electrical"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-OUTLET-GFCI', '12.1', 'Outlets & Switches', 'GFCI outlet - install', 'EA', 85.00, '[{"sku": "OUTLET-GFCI", "qty_per_unit": 1.0}, {"sku": "COVER-PLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "water", "surface": "electrical"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-SWITCH', '12.1', 'Outlets & Switches', 'Light switch - replace', 'EA', 35.00, '[{"sku": "SWITCH-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.3, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[{"damage_type": "fire", "surface": "electrical"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-SWITCH-DIM', '12.1', 'Outlets & Switches', 'Dimmer switch - install', 'EA', 75.00, '[{"sku": "SWITCH-DIM", "qty_per_unit": 1.0}, {"sku": "COVER-PLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.45, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[]'::jsonb, ARRAY[]::text[]),

-- Light Fixtures (12.2)
(gen_random_uuid(), 'ELEC-LIGHT-FLUSH', '12.2', 'Light Fixtures', 'Flush mount light - install', 'EA', 125.00, '[{"sku": "LIGHT-FLUSH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "light"}, {"damage_type": "fire", "surface": "light"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-LIGHT-PEND', '12.2', 'Light Fixtures', 'Pendant light - install', 'EA', 185.00, '[{"sku": "LIGHT-PEND", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 185.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-LIGHT-REC', '12.2', 'Light Fixtures', 'Recessed can light - install', 'EA', 145.00, '[{"sku": "LIGHT-REC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 145.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-LIGHT-LED', '12.2', 'Light Fixtures', 'LED retrofit can light - install', 'EA', 95.00, '[{"sku": "LIGHT-LED", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[]'::jsonb, ARRAY[]::text[]),

-- Smoke/CO Detectors (12.4)
(gen_random_uuid(), 'ELEC-SMOKE', '12.4', 'Smoke/CO Detectors', 'Smoke detector hardwired - install', 'EA', 95.00, '[{"sku": "SMOKE-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-CO', '12.4', 'Smoke/CO Detectors', 'CO detector hardwired - install', 'EA', 105.00, '[{"sku": "CO-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 105.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'ELEC-COMBO-DET', '12.4', 'Smoke/CO Detectors', 'Smoke/CO combo detector - install', 'EA', 125.00, '[{"sku": "COMBO-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.55, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY[]::text[]);

-- ============================================
-- PART 9: HVAC LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Ductwork (13.1)
(gen_random_uuid(), 'HVAC-DUCT-FLEX', '13.1', 'Ductwork', 'Flex duct 6" - install', 'LF', 12.50, '[{"sku": "DUCT-FLEX-6", "qty_per_unit": 0.04}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 125.00, '[{"damage_type": "fire", "surface": "duct"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HVAC-DUCT-FLEX-8', '13.1', 'Ductwork', 'Flex duct 8" - install', 'LF', 15.50, '[{"sku": "DUCT-FLEX-8", "qty_per_unit": 0.04}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.09, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 145.00, '[{"damage_type": "fire", "surface": "duct"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HVAC-DUCT-RIGID', '13.1', 'Ductwork', 'Rigid duct section - install', 'LF', 22.50, '[{"sku": "DUCT-RIGID", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.08, 185.00, '[{"damage_type": "fire", "surface": "duct"}]'::jsonb, ARRAY[]::text[]),

-- Registers & Grilles (13.2)
(gen_random_uuid(), 'HVAC-REG-FLOOR', '13.2', 'Registers & Grilles', 'Floor register 4x10 - install', 'EA', 45.00, '[{"sku": "REG-FLOOR", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HVAC-REG-CEIL', '13.2', 'Registers & Grilles', 'Ceiling register 10x10 - install', 'EA', 55.00, '[{"sku": "REG-CEIL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.00, 55.00, '[{"damage_type": "smoke", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HVAC-GRILLE-RET', '13.2', 'Registers & Grilles', 'Return air grille 20x20 - install', 'EA', 65.00, '[{"sku": "GRILLE-RET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.4, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[]),

-- Duct Cleaning (13.4)
(gen_random_uuid(), 'HVAC-DUCT-CLEAN', '13.4', 'Duct Cleaning', 'Duct cleaning - per vent', 'EA', 45.00, '[]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 0.35, "trade": "hvac"}]'::jsonb, '[{"type": "cleaning_equip", "cost_per_unit": 8.00}]'::jsonb, 1.00, 250.00, '[{"damage_type": "smoke"}, {"damage_type": "fire"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'HVAC-DUCT-SANITIZE', '13.4', 'Duct Cleaning', 'Duct sanitizing treatment', 'EA', 185.00, '[]'::jsonb, '[{"task": "sanitize", "hours_per_unit": 1.0, "trade": "hvac"}]'::jsonb, '[{"type": "treatment", "cost_per_unit": 45.00}]'::jsonb, 1.00, 185.00, '[{"damage_type": "smoke"}]'::jsonb, ARRAY['HVAC-DUCT-CLEAN']);

-- ============================================
-- PART 10: INSULATION LINE ITEMS
-- ============================================

INSERT INTO line_items (id, code, category_id, category_name, description, unit, base_price, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items) VALUES

-- Batt Insulation (05.1)
(gen_random_uuid(), 'INSUL-BATT-R13', '05.1', 'Batt Insulation', 'Batt insulation R-13 wall - install', 'SF', 1.25, '[{"sku": "INSUL-R13", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.012, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 125.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'INSUL-BATT-R19', '05.1', 'Batt Insulation', 'Batt insulation R-19 floor - install', 'SF', 1.65, '[{"sku": "INSUL-R19", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 150.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'INSUL-BATT-R30', '05.1', 'Batt Insulation', 'Batt insulation R-30 attic - install', 'SF', 2.15, '[{"sku": "INSUL-R30", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.018, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 175.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'INSUL-BATT-R38', '05.1', 'Batt Insulation', 'Batt insulation R-38 attic - install', 'SF', 2.55, '[{"sku": "INSUL-R38", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 200.00, '[]'::jsonb, ARRAY[]::text[]),

-- Blown-In (05.2)
(gen_random_uuid(), 'INSUL-BLOW-ATTIC', '05.2', 'Blown-In Insulation', 'Blown cellulose attic - install', 'SF', 1.85, '[{"sku": "INSUL-BLOW", "qty_per_unit": 0.067}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[{"type": "blower_rental", "cost_per_unit": 0.15}]'::jsonb, 1.05, 350.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY[]::text[]),

-- Foam (05.3)
(gen_random_uuid(), 'INSUL-FOAM-CC', '05.3', 'Foam Insulation', 'Spray foam closed cell - install', 'SF', 3.85, '[{"sku": "INSUL-FOAM-CC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "spray", "hours_per_unit": 0.015, "trade": "specialty"}]'::jsonb, '[{"type": "spray_equip", "cost_per_unit": 0.25}]'::jsonb, 1.00, 500.00, '[]'::jsonb, ARRAY[]::text[]),

(gen_random_uuid(), 'INSUL-FOAM-OC', '05.3', 'Foam Insulation', 'Spray foam open cell - install', 'SF', 2.25, '[{"sku": "INSUL-FOAM-OC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "spray", "hours_per_unit": 0.012, "trade": "specialty"}]'::jsonb, '[{"type": "spray_equip", "cost_per_unit": 0.2}]'::jsonb, 1.00, 450.00, '[]'::jsonb, ARRAY[]::text[]),

-- Vapor Barriers (05.4)
(gen_random_uuid(), 'INSUL-VAPOR', '05.4', 'Vapor Barriers', 'Vapor barrier 6mil poly - install', 'SF', 0.45, '[{"sku": "VAPOR-POLY", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.008, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[]);
