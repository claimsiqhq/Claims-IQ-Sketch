# Upstream Inspection Workflow Pipeline Analysis

**Date:** 2026-01-13  
**Focus:** AI Claim Briefing generation and Pre-Workflow Wizard data flow

---

## PART 1: AI CLAIM BRIEFING GENERATION

### 1.1 Briefing Generation Pipeline

#### Service Location
**File:** `server/services/claimBriefingService.ts`  
**Main Function:** `generateClaimBriefing()` (lines 480-658)

#### Generation Flow

```
1. Build UnifiedClaimContext
   ↓
2. Generate source hash for caching
   ↓
3. Check for cached briefing (if not forceRegenerate)
   ↓
4. Create briefing record (status: 'generating')
   ↓
5. Get prompt config from database (PromptKey.CLAIM_BRIEFING)
   ↓
6. Build enhanced briefing prompt
   ↓
7. Call OpenAI API
   ↓
8. Parse and validate JSON response
   ↓
9. Update briefing record (status: 'generated')
   ↓
10. Increment claim.briefing_version
```

#### Triggers for Briefing Generation

**Automatic Triggers:**
1. **FNOL Document Upload** (`server/services/documentProcessor.ts:1635`)
   - When FNOL document completes processing
   - Calls `triggerAIGenerationPipeline()` → `generateClaimBriefing()`

2. **Policy Document Upload** (`server/services/documentProcessor.ts:1723`)
   - When policy document completes processing
   - Triggers briefing regeneration

3. **Endorsement Document Upload** (`server/services/documentProcessor.ts:1838`)
   - When endorsement document completes processing
   - Triggers briefing regeneration

**Manual Triggers:**
1. **API Endpoint:** `POST /api/claims/:id/briefing/generate` (`server/routes.ts:3403`)
   - User-initiated via BriefingPanel component
   - Auto-generates on panel load if no briefing exists (`client/src/components/briefing-panel.tsx:146-152`)

**Assessment:** ✅ Briefing generation is well-triggered automatically when relevant documents are processed.

---

### 1.2 Briefing Content Structure

#### Output Schema

**Location:** `shared/schema.ts` (lines 329-469) - `ClaimBriefingContent` interface

```typescript
{
  claim_summary: {
    primary_peril: string;
    secondary_perils: string[];
    overview: string[];  // 2-4 brief overview points
  };
  inspection_strategy: {
    where_to_start: string[];  // 2-4 specific areas
    what_to_prioritize: string[];  // 3-5 priority items
    common_misses: string[];  // 2-4 commonly missed items
  };
  peril_specific_risks: string[];  // 3-5 risks
  endorsement_watchouts: [
    {
      endorsement_id: string;  // Form number
      impact: string;
      inspection_implications: string[];
    }
  ];
  photo_requirements: [
    {
      category: string;
      items: string[];
    }
  ];
  sketch_requirements: string[];
  depreciation_considerations: string[];
  open_questions_for_adjuster: string[];
}
```

#### Storage

**Table:** `claim_briefings`  
**Fields:**
- `briefing_json` (jsonb) - Stores complete `ClaimBriefingContent`
- `source_hash` (varchar) - Hash of input context for cache invalidation
- `status` (varchar) - 'generating', 'generated', 'failed'
- Token usage fields (`prompt_tokens`, `completion_tokens`, `total_tokens`)

**Retrieval:** `getClaimBriefing()` (lines 663-695) - Gets latest 'generated' briefing

**Assessment:** ✅ Briefing structure is comprehensive and well-structured for downstream consumption.

---

### 1.3 Briefing Usage

#### Downstream Consumption

**1. Workflow Generation** (`server/services/inspectionWorkflowService.ts:1149`)
```typescript
const briefing = await getClaimBriefing(claimId, organizationId);
// ... later in prompt building ...
const userPrompt = buildEnhancedWorkflowPrompt(context, briefing, wizardContext);
```

