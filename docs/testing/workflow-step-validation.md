# Workflow Step Type Validation Scenarios

## Prerequisites
- All existing workflows have been cleared/regenerated
- New step type configuration is in place
- Database prompts have been updated
- Migration `046_clear_legacy_workflows.sql` has been run
- Migration `047_update_workflow_generator_step_type_guidance.sql` has been run
- Migration `048_update_voice_room_sketch_photo_requirements.sql` has been run

## Test Scenarios

### 1. Interview Step Rendering
**Setup:** Generate workflow for any claim
**Find:** A step with `step_type: "interview"` (e.g., "Meet with Insured")
**Open:** Step completion dialog

**Expected:**
- [ ] Notes field is visible
- [ ] Photo capture section is NOT visible
- [ ] Damage severity selector is NOT visible
- [ ] Can complete step with notes only
- [ ] No "photo required" validation error

### 2. Documentation Step Rendering
**Setup:** Generate workflow for claim with endorsements
**Find:** A step with `step_type: "documentation"` (e.g., "Review Claim File and Endorsements")
**Open:** Step completion dialog

**Expected:**
- [ ] Checklist/acknowledgment UI is visible
- [ ] Photo capture section is NOT visible
- [ ] Damage severity selector is NOT visible
- [ ] Can complete with acknowledgment only

### 3. Photo Step WITH Damage Tags
**Setup:** Generate workflow for hail/wind claim
**Find:** A step with `step_type: "photo"` AND tags including "damage"
**Open:** Step completion dialog

**Expected:**
- [ ] Photo capture section IS visible
- [ ] Shows min_count requirement (e.g., "1 more needed")
- [ ] Notes field IS visible
- [ ] Damage severity selector IS visible
- [ ] Cannot complete without required photos

### 4. Photo Step WITHOUT Damage Tags
**Setup:** Generate workflow
**Find:** A step with `step_type: "photo"` without damage tags (e.g., "Property Overview")
**Open:** Step completion dialog

**Expected:**
- [ ] Photo capture section IS visible
- [ ] Notes field IS visible
- [ ] Damage severity selector is NOT visible

### 5. Measurement Step
**Setup:** Generate workflow
**Find:** A step with `step_type: "measurement"`
**Open:** Step completion dialog

**Expected:**
- [ ] Measurement input IS visible
- [ ] Notes field IS visible
- [ ] Photo capture is optional (visible but not required)
- [ ] Damage severity selector is NOT visible
- [ ] Cannot complete without measurement value

### 6. Safety Check Step
**Setup:** Generate workflow
**Find:** A step with `step_type: "safety_check"`
**Open:** Step completion dialog

**Expected:**
- [ ] Checklist items ARE visible
- [ ] Notes field IS visible
- [ ] Photo capture is optional
- [ ] Damage severity selector is NOT visible

### 7. Wizard Pre-Population
**Setup:** Create claim with FNOL document containing property details
**Action:** Start workflow wizard

**Expected:**
- [ ] Property type is pre-filled from FNOL
- [ ] Number of stories is pre-filled
- [ ] Roof type is pre-filled (if in FNOL)
- [ ] "From FNOL" indicator shown on pre-filled fields
- [ ] Can override any pre-filled value

### 8. Voice Agent Alignment
**Setup:** Start voice inspection session
**Action:** Navigate to a step with specific photo requirements
**Say:** "What photos do I need?"

**Expected:**
- [ ] Response references workflow step requirements
- [ ] Does NOT cite hardcoded minimums
- [ ] Announces correct min_count from step

### 9. Generated Workflow Structure
**Setup:** Generate new workflow
**Action:** Inspect raw workflow JSON (API or database)

**Expected:**
- [ ] Interview steps have `required_evidence.photos.required: false` OR no photo requirement
- [ ] Documentation steps have `required_evidence.photos.required: false` OR no photo requirement
- [ ] Photo steps have `required_evidence.photos.min_count >= 1`
- [ ] Damage-related steps have appropriate tags
- [ ] Steps use `required_evidence` array format (NOT legacy `assets`)

### 10. End-to-End Flow
**Setup:** Fresh claim with FNOL, policy, endorsements uploaded
**Action:** 
1. View briefing
2. Start workflow wizard
3. Complete wizard
4. Generate workflow
5. Open first few steps

**Expected:**
- [ ] Briefing shows inspection strategy
- [ ] Wizard is pre-populated where data exists
- [ ] Generated workflow has varied step types
- [ ] Each step type renders with appropriate UI

### 11. Briefing Photo Requirements Integration
**Setup:** Generate briefing with photo requirements
**Action:** Generate workflow after briefing exists

**Expected:**
- [ ] Workflow includes photo steps matching briefing photo requirements
- [ ] Photo step min_count matches briefing category requirements
- [ ] Angles array populated based on briefing descriptions

### 12. Endorsement Watchouts Integration
**Setup:** Claim with endorsements that have inspection implications
**Action:** Generate workflow

**Expected:**
- [ ] Workflow includes steps derived from endorsement inspection implications
- [ ] Endorsement-specific steps are clearly labeled
- [ ] Steps reflect endorsement requirements accurately

### 13. Inspection Strategy Influence
**Setup:** Briefing with inspection strategy "where_to_start"
**Action:** Generate workflow

**Expected:**
- [ ] Workflow step order reflects briefing "where_to_start" guidance
- [ ] Priority areas from briefing appear early in workflow
- [ ] Common misses from briefing are addressed in workflow steps

### 14. Legacy Format Cleanup
**Setup:** After running migration 046
**Action:** Check database

**Expected:**
- [ ] No workflows exist with legacy `assets` format
- [ ] All new workflows use `required_evidence` format
- [ ] No `inspection_workflow_assets` table records exist

### 15. Step Type Configuration Defaults
**Setup:** Generate workflow with step that has no explicit evidence requirements
**Action:** Open step completion dialog

**Expected:**
- [ ] Step uses step type config defaults
- [ ] UI renders according to step type (not uniform template)
- [ ] Validation respects step type capabilities

## Validation Checklist

After running all scenarios, verify:

- [ ] All step types render differently
- [ ] No hardcoded photo requirements on interview/documentation steps
- [ ] Wizard pre-population works
- [ ] Voice agent uses workflow requirements
- [ ] Briefing data influences workflow generation
- [ ] No legacy format support remains
- [ ] Database prompts updated correctly
