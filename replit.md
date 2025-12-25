# Claims IQ - Property Insurance Claims Estimation Platform

## Overview

Claims IQ is a modern, mobile-first web application for property insurance claims estimation. It enables field adjusters to capture property data, document damage, and generate estimates through voice-driven interfaces and comprehensive estimation tools. The platform features Voice Sketch (voice-driven room sketching), Voice Scope (damage documentation), My Day (AI-powered claim optimization), document processing, and hierarchical estimate building.

## User Preferences

Preferred communication style: Simple, everyday language.

## Branding

### Logo Assets
- **Wordmark Logo**: `client/src/assets/logo-wordmark.png` - Full logo with text
- **Icon Logo**: `client/src/assets/logo-icon.png` - Square icon only

### Brand Colors
- **Primary Purple**: `#7763B7` (Tailwind: `primary`)
- **Accent Gold**: `#C6A54E` (Tailwind: `accent`)

### Brand Fonts
- **Headings**: Work Sans (font-display class)
- **Body**: Source Sans 3 (font-body class)
- **Monospace**: Space Mono (font-mono class)

## Tech Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: Zustand for global state
- **Data Fetching**: TanStack React Query v5
- **Styling**: Tailwind CSS v4 with shadcn/ui components (New York variant)
- **Build Tool**: Vite 7
- **Voice AI**: OpenAI Agents SDK (@openai/agents, @openai/agents-realtime)
- **Maps**: Leaflet with react-leaflet
- **Forms**: React Hook Form with Zod validation
- **Animations**: Framer Motion

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL via Supabase
- **ORM**: Drizzle ORM with drizzle-zod
- **Authentication**: Passport.js (local strategy) + Supabase Auth
- **File Storage**: Supabase Storage
- **AI Services**: OpenAI GPT-4.1 for document analysis, GPT-4o Realtime for voice
- **PDF Generation**: Puppeteer

### Development
- **TypeScript Execution**: tsx
- **Build**: esbuild (server), Vite (client)
- **Package Manager**: npm

## Project Structure

```
├── client/                     # React frontend
│   ├── src/
│   │   ├── features/           # Feature modules
│   │   │   ├── voice-sketch/   # Voice-driven room sketching
│   │   │   └── voice-scope/    # Voice damage documentation
│   │   ├── pages/              # Route pages
│   │   ├── components/         # Shared components
│   │   │   ├── ui/             # shadcn/ui primitives
│   │   │   ├── layouts/        # Desktop/Mobile layouts
│   │   │   └── workflow/       # Inspection workflow components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utilities, API, store
│   │   └── contexts/           # React contexts
│   └── index.html
├── server/                     # Express backend
│   ├── services/               # Business logic
│   ├── middleware/             # Auth, tenant middleware
│   ├── lib/                    # Supabase clients
│   ├── config/                 # Inspection rules config
│   ├── scraper/                # Price scraping (demo)
│   └── routes.ts               # API endpoints
├── shared/                     # Shared types
│   └── schema.ts               # Drizzle schema + Zod types
├── db/
│   ├── migrations/             # Supabase SQL migrations
│   └── seeds/                  # Database seed data
├── script/
│   └── build.ts                # Production build script
└── uploads/                    # Local file uploads
```

## Core Features

### 1. Voice Sketch
Voice-driven room sketching for field adjusters using OpenAI Realtime API.

**Location**: `client/src/features/voice-sketch/`

**Key Components**:
- `VoiceSketchController.tsx` - Main voice interface
- `room-sketch-agent.ts` - OpenAI agent with tool definitions
- `geometry-engine.ts` - Room geometry calculations
- `FloorPlanPreview.tsx` - Visual floor plan rendering

**Capabilities**:
- Create rooms with dimensions via voice commands
- Add doors, windows, openings between rooms
- Support for exterior zones (roof, elevations, siding, gutters, deck, patio, fence)
- Auto-calculate square footage and perimeter
- Generate floor plan visualizations

**Structure Types**: `main_dwelling`, `detached_garage`, `shed`, `barn`, `carport`, `pool_house`, `guest_house`

### 2. Voice Scope
Voice-driven damage documentation for line item creation.

**Location**: `client/src/features/voice-scope/`

**Key Components**:
- `VoiceScopeController.tsx` - Voice UI
- `scope-agent.ts` - Damage documentation agent
- `scope-engine.ts` - Line item management

**Capabilities**:
- Document damage via voice
- Auto-suggest line items based on damage description
- Link to rooms/zones from Voice Sketch
- Calculate quantities from dimensions

### 3. My Day
AI-powered daily claim optimization and route planning.

**Location**: `client/src/pages/my-day.tsx`, `server/services/myDayAnalysis.ts`

**Capabilities**:
- View assigned claims for the day
- Weather-aware scheduling with NWS API integration
- AI-generated insights (priority, efficiency, risk, SLA)
- Route optimization suggestions
- Claim briefing summaries

### 4. Claims Management
Full FNOL processing and claim lifecycle management.

**Key Services**:
- `server/services/claims.ts` - CRUD operations
- `server/services/documentProcessor.ts` - AI document extraction
- `server/services/claimBriefingService.ts` - AI briefings

**Claim Statuses**: `draft` → `fnol` → `open` → `in_progress` → `review` → `approved` → `closed`

### 5. Document Processing
AI-powered extraction from insurance documents using GPT-4.1 Vision.

**Extraction Types**:
- **FNOL Documents**: Claim details, policyholder info, loss description
- **Policy Forms**: Full coverage details, exclusions, conditions
- **Endorsements**: Delta modifications to base policy

