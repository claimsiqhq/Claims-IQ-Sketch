# Claims IQ - Property Insurance Claims Estimation Platform

## Overview
Claims IQ is a mobile-first web application for property insurance field adjusters. Its primary purpose is to streamline property data capture, damage documentation, and estimate generation. Key capabilities include voice-driven interfaces, AI-powered document processing, comprehensive estimation tools, and integration with external services. The business vision is to significantly improve the speed and accuracy of property damage claims handling, reducing manual effort and enhancing the adjuster's efficiency in the field.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Branding**: Primary Purple (`#7763B7`), Accent Gold (`#C6A54E`)
- **Typography**: Work Sans (headings), Source Sans 3 (body), Space Mono (monospace)
- **Design Approach**: Mobile-first responsive design.
- **Component Library**: `shadcn/ui` for standardized components.
- **Animations**: `Framer Motion` for enhanced user experience.

### Technical Implementations
Claims IQ is a full-stack application built with a clear separation between frontend and backend.

**Frontend:**
- **Framework**: React 19 with TypeScript 5.6
- **Build Tool**: Vite 7
- **Routing**: Wouter
- **State Management**: Zustand
- **Server State Management**: TanStack Query
- **Styling**: Tailwind CSS

**Backend:**
- **Framework**: Express.js 4.21 with TypeScript
- **ORM**: Drizzle ORM 0.39 for PostgreSQL
- **Authentication**: Passport.js for session management
- **File Uploads**: Multer

**Core Features & Design Patterns:**
- **AI-Powered Document Processing**: An intelligent pipeline classifies, extracts, and validates information from various claim documents (FNOL, policies, endorsements).
- **Unified Claim Context**: A service (`unifiedClaimContextService.ts`) aggregates all extracted and calculated claim data into a single, comprehensive context for AI and other features.
- **AI-Generated Briefings & Workflows**: Utilizes OpenAI to create personalized inspection strategies, policy watch-outs, depreciation guidance, and step-by-step inspection workflows tailored to peril types.
- **Voice-Driven Interfaces**:
    - **Voice Sketch**: Allows users to describe rooms and damages using natural language, which the system converts into floor plans and damage zones. It uses OpenAI Realtime API for recognition and a `geometry-engine.ts` for calculations. Supports wall-first editing with four operations: select_wall (by direction or index), update_wall_properties (length, height, exterior/missing status), move_wall (in/out/left/right by offset), and update_opening (modify door/window dimensions on specific walls).
    - **Voice Scope**: Maps natural language damage descriptions to Xactimate line items, automatically calculating quantities.
- **Estimate Builder**: A hierarchical structure for building estimates, integrating Xactimate pricing, regional adjustments, and export capabilities.
- **Multi-Tenancy**: Enforced at both application and database levels (`organizationId` filtering, Supabase RLS).
- **Authentication**: Primarily Passport.js sessions, with Supabase JWT as an alternative.

### Feature Specifications
- **My Day Dashboard**: Personalized home screen with schedules, route optimization, AI insights.
- **Document Upload & AI Extraction**: For FNOL, policies, and supporting documents, automatically extracting key details.
- **Claim Briefing**: AI-generated pre-inspection insights.
- **Inspection Workflows**: Guided, step-by-step processes for various inspection phases.
- **Map View**: Visualizes claims, weather overlays, and route planning.
- **Microsoft 365 Calendar Sync**: Two-way synchronization for inspection appointments.

## External Dependencies
- **Supabase**: Used for PostgreSQL database, secure file storage, and authentication.
- **OpenAI**: Powers AI features including document extraction (GPT-4o), claim briefings, and workflow generation (GPT-4), and real-time voice recognition.
- **Microsoft Graph API**: Integrates with Outlook calendar for scheduling and synchronization.
- **National Weather Service API**: Provides weather data for inspection planning.