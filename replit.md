# Claims IQ - Property Insurance Claims Estimation Platform

## Overview

Claims IQ is a modern, mobile-first web application for property insurance claims estimation. Built for field adjusters, it enables property data capture, damage documentation, and estimate generation through voice-driven interfaces, AI-powered document extraction, and comprehensive estimation tools.

**Key Capabilities:**
- **Voice Sketch**: Natural language property documentation
- **Voice Scope**: Voice-to-estimate damage documentation
- **AI Document Extraction**: Automatic FNOL, policy, and endorsement processing
- **Intelligent Claim Briefings**: AI-generated inspection strategies
- **Inspection Workflows**: Step-by-step guided inspections
- **Multi-Peril Support**: Wind/Hail, Fire, Water, Flood, Smoke, Mold, Impact
- **Xactimate Integration**: 20,000+ line items with regional pricing
- **Multi-Tenant Architecture**: Organization-based access control

## User Preferences

Preferred communication style: Simple, everyday language.

---

# User Guide

## Getting Started

### Logging In
1. Navigate to the Claims IQ application
2. Enter your username and password
3. Check "Remember me" for extended sessions (30 days)
4. Click "Sign In"

### Navigation
| Menu Item | Description |
|-----------|-------------|
| **My Day** | Daily dashboard with assigned claims and AI insights |
| **Claims** | View and manage all claims |
| **Map** | Geographic view of claim locations |
| **Photos** | Photo gallery for inspections |
| **Settings** | Application preferences |
| **Profile** | Your account settings |

---

## My Day Dashboard

Your personalized daily command center showing:

### Today's Inspections
- Claims assigned to you for the day
- Weather conditions at each location
- Estimated travel times between stops
- AI-generated priority recommendations

### AI Insights
- **Priority alerts**: Claims needing immediate attention
- **Weather warnings**: Locations with adverse conditions
- **SLA tracking**: Claims approaching deadlines
- **Efficiency tips**: Route optimization suggestions

### Weather Integration
Real-time weather data for each inspection location including temperature, wind speed, precipitation probability, and weather impact score.

---

## Voice Sketch - Property Documentation

Voice Sketch allows you to document property layout using natural voice commands.

### How to Use
1. Open a claim and tap "Voice Sketch"
2. Tap the microphone to start
3. Speak naturally to describe rooms and structures

### Example Commands

**Interior Rooms:**
- "Create a living room, 15 by 20 feet"
- "Add a kitchen next to the living room, 12 by 14"
- "Add a door between living room and kitchen"
- "The master bedroom is 14 by 16 with a 6 by 8 closet"

**Exterior & Roof:**
- "Create the main roof section, 30 by 40 feet"
- "Add the front elevation, 40 feet wide by 12 feet tall"
- "Add a detached garage, 24 by 24 feet"

### Supported Areas
| Category | Examples |
|----------|----------|
| **Interior Rooms** | Living room, bedroom, kitchen, bathroom, hallway, closet |
| **Roof Sections** | Main roof, garage roof, porch roof, dormers |
| **Elevations** | Front, back, left, right exterior walls |
| **Exterior** | Siding, gutters, deck, patio, fence, driveway |
| **Structures** | Main Dwelling, Detached Garage, Shed, Barn, Carport, Pool House, Guest House |

---

## Voice Scope - Damage Documentation

Voice Scope helps you document damage and create line items by voice.

### How to Use
1. Open a claim and navigate to the scope section
2. Tap the microphone
3. Describe the damage you observe

### Example Commands
- "The living room ceiling has water stains, about 4 by 6 feet"
- "Replace drywall on the north wall, 8 feet by 10 feet"
- "The kitchen floor has fire damage, need to replace 120 square feet of laminate"
- "Smoke damage on all walls, approximately 480 square feet total"

The system matches your description to appropriate Xactimate line items and calculates quantities automatically.

---

## Claims Management

### Creating a New Claim
1. Click **"New Claim"** button
2. Upload FNOL document (system extracts data automatically)
3. Upload policy documents and endorsements
4. Review extracted information
5. Click **"Finalize Claim"**

