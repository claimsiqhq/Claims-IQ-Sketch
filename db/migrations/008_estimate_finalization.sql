-- Migration: 008_estimate_finalization.sql
-- Purpose: Add is_locked column and submitted_at to estimates for finalization workflow

-- Add is_locked column to estimates table
ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Ensure submitted_at column exists (should already exist from schema but making sure)
ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

-- Create index for efficient querying of locked estimates
CREATE INDEX IF NOT EXISTS idx_estimates_is_locked ON estimates(is_locked);

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);

-- Add comment for documentation
COMMENT ON COLUMN estimates.is_locked IS 'When true, the estimate cannot be modified. Set to true upon successful submission.';
COMMENT ON COLUMN estimates.submitted_at IS 'Timestamp when the estimate was submitted for review.';
