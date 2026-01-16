# Claims IQ Audit Report
Generated: 2026-01-16

## Server Status
- **Starts:** NO
- **Port:** 5000 (configured)
- **Errors:**
  - `tsx` command not found (dev dependencies not installed)
  - `Cannot find package 'express'` (npm install required)
  - npm install fails due to network error (supabase CLI download timeout)

### Server Start Attempt
```bash
$ npm run dev
> NODE_ENV=development tsx server/index.ts
sh: 1: tsx: not found
```

When using `npx tsx`:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express'
```

### Fix Required
Run `npm install` in an environment with network access, or use offline package cache.

---

## Database

- **Connected:** UNABLE TO TEST (server doesn't start)
- **Supabase Configured:** YES
  - `server/db.ts` uses `postgres` package with Drizzle ORM
  - Uses `SUPABASE_DATABASE_URL` or `DATABASE_URL` env var
  - Connection pooler with `prepare: false` (transaction mode)
  - SSL required, max 20 connections

- **Credentials in .env:** NO
  - Only `.env.example` exists
  - `.env` file must be created with actual credentials

### Expected Tables (from code analysis)
| Table | Defined In | Purpose |
|-------|------------|---------|
| `flow_definitions` | shared/schema.ts | Flow definition storage (JSON blobs) |
| `claim_flow_instances` | flowEngineService.ts (runtime) | Active flow instances |
| `phases` | flowEngineService.ts (runtime) | Phase definitions |
| `movements` | flowEngineService.ts (runtime) | Movement definitions |
| `movement_completions` | flowEngineService.ts (runtime) | Completed movements |
| `gates` | flowEngineService.ts (runtime) | Gate definitions |
| `gate_evaluations` | flowEngineService.ts (runtime) | Gate evaluation results |
| `audio_observations` | audioObservationService.ts (runtime) | Voice notes |
| `claim_photos` | shared/schema.ts | Photo uploads |
| `ai_prompts` | shared/schema.ts | AI prompt configuration |

### Tables NOT in Drizzle Schema (shared/schema.ts)
- `claim_flow_instances`
- `phases`
- `movements`
- `movement_completions`
- `gates`
- `gate_evaluations`
- `audio_observations`

These tables are referenced in service code but NOT defined in the Drizzle schema. They may exist only in Supabase or require migration scripts.

---

## Services

| Service | Status | File | Notes |
|---------|--------|------|-------|
| flowEngineService | ✅ EXISTS | `server/services/flowEngineService.ts` | Full implementation with phases, movements, gates |
| flowEngine/index | ⚠️ DUPLICATE | `server/services/flowEngine/index.ts` | Different implementation using flow_json blobs |
| audioObservationService | ✅ EXISTS | `server/services/audioObservationService.ts` | Whisper + Claude pipeline |
| photos (claimPhotoService) | ✅ EXISTS | `server/services/photos.ts` | OpenAI Vision analysis |
| promptService (aiPromptService) | ✅ EXISTS | `server/services/promptService.ts` | Supabase-backed prompt management |
| flowDefinitionService | ✅ EXISTS | `server/services/flowDefinitionService.ts` | CRUD for flow_definitions |
| inspectionWorkflowService | ❌ DELETED | - | Import commented out in routes.ts |
| workflowRulesEngine | ⚠️ LEGACY | `server/services/workflowRulesEngine.ts` | References old WorkflowStep type |

### flowEngineService.ts Exports
```typescript
// Flow instance management
- startFlowForClaim(claimId, perilType)
- getCurrentFlow(claimId)
- getFlowProgress(flowInstanceId)

// Movement execution
- getNextMovement(flowInstanceId)
- completeMovement(flowInstanceId, movementId, evidence)
- skipMovement(flowInstanceId, movementId, reason, userId)

// Gate evaluation
- evaluateGate(flowInstanceId, gateId)
- advanceToNextPhase(flowInstanceId)

// Dynamic expansion
- addRoom(flowInstanceId, roomName, roomType)
- suggestAdditionalMovements(flowInstanceId, context)

// Evidence management
- attachEvidence(movementCompletionId, evidenceType, evidenceData)
- validateEvidence(movementCompletionId)
- getMovementEvidence(movementId, flowInstanceId)

