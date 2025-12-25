# Claims IQ - Property Insurance Claims Estimation Platform

## Overview

Claims IQ is a modern, mobile-first web application for property insurance claims estimation. It provides a unified platform where field adjusters can capture property data, document damage, and generate estimates in a single workflow. The application features an interactive floor plan sketch tool, damage zone documentation, and a comprehensive line item pricing system with regional cost adjustments.

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

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: Zustand for global state with mock data for claims, users, and line item catalogs
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **Data Fetching**: TanStack React Query for server state management
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a page-based structure under `client/src/pages/` with reusable components in `client/src/components/`. UI primitives from shadcn/ui are located in `client/src/components/ui/`.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Pattern**: RESTful endpoints under `/api/*`
- **Development**: tsx for TypeScript execution, Vite dev server for HMR

Key backend services:
- `server/services/pricing.ts`: Line item search, price calculation with regional adjustments
- `server/services/xactPricing.ts`: Xactimate price list integration with formula parsing
- `server/services/auth.ts`: User authentication and password hashing
- `server/services/weatherService.ts`: Weather data via National Weather Service API (free, no API key)
- `server/services/myDayAnalysis.ts`: AI-powered claim analysis for "My Day" optimization
- `server/middleware/auth.ts`: Passport.js session configuration
- `server/scraper/homeDepot.ts`: Material price scraping (demo only - not production-ready)
- `server/routes.ts`: API endpoint registration

### Weather Service

The application fetches weather data for inspection locations using the free National Weather Service (NWS) API.

**Key Features:**
- No API key required - just requires User-Agent header
- Two-step flow: `/points/{lat},{lon}` → get grid coordinates → fetch forecast
- Grid point caching to minimize API calls
- Provides: temperature, wind, precipitation probability, weather conditions, alerts
- Calculates inspection impact score (good/caution/warning/severe)

**API Endpoints:**
- `POST /api/weather/locations` - Fetch weather for multiple locations
- `POST /api/my-day/analyze` - AI analysis of claims with weather integration

### Xactimate Price List Integration

The system includes a full Xactimate price list dataset with 122 categories, 20,974 line items, and 14,586 material/labor/equipment components.

**Database Tables:**
- `xact_categories`: Category hierarchy from Xactimate
- `xact_line_items`: Line items with activity formulas and labor efficiency
- `xact_components`: Materials, equipment, and labor rates with unit prices

**Formula System:**
- Material formulas: `GT,1,C|GZ,19,Co` = component × quantity pairs
- Component codes: Short IDs (e.g., "GT") map to xact_id with prefix (e.g., "5GT")
- Labor efficiency: Minutes per 100 units, converted to per-unit pricing
- Per-unit normalization: Aggregate formula quantities divided by labor efficiency

**API Endpoints:**
- `GET /api/xact/search?q=drywall` - Search items with calculated pricing
- `GET /api/xact/price/:code` - Full price breakdown with material/labor/equipment components
- `POST /api/estimates/:id/xact-items` - Add Xactimate item to estimate with auto-pricing

### Authentication System

The application uses session-based authentication with Passport.js:

**Key Files:**
- `server/middleware/auth.ts` - Session configuration and Passport setup
- `server/services/auth.ts` - User validation, password hashing with bcrypt
- `server/routes.ts` - Auth API endpoints
- `client/src/lib/api.ts` - Frontend API functions
- `client/src/lib/store.ts` - Zustand auth state management

**Session Configuration (Required for Replit):**
```typescript
cookie: {
  secure: true,           // Required for HTTPS
  httpOnly: true,         // Security best practice
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
  sameSite: 'none',       // Required for Replit iframe
}
```

