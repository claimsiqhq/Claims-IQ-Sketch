# Voice-Sketch Integration Audit Report

**Date:** 2026-01-18
**Audit ID:** 022
**Author:** Claude Code Agent

---

## Executive Summary

The voice-sketch system contains **dead code** calling the removed OLD workflow API endpoints. However, the **NEW flow engine integration infrastructure EXISTS** but is **incompletely wired up**. The voice-sketch system can work standalone but does not currently link sketches to flow movements.

| Status | Count |
|--------|-------|
| Dead Tools (remove) | 5 |
| Active Tools (keep) | 45+ |
| Missing Integration (build) | 3 items |

**Recommendation:** Option B - Build Integration Bridge (then cleanup dead code)

---

## Part 1: Voice-Sketch System Inventory

### 1.1 Geometry Engine Analysis

**File:** `client/src/features/voice-sketch/services/geometry-engine.ts`

#### Methods Inventory

| Method Name | Purpose | API Endpoint Called | Status |
|-------------|---------|---------------------|--------|
| `createRoom` | Create room geometry | none (local state) | **ACTIVE** |
| `addOpening` | Add door/window | none (local state) | **ACTIVE** |
| `addFeature` | Add closet/island | none (local state) | **ACTIVE** |
| `markDamage` | Mark damage zone | none (local state) | **ACTIVE** |
| `modifyDimension` | Adjust measurement | none (local state) | **ACTIVE** |
| `addNote` | Attach note | none (local state) | **ACTIVE** |
| `undo` | Undo last action | none (local state) | **ACTIVE** |
| `confirmRoom` | Finalize room | none (local state) | **ACTIVE** |
| `deleteRoom` | Remove room | none (local state) | **ACTIVE** |
| `editRoom` | Modify room props | none (local state) | **ACTIVE** |
| `createStructure` | Create building | none (local state) | **ACTIVE** |
| `selectStructure` | Select structure | none (local state) | **ACTIVE** |
| `triggerPhotoCapture` | Start photo capture | none (local state) | **ACTIVE** |
| `getPhotoStatus` | Check photo count | none (local state) | **ACTIVE** |
| `addPhotoAnnotation` | Annotate photo | none (local state) | **ACTIVE** |
| `selectWall` | Select wall for editing | none (local state) | **ACTIVE** |
| `updateWallProperties` | Update wall | none (local state) | **ACTIVE** |
| `moveWall` | Move wall position | none (local state) | **ACTIVE** |
| `updateOpening` | Modify opening | none (local state) | **ACTIVE** |
| `getCurrentWorkflowStep` | Get current step | `/api/claims/${claimId}/workflow` | **DEAD (404)** |
| `getStepPhotoRequirements` | Get photo reqs | `/api/claims/${claimId}/workflow` | **DEAD (404)** |
| `completeWorkflowStep` | Complete step | `/api/workflow/${id}/steps/${stepId}` | **DEAD (404)** |
| `capturePhotoForStep` | Photo for step | `/api/claims/${claimId}/workflow` | **DEAD (404)** |
| `getWorkflowStatus` | Get progress | `/api/claims/${claimId}/workflow` | **DEAD (404)** |

#### Dead Code Location in geometry-engine.ts

| Lines | Method | Status |
|-------|--------|--------|
| 2140-2177 | `getCurrentWorkflowStep` | DEAD - calls `/api/claims/${claimId}/workflow` |
| 2179-2257 | `getStepPhotoRequirements` | DEAD - calls `/api/claims/${claimId}/workflow` |
| 2259-2310 | `completeWorkflowStep` | DEAD - calls `/api/workflow/${workflowId}/steps/${stepId}` |
| 2312-2360 | `capturePhotoForStep` | DEAD - calls `/api/claims/${claimId}/workflow` |
| 2362-2402 | `getWorkflowStatus` | DEAD - calls `/api/claims/${claimId}/workflow` |
| 2458-2465 | Exported wrapper methods | DEAD - delegates to above |

---

### 1.2 Room Sketch Agent Analysis

**File:** `client/src/features/voice-sketch/agents/room-sketch-agent.ts`

#### Tools Inventory

