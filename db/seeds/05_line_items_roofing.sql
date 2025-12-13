-- Roofing Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Shingle Roofing
(gen_random_uuid(), 'ROOF-SHNG-3TAB', '12.1', 'Roofing - 3-tab shingles - remove & replace', 'SQ', '[{"sku": "SHNG-3TAB-BDL", "qty_per_unit": 3.0}, {"sku": "FELT-15", "qty_per_unit": 1.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 2.5}, {"sku": "STARTR-STRIP", "qty_per_unit": 0.33}]'::jsonb, '[{"task": "tear_off", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 1.25, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 12.00}, {"type": "debris_container", "cost_per_unit": 20.00}]'::jsonb, 1.10, 300.00, '[{"damage_type": "wind", "surface": "roof"}, {"damage_type": "hail", "surface": "roof"}]'::jsonb, ARRAY['ROOF-FELT-15', 'ROOF-RIDGE', 'DEM-HAUL'], true),

(gen_random_uuid(), 'ROOF-SHNG-ARCH', '12.1', 'Roofing - Architectural shingles - remove & replace', 'SQ', '[{"sku": "SHNG-ARCH-BDL", "qty_per_unit": 3.0}, {"sku": "FELT-SYN", "qty_per_unit": 1.0}, {"sku": "NAILS-ROOF", "qty_per_unit": 2.5}, {"sku": "STARTR-STRIP", "qty_per_unit": 0.33}, {"sku": "RIDGE-CAP", "qty_per_unit": 0.2}]'::jsonb, '[{"task": "tear_off", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 15.00}, {"type": "debris_container", "cost_per_unit": 25.00}]'::jsonb, 1.10, 350.00, '[{"damage_type": "wind", "surface": "roof"}, {"damage_type": "hail", "surface": "roof"}, {"damage_type": "impact", "surface": "roof"}]'::jsonb, ARRAY['ROOF-FELT-SYN', 'ROOF-FLASH-STEP', 'ROOF-VENT-RIDGE', 'DEM-HAUL'], true),

(gen_random_uuid(), 'ROOF-SHNG-PREM', '12.1', 'Roofing - Premium designer shingles - remove & replace', 'SQ', '[{"sku": "SHNG-PREM-BDL", "qty_per_unit": 3.0}, {"sku": "FELT-SYN", "qty_per_unit": 1.0}, {"sku": "ICE-WATER", "qty_per_unit": 0.5}, {"sku": "NAILS-ROOF", "qty_per_unit": 2.5}, {"sku": "STARTR-STRIP", "qty_per_unit": 0.33}, {"sku": "RIDGE-CAP", "qty_per_unit": 0.25}]'::jsonb, '[{"task": "tear_off", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 2.0, "trade": "skilled"}]'::jsonb, '[{"type": "ladder_scaffolding", "cost_per_unit": 18.00}, {"type": "debris_container", "cost_per_unit": 25.00}]'::jsonb, 1.10, 450.00, '[{"damage_type": "wind", "surface": "roof"}, {"damage_type": "hail", "surface": "roof"}]'::jsonb, ARRAY['ROOF-FELT-SYN', 'ROOF-ICE-WATER', 'ROOF-FLASH-STEP'], true),

-- Underlayment
(gen_random_uuid(), 'ROOF-FELT-15', '12.2', 'Roofing felt 15# underlayment', 'SQ', '[{"sku": "FELT-15", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-3TAB'], true),

(gen_random_uuid(), 'ROOF-FELT-SYN', '12.2', 'Synthetic underlayment', 'SQ', '[{"sku": "FELT-SYN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true),

(gen_random_uuid(), 'ROOF-ICE-WATER', '12.2', 'Ice & water shield membrane', 'SQ', '[{"sku": "ICE-WATER", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 100.00, '[{"damage_type": "ice_dam"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH', 'ROOF-SHNG-PREM'], true),

-- Flashing
(gen_random_uuid(), 'ROOF-FLASH-STEP', '12.3', 'Step flashing installation', 'LF', '[{"sku": "FLASH-STEP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.15, 75.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true),

(gen_random_uuid(), 'ROOF-FLASH-VALLEY', '12.3', 'Valley flashing installation', 'LF', '[{"sku": "FLASH-VALLEY", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.20, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true),

(gen_random_uuid(), 'ROOF-DRIP-EDGE', '12.3', 'Drip edge installation', 'LF', '[{"sku": "DRIP-EDGE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 50.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH', 'ROOF-SHNG-3TAB'], true),

-- Ventilation
(gen_random_uuid(), 'ROOF-VENT-RIDGE', '12.4', 'Ridge vent installation', 'LF', '[{"sku": "VENT-RIDGE", "qty_per_unit": 1.0}, {"sku": "RIDGE-CAP", "qty_per_unit": 0.03}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.05, 100.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true),

(gen_random_uuid(), 'ROOF-VENT-BOX', '12.4', 'Box vent installation', 'EA', '[{"sku": "VENT-BOX", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "wind", "surface": "roof"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ROOF-VENT-SOFFIT', '12.4', 'Soffit vent installation', 'EA', '[{"sku": "VENT-SOFFIT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Gutters
(gen_random_uuid(), 'ROOF-GUTTER', '12.5', 'Aluminum gutter 5" - install', 'LF', '[{"sku": "GUTTER-ALUM", "qty_per_unit": 1.0}, {"sku": "GUTTER-HANGER", "qty_per_unit": 0.33}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.12, "trade": "skilled"}]'::jsonb, '[{"type": "ladder", "cost_per_unit": 0.50}]'::jsonb, 1.05, 150.00, '[{"damage_type": "wind"}, {"damage_type": "ice_dam"}]'::jsonb, ARRAY['ROOF-DOWNSPOUT'], true),

(gen_random_uuid(), 'ROOF-DOWNSPOUT', '12.5', 'Downspout 2x3" - install', 'LF', '[{"sku": "DOWNSPOUT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.10, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.05, 75.00, '[{"damage_type": "wind"}]'::jsonb, ARRAY['ROOF-GUTTER'], true),

-- Decking
(gen_random_uuid(), 'ROOF-DECK-PLY', '12.7', 'Roof decking plywood 1/2" CDX - replace', 'SF', '[{"sku": "DECK-PLY", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.02, "trade": "general"}, {"task": "install", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "surface": "roof"}, {"damage_type": "rot"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true),

(gen_random_uuid(), 'ROOF-DECK-OSB', '12.7', 'Roof decking OSB 7/16" - replace', 'SF', '[{"sku": "DECK-OSB", "qty_per_unit": 0.03125}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.02, "trade": "general"}, {"task": "install", "hours_per_unit": 0.025, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "water", "surface": "roof"}, {"damage_type": "rot"}]'::jsonb, ARRAY['ROOF-SHNG-ARCH'], true);
