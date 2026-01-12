# Database Schema Documentation

Complete database schema reference for Claims IQ.

## Overview

Claims IQ uses PostgreSQL with Drizzle ORM. The schema is defined in `shared/schema.ts`.

## Core Tables

### Organizations (Multi-Tenancy)

**Table**: `organizations`

Multi-tenant isolation. Every claim, document, and estimate belongs to an organization.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | varchar(255) | Organization name |
| slug | varchar(100) | URL-friendly identifier (unique) |
| type | varchar(50) | carrier, tpa, contractor, adjuster_firm |
| email | varchar(255) | Contact email |
| phone | varchar(50) | Contact phone |
| address | text | Physical address |
| settings | jsonb | Organization settings |
| status | varchar(30) | active, suspended, trial |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Users

**Table**: `users`

User accounts with authentication.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| username | text | Unique username |
| email | varchar(255) | Email address |
| password | text | Hashed password |
| first_name | varchar(100) | First name |
| last_name | varchar(100) | Last name |
| role | varchar(30) | super_admin, org_admin, adjuster, viewer |
| current_organization_id | uuid | Active organization |
| preferences | jsonb | User preferences |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Organization Memberships

**Table**: `organization_memberships`

Links users to organizations with roles.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to users |
| organization_id | uuid | Foreign key to organizations |
| role | varchar(30) | owner, admin, adjuster, viewer |
| status | varchar(30) | active, invited, suspended |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Claims Tables

### Claims

**Table**: `claims`

Main claim records.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | varchar | Human-readable claim ID |
| assigned_user_id | uuid | Assigned adjuster |
| carrier_id | uuid | Insurance carrier |
| insured_name | varchar | Insured party name |
| property_address | text | Property address |
| property_city | varchar | City |
| property_state | varchar | State |
| property_zip | varchar | ZIP code |
| property_latitude | numeric | GPS latitude |
| property_longitude | numeric | GPS longitude |
| date_of_loss | date | Loss date |
| primary_peril | varchar | Primary peril type |
| secondary_perils | jsonb | Array of secondary perils |
| status | varchar | draft, in_progress, completed, closed |
| total_rcv | numeric | Total replacement cost value |
| total_acv | numeric | Total actual cash value |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Structures

**Table**: `claim_structures`

