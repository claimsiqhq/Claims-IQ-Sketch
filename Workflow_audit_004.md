# Workflow System Redesign Audit

**Date:** 2026-01-15
**Objective:** Complete inventory of existing step-based workflow system for replacement with JSON-driven, movement-based flow engine

---

## Executive Summary

The current workflow system consists of:
- **6 database tables** (~530+ columns total) that need to be deleted
- **3 server services** (5,894 lines) that need to be replaced
- **9 client components** (5,704 lines) that need to be deleted/replaced
- **25+ API endpoints** that need to be removed and replaced
- **1 shared type file** (517 lines) that needs to be deleted

The new system will require:
- **5 new database tables** for flow definitions and execution
- **3 new server services** for the flow engine
- **4+ new client components** for movement-based UI
- **7+ new API endpoints** for flow management

---

## Section 1: DATABASE - TABLES TO DELETE

### 1.1 inspection_workflows
**Location:** `shared/schema.ts:2757-2792`
**Column Count:** 15 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| organizationId | uuid | Tenant isolation |
| claimId | uuid | Link to claim |
| version | integer | Versioning for regeneration |
| status | varchar(30) | draft, active, completed, archived |
| primaryPeril | varchar(50) | Peril context |
| secondaryPerils | jsonb | Additional perils |
| sourceBriefingId | uuid | Link to briefing |
| workflowJson | jsonb | Complete workflow structure |
| generatedFrom | jsonb | Tracking generation source |
| createdBy | varchar | Audit |
| createdAt/updatedAt/completedAt/archivedAt | timestamp | Timestamps |

**Why Remove:** Step-based workflow concept being replaced by movement-based flows.

**Data Migration:** Export `workflowJson` structure for reference when building movement templates.

---

### 1.2 inspection_workflow_steps
**Location:** `shared/schema.ts:2813-2870`
**Column Count:** 25 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| workflowId | uuid | Parent workflow |
| stepIndex | integer | Ordering |
| phase | varchar(50) | pre_inspection, exterior, interior, etc. |
| stepType | varchar(50) | photo, measurement, checklist, etc. |
| title | varchar(255) | Step title |
| instructions | text | Step instructions |
| required | boolean | Required flag |
| tags | jsonb | Filtering tags |
| dependencies | jsonb | Step dependencies |
| estimatedMinutes | integer | Time estimate |
| actualMinutes | integer | Actual time |
| status | varchar(30) | pending, in_progress, completed, skipped, blocked |
| completedBy/completedAt | varchar/timestamp | Completion tracking |
| notes | text | Adjuster notes |
| roomId/roomName | uuid/varchar | Room association |
| perilSpecific | varchar(50) | Peril-specific step flag |
| origin | varchar(30) | base_rule, policy_rule, discovery, etc. |
| sourceRuleId | varchar(100) | Rule that generated step |
| conditions | jsonb | Condition definitions |
| evidenceRequirements | jsonb | Evidence specs |
| blocking | varchar(20) | blocking, advisory, conditional |
| blockingCondition | jsonb | Blocking condition |
| geometryBinding | jsonb | Room/wall/zone binding |
| endorsementSource | varchar(100) | Endorsement reference |

**Why Remove:** Steps are being replaced by movements. Evidence requirements move to new movement_evidence table.

---

### 1.3 inspection_workflow_assets
**Location:** `shared/schema.ts:2889-2923`
**Column Count:** 17 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| stepId | uuid | Parent step |
| assetType | varchar(30) | photo, video, measurement, etc. |
| label | varchar(255) | Asset label |
| description | text | Description |
| required | boolean | Required flag |
| metadata | jsonb | Asset-specific metadata |
| fileId/filePath/fileUrl | uuid/text | File references |
| status | varchar(30) | pending, captured, approved, rejected |
| capturedBy/capturedAt | varchar/timestamp | Capture tracking |
| createdAt/updatedAt | timestamp | Timestamps |

**Why Remove:** Assets tied to steps, not movements. Replaced by movement_evidence.

---

### 1.4 inspection_workflow_rooms
**Location:** `shared/schema.ts:2942-2971`
**Column Count:** 13 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| workflowId | uuid | Parent workflow |
| name | varchar(100) | Room name |
| level | varchar(50) | basement, main, upper, attic |
| roomType | varchar(50) | bedroom, bathroom, kitchen, etc. |
| lengthFt/widthFt/heightFt | decimal | Dimensions |
| notes | text | Notes |
| claimRoomId | uuid | Link to claim_rooms |
| sortOrder | integer | Display order |
| createdAt/updatedAt | timestamp | Timestamps |

