-- Migration 048: Flow Engine Tables
-- Creates tables for the new phase-based flow engine system

-- ============================================
-- FLOW DEFINITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS flow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  peril_type VARCHAR(50) NOT NULL,
  property_type VARCHAR(50) NOT NULL DEFAULT 'residential',
  flow_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flow_definitions_org_idx ON flow_definitions(organization_id);
CREATE INDEX IF NOT EXISTS flow_definitions_peril_idx ON flow_definitions(peril_type);
CREATE INDEX IF NOT EXISTS flow_definitions_property_idx ON flow_definitions(property_type);
CREATE INDEX IF NOT EXISTS flow_definitions_active_idx ON flow_definitions(is_active);

COMMENT ON TABLE flow_definitions IS 'Stores JSON-based flow definitions for the flow engine. Each flow defines movements an adjuster performs for a specific peril type.';

-- ============================================
-- CLAIM FLOW INSTANCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS claim_flow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  flow_definition_id UUID NOT NULL REFERENCES flow_definitions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_phase_id VARCHAR(100),
  current_phase_index INTEGER NOT NULL DEFAULT 0,
  completed_movements JSONB NOT NULL DEFAULT '[]'::jsonb,
  dynamic_movements JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS claim_flow_instances_claim_idx ON claim_flow_instances(claim_id);
CREATE INDEX IF NOT EXISTS claim_flow_instances_status_idx ON claim_flow_instances(status);
CREATE INDEX IF NOT EXISTS claim_flow_instances_flow_def_idx ON claim_flow_instances(flow_definition_id);

COMMENT ON TABLE claim_flow_instances IS 'Tracks active flow instances for claims. Each claim can have one active flow at a time.';
COMMENT ON COLUMN claim_flow_instances.status IS 'Flow status: active, paused, completed, cancelled';
COMMENT ON COLUMN claim_flow_instances.current_phase_id IS 'ID of the current phase from flow_json';
COMMENT ON COLUMN claim_flow_instances.current_phase_index IS 'Index of the current phase in flow_json.phases array';
COMMENT ON COLUMN claim_flow_instances.completed_movements IS 'Array of completed movement keys in format ["phaseId:movementId", ...]';
COMMENT ON COLUMN claim_flow_instances.dynamic_movements IS 'Array of dynamically added movements (room-specific, custom)';

-- ============================================
-- MOVEMENT COMPLETIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS movement_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_instance_id UUID NOT NULL REFERENCES claim_flow_instances(id) ON DELETE CASCADE,
  movement_id VARCHAR(200) NOT NULL,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  notes TEXT,
  evidence_data JSONB,
  completed_at TIMESTAMP DEFAULT NOW(),
  completed_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS movement_completions_flow_instance_idx ON movement_completions(flow_instance_id);
CREATE INDEX IF NOT EXISTS movement_completions_movement_idx ON movement_completions(movement_id);
CREATE INDEX IF NOT EXISTS movement_completions_claim_idx ON movement_completions(claim_id);

COMMENT ON TABLE movement_completions IS 'Records when movements are completed with evidence.';
COMMENT ON COLUMN movement_completions.movement_id IS 'Movement key in format "phaseId:movementId"';
COMMENT ON COLUMN movement_completions.status IS 'Completion status: completed, skipped';
COMMENT ON COLUMN movement_completions.evidence_data IS 'JSON with photos, audioId, measurements';

-- ============================================
-- MOVEMENT EVIDENCE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS movement_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_instance_id UUID NOT NULL REFERENCES claim_flow_instances(id) ON DELETE CASCADE,
  movement_id VARCHAR(200) NOT NULL,
  evidence_type VARCHAR(30) NOT NULL,
  reference_id VARCHAR(100),
  evidence_data JSONB,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS movement_evidence_flow_instance_idx ON movement_evidence(flow_instance_id);
CREATE INDEX IF NOT EXISTS movement_evidence_movement_idx ON movement_evidence(movement_id);
CREATE INDEX IF NOT EXISTS movement_evidence_type_idx ON movement_evidence(evidence_type);

COMMENT ON TABLE movement_evidence IS 'Stores evidence attached to movements (photos, audio, measurements).';
COMMENT ON COLUMN movement_evidence.evidence_type IS 'Type of evidence: photo, audio, measurement, note';
COMMENT ON COLUMN movement_evidence.reference_id IS 'ID of the referenced resource (photo ID, audio ID, etc.)';

-- ============================================
-- SEED: WIND/HAIL FLOW DEFINITION
-- ============================================

