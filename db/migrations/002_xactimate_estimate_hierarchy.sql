-- Xactimate-Compatible Estimate Hierarchy Migration
-- Claims IQ Sketch - Enhanced Structure for Carrier Submission
-- =============================================================

-- ============================================
-- ESTIMATE STATUS ENUM TYPE
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estimate_status') THEN
    CREATE TYPE estimate_status AS ENUM (
      'draft',
      'sketching',
      'scoping',
      'pricing',
      'review',
      'approved',
      'exported'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'zone_status') THEN
    CREATE TYPE zone_status AS ENUM (
      'pending',
      'measured',
      'scoped',
      'complete'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'zone_type') THEN
    CREATE TYPE zone_type AS ENUM (
      'room',
      'elevation',
      'roof',
      'deck',
      'linear',
      'custom'
    );
  END IF;
END $$;

-- ============================================
-- ESTIMATE COVERAGES TABLE
-- Coverage types with limits/deductibles
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,

  -- Coverage type: 0=Dwelling, 1=Other Structures, 2=Contents
  coverage_type VARCHAR(1) NOT NULL DEFAULT '0' CHECK (coverage_type IN ('0', '1', '2')),
  coverage_name VARCHAR(100) NOT NULL,

  -- Policy limits
  policy_limit DECIMAL(12,2) DEFAULT 0,
  deductible DECIMAL(12,2) DEFAULT 0,

  -- Calculated totals (updated by triggers/functions)
  line_item_total DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  overhead_total DECIMAL(12,2) DEFAULT 0,
  profit_total DECIMAL(12,2) DEFAULT 0,
  rcv_total DECIMAL(12,2) DEFAULT 0,
  depreciation_total DECIMAL(12,2) DEFAULT 0,
  acv_total DECIMAL(12,2) DEFAULT 0,
  recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  non_recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  net_claim DECIMAL(12,2) DEFAULT 0,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(estimate_id, coverage_type)
);

CREATE INDEX IF NOT EXISTS idx_estimate_coverages_estimate ON estimate_coverages(estimate_id);

