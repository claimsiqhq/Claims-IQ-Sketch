# Complete Feature Documentation

This document provides comprehensive documentation of all features in Claims IQ.

## Table of Contents

1. [Voice Sketch](#voice-sketch)
2. [Voice Scope](#voice-scope)
3. [Document Processing](#document-processing)
4. [Claim Briefing](#claim-briefing)
5. [Inspection Workflows](#inspection-workflows)
6. [Estimate Builder](#estimate-builder)
7. [Photo Analysis](#photo-analysis)
8. [My Day Dashboard](#my-day-dashboard)
9. [Map View](#map-view)
10. [Calendar Integration](#calendar-integration)
11. [Route Optimization](#route-optimization)
12. [Multi-Tenancy](#multi-tenancy)
13. [Authentication](#authentication)

---

## Voice Sketch

### Overview

Voice Sketch allows adjusters to create floor plans by describing rooms and features naturally. It uses OpenAI's Realtime API to convert speech into geometric representations.

### How It Works

1. **User speaks**: "Add a 12 by 15 foot kitchen"
2. **Realtime API**: Transcribes speech in real-time
3. **Agent processes**: OpenAI agent interprets command
4. **Tool calls**: Agent calls functions in `geometry-engine.ts`
5. **State updates**: Geometry engine updates Zustand store
6. **UI renders**: React components display updated floor plan

### Architecture

**Components**:
- `VoiceSketchController.tsx` - Main UI component
- `VoiceSketchPage.tsx` - Page wrapper
- `RoomPreview.tsx` - Visual floor plan display
- `VoiceWaveform.tsx` - Audio visualization
- `CommandHistory.tsx` - Command log

**Services**:
- `geometry-engine.ts` - State management (Zustand)
- `room-sketch-agent.ts` - OpenAI agent definition
- `useVoiceSession.ts` - Voice session hook
- `sketchTools.ts` - Server-side sketch operations

**State Management**:
- Zustand store (`geometry-engine.ts`)
- Stores: structures, rooms, current room, command history
- Actions: createRoom, addOpening, markDamage, etc.

### Supported Commands

**Room Creation**:
- "Add a [width] by [length] foot [room type]"
- "Create a [room type] that's [width] by [length] feet"
- "I need a [room type] measuring [width] by [length]"

**Openings**:
- "Add a [width] foot [door/window] on the [direction] wall"
- "Put a [door/window] on [wall]"
- "Add an opening on [wall]"

**Features**:
- "Add a [feature type] on [wall]"
- "Put a [feature] [position] on [wall]"

**Damage Zones**:
- "Mark [area] as [damage type]"
- "There's [damage type] damage in [location]"

**Wall Operations**:
- "Mark [wall] as exterior"
- "The [wall] wall is missing"
- "Update [wall] wall length to [dimension]"

### Data Flow

```
User Speech
    ↓
RealtimeSession (OpenAI)
    ↓
Agent (room-sketch-agent.ts)
    ↓
Tool Calls (geometry-engine actions)
    ↓
Zustand Store Update
    ↓
React Re-render
    ↓
UI Update
```

### Saving to Database

When user saves:
1. Structures and rooms converted to database format
2. Saved via `saveClaimRooms()` API
3. Stored in `claim_structures` and `claim_rooms` tables
4. Openings stored in `zone_openings` table

---

## Voice Scope

### Overview

Voice Scope converts natural language damage descriptions into Xactimate line items with calculated quantities.

### How It Works

1. **User describes damage**: "Replace 200 square feet of drywall"
2. **Agent searches**: Searches Xactimate catalog for matching items
3. **Calculates quantities**: Uses zone dimensions and damage extent
4. **Adds to estimate**: Creates line items in estimate
5. **Updates totals**: Recalculates estimate totals

### Architecture

**Components**:
- `VoiceScopeController.tsx` - Main UI component
- `useVoiceScopeSession.ts` - Voice session hook

**Services**:
- `scope-agent.ts` - OpenAI agent with tools
- `scope-engine.ts` - State management (Zustand)
- `scopeEngine.ts` (server) - Scope evaluation logic

**Agent Tools**:
- `search_line_items` - Search Xactimate catalog
- `add_line_item` - Add item to estimate
- `get_workflow_steps` - Get workflow steps
- `get_briefing_priorities` - Get briefing priorities
- `get_photo_requirements` - Get photo requirements

### Claim Context Integration

The agent receives claim-specific context:
- Briefing priorities
- Workflow steps
- Photo requirements
- Peril information
- Policy considerations

This ensures suggestions are:
- Peril-aware
- Policy-compliant
- Workflow-aligned

### Example Interactions

**User**: "I need to replace the drywall in the kitchen"
**Agent**: "I found several drywall replacement items. Based on your kitchen dimensions (12x15), I'll add 180 square feet of drywall replacement. Should I also add primer and paint?"

**User**: "Add removal of damaged cabinets"
**Agent**: "I'll add cabinet removal. Based on the kitchen size, I estimate 12 linear feet. Is that correct?"

---

## Document Processing

### Overview

Automatically extracts structured data from claim documents using AI.

### Document Types

1. **FNOL (First Notice of Loss)**
   - Extracts: Date of loss, peril, property address, insured info
   - Stores in: `claims` table

2. **Policy Documents**
   - Extracts: Coverage limits, deductibles, policy number, effective dates
   - Stores in: `policy_form_extractions` table

3. **Endorsements**
   - Extracts: Modifications, exclusions, special conditions
   - Stores in: `endorsement_extractions` table

### Processing Pipeline

```
Upload Document
    ↓
Classify Document Type
    ↓
Extract Text (PDF parsing)
    ↓
AI Extraction (GPT-4o)
    ↓
Validate Data
    ↓
Store in Database
    ↓
Update Claim Context
```

### Key Services

**documentProcessor.ts**:
- Main processing orchestration
- Coordinates classification, extraction, validation
- Handles errors and retries

**documentClassifier.ts**:
- Determines document type
- Uses AI classification
- Returns confidence scores

**documentQueue.ts**:
- Background processing queue
- Concurrent processing (6 simultaneous)
- Retry logic for failures
- Progress tracking

### Extraction Schema

Each document type has a structured schema:

**FNOL**:
```typescript
{
  dateOfLoss: Date;
  peril: string;
  propertyAddress: Address;
  insuredName: string;
  // ... more fields
}
```

**Policy**:
```typescript
{
  policyNumber: string;
  effectiveDate: Date;
  coverages: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
  deductibles: {
    A: number;
    // ...
  };
}
```

---

## Claim Briefing

### Overview

AI-generated pre-inspection insights that help adjusters prepare for inspections.

### What It Contains

1. **Peril Overview**
   - Primary and secondary perils
   - Risk factors
   - Common damage patterns

2. **Inspection Strategy**
   - Where to start
   - What to prioritize
   - Common misses

3. **Policy Watch-Outs**
   - Endorsement impacts
   - Coverage limitations
   - Special conditions

4. **Photo Requirements**
   - Required photos by category
   - Quality standards
   - Specific shots needed

5. **Depreciation Considerations**
   - Age factors
   - Condition assessments
   - Recoverable vs non-recoverable

### Generation Process

1. **Collect Context**:
   - Claim data (peril, property type)
   - Policy information
   - Endorsements
   - Historical data

2. **Apply Rules**:
   - Peril-specific inspection rules
   - Carrier-specific overlays
   - Jurisdiction requirements

3. **Generate Briefing**:
   - Uses GPT-4 with structured prompt
   - Returns JSON briefing
   - Caches by source hash

4. **Store**:
   - Saved to `claim_briefings` table
   - Linked to claim
   - Versioned

### Key Services

**claimBriefingService.ts**:
- Generates briefings
- Caches results
- Checks staleness
- Updates when claim changes

**unifiedClaimContextService.ts**:
- Aggregates all claim data
- Single source of truth
- Used by briefing and workflow generation

**perilAwareContext.ts**:
- Peril-specific rules
- Inspection guidance
- Common misses database

---

## Inspection Workflows

### Overview

Guided step-by-step inspection processes tailored to specific perils.

### Workflow Structure

```
Workflow
├── Phase 1: Exterior Inspection
│   ├── Step 1: Roof Inspection
│   ├── Step 2: Siding Inspection
│   └── ...
├── Phase 2: Interior Inspection
│   ├── Step 1: Living Room
│   ├── Step 2: Kitchen
│   └── ...
└── Phase 3: Documentation
    ├── Step 1: Photo Requirements
    └── ...
```

### Step Properties

Each step has:
- **Title**: "Inspect Roof for Wind Damage"
- **Description**: Detailed instructions
- **Phase**: Exterior, Interior, Documentation
- **Status**: Pending, In Progress, Completed, Skipped
- **Evidence Requirements**: Photos, measurements, notes
- **Blocking**: Can't proceed without completing
- **Dependencies**: Other steps that must complete first
- **Estimated Time**: Minutes to complete

### Generation Process

1. **Analyze Claim**:
   - Peril type
   - Property type
   - Policy information

2. **Apply Rules**:
   - Peril-specific steps
   - Carrier requirements
   - Jurisdiction rules

3. **Generate Steps**:
   - AI creates step sequence
   - Validates against rules
   - Stores in database

4. **Dynamic Expansion**:
   - Adds steps when rooms added
   - Updates when damage zones created
   - Expands based on photos

### Key Services

**inspectionWorkflowService.ts**:
- Generates workflows
- Manages steps
- Updates status
- Expands dynamically

**dynamicWorkflowService.ts**:
- Creates steps dynamically
- Applies rules
- Validates workflow

**workflowRulesEngine.ts**:
- Evaluates rules
- Determines step requirements
- Checks dependencies

### Evidence Validation

Steps can require:
- **Photos**: Minimum count, specific types
- **Measurements**: Dimensions, areas
- **Notes**: Required descriptions

Validation prevents step completion if requirements not met.

---

## Estimate Builder

### Overview

Hierarchical estimate structure with Xactimate pricing integration.

### Structure

```
Estimate
├── Structures
│   ├── Main House
│   │   ├── Areas
│   │   │   ├── First Floor
│   │   │   │   └── Zones (Rooms)
│   │   │   │       ├── Kitchen
│   │   │   │       │   └── Line Items
│   │   │   │       └── Living Room
│   │   │   └── Second Floor
│   │   └── Coverages
│   └── Garage
└── Coverages
    ├── Coverage A
    └── Coverage B
```

### Components

**Structures**: Buildings (house, garage, shed)
**Areas**: Floors or sections
**Zones**: Rooms or damage areas
**Line Items**: Individual work items

### Line Item Properties

- **Code**: Xactimate code (e.g., "DRYWALL")
- **Description**: Item description
- **Quantity**: Amount needed
- **Unit**: SF, LF, EA, etc.
- **Unit Price**: From Xactimate
- **Coverage**: A, B, C, D
- **RCV**: Replacement Cost Value
- **ACV**: Actual Cash Value
- **Depreciation**: Age-based calculation

### Pricing

**Xactimate Integration**:
- Searches Xactimate catalog
- Gets regional pricing
- Applies multipliers
- Calculates totals

**Regional Adjustments**:
- Material multipliers
- Labor multipliers
- Equipment multipliers
- Tax rates

### Calculations

**Totals**:
- Line item subtotals
- Material/labor/equipment breakdown
- Overhead and profit
- Tax calculations
- Depreciation
- ACV and RCV

**Key Services**:
- `estimateHierarchy.ts` - CRUD operations
- `estimateCalculator.ts` - Calculations
- `xactPricing.ts` - Xactimate integration
- `pricing.ts` - Regional pricing
- `depreciationEngine.ts` - Depreciation calculations

---

## Photo Analysis

### Overview

AI-powered photo analysis for damage detection and quality assessment.

### Analysis Process

1. **Upload**: Photo uploaded to Supabase storage
2. **Save**: Metadata saved to database
3. **Background Analysis**: OpenAI Vision API analyzes
4. **Results**: Quality score, damage detection, description
5. **Update**: Database updated with results

### Analysis Results

**Quality Assessment**:
- Score (0-10)
- Suggestions for improvement
- Lighting assessment
- Focus quality

**Damage Detection**:
- Damage detected: boolean
- Damage type: Water, Fire, etc.
- Description: AI-generated description
- Confidence: Detection confidence

**Content Analysis**:
- Room type identification
- Material identification
- Condition assessment

### Key Services

**photos.ts**:
- Upload handling
- Analysis orchestration
- Storage management
- Error handling

**Storage**:
- Supabase `claim-photos` bucket
- Public URLs for display
- Metadata in `claim_photos` table

### Photo Requirements

Workflows can specify photo requirements:
- Minimum count
- Specific types (overview, detail, etc.)
- Quality standards
- Required angles

---

## My Day Dashboard

### Overview

Personalized home screen showing today's schedule and insights.

### Features

1. **Today's Inspections**:
   - Scheduled appointments
   - Claim details
   - Quick actions

2. **Route Optimization**:
   - AI-optimized route
   - Travel time estimates
   - Distance calculations

3. **Weather Data**:
   - Current conditions
   - Forecast
   - Alerts

4. **AI Insights**:
   - Priority recommendations
   - Risk factors
   - Efficiency tips

### Key Services

**myDayAnalysis.ts**:
- Analyzes schedule
- Generates insights
- Prioritizes claims

**routeOptimization.ts**:
- Calculates optimal route
- Uses Google Maps API
- Considers time windows

**weatherService.ts**:
- Fetches weather data
- National Weather Service API
- Caches results

**ms365CalendarService.ts**:
- Syncs with Outlook
- Two-way sync
- Appointment management

---

## Map View

### Overview

Visual map showing claims, weather, and routes.

### Features

1. **Claim Markers**:
   - Location pins
   - Status colors
   - Quick info

2. **Weather Overlays**:
   - Current conditions
   - Forecast
   - Alerts

3. **Route Visualization**:
   - Optimized route
   - Waypoints
   - Directions

### Key Services

**geocoding.ts**:
- Address to coordinates
- Reverse geocoding
- Batch processing

**Map Library**:
- Leaflet.js
- React Leaflet
- Custom markers

---

## Calendar Integration

### Overview

Two-way synchronization with Microsoft 365 calendars.

### Features

1. **Sync Inspections**:
   - Creates calendar events
   - Updates when changed
   - Deletes when cancelled

2. **Import Appointments**:
   - Reads from Outlook
   - Creates claims
   - Links to existing claims

### Key Services

**ms365AuthService.ts**:
- OAuth authentication
- Token management
- Refresh handling

**ms365CalendarService.ts**:
- Event creation
- Event updates
- Event deletion
- Sync logic

---

## Route Optimization

### Overview

AI-powered route optimization for field inspections.

### Algorithm

1. **Collect Stops**: All scheduled inspections
2. **Calculate Distances**: Between all pairs
3. **Optimize**: Traveling salesman problem
4. **Consider Constraints**: Time windows, priorities
5. **Generate Route**: Ordered sequence

### Key Services

**routeOptimization.ts**:
- Distance calculations
- Route optimization
- Time estimates

**Integration**:
- Google Maps API (optional)
- Manual distance calculations

---

## Multi-Tenancy

### Overview

Organization-based data isolation.

### Implementation

1. **Database Level**:
   - `organization_id` on all tables
   - Row Level Security (RLS) in Supabase
   - Foreign key constraints

2. **Application Level**:
   - Middleware filters by organization
   - Service layer enforces isolation
   - API routes check membership

### Key Components

**Middleware**:
- `tenantMiddleware.ts` - Sets organization context
- `requireOrganization.ts` - Validates membership

**Services**:
- `organizations.ts` - Organization management
- All services filter by `organizationId`

---

## Authentication

### Overview

Session-based authentication with Passport.js.

### Methods

1. **Local Auth**:
   - Username/password
   - Session storage
   - Remember me option

2. **Supabase Auth** (Alternative):
   - JWT tokens
   - Email/password
   - Password reset

### Key Components

**Middleware**:
- `auth.ts` - Passport configuration
- `requireAuth.ts` - Route protection

**Services**:
- `auth.ts` - Local authentication
- `supabaseAuth.ts` - Supabase authentication

---

## Additional Features

### Checklist System

- Peril-based checklists
- Custom items
- Status tracking
- Completion tracking

### Coverage Analysis

- Policy coverage breakdown
- Limit tracking
- Deductible calculations
- Coverage alerts

### Export Capabilities

- ESX export (Xactimate format)
- PDF reports
- CSV exports

### Document Viewer

- PDF preview
- Image viewing
- Text extraction
- Search functionality

---

This completes the feature documentation. For API details, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md). For database schema, see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).
