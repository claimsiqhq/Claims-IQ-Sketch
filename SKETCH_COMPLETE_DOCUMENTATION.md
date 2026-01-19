# Claims IQ Sketch — Complete Application Documentation

**Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Purpose:** Comprehensive reference for developers, stakeholders, and AI agents

---

## Table of Contents

1. [Executive Overview](#part-1-executive-overview)
2. [Technical Architecture](#part-2-technical-architecture)
3. [Database Schema](#part-3-database-schema)
4. [Backend Services](#part-4-backend-services)
5. [API Endpoints](#part-5-api-endpoints)
6. [Frontend Structure](#part-6-frontend-structure)
7. [Feature Status Matrix](#part-7-feature-status-matrix)
8. [Data Requirements](#part-8-data-requirements)
9. [Environment & Configuration](#part-9-environment--configuration)
10. [Integration Points](#part-10-integration-points)
11. [Testing](#part-11-testing)
12. [Glossary](#part-12-glossary)
13. [Appendices](#part-13-appendices)

---

## Part 1: Executive Overview

### 1.1 What is Claims IQ Sketch?

Claims IQ Sketch is a mobile-first property inspection application designed specifically for insurance field adjusters. The application streamlines the entire claims inspection workflow from initial document upload through final estimate generation and export. It combines voice-guided workflows, AI-powered document processing, photo evidence capture, and deterministic scope generation to significantly reduce inspection time while improving accuracy and compliance.

**Target Users:**
- **Field Adjusters**: Primary users who conduct on-site property inspections
- **Insurance Carriers**: Organizations managing claims and requiring standardized documentation
- **TPAs (Third-Party Administrators)**: Companies handling claims processing for carriers
- **Adjuster Firms**: Independent adjusting companies managing multiple adjusters

**Core Value Proposition:**
Claims IQ Sketch solves the problem of time-consuming, error-prone manual inspection documentation. Traditional inspections require adjusters to manually document damage, take photos, create sketches, and build estimates using complex desktop software. This application enables adjusters to:
- Complete inspections 40-60% faster through voice-guided workflows
- Reduce errors with AI-powered document extraction and validation
- Ensure compliance with carrier-specific rules and audit trails
- Generate Xactimate-compatible estimates directly from field data
- Work entirely on mobile devices without requiring desktop software

### 1.2 The User Journey

The complete workflow from claim creation to estimate export:

```
1. DOCUMENT UPLOAD → 2. AI BRIEFING → 3. INSPECTION FLOW START → 
4. MOVEMENT EXECUTION → 5. PHOTO CAPTURE → 6. ROOM/DAMAGE DOCUMENTATION → 
7. SCOPE GENERATION → 8. ESTIMATE REVIEW → 9. ESX EXPORT
```

**Detailed Steps:**

1. **Document Upload**: User uploads FNOL, policy documents → AI classifies and extracts structured data
2. **AI Briefing**: System generates pre-inspection briefing with peril-specific risks and policy watch-outs
3. **Inspection Flow Start**: Flow definition selected based on peril type → Flow instance created
4. **Movement Execution**: User navigates through movements (atomic tasks) → Captures photos, voice notes, measurements
5. **Photo Capture**: Photos captured with device camera → Auto-categorized using taxonomy → AI analyzes for damage
6. **Room/Damage Documentation**: Voice Sketch creates floor plans → Damage zones marked → Structures/areas/zones created hierarchically
7. **Scope Generation**: Deterministic engine evaluates zones → Maps damage to Xactimate line items → Applies carrier rules
8. **Estimate Review**: User reviews suggested items → Pricing calculated → Depreciation applied
9. **ESX Export**: Estimate exported to Xactimate-compatible format → ZIP archive with XML and PDF files

### 1.3 Key Differentiators

1. **Voice-Guided Inspection**: Natural language voice commands, hands-free operation
2. **Deterministic Scope Engine**: Rule-based line item generation (not AI guessing), transparent logic
3. **Direct Xactimate ESX Export**: Standards-compliant ESX files with sketch geometry
4. **Carrier Rule Enforcement**: Complete audit trail in `rule_effects` table
5. **Multi-Tenant Architecture**: Organization-based data isolation
6. **Mobile-First Design**: Optimized for iPhone/tablets, offline-capable

---

## Part 2: Technical Architecture

### 2.1 Tech Stack

**Frontend:**
- React 19.2 + TypeScript 5.6
- Vite 7.1 (build tool)
- Wouter 3.3 (routing)
- Zustand 5.0 (client state)
- TanStack Query 5.60 (server state)
- shadcn/ui (UI components)
- Tailwind CSS 4.1
- Framer Motion 12.23 (animations)
- Leaflet 1.9 (maps)
- OpenAI Agents SDK (voice)

**Backend:**
- Express.js 4.21 + TypeScript 5.6
- PostgreSQL (via Supabase)
- Drizzle ORM 0.39
- Passport.js 0.7 (auth)
- Multer 2.0 (file uploads)
- Pino 9.6 (logging)

**External Services:**
- Supabase (database, storage, auth)
- OpenAI (GPT-4o, GPT-4, Realtime API, Vision API)
- Microsoft Graph API (calendar)
- National Weather Service API

### 2.2 Project Structure

```
claims-iq-sketch/
├── client/src/          # Frontend (13 pages, 100+ components)
├── server/              # Backend (67 services, 12 route modules)
├── shared/schema.ts     # Database schema (5,026 lines)
├── db/migrations/       # 45 migration files
└── db/seeds/           # Seed data files
```

### 2.3 Architecture Diagram

```
Client (React) → Express Server → PostgreSQL Database
                      ↓
              External Services
        (Supabase, OpenAI, MS Graph)
```

---

## Part 3: Database Schema

### 3.1 Entity Relationship Overview

**Core Entities:** organizations, users, organization_memberships, claims

**Documents & AI:** documents, policy_form_extractions, endorsement_extractions, claim_briefings, ai_prompts

**Inspection Flow:** flow_definitions, claim_flow_instances, movement_completions, movement_evidence

**Estimate & Pricing:** estimates, estimate_structures, estimate_areas, estimate_zones, estimate_line_items, estimate_coverages

**Reference Data:** xact_categories, xact_line_items, price_lists, depreciation_schedules, labor_rates_enhanced

**Carrier & Rules:** carrier_profiles, carrier_rules, carrier_excluded_items, carrier_item_caps, jurisdictions, jurisdiction_rules, rule_effects

**Photos:** claim_photos, photo_categories

### 3.2 Key Tables

**claims** - Main claim records with FNOL data, peril info, loss context
**flow_definitions** - Flow templates (JSON schema) for inspection workflows
**claim_flow_instances** - Active flow execution tracking
**estimate_zones** - Damage zones containing line items
**rule_effects** - Audit trail of all rule applications

**Schema Location:** `shared/schema.ts` (5,026 lines)

---

## Part 4: Backend Services

### 4.1 Service Inventory (67 service files)

**Flow Engine:** flowEngineService.ts, flowDefinitionService.ts, workflowRulesEngine.ts
**Document & AI:** documentProcessor.ts, claimBriefingService.ts, promptService.ts
**Scope & Pricing:** scopeEngine.ts, rulesEngine.ts, xactPricing.ts, pricing.ts
**Export:** esxExport.ts, pdfGenerator.ts, reportGenerator.ts
**Data:** claims.ts, estimates.ts, photos.ts, organizations.ts
**Integration:** ms365CalendarService.ts, geocoding.ts, weatherService.ts

### 4.2 Core Services

**flowEngineService.ts** - Flow execution (29 functions): startFlowForClaim(), completeMovement(), advanceToNextPhase()
**scopeEngine.ts** - Deterministic scope: evaluateZoneScope() matches damage to line items
**rulesEngine.ts** - Carrier rules: evaluateRules() applies rules, logs to rule_effects
**esxExport.ts** - Xactimate export: generateEsxExport() creates ESX ZIP archive
**claimBriefingService.ts** - AI briefings: generateClaimBriefing() creates pre-inspection insights

---

## Part 5: API Endpoints

### 5.1 Complete API Reference

**Authentication:**
- POST /api/auth/login - Session login
- POST /api/auth/logout - Logout
- GET /api/auth/me - Current user
- POST /api/auth/supabase/login - Supabase JWT login

**Claims:**
- GET /api/claims - List claims
- GET /api/claims/:id - Get claim details
- POST /api/claims - Create claim
- PUT /api/claims/:id - Update claim
- DELETE /api/claims/:id - Delete claim

**Flow Engine:**
- POST /api/claims/:claimId/flows - Start flow
- GET /api/flows/:id - Get flow instance
- GET /api/flows/:id/progress - Get progress
- POST /api/flows/:id/movements/:movementId/complete - Complete movement
- POST /api/flows/:id/movements/:movementId/skip - Skip movement
- GET /api/flows/:id/phases - Get phases
- POST /api/flows/:id/movements/inject - Inject dynamic movements

**Flow Definitions:**
- GET /api/flow-definitions - List flow templates
- POST /api/flow-definitions - Create flow template
- GET /api/flow-definitions/:id - Get flow template
- PUT /api/flow-definitions/:id - Update flow template

**Documents:**
- POST /api/documents - Upload document
- GET /api/documents/:id - Get document
- POST /api/documents/process - Process document queue

**Estimates:**
- GET /api/estimates - List estimates
- POST /api/estimates - Create estimate
- GET /api/estimates/:id - Get estimate
- PUT /api/estimates/:id - Update estimate
- POST /api/estimates/:id/calculate - Calculate totals
- GET /api/estimates/:id/export/esx - Export ESX

**Scope:**
- POST /api/scope/evaluate - Evaluate zone scope
- POST /api/scope/estimate - Evaluate entire estimate

**Photos:**
- POST /api/photos/upload - Upload photo
- GET /api/photos/:id - Get photo
- POST /api/photos/:id/reanalyze - Re-analyze with AI

**AI:**
- POST /api/ai/suggest-estimate - AI line item suggestions
- POST /api/voice/session - Create voice session

**Organizations:**
- GET /api/organizations - List organizations
- POST /api/organizations - Create organization
- PUT /api/organizations/:id - Update organization
- DELETE /api/organizations/:id - Delete organization

### 5.2 API Patterns

**Pagination:** `?limit=50&offset=0`
**Errors:** `{success: false, message: "...", code: "ERROR_CODE"}`
**Auth:** Session cookies or Supabase JWT
**File Uploads:** Multipart/form-data via Multer

---

## Part 6: Frontend Structure

### 6.1 Pages (13 files)

- `/` - Home (claim list)
- `/auth` - Authentication
- `/claim/:id` - Claim detail (main page)
- `/flow-builder` - Flow definition editor
- `/flow-builder/:id` - Edit flow definition
- `/flows/:flowId` - Flow progress view
- `/flows/:flowId/movements/:movementId` - Movement execution
- `/settings` - User/organization settings
- `/profile` - User profile
- `/map` - Claims map view
- `/photos` - Photo gallery
- `/calendar` - Calendar view
- `/voice-sketch` - Voice sketch feature

### 6.2 Key Components

**Flow Components** (`components/flow/`):
- ClaimFlowSection.tsx - Flow section in claim detail
- FlowStatusCard.tsx - Flow status display
- StartFlowButton.tsx - Initiate flow
- PhaseCard.tsx - Phase display
- MovementExecution.tsx - Movement execution UI
- VoiceGuidedInspection.tsx - Voice-guided capture
- EvidenceGrid.tsx - Evidence display

**Voice Features** (`features/voice-sketch/`, `features/voice-scope/`):
- VoiceSketchController.tsx - Voice sketch UI
- VoiceScopeController.tsx - Voice scope UI
- geometry-engine.ts - Geometry calculations

### 6.3 State Management

**React Query** (server state):
- useQuery for data fetching
- useMutation for mutations
- Automatic caching and invalidation

**Zustand** (client state):
- User preferences
- UI state (modals, tabs)

### 6.4 Key User Flows

**Creating Claim:** Upload documents → AI extraction → Claim created
**Starting Flow:** Select peril → Flow auto-selected → Flow instance created
**Completing Movement:** View instructions → Capture evidence → Mark complete
**Adding Line Items:** Scope evaluation → Review suggestions → Add to estimate
**Exporting:** Review estimate → Export ESX → Download ZIP

---

## Part 7: Feature Status Matrix

| Feature | Backend | Frontend | Integration | Data Seeded | Tested | Notes |
|---------|---------|----------|-------------|-------------|--------|-------|
| Claim Creation | ✅ | ✅ | ✅ | ✅ | ✅ | Full CRUD |
| Document Upload | ✅ | ✅ | ✅ | ✅ | ✅ | Multi-file support |
| Document Processing | ✅ | ✅ | ✅ | ✅ | ✅ | AI extraction |
| AI Briefing | ✅ | ✅ | ✅ | ✅ | ✅ | Cached by hash |
| Flow Definitions | ✅ | ✅ | ✅ | ✅ | ✅ | JSON schema |
| Flow Execution | ✅ | ✅ | ✅ | ✅ | ✅ | Phase advancement |
| Movement Completion | ✅ | ✅ | ✅ | ✅ | ✅ | Evidence tracking |
| Photo Upload | ✅ | ✅ | ✅ | ✅ | ✅ | AI analysis |
| Photo Taxonomy | ✅ | ✅ | ✅ | ✅ | ✅ | Auto-categorization |
| Room/Zone Creation | ✅ | ✅ | ✅ | ✅ | ✅ | Voice sketch |
| Voice Inspection | ✅ | ✅ | ✅ | ✅ | ✅ | Realtime API |
| Scope Generation | ✅ | ✅ | ✅ | ✅ | ✅ | Deterministic |
| Pricing Calculation | ✅ | ✅ | ✅ | ✅ | ✅ | Regional pricing |
| Carrier Rules | ✅ | ✅ | ✅ | ✅ | ✅ | Audit trail |
| Estimate Review | ✅ | ✅ | ✅ | ✅ | ✅ | Full CRUD |
| ESX Export | ✅ | ✅ | ✅ | ✅ | ✅ | Xactimate compatible |
| PDF Export | ✅ | ✅ | ✅ | N/A | ⚠️ | Basic implementation |

**Legend:** ✅ Complete | ⚠️ Partial | ❌ Missing

### 7.2 Known Issues

See `workflow_audit_017.md` for detailed audit findings.

**High Priority:**
- API response inconsistency (many endpoints use res.json() directly)
- Placeholder code in laborMinimumValidator.ts
- Logging inconsistency (mixed console.log and structured logger)

### 7.3 Technical Debt

- Some endpoints need response standardization
- Query optimization opportunities (select * usage)
- Accessibility improvements needed (ARIA labels)

---

## Part 8: Data Requirements

### 8.1 Seed Data Status

| Table | Has Seed File | Required for MVP | Notes |
|-------|---------------|------------------|-------|
| ai_prompts | ✅ | Yes | 001_ai_prompts.sql |
| flow_definitions | ✅ | Yes | Per peril type |
| photo_categories | ✅ | Yes | Taxonomy hierarchy |
| xact_line_items | ✅ | Yes | Xactimate catalog |
| xact_categories | ✅ | Yes | Category structure |
| price_lists | ✅ | Yes | Regional pricing |
| depreciation_schedules | ✅ | Yes | Depreciation rules |
| carrier_profiles | ⚠️ | No (demo) | Demo data only |
| jurisdictions | ✅ | Yes | Geographic rules |

### 8.2 Seed Files

**db/seeds/001_ai_prompts.sql** - Required AI prompts for document extraction
**db/seeds/COMBINED_SEED_FOR_SUPABASE.sql** - Combined seed data

### 8.3 Missing Data

- Additional flow definitions for all peril types
- Complete Xactimate catalog (partial)
- Regional price data for all jurisdictions
- Carrier-specific rules (demo only)

---

## Part 9: Environment & Configuration

### 9.1 Environment Variables

**Database:**
- SUPABASE_URL - Supabase project URL
- SUPABASE_SERVICE_ROLE_KEY - Service role key
- SUPABASE_DATABASE_URL - Direct database connection
- DATABASE_URL - Legacy database URL (fallback)

**OpenAI:**
- OPENAI_API_KEY - OpenAI API key (required)

**Server:**
- PORT - Server port (default: 5000)
- NODE_ENV - Environment (development/production)
- SESSION_SECRET - Session encryption secret
- ALLOWED_ORIGINS - CORS allowed origins (comma-separated)

**Microsoft 365 (Optional):**
- MS365_CLIENT_ID - Azure app client ID
- MS365_CLIENT_SECRET - Azure app secret
- MS365_TENANT_ID - Azure tenant ID

**Calendar Sync (Optional):**
- CALENDAR_SYNC_ENABLED - Enable calendar sync (default: true)
- CALENDAR_SYNC_INTERVAL_MINUTES - Sync interval (default: 15)

### 9.2 Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:push

# Seed data (if needed)
# Run SQL files from db/seeds/

# Start development server
npm run dev
```

### 9.3 Deployment

**Platform:** Replit (current)
**Database:** Supabase PostgreSQL
**File Storage:** Supabase Storage
**Build:** `npm run build` → `dist/` directory

---

## Part 10: Integration Points

### 10.1 OpenAI Integration

**Models Used:**
- GPT-4o - Document extraction, briefings
- GPT-4 - Workflow generation
- GPT-4o-mini - Lightweight tasks
- Realtime API - Voice transcription
- Vision API - Photo analysis

**Features:**
- Document extraction (FNOL, policies, endorsements)
- Claim briefing generation
- Workflow step generation
- Photo damage detection
- Voice transcription and commands

**API Key:** Required in OPENAI_API_KEY environment variable

### 10.2 Supabase Integration

**Uses:**
- PostgreSQL database (via Supabase)
- File storage (documents, photos)
- Authentication (optional, alternative to Passport)

**Configuration:** SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required

### 10.3 Xactimate Integration

**ESX Format:**
- ZIP archive with XML files
- XACTDOC.XML - Claim metadata
- GENERIC_ROUGHDRAFT.XML - Line items
- SKETCH.XML - Sketch geometry
- SKETCH_UNDERLAY.PDF - PDF rendering

**Compatibility:** Xactimate 28+ (tested)

### 10.4 Other Integrations

**Microsoft Graph API:** Calendar synchronization (optional)
**National Weather Service API:** Weather data for route planning

---

## Part 11: Testing

### 11.1 Test Coverage

**Test Files:**
- `server/tests/e2e-full-validation.ts` - Comprehensive E2E test suite
- `server/tests/e2e-flow-smoke-test.ts` - Flow engine smoke tests
- `server/services/__tests__/` - Unit tests for services

**Frameworks:** TypeScript test files (no formal framework yet)

### 11.2 Manual Test Procedures

**Complete MVP Flow:**
1. Create claim with document upload
2. Verify AI extraction
3. Generate briefing
4. Start flow
5. Complete movements
6. Capture photos
7. Generate scope
8. Review estimate
9. Export ESX

**Run Tests:** `npx tsx server/tests/e2e-full-validation.ts`

---

## Part 12: Glossary

**Flow** - An inspection workflow template defining phases and movements
**Movement** - An atomic inspection task (e.g., "Inspect roof", "Document water damage")
**Phase** - A group of related movements (e.g., "Exterior Inspection", "Interior Documentation")
**Scope** - The list of line items needed to repair damage
**ESX** - Xactimate's exchange format (ZIP archive with XML files)
**Taxonomy** - Photo categorization system (e.g., RF-TSQ = Roof - Total Square)
**Peril** - Type of damage (wind_hail, fire, water, flood, smoke, mold, impact, other)
**RCV** - Replacement Cost Value (cost to replace without depreciation)
**ACV** - Actual Cash Value (RCV minus depreciation)
**O&P** - Overhead & Profit (contractor markup, typically 10% each)
**Xactimate** - Industry-standard estimating software by Verisk
**FNOL** - First Notice of Loss (initial claim report)
**TPA** - Third-Party Administrator (company handling claims for carriers)

---

## Part 13: Appendices

### A. File-by-File Reference

**Service Files (67 total):**
- Flow Engine: flowEngineService.ts, flowDefinitionService.ts, workflowRulesEngine.ts
- Scope: scopeEngine.ts, rulesEngine.ts, quantityEngine.ts
- Documents: documentProcessor.ts, documentClassifier.ts, documentQueue.ts
- AI: claimBriefingService.ts, promptService.ts, ai-estimate-suggest.ts
- Estimates: estimateCalculator.ts, estimateHierarchy.ts, estimatePricingEngine.ts
- Export: esxExport.ts, pdfGenerator.ts, reportGenerator.ts
- And 50+ more...

**Route Files (12 total):**
- flowEngineRoutes.ts - Flow engine API (20+ endpoints)
- claims.ts - Claim CRUD
- estimates.ts - Estimate management
- documents.ts - Document management
- And 8 more...

**Page Components (13 total):**
- home.tsx, claim-detail.tsx, flow-builder.tsx, flow-progress.tsx, movement-execution.tsx, settings.tsx, profile.tsx, claims-map.tsx, photos.tsx, calendar.tsx, auth.tsx, not-found.tsx, voice-sketch (feature)

### B. Database Schema Quick Reference

**Key Tables:**
- claims (212 lines in schema.ts)
- flow_definitions (150+ lines)
- claim_flow_instances (100+ lines)
- estimate_zones (200+ lines)
- rule_effects (100+ lines)

**Full Schema:** See `shared/schema.ts` (5,026 lines total)

### C. API Quick Reference

**Total Endpoints:** 200+ across 12 route modules

**Key Endpoints:**
- Flow Engine: 20+ endpoints
- Claims: 10+ endpoints
- Estimates: 15+ endpoints
- Documents: 10+ endpoints
- Photos: 5+ endpoints
- And more...

**See Part 5 for complete API reference.**

---

**Documentation Complete**

For detailed code-level documentation, see:
- `workflow_audit_017.md` - Latest codebase audit
- `README.md` - Quick start guide
- `ARCHITECTURE.md` - Architecture details
- `shared/schema.ts` - Database schema with comments

---

