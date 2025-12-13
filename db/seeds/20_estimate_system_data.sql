-- Complete Estimate System Seed Data
-- Claims IQ Sketch - Carrier-Ready Estimate Generation System
-- =============================================================

-- ============================================
-- PRICE LISTS
-- ============================================

INSERT INTO price_lists (code, name, region_code, effective_date, source) VALUES
('NATL_DEC25', 'National Baseline - December 2025', 'NATIONAL', '2025-12-01', 'internal'),
('TXDFW_DEC25', 'Texas - Dallas/Fort Worth - December 2025', 'TX-DFW', '2025-12-01', 'internal'),
('TXHOU_DEC25', 'Texas - Houston - December 2025', 'TX-HOU', '2025-12-01', 'internal'),
('CALA_DEC25', 'California - Los Angeles - December 2025', 'CA-LA', '2025-12-01', 'internal'),
('FLMIA_DEC25', 'Florida - Miami - December 2025', 'FL-MIA', '2025-12-01', 'internal')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, effective_date = EXCLUDED.effective_date;

-- ============================================
-- COVERAGE TYPES
-- ============================================

INSERT INTO coverage_types (code, name, description, sort_order) VALUES
('A', 'Coverage A - Dwelling', 'Structural damage to the insured dwelling including attached structures', 1),
('B', 'Coverage B - Other Structures', 'Detached structures like fences, sheds, detached garages, pools', 2),
('C', 'Coverage C - Personal Property', 'Contents and personal belongings inside the dwelling', 3),
('D', 'Coverage D - Loss of Use', 'Additional living expenses during repairs (ALE)', 4)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- ============================================
-- TAX RATES
-- ============================================

INSERT INTO tax_rates (region_code, tax_type, tax_name, rate, applies_to) VALUES
-- National baseline
('NATIONAL', 'material_sales', 'Material Sales Tax', 0.0625, 'materials'),

