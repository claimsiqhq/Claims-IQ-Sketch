-- Migration 051: Add movement_phase column to movement_completions
-- Adds movement_phase column for easier querying and indexing

-- ============================================
-- movement_completions - Add movement_phase column
-- ============================================

ALTER TABLE movement_completions 
ADD COLUMN IF NOT EXISTS movement_phase VARCHAR(100);

-- Create index for faster phase-based queries
CREATE INDEX IF NOT EXISTS movement_completions_phase_idx ON movement_completions(movement_phase);

-- Update existing records to extract phase ID from movement_id (format: "phaseId:movementId")
UPDATE movement_completions
SET movement_phase = SPLIT_PART(movement_id, ':', 1)
WHERE movement_phase IS NULL AND movement_id LIKE '%:%';

COMMENT ON COLUMN movement_completions.movement_phase IS 'Phase ID extracted from movement_id for easier querying. Format matches the phase ID from flow_json.';