// Query functions
- getFlowPhases(flowInstanceId)
- getPhaseMovements(phaseId, flowInstanceId)
- getFlowTimeline(flowInstanceId)
```

### audioObservationService.ts Exports
```typescript
- createAudioObservation(input)
- processAudioObservation(audioObservationId)
- transcribeAudio(audioObservationId)
- extractEntities(audioObservationId)
- getAudioObservation(id)
- getClaimAudioObservations(claimId)
- retryAudioProcessing(audioObservationId)
- initializeAudioBucket()
```

### CRITICAL: Two Competing Flow Engine Implementations

1. **`server/services/flowEngineService.ts`**
   - Uses separate database tables: `phases`, `movements`, `gates`, etc.
   - More normalized, relational approach
   - References in `flowEngineRoutes.ts`

2. **`server/services/flowEngine/index.ts`**
   - Uses `flow_json` JSONB column in `flow_definitions`
   - Denormalized JSON blob approach
   - References in `flowDefinitionService.ts`

**ACTION NEEDED:** Choose ONE implementation and deprecate the other.

---

## Routes

| Route | Status | File | Registration |
|-------|--------|------|--------------|
| Flow Engine | ✅ EXISTS | `server/routes/flowEngineRoutes.ts` | `routes.ts` at `/api` |
| Audio Observations | ✅ EXISTS | `server/routes/audioObservations.ts` | `routes/index.ts` at `/api/audio-observations` |
| Flow Definitions | ✅ EXISTS | `server/routes/flowDefinitionRoutes.ts` | `routes/index.ts` at `/api/flow-definitions` |
| Claims | ✅ EXISTS | `server/routes/claims.ts` | `routes/index.ts` at `/api/claims` |
| AI | ✅ EXISTS | `server/routes/ai.ts` | `routes/index.ts` at `/api/ai` |
| Photos | ⚠️ EMBEDDED | - | Handled in claims routes & routes.ts |

### Route Registration Files

**TWO route registration systems exist:**

1. **`server/routes/index.ts`** (Modular)
   - Registers: auth, claims, estimates, organizations, documents, ai, pricing, scope, audio-observations, flow-definitions
   - Does NOT register flowEngineRoutes

2. **`server/routes.ts`** (Monolithic legacy)
   - Registers: flowEngineRoutes at `/api`
   - Contains 3700+ lines of inline route handlers
   - Imports modular `registerRoutes` from routes/index.ts

### Flow Engine Route Endpoints (flowEngineRoutes.ts)
```
POST   /api/claims/:claimId/flows         - Start new flow
GET    /api/claims/:claimId/flows         - Get active flow
DELETE /api/claims/:claimId/flows         - Cancel active flow
GET    /api/flows/:flowInstanceId         - Get complete flow state
GET    /api/flows/:flowInstanceId/progress - Get progress summary
GET    /api/flows/:flowInstanceId/timeline - Get completion history
GET    /api/flows/:flowInstanceId/phases   - Get all phases
GET    /api/flows/:flowInstanceId/phases/:phaseId/movements - Get phase movements
GET    /api/flows/:flowInstanceId/next     - Get next movement
POST   /api/flows/:flowInstanceId/movements/:movementId/complete - Complete movement
POST   /api/flows/:flowInstanceId/movements/:movementId/skip     - Skip movement
GET    /api/flows/:flowInstanceId/movements/:movementId/evidence - Get evidence
POST   /api/flows/:flowInstanceId/gates/:gateId/evaluate        - Evaluate gate
POST   /api/flows/:flowInstanceId/rooms    - Add room movements
POST   /api/flows/:flowInstanceId/suggest  - AI suggest movements
POST   /api/flows/:flowInstanceId/movements - Insert custom movement
POST   /api/flows/:flowInstanceId/movements/:movementId/evidence - Attach evidence
POST   /api/flows/:flowInstanceId/movements/:movementId/validate - Validate evidence
```

---

## Frontend

| Page | Status | File | Uses Flow Engine? |
|------|--------|------|-------------------|
| Claim Detail | ✅ EXISTS | `client/src/pages/claim-detail.tsx` | ❌ Uses OLD workflow API |
| Flow Builder | ✅ EXISTS | `client/src/pages/flow-builder.tsx` | ✅ Uses flow definitions |
| Flow Progress | ❌ MISSING | - | - |
| Movement Execution | ❌ MISSING | - | - |
| Photo Capture | ⚠️ EMBEDDED | `client/src/components/workflow/photo-capture.tsx` | Via old workflow |
| Voice Input | ⚠️ EMBEDDED | Components exist | Via old workflow |

### Components
| Component | Status | File | Notes |
|-----------|--------|------|-------|
| WorkflowPanel | ⚠️ LEGACY | `client/src/components/workflow-panel.tsx` | Uses OLD workflow API |
| WorkflowWizard | ⚠️ LEGACY | `client/src/components/workflow/workflow-wizard.tsx` | Old workflow context |
| StepCompletionDialog | ⚠️ LEGACY | `client/src/components/workflow/step-completion-dialog.tsx` | For old steps |
| PhotoAlbum | ✅ EXISTS | `client/src/features/voice-sketch/components/PhotoAlbum.tsx` | Generic |

### Client API Usage (lib/api.ts)
The frontend calls **OLD workflow endpoints**, not new flow engine:
```typescript
- generateInspectionWorkflow() → POST /claims/:id/workflow/generate
- getClaimWorkflow() → GET /claims/:id/workflow
- updateWorkflowStep() → PATCH /workflow/:id/steps/:stepId
- addWorkflowRoom() → POST /workflow/:id/rooms
- expandWorkflowRooms() → POST /workflow/:id/expand-rooms
- addWorkflowStep() → POST /workflow/:id/steps
- attachEvidenceToStep() → POST /workflow/:workflowId/steps/:stepId/evidence
```

**None of these use the new flow engine API.**

---

## Legacy Code

### Files Still Referencing Old Workflow System

| File | Reference | Status |
|------|-----------|--------|
| `server/routes.ts` | `inspectionWorkflowService` (commented out import) | Deprecated |
| `server/services/claims.ts` | `inspection_workflow_steps` table | Delete cascade only |
| `server/services/workflowRulesEngine.ts` | `WorkflowStep` type | Actively used? |
| `server/services/flowEngine/index.ts` | References `inspectionWorkflowService` | Comment reference |
| `client/src/components/workflow-panel.tsx` | All old workflow APIs | **ACTIVELY USED** |
| `client/src/lib/api.ts` | Old workflow endpoints | **ACTIVELY USED** |

### Grep Results
```bash
# inspectionWorkflow references (2 files)
server/services/flowEngine/index.ts  # Comment only
server/routes.ts                     # Commented out import