**Why Remove:** Redundant with claim_rooms. New flow system uses claim_rooms directly.

---

### 1.5 workflow_step_evidence
**Location:** `shared/schema.ts:4516-4542`
**Column Count:** 13 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| stepId | uuid | Parent step |
| requirementId | varchar(100) | Requirement reference |
| evidenceType | varchar(30) | Evidence type |
| photoId | uuid | Photo reference |
| measurementData | jsonb | Measurement data |
| noteData | jsonb | Note data |
| validated | boolean | Validation status |
| validationErrors | jsonb | Validation errors |
| capturedAt/capturedBy | timestamp/varchar | Capture tracking |
| createdAt/updatedAt | timestamp | Timestamps |

**Why Remove:** Tied to steps. Replaced by movement_evidence.

---

### 1.6 workflow_mutations
**Location:** `shared/schema.ts:4560-4581`
**Column Count:** 10 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| workflowId | uuid | Parent workflow |
| trigger | varchar(50) | Mutation trigger |
| mutationData | jsonb | Mutation payload |
| stepsAdded/stepsRemoved/stepsModified | jsonb | Change tracking |
| triggeredBy/triggeredAt | varchar/timestamp | Audit |
| createdAt | timestamp | Timestamp |

**Why Remove:** Step-centric mutation tracking. New system has different modification patterns.

---

### 1.7 workflow_rules
**Location:** `shared/schema.ts:4598-4630`
**Column Count:** 18 columns

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| organizationId | uuid | Tenant isolation |
| ruleId | varchar(100) | Rule identifier |
| name | varchar(255) | Rule name |
| description | text | Description |
| version | varchar(20) | Rule version |
| conditions | jsonb | Rule conditions |
| stepTemplate | jsonb | Step generation template |
| evidence | jsonb | Evidence requirements |
| blocking | varchar(20) | Blocking behavior |
| blockingCondition | jsonb | Blocking condition |
| geometryScope | varchar(30) | Geometry scope |
| priority | integer | Rule priority |
| origin | varchar(30) | Rule origin |
| sourceReference | varchar(100) | Source reference |
| isActive | boolean | Active flag |
| isSystem | boolean | System rule flag |
| createdAt/updatedAt | timestamp | Timestamps |

**Why Remove:** Step-generation rules. New flow definitions are JSON-based per-peril templates.

---

## Section 2: DATABASE - TABLES TO KEEP

### 2.1 claim_photos
**Location:** `shared/schema.ts:881-930`
**Column Count:** 23 columns
**Relation to New System:** Photos will be attached to movements via movement_evidence
**Modifications Needed:** None - existing structure works

---

### 2.2 claim_structures
**Location:** `shared/schema.ts:700-730`
**Column Count:** 14 columns
**Relation to New System:** Structures define movement context (which building)
**Modifications Needed:** None

---

### 2.3 claim_rooms
**Location:** `shared/schema.ts:745-789`
**Column Count:** 19 columns
**Relation to New System:** Rooms are movement targets (physical locations)
**Modifications Needed:** None

---

### 2.4 claim_damage_zones
**Location:** `shared/schema.ts:821-866`
**Column Count:** 18 columns
**Relation to New System:** Damage zones can be linked to movements
**Modifications Needed:** None

---

### 2.5 claims
**Location:** `shared/schema.ts:212-307`
**Column Count:** 40+ columns
**Relation to New System:** Claims remain the parent entity
**Modifications Needed:**
- May remove `workflowVersion` column (line 297) - no longer needed
- Add `flowInstanceId` column to link active flow

---

### 2.6 claim_briefings
**Location:** `shared/schema.ts:620-656`
**Column Count:** 14 columns
**Relation to New System:** Briefings feed into flow definition selection
**Modifications Needed:** None

---

### 2.7 ai_prompts
**Location:** `shared/schema.ts:2485-2520`
**Column Count:** 16 columns
**Relation to New System:** Will store new prompts for voice note parsing, photo validation
**Modifications Needed:** Add new prompt entries

---

## Section 3: DATABASE - NEW TABLES NEEDED

### 3.1 flow_definitions
```sql
CREATE TABLE flow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,  -- NULL for system-wide templates

  -- Identification
  flow_key VARCHAR(100) NOT NULL UNIQUE,  -- e.g., "wind_hail_residential"
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,

  -- Peril/Context targeting
  perils JSONB DEFAULT '[]',  -- Array of perils this applies to
  property_types JSONB DEFAULT '[]',  -- residential, commercial, etc.

  -- The flow definition (JSON)
  flow_json JSONB NOT NULL,  -- Contains movements, guidance, etc.

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 claim_flow_instances
```sql
CREATE TABLE claim_flow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  flow_definition_id UUID NOT NULL REFERENCES flow_definitions(id),

  -- State
  status VARCHAR(30) NOT NULL DEFAULT 'active',  -- active, paused, completed, abandoned
  current_movement_id VARCHAR(100),  -- Current position in flow

  -- Runtime modifications
  flow_state JSONB NOT NULL DEFAULT '{}',  -- Current state/progress
  modifications JSONB DEFAULT '[]',  -- Array of runtime modifications

  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.3 movement_completions