### Claim Statuses
| Status | Description |
|--------|-------------|
| **Draft** | Claim being created |
| **FNOL** | First Notice of Loss received |
| **Open** | Claim assigned and ready for work |
| **In Progress** | Active inspection/estimation |
| **Review** | Submitted for supervisor review |
| **Approved** | Estimate approved |
| **Closed** | Claim completed |

---

## Document Processing

Upload documents and let AI extract information automatically:

### FNOL Extraction
- Claim number
- Policyholder information
- Property address
- Date of loss
- Loss description
- Peril type inference

### Policy Extraction
- Coverage limits (A, B, C, D)
- Deductibles
- Exclusions and endorsements
- Special conditions
- Loss settlement provisions

### Endorsement Processing
- Modifications to base policy
- Added/removed coverages
- Coverage limit adjustments
- Special endorsement conditions

---

## AI Claim Briefing

After documents are processed, Claims IQ generates an intelligent briefing:

### What's Included
- **Claim Summary**: Quick overview of the loss
- **Inspection Strategy**: Where to start, what to prioritize
- **Peril-Specific Risks**: What to watch for based on damage type
- **Policy Watchouts**: Coverage limitations, endorsement impacts
- **Photo Requirements**: Essential documentation needed
- **Depreciation Considerations**: Age and condition factors
- **Open Questions**: Items requiring adjuster judgment

---

## Inspection Workflow

AI-generated step-by-step inspection guidance:

### Workflow Phases
1. **Pre-Inspection**: Document review, safety preparation
2. **Initial Walkthrough**: Overview of property and damage
3. **Exterior Inspection**: Roof, siding, elevations, grounds
4. **Interior Inspection**: Room-by-room damage assessment
5. **Documentation**: Photos, measurements, notes
6. **Wrap-Up**: Policyholder communication, next steps

Each step includes:
- Required photos
- Measurements to take
- Checklist items
- Tool requirements
- Estimated time

---

## Estimate Builder

Build detailed estimates with the hierarchical system:

### Estimate Structure
```
Estimate
└── Coverage (A, B, C, D)
    └── Structure (Main Dwelling, Garage, etc.)
        └── Area (Roofing, Interior, Exterior, etc.)
            └── Zone (Living Room, Kitchen, etc.)
                └── Line Items
```

### Adding Line Items
1. Select a zone (room or area)
2. Search for line items or use AI suggestions
3. Enter quantity and dimensions
4. System calculates pricing automatically

### Pricing Components
- **Materials**: Product costs with regional adjustments
- **Labor**: Trade-specific hourly rates
- **Equipment**: Tools and machinery
- **O&P**: Overhead and profit (when threshold met)
- **Tax**: Jurisdiction-based tax rates
- **Depreciation**: ACV calculations based on age/condition

### Export Options
| Format | Use Case |
|--------|----------|
| **PDF Report** | Client-facing estimate document |
| **ESX File** | Xactimate-compatible export |
| **CSV Spreadsheet** | Data analysis and reporting |

---

## Peril Types

| Peril | Description | Common Damage |
|-------|-------------|---------------|
| **Wind/Hail** | Storm damage | Roof impacts, siding damage, broken windows |
| **Fire** | Structure fires | Charring, structural damage, smoke residue |
| **Water** | Internal water | Pipe bursts, appliance leaks, ceiling damage |
| **Flood** | External water | Foundation damage, flooring, mold risk |
| **Smoke** | Fire-related | Discoloration, odor, residue |
| **Mold** | Water aftermath | Growth, remediation needs |
| **Impact** | Physical contact | Vehicle damage, fallen trees, debris |

---

## Photo Management

### Uploading Photos
1. Open a claim
2. Navigate to Photos tab
3. Click "Upload" or use camera
4. Photos are automatically analyzed for damage

### AI Photo Analysis
- **Damage Detection**: Identifies visible damage
- **Quality Scoring**: Ensures documentation quality
- **Damage Description**: AI-generated observations
- **Peril Association**: Links to appropriate peril type

