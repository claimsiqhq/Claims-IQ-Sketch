-- Fire & Smoke Restoration Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
(gen_random_uuid(), 'FIRE-ASSESS', '04.1', 'Fire/smoke damage assessment', 'HR', '[]'::jsonb, '[{"task": "assessment", "hours_per_unit": 1.0, "trade": "specialty"}]'::jsonb, '[{"type": "moisture_meter", "cost_per_unit": 5.00}]'::jsonb, 1.00, 150.00, '[{"damage_type": "fire"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['FIRE-SOOT-DRY', 'FIRE-ODOR-FOG'], true),

(gen_random_uuid(), 'FIRE-SOOT-DRY', '04.2', 'Dry soot removal - surfaces', 'SF', '[{"sku": "SOOT-SPONGE", "qty_per_unit": 0.05}]'::jsonb, '[{"task": "soot_removal", "hours_per_unit": 0.08, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "fire", "severity": "minor"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['FIRE-SOOT-WET', 'FIRE-ODOR-SEAL'], true),

(gen_random_uuid(), 'FIRE-SOOT-WET', '04.2', 'Wet soot removal - heavy', 'SF', '[{"sku": "SOOT-SPONGE", "qty_per_unit": 0.08}, {"sku": "DEGREASER", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "soot_removal", "hours_per_unit": 0.15, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "fire", "severity": "moderate"}]'::jsonb, ARRAY['FIRE-ODOR-SEAL', 'PAINT-INT-GAL'], true),

(gen_random_uuid(), 'FIRE-SOOT-PROT', '04.2', 'Protein residue removal', 'SF', '[{"sku": "DEGREASER", "qty_per_unit": 0.03}]'::jsonb, '[{"task": "soot_removal", "hours_per_unit": 0.20, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "fire", "surface": "kitchen"}]'::jsonb, ARRAY['FIRE-ODOR-FOG', 'FIRE-ODOR-SEAL'], true),

(gen_random_uuid(), 'FIRE-ODOR-FOG', '04.3', 'Thermal fogging - odor treatment', 'SF', '[{"sku": "THERMAL-FOG", "qty_per_unit": 0.005}]'::jsonb, '[{"task": "fogging", "hours_per_unit": 0.02, "trade": "specialty"}]'::jsonb, '[{"type": "thermal_fogger", "cost_per_unit": 0.15}]'::jsonb, 1.00, 200.00, '[{"damage_type": "smoke"}, {"damage_type": "fire"}]'::jsonb, ARRAY['FIRE-ODOR-OZONE', 'FIRE-ODOR-SEAL'], true),

(gen_random_uuid(), 'FIRE-ODOR-OZONE', '04.3', 'Ozone treatment', 'DAY', '[{"sku": "OZONE-CART", "qty_per_unit": 0.1}]'::jsonb, '[{"task": "ozone_setup", "hours_per_unit": 1.0, "trade": "specialty"}]'::jsonb, '[{"type": "ozone_generator", "cost_per_unit": 75.00}]'::jsonb, 1.00, 250.00, '[{"damage_type": "smoke", "severity": "severe"}]'::jsonb, ARRAY['FIRE-ODOR-FOG'], true),

(gen_random_uuid(), 'FIRE-ODOR-SEAL', '04.3', 'Odor sealing primer application', 'SF', '[{"sku": "ODOR-SEAL", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "priming", "hours_per_unit": 0.03, "trade": "skilled"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "smoke"}, {"damage_type": "fire"}]'::jsonb, ARRAY['PAINT-INT-GAL'], true),

(gen_random_uuid(), 'FIRE-HVAC-CLEAN', '04.4', 'HVAC system cleaning - fire damage', 'EA', '[{"sku": "HEPA-FILTER", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "hvac_cleaning", "hours_per_unit": 4.0, "trade": "hvac"}]'::jsonb, '[{"type": "duct_cleaning_equip", "cost_per_unit": 150.00}]'::jsonb, 1.00, 450.00, '[{"damage_type": "fire"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['HVAC-DUCT-CLEAN'], true),

(gen_random_uuid(), 'FIRE-ELEC-CLEAN', '04.5', 'Electronics cleaning/restoration', 'EA', '[]'::jsonb, '[{"task": "electronics_cleaning", "hours_per_unit": 2.0, "trade": "specialty"}]'::jsonb, '[{"type": "ultrasonic_cleaner", "cost_per_unit": 25.00}]'::jsonb, 1.00, 150.00, '[{"damage_type": "fire"}, {"damage_type": "smoke"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'FIRE-DOC-RECOV', '04.6', 'Document/photo recovery - per box', 'EA', '[]'::jsonb, '[{"task": "document_recovery", "hours_per_unit": 3.0, "trade": "specialty"}]'::jsonb, '[{"type": "freeze_drying", "cost_per_unit": 75.00}]'::jsonb, 1.00, 250.00, '[{"damage_type": "fire"}, {"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true);
