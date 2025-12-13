-- Complete Estimate System Migration
-- Claims IQ Sketch - Carrier-Ready Estimate Generation System
-- =============================================================

-- ============================================
-- PRICE LISTS (Xactimate-style versioning)
-- ============================================

CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  region_code VARCHAR(20) NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  source VARCHAR(50) DEFAULT 'internal',
  base_multiplier DECIMAL(5,4) DEFAULT 1.0000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_lists_region ON price_lists(region_code);
CREATE INDEX IF NOT EXISTS idx_price_lists_active ON price_lists(is_active, effective_date);

-- ============================================
-- COVERAGE TYPES
-- ============================================

CREATE TABLE IF NOT EXISTS coverage_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  default_deductible DECIMAL(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- ============================================
-- TAX RATES
-- ============================================

CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code VARCHAR(20) NOT NULL,
  tax_type VARCHAR(50) NOT NULL,
  tax_name VARCHAR(100) NOT NULL,
  rate DECIMAL(6,4) NOT NULL,
  applies_to VARCHAR(50) DEFAULT 'materials',
  is_active BOOLEAN DEFAULT true,
  effective_date DATE DEFAULT CURRENT_DATE,
  UNIQUE(region_code, tax_type)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_region ON tax_rates(region_code);

-- ============================================
-- DEPRECIATION SCHEDULES
-- ============================================

CREATE TABLE IF NOT EXISTS depreciation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code VARCHAR(20) NOT NULL,
  item_type VARCHAR(100) NOT NULL,
  useful_life_years INTEGER NOT NULL,
  max_depreciation_pct DECIMAL(5,2) DEFAULT 80.00,
  depreciation_method VARCHAR(30) DEFAULT 'straight_line',
  condition_adjustment_good DECIMAL(5,2) DEFAULT 0.85,
  condition_adjustment_poor DECIMAL(5,2) DEFAULT 1.15,
  is_depreciable BOOLEAN DEFAULT true,
  notes TEXT,
  UNIQUE(category_code, item_type)
);

CREATE INDEX IF NOT EXISTS idx_depreciation_category ON depreciation_schedules(category_code);

-- ============================================
-- REGIONAL MULTIPLIERS (enhanced)
-- ============================================

CREATE TABLE IF NOT EXISTS regional_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code VARCHAR(20) NOT NULL UNIQUE,
  region_name VARCHAR(100) NOT NULL,
  material_multiplier DECIMAL(5,4) DEFAULT 1.0000,
  labor_multiplier DECIMAL(5,4) DEFAULT 1.0000,
  equipment_multiplier DECIMAL(5,4) DEFAULT 1.0000,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- LABOR RATES BY TRADE (enhanced)
-- ============================================

-- Add columns to existing labor_rates if needed, or create enhanced version
CREATE TABLE IF NOT EXISTS labor_rates_enhanced (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_code VARCHAR(20) NOT NULL,
  trade_name VARCHAR(100) NOT NULL,
  base_hourly_rate DECIMAL(10,2) NOT NULL,
  overtime_multiplier DECIMAL(4,2) DEFAULT 1.50,
  region_code VARCHAR(20) DEFAULT 'NATIONAL',
  effective_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(trade_code, region_code)
);

CREATE INDEX IF NOT EXISTS idx_labor_rates_trade ON labor_rates_enhanced(trade_code);
CREATE INDEX IF NOT EXISTS idx_labor_rates_region ON labor_rates_enhanced(region_code);

-- ============================================
-- DAMAGE AREAS (Spatial Hierarchy)
-- ============================================

CREATE TABLE IF NOT EXISTS damage_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL,
  parent_area_id UUID REFERENCES damage_areas(id),
  sketch_zone_id UUID,

  name VARCHAR(100) NOT NULL,
  area_type VARCHAR(50) NOT NULL,

  -- Measurements from Sketch
  measurements JSONB DEFAULT '{}'::jsonb,

  -- Photos
  photo_ids JSONB DEFAULT '[]'::jsonb,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_damage_areas_estimate ON damage_areas(estimate_id);
