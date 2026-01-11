# Dynamic Inspection Workflow Engine

## Overview

The Dynamic Inspection Workflow Engine is a rule-driven system for generating, mutating, and enforcing inspection workflows. Unlike static, AI-generated workflows, this engine creates workflows that:

1. **Adapt dynamically** based on FNOL, policy, endorsements, geometry, and discoveries
2. **Enforce evidence** with specific photo, measurement, and note requirements
3. **Block or warn** on export if required evidence is missing
4. **Mutate in real-time** when rooms, damage zones, or scope changes

## Key Principles

### Rules First, AI as Helper

All workflow generation is based on deterministic rules, not AI hallucination. Rules are:
- **Explicit**: Each rule has clear conditions and outputs
- **Versioned**: Rules have versions for tracking changes
- **Explainable**: Every step can explain why it exists

### Evidence as First-Class Citizen

Photos are not just attachments - they are **required evidence** with specifications:
- Minimum photo counts
- Required angles (overview, detail, measurement)
- Subject requirements (what must be visible)
- Quality thresholds

### Blocking vs Advisory

Steps have two enforcement modes:
- **Blocking**: Must complete with all evidence to export
- **Advisory**: Recommended but not required for export

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Rules Engine                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Base Rules  │  │ Peril Rules │  │ Policy/Endorsement Rules│ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Condition Evaluation Engine                    ││
│  │  - FNOL conditions      - Policy conditions                 ││
│  │  - Geometry conditions  - Discovery conditions              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Dynamic Workflow Service                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐│
│  │ Step Generation │  │ Evidence Binding │  │ Mutation Handler ││
│  └─────────────────┘  └─────────────────┘  └──────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Export Validation Engine                        ││
│  │  - Evidence completeness    - Risk level calculation        ││
│  │  - Gap identification       - Blocking enforcement          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Database Layer                           │
│  ┌───────────────────┐  ┌────────────────────────┐             │
│  │ inspection_workflow│  │ workflow_step_evidence │             │
│  │ _steps (enhanced)  │  │ (new table)            │             │
│  └───────────────────┘  └────────────────────────┘             │
│  ┌───────────────────┐  ┌────────────────────────┐             │
│  │ workflow_mutations │  │ workflow_rules          │             │
│  │ (audit trail)      │  │ (configurable rules)   │             │
│  └───────────────────┘  └────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Rules

### Rule Structure

Each workflow rule defines:

```typescript
interface WorkflowRule {
  id: string;              // Unique rule identifier
  name: string;            // Human-readable name
  description: string;     // What this rule does
  version: string;         // Rule version for tracking

  // When this rule applies
  conditions: ConditionGroup;

  // What step to create
  step: {
    phase: string;         // pre_inspection, exterior, interior, etc.
    stepType: string;      // photo, measurement, observation, etc.
    title: string;
    instructions: string;
    estimatedMinutes: number;
    tags: string[];
  };

  // Evidence requirements
  evidence: EvidenceRequirement[];

  // Enforcement
  blocking: 'blocking' | 'advisory' | 'conditional';
  blockingCondition?: ConditionGroup;

  // Scope
  geometryScope?: 'room' | 'structure' | 'zone';

  // Metadata
  priority: number;
  origin: 'base_rule' | 'peril_rule' | 'policy_rule' | 'discovery';
  sourceReference?: string;
}
```

### Rule Categories

#### Base Rules (Always Apply)
- Safety assessment
- Address verification
- Exterior overview photos

#### Peril Rules (Condition-Based)
- **Water Damage**: Moisture readings, source documentation, IICRC category
- **Wind/Hail**: Roof documentation, test squares, soft metal damage
- **Fire**: Origin documentation, smoke migration, habitability

#### Policy Rules (Endorsement-Driven)
- Roof schedule documentation (when roof_schedule endorsement present)
- Metal functional damage (when metal_functional_only endorsement present)
- Matching rules (when matching_replacement endorsement present)

#### Geometry Rules (Per-Room)
- Room overview photos
- Room measurements
- Damage detail photos (when damage zones present)

## Condition System

### Condition Sources

| Source | Description | Example Fields |
|--------|-------------|----------------|
| `fnol` | FNOL / loss context | dateOfLoss, lossDescription |
| `policy` | Policy coverage data | coverageA, deductible, lossSettlement |
| `endorsement` | Extracted endorsements | formCode, category |
| `claim` | Claim metadata | peril.primary, property.type |
| `geometry` | Room/zone data | rooms.hasDamage, damageZones.type |
| `discovery` | Runtime findings | discoveries.type |

