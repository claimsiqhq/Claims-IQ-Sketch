# Claims IQ - Property Insurance Claims Estimation Platform

## Overview

Claims IQ is a modern, mobile-first web application for property insurance claims estimation. It enables field adjusters to capture property data, document damage, and generate estimates through voice-driven interfaces and comprehensive estimation tools.

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
- **My Day** (Home) - Your daily dashboard with assigned claims and AI insights
- **Claims** - View and manage all claims
- **Map** - Geographic view of claim locations
- **Photos** - Photo gallery for inspections
- **Settings** - Application preferences
- **Profile** - Your account settings

---

## My Day Dashboard

Your personalized daily command center showing:

**Today's Inspections**
- Claims assigned to you for the day
- Weather conditions at each location
- Estimated travel times between stops
- AI-generated priority recommendations

**AI Insights**
- Priority alerts - Which claims need immediate attention
- Weather warnings - Locations with adverse conditions
- SLA tracking - Claims approaching deadlines
- Efficiency tips - Route optimization suggestions

**Weather Integration**
Real-time weather data for each inspection location including temperature, wind speed, precipitation probability, and impact score.

---

## Voice Sketch - Property Documentation

Voice Sketch allows you to document property layout using voice commands.

**How to Use:**
1. Open a claim and tap "Voice Sketch"
2. Tap the microphone to start
3. Speak naturally to describe rooms

**Example Commands:**
- "Create a living room, 15 by 20 feet"
- "Add a kitchen next to the living room, 12 by 14"
- "Add a door between living room and kitchen"
- "Create the main roof section, 30 by 40 feet"
- "Add the front elevation, 40 feet wide by 12 feet tall"

**Supported Areas:**
- Interior Rooms: Living room, bedroom, kitchen, bathroom, etc.
- Roof Sections: Main roof, garage roof, porch roof
- Elevations: Front, back, left, right exterior walls
- Exterior: Siding, gutters, deck, patio, fence, driveway

**Structure Types:** Main Dwelling, Detached Garage, Shed, Barn, Carport, Pool House, Guest House

---

## Voice Scope - Damage Documentation

Voice Scope helps you document damage and create line items by voice.

**How to Use:**
1. Open a claim and navigate to the scope section
2. Tap the microphone
3. Describe the damage you observe

**Example Commands:**
- "The living room ceiling has water stains, about 4 by 6 feet"
- "Replace drywall on the north wall, 8 feet by 10 feet"
- "The kitchen floor has fire damage, need to replace 120 square feet of laminate"

The system will match your description to appropriate line items and calculate quantities.

---

## Claims Management

**Creating a New Claim:**
1. Click "New Claim" button
2. Upload FNOL document (system extracts data automatically)
3. Upload policy documents and endorsements
4. Review extracted information
5. Click "Finalize Claim"

**Claim Statuses:**
- Draft - Claim being created
- FNOL - First Notice of Loss received
- Open - Claim assigned and ready for work
- In Progress - Active inspection/estimation
- Review - Submitted for supervisor review
- Approved - Estimate approved
- Closed - Claim completed

---

## Document Processing

Upload documents and let AI extract information:

**FNOL Extraction:** Claim number, policyholder info, property address, date of loss, loss description

**Policy Extraction:** Coverage limits, deductibles, exclusions, special conditions

**Endorsement Processing:** Modifications to base policy, added/removed coverages

---

## Estimate Builder

Build detailed estimates with the hierarchical system:

**Structure:** Estimate > Structure > Area > Zone > Line Items

**Adding Line Items:**
1. Select a zone
2. Search for line items or use AI suggestions
3. Enter quantity and dimensions
4. System calculates pricing automatically

**Export Options:** PDF report, ESX file (Xactimate), CSV spreadsheet

---

## Peril Types

| Peril | Description |
|-------|-------------|
| Wind/Hail | Storm damage, roof impacts |
| Fire | Structure fires, electrical |
| Water | Pipe bursts, appliance leaks |
| Flood | External water intrusion |
| Smoke | Fire-related damage |
| Mold | Water damage aftermath |
| Impact | Vehicle, tree, debris |

---

# Developer Guide

## Tech Stack

### Frontend
- React 19 with TypeScript
- Wouter for routing
- Zustand for global state
- TanStack React Query v5 for server state
- Tailwind CSS v4 with shadcn/ui components
- Vite 7 for build
- OpenAI Agents SDK for voice features
- Leaflet for maps
- Framer Motion for animations

### Backend
- Express.js with TypeScript
- Drizzle ORM with PostgreSQL (Supabase)
- Passport.js for authentication
- Supabase Storage for files
- OpenAI GPT-4.1 for document extraction
- Puppeteer for PDF generation

---

## Project Structure

