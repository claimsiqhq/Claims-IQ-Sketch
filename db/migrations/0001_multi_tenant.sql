-- Multi-Tenant Schema Migration
-- This migration adds multi-tenancy support with organizations, claims, and document upload

-- ============================================
-- ORGANIZATIONS (TENANTS) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL DEFAULT 'carrier',
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- UPDATE USERS TABLE
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS current_organization_id UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update existing admin user to super_admin
UPDATE users SET role = 'super_admin' WHERE username = 'admin';

-- ============================================
-- ORGANIZATION MEMBERSHIPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  organization_id UUID NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_membership_user_org_idx
  ON organization_memberships(user_id, organization_id);

-- ============================================
-- CLAIMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_number VARCHAR(50) NOT NULL,
  policy_number VARCHAR(50),
  insured_name VARCHAR(255),
  insured_email VARCHAR(255),
  insured_phone VARCHAR(50),
  property_address TEXT,
  property_city VARCHAR(100),
  property_state VARCHAR(50),
  property_zip VARCHAR(20),
  date_of_loss DATE,
  loss_type VARCHAR(50),
  loss_description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'fnol',
  assigned_adjuster_id VARCHAR,
  coverage_a DECIMAL(12, 2),
  coverage_b DECIMAL(12, 2),
  coverage_c DECIMAL(12, 2),
  coverage_d DECIMAL(12, 2),
  deductible DECIMAL(12, 2),
  total_rcv DECIMAL(12, 2) DEFAULT 0,
  total_acv DECIMAL(12, 2) DEFAULT 0,
  total_paid DECIMAL(12, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS claims_org_idx ON claims(organization_id);
CREATE INDEX IF NOT EXISTS claims_claim_number_idx ON claims(claim_number);
CREATE INDEX IF NOT EXISTS claims_status_idx ON claims(status);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_id UUID,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  processing_status VARCHAR(30) DEFAULT 'pending',
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  uploaded_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_org_idx ON documents(organization_id);
CREATE INDEX IF NOT EXISTS documents_claim_idx ON documents(claim_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(type);

-- ============================================
-- UPDATE ESTIMATES TABLE
-- ============================================
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS organization_id UUID;

CREATE INDEX IF NOT EXISTS estimates_org_idx ON estimates(organization_id);

-- ============================================
-- GRANT PERMISSIONS (if needed)
-- ============================================
-- Add any necessary grants here if running as non-superuser
