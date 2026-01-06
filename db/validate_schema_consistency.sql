-- SQL Schema Consistency Validation Script
--
-- PURPOSE: Validates that database schema matches expected structure
-- Run this in Supabase SQL Editor or psql to check for:
-- - Missing tables
-- - Missing columns
-- - Column type mismatches
-- - Missing indexes
-- - Missing foreign keys
--
-- Usage: Run entire script and review results

-- ============================================
-- SETUP: Create temporary table for results
-- ============================================

CREATE TEMP TABLE IF NOT EXISTS schema_validation_results (
  check_type VARCHAR(50),
  table_name VARCHAR(100),
  issue_type VARCHAR(50),
  issue_description TEXT,
  severity VARCHAR(20)
);

-- ============================================
-- CHECK 1: Critical Tables Existence
-- ============================================

DO $$
DECLARE
  required_tables TEXT[] := ARRAY[
    'zone_openings',
    'zone_connections',
    'estimate_zones',
    'estimate_missing_walls',
    'claims',
    'estimates',
    'documents',
    'claim_photos',
    'policy_form_extractions',
    'endorsement_extractions',
    'organizations',
    'users'
  ];
  table_name TEXT;
  table_exists BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY required_tables
  LOOP
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = table_name
    ) INTO table_exists;
    
    IF NOT table_exists THEN
      INSERT INTO schema_validation_results 
      VALUES ('TABLE_EXISTS', table_name, 'MISSING_TABLE', 
              'Table does not exist in database', 'ERROR');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('TABLE_EXISTS', table_name, 'EXISTS', 
              'Table exists', 'PASS');
    END IF;
  END LOOP;
END $$;

-- ============================================
-- CHECK 2: zone_openings Table Structure
-- ============================================

DO $$
DECLARE
  required_columns JSONB := '{
    "id": {"type": "uuid", "nullable": false},
    "zone_id": {"type": "uuid", "nullable": false},
    "opening_type": {"type": "character varying", "nullable": false},
    "wall_index": {"type": "integer", "nullable": false},
    "offset_from_vertex_ft": {"type": "numeric", "nullable": false},
    "width_ft": {"type": "numeric", "nullable": false},
    "height_ft": {"type": "numeric", "nullable": false},
    "sill_height_ft": {"type": "numeric", "nullable": true},
    "connects_to_zone_id": {"type": "uuid", "nullable": true},
    "notes": {"type": "text", "nullable": true},
    "sort_order": {"type": "integer", "nullable": true},
    "created_at": {"type": "timestamp without time zone", "nullable": true},
    "updated_at": {"type": "timestamp without time zone", "nullable": true}
  }'::jsonb;
  col_name TEXT;
  col_info JSONB;
  col_exists BOOLEAN;
  col_type TEXT;
  is_nullable TEXT;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_openings') THEN
    FOR col_name, col_info IN SELECT * FROM jsonb_each(required_columns)
    LOOP
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'zone_openings'
          AND column_name = col_name
      ) INTO col_exists;
      
      IF NOT col_exists THEN
        INSERT INTO schema_validation_results 
        VALUES ('COLUMN_EXISTS', 'zone_openings', 'MISSING_COLUMN',
                format('Column %s does not exist', col_name), 'ERROR');
      ELSE
        -- Check data type
        SELECT data_type, is_nullable
        INTO col_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'zone_openings'
          AND column_name = col_name;
        
        IF col_type != (col_info->>'type') THEN
          INSERT INTO schema_validation_results 
          VALUES ('COLUMN_TYPE', 'zone_openings', 'TYPE_MISMATCH',
                  format('Column %s: expected %s, got %s', col_name, col_info->>'type', col_type), 'WARNING');
        END IF;
        
        INSERT INTO schema_validation_results 
        VALUES ('COLUMN_EXISTS', 'zone_openings', 'EXISTS',
                format('Column %s exists (%s)', col_name, col_type), 'PASS');
      END IF;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- CHECK 3: zone_connections Table Structure