**Briefing Content Included in Workflow Prompt:**
- Claim Summary (primary_peril, overview)
- Inspection Strategy (where_to_start, what_to_prioritize, common_misses)
- Photo Requirements (full list)
- Endorsement Watchouts (full list with implications)
- Depreciation Notes
- Open Questions

**Location:** `server/services/inspectionWorkflowService.ts` (lines 2384-2414)

**2. UI Display** (`client/src/components/briefing-panel.tsx`)
- Displays all briefing sections in collapsible cards
- Read-only display for adjuster reference
- Auto-generates on panel load if missing

**Assessment:** ✅ Briefing is fully consumed in workflow generation and displayed to adjuster.

---

### 1.4 Briefing Quality Assessment

#### Prompt Structure

**Location:** `server/services/claimBriefingService.ts` (lines 1061-1156) - `buildEnhancedBriefingPrompt()`

**Context Passed to AI:**
- UnifiedClaimContext (full claim data)
- FNOL facts from `loss_context`
- Policy context (limits, deductibles, settlement rules)
- Endorsements with inspection requirements
- Peril-specific guidance from `PERIL_INSPECTION_RULES`
- Coverage alerts

**System Prompt:** Retrieved from `ai_prompts` table (key: `CLAIM_BRIEFING`)

**User Prompt Sections:**
1. Claim Context (number, policy, insured, property)
2. FNOL Facts (from loss_context)
3. Policy Context (limits, deductibles, settlement)
4. Endorsements (with inspection requirements)
5. Peril-Specific Guidance (priority areas, common misses, safety)
6. JSON Schema Request

**Assessment:**
- ✅ **Actionable Inspection Guidance:** Yes - `inspection_strategy` provides specific areas and priorities
- ✅ **Endorsement-Specific Requirements:** Yes - `endorsement_watchouts` includes inspection implications
- ✅ **Coverage Issues:** Partial - Coverage alerts are passed but not explicitly extracted into briefing
- ✅ **Extra Documentation Areas:** Yes - `photo_requirements` and `sketch_requirements` identify documentation needs

**Potential Improvements:**
- Coverage alerts could be more explicitly surfaced in briefing
- Depreciation considerations could be more detailed based on roof schedules

---

## PART 2: PRE-WORKFLOW WIZARD

### 2.1 Wizard Flow

#### Component Location
**File:** `client/src/components/workflow/workflow-wizard.tsx`  
**Component:** `WorkflowWizard`

#### Wizard Steps

**6 Steps Total:**

1. **Property Overview** (`currentStep === 0`)
   - Property type, stories, features (basement, attic, garage, pool, outbuildings)
   - Roof type, siding type

2. **Affected Areas** (`currentStep === 1`)
   - Roof (with details textarea)
   - Exterior elevations (North, South, East, West)
   - Interior, Basement, Attic, Garage, Other Structures, Landscaping

3. **Rooms Selection** (`currentStep === 2`)
   - List of rooms with checkboxes
   - Room name, level (basement/main/upper/attic)
   - Has damage flag, damage type

4. **Safety Assessment** (`currentStep === 3`)
   - Critical hazards (electrical, gas smell, structural)
   - Water conditions (active leaks, standing water, mold)
   - Utility status (power, water)
   - Other concerns (animals, access issues)
   - Safety notes textarea

5. **Homeowner Input** (`currentStep === 4`)
   - Primary concern (textarea)
   - Previous damage (checkbox + details)
   - Temporary repairs (checkbox + details)
   - Contents damage (checkbox)
   - Additional notes (textarea)

6. **Review & Generate** (`currentStep === 5`)
   - Summary of all inputs
   - Generate button

**Assessment:** ✅ Wizard flow is logical and mobile-optimized.

---

### 2.2 Wizard Data Collection

#### Complete Field List

