-- Migration: Clear Legacy Workflow Format
-- Date: 2026-01-13
-- Purpose: Remove all existing workflows that use legacy assets format
--          Forces regeneration with new evidence_requirements format
--          NO BACKWARD COMPATIBILITY - clean break

-- ============================================
-- CLEAR LEGACY WORKFLOWS
-- ============================================

-- Delete all workflow steps (cascade will handle foreign keys)
DELETE FROM inspection_workflow_steps;

-- Delete all workflow assets (legacy format - deprecated)
DELETE FROM inspection_workflow_assets;

-- Delete all workflows (forces regeneration with new format)
DELETE FROM inspection_workflows;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify cleanup (should return 0 rows)
-- SELECT COUNT(*) FROM inspection_workflows;
-- SELECT COUNT(*) FROM inspection_workflow_steps;
-- SELECT COUNT(*) FROM inspection_workflow_assets;

-- ============================================
-- NOTES
-- ============================================
-- This migration intentionally removes all existing workflows.
-- Users will need to regenerate workflows using the new format.
-- The new format uses evidence_requirements in workflow_json instead of assets table.
-- Step type configuration now determines default evidence requirements.
