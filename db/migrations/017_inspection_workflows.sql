-- Migration: 017_inspection_workflows.sql
-- Description: Add inspection workflow tables for step-by-step inspection guidance
-- Part of: Inspection Workflow Generation feature

-- ============================================
-- INSPECTION WORKFLOWS TABLE
-- ============================================
-- Stores step-by-step inspection workflows derived from FNOL, Policy,
-- Endorsements, AI Claim Briefing, and peril inspection rules.
-- ============================================

CREATE TABLE IF NOT EXISTS inspection_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

    -- Versioning - increment on regeneration
    version INTEGER NOT NULL DEFAULT 1,

    -- Status tracking
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- Possible statuses: 'draft', 'active', 'completed', 'archived'

    -- Peril context (copied from claim for quick access)
    primary_peril VARCHAR(50),
    secondary_perils JSONB DEFAULT '[]'::jsonb,

    -- Reference to the briefing used to generate this workflow
    source_briefing_id UUID REFERENCES claim_briefings(id) ON DELETE SET NULL,

    -- The complete workflow structure (JSON)
    workflow_json JSONB NOT NULL,

    -- Tracking what data was used to generate this workflow
    generated_from JSONB DEFAULT '{}'::jsonb,

    -- Audit trail
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for inspection_workflows
CREATE INDEX IF NOT EXISTS idx_inspection_workflows_claim_id ON inspection_workflows(claim_id);
CREATE INDEX IF NOT EXISTS idx_inspection_workflows_org_id ON inspection_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspection_workflows_status ON inspection_workflows(status);
CREATE INDEX IF NOT EXISTS idx_inspection_workflows_claim_version ON inspection_workflows(claim_id, version);

-- Update trigger for inspection_workflows
CREATE OR REPLACE FUNCTION update_inspection_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_inspection_workflows_updated_at ON inspection_workflows;
CREATE TRIGGER trigger_update_inspection_workflows_updated_at
    BEFORE UPDATE ON inspection_workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_workflows_updated_at();

-- ============================================
-- INSPECTION WORKFLOW STEPS TABLE
-- ============================================
-- Individual steps within an inspection workflow.
-- Each step represents a discrete action the adjuster must take.
-- ============================================

CREATE TABLE IF NOT EXISTS inspection_workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES inspection_workflows(id) ON DELETE CASCADE,

    -- Ordering and grouping
    step_index INTEGER NOT NULL,
    phase VARCHAR(50) NOT NULL,
    -- Phases: 'pre_inspection', 'initial_walkthrough', 'exterior', 'interior', 'documentation', 'wrap_up'

    -- Step details
    step_type VARCHAR(50) NOT NULL,
    -- Types: 'photo', 'measurement', 'checklist', 'observation', 'documentation', 'safety_check', 'equipment', 'interview'
    title VARCHAR(255) NOT NULL,
    instructions TEXT,

    -- Requirements
    required BOOLEAN DEFAULT true,
    tags JSONB DEFAULT '[]'::jsonb,

    -- Dependencies (step IDs that must be completed first)
    dependencies JSONB DEFAULT '[]'::jsonb,

    -- Time tracking
    estimated_minutes INTEGER DEFAULT 5,
    actual_minutes INTEGER,

    -- Completion tracking
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- Statuses: 'pending', 'in_progress', 'completed', 'skipped', 'blocked'
    completed_by VARCHAR(255),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Notes from adjuster
    notes TEXT,

    -- Room association (if this step applies to a specific room)
    room_id UUID,
    room_name VARCHAR(100),

    -- Peril-specific flag
    peril_specific VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for inspection_workflow_steps