**Property Info** (`WizardPropertyInfo`):
- `propertyType`: "single_family" | "multi_family" | "townhouse" | "condo" | "mobile_home" | "commercial" (required)
- `stories`: number (required, default: 1)
- `hasBasement`: boolean (optional, default: false)
- `hasAttic`: boolean (optional, default: false)
- `hasGarage`: boolean (optional, default: true)
- `hasPool`: boolean (optional, default: false)
- `hasOutbuildings`: boolean (optional, default: false)
- `roofType`: "shingle" | "tile" | "metal" | "flat" | "other" | "unknown" (required, default: "shingle")
- `sidingType`: "vinyl" | "wood" | "brick" | "stucco" | "stone" | "other" | "unknown" (required, default: "vinyl")

**Affected Areas** (`WizardAffectedAreas`):
- `roof`: boolean (optional, default: based on primaryPeril)
- `roofDetails`: string (optional, textarea)
- `exteriorNorth`: boolean (optional)
- `exteriorSouth`: boolean (optional)
- `exteriorEast`: boolean (optional)
- `exteriorWest`: boolean (optional)
- `exteriorDetails`: string (optional, textarea)
- `interior`: boolean (optional, default: based on primaryPeril)
- `basement`: boolean (optional)
- `attic`: boolean (optional)
- `garage`: boolean (optional)
- `otherStructures`: boolean (optional)
- `otherStructuresDetails`: string (optional, textarea)
- `landscaping`: boolean (optional)

**Rooms** (`WizardRoom[]`):
- `name`: string (required)
- `level`: "basement" | "main" | "upper" | "attic" (required)
- `hasDamage`: boolean (required)
- `damageType`: string (optional)

**Safety Info** (`WizardSafetyInfo`):
- `activeLeaks`: boolean (optional)
- `standingWater`: boolean (optional)
- `electricalHazard`: boolean (optional)
- `structuralConcern`: boolean (optional)
- `moldVisible`: boolean (optional)
- `gasSmell`: boolean (optional)
- `animalsConcern`: boolean (optional)
- `accessIssues`: boolean (optional)
- `safetyNotes`: string (optional, textarea)
- `powerStatus`: "on" | "off" | "partial" | "unknown" (required, default: "on")
- `waterStatus`: "on" | "off" | "unknown" (required, default: "on")

**Homeowner Input** (`WizardHomeownerInput`):
- `primaryConcern`: string (optional, textarea)
- `previousDamage`: boolean (optional)
- `previousDamageDetails`: string (optional, textarea)
- `temporaryRepairs`: boolean (optional)
- `temporaryRepairsDetails`: string (optional, textarea)
- `contentsDamage`: boolean (optional)
- `additionalNotes`: string (optional, textarea)

**Total Fields:** ~40+ fields across 5 data structures

**Required vs Optional:**
- **Required:** `propertyType`, `stories`, `roofType`, `sidingType`, `powerStatus`, `waterStatus`
- **Optional:** All others (but many have defaults based on `primaryPeril`)

**Input Types:**
- Radio buttons: Property type, stories
- Checkboxes: Features, affected areas, hazards, homeowner flags
- Textareas: Details fields, notes, concerns
- Select buttons: Roof type, siding type, utility status

**Assessment:** ✅ Comprehensive data collection, but many fields may be redundant with existing data.

---

### 2.3 Wizard → Workflow Connection

#### Data Flow

**Location:** `server/services/inspectionWorkflowService.ts` (lines 1082-1208)

**Flow:**
```
1. User completes wizard → WizardData object
   ↓
2. generateInspectionWorkflow(claimId, orgId, userId, forceRegenerate, wizardContext)
   ↓
3. Build UnifiedClaimContext (ignores wizard data)
   ↓
4. Auto-detect rooms/hazards from loss description (if wizardContext.rooms/safetyInfo missing)
   ↓
5. Generate endorsement-driven steps
   ↓
6. Get existing briefing
   ↓
7. buildEnhancedWorkflowPrompt(context, briefing, wizardContext)
   ↓
8. Format wizard context for prompt (formatWizardContext())
```

#### Wizard Data Formatting

