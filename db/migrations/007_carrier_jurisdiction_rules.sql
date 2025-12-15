-- ============================================
-- Migration 007: Carrier & Jurisdiction Rules Engine
-- Claims IQ Sketch - Institutional Logic Layer
-- ============================================
--
-- This migration adds deterministic carrier and jurisdiction-aware rules:
-- 1. Carrier rules - carrier-specific constraints, caps, exclusions
-- 2. Jurisdiction rules - regional tax, O&P, and regulatory constraints
-- 3. Rule evaluation audit trail - explainability for every modification
--
-- DESIGN PRINCIPLES:
-- - Data-driven rules (no hardcoded carrier names in logic)
-- - Additive rules with explicit overrides
-- - Full explainability - every change is documented
-- - Deterministic evaluation - no AI decision-making
--
-- BACKWARD COMPATIBLE: All new tables and fields.
-- ============================================

-- ============================================
-- PART 1: CARRIER PROFILES TABLE (Enhanced)
-- ============================================
-- Extend existing carrier_profiles concept with full rule configuration

CREATE TABLE IF NOT EXISTS carrier_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),

  -- Carrier classification
  carrier_type VARCHAR(50) NOT NULL DEFAULT 'national', -- national, regional, specialty
  strictness_level VARCHAR(20) NOT NULL DEFAULT 'standard', -- lenient, standard, strict

  -- O&P Rules
  op_threshold DECIMAL(12,2) DEFAULT 2500.00,
  op_trade_minimum INTEGER DEFAULT 3,
  op_pct_overhead DECIMAL(5,2) DEFAULT 10.00,
  op_pct_profit DECIMAL(5,2) DEFAULT 10.00,

  -- Tax Rules
  tax_on_materials_only BOOLEAN DEFAULT false,
  tax_on_labor BOOLEAN DEFAULT true,
  tax_on_equipment BOOLEAN DEFAULT false,

  -- Depreciation Rules
  depreciation_method VARCHAR(30) DEFAULT 'straight_line',
  max_depreciation_pct DECIMAL(5,2) DEFAULT 80.00,
  default_depreciation_recoverable BOOLEAN DEFAULT true,

  -- Documentation Requirements
  requires_photos_all_rooms BOOLEAN DEFAULT false,
  requires_moisture_readings BOOLEAN DEFAULT false,
  requires_itemized_invoice BOOLEAN DEFAULT true,

  -- Rule Configuration (JSONB for flexibility)
  rule_config JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE carrier_profiles IS 'Carrier-specific configuration and rule sets';
COMMENT ON COLUMN carrier_profiles.strictness_level IS 'Overall carrier strictness: lenient, standard, strict';
COMMENT ON COLUMN carrier_profiles.rule_config IS 'JSONB configuration for additional carrier-specific rules';

-- ============================================
-- PART 2: CARRIER RULES TABLE
-- ============================================
-- Individual rules that apply per carrier

CREATE TABLE IF NOT EXISTS carrier_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id UUID NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,

  -- Rule identification
  rule_code VARCHAR(50) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL, -- exclusion, cap, documentation, combination, modification

  -- What does this rule affect?
  target_type VARCHAR(50) NOT NULL, -- line_item, category, trade, estimate
  target_value VARCHAR(100), -- specific line item code, category ID, trade code, or null for estimate-level

  -- Rule conditions (when does this rule apply?)
  conditions JSONB DEFAULT '{}'::jsonb,
  -- Example: {"damage_type": ["water"], "claim_total_min": 10000}

  -- Rule effect
  effect_type VARCHAR(50) NOT NULL, -- exclude, cap_quantity, cap_cost, require_doc, warn, modify_pct
  effect_value JSONB NOT NULL, -- varies by effect_type
  -- Examples:
  -- exclude: {"reason": "Not covered under this policy"}
  -- cap_quantity: {"max_quantity": 100, "max_per_zone": 50}
  -- cap_cost: {"max_total": 5000, "max_per_unit": 25}
  -- require_doc: {"required": ["photo", "moisture_reading"], "justification_min_length": 50}
  -- modify_pct: {"multiplier": 0.85, "reason": "Carrier maximum rate"}

  -- Rule metadata
  explanation_template TEXT, -- Template for human-readable explanation
  carrier_reference VARCHAR(255), -- Reference to carrier policy section
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,

  -- Priority for rule ordering (lower = higher priority)
  priority INTEGER DEFAULT 100,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(carrier_profile_id, rule_code)
);