-- ============================================
-- ESTIMATE STRUCTURES TABLE
-- Physical structures (House, Barn, Detached Garage, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  coverage_id UUID REFERENCES estimate_coverages(id) ON DELETE SET NULL,

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Link to sketch
  sketch_name VARCHAR(100),
  sketch_page INTEGER DEFAULT 1,

  -- Structure metadata
  year_built INTEGER,
  construction_type VARCHAR(50), -- frame, masonry, etc.
  stories INTEGER DEFAULT 1,

  -- Calculated totals
  total_sf DECIMAL(12,2) DEFAULT 0,
  rcv_total DECIMAL(12,2) DEFAULT 0,
  acv_total DECIMAL(12,2) DEFAULT 0,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_structures_estimate ON estimate_structures(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_structures_coverage ON estimate_structures(coverage_id);

-- ============================================
-- ESTIMATE AREAS TABLE
-- Organizational grouping (Exterior, Interior, Roofing, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id UUID NOT NULL REFERENCES estimate_structures(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  area_type VARCHAR(50) NOT NULL, -- exterior, interior, roofing, specialty

  -- Calculated totals
  total_sf DECIMAL(12,2) DEFAULT 0,
  rcv_total DECIMAL(12,2) DEFAULT 0,
  acv_total DECIMAL(12,2) DEFAULT 0,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_areas_structure ON estimate_areas(structure_id);

-- ============================================
-- ESTIMATE ZONES TABLE
-- The actual measured areas (rooms, elevations, roof sections)
-- This extends/replaces the existing damage_zones concept
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES estimate_areas(id) ON DELETE CASCADE,

  -- Zone identification
  name VARCHAR(100) NOT NULL,
  zone_code VARCHAR(20), -- SKETCH1, KITCHEN, FRONT-ELEV
  zone_type VARCHAR(20) NOT NULL DEFAULT 'room', -- room, elevation, roof, deck, linear, custom
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, measured, scoped, complete

  -- Room type for interior zones
  room_type VARCHAR(50), -- kitchen, bathroom, bedroom, living, etc.
  floor_level VARCHAR(20) DEFAULT 'main', -- basement, main, upper, attic

  -- Manual entry dimensions
  length_ft DECIMAL(8,2),
  width_ft DECIMAL(8,2),
  height_ft DECIMAL(8,2) DEFAULT 8.0,
  pitch VARCHAR(10), -- roof pitch like "6/12"
  pitch_multiplier DECIMAL(6,4) DEFAULT 1.0, -- calculated from pitch

  -- Calculated dimensions stored as JSONB for flexibility
  -- Updated by calculate_zone_dimensions() function
  dimensions JSONB DEFAULT '{}'::jsonb,
  /*
  Example dimensions:
  {
    "sfWalls": 416.00,
    "sfCeiling": 168.00,
    "sfFloor": 168.00,
    "syFloor": 18.67,
    "lfFloorPerim": 52.00,
    "lfCeilingPerim": 52.00,
    "sfWallsCeiling": 584.00,
    "sfLongWall": 128.00,
    "sfShortWall": 80.00,
    "sfSkRoof": null,
    "skRoofSquares": null,
    "lfSkRoofPerim": null,
    "lfSkRoofRidge": null,
    "lfTotal": null
  }
  */

  -- Room info for Xactimate
  room_info JSONB DEFAULT '{}'::jsonb,
  /*
  {
    "ceilingHeight": 8.0,
    "shape": "rectangle",
    "dimString": "12x14",
    "hasVaultedCeiling": false,
    "vaultPitch": null
  }
  */

  -- Sketch polygon data (for visual representation)
  sketch_polygon JSONB DEFAULT 'null'::jsonb,

  -- Damage info (from original damage_zones)
  damage_type VARCHAR(50),
  damage_severity VARCHAR(20), -- minor, moderate, severe, total_loss
  water_category INTEGER, -- 1, 2, 3
  water_class INTEGER, -- 1, 2, 3, 4
  affected_surfaces JSONB DEFAULT '[]'::jsonb,

  -- Photo references
  photo_ids JSONB DEFAULT '[]'::jsonb,

  -- Calculated totals
  line_item_count INTEGER DEFAULT 0,
  rcv_total DECIMAL(12,2) DEFAULT 0,
  acv_total DECIMAL(12,2) DEFAULT 0,

  -- Notes
  notes TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_zones_area ON estimate_zones(area_id);
CREATE INDEX IF NOT EXISTS idx_estimate_zones_status ON estimate_zones(status);
CREATE INDEX IF NOT EXISTS idx_estimate_zones_type ON estimate_zones(zone_type);

-- ============================================
-- ESTIMATE MISSING WALLS TABLE
-- Openings (doors, windows, pass-throughs)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_missing_walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES estimate_zones(id) ON DELETE CASCADE,

  name VARCHAR(100),
  opening_type VARCHAR(50) NOT NULL DEFAULT 'door', -- door, window, opening, pass_through

  -- Dimensions
  width_ft DECIMAL(6,2) NOT NULL,
  height_ft DECIMAL(6,2) NOT NULL,
  quantity INTEGER DEFAULT 1,

  -- Where does it go
  goes_to_floor BOOLEAN DEFAULT true,
  goes_to_ceiling BOOLEAN DEFAULT false,
  opens_into VARCHAR(100), -- "Exterior" or zone name

  -- Calculated area to subtract
  total_sf DECIMAL(10,2) GENERATED ALWAYS AS (width_ft * height_ft * quantity) STORED,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missing_walls_zone ON estimate_missing_walls(zone_id);

-- ============================================
-- ESTIMATE SUBROOMS TABLE
-- Nested areas (bump-outs, closets, bay windows)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_subrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES estimate_zones(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  subroom_type VARCHAR(50), -- closet, bump_out, bay_window, alcove

  -- Dimensions
  length_ft DECIMAL(8,2) NOT NULL,
  width_ft DECIMAL(8,2) NOT NULL,
  height_ft DECIMAL(8,2),

  -- Calculated dimensions (same structure as zone)
  dimensions JSONB DEFAULT '{}'::jsonb,

  -- Whether to add or subtract from parent zone
  is_addition BOOLEAN DEFAULT true,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subrooms_zone ON estimate_subrooms(zone_id);

-- ============================================
-- ESTIMATE TOTALS TABLE
-- Calculated summary (one per estimate)
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL UNIQUE REFERENCES estimates(id) ON DELETE CASCADE,

  -- Line item subtotals
  line_item_total DECIMAL(12,2) DEFAULT 0,
  material_total DECIMAL(12,2) DEFAULT 0,
  labor_total DECIMAL(12,2) DEFAULT 0,
  equipment_total DECIMAL(12,2) DEFAULT 0,

  -- Tax
  tax_total DECIMAL(12,2) DEFAULT 0,

  -- O&P
  op_base DECIMAL(12,2) DEFAULT 0, -- amount O&P is calculated on
  overhead_total DECIMAL(12,2) DEFAULT 0,
  profit_total DECIMAL(12,2) DEFAULT 0,

  -- RCV/ACV
  rcv_total DECIMAL(12,2) DEFAULT 0,
  depreciation_total DECIMAL(12,2) DEFAULT 0,
  recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  non_recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  acv_total DECIMAL(12,2) DEFAULT 0,

  -- Homeowner items
  homeowner_total DECIMAL(12,2) DEFAULT 0,
  contractor_total DECIMAL(12,2) DEFAULT 0,

  -- Net claim
  deductible_total DECIMAL(12,2) DEFAULT 0,
  net_claim DECIMAL(12,2) DEFAULT 0,

  -- Trade counts for O&P eligibility
  trade_count INTEGER DEFAULT 0,
  qualifies_for_op BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_totals_estimate ON estimate_totals(estimate_id);

-- ============================================
-- ENHANCE ESTIMATES TABLE
-- Add Xactimate-compatible fields
-- ============================================

DO $$
BEGIN
  -- Estimate status (using text for compatibility)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'workflow_status') THEN
    ALTER TABLE estimates ADD COLUMN workflow_status VARCHAR(20) DEFAULT 'draft';
  END IF;

  -- Policy info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'policy_number') THEN
    ALTER TABLE estimates ADD COLUMN policy_number VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'policy_type') THEN
    ALTER TABLE estimates ADD COLUMN policy_type VARCHAR(50); -- HO3, HO5, etc.
  END IF;

  -- Xactimate-specific settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'xact_settings') THEN
    ALTER TABLE estimates ADD COLUMN xact_settings JSONB DEFAULT '{}'::jsonb;
    -- {
    --   "priceListMonth": "DEC24",
    --   "priceListState": "CA",
    --   "laborEfficiency": 1.0,
    --   "minimumChargeEnabled": true,
    --   "wasteFactorDefault": 1.10
    -- }
  END IF;

  -- O&P eligibility settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'op_threshold') THEN
    ALTER TABLE estimates ADD COLUMN op_threshold DECIMAL(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'op_trade_minimum') THEN
    ALTER TABLE estimates ADD COLUMN op_trade_minimum INTEGER DEFAULT 3;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qualifies_for_op') THEN
    ALTER TABLE estimates ADD COLUMN qualifies_for_op BOOLEAN DEFAULT false;
  END IF;

  -- Audit fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'exported_at') THEN
    ALTER TABLE estimates ADD COLUMN exported_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'esx_version') THEN
    ALTER TABLE estimates ADD COLUMN esx_version INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- ENHANCE ESTIMATE LINE ITEMS
