# Inspection Workflow Codebase Audit

**Generated:** 2026-01-15
**Audit Scope:** Full inventory for JSON-driven flow refactor

---

## Executive Summary

The inspection workflow system is a moderately complex, AI-powered step-generation system with a solid foundation but several areas that need refactoring. The current architecture uses AI (GPT-4o) to generate step-based workflows stored in a JSON blob with derived relational step records. A voice sketch system exists and is functional. **No mobile/sidekick app exists** - this is a web-only application.

**Refactor Complexity:** Medium-High. The workflow generation is tightly coupled to AI, but the UI components are well-modularized and can be adapted. The evidence capture system and voice sketch are solid foundations to build upon.

---

## 1. Database Schema

### 1.1 Workflow-Related Tables

#### `inspection_workflows` (Primary Workflow Table)
**Location:** `shared/schema.ts:2755-2810`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `claim_id` | uuid | FK to claims |
| `organization_id` | uuid | FK to organizations |
| `workflow_json` | jsonb | **SOURCE OF TRUTH** - Complete workflow definition |
| `status` | varchar(30) | draft, generated, active, completed, archived |
| `total_steps` | integer | Count of steps |
| `completed_steps` | integer | Completed step count |
| `estimated_duration_minutes` | integer | Total estimated time |
| `actual_duration_minutes` | integer | Actual time spent |
| `generated_by` | varchar | AI model or user |
| `version` | integer | Workflow version |
| `created_at` / `updated_at` | timestamp | Timestamps |

**Key Insight:** `workflow_json` contains the complete workflow definition including steps, phases, tools, and metadata. The `inspection_workflow_steps` table is **derived from** this JSON.

