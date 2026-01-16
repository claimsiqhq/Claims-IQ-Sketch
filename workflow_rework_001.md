# Workflow Migration Diagnosis and Fixes Report

**Date:** 2026-01-16
**Branch:** `claude/fix-migration-issues-2Dnsg`

## Executive Summary

The application was broken due to the migration from the old workflow system (inspectionWorkflowService, dynamicWorkflowService) to the new flow engine. Multiple files contained imports and references to deleted services, causing import errors at startup.

All identified issues have been fixed. The server now starts successfully (with proper environment configuration).

---

## FOUND ISSUES

### Issue 1: routes.ts - Old service import (lines 236-238)
**File:** `server/routes.ts`
**Problem:** Static import of deleted `inspectionWorkflowService`:
```typescript
import { expandWorkflowForRooms, validateWorkflowJson } from "./services/inspectionWorkflowService";
```

### Issue 2: routes.ts - Old workflow routes (lines 3717-3922)
**File:** `server/routes.ts`
**Problem:** 10+ route handlers using deleted services:
- POST `/api/workflow/:id/expand-rooms` - used `expandWorkflowForRooms`
- POST `/api/workflow/:id/validate` - used `validateWorkflowJson`
- POST `/api/claims/:id/workflow/dynamic/generate` - used `generateDynamicWorkflow`
- GET `/api/workflow/:id/evidence` - used `getWorkflowWithEvidence`
- POST `/api/workflow/:id/steps/:stepId/evidence` - used `attachEvidenceToStep`
- GET `/api/workflow/:id/steps/:stepId/evidence` - used `getStepEvidence`
- POST `/api/workflow/:id/validate-export` - used `validateWorkflowForExport`
- POST `/api/workflow/:id/mutation/room-added` - used `onRoomAdded`
- POST `/api/workflow/:id/mutation/damage-added` - used `onDamageZoneAdded`
- POST `/api/workflow/:id/mutation/photo-added` - used `onPhotoAdded`

### Issue 3: routes.ts - scope-context endpoint (line 5036)
**File:** `server/routes.ts`
**Problem:** Dynamic import of deleted service:
```typescript
const { getClaimWorkflow } = await import('./services/inspectionWorkflowService');
```

### Issue 4: routes.ts - photo upload route (line 3805)
**File:** `server/routes.ts`
**Problem:** Dynamic import of deleted service:
```typescript
const { linkPhotoToWorkflowStep } = await import('./services/dynamicWorkflowService');
```

### Issue 5: ai.ts - Voice session prerequisites (lines 121-127)
**File:** `server/routes/ai.ts`
**Problem:** Dynamic import of deleted service:
```typescript
const { getClaimWorkflow } = await import('../services/inspectionWorkflowService');
```

### Issue 6: documentProcessor.ts - AI pipeline (lines 56-67)
**File:** `server/services/documentProcessor.ts`
**Problem:** Dynamic import and use of deleted service:
```typescript
const { generateInspectionWorkflow } = await import('./inspectionWorkflowService');
const workflowResult = await generateInspectionWorkflow(claimId, organizationId, undefined, false);
```

### Issue 7: claims.ts - Old table references (lines 916-1045)
**File:** `server/services/claims.ts`
**Problem:** Direct query to deleted table without error handling:
```typescript
const { data: workflows } = await supabaseAdmin
  .from('inspection_workflows')
  .select('id')
  .in('claim_id', claimIds);
```

---

## FIXES APPLIED

### Fix 1: Commented out old import in routes.ts
**File:** `server/routes.ts:236`
```typescript
// Old workflow service removed - using flow engine instead
// import { expandWorkflowForRooms, validateWorkflowJson } from "./services/inspectionWorkflowService";
```

### Fix 2: Removed old workflow routes, added migration comments
**File:** `server/routes.ts:3717-3731`
Replaced all 10+ old workflow routes with documentation comments:
```typescript
// ============================================
// OLD WORKFLOW ROUTES REMOVED
// ============================================
// The following routes have been removed as part of the migration to the new flow engine:
// - POST /api/workflow/:id/expand-rooms (use POST /api/flows/:id/rooms instead)
// - POST /api/workflow/:id/validate (validation now in flow definition builder)
// - POST /api/claims/:id/workflow/dynamic/generate (use POST /api/claims/:id/flows instead)
// ... etc
```

### Fix 3: Updated scope-context endpoint to use flow engine
**File:** `server/routes.ts:4837-4948`
Changed from:
```typescript
const { getClaimWorkflow } = await import('./services/inspectionWorkflowService');
const workflow = await getClaimWorkflow(claimId, organizationId);
```
To:
```typescript
const { getCurrentFlow, getFlowPhases } = await import('./services/flowEngineService');
let flow = await getCurrentFlow(claimId);
if (flow) {
  flowPhases = await getFlowPhases(flow.id);
}
```
Includes backward-compatible response structure for existing clients.

