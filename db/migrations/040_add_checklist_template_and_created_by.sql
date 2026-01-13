-- Migration: Add template_id and created_by columns to claim_checklists table
-- Date: 2026-01-12
-- Issue: These columns were added to the schema but not yet applied to the database

-- Add template_id column (optional, links to checklist template)
ALTER TABLE claim_checklists 
ADD COLUMN IF NOT EXISTS template_id UUID;

-- Add created_by column (optional, references users.id)
ALTER TABLE claim_checklists 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Add comment for documentation
COMMENT ON COLUMN claim_checklists.template_id IS 'Optional: link to checklist template if using templates';
COMMENT ON COLUMN claim_checklists.created_by IS 'User who created the checklist';