INSERT INTO flow_definitions (name, description, peril_type, property_type, flow_json, is_active)
VALUES (
  'Wind/Hail Residential Inspection',
  'Standard inspection flow for wind and hail damage claims on residential properties',
  'wind_hail',
  'residential',
  '{
    "schema_version": "1.0",
    "metadata": {
      "name": "Wind/Hail Residential Inspection",
      "description": "Complete inspection workflow for hail and wind damage",
      "estimated_duration_minutes": 90,
      "primary_peril": "wind_hail",
      "secondary_perils": ["water"]
    },
    "phases": [
      {
        "id": "arrival",
        "name": "Arrival & Safety",
        "description": "Initial arrival and safety assessment",
        "sequence_order": 0,
        "movements": [
          {
            "id": "verify_address",
            "name": "Verify Property Address",
            "description": "Confirm you are at the correct property address",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Verify the property address matches the claim",
              "tts_text": "Please verify you are at the correct address",
              "tips": ["Check mailbox", "Confirm with policyholder"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Property exterior with address visible", "is_required": true, "quantity_min": 1, "quantity_max": 3}
            ],
            "estimated_minutes": 2
          },
          {
            "id": "meet_policyholder",
            "name": "Meet Policyholder",
            "description": "Introduce yourself and explain the inspection process",
            "sequence_order": 1,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Meet the policyholder and explain what you will be doing",
              "tts_text": "Introduce yourself and explain the inspection process",
              "tips": ["Be professional", "Explain timeline", "Ask about concerns"]
            },
            "evidence_requirements": [],
            "estimated_minutes": 5
          },
          {
            "id": "safety_assessment",
            "name": "Safety Assessment",
            "description": "Assess the property for any safety hazards",
            "sequence_order": 2,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Check for safety hazards before proceeding",
              "tts_text": "Complete a safety assessment of the property",
              "tips": ["Check for downed power lines", "Look for structural damage", "Identify trip hazards"]
            },
            "evidence_requirements": [
              {"type": "voice_note", "description": "Safety assessment notes", "is_required": false, "quantity_min": 0, "quantity_max": 1}
            ],
            "estimated_minutes": 5
          }
        ]
      },
      {
        "id": "exterior_inspection",
        "name": "Exterior Inspection",
        "description": "Document all exterior damage",
        "sequence_order": 1,
        "movements": [
          {
            "id": "roof_overview",
            "name": "Roof Overview",
            "description": "Document overall roof condition and damage",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Document the roof condition from ground level and up close",
              "tts_text": "Take photos of the roof from multiple angles",
              "tips": ["Get all 4 slopes", "Document hail hits", "Note any missing shingles"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Roof overview photos", "is_required": true, "quantity_min": 4, "quantity_max": 20}
            ],
            "estimated_minutes": 15
          },
          {
            "id": "gutters_downspouts",
            "name": "Gutters & Downspouts",
            "description": "Inspect gutters and downspouts for damage",
            "sequence_order": 1,
            "is_required": true,
            "criticality": "medium",
            "guidance": {
              "instruction": "Document any dents, holes, or detachment in gutters and downspouts",
              "tts_text": "Inspect the gutters and downspouts for hail damage",
              "tips": ["Check for dents", "Look at seams", "Note paint damage"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Gutter damage photos", "is_required": true, "quantity_min": 2, "quantity_max": 10}
            ],
            "estimated_minutes": 10
          },
          {
            "id": "siding_exterior",
            "name": "Siding & Exterior Walls",
            "description": "Document siding damage on all elevations",
            "sequence_order": 2,
            "is_required": true,
            "criticality": "medium",
            "guidance": {
              "instruction": "Check all four sides for siding damage",
              "tts_text": "Document any siding damage on all sides of the home",
              "tips": ["Check for dents", "Note cracks", "Document paint damage"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Siding damage photos", "is_required": true, "quantity_min": 4, "quantity_max": 20}
            ],
            "estimated_minutes": 15
          }
        ]
      },
      {
        "id": "interior_inspection",
        "name": "Interior Inspection",
        "description": "Document any interior damage from water intrusion",
        "sequence_order": 2,
        "movements": [
          {
            "id": "ceiling_walls",
            "name": "Ceiling & Wall Damage",
            "description": "Check for water stains, cracks, or other damage",
            "sequence_order": 0,
            "is_required": false,
            "criticality": "medium",
            "guidance": {
              "instruction": "Look for water stains, cracks, or bubbling on ceilings and walls",
              "tts_text": "Document any interior ceiling or wall damage",
              "tips": ["Check under attic access", "Look for water trails", "Note any mold"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Interior damage photos", "is_required": false, "quantity_min": 0, "quantity_max": 20}
            ],
            "estimated_minutes": 10
          }
        ]
      },
      {
        "id": "wrap_up",
        "name": "Wrap Up",
        "description": "Complete inspection and discuss next steps",
        "sequence_order": 3,
        "movements": [
          {
            "id": "review_findings",
            "name": "Review Findings with PH",
            "description": "Discuss findings with policyholder",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Review your findings with the policyholder and explain next steps",
              "tts_text": "Discuss your findings and explain the next steps",
              "tips": ["Be clear about scope", "Explain timeline", "Answer questions"]
            },
            "evidence_requirements": [],
            "estimated_minutes": 10
          },
          {
            "id": "final_overview",
            "name": "Final Overview Photos",
            "description": "Capture final overview shots of property",
            "sequence_order": 1,
            "is_required": true,
            "criticality": "low",
            "guidance": {
              "instruction": "Take final photos showing the overall property condition",
              "tts_text": "Capture final overview photos of the property",
              "tips": ["Get all 4 corners", "Include street view"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Final overview photos", "is_required": true, "quantity_min": 4, "quantity_max": 8}
            ],
            "estimated_minutes": 5
          }
        ]
      }
    ],
    "gates": [
      {
        "id": "gate_exterior_complete",
        "name": "Exterior Complete Gate",
        "from_phase": "exterior_inspection",
        "to_phase": "interior_inspection",
        "gate_type": "advisory",
        "evaluation_criteria": {
          "type": "simple",
          "simple_rules": {
            "condition": "all_required_movements_complete",
            "required_movements": ["roof_overview", "gutters_downspouts", "siding_exterior"]
          }
        }
      }
    ]
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ============================================
-- SEED: WATER DAMAGE FLOW DEFINITION
-- ============================================

INSERT INTO flow_definitions (name, description, peril_type, property_type, flow_json, is_active)
VALUES (
  'Water Damage Residential Inspection',
  'Standard inspection flow for water damage claims on residential properties',
  'water',
  'residential',
  '{
    "schema_version": "1.0",
    "metadata": {
      "name": "Water Damage Residential Inspection",
      "description": "Complete inspection workflow for water damage",
      "estimated_duration_minutes": 60,
      "primary_peril": "water",
      "secondary_perils": []
    },
    "phases": [
      {
        "id": "arrival",
        "name": "Arrival & Assessment",
        "description": "Initial arrival and source identification",
        "sequence_order": 0,
        "movements": [
          {
            "id": "verify_address",
            "name": "Verify Property Address",
            "description": "Confirm you are at the correct property address",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Verify the property address matches the claim",
              "tts_text": "Please verify you are at the correct address",
              "tips": ["Check mailbox", "Confirm with policyholder"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Property exterior with address visible", "is_required": true, "quantity_min": 1, "quantity_max": 3}
            ],
            "estimated_minutes": 2
          },
          {
            "id": "identify_source",
            "name": "Identify Water Source",
            "description": "Locate and document the source of water intrusion",
            "sequence_order": 1,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Find and document the source of the water damage",
              "tts_text": "Locate and document the water source",
              "tips": ["Check plumbing", "Look at roof penetrations", "Check appliances"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Water source photos", "is_required": true, "quantity_min": 2, "quantity_max": 10},
              {"type": "voice_note", "description": "Source description", "is_required": true, "quantity_min": 1, "quantity_max": 1}
            ],
            "estimated_minutes": 15
          }
        ]
      },
      {
        "id": "damage_mapping",
        "name": "Damage Mapping",
        "description": "Document all affected areas",
        "sequence_order": 1,
        "movements": [
          {
            "id": "affected_rooms",
            "name": "Map Affected Rooms",
            "description": "Identify and document all rooms with water damage",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Walk through and identify all affected rooms",
              "tts_text": "Document all rooms affected by water damage",
              "tips": ["Check adjacent rooms", "Look for hidden damage", "Check under flooring"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Room damage photos", "is_required": true, "quantity_min": 4, "quantity_max": 50},
              {"type": "measurement", "description": "Affected area measurements", "is_required": true, "quantity_min": 1, "quantity_max": 20}
            ],
            "estimated_minutes": 30
          }
        ]
      },
      {
        "id": "wrap_up",
        "name": "Wrap Up",
        "description": "Complete inspection and discuss mitigation",
        "sequence_order": 2,
        "movements": [
          {
            "id": "mitigation_status",
            "name": "Document Mitigation Status",
            "description": "Note any mitigation work done or needed",
            "sequence_order": 0,
            "is_required": true,
            "criticality": "high",
            "guidance": {
              "instruction": "Document any mitigation work that has been done or is needed",
              "tts_text": "Document the mitigation status",
              "tips": ["Check for drying equipment", "Note extraction done", "Recommend further mitigation"]
            },
            "evidence_requirements": [
              {"type": "photo", "description": "Mitigation equipment photos", "is_required": false, "quantity_min": 0, "quantity_max": 10}
            ],
            "estimated_minutes": 10
          }
        ]
      }
    ],
    "gates": []
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- Add comment for the migration
COMMENT ON TABLE flow_definitions IS 'Flow definitions for the phase-based inspection flow engine. Contains peril-specific inspection workflows with phases, movements, and evidence requirements.';
