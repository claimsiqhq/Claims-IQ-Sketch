-- Migration: Scope Engine Foundation
--
-- PURPOSE: Create foundational tables for scope-driven estimation
-- - scope_trades: Trade definitions (DRY, PNT, FLR, RFG, ELE, PLM, HVAC, MIT)
-- - scope_line_items: Line item catalog with Xactimate-style codes
-- - scope_items: Assembled scope items linking geometry to line items
--
-- DESIGN: Scope is independent of pricing. This migration creates the
-- "WHAT work is required" layer without any pricing calculations.
--
-- See: docs/SCOPE_ENGINE.md for full architecture details.

BEGIN;

-- ============================================
-- SCOPE TRADES TABLE
-- ============================================
-- Canonical trade definitions for construction work
-- These map to Xactimate trades and drive O&P eligibility

CREATE TABLE IF NOT EXISTS scope_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trade code (unique identifier)
  code VARCHAR(10) NOT NULL UNIQUE,

  -- Display name
  name VARCHAR(100) NOT NULL,

  -- Description
  description TEXT,

  -- Xactimate category prefix mapping (e.g., DRY -> "09")
  xact_category_prefix VARCHAR(10),

  -- Sort order for display
  sort_order INTEGER DEFAULT 0,

  -- Whether this trade counts toward O&P eligibility (3-trade rule)
  op_eligible BOOLEAN DEFAULT true,

  -- Is active
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert standard trades
INSERT INTO scope_trades (code, name, description, xact_category_prefix, sort_order, op_eligible) VALUES
  ('DRY', 'Drywall', 'Drywall installation, finishing, and repair', '09', 1, true),
  ('PNT', 'Painting', 'Interior and exterior painting', '09', 2, true),
  ('FLR', 'Flooring', 'Floor covering installation and repair', '09', 3, true),
  ('RFG', 'Roofing', 'Roof installation, repair, and replacement', '07', 4, true),
  ('ELE', 'Electrical', 'Electrical systems and fixtures', '16', 5, true),
  ('PLM', 'Plumbing', 'Plumbing systems and fixtures', '15', 6, true),
  ('HVAC', 'HVAC', 'Heating, ventilation, and air conditioning', '15', 7, true),
  ('MIT', 'Mitigation', 'Water/fire/mold mitigation services', '01', 8, false),
  ('DEM', 'Demolition', 'Demolition and debris removal', '02', 9, true),
  ('CAR', 'Carpentry', 'Rough and finish carpentry', '06', 10, true),
  ('INS', 'Insulation', 'Insulation installation', '07', 11, true),
  ('CAB', 'Cabinetry', 'Cabinet installation and repair', '06', 12, true),
  ('CTR', 'Countertops', 'Countertop fabrication and installation', '06', 13, true),
  ('WIN', 'Windows', 'Window installation and repair', '08', 14, true),
  ('EXT', 'Exteriors', 'Siding, trim, and exterior finishes', '07', 15, true),
  ('GEN', 'General', 'General conditions and supervision', '01', 16, false)
ON CONFLICT (code) DO NOTHING;

-- Create index for scope_trades
CREATE INDEX IF NOT EXISTS scope_trades_code_idx ON scope_trades(code);

-- ============================================
-- SCOPE LINE ITEMS CATALOG TABLE
-- ============================================
-- Minimal catalog of line items with Xactimate-style codes
-- Focused on scope (what work) not pricing (how much)

CREATE TABLE IF NOT EXISTS scope_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Xactimate-style item code (e.g., "DRY HANG", "PNT RESI")
  code VARCHAR(30) NOT NULL UNIQUE,

  -- Full description
  description TEXT NOT NULL,

  -- Unit of measure (SF, LF, EA, SQ, SY, HR, DAY)
  unit VARCHAR(10) NOT NULL,

  -- Trade reference
  trade_code VARCHAR(10) NOT NULL REFERENCES scope_trades(code),

  -- Xactimate category code (optional, for mapping)
  xact_category_code VARCHAR(10),

  -- Default waste factor (e.g., 0.10 for 10% waste)
  default_waste_factor DECIMAL(4, 3) DEFAULT 0.00,

  -- Quantity formula reference (metric key from ZoneMetrics)
  -- Examples: FLOOR_SF, WALL_SF_NET, CEILING_SF, PERIMETER_LF, ROOF_SQ
  quantity_formula VARCHAR(50),

  -- Companion rules (JSONB)
  -- Structure: { "requires": ["CODE1"], "auto_adds": ["CODE2"], "excludes": ["CODE3"] }
  companion_rules JSONB DEFAULT '{}'::jsonb,

  -- Scope conditions (when this item applies)
  -- Structure: { "damage_types": ["water"], "surfaces": ["floor"], "severity": ["moderate"] }
  scope_conditions JSONB DEFAULT '{}'::jsonb,

  -- Coverage type: A=Dwelling, B=Other Structures, C=Contents
  coverage_type VARCHAR(1) DEFAULT 'A',

  -- Activity type for grouping (remove, install, repair, clean, etc.)
  activity_type VARCHAR(20) DEFAULT 'install',

  -- Sort order within trade
  sort_order INTEGER DEFAULT 0,

  -- Is active
  is_active BOOLEAN DEFAULT true,

  -- Notes for adjusters
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for scope_line_items
CREATE INDEX IF NOT EXISTS scope_items_code_idx ON scope_line_items(code);
CREATE INDEX IF NOT EXISTS scope_items_trade_idx ON scope_line_items(trade_code);
CREATE INDEX IF NOT EXISTS scope_items_unit_idx ON scope_line_items(unit);
CREATE INDEX IF NOT EXISTS scope_items_activity_idx ON scope_line_items(activity_type);