#### `inspection_workflow_steps` (Derived Step Records)
**Location:** `shared/schema.ts:2813-2890`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workflow_id` | uuid | FK to inspection_workflows |
| `step_index` | integer | 1-indexed position (matches workflow_json.steps array) |
| `phase` | varchar(50) | pre_inspection, initial_walkthrough, exterior, interior, documentation, wrap_up |
| `step_type` | varchar(50) | photo, measurement, checklist, observation, documentation, safety_check, equipment, interview |
| `title` | varchar(255) | Step title |
| `instructions` | text | Step instructions |
| `required` | boolean | Whether step is mandatory |
| `tags` | jsonb | Array of tags |
| `dependencies` | jsonb | Step IDs that must complete first |
| `estimated_minutes` | integer | Time estimate |
| `actual_minutes` | integer | Actual time |
| `status` | varchar(30) | pending, in_progress, completed, skipped, blocked |
| `completed_by` / `completed_at` | varchar/timestamp | Completion tracking |
| `notes` | text | Adjuster notes |
| `room_id` / `room_name` | uuid/varchar | Room association |
| `peril_specific` | varchar(50) | Peril restriction |
| `origin` | varchar(30) | base_rule, policy_rule, peril_rule, discovery, geometry, manual |
| `source_rule_id` | varchar(100) | Source rule reference |
| `conditions` | jsonb | Applicability conditions |
| `evidence_requirements` | jsonb | Required evidence specs |
| `blocking` | varchar(30) | blocking, advisory, conditional |
| `blocking_condition` | jsonb | Conditional blocking rules |
| `geometry_binding` | jsonb | Room/wall/zone binding |
| `endorsement_source` | varchar(255) | Policy endorsement source |

#### `workflow_step_evidence` (Evidence Attachments)
**Location:** `shared/schema.ts:4516-4550`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `step_id` | uuid | FK to inspection_workflow_steps |
| `requirement_id` | varchar(100) | Which requirement this fulfills |
| `evidence_type` | varchar(30) | photo, measurement, note |
| `photo_id` | uuid | FK to claim_photos |
| `measurement_data` | jsonb | Measurement readings |
| `note_data` | jsonb | Note content |
| `validated` | boolean | Validation status |
| `validation_errors` | jsonb | Validation issues |
| `captured_at` / `captured_by` | timestamp/varchar | Capture metadata |

#### `claim_photos` (Photo Storage)
**Location:** `shared/schema.ts:881-940`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `claim_id` | uuid | FK to claims (nullable for unassigned) |
| `organization_id` | uuid | FK to organizations |
| `structure_id` / `room_id` / `damage_zone_id` | uuid | Hierarchy links |
| `storage_path` | varchar(500) | Supabase storage path |
| `public_url` | varchar(1000) | Public URL |
| `label` / `hierarchy_path` | varchar | Organization labels |
| `ai_analysis` | jsonb | GPT-4o Vision analysis results |
| `quality_score` | integer | 1-10 quality rating |
| `damage_detected` | boolean | AI damage detection |
| `analysis_status` | varchar(30) | pending, analyzing, completed, failed, concerns |
| `latitude` / `longitude` | double precision | GPS coordinates |
| `geo_address` | varchar(500) | Reverse geocoded address |

#### `claim_structures` / `claim_rooms` / `claim_damage_zones`
**Location:** `shared/schema.ts:750-880`

Hierarchical geometry storage:
- **claim_structures**: Building/structure definitions
- **claim_rooms**: Room geometry (polygon, dimensions, openings, features)
- **claim_damage_zones**: Damage zone polygons with type, severity, IICRC category

### 1.2 Schema Changes Needed for New Architecture

| Change | Priority | Notes |
|--------|----------|-------|
| Add `movement_definitions` table | High | Store JSON-driven flow movements |
| Add `zone_evidence` junction table | High | Link evidence to zones, not just steps |
| Modify `workflow_json` schema | High | New JSON structure for movement-based flows |
| Deprecate `inspection_workflow_steps` | Medium | Steps become derived from movements |
| Add `inspection_checkpoints` table | Medium | Gate progression validation |
| Add `override_log` table | Medium | Track AI override decisions |

---

## 2. Service Layer

### 2.1 Current Functions

#### `inspectionWorkflowService.ts` (Main Service)
**Location:** `server/services/inspectionWorkflowService.ts`
**Lines:** ~1100+

| Function | Purpose |
|----------|---------|
| `generateInspectionWorkflow()` | Main entry point - builds UnifiedClaimContext, calls AI, persists workflow |
| `getClaimWorkflow()` | Fetch existing workflow for a claim |
| `getWorkflow()` | Fetch workflow by ID |
| `updateStepStatus()` | Update step completion status |
| `addRoomToWorkflow()` | Add room and generate room-specific steps |
| `expandWorkflowRooms()` | Expand rooms from wizard data |
| `addStepToWorkflow()` | Add manual steps |
| `regenerateWorkflow()` | Force regeneration |
| `buildUnifiedClaimContext()` | Aggregate FNOL, policy, endorsements into context |
| `createStepsFromWorkflowJson()` | Derive step records from workflow_json.steps |
| `validateWorkflowJsonSteps()` | Validate workflow JSON invariants |
| `normalizeAIResponse()` | Handle AI response schema variations |
| `formatWizardContext()` | Format wizard input for AI prompt |
| `formatEffectivePolicy()` | Format policy context for AI |

#### `dynamicWorkflowService.ts` (Rule-Driven Service)
**Location:** `server/services/dynamicWorkflowService.ts`
**Lines:** ~300+

| Function | Purpose |
|----------|---------|
| `applyWorkflowRules()` | Evaluate rules against context |
| `handleWorkflowMutation()` | Process runtime mutations (room added, damage found) |
| `evaluateConditions()` | Check condition groups |
| `validateExportReadiness()` | Check blocking requirements |

#### `workflowRulesEngine.ts` (Rules Engine)
**Location:** `server/services/workflowRulesEngine.ts`
**Lines:** ~200+

| Function | Purpose |
|----------|---------|
| `evaluateCondition()` | Evaluate single condition |
| `evaluateConditionGroup()` | Evaluate AND/OR condition groups |
| `getFieldValue()` | Extract field from context by path |

#### `photos.ts` (Photo Service)
**Location:** `server/services/photos.ts`
**Lines:** ~536

| Function | Purpose |
|----------|---------|
| `uploadAndAnalyzePhoto()` | Upload to Supabase, trigger AI analysis |
| `analyzePhotoWithVision()` | GPT-4o Vision analysis |
| `runBackgroundAnalysis()` | Async photo analysis |
| `reanalyzePhoto()` | Retry failed analysis |
| `listClaimPhotos()` | Query photos with filters |

#### `sketchService.ts` (Sketch Geometry)
**Location:** `server/services/sketchService.ts`
**Lines:** ~634

| Function | Purpose |
|----------|---------|
| `getEstimateSketch()` | Retrieve sketch geometry |
| `updateEstimateSketch()` | Update/create zones and connections |
| `validateEstimateSketchForExport()` | Validate geometry for export |

### 2.2 Refactor Plan

| Service | Action | Notes |
|---------|--------|-------|
| `inspectionWorkflowService.ts` | **Major Refactor** | Replace AI step generation with JSON flow loading; keep context building |
| `dynamicWorkflowService.ts` | **Keep & Extend** | Add movement-based mutation handling |
| `workflowRulesEngine.ts` | **Keep** | Reuse for condition evaluation |
| `photos.ts` | **Keep** | No changes needed |
| `sketchService.ts` | **Keep** | No changes needed |
| NEW: `flowEngineService.ts` | **Create** | Load/execute JSON movement definitions |
| NEW: `overrideService.ts` | **Create** | Handle AI override step generation |

---

## 3. API Routes

### 3.1 Current Endpoints

#### Workflow Endpoints (in `claims.ts` router)

| Method | Endpoint | Handler | Purpose |
|--------|----------|---------|---------|
| POST | `/api/claims/:id/workflow/generate` | `generateInspectionWorkflow()` | Generate new workflow |
| GET | `/api/claims/:id/workflow` | `getClaimWorkflow()` | Get workflow for claim |
| GET | `/api/claims/:id/workflow/status` | `getWorkflowStatus()` | Check stale status |
| POST | `/api/claims/:id/workflow/regenerate` | `regenerateWorkflow()` | Force regeneration |
| GET | `/api/workflow/:id` | `getWorkflow()` | Get workflow by ID |
| PATCH | `/api/workflow/:id/steps/:stepId` | `updateStepStatus()` | Update step |
| POST | `/api/workflow/:id/rooms` | `addRoomToWorkflow()` | Add room |
| POST | `/api/workflow/:id/expand-rooms` | `expandWorkflowRooms()` | Expand wizard rooms |
| POST | `/api/workflow/:id/steps` | `addStepToWorkflow()` | Add manual step |
| POST | `/api/workflow/:id/steps/:stepId/evidence` | `attachEvidence()` | Attach evidence |
| GET | `/api/workflow/:id/steps/:stepId/evidence` | `getStepEvidence()` | Get step evidence |

#### Mutation Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/workflow/:id/mutation/damage-added` | Trigger mutation on damage zone add |
| POST | `/api/workflow/:id/mutation/room-added` | Trigger mutation on room add |
| POST | `/api/workflow/:id/mutation/photo-added` | Trigger mutation on photo add |

