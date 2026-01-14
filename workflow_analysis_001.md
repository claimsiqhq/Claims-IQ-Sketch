# Workflow Step UI Uniformity Analysis

**Date:** 2026-01-13  
**Issue:** Every generated workflow step renders with identical UI requirements (mandatory photos, damage severity selector, notes field) regardless of the step's actual purpose.

## Executive Summary

**Root Cause:** The UI component (`StepCompletionDialog`) applies a **hardcoded, uniform template** to all steps regardless of `step_type`. While the data model supports differentiated step types and evidence requirements, the rendering layer ignores these distinctions.

**Assessment:** This is primarily a **UI fix** with supporting **data model enhancements**. The prompt engineering is adequate but could be improved to explicitly specify UI requirements per step type.

---

## 1. DATA MODEL & TYPES

### Step Type Definitions

**Location:** `shared/schema.ts` (lines 2597-2606)

```typescript
export enum InspectionStepType {
  PHOTO = "photo",
  MEASUREMENT = "measurement",
  CHECKLIST = "checklist",
  OBSERVATION = "observation",
  DOCUMENTATION = "documentation",
  SAFETY_CHECK = "safety_check",
  EQUIPMENT = "equipment",
  INTERVIEW = "interview",
}
```

**Assessment:** ✅ **The system HAS differentiated step types** - 8 distinct types are defined.

### Step Schema Structure

**Location:** `shared/schema.ts` (lines 2662-2684)

```typescript
export interface WorkflowJsonStep {
  phase: InspectionPhase;
  step_type: InspectionStepType;
  title: string;
  instructions: string;
  required: boolean;
  tags?: string[];
  estimated_minutes: number;
  assets?: WorkflowJsonAsset[];  // Legacy asset requirements
  peril_specific?: string | null;
  endorsement_source?: string | null;
  
  // Dynamic workflow fields (optional - for future use)
  origin?: string;
  source_rule_id?: string;
  conditions?: Record<string, unknown>;
  evidence_requirements?: Record<string, unknown>[];  // ⚠️ NEW FORMAT - not fully utilized
  blocking?: string;
  blocking_condition?: Record<string, unknown>;
  geometry_binding?: Record<string, unknown>;
  room_id?: string;
  room_name?: string;
}
```

**Key Finding:** The schema supports `evidence_requirements` (array) but also has legacy `assets` array. Both exist in parallel.

### Evidence Requirements Type (Advanced)

**Location:** `shared/workflowTypes.ts` (lines 142-150)

```typescript
export interface EvidenceRequirement {
  type: EvidenceType;  // 'photo' | 'measurement' | 'note' | 'signature' | 'document' | 'checklist'
  label: string;
  description?: string;
  required: boolean;  // ⚠️ KEY FIELD - controls if requirement is mandatory
  photo?: PhotoRequirement;
  measurement?: MeasurementRequirement;
  note?: NoteRequirement;
}
```

**Assessment:** ✅ **The data model CAN support differentiated requirements** - `EvidenceRequirement` has `required: boolean` and type-specific configurations.

### Database Schema

**Location:** `shared/schema.ts` (lines 2822-2879)

The `inspection_workflow_steps` table includes:
- `step_type` (varchar) - stores the step type enum value
- `evidence_requirements` (jsonb) - stores evidence requirements array (nullable)
- `required` (boolean) - step-level required flag
- `assets` - stored separately in `inspection_workflow_assets` table

**Assessment:** ✅ **Database schema supports differentiated requirements** via `evidence_requirements` JSONB field.

---

## 2. WORKFLOW GENERATION PIPELINE

### Generation Flow

**Location:** `server/services/inspectionWorkflowService.ts` (lines 1082-1208)

**Flow:**
1. Build `UnifiedClaimContext` (policy, endorsements, peril rules)
2. Generate endorsement-driven steps (deterministic, policy-based)
3. Get existing briefing for context
4. Check for existing workflow (cache)
5. Build AI prompt with full context
6. Call OpenAI API with prompt
7. Normalize AI response
8. Validate schema
9. Create workflow record
10. Create step records from `workflow_json.steps` array

**Key Function:** `generateInspectionWorkflow()` (line 1082)

### AI Response Normalization

**Location:** `server/services/inspectionWorkflowService.ts` (lines 544-692)

The `normalizeAIResponse()` function:
- Extracts steps from nested phases if needed
- Normalizes `tools_required` to `tools_and_equipment`
- Handles `room_template` field name variations
- Normalizes `open_questions` format