-- Add zone reference and flags
-- ============================================

DO $$
BEGIN
  -- Zone reference (new hierarchy)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'zone_id') THEN
    ALTER TABLE estimate_line_items ADD COLUMN zone_id UUID;
  END IF;

  -- Coverage reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'coverage_id') THEN
    ALTER TABLE estimate_line_items ADD COLUMN coverage_id UUID;
  END IF;

  -- Xactimate codes (CAT+SEL+ACT)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'category_code') THEN
    ALTER TABLE estimate_line_items ADD COLUMN category_code VARCHAR(10);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'selector_code') THEN
    ALTER TABLE estimate_line_items ADD COLUMN selector_code VARCHAR(30);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'activity_code') THEN
    ALTER TABLE estimate_line_items ADD COLUMN activity_code VARCHAR(10);
  END IF;

  -- Calculation reference (which dimension was used)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'calc_ref') THEN
    ALTER TABLE estimate_line_items ADD COLUMN calc_ref VARCHAR(30); -- sfFloor, sfWalls, lfFloorPerim, etc.
  END IF;

  -- Special flags
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_homeowner') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_homeowner BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_credit') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_credit BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_non_op') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_non_op BOOLEAN DEFAULT false;
  END IF;

  -- Depreciation type ID for Xactimate
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_type_id') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_type_id INTEGER DEFAULT 0;
    -- 0 = Percent, 1 = Amount, 2 = Age, 3 = Unknown
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'life_expectancy_years') THEN
    ALTER TABLE estimate_line_items ADD COLUMN life_expectancy_years INTEGER;
  END IF;