#### AI Endpoints (in `ai.ts` router)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/voice/session` | Create voice session (validates workflow exists) |
| POST | `/api/claims/:id/briefing` | Generate AI briefing |
| GET | `/api/claims/:id/briefing` | Get existing briefing |
| POST | `/api/ai/suggest-estimate` | AI estimate suggestions |
| POST | `/api/ai/quick-suggest` | Quick line item suggestions |

### 3.2 Changes Needed

| Action | Endpoint | Notes |
|--------|----------|-------|
| **New** | `GET /api/flows/:flowId` | Load flow definition JSON |
| **New** | `POST /api/workflow/:id/movement/:movementId/complete` | Complete movement |
| **New** | `GET /api/workflow/:id/current-movement` | Get current position |
| **New** | `POST /api/workflow/:id/override` | Trigger AI override generation |
| **Modify** | `POST /api/claims/:id/workflow/generate` | Load JSON flow instead of AI generation |
| **Deprecate** | Step-based mutation endpoints | Replace with movement-based |

---

## 4. Web UI Components

### 4.1 Current Components

#### Main Workflow Panel
**File:** `client/src/components/workflow-panel.tsx`

| Feature | Implementation |
|---------|----------------|
| Pre-generation wizard | Launches `WorkflowWizard` for context gathering |
| Phase-based navigation | Collapsible phases with step lists |
| Step completion dialog | `StepCompletionDialog` for evidence capture |
| Progress tracking | Visual progress bars and statistics |
| Room management | Add room dialog with level selection |
| Custom step addition | Add manual steps to any phase |
| Offline detection | Online/offline status tracking |
| Sync status | `CompactSyncIndicator` for pending updates |

