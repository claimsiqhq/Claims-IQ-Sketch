-- ============================================
-- COMBINED SEED FILE FOR SUPABASE
-- Copy this entire file and paste into Supabase SQL Editor
-- ============================================

-- ============================================
-- LINE ITEM CATEGORIES
-- ============================================

INSERT INTO line_item_categories (code, name, description, parent_code, sort_order) VALUES
('01', 'General Conditions', 'Project overhead, permits, supervision', NULL, 1),
('02', 'Site Work', 'Demolition, clearing, grading', NULL, 2),
('03', 'Concrete', 'Foundations, slabs, flatwork', NULL, 3),
('04', 'Masonry', 'Brick, block, stone', NULL, 4),
('05', 'Metals', 'Structural steel, railings', NULL, 5),
('06', 'Wood & Plastics', 'Framing, trim, drywall', NULL, 6),
('07', 'Flooring', 'Carpet, hardwood, tile, vinyl', NULL, 7),
('08', 'Doors & Windows', 'Entry doors, windows, garage doors', NULL, 8),
('09', 'Finishes', 'Paint, wallpaper, specialty finishes', NULL, 9),
('10', 'Specialties', 'Cabinets, countertops, bath accessories', NULL, 10),
('11', 'Equipment', 'Appliances, HVAC equipment', NULL, 11),
('12', 'Roofing', 'Shingles, flashing, gutters', NULL, 12),
('13', 'Exterior', 'Siding, soffit, fascia', NULL, 13),
('14', 'Painting', 'Interior/exterior paint, stain', NULL, 14),
('15', 'Plumbing', 'Fixtures, piping, water heaters', NULL, 15),
('16', 'Electrical', 'Wiring, fixtures, panels', NULL, 16),
('17', 'HVAC', 'Heating, cooling, ventilation', NULL, 17),
('18', 'Insulation', 'Wall, attic, crawlspace insulation', NULL, 18),
('19', 'Water Mitigation', 'Drying, extraction, mold remediation', NULL, 19),
('20', 'Contents', 'Personal property, cleaning', NULL, 20),
('21', 'Additional Living Expense', 'Temporary housing, meals', NULL, 21)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

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
('NATIONAL', 'material_sales', 'Material Sales Tax', 0.0625, 'materials'),
('TX-DFW', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('TX-HOU', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('TX-AUS', 'material_sales', 'TX Sales Tax', 0.0825, 'materials'),
('CA-LA', 'material_sales', 'CA Sales Tax', 0.0950, 'materials'),
('CA-SF', 'material_sales', 'CA Sales Tax', 0.0875, 'materials'),
('FL-MIA', 'material_sales', 'FL Sales Tax', 0.0700, 'materials'),
('FL-ORL', 'material_sales', 'FL Sales Tax', 0.0650, 'materials'),
('NY-NYC', 'material_sales', 'NY Sales Tax', 0.0875, 'materials'),
('IL-CHI', 'material_sales', 'IL Sales Tax', 0.1025, 'materials'),
('CO-DEN', 'material_sales', 'CO Sales Tax', 0.0877, 'materials'),
('GA-ATL', 'material_sales', 'GA Sales Tax', 0.0890, 'materials')
ON CONFLICT (region_code, tax_type) DO UPDATE SET rate = EXCLUDED.rate;

-- ============================================
-- DEPRECIATION SCHEDULES
-- ============================================

INSERT INTO depreciation_schedules (category_code, item_type, useful_life_years, max_depreciation_pct, notes) VALUES
-- Roofing
('12', 'asphalt_3tab_shingle', 20, 80.00, 'Standard 3-tab shingles'),
('12', 'asphalt_laminated_shingle', 30, 80.00, 'Architectural/dimensional shingles'),
('12', 'metal_roofing', 50, 80.00, 'Standing seam or metal panels'),
('12', 'tile_roofing', 50, 80.00, 'Clay or concrete tile'),
-- Siding
('13', 'vinyl_siding', 40, 80.00, 'Vinyl siding panels'),
('13', 'fiber_cement_siding', 50, 80.00, 'HardiePlank or similar'),
('13', 'wood_siding', 30, 80.00, 'Natural wood siding'),
-- Windows & Doors
('08', 'vinyl_window', 25, 80.00, 'Standard vinyl windows'),
('08', 'wood_window', 30, 80.00, 'Wood frame windows'),
('08', 'entry_door_wood', 30, 80.00, 'Solid wood entry door'),
('08', 'garage_door', 20, 80.00, 'Garage door'),
-- Flooring
('07', 'carpet', 10, 80.00, 'Wall-to-wall carpet'),
('07', 'hardwood_flooring', 50, 80.00, 'Solid hardwood'),
('07', 'laminate_flooring', 20, 80.00, 'Laminate plank flooring'),
('07', 'lvp_flooring', 25, 80.00, 'Luxury vinyl plank'),
('07', 'ceramic_tile', 50, 80.00, 'Ceramic or porcelain tile'),
-- Painting
('14', 'interior_paint', 7, 80.00, 'Interior wall paint'),
('14', 'exterior_paint', 10, 80.00, 'Exterior paint'),
-- HVAC
('11', 'hvac_furnace', 20, 80.00, 'Gas or electric furnace'),
('11', 'hvac_ac_condenser', 15, 80.00, 'AC condenser unit'),
('11', 'water_heater_tank', 12, 80.00, 'Tank water heater')
ON CONFLICT (category_code, item_type) DO UPDATE SET useful_life_years = EXCLUDED.useful_life_years;

-- ============================================
-- LABOR RATES
-- ============================================

INSERT INTO labor_rates (trade_code, trade_name, region_code, hourly_rate, effective_date) VALUES
('GEN', 'General Labor', 'NATIONAL', 35.00, '2025-01-01'),
('CARP', 'Carpenter', 'NATIONAL', 55.00, '2025-01-01'),
('ELEC', 'Electrician', 'NATIONAL', 75.00, '2025-01-01'),
('PLMB', 'Plumber', 'NATIONAL', 75.00, '2025-01-01'),
('HVAC', 'HVAC Technician', 'NATIONAL', 80.00, '2025-01-01'),
('ROOF', 'Roofer', 'NATIONAL', 50.00, '2025-01-01'),
('PAINT', 'Painter', 'NATIONAL', 45.00, '2025-01-01'),
('TILE', 'Tile Setter', 'NATIONAL', 55.00, '2025-01-01'),
('FLOOR', 'Flooring Installer', 'NATIONAL', 50.00, '2025-01-01'),
('DRYW', 'Drywall Finisher', 'NATIONAL', 50.00, '2025-01-01'),
('DEMO', 'Demolition', 'NATIONAL', 40.00, '2025-01-01'),
('MITI', 'Mitigation Technician', 'NATIONAL', 55.00, '2025-01-01')
ON CONFLICT (trade_code, region_code) DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate;

-- ============================================
-- MATERIALS (Sample)
-- ============================================

INSERT INTO materials (code, name, category_code, unit, unit_cost, supplier) VALUES
-- Roofing Materials
('MAT-SHIN-3TAB', '3-Tab Asphalt Shingles', '12', 'SQ', 95.00, 'National'),
('MAT-SHIN-ARCH', 'Architectural Shingles', '12', 'SQ', 145.00, 'National'),
('MAT-SHIN-PREM', 'Premium Designer Shingles', '12', 'SQ', 225.00, 'National'),
('MAT-FELT-15', '15# Felt Underlayment', '12', 'SQ', 18.00, 'National'),
('MAT-FELT-30', '30# Felt Underlayment', '12', 'SQ', 28.00, 'National'),
('MAT-FLASH-AL', 'Aluminum Step Flashing', '12', 'EA', 1.50, 'National'),
('MAT-RIDGE', 'Ridge Cap Shingles', '12', 'LF', 4.50, 'National'),
('MAT-DRIP', 'Drip Edge', '12', 'LF', 1.25, 'National'),
-- Drywall
('MAT-DRY-12', '1/2" Drywall Sheet', '06', 'SF', 0.45, 'National'),
('MAT-DRY-58', '5/8" Drywall Sheet', '06', 'SF', 0.55, 'National'),
('MAT-MUD', 'Joint Compound', '06', 'GAL', 12.00, 'National'),
('MAT-TAPE', 'Drywall Tape', '06', 'RL', 4.50, 'National'),
-- Paint
('MAT-PAINT-INT', 'Interior Latex Paint', '14', 'GAL', 35.00, 'National'),
('MAT-PAINT-EXT', 'Exterior Latex Paint', '14', 'GAL', 45.00, 'National'),
('MAT-PRIMER', 'Primer', '14', 'GAL', 28.00, 'National'),
-- Flooring
('MAT-CARPET', 'Carpet (mid-grade)', '07', 'SY', 25.00, 'National'),
('MAT-PAD', 'Carpet Pad', '07', 'SY', 6.00, 'National'),
('MAT-LVP', 'Luxury Vinyl Plank', '07', 'SF', 3.50, 'National'),
('MAT-LAMINATE', 'Laminate Flooring', '07', 'SF', 2.50, 'National'),
('MAT-HARDWOOD', 'Hardwood Flooring (Oak)', '07', 'SF', 6.00, 'National')
ON CONFLICT (code) DO UPDATE SET unit_cost = EXCLUDED.unit_cost;

-- ============================================
-- DONE
-- ============================================
SELECT 'Seed data inserted successfully!' as status;
