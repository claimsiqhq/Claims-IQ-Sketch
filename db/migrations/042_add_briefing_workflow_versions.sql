-- Migration: Add briefing_version and workflow_version to claims table
-- Date: 2026-01-13
-- Purpose: Track versions of briefings and workflows for cache invalidation and voice agent sync
--
-- These version numbers are incremented each time a briefing or workflow is generated/regenerated
-- for a claim. Voice agents use these versions to detect when cached context is stale.

-- ============================================
-- PART 1: ADD VERSION COLUMNS TO CLAIMS TABLE
-- ============================================

-- Add briefing_version column (tracks AI claim briefing generation version)
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS briefing_version integer NOT NULL DEFAULT 0;

-- Add workflow_version column (tracks inspection workflow generation version)
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 0;

-- Add index for efficient version-based queries
CREATE INDEX IF NOT EXISTS idx_claims_briefing_version ON public.claims(briefing_version);
CREATE INDEX IF NOT EXISTS idx_claims_workflow_version ON public.claims(workflow_version);

-- Add comments for documentation
COMMENT ON COLUMN public.claims.briefing_version IS 'Incremented each time a claim briefing is generated. Used for cache invalidation in voice agents.';
COMMENT ON COLUMN public.claims.workflow_version IS 'Incremented each time an inspection workflow is generated. Used for cache invalidation in voice agents.';

-- ============================================
-- PART 2: INITIALIZE VERSIONS FOR EXISTING CLAIMS
-- ============================================

-- Set briefing_version to 1 for claims that have at least one briefing
UPDATE public.claims c
SET briefing_version = 1
WHERE EXISTS (
  SELECT 1 FROM public.claim_briefings cb
  WHERE cb.claim_id = c.id
  AND cb.status = 'generated'
)
AND c.briefing_version = 0;

-- Set workflow_version to 1 for claims that have at least one workflow
UPDATE public.claims c
SET workflow_version = 1
WHERE EXISTS (
  SELECT 1 FROM public.inspection_workflows iw
  WHERE iw.claim_id = c.id
)
AND c.workflow_version = 0;

-- ============================================
-- PART 3: CREATE RPC FUNCTION FOR VERSION INCREMENT
-- ============================================

-- RPC function to increment claim version (briefing or workflow)
-- This is called from application code for explicit control
CREATE OR REPLACE FUNCTION increment_claim_version(
  p_claim_id uuid,
  p_version_type text
)
RETURNS void AS $$
BEGIN
  IF p_version_type = 'briefing' THEN
    UPDATE public.claims
    SET briefing_version = briefing_version + 1,
        updated_at = NOW()
    WHERE id = p_claim_id;
  ELSIF p_version_type = 'workflow' THEN
    UPDATE public.claims
    SET workflow_version = workflow_version + 1,
        updated_at = NOW()
    WHERE id = p_claim_id;
  ELSE
    RAISE EXCEPTION 'Invalid version_type: %. Must be "briefing" or "workflow"', p_version_type;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_claim_version IS 'Atomically increments the briefing_version or workflow_version for a claim. Used for cache invalidation in voice agents.';

-- ============================================
-- PART 4: CREATE TRIGGER FUNCTIONS (Backup mechanism)
-- ============================================

-- Note: Version incrementing is primarily handled in application code
-- These triggers serve as a backup mechanism

-- Function to increment briefing_version when a briefing status changes to 'generated'
CREATE OR REPLACE FUNCTION increment_claim_briefing_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment on INSERT with status='generated' OR UPDATE that changes status to 'generated'
  IF (TG_OP = 'INSERT' AND NEW.status = 'generated') OR
     (TG_OP = 'UPDATE' AND OLD.status != 'generated' AND NEW.status = 'generated') THEN
    UPDATE public.claims
    SET briefing_version = briefing_version + 1,
        updated_at = NOW()
    WHERE id = NEW.claim_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to increment workflow_version when a new workflow is inserted
CREATE OR REPLACE FUNCTION increment_claim_workflow_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.claims
  SET workflow_version = workflow_version + 1,
      updated_at = NOW()
  WHERE id = NEW.claim_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (only if they don't exist)
DO $$
BEGIN
  -- Drop existing triggers if they exist (to ensure clean state)
  DROP TRIGGER IF EXISTS trg_increment_briefing_version ON public.claim_briefings;
  DROP TRIGGER IF EXISTS trg_increment_workflow_version ON public.inspection_workflows;

  -- Create trigger for briefing version (fires on INSERT and UPDATE)
  CREATE TRIGGER trg_increment_briefing_version
    AFTER INSERT OR UPDATE OF status ON public.claim_briefings
    FOR EACH ROW
    EXECUTE FUNCTION increment_claim_briefing_version();

  -- Create trigger for workflow version
  CREATE TRIGGER trg_increment_workflow_version
    AFTER INSERT ON public.inspection_workflows
    FOR EACH ROW
    EXECUTE FUNCTION increment_claim_workflow_version();

  RAISE NOTICE 'Triggers created for briefing_version and workflow_version auto-increment';
END $$;

-- ============================================
-- PART 4: VERIFICATION
-- ============================================

DO $$
DECLARE
  briefing_version_exists boolean;
  workflow_version_exists boolean;
  claims_with_briefing integer;
  claims_with_workflow integer;
BEGIN
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'claims'
    AND column_name = 'briefing_version'
  ) INTO briefing_version_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'claims'
    AND column_name = 'workflow_version'
  ) INTO workflow_version_exists;

  -- Count claims with versions set
  SELECT COUNT(*) INTO claims_with_briefing
  FROM public.claims WHERE briefing_version > 0;

  SELECT COUNT(*) INTO claims_with_workflow
  FROM public.claims WHERE workflow_version > 0;

  IF briefing_version_exists AND workflow_version_exists THEN
    RAISE NOTICE 'SUCCESS: Version columns added to claims table';
    RAISE NOTICE '  - % claims have briefing_version > 0', claims_with_briefing;
    RAISE NOTICE '  - % claims have workflow_version > 0', claims_with_workflow;
  ELSE
    RAISE WARNING 'FAILED: Could not verify version columns';
  END IF;
END $$;