| Tool Name | Purpose | API Dependency | Status |
|-----------|---------|----------------|--------|
| `create_structure` | Create building | none | **ACTIVE** |
| `edit_structure` | Edit building | none | **ACTIVE** |
| `delete_structure` | Remove building | none | **ACTIVE** |
| `select_structure` | Select building | none | **ACTIVE** |
| `create_room` | Create room | none | **ACTIVE** |
| `add_opening` | Add door/window | none | **ACTIVE** |
| `add_feature` | Add closet/island | none | **ACTIVE** |
| `mark_damage` | Mark damage zone | none | **ACTIVE** |
| `modify_dimension` | Adjust measurement | none | **ACTIVE** |
| `add_note` | Attach note | none | **ACTIVE** |
| `undo` | Undo last action | none | **ACTIVE** |
| `confirm_room` | Finalize room | none | **ACTIVE** |
| `delete_room` | Remove room | none | **ACTIVE** |
| `edit_room` | Modify room | none | **ACTIVE** |
| `delete_opening` | Remove opening | none | **ACTIVE** |
| `delete_feature` | Remove feature | none | **ACTIVE** |
| `edit_damage_zone` | Edit damage | none | **ACTIVE** |
| `delete_damage_zone` | Remove damage | none | **ACTIVE** |
| `select_wall` | Select wall | none | **ACTIVE** |
| `update_wall_properties` | Update wall | none | **ACTIVE** |
| `move_wall` | Move wall | none | **ACTIVE** |
| `update_opening` | Modify opening | none | **ACTIVE** |
| `create_floor_plan` | Start floor plan | none | **ACTIVE** |
| `add_room_to_plan` | Add room to plan | none | **ACTIVE** |
| `connect_rooms` | Connect rooms | none | **ACTIVE** |
| `move_room` | Move room | none | **ACTIVE** |
| `save_floor_plan` | Save floor plan | none | **ACTIVE** |
| `copy_room` | Duplicate room | none | **ACTIVE** |
| `rotate_room` | Rotate room | none | **ACTIVE** |
| `move_opening_along_wall` | Reposition opening | none | **ACTIVE** |
| `toggle_wall_missing` | Toggle wall open | none | **ACTIVE** |
| `toggle_wall_exterior` | Toggle exterior | none | **ACTIVE** |
| `check_sketch_completeness` | Check completeness | none | **ACTIVE** |
| `align_rooms` | Align rooms | none | **ACTIVE** |
| `capture_photo` | Take photo | none | **ACTIVE** |
| `get_photo_status` | Check photos | none | **ACTIVE** |
| `add_photo_annotation` | Annotate photo | none | **ACTIVE** |
| `get_current_workflow_step` | Get step | OLD `/api/workflow` | **DEAD** |
| `get_step_photo_requirements` | Get photo reqs | OLD `/api/workflow` | **DEAD** |
| `complete_workflow_step` | Complete step | OLD `/api/workflow` | **DEAD** |
| `capture_photo_for_step` | Photo for step | OLD `/api/workflow` | **DEAD** |
| `get_workflow_status` | Get status | OLD `/api/workflow` | **DEAD** |

#### Dead Tools Location in room-sketch-agent.ts

| Lines | Tool | Status |
|-------|------|--------|
| 1017-1035 | `getCurrentWorkflowStepTool` | DEAD |
| 1037-1055 | `getStepPhotoRequirementsTool` | DEAD |
| 1057-1077 | `completeWorkflowStepTool` | DEAD |
| 1079-1112 | `capturePhotoForStepTool` | DEAD |
| 1114-1129 | `getWorkflowStatusTool` | DEAD |
| 1275-1280 | Tool array entries | DEAD (references above) |
| 1336-1341 | Exported tool references | DEAD |

---

### 1.3 Exports Summary

**File:** `client/src/features/voice-sketch/index.ts`

| Export | Status |
|--------|--------|
| `VoiceSketchController` | ACTIVE |
| `VoiceWaveform` | ACTIVE |
| `RoomPreview` | ACTIVE |
| `CommandHistory` | ACTIVE |
| `VoiceSketchPage` | ACTIVE |
| `useVoiceSession` | ACTIVE |
| `useGeometryEngine` | ACTIVE (contains dead methods) |
| `geometryEngine` | ACTIVE (contains dead methods) |
| `createRoomSketchAgentAsync` | ACTIVE (creates agent with dead tools) |
| `tools` | ACTIVE (contains dead tools) |
| `types/geometry` | ACTIVE |
| `utils/polygon-math` | ACTIVE |

---

## Part 2: New Flow Engine Integration Status

### 2.1 Search Results for Flow Engine Calls

```bash
# Result of: grep -r "/api/flows" client/src/features/voice-sketch/
# No matches found
```

