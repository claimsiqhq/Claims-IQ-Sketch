# Claims IQ Sketch - Agent & Developer Reference

> **Purpose:** This file is the authoritative reference for any AI coding agent (Claude Code, Cursor, Windsurf, Copilot) or human developer working in this codebase. Read this FIRST before making changes.

---

## Project Overview

Claims IQ Sketch is a mobile-first property inspection application for insurance field adjusters. It combines voice-guided workflows, sketch capture, photo evidence, and AI-assisted documentation to streamline the claims inspection process.

**Tech Stack:**
- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS, Shadcn/ui, TanStack Query
- **Backend:** Node.js + Express, TypeScript
- **Database:** PostgreSQL via Drizzle ORM
- **AI Services:** OpenAI (GPT-4, Whisper, Vision), AWS Textract
- **Mobile:** Responsive web with PWA capabilities

---

## Architecture Map

```
claims-iq-sketch/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── flow/          # ✅ ACTIVE - New flow engine UI
│   │   │   ├── workflow/      # ⛔ DEPRECATED - Old workflow (orphaned)
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── claim-detail.tsx    # Main claim view
│   │   │   ├── flow-progress.tsx   # Flow execution view
│   │   │   └── flow-builder.tsx    # Flow definition editor
│   │   ├── lib/
│   │   │   └── api.ts              # API client functions
│   │   └── hooks/
│   └── index.html
├── server/
│   ├── routes/
│   │   ├── index.ts                # Route registration
│   │   ├── flowEngineRoutes.ts     # ✅ ACTIVE - Flow engine API
│   │   ├── flowDefinitionRoutes.ts # ✅ ACTIVE - Flow templates API
│   │   └── ...
│   ├── services/
│   │   ├── flowEngineService.ts        # ✅ ACTIVE - Flow execution logic
│   │   ├── flowDefinitionService.ts    # ✅ ACTIVE - Flow template management
│   │   ├── workflowRulesEngine.ts      # ✅ ACTIVE - Step generation rules
│   │   ├── inspectionWorkflowService.ts # ⛔ DEPRECATED - Do not use
│   │   └── ...
│   └── index.ts
├── shared/
│   └── schema.ts                   # Drizzle schema definitions
└── drizzle/                        # Database migrations
```

---

## ⚠️ CRITICAL: Two Workflow Systems

This codebase contains TWO inspection workflow systems. **Only use the NEW system.**

### ✅ NEW System: "Inspection Flow" (Movement-Based)

**Status:** ACTIVE - This is the production system

**Concept:** Flows are composed of "movements" (atomic inspection tasks). Each movement captures evidence and advances the flow.

**Database Tables:**
| Table | Purpose |
|-------|---------|
| `flow_definitions` | Flow templates (JSON schema) |
| `claim_flow_instances` | Active flow per claim |
| `movement_completions` | Completed movements with data |
| `movement_evidence` | Photos/files attached to movements |

