# Sketch & Scope Agent Refactoring Summary

**Date:** 2026-01-23  
**Status:** Partially Complete - Core Features Implemented

## ✅ Completed Features

### 1. Error Handling Standardization ✅
- **File:** `client/src/features/voice-sketch/utils/error-handler.ts`
- **Status:** Complete
- **Details:**
  - Created structured error handler with voice-friendly formatting
  - Error codes, recoverability flags, and TTS-optimized messages
  - Ready for integration into both agents (partially integrated)

### 2. Geometry Validation ✅
- **File:** `client/src/features/voice-sketch/utils/geometry-validation.ts`
- **Status:** Complete (basic implementation)
- **Details:**
  - Room dimension validation (zero/negative, aspect ratios)
  - Wall placement validation
  - Room geometry consistency checks
  - Integrated into `createRoom` function
  - **TODO:** Integrate into `addOpening`, `addFeature`, and other geometry operations

### 3. Undo/Redo with Confirmation ✅
- **Files:** `client/src/features/voice-sketch/services/geometry-engine.ts`, `room-sketch-agent.ts`
- **Status:** Complete
- **Details:**
  - Undo requires confirmation before executing
  - Redo requires confirmation (basic implementation)
  - Pending state tracking (`pendingUndo`, `pendingRedo`)
  - New tools: `confirm_undo`, `redo`, `confirm_redo`
  - **Note:** Full redo stack implementation still needed

### 4. Damage Zone Severity & Surface ✅
- **Files:** 
  - `shared/schema.ts` (added `surface` field)
  - `db/migrations/057_add_damage_zone_surface_column.sql`
  - `client/src/features/voice-sketch/types/geometry.ts`
  - `client/src/features/voice-sketch/services/geometry-engine.ts`
  - `client/src/features/voice-sketch/agents/room-sketch-agent.ts`
- **Status:** Complete
- **Details:**
  - Added `severity` (minor, moderate, severe, total) and `surface` (ceiling, wall, floor, combinations) fields
  - Database migration created
  - Types updated (`DamageSeverity`, `DamageSurface`)
  - `edit_damage_zone` tool extended
  - `mark_damage` tool extended
  - Auto-syncs `floor_affected`/`ceiling_affected` when surface is set

### 5. Multi-Room Navigation ✅
- **Files:** `client/src/features/voice-sketch/services/geometry-engine.ts`, `room-sketch-agent.ts`
- **Status:** Complete
- **Details:**
  - `list_rooms` tool - enumerates rooms in current structure or all rooms
  - `select_room` tool - switches focus to specific room
  - `list_structures` tool - lists all structures
  - Context-aware (respects current structure selection)
  - Improved room name matching (case-insensitive)

### 6. Database Schema Updates ✅
- **File:** `db/migrations/057_add_damage_zone_surface_column.sql`
- **Status:** Complete
- **Details:**
  - Migration adds `surface` column to `claim_damage_zones`
  - Includes index and data migration for existing records
  - **Action Required:** Run migration before deploying

## 🚧 Partially Complete / In Progress

### 7. Geometry Validation Integration 🚧
- **Status:** Basic validation added, needs full integration
- **Remaining Work:**
  - Integrate validation into `addOpening` function
  - Integrate validation into `addFeature` function
  - Integrate validation into `modifyDimension` function
  - Add validation for angled walls (when implemented)
  - Add validation for pantry/alcove features (when implemented)

### 8. Photo Binding Logic 🚧
- **Status:** Basic implementation exists, needs flow context binding
- **Remaining Work:**
  - Ensure photos capture `flowInstanceId` and `movementId` from URL params
  - Update `triggerPhotoCapture` to accept flow context
  - Update `capturePhoto` to store flow context in photo metadata
  - Link photos to workflow steps via `movement_evidence` table
  - Validate photo requirements against workflow step before allowing completion
  - Update `addPhotoAnnotation` to validate active photo exists

### 9. Blocking Step Validation 🚧
- **Status:** Basic workflow integration exists, needs blocking enforcement
- **Remaining Work:**
  - Update `VoiceSketchPage` to read `flowInstanceId` and `movementId` from URL
  - Pass flow context to geometry engine initialization
  - Enforce blocking steps before allowing phase transitions
  - Check required evidence before marking steps complete
  - Update `completeWorkflowStep` to validate evidence requirements
  - Remove obsolete workflow API calls (old endpoints)

## ❌ Not Yet Started

### 10. Floor Plan Visualization Mode
- **Status:** Not started
- **Required Work:**
  - Add `toggle_floor_plan_view` tool to agent
  - Extend `useFloorPlanEngine` to support plan view mode
  - Add orientation toggle (North-up vs rotated)
  - Update UI components to render plan view
  - Ensure geometry updates reflect in real-time in plan view

