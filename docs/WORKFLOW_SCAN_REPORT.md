# Claims iQ Workflow Scan Report

**Date:** 2024-12-19  
**Purpose:** Comprehensive scan of claim import → AI Briefing → Workflow → Scope generation pipeline

## Executive Summary

✅ **Overall Status:** The workflow is **functionally complete** with proper data flow, but there are **opportunities for enhancement** in scope generation integration.

## Workflow Analysis

### 1. Claim Import & Document Processing ✅

**Flow:**
```
User uploads documents → Document classification → AI extraction → Storage → Auto-trigger AI pipeline
```

**Components:**
- `createClaimFromDocuments()` - Creates claim from uploaded documents
- `processDocumentAI()` - Extracts FNOL, Policy, or Endorsement data
- `transformToFNOLExtraction()` - Converts AI output to canonical schema
- `transformToPolicyExtraction()` - Converts AI output to canonical schema
- `transformToEndorsementExtraction()` - Converts AI output to canonical schema
- `storePolicy()` - Stores policy in `policy_form_extractions` table
- `storeEndorsements()` - Stores endorsements in `endorsement_extractions` table
- `triggerAIGenerationPipeline()` - Auto-triggers briefing + workflow generation

**Data Storage:**
- ✅ FNOL → `claims.loss_context` (JSONB, canonical schema)
- ✅ Policy → `policy_form_extractions.extraction_data` (JSONB, canonical schema)
- ✅ Endorsements → `endorsement_extractions.extraction_data` (JSONB, canonical schema)

**Issues Found:**
- ✅ None - Canonical schema is consistently used
- ✅ No legacy format support (as requested)

---

### 2. AI Briefing Generation ✅

**Flow:**
```
Claim created → triggerAIGenerationPipeline() → generateClaimBriefing() → Stores briefing
```

**Components:**
- `generateClaimBriefing()` - Main briefing generation function
- `buildPerilAwareClaimContext()` - Builds normalized claim context
- `buildBriefingPromptWithTemplate()` - Builds AI prompt with variables
- `buildFnolFactsSection()` - Extracts FNOL facts from `loss_context` (canonical)

**Data Sources:**
- ✅ `claims.loss_context` - Canonical FNOL data (snake_case)
- ✅ `policy_form_extractions` - Base policy data
- ✅ `endorsement_extractions` - Endorsement modifications
- ✅ `claims.peril_specific_deductibles` - Peril-agnostic deductibles
- ✅ `claims.loss_context.property.roof.year_installed` - Roof year (canonical)

**Prompt Variables:**
- ✅ All variables use canonical field names (snake_case)
- ✅ `yearRoofInstall` reads from `lossContextRoof.year_installed`
- ✅ `perilSpecificDeductibles` reads from `context.policyContext.perilSpecificDeductibles`

**Issues Found:**
- ✅ None - All canonical schema references are correct

---

### 3. Inspection Workflow Generation ✅

**Flow:**
```
Briefing generated → generateInspectionWorkflow() → Uses briefing summary → Generates workflow steps
```

**Components:**
- `generateInspectionWorkflow()` - Main workflow generation function
- `buildPerilAwareClaimContext()` - Builds normalized claim context
- `getClaimBriefing()` - Retrieves existing briefing
- `getEffectivePolicyForClaim()` - Computes effective policy from base + endorsements
- `generatePolicyBasedInspectionSteps()` - Programmatic policy-based steps

**Data Sources:**
- ✅ `claim_briefings` table - Briefing summary used in prompt
- ✅ `claims.loss_context` - Canonical FNOL data
- ✅ `policy_form_extractions` - Base policy
- ✅ `endorsement_extractions` - Endorsement modifications
- ✅ `effectivePolicyService` - Computes effective policy dynamically

**Briefing Integration:**
```typescript
// Line 785-790 in inspectionWorkflowService.ts
const briefing = await getClaimBriefing(claimId, organizationId);
const briefingSummary = briefing
  ? `Primary Peril: ${briefing.briefingJson?.claim_summary?.primary_peril || 'Unknown'}
Overview: ${briefing.briefingJson?.claim_summary?.overview?.join('; ') || 'No overview'}
Priorities: ${briefing.briefingJson?.inspection_strategy?.what_to_prioritize?.join('; ') || 'No priorities'}`
  : 'No briefing available - generate a comprehensive workflow based on FNOL and peril rules';
```

**Prompt Variables:**
- ✅ `briefing_summary` - Includes briefing priorities and overview
- ✅ `effective_policy_context` - Includes policy-based inspection requirements
- ✅ `peril_inspection_rules` - Peril-specific inspection guidance
- ✅ `carrier_requirements` - Carrier-specific overlays

**Issues Found:**
- ✅ None - Workflow correctly uses briefing data

---

### 4. Scope Generation (Voice) ⚠️

**Flow:**
```
User opens scope → Voice agent initialized → Uses prompt from database → Tools add line items
```

**Components:**
- `createScopeAgentAsync()` - Creates voice agent
- `fetchInstructionsFromAPI()` - Loads prompt from `/api/prompts/voice.scope/config`
- `scope-engine.ts` - Manages scope state (line items)
- Tools: `add_line_item`, `remove_line_item`, `set_quantity`, etc.

**Data Sources:**
- ✅ `ai_prompts` table - Prompt stored in database (key: `voice.scope`)
- ⚠️ **NOT using briefing data** - Prompt doesn't include claim context
- ⚠️ **NOT using workflow data** - Prompt doesn't include workflow steps
- ⚠️ **NOT using peril context** - Prompt doesn't include peril-specific guidance

**Current Prompt Source:**
```typescript
// scope-agent.ts line 28
const response = await fetch('/api/prompts/voice.scope/config', {
  credentials: 'include',
});
```

