-- Migration 051: Fix Audio Observations Flow Context Columns
-- Ensures flow_instance_id and movement_id columns exist in audio_observations
-- to support linking audio evidence directly to flow movements
--
-- This fixes the E2E smoke test Step 7 failure:
-- "movement_id column doesn't exist in audio_observations table"

-- ============================================
-- AUDIO_OBSERVATIONS TABLE - Flow Context Columns
-- ============================================

-- Add flow_instance_id column if it doesn't exist (with foreign key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_observations'
    AND column_name = 'flow_instance_id'
  ) THEN
    ALTER TABLE audio_observations
    ADD COLUMN flow_instance_id UUID REFERENCES claim_flow_instances(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add movement_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_observations'
    AND column_name = 'movement_id'
  ) THEN
    ALTER TABLE audio_observations
    ADD COLUMN movement_id TEXT;
  END IF;
END $$;

-- Add foreign key constraint to flow_instance_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_observations_flow_instance_id_fkey'
  ) THEN
    -- Only add if the column references are valid
    BEGIN
      ALTER TABLE audio_observations
      ADD CONSTRAINT audio_observations_flow_instance_id_fkey
      FOREIGN KEY (flow_instance_id) REFERENCES claim_flow_instances(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- ============================================
-- INDEXES FOR FLOW-BASED QUERIES
-- ============================================

-- Create composite index for efficient flow lookups
CREATE INDEX IF NOT EXISTS idx_audio_observations_flow
ON audio_observations(flow_instance_id, movement_id);

-- Create filtered index for non-null flow instances
CREATE INDEX IF NOT EXISTS idx_audio_observations_flow_instance
ON audio_observations(flow_instance_id) WHERE flow_instance_id IS NOT NULL;

-- ============================================
-- COLUMN COMMENTS
-- ============================================

COMMENT ON COLUMN audio_observations.flow_instance_id IS 'Links audio observation to the flow instance it was captured during';
COMMENT ON COLUMN audio_observations.movement_id IS 'The movement ID (format: phaseId:movementId) this audio is evidence for';

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the migration was successful:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'audio_observations'
-- AND column_name IN ('flow_instance_id', 'movement_id');
