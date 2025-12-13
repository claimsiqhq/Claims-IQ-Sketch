-- Insulation Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Batt Insulation
(gen_random_uuid(), 'INSUL-BATT-R13', '05.1', 'Batt insulation R-13 wall - install', 'SF', '[{"sku": "INSUL-R13", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 50.00, '[{"damage_type": "water", "surface": "insulation"}, {"damage_type": "fire", "surface": "wall"}]'::jsonb, ARRAY['DRY-HTT-12', 'INSUL-VAPOR'], true),

(gen_random_uuid(), 'INSUL-BATT-R19', '05.1', 'Batt insulation R-19 floor/wall - install', 'SF', '[{"sku": "INSUL-R19", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.025, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 60.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY['DRY-HTT-12', 'INSUL-VAPOR'], true),

(gen_random_uuid(), 'INSUL-BATT-R30', '05.1', 'Batt insulation R-30 attic - install', 'SF', '[{"sku": "INSUL-R30", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 75.00, '[{"damage_type": "water", "surface": "insulation"}, {"damage_type": "fire", "surface": "attic"}]'::jsonb, ARRAY['INSUL-VAPOR'], true),

(gen_random_uuid(), 'INSUL-BATT-R38', '05.1', 'Batt insulation R-38 attic - install', 'SF', '[{"sku": "INSUL-R38", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.035, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 85.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY['INSUL-VAPOR'], true),

(gen_random_uuid(), 'INSUL-BATT-REMOVE', '05.1', 'Batt insulation removal - wet/contaminated', 'SF', '[]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.03, "trade": "general"}]'::jsonb, '[{"type": "disposal", "cost_per_unit": 0.15}]'::jsonb, 1.00, 50.00, '[{"damage_type": "water", "surface": "insulation"}]'::jsonb, ARRAY['INSUL-BATT-R13', 'INSUL-BATT-R19'], true),

-- Blown Insulation
(gen_random_uuid(), 'INSUL-BLOWN-CEIL', '05.2', 'Blown cellulose insulation - attic', 'SF', '[{"sku": "INSUL-BLOWN", "qty_per_unit": 0.15}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.015, "trade": "general"}]'::jsonb, '[{"type": "blowing_machine", "cost_per_unit": 0.08}]'::jsonb, 1.05, 100.00, '[{"damage_type": "fire", "surface": "attic"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'INSUL-BLOWN-WALL', '05.2', 'Blown insulation - wall cavity', 'SF', '[{"sku": "INSUL-BLOWN", "qty_per_unit": 0.12}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "blowing_machine", "cost_per_unit": 0.10}]'::jsonb, 1.05, 125.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'INSUL-BLOWN-REMOVE', '05.2', 'Blown insulation removal - attic', 'SF', '[]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[{"type": "vacuum_equip", "cost_per_unit": 0.12}, {"type": "disposal", "cost_per_unit": 0.10}]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "insulation"}, {"damage_type": "fire", "surface": "attic"}]'::jsonb, ARRAY['INSUL-BLOWN-CEIL'], true),

-- Spray Foam
(gen_random_uuid(), 'INSUL-FOAM-OPEN', '05.3', 'Open cell spray foam insulation', 'BF', '[{"sku": "FOAM-OPEN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.008, "trade": "specialty"}]'::jsonb, '[{"type": "spray_rig", "cost_per_unit": 0.15}]'::jsonb, 1.00, 300.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'INSUL-FOAM-CLOSED', '05.3', 'Closed cell spray foam insulation', 'BF', '[{"sku": "FOAM-CLOSED", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.012, "trade": "specialty"}]'::jsonb, '[{"type": "spray_rig", "cost_per_unit": 0.25}]'::jsonb, 1.00, 400.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Vapor Barrier
(gen_random_uuid(), 'INSUL-VAPOR', '05.4', 'Vapor barrier 6mil poly - install', 'SF', '[{"sku": "VAPOR-BARR", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.01, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 35.00, '[{"damage_type": "water", "surface": "crawlspace"}]'::jsonb, ARRAY['INSUL-BATT-R19'], true),

(gen_random_uuid(), 'INSUL-VAPOR-CRAWL', '05.4', 'Crawlspace vapor barrier complete', 'SF', '[{"sku": "VAPOR-BARR", "qty_per_unit": 1.1}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.01, "trade": "general"}, {"task": "install", "hours_per_unit": 0.02, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.15, 75.00, '[{"damage_type": "water", "surface": "crawlspace"}]'::jsonb, ARRAY[]::text[], true);