#### Workflow Sub-Components
**Directory:** `client/src/components/workflow/`

| Component | Purpose | Reusable? |
|-----------|---------|-----------|
| `workflow-wizard.tsx` | Multi-step pre-generation wizard | **YES** - Adapt for property context |
| `step-completion-dialog.tsx` | Step completion with evidence capture | **Partial** - Refactor for movements |
| `evidence-capture.tsx` | Photo/measurement/note capture | **YES** - Fully reusable |
| `photo-capture.tsx` | Camera capture component | **YES** - Fully reusable |
| `voice-input.tsx` | Voice dictation button | **YES** - Fully reusable |
| `sync-status.tsx` | Sync indicators | **YES** - Fully reusable |
| `findings-templates.tsx` | Quick findings selection | **YES** - Reusable for notes |
| `export-validation-panel.tsx` | Pre-export validation | **Partial** - Adapt for new blocking logic |

### 4.2 Components to Keep

| Component | Notes |
|-----------|-------|
| `workflow-wizard.tsx` | Excellent property context gathering |
| `evidence-capture.tsx` | Complete evidence capture system |
| `photo-capture.tsx` | Device camera integration |
| `voice-input.tsx` | Voice dictation |
| `sync-status.tsx` | Offline handling |
| `findings-templates.tsx` | Quick input templates |

### 4.3 Components to Replace

| Component | Replacement | Notes |
|-----------|-------------|-------|
| `workflow-panel.tsx` | `MovementFlowPanel.tsx` | Replace step-based with movement-based |
| `step-completion-dialog.tsx` | `MovementDialog.tsx` | Evidence requirements from JSON |

---

## 5. Mobile (Sidekick)

### Status: **Does Not Exist**

No mobile application or React Native code was found in the codebase. The search for:
- `*mobile*` directories
- `*sidekick*` directories
- `react-native` or `expo` dependencies

All returned no results. This is a **web-only application**.

### Shared Code

All code is in the main monorepo:
- `shared/` - Types, schemas, voice grammar
- `client/` - React web application
- `server/` - Express API server

---

## 6. Voice Sketch

### Status: **Fully Implemented**

A complete voice-driven sketch system exists.

### Voice Sketch Components
**Directory:** `client/src/features/voice-sketch/`

| File | Purpose |
|------|---------|
| `VoiceSketchPage.tsx` | Main page component |
| `components/VoiceSketchController.tsx` | Session controller |
| `components/VoicePhotoCapture.tsx` | Voice-triggered photo capture |
| `components/FloorPlanPreview.tsx` | Room layout visualization |
| `components/RoomPreview.tsx` | Individual room preview |
| `components/OpeningEditPanel.tsx` | Door/window editing |
| `components/SketchToolbar.tsx` | Drawing tools |
| `components/CommandHistory.tsx` | Voice command history |
| `services/geometry-engine.ts` | Zustand store for room geometry |
| `services/floor-plan-engine.ts` | Floor plan calculations |
| `services/sketch-manipulation-store.ts` | Manipulation state |
| `services/wall-store.ts` | Wall segment tracking |
| `services/grammar-integration.ts` | Voice grammar integration |
| `hooks/useVoiceSession.ts` | Voice session hook |
| `agents/room-sketch-agent.ts` | AI agent for room sketching |
| `types/geometry.ts` | Geometry type definitions |

