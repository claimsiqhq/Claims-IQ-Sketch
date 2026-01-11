-- Migration 038: Dynamic Workflow Evidence Schema
--
-- Adds support for rule-driven workflows with evidence enforcement:
-- - Step conditions (rules that determine when steps appear)
-- - Evidence requirements (photos, measurements, notes with specifications)
-- - Blocking vs advisory behavior
-- - Geometry binding (room/wall/zone references)
-- - Photo-step binding (link photos to workflow steps)

-- ============================================
-- UPDATE inspection_workflow_steps TABLE
-- ============================================

-- Add rule-driven workflow fields
ALTER TABLE inspection_workflow_steps
ADD COLUMN IF NOT EXISTS origin VARCHAR(30) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS source_rule_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS evidence_requirements JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS blocking VARCHAR(20) DEFAULT 'advisory',
ADD COLUMN IF NOT EXISTS blocking_condition JSONB,
ADD COLUMN IF NOT EXISTS geometry_binding JSONB,
ADD COLUMN IF NOT EXISTS endorsement_source VARCHAR(100);

-- Add comments for clarity
COMMENT ON COLUMN inspection_workflow_steps.origin IS 'Source of the step: base_rule, policy_rule, peril_rule, discovery, geometry, manual';
COMMENT ON COLUMN inspection_workflow_steps.source_rule_id IS 'ID of the rule that generated this step';
COMMENT ON COLUMN inspection_workflow_steps.conditions IS 'Conditions that must be true for this step to appear';
COMMENT ON COLUMN inspection_workflow_steps.evidence_requirements IS 'Array of evidence requirements with specifications';
COMMENT ON COLUMN inspection_workflow_steps.blocking IS 'blocking, advisory, or conditional';
COMMENT ON COLUMN inspection_workflow_steps.blocking_condition IS 'Condition for conditional blocking';
COMMENT ON COLUMN inspection_workflow_steps.geometry_binding IS 'Binding to room/wall/zone geometry';
COMMENT ON COLUMN inspection_workflow_steps.endorsement_source IS 'Endorsement form code if policy-driven';

-- ============================================
-- CREATE workflow_step_evidence TABLE
-- ============================================

