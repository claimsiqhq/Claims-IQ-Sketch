-- Migration: 020_schema_audit_and_fixes.sql
-- Description: Comprehensive schema audit and fixes based on codebase analysis
-- Purpose: Ensure all tables, indexes, foreign keys, and constraints are correct and optimized
-- Date: 2025-01-XX

-- ============================================
-- PART 1: CREATE MISSING BASE TABLES
-- ============================================
-- These tables are referenced in code but may not exist in migrations
-- (Some may be in seed files, but should be in migrations)

-- USERS TABLE (if not exists from initial setup)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  username TEXT NOT NULL UNIQUE,
  email VARCHAR(255),
  password TEXT NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  current_organization_id UUID,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- REGIONS TABLE
CREATE TABLE IF NOT EXISTS regions (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL,
  state_province VARCHAR(10),
  zip_postal_prefixes TEXT[],
  currency CHAR(3) DEFAULT 'USD',
  tax_rate DECIMAL(5,4) DEFAULT 0,
  indices JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- LINE ITEM CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS line_item_categories (
  id VARCHAR(20) PRIMARY KEY,
  parent_id VARCHAR(20) REFERENCES line_item_categories(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  default_coverage_code VARCHAR(10) DEFAULT 'A'
);

-- LINE ITEMS TABLE (Master catalog)
CREATE TABLE IF NOT EXISTS line_items (
  id VARCHAR(50) PRIMARY KEY,
  category_id VARCHAR(20) REFERENCES line_item_categories(id),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit VARCHAR(20) NOT NULL,
  unit_price DECIMAL(12,4) DEFAULT 0,
  material_cost DECIMAL(12,4) DEFAULT 0,
  labor_cost DECIMAL(12,4) DEFAULT 0,
  equipment_cost DECIMAL(12,4) DEFAULT 0,
  trade_code VARCHAR(20),
  depreciation_type VARCHAR(100),
  default_coverage_code VARCHAR(10) DEFAULT 'A',
  labor_hours_per_unit DECIMAL(6,3),
  xactimate_code VARCHAR(30),
  quantity_formula TEXT,
  scope_conditions JSONB,
  requires_items JSONB DEFAULT '[]'::jsonb,
  auto_add_items JSONB DEFAULT '[]'::jsonb,
  excludes_items JSONB DEFAULT '[]'::jsonb,
  replaces_items JSONB DEFAULT '[]'::jsonb,
  carrier_sensitivity_level VARCHAR(20) DEFAULT 'medium',
  validation_rules JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ESTIMATES TABLE (if not exists)
CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  claim_number VARCHAR(50),
  property_address TEXT,
  status VARCHAR(30) DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  workflow_status VARCHAR(20) DEFAULT 'draft',
  policy_number VARCHAR(50),
  policy_type VARCHAR(50),
  xact_settings JSONB DEFAULT '{}'::jsonb,
  op_threshold DECIMAL(10,2) DEFAULT 0,
  op_trade_minimum INTEGER DEFAULT 3,
  qualifies_for_op BOOLEAN DEFAULT false,
  date_of_loss DATE,
  date_inspected DATE,
  year_built INTEGER,
  roof_age_years INTEGER,
  overall_condition VARCHAR(20) DEFAULT 'Average',
  deductible_cov_a DECIMAL(10,2) DEFAULT 0,
  deductible_cov_b DECIMAL(10,2) DEFAULT 0,
  deductible_cov_c DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  subtotal_materials DECIMAL(12,2) DEFAULT 0,
  subtotal_labor DECIMAL(12,2) DEFAULT 0,
  subtotal_equipment DECIMAL(12,2) DEFAULT 0,
  overhead_amount DECIMAL(12,2) DEFAULT 0,
  overhead_pct DECIMAL(5,2) DEFAULT 10.00,
  profit_amount DECIMAL(12,2) DEFAULT 0,
  profit_pct DECIMAL(5,2) DEFAULT 10.00,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  tax_pct DECIMAL(6,4) DEFAULT 0,
  total_rcv DECIMAL(12,2) DEFAULT 0,
  total_depreciation DECIMAL(12,2) DEFAULT 0,
  total_acv DECIMAL(12,2) DEFAULT 0,
  recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  non_recoverable_depreciation DECIMAL(12,2) DEFAULT 0,
  net_claim_cov_a DECIMAL(12,2) DEFAULT 0,
  net_claim_cov_b DECIMAL(12,2) DEFAULT 0,
  net_claim_cov_c DECIMAL(12,2) DEFAULT 0,
  net_claim_total DECIMAL(12,2) DEFAULT 0,
  grand_total DECIMAL(12,2) DEFAULT 0,
  region_id VARCHAR(20) REFERENCES regions(id) ON DELETE SET NULL,
  jurisdiction_id UUID REFERENCES jurisdictions(id) ON DELETE SET NULL,
  carrier_profile_id UUID REFERENCES carrier_profiles(id) ON DELETE SET NULL,
  price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL,
  rules_evaluated_at TIMESTAMP,
  rules_evaluation_version INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  created_by VARCHAR(100),
  approved_by VARCHAR(100),
  notes TEXT,
  exported_at TIMESTAMP,
  esx_version INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP
);

-- ESTIMATE LINE ITEMS TABLE
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  line_item_id VARCHAR(50) REFERENCES line_items(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES estimate_zones(id) ON DELETE SET NULL,
  coverage_id UUID REFERENCES estimate_coverages(id) ON DELETE SET NULL,
  damage_area_id UUID,
  category_id VARCHAR(20),
  line_item_code VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  calculated_quantity DECIMAL(12,4),
  quantity_source VARCHAR(20) DEFAULT 'manual',
  quantity_explanation TEXT,
  unit_price DECIMAL(12,4) DEFAULT 0,
  original_unit_price DECIMAL(12,4),
  subtotal DECIMAL(12,2) DEFAULT 0,
  material_cost DECIMAL(12,2) DEFAULT 0,
  labor_cost DECIMAL(12,2) DEFAULT 0,
  equipment_cost DECIMAL(12,2) DEFAULT 0,
  waste_factor DECIMAL(4,2) DEFAULT 0,
  waste_amount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  line_rcv DECIMAL(10,2) DEFAULT 0,
  rcv DECIMAL(12,2) DEFAULT 0,
  age_years INTEGER DEFAULT 0,
  useful_life_years INTEGER DEFAULT 0,
  life_expectancy_years INTEGER,
  condition VARCHAR(20) DEFAULT 'Average',
  depreciation_pct DECIMAL(5,2) DEFAULT 0,
  depreciation_amount DECIMAL(12,2) DEFAULT 0,
  depreciation_type_id INTEGER DEFAULT 0,
  depreciation_reason TEXT,
  is_recoverable BOOLEAN DEFAULT true,
  acv DECIMAL(12,2) DEFAULT 0,
  coverage_code VARCHAR(10) DEFAULT 'A',
  trade_code VARCHAR(20),
  category_code VARCHAR(10),
  selector_code VARCHAR(30),
  activity_code VARCHAR(10),
  calc_ref VARCHAR(30),
  source VARCHAR(50) DEFAULT 'manual',
  scope_reason TEXT,
  is_auto_added BOOLEAN DEFAULT false,
  added_by_item VARCHAR(50),
  is_homeowner BOOLEAN DEFAULT false,
  is_credit BOOLEAN DEFAULT false,
  is_non_op BOOLEAN DEFAULT false,
  is_price_override BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT true,
  rule_status VARCHAR(30) DEFAULT 'allowed',
  original_quantity DECIMAL(12,4),
  rule_explanation TEXT,
  documentation_required JSONB DEFAULT '[]'::jsonb,
  documentation_provided JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- MATERIALS TABLE
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  unit VARCHAR(20) NOT NULL,
  manufacturer VARCHAR(255),
  model_number VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- MATERIAL REGIONAL PRICES TABLE
CREATE TABLE IF NOT EXISTS material_regional_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  region_id VARCHAR(20) NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  source VARCHAR(100),
  effective_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(material_id, region_id, effective_date)
);

-- XACTIMATE TABLES
CREATE TABLE IF NOT EXISTS xact_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_code VARCHAR(10),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xact_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code VARCHAR(10) REFERENCES xact_categories(code),
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit VARCHAR(20) NOT NULL,
  base_price DECIMAL(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xact_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_code VARCHAR(30) REFERENCES xact_line_items(code),
  component_type VARCHAR(50) NOT NULL,
  code VARCHAR(50),
  name VARCHAR(255),
  unit VARCHAR(20),
  price DECIMAL(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM STRUCTURES TABLE
CREATE TABLE IF NOT EXISTS claim_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  structure_type VARCHAR(50),
  year_built INTEGER,
  construction_type VARCHAR(50),
  stories INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM ROOMS TABLE
CREATE TABLE IF NOT EXISTS claim_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  structure_id UUID REFERENCES claim_structures(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  room_type VARCHAR(50),
  floor_level VARCHAR(20) DEFAULT 'main',
  length_ft DECIMAL(8,2),
  width_ft DECIMAL(8,2),
  height_ft DECIMAL(8,2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM DAMAGE ZONES TABLE
CREATE TABLE IF NOT EXISTS claim_damage_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  room_id UUID REFERENCES claim_rooms(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  damage_type VARCHAR(50),
  associated_peril VARCHAR(50),
  peril_confidence DECIMAL(3,2),
  damage_severity VARCHAR(20),
  water_category INTEGER,
  water_class INTEGER,
  affected_surfaces JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM PHOTOS TABLE
CREATE TABLE IF NOT EXISTS claim_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES claim_damage_zones(id) ON DELETE SET NULL,
  room_id UUID REFERENCES claim_rooms(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  taken_at TIMESTAMP,
  uploaded_by VARCHAR(255),
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  analyzed_at TIMESTAMP,
  analysis_status VARCHAR(30) DEFAULT 'pending',
  analysis_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM CHECKLISTS TABLE
CREATE TABLE IF NOT EXISTS claim_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  template_id UUID,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'in_progress',
  completed_at TIMESTAMP,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLAIM CHECKLIST ITEMS TABLE
CREATE TABLE IF NOT EXISTS claim_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES claim_checklists(id) ON DELETE CASCADE,
  item_code VARCHAR(50) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  status VARCHAR(30) DEFAULT 'pending',
  completed_at TIMESTAMP,
  completed_by VARCHAR(255),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- POLICY FORM EXTRACTIONS TABLE
CREATE TABLE IF NOT EXISTS policy_form_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  policy_form_id UUID REFERENCES policy_forms(id) ON DELETE SET NULL,
  extraction_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_status VARCHAR(30) DEFAULT 'completed',
  extracted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ENDORSEMENT EXTRACTIONS TABLE
CREATE TABLE IF NOT EXISTS endorsement_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  endorsement_id UUID REFERENCES endorsements(id) ON DELETE SET NULL,
  extraction_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_status VARCHAR(30) DEFAULT 'completed',
  precedence_priority INTEGER DEFAULT 100,
  endorsement_type VARCHAR(50) DEFAULT 'general',
  extracted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ESTIMATE TEMPLATES TABLE (if used)
CREATE TABLE IF NOT EXISTS estimate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- LABOR RATES TABLE (legacy, if still used)
CREATE TABLE IF NOT EXISTS labor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_code VARCHAR(20) NOT NULL,
  trade_name VARCHAR(100) NOT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL,
  region_code VARCHAR(20) DEFAULT 'NATIONAL',
  effective_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(trade_code, region_code)
);

-- ============================================
-- PART 2: CREATE MISSING INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(current_organization_id);

-- Regions indexes
CREATE INDEX IF NOT EXISTS idx_regions_state ON regions(state_province);
CREATE INDEX IF NOT EXISTS idx_regions_country ON regions(country);

-- Line items indexes
CREATE INDEX IF NOT EXISTS idx_line_items_category ON line_items(category_id);
CREATE INDEX IF NOT EXISTS idx_line_items_code ON line_items(code);
CREATE INDEX IF NOT EXISTS idx_line_items_active ON line_items(is_active);
CREATE INDEX IF NOT EXISTS idx_line_items_scope_conditions ON line_items USING GIN (scope_conditions);

-- Estimates indexes
CREATE INDEX IF NOT EXISTS idx_estimates_org ON estimates(organization_id);
CREATE INDEX IF NOT EXISTS idx_estimates_claim ON estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_workflow_status ON estimates(workflow_status);
CREATE INDEX IF NOT EXISTS idx_estimates_region ON estimates(region_id);
CREATE INDEX IF NOT EXISTS idx_estimates_carrier ON estimates(carrier_profile_id);
CREATE INDEX IF NOT EXISTS idx_estimates_jurisdiction ON estimates(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_estimates_locked ON estimates(is_locked);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON estimates(created_at DESC);

-- Estimate line items indexes
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_zone ON estimate_line_items(zone_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_coverage ON estimate_line_items(coverage_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_code ON estimate_line_items(line_item_code);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_category ON estimate_line_items(category_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_trade ON estimate_line_items(trade_code);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_source ON estimate_line_items(quantity_source);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_auto_added ON estimate_line_items(is_auto_added) WHERE is_auto_added = true;
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_rule_status ON estimate_line_items(rule_status);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_approved ON estimate_line_items(is_approved) WHERE is_approved = true;

-- Materials indexes
CREATE INDEX IF NOT EXISTS idx_materials_sku ON materials(sku);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_materials_active ON materials(is_active);

-- Material regional prices indexes
CREATE INDEX IF NOT EXISTS idx_material_regional_prices_material ON material_regional_prices(material_id);
CREATE INDEX IF NOT EXISTS idx_material_regional_prices_region ON material_regional_prices(region_id);
CREATE INDEX IF NOT EXISTS idx_material_regional_prices_effective ON material_regional_prices(effective_date DESC);

-- Xactimate indexes
CREATE INDEX IF NOT EXISTS idx_xact_categories_code ON xact_categories(code);
CREATE INDEX IF NOT EXISTS idx_xact_line_items_code ON xact_line_items(code);
CREATE INDEX IF NOT EXISTS idx_xact_line_items_category ON xact_line_items(category_code);
CREATE INDEX IF NOT EXISTS idx_xact_components_line_item ON xact_components(line_item_code);

-- Claim structures indexes
CREATE INDEX IF NOT EXISTS idx_claim_structures_claim ON claim_structures(claim_id);

-- Claim rooms indexes
CREATE INDEX IF NOT EXISTS idx_claim_rooms_claim ON claim_rooms(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_rooms_structure ON claim_rooms(structure_id);
CREATE INDEX IF NOT EXISTS idx_claim_rooms_type ON claim_rooms(room_type);

-- Claim damage zones indexes
CREATE INDEX IF NOT EXISTS idx_claim_damage_zones_claim ON claim_damage_zones(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_damage_zones_room ON claim_damage_zones(room_id);
CREATE INDEX IF NOT EXISTS idx_claim_damage_zones_peril ON claim_damage_zones(associated_peril);

-- Claim photos indexes
CREATE INDEX IF NOT EXISTS idx_claim_photos_claim ON claim_photos(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_zone ON claim_photos(zone_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_room ON claim_photos(room_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_status ON claim_photos(analysis_status);

-- Claim checklists indexes
CREATE INDEX IF NOT EXISTS idx_claim_checklists_claim ON claim_checklists(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_checklists_status ON claim_checklists(status);

-- Claim checklist items indexes
CREATE INDEX IF NOT EXISTS idx_claim_checklist_items_checklist ON claim_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_claim_checklist_items_status ON claim_checklist_items(status);

-- Policy form extractions indexes
CREATE INDEX IF NOT EXISTS idx_policy_form_extractions_org ON policy_form_extractions(organization_id);
CREATE INDEX IF NOT EXISTS idx_policy_form_extractions_claim ON policy_form_extractions(claim_id);
CREATE INDEX IF NOT EXISTS idx_policy_form_extractions_document ON policy_form_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_policy_form_extractions_policy_form ON policy_form_extractions(policy_form_id);

-- Endorsement extractions indexes
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_org ON endorsement_extractions(organization_id);
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_claim ON endorsement_extractions(claim_id);
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_document ON endorsement_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_endorsement ON endorsement_extractions(endorsement_id);
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_priority ON endorsement_extractions(precedence_priority);

-- Labor rates indexes
CREATE INDEX IF NOT EXISTS idx_labor_rates_trade ON labor_rates(trade_code);
CREATE INDEX IF NOT EXISTS idx_labor_rates_region ON labor_rates(region_code);

-- ============================================
-- PART 3: ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Ensure foreign keys exist (add if missing, ignore if exists)
DO $$
BEGIN
  -- Estimates foreign keys
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'estimates_organization_id_fkey' AND table_name = 'estimates') THEN
    ALTER TABLE estimates ADD CONSTRAINT estimates_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'estimates_claim_id_fkey' AND table_name = 'estimates') THEN
    ALTER TABLE estimates ADD CONSTRAINT estimates_claim_id_fkey
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;
  END IF;

  -- Estimate line items foreign keys
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'estimate_line_items_estimate_id_fkey' AND table_name = 'estimate_line_items') THEN
    ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_estimate_id_fkey
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'estimate_line_items_line_item_id_fkey' AND table_name = 'estimate_line_items') THEN
    ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_line_item_id_fkey
      FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE SET NULL;
  END IF;

  -- Material regional prices foreign keys
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'material_regional_prices_material_id_fkey' AND table_name = 'material_regional_prices') THEN
    ALTER TABLE material_regional_prices ADD CONSTRAINT material_regional_prices_material_id_fkey
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'material_regional_prices_region_id_fkey' AND table_name = 'material_regional_prices') THEN
    ALTER TABLE material_regional_prices ADD CONSTRAINT material_regional_prices_region_id_fkey
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================
-- PART 4: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add missing columns to claims table (if not already added by other migrations)
DO $$
BEGIN
  -- Ensure claim_id exists (may have been renamed from claim_number)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'claims' AND column_name = 'claim_id') THEN
    -- Check if claim_number exists and rename it
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'claims' AND column_name = 'claim_number') THEN
      ALTER TABLE claims RENAME COLUMN claim_number TO claim_id;
    ELSE
      ALTER TABLE claims ADD COLUMN claim_id VARCHAR(50);
    END IF;
  END IF;
END $$;

-- ============================================
-- PART 5: CREATE COMPOSITE INDEXES FOR COMMON QUERIES
-- ============================================

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_estimates_org_status ON estimates(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_estimates_claim_status ON estimates(claim_id, status);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_approved ON estimate_line_items(estimate_id, is_approved) WHERE is_approved = true;
CREATE INDEX IF NOT EXISTS idx_claim_photos_claim_status ON claim_photos(claim_id, analysis_status);
CREATE INDEX IF NOT EXISTS idx_documents_org_claim ON documents(organization_id, claim_id);
CREATE INDEX IF NOT EXISTS idx_documents_claim_type ON documents(claim_id, type);

-- ============================================
-- PART 6: ADD UPDATED_AT TRIGGERS FOR TABLES THAT NEED THEM
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for tables that don't have them
DO $$
DECLARE
  table_name TEXT;
  tables_to_update TEXT[] := ARRAY[
    'users', 'regions', 'line_items', 'materials', 'estimates', 
    'estimate_line_items', 'claim_structures', 'claim_rooms', 
    'claim_damage_zones', 'claim_photos', 'claim_checklists', 
    'claim_checklist_items', 'policy_form_extractions', 'endorsement_extractions'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_update
  LOOP
    -- Check if trigger already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'update_' || table_name || '_updated_at'
    ) THEN
      EXECUTE format('
        CREATE TRIGGER update_%s_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      ', table_name, table_name);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- PART 7: VALIDATION AND CLEANUP
-- ============================================

-- Ensure all required tables have primary keys
DO $$
DECLARE
  missing_pk_tables TEXT[];
BEGIN
  SELECT array_agg(table_name) INTO missing_pk_tables
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      WHERE tc.table_name = t.table_name
        AND tc.constraint_type = 'PRIMARY KEY'
    )
    AND t.table_name IN (
      'users', 'regions', 'line_items', 'materials', 'estimates',
      'estimate_line_items', 'claim_structures', 'claim_rooms',
      'claim_damage_zones', 'claim_photos', 'claim_checklists',
      'claim_checklist_items', 'policy_form_extractions', 'endorsement_extractions'
    );
  
  IF array_length(missing_pk_tables, 1) > 0 THEN
    RAISE WARNING 'Tables missing primary keys: %', array_to_string(missing_pk_tables, ', ');
  END IF;
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 020: Schema audit and fixes completed successfully!';
  RAISE NOTICE 'Created missing tables, indexes, foreign keys, and constraints';
  RAISE NOTICE 'Added updated_at triggers and composite indexes for performance';
END $$;

