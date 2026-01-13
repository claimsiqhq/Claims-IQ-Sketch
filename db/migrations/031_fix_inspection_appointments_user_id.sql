-- Migration: Fix inspection_appointments column name
-- Purpose: Rename adjuster_id to user_id to match schema and code

-- Rename column if it exists and user_id doesn't exist
DO $$
BEGIN
  -- Check if adjuster_id exists and user_id doesn't
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'inspection_appointments'
    AND column_name = 'adjuster_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'inspection_appointments'
    AND column_name = 'user_id'
  ) THEN
    -- Rename the column
    ALTER TABLE inspection_appointments
    RENAME COLUMN adjuster_id TO user_id;
    
    -- Rename indexes
    IF EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'inspection_appointments_adjuster_idx'
    ) THEN
      ALTER INDEX inspection_appointments_adjuster_idx 
      RENAME TO inspection_appointments_user_idx;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'inspection_appointments_adjuster_date_idx'
    ) THEN
      ALTER INDEX inspection_appointments_adjuster_date_idx 
      RENAME TO inspection_appointments_user_date_idx;
    END IF;
  END IF;
END $$;
