-- ============================================
-- COMBINED SEED FILE FOR SUPABASE (FIXED v3)
-- Uses DELETE + INSERT pattern for reliable seeding
-- Copy this entire file and paste into Supabase SQL Editor
-- ============================================

BEGIN;

-- ============================================
-- LINE ITEM CATEGORIES (id is VARCHAR primary key)
-- ============================================

DELETE FROM line_item_categories WHERE id IN (
  '01','02','03','04','05','06','07','08','09','10',
  '11','12','13','14','15','16','17','18','19','20','21'
);

INSERT INTO line_item_categories (id, parent_id, name, description, sort_order, default_coverage_code) VALUES
('01', NULL, 'General Conditions', 'Project overhead, permits, supervision', 1, 'A'),
('02', NULL, 'Site Work', 'Demolition, clearing, grading', 2, 'A'),
('03', NULL, 'Concrete', 'Foundations, slabs, flatwork', 3, 'A'),
('04', NULL, 'Masonry', 'Brick, block, stone', 4, 'A'),
('05', NULL, 'Metals', 'Structural steel, railings', 5, 'A'),
('06', NULL, 'Wood & Plastics', 'Framing, trim, drywall', 6, 'A'),
('07', NULL, 'Flooring', 'Carpet, hardwood, tile, vinyl', 7, 'A'),
('08', NULL, 'Doors & Windows', 'Entry doors, windows, garage doors', 8, 'A'),
('09', NULL, 'Finishes', 'Paint, wallpaper, specialty finishes', 9, 'A'),
('10', NULL, 'Specialties', 'Cabinets, countertops, bath accessories', 10, 'A'),
('11', NULL, 'Equipment', 'Appliances, HVAC equipment', 11, 'A'),
('12', NULL, 'Roofing', 'Shingles, flashing, gutters', 12, 'A'),
('13', NULL, 'Exterior', 'Siding, soffit, fascia', 13, 'A'),
('14', NULL, 'Painting', 'Interior/exterior paint, stain', 14, 'A'),
('15', NULL, 'Plumbing', 'Fixtures, piping, water heaters', 15, 'A'),
('16', NULL, 'Electrical', 'Wiring, fixtures, panels', 16, 'A'),
('17', NULL, 'HVAC', 'Heating, cooling, ventilation', 17, 'A'),
('18', NULL, 'Insulation', 'Wall, attic, crawlspace insulation', 18, 'A'),
('19', NULL, 'Water Mitigation', 'Drying, extraction, mold remediation', 19, 'A'),
('20', NULL, 'Contents', 'Personal property, cleaning', 20, 'C'),
('21', NULL, 'Additional Living Expense', 'Temporary housing, meals', 21, 'D');

-- ============================================
-- COVERAGE TYPES
-- ============================================

DELETE FROM coverage_types WHERE code IN ('A', 'B', 'C', 'D');

INSERT INTO coverage_types (code, name, description, sort_order) VALUES
('A', 'Coverage A - Dwelling', 'Structural damage to the insured dwelling including attached structures', 1),
('B', 'Coverage B - Other Structures', 'Detached structures like fences, sheds, detached garages, pools', 2),
('C', 'Coverage C - Personal Property', 'Contents and personal belongings inside the dwelling', 3),
('D', 'Coverage D - Loss of Use', 'Additional living expenses during repairs (ALE)', 4);

-- ============================================
-- TAX RATES
-- ============================================

DELETE FROM tax_rates WHERE region_code IN (
  'NATIONAL', 'TX-DFW', 'TX-HOU', 'TX-AUS', 'CA-LA', 'CA-SF',
  'FL-MIA', 'FL-ORL', 'NY-NYC', 'IL-CHI', 'CO-DEN', 'GA-ATL'
);

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
('GA-ATL', 'material_sales', 'GA Sales Tax', 0.0890, 'materials');

-- ============================================
-- DEPRECIATION SCHEDULES
-- ============================================

DELETE FROM depreciation_schedules WHERE category_code IN ('07', '08', '11', '12', '13', '14');

INSERT INTO depreciation_schedules (category_code, item_type, useful_life_years, max_depreciation_pct, notes) VALUES
('12', 'asphalt_3tab_shingle', 20, 80.00, 'Standard 3-tab shingles'),
('12', 'asphalt_laminated_shingle', 30, 80.00, 'Architectural/dimensional shingles'),
('12', 'metal_roofing', 50, 80.00, 'Standing seam or metal panels'),
('12', 'tile_roofing', 50, 80.00, 'Clay or concrete tile'),
('13', 'vinyl_siding', 40, 80.00, 'Vinyl siding panels'),
('13', 'fiber_cement_siding', 50, 80.00, 'HardiePlank or similar'),
('13', 'wood_siding', 30, 80.00, 'Natural wood siding'),
('08', 'vinyl_window', 25, 80.00, 'Standard vinyl windows'),
('08', 'wood_window', 30, 80.00, 'Wood frame windows'),
('08', 'entry_door_wood', 30, 80.00, 'Solid wood entry door'),
('08', 'garage_door', 20, 80.00, 'Garage door'),
('07', 'carpet', 10, 80.00, 'Wall-to-wall carpet'),
('07', 'hardwood_flooring', 50, 80.00, 'Solid hardwood'),
('07', 'laminate_flooring', 20, 80.00, 'Laminate plank flooring'),
('07', 'lvp_flooring', 25, 80.00, 'Luxury vinyl plank'),
('07', 'ceramic_tile', 50, 80.00, 'Ceramic or porcelain tile'),
('14', 'interior_paint', 7, 80.00, 'Interior wall paint'),
('14', 'exterior_paint', 10, 80.00, 'Exterior paint'),
('11', 'hvac_furnace', 20, 80.00, 'Gas or electric furnace'),
('11', 'hvac_ac_condenser', 15, 80.00, 'AC condenser unit'),
('11', 'water_heater_tank', 12, 80.00, 'Tank water heater');

