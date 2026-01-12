# Claims IQ - Property Insurance Claims Estimation Platform

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Core Features](#core-features)
5. [API Documentation](#api-documentation)
6. [Database Schema](#database-schema)
7. [Development Guide](#development-guide)
8. [Deployment](#deployment)
9. [Contributing](#contributing)

---

## 🎯 Overview

**Claims IQ** is a mobile-first web application designed for property insurance field adjusters. It streamlines the entire claims handling process from initial documentation through final estimate generation.

### What It Does

Claims IQ helps field adjusters:
- **Capture property data** using voice-driven interfaces
- **Document damage** with photos and AI-powered analysis
- **Process documents** automatically (FNOL, policies, endorsements)
- **Generate estimates** with Xactimate integration
- **Follow guided workflows** tailored to specific perils
- **Optimize routes** for field inspections
- **Sync with calendars** (Microsoft 365)

### Key Capabilities

- 🎤 **Voice-Driven Interfaces**: Describe rooms and damage naturally
- 🤖 **AI-Powered Processing**: Document extraction, claim briefings, workflow generation
- 📸 **Photo Analysis**: AI vision analysis for damage detection and quality assessment
- 📊 **Estimate Building**: Hierarchical estimate structure with Xactimate pricing
- 🗺️ **Route Optimization**: AI-powered inspection route planning
- 📅 **Calendar Integration**: Two-way sync with Microsoft 365
- 📱 **Mobile-First**: Optimized for iPhone, tablets, and desktop

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Supabase account (for database and storage)
- OpenAI API key
- (Optional) Microsoft 365 credentials for calendar sync

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd claims-iq

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

### Default Login

- **Username**: `admin`
- **Password**: `admin123`

---

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 19 with TypeScript 5.6
- Vite 7 (build tool)
- Wouter (routing)
- Zustand (client state)
- TanStack Query (server state)
- Tailwind CSS (styling)
- shadcn/ui (component library)

**Backend:**
- Express.js 4.21 with TypeScript
- Drizzle ORM 0.39 (PostgreSQL)
- Passport.js (authentication)
- Multer (file uploads)

**External Services:**
- Supabase (PostgreSQL, storage, auth)
- OpenAI (GPT-4o, GPT-4, Realtime API)
- Microsoft Graph API (calendar)
- National Weather Service API

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Pages   │  │ Features │  │ Components│            │
│  └──────────┘  └──────────┘  └──────────┘            │
│       │              │              │                  │
│       └──────────────┼──────────────┘                  │
│                      │                                  │
│              ┌───────▼────────┐                        │
│              │  API Client    │                        │
│              └───────┬────────┘                        │
└──────────────────────┼─────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼─────────────────────────────────┐
│              Backend (Express.js)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Routes   │  │ Services │  │Middleware│            │
│  └──────────┘  └──────────┘  └──────────┘            │
│       │              │              │                  │
│       └──────────────┼──────────────┘                  │
│                      │                                  │
│              ┌───────▼────────┐                        │
│              │   Database     │                        │
│              │  (PostgreSQL)  │                        │
│              └────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Multi-Tenancy**: Organization-based data isolation
2. **Service Layer**: Business logic separated from routes
3. **Unified Context**: Single source of truth for claim data
4. **Voice Agents**: OpenAI Realtime API for natural language
5. **Queue Processing**: Background document processing
6. **Caching**: Prompt and context caching for performance

---

## 🎨 Core Features

### 1. Voice Sketch

**Purpose**: Convert natural language descriptions into floor plans

**How It Works**:
- User describes rooms verbally ("Add a 12 by 15 foot kitchen")
- OpenAI Realtime API transcribes speech
- Agent calls tools in `geometry-engine.ts`
- System creates geometric representations
- Supports structures, rooms, openings, features, damage zones

**Key Components**:
- `VoiceSketchController.tsx` - Main UI component
- `geometry-engine.ts` - State management and calculations
- `room-sketch-agent.ts` - OpenAI agent with tools
- `useVoiceSession.ts` - Voice session hook

**Example Commands**:
- "Add a 12 by 15 foot kitchen"
- "Add a 3 foot door on the north wall"
- "Mark the south wall as exterior"
- "Add a 2 by 3 foot window on the east wall"

### 2. Voice Scope

**Purpose**: Convert damage descriptions into Xactimate line items

**How It Works**:
- User describes damage ("Replace 200 square feet of drywall")
- Agent searches Xactimate catalog
- Calculates quantities based on zones
- Adds line items to estimate
- Integrates with claim context (briefing, workflow, perils)

**Key Components**:
- `VoiceScopeController.tsx` - Main UI component
- `scope-agent.ts` - OpenAI agent with tools
- `scope-engine.ts` - State management
- `useVoiceScopeSession.ts` - Voice session hook

### 3. Document Processing

**Purpose**: Automatically extract data from claim documents

**How It Works**:
1. User uploads document (FNOL, policy, endorsement)
2. Document classifier identifies type
3. AI extracts structured data
4. Data validated and stored
5. Claim context updated

**Supported Document Types**:
- FNOL (First Notice of Loss)
- Policy documents
- Endorsements
- Photos
- Estimates
- Correspondence

**Key Services**:
- `documentProcessor.ts` - Main processing logic
- `documentClassifier.ts` - Document type detection
- `documentQueue.ts` - Background processing queue

### 4. Claim Briefing

**Purpose**: AI-generated pre-inspection insights

**How It Works**:
- Analyzes claim data (peril, policy, endorsements)
- Generates inspection strategy
- Identifies policy watch-outs
- Provides depreciation guidance
- Lists common misses

**Key Services**:
- `claimBriefingService.ts` - Briefing generation
- `unifiedClaimContextService.ts` - Context aggregation
- `perilAwareContext.ts` - Peril-specific rules

### 5. Inspection Workflows

**Purpose**: Guided step-by-step inspection processes

**How It Works**:
- AI generates workflow based on peril
- Steps organized by phase (exterior, interior, etc.)
- Evidence requirements per step
- Blocking steps prevent skipping
- Auto-expands when rooms added

**Key Services**:
- `inspectionWorkflowService.ts` - Workflow generation
- `dynamicWorkflowService.ts` - Dynamic step creation
- `workflowRulesEngine.ts` - Rule evaluation

### 6. Estimate Builder

**Purpose**: Build hierarchical estimates with Xactimate pricing

**Structure**:
```
Estimate
├── Structures
│   ├── Areas
│   │   └── Zones
│   │       └── Line Items
└── Coverages
    └── Line Items
```

**Key Services**:
- `estimateHierarchy.ts` - CRUD operations
- `estimateCalculator.ts` - Calculations
- `xactPricing.ts` - Xactimate integration
- `pricing.ts` - Regional pricing

### 7. Photo Analysis

**Purpose**: AI-powered photo analysis for damage detection

**How It Works**:
- User uploads photo
- Photo saved to Supabase storage
- Background analysis with OpenAI Vision
- Quality assessment
- Damage detection
- Results stored in database

**Key Services**:
- `photos.ts` - Upload and analysis
- `claimPhotos` table - Storage

### 8. My Day Dashboard

**Purpose**: Personalized home screen for adjusters

**Features**:
- Today's scheduled inspections
- Route optimization
- Weather data
- AI insights
- Quick actions

**Key Services**:
- `myDayAnalysis.ts` - AI analysis
- `routeOptimization.ts` - Route planning
- `weatherService.ts` - Weather data
- `ms365CalendarService.ts` - Calendar sync

### 9. Map View

**Purpose**: Visualize claims on map

**Features**:
- Claim markers
- Weather overlays
- Route visualization
- Geocoding

**Key Services**:
- `geocoding.ts` - Address to coordinates
- Leaflet maps integration

---

## 📡 API Documentation

### Authentication

All API endpoints require authentication except `/api/auth/login`.

**Session-Based Auth**:
- Login: `POST /api/auth/login`
- Logout: `POST /api/auth/logout`
- Check: `GET /api/auth/me`

### Claims

- `GET /api/claims` - List claims
- `GET /api/claims/:id` - Get claim details
- `POST /api/claims` - Create claim
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Delete claim
- `GET /api/claims/:id/briefing` - Get claim briefing
- `POST /api/claims/:id/briefing/generate` - Generate briefing
- `GET /api/claims/:id/workflow` - Get workflow
- `POST /api/claims/:id/workflow/generate` - Generate workflow

### Documents

- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document
- `GET /api/documents/:id/download` - Download document
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/process` - Process document queue

### Photos

- `POST /api/photos` - Upload photo
- `GET /api/photos/:id` - Get photo
- `PUT /api/photos/:id` - Update photo
- `DELETE /api/photos/:id` - Delete photo
- `POST /api/photos/:id/reanalyze` - Re-analyze photo

### Estimates

- `GET /api/estimates` - List estimates
- `GET /api/estimates/:id` - Get estimate
- `POST /api/estimates` - Create estimate
- `PUT /api/estimates/:id` - Update estimate
- `POST /api/estimates/:id/calculate` - Calculate totals
- `POST /api/estimates/:id/submit` - Submit estimate
- `GET /api/estimates/:id/export/esx` - Export ESX

### Voice Sessions

- `POST /api/voice/session` - Create voice session
- `GET /api/voice/session/:id` - Get session info

### Workflows

- `GET /api/workflow/:id` - Get workflow
- `PATCH /api/workflow/:id/steps/:stepId` - Update step
- `POST /api/workflow/:id/expand-rooms` - Expand for rooms

See [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) for complete API reference.

---

## 🗄️ Database Schema

### Core Tables

**Claims**:
- `claims` - Main claim records
- `claim_structures` - Structures (houses, garages, etc.)
- `claim_rooms` - Rooms within structures
- `claim_damage_zones` - Damage areas
- `claim_photos` - Photos with AI analysis
- `claim_briefings` - AI-generated briefings
- `inspection_workflows` - Workflow definitions
- `inspection_workflow_steps` - Individual steps

**Documents**:
- `documents` - Document metadata
- `policy_form_extractions` - Extracted policy data
- `endorsement_extractions` - Extracted endorsement data

**Estimates**:
- `estimates` - Estimate records
- `estimate_structures` - Estimate structures
- `estimate_areas` - Areas within structures
- `estimate_zones` - Zones within areas
- `estimate_line_items` - Line items
- `estimate_coverages` - Coverage breakdowns

**Users & Organizations**:
- `users` - User accounts
- `organizations` - Organizations (multi-tenancy)
- `organization_memberships` - User-org relationships

See [DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md) for complete schema documentation.

---

## 💻 Development Guide

### Project Structure

```
claims-iq/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── features/       # Feature modules
│   │   │   ├── voice-sketch/
│   │   │   └── voice-scope/
│   │   ├── pages/         # Page components
│   │   ├── lib/           # Utilities and API client
│   │   └── contexts/      # React contexts
│   └── public/            # Static assets
├── server/                # Backend Express application
│   ├── services/          # Business logic
│   ├── routes.ts          # API routes
│   ├── middleware/        # Express middleware
│   └── lib/              # Utilities
├── shared/                # Shared TypeScript types
│   └── schema.ts         # Database schema definitions
├── db/                    # Database migrations and seeds
└── docs/                 # Documentation
```

### Running Locally

```bash
# Development mode (hot reload)
npm run dev

# Frontend only
npm run dev:client

# Backend only
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Code Style

- TypeScript strict mode
- ESLint for linting
- Prettier for formatting
- Component naming: PascalCase
- File naming: kebab-case
- Functions: camelCase

### Testing

```bash
# Run tests (when implemented)
npm test

# Run with coverage
npm run test:coverage
```

### Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=5000
SESSION_SECRET=...

# Microsoft 365 (optional)
MS365_CLIENT_ID=...
MS365_CLIENT_SECRET=...
MS365_TENANT_ID=...
```

---

## 🚢 Deployment

### Production Build

```bash
npm run build
npm start
```

### Environment Setup

1. Set up PostgreSQL database (Supabase recommended)
2. Configure environment variables
3. Run database migrations
4. Set up Supabase storage buckets
5. Configure OpenAI API key
6. (Optional) Set up Microsoft 365 app registration

### Supabase Setup

1. Create project
2. Enable storage
3. Create buckets: `documents`, `claim-photos`
4. Set up RLS policies
5. Configure CORS

---

## 🤝 Contributing

### Development Workflow

1. Create feature branch
2. Make changes
3. Write tests
4. Update documentation
5. Submit pull request

### Documentation Standards

- Update README.md for major features
- Add API docs for new endpoints
- Update schema docs for database changes
- Add examples for complex features

---

## 📚 Additional Documentation

- [Architecture Details](./docs/ARCHITECTURE.md)
- [API Reference](./docs/API_DOCUMENTATION.md)
- [Database Schema](./docs/DATABASE_SCHEMA.md)
- [Voice Features](./docs/VOICE_SKETCHING.md)
- [Workflow Engine](./docs/DYNAMIC_WORKFLOW_ENGINE.md)
- [Estimate Engine](./docs/ESTIMATE_ENGINE.md)
- [Mobile Optimization](./MOBILE_OPTIMIZATION_REPORT.md)

---

## 📄 License

MIT

---

## 🆘 Support

For issues, questions, or contributions, please open an issue on GitHub.