**Finding:** The voice-sketch directory does **NOT** call `/api/flows/*` endpoints directly.

```bash
# Result of: grep -r "flowInstanceId" client/src/features/voice-sketch/
# No matches found in VoiceSketchPage.tsx
```

**Finding:** The VoiceSketchPage does **NOT** read flow context from URL params.

---

### 2.2 FlowSketchCapture Component Analysis

**File:** `client/src/components/flow/FlowSketchCapture.tsx`

| Property | Value |
|----------|-------|
| Exists | YES |
| Accepts flowInstanceId | YES |
| Accepts movementId | YES |
| Calls getMovementSketchEvidence | YES |
| Navigates with flow context | YES - `/voice-sketch/${claimId}?flowInstanceId=X&movementId=Y` |

**Component Purpose:** Wrapper that:
1. Displays existing sketch evidence for a movement
2. Navigates to VoiceSketchPage with flow context in URL query params

**Gap Identified:** VoiceSketchPage does NOT read these query params!

---

### 2.3 VoiceGuidedInspection Component Analysis

**File:** `client/src/components/flow/VoiceGuidedInspection.tsx`

| Property | Value |
|----------|-------|
| Exists | YES |
| Accepts flowInstanceId | YES |
| Calls /api/voice-inspection/start | YES (NEW flow-connected service) |
| Uses room-sketch-agent | NO |
| Uses flow engine | YES (via voiceInspectionService) |

**Finding:** This component provides voice-guided flow navigation but does NOT use room-sketch-agent for sketch capture.

---

### 2.4 VoiceSketchPage Flow Context

**File:** `client/src/features/voice-sketch/VoiceSketchPage.tsx`

| Property | Value |
|----------|-------|
| Reads flowInstanceId from URL | NO |
| Reads movementId from URL | NO |
| Passes flow context to saveClaimHierarchy | NO |
| Uses VoiceSketchController | YES |

**Gap Identified:** FlowSketchCapture passes flow context in URL, but VoiceSketchPage ignores it!

---

## Part 3: Database Schema Check

### 3.1 Flow Context Columns

**Table: `claim_rooms`**
```sql
flow_instance_id UUID REFERENCES claim_flow_instances(id)
movement_id TEXT -- Format: "phaseId:movementId"
created_during_inspection BOOLEAN DEFAULT false
```
**Status:** SCHEMA READY

**Table: `claim_damage_zones`**
```sql
flow_instance_id UUID REFERENCES claim_flow_instances(id)
movement_id TEXT -- Format: "phaseId:movementId"
```
**Status:** SCHEMA READY

**Table: `claim_photos`**
```sql
flow_instance_id UUID REFERENCES claim_flow_instances(id)
movement_id TEXT -- Format: "phaseId:movementId"
captured_context TEXT
```
**Status:** SCHEMA READY

**Table: `movement_evidence`**
```sql
flow_instance_id UUID NOT NULL REFERENCES claim_flow_instances(id)
movement_id VARCHAR(200) NOT NULL
evidence_type VARCHAR(30) NOT NULL -- photo, audio, measurement, note
reference_id UUID -- ID of the evidence item
```
**Status:** SCHEMA READY

### 3.2 Schema Assessment

| Table | Has flow_instance_id | Has movement_id | Schema Ready |
|-------|---------------------|-----------------|--------------|
| claim_rooms | YES | YES | YES |
| claim_damage_zones | YES | YES | YES |
| claim_photos | YES | YES | YES |
| movement_evidence | YES | YES | YES |

---

## Part 4: API Route Check

### 4.1 Sketch API Routes

**Flow Engine Routes (NEW - ACTIVE):**

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/flows/:flowInstanceId/movements/:movementId/sketch-evidence` | ACTIVE |
| GET | `/api/flows/:flowInstanceId/movements/:movementId/evidence` | ACTIVE |
| POST | `/api/flows/:flowInstanceId/movements/:movementId/evidence` | ACTIVE |
| POST | `/api/flows/:flowInstanceId/movements/:movementId/complete` | ACTIVE |
| POST | `/api/flows/:flowInstanceId/movements/:movementId/validate` | ACTIVE |

**Voice Inspection Routes (NEW - ACTIVE):**

| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/voice-inspection/start` | ACTIVE |
| POST | `/api/voice-inspection/command` | ACTIVE |
| POST | `/api/voice-inspection/end` | ACTIVE |

### 4.2 API Client Functions

**File:** `client/src/lib/api.ts`