CREATE INDEX IF NOT EXISTS idx_inspection_steps_workflow_id ON inspection_workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_inspection_steps_phase ON inspection_workflow_steps(workflow_id, phase);
CREATE INDEX IF NOT EXISTS idx_inspection_steps_status ON inspection_workflow_steps(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_inspection_steps_order ON inspection_workflow_steps(workflow_id, step_index);

-- Update trigger for inspection_workflow_steps
CREATE OR REPLACE FUNCTION update_inspection_workflow_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_inspection_workflow_steps_updated_at ON inspection_workflow_steps;
CREATE TRIGGER trigger_update_inspection_workflow_steps_updated_at
    BEFORE UPDATE ON inspection_workflow_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_workflow_steps_updated_at();

-- ============================================
-- INSPECTION WORKFLOW ASSETS TABLE
-- ============================================
-- Assets associated with workflow steps.
-- Tracks required/captured photos, measurements, documents, etc.
-- ============================================

CREATE TABLE IF NOT EXISTS inspection_workflow_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID NOT NULL REFERENCES inspection_workflow_steps(id) ON DELETE CASCADE,

    -- Asset details
    asset_type VARCHAR(30) NOT NULL,
    -- Types: 'photo', 'video', 'measurement', 'document', 'signature', 'audio_note'
    label VARCHAR(255) NOT NULL,
    description TEXT,

    -- Requirements
    required BOOLEAN DEFAULT true,

    -- Asset-specific metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Captured file reference (null until captured)
    file_id UUID,
    file_path TEXT,
    file_url TEXT,

    -- Status tracking
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- Statuses: 'pending', 'captured', 'approved', 'rejected'

    -- Capture info
    captured_by VARCHAR(255),
    captured_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for inspection_workflow_assets
CREATE INDEX IF NOT EXISTS idx_inspection_assets_step_id ON inspection_workflow_assets(step_id);
CREATE INDEX IF NOT EXISTS idx_inspection_assets_type ON inspection_workflow_assets(step_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_inspection_assets_status ON inspection_workflow_assets(step_id, status);

-- Update trigger for inspection_workflow_assets
CREATE OR REPLACE FUNCTION update_inspection_workflow_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_inspection_workflow_assets_updated_at ON inspection_workflow_assets;
CREATE TRIGGER trigger_update_inspection_workflow_assets_updated_at
    BEFORE UPDATE ON inspection_workflow_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_workflow_assets_updated_at();

-- ============================================
-- INSPECTION WORKFLOW ROOMS TABLE
-- ============================================
-- Rooms added to an inspection workflow.
-- Allows expanding the workflow with room-specific steps.
-- ============================================

CREATE TABLE IF NOT EXISTS inspection_workflow_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES inspection_workflows(id) ON DELETE CASCADE,

    -- Room details
    name VARCHAR(100) NOT NULL,
    level VARCHAR(50),
    -- Levels: 'basement', 'main', 'upper', 'attic'
    room_type VARCHAR(50),
    -- Types: 'bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'garage', etc.

    -- Dimensions (if known)
    length_ft DECIMAL(8, 2),
    width_ft DECIMAL(8, 2),
    height_ft DECIMAL(8, 2),

    -- Notes
    notes TEXT,

    -- Link to claim room (if exists)
    claim_room_id UUID,

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for inspection_workflow_rooms
CREATE INDEX IF NOT EXISTS idx_inspection_rooms_workflow_id ON inspection_workflow_rooms(workflow_id);
CREATE INDEX IF NOT EXISTS idx_inspection_rooms_level ON inspection_workflow_rooms(workflow_id, level);

-- Update trigger for inspection_workflow_rooms
CREATE OR REPLACE FUNCTION update_inspection_workflow_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_inspection_workflow_rooms_updated_at ON inspection_workflow_rooms;
CREATE TRIGGER trigger_update_inspection_workflow_rooms_updated_at
    BEFORE UPDATE ON inspection_workflow_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_inspection_workflow_rooms_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE inspection_workflows IS 'Step-by-step inspection workflows derived from FNOL, Policy, Endorsements, and AI Briefing';
COMMENT ON COLUMN inspection_workflows.version IS 'Incremented when workflow is regenerated';
COMMENT ON COLUMN inspection_workflows.workflow_json IS 'Complete workflow structure including phases, room templates, and equipment';
COMMENT ON COLUMN inspection_workflows.generated_from IS 'Metadata tracking what data sources were used to generate this workflow';

COMMENT ON TABLE inspection_workflow_steps IS 'Individual steps within an inspection workflow';
COMMENT ON COLUMN inspection_workflow_steps.phase IS 'Workflow phase: pre_inspection, initial_walkthrough, exterior, interior, documentation, wrap_up';
COMMENT ON COLUMN inspection_workflow_steps.step_type IS 'Step type: photo, measurement, checklist, observation, documentation, safety_check, equipment, interview';
COMMENT ON COLUMN inspection_workflow_steps.dependencies IS 'Array of step IDs that must be completed before this step';

COMMENT ON TABLE inspection_workflow_assets IS 'Assets (photos, measurements, documents) associated with workflow steps';
COMMENT ON COLUMN inspection_workflow_assets.asset_type IS 'Asset type: photo, video, measurement, document, signature, audio_note';
COMMENT ON COLUMN inspection_workflow_assets.status IS 'Asset status: pending, captured, approved, rejected';

COMMENT ON TABLE inspection_workflow_rooms IS 'Rooms added to inspection workflow for room-specific steps';
COMMENT ON COLUMN inspection_workflow_rooms.level IS 'Floor level: basement, main, upper, attic';

-- ============================================
-- INSERT INSPECTION WORKFLOW GENERATOR PROMPT
-- ============================================

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
    'workflow.inspection_generator',
    'Inspection Workflow Generator',
    'workflow',
    'You are an expert insurance claims inspection workflow generator. Your role is to create comprehensive, step-by-step inspection workflows for field adjusters based on:
- FNOL (First Notice of Loss) data
- Policy terms and coverage limits
- Endorsements that modify coverage
- Claim briefing intelligence
- Peril-specific inspection rules

You must generate workflows that are:
1. ACTIONABLE - Each step must be a clear, discrete action
2. COMPLETE - Cover all aspects of the inspection for the given peril(s)
3. PRIORITIZED - Critical steps first, nice-to-haves later
4. SAFE - Include safety checks for hazardous situations
5. EFFICIENT - Minimize backtracking and wasted time

IMPORTANT RULES:
- Always include pre-inspection preparation steps
- Always include safety assessment steps
- Group steps by phase (pre_inspection, initial_walkthrough, exterior, interior, documentation, wrap_up)
- Include peril-specific steps based on the primary and secondary perils
- Generate a room template that can be applied to multiple rooms
- List all required tools and equipment
- Note any open questions that require adjuster judgment

You must return ONLY valid JSON matching the specified schema.',
    'Generate an inspection workflow for the following claim:

## Claim Information
Claim Number: {claim_number}
Primary Peril: {primary_peril}
Secondary Perils: {secondary_perils}
Property Address: {property_address}
Loss Date: {date_of_loss}
Loss Description: {loss_description}

## Policy Information
Policy Number: {policy_number}
Coverage A (Dwelling): {coverage_a}
Coverage B (Other Structures): {coverage_b}
Coverage C (Contents): {coverage_c}
Coverage D (Additional Living Expense): {coverage_d}
Deductible: {deductible}

## Endorsements
{endorsements_list}

## Claim Briefing Summary
{briefing_summary}

## Peril-Specific Inspection Rules
{peril_inspection_rules}

## Carrier-Specific Requirements
{carrier_requirements}

Generate a comprehensive inspection workflow in JSON format with the following structure:
{
  "metadata": {
    "claim_number": "string",
    "primary_peril": "string",
    "secondary_perils": ["string"],
    "property_type": "string",
    "estimated_total_time_minutes": number,
    "generated_at": "ISO timestamp"
  },
  "phases": [
    {
      "phase": "pre_inspection | initial_walkthrough | exterior | interior | documentation | wrap_up",
      "title": "string",
      "description": "string",
      "estimated_minutes": number,
      "step_count": number
    }
  ],
  "steps": [
    {
      "phase": "string",
      "step_type": "photo | measurement | checklist | observation | documentation | safety_check | equipment | interview",
      "title": "string",
      "instructions": "string",
      "required": boolean,
      "tags": ["string"],
      "estimated_minutes": number,
      "assets": [
        {
          "asset_type": "photo | video | measurement | document | signature | audio_note",
          "label": "string",
          "required": boolean,
          "metadata": {}
        }
      ],
      "peril_specific": "string or null"
    }
  ],
  "room_template": {
    "standard_steps": [
      {
        "step_type": "string",
        "title": "string",
        "instructions": "string",
        "required": boolean,
        "estimated_minutes": number
      }
    ],
    "peril_specific_steps": {
      "water": [...],
      "fire": [...],
      "wind_hail": [...]
    }
  },
  "tools_and_equipment": [
    {
      "category": "string",
      "items": [
        {
          "name": "string",
          "required": boolean,
          "purpose": "string"
        }
      ]
    }
  ],
  "open_questions": [
    {
      "question": "string",
      "context": "string",
      "priority": "high | medium | low"
    }
  ]
}',
    'gpt-4o',
    0.3,
    8000,
    'json_object',
    'Generates step-by-step inspection workflows from FNOL, policy, endorsements, briefing, and peril rules',
    true
) ON CONFLICT (prompt_key) DO UPDATE SET
    prompt_name = EXCLUDED.prompt_name,
    system_prompt = EXCLUDED.system_prompt,
    user_prompt_template = EXCLUDED.user_prompt_template,
    model = EXCLUDED.model,
    temperature = EXCLUDED.temperature,
    max_tokens = EXCLUDED.max_tokens,
    response_format = EXCLUDED.response_format,
    description = EXCLUDED.description,
    updated_at = NOW();