### Organization
- Photos organized by room/area
- Tagging and categorization
- Before/after grouping
- GPS metadata preserved

---

## Map View

Geographic visualization of your claims:

### Features
- Cluster view for multiple claims
- Weather overlay integration
- Route optimization suggestions
- Filter by status, peril, date

### Claim Pins
Color-coded by status:
- 🔵 Blue: Open
- 🟡 Yellow: In Progress
- 🟢 Green: Approved
- ⚫ Gray: Closed

---

# Developer Guide

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 5.6 | Type safety |
| Vite | 7 | Build system |
| Wouter | 3.3 | Client-side routing |
| Zustand | 5 | Global state management |
| TanStack Query | 5 | Server state & caching |
| Tailwind CSS | 4 | Styling |
| shadcn/ui | Latest | Component library |
| Framer Motion | 12 | Animations |
| Leaflet | 1.9 | Maps |
| Recharts | 2.15 | Charts |
| OpenAI Agents SDK | 0.3 | Voice features |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Express.js | 4.21 | HTTP server |
| TypeScript | 5.6 | Type safety |
| Drizzle ORM | 0.39 | Database ORM |
| PostgreSQL | (Supabase) | Database |
| Passport.js | 0.7 | Authentication |
| OpenAI | 6.13 | AI services |
| Puppeteer | 23 | PDF processing |
| Multer | 2 | File uploads |

---

## Project Structure

```
Claims-IQ-Sketch/
├── client/                     # React frontend
│   └── src/
│       ├── features/           # Feature modules
│       │   ├── voice-sketch/   # Voice room sketching
│       │   └── voice-scope/    # Voice damage documentation
│       ├── pages/              # Route pages
│       │   ├── auth.tsx        # Login/authentication
│       │   ├── home.tsx        # Claims list
│       │   ├── my-day.tsx      # Daily dashboard
│       │   ├── claim-detail.tsx # Single claim view
│       │   ├── claims-map.tsx  # Geographic view
│       │   ├── photos.tsx      # Photo gallery
│       │   ├── settings.tsx    # App settings
│       │   └── profile.tsx     # User profile
│       ├── components/
│       │   ├── ui/             # shadcn/ui primitives (30+)
│       │   ├── layouts/        # Desktop/Mobile layouts
│       │   └── workflow/       # Inspection workflow
│       ├── hooks/              # Custom React hooks
│       ├── contexts/           # React contexts
│       ├── lib/
│       │   ├── api.ts          # API client functions
│       │   ├── store.ts        # Zustand store
│       │   ├── types.ts        # TypeScript types
│       │   ├── queryClient.ts  # React Query setup
│       │   └── supabase.ts     # Supabase client
│       └── assets/             # Logo, branding
├── server/                     # Express backend
│   ├── index.ts                # App initialization
│   ├── routes.ts               # API endpoints (100+)
│   ├── db.ts                   # Database config
│   ├── services/               # Business logic (38 services)
│   │   ├── claims.ts           # Claim management
│   │   ├── documents.ts        # Document handling
│   │   ├── documentProcessor.ts # AI extraction
│   │   ├── estimateCalculator.ts # Pricing calculations
│   │   ├── claimBriefingService.ts # AI briefings
│   │   ├── inspectionWorkflowService.ts # Workflows
│   │   ├── xactPricing.ts      # Xactimate pricing
│   │   └── ... (35 more)
│   ├── middleware/
│   │   ├── auth.ts             # Passport.js setup
│   │   └── tenant.ts           # Multi-tenant isolation
│   ├── lib/
│   │   ├── supabase.ts         # Supabase HTTP client
│   │   └── supabaseAdmin.ts    # Admin client (RLS bypass)
│   └── config/
│       └── perilInspectionRules.ts # Peril guidance
├── shared/
│   └── schema.ts               # Drizzle schema + types
├── db/
│   ├── migrations/             # SQL migrations
│   └── seeds/                  # Seed data
├── script/
│   └── build.ts                # Production build script
├── .env.example                # Environment template
└── ARCHITECTURE.md             # Technical architecture
```

---

## Environment Variables