### Voice Scope Components
**Directory:** `client/src/features/voice-scope/`

| File | Purpose |
|------|---------|
| `components/VoiceScopeController.tsx` | Scope session controller |
| `services/scope-engine.ts` | Zustand store for line items |
| `hooks/useVoiceScopeSession.ts` | Voice scope hook |
| `agents/scope-agent.ts` | AI agent for estimate scoping |

### Voice Grammar
**Directory:** `shared/voice-grammar/`

| File | Purpose |
|------|---------|
| `parser.ts` | Voice input normalization |
| `types.ts` | Grammar type definitions |
| `inference-engine.ts` | Intent inference |
| `adjacency-reasoning.ts` | Room adjacency logic |
| `audit-trail.ts` | Inference logging |

### Server Voice Service
**File:** `server/services/voice-session.ts`

- Creates ephemeral OpenAI Realtime API keys
- Validates prerequisites (briefing, workflow exist)
- Supports `sketch` and `scope` modes

---

## 7. AI Integration

### 7.1 Current Implementation

#### Workflow Generation (GPT-4o)
**File:** `server/services/inspectionWorkflowService.ts`

- Uses `openai.chat.completions.create()` with JSON mode
- Model: `gpt-4o`
- Context includes: FNOL, policy, endorsements, wizard data, effective policy rules
- Output: Complete workflow JSON with phases, steps, tools, open questions

#### Photo Analysis (GPT-4o Vision)
**File:** `server/services/photos.ts`

- Uses `gpt-4o` with image input
- Analyzes: quality, damage detection, damage types, materials, recommended labels
- Background async processing
- Flags concerns (staging, quality issues)

#### Voice Sessions (OpenAI Realtime)
**File:** `server/services/voice-session.ts`

- Endpoint: `api.openai.com/v1/realtime/client_secrets`
- Model: `gpt-4o-realtime-preview`
- Voice: `ash` (configurable)
- Creates ephemeral keys for browser WebRTC

#### AI Prompts
**Location:** Database table `ai_prompts` + service `server/services/promptService.ts`

- Prompts are database-stored and cacheable
- Admin UI for prompt editing
- Version control support

### 7.2 Changes for New Architecture

| Current | New Architecture |
|---------|------------------|
| AI generates all workflow steps | JSON defines standard flow; AI only for overrides |
| AI prompt includes full context | Reduced context for override-only generation |
| Steps embedded in workflow_json | Movements defined in separate JSON files |
| AI called at generation time | AI called only when override triggered |

---

## 8. File/Evidence Storage

### 8.1 Current Implementation

#### Storage Provider
- **Supabase Storage** via `@supabase/supabase-js`
- Bucket: `claim-photos`
- Access: Public URLs with signed URL option

#### Photo Upload Flow
1. Client uploads via FormData to `/api/photos`
2. Server uploads to Supabase bucket
3. Record created in `claim_photos` with `analysis_status: 'pending'`
4. Background job triggers GPT-4o Vision analysis
5. Analysis results stored in `ai_analysis` JSONB column

#### Hierarchy Links
Photos can be linked to:
- `claim_id` (required after assignment)
- `structure_id` (optional)
- `room_id` (optional)
- `damage_zone_id` (optional)

#### Evidence Linking
- `workflow_step_evidence` links photos/measurements/notes to steps
- `requirement_id` tracks which requirement is fulfilled

### 8.2 Changes Needed

| Change | Notes |
|--------|-------|
| Add `zone_id` linking | Direct zone-based evidence organization |
| Add `movement_id` linking | Evidence linked to movement completions |
| Keep step_id linking | Backward compatibility |

