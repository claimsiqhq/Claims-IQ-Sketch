# Workflow Redesign Specification

This document defines the complete redesign of the Claims-IQ inspection workflow system.

## Executive Summary

The redesigned workflow replaces **modal-driven step completion** with **inline evidence capture** using an **evidence bucket model**. This improves adjuster trust by making evidence requirements explicit, eliminates friction, and ensures defensibility.

---

## 1. Primary Screen Architecture

### 1.1 Main Inspection Screen

The main inspection screen is a **single persistent surface** with these components:

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Claim # | Address | Phase Nav | Progress | Export  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MAIN PANEL (Bucket Focus Mode)                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Kitchen Water Damage Detail                          │   │
│  │ "Document specific damage in this room"              │   │
│  │                                                      │   │
│  │ [Progress Ring: 2/4]                                 │   │
│  │                                                      │   │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │   │
│  │ │ img1 │ │ img2 │ │  +   │ │  +   │  < thumbnails  │   │
│  │ └──────┘ └──────┘ └──────┘ └──────┘                │   │
│  │                                                      │   │
│  │ [Quick notes text area with voice button]            │   │
│  │                                                      │   │
│  │ Damage Severity: [None] [Minor] [Moderate] [Severe]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ REQUIREMENTS PANEL (Right on desktop, bottom on mobile)     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ Damage Photos (3/3)                      [tap to add] │ │
│ │ ○ Damage Description (0/1)                 [tap to add] │ │
│ │ ○ Measurements (optional)                  [tap to add] │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ BOTTOM BAR: [2 Blockers] | Defensibility: 78% | [Export]    │
└─────────────────────────────────────────────────────────────┘
                                              [📷 Camera FAB]
```

### 1.2 Secondary Surfaces

| Surface | Trigger | Purpose |
|---------|---------|---------|
| Evidence Gallery | Tap requirement thumbnail | Review/edit captured evidence |
| Export Validation | Tap bottom bar or Export button | View blockers, warnings, waivers |
| Geometry Navigator | Tap room/structure badge | Jump to room-specific buckets |
| Step List | Swipe or toggle view mode | Alternative to bucket focus |

### 1.3 No Completion Modals

**CRITICAL**: The `StepCompletionDialog` is **eliminated**. Evidence capture happens:
- Camera opens fullscreen (mobile) or overlay (desktop)
- Measurement input appears as bottom sheet
- Notes are inline in main panel
- Completion is **automatic** when bucket requirements are satisfied

---

## 2. Workflow Step Types (Redesigned)

### 2.1 New Step Types

| Type | Primary Action | UI Elements | Use Case |
|------|---------------|-------------|----------|
| `capture` | Camera FAB | Photos, measurements, quick notes | Most damage documentation |
| `assess` | Notes field | Photos optional, detailed notes | Observations, assessments |
| `verify` | Confirm button | Photo optional, confirmation | Address, safety verification |
| `classify` | Selection UI | Categories, severity | Water category, damage type |
| `interview` | Voice input | Voice recording, transcription | Homeowner statements |
| `review` | Checklist | Review summary, confirm | Pre-export review |

### 2.2 Field Rules Per Type

```typescript
FORBIDDEN_FIELDS = {
  capture:   [],                                    // All fields allowed
  assess:    ['measurement'],                       // No measurements
  verify:    ['measurement', 'damageSeverity'],     // Just photo + confirm
  classify:  ['camera', 'measurement'],             // Just selection + notes
  interview: ['camera', 'measurement', 'damageSeverity'], // Voice + notes only
  review:    ['camera', 'measurement', 'damageSeverity'], // Review only
};
```

### 2.3 Step Type → Bucket Mapping

Steps **guide navigation**; buckets **define requirements**:

```typescript
// Step points to bucket(s)
WorkflowStep {
  type: 'capture',
  bucketIds: ['bucket-kitchen-damage'],
  primaryBucketId: 'bucket-kitchen-damage',
}

// Bucket defines requirements
EvidenceBucket {
  id: 'bucket-kitchen-damage',
  name: 'Kitchen Water Damage Detail',
  requirements: [
    { type: 'photo', minCount: 3, mandatory: true },
    { type: 'note', minLength: 20, mandatory: true },
  ],
}
```

---

## 3. Backend Workflow Generation

### 3.1 Current Issues (to fix)

1. **Generic "photo or note" steps** - Steps don't specify intent
2. **Step type determines evidence** - Should be bucket requirements
3. **Modal completion** - Evidence captured in isolation

### 3.2 New Generation Logic

```typescript
// OLD: Generate steps with vague evidence
generateStep({
  stepType: 'photo',
  title: 'Document damage',
  // evidence is implicit based on step type
});