**Location:** `server/services/inspectionWorkflowService.ts` (lines 972-1063) - `formatWizardContext()`

**What Gets Included in Prompt:**

```typescript
## FIELD ADJUSTER INPUT (HIGH PRIORITY)
- Observed Damage: ${JSON.stringify(wizardContext.observedDamage)}
- Building Stories: ${wizardContext.stories}
- Has Basement: Yes/No
- Affected Areas: ${wizardContext.affectedAreas.join(', ')}
- Urgency Factors: ${wizardContext.urgencyFactors.join(', ')}
```

**⚠️ CRITICAL FINDING:** The `formatWizardContext()` function expects different field names than what the wizard collects!

**Wizard Collects:**
- `wizardContext.propertyInfo.stories`
- `wizardContext.propertyInfo.hasBasement`
- `wizardContext.affectedAreas` (object with boolean flags)

**Prompt Expects:**
- `wizardContext.stories` (direct property)
- `wizardContext.hasBasement` (direct property)
- `wizardContext.affectedAreas` (array of strings)
- `wizardContext.observedDamage` (not collected by wizard)
- `wizardContext.urgencyFactors` (not collected by wizard)

**Actual Formatting Function:**

**Location:** `server/services/inspectionWorkflowService.ts` (lines 972-1063)

The function formats:
- Property details (type, stories, features, roof, siding)
- Affected areas (roof, exterior directions, interior, basement, attic, garage, other structures, landscaping)
- Rooms requiring inspection (filtered to `hasDamage === true`)
- Safety concerns (hazards, utility status, notes)
- Homeowner input (primary concern, previous damage, temporary repairs, contents damage, additional notes)

**Assessment:** ⚠️ **Data mapping mismatch** - Wizard collects nested structure, but prompt builder expects flat structure. The `formatWizardContext()` function correctly transforms the nested structure, but the prompt section at line 2420 uses wrong field names.

---

### 2.4 Redundancy Analysis

#### Questions Already Answered by Available Data

**1. Property Type, Stories, Features**
- **Available in:** `loss_context.property` (FNOL extraction)
- **Wizard asks:** Property type, stories, basement, attic, garage, pool, outbuildings
- **Redundancy:** ⚠️ **HIGH** - FNOL typically contains this information

**2. Roof Type**
- **Available in:** `loss_context.property.roof.material` (FNOL)
- **Wizard asks:** Roof type
- **Redundancy:** ⚠️ **HIGH** - Should be pre-filled from FNOL

**3. Affected Areas (Roof, Exterior, Interior)**
- **Available in:** `loss_description` (claim table), `damage_zones` (if created)
- **Wizard asks:** Roof, exterior directions, interior, basement, attic, garage
- **Redundancy:** ⚠️ **MEDIUM** - Loss description may indicate areas, but wizard provides structured confirmation

**4. Rooms with Damage**
- **Available in:** `loss_description` (may mention rooms), `claim_rooms` (if voice sketch used)
- **Wizard asks:** List of rooms with damage flags
- **Redundancy:** ⚠️ **MEDIUM** - Could auto-populate from loss description or existing rooms

**5. Safety Hazards**
- **Available in:** `loss_description` (may mention hazards)
- **Wizard asks:** Electrical hazard, gas smell, structural concern, active leaks, standing water, mold
- **Redundancy:** ⚠️ **LOW** - Safety info is field-specific and may not be in FNOL

**6. Utility Status**
- **Available in:** Not typically in FNOL
- **Wizard asks:** Power status, water status
- **Redundancy:** ✅ **NONE** - Field-specific information

**7. Homeowner Concerns**
- **Available in:** `loss_description` (may contain concerns)
- **Wizard asks:** Primary concern, previous damage, temporary repairs, contents damage
- **Redundancy:** ⚠️ **MEDIUM** - Some info may be in loss description

**Assessment:** ⚠️ **Significant redundancy** - Many wizard fields could be pre-populated from FNOL/policy data.

