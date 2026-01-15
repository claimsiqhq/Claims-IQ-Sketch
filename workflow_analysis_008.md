# Targeted Audit: AI Briefing → Workflow Data Flow

**Date:** 2026-01-15
**Auditor:** Claude Code
**Scope:** Verify property details and briefing outputs reach AI prompts

---

## Executive Summary

The AI pipeline is **well-designed** with rich context flowing from FNOL → Briefing → Workflow. Property details and briefing outputs ARE being passed to the AI prompts through programmatically-built context objects. The database prompts serve as system prompt configuration, while the rich user prompts are built in code.

---

## STEP 1: Briefing Generator Prompt Construction

### Location
`server/services/claimBriefingService.ts:1061-1154`

### Function
```typescript
function buildEnhancedBriefingPrompt(context: UnifiedClaimContext): string
```

### Variables Interpolated

| Variable | Source | Code Location |
|----------|--------|---------------|
| `context.property.yearBuilt` | UnifiedClaimContext | line 771-772 |
| `context.property.stories` | UnifiedClaimContext | line 773-774 |
| `context.property.roof.yearInstalled` | UnifiedClaimContext | line 775-777 |
| `context.property.roof.ageAtLoss` | UnifiedClaimContext | line 778-780 |
| `context.property.roof.isWoodRoof` | UnifiedClaimContext | line 781-783 |
| `context.property.exteriorDamaged` | UnifiedClaimContext | line 790-791 |
| `context.property.interiorDamaged` | UnifiedClaimContext | line 792-793 |

### Helper Functions Building Prompt Sections

| Function | Line | Purpose |
|----------|------|---------|
| `buildRichFnolFacts()` | 761-793 | Property details, roof info, damage scope |
| `buildRichPolicyContext()` | 799-882 | Coverage limits, deductibles, loss settlement |
| `buildRichEndorsementDetails()` | 887-928 | Endorsement impacts and inspection requirements |
| `buildCoverageAlertsSection()` | 933-956 | Critical/warning/info alerts |
| `buildInsightsSection()` | 961-997 | Estimated depreciation, coverage gaps, state rules |
| `buildDepreciationContext()` | 1002-1056 | Specific depreciation values for AI to use |

### Evidence: Property Data in Briefing Prompt

From `buildRichFnolFacts()` (lines 769-793):
```typescript
lines.push(`- Year Built: ${context.property.yearBuilt}`);
lines.push(`- Stories: ${context.property.stories}`);
lines.push(`- Roof Year Installed: ${context.property.roof.yearInstalled}`);
lines.push(`- Roof Age at Loss: ${context.property.roof.ageAtLoss} years`);
lines.push(`- Exterior Damaged: ${context.property.exteriorDamaged ? 'Yes' : 'No'}`);
lines.push(`- Interior Damaged: ${context.property.interiorDamaged ? 'Yes' : 'No'}`);
```

---

## STEP 2: Workflow Generator Prompt Construction

### Location
`server/services/inspectionWorkflowService.ts:2335-2612`

### Function
```typescript
function buildEnhancedWorkflowPrompt(
  context: UnifiedClaimContext,
  briefing?: { briefingJson?: any; id?: string } | null,
  wizardContext?: WizardContext
): string
```

### Briefing Fields Included

The workflow prompt **DOES** include full briefing outputs (lines 2365-2401):

```typescript
if (briefing?.briefingJson) {
  const b = briefing.briefingJson;
  briefingSection = `
## AI CLAIM BRIEFING (Full Context)
${b.claim_summary ? `
**Claim Summary:**
- Primary Peril: ${b.claim_summary.primary_peril || context.peril.primary}
- Overview: ${b.claim_summary.overview?.join('; ') || 'Not available'}
` : ''}
${b.inspection_strategy ? `
**Inspection Strategy:**
- Where to Start: ${b.inspection_strategy.where_to_start?.join(', ') || 'Standard approach'}
- What to Prioritize: ${b.inspection_strategy.what_to_prioritize?.join(', ') || 'All damage areas'}
- What to Watch For: ${b.inspection_strategy.what_to_watch_for?.join(', ') || 'Standard items'}
- Common Misses: ${b.inspection_strategy.common_misses?.join(', ') || 'Check thoroughly'}
` : ''}
${b.endorsement_watchouts?.length > 0 ? `
**Endorsement Watchouts from Briefing:**
${b.endorsement_watchouts.map((ew) => `- ${ew.endorsement_id}: ${ew.impact}
  Implications: ${ew.inspection_implications?.join('; ') || 'Review carefully'}`).join('\n')}
` : ''}
${b.photo_requirements ? formatBriefingPhotoRequirements(b) : ''}
```

### Property-Driven Workflow Adaptations (lines 2415-2529)

The workflow prompt includes conditional sections based on property data:

| Condition | Adaptation Section | Line |
|-----------|-------------------|------|
| `stories > 1` | Multi-story per-floor inspection | 2418-2425 |
| `roof.isWoodRoof` | Wood roof fire risk documentation | 2428-2435 |
| `exteriorDamaged && !interiorDamaged` | Exterior-only scope optimization | 2438-2444 |
| `!exteriorDamaged && interiorDamaged` | Interior-only scope optimization | 2445-2451 |
| `hasOtherStructures` | Coverage B separate inspection | 2454-2460 |
| `lossSettlement.roofing.isScheduled` | Roof age verification required | 2463-2476 |
| `roofing.metalFunctionalRequirement` | Metal functional damage exclusion | 2479-2486 |

---

## STEP 3: Database Prompts (ai_prompts table)

### Seed File Location
`db/seeds/001_ai_prompts.sql`

### Prompt Keys

| Key | Category | System Prompt Length | Enhanced? |
|-----|----------|---------------------|-----------|
| `briefing.claim` | briefing | 70 chars (minimal) | No - just "Output ONLY valid JSON" |
| `workflow.inspection_generator` | workflow | ~3500 chars | Yes - full schema definition |

### Key Insight

The database prompts provide **system-level configuration** (model, temperature, schema), but the **rich context is built programmatically** in the service code. This is correct architecture - the database defines behavior, the code injects data.

### Database Prompt: `briefing.claim`
```sql
system_prompt: 'You are an expert insurance claim inspection advisor. Output ONLY valid JSON.'
user_prompt_template: NULL  -- Built in code via buildEnhancedBriefingPrompt()
```

### Database Prompt: `workflow.inspection_generator`
```sql
system_prompt: [Full JSON schema with metadata, phases, steps structure]
user_prompt_template: 'Generate an INSPECTION WORKFLOW using the inputs below...'
  -- Contains placeholders like {{briefing_summary}} but ACTUAL prompt is built in code