```sql
CREATE TABLE movement_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_instance_id UUID NOT NULL REFERENCES claim_flow_instances(id) ON DELETE CASCADE,
  movement_id VARCHAR(100) NOT NULL,  -- Matches flow_json movement id

  -- Context
  structure_id UUID REFERENCES claim_structures(id),
  room_id UUID REFERENCES claim_rooms(id),

  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, skipped
  skipped_reason TEXT,

  -- Time tracking
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Notes/observations
  notes TEXT,

  -- Audit
  completed_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.4 movement_evidence
```sql
CREATE TABLE movement_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_completion_id UUID NOT NULL REFERENCES movement_completions(id) ON DELETE CASCADE,

  -- Evidence type
  evidence_type VARCHAR(30) NOT NULL,  -- photo, measurement, voice_note, note

  -- References
  photo_id UUID REFERENCES claim_photos(id),
  voice_note_id UUID REFERENCES voice_notes(id),

  -- Inline data
  measurement_data JSONB,
  note_data JSONB,

  -- Validation
  validated BOOLEAN DEFAULT false,
  validation_result JSONB,

  -- Audit
  captured_at TIMESTAMP DEFAULT NOW(),
  captured_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.5 voice_notes
```sql
CREATE TABLE voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Context
  flow_instance_id UUID REFERENCES claim_flow_instances(id),
  movement_completion_id UUID REFERENCES movement_completions(id),
  room_id UUID REFERENCES claim_rooms(id),

  -- Audio storage
  audio_storage_path VARCHAR(500) NOT NULL,
  audio_url VARCHAR(1000),
  duration_seconds INTEGER,

  -- Transcription
  transcription TEXT,
  transcription_status VARCHAR(30) DEFAULT 'pending',  -- pending, processing, completed, failed
  transcription_model VARCHAR(100),

  -- Entity extraction
  extracted_entities JSONB,  -- Parsed measurements, observations, etc.
  extraction_status VARCHAR(30) DEFAULT 'pending',

  -- TTS feedback (if used)
  tts_response_audio_path VARCHAR(500),

  -- Timestamps
  recorded_at TIMESTAMP DEFAULT NOW(),
  transcribed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Section 4: SERVER SERVICES - TO DELETE

### 4.1 inspectionWorkflowService.ts
**Location:** `server/services/inspectionWorkflowService.ts`
**Line Count:** 2,720 lines

**Exported Functions:**
| Function | Line | Purpose |
|----------|------|---------|
| generateInspectionWorkflow | 1066 | Generate AI-driven workflow |
| regenerateWorkflow | 1466 | Regenerate workflow |
| expandWorkflowForRooms | 1515 | Add room-specific steps |
| validateWorkflowJson | 1678 | Validate workflow structure |
| getWorkflow | 1721 | Get workflow by ID |
| getClaimWorkflow | 1802 | Get workflow for claim |
| updateWorkflowStep | 1831 | Update step status |
| addWorkflowStep | 1887 | Add custom step |
| addWorkflowRoom | 1987 | Add room to workflow |
| shouldRegenerateWorkflow | 2035 | Check if regeneration needed |

**Imports This:**
- `server/routes.ts`
- `server/routes/ai.ts`

**Replacement:** `flowEngineService.ts`

---

### 4.2 dynamicWorkflowService.ts
**Location:** `server/services/dynamicWorkflowService.ts`
**Line Count:** 1,263 lines

**Exported Functions:**
| Function | Line | Purpose |
|----------|------|---------|
| buildRuleContext | 191 | Build rule evaluation context |
| generateDynamicWorkflow | 295 | Generate rule-driven workflow |
| attachEvidenceToStep | 527 | Attach evidence to step |
| getStepEvidence | 641 | Get step evidence |
| handleWorkflowMutation | 660 | Handle workflow mutations |
| onRoomAdded | 850 | Mutation: room added |
| onDamageZoneAdded | 870 | Mutation: damage zone added |
| onPhotoAdded | 891 | Mutation: photo added |
| validateWorkflowForExport | 917 | Validate for export |
| linkPhotoToWorkflowStep | 1035 | Link photo to step |
| getWorkflowWithEvidence | 1204 | Get workflow with evidence status |

**Imports This:**
- `server/services/workflowRulesEngine.ts`

**Replacement:** `flowModificationService.ts`

---

### 4.3 workflowRulesEngine.ts
**Location:** `server/services/workflowRulesEngine.ts`
**Line Count:** 1,911 lines

**Exported Functions:**
| Function | Line | Purpose |
|----------|------|---------|
| evaluateConditionGroup | 184 | Evaluate condition groups |
| getStateSpecificRules | 1379 | Get state-specific rules |
| workflowRulesEngine (instance) | 1911 | Main rules engine instance |

**Contains:**
- BASE_WORKFLOW_RULES
- WATER_DAMAGE_RULES
- WIND_HAIL_RULES
- FIRE_DAMAGE_RULES
- POLICY_DRIVEN_RULES
- ROOM_INSPECTION_RULES

**Replacement:** Logic moves into `flow_definitions` JSON templates in database.

---

## Section 5: SERVER SERVICES - TO KEEP

### 5.1 photos.ts
**Line Count:** 535 lines
**Functions:** uploadAndAnalyzePhoto, reanalyzePhoto, getPhotoSignedUrl, deletePhoto, listClaimPhotos, etc.
**Modifications:** None - works independently of workflow

---

### 5.2 voice-session.ts
**Line Count:** 102 lines
**Purpose:** OpenAI Realtime API session creation
**Modifications:** May need to update to check flow_instance instead of workflow

---

### 5.3 sketchService.ts
**Line Count:** 633 lines
**Purpose:** Room/structure geometry operations
**Modifications:** None

---

### 5.4 claimBriefingService.ts
**Line Count:** 1,157 lines
**Purpose:** AI claim briefing generation
**Modifications:** None - briefings feed flow selection

---

### 5.5 promptService.ts
**Line Count:** 371 lines
**Purpose:** AI prompt management
**Modifications:** None - will add new prompts via database

---

### 5.6 perilInspectionRules.ts (config)
**Location:** `server/config/perilInspectionRules.ts`
**Line Count:** 1,426 lines
**Purpose:** Peril-specific inspection guidance
**Modifications:** Will inform flow definition templates

---

## Section 6: API ROUTES - TO DELETE

### Routes in server/routes.ts (lines 3501-4133)

| Method | Path | Line | Purpose |
|--------|------|------|---------|
| POST | /api/claims/:id/workflow/generate-enhanced | 3505 | Generate enhanced workflow |
| POST | /api/claims/:id/workflow/generate | 3702 | Generate workflow |
| GET | /api/claims/:id/workflow | 3729 | Get claim workflow |
| GET | /api/claims/:id/workflow/status | 3743 | Get workflow status |
| POST | /api/claims/:id/workflow/regenerate | 3753 | Regenerate workflow |
| GET | /api/workflow/:id | 3788 | Get workflow by ID |
| PATCH | /api/workflow/:id/steps/:stepId | 3803 | Update step |
| POST | /api/workflow/:id/steps | 3882 | Add step |
| POST | /api/workflow/:id/rooms | 3911 | Add room |
| POST | /api/workflow/:id/expand-rooms | 3937 | Expand rooms |
| POST | /api/workflow/:id/validate | 3966 | Validate workflow |
| POST | /api/claims/:id/workflow/dynamic/generate | 3987 | Generate dynamic workflow |
| GET | /api/workflow/:id/evidence | 4014 | Get workflow evidence |
| POST | /api/workflow/:id/steps/:stepId/evidence | 4029 | Attach evidence |
| GET | /api/workflow/:id/steps/:stepId/evidence | 4059 | Get step evidence |
| POST | /api/workflow/:id/validate-export | 4069 | Validate for export |
| POST | /api/workflow/:id/mutation/room-added | 4079 | Room added mutation |
| POST | /api/workflow/:id/mutation/damage-added | 4099 | Damage added mutation |
| POST | /api/workflow/:id/mutation/photo-added | 4119 | Photo added mutation |

**Total: 19 endpoints**

---

## Section 7: CLIENT COMPONENTS - TO DELETE

### 7.1 workflow-panel.tsx
**Location:** `client/src/components/workflow-panel.tsx`
**Line Count:** 1,466 lines
**Purpose:** Main inspection workflow management panel
**Dependencies:**
- workflow/workflow-wizard.tsx
- workflow/step-completion-dialog.tsx
- workflow/sync-status.tsx
- workflow/photo-capture.tsx

**Used By:**
- `client/src/pages/claim-detail.tsx`

---

### 7.2 Workflow Subdirectory Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| workflow-wizard.tsx | 1,395 | Pre-generation wizard |
| step-completion-dialog.tsx | 634 | Step completion UI |
| evidence-capture.tsx | 573 | Evidence capture UI |
| photo-capture.tsx | 508 | Photo capture |
| export-validation-panel.tsx | 394 | Export validation |
| findings-templates.tsx | 327 | Findings templates |
| sync-status.tsx | 222 | Sync status indicator |
| voice-input.tsx | 185 | Voice input component |

**Total: 4,238 lines in workflow subdirectory**

---

## Section 8: CLIENT COMPONENTS - TO KEEP

### 8.1 Voice Sketch Feature
**Location:** `client/src/features/voice-sketch/`
**Files:** 22 files
**Key Components:**
- VoiceSketchPage.tsx
- VoiceSketchController.tsx
- FloorPlanPreview.tsx
- VoicePhotoCapture.tsx
- CommandHistory.tsx

**Modifications:** Will need integration with new flow system for data handoff.

---

### 8.2 Voice Scope Feature
**Location:** `client/src/features/voice-scope/`
**Files:** 5 files
**Key Components:**
- VoiceScopeController.tsx
- scope-agent.ts
- scope-engine.ts

**Modifications:** Will receive data from flow system.

---

### 8.3 Reusable Components
These can be adapted for new movement UI:
- `photo-capture.tsx` - Photo capture logic is reusable
- `voice-input.tsx` - Voice input is reusable
- `sync-status.tsx` - Sync status concept is reusable

---

## Section 9: CLIENT API LAYER

### 9.1 API Functions to DELETE (client/src/lib/api.ts)

| Function | Lines | Purpose |
|----------|-------|---------|
| generateInspectionWorkflow | 2478-2495 | Generate workflow |
| getClaimWorkflow | 2496-2506 | Get claim workflow |
| getWorkflowStatus | 2507-2514 | Get workflow status |
| regenerateWorkflow | 2515-2531 | Regenerate workflow |
| getWorkflow | 2532-2539 | Get workflow by ID |
| updateWorkflowStep | 2540-2557 | Update step |
| addWorkflowStep | 2558-2583 | Add step |
| addWorkflowRoom | 2584-2600 | Add room |
| expandWorkflowRooms | 2601-2619 | Expand rooms |
| attachEvidenceToStep | 2647-2665 | Attach evidence |
| getStepEvidence | 2668-2681 | Get step evidence |
| onDamageZoneAdded | 2697+ | Mutation trigger |

### 9.2 Types to DELETE (client/src/lib/api.ts)

| Type | Lines |
|------|-------|
| InspectionStepType | 2233 |
| InspectionStepStatus | 2234 |
| InspectionWorkflowStatus | 2235 |
| WorkflowAssetType | 2236 |
| WorkflowAssetStatus | 2237 |
| InspectionWorkflowAsset | 2239-2256 |
| InspectionWorkflowStep | 2257-2310 |
| InspectionWorkflowRoom | 2311-2326 |
| InspectionWorkflowJson | 2327-2373 |
| InspectionWorkflow | 2374-2391 |
| FullWorkflow | 2392-2406 |
| GenerateWorkflowResponse | 2407-2417 |
| WorkflowMutationResult | 2685-2693 |

---

## Section 10: SHARED TYPES AND SCHEMAS

### 10.1 Files to DELETE

| File | Lines | Purpose |
|------|-------|---------|
| shared/workflowTypes.ts | 517 | Dynamic workflow type definitions |
| shared/config/stepTypeConfig.ts | 657 | Step type configuration |

### 10.2 Types in schema.ts to REMOVE (lines 2570-2749)

- InspectionWorkflowStatus enum
- InspectionStepStatus enum
- InspectionStepType enum
- InspectionPhase enum
- WorkflowAssetType enum
- WorkflowGeneratedFrom interface
- WorkflowJsonAsset interface
- WorkflowJsonStep interface
- InspectionWorkflowJson interface

### 10.3 Files to KEEP

| File | Purpose |
|------|---------|
| shared/voice-grammar/* | Voice parsing grammar (6 files, 87KB) |
| shared/schema.ts (other sections) | Database schema |
| shared/types.ts | General types |
| shared/transforms.ts | Data transforms |

---

## Section 11: AI PROMPTS

### 11.1 Prompts to DELETE

| Prompt Key | Location | Reason |
|------------|----------|--------|
| workflow.inspection_generator | ai_prompts table | Step generation prompt |

### 11.2 Prompts to KEEP

| Prompt Key | Purpose |
|------------|---------|
| document.extraction.fnol | FNOL document parsing |
| document.extraction.policy | Policy parsing |
| document.extraction.endorsement | Endorsement parsing |
| briefing.claim | Claim briefing generation |
| voice.room_sketch | Voice sketch guidance |
| voice.scope | Voice scope guidance |
| estimate.suggestions | Estimate suggestions |
| estimate.quick_suggest | Quick line suggestions |
| analysis.my_day_summary | My day analysis |

### 11.3 Prompts to CREATE

| Prompt Key | Purpose |
|------------|---------|
| flow.voice_note_extraction | Parse measurements/observations from transcriptions |
| flow.photo_movement_validation | Validate photo matches movement requirements |
| flow.override_generation | Generate additional movements when triggered |
| flow.guidance_text | Generate TTS guidance for movements |
| flow.summary_generation | Generate flow completion summary |

---

## Section 12: INTEGRATION POINTS - DO NOT BREAK

### 12.1 External Services

| Service | Files Using | Notes |
|---------|-------------|-------|
| Supabase | 45 services | Database/auth - keep |
| OpenAI | 15+ services | AI - keep |

### 12.2 Downstream Dependencies

**Voice Session Prerequisites Check:**
- `server/routes/ai.ts:121-152` checks for workflow existence
- **Must Update:** Change to check for flow_instance instead

**Export/Report Generation:**
- No direct workflow dependency found
- Reports may reference claim data, not workflow

### 12.3 Critical Integration Points

1. **claim_photos** - Photos must link to movements instead of steps
2. **claim_rooms** - Rooms are movement targets (no change)
3. **claim_briefings** - Briefings inform flow selection (no change)
4. **voice-session.ts** - Must check flow prerequisites

---

## Section 13: STATE MANAGEMENT

### 13.1 Client Hooks

| Hook | Location | Impact |
|------|----------|--------|
| useEstimateBuilder.ts | client/src/hooks | No workflow dependency |
| useOrganization.ts | client/src/hooks | No workflow dependency |
| use-offline-draft.tsx | client/src/hooks | References workflow - needs update |
| useVoiceSessionBase.ts | client/src/hooks | No direct workflow dependency |

### 13.2 React Query Usage
Workflow-related queries will need to be replaced with flow-related queries.

### 13.3 Stores to CREATE

| Store | Purpose |
|-------|---------|
| flowEngineStore | Flow instance state, current movement |
| voiceNoteQueue | Queue for voice note processing |
| movementCompletionStore | Movement completion state |

---

## Section 14: FILE STRUCTURE OVERVIEW

### Server Structure
```
server/
├── services/
│   ├── inspectionWorkflowService.ts  [DELETE]
│   ├── dynamicWorkflowService.ts     [DELETE]
│   ├── workflowRulesEngine.ts        [DELETE]
│   ├── photos.ts                     [KEEP]
│   ├── voice-session.ts              [MODIFY]
│   └── ... (other services)          [KEEP]
├── config/
│   └── perilInspectionRules.ts       [KEEP - informs flow templates]
└── routes.ts                         [MODIFY - remove workflow routes]
```

### Client Structure
```
client/src/
├── components/
│   ├── workflow-panel.tsx            [DELETE]
│   └── workflow/                     [DELETE entire directory]
├── features/
│   ├── voice-sketch/                 [KEEP - modify integration]
│   └── voice-scope/                  [KEEP - modify integration]
├── hooks/
│   └── use-offline-draft.tsx         [MODIFY]
└── lib/
    └── api.ts                        [MODIFY - remove workflow functions]