-- Texas regions
('TX-DFW', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('TX-HOU', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('TX-AUS', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('TX-SAT', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),

-- California
('CA-LA', 'material_sales', 'CA Sales Tax', 0.0950, 'materials'),
('CA-SF', 'material_sales', 'CA Sales Tax', 0.0875, 'materials'),
('CA-SD', 'material_sales', 'CA Sales Tax', 0.0775, 'materials'),

-- Florida
('FL-MIA', 'material_sales', 'FL Sales Tax', 0.0700, 'materials'),
('FL-ORL', 'material_sales', 'FL Sales Tax', 0.0650, 'materials'),
('FL-TPA', 'material_sales', 'FL Sales Tax', 0.0750, 'materials'),

-- Other states
('NY-NYC', 'material_sales', 'NY Sales Tax', 0.0875, 'materials'),
('IL-CHI', 'material_sales', 'IL Sales Tax', 0.1025, 'materials'),
('CO-DEN', 'material_sales', 'CO Sales Tax', 0.0877, 'materials'),
('WA-SEA', 'material_sales', 'WA Sales Tax', 0.1025, 'materials'),
('AZ-PHX', 'material_sales', 'AZ Sales Tax', 0.0560, 'materials'),
('GA-ATL', 'material_sales', 'GA Sales Tax', 0.0890, 'materials'),
('NC-CLT', 'material_sales', 'NC Sales Tax', 0.0725, 'materials'),
('MO-STL', 'material_sales', 'MO Sales Tax', 0.0635, 'materials'),
('MO-KC', 'material_sales', 'MO Sales Tax', 0.0600, 'materials')
ON CONFLICT (region_code, tax_type) DO UPDATE SET rate = EXCLUDED.rate;

-- ============================================
-- DEPRECIATION SCHEDULES
-- ============================================

INSERT INTO depreciation_schedules (category_code, item_type, useful_life_years, max_depreciation_pct, notes) VALUES
-- Roofing (Category 12)
('12', 'asphalt_3tab_shingle', 20, 80.00, 'Standard 3-tab shingles'),
('12', 'asphalt_laminated_shingle', 30, 80.00, 'Architectural/dimensional shingles'),
('12', 'asphalt_premium_shingle', 40, 80.00, 'Premium/designer shingles'),
('12', 'metal_roofing', 50, 80.00, 'Standing seam or metal panels'),
('12', 'tile_roofing', 50, 80.00, 'Clay or concrete tile'),
('12', 'flat_roof_membrane', 20, 80.00, 'TPO, EPDM, modified bitumen'),
('12', 'roof_underlayment', 30, 80.00, 'Matches shingle life'),
('12', 'roof_flashing', 30, 80.00, 'Step, valley, drip edge'),
('12', 'gutters_aluminum', 25, 80.00, 'Aluminum gutters and downspouts'),
('12', 'gutters_copper', 50, 80.00, 'Copper gutters'),

-- Siding (Category 13)
('13', 'vinyl_siding', 40, 80.00, 'Vinyl siding panels'),
('13', 'fiber_cement_siding', 50, 80.00, 'HardiePlank or similar'),
('13', 'wood_siding', 30, 80.00, 'Natural wood siding'),
('13', 'aluminum_siding', 40, 80.00, 'Aluminum siding'),
('13', 'stucco', 50, 80.00, 'Traditional or EIFS stucco'),
('13', 'brick_veneer', 75, 80.00, 'Brick facade'),

-- Windows & Doors (Category 08)
('08', 'vinyl_window', 25, 80.00, 'Standard vinyl windows'),
('08', 'wood_window', 30, 80.00, 'Wood frame windows'),
('08', 'aluminum_window', 25, 80.00, 'Aluminum frame windows'),
('08', 'entry_door_wood', 30, 80.00, 'Solid wood entry door'),
('08', 'entry_door_fiberglass', 30, 80.00, 'Fiberglass entry door'),
('08', 'entry_door_steel', 25, 80.00, 'Steel entry door'),
('08', 'garage_door', 20, 80.00, 'Garage door'),
('08', 'sliding_glass_door', 25, 80.00, 'Patio sliding door'),
('08', 'interior_door', 50, 80.00, 'Interior passage doors'),

-- Drywall & Interior (Category 06)
('06', 'drywall', 50, 80.00, 'Interior drywall'),
('06', 'plaster', 75, 80.00, 'Traditional plaster walls'),

-- Flooring (Category 07)
('07', 'carpet', 10, 80.00, 'Wall-to-wall carpet'),
('07', 'carpet_pad', 10, 80.00, 'Carpet padding'),
('07', 'hardwood_flooring', 50, 80.00, 'Solid hardwood'),
('07', 'engineered_hardwood', 30, 80.00, 'Engineered wood flooring'),
('07', 'laminate_flooring', 20, 80.00, 'Laminate plank flooring'),
('07', 'lvp_flooring', 25, 80.00, 'Luxury vinyl plank'),
('07', 'ceramic_tile', 50, 80.00, 'Ceramic or porcelain tile'),
('07', 'vinyl_sheet', 15, 80.00, 'Sheet vinyl'),

-- Painting (Category 14)
('14', 'interior_paint', 7, 80.00, 'Interior wall paint'),
('14', 'exterior_paint', 10, 80.00, 'Exterior paint'),

-- HVAC (Category 11)
('11', 'hvac_furnace', 20, 80.00, 'Gas or electric furnace'),
('11', 'hvac_ac_condenser', 15, 80.00, 'AC condenser unit'),
('11', 'hvac_heat_pump', 15, 80.00, 'Heat pump system'),
('11', 'water_heater_tank', 12, 80.00, 'Tank water heater'),
('11', 'water_heater_tankless', 20, 80.00, 'Tankless water heater'),
('11', 'ductwork', 40, 80.00, 'HVAC ductwork'),

-- Electrical (Category 10)
('10', 'electrical_panel', 40, 80.00, 'Main electrical panel'),
('10', 'electrical_wiring', 50, 80.00, 'House wiring'),
('10', 'lighting_fixtures', 20, 80.00, 'Light fixtures'),

-- Plumbing (Category 09)
('09', 'plumbing_fixtures', 25, 80.00, 'Sinks, faucets, toilets'),
('09', 'plumbing_pipes_copper', 50, 80.00, 'Copper supply lines'),
('09', 'plumbing_pipes_pex', 50, 80.00, 'PEX supply lines'),

-- Cabinets & Countertops (Category 08)
('08', 'cabinets_wood', 30, 80.00, 'Wood cabinets'),
('08', 'cabinets_laminate', 20, 80.00, 'Laminate cabinets'),
('08', 'countertop_granite', 30, 80.00, 'Granite countertops'),
('08', 'countertop_laminate', 15, 80.00, 'Laminate countertops'),
('08', 'countertop_quartz', 30, 80.00, 'Quartz countertops'),

-- Appliances (Coverage C items)
('99', 'appliance_refrigerator', 15, 80.00, 'Refrigerator'),
('99', 'appliance_range', 15, 80.00, 'Stove/range'),
('99', 'appliance_dishwasher', 12, 80.00, 'Dishwasher'),
('99', 'appliance_washer', 12, 80.00, 'Washing machine'),
('99', 'appliance_dryer', 15, 80.00, 'Dryer'),
('99', 'appliance_microwave', 10, 80.00, 'Microwave'),

-- Fencing (Category 32 - Coverage B)
('32', 'fence_wood', 15, 80.00, 'Wood privacy fence'),
('32', 'fence_chain_link', 20, 80.00, 'Chain link fence'),
('32', 'fence_vinyl', 25, 80.00, 'Vinyl fence'),
('32', 'fence_wrought_iron', 40, 80.00, 'Wrought iron fence'),

-- Insulation (Category 05)
('05', 'insulation_batt', 50, 80.00, 'Fiberglass batt insulation'),
('05', 'insulation_blown', 50, 80.00, 'Blown-in insulation'),
('05', 'insulation_spray_foam', 75, 80.00, 'Spray foam insulation'),

-- Water Mitigation (Category 01) - Generally not depreciated
('01', 'water_mitigation', 0, 0.00, 'Emergency services - no depreciation'),

-- Fire/Smoke (Category 04) - Generally not depreciated
('04', 'fire_restoration', 0, 0.00, 'Fire restoration services - no depreciation'),

-- Demolition (Category 02) - Generally not depreciated
('02', 'demolition', 0, 0.00, 'Demo work - no depreciation')

ON CONFLICT (category_code, item_type) DO UPDATE SET
  useful_life_years = EXCLUDED.useful_life_years,
  max_depreciation_pct = EXCLUDED.max_depreciation_pct,
  notes = EXCLUDED.notes;

-- ============================================
-- REGIONAL MULTIPLIERS
-- ============================================

INSERT INTO regional_multipliers (region_code, region_name, material_multiplier, labor_multiplier, equipment_multiplier) VALUES
('NATIONAL', 'National Average', 1.0000, 1.0000, 1.0000),
('TX-DFW', 'Texas - Dallas/Fort Worth', 0.98, 0.95, 0.97),
('TX-HOU', 'Texas - Houston', 1.00, 0.97, 0.98),
('TX-AUS', 'Texas - Austin', 1.02, 1.00, 1.00),
('TX-SAT', 'Texas - San Antonio', 0.96, 0.93, 0.95),
('CA-LA', 'California - Los Angeles', 1.15, 1.35, 1.20),
('CA-SF', 'California - San Francisco', 1.20, 1.50, 1.25),
('CA-SD', 'California - San Diego', 1.12, 1.30, 1.18),
('NY-NYC', 'New York - New York City', 1.25, 1.45, 1.30),
('FL-MIA', 'Florida - Miami', 1.08, 1.10, 1.05),
('FL-ORL', 'Florida - Orlando', 1.02, 1.00, 1.00),
('FL-TPA', 'Florida - Tampa', 1.00, 0.98, 0.98),
('CO-DEN', 'Colorado - Denver', 1.05, 1.10, 1.05),
('IL-CHI', 'Illinois - Chicago', 1.10, 1.25, 1.15),
('WA-SEA', 'Washington - Seattle', 1.12, 1.30, 1.15),
('AZ-PHX', 'Arizona - Phoenix', 1.00, 0.95, 0.98),
('GA-ATL', 'Georgia - Atlanta', 1.02, 1.00, 1.00),
('NC-CLT', 'North Carolina - Charlotte', 0.98, 0.95, 0.97),
('MO-STL', 'Missouri - St. Louis', 0.95, 0.98, 0.96),
('MO-KC', 'Missouri - Kansas City', 0.94, 0.96, 0.95),
('NV-LV', 'Nevada - Las Vegas', 1.05, 1.05, 1.02),
('PA-PHL', 'Pennsylvania - Philadelphia', 1.08, 1.15, 1.10),
('MA-BOS', 'Massachusetts - Boston', 1.15, 1.35, 1.20),
('MI-DET', 'Michigan - Detroit', 0.98, 1.00, 0.98),
('OH-CLE', 'Ohio - Cleveland', 0.96, 0.98, 0.96),
('MN-MSP', 'Minnesota - Minneapolis', 1.02, 1.05, 1.02)
ON CONFLICT (region_code) DO UPDATE SET
  material_multiplier = EXCLUDED.material_multiplier,
  labor_multiplier = EXCLUDED.labor_multiplier,
  equipment_multiplier = EXCLUDED.equipment_multiplier;

-- ============================================
-- LABOR RATES BY TRADE
-- ============================================

INSERT INTO labor_rates_enhanced (trade_code, trade_name, base_hourly_rate, region_code) VALUES
-- National baseline rates
('GEN', 'General Labor', 35.00, 'NATIONAL'),
('CARP', 'Carpenter', 55.00, 'NATIONAL'),
('ROOF', 'Roofer', 60.00, 'NATIONAL'),
('ELEC', 'Electrician', 85.00, 'NATIONAL'),
('PLMB', 'Plumber', 85.00, 'NATIONAL'),
('HVAC', 'HVAC Technician', 80.00, 'NATIONAL'),
('PAINT', 'Painter', 45.00, 'NATIONAL'),
('DRYWALL', 'Drywall Installer/Finisher', 50.00, 'NATIONAL'),
('FLOOR', 'Flooring Installer', 55.00, 'NATIONAL'),
('MASON', 'Mason', 65.00, 'NATIONAL'),
('SIDING', 'Siding Installer', 55.00, 'NATIONAL'),
('GLASS', 'Glazier', 60.00, 'NATIONAL'),
('INSUL', 'Insulation Installer', 45.00, 'NATIONAL'),
('DEMO', 'Demolition', 40.00, 'NATIONAL'),
('MITI', 'Water Mitigation Tech', 55.00, 'NATIONAL'),
('FENCE', 'Fence Installer', 50.00, 'NATIONAL'),
('TILE', 'Tile Setter', 60.00, 'NATIONAL'),
('CAB', 'Cabinet Installer', 55.00, 'NATIONAL'),
('FIRE', 'Fire Restoration Tech', 55.00, 'NATIONAL'),
('CLEAN', 'Cleaning Specialist', 40.00, 'NATIONAL')
ON CONFLICT (trade_code, region_code) DO UPDATE SET
  base_hourly_rate = EXCLUDED.base_hourly_rate,
  trade_name = EXCLUDED.trade_name;

-- ============================================
-- ENHANCED CARRIER PROFILES
-- ============================================

-- Update existing carrier profiles with O&P rules
UPDATE carrier_profiles SET
  op_threshold = 0.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'DEFAULT';

UPDATE carrier_profiles SET
  op_threshold = 1000.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'STATEFARM';

UPDATE carrier_profiles SET
  op_threshold = 2500.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'ALLSTATE';

UPDATE carrier_profiles SET
  op_threshold = 0.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'USAA';

UPDATE carrier_profiles SET
  op_threshold = 1500.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'FARMERS';

UPDATE carrier_profiles SET
  op_threshold = 2000.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'LIBERTY';

UPDATE carrier_profiles SET
  op_threshold = 1000.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'PROGRESSIVE';

UPDATE carrier_profiles SET
  op_threshold = 1500.00,
  op_trade_minimum = 3,
  tax_on_materials_only = true,
  depreciation_method = 'straight_line',
  max_depreciation_pct = 80.00
WHERE code = 'TRAVELERS';

-- Insert additional carrier profiles
INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos, op_threshold, op_trade_minimum, tax_on_materials_only, depreciation_method, max_depreciation_pct, is_active)
SELECT gen_random_uuid(), 'Nationwide', 'NATIONWIDE', 10.00, 10.00, false, true, 1000.00, 3, true, 'straight_line', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'NATIONWIDE');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos, op_threshold, op_trade_minimum, tax_on_materials_only, depreciation_method, max_depreciation_pct, is_active)
SELECT gen_random_uuid(), 'Amica', 'AMICA', 10.00, 10.00, false, true, 0.00, 2, true, 'straight_line', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'AMICA');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos, op_threshold, op_trade_minimum, tax_on_materials_only, depreciation_method, max_depreciation_pct, is_active)
SELECT gen_random_uuid(), 'Hartford', 'HARTFORD', 10.00, 10.00, false, true, 1500.00, 3, true, 'straight_line', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'HARTFORD');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos, op_threshold, op_trade_minimum, tax_on_materials_only, depreciation_method, max_depreciation_pct, is_active)
SELECT gen_random_uuid(), 'American Family', 'AMFAM', 10.00, 10.00, false, true, 1000.00, 3, true, 'straight_line', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'AMFAM');