```

---

## STEP 4: Audit Logging Added

Audit logging has been added to trace actual prompts sent to OpenAI:

### Briefing Service (`claimBriefingService.ts:564-587`)
```typescript
console.log('[BRIEFING_AUDIT] Full prompt being sent:', JSON.stringify({
  systemPromptPreview: promptConfig.systemPrompt.substring(0, 500),
  userPromptPreview: userPrompt.substring(0, 1000),
  propertyDataIncluded: {
    hasYearBuilt: userPrompt.includes('Year Built'),
    hasStories: userPrompt.includes('Stories'),
    hasRoofYearInstalled: userPrompt.includes('Roof Year Installed'),
    hasRoofAgeAtLoss: userPrompt.includes('Roof Age at Loss'),
    hasExteriorDamaged: userPrompt.includes('Exterior Damaged'),
    hasInteriorDamaged: userPrompt.includes('Interior Damaged'),
  },
  // ...
}));
```

### Workflow Service (`inspectionWorkflowService.ts:1197-1222`)
```typescript
console.log('[WORKFLOW_AUDIT] Full prompt being sent:', JSON.stringify({
  systemPromptPreview: promptConfig.systemPrompt.substring(0, 500),
  userPromptPreview: userPrompt.substring(0, 1000),
  briefingDataIncluded: {
    hasInspectionStrategy: userPrompt.includes('Inspection Strategy'),
    hasPhotoRequirements: userPrompt.includes('Photo Requirements'),
    hasEndorsementWatchouts: userPrompt.includes('Endorsement Watchouts'),
    hasDepreciationNotes: userPrompt.includes('depreciation_notes'),
    hasOpenQuestions: userPrompt.includes('Open Questions'),
  },
  // ...
}));
```

---

## STEP 5: Findings Summary

| Data Point | Expected Location | Actually Present? | Evidence |
|------------|-------------------|-------------------|----------|
| `yearBuilt` | Briefing prompt | **YES** | `claimBriefingService.ts:771-772` |
| `stories` | Briefing prompt | **YES** | `claimBriefingService.ts:773-774` |
| `roofYearInstalled` | Briefing prompt | **YES** | `claimBriefingService.ts:775-777` |
| `roofAgeAtLoss` | Briefing prompt | **YES** | `claimBriefingService.ts:778-780` |
| `exteriorDamaged` | Briefing prompt | **YES** | `claimBriefingService.ts:790-791` |
| `interiorDamaged` | Briefing prompt | **YES** | `claimBriefingService.ts:792-793` |
| `inspection_strategy.where_to_start` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2376-2377` |
| `inspection_strategy.what_to_prioritize` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2378` |
| `inspection_strategy.common_misses` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2379-2380` |
| `photo_requirements` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2343-2360` |
| `endorsement_watchouts` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2382-2385` |
| `depreciation_notes` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2386-2389` |
| `open_questions_for_adjuster` | Workflow prompt | **YES** | `inspectionWorkflowService.ts:2390-2397` |

---

## Meanwhile: Critical Issues Triage

### FIX BEFORE ANY DEMO/LAUNCH

| Issue | Risk | Quick Fix | Files |
|-------|------|-----------|-------|
| **Default admin creds** | Critical | Delete hardcoded creds, require `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars | `server/auth.ts` or seed files |
| **Prompt endpoint unprotected** | High | Add `requireSuperAdmin` middleware to `/api/prompts/:key` PUT | `server/routes/prompts.ts` |
| **Error handler re-throws** | High | Remove `throw err` after `res.status().json()` | Error middleware |
| **PII in logs** | High | Replace `JSON.stringify(capturedJsonResponse)` with metadata-only logging | Logger service |

### FIX BEFORE PRODUCTION

| Issue | Risk | Approach |
|-------|------|----------|
| **Dual routing stacks** | High | Delete `server/routes/` modular routes OR migrate fully to them |
| **Column name mismatches** | High | Align `claims.ts` query with schema (`property_latitude`, `date_of_loss`, etc.) |
| **Missing FK on claims.organization_id** | Medium | Migration to add constraint (after orphan cleanup) |

### TECHNICAL DEBT (Post-Launch)

- N+1 queries in claim lists
- Full table scans for stats
- Polling without cancellation
- Accessibility labels on interactive elements

---

## Conclusion

The AI pipeline data flow is **working correctly**. Property details from FNOL flow through to the briefing prompt via `UnifiedClaimContext`, and briefing outputs flow to the workflow prompt via the `briefing.briefingJson` parameter. The programmatic prompt construction ensures all relevant data is included.

**Runtime verification recommended:** Trigger a briefing + workflow generation and check the audit logs for `[BRIEFING_AUDIT]` and `[WORKFLOW_AUDIT]` to confirm actual data presence.