---

## 9. State Management (Client)

### 9.1 Current Patterns

#### React Query (TanStack Query)
**Primary data fetching layer**

```typescript
// Example usage from workflow-panel.tsx
const { data: workflow } = useQuery({
  queryKey: ['workflow', claimId],
  queryFn: () => getClaimWorkflow(claimId),
});
```

Used for:
- Workflow fetching
- Claim data
- Photos
- Documents

#### Zustand Stores
**Location:** `client/src/features/voice-sketch/services/`

| Store | Purpose |
|-------|---------|
| `geometry-engine.ts` | Room geometry state |
| `sketch-manipulation-store.ts` | Drawing manipulation |
| `wall-store.ts` | Wall segment tracking |
| `scope-engine.ts` | Line item state |

Features:
- `subscribeWithSelector` middleware
- Event emission for state changes
- Undo/redo support

#### Local Component State
- Wizard step progress
- Dialog open/closed states
- Form input values
- Pending sync tracking

### 9.2 Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useVoiceSession` | voice-sketch/hooks/ | Voice session management |
| `useVoiceScopeSession` | voice-scope/hooks/ | Scope session management |
| `useEstimateBuilder` | hooks/ | Estimate construction |
| `useOrganization` | hooks/ | Org context |
| `use-offline-draft` | hooks/ | Offline draft persistence |
| `use-swipe` | hooks/ | Swipe gesture detection |
| `use-voice-input` | hooks/ | Voice dictation |

---

## 10. Integration Points (DO NOT BREAK)

### 10.1 External Services

| Service | Usage | Files |
|---------|-------|-------|
| **Supabase** | Database, Auth, Storage | Throughout server/ |
| **OpenAI** | GPT-4o, Vision, Realtime | inspectionWorkflowService, photos, voice-session |
| **Google Maps** | Geocoding | server/services/geocoding.ts |

**No webhooks, Twilio, SendGrid, or Stripe integrations found.**

### 10.2 Internal Dependencies

#### What Depends on Workflows

| Component | Dependency |
|-----------|------------|
| Voice Sessions | Requires workflow to exist for scope/sketch modes |
| Claim Detail Page | Displays workflow panel |
| Estimate Builder | May reference workflow context |
| Export Validation | Checks workflow completion |

#### What Workflows Depend On

| Dependency | Usage |
|------------|-------|
| Claims | workflow.claim_id FK |
| Briefings | Context for generation |
| Policy Extraction | Endorsement-driven steps |
| Rooms/Damage Zones | Mutation triggers |
| Photos | Evidence attachment |

---

## 11. Risk Assessment

### 11.1 High Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| `workflow_json` schema change | Existing workflows incompatible | Version field + migration script |
| Step-to-movement migration | Data loss for in-progress workflows | Keep step table, add movement table |
| AI prompt changes | Unexpected AI behavior | Test with production data samples |
| Evidence linking | Orphaned evidence records | Add movement_id alongside step_id |
| Voice session prerequisites | May fail if workflow format changes | Abstract prerequisite check |

### 11.2 Medium Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Client state management | UI breaks during transition | Feature flag for new flow engine |
| API route changes | Client compatibility | Version API routes |
| Zustand store changes | Voice sketch breaks | Parallel new store implementation |

### 11.3 Low Risk Areas

| Area | Notes |
|------|-------|
| Photo service | No changes needed |
| Sketch service | No changes needed |
| Voice grammar | Reusable as-is |
| Evidence capture components | Fully reusable |

---

## 12. Recommended Implementation Order

### Phase 1: Foundation (No Breaking Changes)
1. **Create movement definition schema** - New table `flow_definitions`
2. **Create sample JSON flows** - Water, Fire, Hail, Wind flow definitions
3. **Build flow engine service** - Load and execute JSON flows (parallel to existing)
4. **Build movement completion API** - New endpoints alongside existing