// NEW: Generate bucket with explicit requirements
generateBucket({
  template: 'ROOM_DAMAGE_DETAIL',
  scope: { roomId, roomName },
  requirements: [
    { type: 'photo', label: 'Damage Photos', minCount: 3, mandatory: true },
    { type: 'note', label: 'Damage Description', mandatory: true },
  ],
  blocking: { type: 'conditional', condition: { geometry: { withDamage: true } } },
});
```

### 3.3 Bucket Templates

Intent-specific templates replace generic steps:

| Template | Category | Requirements | Blocking |
|----------|----------|--------------|----------|
| `ADDRESS_VERIFICATION` | identity | 1 photo (address numbers) | Always |
| `SAFETY_ASSESSMENT` | safety | 1 note (safety checklist) | Always |
| `ELEVATION_NORTH` | exterior_overview | 1 photo (north overview) | Wind/hail |
| `WATER_SOURCE` | source_tracing | 2 photos + 1 note | Water perils |
| `HAIL_TEST_SQUARE` | peril_specific | 1 photo + 1 measurement + 1 note | Wind/hail |
| `ROOM_DAMAGE_DETAIL` | damage_detail | 3 photos + 1 note | Damaged rooms |

---

## 4. Live Mutation System

### 4.1 Mutation Events

| Event | Trigger | Workflow Change |
|-------|---------|-----------------|
| `room_added` | User adds room in sketch | Add room buckets (overview, measurements, damage if applicable) |
| `room_removed` | User removes room | Deactivate room buckets |
| `damage_zone_added` | User marks damage zone | Add damage detail bucket, potentially source tracing |
| `photo_captured` | User takes photo | Update bucket fulfillment, check if satisfied |
| `discovery_logged` | User notes new finding | Add discovery-driven buckets |
| `endorsement_activated` | Policy context changes | Add endorsement buckets |

### 4.2 Mutation Hooks (Client)

```typescript
// In React components
const { mutate } = useWorkflowMutation();

// When photo is captured
await mutate({
  type: 'photo_captured',
  photoId: newPhoto.id,
  bucketId: currentBucket.id,
  requirementId: activeRequirement.id,
});

// Result includes:
// - Updated fulfillment state
// - UI notification (toast)
// - Export readiness recalculation
```

### 4.3 Real-Time Sync

```typescript
// Subscription to mutations
const { subscribeToMutations } = useWorkflowState();

useEffect(() => {
  return subscribeToMutations((result) => {
    // Update local state without reload
    if (result.changes.fulfillmentUpdated.length > 0) {
      refetchBucket(result.changes.fulfillmentUpdated[0].bucketId);
    }
    if (result.notification) {
      toast(result.notification.message);
    }
  });
}, []);
```

---

## 5. Export Readiness

### 5.1 What Is Checked

| Category | Check | Severity |
|----------|-------|----------|
| Identity | Address photo exists | **Blocking** |
| Safety | Safety assessment documented | **Blocking** |
| Coverage | All 4 elevations (wind/hail) | **Blocking** |
| Peril | Water source documented (water claims) | **Blocking** |
| Peril | Water category classified (water claims) | **Blocking** |
| Endorsement | Roof schedule documented (if endorsed) | **Blocking** |
| Source | Interior damage source traced | **Blocking** |
| Completeness | Minimum 10 photos | Advisory |
| Completeness | Damage notes present | Advisory |

### 5.2 How Results Are Surfaced

```
Export Readiness Panel (Bottom Sheet)
┌─────────────────────────────────────────────────────────────┐
│ CANNOT EXPORT - 2 Blocking Issues                           │
│                                                             │
│ ▼ BLOCKING (2)                                              │
│   ⨯ Address Verification                     [Go to Bucket] │
│     "Capture a clear photo of the property address"         │
│   ⨯ Water Source Documentation               [Go to Bucket] │
│     "Identify and photograph water source"                  │
│                                                             │
│ ▼ WARNINGS (3)                                              │
│   ⚠ Kitchen moisture readings                [Go to Bucket] │
│   ⚠ Bathroom overview photo                  [Go to Bucket] │
│   ⚠ Hail test square                         [Waive]        │
│                                                             │
│ Defensibility Score: 62% (Fair)                             │
│                                                             │
│ [Resolve Issues] [Export Anyway] (disabled)                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Waiver Handling

