-- Migration: Fix Database Issues Found by Validation Scripts
-- Date: 2026-01-29
-- Purpose: Add missing indexes and FK constraints identified by validation scripts

-- ============================================
-- ADD MISSING INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_claim_scope_items_claim_id 
  ON claim_scope_items(claim_id);

CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_claim_id 
  ON endorsement_extractions(claim_id);

-- ============================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Note: These FK constraints will help ensure data integrity
-- Orphaned records should be cleaned up before adding constraints

DO $$ 
BEGIN
  -- Add FK for claim_scope_items if not exists
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
  
  RAISE NOTICE 'Created % indexes on claim_id columns', idx_count;
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
  
  RAISE NOTICE 'Created % FK constraints on claim_id columns', fk_count;
END $$;