CREATE INDEX IF NOT EXISTS idx_damage_areas_parent ON damage_areas(parent_area_id);

-- ============================================
-- ENHANCED CARRIER PROFILES
-- ============================================

-- Add missing columns to carrier_profiles if they exist
DO $$
BEGIN
  -- Add op_threshold column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'carrier_profiles' AND column_name = 'op_threshold') THEN
    ALTER TABLE carrier_profiles ADD COLUMN op_threshold DECIMAL(10,2) DEFAULT 0.00;
  END IF;

  -- Add op_trade_minimum column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'carrier_profiles' AND column_name = 'op_trade_minimum') THEN
    ALTER TABLE carrier_profiles ADD COLUMN op_trade_minimum INTEGER DEFAULT 3;
  END IF;

  -- Add tax_on_materials_only column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'carrier_profiles' AND column_name = 'tax_on_materials_only') THEN
    ALTER TABLE carrier_profiles ADD COLUMN tax_on_materials_only BOOLEAN DEFAULT true;
  END IF;

  -- Add depreciation_method column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'carrier_profiles' AND column_name = 'depreciation_method') THEN
    ALTER TABLE carrier_profiles ADD COLUMN depreciation_method VARCHAR(30) DEFAULT 'straight_line';
  END IF;

  -- Add max_depreciation_pct column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'carrier_profiles' AND column_name = 'max_depreciation_pct') THEN
    ALTER TABLE carrier_profiles ADD COLUMN max_depreciation_pct DECIMAL(5,2) DEFAULT 80.00;
  END IF;
END $$;

-- ============================================
-- ENHANCED ESTIMATES TABLE
-- ============================================

-- Add new columns to estimates table for RCV/ACV/depreciation
DO $$
BEGIN
  -- Date of loss
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'date_of_loss') THEN
    ALTER TABLE estimates ADD COLUMN date_of_loss DATE;
  END IF;

  -- Date inspected
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'date_inspected') THEN
    ALTER TABLE estimates ADD COLUMN date_inspected DATE;
  END IF;

  -- Property year built
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'year_built') THEN
    ALTER TABLE estimates ADD COLUMN year_built INTEGER;
  END IF;

  -- Roof age
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'roof_age_years') THEN
    ALTER TABLE estimates ADD COLUMN roof_age_years INTEGER;
  END IF;

  -- Overall condition
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'overall_condition') THEN
    ALTER TABLE estimates ADD COLUMN overall_condition VARCHAR(20) DEFAULT 'Average';
  END IF;

  -- Deductibles by coverage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deductible_cov_a') THEN
    ALTER TABLE estimates ADD COLUMN deductible_cov_a DECIMAL(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deductible_cov_b') THEN
    ALTER TABLE estimates ADD COLUMN deductible_cov_b DECIMAL(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deductible_cov_c') THEN
    ALTER TABLE estimates ADD COLUMN deductible_cov_c DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Material/Labor/Equipment subtotals
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'subtotal_materials') THEN
    ALTER TABLE estimates ADD COLUMN subtotal_materials DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'subtotal_labor') THEN
    ALTER TABLE estimates ADD COLUMN subtotal_labor DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'subtotal_equipment') THEN
    ALTER TABLE estimates ADD COLUMN subtotal_equipment DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- RCV/ACV totals
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'total_rcv') THEN
    ALTER TABLE estimates ADD COLUMN total_rcv DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'total_depreciation') THEN
    ALTER TABLE estimates ADD COLUMN total_depreciation DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'total_acv') THEN
    ALTER TABLE estimates ADD COLUMN total_acv DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'recoverable_depreciation') THEN
    ALTER TABLE estimates ADD COLUMN recoverable_depreciation DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'non_recoverable_depreciation') THEN
    ALTER TABLE estimates ADD COLUMN non_recoverable_depreciation DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- Net claims by coverage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'net_claim_cov_a') THEN
    ALTER TABLE estimates ADD COLUMN net_claim_cov_a DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'net_claim_cov_b') THEN
    ALTER TABLE estimates ADD COLUMN net_claim_cov_b DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'net_claim_cov_c') THEN
    ALTER TABLE estimates ADD COLUMN net_claim_cov_c DECIMAL(12,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'net_claim_total') THEN
    ALTER TABLE estimates ADD COLUMN net_claim_total DECIMAL(12,2) DEFAULT 0;
  END IF;

  -- Price list reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'price_list_id') THEN
    ALTER TABLE estimates ADD COLUMN price_list_id UUID;
  END IF;