**⚠️ CRITICAL FINDING:** The normalization does NOT enforce or add step-type-specific evidence requirements. It preserves whatever the AI returns in the `assets` array.

### Step Creation from Workflow JSON

**Location:** `server/services/inspectionWorkflowService.ts` (lines 821-905)

The `createStepsFromWorkflowJson()` function:
- Creates `inspection_workflow_steps` records from `workflow_json.steps`
- Maps `step.assets` to `inspection_workflow_assets` table
- Stores `evidence_requirements` as JSONB (if present)

**Assessment:** ✅ **Pipeline preserves step type and assets** - no post-processing that adds uniform requirements.

---

## 3. AI PROMPT ENGINEERING

### Prompt Builder Function

**Location:** `server/services/inspectionWorkflowService.ts` (lines 2373-2543)

**Function:** `buildEnhancedWorkflowPrompt()`

### Prompt Structure

The prompt includes:
- Claim context (number, policy, insured, property details)
- Peril analysis (primary/secondary, deductibles)
- Coverage limits
- Loss settlement rules
- Endorsements with inspection impact
- Coverage alerts
- Peril-specific guidance
- AI claim briefing (full content)
- Field adjuster input (wizard context)

### JSON Schema Requested from AI

**Location:** `server/services/inspectionWorkflowService.ts` (lines 2488-2542)

```json
{
  "steps": [
    {
      "step_type": "photo | measurement | checklist | observation | documentation | safety | interview",
      "title": "string - action-oriented title",
      "instructions": "string - specific, actionable instructions",
      "required": boolean,
      "estimated_minutes": number,
      "assets": [
        {
          "asset_type": "photo | document | measurement | note",
          "description": "string - what to capture",
          "required": boolean
        }
      ],
      "peril_specific": boolean,
      "endorsement_related": "form code if applicable" | null
    }
  ]
}
```

**⚠️ CRITICAL FINDING:** The prompt schema requests `assets` array with `required: boolean` per asset, but does NOT explicitly instruct the AI to:
- Vary requirements by step type
- Omit photos for non-photo steps
- Omit damage severity for non-damage steps
- Make requirements conditional

**Assessment:** ⚠️ **Prompt engineering is PARTIALLY responsible** - it doesn't explicitly guide AI to differentiate requirements by step type.

### Example AI-Generated Step (Inferred)

Based on the prompt, a "Meet Insured" step might be generated as:
```json
{
  "step_type": "interview",
  "title": "Meet with Insured",
  "instructions": "Introduce yourself and discuss the claim",
  "required": true,
  "assets": [
    {
      "asset_type": "photo",
      "description": "Capture evidence",
      "required": true  // ⚠️ AI may default to requiring photos
    }
  ]
}
```

**Problem:** The AI prompt doesn't explicitly say "For interview steps, do NOT require photos unless specifically needed."

---

## 4. STEP RENDERING & UI

### Step Completion Dialog Component

**Location:** `client/src/components/workflow/step-completion-dialog.tsx`

**⚠️ ROOT CAUSE IDENTIFIED HERE**

### Hardcoded UI Elements

**Lines 339-416:** The component ALWAYS renders:

1. **Photo Capture Section** (lines 339-357)
   ```typescript
   <Label>Photos {step.required && !hasEnoughPhotos && <span>({requiredPhotos} required)</span>}</Label>
   <CompactPhotoCapture ... />
   ```
   - Always shown, regardless of `step.stepType`
   - Required count determined by `getRequiredPhotoCount()` which defaults to 1 if no evidence requirements

2. **Findings/Notes Field** (lines 359-386)
   ```typescript
   <Label>What did you find? {step.required && <span>(Required)</span>}</Label>
   <Textarea ... />
   ```
   - Always shown, regardless of step type
   - Required if `step.required === true`

3. **Damage Severity Selector** (lines 388-416)
   ```typescript
   <Label>Damage Severity</Label>
   <div className="grid grid-cols-4 gap-2">
     {/* None, Minor, Moderate, Severe buttons */}
   </div>
   ```
   - **ALWAYS SHOWN** - no conditional rendering based on step type
   - No check for whether step is damage-related

4. **Measurement Input** (lines 418-448)
   - Only shown if `step.stepType === "measurement"` ✅ **This one IS conditional**

### Requirement Detection Logic

**Lines 172-211:** The component has logic to detect requirements:

