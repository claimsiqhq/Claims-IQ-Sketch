# Claims IQ - Property Insurance Claims Estimation Platform

## Overview

Claims IQ is a modern, mobile-first web application for property insurance claims estimation. It provides a unified platform where field adjusters can capture property data, document damage, and generate estimates in a single workflow. The application features an interactive floor plan sketch tool, damage zone documentation, and a comprehensive line item pricing system with regional cost adjustments.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- `server/scraper/homeDepot.ts`: Material price scraping for cost validation
- `server/routes.ts`: API endpoint registration

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` for shared type definitions
- **Migrations**: Drizzle Kit with output to `./migrations`
- **Connection**: Connection pool via `pg` package

The database schema supports:
- Organizations (carriers, adjusting firms, contractors)
- Users with role-based access
- Geographic pricing regions with indices
- Line item catalog with hierarchical categories
- Material, labor, and equipment components

### Build and Deployment
- **Client Build**: Vite outputs to `dist/public`
- **Server Build**: esbuild bundles server to `dist/index.cjs`
- **Production**: Node.js serves static files and API from single process
- **Development**: Concurrent Vite dev server with Express backend

## External Dependencies

### Database
- PostgreSQL database (required, connection via `DATABASE_URL` environment variable)
- Drizzle ORM for database operations
- connect-pg-simple for session storage capability

### Third-Party Services
- No external authentication provider (mock auth for PoC)
- Material pricing scraper designed for Home Depot (research/validation purposes)

### Key NPM Packages
- Radix UI primitives for accessible components
- date-fns for date formatting
- drizzle-zod for schema validation
- embla-carousel-react for carousels
- class-variance-authority for variant styling
- Lucide React for icons

### API Structure
- `GET /api/line-items`: Search line items with filtering
- `GET /api/line-items/categories`: Retrieve category hierarchy
- `POST /api/pricing/calculate`: Calculate prices with regional adjustments
- `POST /api/scrape/home-depot`: Trigger material price scraping job