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

1. **`claim-detail.tsx` renders deprecated `WorkflowPanel`**
   - Location: Lines 137 (import) and 2399-2400 (render)
   - Impact: 404 errors when users view Workflow tab
   - Fix: Remove import and `<WorkflowPanel />` component

### P1 - Dead Code (No User Impact, Technical Debt)

1. **Old API functions in `api.ts`** (lines 2487-2672)
2. **Orphaned components in `components/workflow/`**
3. **`workflow-panel.tsx`** (1492 lines of dead code)

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

## Contact & Resources

- **Repository:** Claims-IQ-Sketch
- **Documentation:** Confluence (Claims IQ space)
- **Project Management:** Asana
- **Last Updated:** 2026-01-18

---

*This file should be updated whenever architectural changes are made to the codebase.*
