-- Migration: 055_flow_engine_audit_remediation.sql
-- Description: Adds columns and prompts to address flow engine audit findings
-- Part of: Claims IQ Workflow Engine Audit Remediation (Jan 2026)

-- ============================================================================
-- 1. Schema Fixes for movement_completions table
-- ============================================================================

-- Add skipped_required column to track when required steps are skipped
ALTER TABLE movement_completions
ADD COLUMN IF NOT EXISTS skipped_required BOOLEAN DEFAULT false;

-- Add evidence validation columns
ALTER TABLE movement_completions
ADD COLUMN IF NOT EXISTS evidence_validated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS evidence_validation_result JSONB;

-- Ensure movement_phase column exists (may already exist from earlier migrations)
ALTER TABLE movement_completions
ADD COLUMN IF NOT EXISTS movement_phase VARCHAR(100);

-- Add index for finding skipped required steps
CREATE INDEX IF NOT EXISTS idx_movement_completions_skipped_required
ON movement_completions(flow_instance_id, skipped_required)
WHERE skipped_required = true;

-- Add index for phase queries
CREATE INDEX IF NOT EXISTS idx_movement_completions_phase
ON movement_completions(flow_instance_id, movement_phase);

-- ============================================================================
-- 2. AI Prompts for Flow Engine
-- ============================================================================

-- Evidence Validation Prompt (P2 - AI evidence quality validation)
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.evidence_validation',
  'Evidence Quality Validation',
  'flow',
  'You are an AI assistant that validates insurance claim evidence quality for field adjusters. Your job is to ensure captured evidence meets documentation standards before a step can be marked complete.

Evaluate evidence based on:
1. Completeness - Are all required evidence types present?
2. Relevance - Does the evidence match what was requested?
3. Quality - Is the evidence clear and usable? (photos not blurry, audio audible, measurements reasonable)
4. Coverage - Does the evidence adequately document the subject?

Be helpful but firm. If evidence is insufficient, explain specifically what is missing or needs improvement.',

  'Movement: {{movement_name}}
Phase: {{phase_name}}
Claim Type: {{peril_type}}

Required Evidence:
{{requirements}}

Captured Evidence:
{{captured}}

Evaluate this evidence and respond with JSON:
{
  "isValid": boolean,
  "confidence": 0.0-1.0,
  "missingItems": ["list of missing required items"],
  "qualityIssues": ["list of quality concerns"],
  "suggestions": ["helpful suggestions for adjuster"],
  "canProceed": boolean,
  "reason": "brief explanation"
}',

  'gpt-4o',
  0.3,
  1000,
  'json',
  'Validates captured evidence against movement requirements with AI quality assessment',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Voice Note Extraction Prompt
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.voice_note_extraction',
  'Voice Note Entity Extraction',
  'flow',
  'You are an assistant that extracts structured information from voice notes recorded during insurance inspections. Extract damage observations, room details, measurements mentioned, and any action items.',

  'Transcription: {{transcription}}

Context:
- Claim Type: {{peril_type}}
- Current Phase: {{phase_name}}
- Current Movement: {{movement_name}}

Extract and return JSON:
{
  "damage_observations": [{"location": "", "damage_type": "", "severity": "", "description": ""}],
  "room_details": {"name": "", "dimensions": "", "features": []},
  "measurements": [{"type": "", "value": "", "unit": "", "location": ""}],
  "action_items": [""],
  "key_phrases": [""]
}',

  'gpt-4o-mini',
  0.2,
  1000,
  'json',
  'Extracts structured data from voice note transcriptions during inspections',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Movement Suggestions Prompt
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.movement_suggestions',
  'Dynamic Movement Suggestions',
  'flow',
  'You are an assistant that suggests additional inspection movements based on findings during a claim inspection. Suggest relevant follow-up steps that would improve documentation quality and claim accuracy.',

  'Current Inspection State:
- Peril: {{peril_type}}
- Phase: {{phase_name}}
- Completed Movements: {{completed_movements}}
- Recent Findings: {{recent_findings}}

