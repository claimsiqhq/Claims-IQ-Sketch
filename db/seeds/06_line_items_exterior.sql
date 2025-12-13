-- Exterior/Siding Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Vinyl Siding
(gen_random_uuid(), 'EXT-VNL-STD', '13.1', 'Vinyl siding D4 - remove & replace', 'SQ', '[{"sku": "SIDING-VNL", "qty_per_unit": 1.0}, {"sku": "J-CHANNEL", "qty_per_unit": 12.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "general"}, {"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 8.00}]'::jsonb, 1.10, 200.00, '[{"damage_type": "wind", "surface": "exterior"}, {"damage_type": "hail", "surface": "siding"}, {"damage_type": "impact", "surface": "siding"}]'::jsonb, ARRAY['EXT-CORNER', 'EXT-JCHANNEL'], true),

(gen_random_uuid(), 'EXT-VNL-PREM', '13.1', 'Premium vinyl siding - remove & replace', 'SQ', '[{"sku": "SIDING-VNL-PREM", "qty_per_unit": 1.0}, {"sku": "J-CHANNEL", "qty_per_unit": 12.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "general"}, {"task": "install", "hours_per_unit": 1.75, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 8.00}]'::jsonb, 1.10, 250.00, '[{"damage_type": "wind", "surface": "exterior"}, {"damage_type": "hail", "surface": "siding"}]'::jsonb, ARRAY['EXT-CORNER', 'EXT-JCHANNEL'], true),

(gen_random_uuid(), 'EXT-CORNER', '13.1', 'Vinyl corner post', 'EA', '[{"sku": "CORNER-POST", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[{"damage_type": "wind", "surface": "siding"}]'::jsonb, ARRAY['EXT-VNL-STD'], true),

(gen_random_uuid(), 'EXT-JCHANNEL', '13.1', 'J-channel installation', 'LF', '[{"sku": "J-CHANNEL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.03, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 25.00, '[{"damage_type": "wind", "surface": "siding"}]'::jsonb, ARRAY['EXT-VNL-STD'], true),

-- Fiber Cement
(gen_random_uuid(), 'EXT-HARDI', '13.2', 'HardiePlank fiber cement siding - remove & replace', 'SQ', '[{"sku": "SIDING-HARDI", "qty_per_unit": 1.0}, {"sku": "HOUSEWRAP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 2.5, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 15.00}]'::jsonb, 1.10, 350.00, '[{"damage_type": "impact", "surface": "siding"}, {"damage_type": "wind", "surface": "exterior"}]'::jsonb, ARRAY['EXT-PAINT', 'EXT-CAULK'], true),

-- Wood Siding
(gen_random_uuid(), 'EXT-WOOD-LAP', '13.3', 'Wood lap siding - remove & replace', 'SQ', '[{"sku": "SIDING-WOOD-LAP", "qty_per_unit": 1.0}, {"sku": "HOUSEWRAP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 3.0, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 15.00}]'::jsonb, 1.15, 400.00, '[{"damage_type": "rot"}, {"damage_type": "impact", "surface": "siding"}]'::jsonb, ARRAY['EXT-PAINT', 'EXT-PRIME'], true),

(gen_random_uuid(), 'EXT-CEDAR', '13.3', 'Cedar siding - remove & replace', 'SQ', '[{"sku": "SIDING-WOOD-CEDAR", "qty_per_unit": 1.0}, {"sku": "HOUSEWRAP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 3.5, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 18.00}]'::jsonb, 1.15, 500.00, '[{"damage_type": "rot"}, {"damage_type": "impact", "surface": "siding"}]'::jsonb, ARRAY['EXT-STAIN'], true),

-- Stucco
(gen_random_uuid(), 'EXT-STUCCO-PATCH', '13.4', 'Stucco patch repair - small', 'SF', '[{"sku": "STUCCO-MIX", "qty_per_unit": 0.1}, {"sku": "STUCCO-FINISH", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "repair", "hours_per_unit": 0.5, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.10, 150.00, '[{"damage_type": "impact", "surface": "stucco"}]'::jsonb, ARRAY['EXT-STUCCO-PAINT'], true),

(gen_random_uuid(), 'EXT-STUCCO-FULL', '13.4', 'Stucco 3-coat system - new/replace', 'SY', '[{"sku": "LATH-METAL", "qty_per_unit": 1.0}, {"sku": "STUCCO-MIX", "qty_per_unit": 0.5}, {"sku": "STUCCO-FINISH", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.25, "trade": "general"}, {"task": "apply", "hours_per_unit": 1.5, "trade": "specialty"}]'::jsonb, '[{"type": "scaffolding", "cost_per_unit": 5.00}]'::jsonb, 1.10, 300.00, '[{"damage_type": "impact", "surface": "stucco"}, {"damage_type": "water", "surface": "exterior"}]'::jsonb, ARRAY['EXT-STUCCO-PAINT'], true),

-- Soffit & Fascia
(gen_random_uuid(), 'EXT-SOFFIT', '13.6', 'Vinyl soffit - remove & replace', 'SF', '[{"sku": "SOFFIT-VNL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "general"}, {"task": "install", "hours_per_unit": 0.08, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.25}]'::jsonb, 1.10, 75.00, '[{"damage_type": "wind", "surface": "soffit"}]'::jsonb, ARRAY['EXT-FASCIA'], true),

(gen_random_uuid(), 'EXT-FASCIA', '13.6', 'Aluminum fascia - remove & replace', 'LF', '[{"sku": "FASCIA-ALUM", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.05, "trade": "general"}, {"task": "install", "hours_per_unit": 0.10, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.50}]'::jsonb, 1.05, 75.00, '[{"damage_type": "wind", "surface": "fascia"}]'::jsonb, ARRAY['EXT-SOFFIT'], true),

-- Exterior Painting
(gen_random_uuid(), 'EXT-PAINT', '13.7', 'Exterior paint - 2 coats', 'SF', '[{"sku": "PAINT-EXT-GAL", "qty_per_unit": 0.004}, {"sku": "CAULK-EXT", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "prep", "hours_per_unit": 0.02, "trade": "general"}, {"task": "paint", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 0.10}]'::jsonb, 1.10, 150.00, '[{"damage_type": "weathering"}, {"damage_type": "fire", "surface": "exterior"}]'::jsonb, ARRAY['EXT-PRIME'], true),

(gen_random_uuid(), 'EXT-PRIME', '13.7', 'Exterior primer application', 'SF', '[{"sku": "PRIMER-EXT-GAL", "qty_per_unit": 0.003}]'::jsonb, '[{"task": "prime", "hours_per_unit": 0.02, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "bare_wood"}]'::jsonb, ARRAY['EXT-PAINT'], true),

(gen_random_uuid(), 'EXT-CAULK', '13.7', 'Exterior caulking', 'LF', '[{"sku": "CAULK-EXT", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "caulk", "hours_per_unit": 0.03, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[]'::jsonb, ARRAY['EXT-PAINT'], true);
