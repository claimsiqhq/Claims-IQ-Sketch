-- Migration: Fix Database Issues Found by Validation Scripts
-- Date: 2026-01-29
-- Purpose: Add missing indexes and FK constraints identified by validation scripts

-- ============================================
-- ADD MISSING INDEXES
-- ============================================

-- Only create index if claim_scope_items table exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'claim_scope_items'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_claim_scope_items_claim_id 
      ON claim_scope_items(claim_id);
    RAISE NOTICE 'Created index idx_claim_scope_items_claim_id';
  ELSE
    RAISE NOTICE 'Table claim_scope_items does not exist - skipping index creation';
  END IF;
END $$;

-- Create index on endorsement_extractions (should exist)
CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_claim_id 
  ON endorsement_extractions(claim_id);

-- ============================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Note: These FK constraints will help ensure data integrity
-- Orphaned records should be cleaned up before adding constraints

DO $$ 
BEGIN
  -- Add FK for claim_scope_items if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'claim_scope_items'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'fk_claim_scope_items_claim'
    ) THEN
      -- Clean up any orphaned records first
      DELETE FROM claim_scope_items 
      WHERE claim_id IS NOT NULL 
        AND claim_id NOT IN (SELECT id FROM claims);
      
      ALTER TABLE claim_scope_items
        ADD CONSTRAINT fk_claim_scope_items_claim
        FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
      
      RAISE NOTICE 'Added FK constraint fk_claim_scope_items_claim';
    ELSE
      RAISE NOTICE 'FK constraint fk_claim_scope_items_claim already exists';
    END IF;
  ELSE
    RAISE NOTICE 'Table claim_scope_items does not exist - skipping FK constraint';
  END IF;

  -- Add FK for endorsement_extractions if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_endorsement_extractions_claim'
  ) THEN
    -- Clean up any orphaned records first
    DELETE FROM endorsement_extractions 
    WHERE claim_id IS NOT NULL 
      AND claim_id NOT IN (SELECT id FROM claims);
    
    ALTER TABLE endorsement_extractions
      ADD CONSTRAINT fk_endorsement_extractions_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Added FK constraint fk_endorsement_extractions_claim';
  ELSE
    RAISE NOTICE 'FK constraint fk_endorsement_extractions_claim already exists';
  END IF;
END $$;

-- ============================================
-- VERIFY INDEXES CREATED
-- ============================================

DO $$
DECLARE
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('claim_scope_items', 'endorsement_extractions')
    AND indexname LIKE '%claim_id%';
  
  RAISE NOTICE 'Found % indexes on claim_id columns for these tables', idx_count;
END $$;

-- ============================================
-- VERIFY FK CONSTRAINTS CREATED
-- ============================================

DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('claim_scope_items', 'endorsement_extractions')
    AND kcu.column_name = 'claim_id';
  
  RAISE NOTICE 'Found % FK constraints on claim_id columns for these tables', fk_count;
END $$;
