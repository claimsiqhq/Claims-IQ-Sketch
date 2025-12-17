-- Migration 014: Endorsement Amendments Enhancement
-- Adds new fields to support detailed endorsement extraction

-- Add applies_to_state column for state-specific endorsements
ALTER TABLE endorsements
ADD COLUMN IF NOT EXISTS applies_to_state VARCHAR(100);

-- Add index for state lookups
CREATE INDEX IF NOT EXISTS endorsements_state_idx ON endorsements(applies_to_state);

-- Add unique constraint for upsert operations (organization_id, claim_id, form_number)
-- This allows ON CONFLICT to work when processing documents
CREATE UNIQUE INDEX IF NOT EXISTS endorsements_org_claim_form_unique_idx
ON endorsements(organization_id, claim_id, form_number)
WHERE claim_id IS NOT NULL;

-- Note: keyAmendments will be stored in the existing key_changes JSONB column
-- The structure will be: { "keyAmendments": [...], ... }
-- This allows backward compatibility with existing data

-- Add a comment to document the expected structure
COMMENT ON COLUMN endorsements.key_changes IS
'JSONB object containing endorsement changes. Expected structure: { "keyAmendments": [{ "provisionAmended": "string", "summaryOfChange": "string", "newLimitOrValue": "string | null" }] }';

COMMENT ON COLUMN endorsements.applies_to_state IS
'The state the endorsement amends the policy for, if state-specific (e.g., Wisconsin)';
