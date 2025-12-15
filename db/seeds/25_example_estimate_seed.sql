-- ============================================
-- Seed 25: Example Estimate Seed Data
-- Demonstrates scope engine, validation, and carrier rules
-- ============================================
--
-- This seed creates a complete example estimate that:
-- 1. Has 3 zones (Kitchen, Living Room, Hallway)
-- 2. Uses water damage scenario (Category 2)
-- 3. Demonstrates auto-generated scope
-- 4. Shows carrier rule effects
-- 5. Passes validation
--
-- NOTE: This seed requires an existing organization and claim.
-- If those don't exist, the estimate will be created with NULL references.
--
-- ============================================

-- First, ensure we have a test organization
INSERT INTO organizations (
  id, name, slug, type, email, status
) VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Example Insurance Co',
  'example-insurance',
  'carrier',
  'demo@example.com',
  'active'
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Create a test claim for the example estimate
INSERT INTO claims (
  id, organization_id, claim_id, policyholder,
  date_of_loss, risk_location, cause_of_loss, loss_description,
  policy_number, state, status
) VALUES (
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'CLM-2024-DEMO-001',
  'John Smith',
  '12/01/2024@02:30 AM',
  '123 Main Street, Dallas, TX 75201',
  'Water',
  'Dishwasher supply line failure resulting in Category 2 water damage to kitchen, living room, and hallway. Water sat for approximately 6 hours before discovery. Affected areas include flooring (LVP), drywall up to 24 inches, and baseboards.',
  'HO-DEMO-123456',
  'TX',
  'in_progress'
) ON CONFLICT (id) DO UPDATE SET
  loss_description = EXCLUDED.loss_description,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Create the example estimate
