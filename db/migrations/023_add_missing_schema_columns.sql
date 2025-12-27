-- Migration: Add missing columns to match schema.ts
-- Generated from schema validation on 2024-12-27
-- Run in Supabase SQL Editor

-- ============================================
-- claim_checklist_items (10 missing columns)
-- ============================================

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS required_for_perils JSONB DEFAULT '[]'::jsonb;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS required_for_severities JSONB DEFAULT '[]'::jsonb;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS conditional_logic JSONB DEFAULT '{}'::jsonb;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT true;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS skipped_reason TEXT;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS linked_document_ids JSONB DEFAULT '[]'::jsonb;

ALTER TABLE claim_checklist_items
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;

-- ============================================
-- claim_checklists (8 missing columns)
-- ============================================

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS peril VARCHAR(50) NOT NULL DEFAULT 'other';

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS severity VARCHAR(30) NOT NULL DEFAULT 'moderate';

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS template_version VARCHAR(20) DEFAULT '1.0';

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS total_items INTEGER NOT NULL DEFAULT 0;

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS completed_items INTEGER NOT NULL DEFAULT 0;

ALTER TABLE claim_checklists
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- endorsement_extractions (9 missing columns)
-- ============================================

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS form_code VARCHAR(100) NOT NULL DEFAULT '';

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS title VARCHAR(255);

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS edition_date VARCHAR(50);

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS applies_to_policy_forms JSONB DEFAULT '[]'::jsonb;

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS modifications JSONB DEFAULT '{}'::jsonb;

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS tables JSONB DEFAULT '[]'::jsonb;

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS raw_text TEXT;

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS extraction_model VARCHAR(100);

ALTER TABLE endorsement_extractions
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ============================================
-- inspection_workflow_steps (6 missing columns)
-- ============================================

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb;

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS actual_minutes INTEGER;

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS completed_by VARCHAR;

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS room_name VARCHAR(100);

-- ============================================
-- policy_form_extractions (17 missing columns)
-- ============================================

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS policy_form_code VARCHAR(100);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS policy_form_name VARCHAR(255);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS edition_date VARCHAR(50);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS page_count INTEGER;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS policy_structure JSONB DEFAULT '{}'::jsonb;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS definitions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS section_i JSONB DEFAULT '{}'::jsonb;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS section_ii JSONB DEFAULT '{}'::jsonb;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS general_conditions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS raw_page_text TEXT;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS extraction_model VARCHAR(100);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS extraction_version_str VARCHAR(20);

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS total_tokens INTEGER;

ALTER TABLE policy_form_extractions
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ============================================
-- Update organization_id constraint after data migration
-- ============================================
-- After populating claim_checklists.organization_id with real values,
-- run this to remove the default:
-- ALTER TABLE claim_checklists ALTER COLUMN organization_id DROP DEFAULT;

-- ============================================
-- Create indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS claim_checklists_org_idx ON claim_checklists(organization_id);
CREATE INDEX IF NOT EXISTS claim_checklists_peril_idx ON claim_checklists(peril);
CREATE INDEX IF NOT EXISTS endorsement_extractions_form_code_idx ON endorsement_extractions(form_code);
CREATE INDEX IF NOT EXISTS policy_form_extractions_form_code_idx ON policy_form_extractions(policy_form_code);