```
client/                     # React frontend
  src/
    features/               # Feature modules
      voice-sketch/         # Voice room sketching
      voice-scope/          # Voice damage docs
    pages/                  # Route pages
    components/             # Shared components
      ui/                   # shadcn/ui primitives
      layouts/              # Desktop/Mobile
      workflow/             # Inspection workflow
    hooks/                  # Custom hooks
    lib/                    # Utilities, API, store
server/                     # Express backend
  services/                 # Business logic
  middleware/               # Auth, tenant
  lib/                      # Supabase clients
  config/                   # Inspection rules
  routes.ts                 # API endpoints
shared/
  schema.ts                 # Drizzle schema + types
db/
  migrations/               # SQL migrations
  seeds/                    # Seed data
script/
  build.ts                  # Production build
```

---

## Environment Variables

### Required
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_API_KEY=your-key
SUPABASE_SECRET_KEY=your-secret
SUPABASE_DATABASE_URL=postgresql://...
SESSION_SECRET=your-session-secret
OPENAI_API_KEY=your-openai-key
```

### Client-Side (Vite)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_API_KEY=your-key
```

---

## Development Commands

```bash
npm install      # Install dependencies
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Run production
npm run db:push  # Push schema to database
npm run check    # Type checking
```

---

## API Reference

### Authentication
- POST `/api/auth/login` - Login
- POST `/api/auth/logout` - Logout
- GET `/api/auth/me` - Get current user
- POST `/api/auth/signup` - Create account
- POST `/api/auth/supabase/login` - Supabase login
- POST `/api/auth/supabase/register` - Supabase register

### Claims
- GET `/api/claims` - List claims
- GET `/api/claims/:id` - Get claim
- POST `/api/claims` - Create claim
- PUT `/api/claims/:id` - Update claim
- DELETE `/api/claims/:id` - Delete claim
- GET `/api/claims/:id/briefing` - AI briefing
- GET `/api/claims/:id/documents` - Get documents
- GET `/api/claims/:id/workflow` - Inspection workflow

### Documents
- POST `/api/documents/upload` - Upload document
- POST `/api/documents/:id/process` - AI extraction
- GET `/api/documents/:id/preview` - Preview URLs
- GET `/api/documents/:id/download` - Download file

### Estimates
- POST `/api/estimates` - Create estimate
- GET `/api/estimates/:id` - Get estimate
- GET `/api/estimates/:id/hierarchy` - Full hierarchy
- POST `/api/estimates/:id/structures` - Add structure
- POST `/api/estimates/:id/zones` - Add zone
- POST `/api/zones/:id/line-items` - Add line item

### Pricing
- GET `/api/line-items` - Search line items
- GET `/api/line-items/categories` - Categories
- POST `/api/pricing/calculate` - Calculate price
- GET `/api/xact/search` - Search Xactimate
- GET `/api/xact/price/:code` - Price breakdown

### Voice
- POST `/api/voice/session` - Create ephemeral key

### Weather
- POST `/api/weather/locations` - Weather data
- POST `/api/my-day/analyze` - AI analysis

### Organizations
- GET `/api/organizations` - List orgs
- POST `/api/organizations` - Create org
- GET `/api/organizations/:id/members` - Members

### Maps
- GET `/api/claims/map` - Geocoded claims
- GET `/api/map/stats` - Map statistics

### Admin
- GET `/api/system/status` - System status
- GET `/api/prompts` - List AI prompts
- PUT `/api/prompts/:key` - Update prompt

---

## Database Tables

| Table | Purpose |
|-------|---------|
| organizations | Multi-tenant orgs |
| users | User accounts |
| claims | FNOL and claim data |
| documents | Uploaded files |
| estimates | Estimate headers |
| estimate_structures | Buildings |
| estimate_areas | Rooms/areas |
| estimate_zones | Damage zones |
| estimate_line_items | Line items |
| xact_line_items | Xactimate catalog |
| policy_form_extractions | Policy data |
| endorsement_extractions | Endorsements |
| ai_prompts | AI prompts |
| claim_checklists | Checklists |

---

## Authentication

### Session-Based (Passport.js)
- Local strategy with username/password
- Sessions stored in PostgreSQL
- Cookie config for Replit:
```typescript
cookie: {
  secure: true,
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: 'none',
}
```

### Supabase Auth
- JWT tokens in Authorization header
- Email/password support

---

## External Services

### Weather API
- National Weather Service (free, no key)
- Provides forecasts, alerts, conditions

### Xactimate Integration
- 122 categories, 20,000+ line items
- Material/labor/equipment pricing
- ESX export compatibility

---

## Branding

### Logo Assets
- Wordmark: `client/src/assets/logo-wordmark.png`
- Icon: `client/src/assets/logo-icon.png`

### Colors
- Primary Purple: `#7763B7`
- Accent Gold: `#C6A54E`

### Fonts
- Headings: Work Sans
- Body: Source Sans 3
- Monospace: Space Mono
