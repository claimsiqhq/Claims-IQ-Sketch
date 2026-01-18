# Workflow Systems Diagnostic Report

**Date:** 2026-01-18
**Analyst:** Claude Code
**Repository:** Claims-IQ-Sketch

---

## Executive Summary

| Finding | Status |
|---------|--------|
| Two workflow systems found | **YES** |
| Old system still active | **NO** (routes removed, data cleared) |
| Claims using old system | **0** (cleared by migration 046) |
| Old frontend still rendered | **YES** (will cause 404 errors) |
| Safe to deprecate old | **YES** - requires frontend cleanup |

### Key Discovery

The application has **two workflow systems** but the OLD system is already **non-functional**:

- The OLD system's **backend routes have been removed** (documented in `routes.ts:3799-3812`)
- The OLD system's **data was cleared** by migration 046
- However, the OLD system's **frontend component is still being rendered** in `claim-detail.tsx`
- This means the UI will show broken "Inspection Workflow" panels that fail with 404 errors

**Immediate action required:** Remove the legacy `WorkflowPanel` component from `claim-detail.tsx`.

---

## System Mapping

### NEW System: "Inspection Flow" ✅ ACTIVE

The new movement-based flow engine is fully operational.

**Services:**
| File | Purpose | Status |
|------|---------|--------|
| `server/services/flowEngineService.ts` | Main flow engine logic | ✅ Active |
| `server/services/flowEngine/index.ts` | Flow engine module | ✅ Active |
| `server/services/flowDefinitionService.ts` | Flow template management | ✅ Active |
| `server/services/workflowRulesEngine.ts` | Rules for generating workflow steps | ✅ Active |

**Routes:**
| File | Endpoints | Registration |
|------|-----------|--------------|
| `server/routes/flowEngineRoutes.ts` | `/api/claims/:claimId/flows`, `/api/flows/:id/*` | `routes/index.ts:16` |
| `server/routes/flowDefinitionRoutes.ts` | `/api/flow-definitions/*` | `routes/index.ts:17` |

**UI Components:**
| File | Purpose |
|------|---------|
| `client/src/pages/flow-progress.tsx` | Flow progress view |
| `client/src/pages/flow-builder.tsx` | Flow definition builder |
| `client/src/components/flow/ClaimFlowSection.tsx` | Flow section in claim detail |
| `client/src/components/flow/FlowStatusCard.tsx` | Flow status display |
| `client/src/components/flow/StartFlowButton.tsx` | Flow start button |
| `client/src/components/flow/PhaseCard.tsx` | Phase display |
| `client/src/components/flow/VoiceGuidedInspection.tsx` | Voice-guided inspection |
| `client/src/components/flow/FlowProgressBar.tsx` | Progress indicator |
| `client/src/components/flow/FlowSketchCapture.tsx` | Sketch capture in flow |
| `client/src/components/flow/EvidenceGrid.tsx` | Evidence display |

**Database Tables:**
| Table | Purpose | Has Data |
|-------|---------|----------|
| `flow_definitions` | Flow templates (JSON-based) | ✅ Yes (seeded) |
| `claim_flow_instances` | Active flow instances per claim | ✅ Yes |
| `movement_completions` | Completed movements with evidence | ✅ Yes |
| `movement_evidence` | Evidence attached to movements | ✅ Yes |

**Navigation Entries:**
- ✅ Desktop: "Flow Builder" at `/flow-builder` (`DesktopLayout.tsx:61`)
- ✅ Mobile: "Flow Builder" in More menu (`MobileLayout.tsx:225-230`)

---

### OLD System: "Workflow Inspection" ⚠️ DEFUNCT

The old step-based workflow system has been **fully deprecated** on the backend but UI components remain.

**Services:**
| File | Purpose | Status |
|------|---------|--------|
| `server/services/inspectionWorkflowService.ts` | OLD workflow generation | 🔴 **Import commented out** |

**Routes:**
| Endpoint | Status |
|----------|--------|
| `POST /api/claims/:id/workflow/generate` | 🔴 **REMOVED** |
| `GET /api/claims/:id/workflow` | 🔴 **REMOVED** |
| `GET /api/claims/:id/workflow/status` | 🔴 **REMOVED** |
| `POST /api/claims/:id/workflow/regenerate` | 🔴 **REMOVED** |
| `GET /api/workflow/:id` | 🔴 **REMOVED** |
| `PATCH /api/workflow/:id/steps/:stepId` | 🔴 **REMOVED** |
| `POST /api/workflow/:id/steps` | 🔴 **REMOVED** |
| `POST /api/workflow/:id/rooms` | 🔴 **REMOVED** |
| `POST /api/workflow/:id/expand-rooms` | 🔴 **REMOVED** |
| `POST /api/workflow/:id/steps/:stepId/evidence` | 🔴 **REMOVED** |

