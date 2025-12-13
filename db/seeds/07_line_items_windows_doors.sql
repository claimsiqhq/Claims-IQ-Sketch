-- Windows & Doors Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Window Replacement
(gen_random_uuid(), 'WIN-VNL-SM', '08.1', 'Vinyl window single-hung 24x36 - replace', 'EA', '[{"sku": "WIN-VNL-SH", "qty_per_unit": 1.0}, {"sku": "CAULK-EXT", "qty_per_unit": 0.5}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "general"}, {"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, '[{"damage_type": "impact", "surface": "window"}, {"damage_type": "wind", "surface": "window"}]'::jsonb, ARRAY['WIN-TRIM-INT', 'EXT-CAULK'], true),

(gen_random_uuid(), 'WIN-VNL-MD', '08.1', 'Vinyl window double-hung 30x48 - replace', 'EA', '[{"sku": "WIN-VNL-DH", "qty_per_unit": 1.0}, {"sku": "CAULK-EXT", "qty_per_unit": 0.75}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "general"}, {"task": "install", "hours_per_unit": 2.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 450.00, '[{"damage_type": "impact", "surface": "window"}, {"damage_type": "wind", "surface": "window"}]'::jsonb, ARRAY['WIN-TRIM-INT', 'EXT-CAULK'], true),

(gen_random_uuid(), 'WIN-VNL-LG', '08.1', 'Vinyl window double-hung 36x60 - replace', 'EA', '[{"sku": "WIN-VNL-LG", "qty_per_unit": 1.0}, {"sku": "CAULK-EXT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "general"}, {"task": "install", "hours_per_unit": 2.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 550.00, '[{"damage_type": "impact", "surface": "window"}, {"damage_type": "wind", "surface": "window"}]'::jsonb, ARRAY['WIN-TRIM-INT', 'EXT-CAULK'], true),

(gen_random_uuid(), 'WIN-WOOD-DH', '08.1', 'Wood window double-hung 30x48 - replace', 'EA', '[{"sku": "WIN-WOOD-DH", "qty_per_unit": 1.0}, {"sku": "CAULK-EXT", "qty_per_unit": 0.75}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "general"}, {"task": "install", "hours_per_unit": 3.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 650.00, '[{"damage_type": "impact", "surface": "window"}]'::jsonb, ARRAY['WIN-TRIM-INT', 'PAINT-INT-GAL'], true),

-- Window Repair
(gen_random_uuid(), 'WIN-GLASS', '08.2', 'Window glass replacement - insulated', 'SF', '[{"sku": "GLASS-INSUL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "replace_glass", "hours_per_unit": 0.5, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.05, 150.00, '[{"damage_type": "impact", "surface": "window"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WIN-GLASS-TEMP', '08.2', 'Window glass replacement - tempered', 'SF', '[{"sku": "GLASS-TEMP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "replace_glass", "hours_per_unit": 0.5, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.05, 175.00, '[{"damage_type": "impact", "surface": "window"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'WIN-SASH', '08.2', 'Window sash repair/replace', 'EA', '[]'::jsonb, '[{"task": "repair", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 150.00, '[{"damage_type": "rot", "surface": "window"}]'::jsonb, ARRAY[]::text[], true),

-- Exterior Doors
(gen_random_uuid(), 'DOOR-EXT-STEEL', '08.3', 'Steel entry door - replace', 'EA', '[{"sku": "DOOR-EXT-STEEL", "qty_per_unit": 1.0}, {"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}, {"sku": "DEADBOLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "general"}, {"task": "install", "hours_per_unit": 3.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 600.00, '[{"damage_type": "impact", "surface": "door"}, {"damage_type": "forced_entry"}]'::jsonb, ARRAY['DOOR-FRAME', 'DOOR-HDWE'], true),

(gen_random_uuid(), 'DOOR-EXT-FIBER', '08.3', 'Fiberglass entry door - replace', 'EA', '[{"sku": "DOOR-EXT-FIBER", "qty_per_unit": 1.0}, {"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}, {"sku": "DEADBOLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "general"}, {"task": "install", "hours_per_unit": 3.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 750.00, '[{"damage_type": "impact", "surface": "door"}]'::jsonb, ARRAY['DOOR-FRAME', 'DOOR-HDWE'], true),

(gen_random_uuid(), 'DOOR-SLIDE', '08.3', 'Sliding glass door 6ft - replace', 'EA', '[{"sku": "DOOR-SLIDE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "general"}, {"task": "install", "hours_per_unit": 4.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 950.00, '[{"damage_type": "impact", "surface": "door"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DOOR-FRENCH', '08.3', 'French door pair - replace', 'EA', '[{"sku": "DOOR-FRENCH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.5, "trade": "general"}, {"task": "install", "hours_per_unit": 5.0, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 1500.00, '[{"damage_type": "impact", "surface": "door"}]'::jsonb, ARRAY[]::text[], true),

-- Interior Doors
(gen_random_uuid(), 'DOOR-INT-HC', '08.4', 'Interior door hollow core - replace', 'EA', '[{"sku": "DOOR-INT-HC", "qty_per_unit": 1.0}, {"sku": "HINGES-3PK", "qty_per_unit": 1.0}, {"sku": "LOCKSET-PASS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "general"}, {"task": "install", "hours_per_unit": 1.25, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[{"damage_type": "impact", "surface": "door"}, {"damage_type": "water", "surface": "door"}]'::jsonb, ARRAY['PAINT-DOOR'], true),

(gen_random_uuid(), 'DOOR-INT-SC', '08.4', 'Interior door solid core - replace', 'EA', '[{"sku": "DOOR-INT-SC", "qty_per_unit": 1.0}, {"sku": "HINGES-3PK", "qty_per_unit": 1.0}, {"sku": "LOCKSET-PASS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.25, "trade": "general"}, {"task": "install", "hours_per_unit": 1.5, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 275.00, '[{"damage_type": "impact", "surface": "door"}]'::jsonb, ARRAY['PAINT-DOOR'], true),

-- Door Hardware
(gen_random_uuid(), 'DOOR-HDWE-ENTRY', '08.5', 'Entry lockset with deadbolt', 'EA', '[{"sku": "LOCKSET-ENTRY", "qty_per_unit": 1.0}, {"sku": "DEADBOLT", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "forced_entry"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DOOR-HDWE-PASS', '08.5', 'Passage lockset', 'EA', '[{"sku": "LOCKSET-PASS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 50.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DOOR-HINGES', '08.5', 'Door hinges - set of 3', 'EA', '[{"sku": "HINGES-3PK", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Garage Doors
(gen_random_uuid(), 'DOOR-GARAGE-1', '08.6', 'Garage door single 9x7 - replace', 'EA', '[{"sku": "DOOR-GARAGE-1", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "general"}, {"task": "install", "hours_per_unit": 4.0, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 950.00, '[{"damage_type": "impact", "surface": "garage_door"}, {"damage_type": "wind", "surface": "garage_door"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'DOOR-GARAGE-2', '08.6', 'Garage door double 16x7 - replace', 'EA', '[{"sku": "DOOR-GARAGE-2", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.5, "trade": "general"}, {"task": "install", "hours_per_unit": 6.0, "trade": "specialty"}]'::jsonb, '[]'::jsonb, 1.00, 1650.00, '[{"damage_type": "impact", "surface": "garage_door"}, {"damage_type": "wind", "surface": "garage_door"}]'::jsonb, ARRAY[]::text[], true);
