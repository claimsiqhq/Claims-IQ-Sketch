-- ============================================
-- Migration 006: Line Item v2 - Scope Intelligence
-- Claims IQ Sketch - Executable Scope Logic
-- ============================================
--
-- This migration adds v2 fields to enable:
-- 1. Automatic quantity calculation from zone geometry (quantity_formula)
-- 2. Deterministic scope evaluation (scope_conditions)
-- 3. Dependency management (requires_items, auto_add_items, excludes_items, replaces_items)
-- 4. Depreciation traceability (depreciation_reason)
-- 5. Carrier sensitivity tracking
--
-- BACKWARD COMPATIBLE: All new fields are nullable/additive.
-- Existing data continues to work without modification.
-- ============================================

-- ============================================
-- PART 1: EXTEND MASTER LINE ITEMS CATALOG
-- ============================================

-- quantity_formula: Declarative formula for calculating quantity from zone metrics
-- Example: "WALL_SF(zone) * 1.05", "PERIMETER_LF(zone)", "FLOOR_SF(zone)"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'quantity_formula') THEN
    ALTER TABLE line_items ADD COLUMN quantity_formula TEXT;
    COMMENT ON COLUMN line_items.quantity_formula IS 'Declarative formula for calculating quantity. Uses zone metrics like WALL_SF(zone), FLOOR_SF(zone), PERIMETER_LF(zone)';
  END IF;
END $$;

-- scope_conditions: JSON conditions that determine when this item applies
-- Example: {"damageType": ["water"], "waterCategory": [2,3], "affectedSurfaces": ["wall"]}
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'scope_conditions') THEN
    ALTER TABLE line_items ADD COLUMN scope_conditions JSONB;
    COMMENT ON COLUMN line_items.scope_conditions IS 'JSON conditions for automatic scope inclusion. All specified conditions must match.';
  END IF;
END $$;

-- requires_items: Line item codes that MUST be present if this item is used
-- Example: ["DEM-DRY-FLOOD"] for drywall install
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'requires_items') THEN
    ALTER TABLE line_items ADD COLUMN requires_items JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN line_items.requires_items IS 'Array of line item codes that must be present when this item is included';
  END IF;
END $$;

-- auto_add_items: Line item codes that should be automatically added with this item
-- Example: ["WTR-MOIST-DAILY"] when adding water extraction
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'auto_add_items') THEN
    ALTER TABLE line_items ADD COLUMN auto_add_items JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN line_items.auto_add_items IS 'Array of line item codes to automatically add when this item is included';
  END IF;
END $$;

-- excludes_items: Line item codes that cannot be present if this item is used
-- Example: ["DRY-HTT-12"] when using ["DRY-HTT-58"] (can't have both 1/2" and 5/8")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'excludes_items') THEN
    ALTER TABLE line_items ADD COLUMN excludes_items JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN line_items.excludes_items IS 'Array of line item codes that are mutually exclusive with this item';
  END IF;
END $$;

-- replaces_items: Line item codes that this item supersedes/replaces
-- Example: Full room paint replaces partial wall paint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'replaces_items') THEN
    ALTER TABLE line_items ADD COLUMN replaces_items JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN line_items.replaces_items IS 'Array of line item codes that this item replaces/supersedes';
  END IF;
END $$;

-- carrier_sensitivity_level: How closely carriers scrutinize this item
-- Values: 'low', 'medium', 'high'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'carrier_sensitivity_level') THEN
    ALTER TABLE line_items ADD COLUMN carrier_sensitivity_level VARCHAR(20) DEFAULT 'medium';
    COMMENT ON COLUMN line_items.carrier_sensitivity_level IS 'Carrier scrutiny level: low, medium, high. High items need extra documentation.';
  END IF;
END $$;

-- validation_rules: Custom validation rules for this item
-- Example: {"max_quantity_per_zone": 500, "requires_photo": true}
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'line_items' AND column_name = 'validation_rules') THEN
    ALTER TABLE line_items ADD COLUMN validation_rules JSONB;
    COMMENT ON COLUMN line_items.validation_rules IS 'Custom validation rules specific to this line item';
  END IF;
END $$;

-- ============================================
-- PART 2: EXTEND ESTIMATE LINE ITEMS
-- ============================================

-- calculated_quantity: Quantity calculated by formula (vs manual entry)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'calculated_quantity') THEN
    ALTER TABLE estimate_line_items ADD COLUMN calculated_quantity DECIMAL(12,4);
    COMMENT ON COLUMN estimate_line_items.calculated_quantity IS 'Quantity calculated by formula, before any manual adjustments';
  END IF;
