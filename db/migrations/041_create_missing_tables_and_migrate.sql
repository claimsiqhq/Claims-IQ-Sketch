-- Migration: Create missing tables and migrate data
-- Date: 2026-01-12
-- Purpose: Create tables referenced in code but missing from database, migrate data, and remove unused tables
-- NOTE: labor_rates table NOT created - code updated to use labor_rates_enhanced instead

-- ============================================
-- PART 1: CREATE MISSING TABLES
-- ============================================
-- NOTE: Only creating 5 tables (not 6) - labor_rates removed, code uses labor_rates_enhanced

-- 1. claim_scope_items - Claim-scoped scope items (similar to scope_items but claim-level)
CREATE TABLE IF NOT EXISTS public.claim_scope_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  line_item_code character varying(30) NOT NULL,
  quantity numeric(12, 4) NOT NULL,
  unit character varying(10) NOT NULL,
  waste_factor numeric(4, 3) DEFAULT 0.00,
  quantity_with_waste numeric(12, 4) NOT NULL,
  provenance character varying(30) NOT NULL DEFAULT 'manual',
  provenance_details jsonb DEFAULT '{}'::jsonb,
  trade_code character varying(10),
  coverage_type character varying(1) DEFAULT 'A',
  sort_order integer DEFAULT 0,
  status character varying(20) DEFAULT 'pending',
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT claim_scope_items_pkey PRIMARY KEY (id),
  CONSTRAINT fk_claim_scope_items_claim FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE,
  CONSTRAINT fk_claim_scope_items_org FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

CREATE INDEX IF NOT EXISTS claim_scope_items_claim_idx ON public.claim_scope_items(claim_id);
CREATE INDEX IF NOT EXISTS claim_scope_items_org_idx ON public.claim_scope_items(organization_id);
CREATE INDEX IF NOT EXISTS claim_scope_items_status_idx ON public.claim_scope_items(status);

COMMENT ON TABLE public.claim_scope_items IS 'Claim-level scope items (pre-estimate scoping)';

-- 2. materials - Material catalog/SKU table
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sku character varying(100) NOT NULL UNIQUE,
  name character varying(255) NOT NULL,
  description text,
  unit character varying(20) NOT NULL,
  base_price numeric(10, 2) DEFAULT 0,
  category character varying(50),
  manufacturer character varying(100),
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT materials_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS materials_sku_idx ON public.materials(sku);
CREATE INDEX IF NOT EXISTS materials_category_idx ON public.materials(category);
CREATE INDEX IF NOT EXISTS materials_active_idx ON public.materials(is_active);

COMMENT ON TABLE public.materials IS 'Material catalog with SKU and base pricing';

-- 3. material_regional_prices - Regional pricing for materials
CREATE TABLE IF NOT EXISTS public.material_regional_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  region_id character varying(50) NOT NULL,
  price numeric(10, 2) NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,
  source character varying(50) DEFAULT 'manual',
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT material_regional_prices_pkey PRIMARY KEY (id),
  CONSTRAINT fk_material_regional_prices_material FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE,
  CONSTRAINT material_regional_prices_unique UNIQUE (material_id, region_id, effective_date)
);

CREATE INDEX IF NOT EXISTS material_regional_prices_material_idx ON public.material_regional_prices(material_id);
CREATE INDEX IF NOT EXISTS material_regional_prices_region_idx ON public.material_regional_prices(region_id);
CREATE INDEX IF NOT EXISTS material_regional_prices_effective_date_idx ON public.material_regional_prices(effective_date DESC);

COMMENT ON TABLE public.material_regional_prices IS 'Regional pricing for materials with effective dates';