### Required
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_API_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Authentication
SESSION_SECRET=minimum-32-character-random-string

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Application
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5000
```

### Client-Side (Vite)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_API_KEY=your-publishable-key
```

### Optional
```bash
ADMIN_EMAIL=admin@claimsiq.com
ADMIN_PASSWORD=change-this-in-production
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (client + server)
npm run dev

# Production build
npm run build

# Run production build
npm run start

# Type checking
npm run check

# Database migration (LOCAL ONLY - see warning below)
npm run db:push
```

---

## Database Migration Workflow

### CRITICAL: Replit Migration Limitation

**Replit cannot run database migrations directly.**

Replit blocks outbound connections on port 5432, which means:
- `npm run db:push` will NOT work from Replit
- Direct PostgreSQL connections fail
- Schema validation scripts cannot run

**The app works because** it uses Supabase's HTTP API for all queries, not direct PostgreSQL connections.

### Running Migrations (Local Machine Required)

```bash
# 1. Clone repo locally
git clone <repo-url>
cd Claims-IQ-Sketch

# 2. Set environment variable
export SUPABASE_DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"

# 3. Push schema changes
npm run db:push

# 4. Validate schema sync (optional)
node scripts/check-db-columns.cjs
```

### After Schema Changes in shared/schema.ts
1. Commit schema changes to git
2. Pull changes to local machine
3. Run `npm run db:push` locally
4. Verify tables updated correctly
5. Push any migration files back to repo

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Session login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/supabase/login` | Supabase JWT login |
| POST | `/api/auth/supabase/register` | Supabase registration |

### Claims
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claims` | List claims |
| GET | `/api/claims/:id` | Get single claim |
| POST | `/api/claims` | Create claim |
| PUT | `/api/claims/:id` | Update claim |
| DELETE | `/api/claims/:id` | Delete claim |
| GET | `/api/claims/:id/briefing` | AI claim briefing |
| GET | `/api/claims/:id/workflow` | Inspection workflow |
| GET | `/api/claims/:id/documents` | Claim documents |
| GET | `/api/claims/:id/photos` | Claim photos |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload` | Upload document |
| POST | `/api/documents/:id/process` | Trigger AI extraction |
| GET | `/api/documents/:id/preview` | Preview URLs |
| GET | `/api/documents/:id/download` | Download file |

### Estimates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/estimates` | Create estimate |
| GET | `/api/estimates/:id` | Get estimate |
| GET | `/api/estimates/:id/hierarchy` | Full hierarchy tree |
| POST | `/api/estimates/:id/structures` | Add structure |
| POST | `/api/estimates/:id/coverages` | Add coverage |
| POST | `/api/estimates/:id/areas` | Add area |
| POST | `/api/estimates/:id/zones` | Add zone |
| POST | `/api/zones/:id/line-items` | Add line item |
| GET | `/api/estimates/:id/export/pdf` | Export PDF |
| GET | `/api/estimates/:id/export/esx` | Export ESX |

### Pricing & Line Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/line-items` | Search line items |
| GET | `/api/line-items/categories` | List categories |
| POST | `/api/pricing/calculate` | Calculate pricing |
| GET | `/api/xact/search` | Xactimate search |
| GET | `/api/xact/price/:code` | Price breakdown |

### Voice Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/voice/session` | Create ephemeral key |

### Weather & My Day
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/weather/locations` | Batch weather data |
| POST | `/api/my-day/analyze` | AI daily analysis |

### Organizations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/organizations` | List organizations |
| POST | `/api/organizations` | Create organization |
| GET | `/api/organizations/:id` | Get organization |
| GET | `/api/organizations/:id/members` | List members |