```typescript
const getRequiredPhotoCount = (): number => {
  // First check evidenceRequirements (dynamic workflow)
  if (step.evidenceRequirements) {
    const photoReq = step.evidenceRequirements.find(r => r.type === 'photo' && r.required);
    if (photoReq?.photo?.minCount) {
      return photoReq.photo.minCount;
    }
  }
  // Fall back to legacy assets count
  return step.assets?.filter(a => a.required && a.assetType === "photo").length || 1;  // ⚠️ DEFAULTS TO 1
};
```

**⚠️ CRITICAL:** Even when checking `evidenceRequirements`, if no photo requirement exists, it defaults to `|| 1`, meaning "require 1 photo" for ALL steps.

### Step Type Icons

**Location:** `client/src/components/workflow-panel.tsx` (lines 101-149)

```typescript
const STEP_TYPE_ICONS: Record<InspectionStepType, React.ReactNode> = {
  photo: <Camera className="h-4 w-4" />,
  measurement: <Ruler className="h-4 w-4" />,
  checklist: <ClipboardCheck className="h-4 w-4" />,
  observation: <Eye className="h-4 w-4" />,
  documentation: <FileText className="h-4 w-4" />,
  safety_check: <Shield className="h-4 w-4" />,
  equipment: <Wrench className="h-4 w-4" />,
  interview: <Users className="h-4 w-4" />,
};
```

**Assessment:** ✅ Icons exist for all step types, but they're only used for display, not for conditional UI rendering.

### Step List Rendering

**Location:** `client/src/components/workflow-panel.tsx` (lines 990-1200)

The step list shows:
- Step type icon
- Title
- Required/Blocking badges
- Evidence progress (photo count)
- Room name
- Estimated minutes

**Assessment:** ✅ Step type is displayed but not used to conditionally render completion UI.

---

## 5. REQUIREMENTS/VALIDATION LOGIC

### Completion Validation

**Location:** `client/src/components/workflow/step-completion-dialog.tsx` (lines 218-244)

```typescript
// Check if step is blocking (required or blocking='blocking')
const isBlockingStep = step.required || step.blocking === 'blocking';

// Basic local requirements check
const hasBasicRequirements = !isBlockingStep || (hasEnoughPhotos && hasRequiredNotes && hasMeasurement);

// Check if can complete - must pass both basic requirements and evidence validation
const canComplete = hasBasicRequirements && evidenceValidation.valid;
```

**⚠️ CRITICAL:** Validation logic checks:
- `hasEnoughPhotos` - always checked for blocking steps
- `hasRequiredNotes` - always checked for blocking steps
- `hasMeasurement` - only checked if `step.stepType === 'measurement'` ✅

**Problem:** Photos and notes are ALWAYS required for blocking steps, regardless of step type.

### Evidence Requirement Checking

**Lines 172-211:** The component has functions to check evidence requirements:
- `getRequiredPhotoCount()` - defaults to 1 if no requirement found
- `getNoteRequirement()` - defaults to `required: step.required` if no requirement found
- `getMeasurementRequirement()` - only true for measurement steps ✅

**Assessment:** ⚠️ **Validation logic partially supports differentiated requirements** but defaults to requiring photos/notes for all blocking steps.

### Step Completion Handler

**Location:** `client/src/components/workflow-panel.tsx` (lines 200-320)

The `handleStepComplete()` function:
- Validates evidence (photos, notes, measurements)
- Uploads photos
- Attaches evidence to step
- Updates step status

**Assessment:** The handler respects evidence requirements but the UI forces users to provide photos/notes even when not required.

---

## 6. SAMPLE DATA

### Example Workflow JSON Structure

Based on the schema and normalization logic, a typical workflow JSON would be:

```json
{
  "metadata": {
    "claim_number": "CLM-12345",
    "primary_peril": "wind",
    "secondary_perils": ["hail"],
    "estimated_total_time_minutes": 120
  },
  "phases": [
    {
      "phase": "pre_inspection",
      "title": "Pre-Inspection",
      "step_count": 2
    }
  ],
  "steps": [
    {
      "phase": "pre_inspection",
      "step_type": "interview",
      "title": "Meet with Insured",
      "instructions": "Introduce yourself and discuss the claim",
      "required": true,
      "estimated_minutes": 5,
      "assets": [
        {
          "asset_type": "photo",
          "label": "Capture evidence",
          "required": true  // ⚠️ Likely always true from AI
        }
      ]
    },
    {
      "phase": "exterior",
      "step_type": "photo",
      "title": "Photograph Roof Damage",
      "instructions": "Document all visible roof damage",
      "required": true,
      "estimated_minutes": 15,
      "assets": [
        {
          "asset_type": "photo",
          "label": "Roof damage overview",
          "required": true
        },
        {
          "asset_type": "photo",
          "label": "Close-up of damaged shingles",
          "required": true
        }
      ]
    }
  ]
}
```