-- Table to track evidence attached to workflow steps
CREATE TABLE IF NOT EXISTS workflow_step_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES inspection_workflow_steps(id) ON DELETE CASCADE,
  requirement_id VARCHAR(100) NOT NULL,
  evidence_type VARCHAR(30) NOT NULL,

  -- Reference to actual evidence
  photo_id UUID REFERENCES claim_photos(id) ON DELETE SET NULL,
  measurement_data JSONB,
  note_data JSONB,

  -- Validation status
  validated BOOLEAN DEFAULT FALSE,
  validation_errors JSONB DEFAULT '[]',

  -- Capture info
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  captured_by VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_step_evidence_step ON workflow_step_evidence(step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_evidence_photo ON workflow_step_evidence(photo_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_evidence_type ON workflow_step_evidence(evidence_type);

COMMENT ON TABLE workflow_step_evidence IS 'Links evidence (photos, measurements, notes) to workflow steps';

-- ============================================
-- UPDATE inspection_workflow_assets TABLE
-- ============================================

-- Add photo requirements specification
ALTER TABLE inspection_workflow_assets
ADD COLUMN IF NOT EXISTS photo_requirements JSONB,
ADD COLUMN IF NOT EXISTS measurement_requirements JSONB,
ADD COLUMN IF NOT EXISTS note_requirements JSONB,
ADD COLUMN IF NOT EXISTS geometry_binding JSONB;

COMMENT ON COLUMN inspection_workflow_assets.photo_requirements IS 'Photo specifications: minCount, angles, subjects, quality';
COMMENT ON COLUMN inspection_workflow_assets.measurement_requirements IS 'Measurement specifications: type, unit, locations';
COMMENT ON COLUMN inspection_workflow_assets.note_requirements IS 'Note specifications: promptText, structuredFields';
COMMENT ON COLUMN inspection_workflow_assets.geometry_binding IS 'Binding to room/wall/zone';

-- ============================================
-- ADD photo_id to claim_photos for step binding
-- ============================================

ALTER TABLE claim_photos
ADD COLUMN IF NOT EXISTS workflow_step_id UUID REFERENCES inspection_workflow_steps(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS workflow_asset_id UUID REFERENCES inspection_workflow_assets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS evidence_context JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_claim_photos_workflow_step ON claim_photos(workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_claim_photos_workflow_asset ON claim_photos(workflow_asset_id);

COMMENT ON COLUMN claim_photos.workflow_step_id IS 'Link to workflow step this photo fulfills';
COMMENT ON COLUMN claim_photos.workflow_asset_id IS 'Link to specific asset requirement this photo fulfills';
COMMENT ON COLUMN claim_photos.evidence_context IS 'Context about how this photo serves as evidence';

-- ============================================
-- CREATE workflow_mutations TABLE
-- ============================================

-- Track workflow mutations for audit trail
CREATE TABLE IF NOT EXISTS workflow_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES inspection_workflows(id) ON DELETE CASCADE,

  -- Mutation details
  trigger VARCHAR(50) NOT NULL,
  mutation_data JSONB NOT NULL,

  -- Result
  steps_added JSONB DEFAULT '[]',
  steps_removed JSONB DEFAULT '[]',
  steps_modified JSONB DEFAULT '[]',

  -- Audit
  triggered_by VARCHAR(100),
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_mutations_workflow ON workflow_mutations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_mutations_trigger ON workflow_mutations(trigger);

COMMENT ON TABLE workflow_mutations IS 'Audit trail for dynamic workflow changes';

-- ============================================
-- UPDATE inspection_workflows TABLE
-- ============================================

ALTER TABLE inspection_workflows
ADD COLUMN IF NOT EXISTS export_validation JSONB,
ADD COLUMN IF NOT EXISTS evidence_summary JSONB;

COMMENT ON COLUMN inspection_workflows.export_validation IS 'Latest export validation result';
COMMENT ON COLUMN inspection_workflows.evidence_summary IS 'Summary of evidence completion status';

-- ============================================
-- CREATE workflow_rules TABLE
-- ============================================

-- Store configurable workflow rules (for future admin UI)
CREATE TABLE IF NOT EXISTS workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule identification
  rule_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(20) DEFAULT '1.0',

  -- Rule definition
  conditions JSONB NOT NULL,
  step_template JSONB NOT NULL,
  evidence JSONB DEFAULT '[]',
  blocking VARCHAR(20) DEFAULT 'advisory',
  blocking_condition JSONB,
  geometry_scope VARCHAR(30),
  priority INTEGER DEFAULT 50,
  origin VARCHAR(30) DEFAULT 'base_rule',
  source_reference VARCHAR(100),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_org ON workflow_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_active ON workflow_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_origin ON workflow_rules(origin);

COMMENT ON TABLE workflow_rules IS 'Configurable workflow rules for dynamic step generation';

-- ============================================
-- INSERT SYSTEM RULES
-- ============================================

-- Insert base system rules (these are read-only templates)
INSERT INTO workflow_rules (rule_id, name, description, conditions, step_template, evidence, blocking, priority, origin, is_system)
VALUES
  -- Safety check rule
  (
    'base-safety-check',
    'Initial Safety Assessment',
    'Verify property is safe to enter and inspect',
    '{"logic": "and", "conditions": []}'::jsonb,
    '{"phase": "pre_inspection", "stepType": "safety_check", "title": "Property Safety Assessment", "instructions": "Before entering, assess for hazards: structural damage, electrical issues, gas leaks, standing water, mold, or unstable surfaces.", "estimatedMinutes": 5, "tags": ["safety", "required"]}'::jsonb,
    '[{"type": "note", "label": "Safety Assessment Notes", "required": true, "note": {"promptText": "Document any safety hazards or confirm safe to inspect"}}]'::jsonb,
    'blocking',
    1,
    'base_rule',
    true
  ),
  -- Exterior overview rule
  (
    'base-exterior-overview',
    'Exterior Overview Documentation',
    'Capture overview photos of all exterior sides',
    '{"logic": "and", "conditions": []}'::jsonb,
    '{"phase": "exterior", "stepType": "photo", "title": "Exterior Overview Photos", "instructions": "Photograph all four sides of the property from a distance.", "estimatedMinutes": 10, "tags": ["photo", "exterior", "overview"]}'::jsonb,
    '[{"type": "photo", "label": "North Elevation", "required": true, "photo": {"minCount": 1, "angles": ["north"]}}, {"type": "photo", "label": "South Elevation", "required": true, "photo": {"minCount": 1, "angles": ["south"]}}, {"type": "photo", "label": "East Elevation", "required": true, "photo": {"minCount": 1, "angles": ["east"]}}, {"type": "photo", "label": "West Elevation", "required": true, "photo": {"minCount": 1, "angles": ["west"]}}]'::jsonb,
    'blocking',
    10,
    'base_rule',
    true
  ),
  -- Address verification rule
  (
    'base-address-verification',
    'Address Verification',
    'Verify and document the property address',
    '{"logic": "and", "conditions": []}'::jsonb,
    '{"phase": "pre_inspection", "stepType": "photo", "title": "Verify Property Address", "instructions": "Photograph address numbers clearly visible.", "estimatedMinutes": 2, "tags": ["verification", "address"]}'::jsonb,
    '[{"type": "photo", "label": "Address Photo", "required": true, "photo": {"minCount": 1, "subjects": ["address numbers"]}}]'::jsonb,
    'blocking',
    2,
    'base_rule',
    true
  )
ON CONFLICT (rule_id) DO NOTHING;
