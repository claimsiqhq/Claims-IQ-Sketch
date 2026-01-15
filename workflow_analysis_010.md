# Workflow Analysis 010: Fix Endorsement Step Evidence Requirements

## Issue Summary

Endorsement-driven steps (injected before AI generation) had NULL `evidence_requirements` because they bypassed the transformation logic that AI-generated steps go through.

### Evidence of Issue
- Steps 1-4 (endorsement-injected) had NULL evidence_requirements
- Steps 5+ (AI-generated) had populated evidence_requirements

## Root Cause Analysis

### Step Creation Paths Identified

1. **`generateEndorsementDrivenSteps()`** (line 2430) - Creates policy-based inspection steps:
   - Roof schedule depreciation documentation
   - Metal functional damage verification
   - O&L coverage documentation
   - Special limits documentation

2. **`createStepFromEndorsementRequirement()`** (line 2597) - Creates individual steps from endorsement inspection requirements

3. **`generatePolicyBasedInspectionSteps()`** (line 397) - Dead code (defined but never called)

4. **Step 8a in workflow generation** (line 1479) - Adds endorsement steps to workflow without `evidence_requirements`

## Changes Made

### 1. Added Helper Function: `getDefaultEvidenceForStepType()`

**Location:** `server/services/inspectionWorkflowService.ts` (line 626)

This function returns appropriate default evidence requirements based on step type:

| Step Type | Evidence Requirements |
|-----------|----------------------|
| `interview` | note (required, min 10 chars) |
| `documentation` | note (optional) |
| `checklist` | checklist (required) |
| `photo` | photo (required, 3 photos) + note (required) |
| `observation` | photo (required, 2 photos) + note (required) |
| `measurement` | measurement (required) + note (optional) |
| `safety_check` / `safety` | checklist (required) + note (required) |
| `equipment` | checklist (required) |
| `default` | note (optional) |

### 2. Updated `PolicyInspectionStep` Interface

**Location:** Line 376

Added `evidence_requirements` optional field to support evidence data on policy-driven steps.

### 3. Updated `createStepFromEndorsementRequirement()`

**Location:** Line 2612

Added evidence_requirements using `getDefaultEvidenceForStepType()`:
```typescript
evidence_requirements: getDefaultEvidenceForStepType(stepType, {
  label: `${endorsement.formCode} documentation`,
  photoCount: stepType === 'photo' ? 3 : 2
}),
```

### 4. Updated `generateEndorsementDrivenSteps()`

**Location:** Lines 2430-2600

Updated all four hardcoded step pushes to include evidence_requirements:

1. **Roof Schedule Depreciation** (documentation step):
   ```typescript
   evidence_requirements: getDefaultEvidenceForStepType('documentation', {
     label: 'Roof schedule depreciation documentation',
   }),
   ```

2. **Metal Component Functional Damage** (observation step):
   ```typescript
   evidence_requirements: getDefaultEvidenceForStepType('observation', {
     label: 'Metal component functional damage verification',
     photoCount: 3,
   }),
   ```

3. **O&L Coverage Documentation** (observation step):
   ```typescript
   evidence_requirements: getDefaultEvidenceForStepType('observation', {
     label: 'Code compliance issues documentation',
     photoCount: 2,
   }),
   ```

4. **Special Limits Documentation** (documentation step):
   ```typescript
   evidence_requirements: getDefaultEvidenceForStepType('documentation', {
     label: 'High-value personal property documentation',
   }),
   ```

### 5. Updated Step 8a: Endorsement Steps Addition

**Location:** Line 1479

Added fallback evidence_requirements when adding endorsement steps to workflow:
```typescript
const evidenceReqs = step.evidence_requirements || getDefaultEvidenceForStepType(step.step_type, {
  label: `${step.policySource || 'Endorsement'} documentation`,
  photoCount: step.step_type === 'photo' ? 3 : 2,
});
```

### 6. Added Fallback in `createStepsFromWorkflowJson()`

**Location:** Line 1047

As a safety net, added fallback logic before step insertion:
```typescript
// Get evidence requirements - use existing, then fallback to defaults
let evidenceRequirements = step.evidence_requirements;

// Fallback: if still empty and step has a type, apply defaults
if ((!evidenceRequirements || (Array.isArray(evidenceRequirements) && evidenceRequirements.length === 0)) && step.step_type) {
  evidenceRequirements = getDefaultEvidenceForStepType(step.step_type);
  console.log('[WORKFLOW_SAVE] Applied default evidence for step:', {
    stepTitle: step.title,
    stepType: step.step_type,
    defaultEvidence: evidenceRequirements,
  });
}
```

## Verification

### Log Messages to Monitor

After deployment, check server logs for:
- `[WORKFLOW_SAVE] Applied default evidence for step:` - Indicates fallback was used
- `[WORKFLOW_SAVE] Step evidence mapping:` - Shows AI-generated step transformation

### Database Verification Query

```sql
SELECT
  step_index,
  step_type,
  LEFT(title, 50) as title,
  CASE
    WHEN evidence_requirements IS NULL THEN 'NULL'
    WHEN evidence_requirements::text = '[]' THEN 'EMPTY'
    ELSE 'HAS DATA'
  END as evidence_status
FROM inspection_workflow_steps
WHERE workflow_id = '[NEW_WORKFLOW_ID]'
ORDER BY step_index;
```

All steps should show 'HAS DATA'.

## Success Criteria

- [x] All endorsement-driven steps have evidence_requirements
- [x] All briefing-derived steps have evidence_requirements
- [x] Fallback ensures no step is saved with NULL evidence
- [x] Evidence matches step_type (interview = notes only, photo = photos + notes, etc.)

## Files Modified

1. `server/services/inspectionWorkflowService.ts`
   - Added `getDefaultEvidenceForStepType()` helper function
   - Updated `PolicyInspectionStep` interface
   - Updated `createStepFromEndorsementRequirement()`
   - Updated `generateEndorsementDrivenSteps()` (4 step pushes)
   - Updated step 8a endorsement step addition
   - Added fallback in `createStepsFromWorkflowJson()`

## Next Steps (UI)

The UI fix will involve ensuring the step renderer conditionally shows/hides:
- Photo capture (only for photo/observation steps)
- Notes input (for most steps)
- Checklists (only for checklist steps)
- Measurement fields (only for measurement steps)

---

*Analysis completed: 2026-01-15*
