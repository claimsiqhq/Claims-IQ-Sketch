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