### Phase 2: UI Development (Feature Flagged)
5. **Create MovementFlowPanel component** - New panel alongside existing
6. **Create MovementDialog component** - Evidence capture per movement
7. **Add feature flag** - `USE_MOVEMENT_FLOW` toggle
8. **Integrate with existing evidence components** - Reuse photo-capture, evidence-capture

### Phase 3: Migration Utilities
9. **Create workflow migration script** - Convert existing workflows to movement format
10. **Add backward compatibility layer** - Read old format, write new format
11. **Build admin UI for flow management** - Edit JSON flow definitions

### Phase 4: Cutover
12. **Enable feature flag by default** - New claims use movement flow
13. **Add override generation service** - AI-powered override step creation
14. **Deprecate step-based endpoints** - Mark as deprecated, not removed
15. **Run migration on existing workflows** - Background job

### Phase 5: Cleanup
16. **Remove feature flag** - Full cutover complete
17. **Archive old components** - Keep for reference
18. **Update documentation** - New architecture docs

---

## Appendix A: Key File Locations

| Category | Path |
|----------|------|
| Schema | `shared/schema.ts` |
| Workflow Types | `shared/workflowTypes.ts` |
| Step Type Config | `shared/config/stepTypeConfig.ts` |
| Main Workflow Service | `server/services/inspectionWorkflowService.ts` |
| Dynamic Workflow Service | `server/services/dynamicWorkflowService.ts` |
| Rules Engine | `server/services/workflowRulesEngine.ts` |
| Photo Service | `server/services/photos.ts` |
| Voice Session Service | `server/services/voice-session.ts` |
| Sketch Service | `server/services/sketchService.ts` |
| Claims Routes | `server/routes/claims.ts` |
| AI Routes | `server/routes/ai.ts` |
| Workflow Panel | `client/src/components/workflow-panel.tsx` |
| Workflow Components | `client/src/components/workflow/` |
| Voice Sketch Feature | `client/src/features/voice-sketch/` |
| Voice Scope Feature | `client/src/features/voice-scope/` |
| Voice Grammar | `shared/voice-grammar/` |
| Client API | `client/src/lib/api.ts` |

---

## Appendix B: Type Definitions Reference

### InspectionPhase
```typescript
type InspectionPhase =
  | 'pre_inspection'
  | 'initial_walkthrough'
  | 'exterior'
  | 'interior'
  | 'documentation'
  | 'wrap_up';
```

### InspectionStepType
```typescript
type InspectionStepType =
  | 'photo'
  | 'measurement'
  | 'checklist'
  | 'observation'
  | 'documentation'
  | 'safety_check'
  | 'equipment'
  | 'interview';
```

### InspectionStepStatus
```typescript
type InspectionStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked';
```

### EvidenceType
```typescript
type EvidenceType =
  | 'photo'
  | 'measurement'
  | 'note'
  | 'signature'
  | 'document'
  | 'checklist';
```

### BlockingBehavior
```typescript
type BlockingBehavior =
  | 'blocking'    // Must complete to proceed/export
  | 'advisory'    // Recommended but not required
  | 'conditional';// Blocking only if conditions met
```

---

## Appendix C: API Client Functions

Key workflow-related functions in `client/src/lib/api.ts`:

```typescript
// Workflow generation and retrieval
generateInspectionWorkflow(claimId, wizardContext?, forceRegenerate?)
getClaimWorkflow(claimId)
getWorkflowStatus(claimId)
regenerateWorkflow(claimId)
getWorkflow(workflowId)

// Step management
updateWorkflowStep(workflowId, stepId, data)
addWorkflowStep(workflowId, step)
addWorkflowRoom(workflowId, roomData)
expandWorkflowRooms(workflowId, rooms)

// Evidence management
attachEvidenceToStep(workflowId, stepId, evidence)
getStepEvidence(workflowId, stepId)

// Mutations
triggerDamageAddedMutation(workflowId, damageData)
triggerRoomAddedMutation(workflowId, roomData)
triggerPhotoAddedMutation(workflowId, photoData)
```

---

*End of Audit Report*