# workflow_steps references (1 file)
server/services/claims.ts            # Delete cascade tables

# WorkflowStep references (1 file)
server/services/workflowRulesEngine.ts
```

### Action Needed: YES
The frontend is **still using the old workflow system**. The new flow engine exists but is not integrated with the UI.

---

## Critical Issues (Must Fix)

1. **Dependencies Not Installed**
   - `npm install` required
   - Network access needed for supabase CLI

2. **No .env File**
   - Only `.env.example` exists
   - Must create `.env` with Supabase credentials

3. **Two Competing Flow Engine Implementations**
   - `server/services/flowEngineService.ts` (phases/movements tables)
   - `server/services/flowEngine/index.ts` (JSON blob approach)
   - Need to pick ONE and deprecate the other

4. **Frontend Uses Old Workflow API**
   - `workflow-panel.tsx` calls old endpoints
   - New flow engine routes exist but are unused by UI
   - Complete disconnect between backend and frontend

5. **Missing Database Tables in Drizzle Schema**
   - `claim_flow_instances`, `phases`, `movements`, `gates`, etc.
   - These are used by flowEngineService.ts but not in schema.ts
   - Need migration to create tables or verify they exist in Supabase

---

## Warnings (Should Fix)

1. **Duplicate Route Registration Systems**
   - `routes/index.ts` (modular)
   - `routes.ts` (monolithic, 3700+ lines)
   - Should consolidate to one approach

2. **audio_observations Table Not in Schema**
   - Used by audioObservationService.ts
   - May exist in Supabase, but not tracked in Drizzle

3. **Legacy workflowRulesEngine.ts**
   - Uses old WorkflowStep types
   - May need update or deprecation

4. **No Dedicated Photo Routes File**
   - Photos handled inline in routes.ts and claims routes
   - Could benefit from modularization

---

## Missing Pieces (Must Build)

1. **Flow Progress Page**
   - Frontend page showing flow execution state
   - Visual phase/movement progress

2. **Movement Execution Page**
   - UI for completing individual movements
   - Evidence capture (photo, audio, measurements)
   - Skip/complete actions

3. **Flow Engine Frontend Integration**
   - Replace old workflow API calls with new flow engine endpoints
   - Update `workflow-panel.tsx` or create new components

4. **Database Migrations**
   - Create Drizzle schema definitions for flow engine tables
   - Or verify tables exist directly in Supabase

5. **Flow Definition Seeding**
   - Seed `flow_definitions` table with peril-specific flows
   - Wind/Hail, Water, Fire, etc.

---

## Handoff to Prompt #2

### Server Start Status
**FAILED** - Dependencies not installed, no .env file

### List of Broken Imports
None detected (imports are valid, packages just not installed)

### List of Unregistered Routes
- flowEngineRoutes is registered in routes.ts but flow_definitions and audio-observations are in routes/index.ts
- No conflicts, but dual registration systems exist

### List of Missing Services
| Service | Expected | Actual |
|---------|----------|--------|
| inspectionWorkflowService | Deprecated | Correctly removed |
| All others | Present | Present |

### Priority Actions
1. Create `.env` from `.env.example` with real credentials
2. Run `npm install` (may need retry or offline mode)
3. Choose one flow engine implementation
4. Build frontend integration for new flow engine
5. Add missing database tables to Drizzle schema

---

## Summary

The Claims IQ codebase has a **complete but unused** flow engine backend implementation. The new system (`flowEngineService.ts` and `flowEngineRoutes.ts`) provides:
- Phase-based inspection flows
- Movement execution with evidence collection
- Gate evaluation for quality control
- AI-powered dynamic expansion

However, the **frontend still uses the old workflow system** which has been partially removed. The disconnect means:
- Backend: New flow engine ready
- Frontend: Still calling old workflow endpoints
- Result: Flow engine is dead code

**Recommendation:** Connect frontend to new flow engine by:
1. Creating new React components for flow execution
2. Adding API client functions for flow engine endpoints
3. Replacing old workflow-panel with new flow components
4. Testing end-to-end flow execution
