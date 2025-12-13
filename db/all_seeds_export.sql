-- Expanded Line Item Categories
-- Run after initial seed to add new categories

-- Fire & Smoke Restoration
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('04', NULL, 'Fire & Smoke Restoration', 'Fire damage cleanup and restoration', 4),
('04.1', '04', 'Smoke Damage Assessment', 'Smoke and soot damage evaluation', 1),
('04.2', '04', 'Soot Removal', 'Dry soot, wet soot, protein residue cleaning', 2),
('04.3', '04', 'Odor Control', 'Thermal fogging, ozone, hydroxyl treatment', 3),
('04.4', '04', 'HVAC Cleaning', 'Duct and system cleaning after fire', 4),
('04.5', '04', 'Electronics Cleaning', 'Electronic equipment restoration', 5),
('04.6', '04', 'Document Recovery', 'Document and photo recovery services', 6)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Insulation
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('05', NULL, 'Insulation', 'Thermal and moisture insulation', 5),
('05.1', '05', 'Batt Insulation', 'Fiberglass and mineral wool batts', 1),
('05.2', '05', 'Blown Insulation', 'Loose-fill cellulose and fiberglass', 2),
('05.3', '05', 'Spray Foam', 'Open and closed cell spray foam', 3),
('05.4', '05', 'Vapor Barrier', 'Moisture and vapor barriers', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Windows & Doors (Category 08)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('08', NULL, 'Windows & Doors', 'Window and door replacement and repair', 8),
('08.1', '08', 'Window Replacement', 'Full window unit replacement', 1),
('08.2', '08', 'Window Repair', 'Glass, sash, and hardware repair', 2),
('08.3', '08', 'Exterior Doors', 'Entry, sliding, and French doors', 3),
('08.4', '08', 'Interior Doors', 'Interior passage and specialty doors', 4),
('08.5', '08', 'Door Hardware', 'Locks, hinges, and hardware', 5),
('08.6', '08', 'Garage Doors', 'Garage door systems', 6),
('08.7', '08', 'Base Cabinets', 'Kitchen and bath base cabinets', 7),
('08.8', '08', 'Wall Cabinets', 'Kitchen and bath wall cabinets', 8),
('08.9', '08', 'Countertops', 'Laminate, granite, quartz, solid surface', 9),
('08.10', '08', 'Cabinet Hardware', 'Pulls, hinges, and accessories', 10)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Plumbing (Category 09)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('09', NULL, 'Plumbing', 'Plumbing fixtures and repairs', 9),
('09.1', '09', 'Fixture Replacement', 'Toilets, sinks, faucets', 1),
('09.2', '09', 'Water Heater', 'Water heater repair and replacement', 2),
('09.3', '09', 'Pipe Repair', 'Pipe repair and replacement', 3),
('09.4', '09', 'Drain Cleaning', 'Drain cleaning and clearing', 4),
('09.5', '09', 'Shut-off Valves', 'Valve installation and repair', 5)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Electrical (Category 10)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('10', NULL, 'Electrical', 'Electrical systems and fixtures', 10),
('10.1', '10', 'Outlets & Switches', 'Receptacles and switches', 1),
('10.2', '10', 'Lighting Fixtures', 'Light fixture installation', 2),
('10.3', '10', 'Ceiling Fans', 'Ceiling fan installation', 3),
('10.4', '10', 'Panel & Breaker', 'Electrical panel work', 4),
('10.5', '10', 'Smoke/CO Detectors', 'Safety detector installation', 5),
('10.6', '10', 'Low Voltage', 'Doorbell, thermostat wiring', 6)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- HVAC (Category 11)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('11', NULL, 'HVAC', 'Heating, ventilation, air conditioning', 11),
('11.1', '11', 'Ductwork', 'Flex, rigid, and insulated duct', 1),
('11.2', '11', 'Registers & Grilles', 'Vents and registers', 2),
('11.3', '11', 'HVAC Equipment', 'Units and equipment', 3),
('11.4', '11', 'Duct Cleaning', 'Duct cleaning services', 4)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Roofing (Category 12)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('12', NULL, 'Roofing', 'Roof systems and components', 12),
('12.1', '12', 'Shingle Roofing', '3-tab, architectural, premium shingles', 1),
('12.2', '12', 'Underlayment', 'Felt and synthetic underlayment', 2),
('12.3', '12', 'Flashing', 'Step, valley, chimney, vent flashing', 3),
('12.4', '12', 'Ventilation', 'Ridge, box, and soffit vents', 4),
('12.5', '12', 'Gutters & Downspouts', 'Rain gutter systems', 5),
('12.6', '12', 'Skylights', 'Skylight installation and repair', 6),
('12.7', '12', 'Roof Decking', 'Decking repair and replacement', 7)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Exterior/Siding (Category 13)
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('13', NULL, 'Exterior & Siding', 'Exterior cladding and finishes', 13),
('13.1', '13', 'Vinyl Siding', 'Vinyl siding installation', 1),
('13.2', '13', 'Fiber Cement', 'HardiePlank and fiber cement', 2),
('13.3', '13', 'Wood Siding', 'Wood lap and board siding', 3),
('13.4', '13', 'Stucco', 'Stucco application and repair', 4),
('13.5', '13', 'Brick Veneer', 'Brick veneer repair', 5),
('13.6', '13', 'Soffit & Fascia', 'Soffit and fascia systems', 6),
('13.7', '13', 'Exterior Painting', 'Exterior paint and coatings', 7)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Expanded Flooring subcategories
INSERT INTO line_item_categories (id, parent_id, name, description, sort_order) VALUES
('07.3', '07', 'Ceramic/Porcelain Tile', 'Tile flooring installation', 3),
('07.5', '07', 'Laminate', 'Laminate flooring', 5),
('07.6', '07', 'Hardwood Refinishing', 'Hardwood floor refinishing', 6),
('07.7', '07', 'Subfloor', 'Subfloor repair and replacement', 7),
('07.8', '07', 'Floor Transitions', 'Transition strips and thresholds', 8)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
-- Expanded Materials for Line Items
-- Run after categories to add all materials needed

-- Roofing Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'SHNG-3TAB-BDL', '3-Tab shingles bundle', 'EA', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'SHNG-ARCH-BDL', 'Architectural shingles bundle', 'EA', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'SHNG-PREM-BDL', 'Premium designer shingles bundle', 'EA', 75.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-15', 'Roofing felt 15#', 'ROLL', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-30', 'Roofing felt 30#', 'ROLL', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'FELT-SYN', 'Synthetic underlayment', 'ROLL', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'NAILS-ROOF', 'Roofing nails 1.25"', 'LB', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'STARTR-STRIP', 'Starter strip shingles', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'RIDGE-CAP', 'Ridge cap shingles', 'BDL', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'FLASH-ALUM', 'Aluminum flashing roll', 'ROLL', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'FLASH-STEP', 'Step flashing', 'EA', 1.25, 'baseline_2024'),
(gen_random_uuid(), 'FLASH-VALLEY', 'Valley flashing roll', 'ROLL', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'VENT-RIDGE', 'Ridge vent', 'LF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'VENT-BOX', 'Box vent', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'VENT-SOFFIT', 'Soffit vent', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'DECK-PLY', 'Roof decking plywood 1/2" CDX', 'EA', 42.00, 'baseline_2024'),
(gen_random_uuid(), 'DECK-OSB', 'Roof decking OSB 7/16"', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'ICE-WATER', 'Ice & water shield', 'ROLL', 95.00, 'baseline_2024'),
(gen_random_uuid(), 'DRIP-EDGE', 'Drip edge aluminum', 'LF', 1.20, 'baseline_2024'),
(gen_random_uuid(), 'GUTTER-ALUM', 'Aluminum gutter 5"', 'LF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'DOWNSPOUT', 'Downspout 2x3"', 'LF', 3.25, 'baseline_2024'),
(gen_random_uuid(), 'GUTTER-HANGER', 'Gutter hanger', 'EA', 1.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Exterior/Siding Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'SIDING-VNL', 'Vinyl siding D4', 'SQ', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-VNL-PREM', 'Premium vinyl siding', 'SQ', 125.00, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-HARDI', 'HardiePlank fiber cement', 'SQ', 195.00, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-WOOD-LAP', 'Wood lap siding', 'SQ', 275.00, 'baseline_2024'),
(gen_random_uuid(), 'SIDING-WOOD-CEDAR', 'Cedar siding', 'SQ', 425.00, 'baseline_2024'),
(gen_random_uuid(), 'HOUSEWRAP', 'House wrap', 'ROLL', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'J-CHANNEL', 'J-channel vinyl', 'LF', 0.85, 'baseline_2024'),
(gen_random_uuid(), 'CORNER-POST', 'Vinyl corner post', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'SOFFIT-VNL', 'Vinyl soffit panel', 'SF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'FASCIA-ALUM', 'Aluminum fascia', 'LF', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'STUCCO-MIX', 'Stucco base coat', 'BAG', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'STUCCO-FINISH', 'Stucco finish coat', 'BAG', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'LATH-METAL', 'Metal lath', 'SY', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'PAINT-EXT-GAL', 'Exterior paint gallon', 'GAL', 48.00, 'baseline_2024'),
(gen_random_uuid(), 'PRIMER-EXT-GAL', 'Exterior primer gallon', 'GAL', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'CAULK-EXT', 'Exterior caulk', 'TUBE', 6.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Window & Door Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'WIN-VNL-SH', 'Vinyl window single-hung 24x36', 'EA', 185.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-VNL-DH', 'Vinyl window double-hung 30x48', 'EA', 245.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-VNL-LG', 'Vinyl window double-hung 36x60', 'EA', 325.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-WOOD-DH', 'Wood window double-hung 30x48', 'EA', 485.00, 'baseline_2024'),
(gen_random_uuid(), 'WIN-ALUM-SL', 'Aluminum sliding window', 'EA', 195.00, 'baseline_2024'),
(gen_random_uuid(), 'GLASS-TEMP', 'Tempered glass pane', 'SF', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'GLASS-INSUL', 'Insulated glass unit', 'SF', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-STEEL', 'Steel entry door', 'EA', 285.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-FIBER', 'Fiberglass entry door', 'EA', 425.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-EXT-WOOD', 'Wood entry door', 'EA', 650.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-SLIDE', 'Sliding glass door 6ft', 'EA', 725.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-FRENCH', 'French door pair', 'EA', 1150.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-INT-HC', 'Interior door hollow core', 'EA', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-INT-SC', 'Interior door solid core', 'EA', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-GARAGE-1', 'Garage door single 9x7', 'EA', 685.00, 'baseline_2024'),
(gen_random_uuid(), 'DOOR-GARAGE-2', 'Garage door double 16x7', 'EA', 1250.00, 'baseline_2024'),
(gen_random_uuid(), 'LOCKSET-ENTRY', 'Entry lockset', 'EA', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'LOCKSET-PASS', 'Passage lockset', 'EA', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'DEADBOLT', 'Deadbolt', 'EA', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'HINGES-3PK', 'Door hinges 3-pack', 'EA', 12.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Fire & Smoke Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'SOOT-SPONGE', 'Dry soot sponge', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'DEGREASER', 'Smoke degreaser gallon', 'GAL', 28.00, 'baseline_2024'),
(gen_random_uuid(), 'ODOR-SEAL', 'Odor sealing primer', 'GAL', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'THERMAL-FOG', 'Thermal fogging solution', 'GAL', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'HEPA-FILTER', 'HEPA filter replacement', 'EA', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'OZONE-CART', 'Ozone treatment cartridge', 'EA', 125.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Electrical Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'OUTLET-STD', 'Standard duplex outlet', 'EA', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'OUTLET-GFI', 'GFCI outlet', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'OUTLET-USB', 'USB outlet combo', 'EA', 25.00, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-STD', 'Standard toggle switch', 'EA', 2.50, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-DIM', 'Dimmer switch', 'EA', 22.00, 'baseline_2024'),
(gen_random_uuid(), 'SWITCH-3WAY', '3-way switch', 'EA', 5.50, 'baseline_2024'),
(gen_random_uuid(), 'BOX-ELEC', 'Electrical box', 'EA', 2.00, 'baseline_2024'),
(gen_random_uuid(), 'COVER-PLATE', 'Cover plate', 'EA', 1.50, 'baseline_2024'),
(gen_random_uuid(), 'WIRE-14-2', 'Romex 14/2 wire', 'LF', 0.65, 'baseline_2024'),
(gen_random_uuid(), 'WIRE-12-2', 'Romex 12/2 wire', 'LF', 0.85, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-STD', 'Standard light fixture', 'EA', 45.00, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-FLUSH', 'Flush mount fixture', 'EA', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'LIGHT-RECESS', 'Recessed light can', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'FAN-CEIL', 'Ceiling fan', 'EA', 125.00, 'baseline_2024'),
(gen_random_uuid(), 'SMOKE-DET', 'Smoke detector', 'EA', 25.00, 'baseline_2024'),
(gen_random_uuid(), 'CO-DET', 'CO detector', 'EA', 35.00, 'baseline_2024'),
(gen_random_uuid(), 'BREAKER-SP', 'Single pole breaker', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'BREAKER-DP', 'Double pole breaker', 'EA', 18.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Plumbing Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'TOILET-STD', 'Standard toilet', 'EA', 175.00, 'baseline_2024'),
(gen_random_uuid(), 'TOILET-ELON', 'Elongated toilet', 'EA', 225.00, 'baseline_2024'),
(gen_random_uuid(), 'SINK-BATH', 'Bathroom sink', 'EA', 85.00, 'baseline_2024'),
(gen_random_uuid(), 'SINK-KITCH-SS', 'Kitchen sink stainless', 'EA', 185.00, 'baseline_2024'),
(gen_random_uuid(), 'FAUCET-BATH', 'Bathroom faucet', 'EA', 75.00, 'baseline_2024'),
(gen_random_uuid(), 'FAUCET-KITCH', 'Kitchen faucet', 'EA', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'WH-40-GAS', 'Water heater 40gal gas', 'EA', 650.00, 'baseline_2024'),
(gen_random_uuid(), 'WH-50-ELEC', 'Water heater 50gal electric', 'EA', 550.00, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PVC-2', 'PVC pipe 2"', 'LF', 2.50, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-COPPER-1', 'Copper pipe 1"', 'LF', 8.50, 'baseline_2024'),
(gen_random_uuid(), 'PIPE-PEX-1', 'PEX pipe 1"', 'LF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'VALVE-SHUTOFF', 'Shut-off valve', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'PTRAP', 'P-trap', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'WAX-RING', 'Toilet wax ring', 'EA', 5.00, 'baseline_2024'),
(gen_random_uuid(), 'SUPPLY-LINE', 'Supply line braided', 'EA', 8.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- HVAC Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'DUCT-FLEX-6', 'Flex duct 6"', 'LF', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-FLEX-8', 'Flex duct 8"', 'LF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-RIGID-6', 'Rigid duct 6"', 'LF', 6.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-BOARD', 'Duct board', 'SF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'REGISTER-STD', 'Standard register', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'GRILLE-RETURN', 'Return air grille', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-TAPE', 'Aluminum duct tape', 'ROLL', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'MASTIC', 'Duct mastic', 'GAL', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'DUCT-INSUL', 'Duct insulation wrap', 'ROLL', 45.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Insulation Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'INSUL-R13', 'Batt insulation R-13', 'SF', 0.55, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R19', 'Batt insulation R-19', 'SF', 0.75, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R30', 'Batt insulation R-30', 'SF', 1.10, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-R38', 'Batt insulation R-38', 'SF', 1.35, 'baseline_2024'),
(gen_random_uuid(), 'INSUL-BLOWN', 'Blown cellulose per bag', 'BAG', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'FOAM-OPEN', 'Open cell spray foam', 'BF', 0.45, 'baseline_2024'),
(gen_random_uuid(), 'FOAM-CLOSED', 'Closed cell spray foam', 'BF', 1.25, 'baseline_2024'),
(gen_random_uuid(), 'VAPOR-BARR', 'Vapor barrier 6mil', 'SF', 0.12, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Cabinet & Countertop Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'CAB-BASE-STD', 'Base cabinet standard', 'LF', 185.00, 'baseline_2024'),
(gen_random_uuid(), 'CAB-BASE-PREM', 'Base cabinet premium', 'LF', 325.00, 'baseline_2024'),
(gen_random_uuid(), 'CAB-WALL-STD', 'Wall cabinet standard', 'LF', 145.00, 'baseline_2024'),
(gen_random_uuid(), 'CAB-WALL-PREM', 'Wall cabinet premium', 'LF', 265.00, 'baseline_2024'),
(gen_random_uuid(), 'CTOP-LAM', 'Laminate countertop', 'SF', 25.00, 'baseline_2024'),
(gen_random_uuid(), 'CTOP-GRANITE', 'Granite countertop', 'SF', 65.00, 'baseline_2024'),
(gen_random_uuid(), 'CTOP-QUARTZ', 'Quartz countertop', 'SF', 75.00, 'baseline_2024'),
(gen_random_uuid(), 'CTOP-SOLID', 'Solid surface countertop', 'SF', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'PULL-STD', 'Cabinet pull standard', 'EA', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'PULL-PREM', 'Cabinet pull premium', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'HINGE-CAB', 'Cabinet hinge', 'EA', 3.50, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Additional Flooring Materials
INSERT INTO materials (id, sku, name, unit, base_price, price_source) VALUES
(gen_random_uuid(), 'TILE-CER-STD', 'Ceramic tile standard', 'SF', 3.50, 'baseline_2024'),
(gen_random_uuid(), 'TILE-PORC', 'Porcelain tile', 'SF', 5.50, 'baseline_2024'),
(gen_random_uuid(), 'TILE-PORC-LG', 'Large format porcelain', 'SF', 7.50, 'baseline_2024'),
(gen_random_uuid(), 'GROUT', 'Tile grout', 'LB', 1.25, 'baseline_2024'),
(gen_random_uuid(), 'THINSET', 'Thinset mortar', 'BAG', 15.00, 'baseline_2024'),
(gen_random_uuid(), 'BACKER-BD', 'Cement backer board', 'EA', 12.00, 'baseline_2024'),
(gen_random_uuid(), 'LAM-STD', 'Laminate flooring standard', 'SF', 2.25, 'baseline_2024'),
(gen_random_uuid(), 'LAM-PREM', 'Laminate flooring premium', 'SF', 3.75, 'baseline_2024'),
(gen_random_uuid(), 'UNDERLAY-LAM', 'Laminate underlayment', 'SF', 0.35, 'baseline_2024'),
(gen_random_uuid(), 'SUBFL-PLY', 'Subfloor plywood 3/4"', 'EA', 48.00, 'baseline_2024'),
(gen_random_uuid(), 'SUBFL-OSB', 'Subfloor OSB 3/4"', 'EA', 32.00, 'baseline_2024'),
(gen_random_uuid(), 'TRANS-T-MOLD', 'T-molding transition', 'LF', 4.50, 'baseline_2024'),
(gen_random_uuid(), 'TRANS-REDUCER', 'Reducer transition', 'LF', 5.50, 'baseline_2024'),
(gen_random_uuid(), 'TRANS-THRESH', 'Threshold transition', 'EA', 18.00, 'baseline_2024'),
(gen_random_uuid(), 'SAND-PAPER', 'Floor sanding paper', 'EA', 8.00, 'baseline_2024'),
(gen_random_uuid(), 'POLY-FLOOR', 'Polyurethane floor finish', 'GAL', 55.00, 'baseline_2024'),
(gen_random_uuid(), 'STAIN-FLOOR', 'Floor stain', 'GAL', 42.00, 'baseline_2024')
ON CONFLICT (sku) DO UPDATE SET base_price = EXCLUDED.base_price;
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
-- MEP (Mechanical/Electrical/Plumbing) Line Items

INSERT INTO line_items (id, code, category_id, description, unit, material_components, labor_components, equipment_components, waste_factor, minimum_charge, scope_triggers, related_items, is_active) VALUES
-- Electrical - Outlets & Switches
(gen_random_uuid(), 'ELEC-OUTLET-STD', '10.1', 'Standard duplex outlet - replace', 'EA', '[{"sku": "OUTLET-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "electrical"}, {"damage_type": "water", "surface": "outlet"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-OUTLET-GFI', '10.1', 'GFCI outlet - replace', 'EA', '[{"sku": "OUTLET-GFI", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 95.00, '[{"damage_type": "electrical"}, {"damage_type": "water", "surface": "outlet"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SWITCH', '10.1', 'Standard switch - replace', 'EA', '[{"sku": "SWITCH-STD", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 65.00, '[{"damage_type": "electrical"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SWITCH-DIM', '10.1', 'Dimmer switch - install', 'EA', '[{"sku": "SWITCH-DIM", "qty_per_unit": 1.0}, {"sku": "COVER-PLATE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Electrical - Lighting
(gen_random_uuid(), 'ELEC-LIGHT-STD', '10.2', 'Standard light fixture - replace', 'EA', '[{"sku": "LIGHT-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 100.00, '[{"damage_type": "water", "surface": "ceiling"}, {"damage_type": "electrical"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-LIGHT-FLUSH', '10.2', 'Flush mount fixture - replace', 'EA', '[{"sku": "LIGHT-FLUSH", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-LIGHT-RECESS', '10.2', 'Recessed light can - replace', 'EA', '[{"sku": "LIGHT-RECESS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 135.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY['DRY-HTT-12'], true),

(gen_random_uuid(), 'ELEC-FAN', '10.3', 'Ceiling fan - replace', 'EA', '[{"sku": "FAN-CEIL", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 185.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

-- Electrical - Panel & Safety
(gen_random_uuid(), 'ELEC-BREAKER-SP', '10.4', 'Single pole breaker - replace', 'EA', '[{"sku": "BREAKER-SP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "electrical"}, {"damage_type": "surge"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-BREAKER-DP', '10.4', 'Double pole breaker - replace', 'EA', '[{"sku": "BREAKER-DP", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.75, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 125.00, '[{"damage_type": "electrical"}, {"damage_type": "surge"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'ELEC-SMOKE-DET', '10.5', 'Smoke detector - replace', 'EA', '[{"sku": "SMOKE-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 75.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['ELEC-CO-DET'], true),

(gen_random_uuid(), 'ELEC-CO-DET', '10.5', 'CO detector - replace', 'EA', '[{"sku": "CO-DET", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "electrical"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['ELEC-SMOKE-DET'], true),

-- Plumbing - Fixtures
(gen_random_uuid(), 'PLMB-TOILET', '09.1', 'Toilet - remove & replace standard', 'EA', '[{"sku": "TOILET-STD", "qty_per_unit": 1.0}, {"sku": "WAX-RING", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 1.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 350.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-SINK-BATH', '09.1', 'Bathroom sink - remove & replace', 'EA', '[{"sku": "SINK-BATH", "qty_per_unit": 1.0}, {"sku": "FAUCET-BATH", "qty_per_unit": 1.0}, {"sku": "PTRAP", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.5, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 400.00, '[{"damage_type": "water", "surface": "bathroom"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-SINK-KITCH', '09.1', 'Kitchen sink - remove & replace', 'EA', '[{"sku": "SINK-KITCH-SS", "qty_per_unit": 1.0}, {"sku": "FAUCET-KITCH", "qty_per_unit": 1.0}, {"sku": "PTRAP", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 0.75, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 550.00, '[{"damage_type": "water", "surface": "kitchen"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-FAUCET-BATH', '09.1', 'Bathroom faucet - replace', 'EA', '[{"sku": "FAUCET-BATH", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 175.00, '[]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-FAUCET-KITCH', '09.1', 'Kitchen faucet - replace', 'EA', '[{"sku": "FAUCET-KITCH", "qty_per_unit": 1.0}, {"sku": "SUPPLY-LINE", "qty_per_unit": 2.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 1.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 250.00, '[]'::jsonb, ARRAY[]::text[], true),

-- Plumbing - Water Heater
(gen_random_uuid(), 'PLMB-WH-GAS', '09.2', 'Water heater 40gal gas - replace', 'EA', '[{"sku": "WH-40-GAS", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 3.0, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1250.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

(gen_random_uuid(), 'PLMB-WH-ELEC', '09.2', 'Water heater 50gal electric - replace', 'EA', '[{"sku": "WH-50-ELEC", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "remove", "hours_per_unit": 1.0, "trade": "plumbing"}, {"task": "install", "hours_per_unit": 2.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 1100.00, '[{"damage_type": "water"}]'::jsonb, ARRAY['PLMB-VALVE'], true),

-- Plumbing - Pipe & Valves
(gen_random_uuid(), 'PLMB-PIPE-PVC', '09.3', 'PVC pipe 2" - repair/replace', 'LF', '[{"sku": "PIPE-PVC-2", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-PIPE-COPPER', '09.3', 'Copper pipe 1" - repair/replace', 'LF', '[{"sku": "PIPE-COPPER-1", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.35, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.10, 100.00, '[{"damage_type": "freeze"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'PLMB-VALVE', '09.5', 'Shut-off valve - replace', 'EA', '[{"sku": "VALVE-SHUTOFF", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.5, "trade": "plumbing"}]'::jsonb, '[]'::jsonb, 1.00, 85.00, '[{"damage_type": "water"}]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Ductwork
(gen_random_uuid(), 'HVAC-DUCT-FLEX6', '11.1', 'Flex duct 6" - replace', 'LF', '[{"sku": "DUCT-FLEX-6", "qty_per_unit": 1.0}, {"sku": "DUCT-TAPE", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.10, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[{"damage_type": "fire"}, {"damage_type": "water", "surface": "hvac"}]'::jsonb, ARRAY['HVAC-REGISTER'], true),

(gen_random_uuid(), 'HVAC-DUCT-RIGID6', '11.1', 'Rigid duct 6" - replace', 'LF', '[{"sku": "DUCT-RIGID-6", "qty_per_unit": 1.0}, {"sku": "MASTIC", "qty_per_unit": 0.01}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.20, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 75.00, '[{"damage_type": "fire"}]'::jsonb, ARRAY['HVAC-REGISTER'], true),

(gen_random_uuid(), 'HVAC-DUCT-INSUL', '11.1', 'Duct insulation wrap', 'SF', '[{"sku": "DUCT-INSUL", "qty_per_unit": 0.02}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.05, "trade": "hvac"}]'::jsonb, '[]'::jsonb, 1.10, 50.00, '[]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Registers
(gen_random_uuid(), 'HVAC-REGISTER', '11.2', 'Supply register - replace', 'EA', '[{"sku": "REGISTER-STD", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 35.00, '[{"damage_type": "water", "surface": "ceiling"}]'::jsonb, ARRAY[]::text[], true),

(gen_random_uuid(), 'HVAC-RETURN', '11.2', 'Return air grille - replace', 'EA', '[{"sku": "GRILLE-RETURN", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "install", "hours_per_unit": 0.25, "trade": "general"}]'::jsonb, '[]'::jsonb, 1.00, 45.00, '[]'::jsonb, ARRAY[]::text[], true),

-- HVAC - Cleaning
(gen_random_uuid(), 'HVAC-DUCT-CLEAN', '11.4', 'Duct cleaning - complete system', 'EA', '[{"sku": "HEPA-FILTER", "qty_per_unit": 1.0}]'::jsonb, '[{"task": "cleaning", "hours_per_unit": 4.0, "trade": "hvac"}]'::jsonb, '[{"type": "duct_cleaning_equip", "cost_per_unit": 100.00}]'::jsonb, 1.00, 350.00, '[{"damage_type": "fire"}, {"damage_type": "smoke"}]'::jsonb, ARRAY['FIRE-HVAC-CLEAN'], true);
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
