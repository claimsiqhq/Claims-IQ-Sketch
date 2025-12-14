-- Estimate Enhancements Migration
-- Adds missing columns, fixes aggregation, and adds dimension-based calculation
-- =============================================================

-- ============================================
-- ADD MISSING COLUMNS TO estimate_line_items
-- ============================================

DO $$
BEGIN
  -- RCV (Replacement Cost Value)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'rcv') THEN
    ALTER TABLE estimate_line_items ADD COLUMN rcv DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- Tax amount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'tax_amount') THEN
    ALTER TABLE estimate_line_items ADD COLUMN tax_amount DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- Depreciation fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_pct') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_pct DECIMAL(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_amount') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_amount DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_recoverable') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_recoverable BOOLEAN DEFAULT true;
  END IF;

  -- ACV (Actual Cash Value)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'acv') THEN
    ALTER TABLE estimate_line_items ADD COLUMN acv DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- Trade code for O&P calculation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'trade_code') THEN
    ALTER TABLE estimate_line_items ADD COLUMN trade_code VARCHAR(20);
  END IF;

  -- Age for depreciation calculation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'age_years') THEN
    ALTER TABLE estimate_line_items ADD COLUMN age_years INTEGER DEFAULT 0;
  END IF;

  -- Override pricing flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_price_override') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_price_override BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================
-- ADD MISSING COLUMNS TO estimate_subrooms
-- ============================================

DO $$
BEGIN
  -- Calculated square footage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_subrooms' AND column_name = 'sf_floor') THEN
    ALTER TABLE estimate_subrooms ADD COLUMN sf_floor DECIMAL(10,2) GENERATED ALWAYS AS (length_ft * width_ft) STORED;
  END IF;
END $$;

-- ============================================
-- FUNCTION: Calculate Subroom Contribution to Zone
-- ============================================

CREATE OR REPLACE FUNCTION calculate_subroom_impact(p_zone_id UUID)
RETURNS TABLE (
  sf_floor_delta DECIMAL,
  sf_walls_delta DECIMAL,
  sf_ceiling_delta DECIMAL
) AS $$
DECLARE
  v_zone_height DECIMAL;
BEGIN
  -- Get zone height
  SELECT COALESCE(height_ft, 8.0) INTO v_zone_height
  FROM estimate_zones WHERE id = p_zone_id;

  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE WHEN is_addition THEN (length_ft * width_ft)
           ELSE -(length_ft * width_ft) END
    ), 0)::DECIMAL as sf_floor_delta,
    COALESCE(SUM(
      CASE WHEN is_addition
           THEN (2 * (length_ft + width_ft) * COALESCE(height_ft, v_zone_height))
           ELSE -(2 * (length_ft + width_ft) * COALESCE(height_ft, v_zone_height)) END
    ), 0)::DECIMAL as sf_walls_delta,
    COALESCE(SUM(
      CASE WHEN is_addition THEN (length_ft * width_ft)
           ELSE -(length_ft * width_ft) END
    ), 0)::DECIMAL as sf_ceiling_delta
  FROM estimate_subrooms
  WHERE zone_id = p_zone_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Enhanced Zone Dimensions (with subrooms)
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
  v_subroom_impact RECORD;
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

  -- Calculate subroom impact
  SELECT * INTO v_subroom_impact FROM calculate_subroom_impact(p_zone_id);

  -- Add subroom floor delta
  v_sf_floor := v_sf_floor + COALESCE(v_subroom_impact.sf_floor_delta, 0);

  -- Calculate pitch multiplier if roof
  v_pitch_mult := COALESCE(v_zone.pitch_multiplier, 1.0);

  -- Build dimensions based on zone type
  CASE v_zone.zone_type
    WHEN 'room' THEN
      v_sf_walls := (v_perimeter * COALESCE(v_zone.height_ft, 8.0)) - v_missing_wall_sf + COALESCE(v_subroom_impact.sf_walls_delta, 0);
      v_sf_long_wall := v_long_side * COALESCE(v_zone.height_ft, 8.0);
      v_sf_short_wall := v_short_side * COALESCE(v_zone.height_ft, 8.0);

      v_dimensions := jsonb_build_object(
        'sfFloor', ROUND(v_sf_floor::numeric, 2),
        'syFloor', ROUND((v_sf_floor / 9)::numeric, 2),
        'lfFloorPerim', ROUND(v_perimeter::numeric, 2),
        'sfCeiling', ROUND((v_sf_floor + COALESCE(v_subroom_impact.sf_ceiling_delta, 0))::numeric, 2),
        'lfCeilingPerim', ROUND(v_perimeter::numeric, 2),
        'sfWalls', ROUND(GREATEST(v_sf_walls, 0)::numeric, 2),
        'sfWallsCeiling', ROUND((v_sf_floor + GREATEST(v_sf_walls, 0))::numeric, 2),
        'sfLongWall', ROUND(v_sf_long_wall::numeric, 2),
        'sfShortWall', ROUND(v_sf_short_wall::numeric, 2),
        'sfTotal', ROUND((v_sf_floor * 2 + GREATEST(v_sf_walls, 0))::numeric, 2)
      );

    WHEN 'elevation' THEN
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
-- FUNCTION: Aggregate Zone Totals
-- ============================================

