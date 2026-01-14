-- ============================================
-- CONSOLIDATED OUTSTANDING MIGRATIONS
-- Date: 2026-01-13
-- Purpose: Apply all outstanding database migrations in one file
-- ============================================

-- ============================================
-- PART 1: ADD BRIEFING_VERSION AND WORKFLOW_VERSION TO CLAIMS
-- ============================================
-- Migration: 042_add_briefing_workflow_versions.sql

-- Add briefing_version column (tracks AI claim briefing generation version)
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS briefing_version integer NOT NULL DEFAULT 0;

-- Add workflow_version column (tracks inspection workflow generation version)
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 0;

-- Add indexes for efficient version-based queries
CREATE INDEX IF NOT EXISTS idx_claims_briefing_version ON public.claims(briefing_version);
CREATE INDEX IF NOT EXISTS idx_claims_workflow_version ON public.claims(workflow_version);

-- Add comments for documentation
COMMENT ON COLUMN public.claims.briefing_version IS 'Incremented each time a claim briefing is generated. Used for cache invalidation in voice agents.';
COMMENT ON COLUMN public.claims.workflow_version IS 'Incremented each time an inspection workflow is generated. Used for cache invalidation in voice agents.';

-- Initialize versions for existing claims
UPDATE public.claims c
SET briefing_version = 1
WHERE EXISTS (
  SELECT 1 FROM public.claim_briefings cb
  WHERE cb.claim_id = c.id
  AND cb.status = 'generated'
)
AND c.briefing_version = 0;

UPDATE public.claims c
SET workflow_version = 1
WHERE EXISTS (
  SELECT 1 FROM public.inspection_workflows iw
  WHERE iw.claim_id = c.id
)
AND c.workflow_version = 0;

-- ============================================
-- PART 2: CREATE RPC FUNCTION FOR VERSION INCREMENT
-- ============================================

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
-- PART 3: CREATE TRIGGER FUNCTIONS (Backup mechanism)
-- ============================================

-- Function to increment briefing_version when a briefing status changes to 'generated'
CREATE OR REPLACE FUNCTION increment_claim_briefing_version()
RETURNS TRIGGER AS $$
BEGIN
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

-- Create triggers
DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_increment_briefing_version ON public.claim_briefings;
  DROP TRIGGER IF EXISTS trg_increment_workflow_version ON public.inspection_workflows;

  CREATE TRIGGER trg_increment_briefing_version
    AFTER INSERT OR UPDATE OF status ON public.claim_briefings
    FOR EACH ROW
    EXECUTE FUNCTION increment_claim_briefing_version();

  CREATE TRIGGER trg_increment_workflow_version
    AFTER INSERT ON public.inspection_workflows
    FOR EACH ROW
    EXECUTE FUNCTION increment_claim_workflow_version();

  RAISE NOTICE 'Triggers created for briefing_version and workflow_version auto-increment';
END $$;

-- ============================================
-- PART 4: CREATE SESSIONS TABLE (for Passport.js)
-- ============================================

CREATE TABLE IF NOT EXISTS public.sessions (
  sid VARCHAR(255) PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx ON public.sessions (expire);

COMMENT ON TABLE public.sessions IS 'Session storage for Passport.js authentication. Managed by connect-pg-simple.';

-- ============================================
-- PART 5: VERIFICATION
-- ============================================

DO $$
DECLARE
  briefing_version_exists boolean;
  workflow_version_exists boolean;
  sessions_table_exists boolean;
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

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'sessions'
  ) INTO sessions_table_exists;

  -- Count claims with versions set
  SELECT COUNT(*) INTO claims_with_briefing
  FROM public.claims WHERE briefing_version > 0;

  SELECT COUNT(*) INTO claims_with_workflow
  FROM public.claims WHERE workflow_version > 0;

  IF briefing_version_exists AND workflow_version_exists AND sessions_table_exists THEN
    RAISE NOTICE 'SUCCESS: All migrations applied successfully';
    RAISE NOTICE '  - briefing_version column: %', briefing_version_exists;
    RAISE NOTICE '  - workflow_version column: %', workflow_version_exists;
    RAISE NOTICE '  - sessions table: %', sessions_table_exists;
    RAISE NOTICE '  - % claims have briefing_version > 0', claims_with_briefing;
    RAISE NOTICE '  - % claims have workflow_version > 0', claims_with_workflow;
  ELSE
    RAISE WARNING 'Some migrations may have failed:';
    RAISE WARNING '  - briefing_version: %', briefing_version_exists;
    RAISE WARNING '  - workflow_version: %', workflow_version_exists;
    RAISE WARNING '  - sessions table: %', sessions_table_exists;
  END IF;
END $$;