END $$;

-- ============================================
-- ENHANCED ESTIMATE LINE ITEMS
-- ============================================

DO $$
BEGIN
  -- Add line_rcv column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'line_rcv') THEN
    ALTER TABLE estimate_line_items ADD COLUMN line_rcv DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add tax_amount column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'tax_amount') THEN
    ALTER TABLE estimate_line_items ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Waste tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'waste_factor') THEN
    ALTER TABLE estimate_line_items ADD COLUMN waste_factor DECIMAL(4,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'waste_amount') THEN
    ALTER TABLE estimate_line_items ADD COLUMN waste_amount DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Depreciation fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'age_years') THEN
    ALTER TABLE estimate_line_items ADD COLUMN age_years INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'useful_life_years') THEN
    ALTER TABLE estimate_line_items ADD COLUMN useful_life_years INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'condition') THEN
    ALTER TABLE estimate_line_items ADD COLUMN condition VARCHAR(20) DEFAULT 'Average';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_pct') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_pct DECIMAL(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_amount') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_amount DECIMAL(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_recoverable') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_recoverable BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'acv') THEN
    ALTER TABLE estimate_line_items ADD COLUMN acv DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Coverage assignment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'coverage_code') THEN
    ALTER TABLE estimate_line_items ADD COLUMN coverage_code VARCHAR(10) DEFAULT 'A';
  END IF;

  -- Damage area reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'damage_area_id') THEN
    ALTER TABLE estimate_line_items ADD COLUMN damage_area_id UUID;
  END IF;
END $$;

-- ============================================
-- ESTIMATE COVERAGE SUMMARY
-- ============================================

CREATE TABLE IF NOT EXISTS estimate_coverage_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL,
  coverage_code VARCHAR(10) NOT NULL,

  subtotal_rcv DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  overhead_amount DECIMAL(12,2) DEFAULT 0,
  profit_amount DECIMAL(12,2) DEFAULT 0,
  total_rcv DECIMAL(12,2) DEFAULT 0,

  recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  non_recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  total_depreciation DECIMAL(12,2) DEFAULT 0,

  total_acv DECIMAL(12,2) DEFAULT 0,
  deductible DECIMAL(12,2) DEFAULT 0,
  net_claim DECIMAL(12,2) DEFAULT 0,

  UNIQUE(estimate_id, coverage_code)
);

CREATE INDEX IF NOT EXISTS idx_coverage_summary_estimate ON estimate_coverage_summary(estimate_id);

-- ============================================
-- ADD DEPRECIATION TYPE TO LINE ITEMS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'depreciation_type') THEN
    ALTER TABLE line_items ADD COLUMN depreciation_type VARCHAR(100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'default_coverage_code') THEN
    ALTER TABLE line_items ADD COLUMN default_coverage_code VARCHAR(10) DEFAULT 'A';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'trade_code') THEN
    ALTER TABLE line_items ADD COLUMN trade_code VARCHAR(20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'labor_hours_per_unit') THEN
    ALTER TABLE line_items ADD COLUMN labor_hours_per_unit DECIMAL(6,3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'xactimate_code') THEN
    ALTER TABLE line_items ADD COLUMN xactimate_code VARCHAR(30);
  END IF;
END $$;

