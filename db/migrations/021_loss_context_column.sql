-- Migration: Add loss_context JSONB column to claims table
-- Purpose: Store canonical FNOL truth separately from policy/financial summaries
-- This column is the authoritative home for FNOL / loss-intake facts

-- Add the loss_context column to claims table
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS loss_context jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add a comment to document the column's purpose
COMMENT ON COLUMN public.claims.loss_context IS 'Canonical storage for FNOL/loss-intake facts. Structure: { fnol: { reported_by, reported_date, drone_eligible, weather }, property: { year_built, stories, roof }, damage_summary: { coverageA, coverageB, coverageC } }';

-- Create an index for efficient queries on loss_context
CREATE INDEX IF NOT EXISTS claims_loss_context_gin_idx ON public.claims USING GIN (loss_context);