```typescript
// Waiver request
await applyWaiver({
  issueId: 'peril-hail-test-square-123',
  reason: 'Roof inaccessible due to steep pitch (12/12). Ground photos captured.',
  requestedBy: userId,
});

// Waiver validation
if (rule.waivable && reason.length >= rule.waiverRequirements.minReasonLength) {
  // Waiver accepted - issue marked as waived
  // Audit record created
}
```

---

## 6. Legacy Code Removal

### 6.1 Files to Remove/Refactor

| File | Action | Reason |
|------|--------|--------|
| `client/src/components/workflow/step-completion-dialog.tsx` | **DELETE** | Replaced by inline capture |
| `shared/config/stepTypeConfig.ts` | **REFACTOR** | Move to bucket templates |
| `server/services/inspectionWorkflowService.ts` | **REFACTOR** | Use bucket generation |

### 6.2 Database Tables to Deprecate

| Table | Action | Replacement |
|-------|--------|-------------|
| `inspection_workflow_assets` | **DEPRECATE** | `workflow_step_evidence` with bucket model |

### 6.3 Legacy Patterns to Remove

```typescript
// REMOVE: Generic step assets
step.assets = [
  { type: 'photo', label: 'Photo', required: true },
  { type: 'note', label: 'Notes', required: false },
];

// REMOVE: Modal completion flow
onOpenStepCompletionDialog(step);
handleStepComplete(completionData);

// REMOVE: Step type determining evidence
if (step.stepType === 'photo') {
  showPhotoCapture = true;
}
```

### 6.4 What to Keep

- `inspection_workflows` table (workflow metadata)
- `inspection_workflow_steps` table (step navigation)
- `workflow_step_evidence` table (evidence records)
- `workflow_mutations` table (audit trail)
- `claim_photos` table (photo storage)

---

## 7. Migration Plan

### Phase 1: Schema Updates

1. Add `evidence_buckets` JSONB column to `inspection_workflows`
2. Update `workflow_step_evidence` to reference bucket requirements
3. Create migration for existing workflows to bucket model

### Phase 2: Backend Updates

1. Implement `WorkflowMutationHandler` class
2. Update `generateDynamicWorkflow` to use bucket templates
3. Add mutation endpoints to workflow routes

### Phase 3: UI Updates

1. Create `BucketFocusView` component
2. Create `RequirementsPanel` component
3. Create `ExportReadinessSheet` component
4. Update camera integration for inline capture
5. Remove `StepCompletionDialog`

### Phase 4: Testing & Validation

1. Test all bucket templates generate correctly
2. Test mutation events trigger correct changes
3. Test export validation catches all blockers
4. Test waiver flow with audit trail

---

## 8. Implementation Files

The redesigned workflow is defined in:

| File | Purpose |
|------|---------|
| `shared/workflow/redesignedWorkflowSchema.ts` | Type definitions, bucket templates |
| `shared/workflow/uiBehaviorRules.ts` | UI configuration, screen layouts |
| `shared/workflow/mutationLogic.ts` | Mutation handlers, subscriptions |
| `shared/workflow/exportReadiness.ts` | Validation rules, waiver handling |

---

## 9. Key Design Decisions

### Evidence Buckets vs Step Completion

**Old**: Steps are "completed" by checking a box after optional evidence capture.

**New**: Buckets are "satisfied" when required evidence is captured. No checkbox.

### Step Types vs Bucket Requirements

**Old**: Step type (photo/measurement/etc) determines what evidence UI appears.

**New**: Step type determines UI layout; bucket requirements determine what evidence is needed.

### Modal vs Inline

**Old**: Evidence captured in completion modal, then dialog dismissed.

**New**: Evidence captured inline, bucket fulfillment updates in real-time.

### Generic vs Intent-Specific

**Old**: "Take a photo or add notes" for every step.

**New**: "Document north elevation overview" with specific requirements.

---

## 10. Success Criteria

1. **Zero completion modals** - All evidence captured inline
2. **100% explicit requirements** - No generic "photo or note" steps
3. **Real-time fulfillment** - UI updates as evidence is captured
4. **Auditable waivers** - All blockers either resolved or waived with reason
5. **Defensibility score** - Clear metric for claim documentation quality