-- ============================================
-- ADD DEFAULT COVERAGE TO CATEGORIES
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_item_categories' AND column_name = 'default_coverage_code') THEN
    ALTER TABLE line_item_categories ADD COLUMN default_coverage_code VARCHAR(10) DEFAULT 'A';
  END IF;
END $$;

-- ============================================
-- CREATE ENHANCED ESTIMATE SUMMARY VIEW
-- ============================================

CREATE OR REPLACE VIEW estimate_full_summary AS
SELECT
    e.id,
    e.claim_id,
    e.claim_number,
    e.property_address,
    e.status,
    e.version,
    e.date_of_loss,
    e.year_built,
    e.roof_age_years,
    e.overall_condition,
    e.subtotal AS line_items_subtotal,
    e.subtotal_materials,
    e.subtotal_labor,
    e.subtotal_equipment,
    e.overhead_amount,
    e.overhead_pct,
    e.profit_amount,
    e.profit_pct,
    e.tax_amount,
    e.total_rcv,
    e.total_depreciation,
    e.total_acv,
    e.recoverable_depreciation,
    e.non_recoverable_depreciation,
    e.deductible_cov_a,
    e.deductible_cov_b,
    e.deductible_cov_c,
    e.net_claim_cov_a,
    e.net_claim_cov_b,
    e.net_claim_cov_c,
    e.net_claim_total,
    e.grand_total,
    e.region_id,
    r.name as region_name,
    cp.name as carrier_name,
    e.created_at,
    e.updated_at,
    e.submitted_at,
    (SELECT COUNT(*) FROM estimate_line_items eli WHERE eli.estimate_id = e.id) as line_item_count,
    (SELECT COUNT(DISTINCT eli.category_id) FROM estimate_line_items eli WHERE eli.estimate_id = e.id) as category_count,
    (SELECT COUNT(DISTINCT eli.coverage_code) FROM estimate_line_items eli WHERE eli.estimate_id = e.id) as coverage_count
FROM estimates e
LEFT JOIN regions r ON e.region_id = r.id
LEFT JOIN carrier_profiles cp ON e.carrier_profile_id = cp.id;

-- ============================================
-- FUNCTION: Calculate Depreciation
-- ============================================

CREATE OR REPLACE FUNCTION calculate_depreciation(
  p_age_years INTEGER,
  p_useful_life_years INTEGER,
  p_max_depreciation_pct DECIMAL,
  p_condition VARCHAR,
  p_rcv DECIMAL
) RETURNS TABLE (
  depreciation_pct DECIMAL,
  depreciation_amount DECIMAL,
  acv DECIMAL
) AS $$
DECLARE
  v_base_pct DECIMAL;
  v_condition_factor DECIMAL;
  v_final_pct DECIMAL;
  v_dep_amount DECIMAL;
BEGIN
  -- Handle non-depreciable items
  IF p_useful_life_years <= 0 OR p_useful_life_years IS NULL THEN
    RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, p_rcv;
    RETURN;
  END IF;

  -- Calculate base depreciation percentage (straight-line)
  v_base_pct := (COALESCE(p_age_years, 0)::DECIMAL / p_useful_life_years::DECIMAL) * 100;

  -- Apply condition adjustment
  CASE p_condition
    WHEN 'Good' THEN v_condition_factor := 0.85;
    WHEN 'Poor' THEN v_condition_factor := 1.15;
    ELSE v_condition_factor := 1.0;
  END CASE;

  v_final_pct := v_base_pct * v_condition_factor;

  -- Cap at maximum depreciation
  v_final_pct := LEAST(v_final_pct, COALESCE(p_max_depreciation_pct, 80));

  -- Calculate depreciation amount
  v_dep_amount := p_rcv * (v_final_pct / 100);

  RETURN QUERY SELECT
    ROUND(v_final_pct, 2),
    ROUND(v_dep_amount, 2),
    ROUND(p_rcv - v_dep_amount, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$ BEGIN RAISE NOTICE 'Complete Estimate System migration completed successfully!'; END $$;