-- ============================================

DO $$
DECLARE
  required_columns JSONB := '{
    "id": {"type": "uuid", "nullable": false},
    "estimate_id": {"type": "uuid", "nullable": false},
    "from_zone_id": {"type": "uuid", "nullable": false},
    "to_zone_id": {"type": "uuid", "nullable": false},
    "connection_type": {"type": "character varying", "nullable": false},
    "opening_id": {"type": "uuid", "nullable": true},
    "notes": {"type": "text", "nullable": true},
    "created_at": {"type": "timestamp without time zone", "nullable": true},
    "updated_at": {"type": "timestamp without time zone", "nullable": true}
  }'::jsonb;
  col_name TEXT;
  col_info JSONB;
  col_exists BOOLEAN;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_connections') THEN
    FOR col_name, col_info IN SELECT * FROM jsonb_each(required_columns)
    LOOP
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'zone_connections'
          AND column_name = col_name
      ) INTO col_exists;
      
      IF NOT col_exists THEN
        INSERT INTO schema_validation_results 
        VALUES ('COLUMN_EXISTS', 'zone_connections', 'MISSING_COLUMN',
                format('Column %s does not exist', col_name), 'ERROR');
      ELSE
        INSERT INTO schema_validation_results 
        VALUES ('COLUMN_EXISTS', 'zone_connections', 'EXISTS',
                format('Column %s exists', col_name), 'PASS');
      END IF;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- CHECK 4: Required Indexes
-- ============================================

DO $$
DECLARE
  required_indexes JSONB := '{
    "zone_openings": ["zone_openings_zone_idx", "zone_openings_wall_idx"],
    "zone_connections": ["zone_connections_estimate_idx", "zone_connections_from_zone_idx", "zone_connections_to_zone_idx", "zone_connections_opening_idx"]
  }'::jsonb;
  table_name TEXT;
  index_name TEXT;
  index_exists BOOLEAN;
BEGIN
  FOR table_name, index_name IN 
    SELECT t.key, jsonb_array_elements_text(v.value)
    FROM jsonb_each(required_indexes) t,
         jsonb_each(required_indexes) v
    WHERE t.key = v.key
  LOOP
    SELECT EXISTS (
      SELECT FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND indexname = index_name
    ) INTO index_exists;
    
    IF NOT index_exists THEN
      INSERT INTO schema_validation_results 
      VALUES ('INDEX_EXISTS', table_name, 'MISSING_INDEX',
              format('Index %s does not exist', index_name), 'WARNING');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('INDEX_EXISTS', table_name, 'EXISTS',
              format('Index %s exists', index_name), 'PASS');
    END IF;
  END LOOP;
END $$;

-- ============================================
-- CHECK 5: Foreign Key Constraints
-- ============================================

DO $$
DECLARE
  fk_record RECORD;
BEGIN
  -- Check zone_openings foreign keys
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_openings') THEN
    -- zone_id -> estimate_zones.id
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'zone_openings'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'zone_id'
    ) INTO fk_record;
    
    IF NOT fk_record THEN
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_openings', 'MISSING_FK',
              'Foreign key zone_id -> estimate_zones.id does not exist', 'ERROR');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_openings', 'EXISTS',
              'Foreign key zone_id -> estimate_zones.id exists', 'PASS');
    END IF;
  END IF;
  
  -- Check zone_connections foreign keys
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_connections') THEN
    -- estimate_id -> estimates.id
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'zone_connections'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'estimate_id'
    ) INTO fk_record;
    
    IF NOT fk_record THEN
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'MISSING_FK',
              'Foreign key estimate_id -> estimates.id does not exist', 'ERROR');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'EXISTS',
              'Foreign key estimate_id -> estimates.id exists', 'PASS');
    END IF;
    
    -- from_zone_id -> estimate_zones.id
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'zone_connections'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'from_zone_id'
    ) INTO fk_record;
    
    IF NOT fk_record THEN
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'MISSING_FK',
              'Foreign key from_zone_id -> estimate_zones.id does not exist', 'ERROR');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'EXISTS',
              'Foreign key from_zone_id -> estimate_zones.id exists', 'PASS');
    END IF;
    
    -- to_zone_id -> estimate_zones.id
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'zone_connections'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'to_zone_id'
    ) INTO fk_record;
    
    IF NOT fk_record THEN
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'MISSING_FK',
              'Foreign key to_zone_id -> estimate_zones.id does not exist', 'ERROR');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('FOREIGN_KEY', 'zone_connections', 'EXISTS',
              'Foreign key to_zone_id -> estimate_zones.id exists', 'PASS');
    END IF;
  END IF;
