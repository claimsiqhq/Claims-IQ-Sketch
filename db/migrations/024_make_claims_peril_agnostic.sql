-- Migration: Make claims table peril-agnostic
-- Removes wind/hail-specific columns and adds generic peril-specific deductibles
-- Date: 2025-01-XX

BEGIN;

-- Add peril-specific deductibles JSONB column
-- Structure: { "wind_hail": "$7,932 1%", "flood": "$5,000", etc. }
ALTER TABLE claims 
ADD COLUMN IF NOT EXISTS peril_specific_deductibles JSONB DEFAULT '{}'::jsonb;

-- Migrate existing wind_hail_deductible data to new column
UPDATE claims
SET peril_specific_deductibles = jsonb_build_object('wind_hail', wind_hail_deductible)
WHERE wind_hail_deductible IS NOT NULL 
  AND wind_hail_deductible != ''
  AND (peril_specific_deductibles IS NULL OR peril_specific_deductibles = '{}'::jsonb);

-- Migrate year_roof_install to loss_context if not already there
-- (This should already be in loss_context from canonical extraction, but ensure it)
UPDATE claims
SET loss_context = jsonb_set(
  COALESCE(loss_context, '{}'::jsonb),
  '{property,roof,year_installed}',
  to_jsonb(year_roof_install::text)
)
WHERE year_roof_install IS NOT NULL 
  AND year_roof_install != ''
  AND (loss_context->'property'->'roof'->>'year_installed' IS NULL 
       OR loss_context->'property'->'roof'->>'year_installed' = '');

-- Drop the wind/hail-specific columns
ALTER TABLE claims DROP COLUMN IF EXISTS year_roof_install;
ALTER TABLE claims DROP COLUMN IF EXISTS wind_hail_deductible;

COMMIT;
