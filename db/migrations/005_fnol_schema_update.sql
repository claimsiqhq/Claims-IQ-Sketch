-- Migration: FNOL Schema Update
-- Updates claims table to match new FNOL JSON format
-- Adds policy_forms and endorsements tables

-- ============================================
-- UPDATE CLAIMS TABLE
-- ============================================

-- First, rename existing columns and add new ones
ALTER TABLE claims
  -- Rename claim_number to claim_id
  RENAME COLUMN claim_number TO claim_id;

-- Rename insured_name to policyholder
ALTER TABLE claims
  RENAME COLUMN insured_name TO policyholder;

-- Change date_of_loss from DATE to VARCHAR to support time
ALTER TABLE claims
  ALTER COLUMN date_of_loss TYPE VARCHAR(50);

-- Create risk_location column and migrate data
ALTER TABLE claims ADD COLUMN IF NOT EXISTS risk_location TEXT;

-- Combine existing address fields into risk_location
UPDATE claims
SET risk_location = CONCAT_WS(', ',
  property_address,
  property_city,
  CONCAT(property_state, ' ', property_zip)
)
WHERE risk_location IS NULL
  AND (property_address IS NOT NULL OR property_city IS NOT NULL OR property_state IS NOT NULL OR property_zip IS NOT NULL);

-- Rename loss_type to cause_of_loss
ALTER TABLE claims
  RENAME COLUMN loss_type TO cause_of_loss;

-- Add new policy details columns
ALTER TABLE claims ADD COLUMN IF NOT EXISTS state VARCHAR(10);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS year_roof_install VARCHAR(20);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS wind_hail_deductible VARCHAR(50);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS dwelling_limit VARCHAR(50);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS endorsements_listed JSONB DEFAULT '[]'::jsonb;

-- Migrate coverage_a to dwelling_limit (if numeric, format as currency)
UPDATE claims
SET dwelling_limit = CONCAT('$', TO_CHAR(coverage_a, 'FM999,999,999'))
WHERE dwelling_limit IS NULL AND coverage_a IS NOT NULL;

-- Migrate deductible to wind_hail_deductible
UPDATE claims
SET wind_hail_deductible = CONCAT('$', TO_CHAR(deductible, 'FM999,999'))
WHERE wind_hail_deductible IS NULL AND deductible IS NOT NULL;

-- Migrate property_state to state
UPDATE claims
SET state = property_state
WHERE state IS NULL AND property_state IS NOT NULL;

-- Drop old columns that are no longer needed
ALTER TABLE claims DROP COLUMN IF EXISTS insured_email;
ALTER TABLE claims DROP COLUMN IF EXISTS insured_phone;
ALTER TABLE claims DROP COLUMN IF EXISTS property_address;
ALTER TABLE claims DROP COLUMN IF EXISTS property_city;
ALTER TABLE claims DROP COLUMN IF EXISTS property_state;
ALTER TABLE claims DROP COLUMN IF EXISTS property_zip;
ALTER TABLE claims DROP COLUMN IF EXISTS property_latitude;
ALTER TABLE claims DROP COLUMN IF EXISTS property_longitude;
ALTER TABLE claims DROP COLUMN IF EXISTS geocode_status;
ALTER TABLE claims DROP COLUMN IF EXISTS geocoded_at;
ALTER TABLE claims DROP COLUMN IF EXISTS coverage_a;
ALTER TABLE claims DROP COLUMN IF EXISTS coverage_b;
ALTER TABLE claims DROP COLUMN IF EXISTS coverage_c;
ALTER TABLE claims DROP COLUMN IF EXISTS coverage_d;
ALTER TABLE claims DROP COLUMN IF EXISTS deductible;

-- Update indexes
DROP INDEX IF EXISTS claims_claim_number_idx;
CREATE INDEX IF NOT EXISTS claims_claim_id_idx ON claims(claim_id);

-- ============================================
-- CREATE POLICY FORMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS policy_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_id UUID,

  -- Form identification
  form_type VARCHAR(50) NOT NULL DEFAULT 'Policy Form',
  form_number VARCHAR(50) NOT NULL,
  document_title VARCHAR(255),
  description TEXT,

  -- Key provisions as JSONB
  key_provisions JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS policy_forms_org_idx ON policy_forms(organization_id);
CREATE INDEX IF NOT EXISTS policy_forms_claim_idx ON policy_forms(claim_id);
CREATE INDEX IF NOT EXISTS policy_forms_form_number_idx ON policy_forms(form_number);

-- ============================================
-- CREATE ENDORSEMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_id UUID,

  -- Endorsement identification
  form_type VARCHAR(50) NOT NULL DEFAULT 'Endorsement',
  form_number VARCHAR(50) NOT NULL,
  document_title VARCHAR(255),
  description TEXT,

  -- Key changes as JSONB
  key_changes JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS endorsements_org_idx ON endorsements(organization_id);
CREATE INDEX IF NOT EXISTS endorsements_claim_idx ON endorsements(claim_id);
CREATE INDEX IF NOT EXISTS endorsements_form_number_idx ON endorsements(form_number);

-- ============================================
-- ADD FOREIGN KEY CONSTRAINTS
-- ============================================

-- Add foreign keys to policy_forms
ALTER TABLE policy_forms
  ADD CONSTRAINT fk_policy_forms_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE policy_forms
  ADD CONSTRAINT fk_policy_forms_claim
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;

-- Add foreign keys to endorsements
ALTER TABLE endorsements
  ADD CONSTRAINT fk_endorsements_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE endorsements
  ADD CONSTRAINT fk_endorsements_claim
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;