### Condition Operators

| Operator | Description |
|----------|-------------|
| `equals` | Exact match |
| `not_equals` | Not equal |
| `contains` | String/array contains |
| `greater_than` | Numeric comparison |
| `less_than` | Numeric comparison |
| `exists` | Field exists and is not null |
| `not_exists` | Field is null/undefined |
| `in` | Value in array |
| `matches_regex` | Regex pattern match |

### Condition Groups

Conditions can be combined with AND/OR logic:

```typescript
{
  logic: 'and',
  conditions: [
    {
      source: 'claim',
      field: 'peril.primary',
      operator: 'equals',
      value: 'water'
    },
    {
      logic: 'or',
      conditions: [
        { source: 'geometry', field: 'rooms.hasDamage', operator: 'equals', value: true },
        { source: 'fnol', field: 'lossDescription', operator: 'contains', value: 'flood' }
      ]
    }
  ]
}
```

## Evidence Requirements

### Photo Requirements

```typescript
{
  type: 'photo',
  label: 'Exterior Overview',
  required: true,
  photo: {
    minCount: 4,           // Minimum photos required
    maxCount: 8,           // Maximum allowed
    angles: ['north', 'south', 'east', 'west'],
    subjects: ['full elevation', 'roof line'],
    quality: {
      minResolution: 2,    // Megapixels
      requireFlash: false,
      requireNoBlur: true
    },
    metadata: {
      requireGps: true,
      requireTimestamp: true
    }
  }
}
```

### Measurement Requirements

```typescript
{
  type: 'measurement',
  label: 'Moisture Readings',
  required: true,
  measurement: {
    type: 'moisture',
    unit: '%',
    minReadings: 4,
    locations: ['wall_base', 'wall_mid', 'wall_top', 'floor'],
    tolerance: 5           // Acceptable variance
  }
}
```

### Note Requirements

```typescript
{
  type: 'note',
  label: 'Water Category',
  required: true,
  note: {
    promptText: 'Document water contamination category',
    minLength: 50,
    structuredFields: [
      {
        field: 'waterCategory',
        type: 'select',
        required: true,
        options: ['category_1_clean', 'category_2_gray', 'category_3_black']
      },
      {
        field: 'categoryEvidence',
        type: 'text',
        required: true
      }
    ]
  }
}
```

## Dynamic Mutation

The workflow can mutate in response to events:

### Mutation Triggers

| Trigger | Description |
|---------|-------------|
| `room_added` | New room added to claim |
| `room_removed` | Room removed from claim |
| `damage_zone_added` | Damage zone created |
| `damage_zone_updated` | Damage zone modified |
| `scope_inferred` | Scope items auto-generated |
| `discovery_logged` | New finding during inspection |

### Mutation Process

1. **Event received** (e.g., room_added)
2. **Context rebuilt** with new geometry
3. **Rules re-evaluated** against new context
4. **Delta calculated** (new steps, removed steps, modified steps)
5. **Database updated** with changes
6. **Audit logged** in workflow_mutations table

### Example: Room Added

```typescript
// When a room is added:
await onRoomAdded(workflowId, roomId, 'Master Bedroom', userId);

// Engine will:
// 1. Get room inspection rules
// 2. Generate steps for the new room:
//    - Room overview photo
//    - Room measurements
//    - (If room has damage) Damage detail photos
// 3. Insert new steps into workflow
// 4. Log mutation in audit table
```

## Export Validation

Before export, the engine validates evidence completeness:

### Risk Levels

| Level | Description | Export Allowed |
|-------|-------------|----------------|
| `none` | All evidence complete | Yes |
| `low` | Minor advisory items missing | Yes |
| `medium` | Some recommended evidence missing | Yes |
| `high` | Required evidence missing (non-blocking) | Yes (with warning) |
| `blocked` | Blocking evidence missing | **No** |

### Validation Result

```typescript
{
  canExport: boolean,
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'blocked',
  gaps: [
    {
      stepId: 'step-123',
      stepTitle: 'Moisture Documentation',
      requirement: { type: 'measurement', label: 'Moisture Readings' },
      isBlocking: true,
      reason: 'Required moisture readings not captured'
    }
  ],
  summary: {
    totalSteps: 25,
    completedSteps: 20,
    blockedSteps: 2,
    evidenceComplete: 45,
    evidenceMissing: 8
  },
  warnings: [
    '2 blocking evidence requirement(s) not fulfilled. Export is blocked.'
  ]
}
```

## API Endpoints

### Generate Dynamic Workflow