**Assessment:** The data structure supports differentiated requirements, but AI likely generates uniform `required: true` for all assets.

---

## 7. CONFIGURATION & CONSTANTS

### Peril Inspection Rules

**Location:** `server/config/perilInspectionRules.ts`

Contains peril-specific guidance:
- Priority areas
- Required photos (by category)
- Common misses
- Safety considerations

**Assessment:** ✅ Rules exist but are used for prompt context, not for enforcing step-specific requirements.

### Step Type Configuration

**Location:** `shared/schema.ts` (lines 2597-2606)

Step types are defined as an enum but there's **NO configuration file** that maps:
- Step type → Default evidence requirements
- Step type → UI components to show/hide
- Step type → Validation rules

**Assessment:** ⚠️ **Missing configuration layer** - no step-type-to-requirements mapping exists.

### Default Requirements

**Location:** `client/src/components/workflow/step-completion-dialog.tsx` (line 181)

```typescript
return step.assets?.filter(a => a.required && a.assetType === "photo").length || 1;
```

**⚠️ HARDCODED DEFAULT:** If no photo requirement exists, default to requiring 1 photo.

**Location:** `client/src/components/workflow/step-completion-dialog.tsx` (line 196)

```typescript
return { required: step.required, minLength: 1 };
```

**⚠️ HARDCODED DEFAULT:** Notes are required if `step.required === true`, regardless of step type.

---

## ROOT CAUSE ANALYSIS

### Primary Issue: UI Component Ignores Step Type

**File:** `client/src/components/workflow/step-completion-dialog.tsx`

**Problem:** The component renders a **uniform template** for all steps:
1. ✅ Photo capture - Always shown (lines 339-357)
2. ✅ Notes field - Always shown (lines 359-386)
3. ✅ Damage severity selector - **ALWAYS SHOWN** (lines 388-416) - No conditional
4. ✅ Measurement input - Only shown for measurement steps (lines 418-448) ✅

**Exception:** Measurement input IS conditional, proving the component CAN conditionally render.

### Secondary Issue: Default Requirements

**Problem:** When no evidence requirements are specified:
- Photos default to `required: 1` (line 181)
- Notes default to `required: step.required` (line 196)
- Damage severity has no requirement check - always shown

### Tertiary Issue: AI Prompt Doesn't Guide Differentiation

**Problem:** The prompt doesn't explicitly instruct AI to:
- Omit photo requirements for interview/documentation steps
- Omit damage severity for non-damage steps
- Vary requirements by step type

---

## ASSESSMENT: What Needs to Be Fixed?

### ✅ Data Model: ADEQUATE
- Step types exist (8 types)
- Evidence requirements schema exists
- Database supports differentiated requirements
- **Action:** No changes needed

### ⚠️ Prompt Engineering: PARTIAL
- Prompt requests step types and assets
- Doesn't explicitly guide AI to differentiate requirements
- **Action:** Enhance prompt to explicitly instruct AI to vary requirements by step type

### ❌ UI Rendering: CRITICAL ISSUE
- Component always shows photos, notes, damage severity
- No conditional rendering based on `step.stepType`
- Defaults force requirements even when not needed
- **Action:** Add conditional rendering based on step type and evidence requirements

### ⚠️ Validation Logic: PARTIAL
- Supports evidence requirements but defaults are too aggressive
- **Action:** Update defaults to respect step type

### ⚠️ Configuration: MISSING
- No step-type-to-requirements mapping
- **Action:** Create configuration file mapping step types to default UI components

---

## RECOMMENDED FIXES

### Fix 1: UI Component Conditional Rendering (CRITICAL)

**File:** `client/src/components/workflow/step-completion-dialog.tsx`