All old routes documented as removed in `routes.ts:3799-3812`.

**UI Components (STILL PRESENT):**
| File | Purpose | Status |
|------|---------|--------|
| `client/src/components/workflow-panel.tsx` | Old workflow panel (1492 lines) | ⚠️ **ORPHANED** |
| `client/src/components/workflow/workflow-wizard.tsx` | Wizard for old workflow | ⚠️ **ORPHANED** |
| `client/src/components/workflow/step-completion-dialog.tsx` | Step completion | ⚠️ **ORPHANED** |
| `client/src/components/workflow/photo-capture.tsx` | Photo capture | ⚠️ **ORPHANED** |
| `client/src/components/workflow/sync-status.tsx` | Sync indicator | ⚠️ **ORPHANED** |
| `client/src/components/workflow/voice-input.tsx` | Voice input | ⚠️ **ORPHANED** |
| `client/src/components/workflow/evidence-capture.tsx` | Evidence capture | ⚠️ **ORPHANED** |
| `client/src/components/workflow/findings-templates.tsx` | Finding templates | ⚠️ **ORPHANED** |
| `client/src/components/workflow/export-validation-panel.tsx` | Export validation | ⚠️ **ORPHANED** |

**Database Tables:**
| Table | Purpose | Has Data |
|-------|---------|----------|
| `inspection_workflows` | Old workflow records | ❌ **Cleared by migration 046** |
| `inspection_workflow_steps` | Old workflow steps | ❌ **Cleared by migration 046** |
| `inspection_workflow_assets` | Old step assets (deprecated) | ❌ **Cleared by migration 046** |
| `inspection_workflow_rooms` | Old room records | ❌ **Cleared by migration 046** |

**Navigation Entries:**
- ❌ None (no separate entry for old workflow)

---

## Cross-Contamination Analysis

### Backend: ✅ CLEAN
- Old service import is **commented out** in `routes.ts:238`
- No active routes call old workflow services
- New flow engine does not import old workflow code

### Frontend: ⚠️ CROSS-CONTAMINATED

**Critical Issue in `claim-detail.tsx`:**

```tsx
// Lines 2393-2400
{/* Flow Engine Section - New movement-based inspection flow */}
<ClaimFlowSection
  claimId={apiClaim.id}
  perilType={apiClaim.primaryPeril || apiClaim.lossType}
/>

{/* Legacy Workflow Panel - Existing step-based workflow */}
<WorkflowPanel claimId={apiClaim.id} />
```

Both systems are rendered in the "Workflow" tab:
- Line 2394: `ClaimFlowSection` (NEW system) - **Works correctly**
- Line 2400: `WorkflowPanel` (OLD system) - **Will fail with 404 errors**

### API Client (`client/src/lib/api.ts`):

Old workflow API functions still exist (lines 2487-2672):
- `generateInspectionWorkflow()` → calls removed endpoint
- `getClaimWorkflow()` → calls removed endpoint
- `getWorkflowStatus()` → calls removed endpoint
- `regenerateWorkflow()` → calls removed endpoint
- `updateWorkflowStep()` → calls removed endpoint
- `addWorkflowStep()` → calls removed endpoint
- `addWorkflowRoom()` → calls removed endpoint
- `expandWorkflowRooms()` → calls removed endpoint
- `attachEvidenceToStep()` → calls removed endpoint

All these will return **404 Not Found** errors.

---

## Active Data Check

### Claims with old workflow data: **0**
- Migration 046 cleared all data from `inspection_workflows`, `inspection_workflow_steps`, `inspection_workflow_assets`

### Claims with new flow instances: **Active**
- Flow instances are created when users start "Inspection Flow"
- Data lives in `claim_flow_instances`, `movement_completions`, `movement_evidence`

### Claims with BOTH: **0**
- Not possible since old data was cleared

---

## Deprecation Plan

### Phase 1: Frontend Cleanup (IMMEDIATE - P0)

The old system's frontend is **already broken** since backend routes don't exist.

1. **Remove `WorkflowPanel` from claim-detail.tsx**
   ```tsx
   // Remove lines 137 and 2399-2400 from client/src/pages/claim-detail.tsx
   // Remove import: import { WorkflowPanel } from "@/components/workflow-panel";
   // Remove rendering: <WorkflowPanel claimId={apiClaim.id} />
   ```

