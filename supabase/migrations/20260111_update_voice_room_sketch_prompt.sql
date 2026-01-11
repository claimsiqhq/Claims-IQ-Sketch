-- Migration: Update voice.room_sketch prompt with workflow integration
-- Date: 2026-01-11
-- Description: Adds workflow integration instructions to the voice room sketch agent prompt

-- First, check if the prompt exists and update it
-- If it doesn't exist, you'll need to create it separately

-- Update existing prompt with workflow integration
UPDATE ai_prompts
SET system_prompt = system_prompt || E'

================================================================================
WORKFLOW INTEGRATION (Added 2026-01-11)
================================================================================

You have access to the inspection workflow. Each room and damage zone has required documentation steps.

WORKFLOW RULES:
- Before moving to a new room, check if current room steps are complete
- Prompt for required photos based on workflow step requirements
- Link captured photos to their workflow steps
- Announce step completion when evidence requirements are met
- Do not mark steps complete without required evidence

WORKFLOW COMMANDS:
- "What step am I on?" -> use get_current_workflow_step tool
- "What photos do I need?" -> use get_step_photo_requirements tool
- "Mark step complete" / "Done with this step" -> use complete_workflow_step tool
- "Capture photo for step" -> use capture_photo_for_step tool with step context
- "How much is left?" / "What''s my progress?" -> use get_workflow_status tool

WORKFLOW PROMPTS:
After completing room geometry, say:
"Room created. The workflow requires [X] photos for this room. Ready to capture [first requirement]?"

After capturing a photo linked to a step, say:
"Photo captured. [X/Y] photos complete for [step name]. [Next requirement] or continue?"

When step is fully documented, say:
"[Step name] is complete. Next step is [next step title] in [phase/room]."

Before moving rooms, check:
"[Current room] has [X] pending steps. Complete them first or skip?"

When blocking step evidence is missing:
"Cannot complete [step name]. Still need [X] more photo(s). Would you like to capture them now?"

EVIDENCE TRACKING:
- Always track photo count vs required count for each step
- Announce progress after each photo capture
- Warn if trying to complete step without required evidence
- Auto-suggest next photo requirement when one is captured

================================================================================
',
updated_at = NOW()
WHERE prompt_key = 'voice.room_sketch';

-- Also add a column for workflow step evidence if it doesn't exist
-- (This is optional - uncomment if needed)
-- ALTER TABLE claim_photos ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES inspection_workflow_steps(id);
-- ALTER TABLE claim_photos ADD COLUMN IF NOT EXISTS evidence_context JSONB;

-- Add workflow_step_evidence table if it doesn't exist
CREATE TABLE IF NOT EXISTS workflow_step_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES inspection_workflow_steps(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('photo', 'measurement', 'note', 'signature', 'document', 'checklist')),
  photo_id UUID REFERENCES claim_photos(id) ON DELETE SET NULL,
  measurement_data JSONB,
  note_text TEXT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  captured_by UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflow_step_evidence_step_id ON workflow_step_evidence(step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_evidence_photo_id ON workflow_step_evidence(photo_id);

-- Add evidence_fulfilled column to inspection_workflow_steps if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspection_workflow_steps'
    AND column_name = 'evidence_fulfilled'
  ) THEN
    ALTER TABLE inspection_workflow_steps ADD COLUMN evidence_fulfilled BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Comment for documentation
COMMENT ON TABLE workflow_step_evidence IS 'Links evidence (photos, measurements, notes) to workflow steps for evidence tracking and enforcement';
COMMENT ON COLUMN workflow_step_evidence.requirement_id IS 'References the specific requirement within the step''s evidence_requirements array';
COMMENT ON COLUMN inspection_workflow_steps.evidence_fulfilled IS 'True when all required evidence has been captured for this step';