**Important Notes:**
- Replit hosts apps in an HTTPS iframe, requiring `sameSite: 'none'` and `secure: true`
- Sessions are stored in PostgreSQL via `connect-pg-simple`
- Auth endpoints must include `Cache-Control: no-store` headers to prevent 304 responses
- Frontend must use `credentials: 'include'` on all fetch requests

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` for shared type definitions
- **Migrations**: Drizzle Kit with output to `./migrations`
- **Connection**: Connection pool via `pg` package

The database schema supports:
- Organizations (carriers, adjusting firms, contractors)
- Users with role-based access (username/password columns for auth)
- Geographic pricing regions with indices
- Line item catalog with hierarchical categories
- Material, labor, and equipment components
- Session storage table (auto-created by connect-pg-simple)

### Build and Deployment
- **Client Build**: Vite outputs to `dist/public`
- **Server Build**: esbuild bundles server to `dist/index.cjs`
- **Production**: Node.js serves static files and API from single process
- **Development**: Concurrent Vite dev server with Express backend

## External Dependencies

### Database
- PostgreSQL database (required, connection via `DATABASE_URL` environment variable)
- Drizzle ORM for database operations
- connect-pg-simple for session storage

### Third-Party Services
- Session-based authentication with Passport.js (local strategy)
- Material pricing scraper designed for Home Depot (demo/research only - web scraping is unreliable)

### Key NPM Packages
- **Authentication**: passport, passport-local, bcryptjs, express-session, connect-pg-simple
- **UI**: Radix UI primitives, Lucide React icons, shadcn/ui components
- **State**: Zustand, TanStack React Query
- **Styling**: Tailwind CSS, class-variance-authority
- **Utilities**: date-fns, drizzle-zod, zod

## API Structure

### Authentication
- `POST /api/auth/login` - Login with username/password (supports rememberMe flag)
- `POST /api/auth/logout` - Logout and destroy session
- `GET /api/auth/me` - Get current authenticated user
- `GET /api/auth/check` - Check if authenticated

### Line Items & Pricing
- `GET /api/line-items` - Search line items with filtering
- `GET /api/line-items/categories` - Retrieve category hierarchy
- `POST /api/pricing/calculate` - Calculate prices with regional adjustments
- `GET /api/regions` - Get all pricing regions
- `GET /api/carrier-profiles` - Get carrier profit/overhead profiles

### Claims
- `GET /api/claims` - List claims for organization
- `GET /api/claims/:id` - Get single claim
- `POST /api/claims` - Create new claim (requires organizationId)
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Delete claim
- `POST /api/claims/:id/rooms` - Save rooms/damage zones to claim (stored in metadata.rooms)
- `GET /api/claims/:id/rooms` - Get rooms/damage zones from claim
- `GET /api/claims/:id/documents` - Get claim documents
- `GET /api/claims/:id/endorsements` - Get claim endorsements (legacy format)
- `GET /api/claims/:id/endorsement-extractions` - Get comprehensive endorsement extractions (v2.0)
- `GET /api/endorsement-extractions/:id` - Get specific endorsement extraction by ID
- `GET /api/claims/:id/policy-forms` - Get legacy policy form records
- `GET /api/claims/:id/policy-extractions` - Get comprehensive policy extractions (v2.0)
- `GET /api/policy-extractions/:id` - Get specific policy extraction by ID

### Comprehensive Policy Extraction (v2.0)
The system extracts full lossless policy form content using GPT-4.1 Vision API. Extractions are stored in `policy_form_extractions` table with:
- **documentMetadata**: Document type, form code, edition date, page count
- **policyStructure**: Table of contents, policy statement, agreement text
- **definitions**: All policy definitions with terms, definitions, sub-clauses, exceptions
- **sectionI**: Property coverage (A-D), perils, exclusions, additional coverages, loss settlement details
- **sectionII**: Liability coverages (E-F), exclusions, additional coverages
- **generalConditions**: All general conditions from the policy
- **rawPageText**: Complete verbatim text from all pages

The extraction uses the prompt stored in `ai_prompts` table with key `DOCUMENT_EXTRACTION_POLICY`.

### Comprehensive Endorsement Extraction (v2.0)
The system extracts endorsements as delta changes using GPT-4.1 Vision API. Extractions are stored in `endorsement_extractions` table with:
- **endorsementMetadata**: Form code, title, edition date, jurisdiction, page count, applies to policy forms
- **modifications**: Delta changes organized by category:
  - `definitions`: added/deleted/replaced definitions
  - `coverages`: added/deleted/modified coverages
  - `perils`: added/deleted/modified perils
  - `exclusions`: added/deleted/modified exclusions
  - `conditions`: added/deleted/modified conditions
  - `lossSettlement`: replaced loss settlement sections
- **tables**: Any tables with deductible schedules, coverage limits, etc.
- **rawText**: Complete verbatim text from all pages

The extraction uses the prompt stored in `ai_prompts` table with key `DOCUMENT_EXTRACTION_ENDORSEMENT`.

**Claim Statuses:**
- `draft` - Initial status, claim created incrementally during New Claim wizard
- `fnol` - First Notice of Loss received, claim finalized
- `open` - Claim is open and being worked
- `in_progress` - Active work on the claim
- `review` - Claim under review
- `approved` - Claim approved
- `closed` - Claim closed

**Draft Claim Workflow:**
The New Claim wizard creates a draft claim as soon as the first document (FNOL) is processed. As the user progresses through steps (Policy, Endorsements), the draft is automatically updated with extracted data. When the user clicks "Finalize Claim" on the Review step, the status changes from `draft` to `fnol`. This allows users to close the browser and return later to complete the claim creation process.

### Estimates
- `POST /api/estimates/calculate` - Calculate estimate without saving
- `POST /api/estimates` - Create and save estimate
- `GET /api/estimates` - List estimates
- `GET /api/estimates/:id` - Get specific estimate

### System/Admin
- `GET /api/system/status` - Database status and counts
- `POST /api/scrape/home-depot` - Trigger price scraper (demo only)
- `GET /api/scrape/prices` - View scraped prices
- `GET /api/scrape/config` - View scraper configuration

## Development Notes

### Running Locally
```bash
npm run dev  # Starts both frontend and backend
```

### Database Migrations
```bash
npm run db:push  # Push schema changes to database
```

### Adding New Pages
1. Create component in `client/src/pages/`
2. Register route in `client/src/App.tsx`
3. Add to navigation in `client/src/components/layout.tsx`

### Environment Variables

**Supabase Configuration (Required):**
- `SUPABASE_URL` - Supabase project URL (https://xxx.supabase.co)
- `SUPABASE_PUBLISHABLE_API_KEY` - Publishable key (sb_publishable_xxx) for client-side use
- `SUPABASE_SECRET_KEY` - Secret key (sb_secret_xxx) for server-side admin operations
- `SUPABASE_DATABASE_URL` - PostgreSQL connection string for direct database access

**Client-Side Variables (Vite):**
- `VITE_SUPABASE_URL` - Supabase URL for frontend
- `VITE_SUPABASE_PUBLISHABLE_API_KEY` - Publishable key for frontend

**Application Configuration:**
- `SESSION_SECRET` - Session encryption key (required in production)
- `OPENAI_API_KEY` - For AI features (optional)
- `APP_URL` - Application URL for redirects

**Legacy Variables (Deprecated - backwards compatible):**
- `DATABASE_URL` - Use SUPABASE_DATABASE_URL instead
- `SUPABASE_ANON_KEY` - Use SUPABASE_PUBLISHABLE_API_KEY instead
- `SUPABASE_SERVICE_ROLE_KEY` - Use SUPABASE_SECRET_KEY instead

See `.env.example` for complete configuration reference.
