-- Add missing peril_specific column to inspection_workflow_steps
ALTER TABLE inspection_workflow_steps 
ADD COLUMN IF NOT EXISTS peril_specific VARCHAR(50) DEFAULT NULL;