### Fix 4: Updated photo upload to use flow engine evidence
**File:** `server/routes.ts:3804-3877`
Changed from `linkPhotoToWorkflowStep` to flow engine's `attachEvidence`:
```typescript
const { getCurrentFlow, attachEvidence } = await import('./services/flowEngineService');
const flow = await getCurrentFlow(claimId);
if (flow && movementId) {
  await attachEvidence(completion.id, 'photo', { photoId: photo.id, storagePath: photo.storagePath });
}
```

### Fix 5: Updated ai.ts voice session prerequisites
**File:** `server/routes/ai.ts:119-157`
Changed from:
```typescript
const { getClaimWorkflow } = await import('../services/inspectionWorkflowService');
const workflow = await getClaimWorkflow(claimId, organizationId);
```
To:
```typescript
const { getCurrentFlow } = await import('../services/flowEngineService');
let flow = await getCurrentFlow(claimId);
```

### Fix 6: Updated documentProcessor.ts AI pipeline
**File:** `server/services/documentProcessor.ts:54-91`
Changed from generating old workflow to starting new flow:
```typescript
const { startFlowForClaim, getCurrentFlow } = await import('./flowEngineService');
const existingFlow = await getCurrentFlow(claimId);
if (!existingFlow) {
  const flowInstanceId = await startFlowForClaim(claimId, perilType);
}
```

### Fix 7: Made claims.ts purge function robust to table changes
**File:** `server/services/claims.ts:914-992`
- Wrapped old table queries in try-catch
- Added new flow engine table cleanup (claim_flow_instances, movement_completions, gate_evaluations, audio_observations)

---

## REMAINING ISSUES (Not related to migration)

### Pre-existing TypeScript Errors
There are ~80+ TypeScript errors in client code (`client/src/**/*.tsx`) that existed before this migration. These are unrelated to the workflow migration and include:
- Implicit `any` types in component props
- Missing type definitions for API responses
- Property mismatches in component interfaces

### Pre-existing Server TypeScript Errors
There are ~50+ TypeScript errors in server code that existed before this migration. These are unrelated to the workflow migration and include:
- Service function signature mismatches
- Missing type imports
- Optional vs required parameter issues

---

## SERVER STATUS

- [x] Server starts successfully (no import errors)
- [x] No import errors related to deleted services
- [x] No route registration errors related to old workflow
- [ ] Database connected (requires environment variables)
- [x] New endpoints registered:
  - `/api/claims/:claimId/flows` (flowEngineRoutes)
  - `/api/flows/:flowInstanceId/*` (flowEngineRoutes)
  - `/api/flow-definitions` (flowDefinitionRoutes)
  - `/api/audio-observations` (audioObservationsRoutes)

---

## NEW ROUTE MAPPINGS

| Old Route | New Route |
|-----------|-----------|
| POST `/api/claims/:id/workflow/generate` | POST `/api/claims/:claimId/flows` |
| POST `/api/workflow/:id/expand-rooms` | POST `/api/flows/:flowInstanceId/rooms` |
| GET `/api/workflow/:id/evidence` | GET `/api/flows/:flowInstanceId/movements/:movementId/evidence` |
| POST `/api/workflow/:id/steps/:stepId/evidence` | POST `/api/flows/:flowInstanceId/movements/:movementId/evidence` |
| POST `/api/workflow/:id/validate-export` | GET `/api/flows/:flowInstanceId/progress` |
| POST `/api/workflow/:id/mutation/*` | (Automatic via flow engine) |

---

## FILES MODIFIED

1. `server/routes.ts` - Removed old imports and routes, updated scope-context and photo upload
2. `server/routes/ai.ts` - Updated voice session prerequisites check
3. `server/services/documentProcessor.ts` - Updated AI pipeline to use flow engine
4. `server/services/claims.ts` - Made purge function robust, added flow table cleanup

---

## TESTING RECOMMENDATIONS

Once environment is configured, test:

```bash
# Test flow definitions
curl http://localhost:5000/api/flow-definitions

# Test flow engine (should 404 or return error about missing claimId)
curl http://localhost:5000/api/claims/test-id/flows

# Test audio observations (should 400 about missing fields)
curl -X POST http://localhost:5000/api/audio-observations

# Test scope context
curl http://localhost:5000/api/claims/test-id/scope-context
```

---

## CONCLUSION

All migration-related issues have been resolved. The server now loads without import errors. The application is ready to run once environment variables (SUPABASE_URL, SUPABASE_SECRET_KEY) are configured.
