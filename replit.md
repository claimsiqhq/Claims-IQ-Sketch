# Claims IQ - Property Insurance Claims Estimation Platform

## Overview
Claims IQ is a mobile-first web application designed for property insurance field adjusters. Its core purpose is to streamline property data capture, damage documentation, and estimate generation. The platform leverages voice-driven interfaces, AI for document extraction and intelligent briefings, and comprehensive estimation tools, aiming to modernize and accelerate the claims process. Key capabilities include voice-based sketching and damage scoping, AI-powered document processing, intelligent claim briefings, guided inspection workflows, multi-peril support, and integration with Xactimate for detailed estimates. The project's ambition is to provide a robust, efficient, and intelligent tool that significantly reduces the time and complexity involved in property insurance claims, improving accuracy and adjuster productivity.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
Claims IQ is built as a multi-tenant application, ensuring data isolation and role-based access for organizations.

### UI/UX Decisions
The application features a mobile-first design with a clean and intuitive interface.
- **Branding**: Uses "Primary Purple" (`#7763B7`) for accents and "Accent Gold" (`#C6A54E`) for highlights.
- **Typography**: Employs Work Sans for headings, Source Sans 3 for body text, and Space Mono for monospace elements.
- **Component Library**: Utilizes shadcn/ui for consistent and modern UI components, complemented by Framer Motion for animations.
- **Dashboard**: Provides a personalized "My Day" dashboard with AI insights, weather integration, and prioritized inspections.
- **Map View**: Offers a geographic visualization of claims with clustering, weather overlays, and route optimization.

### Technical Implementations
- **Voice Sketch**: Natural language processing (NLP) enables adjusters to verbally describe property layouts, which the system converts into structured data.
- **Voice Scope**: Allows adjusters to document damage by voice, automatically mapping descriptions to Xactimate line items and calculating quantities.
- **AI Document Extraction**: Uses AI to automatically extract key information from FNOL, policy documents, and endorsements, including policyholder data, coverage limits, deductibles, and peril types.
- **AI Claim Briefing**: Generates intelligent summaries, inspection strategies, peril-specific risks, and policy watch-outs based on processed documents.
- **Inspection Workflows**: Provides AI-generated, step-by-step guidance for inspections, detailing required photos, measurements, and tools for each phase.
- **Estimate Builder**: Features a hierarchical structure for building estimates (Estimate > Coverage > Structure > Area > Zone > Line Items) with automatic pricing calculations based on Xactimate data.
- **Photo Management**: Supports photo uploads with AI analysis for damage detection, quality scoring, and peril association, organizing them by room/area with GPS metadata.

### System Design Choices
- **Frontend**: Developed with React 19, TypeScript 5.6, Vite 7, Wouter for routing, Zustand for state management, and TanStack Query for server state.
- **Backend**: Built using Express.js 4.21, TypeScript 5.6, Drizzle ORM 0.39, and PostgreSQL (via Supabase).
- **Authentication**: Primarily uses session-based authentication with Passport.js, storing sessions in Supabase. Supabase JWT is available as an alternative.
- **Multi-Tenancy**: Implemented with an `organizationId` filter on all queries, enforced by tenant middleware and Supabase Row Level Security (RLS).
- **Database**: PostgreSQL database (Supabase) with over 50 tables, managing claims, estimates, users, organizations, documents, and Xactimate data.
- **API**: A comprehensive RESTful API for all platform functionalities, including authentication, claims, documents, estimates, pricing, voice features, weather, and organizational management.

## External Dependencies
- **OpenAI**: Utilized for GPT-4 Vision (document text extraction), GPT Realtime (voice features), and GPT-4 (briefings, workflows, suggestions).
- **Supabase**: Serves as the primary backend-as-a-service, providing PostgreSQL for the database, Storage for document and photo uploads, and its HTTP API for all backend queries.
- **National Weather Service API**: Integrated to fetch real-time weather data for inspection locations, used in the "My Day" dashboard.
- **Xactimate**: Integrated for its extensive database of over 20,000 line items and regional pricing adjustments, crucial for accurate estimate generation.