COMMENT ON TABLE carrier_rules IS 'Individual carrier-specific rules for estimate behavior';
COMMENT ON COLUMN carrier_rules.rule_type IS 'Type of rule: exclusion, cap, documentation, combination, modification';
COMMENT ON COLUMN carrier_rules.effect_type IS 'What the rule does: exclude, cap_quantity, cap_cost, require_doc, warn, modify_pct';

CREATE INDEX IF NOT EXISTS idx_carrier_rules_profile ON carrier_rules(carrier_profile_id);
CREATE INDEX IF NOT EXISTS idx_carrier_rules_type ON carrier_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_carrier_rules_target ON carrier_rules(target_type, target_value);

-- ============================================
-- PART 3: JURISDICTIONS TABLE
-- ============================================
-- Regional/state-level configuration

CREATE TABLE IF NOT EXISTS jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  code VARCHAR(20) NOT NULL UNIQUE, -- e.g., US-TX, US-FL, US-CA
  name VARCHAR(255) NOT NULL,
  state_code VARCHAR(10),
  country_code VARCHAR(10) DEFAULT 'US',

  -- Tax Configuration
  sales_tax_rate DECIMAL(6,4) DEFAULT 0.0000,
  labor_taxable BOOLEAN DEFAULT false,
  materials_taxable BOOLEAN DEFAULT true,
  equipment_taxable BOOLEAN DEFAULT false,

  -- O&P Configuration
  op_allowed BOOLEAN DEFAULT true,
  op_threshold_override DECIMAL(12,2),
  op_trade_minimum_override INTEGER,
  op_max_pct DECIMAL(5,2) DEFAULT 20.00, -- Max combined O&P percentage

  -- Labor Restrictions
  licensed_trades_only BOOLEAN DEFAULT false,
  licensed_trades JSONB DEFAULT '[]'::jsonb, -- List of trades requiring license
  labor_rate_maximum JSONB DEFAULT '{}'::jsonb, -- Max rates by trade

  -- Regional Minimums
  minimum_charge DECIMAL(12,2),
  service_call_minimum DECIMAL(12,2),

  -- Regulatory Constraints
  regulatory_constraints JSONB DEFAULT '{}'::jsonb,
  -- Example: {"asbestos_testing_required_pre_1980": true, "lead_testing_required_pre_1978": true}

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE jurisdictions IS 'Regional/state-level rules and constraints';
COMMENT ON COLUMN jurisdictions.labor_taxable IS 'Whether labor is subject to sales tax in this jurisdiction';
COMMENT ON COLUMN jurisdictions.regulatory_constraints IS 'JSONB configuration for regulatory requirements';

CREATE INDEX IF NOT EXISTS idx_jurisdictions_state ON jurisdictions(state_code);
CREATE INDEX IF NOT EXISTS idx_jurisdictions_country ON jurisdictions(country_code);

-- ============================================
-- PART 4: JURISDICTION RULES TABLE
-- ============================================
-- Individual rules that apply per jurisdiction