### 11. Depreciation Workflow Integration
- **Status:** Not started
- **Required Work:**
  - Fetch claim/policy depreciation settings in Scope Agent
  - Apply depreciation calculations to line items
  - Update `estimate_line_items` with depreciation fields
  - Calculate `totalAcv` (RCV - depreciation) in estimates
  - Add voice feedback about depreciation applied
  - Document assumptions (straight-line depreciation for now)

### 12. Pantry/Alcove & Angled Walls Support
- **Status:** Not started
- **Required Work:**
  - Extend `add_feature` tool to support pantry/alcove types
  - Add angle parameter to wall creation/editing tools
  - Update geometry engine to handle non-90-degree walls
  - Update polygon math utilities for angled geometry
  - Update UI rendering for angled walls
  - Add validation for angled wall intersections

### 13. Visual Framing Guidance for Photos
- **Status:** Not started
- **Required Work:**
  - Create `FramingGuidanceOverlay` component
  - Add guidance UI to camera preview
  - Peril-specific guidance content
  - Voice reminders when entering capture mode
  - Configurable guidance (can be disabled after first use)

### 14. Caching & Performance Optimizations
- **Status:** Basic caching exists, needs enhancement
- **Remaining Work:**
  - Cache room dimension calculations
  - Cache scope context in Scope Agent (already partially done)
  - Cache workflow step data
  - Invalidate caches on state changes
  - Add performance monitoring

### 15. Voice/UI State Synchronization
- **Status:** Basic synchronization exists, needs enhancement
- **Remaining Work:**
  - Ensure sketch state saves before scope generation
  - Verify estimate status updates correctly
  - Handle backtracking (adding rooms after scope generated)
  - Test full workflow: Briefing → Workflow → Sketch → Scope → Export
  - Fix any state loss during transitions

## 📝 Implementation Notes

### Error Handling
The new error handler (`error-handler.ts`) provides a consistent format but needs to be integrated into all tool `execute` functions. Current implementation uses try/catch in some places but not consistently.

**Next Steps:**
- Wrap all tool executions with `withAgentErrorHandling`
- Update error messages to use voice-friendly format
- Ensure technical details are logged, not spoken

### Geometry Validation
Validation utilities are created but only integrated into `createRoom`. Need to add validation to:
- `addOpening` - validate opening fits on wall
- `addFeature` - validate feature fits in room
- `modifyDimension` - validate new dimensions are valid
- `markDamage` - validate damage zone polygon

### Photo Binding
Current photo capture doesn't automatically bind to flow context. Need to:
1. Read `flowInstanceId` and `movementId` from URL query params in `VoiceSketchPage`
2. Pass these to geometry engine via `setClaimId` or new `setFlowContext` method
3. Include in photo capture config
4. Store in `claim_photos` table when saving
5. Create `movement_evidence` entries for workflow linking

### Workflow Integration
The geometry engine has workflow methods but they use old endpoints. Need to:
- Update `getCurrentWorkflowStep` to use `/api/flows/:id` endpoints
- Update `completeWorkflowStep` to use `/api/flows/:id/movements/:movementId/complete`
- Remove references to old `/api/workflow/*` endpoints
- Ensure blocking step validation prevents progression

### Undo/Redo
Current implementation requires confirmation but doesn't maintain a full redo stack. For complete redo:
- Maintain a `redoStack` similar to `undoStack`
- Store state before undo operations
- Implement `redo` to restore from redo stack
- Handle edge cases (undo after redo, etc.)

## 🔧 Testing Checklist

- [ ] Test undo/redo confirmation flow
- [ ] Test damage zone severity/surface editing
- [ ] Test room listing and selection
- [ ] Test geometry validation errors
- [ ] Test photo capture with flow context
- [ ] Test workflow step completion with blocking validation
- [ ] Test full workflow: Briefing → Sketch → Scope → Export
- [ ] Test error handling in all tools
- [ ] Test state synchronization across transitions

## 📚 References

- **Prompt Sources:** `ai_prompts.voice.room_sketch`, `ai_prompts.voice.scope`, `ai_prompts.workflow.inspection_generator`
- **Model:** OpenAI GPT-4.1 via Realtime API
- **Flow Engine API:** `/api/flows/*`, `/api/claims/:claimId/flows`
- **Schema:** `shared/schema.ts` - `claimDamageZones`, `claimRooms`, `claimPhotos`, `movement_evidence`

## 🚀 Next Steps

1. **Priority 1:** Complete photo binding with flow context
2. **Priority 2:** Implement blocking step validation
3. **Priority 3:** Integrate geometry validation into all operations
4. **Priority 4:** Add floor plan visualization mode
5. **Priority 5:** Implement depreciation workflow integration
6. **Priority 6:** Add pantry/alcove and angled walls support

## ⚠️ Migration Required

**Before deploying:** Run migration `057_add_damage_zone_surface_column.sql` to add the `surface` column to `claim_damage_zones` table.