Structures on the property (house, garage, shed, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| name | varchar | Structure name |
| structure_type | varchar | main_dwelling, garage, shed, etc. |
| description | text | Description |
| stories | integer | Number of stories |
| year_built | integer | Year built |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Rooms

**Table**: `claim_rooms`

Rooms within structures.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| structure_id | uuid | Foreign key to claim_structures |
| name | varchar | Room name |
| room_type | varchar | kitchen, bathroom, bedroom, etc. |
| floor_level | varchar | 1, 2, basement, etc. |
| shape | varchar | rectangular, l_shape, t_shape |
| width_ft | numeric | Width in feet |
| length_ft | numeric | Length in feet |
| ceiling_height_ft | numeric | Ceiling height |
| polygon | jsonb | Geometric polygon data |
| openings | jsonb | Array of openings (doors, windows) |
| features | jsonb | Array of features (cabinets, etc.) |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Damage Zones

**Table**: `claim_damage_zones`

Damage areas within rooms.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| room_id | uuid | Foreign key to claim_rooms |
| damage_type | varchar | Water, Fire, Smoke, etc. |
| category | varchar | Damage category |
| associated_peril | varchar | Related peril |
| affected_walls | jsonb | Array of affected walls |
| floor_affected | boolean | Floor damage |
| ceiling_affected | boolean | Ceiling damage |
| extent_ft | numeric | Damage extent |
| severity | varchar | Low, Medium, High, Total |
| polygon | jsonb | Geometric polygon |
| notes | text | Notes |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Photos

**Table**: `claim_photos`

Photos with AI analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| claim_id | uuid | Foreign key to claims |
| organization_id | uuid | Foreign key to organizations |
| structure_id | uuid | Foreign key to claim_structures |
| room_id | uuid | Foreign key to claim_rooms |
| damage_zone_id | uuid | Foreign key to claim_damage_zones |
| storage_path | varchar | Supabase storage path |
| public_url | varchar | Public URL |
| file_name | varchar | Original filename |
| mime_type | varchar | MIME type |
| file_size | integer | File size in bytes |
| label | varchar | Photo label |
| hierarchy_path | varchar | Location path |
| ai_analysis | jsonb | AI analysis results |
| quality_score | integer | Quality score (0-10) |
| damage_detected | boolean | Damage detected |
| analysis_status | varchar | pending, analyzing, completed, failed |
| latitude | double precision | GPS latitude |
| longitude | double precision | GPS longitude |
| captured_at | timestamp | Capture timestamp |
| analyzed_at | timestamp | Analysis timestamp |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Claim Briefings

**Table**: `claim_briefings`

AI-generated claim briefings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| peril | varchar | Peril type |
| secondary_perils | jsonb | Secondary perils |
| source_hash | varchar | Source data hash (for caching) |
| briefing_json | jsonb | Briefing content |
| status | varchar | generated, failed |
| model | varchar | AI model used |
| prompt_tokens | integer | Prompt tokens |
| completion_tokens | integer | Completion tokens |
| total_tokens | integer | Total tokens |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Document Tables

### Documents

**Table**: `documents`

Document metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| name | varchar | Document name |
| type | varchar | fnol, policy, endorsement, etc. |
| category | varchar | Document category |
| file_name | varchar | Original filename |
| file_size | integer | File size |
| mime_type | varchar | MIME type |
| storage_path | varchar | Supabase storage path |
| extracted_data | jsonb | Extracted data |
| processing_status | varchar | pending, processing, completed, failed |
| full_text | text | Extracted text |
| page_texts | jsonb | Per-page text |
| uploaded_by | varchar | User ID |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Policy Form Extractions

**Table**: `policy_form_extractions`

Extracted policy data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| document_id | uuid | Foreign key to documents |
| policy_form_code | varchar | Policy form code |
| policy_form_name | varchar | Policy form name |
| extraction_data | jsonb | Extracted policy data |
| policy_structure | jsonb | Policy structure |
| section_i | jsonb | Section I (Property) |
| section_ii | jsonb | Section II (Liability) |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Endorsement Extractions

**Table**: `endorsement_extractions`

Extracted endorsement data.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| document_id | uuid | Foreign key to documents |
| form_code | varchar | Endorsement form code |
| title | varchar | Endorsement title |
| extraction_data | jsonb | Extracted data |
| modifications | jsonb | Policy modifications |
| applies_to_coverages | jsonb | Affected coverages |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Estimate Tables

### Estimates

**Table**: `estimates`

Estimate records.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| claim_number | varchar | Claim number |
| status | varchar | draft, in_progress, submitted, locked |
| version | integer | Estimate version |
| region_id | varchar | Pricing region |
| carrier_profile_id | uuid | Carrier profile |
| total_rcv | numeric | Total RCV |
| total_acv | numeric | Total ACV |
| total_depreciation | numeric | Total depreciation |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Structures

**Table**: `estimate_structures`

Structures in estimate.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| name | varchar | Structure name |
| description | text | Description |
| total_sf | numeric | Total square footage |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Areas

**Table**: `estimate_areas`

Areas within structures (floors, sections).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| structure_id | uuid | Foreign key to estimate_structures |
| name | varchar | Area name |
| area_type | varchar | floor, section, etc. |
| total_sf | numeric | Total square footage |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Zones

**Table**: `estimate_zones`

Zones within areas (rooms, damage areas).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| area_id | uuid | Foreign key to estimate_areas |
| name | varchar | Zone name |
| zone_type | varchar | room, elevation, roof, etc. |
| room_type | varchar | kitchen, bathroom, etc. |
| length_ft | numeric | Length |
| width_ft | numeric | Width |
| height_ft | numeric | Height |
| damage_type | varchar | Damage type |
| damage_severity | varchar | Severity |
| rcv_total | numeric | RCV total |
| acv_total | numeric | ACV total |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Estimate Line Items

**Table**: `estimate_line_items`

Individual work items.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| zone_id | uuid | Foreign key to estimate_zones |
| line_item_code | varchar | Xactimate code |
| line_item_description | text | Description |
| category_id | varchar | Category |
| quantity | numeric | Quantity |
| unit | varchar | Unit (SF, LF, EA) |
| unit_price | numeric | Unit price |
| subtotal | numeric | Subtotal |
| material_cost | numeric | Material cost |
| labor_cost | numeric | Labor cost |
| equipment_cost | numeric | Equipment cost |
| rcv | numeric | Replacement cost value |
| acv | numeric | Actual cash value |
| depreciation_amount | numeric | Depreciation |
| coverage_code | varchar | Coverage (A, B, C, D) |
| sort_order | integer | Display order |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Zone Openings

**Table**: `zone_openings`

Openings (doors, windows) in zones.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| zone_id | uuid | Foreign key to estimate_zones |
| opening_type | varchar | door, window, etc. |
| wall_index | integer | Wall index (0-3) |
| offset_from_vertex_ft | numeric | Offset from wall vertex |
| width_ft | numeric | Width |
| height_ft | numeric | Height |
| connects_to_zone_id | uuid | Connected zone |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Zone Connections

**Table**: `zone_connections`

Connections between zones.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| estimate_id | uuid | Foreign key to estimates |
| from_zone_id | uuid | Source zone |
| to_zone_id | uuid | Target zone |
| connection_type | varchar | opening, hallway, etc. |
| opening_id | uuid | Related opening |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Workflow Tables

### Inspection Workflows

**Table**: `inspection_workflows`

Workflow definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Foreign key to organizations |
| claim_id | uuid | Foreign key to claims |
| version | integer | Workflow version |
| status | varchar | draft, in_progress, completed |
| primary_peril | varchar | Primary peril |
| secondary_perils | jsonb | Secondary perils |
| workflow_json | jsonb | Workflow definition |
| total_steps | integer | Total steps |
| completed_steps | integer | Completed steps |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Inspection Workflow Steps

**Table**: `inspection_workflow_steps`

Individual workflow steps.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| workflow_id | uuid | Foreign key to inspection_workflows |
| step_index | integer | Step order |
| phase | varchar | exterior, interior, documentation |
| step_type | varchar | inspection, photo, measurement |
| title | varchar | Step title |
| description | text | Description |
| instructions | text | Instructions |
| status | varchar | pending, in_progress, completed, skipped |
| required | boolean | Required step |
| room_id | uuid | Related room |
| checklist_items | jsonb | Checklist items |
| started_at | timestamp | Start timestamp |
| completed_at | timestamp | Completion timestamp |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

### Inspection Workflow Assets

**Table**: `inspection_workflow_assets`

Evidence/assets for workflow steps.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| step_id | uuid | Foreign key to inspection_workflow_steps |
| asset_type | varchar | photo, measurement, note |
| label | varchar | Asset label |
| required | boolean | Required |
| min_count | integer | Minimum count |
| status | varchar | pending, provided |
| document_id | uuid | Related document |
| photo_id | uuid | Related photo |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update timestamp |

---

## Indexes

Key indexes for performance:

- `claims(organization_id, status)`
- `claim_rooms(claim_id, structure_id)`
- `claim_photos(claim_id, room_id)`
- `documents(organization_id, claim_id, type)`
- `estimates(organization_id, claim_id)`
- `estimate_line_items(estimate_id, zone_id)`

---

## Relationships

### Claim Hierarchy

```
claims
├── claim_structures
│   └── claim_rooms
│       └── claim_damage_zones
└── claim_photos (can link to structure, room, or zone)
```

### Estimate Hierarchy

```
estimates
├── estimate_structures
│   └── estimate_areas
│       └── estimate_zones
│           ├── estimate_line_items
│           ├── zone_openings
│           └── zone_connections
└── estimate_coverages
    └── estimate_line_items
```

### Workflow Hierarchy

```
inspection_workflows
└── inspection_workflow_steps
    └── inspection_workflow_assets
```

---

## Row Level Security (RLS)

Supabase RLS policies enforce organization-level isolation:

- Users can only access data from their organization
- Service role bypasses RLS for admin operations
- Policies defined in Supabase dashboard

---

For schema definitions, see `shared/schema.ts`.
