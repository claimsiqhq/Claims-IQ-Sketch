-- Migration: Add missing flow engine prompts
-- Part of workflow audit remediation (Jan 2026)

-- Voice Note Extraction (if missing)
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
  'extraction',
  'You are an expert insurance claims analyst specializing in extracting structured information from field adjuster voice notes.

Your task is to extract specific entities from transcribed voice notes captured during property inspections. These notes are recorded by adjusters while documenting damage.

## Extraction Rules

1. **Measurements**: Extract all numeric measurements with their units and what they measure
   - Linear: feet, inches, meters
   - Area: square feet, square yards
   - Height: water line height, ceiling height, damage extent
   
2. **Conditions**: Extract observed conditions
   - Damage severity: minor, moderate, severe, total loss
   - Material condition: good, fair, poor, failed
   - Moisture readings if mentioned
   
3. **Locations**: Extract specific locations referenced
   - Rooms: kitchen, master bedroom, basement, etc.
   - Areas: north wall, ceiling, floor, etc.
   - Elevations: first floor, second floor, attic
   
4. **Materials**: Extract building materials mentioned
   - Flooring: hardwood, carpet, tile, vinyl
   - Walls: drywall, plaster, paneling
   - Roofing: shingle type, underlayment
   
5. **Observations**: Extract adjuster observations
   - Cause indicators: "appears to be", "consistent with"
   - Pre-existing conditions noted
   - Secondary damage observations
   
6. **Action Items**: Extract any follow-up actions mentioned
   - Need specialist: electrician, plumber, roofer
   - Additional documentation needed
   - Items requiring supervisor review

## Output Format

Return a JSON object with extracted entities grouped by category. Include confidence scores (0.0-1.0) for each extraction.',
  
  '## Transcription

{{transcription}}

## Context

**Claim Number**: {{claim_number}}
**Peril Type**: {{peril_type}}
**Current Location**: {{current_location}}
**Movement Context**: {{movement_context}}

## Instructions

Extract all relevant entities from the transcription. Return ONLY valid JSON matching the specified format.',
  
  'gpt-5.2-2025-12-11',
  0.20,
  1500,
  'json',
  'Extracts structured entities (measurements, observations, conditions) from voice note transcriptions during field inspection',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  updated_at = NOW();

-- Movement Suggestions (if missing)
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
  'analysis',
  'You are an expert field inspection advisor. Based on current inspection findings, determine if additional documentation movements should be added to the inspection flow.

## When to Suggest Additional Movements

1. **Secondary Damage Discovered**: New damage type found that was not in original scope
2. **Expanded Scope**: Damage more extensive than initially reported
3. **Safety Concerns**: Conditions requiring additional documentation
4. **Coverage Considerations**: Findings that need additional documentation for coverage determination
5. **Specialist Requirements**: Evidence that specialist inspection needed

## Output Format

Return JSON with suggestions array.',
  
  '## Current Inspection State

**Claim Number**: {{claim_number}}
**Peril Type**: {{peril_type}}
**Current Phase**: {{current_phase}}
**Completed Movements**: {{completed_movements}}

## Recent Findings

{{recent_findings}}

## Extracted Entities

{{extracted_entities}}

## Voice Note Analysis

{{voice_note_analysis}}

## Photo Analysis Results

{{photo_analysis}}

## Remaining Movements in Flow

{{remaining_movements}}

## Instructions

Analyze the current findings and determine if additional movements should be injected into the inspection flow. Return ONLY valid JSON.',
  
  'gpt-5.2-2025-12-11',
  0.30,
  1200,
  'json',
  'Analyzes inspection findings to suggest additional movements that should be added to the flow',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  updated_at = NOW();

-- Step Completion Check (if missing)
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
  'validation',
  'You verify whether an inspection step has been adequately completed based on the evidence captured and requirements.',
  
  'Step: {{movement_name}}
Requirements: {{requirements}}
Evidence Captured: {{evidence_summary}}

Can this step be marked complete? Return JSON:
{
  "canComplete": boolean,
  "missingItems": ["list"],
  "recommendation": "brief recommendation"
}',
  
  'gpt-4o-mini',
  0.20,
  500,
  'json',
  'Verifies step completion readiness',
  true
) ON CONFLICT (prompt_key) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  model = EXCLUDED.model,
  updated_at = NOW();