-- ============================================
-- SCOPE ITEMS TABLE (Assembled Scope)
-- ============================================
-- Links zones/walls to line items with derived quantities
-- This is the "scope" - WHAT work is required

CREATE TABLE IF NOT EXISTS scope_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent estimate
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,

  -- Zone reference (where the work is)
  zone_id UUID REFERENCES estimate_zones(id) ON DELETE SET NULL,

  -- Optional wall reference (for wall-specific items)
  wall_index INTEGER,

  -- Line item reference
  line_item_id UUID REFERENCES scope_line_items(id) ON DELETE SET NULL,
  line_item_code VARCHAR(30) NOT NULL,

  -- Derived quantity (computed from geometry)
  quantity DECIMAL(12, 4) NOT NULL,

  -- Unit of measure
  unit VARCHAR(10) NOT NULL,

  -- Applied waste factor
  waste_factor DECIMAL(4, 3) DEFAULT 0.00,

  -- Quantity with waste applied
  quantity_with_waste DECIMAL(12, 4) NOT NULL,

  -- Provenance: How was this scope item created?
  -- geometry_derived | manual | template | ai_suggested | voice_command
  provenance VARCHAR(30) NOT NULL DEFAULT 'geometry_derived',

  -- Provenance details (JSONB)
  -- Structure: { "source_metric": "FLOOR_SF", "formula": "FLOOR_SF", "computed_at": "..." }
  provenance_details JSONB DEFAULT '{}'::jsonb,

  -- Trade code (denormalized for quick access)
  trade_code VARCHAR(10),

  -- Coverage type (denormalized)
  coverage_type VARCHAR(1) DEFAULT 'A',

  -- Sort order for display
  sort_order INTEGER DEFAULT 0,

  -- Status: pending | approved | excluded | modified
  status VARCHAR(20) DEFAULT 'pending',

  -- Notes
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for scope_items
CREATE INDEX IF NOT EXISTS scope_items_estimate_idx ON scope_items(estimate_id);
CREATE INDEX IF NOT EXISTS scope_items_zone_idx ON scope_items(zone_id);
CREATE INDEX IF NOT EXISTS scope_items_line_item_idx ON scope_items(line_item_id);
CREATE INDEX IF NOT EXISTS scope_items_trade_idx ON scope_items(trade_code);
CREATE INDEX IF NOT EXISTS scope_items_status_idx ON scope_items(status);

-- ============================================
-- SCOPE SUMMARY TABLE (Aggregate View)
-- ============================================
-- Aggregate scope by trade for quick summaries
-- NO pricing - just counts and quantities

CREATE TABLE IF NOT EXISTS scope_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent estimate
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,

  -- Trade code
  trade_code VARCHAR(10) NOT NULL REFERENCES scope_trades(code),

  -- Counts
  line_item_count INTEGER DEFAULT 0,
  zone_count INTEGER DEFAULT 0,

  -- Total quantity by unit type (JSONB)
  -- Structure: { "SF": 1200, "LF": 340, "EA": 5 }
  quantities_by_unit JSONB DEFAULT '{}'::jsonb,

  -- Status counts
  pending_count INTEGER DEFAULT 0,
  approved_count INTEGER DEFAULT 0,
  excluded_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(estimate_id, trade_code)
);

-- Create indexes for scope_summary
CREATE INDEX IF NOT EXISTS scope_summary_estimate_idx ON scope_summary(estimate_id);
CREATE INDEX IF NOT EXISTS scope_summary_trade_idx ON scope_summary(trade_code);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_scope_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scope_trades_updated_at
  BEFORE UPDATE ON scope_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_scope_trades_updated_at();

CREATE OR REPLACE FUNCTION update_scope_line_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scope_line_items_updated_at
  BEFORE UPDATE ON scope_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_scope_line_items_updated_at();

CREATE OR REPLACE FUNCTION update_scope_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scope_items_updated_at
  BEFORE UPDATE ON scope_items
  FOR EACH ROW
  EXECUTE FUNCTION update_scope_items_updated_at();

CREATE OR REPLACE FUNCTION update_scope_summary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scope_summary_updated_at
  BEFORE UPDATE ON scope_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_scope_summary_updated_at();

COMMIT;