| Function | Endpoint | Status |
|----------|----------|--------|
| `saveClaimRooms` | POST `/api/claims/:id/hierarchy` | ACTIVE - accepts flowInstanceId, movementId |
| `saveClaimHierarchy` | POST `/api/claims/:id/hierarchy` | ACTIVE - does NOT pass flow context |
| `getMovementSketchEvidence` | GET `/api/flows/.../sketch-evidence` | ACTIVE |
| `addMovementEvidence` | POST `/api/flows/.../evidence` | ACTIVE |
| `completeMovement` | POST `/api/flows/.../complete` | ACTIVE |
| `validateMovementEvidence` | POST `/api/flows/.../validate` | ACTIVE |

---

## Part 5: Gap Analysis

### A. Working (Keep As-Is)

| Component | Function | Status |
|-----------|----------|--------|
| geometry-engine.ts | All room/structure/damage methods | ACTIVE |
| room-sketch-agent.ts | 40+ geometry tools | ACTIVE |
| VoiceSketchPage.tsx | Standalone sketch editing | ACTIVE |
| VoiceSketchController.tsx | Voice-driven sketching | ACTIVE |
| FlowSketchCapture.tsx | Flow context wrapper | ACTIVE |
| VoiceGuidedInspection.tsx | Voice-guided navigation | ACTIVE |
| Schema | flow_instance_id columns | READY |
| API routes | Flow engine endpoints | ACTIVE |

### B. Dead Code (Remove)

| Component | Function | Reason |
|-----------|----------|--------|
| geometry-engine.ts:2140-2177 | `getCurrentWorkflowStep` | Calls `/api/claims/${id}/workflow` (removed) |
| geometry-engine.ts:2179-2257 | `getStepPhotoRequirements` | Calls `/api/claims/${id}/workflow` (removed) |
| geometry-engine.ts:2259-2310 | `completeWorkflowStep` | Calls `/api/workflow/${id}/steps/${stepId}` (removed) |
| geometry-engine.ts:2312-2360 | `capturePhotoForStep` | Calls `/api/claims/${id}/workflow` (removed) |
| geometry-engine.ts:2362-2402 | `getWorkflowStatus` | Calls `/api/claims/${id}/workflow` (removed) |
| geometry-engine.ts:2458-2465 | Wrapper exports | Delegates to above |
| room-sketch-agent.ts:1017-1129 | 5 workflow tools | Delegate to dead methods |
| room-sketch-agent.ts:1275-1280 | Tool array entries | Reference dead tools |
| room-sketch-agent.ts:1336-1341 | Export entries | Reference dead tools |

### C. Missing Integration (Build)

| Gap | What's Needed | Priority |
|-----|---------------|----------|
| VoiceSketchPage flow context | Read `flowInstanceId` & `movementId` from URL query params | P0 |
| saveClaimHierarchy flow context | Pass flow context when saving from VoiceSketchPage | P0 |
| movement_evidence linkage | Create movement_evidence record when saving sketch during flow | P1 |
| Replacement flow tools | Replace 5 dead tools with flow engine equivalents (optional) | P2 |

---

## Part 6: Fix Plan

### Option A: Simple Cleanup (NOT RECOMMENDED)

If we just remove dead code:
1. Remove 5 dead methods from geometry-engine.ts
2. Remove 5 dead tools from room-sketch-agent.ts
3. Update exports

**Risk:** Voice sketching within flows will NOT link to movements. Sketches created via FlowSketchCapture will be orphaned.

---

### Option B: Build Integration Bridge (RECOMMENDED)

#### Phase 1: Wire Up Flow Context (P0)

**Step 1: VoiceSketchPage - Read Flow Context**

```typescript
// VoiceSketchPage.tsx
import { useSearch } from 'wouter/use-search';

// Inside component:
const search = useSearch();
const flowInstanceId = new URLSearchParams(search).get('flowInstanceId');
const movementId = new URLSearchParams(search).get('movementId');
```

**Step 2: Pass Flow Context to Save**

Modify `saveRoomsToClaim` to pass flow context:

```typescript
// In VoiceSketchPage.tsx
const saveRoomsToClaim = useCallback(async (targetClaimId: string) => {
  // ... existing code ...

  const result = await saveClaimHierarchy(
    targetClaimId,
    claimStructures,
    claimRooms,
    claimDamageZones,
    flowInstanceId,  // NEW
    movementId       // NEW
  );
  // ...
}, [flowInstanceId, movementId, ...]);
```

**Step 3: Update saveClaimHierarchy**

