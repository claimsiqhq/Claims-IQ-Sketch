-- Migration: Remove deprecated columns
-- These columns have been superseded by newer tables/fields

-- Remove deprecated endorsements_listed column from claims
-- Note: This data should now come from endorsement_extractions table
-- Only run if you have verified no code still references this column

-- Uncomment when ready to execute:
-- ALTER TABLE claims DROP COLUMN IF EXISTS endorsements_listed;

-- For now, just add a comment to mark it deprecated
COMMENT ON COLUMN claims.endorsements_listed IS 
  'DEPRECATED: Use endorsement_extractions table instead. Scheduled for removal.';
