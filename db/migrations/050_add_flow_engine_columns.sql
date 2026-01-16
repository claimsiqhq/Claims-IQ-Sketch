-- Migration 050: Add missing flow engine columns
-- Adds columns needed for the phase-based flow engine

-- ============================================
-- 1. claim_flow_instances - Add missing columns
-- ============================================

ALTER TABLE claim_flow_instances 
ADD COLUMN IF NOT EXISTS current_phase_id VARCHAR(100);

ALTER TABLE claim_flow_instances 
ADD COLUMN IF NOT EXISTS current_phase_index INTEGER NOT NULL DEFAULT 0;

ALTER TABLE claim_flow_instances 
ADD COLUMN IF NOT EXISTS completed_movements JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE claim_flow_instances 
ADD COLUMN IF NOT EXISTS dynamic_movements JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================
-- 2. movement_completions - Add missing column
-- ============================================

ALTER TABLE movement_completions 
ADD COLUMN IF NOT EXISTS evidence_data JSONB;

-- ============================================
-- 3. movement_evidence - Add missing columns
-- ============================================

ALTER TABLE movement_evidence 
ADD COLUMN IF NOT EXISTS movement_id VARCHAR(200);

ALTER TABLE movement_evidence 
ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100);

ALTER TABLE movement_evidence 
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Create indexes if missing
CREATE INDEX IF NOT EXISTS claim_flow_instances_claim_idx ON claim_flow_instances(claim_id);
CREATE INDEX IF NOT EXISTS claim_flow_instances_status_idx ON claim_flow_instances(status);
CREATE INDEX IF NOT EXISTS movement_completions_flow_instance_idx ON movement_completions(flow_instance_id);
CREATE INDEX IF NOT EXISTS movement_completions_claim_idx ON movement_completions(claim_id);
CREATE INDEX IF NOT EXISTS movement_evidence_flow_instance_idx ON movement_evidence(flow_instance_id);