**Tables**:
- `policy_form_extractions` - Full policy content
- `endorsement_extractions` - Endorsement modifications

### 6. Estimate Builder
Hierarchical estimate system with Xactimate compatibility.

**Hierarchy**: Estimate → Structure → Area → Zone → Line Items

**Key Services**:
- `server/services/estimateHierarchy.ts` - CRUD for estimate hierarchy
- `server/services/estimateCalculator.ts` - Price calculations
- `server/services/xactPricing.ts` - Xactimate price list integration
- `server/services/depreciationEngine.ts` - ACV calculations

**Export Formats**: PDF, ESX (Xactimate), CSV

### 7. Inspection Workflows
AI-generated inspection checklists based on peril type.

**Services**:
- `server/services/inspectionWorkflowService.ts` - Workflow generation
- `server/services/checklistTemplateService.ts` - Checklist templates
- `server/config/perilInspectionRules.ts` - Per-peril rules

## API Structure

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout and destroy session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/signup` - Create new account

### Claims
- `GET /api/claims` - List claims
- `GET /api/claims/:id` - Get claim details
- `POST /api/claims` - Create claim
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Delete claim
- `GET /api/claims/:id/briefing` - Get AI briefing
- `GET /api/claims/:id/documents` - Get claim documents
- `GET /api/claims/:id/workflow` - Get inspection workflow

### Estimates
- `GET /api/estimates/:id` - Get estimate
- `POST /api/estimates` - Create estimate
- `GET /api/estimates/:id/hierarchy` - Get full hierarchy
- `POST /api/estimates/:id/structures` - Add structure
- `POST /api/estimates/:id/zones` - Add zone
- `POST /api/zones/:id/line-items` - Add line item

### Documents
- `POST /api/documents/upload` - Upload document
- `POST /api/documents/:id/process` - AI extraction
- `GET /api/documents/:id/preview` - Get previews
- `GET /api/documents/:id/download` - Download file

### Voice
- `POST /api/voice/session` - Create ephemeral key for Realtime API

### Weather
- `POST /api/weather/locations` - Fetch weather for locations
- `POST /api/my-day/analyze` - AI analysis with weather

### Pricing & Line Items
- `GET /api/line-items` - Search line items
- `GET /api/line-items/categories` - Get category hierarchy
- `POST /api/pricing/calculate` - Calculate prices with regional adjustments
- `GET /api/regions` - Get all pricing regions
- `GET /api/xact/search` - Search Xactimate items
- `GET /api/xact/price/:code` - Get full price breakdown

### Geocoding & Maps
- `GET /api/claims/map` - Get geocoded claims for map view
- `GET /api/map/stats` - Get map statistics
- `POST /api/geocode` - Geocode pending claims

### Organizations
- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/:id/members` - Get members
- `POST /api/organizations/:id/members` - Add member

### Admin
- `GET /api/system/status` - Database status
- `GET /api/prompts` - List AI prompts
- `PUT /api/prompts/:key` - Update AI prompt

## Environment Variables

### Required
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_PUBLISHABLE_API_KEY` - Client-side key
- `SUPABASE_SECRET_KEY` - Server admin key
- `SUPABASE_DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `OPENAI_API_KEY` - OpenAI API key for voice features

### Client-Side (Vite)
- `VITE_SUPABASE_URL` - Supabase URL for frontend
- `VITE_SUPABASE_PUBLISHABLE_API_KEY` - Publishable key

### Optional
- `APP_URL` - Application URL for redirects

## Authentication

Uses session-based auth with Passport.js for local strategy and optional Supabase Auth.

**Cookie Configuration (Replit)**:
```typescript
cookie: {
  secure: true,           // Required for HTTPS
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
  sameSite: 'none',       // Required for Replit iframe
}
```

**Note**: Create users via the signup endpoint or Supabase Auth dashboard.

## Peril Types

The platform supports comprehensive peril tracking with type-specific metadata:

| Peril | Description |
|-------|-------------|
| `wind_hail` | Wind and hail damage |
| `fire` | Fire damage |
| `water` | Non-flood water damage |
| `flood` | External water intrusion |
| `smoke` | Smoke damage |
| `mold` | Mold damage |
| `impact` | Vehicle/tree/debris impact |

## Development

### Commands
```bash
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Run production
npm run db:push    # Push schema to database
```

### Adding New Pages
1. Create component in `client/src/pages/`
2. Register route in `client/src/App.tsx`
3. Add navigation in layouts

### Adding AI Prompts
Prompts are stored in `ai_prompts` table and cached in memory. Update via API or directly in database.

## Database

### Key Tables
- `organizations` - Multi-tenant support
- `users` - User accounts
- `claims` - FNOL and claim data
- `documents` - Uploaded files
- `estimates` - Estimate headers
- `estimate_structures` - Buildings/structures
- `estimate_areas` - Rooms/areas
- `estimate_zones` - Damage zones
- `estimate_line_items` - Individual line items
- `xact_line_items` - Xactimate price catalog
- `ai_prompts` - Configurable AI prompts
- `claim_checklists` - Inspection checklists

### Migrations
SQL migrations are stored in `db/migrations/` and run via Supabase.

## External Services

### Weather
Uses free National Weather Service API (no key required):
- Two-step flow: `/points/{lat},{lon}` → forecast
- Returns temperature, wind, precipitation, alerts
- Calculates inspection impact score

### Xactimate Integration
Full price list with 122 categories, 20,000+ line items:
- Material/labor/equipment components
- Formula-based pricing
- ESX export for Xactimate import
