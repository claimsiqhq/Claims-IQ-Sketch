# Task 3: Clean Up - Legacy Format Removal Summary

## ✅ Completed

### 1. Removed Legacy Assets Support from Step Type Config
**File:** `shared/config/stepTypeConfig.ts`
- Removed `assets` parameter from `shouldShowPhotoCapture()`
- Removed `assets` parameter from `getRequiredPhotoCount()`
- Functions now ONLY use `evidenceRequirements` or step type config defaults

### 2. Removed Legacy Assets from UI Components
**Files:**
- `client/src/components/workflow/step-completion-dialog.tsx`
  - Removed `step.assets` parameter from helper function calls
  - Removed `assets` field from `StepData` interface
- `client/src/components/workflow-panel.tsx`
  - Removed `step.assets` references from validation logic
  - Removed `assets` mapping when creating `StepData` objects
  - Updated to only check `pendingPhotos` (no stored assets)

### 3. Removed Legacy Assets from Server Code
**File:** `server/services/inspectionWorkflowService.ts`
- Removed `assets` insertion into `inspection_workflow_assets` table
- Removed `assets` mapping when creating steps from workflow JSON
- Updated to use `evidence_requirements` from AI response only
- Removed legacy assets transformation in `normalizeAIResponse()`

### 4. Created Migration to Clear Old Workflows
**File:** `db/migrations/046_clear_legacy_workflows.sql`
- Deletes all existing workflows, steps, and assets
- Forces regeneration with new format
- NO backward compatibility - clean break

## ⚠️ Remaining References (If Any)

Some references to `assets` may still exist in:
- Database schema (table exists but won't be used)
- Type definitions (for backward compatibility during transition)
- These can be removed in a future cleanup pass

## Next Steps

1. Run migration: `psql -f db/migrations/046_clear_legacy_workflows.sql`
2. Test workflow generation with new format
3. Verify no legacy assets are created
4. Monitor for any errors related to missing assets