---

## PART 3: DATA FLOW ANALYSIS

### 3.1 Context Assembly

#### UnifiedClaimContext Building

**Location:** `server/services/unifiedClaimContextService.ts`  
**Function:** `buildUnifiedClaimContext()` (line 399+)

#### Data Sources

```
1. Claim Record (claims table)
   ├─ Basic claim info (number, date of loss, description)
   ├─ loss_context (jsonb) - FNOL extraction data
   └─ Policy metadata (policy number, state, limits, deductibles)

2. Policy Form Extractions (policy_form_extractions table)
   ├─ Base policy provisions
   ├─ Coverage limits
   ├─ Deductibles
   ├─ Loss settlement rules
   └─ Exclusions

3. Endorsement Extractions (endorsement_extractions table)
   ├─ Form codes
   ├─ Modifications (keyChanges)
   ├─ Inspection requirements (extracted)
   └─ Roof payment schedules

4. Damage Zones (estimate_zones table)
   ├─ Damage types
   ├─ Severity
   └─ Peril associations

5. Peril Inference (perilInference service)
   └─ Primary/secondary peril determination

6. Peril Inspection Rules (PERIL_INSPECTION_RULES config)
   └─ Peril-specific guidance
```

#### Context Structure

**Location:** `shared/schema.ts` - `UnifiedClaimContext` interface

**Key Sections:**
- `claimNumber`, `policyNumber`, `insured` (name, name2)
- `dateOfLossFormatted`
- `property` (address, yearBuilt, stories, roof details)
- `peril` (primary, secondary, display names)
- `coverages` (dwelling, otherStructures, personalProperty limits)
- `deductibles` (standard, windHail, applicableForPeril)
- `lossSettlement` (dwelling, roofing, personalProperty basis)
- `endorsements.extracted` (formCode, title, category, impacts, inspectionRequirements)
- `alerts` (coverage warnings)
- `meta` (dataCompleteness score, builtAt timestamp)

**Assessment:** ✅ Comprehensive context assembly from multiple data sources.

---

### 3.2 Information Loss

#### FNOL Data Availability

**Location:** `claims.loss_context` (jsonb field)

**Available FNOL Fields** (from `FNOLExtraction` schema):
- `claim_information_report` (claim number, date of loss, reported date, reported by)
- `insured_information` (name, address, phone, email)
- `property_information` (address, year built, stories, occupancy, roof details)
- `damage_summary` (coverage A/B/C/D descriptions)
- `weather` (lookup status, message)
- `drone_eligible` flag

**What Gets Used:**
- ✅ Claim number, date of loss → Used in context
- ✅ Property info (year built, stories, roof) → Used in context
- ✅ Loss description → Used in context
- ⚠️ **Reported by** → Available but not prominently used
- ⚠️ **Drone eligible** → Available but not used in workflow generation
- ⚠️ **Weather data** → Available but not used in workflow generation

**Assessment:** ⚠️ **Some FNOL data is underutilized** - Weather and drone eligibility could inform workflow steps.

#### Policy Data Availability

**Location:** `policy_form_extractions.extraction_data` (jsonb)

**Available Policy Fields:**
- Complete policy provisions (Section I, Section II)
- Coverage limits
- Deductibles
- Loss settlement rules
- Exclusions
- Definitions
- Additional coverages

**What Gets Used:**
- ✅ Coverage limits → Used in context
- ✅ Deductibles → Used in context
- ✅ Loss settlement rules → Used in context
- ✅ Exclusions → Used in coverage alerts
- ⚠️ **Additional coverages** → Available but not explicitly surfaced
- ⚠️ **Policy definitions** → Available but not used in workflow generation

**Assessment:** ✅ Policy data is well-utilized, but additional coverages could be highlighted.

#### Endorsement Details

**Location:** `endorsement_extractions` table

**Available Endorsement Fields:**
- `form_code`, `title`
- `modifications` (jsonb) - Key changes
- `raw_text` (full endorsement text)
- Inspection requirements (extracted)

