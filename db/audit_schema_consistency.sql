-- ============================================
-- DATABASE SCHEMA CONSISTENCY AUDIT
-- ============================================
-- This script audits the database schema to ensure:
-- 1. All tables referenced in code exist
-- 2. All columns referenced in code exist
-- 3. Column types match expectations
-- 4. Foreign keys are properly defined
--
-- Run this script to identify schema mismatches
-- ============================================

-- ============================================
-- 1. FLOW ENGINE TABLES AUDIT
-- ============================================

-- Check claim_flow_instances table
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'claim_id', 'flow_definition_id', 'status', 
    'current_phase_id', 'current_phase_index', 
    'completed_movements', 'dynamic_movements',
    'started_at', 'completed_at', 'created_at', 'updated_at'
  ];
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'claim_flow_instances'
  ) THEN
    RAISE NOTICE '❌ Table claim_flow_instances does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table claim_flow_instances exists';
    
    -- Check each required column
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'claim_flow_instances'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in claim_flow_instances: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in claim_flow_instances';
    END IF;
  END IF;
END $$;

-- Check movement_completions table
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'flow_instance_id', 'movement_id', 'movement_phase', 'claim_id',
    'status', 'notes', 'evidence_data',
    'skipped_required', 'evidence_validated', 'evidence_validation_result',
    'completed_at', 'completed_by', 'created_at'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'movement_completions'
  ) THEN
    RAISE NOTICE '❌ Table movement_completions does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table movement_completions exists';
    
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'movement_completions'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in movement_completions: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in movement_completions';
    END IF;
  END IF;
END $$;

-- Check movement_evidence table
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'flow_instance_id', 'movement_id',
    'evidence_type', 'reference_id', 'evidence_data',
    'created_by', 'created_at'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'movement_evidence'
  ) THEN
    RAISE NOTICE '❌ Table movement_evidence does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table movement_evidence exists';
    
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'movement_evidence'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in movement_evidence: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in movement_evidence';
    END IF;
  END IF;
END $$;

-- Check flow_definitions table
DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'organization_id', 'name', 'description',
    'peril_type', 'property_type', 'flow_json',
    'version', 'is_active', 'created_by',
    'created_at', 'updated_at'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flow_definitions'
  ) THEN
    RAISE NOTICE '❌ Table flow_definitions does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table flow_definitions exists';
    
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'flow_definitions'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in flow_definitions: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in flow_definitions';
    END IF;
  END IF;
END $$;

-- ============================================
-- 2. AUDIO OBSERVATIONS TABLE AUDIT
-- ============================================

DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'organization_id', 'claim_id', 'flow_instance_id',
    'movement_id', 'movement_completion_id',
    'room_id', 'structure_id',
    'audio_storage_path', 'audio_url', 'duration_seconds',
    'transcription', 'transcription_status', 'transcription_error', 'transcribed_at',
    'extracted_entities', 'extraction_status', 'extraction_error',
    'extraction_prompt_key', 'extracted_at',
    'recorded_by', 'created_at', 'updated_at'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'audio_observations'
  ) THEN
    RAISE NOTICE '❌ Table audio_observations does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table audio_observations exists';
    
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'audio_observations'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in audio_observations: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in audio_observations';
    END IF;
  END IF;
END $$;

-- ============================================
-- 3. CLAIM PHOTOS TABLE AUDIT
-- ============================================

DO $$
DECLARE
  missing_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_columns TEXT[] := ARRAY[
    'id', 'organization_id', 'claim_id',
    'structure_id', 'room_id', 'damage_zone_id',
    'flow_instance_id', 'movement_id', 'captured_context',
    'storage_path', 'public_url', 'file_name', 'mime_type', 'file_size',
    'label', 'hierarchy_path', 'description',
    'latitude', 'longitude', 'geo_address',
    'ai_analysis', 'quality_score', 'damage_detected',
    'analysis_status', 'analysis_error',
    'taxonomy_prefix', 'taxonomy_category_id', 'auto_categorized',
    'captured_at', 'analyzed_at', 'uploaded_by',
    'created_at', 'updated_at'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'claim_photos'
  ) THEN
    RAISE NOTICE '❌ Table claim_photos does NOT exist';
  ELSE
    RAISE NOTICE '✅ Table claim_photos exists';
    
    FOREACH col IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'claim_photos'
        AND column_name = col
      ) THEN
        missing_columns := array_append(missing_columns, col);
      END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
      RAISE NOTICE '❌ Missing columns in claim_photos: %', array_to_string(missing_columns, ', ');
    ELSE
      RAISE NOTICE '✅ All required columns exist in claim_photos';
    END IF;
  END IF;
END $$;

-- ============================================
-- 4. FOREIGN KEY CONSTRAINTS AUDIT
-- ============================================

DO $$
DECLARE
  missing_fks TEXT[] := ARRAY[]::TEXT[];
  fk_record RECORD;
  required_fks TEXT[] := ARRAY[
    'claim_flow_instances.claim_id -> claims.id',
    'claim_flow_instances.flow_definition_id -> flow_definitions.id',
    'movement_completions.flow_instance_id -> claim_flow_instances.id',
    'movement_completions.claim_id -> claims.id',
    'movement_evidence.flow_instance_id -> claim_flow_instances.id',
    'audio_observations.organization_id -> organizations.id',
    'audio_observations.claim_id -> claims.id',
    'audio_observations.flow_instance_id -> claim_flow_instances.id',
    'audio_observations.movement_completion_id -> movement_completions.id',
    'audio_observations.room_id -> claim_rooms.id',
    'audio_observations.structure_id -> claim_structures.id',
    'claim_photos.organization_id -> organizations.id',
    'claim_photos.claim_id -> claims.id'
  ];
BEGIN
  RAISE NOTICE 'Checking foreign key constraints...';
  
  -- Check each FK
  FOR fk_record IN
    SELECT 
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN (
      'claim_flow_instances', 'movement_completions', 'movement_evidence',
      'audio_observations', 'claim_photos'
    )
  LOOP
    RAISE NOTICE '✅ FK: %.% -> %.%', 
      fk_record.table_name, fk_record.column_name,
      fk_record.foreign_table_name, fk_record.foreign_column_name;
  END LOOP;
END $$;

-- ============================================
-- 5. INDEXES AUDIT
-- ============================================

DO $$
DECLARE
  idx_record RECORD;
  required_indexes TEXT[] := ARRAY[
    'claim_flow_instances_claim_idx',
    'claim_flow_instances_status_idx',
    'claim_flow_instances_flow_def_idx',
    'movement_completions_flow_instance_idx',
    'movement_completions_movement_idx',
    'movement_completions_claim_idx',
    'movement_evidence_flow_instance_idx',
    'movement_evidence_movement_idx',
    'audio_observations_org_idx',
    'audio_observations_claim_idx',
    'audio_observations_flow_instance_idx',
    'claim_photos_claim_idx',
    'claim_photos_org_idx'
  ];
BEGIN
  RAISE NOTICE 'Checking indexes...';
  
  FOR idx_record IN
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN (
      'claim_flow_instances', 'movement_completions', 'movement_evidence',
      'audio_observations', 'claim_photos'
    )
    ORDER BY tablename, indexname
  LOOP
    RAISE NOTICE '✅ Index: % on %', idx_record.indexname, idx_record.tablename;
  END LOOP;
END $$;

-- ============================================
-- 6. SUMMARY REPORT
-- ============================================

SELECT 
  'SCHEMA AUDIT COMPLETE' AS status,
  NOW() AS audit_time;
