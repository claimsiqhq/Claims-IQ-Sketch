-- Cabinets & Countertops Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Base Cabinets
(gen_random_uuid(), 'CAB-BASE-STD', '08.7', 'Base cabinet standard grade - replace', 'LF', '[{"sku": "CAB-BASE-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "general"}, {"task": "install", "hours_per_unit": 0.75, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, '[{"damage_type": "water", "surface": "kitchen"}, {"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['CAB-WALL-STD', 'CTOP-LAM'], true),

(gen_random_uuid(), 'CAB-BASE-PREM', '08.7', 'Base cabinet premium grade - replace', 'LF', '[{"sku": "CAB-BASE-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "general"}, {"task": "install", "hours_per_unit": 1.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 500.00, '[{"damage_type": "water", "surface": "kitchen"}, {"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['CAB-WALL-PREM', 'CTOP-GRANITE'], true),

-- Wall Cabinets  
(gen_random_uuid(), 'CAB-WALL-STD', '08.8', 'Wall cabinet standard grade - replace', 'LF', '[{"sku": "CAB-WALL-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.20, "trade": "general"}, {"task": "install", "hours_per_unit": 0.65, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 275.00, '[{"damage_type": "water", "surface": "kitchen"}, {"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['CAB-BASE-STD'], true),

(gen_random_uuid(), 'CAB-WALL-PREM', '08.8', 'Wall cabinet premium grade - replace', 'LF', '[{"sku": "CAB-WALL-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.20, "trade": "general"}, {"task": "install", "hours_per_unit": 0.85, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 425.00, '[{"damage_type": "water", "surface": "kitchen"}, {"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['CAB-BASE-PREM'], true),

-- Countertops
(gen_random_uuid(), 'CTOP-LAM', '08.9', 'Laminate countertop - remove & replace', 'SF', '[{"sku": "CTOP-LAM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "general"}, {"task": "install", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, '[{"damage_type": "water", "surface": "countertop"}, {"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['PLMB-SINK-KITCH'], true),

(gen_random_uuid(), 'CTOP-GRANITE', '08.9', 'Granite countertop - remove & replace', 'SF', '[{"sku": "CTOP-GRANITE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "general"}, {"task": "install", "hours_per_unit": 0.25, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.05, 500.00, '[{"damage_type": "impact", "surface": "countertop"}]'::jsonb, ARRAY['PLMB-SINK-KITCH'], true),

(gen_random_uuid(), 'CTOP-QUARTZ', '08.9', 'Quartz countertop - remove & replace', 'SF', '[{"sku": "CTOP-QUARTZ", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "general"}, {"task": "install", "hours_per_unit": 0.25, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.05, 550.00, '[{"damage_type": "impact", "surface": "countertop"}]'::jsonb, ARRAY['PLMB-SINK-KITCH'], true),

(gen_random_uuid(), 'CTOP-SOLID', '08.9', 'Solid surface countertop - remove & replace', 'SF', '[{"sku": "CTOP-SOLID", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.06, "trade": "general"}, {"task": "install", "hours_per_unit": 0.20, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.05, 400.00, '[{"damage_type": "impact", "surface": "countertop"}]'::jsonb, ARRAY['PLMB-SINK-KITCH'], true),

-- Cabinet Hardware
(gen_random_uuid(), 'CAB-PULL-STD', '08.10', 'Cabinet pull standard - replace', 'EA', '[{"sku": "PULL-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 15.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CAB-PULL-PREM', '08.10', 'Cabinet pull premium - replace', 'EA', '[{"sku": "PULL-PREM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 25.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'CAB-HINGE', '08.10', 'Cabinet hinge - replace', 'EA', '[{"sku": "HINGE-CAB", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 18.00, '[]'::jsonb, ARRAY[]::text[], true);
