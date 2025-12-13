-- MEP (Mechanical/Electrical/Plumbing) Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Electrical - Outlets & Switches
(gen_random_uuid(), 'ELEC-OUTLET-STD', '10.1', 'Standard duplex outlet - replace', 'EA', '[{"sku": "OUTLET-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "electrical"}, {"damage_type": "water", "surface": "outlet"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-OUTLET-GFI', '10.1', 'GFCI outlet - replace', 'EA', '[{"sku": "OUTLET-GFI", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[{"damage_type": "electrical"}, {"damage_type": "water", "surface": "outlet"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SWITCH', '10.1', 'Standard switch - replace', 'EA', '[{"sku": "SWITCH-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "electrical"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SWITCH-DIM', '10.1', 'Dimmer switch - install', 'EA', '[{"sku": "SWITCH-DIM", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Electrical - Lighting
(gen_random_uuid(), 'ELEC-LIGHT-STD', '10.2', 'Standard light fixture - replace', 'EA', '[{"sku": "LIGHT-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "ceiling"}, {"damage_type": "electrical"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-LIGHT-FLUSH', '10.2', 'Flush mount fixture - replace', 'EA', '[{"sku": "LIGHT-FLUSH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-LIGHT-RECESS', '10.2', 'Recessed light can - replace', 'EA', '[{"sku": "LIGHT-RECESS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 135.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['DRY-HTT-12'], true),

(gen_random_uuid(), 'ELEC-FAN', '10.3', 'Ceiling fan - replace', 'EA', '[{"sku": "FAN-CEIL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 185.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

-- Electrical - Panel & Safety
(gen_random_uuid(), 'ELEC-BREAKER-SP', '10.4', 'Single pole breaker - replace', 'EA', '[{"sku": "BREAKER-SP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "electrical"}, {"damage_type": "surge"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-BREAKER-DP', '10.4', 'Double pole breaker - replace', 'EA', '[{"sku": "BREAKER-DP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "electrical"}, {"damage_type": "surge"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SMOKE-DET', '10.5', 'Smoke detector - replace', 'EA', '[{"sku": "SMOKE-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['ELEC-CO-DET'], true),

(gen_random_uuid(), 'ELEC-CO-DET', '10.5', 'CO detector - replace', 'EA', '[{"sku": "CO-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['ELEC-SMOKE-DET'], true),

-- Plumbing - Fixtures
(gen_random_uuid(), 'PLMB-TOILET', '09.1', 'Toilet - remove & replace standard', 'EA', '[{"sku": "TOILET-STD", "qty_per_unit": 1.0}, {"sku": "WAX-RING", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 1.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-SINK-BATH', '09.1', 'Bathroom sink - remove & replace', 'EA', '[{"sku": "SINK-BATH", "qty_per_unit": 1.0}, {"sku": "FAUCET-BATH", "qty_per_unit": 1.0}, {"sku": "PTRAP", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 400.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-SINK-KITCH', '09.1', 'Kitchen sink - remove & replace', 'EA', '[{"sku": "SINK-KITCH-SS", "qty_per_unit": 1.0}, {"sku": "FAUCET-KITCH", "qty_per_unit": 1.0}, {"sku": "PTRAP", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 550.00, '[{"damage_type": "water", "surface": "kitchen"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-FAUCET-BATH', '09.1', 'Bathroom faucet - replace', 'EA', '[{"sku": "FAUCET-BATH", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-FAUCET-KITCH', '09.1', 'Kitchen faucet - replace', 'EA', '[{"sku": "FAUCET-KITCH", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 250.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Plumbing - Water Heater
(gen_random_uuid(), 'PLMB-WH-GAS', '09.2', 'Water heater 40gal gas - replace', 'EA', '[{"sku": "WH-40-GAS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 3.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1250.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-WH-ELEC', '09.2', 'Water heater 50gal electric - replace', 'EA', '[{"sku": "WH-50-ELEC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1100.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

-- Plumbing - Pipe & Valves
(gen_random_uuid(), 'PLMB-PIPE-PVC', '09.3', 'PVC pipe 2" - repair/replace', 'LF', '[{"sku": "PIPE-PVC-2", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-PIPE-COPPER', '09.3', 'Copper pipe 1" - repair/replace', 'LF', '[{"sku": "PIPE-COPPER-1", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "freeze"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-VALVE', '09.5', 'Shut-off valve - replace', 'EA', '[{"sku": "VALVE-SHUTOFF", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Ductwork
(gen_random_uuid(), 'HVAC-DUCT-FLEX6', '11.1', 'Flex duct 6" - replace', 'LF', '[{"sku": "DUCT-FLEX-6", "qty_per_unit": 1.0}, {"sku": "DUCT-TAPE", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.10, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[{"damage_type": "fire"}, {"damage_type": "water", "surface": "hvac"}]'::jsonb, ARRAY['HVAC-REGISTER'], true),

(gen_random_uuid(), 'HVAC-DUCT-RIGID6', '11.1', 'Rigid duct 6" - replace', 'LF', '[{"sku": "DUCT-RIGID-6", "qty_per_unit": 1.0}, {"sku": "MASTIC", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.20, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['HVAC-REGISTER'], true),

(gen_random_uuid(), 'HVAC-DUCT-INSUL', '11.1', 'Duct insulation wrap', 'SF', '[{"sku": "DUCT-INSUL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Registers
(gen_random_uuid(), 'HVAC-REGISTER', '11.2', 'Supply register - replace', 'EA', '[{"sku": "REGISTER-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'HVAC-RETURN', '11.2', 'Return air grille - replace', 'EA', '[{"sku": "GRILLE-RETURN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Cleaning
(gen_random_uuid(), 'HVAC-DUCT-CLEAN', '11.4', 'Duct cleaning - complete system', 'EA', '[{"sku": "HEPA-FILTER", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 4.0, "trade": "hvac"}]'::jsonb, '[{"type": "duct_cleaning_equip", "cost_per_unit": 100.00}]'::jsonb, 1.00, 350.00, '[{"damage_type": "fire"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['FIRE-HVAC-CLEAN'], true);