END $$;

-- ============================================
-- CHECK 6: Triggers
-- ============================================

DO $$
DECLARE
  trigger_exists BOOLEAN;
BEGIN
  -- Check zone_openings updated_at trigger
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_openings') THEN
    SELECT EXISTS (
      SELECT FROM pg_trigger
      WHERE tgname = 'zone_openings_updated_at'
    ) INTO trigger_exists;
    
    IF NOT trigger_exists THEN
      INSERT INTO schema_validation_results 
      VALUES ('TRIGGER', 'zone_openings', 'MISSING_TRIGGER',
              'Trigger zone_openings_updated_at does not exist', 'WARNING');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('TRIGGER', 'zone_openings', 'EXISTS',
              'Trigger zone_openings_updated_at exists', 'PASS');
    END IF;
  END IF;
  
  -- Check zone_connections updated_at trigger
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zone_connections') THEN
    SELECT EXISTS (
      SELECT FROM pg_trigger
      WHERE tgname = 'zone_connections_updated_at'
    ) INTO trigger_exists;
    
    IF NOT trigger_exists THEN
      INSERT INTO schema_validation_results 
      VALUES ('TRIGGER', 'zone_connections', 'MISSING_TRIGGER',
              'Trigger zone_connections_updated_at does not exist', 'WARNING');
    ELSE
      INSERT INTO schema_validation_results 
      VALUES ('TRIGGER', 'zone_connections', 'EXISTS',
              'Trigger zone_connections_updated_at exists', 'PASS');
    END IF;
  END IF;
END $$;

-- ============================================
-- RESULTS SUMMARY
-- ============================================

-- Show summary by severity
SELECT 
  severity,
  COUNT(*) as count,
  CASE severity
    WHEN 'ERROR' THEN '❌'
    WHEN 'WARNING' THEN '⚠️'
    WHEN 'PASS' THEN '✅'
  END as icon
FROM schema_validation_results
GROUP BY severity
ORDER BY 
  CASE severity
    WHEN 'ERROR' THEN 1
    WHEN 'WARNING' THEN 2
    WHEN 'PASS' THEN 3
  END;

-- Show all errors
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator;
  
SELECT 
  'ERRORS' as section;

SELECT 
  check_type,
  table_name,
  issue_description
FROM schema_validation_results
WHERE severity = 'ERROR'
ORDER BY table_name, check_type;

-- Show all warnings
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator;
  
SELECT 
  'WARNINGS' as section;

SELECT 
  check_type,
  table_name,
  issue_description
FROM schema_validation_results
WHERE severity = 'WARNING'
ORDER BY table_name, check_type;

-- Show detailed results (optional - comment out if too verbose)
-- SELECT 
--   check_type,
--   table_name,
--   issue_type,
--   issue_description,
--   severity
-- FROM schema_validation_results
-- ORDER BY 
--   CASE severity
--     WHEN 'ERROR' THEN 1
--     WHEN 'WARNING' THEN 2
--     WHEN 'PASS' THEN 3
--   END,
--   table_name,
--   check_type;

-- Cleanup
DROP TABLE IF EXISTS schema_validation_results;