**Issues Found:**
- ⚠️ **Enhancement Opportunity:** Scope agent prompt doesn't receive claim context
- ⚠️ **Enhancement Opportunity:** Scope agent doesn't know about workflow priorities
- ⚠️ **Enhancement Opportunity:** Scope agent doesn't know about peril-specific requirements

**Recommendation:**
The scope agent should receive claim context (briefing, workflow, peril) to provide better guidance. This could be:
1. Injected into the prompt dynamically when initializing the agent
2. Passed as system context when creating the agent
3. Made available via tools that query claim data

---

## Data Flow Consistency Check

### Canonical Schema Usage ✅

**FNOL Data:**
- ✅ Extraction: `transformToFNOLExtraction()` → Canonical snake_case
- ✅ Storage: `claims.loss_context` → JSONB with canonical structure
- ✅ Reading: `buildFnolFactsSection()` → Reads from `loss_context.fnol.*` (canonical)
- ✅ Briefing: Uses `lossContext.fnol.reported_date`, `lossContext.property.roof.year_installed` (canonical)

**Policy Data:**
- ✅ Extraction: `transformToPolicyExtraction()` → Canonical structure
- ✅ Storage: `policy_form_extractions.extraction_data` → JSONB with canonical structure
- ✅ Reading: `buildPerilAwareClaimContext()` → Reads from `extraction_data` (canonical)

**Endorsement Data:**
- ✅ Extraction: `transformToEndorsementExtraction()` → Canonical structure
- ✅ Storage: `endorsement_extractions.extraction_data` → JSONB with canonical structure
- ✅ Reading: `buildPerilAwareClaimContext()` → Reads from `extraction_data` (canonical)

**Peril-Specific Deductibles:**
- ✅ Storage: `claims.peril_specific_deductibles` → JSONB `{ "wind_hail": "$7,932", "flood": "$5,000" }`
- ✅ Reading: `buildPerilAwareClaimContext()` → Reads from `peril_specific_deductibles`
- ✅ Briefing: Uses `perilSpecificDeductibles` variable in prompt

**Roof Year:**
- ✅ Storage: `claims.loss_context.property.roof.year_installed` (canonical)
- ✅ Reading: `buildBriefingPromptWithTemplate()` → Reads from `lossContextRoof.year_installed`
- ✅ No legacy `year_roof_install` column (removed in migration 024)

---

## Prompt Consistency Check ✅

### Briefing Prompt (`claimBriefingService.ts`)
- ✅ Uses canonical field names: `yearRoofInstall`, `perilSpecificDeductibles`
- ✅ Reads from `lossContext.property.roof.year_installed`
- ✅ Reads from `context.policyContext.perilSpecificDeductibles`
- ✅ Variable substitution uses canonical data

### Workflow Prompt (`inspectionWorkflowService.ts`)
- ✅ Uses `briefing_summary` variable (includes briefing priorities)
- ✅ Uses `effective_policy_context` (computed from base + endorsements)
- ✅ Uses `peril_inspection_rules` (peril-specific guidance)
- ✅ Includes `wizard_context` (field adjuster input)

### Scope Prompt (`voice.scope`)
- ⚠️ **Static prompt** - Doesn't receive claim context dynamically
- ⚠️ **No briefing integration** - Doesn't know about claim priorities
- ⚠️ **No workflow integration** - Doesn't know about inspection steps

---

## Integration Points

### 1. Claim → Briefing ✅
- ✅ Auto-triggered after document processing
- ✅ Uses `buildPerilAwareClaimContext()` for consistent data
- ✅ Stores briefing in `claim_briefings` table

### 2. Briefing → Workflow ✅
- ✅ Workflow generation reads briefing from `claim_briefings`
- ✅ Briefing summary included in workflow prompt
- ✅ Briefing priorities guide workflow generation

### 3. Workflow → Scope ⚠️
- ⚠️ **No direct integration** - Scope agent doesn't receive workflow data
- ⚠️ Scope agent operates independently
- ⚠️ No tools to query workflow steps or priorities

### 4. Briefing → Scope ⚠️
- ⚠️ **No direct integration** - Scope agent doesn't receive briefing data
- ⚠️ Scope agent doesn't know about claim priorities or photo requirements

---

## Recommendations

### High Priority

1. **Enhance Scope Agent with Claim Context** ⚠️
   - Inject claim context (briefing, workflow, peril) into scope agent prompt
   - Add tools to query workflow steps and briefing priorities
   - Make scope agent aware of peril-specific requirements

### Medium Priority

2. **Add Workflow → Scope Integration**
   - Create API endpoint to get workflow steps for a claim
   - Add tool to scope agent: `get_workflow_steps()` - Returns current workflow steps
   - Add tool to scope agent: `get_briefing_priorities()` - Returns briefing priorities

3. **Add Briefing → Scope Integration**
   - Inject briefing summary into scope agent prompt when initializing
   - Add tool: `get_photo_requirements()` - Returns photo requirements from briefing
   - Add tool: `get_sketch_requirements()` - Returns sketch requirements from briefing

### Low Priority

4. **Add Scope → Workflow Feedback**
   - When scope items are added, mark related workflow steps as "in progress"
   - When scope items are completed, mark workflow steps as "completed"

---

## Conclusion

✅ **Core Workflow:** Claim import → Briefing → Workflow generation is **fully functional** and uses canonical schema consistently.

⚠️ **Scope Generation:** Works independently but could benefit from claim context (briefing, workflow, peril) to provide better guidance.

**Overall Assessment:** The system is production-ready for claim import, briefing, and workflow generation. Scope generation works but could be enhanced with better integration.
