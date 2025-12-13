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