INSERT INTO carrier_profiles (id, name, code, overhead_pct, profit_pct, applies_tax, requires_photos, op_threshold, op_trade_minimum, tax_on_materials_only, depreciation_method, max_depreciation_pct, is_active)
SELECT gen_random_uuid(), 'Auto-Owners', 'AUTOOWNERS', 10.00, 10.00, false, true, 500.00, 3, true, 'straight_line', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM carrier_profiles WHERE code = 'AUTOOWNERS');

-- ============================================
-- UPDATE LINE ITEM CATEGORIES WITH COVERAGE DEFAULTS
-- ============================================

UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '01%'; -- Water Mitigation
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '02%'; -- Demolition
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '03%'; -- Drywall
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '04%'; -- Fire/Smoke
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '05%'; -- Insulation
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '06%'; -- Drywall/Plaster
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '07%'; -- Flooring
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '08%'; -- Windows/Doors
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '09%'; -- Plumbing
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '10%'; -- Electrical
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '11%'; -- HVAC
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '12%'; -- Roofing
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '13%'; -- Exterior/Siding
UPDATE line_item_categories SET default_coverage_code = 'A' WHERE id LIKE '14%'; -- Painting
UPDATE line_item_categories SET default_coverage_code = 'B' WHERE id LIKE '32%'; -- Fencing (Other Structures)

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$ BEGIN RAISE NOTICE 'Estimate system seed data loaded successfully!'; END $$;