END $$;

-- Add foreign key constraints for new columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'fk_line_item_zone') THEN
    ALTER TABLE estimate_line_items
    ADD CONSTRAINT fk_line_item_zone
    FOREIGN KEY (zone_id) REFERENCES estimate_zones(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'fk_line_item_coverage') THEN
    ALTER TABLE estimate_line_items
    ADD CONSTRAINT fk_line_item_coverage
    FOREIGN KEY (coverage_id) REFERENCES estimate_coverages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_zone ON estimate_line_items(zone_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_coverage ON estimate_line_items(coverage_id);

-- ============================================
-- FUNCTION: Calculate Zone Dimensions
-- ============================================

CREATE OR REPLACE FUNCTION calculate_zone_dimensions(
  p_zone_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_zone RECORD;
  v_dimensions JSONB;
  v_sf_floor DECIMAL;
  v_perimeter DECIMAL;
  v_sf_walls DECIMAL;
  v_sf_long_wall DECIMAL;
  v_sf_short_wall DECIMAL;
  v_long_side DECIMAL;
  v_short_side DECIMAL;
  v_missing_wall_sf DECIMAL;
  v_pitch_mult DECIMAL;
BEGIN
  -- Get zone data
  SELECT * INTO v_zone FROM estimate_zones WHERE id = p_zone_id;

  IF v_zone IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Default dimensions if not set
  IF v_zone.length_ft IS NULL OR v_zone.width_ft IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Calculate base measurements
  v_sf_floor := v_zone.length_ft * v_zone.width_ft;
  v_perimeter := 2 * (v_zone.length_ft + v_zone.width_ft);
  v_long_side := GREATEST(v_zone.length_ft, v_zone.width_ft);
  v_short_side := LEAST(v_zone.length_ft, v_zone.width_ft);

  -- Calculate missing wall area
  SELECT COALESCE(SUM(total_sf), 0) INTO v_missing_wall_sf
  FROM estimate_missing_walls
  WHERE zone_id = p_zone_id;

  -- Calculate pitch multiplier if roof
  v_pitch_mult := COALESCE(v_zone.pitch_multiplier, 1.0);

  -- Build dimensions based on zone type
  CASE v_zone.zone_type
    WHEN 'room' THEN
      v_sf_walls := (v_perimeter * COALESCE(v_zone.height_ft, 8.0)) - v_missing_wall_sf;
      v_sf_long_wall := v_long_side * COALESCE(v_zone.height_ft, 8.0);
      v_sf_short_wall := v_short_side * COALESCE(v_zone.height_ft, 8.0);

      v_dimensions := jsonb_build_object(
        'sfFloor', ROUND(v_sf_floor::numeric, 2),
        'syFloor', ROUND((v_sf_floor / 9)::numeric, 2),
        'lfFloorPerim', ROUND(v_perimeter::numeric, 2),
        'sfCeiling', ROUND(v_sf_floor::numeric, 2),
        'lfCeilingPerim', ROUND(v_perimeter::numeric, 2),
        'sfWalls', ROUND(GREATEST(v_sf_walls, 0)::numeric, 2),
        'sfWallsCeiling', ROUND((v_sf_floor + GREATEST(v_sf_walls, 0))::numeric, 2),
        'sfLongWall', ROUND(v_sf_long_wall::numeric, 2),
        'sfShortWall', ROUND(v_sf_short_wall::numeric, 2),
        'sfTotal', ROUND((v_sf_floor * 2 + GREATEST(v_sf_walls, 0))::numeric, 2)
      );

    WHEN 'elevation' THEN
      -- Single wall face
      v_sf_walls := (v_zone.length_ft * COALESCE(v_zone.height_ft, 8.0)) - v_missing_wall_sf;

      v_dimensions := jsonb_build_object(
        'sfWalls', ROUND(GREATEST(v_sf_walls, 0)::numeric, 2),
        'sfLongWall', ROUND(GREATEST(v_sf_walls, 0)::numeric, 2),
        'lfWidth', ROUND(v_zone.length_ft::numeric, 2),
        'lfHeight', ROUND(COALESCE(v_zone.height_ft, 8.0)::numeric, 2)
      );

    WHEN 'roof' THEN
      v_dimensions := jsonb_build_object(
        'sfFloor', ROUND(v_sf_floor::numeric, 2),
        'sfSkRoof', ROUND((v_sf_floor * v_pitch_mult)::numeric, 2),
        'skRoofSquares', ROUND(((v_sf_floor * v_pitch_mult) / 100)::numeric, 2),
        'lfSkRoofPerim', ROUND(v_perimeter::numeric, 2),
        'lfSkRoofRidge', ROUND(v_long_side::numeric, 2),
        'lfSkRoofEave', ROUND((v_short_side * 2)::numeric, 2),
        'lfSkRoofRake', ROUND((v_long_side * 2)::numeric, 2)
      );

    WHEN 'deck' THEN
      v_dimensions := jsonb_build_object(
        'sfFloor', ROUND(v_sf_floor::numeric, 2),
        'syFloor', ROUND((v_sf_floor / 9)::numeric, 2),
        'lfFloorPerim', ROUND(v_perimeter::numeric, 2),
        'lfRailing', ROUND(v_perimeter::numeric, 2)
      );

    WHEN 'linear' THEN
      v_dimensions := jsonb_build_object(
        'lfTotal', ROUND(v_zone.length_ft::numeric, 2)
      );

    ELSE
      -- Custom or default
      v_dimensions := jsonb_build_object(
        'sfFloor', ROUND(v_sf_floor::numeric, 2),
        'syFloor', ROUND((v_sf_floor / 9)::numeric, 2),
        'lfFloorPerim', ROUND(v_perimeter::numeric, 2)
      );
  END CASE;

  RETURN v_dimensions;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Get Pitch Multiplier
-- ============================================

CREATE OR REPLACE FUNCTION get_pitch_multiplier(pitch_string VARCHAR)
RETURNS DECIMAL AS $$
DECLARE
  v_rise DECIMAL;
  v_run DECIMAL;
  v_pitch_parts TEXT[];
BEGIN
  IF pitch_string IS NULL OR pitch_string = '' THEN
    RETURN 1.0;
  END IF;

  -- Parse "6/12" format
  v_pitch_parts := string_to_array(pitch_string, '/');

  IF array_length(v_pitch_parts, 1) != 2 THEN
    RETURN 1.0;
  END IF;

  v_rise := v_pitch_parts[1]::DECIMAL;
  v_run := v_pitch_parts[2]::DECIMAL;

  IF v_run = 0 THEN
    RETURN 1.0;
  END IF;

  -- Pitch multiplier = sqrt(1 + (rise/run)^2)
  RETURN SQRT(1 + POWER(v_rise / v_run, 2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- TRIGGER: Auto-calculate zone dimensions
-- ============================================

CREATE OR REPLACE FUNCTION trigger_calculate_zone_dimensions()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate pitch multiplier if pitch changed
  IF NEW.pitch IS DISTINCT FROM OLD.pitch THEN
    NEW.pitch_multiplier := get_pitch_multiplier(NEW.pitch);
  END IF;

  -- Calculate dimensions
  NEW.dimensions := calculate_zone_dimensions(NEW.id);
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zone_dimension_calc ON estimate_zones;

CREATE TRIGGER zone_dimension_calc
BEFORE UPDATE OF length_ft, width_ft, height_ft, pitch, zone_type
ON estimate_zones
FOR EACH ROW
EXECUTE FUNCTION trigger_calculate_zone_dimensions();

-- ============================================
-- TRIGGER: Recalculate dimensions on missing wall changes
-- ============================================

CREATE OR REPLACE FUNCTION trigger_recalc_zone_on_missing_wall()
RETURNS TRIGGER AS $$
DECLARE
  v_zone_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_zone_id := OLD.zone_id;
  ELSE
    v_zone_id := NEW.zone_id;
  END IF;

  -- Recalculate zone dimensions
  UPDATE estimate_zones
  SET dimensions = calculate_zone_dimensions(v_zone_id),
      updated_at = NOW()
  WHERE id = v_zone_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS missing_wall_recalc ON estimate_missing_walls;

CREATE TRIGGER missing_wall_recalc
AFTER INSERT OR UPDATE OR DELETE ON estimate_missing_walls
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_zone_on_missing_wall();

-- ============================================
-- FUNCTION: Calculate Line Item Totals
-- ============================================

CREATE OR REPLACE FUNCTION calculate_line_item_totals(
  p_quantity DECIMAL,
  p_remove_price DECIMAL,
  p_replace_price DECIMAL,
  p_tax_rate DECIMAL,
  p_depreciation_type_id INTEGER,
  p_depreciation_percent DECIMAL,
  p_age_years INTEGER,
  p_life_expectancy_years INTEGER,
  p_is_recoverable BOOLEAN
) RETURNS TABLE (
  total DECIMAL,
  tax DECIMAL,
  rcv_total DECIMAL,
  depreciation_percent DECIMAL,
  depreciation_total DECIMAL,
  acv_total DECIMAL
) AS $$
DECLARE
  v_total DECIMAL;
  v_tax DECIMAL;
  v_rcv DECIMAL;
  v_dep_pct DECIMAL;
  v_dep_amount DECIMAL;
  v_acv DECIMAL;
BEGIN
  -- Base total
  v_total := p_quantity * (COALESCE(p_remove_price, 0) + COALESCE(p_replace_price, 0));

  -- Tax
  v_tax := v_total * COALESCE(p_tax_rate, 0);

  -- RCV (before depreciation)
  v_rcv := v_total + v_tax;

  -- Depreciation
  CASE p_depreciation_type_id
    WHEN 0 THEN -- Percent
      v_dep_pct := COALESCE(p_depreciation_percent, 0);
    WHEN 2 THEN -- Age-based
      IF COALESCE(p_life_expectancy_years, 0) > 0 THEN
        v_dep_pct := LEAST(
          (COALESCE(p_age_years, 0)::DECIMAL / p_life_expectancy_years) * 100,
          100
        );
      ELSE
        v_dep_pct := 0;
      END IF;
    ELSE
      v_dep_pct := 0;
  END CASE;

  v_dep_amount := v_rcv * (v_dep_pct / 100);

  -- ACV (after depreciation)
  v_acv := v_rcv - v_dep_amount;

  RETURN QUERY SELECT
    ROUND(v_total, 2),
    ROUND(v_tax, 2),
    ROUND(v_rcv, 2),
    ROUND(v_dep_pct, 2),
    ROUND(v_dep_amount, 2),
    ROUND(v_acv, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- FUNCTION: Recalculate Estimate Totals
-- ============================================

CREATE OR REPLACE FUNCTION recalculate_estimate_totals(p_estimate_id UUID)
RETURNS VOID AS $$
DECLARE
  v_estimate RECORD;
  v_line_totals RECORD;
  v_op_base DECIMAL;
  v_overhead DECIMAL;
  v_profit DECIMAL;
  v_trade_count INTEGER;
  v_qualifies_for_op BOOLEAN;
BEGIN
  -- Get estimate settings
  SELECT * INTO v_estimate FROM estimates WHERE id = p_estimate_id;

  IF v_estimate IS NULL THEN
    RETURN;
  END IF;

  -- Aggregate line item totals
  SELECT
    COALESCE(SUM(subtotal), 0) AS line_item_total,
    COALESCE(SUM(material_cost), 0) AS material_total,
    COALESCE(SUM(labor_cost), 0) AS labor_total,
    COALESCE(SUM(equipment_cost), 0) AS equipment_total,
    COALESCE(SUM(tax_amount), 0) AS tax_total,
    COALESCE(SUM(CASE WHEN COALESCE(is_recoverable, true) THEN depreciation_amount ELSE 0 END), 0) AS recoverable_dep,
    COALESCE(SUM(CASE WHEN NOT COALESCE(is_recoverable, true) THEN depreciation_amount ELSE 0 END), 0) AS non_recoverable_dep,
    COALESCE(SUM(depreciation_amount), 0) AS total_depreciation,
    COALESCE(SUM(acv), 0) AS total_acv,
    COALESCE(SUM(CASE WHEN is_homeowner THEN subtotal ELSE 0 END), 0) AS homeowner_total,
    COALESCE(SUM(CASE WHEN NOT is_homeowner THEN subtotal ELSE 0 END), 0) AS contractor_total
  INTO v_line_totals
  FROM estimate_line_items
  WHERE estimate_id = p_estimate_id AND is_approved = true;

  -- Calculate O&P base (contractor items, excluding non-OP items)
  SELECT COALESCE(SUM(subtotal), 0) INTO v_op_base
  FROM estimate_line_items
  WHERE estimate_id = p_estimate_id
    AND is_approved = true
    AND COALESCE(is_homeowner, false) = false
    AND COALESCE(is_non_op, false) = false;

  -- Count unique trades for O&P eligibility
  SELECT COUNT(DISTINCT trade_code) INTO v_trade_count
  FROM estimate_line_items
  WHERE estimate_id = p_estimate_id
    AND is_approved = true
    AND trade_code IS NOT NULL;

  -- Check O&P eligibility
  v_qualifies_for_op := (
    v_op_base >= COALESCE(v_estimate.op_threshold, 0) AND
    v_trade_count >= COALESCE(v_estimate.op_trade_minimum, 3)
  );

  -- Calculate O&P
  IF v_qualifies_for_op THEN
    v_overhead := v_op_base * (COALESCE(v_estimate.overhead_pct, 10) / 100);
    v_profit := v_op_base * (COALESCE(v_estimate.profit_pct, 10) / 100);
  ELSE
    v_overhead := 0;
    v_profit := 0;
  END IF;

  -- Upsert estimate_totals
  INSERT INTO estimate_totals (
    estimate_id,
    line_item_total, material_total, labor_total, equipment_total,
    tax_total, op_base, overhead_total, profit_total,
    rcv_total, depreciation_total, recoverable_depreciation, non_recoverable_depreciation,
    acv_total, homeowner_total, contractor_total,
    trade_count, qualifies_for_op,
    updated_at
  ) VALUES (
    p_estimate_id,
    v_line_totals.line_item_total,
    v_line_totals.material_total,
    v_line_totals.labor_total,
    v_line_totals.equipment_total,
    v_line_totals.tax_total,
    v_op_base,
    v_overhead,
    v_profit,
    v_line_totals.line_item_total + v_line_totals.tax_total + v_overhead + v_profit,
    v_line_totals.total_depreciation,
    v_line_totals.recoverable_dep,
    v_line_totals.non_recoverable_dep,
    v_line_totals.total_acv,
    v_line_totals.homeowner_total,
    v_line_totals.contractor_total,
    v_trade_count,
    v_qualifies_for_op,
    NOW()
  )
  ON CONFLICT (estimate_id) DO UPDATE SET
    line_item_total = EXCLUDED.line_item_total,
    material_total = EXCLUDED.material_total,
    labor_total = EXCLUDED.labor_total,
    equipment_total = EXCLUDED.equipment_total,
    tax_total = EXCLUDED.tax_total,
    op_base = EXCLUDED.op_base,
    overhead_total = EXCLUDED.overhead_total,
    profit_total = EXCLUDED.profit_total,
    rcv_total = EXCLUDED.rcv_total,
    depreciation_total = EXCLUDED.depreciation_total,
    recoverable_depreciation = EXCLUDED.recoverable_depreciation,
    non_recoverable_depreciation = EXCLUDED.non_recoverable_depreciation,
    acv_total = EXCLUDED.acv_total,
    homeowner_total = EXCLUDED.homeowner_total,
    contractor_total = EXCLUDED.contractor_total,
    trade_count = EXCLUDED.trade_count,
    qualifies_for_op = EXCLUDED.qualifies_for_op,
    updated_at = NOW();

  -- Update estimates table summary
  UPDATE estimates SET
    subtotal = v_line_totals.line_item_total,
    overhead_amount = v_overhead,
    profit_amount = v_profit,
    tax_amount = v_line_totals.tax_total,
    grand_total = v_line_totals.line_item_total + v_line_totals.tax_total + v_overhead + v_profit,
    total_rcv = v_line_totals.line_item_total + v_line_totals.tax_total + v_overhead + v_profit,
    total_depreciation = v_line_totals.total_depreciation,
    total_acv = v_line_totals.total_acv,
    recoverable_depreciation = v_line_totals.recoverable_dep,
    non_recoverable_depreciation = v_line_totals.non_recoverable_dep,
    qualifies_for_op = v_qualifies_for_op,
    updated_at = NOW()
  WHERE id = p_estimate_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Auto-recalculate on line item changes
-- ============================================

CREATE OR REPLACE FUNCTION trigger_recalc_estimate_on_line_item()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_estimate_totals(OLD.estimate_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_estimate_totals(NEW.estimate_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS line_item_recalc_totals ON estimate_line_items;

CREATE TRIGGER line_item_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON estimate_line_items
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_estimate_on_line_item();

-- ============================================
-- VIEW: Full Estimate with Hierarchy
-- ============================================

CREATE OR REPLACE VIEW estimate_hierarchy_view AS
SELECT
  e.id AS estimate_id,
  e.claim_number,
  e.property_address,
  e.workflow_status,
  e.status,
  s.id AS structure_id,
  s.name AS structure_name,
  a.id AS area_id,
  a.name AS area_name,
  a.area_type,
  z.id AS zone_id,
  z.name AS zone_name,
  z.zone_type,
  z.status AS zone_status,
  z.dimensions,
  (SELECT COUNT(*) FROM estimate_line_items li WHERE li.zone_id = z.id) AS zone_line_item_count,
  (SELECT COALESCE(SUM(subtotal), 0) FROM estimate_line_items li WHERE li.zone_id = z.id) AS zone_subtotal
FROM estimates e
LEFT JOIN estimate_structures s ON s.estimate_id = e.id
LEFT JOIN estimate_areas a ON a.structure_id = s.id
LEFT JOIN estimate_zones z ON z.area_id = a.id
ORDER BY e.id, s.sort_order, a.sort_order, z.sort_order;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$ BEGIN RAISE NOTICE 'Xactimate-compatible estimate hierarchy migration completed successfully!'; END $$;
