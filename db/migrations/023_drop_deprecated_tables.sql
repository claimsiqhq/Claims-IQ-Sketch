-- Migration: Drop deprecated tables
-- The policyForms and endorsements tables have been replaced by:
-- - policy_form_extractions (for comprehensive policy data)
-- - endorsement_extractions (for comprehensive endorsement data)
-- These new tables provide better structure and support lossless extraction storage.

-- Drop deprecated policy_forms table
DROP TABLE IF EXISTS policy_forms CASCADE;

-- Drop deprecated endorsements table  
DROP TABLE IF EXISTS endorsements CASCADE;
