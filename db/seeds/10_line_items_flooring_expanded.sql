-- Expanded Flooring Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Ceramic/Porcelain Tile
(gen_random_uuid(), 'FLR-TILE-CER', '07.3', 'Ceramic tile flooring - remove & replace', 'SF', '[{"sku": "TILE-CER-STD", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.02}, {"sku": "GROUT", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.06, "trade": "general"}, {"task": "install", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.15, 150.00, '[{"damage_type": "water", "surface": "floor"}, {"damage_type": "impact", "surface": "tile"}]'::jsonb, ARRAY['FLR-BACKER', 'FLR-GROUT'], true),

(gen_random_uuid(), 'FLR-TILE-PORC', '07.3', 'Porcelain tile flooring - remove & replace', 'SF', '[{"sku": "TILE-PORC", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.02}, {"sku": "GROUT", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.06, "trade": "general"}, {"task": "install", "hours_per_unit": 0.18, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.15, 175.00, '[{"damage_type": "water", "surface": "floor"}, {"damage_type": "impact", "surface": "tile"}]'::jsonb, ARRAY['FLR-BACKER', 'FLR-GROUT'], true),

(gen_random_uuid(), 'FLR-TILE-LG', '07.3', 'Large format porcelain tile - remove & replace', 'SF', '[{"sku": "TILE-PORC-LG", "qty_per_unit": 1.0}, {"sku": "THINSET", "qty_per_unit": 0.025}, {"sku": "GROUT", "qty_per_unit": 0.03}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "general"}, {"task": "install", "hours_per_unit": 0.22, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.10, 200.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-BACKER'], true),

(gen_random_uuid(), 'FLR-BACKER', '07.3', 'Cement backer board - install', 'SF', '[{"sku": "BACKER-BD", "qty_per_unit": 0.0625}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-TILE-CER', 'FLR-TILE-PORC'], true),

(gen_random_uuid(), 'FLR-GROUT', '07.3', 'Tile grout - remove & replace', 'SF', '[{"sku": "GROUT", "qty_per_unit": 0.08}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.08, "trade": "general"}, {"task": "install", "hours_per_unit": 0.05, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "tile"}]'::jsonb, ARRAY[]::text[], true),

-- Laminate
(gen_random_uuid(), 'FLR-LAM-STD', '07.5', 'Laminate flooring standard - remove & replace', 'SF', '[{"sku": "LAM-STD", "qty_per_unit": 1.0}, {"sku": "UNDERLAY-LAM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.02, "trade": "general"}, {"task": "install", "hours_per_unit": 0.06, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-TRANS-T'], true),

(gen_random_uuid(), 'FLR-LAM-PREM', '07.5', 'Laminate flooring premium - remove & replace', 'SF', '[{"sku": "LAM-PREM", "qty_per_unit": 1.0}, {"sku": "UNDERLAY-LAM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.02, "trade": "general"}, {"task": "install", "hours_per_unit": 0.08, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 125.00, '[{"damage_type": "water", "surface": "floor"}]'::jsonb, ARRAY['FLR-TRANS-T'], true),

-- Hardwood Refinishing
(gen_random_uuid(), 'FLR-HW-SAND', '07.6', 'Hardwood floor sand and refinish', 'SF', '[{"sku": "SAND-PAPER", "qty_per_unit": 0.02}, {"sku": "POLY-FLOOR", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "sand", "hours_per_unit": 0.04, "trade": "specialty"}, {"task": "finish", "hours_per_unit": 0.03, "trade": "specialty"}]'::jsonb, '[{"type": "floor_sander", "cost_per_unit": 0.25}]'::jsonb, 1.00, 250.00, '[{"damage_type": "water", "surface": "hardwood"}, {"damage_type": "wear"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FLR-HW-STAIN', '07.6', 'Hardwood floor stain application', 'SF', '[{"sku": "STAIN-FLOOR", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "stain", "hours_per_unit": 0.02, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[]'::jsonb, ARRAY['FLR-HW-SAND'], true),

(gen_random_uuid(), 'FLR-HW-SCREEN', '07.6', 'Hardwood floor screen and recoat', 'SF', '[{"sku": "POLY-FLOOR", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "screen", "hours_per_unit": 0.02, "trade": "specialty"}, {"task": "coat", "hours_per_unit": 0.015, "trade": "specialty"}]'::jsonb, '[{"type": "floor_buffer", "cost_per_unit": 0.10}]'::jsonb, 1.00, 175.00, '[{"damage_type": "wear"}]'::jsonb, ARRAY[]::text[], true),

-- Subfloor
(gen_random_uuid(), 'FLR-SUBFL-PLY', '07.7', 'Plywood subfloor 3/4" - replace', 'SF', '[{"sku": "SUBFL-PLY", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.03, "trade": "general"}, {"task": "install", "hours_per_unit": 0.04, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "surface": "subfloor"}, {"damage_type": "rot"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FLR-SUBFL-OSB', '07.7', 'OSB subfloor 3/4" - replace', 'SF', '[{"sku": "SUBFL-OSB", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.03, "trade": "general"}, {"task": "install", "hours_per_unit": 0.035, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 85.00, '[{"damage_type": "water", "surface": "subfloor"}, {"damage_type": "rot"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FLR-SUBFL-REPAIR', '07.7', 'Subfloor repair - patch', 'SF', '[]'::jsonb, '[{"task": "repair", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "water", "surface": "subfloor"}]'::jsonb, ARRAY[]::text[], true),

-- Floor Transitions
(gen_random_uuid(), 'FLR-TRANS-T', '07.8', 'T-molding transition strip', 'LF', '[{"sku": "TRANS-T-MOLD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 25.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FLR-TRANS-RED', '07.8', 'Reducer transition strip', 'LF', '[{"sku": "TRANS-REDUCER", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 30.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FLR-THRESH', '07.8', 'Threshold - replace', 'EA', '[{"sku": "TRANS-THRESH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[]'::jsonb, ARRAY[]::text[], true);