**What Gets Used:**
- ✅ Form code, title → Used in context
- ✅ Modifications → Used to determine inspection requirements
- ✅ Inspection requirements → Extracted and used
- ⚠️ **Raw text** → Available but not passed to AI (only extracted fields)

**Assessment:** ✅ Endorsement data is well-extracted and used, but raw text could provide additional context.

---

### 3.3 Prompt Context Efficiency

#### Workflow Prompt Structure

**Location:** `server/services/inspectionWorkflowService.ts` (lines 2430-2542)

**Prompt Sections (in order):**
1. Claim Context (8 lines)
2. Peril Analysis (5 lines)
3. Coverage Limits (4 lines)
4. Loss Settlement Rules (6 lines)
5. Endorsements with Inspection Impact (variable, ~5-20 lines per endorsement)
6. Coverage Alerts (variable, ~1-5 lines)
7. Peril-Specific Guidance (3 lines)
8. AI Claim Briefing (FULL CONTENT - variable, ~20-50 lines)
9. Field Adjuster Input (wizard context - variable, ~10-30 lines)
10. Workflow Requirements (6 lines)
11. JSON Schema (50+ lines)

#### Token Count Estimation

**Base Context:** ~100-150 tokens
**Endorsements:** ~50-200 tokens (depends on count)
**Briefing:** ~200-500 tokens (full content)
**Wizard Context:** ~100-300 tokens (depends on inputs)
**Schema:** ~300 tokens

**Total Estimated:** ~750-1,450 tokens (prompt) + ~2,000-4,000 tokens (completion)

**Assessment:** ⚠️ **Prompt is lengthy** - Briefing content is duplicated in full, which may bury critical information.

#### Information Hierarchy Issues

**Problems Identified:**

1. **Briefing Content Duplication**
   - Briefing is generated from UnifiedClaimContext
   - Briefing content is then included in workflow prompt
   - This creates redundancy: same data processed twice by AI

2. **Wizard Data Redundancy**
   - Wizard asks for property info already in FNOL
   - Wizard asks for affected areas that may be in loss description
   - This data is then added to prompt, duplicating UnifiedClaimContext

3. **Critical Information Buried**
   - Endorsement inspection requirements are in UnifiedClaimContext
   - They're also in briefing
   - They're also listed separately in prompt
   - This triple-redundancy may confuse AI

4. **Prompt Order**
   - Briefing comes AFTER endorsements and coverage alerts
   - Briefing may summarize endorsements, creating confusion
   - Should briefing come first, or should raw data come first?

**Assessment:** ⚠️ **Prompt structure could be optimized** - Too much redundancy, unclear hierarchy.

---

## SPECIFIC INEFFICIENCIES IDENTIFIED

### 1. Wizard Field Redundancy

**Issue:** Wizard asks for data already available in FNOL/policy

**Examples:**
- Property type, stories → Available in `loss_context.property`
- Roof type → Available in `loss_context.property.roof.material`
- Affected areas → May be inferable from `loss_description`

**Impact:** User time wasted, potential for data inconsistency

**Recommendation:** Pre-populate wizard fields from available data, allow override

---

### 2. Briefing Content Duplication

**Issue:** Briefing content is included in full in workflow prompt, but briefing was generated from the same UnifiedClaimContext

**Impact:** 
- Token waste (~200-500 tokens)
- Potential for AI confusion (same information presented twice)
- Longer prompt = higher cost, slower generation

**Recommendation:** 
- Option A: Use briefing as PRIMARY source, reference UnifiedClaimContext only for missing details
- Option B: Don't include full briefing, only reference key insights
- Option C: Generate workflow FIRST, then briefing (reverse order)

---

### 3. Wizard Data Mapping Mismatch

**Issue:** Prompt builder at line 2420 expects flat structure, but wizard provides nested structure

**Location:** `server/services/inspectionWorkflowService.ts:2420`