```typescript
// In api.ts
export async function saveClaimHierarchy(
  claimId: string,
  structures: ClaimStructure[],
  rooms: ClaimRoom[] = [],
  damageZones: ClaimDamageZone[] = [],
  flowInstanceId?: string,  // NEW
  movementId?: string       // NEW
): Promise<...> {
  // Pass flowInstanceId/movementId to backend
}
```

#### Phase 2: Create Movement Evidence Link (P1)

After saving rooms during a flow, create movement_evidence records:

```typescript
// After successful saveClaimHierarchy within a flow context
if (flowInstanceId && movementId) {
  await addMovementEvidence(flowInstanceId, movementId, {
    evidenceType: 'sketch',
    referenceId: null, // Or room ID
    userId: authUser.id
  });
}
```

#### Phase 3: Remove Dead Code (P2)

After integration works:

1. **geometry-engine.ts**
   - Remove lines 2140-2402 (5 dead workflow methods)
   - Remove lines 2458-2465 (wrapper exports)

2. **room-sketch-agent.ts**
   - Remove lines 1017-1129 (5 dead tools)
   - Remove from `agentTools` array (lines 1275-1280)
   - Remove from `tools` export (lines 1336-1341)

#### Phase 4: Optional - Replace Flow Tools (P3)

Create new flow engine tools to replace dead workflow tools:

| Old Tool | New Tool | New Endpoint |
|----------|----------|--------------|
| `get_current_workflow_step` | `get_current_movement` | `/api/flows/:id/current-movement` |
| `complete_workflow_step` | `complete_movement` | `/api/flows/:id/movements/:mid/complete` |
| `get_workflow_status` | `get_flow_progress` | `/api/flows/:id/progress` |

---

## Critical Questions Answered

### 1. Can adjusters currently do voice-guided sketching within a flow?

**PARTIALLY.** They can:
- Navigate to VoiceSketchPage via FlowSketchCapture
- Create sketches using voice commands

They cannot:
- Have sketches automatically linked to the current flow movement
- Use workflow step tools (they 404)

### 2. Is FlowSketchCapture being used in production flows?

**YES, but incompletely.**
- FlowSketchCapture navigates with flow context
- VoiceSketchPage ignores the flow context
- Result: Sketches are orphaned (no flow linkage)

### 3. When a sketch is created, is it linked to the current flow movement?

**NO.**
- Schema supports it (`flow_instance_id`, `movement_id` columns exist)
- VoiceSketchPage does not read flow context from URL
- `saveClaimHierarchy` does not pass flow context

### 4. Does the voice agent have tools for the NEW flow engine?

**NO.**
- The 5 workflow tools call OLD `/api/workflow/*` endpoints
- No new flow engine tools have been created
- Pure geometry tools work fine

---

## Risk Assessment

### If We Just Remove Dead Code (No Integration Fix)

| Risk | Impact | Likelihood |
|------|--------|------------|
| Orphaned sketches | HIGH - No flow linkage | CERTAIN |
| User confusion | MEDIUM - Workflow tools silently fail | HIGH |
| Missing evidence | HIGH - Sketches not in movement evidence | CERTAIN |
| Audit trail gaps | HIGH - No link between sketch and flow step | CERTAIN |

### If We Build Integration First, Then Cleanup

| Risk | Impact | Likelihood |
|------|--------|------------|
| Regression in standalone mode | LOW - Standalone path unchanged | LOW |
| API compatibility | LOW - Schema already supports | NONE |
| Orphaned sketches | NONE - Context passed correctly | NONE |

---

## Conclusion

**The voice-sketch system is functional but not integrated with the new flow engine.**

- **40+ geometry tools are ACTIVE** and work correctly
- **5 workflow tools are DEAD** and call removed endpoints
- **Schema is READY** for flow context linkage
- **VoiceSketchPage does NOT read flow context** from URL params
- **saveClaimHierarchy does NOT pass flow context** to backend

### Recommended Action

1. **Phase 1 (P0):** Wire up flow context in VoiceSketchPage (1-2 hours)
2. **Phase 2 (P1):** Create movement_evidence records (1 hour)
3. **Phase 3 (P2):** Remove dead code (~100 lines) (30 minutes)
4. **Phase 4 (P3, optional):** Create new flow engine tools (2-4 hours)

**Total estimated effort:** 3-4 hours for full integration, or 30 minutes for cleanup-only.

---

*This audit determines that we should build the flow integration first, then clean up dead code.*