**API Routes:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/claims/:claimId/flows` | Get flows for a claim |
| `POST` | `/api/claims/:claimId/flows` | Start a new flow |
| `GET` | `/api/flows/:id` | Get flow details |
| `POST` | `/api/flows/:id/movements/:movementId/complete` | Complete a movement |
| `GET` | `/api/flows/:id/progress` | Get flow progress |
| `GET` | `/api/flow-definitions` | List flow templates |
| `POST` | `/api/flow-definitions` | Create flow template |

**Frontend Components:**
| Component | Path | Purpose |
|-----------|------|---------|
| `ClaimFlowSection` | `components/flow/ClaimFlowSection.tsx` | Flow section in claim detail |
| `FlowStatusCard` | `components/flow/FlowStatusCard.tsx` | Flow status display |
| `StartFlowButton` | `components/flow/StartFlowButton.tsx` | Initiate new flow |
| `PhaseCard` | `components/flow/PhaseCard.tsx` | Display flow phase |
| `VoiceGuidedInspection` | `components/flow/VoiceGuidedInspection.tsx` | Voice-guided capture |
| `FlowProgressBar` | `components/flow/FlowProgressBar.tsx` | Progress indicator |
| `FlowSketchCapture` | `components/flow/FlowSketchCapture.tsx` | Sketch integration |
| `EvidenceGrid` | `components/flow/EvidenceGrid.tsx` | Evidence display |

**Services:**
| Service | Path | Purpose |
|---------|------|---------|
| `flowEngineService` | `server/services/flowEngineService.ts` | Core flow execution |
| `flowDefinitionService` | `server/services/flowDefinitionService.ts` | Template CRUD |
| `workflowRulesEngine` | `server/services/workflowRulesEngine.ts` | Step generation |

---

### ⛔ OLD System: "Inspection Workflow" (Step-Based)

**Status:** DEPRECATED - Backend removed, frontend orphaned

> **DO NOT USE.** This system's backend routes have been removed. Any frontend components referencing it will cause 404 errors.

**Database Tables (EMPTY - Cleared by migration 046):**
- `inspection_workflows` - No data
- `inspection_workflow_steps` - No data  
- `inspection_workflow_assets` - No data
- `inspection_workflow_rooms` - No data

**API Routes:** ALL REMOVED (documented in routes.ts:3799-3812)

**Frontend Components (ORPHANED - Pending Deletion):**
| Component | Path | Status |
|-----------|------|--------|
| `WorkflowPanel` | `components/workflow-panel.tsx` | ⛔ ORPHANED - 1492 lines |
| `WorkflowWizard` | `components/workflow/workflow-wizard.tsx` | ⛔ ORPHANED |
| `StepCompletionDialog` | `components/workflow/step-completion-dialog.tsx` | ⛔ ORPHANED |
| `PhotoCapture` | `components/workflow/photo-capture.tsx` | ⛔ ORPHANED |
| `SyncStatus` | `components/workflow/sync-status.tsx` | ⛔ ORPHANED |
| `VoiceInput` | `components/workflow/voice-input.tsx` | ⛔ ORPHANED |
| `EvidenceCapture` | `components/workflow/evidence-capture.tsx` | ⛔ ORPHANED |
| `FindingsTemplates` | `components/workflow/findings-templates.tsx` | ⛔ ORPHANED |
| `ExportValidationPanel` | `components/workflow/export-validation-panel.tsx` | ⛔ ORPHANED |

**API Client Functions (DEAD CODE in api.ts:2487-2672):**
- `generateInspectionWorkflow()` → 404
- `getClaimWorkflow()` → 404
- `getWorkflowStatus()` → 404
- `regenerateWorkflow()` → 404
- `updateWorkflowStep()` → 404
- `addWorkflowStep()` → 404
- `addWorkflowRoom()` → 404
- `expandWorkflowRooms()` → 404
- `attachEvidenceToStep()` → 404

---

## Known Issues

### P0 - Broken UI (Causes User-Facing Errors)

~~1. **`claim-detail.tsx` renders deprecated `WorkflowPanel`**~~ - ✅ Fixed (removed deprecated component references)

### P1 - Dead Code (No User Impact, Technical Debt)

1. **Old API functions in `api.ts`** (lines 2487-2672) - Deprecated workflow API functions
2. ~~**Orphaned components in `components/workflow/`**~~ - ✅ Cleaned up (directory removed)
3. ~~**`workflow-panel.tsx`** (1492 lines of dead code)~~ - ✅ Cleaned up (file removed)

### P2 - Schema Cleanup (Future)

1. **Empty tables in schema.ts**: `inspectionWorkflows`, `inspectionWorkflowSteps`, etc.
2. **Commented import in routes.ts:238**

---

## Development Guidelines

### Adding New Features

1. **For inspection/workflow features:** Use the NEW flow engine (`flowEngineService`, `/api/flows/*`)
2. **For UI components:** Add to `components/flow/`, NOT `components/workflow/`
3. **For database changes:** Only modify NEW tables (`flow_definitions`, `claim_flow_instances`, etc.)

### Before Making Changes

1. Check this file for system status
2. Verify which system your target code belongs to
3. **Never import from `components/workflow/`**
4. **Never call old workflow API functions**

### Testing Flows

```bash
# Start a flow for a claim
curl -X POST http://localhost:3000/api/claims/{claimId}/flows \
  -H "Content-Type: application/json" \
  -d '{"flowDefinitionId": "standard-inspection"}'

# Check flow progress
curl http://localhost:3000/api/flows/{flowId}/progress

# Complete a movement
curl -X POST http://localhost:3000/api/flows/{flowId}/movements/{movementId}/complete \
  -H "Content-Type: application/json" \
  -d '{"data": {...}, "evidence": [...]}'
```

---

## Route Migration Reference

If you encounter old endpoint references, use this mapping:

| Old Route | New Route |
|-----------|-----------|
| `POST /api/claims/:id/workflow/generate` | `POST /api/claims/:claimId/flows` |
| `GET /api/claims/:id/workflow` | `GET /api/claims/:claimId/flows` |
| `POST /api/workflow/:id/expand-rooms` | `POST /api/flows/:id/rooms` |
| `GET /api/workflow/:id/evidence` | `GET /api/flows/:id/movements/:movementId/evidence` |
| `POST /api/workflow/:id/steps/:stepId/evidence` | `POST /api/flows/:id/movements/:movementId/evidence` |
| `POST /api/workflow/:id/validate-export` | `GET /api/flows/:id/progress` |

---

## Database Schema Audit (2026-01-23)

**Status:** ✅ **SCHEMA MATCHES CODE** - Comprehensive audit completed

### Audit Summary

A comprehensive audit was performed comparing database schema definitions (`shared/schema.ts`) with actual code usage in services and routes. **All critical tables and columns exist and match code expectations.**

### Flow Engine Tables

| Table | Status | Key Columns |
|-------|--------|-------------|
| `flow_definitions` | ✅ Match | `id`, `organization_id`, `name`, `peril_type`, `flow_json`, `version`, `is_active` |
| `claim_flow_instances` | ✅ Match | `id`, `claim_id`, `flow_definition_id`, `status`, `current_phase_id`, `completed_movements` |
| `movement_completions` | ✅ Match | `id`, `flow_instance_id`, `movement_id`, `movement_phase`, `claim_id`, `evidence_data`, `skipped_required` |
| `movement_evidence` | ✅ Match | `id`, `flow_instance_id`, `movement_id`, `evidence_type`, `reference_id` |

### Evidence Tables

| Table | Status | Key Columns |
|-------|--------|-------------|
| `audio_observations` | ✅ Match | `id`, `organization_id`, `claim_id`, `flow_instance_id`, `movement_id`, `movement_completion_id`, `audio_storage_path`, `transcription_status`, `extraction_status` |
| `claim_photos` | ✅ Match | `id`, `organization_id`, `claim_id`, `flow_instance_id`, `movement_id`, `storage_path`, `analysis_status` |

### Column Naming Convention

**✅ Consistent:** All database columns use **snake_case** (`claim_id`, `flow_instance_id`).  
**Code Mapping:** Services correctly map TypeScript camelCase (`claimId`, `flowInstanceId`) to database snake_case.

### Foreign Keys

**✅ All Foreign Keys Present:**
- `claim_flow_instances.claim_id` → `claims.id` (CASCADE)
- `claim_flow_instances.flow_definition_id` → `flow_definitions.id`
- `movement_completions.flow_instance_id` → `claim_flow_instances.id` (CASCADE)
- `movement_completions.claim_id` → `claims.id` (CASCADE)
- `movement_evidence.flow_instance_id` → `claim_flow_instances.id` (CASCADE)
- `audio_observations.organization_id` → `organizations.id` (CASCADE)
- `audio_observations.flow_instance_id` → `claim_flow_instances.id` (SET NULL)
- `audio_observations.movement_completion_id` → `movement_completions.id` (SET NULL)
- `claim_photos.organization_id` → `organizations.id`
- `claim_photos.claim_id` → `claims.id`

**Note:** `claim_photos.flow_instance_id` and `claim_photos.movement_id` intentionally have **no FK constraints** (nullable references that may not always have valid targets).

### Indexes

**✅ All Required Indexes Present:**
- Flow instance indexes on `claim_id`, `status`, `flow_definition_id`
- Movement completion indexes on `flow_instance_id`, `movement_id`, `claim_id`, `movement_phase`
- Movement evidence indexes on `flow_instance_id`, `movement_id`, `evidence_type`
- Audio observation indexes on `organization_id`, `claim_id`, `flow_instance_id`, `movement_id`
- Claim photo indexes on `claim_id`, `organization_id`, `flow_instance_id`, `movement_id`, `structure_id`, `room_id`

### Migrations Applied

1. ✅ **048_flow_engine_tables.sql** - Creates flow engine tables
2. ✅ **051_fix_audio_observations_flow_columns.sql** - Adds flow context columns to audio_observations
3. ✅ **055_add_movement_completions_columns.sql** - Adds validation columns to movement_completions

### Verification Script

Run the audit script to verify schema consistency:
```sql
\i db/audit_schema_consistency.sql
```

### Potential Issues

**⚠️ Minor:** Audio upload route (`server/routes.ts:4302`) passes `movementCompletionId: movementId`. The service correctly maps this to `movement_completion_id` column. If the route also needs to set `movement_id` (string format "phaseId:movementId"), it should pass a separate parameter. **Status:** Functional, but could be clarified.

### Full Audit Report

See `SCHEMA_AUDIT_REPORT.md` for complete details.

---

## Key Files Quick Reference

| Purpose | File |
|---------|------|
| Main claim view | `client/src/pages/claim-detail.tsx` |
| Flow execution page | `client/src/pages/flow-progress.tsx` |
| Flow template builder | `client/src/pages/flow-builder.tsx` |
| API client | `client/src/lib/api.ts` |
| Route registration | `server/routes/index.ts` |
| Flow engine routes | `server/routes/flowEngineRoutes.ts` |
| Flow engine service | `server/services/flowEngineService.ts` |
| Database schema | `shared/schema.ts` |

---

## Sketching System

**Status:** ✅ MVP Ready - Fully functional with save/load, tooltips, and proper data persistence

### Overview

The sketching system allows field adjusters to create floor plans with rooms, structures, damage zones, openings, and features. It supports both voice-guided creation and manual manipulation via toolbar tools.

**Key Features:**
- Voice-guided room creation via `VoiceSketchController`
- Manual sketch manipulation via `SketchToolbar`
- Automatic save/load of rooms and damage zones per claim
- Damage zone tracking with severity and affected surfaces
- Photo integration with sketch rooms
- Undo/redo functionality
- Grid and parallel snapping for precise alignment

### Core Components

| Component | Path | Purpose |
|-----------|------|---------|
| `VoiceSketchController` | `client/src/features/voice-sketch/components/VoiceSketchController.tsx` | Main voice-driven sketch interface with hierarchy display |
| `SketchToolbar` | `client/src/features/voice-sketch/components/SketchToolbar.tsx` | Professional toolbar for manual sketch manipulation (desktop/mobile responsive) |
| `geometry-engine` | `client/src/features/voice-sketch/services/geometry-engine.ts` | Zustand store managing sketch state (rooms, structures, photos, command history) |
| `sketch-manipulation-store` | `client/src/features/voice-sketch/services/sketch-manipulation-store.ts` | Store for selection, tool modes, and manipulation operations |

### Data Flow

#### Save Process (`claim-detail.tsx:1064-1143`)
1. User clicks "Save" button in `VoiceSketchController`
2. `handleSaveVoiceSketch()` collects all rooms from geometry engine
3. Converts `RoomGeometry[]` → `ClaimRoom[]` and `ClaimDamageZone[]`
4. Calls `saveClaimRooms(claimId, rooms, damageZones)` API
5. Shows success toast with counts
6. Resets geometry engine session
7. Reloads claim data to refresh saved rooms

**Save Function Preserves:**
- Room dimensions (width, length, ceiling height)
- Room position (origin_x_ft, origin_y_ft) ✅ Fixed 2026-01-23
- Room shape (rectangle, l_shape, t_shape, irregular)
- Structure ID (for multi-structure properties)
- Openings (doors, windows, archways)
- Features (closets, alcoves, islands, etc.)
- Notes
- Damage zones with severity mapping

#### Load Process (`claim-detail.tsx:623-684`)
1. When claim opens, `useEffect` detects `savedRooms` array
2. Converts `ClaimRoom[]` → `RoomGeometry[]` with `convertClaimRoomToRoomGeometry()`
3. Maps damage zones from `savedDamageZones` to room's `damageZones` array
4. Calls `useGeometryEngine.getState().loadRooms(geometryRooms)`
5. Sets `claimId` in geometry engine
6. Shows toast notification: "Loaded X saved room(s)"

**Load Function Handles:**
- Type conversions (string/number for dimensions)
- Severity mapping (minor/moderate/severe/total)
- Default values for missing fields
- Damage zone association by `roomId`
- Prevents duplicate loading via `loadedForClaimId` check

### Geometry Engine State

**Key State Properties:**
- `rooms: RoomGeometry[]` - All confirmed rooms
- `currentRoom: RoomGeometry | null` - Room being created/edited
- `structures: Structure[]` - Building structures (main dwelling, garage, etc.)
- `currentStructure: Structure | null` - Active structure
- `photos: SketchPhoto[]` - Photos linked to rooms/structures
- `commandHistory: Command[]` - History for undo/redo
- `undoStack: Command[]` - Stack for redo operations
- `claimId: string | null` - Current claim context
- `loadedForClaimId: string | null` - Tracks which claim's data is loaded

**Key Methods:**
- `loadRooms(rooms)` - Load rooms into engine (clears existing)
- `loadFromClaimData(structures, rooms)` - Load with structures
- `resetSession()` - Clear all state
- `setClaimId(claimId)` - Set claim context
- `undo(count)` / `redo(count)` - Undo/redo operations

### API Functions

**Save/Load (`client/src/lib/api.ts`):**
- `saveClaimRooms(claimId, rooms, damageZones)` - Persist sketch data
- `getClaimRooms(claimId)` - Fetch saved rooms and damage zones

**Data Types:**
- `ClaimRoom` - Database format (strings for dimensions)
- `RoomGeometry` - In-memory format (numbers for dimensions)
- `ClaimDamageZone` - Database damage zone format
- `VoiceDamageZone` - In-memory damage zone format

### Recent Fixes (2026-01-23 - MVP Readiness)

#### ✅ Fixed: Saved Rooms Not Loading
- **Issue:** Rooms saved to database were not loaded when opening claim
- **Fix:** Added `useEffect` in `claim-detail.tsx` (lines 623-684) to auto-load saved rooms
- **Impact:** Users can now resume sketches after closing/reopening claims

#### ✅ Fixed: Missing Tooltips
- **Issue:** Several buttons lacked tooltips (Undo, Reset, Save, Add Structure, AI Suggestions)
- **Fix:** Added `Tooltip` components to all buttons in `VoiceSketchController` and `claim-detail.tsx`
- **Impact:** Better UX with clear button descriptions

#### ✅ Fixed: Position Data Loss on Save
- **Issue:** `origin_x_ft` and `origin_y_ft` were hardcoded to '0' in save function
- **Fix:** Updated `handleSaveVoiceSketch()` to preserve `voiceRoom.origin_x_ft` and `origin_y_ft`
- **Impact:** Room positions persist correctly after save/reload

#### ✅ Fixed: Severity Mapping
- **Issue:** Damage zone severity not properly mapped between save/load formats
- **Fix:** Added bidirectional severity mapping in both save and load functions
- **Impact:** Damage severity (minor/moderate/severe/total) persists correctly

#### ✅ Fixed: Missing Field Preservation
- **Issue:** Save function didn't preserve `structureId`, `openings`, `features`, `notes`
- **Fix:** Updated save function to include all `RoomGeometry` fields
- **Impact:** Complete sketch data now persists

#### ✅ Added: Reset Confirmation Dialog
- **Feature:** Added `AlertDialog` confirmation before resetting sketch session
- **Impact:** Prevents accidental data loss

#### ✅ Added: Loading Feedback
- **Feature:** Toast notification when saved rooms are loaded
- **Impact:** Users know when their previous sketch has been restored

#### ✅ Added: ClaimId Initialization
- **Feature:** `VoiceSketchController` now initializes geometry engine with `claimId` on mount
- **Impact:** Proper claim context for all sketch operations

### Usage Guidelines

#### Creating a Sketch
1. Open claim detail page → "Sketch" tab
2. Use voice commands via `VoiceSketchController` OR use `SketchToolbar` for manual drawing
3. Create structures (Main House, Garage, etc.)
4. Add rooms within structures
5. Add openings (doors/windows), features (closets/islands), and damage zones
6. Click "Save" button to persist to database

#### Loading a Saved Sketch
- Automatically loads when claim opens (if rooms exist)
- Toast notification confirms: "Loaded X saved room(s)"
- All rooms, damage zones, and positions are restored

#### Manual Manipulation
- Use `SketchToolbar` for:
  - Selecting rooms/walls
  - Moving/rotating/copying rooms
  - Aligning multiple rooms
  - Toggling wall types (exterior/interior/missing)
  - Grid and parallel snapping
  - Undo/redo

#### Best Practices
- Always save before navigating away
- Use structures to organize multi-building properties
- Add damage zones to rooms with damage
- Use grid snapping for precise measurements
- Check sketch completeness badge for missing required data

### Known Limitations

1. **Polygon Data:** Room `polygon` arrays are not yet persisted (currently empty on save/load)
2. **Photo Linking:** Photos captured during sketch are stored separately; room-photo associations via `roomId` in photo metadata
3. **Sub-rooms:** `parentRoomId` and `subRooms` are not yet fully implemented in save/load
4. **Structures:** Structure data is managed separately; rooms reference `structureId` but structures themselves aren't saved with rooms

### Future Enhancements

- Persist room polygon coordinates for irregular shapes
- Full sub-room hierarchy support
- Structure persistence alongside rooms
- Sketch versioning/history
- Export to CAD formats
- Measurement validation against photos

---

## Contact & Resources

- **Repository:** Claims-IQ-Sketch
- **Documentation:** Confluence (Claims IQ space)
- **Project Management:** Asana
- **Last Updated:** 2026-01-23 (Schema audit completed)

---

## File Cleanup (2026-01-23)

**Deleted Files:**
- ✅ Removed 50+ old analysis/audit MD files (workflow_analysis_*.md, workflow_audit_*.md, analysis_*.md)
- ✅ Removed temporary summary files (ALL_FIXES_COMPLETE.md, FIXES_APPLIED.md, etc.)
- ✅ Removed old diagnostic SQL scripts (update_prompts_*.sql)
- ✅ Removed test files (test.jpg)
- ✅ Removed misplaced TypeScript file (docs/Validateperilcontext.ts)

**Kept Essential Files:**
- ✅ `CLAUDE.md` - Main developer reference (this file)
- ✅ `README.md` - Project overview
- ✅ `CHANGELOG.md` - Version history
- ✅ `ARCHITECTURE.md` - Technical architecture documentation
- ✅ `replit.md` - Replit-specific configuration
- ✅ `docs/` directory - Feature documentation (kept relevant docs)

---

*This file should be updated whenever architectural changes are made to the codebase.*