Suggest 0-3 additional movements that would be valuable. Return JSON:
{
  "suggestions": [
    {
      "name": "Movement name",
      "reason": "Why this is recommended",
      "priority": "high|medium|low",
      "evidence_needed": ["photo", "measurement", "voice_note"]
    }
  ]
}',

  'gpt-4o',
  0.4,
  800,
  'json',
  'Suggests additional inspection movements based on findings and context',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Step Completion Check Prompt
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.step_completion_check',
  'Step Completion Verification',
  'flow',
  'You verify whether an inspection step has been adequately completed based on the evidence captured and requirements. Be thorough but practical - field conditions may limit ideal documentation.',

  'Step: {{movement_name}}
Requirements: {{requirements}}
Evidence Captured: {{evidence_summary}}

Can this step be marked complete? Return JSON:
{
  "canComplete": boolean,
  "missingItems": ["list of missing items"],
  "recommendation": "brief recommendation"
}',

  'gpt-4o-mini',
  0.2,
  500,
  'json',
  'Verifies step completion readiness based on evidence and requirements',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Movement Guidance TTS Prompt (if missing)
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.movement_guidance_tts',
  'Movement Guidance for TTS',
  'flow',
  'You generate concise, clear voice guidance for field adjusters performing inspection movements. Keep instructions actionable and under 30 seconds when read aloud.',

  'Movement: {{movement_title}}
Type: {{movement_type}}
Phase: {{phase}}
Peril Type: {{peril_type}}
Property Type: {{property_type}}

Base Instruction: {{base_instruction}}
Tips: {{tips}}
Safety Warnings: {{safety_warnings}}
Evidence Needed: {{evidence_summary}}

Generate a natural, spoken guidance script (2-3 sentences max) that tells the adjuster what to do now.',

  'gpt-4o-mini',
  0.5,
  300,
  'text',
  'Generates TTS-optimized guidance for inspection movements',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Room Expansion Prompt
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.room_expansion',
  'Room-Specific Movement Generation',
  'flow',
  'You generate room-specific inspection movements based on the room type and claim context. Each room may need different documentation based on its characteristics.',

  'Room Name: {{room_name}}
Room Type: {{room_type}}
Peril Type: {{peril_type}}
Existing Damage Observations: {{observations}}

Generate inspection movements for this room. Return JSON:
{
  "movements": [
    {
      "name": "Movement name",
      "description": "What to document",
      "evidence_requirements": [
        {"type": "photo|measurement|voice_note", "description": "what to capture", "is_required": true}
      ],
      "criticality": "high|medium|low"
    }
  ]
}',

  'gpt-4o',
  0.4,
  1000,
  'json',
  'Generates room-specific inspection movements based on room characteristics',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- Gate Evaluation Prompt
INSERT INTO ai_prompts (
  prompt_key,
  prompt_name,
  category,
  system_prompt,
  user_prompt_template,
  model,
  temperature,
  max_tokens,
  response_format,
  description,
  is_active
) VALUES (
  'flow.gate_evaluation',
  'Phase Gate Evaluation',
  'flow',
  'You evaluate whether a phase gate should be passed based on the completed movements and evidence. Consider quality, completeness, and any blockers.',

  'Gate: {{gate_name}}
From Phase: {{from_phase}}
To Phase: {{to_phase}}
Evaluation Criteria: {{criteria}}

Completed Movements: {{completed_movements}}
Evidence Summary: {{evidence_summary}}

Should this gate pass? Return JSON:
{
  "passed": boolean,
  "reason": "explanation",
  "blockers": ["list of blocking issues"],
  "warnings": ["list of non-blocking concerns"]
}',

  'gpt-4o',
  0.3,
  600,
  'json',
  'Evaluates phase gates for transition approval',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- 3. Verification query to confirm prompts exist
-- ============================================================================

-- This is for verification only (won't affect data)
-- SELECT prompt_key, is_active
-- FROM ai_prompts
-- WHERE prompt_key IN (
--   'flow.voice_note_extraction',
--   'flow.evidence_validation',
--   'flow.movement_suggestions',
--   'flow.step_completion_check',
--   'flow.movement_guidance_tts',
--   'flow.room_expansion',
--   'flow.gate_evaluation'
-- )
-- ORDER BY prompt_key;