INSERT INTO estimates (
  id, organization_id, claim_id, claim_number, property_address,
  status, version, region_id, carrier_profile_id, notes
) VALUES (
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000001',
  'CLM-2024-DEMO-001',
  '123 Main Street, Dallas, TX 75201',
  'draft',
  1,
  'US-TX',
  (SELECT id FROM carrier_profiles WHERE code = 'NATL-STD' LIMIT 1),
  'Example estimate demonstrating water damage scope with Category 2 water from dishwasher failure.'
) ON CONFLICT (id) DO UPDATE SET
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Create estimate structures
INSERT INTO estimate_structures (
  id, estimate_id, name, structure_type, description, sort_order
) VALUES (
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Main Dwelling',
  'dwelling',
  'Single-family residence, 2-story, built 2010',
  1
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description;

-- Create estimate areas
INSERT INTO estimate_areas (
  id, estimate_id, structure_id, name, area_type, floor_level, sort_order
) VALUES (
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'First Floor Interior',
  'interior',
  1,
  1
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name;

-- ============================================
-- ZONE 1: Kitchen (Origin of water damage)
-- 12x14 = 168 SF, 8ft ceiling
-- Category 2 water, moderate severity
-- ============================================

INSERT INTO estimate_zones (
  id, estimate_id, area_id, name, room_type, zone_type,
  length, width, height, perimeter,
  sf_floor, sf_ceiling, sf_walls, sf_walls_net, lf_floor_perim,
  damage_type, damage_severity, water_category, water_class,
  affected_surfaces, notes, sort_order
) VALUES (
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'kitchen',
  'room',
  14.0,   -- length
  12.0,   -- width
  8.0,    -- height
  52.0,   -- perimeter (14+12+14+12)
  168.0,  -- sf_floor (14*12)
  168.0,  -- sf_ceiling
  416.0,  -- sf_walls (52*8)
  380.0,  -- sf_walls_net (minus door/window openings)
  52.0,   -- lf_floor_perim
  'water',
  'moderate',
  2,      -- Category 2 (gray water from dishwasher)
  2,      -- Class 2 (significant moisture)
  '["floor", "wall", "baseboard", "cabinet"]'::jsonb,
  'Origin room. Dishwasher supply line failure. Water category 2 due to food residue in dishwasher. LVP flooring affected. Drywall wet to 24". Baseboards saturated.',
  1
) ON CONFLICT (id) DO UPDATE SET
  damage_severity = EXCLUDED.damage_severity,
  water_category = EXCLUDED.water_category,
  notes = EXCLUDED.notes;

-- ============================================
-- ZONE 2: Living Room (Adjacent to kitchen)
-- 16x20 = 320 SF, 8ft ceiling
-- Category 2 water (migrated), moderate severity
-- ============================================

INSERT INTO estimate_zones (
  id, estimate_id, area_id, name, room_type, zone_type,
  length, width, height, perimeter,
  sf_floor, sf_ceiling, sf_walls, sf_walls_net, lf_floor_perim,
  damage_type, damage_severity, water_category, water_class,
  affected_surfaces, notes, sort_order
) VALUES (
  'f0000000-0000-0000-0000-000000000002'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'Living Room',
  'living_room',
  'room',
  20.0,   -- length
  16.0,   -- width
  8.0,    -- height
  72.0,   -- perimeter
  320.0,  -- sf_floor
  320.0,  -- sf_ceiling
  576.0,  -- sf_walls
  520.0,  -- sf_walls_net
  72.0,   -- lf_floor_perim
  'water',
  'moderate',
  2,
  2,
  '["floor", "wall", "baseboard", "carpet"]'::jsonb,
  'Adjacent to kitchen. Water migrated under wall plate. Carpet affected approximately 50% of room. Drywall wet to 18".',
  2
) ON CONFLICT (id) DO UPDATE SET
  damage_severity = EXCLUDED.damage_severity,
  notes = EXCLUDED.notes;

-- ============================================
-- ZONE 3: Hallway (Between rooms)
-- 4x15 = 60 SF, 8ft ceiling
-- Category 2 water, minor severity
-- ============================================

INSERT INTO estimate_zones (
  id, estimate_id, area_id, name, room_type, zone_type,
  length, width, height, perimeter,
  sf_floor, sf_ceiling, sf_walls, sf_walls_net, lf_floor_perim,
  damage_type, damage_severity, water_category, water_class,
  affected_surfaces, notes, sort_order
) VALUES (
  'f0000000-0000-0000-0000-000000000003'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'Hallway',
  'hallway',
  'room',
  15.0,   -- length
  4.0,    -- width
  8.0,    -- height
  38.0,   -- perimeter
  60.0,   -- sf_floor
  60.0,   -- sf_ceiling
  304.0,  -- sf_walls
  275.0,  -- sf_walls_net
  38.0,   -- lf_floor_perim
  'water',
  'minor',
  2,
  1,      -- Class 1 (minor moisture)
  '["floor", "baseboard"]'::jsonb,
  'Water path between kitchen and living room. LVP flooring affected. Baseboards wet. Drywall not affected.',
  3
) ON CONFLICT (id) DO UPDATE SET
  damage_severity = EXCLUDED.damage_severity,
  notes = EXCLUDED.notes;


-- ============================================
-- EXAMPLE LINE ITEMS FOR ZONE 1: KITCHEN
-- Demonstrates scope engine output
-- ============================================

-- Water extraction
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-EXTRACT-PORT',
  'Water extraction - portable extractor',
  '01.2',
  168.0,    -- FLOOR_SF(zone) = 168
  'SF',
  0.45,
  0.00,
  60.48,    -- 168 * 0.36 (labor component)
  13.44,    -- 168 * 0.08 (equipment)
  75.60,    -- 168 * 0.45
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Category 2 water extraction per IICRC S500. Portable extractor appropriate for Category 2.',
  1
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  subtotal = EXCLUDED.subtotal;

-- Moisture inspection
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000002'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-MOIST-INIT',
  'Initial moisture inspection/mapping',
  '01.4',
  168.0,    -- FLOOR_SF(zone)
  'SF',
  0.22,
  0.00,
  28.56,
  8.40,
  36.96,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Initial moisture mapping per IICRC S500. Document baseline readings for drying goals.',
  2
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Drying setup
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000003'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-DRY-SETUP',
  'Drying equipment setup/takedown',
  '01.3',
  1.0,      -- 1 per zone
  'EA',
  150.00,
  0.00,
  150.00,
  0.00,
  150.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Equipment setup and takedown for drying operations.',
  3
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Air movers (168 SF / 100 = 2 units, minimum 3, * 3 days = 9 unit-days)
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000004'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-DRY-AIRMOV',
  'Air mover per day',
  '01.3',
  9.0,      -- MAX(3, CEIL(168/100)) * 3 = 3 * 3 = 9 unit-days
  'DAY',
  42.00,
  0.00,
  37.80,
  340.20,
  378.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'IICRC S500: 1 air mover per 100 SF. 3 units for 3 days.',
  4
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Dehumidifier (168 SF / 500 = 1 unit, minimum 1 * 3 days = 3 unit-days)
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000005'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-DRY-DEHU',
  'Dehumidifier - LGR per day',
  '01.3',
  3.0,      -- MAX(3, CEIL(168/500)) * 1 = 3 * 1 = 3 unit-days
  'DAY',
  95.00,
  0.00,
  23.75,
  261.25,
  285.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'LGR dehumidifier for Category 2 water. 1 unit for 3 days.',
  5
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Daily moisture monitoring
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000006'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-MOIST-DAILY',
  'Daily moisture monitoring',
  '01.4',
  3.0,      -- 3 days minimum
  'DAY',
  110.00,
  0.00,
  110.00,
  45.00,
  330.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Daily moisture monitoring for 3 days. Required per IICRC S500.',
  6
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Antimicrobial treatment (Category 2 requires it)
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000007'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'WTR-ANTIMICROB',
  'Antimicrobial treatment - surfaces',
  '01.6',
  548.0,    -- WALL_SF_NET + FLOOR_SF = 380 + 168 = 548
  'SF',
  0.38,
  24.66,    -- 548 * 0.045
  82.20,
  16.44,
  208.24,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Antimicrobial required for Category 2 water per IICRC S500 Section 11.5.',
  7
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  notes = EXCLUDED.notes;

-- 2ft flood cut (Category 2, moderate severity)
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000008'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'DEM-DRY-FLOOD',
  'Drywall removal - flood cut 2ft',
  '02.1',
  46.8,     -- PERIMETER_LF * 0.9 = 52 * 0.9 = 46.8
  'LF',
  2.85,
  0.00,
  133.38,
  0.00,
  133.38,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  '2ft flood cut for Category 2 water. 90% of perimeter accounts for doorways.',
  8
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Baseboard removal
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000009'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'DEM-BASE',
  'Baseboard removal',
  '02.1',
  46.8,     -- PERIMETER_LF * 0.9
  'LF',
  1.25,
  0.00,
  58.50,
  0.00,
  58.50,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Baseboard removal for water-damaged baseboards.',
  9
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- LVP flooring removal
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000010'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'DEM-FLOOR-VNL',
  'Vinyl/LVP flooring removal',
  '02.1',
  168.0,    -- FLOOR_SF
  'SF',
  0.65,
  0.00,
  109.20,
  0.00,
  109.20,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'LVP flooring removal. Category 2 water damage.',
  10
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Debris haul
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000011'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'DEM-HAUL',
  'Debris haul off - per load',
  '02.2',
  1.0,      -- Estimate 1 load for this zone
  'EA',
  285.00,
  0.00,
  200.00,
  85.00,
  285.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Debris removal for demolished materials.',
  11
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;


-- ============================================
-- REBUILD LINE ITEMS FOR ZONE 1: KITCHEN
-- ============================================

-- Drywall install (1/2" for flood cut repair)
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000012'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'DRY-HTT-12',
  'Drywall 1/2" hang, tape, texture - walls',
  '06.2',
  95.0,     -- WALL_SF_NET * 0.25 = 380 * 0.25 = 95 (2ft on 8ft wall)
  'SF',
  2.85,
  29.69,
  218.50,
  0.00,
  270.75,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  '1/2" drywall for flood cut repair (25% of wall SF for 2ft cut on 8ft wall).',
  12
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- PVA primer
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000013'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'PAINT-INT-PRIME-PVA',
  'PVA drywall primer',
  '14.4',
  95.0,     -- Same as drywall install
  'SF',
  0.55,
  4.18,
  47.50,
  0.00,
  52.25,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'PVA primer required for new drywall.',
  13
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Wall paint
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000014'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'PAINT-INT-WALL',
  'Interior wall paint - 2 coats',
  '14.1',
  380.0,    -- WALL_SF_NET (full wall to blend)
  'SF',
  1.45,
  17.10,
  494.00,
  0.00,
  551.00,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  '2-coat interior wall paint. Full walls for color matching.',
  14
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Baseboard install
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000015'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'TRIM-BASE-MDF',
  'Baseboard MDF 3-1/4" - install',
  '16.1',
  46.8,     -- PERIMETER_LF * 0.9
  'LF',
  4.25,
  35.10,
  163.80,
  0.00,
  198.90,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'MDF baseboard replacement. Match existing profile.',
  15
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;

-- Trim paint
INSERT INTO estimate_line_items (
  id, estimate_id, line_item_code, line_item_description,
  category_id, quantity, unit, unit_price,
  material_cost, labor_cost, equipment_cost, subtotal,
  source, damage_zone_id, room_name, notes, sort_order
) VALUES (
  'g0000000-0000-0000-0000-000000000016'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'PAINT-INT-TRIM',
  'Interior trim paint - 2 coats',
  '14.3',
  46.8,     -- Same as baseboard
  'LF',
  2.45,
  4.21,
  110.50,
  0.00,
  114.66,
  'scope_engine',
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'Kitchen',
  'Trim paint for new baseboards.',
  16
) ON CONFLICT (id) DO UPDATE SET
  quantity = EXCLUDED.quantity;


-- ============================================
-- CARRIER RULE EFFECTS (Demonstrates rules engine)
-- ============================================

-- Record carrier rule effect for antimicrobial (NATL-STD has pre-approval requirement)
INSERT INTO rule_effects (
  id, estimate_id, estimate_line_item_id, zone_id,
  rule_source, rule_code, effect_type,
  original_value, modified_value, explanation_text,
  applied_at, is_override, override_reason
) VALUES (
  'h0000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'g0000000-0000-0000-0000-000000000007'::uuid,
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'carrier',
  'NATL-ANTIMICROB-CAP',
  'warn',
  '{"quantity": 548}'::jsonb,
  '{"quantity": 548, "warning": "Pre-approval may be required"}'::jsonb,
  'Antimicrobial application may require pre-approval from National Standard Insurance for quantities exceeding carrier guidelines.',
  NOW(),
  false,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  explanation_text = EXCLUDED.explanation_text;

-- Record carrier rule effect for contents documentation requirement
INSERT INTO rule_effects (
  id, estimate_id, zone_id,
  rule_source, rule_code, effect_type,
  original_value, modified_value, explanation_text,
  applied_at, is_override
) VALUES (
  'h0000000-0000-0000-0000-000000000002'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'carrier',
  'NATL-DOC-HIGHVALUE',
  'require_doc',
  '{"documentation": []}'::jsonb,
  '{"documentation": ["photo_before", "photo_after", "itemized_invoice"]}'::jsonb,
  'National Standard Insurance requires before/after photos and itemized invoices for all affected areas.',
  NOW(),
  false
) ON CONFLICT (id) DO UPDATE SET
  explanation_text = EXCLUDED.explanation_text;

-- Record jurisdiction rule effect for Texas labor tax
INSERT INTO rule_effects (
  id, estimate_id, zone_id,
  rule_source, rule_code, effect_type,
  original_value, modified_value, explanation_text,
  applied_at, is_override
) VALUES (
  'h0000000-0000-0000-0000-000000000003'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'f0000000-0000-0000-0000-000000000001'::uuid,
  'jurisdiction',
  'TX-LABOR-TAX',
  'modify_pct',
  '{"laborTaxRate": 0}'::jsonb,
  '{"laborTaxRate": 0.0625}'::jsonb,
  'Texas sales tax of 6.25% applies to labor on repair work per Texas Tax Code.',
  NOW(),
  false
) ON CONFLICT (id) DO UPDATE SET
  explanation_text = EXCLUDED.explanation_text;


-- ============================================
-- UPDATE ESTIMATE TOTALS
-- ============================================

-- Calculate and update estimate totals
-- Note: In production, this would be calculated by the estimate calculator service

UPDATE estimates SET
  subtotal = (
    SELECT COALESCE(SUM(subtotal), 0)
    FROM estimate_line_items
    WHERE estimate_id = 'c0000000-0000-0000-0000-000000000001'::uuid
  ),
  updated_at = NOW()
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

-- Update with O&P and tax (would normally be calculated by service)
UPDATE estimates SET
  overhead_amount = subtotal * (overhead_pct / 100),
  profit_amount = subtotal * (profit_pct / 100),
  tax_amount = subtotal * 0.0625,  -- Texas tax rate
  grand_total = subtotal + (subtotal * (overhead_pct / 100)) + (subtotal * (profit_pct / 100)) + (subtotal * 0.0625)
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;


-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
DECLARE
  v_estimate_total DECIMAL;
BEGIN
  SELECT grand_total INTO v_estimate_total
  FROM estimates
  WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

  RAISE NOTICE '================================================';
  RAISE NOTICE 'Seed 25: Example Estimate Created';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Claim: CLM-2024-DEMO-001';
  RAISE NOTICE 'Property: 123 Main Street, Dallas, TX 75201';
  RAISE NOTICE 'Cause of Loss: Water (Dishwasher failure)';
  RAISE NOTICE 'Water Category: 2 (Gray water)';
  RAISE NOTICE '';
  RAISE NOTICE 'Zones Created:';
  RAISE NOTICE '  1. Kitchen (168 SF) - Origin, moderate damage';
  RAISE NOTICE '  2. Living Room (320 SF) - Adjacent, moderate damage';
  RAISE NOTICE '  3. Hallway (60 SF) - Path, minor damage';
  RAISE NOTICE '';
  RAISE NOTICE 'Line Items (Kitchen Zone): 16 items';
  RAISE NOTICE '  - Water mitigation (extraction, drying, antimicrobial)';
  RAISE NOTICE '  - Demolition (flood cut, baseboard, flooring)';
  RAISE NOTICE '  - Rebuild (drywall, paint, baseboard)';
  RAISE NOTICE '';
  RAISE NOTICE 'Carrier: National Standard Insurance (NATL-STD)';
  RAISE NOTICE 'Jurisdiction: Texas (US-TX)';
  RAISE NOTICE '';
  RAISE NOTICE 'Rule Effects Applied:';
  RAISE NOTICE '  - Carrier: Antimicrobial pre-approval warning';
  RAISE NOTICE '  - Carrier: Documentation requirements';
  RAISE NOTICE '  - Jurisdiction: Texas labor tax (6.25%)';
  RAISE NOTICE '';
  RAISE NOTICE 'Estimated Total: $' || v_estimate_total;
  RAISE NOTICE '================================================';
END $$;
