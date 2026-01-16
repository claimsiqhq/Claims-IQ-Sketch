-- Migration 049: Add Flow Context Columns
-- Adds flow_instance_id and movement_id columns to claim_photos and audio_observations
-- to support linking evidence directly to flow movements

-- ============================================
-- CLAIM_PHOTOS TABLE
-- ============================================

-- Add flow context columns to claim_photos
ALTER TABLE claim_photos
ADD COLUMN IF NOT EXISTS flow_instance_id UUID REFERENCES claim_flow_instances(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS movement_id TEXT,
ADD COLUMN IF NOT EXISTS captured_context TEXT;

-- Create index for flow-based queries
CREATE INDEX IF NOT EXISTS idx_claim_photos_flow
ON claim_photos(flow_instance_id, movement_id);

CREATE INDEX IF NOT EXISTS idx_claim_photos_flow_instance
ON claim_photos(flow_instance_id) WHERE flow_instance_id IS NOT NULL;

COMMENT ON COLUMN claim_photos.flow_instance_id IS 'Links photo to the flow instance it was captured during';
COMMENT ON COLUMN claim_photos.movement_id IS 'The movement ID (format: phaseId:movementId) this photo is evidence for';
COMMENT ON COLUMN claim_photos.captured_context IS 'Additional context about how/when the photo was captured';

-- ============================================
-- AUDIO_OBSERVATIONS TABLE
-- ============================================

-- Add movement_id column to audio_observations for direct movement reference
ALTER TABLE audio_observations
ADD COLUMN IF NOT EXISTS movement_id TEXT;

-- Create index for flow-based queries
CREATE INDEX IF NOT EXISTS idx_audio_observations_flow
ON audio_observations(flow_instance_id, movement_id);

CREATE INDEX IF NOT EXISTS idx_audio_observations_flow_instance
ON audio_observations(flow_instance_id) WHERE flow_instance_id IS NOT NULL;

COMMENT ON COLUMN audio_observations.movement_id IS 'The movement ID (format: phaseId:movementId) this audio is evidence for';

-- ============================================
-- MOVEMENT_EVIDENCE TABLE
-- ============================================

-- Add evidence_id column if missing (to link to claim_photos or audio_observations)
ALTER TABLE movement_evidence
ADD COLUMN IF NOT EXISTS evidence_id UUID;

-- Create unique constraint to prevent duplicate evidence attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'movement_evidence_unique_attachment'
  ) THEN
    ALTER TABLE movement_evidence
    ADD CONSTRAINT movement_evidence_unique_attachment
    UNIQUE(flow_instance_id, movement_id, evidence_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_movement_evidence_lookup
ON movement_evidence(flow_instance_id, movement_id);

CREATE INDEX IF NOT EXISTS idx_movement_evidence_evidence_id
ON movement_evidence(evidence_id) WHERE evidence_id IS NOT NULL;

COMMENT ON COLUMN movement_evidence.evidence_id IS 'UUID of the linked evidence (claim_photos.id or audio_observations.id)';

-- ============================================
-- ADD NOTES COLUMN TO MOVEMENT_EVIDENCE IF MISSING
-- ============================================

ALTER TABLE movement_evidence
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS attached_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS attached_by UUID;

COMMENT ON COLUMN movement_evidence.notes IS 'Optional notes about this evidence attachment';
COMMENT ON COLUMN movement_evidence.attached_at IS 'When the evidence was attached to the movement';
COMMENT ON COLUMN movement_evidence.attached_by IS 'User who attached the evidence';
