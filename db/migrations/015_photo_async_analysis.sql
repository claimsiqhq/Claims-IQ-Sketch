-- Migration: Add async photo analysis status tracking
-- Adds fields to track the status of background photo analysis

-- Add analysis status field to track async processing state
ALTER TABLE claim_photos
ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(30) DEFAULT 'pending';

-- Add analysis error field to store error messages when analysis fails
ALTER TABLE claim_photos
ADD COLUMN IF NOT EXISTS analysis_error TEXT;

-- Update existing photos that already have analysis to mark as completed
UPDATE claim_photos
SET analysis_status = 'completed'
WHERE analyzed_at IS NOT NULL
  AND ai_analysis IS NOT NULL
  AND ai_analysis != '{}'::jsonb
  AND analysis_status = 'pending';

-- Add comment explaining the status values
COMMENT ON COLUMN claim_photos.analysis_status IS 'Status of AI analysis: pending, analyzing, completed, failed, concerns';
COMMENT ON COLUMN claim_photos.analysis_error IS 'Error message if analysis failed or concern reasons if concerns were flagged';
