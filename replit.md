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
- `server/services/auth.ts`: User authentication and password hashing
- `server/middleware/auth.ts`: Passport.js session configuration
- `server/scraper/homeDepot.ts`: Material price scraping (demo only - not production-ready)
- `server/routes.ts`: API endpoint registration

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
- `GET /api/claims/:id/endorsements` - Get claim endorsements

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
- `DATABASE_URL` - PostgreSQL connection string (required)
- `SESSION_SECRET` - Session encryption key (defaults to dev key)
- `OPENAI_API_KEY` - For AI features (optional)
