-- Migration: Add missing columns to movement_completions table
-- Part of workflow audit remediation (Jan 2026)

-- Add skipped_required column to track when required steps are skipped
ALTER TABLE movement_completions
ADD COLUMN IF NOT EXISTS skipped_required BOOLEAN DEFAULT false;

-- Add AI validation tracking columns
ALTER TABLE movement_completions
ADD COLUMN IF NOT EXISTS evidence_validated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS evidence_validation_result JSONB;

-- Create index for finding skipped required movements
CREATE INDEX IF NOT EXISTS idx_movement_completions_skipped_required
ON movement_completions(flow_instance_id, skipped_required)
WHERE skipped_required = true;

-- Create index for phase queries (if movement_phase column exists)
CREATE INDEX IF NOT EXISTS idx_movement_completions_phase
ON movement_completions(flow_instance_id, movement_phase);

-- DOWN migration (rollback)
-- DROP INDEX IF EXISTS idx_movement_completions_skipped_required;
-- DROP INDEX IF EXISTS idx_movement_completions_phase;
-- ALTER TABLE movement_completions
-- DROP COLUMN IF EXISTS evidence_validation_result,
-- DROP COLUMN IF EXISTS evidence_validated,
-- DROP COLUMN IF EXISTS skipped_required;
