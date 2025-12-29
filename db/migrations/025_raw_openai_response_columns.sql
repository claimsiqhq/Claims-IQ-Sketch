-- Migration: Add raw_openai_response columns for storing unmodified OpenAI extraction data
-- This ensures we have the complete AI response for debugging, auditing, and troubleshooting
-- the mapping between OpenAI output and database/UI fields.

-- =============================================================================
-- 1. CLAIMS TABLE (FNOL raw extraction)
-- =============================================================================
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS raw_openai_response jsonb;

COMMENT ON COLUMN public.claims.raw_openai_response IS
  'Raw, unmodified JSON response from OpenAI extraction for FNOL documents.
   Stored before any transformation or mapping to database columns.';

-- =============================================================================
-- 2. POLICY_FORM_EXTRACTIONS TABLE (Policy raw extraction)
-- =============================================================================
ALTER TABLE public.policy_form_extractions
ADD COLUMN IF NOT EXISTS raw_openai_response jsonb;

COMMENT ON COLUMN public.policy_form_extractions.raw_openai_response IS
  'Raw, unmodified JSON response from OpenAI extraction for policy documents.
   Stored before any transformation to extraction_data or mapped columns.';

-- =============================================================================
-- 3. ENDORSEMENT_EXTRACTIONS TABLE (Endorsement raw extraction)
-- =============================================================================
ALTER TABLE public.endorsement_extractions
ADD COLUMN IF NOT EXISTS raw_openai_response jsonb;

COMMENT ON COLUMN public.endorsement_extractions.raw_openai_response IS
  'Raw, unmodified JSON response from OpenAI extraction for endorsement documents.
   Stored before any transformation to extraction_data or mapped columns.';

-- =============================================================================
-- INDEXES (optional, for querying raw data if needed)
-- =============================================================================
-- GIN indexes allow efficient querying of JSONB fields if needed for debugging
CREATE INDEX IF NOT EXISTS claims_raw_openai_response_gin
  ON public.claims USING gin (raw_openai_response)
  WHERE raw_openai_response IS NOT NULL;

CREATE INDEX IF NOT EXISTS pfe_raw_openai_response_gin
  ON public.policy_form_extractions USING gin (raw_openai_response)
  WHERE raw_openai_response IS NOT NULL;

CREATE INDEX IF NOT EXISTS ee_raw_openai_response_gin
  ON public.endorsement_extractions USING gin (raw_openai_response)
  WHERE raw_openai_response IS NOT NULL;