-- 4. regions - Regional data for pricing calculations
CREATE TABLE IF NOT EXISTS public.regions (
  id character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  country_code character varying(10) DEFAULT 'US',
  state_code character varying(10),
  city character varying(100),
  zip_code character varying(20),
  indices jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT regions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS regions_state_idx ON public.regions(state_code);
CREATE INDEX IF NOT EXISTS regions_active_idx ON public.regions(is_active);

COMMENT ON TABLE public.regions IS 'Regional data with pricing indices';

-- 5. price_scrape_jobs - Price scraping job tracking
CREATE TABLE IF NOT EXISTS public.price_scrape_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source character varying(50) NOT NULL DEFAULT 'home_depot',
  status character varying(20) NOT NULL DEFAULT 'pending',
  started_at timestamp without time zone NOT NULL DEFAULT now(),
  completed_at timestamp without time zone,
  items_processed integer DEFAULT 0,
  items_updated integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT price_scrape_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS price_scrape_jobs_status_idx ON public.price_scrape_jobs(status);
CREATE INDEX IF NOT EXISTS price_scrape_jobs_started_at_idx ON public.price_scrape_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS price_scrape_jobs_source_idx ON public.price_scrape_jobs(source);

COMMENT ON TABLE public.price_scrape_jobs IS 'Tracks price scraping jobs from external sources';

-- NOTE: labor_rates table NOT created - code updated to use labor_rates_enhanced instead

-- ============================================
-- PART 2: MIGRATE DATA FROM EXISTING TABLES
-- ============================================

-- NOTE: No labor_rates migration - code updated to use labor_rates_enhanced directly

-- Migrate data from regional_multipliers to regions (if regions table is empty)
-- Create default regions based on regional_multipliers
INSERT INTO public.regions (id, name, indices, is_active)
SELECT 
  region_code,
  COALESCE(region_name, region_code),
  jsonb_build_object(
    'material', material_multiplier,
    'labor', labor_multiplier,
    'equipment', equipment_multiplier
  ),
  is_active
FROM public.regional_multipliers
WHERE NOT EXISTS (
  SELECT 1 FROM public.regions r WHERE r.id = regional_multipliers.region_code
)
ON CONFLICT (id) DO UPDATE SET
  indices = EXCLUDED.indices,
  updated_at = now();

-- Add common US regions if they don't exist
INSERT INTO public.regions (id, name, country_code, is_active)
VALUES 
  ('US-NATIONAL', 'United States - National', 'US', true),
  ('US-CA', 'California', 'US', true),
  ('US-TX', 'Texas', 'US', true),
  ('US-FL', 'Florida', 'US', true),
  ('US-NY', 'New York', 'US', true),
  ('US-CO', 'Colorado', 'US', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PART 3: REMOVE UNUSED TABLES (after data check)
-- ============================================

-- Check if damage_areas has data before dropping
-- Note: This table is deprecated per schema comments - replaced by estimate_zones/estimate_areas
-- Note: estimate_line_items.damage_area_id references this table
DO $$
DECLARE
  damage_areas_count integer;
  has_references integer;
BEGIN
  SELECT COUNT(*) INTO damage_areas_count FROM public.damage_areas;
  
  -- Check if estimate_line_items has any references to damage_areas
  SELECT COUNT(*) INTO has_references
  FROM public.estimate_line_items
  WHERE damage_area_id IS NOT NULL;
  
  IF damage_areas_count > 0 THEN
    RAISE WARNING 'Table damage_areas has % rows. Data will be lost if dropped. Consider migrating to estimate_zones/estimate_areas first.', damage_areas_count;
    -- Don't drop if it has data - user should review first
  ELSIF has_references > 0 THEN
    RAISE WARNING 'Table damage_areas is referenced by % rows in estimate_line_items. Dropping foreign key column first, then table.', has_references;
    -- Drop the foreign key column from estimate_line_items first
    ALTER TABLE public.estimate_line_items DROP COLUMN IF EXISTS damage_area_id;
    -- Then drop the table
    DROP TABLE IF EXISTS public.damage_areas CASCADE;
    RAISE NOTICE 'Table damage_areas dropped (damage_area_id column removed from estimate_line_items)';
  ELSE
    -- No references, safe to drop
    ALTER TABLE public.estimate_line_items DROP COLUMN IF EXISTS damage_area_id;
    DROP TABLE IF EXISTS public.damage_areas;
    RAISE NOTICE 'Table damage_areas dropped (was empty, no references)';
  END IF;
END $$;

-- Check if workflow_rules has data before dropping
-- Note: This table may be for future dynamic workflow rules feature
DO $$
DECLARE
  workflow_rules_count integer;
  has_foreign_keys boolean;
BEGIN
  SELECT COUNT(*) INTO workflow_rules_count FROM public.workflow_rules;
  
  -- Check if any tables reference workflow_rules
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'workflow_rules'
  ) INTO has_foreign_keys;
  
  IF workflow_rules_count > 0 THEN
    RAISE WARNING 'Table workflow_rules has % rows. Keeping table as it contains data.', workflow_rules_count;
  ELSIF has_foreign_keys THEN
    RAISE NOTICE 'Table workflow_rules has foreign key references. Keeping table.';
  ELSE
    -- Table is empty and has no references - safe to drop per user request
    DROP TABLE IF EXISTS public.workflow_rules CASCADE;
    RAISE NOTICE 'Table workflow_rules dropped (was empty, no references)';
  END IF;
END $$;

-- ============================================
-- PART 4: ADD COMMENTS AND DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.claim_scope_items.claim_id IS 'Links to claims table - claim-level scoping before estimate creation';
COMMENT ON COLUMN public.materials.sku IS 'Stock Keeping Unit - unique identifier for material';
COMMENT ON COLUMN public.material_regional_prices.material_id IS 'Foreign key to materials table';
COMMENT ON COLUMN public.regions.indices IS 'JSONB object with pricing indices (e.g., {"labor_general": 1.2, "material": 1.1})';
COMMENT ON COLUMN public.price_scrape_jobs.source IS 'Source of price data (e.g., home_depot, lowes)';
-- NOTE: labor_rates table not created - using labor_rates_enhanced instead

-- ============================================
-- PART 5: VERIFICATION QUERIES
-- ============================================

-- Verify tables were created
DO $$
DECLARE
  table_count integer;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'claim_scope_items',
      'materials',
      'material_regional_prices',
      'regions',
      'price_scrape_jobs'
    );
  
  IF table_count = 5 THEN
    RAISE NOTICE 'SUCCESS: All 5 missing tables created';
  ELSE
    RAISE WARNING 'Only % of 5 tables were created', table_count;
  END IF;
END $$;

-- Report migration results
DO $$
DECLARE
  regions_migrated integer;
BEGIN
  SELECT COUNT(*) INTO regions_migrated FROM public.regions;
  
  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  - regions: % rows migrated from regional_multipliers', regions_migrated;
  RAISE NOTICE '  - labor_rates: Code updated to use labor_rates_enhanced (no table created)';
END $$;
