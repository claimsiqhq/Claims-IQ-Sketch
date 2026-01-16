# Flow Engine Migration Audit

**Generated**: 2026-01-16

## 1. Files that import old workflow services

### inspectionWorkflowService.ts (3 files)
- `server/services/documentProcessor.ts`
- `server/routes/ai.ts`
- `server/routes.ts`

### dynamicWorkflowService.ts (1 file)
- `server/routes.ts`

## 2. Exported functions from each service

### inspectionWorkflowService.ts (10 exports)
| Function | Purpose |
|----------|---------|
| `generateInspectionWorkflow` | Main workflow generation with AI |
| `regenerateWorkflow` | Force regenerate with new context |
| `expandWorkflowForRooms` | Add room-specific steps |
| `validateWorkflowJson` | JSON schema validation |
| `getWorkflow` | Get workflow by ID |
| `getClaimWorkflow` | Get workflow by claim ID |
| `updateWorkflowStep` | Update step status/notes |
| `addWorkflowStep` | Add custom step |
| `addWorkflowRoom` | Add room to workflow |
| `shouldRegenerateWorkflow` | Check if regen needed |

### dynamicWorkflowService.ts (11 exports)
| Function | Purpose |
|----------|---------|
| `buildRuleContext` | Build context for rule evaluation |
| `generateDynamicWorkflow` | Generate with dynamic rules |
| `attachEvidenceToStep` | Link evidence to step |
| `getStepEvidence` | Get evidence for step |
| `handleWorkflowMutation` | Handle step mutations |
| `onRoomAdded` | Room added hook |
| `onDamageZoneAdded` | Damage zone hook |
| `onPhotoAdded` | Photo added hook |
| `validateWorkflowForExport` | Validate before export |
| `linkPhotoToWorkflowStep` | Link photo to step |
| `getWorkflowWithEvidence` | Get workflow + evidence |

## 3. Routes that reference workflows

| Line | Route | Method |
|------|-------|--------|
| 3513 | `/api/claims/:id/workflow/generate-enhanced` | POST |
| 3710 | `/api/claims/:id/workflow/generate` | POST |
| 3737 | `/api/claims/:id/workflow` | GET |
| 3751 | `/api/claims/:id/workflow/status` | GET |
| 3761 | `/api/claims/:id/workflow/regenerate` | POST |
| 3796 | `/api/workflow/:id` | GET |
| 3811 | `/api/workflow/:id/steps/:stepId` | PATCH |
| 3890 | `/api/workflow/:id/steps` | POST |
| 3919 | `/api/workflow/:id/rooms` | POST |

## 4. Services using getPrompt/getPromptConfig

- `server/services/ai-estimate-suggest.ts`
- `server/services/myDayAnalysis.ts`
- `server/services/documentProcessor.ts`
- `server/services/claimBriefingService.ts`
- `server/services/inspectionWorkflowService.ts`
- `server/services/promptService.ts`

## 5. New flow.* prompts (already inserted)

1. `flow.voice_note_extraction`
2. `flow.evidence_validation`
3. `flow.step_completion_check`
4. `flow.workflow_mutation`
5. `flow.room_expansion`
6. `flow.damage_zone_analysis`
7. `flow.photo_requirements`

## Recommendation

**Create first**: `server/services/flowEngine/index.ts`

**Rationale**:
1. The new flow engine should be a separate module that can be imported alongside existing services during migration
2. Start with the core orchestration layer that calls the new `flow.*` prompts
3. Create adapters that allow gradual migration of routes without breaking existing functionality

**Migration Order**:
1. `flowEngine/index.ts` - Core orchestration
2. `flowEngine/stepExecutor.ts` - Step execution with evidence validation
3. `flowEngine/voiceProcessor.ts` - Voice note extraction
4. Migrate routes one-by-one, starting with `/api/claims/:id/workflow/generate-enhanced`
5. Deprecate old services after full migration