CREATE OR REPLACE FUNCTION aggregate_zone_totals(p_zone_id UUID)
RETURNS VOID AS $$
DECLARE
  v_totals RECORD;
BEGIN
  -- Calculate totals from line items
  SELECT
    COUNT(*)::INTEGER as line_item_count,
    COALESCE(SUM(rcv), 0) as rcv_total,
    COALESCE(SUM(acv), 0) as acv_total
  INTO v_totals
  FROM estimate_line_items
  WHERE zone_id = p_zone_id AND is_approved = true;

  -- Update zone
  UPDATE estimate_zones
  SET line_item_count = v_totals.line_item_count,
      rcv_total = v_totals.rcv_total,
      acv_total = v_totals.acv_total,
      updated_at = NOW()
  WHERE id = p_zone_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Aggregate Area Totals
-- ============================================

CREATE OR REPLACE FUNCTION aggregate_area_totals(p_area_id UUID)
RETURNS VOID AS $$
DECLARE
  v_totals RECORD;
BEGIN
  -- Calculate totals from zones
  SELECT
    COALESCE(SUM((dimensions->>'sfFloor')::DECIMAL), 0) as total_sf,
    COALESCE(SUM(rcv_total), 0) as rcv_total,
    COALESCE(SUM(acv_total), 0) as acv_total
  INTO v_totals
  FROM estimate_zones
  WHERE area_id = p_area_id;

  -- Update area
  UPDATE estimate_areas
  SET total_sf = v_totals.total_sf,
      rcv_total = v_totals.rcv_total,
      acv_total = v_totals.acv_total,
      updated_at = NOW()
  WHERE id = p_area_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Aggregate Structure Totals
-- ============================================

CREATE OR REPLACE FUNCTION aggregate_structure_totals(p_structure_id UUID)
RETURNS VOID AS $$
DECLARE
  v_totals RECORD;
BEGIN
  -- Calculate totals from areas
  SELECT
    COALESCE(SUM(total_sf), 0) as total_sf,
    COALESCE(SUM(rcv_total), 0) as rcv_total,
    COALESCE(SUM(acv_total), 0) as acv_total
  INTO v_totals
  FROM estimate_areas
  WHERE structure_id = p_structure_id;

  -- Update structure
  UPDATE estimate_structures
  SET total_sf = v_totals.total_sf,
      rcv_total = v_totals.rcv_total,
      acv_total = v_totals.acv_total,
      updated_at = NOW()
  WHERE id = p_structure_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Aggregate Zone Totals on Line Item Change
-- ============================================

