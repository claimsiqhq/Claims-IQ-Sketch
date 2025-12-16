-- Migration: 010_claim_briefings.sql
-- Description: Add AI-generated claim briefings table
-- Part of: Peril-Aware AI Claim Briefing feature

-- ============================================
-- CLAIM BRIEFINGS TABLE
-- ============================================
-- Stores AI-generated briefings for claims based on:
-- - Normalized peril data
-- - Structured FNOL & policy metadata
-- - Endorsements
--
-- Briefings are cached by source_hash to avoid regenerating
-- when the underlying data hasn't changed.
-- ============================================

CREATE TABLE IF NOT EXISTS claim_briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

    -- Peril context
    peril VARCHAR(50) NOT NULL,
    secondary_perils JSONB DEFAULT '[]'::jsonb,

    -- Cache key - hash of inputs used to generate briefing
    source_hash VARCHAR(64) NOT NULL,

    -- The briefing content (structured JSON)
    briefing_json JSONB NOT NULL,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'generated',
    -- Possible statuses: 'generating', 'generated', 'error', 'stale'

    -- AI model used
    model VARCHAR(100),

    -- Token usage tracking
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,

    -- Error tracking (if generation failed)
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by claim
CREATE INDEX IF NOT EXISTS idx_claim_briefings_claim_id ON claim_briefings(claim_id);

-- Index for cache lookup by source hash
CREATE INDEX IF NOT EXISTS idx_claim_briefings_source_hash ON claim_briefings(claim_id, source_hash);

-- Index for organization queries
CREATE INDEX IF NOT EXISTS idx_claim_briefings_org_id ON claim_briefings(organization_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_claim_briefings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_claim_briefings_updated_at ON claim_briefings;
CREATE TRIGGER trigger_update_claim_briefings_updated_at
    BEFORE UPDATE ON claim_briefings
    FOR EACH ROW
    EXECUTE FUNCTION update_claim_briefings_updated_at();

-- ============================================
-- BRIEFING JSON SCHEMA (for reference)
-- ============================================
-- The briefing_json field stores:
-- {
--   "claim_summary": {
--     "primary_peril": "string",
--     "secondary_perils": ["string"],
--     "overview": ["string"]
--   },
--   "inspection_strategy": {
--     "where_to_start": ["string"],
--     "what_to_prioritize": ["string"],
--     "common_misses": ["string"]
--   },
--   "peril_specific_risks": ["string"],
--   "endorsement_watchouts": [
--     {
--       "endorsement_id": "string",
--       "impact": "string",
--       "inspection_implications": ["string"]
--     }
--   ],
--   "photo_requirements": [
--     {
--       "category": "string",
--       "items": ["string"]
--     }
--   ],
--   "sketch_requirements": ["string"],
--   "depreciation_considerations": ["string"],
--   "open_questions_for_adjuster": ["string"]
-- }
-- ============================================

COMMENT ON TABLE claim_briefings IS 'AI-generated claim briefings for field adjusters, cached by source hash';
COMMENT ON COLUMN claim_briefings.source_hash IS 'SHA-256 hash of input data used to generate briefing - for cache invalidation';
COMMENT ON COLUMN claim_briefings.briefing_json IS 'Structured briefing output in JSON format';
COMMENT ON COLUMN claim_briefings.status IS 'generating=in progress, generated=complete, error=failed, stale=needs refresh';