```typescript
// Current (WRONG):
${wizardContext.observedDamage ? `- Observed Damage: ${JSON.stringify(wizardContext.observedDamage)}` : ''}
${wizardContext.stories ? `- Building Stories: ${wizardContext.stories}` : ''}

// Should be:
${wizardContext.propertyInfo?.stories ? `- Building Stories: ${wizardContext.propertyInfo.stories}` : ''}
```

**Impact:** Wizard data may not be properly included in prompt

**Recommendation:** Fix field mapping or use `formatWizardContext()` output consistently

---

### 4. Underutilized FNOL Data

**Issue:** Some FNOL fields are available but not used

**Examples:**
- `drone_eligible` → Could add drone inspection steps
- `weather` data → Could add weather-related inspection steps
- `reported_by` → Could inform interview steps

**Impact:** Missed opportunities for workflow optimization

**Recommendation:** Extract and use all relevant FNOL fields

---

### 5. Prompt Structure Inefficiency

**Issue:** Information is presented in unclear hierarchy

**Current Order:**
1. Claim Context
2. Peril Analysis
3. Coverage Limits
4. Loss Settlement Rules
5. Endorsements
6. Coverage Alerts
7. Peril Guidance
8. **Briefing (summary of above)**
9. Wizard Input
10. Requirements
11. Schema

**Problem:** Briefing summarizes items 1-7, creating redundancy

**Recommendation:** Restructure to:
1. Briefing (high-level summary)
2. Critical Details (endorsements, alerts)
3. Wizard Input (field-specific)
4. Requirements & Schema

---

## RECOMMENDATIONS FOR IMPROVEMENT

### High Priority

1. **Pre-populate Wizard from Available Data**
   - Auto-fill property type, stories, roof type from FNOL
   - Auto-detect affected areas from loss description
   - Auto-populate rooms from loss description or existing claim_rooms
   - Allow user to override any pre-populated values

2. **Fix Wizard Data Mapping**
   - Ensure `formatWizardContext()` output is used consistently
   - Remove incorrect field references at line 2420

3. **Optimize Prompt Structure**
   - Use briefing as primary summary, reference UnifiedClaimContext for details
   - Or: Remove briefing from workflow prompt, use only UnifiedClaimContext
   - Clarify information hierarchy

### Medium Priority

4. **Extract More FNOL Data**
   - Use `drone_eligible` to add drone inspection steps
   - Use `weather` data to add weather-related steps
   - Use `reported_by` to inform interview steps

5. **Reduce Redundancy**
   - Don't duplicate endorsement requirements in briefing AND prompt
   - Use briefing insights, not raw briefing content

6. **Improve Wizard Efficiency**
   - Skip steps if data is already available
   - Show "This information is already available from FNOL" messages
   - Allow "Use FNOL data" quick-fill option

### Low Priority

7. **Add Data Completeness Indicators**
   - Show wizard which fields are missing vs available
   - Highlight fields that would improve workflow quality

8. **Token Optimization**
   - Estimate token count before generation
   - Warn if prompt exceeds optimal length
   - Consider prompt compression techniques

---

## CONCLUSION

**Key Findings:**

1. ✅ **Briefing Generation:** Well-triggered, comprehensive content structure
2. ⚠️ **Wizard Redundancy:** Many fields duplicate available FNOL/policy data
3. ⚠️ **Data Mapping:** Wizard data structure mismatch in prompt builder
4. ⚠️ **Prompt Efficiency:** Briefing content duplication creates redundancy
5. ⚠️ **Information Loss:** Some FNOL fields (drone, weather) underutilized

**Primary Inefficiency:** Wizard asks questions that shouldn't need to be asked because the data is already available from FNOL/policy documents.

**Answer to Question:** 
- **Available but not used effectively:** FNOL property details, weather data, drone eligibility
- **Questions that shouldn't need to be asked:** Property type, stories, roof type, affected areas (if inferable from loss description)
