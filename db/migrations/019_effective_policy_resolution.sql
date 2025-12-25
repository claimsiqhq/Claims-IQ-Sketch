-- Migration 019: Effective Policy Resolution
-- Description: Add effective policy JSON and validation results to claims table
-- Purpose: Enable deterministic policy resolution from base policy + endorsements

-- ============================================
-- EFFECTIVE POLICY JSON COLUMN
-- ============================================
-- Stores the resolved effective policy for a claim
-- Recomputed when: claim is created, endorsement is added, policy form is updated

ALTER TABLE claims
ADD COLUMN IF NOT EXISTS effective_policy_json JSONB DEFAULT NULL;

COMMENT ON COLUMN claims.effective_policy_json IS
'Resolved effective policy JSON combining base policy + endorsements. Structure: EffectivePolicy interface. Recomputed on claim/endorsement/policy changes.';

-- Index for querying claims with resolved policies
CREATE INDEX IF NOT EXISTS claims_effective_policy_exists_idx
ON claims ((effective_policy_json IS NOT NULL))
WHERE effective_policy_json IS NOT NULL;

-- ============================================
-- POLICY VALIDATION RESULTS COLUMN
-- ============================================
-- Stores advisory validation results for estimates
-- Never blocks - only provides warnings and info

ALTER TABLE claims
ADD COLUMN IF NOT EXISTS policy_validation_results JSONB DEFAULT NULL;

COMMENT ON COLUMN claims.policy_validation_results IS
'Advisory validation results from estimate comparison against effective policy. Structure: PolicyValidationResponse interface. Updated when estimates change.';

-- ============================================
-- EFFECTIVE POLICY RESOLUTION TIMESTAMP
-- ============================================
-- Track when the effective policy was last resolved

ALTER TABLE claims
ADD COLUMN IF NOT EXISTS effective_policy_resolved_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN claims.effective_policy_resolved_at IS
'Timestamp when effective_policy_json was last computed. Used for cache invalidation.';

-- ============================================
-- ENDORSEMENT EXTRACTIONS TABLE ENHANCEMENT
-- ============================================
-- Add priority field to support precedence ordering

-- First check if the table exists (created via Supabase)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'endorsement_extractions'
  ) THEN
    -- Add priority column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'endorsement_extractions'
      AND column_name = 'precedence_priority'
    ) THEN
      ALTER TABLE endorsement_extractions
      ADD COLUMN precedence_priority INTEGER DEFAULT 100;

      COMMENT ON COLUMN endorsement_extractions.precedence_priority IS
      'Precedence priority for policy resolution. Lower = higher priority.
      1-10: Loss settlement/schedule endorsements
      11-30: Coverage-specific endorsements
      31-50: State amendatory endorsements
      51-100: Base policy provisions';
    END IF;

    -- Add endorsement_type column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'endorsement_extractions'
      AND column_name = 'endorsement_type'
    ) THEN
      ALTER TABLE endorsement_extractions
      ADD COLUMN endorsement_type VARCHAR(50) DEFAULT 'general';

      COMMENT ON COLUMN endorsement_extractions.endorsement_type IS
      'Type of endorsement for precedence ordering: state_amendatory, coverage_specific, loss_settlement, schedule, general';
    END IF;
  END IF;
END $$;

-- ============================================
-- FEATURE FLAG SUPPORT
-- ============================================
-- Note: Feature flags stored in organizations.settings JSONB
-- Default structure: { "effectivePolicy": { "enabled": false, "version": 1, ... } }
-- No schema change needed - using existing settings column

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- RLS policies follow existing claims table pattern
-- No additional policies needed as claims already has RLS configured

-- ============================================
-- HELPER VIEW FOR CLAIMS WITH POLICY RESOLUTION STATUS
-- ============================================

CREATE OR REPLACE VIEW claims_policy_status AS
SELECT
  c.id,
  c.organization_id,
  c.claim_number,
  c.effective_policy_json IS NOT NULL AS has_effective_policy,
  c.effective_policy_resolved_at,
  c.policy_validation_results IS NOT NULL AS has_validation_results,
  COALESCE(
    jsonb_array_length(
      COALESCE(
        c.policy_validation_results->'validationResults',
        '[]'::jsonb
      )
    ),
    0
  ) AS validation_count,
  COALESCE(
    (c.policy_validation_results->'summary'->>'warningCount')::int,
    0
  ) AS warning_count,
  c.created_at,
  c.updated_at
FROM claims c
WHERE c.status != 'deleted';

COMMENT ON VIEW claims_policy_status IS
'Helper view showing policy resolution and validation status for claims. Used for admin monitoring.';