### Maps
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claims/map` | Geocoded claims |
| GET | `/api/map/stats` | Map statistics |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | System health |
| GET | `/api/prompts` | List AI prompts |
| GET | `/api/prompts/:key` | Get prompt |
| PUT | `/api/prompts/:key` | Update prompt |

---

## Authentication

### Session-Based (Passport.js)
Primary authentication method using local strategy with username/password.

```typescript
// Session configuration for Replit
cookie: {
  secure: true,        // HTTPS only
  httpOnly: true,      // No JS access
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
  sameSite: 'none',    // Cross-origin for Replit
}
```

Sessions are stored in Supabase `sessions` table for persistence across server restarts.

### Supabase JWT (Alternative)
Bearer token authentication for headless/mobile clients.

```
Authorization: Bearer <supabase-jwt-token>
```

---

## Multi-Tenant Architecture

### Organization Roles
| Role | Permissions |
|------|-------------|
| **owner** | Full access, manage members |
| **admin** | Full access except ownership |
| **adjuster** | Create/edit claims and estimates |
| **viewer** | Read-only access |

### Data Isolation
- All queries filtered by `organizationId`
- Tenant middleware enforces org context
- RLS policies in Supabase for additional security

---

## External Services

### OpenAI
- **GPT-4 Vision**: Document text extraction
- **GPT Realtime**: Voice features (WebRTC)
- **GPT-4**: Briefings, workflows, suggestions

### Supabase
- **PostgreSQL**: Primary database (50+ tables)
- **Storage**: Document and photo uploads
- **HTTP API**: All backend queries

### National Weather Service
- Free API, no authentication required
- Temperature, wind, precipitation, alerts
- Used for My Day dashboard

### Xactimate
- 122 categories, 20,000+ line items
- Regional pricing adjustments
- Material/labor/equipment breakdown

---

## Branding

### Logo Assets
- Wordmark: `client/src/assets/logo-wordmark.png`
- Icon: `client/src/assets/logo-icon.png`

### Colors
| Name | Hex | Usage |
|------|-----|-------|
| Primary Purple | `#7763B7` | Buttons, links, accents |
| Accent Gold | `#C6A54E` | Highlights, badges |

### Fonts
| Type | Font Family |
|------|-------------|
| Headings | Work Sans |
| Body | Source Sans 3 |
| Monospace | Space Mono |

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant organizations |
| `users` | User accounts with org context |
| `claims` | FNOL and claim data |
| `claim_structures` | Buildings in property |
| `claim_rooms` | Rooms within structures |
| `claim_damage_zones` | Damage areas |
| `claim_photos` | Photos with AI analysis |
| `documents` | Uploaded files |
| `policy_form_extractions` | Extracted policy data |
| `endorsement_extractions` | Endorsement modifications |
| `estimates` | Estimate headers |
| `estimate_coverages` | Coverage-level estimates |
| `estimate_structures` | Building-level estimates |
| `estimate_areas` | Area-level estimates |
| `estimate_zones` | Zone-level with line items |
| `estimate_line_items` | Individual line items |
| `xact_categories` | Xactimate categories (122) |
| `xact_line_items` | Xactimate items (20,000+) |
| `ai_prompts` | Editable AI prompts |
| `claim_briefings` | Generated briefings |
| `inspection_workflows` | Workflow definitions |
| `inspection_workflow_steps` | Individual steps |

---

## Testing

Unit tests located in `server/services/__tests__/`:
- `estimateValidator.test.ts`
- `zoneMetrics.test.ts`
- `quantityEngine.test.ts`
- `scopeEngine.test.ts`
- `rulesEngine.test.ts`
- `sketchTools.test.ts`

Run tests:
```bash
npm test
```

---

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- The app uses Supabase HTTP API, not direct PostgreSQL
- Check `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set

**"Session not persisting"**
- Verify `SESSION_SECRET` is set (min 32 characters)
- Check cookie settings for your environment

**"Document extraction failed"**
- Verify `OPENAI_API_KEY` is valid
- Check file size (50MB limit)
- Ensure PDF is not password-protected

**"Voice features not working"**
- OpenAI Realtime requires valid API key
- Check browser microphone permissions
- Verify WebRTC is supported

**"Migrations won't run"**
- Must run from local machine, not Replit
- Set `SUPABASE_DATABASE_URL` with port 5432 access

---

## Additional Resources

- **Technical Architecture**: See `ARCHITECTURE.md`
- **Environment Template**: See `.env.example`
- **Schema Definition**: See `shared/schema.ts`