```http
POST /api/claims/:id/workflow/dynamic/generate
Content-Type: application/json

{
  "forceRegenerate": false
}
```

### Get Workflow with Evidence Status

```http
GET /api/workflow/:id/evidence
```

### Attach Evidence to Step

```http
POST /api/workflow/:id/steps/:stepId/evidence
Content-Type: application/json

{
  "requirementId": "0",
  "type": "photo",
  "photoId": "photo-uuid"
}
```

### Validate for Export

```http
POST /api/workflow/:id/validate-export
```

### Trigger Mutations

```http
POST /api/workflow/:id/mutation/room-added
Content-Type: application/json

{
  "roomId": "room-uuid",
  "roomName": "Master Bedroom"
}
```

## Database Schema

### inspection_workflow_steps (Enhanced)

New columns added:
- `origin` - Source of the step (base_rule, peril_rule, etc.)
- `source_rule_id` - ID of the rule that generated this step
- `conditions` - JSONB conditions for when step applies
- `evidence_requirements` - JSONB array of evidence specifications
- `blocking` - Blocking behavior (blocking, advisory, conditional)
- `blocking_condition` - Condition for conditional blocking
- `geometry_binding` - Link to room/wall/zone

### workflow_step_evidence (New)

```sql
CREATE TABLE workflow_step_evidence (
  id UUID PRIMARY KEY,
  step_id UUID REFERENCES inspection_workflow_steps(id),
  requirement_id VARCHAR(100),
  evidence_type VARCHAR(30),
  photo_id UUID REFERENCES claim_photos(id),
  measurement_data JSONB,
  note_data JSONB,
  validated BOOLEAN,
  validation_errors JSONB,
  captured_at TIMESTAMP,
  captured_by VARCHAR(100)
);
```

### workflow_mutations (New)

```sql
CREATE TABLE workflow_mutations (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES inspection_workflows(id),
  trigger VARCHAR(50),
  mutation_data JSONB,
  steps_added JSONB,
  steps_removed JSONB,
  steps_modified JSONB,
  triggered_by VARCHAR(100),
  triggered_at TIMESTAMP
);
```

### workflow_rules (New)

```sql
CREATE TABLE workflow_rules (
  id UUID PRIMARY KEY,
  rule_id VARCHAR(100) UNIQUE,
  name VARCHAR(255),
  description TEXT,
  version VARCHAR(20),
  conditions JSONB,
  step_template JSONB,
  evidence JSONB,
  blocking VARCHAR(20),
  priority INTEGER,
  origin VARCHAR(30),
  is_active BOOLEAN,
  is_system BOOLEAN
);
```

## UI Components

### EvidenceCapture

Component for capturing required evidence (photos, measurements, notes):
- Shows requirements with progress
- Photo capture with multi-select
- Measurement input with validation
- Structured note fields
- Blocking indicator

### ExportValidationPanel

Component for showing export readiness:
- Risk level indicator
- Evidence completeness progress
- Gap listing (blocking vs advisory)
- Export button with blocking enforcement

## Usage Examples

### Creating a Water Damage Claim Workflow

```typescript
import { generateDynamicWorkflow } from './dynamicWorkflowService';

// Claim has peril: water, rooms with damage zones
const result = await generateDynamicWorkflow(claimId, orgId, userId);

// Result will include:
// - Safety assessment (blocking)
// - Address verification (blocking)
// - Exterior overview (blocking)
// - Water source documentation (blocking)
// - Moisture readings (blocking)
// - IICRC water category (blocking)
// - Per-room: overview, measurements, damage detail
```

### Handling Room Addition

```typescript
import { onRoomAdded } from './dynamicWorkflowService';

// User adds a room via voice sketching
const mutationResult = await onRoomAdded(
  workflowId,
  newRoomId,
  'Living Room',
  userId
);

// New steps are automatically added:
// - Living Room overview photo
// - Living Room measurements
```

### Pre-Export Validation

```typescript
import { validateWorkflowForExport } from './dynamicWorkflowService';

const validation = await validateWorkflowForExport(workflowId, orgId);

if (!validation.canExport) {
  // Show blocking gaps to user
  console.log('Export blocked:', validation.gaps.filter(g => g.isBlocking));
}
```

## Future Enhancements

1. **Admin UI for Rules**: Allow carriers to customize rules
2. **AI-Assisted Discovery**: Use AI to detect potential issues that trigger new steps
3. **Photo Quality Validation**: Automatic quality scoring of captured photos
4. **Template Library**: Pre-built rule sets for common claim types
5. **Real-time Sync**: Push workflow mutations to connected devices