END $$;

-- quantity_source: How the quantity was determined
-- Values: 'manual', 'formula', 'default', 'imported'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'quantity_source') THEN
    ALTER TABLE estimate_line_items ADD COLUMN quantity_source VARCHAR(20) DEFAULT 'manual';
    COMMENT ON COLUMN estimate_line_items.quantity_source IS 'How quantity was determined: manual, formula, default, imported';
  END IF;
END $$;

-- quantity_explanation: Human-readable explanation of quantity calculation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'quantity_explanation') THEN
    ALTER TABLE estimate_line_items ADD COLUMN quantity_explanation TEXT;
    COMMENT ON COLUMN estimate_line_items.quantity_explanation IS 'Human-readable explanation of how quantity was calculated';
  END IF;
END $$;

-- scope_reason: Why this item was included in scope
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'scope_reason') THEN
    ALTER TABLE estimate_line_items ADD COLUMN scope_reason TEXT;
    COMMENT ON COLUMN estimate_line_items.scope_reason IS 'Explanation of why this item was included in scope';
  END IF;
END $$;

-- is_auto_added: Whether this item was automatically added by dependency logic
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'is_auto_added') THEN
    ALTER TABLE estimate_line_items ADD COLUMN is_auto_added BOOLEAN DEFAULT false;
    COMMENT ON COLUMN estimate_line_items.is_auto_added IS 'Whether this item was automatically added as a dependency';
  END IF;
END $$;

-- added_by_item: If auto-added, which item triggered the addition
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'added_by_item') THEN
    ALTER TABLE estimate_line_items ADD COLUMN added_by_item VARCHAR(50);
    COMMENT ON COLUMN estimate_line_items.added_by_item IS 'Line item code that triggered auto-addition of this item';
  END IF;
END $$;

-- depreciation_reason: Explanation of depreciation calculation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'depreciation_reason') THEN
    ALTER TABLE estimate_line_items ADD COLUMN depreciation_reason TEXT;
    COMMENT ON COLUMN estimate_line_items.depreciation_reason IS 'Explanation of depreciation calculation for audit trail';
  END IF;
END $$;

-- zone_id reference (may already exist, ensure it does)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'zone_id') THEN
    ALTER TABLE estimate_line_items ADD COLUMN zone_id UUID;
    COMMENT ON COLUMN estimate_line_items.zone_id IS 'Reference to estimate_zones for zone-specific line items';
  END IF;
END $$;

-- rcv column (replacement cost value)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'rcv') THEN
    ALTER TABLE estimate_line_items ADD COLUMN rcv DECIMAL(12,2) DEFAULT 0;
    COMMENT ON COLUMN estimate_line_items.rcv IS 'Replacement Cost Value';
  END IF;
END $$;

-- ============================================
-- PART 3: CREATE INDEXES FOR NEW COLUMNS
-- ============================================

-- Index for scope condition queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_line_items_scope_conditions ON line_items USING GIN (scope_conditions);

-- Index for finding items by quantity source
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_quantity_source ON estimate_line_items(quantity_source);

-- Index for finding auto-added items
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_auto_added ON estimate_line_items(is_auto_added) WHERE is_auto_added = true;

-- Index for zone lookups on estimate line items
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_zone_id ON estimate_line_items(zone_id);

-- ============================================
-- PART 4: UPDATE SOURCE CHECK CONSTRAINT
-- ============================================

-- Update the source check constraint to include new sources
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
             WHERE table_name = 'estimate_line_items' AND constraint_name LIKE '%source%') THEN
    ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_source_check;
  END IF;

  -- Add updated constraint (this may fail silently if constraint doesn't exist)
  BEGIN
    ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_source_check
      CHECK (source IN ('manual', 'ai_suggested', 'template', 'imported', 'scope_engine', 'dimension_calc'));
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Constraint already exists
  END;
END $$;

-- ============================================
-- PART 5: SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 006: Line Item v2 - Scope Intelligence completed successfully!';
  RAISE NOTICE 'New fields added to line_items: quantity_formula, scope_conditions, requires_items, auto_add_items, excludes_items, replaces_items, carrier_sensitivity_level, validation_rules';
  RAISE NOTICE 'New fields added to estimate_line_items: calculated_quantity, quantity_source, quantity_explanation, scope_reason, is_auto_added, added_by_item, depreciation_reason';
END $$;