-- ============================================
-- LABOR RATES
-- ============================================

DELETE FROM labor_rates WHERE trade_code IN (
  'GEN', 'CARP', 'ELEC', 'PLMB', 'HVAC', 'ROOF',
  'PAINT', 'TILE', 'FLOOR', 'DRYW', 'DEMO', 'MITI'
) AND region_code = 'NATIONAL';

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
('MITI', 'Mitigation Technician', 'NATIONAL', 55.00, '2025-01-01');

-- ============================================
-- MATERIALS
-- ============================================

DELETE FROM materials WHERE sku IN (
  'MAT-SHIN-3TAB', 'MAT-SHIN-ARCH', 'MAT-SHIN-PREM', 'MAT-FELT-15', 'MAT-FELT-30',
  'MAT-FLASH-AL', 'MAT-RIDGE', 'MAT-DRIP', 'MAT-DRY-12', 'MAT-DRY-58',
  'MAT-MUD', 'MAT-TAPE', 'MAT-PAINT-INT', 'MAT-PAINT-EXT', 'MAT-PRIMER',
  'MAT-CARPET', 'MAT-PAD', 'MAT-LVP', 'MAT-LAMINATE', 'MAT-HARDWOOD'
);

INSERT INTO materials (sku, name, description, category, unit, manufacturer) VALUES
('MAT-SHIN-3TAB', '3-Tab Asphalt Shingles', 'Standard 3-tab shingles per square', 'Roofing', 'SQ', 'GAF'),
('MAT-SHIN-ARCH', 'Architectural Shingles', 'Dimensional shingles per square', 'Roofing', 'SQ', 'GAF'),
('MAT-SHIN-PREM', 'Premium Designer Shingles', 'Designer shingles per square', 'Roofing', 'SQ', 'GAF'),
('MAT-FELT-15', '15# Felt Underlayment', 'Roof underlayment', 'Roofing', 'SQ', 'Various'),
('MAT-FELT-30', '30# Felt Underlayment', 'Heavy roof underlayment', 'Roofing', 'SQ', 'Various'),
('MAT-FLASH-AL', 'Aluminum Step Flashing', 'Step flashing pieces', 'Roofing', 'EA', 'Various'),
('MAT-RIDGE', 'Ridge Cap Shingles', 'Ridge cap per linear foot', 'Roofing', 'LF', 'GAF'),
('MAT-DRIP', 'Drip Edge', 'Drip edge per linear foot', 'Roofing', 'LF', 'Various'),
('MAT-DRY-12', '1/2 inch Drywall Sheet', 'Standard drywall', 'Drywall', 'SF', 'USG'),
('MAT-DRY-58', '5/8 inch Drywall Sheet', 'Fire-rated drywall', 'Drywall', 'SF', 'USG'),
('MAT-MUD', 'Joint Compound', 'All-purpose joint compound', 'Drywall', 'GAL', 'USG'),
('MAT-TAPE', 'Drywall Tape', 'Paper joint tape', 'Drywall', 'RL', 'Various'),
('MAT-PAINT-INT', 'Interior Latex Paint', 'Interior wall paint', 'Paint', 'GAL', 'Sherwin-Williams'),
('MAT-PAINT-EXT', 'Exterior Latex Paint', 'Exterior house paint', 'Paint', 'GAL', 'Sherwin-Williams'),
('MAT-PRIMER', 'Primer', 'Multi-surface primer', 'Paint', 'GAL', 'Kilz'),
('MAT-CARPET', 'Carpet mid-grade', 'Residential carpet', 'Flooring', 'SY', 'Shaw'),
('MAT-PAD', 'Carpet Pad', '8lb carpet padding', 'Flooring', 'SY', 'Various'),
('MAT-LVP', 'Luxury Vinyl Plank', 'LVP flooring', 'Flooring', 'SF', 'LifeProof'),
('MAT-LAMINATE', 'Laminate Flooring', 'Laminate plank', 'Flooring', 'SF', 'Pergo'),
('MAT-HARDWOOD', 'Hardwood Flooring Oak', 'Solid oak hardwood', 'Flooring', 'SF', 'Bruce');

COMMIT;

SELECT 'Seed data inserted successfully!' as status;
