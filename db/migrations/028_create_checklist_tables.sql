-- Migration: Create Checklist Tables
-- Issue: Checklist generation failing because tables may not exist
-- This ensures the tables are created if they don't exist

-- ============================================
-- claim_checklists table
-- ============================================
CREATE TABLE IF NOT EXISTS claim_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL,
  organization_id UUID NOT NULL,

  -- Checklist context
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Generation context
  peril VARCHAR(50) NOT NULL DEFAULT 'other',
  severity VARCHAR(30) NOT NULL DEFAULT 'moderate',
  template_version VARCHAR(20) DEFAULT '1.0',

  -- Progress tracking
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- ============================================
-- claim_checklist_items table
-- ============================================
CREATE TABLE IF NOT EXISTS claim_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES claim_checklists(id) ON DELETE CASCADE,

  -- Item details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,

  -- Conditions
  required_for_perils JSONB DEFAULT '[]'::jsonb,
  required_for_severities JSONB DEFAULT '[]'::jsonb,
  conditional_logic JSONB DEFAULT '{}'::jsonb,

  -- Requirements
  required BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,

  -- Status tracking
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_by VARCHAR,
  completed_at TIMESTAMP,
  skipped_reason TEXT,

  -- Notes and evidence
  notes TEXT,
  linked_document_ids JSONB DEFAULT '[]'::jsonb,

  -- Due date
  due_date TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS claim_checklists_claim_idx ON claim_checklists(claim_id);
CREATE INDEX IF NOT EXISTS claim_checklists_org_idx ON claim_checklists(organization_id);
CREATE INDEX IF NOT EXISTS claim_checklists_status_idx ON claim_checklists(status);
CREATE INDEX IF NOT EXISTS claim_checklists_peril_idx ON claim_checklists(peril);

CREATE INDEX IF NOT EXISTS claim_checklist_items_checklist_idx ON claim_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS claim_checklist_items_status_idx ON claim_checklist_items(status);
CREATE INDEX IF NOT EXISTS claim_checklist_items_category_idx ON claim_checklist_items(category);