```

### Shared Structure
```
shared/
├── schema.ts                         [MODIFY - remove workflow tables/types]
├── workflowTypes.ts                  [DELETE]
├── config/
│   └── stepTypeConfig.ts             [DELETE]
└── voice-grammar/                    [KEEP]
```

---

## Section 15: DEPENDENCY GRAPH

### Files Importing inspectionWorkflowService
1. `server/routes.ts`
2. `server/routes/ai.ts`

### Files Importing dynamicWorkflowService
1. `server/routes.ts`
2. `server/services/documentProcessor.ts` (indirect)

### Files Importing workflowTypes
1. `shared/schema.ts`
2. `server/services/dynamicWorkflowService.ts`
3. `server/services/workflowRulesEngine.ts`

### Files Importing workflow components
1. `client/src/components/workflow-panel.tsx`
2. `client/src/pages/claim-detail.tsx`

---

## Section 16: TEST FILES

### Existing Test Files
```
server/services/__tests__/
├── zoneMetrics.test.ts
├── scopeEngine.test.ts
├── quantityEngine.test.ts
├── sketchTools.test.ts
├── rulesEngine.test.ts
└── estimateValidator.test.ts
```

**No dedicated workflow tests found** - tests are for other services.

---

## Section 17: ENVIRONMENT AND CONFIG

### Environment Variables Used
- Standard Supabase connection variables
- OpenAI API keys
- No workflow-specific environment variables

### Config Files
- `drizzle.config.ts` - Database migrations

---

## Section 18: SUMMARY TABLES

### Tables to DELETE

| Table Name | Columns | Reason |
|------------|---------|--------|
| inspection_workflows | 15 | Step-based concept replaced |
| inspection_workflow_steps | 25 | Steps replaced by movements |
| inspection_workflow_assets | 17 | Assets tied to steps |
| inspection_workflow_rooms | 13 | Redundant with claim_rooms |
| workflow_step_evidence | 13 | Evidence tied to steps |
| workflow_mutations | 10 | Step mutation tracking |
| workflow_rules | 18 | Rules move to flow_definitions |

### Tables to KEEP (with modifications)

| Table Name | Modifications Needed |
|------------|---------------------|
| claims | Remove workflowVersion, add flowInstanceId |
| claim_photos | No changes |
| claim_structures | No changes |
| claim_rooms | No changes |
| claim_damage_zones | No changes |
| claim_briefings | No changes |
| ai_prompts | Add new prompts |

### Tables to CREATE

| Table Name | Purpose |
|------------|---------|
| flow_definitions | JSON flow templates (per-peril) |
| claim_flow_instances | Per-claim flow state |
| movement_completions | Execution records |
| movement_evidence | Evidence linked to movements |
| voice_notes | Audio + transcription storage |

### Services to DELETE

| File Path | Line Count | Replacement |
|-----------|------------|-------------|
| server/services/inspectionWorkflowService.ts | 2,720 | flowEngineService.ts |
| server/services/dynamicWorkflowService.ts | 1,263 | flowModificationService.ts |
| server/services/workflowRulesEngine.ts | 1,911 | Flow JSON + runtime engine |

### Services to CREATE

| File Path | Purpose |
|-----------|---------|
| server/services/flowEngineService.ts | Load/execute JSON flows |
| server/services/flowModificationService.ts | Add/skip/change movements |
| server/services/voiceNoteService.ts | Audio capture + transcription |

### Components to DELETE

| File Path | Reason |
|-----------|--------|
| client/src/components/workflow-panel.tsx | Step-based UI |
| client/src/components/workflow/* (8 files) | Step-based components |

### Components to CREATE

| File Path | Purpose |
|-----------|---------|
| client/src/components/flow/MovementFlowPanel.tsx | Main flow interface |
| client/src/components/flow/MovementCard.tsx | Per-movement evidence capture |
| client/src/components/flow/VoiceNoteCapture.tsx | Voice note recording |
| client/src/components/flow/FlowModificationModal.tsx | Add/skip/change UI |
| client/src/components/flow/FlowProgress.tsx | Progress visualization |

### API Endpoints to DELETE

| Method | Path | Reason |
|--------|------|--------|
| POST | /api/claims/:id/workflow/generate | Step generation |
| POST | /api/claims/:id/workflow/generate-enhanced | Step generation |
| GET | /api/claims/:id/workflow | Step-based |
| GET | /api/claims/:id/workflow/status | Step-based |
| POST | /api/claims/:id/workflow/regenerate | Step-based |
| GET | /api/workflow/:id | Step-based |
| PATCH | /api/workflow/:id/steps/:stepId | Step-based |
| POST | /api/workflow/:id/steps | Step-based |
| POST | /api/workflow/:id/rooms | Step-based |
| POST | /api/workflow/:id/expand-rooms | Step-based |
| POST | /api/workflow/:id/validate | Step-based |
| POST | /api/claims/:id/workflow/dynamic/generate | Step-based |
| GET | /api/workflow/:id/evidence | Step-based |
| POST | /api/workflow/:id/steps/:stepId/evidence | Step-based |
| GET | /api/workflow/:id/steps/:stepId/evidence | Step-based |
| POST | /api/workflow/:id/validate-export | Step-based |
| POST | /api/workflow/:id/mutation/* (3) | Step mutations |

### API Endpoints to CREATE

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/flows | List available flow definitions |
| GET | /api/flows/:flowKey | Load flow definition |
| POST | /api/claims/:id/flow/start | Initialize flow instance |
| GET | /api/claims/:id/flow | Get active flow instance |
| GET | /api/flow-instances/:id | Get flow instance by ID |
| GET | /api/flow-instances/:id/current | Get current movement |
| POST | /api/flow-instances/:id/movements/:movementId/complete | Complete movement |
| POST | /api/flow-instances/:id/movements/:movementId/skip | Skip movement |
| POST | /api/flow-instances/:id/movements/add | Add movement |
| POST | /api/flow-instances/:id/voice-notes | Add voice note |
| GET | /api/flow-instances/:id/voice-notes | Get voice notes |
| POST | /api/flow-instances/:id/movements/:movementId/evidence | Add evidence |
| GET | /api/flow-instances/:id/summary | Get flow summary |

### AI Prompts to DELETE

| Prompt Key | Reason |
|------------|--------|
| workflow.inspection_generator | Step generation |

### AI Prompts to CREATE

| Prompt Key | Purpose |
|------------|---------|
| flow.voice_note_extraction | Parse measurements/observations from transcriptions |
| flow.photo_movement_validation | Validate photo matches expected movement content |
| flow.override_generation | Generate additional movements when triggered |
| flow.guidance_text | Generate TTS guidance for movements |
| flow.summary_generation | Generate flow completion summary |

---

## Recommended Deletion Order

To avoid FK constraint issues:

1. **Phase 1: Remove Dependencies**
   - Remove route handlers in `server/routes.ts`
   - Remove client components
   - Remove client API functions

2. **Phase 2: Remove Services**
   - Delete `dynamicWorkflowService.ts`
   - Delete `inspectionWorkflowService.ts`
   - Delete `workflowRulesEngine.ts`

3. **Phase 3: Remove Types**
   - Delete `shared/workflowTypes.ts`
   - Delete `shared/config/stepTypeConfig.ts`
   - Remove workflow types from `shared/schema.ts`

4. **Phase 4: Database Migration**
   - Drop `workflow_step_evidence` (FK to steps)
   - Drop `inspection_workflow_assets` (FK to steps)
   - Drop `workflow_mutations` (FK to workflows)
   - Drop `inspection_workflow_rooms` (FK to workflows)
   - Drop `inspection_workflow_steps` (FK to workflows)
   - Drop `workflow_rules` (no FK)
   - Drop `inspection_workflows` (no FK to others)

---

## Recommended Creation Order

1. **Phase 1: Database**
   - Create `flow_definitions` table
   - Create `claim_flow_instances` table
   - Create `voice_notes` table
   - Create `movement_completions` table
   - Create `movement_evidence` table
   - Update `claims` table (add flowInstanceId)
   - Insert initial flow_definitions from perilInspectionRules

2. **Phase 2: Server Services**
   - Create `flowEngineService.ts`
   - Create `flowModificationService.ts`
   - Create `voiceNoteService.ts`

3. **Phase 3: API Routes**
   - Add flow routes to `server/routes.ts`
   - Update voice session prerequisites check

4. **Phase 4: Client**
   - Create flow API functions in `client/src/lib/api.ts`
   - Create flow components
   - Create flow stores
   - Update claim-detail page integration

---

## Risk Assessment

### High Risk
- **Voice Session Check:** Must update prerequisite check to use flow_instance
- **Data Loss:** Existing workflow data will be lost (ensure no production workflows in progress)

### Medium Risk
- **Integration Points:** Voice sketch/scope may need significant changes to integrate with flow
- **Performance:** Flow JSON loading needs to be efficient

### Low Risk
- **Photo Service:** No changes needed to photo upload/analysis
- **Briefing Service:** No changes needed
- **External Services:** Supabase/OpenAI integrations unchanged

---

## Estimated Scope

| Category | Files | Lines |
|----------|-------|-------|
| Database tables to delete | 7 tables | ~111 columns |
| Database tables to create | 5 tables | ~60 columns |
| Server services to delete | 3 files | 5,894 lines |
| Server services to create | 3 files | ~2,500 est |
| Client components to delete | 9 files | 5,704 lines |
| Client components to create | 5+ files | ~3,000 est |
| API endpoints to delete | 19 | - |
| API endpoints to create | 13+ | - |
| Types files to delete | 2 files | 1,174 lines |
| Routes to modify | 1 file | ~650 lines removed |

**Total Code Removal:** ~7,400+ lines
**Total Code Addition:** ~5,500+ lines (estimated)

---

## Next Steps

1. **Get Database SQL Dump** - Current schema for migration writing
2. **Get AI Prompts Table Contents** - Identify prompts to keep/delete/create
3. **Define Flow JSON Schema** - Structure for flow_definitions.flow_json
4. **Create Peril Flow Templates** - Convert perilInspectionRules to JSON flows
5. **Design Voice Note Processing Pipeline** - Transcription + entity extraction flow