CREATE TABLE IF NOT EXISTS jurisdiction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,

  -- Rule identification
  rule_code VARCHAR(50) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL, -- tax, labor, op, regulatory, minimum

  -- What does this rule affect?
  target_type VARCHAR(50) NOT NULL, -- line_item, category, trade, estimate, tax
  target_value VARCHAR(100),

  -- Rule conditions
  conditions JSONB DEFAULT '{}'::jsonb,

  -- Rule effect
  effect_type VARCHAR(50) NOT NULL,
  effect_value JSONB NOT NULL,

  -- Rule metadata
  explanation_template TEXT,
  regulatory_reference VARCHAR(255), -- Reference to state code/regulation
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,

  -- Priority
  priority INTEGER DEFAULT 100,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(jurisdiction_id, rule_code)
);

COMMENT ON TABLE jurisdiction_rules IS 'Individual jurisdiction-specific rules';

CREATE INDEX IF NOT EXISTS idx_jurisdiction_rules_jurisdiction ON jurisdiction_rules(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_rules_type ON jurisdiction_rules(rule_type);

-- ============================================
-- PART 5: RULE EFFECTS TABLE (Audit Trail)
-- ============================================
-- Tracks every rule application for explainability

CREATE TABLE IF NOT EXISTS rule_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was affected
  estimate_id UUID NOT NULL,
  estimate_line_item_id UUID, -- NULL if estimate-level effect
  zone_id UUID,

  -- Rule source
  rule_source VARCHAR(20) NOT NULL, -- carrier, jurisdiction, line_item_default
  rule_id UUID, -- Reference to carrier_rules or jurisdiction_rules
  rule_code VARCHAR(50) NOT NULL,

  -- Effect details
  effect_type VARCHAR(50) NOT NULL, -- cap, exclusion, documentation, modification, warning

  -- Values
  original_value JSONB, -- What it was before
  modified_value JSONB, -- What it became

  -- Explanation (human-readable, carrier-safe)
  explanation_text TEXT NOT NULL,

  -- Metadata
  applied_at TIMESTAMP DEFAULT NOW(),
  applied_by VARCHAR(100), -- System or user who triggered

  -- For carrier review
  is_override BOOLEAN DEFAULT false,
  override_reason TEXT,
  override_by VARCHAR(100)
);

COMMENT ON TABLE rule_effects IS 'Audit trail of all rule applications for explainability';
COMMENT ON COLUMN rule_effects.explanation_text IS 'Human-readable explanation safe for carrier review';

CREATE INDEX IF NOT EXISTS idx_rule_effects_estimate ON rule_effects(estimate_id);
CREATE INDEX IF NOT EXISTS idx_rule_effects_line_item ON rule_effects(estimate_line_item_id);
CREATE INDEX IF NOT EXISTS idx_rule_effects_source ON rule_effects(rule_source);
CREATE INDEX IF NOT EXISTS idx_rule_effects_type ON rule_effects(effect_type);

-- ============================================
-- PART 6: EXTEND ESTIMATES TABLE
-- ============================================
-- Add jurisdiction reference to estimates

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'jurisdiction_id') THEN
    ALTER TABLE estimates ADD COLUMN jurisdiction_id UUID REFERENCES jurisdictions(id);
    COMMENT ON COLUMN estimates.jurisdiction_id IS 'Reference to jurisdiction for regional rules';
  END IF;
END $$;

-- Add rules evaluation status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'rules_evaluated_at') THEN
    ALTER TABLE estimates ADD COLUMN rules_evaluated_at TIMESTAMP;
    COMMENT ON COLUMN estimates.rules_evaluated_at IS 'When carrier/jurisdiction rules were last evaluated';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'rules_evaluation_version') THEN
    ALTER TABLE estimates ADD COLUMN rules_evaluation_version INTEGER DEFAULT 0;
    COMMENT ON COLUMN estimates.rules_evaluation_version IS 'Version of rules evaluation for change detection';
  END IF;
END $$;

