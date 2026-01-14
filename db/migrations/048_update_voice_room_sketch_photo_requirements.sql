-- Migration: Update Voice Room Sketch Prompt - Remove Hardcoded Photo Requirements
-- Date: 2026-01-13
-- Purpose: Replace hardcoded photo minimums with workflow-driven requirements
--          Voice agent must read from workflow step requirements, not use defaults

-- Find and replace the MINIMUM PHOTO REQUIREMENTS section (if it exists)
-- Update WORKFLOW INTEGRATION section to emphasize workflow-driven requirements

UPDATE ai_prompts
SET
  system_prompt = REPLACE(
    system_prompt,
    E'MINIMUM PHOTO REQUIREMENTS:\n- Room overview: 1 photo (wide shot from doorway)\n- Damage detail: 2 photos (context + close-up)\n- Per room minimum: 3 photos',
    E'PHOTO REQUIREMENTS:

Photo requirements come from the active workflow step. DO NOT use hardcoded minimums.

WORKFLOW-DRIVEN PHOTO CAPTURE:
1. Call get_current_workflow_step to get current step''s required_evidence
2. Check required_evidence.photos.min_count and required_evidence.photos.count
3. Announce requirements: "This step needs [min_count] photos minimum, [count] recommended."
4. Track progress: "[X] of [min_count] captured."

FALLBACK GUIDANCE (only when workflow step has no photo requirements):
- Room overview: 1 photo (wide shot from doorway)
- Damage detail: 2 photos (context + close-up)

FRAMING GUIDANCE BY STEP TYPE:
- photo steps: Follow angles array if specified (wide, close, detail)
- observation steps: Capture what you''re observing, include context
- measurement steps: Include measuring reference in frame if capturing

NEVER override workflow step requirements with hardcoded values.
When step says photos.required: false, do NOT prompt for photos.'
  )
WHERE prompt_key = 'voice.room_sketch'
  AND system_prompt LIKE '%MINIMUM PHOTO%';

-- Also update the WORKFLOW INTEGRATION section to emphasize workflow requirements are authoritative
UPDATE ai_prompts
SET
  system_prompt = REPLACE(
    system_prompt,
    E'## EVIDENCE ENFORCEMENT RULES (STRICTLY ENFORCED)',
    E'## PHOTO REQUIREMENTS - WORKFLOW-DRIVEN (CRITICAL)

Photo requirements come from the active workflow step. DO NOT use hardcoded minimums.

WORKFLOW-DRIVEN PHOTO CAPTURE:
1. Call get_current_workflow_step to get current step''s required_evidence
2. Check required_evidence.photos.min_count and required_evidence.photos.count
3. Announce requirements: "This step needs [min_count] photos minimum, [count] recommended."
4. Track progress: "[X] of [min_count] captured."

FALLBACK GUIDANCE (only when workflow step has no photo requirements):
- Room overview: 1 photo (wide shot from doorway)
- Damage detail: 2 photos (context + close-up)

FRAMING GUIDANCE BY STEP TYPE:
- photo steps: Follow angles array if specified (wide, close, detail)
- observation steps: Capture what you''re observing, include context
- measurement steps: Include measuring reference in frame if capturing

NEVER override workflow step requirements with hardcoded values.
When step says photos.required: false, do NOT prompt for photos.

## EVIDENCE ENFORCEMENT RULES (STRICTLY ENFORCED)'
  )
WHERE prompt_key = 'voice.room_sketch'
  AND system_prompt LIKE '%EVIDENCE ENFORCEMENT RULES%';

-- If no existing section found, append the photo requirements guidance
UPDATE ai_prompts
SET
  system_prompt = system_prompt || E'

================================================================================
PHOTO REQUIREMENTS - WORKFLOW-DRIVEN (CRITICAL)
================================================================================

Photo requirements come from the active workflow step. DO NOT use hardcoded minimums.

WORKFLOW-DRIVEN PHOTO CAPTURE:
1. Call get_current_workflow_step to get current step''s required_evidence
2. Check required_evidence.photos.min_count and required_evidence.photos.count
3. Announce requirements: "This step needs [min_count] photos minimum, [count] recommended."
4. Track progress: "[X] of [min_count] captured."

FALLBACK GUIDANCE (only when workflow step has no photo requirements):
- Room overview: 1 photo (wide shot from doorway)
- Damage detail: 2 photos (context + close-up)

FRAMING GUIDANCE BY STEP TYPE:
- photo steps: Follow angles array if specified (wide, close, detail)
- observation steps: Capture what you''re observing, include context
- measurement steps: Include measuring reference in frame if capturing

NEVER override workflow step requirements with hardcoded values.
When step says photos.required: false, do NOT prompt for photos.

WORKFLOW INTEGRATION RULES:
- Workflow step requirements are authoritative
- Voice agent reads from workflow, doesn''t define requirements
- Step completion depends on meeting workflow evidence requirements
- If workflow step has no photo requirements, use fallback guidance only
',
  updated_at = NOW()
WHERE prompt_key = 'voice.room_sketch'
  AND system_prompt NOT LIKE '%WORKFLOW-DRIVEN PHOTO CAPTURE%';