2. **Remove old API functions from api.ts** (lines 2487-2672)
   - `generateInspectionWorkflow`
   - `getClaimWorkflow`
   - `getWorkflowStatus`
   - `regenerateWorkflow`
   - `getWorkflow`
   - `updateWorkflowStep`
   - `addWorkflowStep`
   - `addWorkflowRoom`
   - `expandWorkflowRooms`
   - `attachEvidenceToStep`
   - `getStepEvidence`

### Phase 2: Component Removal (P1)

After Phase 1 is deployed and verified:

1. Delete `client/src/components/workflow-panel.tsx`
2. Delete entire `client/src/components/workflow/` directory:
   - `workflow-wizard.tsx`
   - `step-completion-dialog.tsx`
   - `photo-capture.tsx`
   - `sync-status.tsx`
   - `voice-input.tsx`
   - `evidence-capture.tsx`
   - `findings-templates.tsx`
   - `export-validation-panel.tsx`

### Phase 3: Schema Cleanup (P2)

After confirming no references remain:

1. **Archive old table definitions from `shared/schema.ts`**:
   - `inspectionWorkflows` (line 2775)
   - `inspectionWorkflowSteps` (line 2831)
   - `inspectionWorkflowAssets` (line 2907)
   - `inspectionWorkflowRooms` (line 2960)

2. **Create migration to drop old tables** (after backup):
   ```sql
   -- Migration: Drop legacy workflow tables
   DROP TABLE IF EXISTS inspection_workflow_assets;
   DROP TABLE IF EXISTS inspection_workflow_rooms;
   DROP TABLE IF EXISTS inspection_workflow_steps;
   DROP TABLE IF EXISTS inspection_workflows;
   ```

### Phase 4: Backend Cleanup (P2)

1. Delete `server/services/inspectionWorkflowService.ts` (if it still exists and is unused)
2. Remove commented import from `routes.ts:238`
3. Remove "OLD WORKFLOW ROUTES REMOVED" documentation block (routes.ts:3798-3812)

---

## Files to Modify

| File | Action | Priority | Reason |
|------|--------|----------|--------|
| `client/src/pages/claim-detail.tsx` | Remove WorkflowPanel import and usage | **P0** | Frontend broken |
| `client/src/lib/api.ts` | Remove old workflow API functions | **P0** | Dead code |
| `client/src/components/workflow-panel.tsx` | DELETE | P1 | Orphaned component |
| `client/src/components/workflow/*` | DELETE (entire directory) | P1 | Orphaned components |
| `shared/schema.ts` | Remove old table definitions | P2 | Cleanup |

## Files to Delete

| File | Reason | Blocked By |
|------|--------|------------|
| `client/src/components/workflow-panel.tsx` | Old system - 1492 lines | Remove from claim-detail.tsx first |
| `client/src/components/workflow/workflow-wizard.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/step-completion-dialog.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/photo-capture.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/sync-status.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/voice-input.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/evidence-capture.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/findings-templates.tsx` | Old system component | Remove workflow-panel.tsx first |
| `client/src/components/workflow/export-validation-panel.tsx` | Old system component | Remove workflow-panel.tsx first |

---

## Success Criteria

After completing this deprecation:

- ✅ Complete inventory of both workflow systems
- ✅ Clear understanding of which tables have active data (OLD: none, NEW: active)
- ✅ Map of all UI entry points for both systems
- ✅ Identification of cross-dependencies
- ✅ Safe deprecation plan that won't break existing claims
- ✅ Prioritized list of files to modify/delete

---

## Appendix: Route Migration Reference

| Old Route | New Route |
|-----------|-----------|
| `POST /api/claims/:id/workflow/generate` | `POST /api/claims/:claimId/flows` |
| `GET /api/claims/:id/workflow` | `GET /api/claims/:claimId/flows` |
| `POST /api/workflow/:id/expand-rooms` | `POST /api/flows/:id/rooms` |
| `GET /api/workflow/:id/evidence` | `GET /api/flows/:id/movements/:movementId/evidence` |
| `POST /api/workflow/:id/steps/:stepId/evidence` | `POST /api/flows/:id/movements/:movementId/evidence` |
| `POST /api/workflow/:id/validate-export` | `GET /api/flows/:id/progress` |

---

## Next Steps

1. **If old system has NO active data** → ✅ Confirmed - Proceed directly to removal
2. **If old system HAS active data** → N/A - Data was already cleared by migration 046
3. **Share diagnostic report for review before making changes**

**Recommendation:** Execute Phase 1 immediately to fix the broken UI. The old `WorkflowPanel` component is actively causing 404 errors for users viewing the Workflow tab.