-- ============================================
-- PART 7: EXTEND ESTIMATE LINE ITEMS TABLE
-- ============================================
-- Add rule tracking fields to line items

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'rule_status') THEN
    ALTER TABLE estimate_line_items ADD COLUMN rule_status VARCHAR(30) DEFAULT 'allowed';
    COMMENT ON COLUMN estimate_line_items.rule_status IS 'Status after rules: allowed, modified, denied, warning';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'original_quantity') THEN
    ALTER TABLE estimate_line_items ADD COLUMN original_quantity DECIMAL(12,4);
    COMMENT ON COLUMN estimate_line_items.original_quantity IS 'Quantity before rule modifications';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'original_unit_price') THEN
    ALTER TABLE estimate_line_items ADD COLUMN original_unit_price DECIMAL(12,4);
    COMMENT ON COLUMN estimate_line_items.original_unit_price IS 'Unit price before rule modifications';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'rule_explanation') THEN
    ALTER TABLE estimate_line_items ADD COLUMN rule_explanation TEXT;
    COMMENT ON COLUMN estimate_line_items.rule_explanation IS 'Summary of rules applied to this item';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'documentation_required') THEN
    ALTER TABLE estimate_line_items ADD COLUMN documentation_required JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN estimate_line_items.documentation_required IS 'List of required documentation per carrier rules';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_line_items' AND column_name = 'documentation_provided') THEN
    ALTER TABLE estimate_line_items ADD COLUMN documentation_provided JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN estimate_line_items.documentation_provided IS 'List of documentation that has been provided';
  END IF;
END $$;

-- Index for finding items by rule status
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_rule_status ON estimate_line_items(rule_status);

-- ============================================
-- PART 8: CARRIER EXCLUDED ITEMS TABLE
-- ============================================
-- Quick lookup for carrier-specific exclusions

CREATE TABLE IF NOT EXISTS carrier_excluded_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id UUID NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,
  line_item_code VARCHAR(50) NOT NULL,
  exclusion_reason TEXT NOT NULL,
  carrier_reference VARCHAR(255),
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(carrier_profile_id, line_item_code)
);

COMMENT ON TABLE carrier_excluded_items IS 'Quick lookup for carrier-excluded line items';

CREATE INDEX IF NOT EXISTS idx_carrier_excluded_profile ON carrier_excluded_items(carrier_profile_id);
CREATE INDEX IF NOT EXISTS idx_carrier_excluded_code ON carrier_excluded_items(line_item_code);

-- ============================================
-- PART 9: CARRIER ITEM CAPS TABLE
-- ============================================
-- Quick lookup for carrier-specific quantity/cost caps

CREATE TABLE IF NOT EXISTS carrier_item_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id UUID NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,

  -- Target
  line_item_code VARCHAR(50),
  category_id VARCHAR(20),

  -- Caps
  max_quantity DECIMAL(12,4),
  max_quantity_per_zone DECIMAL(12,4),
  max_unit_price DECIMAL(12,4),
  max_total_cost DECIMAL(12,2),

  -- Explanation
  cap_reason TEXT,
  carrier_reference VARCHAR(255),

  -- Validity
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT carrier_item_caps_target CHECK (line_item_code IS NOT NULL OR category_id IS NOT NULL)
);

COMMENT ON TABLE carrier_item_caps IS 'Carrier-specific quantity and cost caps';

CREATE INDEX IF NOT EXISTS idx_carrier_caps_profile ON carrier_item_caps(carrier_profile_id);
CREATE INDEX IF NOT EXISTS idx_carrier_caps_code ON carrier_item_caps(line_item_code);
CREATE INDEX IF NOT EXISTS idx_carrier_caps_category ON carrier_item_caps(category_id);

-- ============================================
-- PART 10: SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 007: Carrier & Jurisdiction Rules Engine completed successfully!';
  RAISE NOTICE 'New tables: carrier_profiles, carrier_rules, jurisdictions, jurisdiction_rules, rule_effects, carrier_excluded_items, carrier_item_caps';
  RAISE NOTICE 'Extended: estimates (jurisdiction_id, rules_evaluated_at), estimate_line_items (rule_status, original_*, rule_explanation, documentation_*)';
END $$;