**Changes:**
1. Add function to determine which UI elements to show:
   ```typescript
   const shouldShowPhotos = (): boolean => {
     if (step.evidenceRequirements) {
       return step.evidenceRequirements.some(r => r.type === 'photo');
     }
     // Check step type
     return ['photo', 'observation', 'documentation'].includes(step.stepType);
   };
   
   const shouldShowDamageSeverity = (): boolean => {
     // Only show for damage-related steps
     return ['photo', 'observation'].includes(step.stepType) && 
            step.tags?.some(t => t.includes('damage'));
   };
   
   const shouldShowNotes = (): boolean => {
     if (step.evidenceRequirements) {
       return step.evidenceRequirements.some(r => r.type === 'note');
     }
     // Most steps need notes, but not all
     return step.stepType !== 'equipment';
   };
   ```

2. Conditionally render sections:
   ```typescript
   {shouldShowPhotos() && (
     <div className="space-y-2">
       {/* Photo capture */}
     </div>
   )}
   
   {shouldShowDamageSeverity() && (
     <div className="space-y-2">
       {/* Damage severity selector */}
     </div>
   )}
   ```

### Fix 2: Update Default Requirements

**File:** `client/src/components/workflow/step-completion-dialog.tsx`

**Changes:**
```typescript
const getRequiredPhotoCount = (): number => {
  if (step.evidenceRequirements) {
    const photoReq = step.evidenceRequirements.find(r => r.type === 'photo' && r.required);
    if (photoReq?.photo?.minCount) {
      return photoReq.photo.minCount;
    }
    // If evidence requirements exist but no photo requirement, return 0
    return 0;
  }
  // Check step type for default
  if (['photo', 'observation'].includes(step.stepType)) {
    return step.assets?.filter(a => a.required && a.assetType === "photo").length || 1;
  }
  // For other step types, default to 0 unless assets specify
  return step.assets?.filter(a => a.required && a.assetType === "photo").length || 0;
};
```

### Fix 3: Enhance AI Prompt

**File:** `server/services/inspectionWorkflowService.ts` (line 2488)

**Add to prompt:**
```
IMPORTANT: Evidence requirements MUST vary by step type:
- interview steps: NO photos required unless specifically needed (e.g., ID verification)
- documentation steps: Notes required, photos optional
- photo steps: Photos required, damage severity if damage-related
- observation steps: Notes required, photos if visual evidence needed
- measurement steps: Measurement value required, photos optional
- safety_check steps: Checklist items, photos if hazards visible
- equipment steps: Equipment list, NO photos unless equipment damage
- checklist steps: Checklist completion, notes optional

Do NOT add photo requirements to steps that don't need visual evidence.
Do NOT add damage severity to steps unrelated to damage assessment.
```

### Fix 4: Create Step Type Configuration

**New File:** `server/config/stepTypeRequirements.ts`

```typescript
export const STEP_TYPE_DEFAULTS: Record<InspectionStepType, {
  defaultPhotoRequired: boolean;
  defaultNotesRequired: boolean;
  showDamageSeverity: boolean;
  showMeasurement: boolean;
}> = {
  photo: { defaultPhotoRequired: true, defaultNotesRequired: true, showDamageSeverity: true, showMeasurement: false },
  measurement: { defaultPhotoRequired: false, defaultNotesRequired: true, showDamageSeverity: false, showMeasurement: true },
  checklist: { defaultPhotoRequired: false, defaultNotesRequired: false, showDamageSeverity: false, showMeasurement: false },
  observation: { defaultPhotoRequired: true, defaultNotesRequired: true, showDamageSeverity: true, showMeasurement: false },
  documentation: { defaultPhotoRequired: false, defaultNotesRequired: true, showDamageSeverity: false, showMeasurement: false },
  safety_check: { defaultPhotoRequired: false, defaultNotesRequired: true, showDamageSeverity: false, showMeasurement: false },
  equipment: { defaultPhotoRequired: false, defaultNotesRequired: false, showDamageSeverity: false, showMeasurement: false },
  interview: { defaultPhotoRequired: false, defaultNotesRequired: true, showDamageSeverity: false, showMeasurement: false },
};
```

---

## CONCLUSION

**Primary Root Cause:** UI component (`StepCompletionDialog`) renders uniform template for all steps, ignoring `step.stepType` and `evidence_requirements`.

**Fix Priority:**
1. **CRITICAL:** Update UI component to conditionally render based on step type
2. **HIGH:** Update default requirements logic
3. **MEDIUM:** Enhance AI prompt to guide differentiation
4. **LOW:** Create step type configuration file

**Answer to Question:** This is primarily a **UI fix** (80%) with supporting **prompt engineering improvements** (20%). The data model is adequate and doesn't need changes.
