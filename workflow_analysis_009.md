# Workflow Analysis 009: evidence_requirements Not Being Saved to Database

## Executive Summary

**Bug Status**: FIXED
**Root Cause**: Field name mismatch between AI-generated response and database save logic
**Files Modified**: `server/services/inspectionWorkflowService.ts`

---

## 1. Symptoms

- AI generates diverse `step_types` correctly (interview, photo, documentation, etc.)
- `evidence_requirements` column in `inspection_workflow_steps` is NULL or `[]`
- UI renders all steps identically because no evidence data exists

---

## 2. Root Cause Analysis

### The Mismatch

| Source | Field Name Used |
|--------|----------------|
| AI Prompt Schema (line 2674) | `assets` array |
| AI Prompt Instruction (line 2605) | `required_evidence` |
| Database Column | `evidence_requirements` |
| Save Logic (line 1354, before fix) | `step.evidence_requirements || []` |

### Data Flow Before Fix

```
AI Response → { steps: [{ assets: [...] }] }
                      ↓
normalizeAIResponse() → Only checks: required_evidence || evidence_requirements
                      ↓
Main Save Path → Only uses: step.evidence_requirements || []
                      ↓
Database → evidence_requirements = NULL (because assets is ignored!)
```

### Specific Issues Found

1. **Prompt Schema vs Code Mismatch**
   - Prompt at line 2674 shows: `"assets": [{ "asset_type": "photo" }]`
   - Code at line 1354 looked for: `step.evidence_requirements`
   - Result: AI generates `assets`, code ignores them

2. **Inconsistent Normalization**
   - `normalizeAIResponse()` (line 637) checked for `required_evidence` but only when extracting from nested phases
   - Main save path (line 1354) never checked for `required_evidence` or `assets`

3. **No Transformation Logic**
   - No code existed to transform `assets` format to `evidence_requirements` format

---

## 3. The Fix

### Added `transformToEvidenceRequirements()` Function (lines 544-608)

```typescript
function transformToEvidenceRequirements(step: Record<string, unknown>): Record<string, unknown>[] {
  // Priority: evidence_requirements > required_evidence > assets
  if (step.evidence_requirements && Array.isArray(step.evidence_requirements)) {
    return step.evidence_requirements as Record<string, unknown>[];
  }

  if (step.required_evidence && Array.isArray(step.required_evidence)) {
    return step.required_evidence as Record<string, unknown>[];
  }

  // Transform assets array to evidence_requirements format
  if (step.assets && Array.isArray(step.assets)) {
    // ... transformation logic ...
  }

  return [];
}
```

### Updated Nested Phases Extraction (line 637)

```typescript
// Before:
evidence_requirements: step.required_evidence || step.evidence_requirements || [],

// After:
const evidenceRequirements = transformToEvidenceRequirements(step);
// ...
evidence_requirements: evidenceRequirements,
```

### Updated Main Save Path (lines 1342-1372)

```typescript
// Before:
evidence_requirements: step.evidence_requirements || [],

// After:
const evidenceRequirements = transformToEvidenceRequirements(step as unknown as Record<string, unknown>);
// ...
evidence_requirements: evidenceRequirements,
```

### Added Diagnostic Logging (lines 1348-1358)

```typescript
if (evidenceRequirements.length > 0) {
  console.log('[WORKFLOW_SAVE] Step evidence mapping:', {
    stepTitle: step.title,
    stepType: step.step_type,
    hasAssets: !!(step as any).assets,
    hasRequiredEvidence: !!(step as any).required_evidence,
    hasEvidenceRequirements: !!step.evidence_requirements,
    transformedEvidence: evidenceRequirements,
  });
}
```

---

## 4. Data Flow After Fix

```
AI Response → { steps: [{ assets: [...] }] }
                      ↓
transformToEvidenceRequirements() → Checks: evidence_requirements || required_evidence || assets
                      ↓
Transform assets → { type: 'photo', required: true, photo: { minCount: 1 } }
                      ↓
Database → evidence_requirements = [{ type: 'photo', required: true, ... }]
```

---

## 5. Transformation Logic

The `transformToEvidenceRequirements()` function converts the legacy `assets` format:

```json
{
  "assets": [
    { "asset_type": "photo", "required": true, "description": "Roof overview" }
  ]
}
```

To the expected `evidence_requirements` format:

```json
{
  "evidence_requirements": [
    {
      "type": "photo",
      "required": true,
      "label": "Roof overview",
      "photo": {
        "minCount": 1,
        "angles": []
      }
    }
  ]
}
```

### Type-Specific Transformations

| Asset Type | Evidence Type | Added Config |
|------------|---------------|--------------|
| `photo` | `photo` | `{ photo: { minCount: 1, angles: [] } }` |
| `measurement` | `measurement` | `{ measurement: { type: 'linear', unit: 'ft' } }` |
| `document` | `note` | `{ note: { minLength: 10 } }` |
| `note` | `note` | `{ note: { minLength: 10 } }` |
| `checklist` | `checklist` | `{ checklist: { items: [] } }` |

---

## 6. Verification Steps

### Check Logs After Regeneration

Look for log entries like:
```
[WORKFLOW_SAVE] Step evidence mapping: {
  stepTitle: 'Document Roof Damage',
  stepType: 'photo',
  hasAssets: true,
  hasRequiredEvidence: false,
  hasEvidenceRequirements: false,
  transformedEvidence: [{ type: 'photo', required: true, ... }]
}
```

### Query Database After Fix

```sql
SELECT
  step_index,
  step_type,
  title,
  evidence_requirements
FROM inspection_workflow_steps
WHERE workflow_id = '[NEW_WORKFLOW_ID]'
ORDER BY step_index
LIMIT 10;
```

### Expected Results

- `interview` steps: `[{ "type": "note", "required": true, ... }]`
- `photo` steps: `[{ "type": "photo", "required": true, "photo": { "minCount": 1 } }]`
- `documentation` steps: `[{ "type": "checklist", "required": true, ... }]`

---

## 7. Files Changed

| File | Changes |
|------|---------|
| `server/services/inspectionWorkflowService.ts` | Added `transformToEvidenceRequirements()` function, updated nested phases extraction, updated main save path, added diagnostic logging |

---

## 8. Future Recommendations

1. **Update AI Prompt Schema**: Consider updating the prompt to generate `evidence_requirements` directly instead of `assets` for cleaner data flow

2. **Add Unit Tests**: Add tests for `transformToEvidenceRequirements()` to ensure all edge cases are covered

3. **Schema Validation**: Consider adding JSON schema validation for AI responses before processing

---

## 9. Testing Checklist

- [ ] Regenerate a workflow after deploying the fix
- [ ] Verify `[WORKFLOW_SAVE]` logs appear in console
- [ ] Query database to confirm `evidence_requirements` is populated
- [ ] Verify UI renders different step types correctly based on evidence data