CREATE OR REPLACE FUNCTION trigger_aggregate_zone_on_line_item()
RETURNS TRIGGER AS $$
DECLARE
  v_zone_id UUID;
  v_area_id UUID;
  v_structure_id UUID;
BEGIN
  -- Get zone_id
  IF TG_OP = 'DELETE' THEN
    v_zone_id := OLD.zone_id;
  ELSE
    v_zone_id := NEW.zone_id;
  END IF;

  -- Aggregate zone totals
  IF v_zone_id IS NOT NULL THEN
    PERFORM aggregate_zone_totals(v_zone_id);

    -- Get area_id and structure_id for cascading update
    SELECT area_id INTO v_area_id FROM estimate_zones WHERE id = v_zone_id;
    IF v_area_id IS NOT NULL THEN
      PERFORM aggregate_area_totals(v_area_id);

      SELECT structure_id INTO v_structure_id FROM estimate_areas WHERE id = v_area_id;
      IF v_structure_id IS NOT NULL THEN
        PERFORM aggregate_structure_totals(v_structure_id);
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS line_item_aggregate_zone ON estimate_line_items;

CREATE TRIGGER line_item_aggregate_zone
AFTER INSERT OR UPDATE OR DELETE ON estimate_line_items
FOR EACH ROW
EXECUTE FUNCTION trigger_aggregate_zone_on_line_item();

-- ============================================
-- TRIGGER: Recalculate Zone on Subroom Change
-- ============================================

CREATE OR REPLACE FUNCTION trigger_recalc_zone_on_subroom()
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

DROP TRIGGER IF EXISTS subroom_recalc ON estimate_subrooms;

CREATE TRIGGER subroom_recalc
AFTER INSERT OR UPDATE OR DELETE ON estimate_subrooms
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_zone_on_subroom();

-- ============================================
-- FUNCTION: Calculate Line Item with Dimension
-- Auto-calculates quantity based on zone dimension
-- ============================================

CREATE OR REPLACE FUNCTION calculate_line_item_from_dimension(
  p_zone_id UUID,
  p_dimension_key VARCHAR,
  p_unit_price DECIMAL,
  p_tax_rate DECIMAL DEFAULT 0,
  p_depreciation_pct DECIMAL DEFAULT 0,
  p_is_recoverable BOOLEAN DEFAULT true
) RETURNS TABLE (
  quantity DECIMAL,
  subtotal DECIMAL,
  tax_amount DECIMAL,
  rcv DECIMAL,
  depreciation_amount DECIMAL,
  acv DECIMAL
) AS $$
DECLARE
  v_dimensions JSONB;
  v_quantity DECIMAL;
  v_subtotal DECIMAL;
  v_tax DECIMAL;
  v_rcv DECIMAL;
  v_dep DECIMAL;
  v_acv DECIMAL;
BEGIN
  -- Get zone dimensions
  SELECT dimensions INTO v_dimensions FROM estimate_zones WHERE id = p_zone_id;

  IF v_dimensions IS NULL THEN
    RETURN;
  END IF;

  -- Get dimension value
  v_quantity := COALESCE((v_dimensions->>p_dimension_key)::DECIMAL, 0);

  IF v_quantity = 0 THEN
    RETURN;
  END IF;

  -- Calculate totals
  v_subtotal := v_quantity * p_unit_price;
  v_tax := v_subtotal * COALESCE(p_tax_rate, 0);
  v_rcv := v_subtotal + v_tax;
  v_dep := v_rcv * (COALESCE(p_depreciation_pct, 0) / 100);
  v_acv := v_rcv - v_dep;

  RETURN QUERY SELECT
    ROUND(v_quantity, 4),
    ROUND(v_subtotal, 2),
    ROUND(v_tax, 2),
    ROUND(v_rcv, 2),
    ROUND(v_dep, 2),
    ROUND(v_acv, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$ BEGIN RAISE NOTICE 'Estimate enhancements migration completed successfully!'; END $$;
