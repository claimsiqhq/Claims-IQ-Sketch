# Claims IQ Sketch - Complete Codebase Inventory Audit

> **Generated:** 2026-01-18
> **Schema Version:** 5026 lines (shared/schema.ts)
> **Total Services:** 60+ TypeScript files
> **Total API Endpoints:** 230+

---

## Table of Contents

1. [Database Schema - All Tables](#1-database-schema---all-tables)
2. [Services Inventory](#2-services-inventory)
3. [API Routes](#3-api-routes)
4. [Frontend Structure](#4-frontend-structure)
5. [Seed Data](#5-seed-data)
6. [Package Dependencies](#6-package-dependencies)
7. [Architecture Summary](#7-architecture-summary)

---

## 1. Database Schema - All Tables

### Core Entities

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Multi-tenant organization (carrier, TPA, contractor) | id, name, slug, type, settings, status |
| `users` | User accounts with roles | id, username, email, password, role, currentOrganizationId, preferences |
| `organization_memberships` | User-to-org relationships | userId, organizationId, role, status |

### Claims & Loss

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `claims` | FNOL data and claim tracking | id, claimNumber, carrierId, insuredName, propertyAddress, dateOfLoss, primaryPeril, secondaryPerils, status, lossContext |
| `claim_briefings` | AI-generated claim briefings for adjusters | claimId, peril, sourceHash, briefingJson, status, model |
| `claim_structures` | Building structures for a claim | claimId, name, structureType, stories, yearBuilt |
| `claim_rooms` | Rooms within structures | claimId, structureId, name, roomType, floorLevel, widthFt, lengthFt, polygon |
| `claim_damage_zones` | Damage areas from Voice Sketch | claimId, roomId, damageType, category, affectedWalls, severity |
| `claim_photos` | Photos with AI analysis & taxonomy | claimId, storagePath, publicUrl, aiAnalysis, taxonomyPrefix, flowInstanceId |
| `claim_checklists` | Claim processing checklists | claimId, peril, severity, totalItems, completedItems |
| `claim_checklist_items` | Individual checklist items | checklistId, title, category, status, required |

### Policy & Documents

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `documents` | Uploaded documents (FNOL, policy, etc.) | claimId, name, type, category, storagePath, extractedData, processingStatus |
| `policy_form_extractions` | Comprehensive policy extraction | claimId, documentId, policyFormCode, extractionData, sectionI, sectionII |
| `endorsement_extractions` | Policy endorsement modifications | claimId, formCode, endorsementType, precedencePriority, modifications |

### Estimates & Pricing

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `estimates` | Estimate header with totals | claimId, status, subtotal, overheadPct, profitPct, taxPct, grandTotal |
| `estimate_line_items` | Individual line items | estimateId, lineItemCode, quantity, unit, unitPrice, subtotal |
| `estimate_coverages` | Coverage-level grouping (Dwelling, Contents) | estimateId, coverageType, policyLimit, rcvTotal, acvTotal |
| `estimate_structures` | Structure hierarchy in estimate | estimateId, coverageId, name, totalSf, rcvTotal |
| `estimate_areas` | Area grouping (exterior, interior, roofing) | structureId, name, areaType, totalSf |
| `estimate_zones` | Room-level zones with Xactimate compatibility | areaId, name, zoneType, lengthFt, widthFt, polygonFt, damageType |
| `estimate_totals` | Pre-calculated estimate totals | estimateId, lineItemTotal, taxTotal, rcvTotal, acvTotal, netClaim |
| `zone_openings` | Doors/windows in zone geometry | zoneId, openingType, wallIndex, widthFt, heightFt |
| `zone_connections` | Room-to-room connections | fromZoneId, toZoneId, connectionType |
| `estimate_missing_walls` | Wall deductions | zoneId, openingType, widthFt, heightFt |
| `estimate_subrooms` | Closets and bump-outs | zoneId, name, subroomType, lengthFt, widthFt |
| `damage_zones` | (Legacy) Basic estimate zones | estimateId, name, roomType, squareFootage, damageType |
| `damage_areas` | (Legacy/deprecated) Spatial hierarchy | estimateId, name, areaType, measurements |

### Carrier & Rules

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `carrier_profiles` | Carrier configuration (O&P, tax, depreciation) | code, name, opThreshold, opTradeMinimum, carrierInspectionOverlays |
| `carrier_rules` | Carrier-specific estimation rules | carrierProfileId, ruleCode, ruleType, conditions, effectValue |
| `carrier_excluded_items` | Line items excluded by carrier | carrierProfileId, lineItemCode, exclusionReason |
| `carrier_item_caps` | Quantity/cost caps per carrier | carrierProfileId, lineItemCode, maxQuantity, maxUnitPrice |
| `jurisdictions` | State/regional rules (tax, O&P, labor) | code, stateCode, salesTaxRate, opAllowed, licensedTradesOnly |
| `jurisdiction_rules` | State-specific rules | jurisdictionId, ruleCode, ruleType, effectValue |
| `rule_effects` | Audit trail for rule applications | estimateId, ruleSource, ruleCode, effectType, explanationText |

### Pricing Reference Data

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `xact_categories` | Xactimate category codes | catId, code, description, laborDistPct, materialDistPct |
| `xact_line_items` | Xactimate line item catalog | itemId, categoryCode, fullCode, description, unit, laborEfficiency |
| `xact_components` | Xactimate components (materials, labor) | componentType, code, description, amount |
| `price_lists` | Regional price lists | code, regionCode, effectiveDate, baseMultiplier |
| `coverage_types` | Coverage type definitions (A, B, C, D) | code, name, defaultDeductible |
| `tax_rates` | Regional tax rates | regionCode, taxType, rate, appliesTo |
| `depreciation_schedules` | Depreciation by item category | categoryCode, itemType, usefulLifeYears, maxDepreciationPct |
| `regional_multipliers` | Regional cost adjustments | regionCode, materialMultiplier, laborMultiplier |
| `labor_rates_enhanced` | Labor rates by trade | tradeCode, tradeName, baseHourlyRate, regionCode |

### Flow Engine (NEW System - ACTIVE)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `flow_definitions` | Flow templates (JSON schema) | id, name, perilType, flowJson, isActive |
| `claim_flow_instances` | Active flow per claim | claimId, flowDefinitionId, currentPhaseId, status, flowState |
| `movement_completions` | Completed movements with data | flowInstanceId, movementId, phaseId, completedData, completedAt |
| `movement_evidence` | Photos/files attached to movements | completionId, evidenceType, storagePath, metadata |

### Inspection Workflow (OLD System - DEPRECATED)

| Table | Purpose | Status |
|-------|---------|--------|
| `inspection_workflows` | Main workflow table | **DEPRECATED** - Tables exist but empty |
| `inspection_workflow_steps` | Individual steps | **DEPRECATED** |
| `inspection_workflow_assets` | Step assets | **DEPRECATED** |
| `inspection_workflow_rooms` | Room expansion | **DEPRECATED** |

### Other Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ai_prompts` | Editable AI prompt storage | promptKey, systemPrompt, userPromptTemplate, model, temperature |
| `photo_categories` | Photo taxonomy definitions | prefix, parentPrefix, name, minRequired, perilTypes |
| `audio_observations` | Voice notes transcription | claimId, storagePath, transcription, processingStatus |

---

## 2. Services Inventory

### Core Flow & Workflow Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `flowEngineService.ts` | **ACTIVE** - Phase/movement-based inspection flows | `getFlowInstance()`, `completeMovement()`, `skipMovement()` |
| `flowDefinitionService.ts` | Flow template CRUD and validation | `createFlowDefinition()`, `validateFlowDefinition()` |
| `workflowRulesEngine.ts` | Deterministic workflow step generation | `evaluateRules()`, `mutateWorkflow()`, `detectEvidenceGaps()` |
| `voiceInspectionService.ts` | Voice-guided flow navigation | `startSession()`, `processCommand()`, `generateGuidance()` |

### AI & Document Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `claimBriefingService.ts` | Peril-aware claim briefings | `generateClaimBriefing()`, `getCachedBriefing()` |
| `documentProcessor.ts` | FNOL/Policy/Endorsement extraction pipeline | `processFNOL()`, `processPolicy()`, `processEndorsement()` |
| `documentClassifier.ts` | AI document type detection | `classifyDocument()`, `detectDocumentType()` |
| `promptService.ts` | AI prompt management | `getPrompt()`, `executePrompt()` |
| `ai-estimate-suggest.ts` | AI estimate suggestions | `suggestLineItems()`, `quickSuggest()` |

### Estimate & Pricing Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `estimateCalculator.ts` | Estimate cost calculations | `calculateEstimate()`, `calculateLineItemCost()` |
| `scopeEngine.ts` | Deterministic line item applicability | `evaluateScope()`, `getApplicableLineItems()` |
| `scopeQuantityEngine.ts` | Scope + quantity determination | `determineScopeAndQuantity()` |
| `quantityEngine.ts` | Safe formula evaluation | `parseQuantityFormula()`, `evaluateFormula()` |
| `pricing.ts` | Material/labor/equipment pricing | `calculateMaterialCost()`, `calculateLaborCost()` |
| `xactPricing.ts` | Xactimate price lookup | `getXactPrice()`, `calculateWithMultipliers()` |
| `depreciationEngine.ts` | RCV/ACV/depreciation calculation | `calculateDepreciation()`, `calculateSettlement()` |
| `rulesEngine.ts` | Carrier/jurisdiction rule evaluation | `evaluateRules()`, `applyCarrierRules()` |
| `estimateValidator.ts` | Estimate validation | `validateEstimate()`, `checkRequirements()` |
| `laborMinimumValidator.ts` | Labor minimum thresholds | `validateLaborMinimums()` |

### Sketch & Geometry Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `sketchService.ts` | Sketch geometry persistence | `getSketch()`, `saveSketch()`, `calculateZoneDimensions()` |
| `sketchTools.ts` | Sketch manipulation utilities | `addRoom()`, `addOpening()`, `calculateArea()` |
| `zoneMetrics.ts` | Zone metric computation | `computeZoneMetrics()`, `getMetricValue()` |

### Export & Report Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `pdfGenerator.ts` | HTML to PDF conversion (Puppeteer) | `generateEstimatePdf()` |
| `reportGenerator.ts` | PDF reports and ESX exports | `generatePdfReport()`, `generateESXExport()` |
| `esxExport.ts` | Xactimate ESX file generation | `exportToEsx()`, `buildEsxXml()` |

### Data Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `claims.ts` | Claim CRUD operations | `getClaimWithDocuments()`, `updateClaim()` |
| `documents.ts` | Document storage management | `uploadDocument()`, `getDocument()` |
| `photos.ts` | Photo management | `uploadPhoto()`, `getPhotos()` |
| `rooms.ts` | Room management | `addRoom()`, `getRooms()` |
| `organizations.ts` | Organization management | `getOrganization()`, `updateOrganization()` |
| `auth.ts` | Authentication service | `login()`, `logout()`, `validateSession()` |

### Integration Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `geocoding.ts` | Address geocoding | `geocodeAddress()`, `reverseGeocode()` |
| `weatherService.ts` | Weather data lookup | `getWeatherForDate()` |
| `ms365AuthService.ts` | Microsoft 365 OAuth | `getAuthUrl()`, `exchangeToken()` |
| `ms365CalendarService.ts` | Calendar integration | `getCalendarEvents()`, `createEvent()` |
| `calendarSyncScheduler.ts` | Calendar sync scheduling | `scheduleSync()` |
| `routeOptimization.ts` | Inspection route optimization | `optimizeRoute()` |
| `catastropheIntelligence.ts` | CAT event tracking | `getCatEvents()`, `matchClaimToCat()` |

### Context & Analysis Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `unifiedClaimContextService.ts` | Merge FNOL+Policy+Endorsements | `buildUnifiedClaimContext()` |
| `effectivePolicyService.ts` | Resolve effective policy rules | `resolveEffectivePolicy()` |
| `coverageAnalysisService.ts` | Coverage gap analysis | `analyzeCoverage()` |
| `policyValidationService.ts` | Policy validation | `validateAgainstPolicy()` |
| `carrierOverlayService.ts` | Carrier inspection overlays | `getCarrierOverlay()` |
| `perilNormalizer.ts` | Peril inference without bias | `inferPeril()`, `getSecondaryPerils()` |
| `perilAwareContext.ts` | Peril-specific context | `getPerilContext()` |
| `sublimitTracker.ts` | Coverage sublimit tracking | `checkSublimits()` |
| `myDayAnalysis.ts` | Adjuster daily summary | `getMyDaySummary()` |

### Specialized Services

| Service | Purpose | Key Functions |
|---------|---------|---------------|
| `photoTaxonomyService.ts` | Photo categorization | `getAllCategories()`, `suggestCategories()` |
| `audioObservationService.ts` | Voice note transcription | `transcribeAudio()`, `processObservation()` |
| `checklistTemplateService.ts` | Checklist templates | `getTemplate()`, `generateChecklist()` |
| `voiceCodeMapper.ts` | Voice command to code mapping | `mapVoiceToCode()` |
| `voice-session.ts` | Voice session management | `createSession()`, `processAudio()` |
| `documentQueue.ts` | Document processing queue | `enqueue()`, `process()` |
| `scopeAssemblyService.ts` | Scope assembly from geometry | `assembleScope()` |
| `estimateHierarchy.ts` | Estimate hierarchy management | `buildHierarchy()` |
| `estimateSubmission.ts` | Estimate submission workflow | `submitEstimate()` |

---

## 3. API Routes

### Authentication (`/api/auth`, `/api/users`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Session-based login |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/supabase/login` | Supabase auth |
| POST | `/api/auth/supabase/register` | Supabase registration |
| PUT | `/api/users/profile` | Update profile |
| PUT | `/api/users/preferences` | Update preferences |

### Claims (`/api/claims`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/claims` | Create claim |
| GET | `/api/claims` | List claims |
| GET | `/api/claims/stats` | Claim statistics |
| GET | `/api/claims/map` | Claims for map view |
| GET | `/api/claims/:id` | Get claim |
| PUT | `/api/claims/:id` | Update claim |
| DELETE | `/api/claims/:id` | Delete claim |
| POST | `/api/claims/:id/rooms` | Add room |
| GET | `/api/claims/:id/rooms` | Get rooms |
| GET | `/api/claims/:id/scope-items` | Get scope items |

### Flow Engine (`/api/flows`, `/api/claims/:claimId/flows`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/claims/:claimId/flows` | Start flow |
| GET | `/api/claims/:claimId/flows` | Get active flow |
| GET | `/api/flows/:id` | Get flow state |
| GET | `/api/flows/:id/progress` | Get progress |
| GET | `/api/flows/:id/next` | Next movement |
| POST | `/api/flows/:id/movements/:movementId/complete` | Complete movement |
| POST | `/api/flows/:id/movements/:movementId/skip` | Skip movement |
| POST | `/api/flows/:id/movements/:movementId/evidence` | Attach evidence |
| POST | `/api/flows/:id/rooms` | Add dynamic room movements |
| POST | `/api/flows/:id/advance-phase` | Advance to next phase |

### Flow Definitions (`/api/flow-definitions`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/flow-definitions` | List definitions |
| GET | `/api/flow-definitions/:id` | Get definition |
| POST | `/api/flow-definitions` | Create definition |
| PUT | `/api/flow-definitions/:id` | Update definition |
| DELETE | `/api/flow-definitions/:id` | Delete definition |
| POST | `/api/flow-definitions/validate` | Validate JSON |

### Estimates (`/api/estimates`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/estimates` | Create estimate |
| GET | `/api/estimates` | List estimates |
| GET | `/api/estimates/:id` | Get estimate |
| PUT | `/api/estimates/:id` | Update estimate |
| POST | `/api/estimates/:id/line-items` | Add line item |
| POST | `/api/estimates/:id/submit` | Submit estimate |
| GET | `/api/estimates/:id/report/pdf` | Generate PDF |
| GET | `/api/estimates/:id/export/esx` | Export ESX |
| GET | `/api/estimates/:id/export/csv` | Export CSV |
| GET | `/api/estimates/:id/rule-effects` | Get rule effects |

### Documents (`/api/documents`, `/api/claims/:claimId/documents`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/claims/:claimId/documents` | Upload document |
| GET | `/api/claims/:claimId/documents` | List documents |
| GET | `/api/documents/:id` | Get document |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/documents/:id/process` | Trigger AI processing |

### AI Services (`/api/ai`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/ai/suggest-estimate` | Full estimate suggestions |
| POST | `/api/ai/quick-suggest` | Quick line item suggestions |
| GET | `/api/ai/search-line-items` | Natural language search |
| POST | `/api/claims/:id/briefing` | Generate briefing |
| GET | `/api/claims/:id/briefing` | Get briefing |
| GET | `/api/ai/prompts` | List prompts |
| PUT | `/api/ai/prompts/:key` | Update prompt |

### Pricing & Scope (`/api/pricing`, `/api/scope`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/line-items` | Search line items |
| POST | `/api/pricing/calculate` | Calculate price |
| GET | `/api/pricing/xact/search` | Search Xact items |
| POST | `/api/pricing/scope` | Price scope |
| GET | `/api/scope/trades` | List trades |
| GET | `/api/scope/catalog` | Line item catalog |
| POST | `/api/scope/estimate/:id/assemble` | Assemble scope |

### Photo Taxonomy (`/api/photo-categories`, `/api/photos`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/photo-categories` | Get categories |
| POST | `/api/photos/:id/taxonomy` | Assign taxonomy |
| POST | `/api/photos/:id/suggest-taxonomy` | AI suggestions |
| GET | `/api/claims/:claimId/photo-completeness` | Check completeness |

### Voice Inspection (`/api/voice-inspection`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/voice-inspection/start` | Start voice session |
| POST | `/api/voice-inspection/command` | Process command |
| POST | `/api/voice-inspection/end` | End session |

### Organizations (`/api/organizations`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organizations/mine` | User's organizations |
| POST | `/api/organizations/switch` | Switch organization |
| GET | `/api/organizations/current` | Current org details |
| GET | `/api/organizations/current/members` | Org members |

---

## 4. Frontend Structure

### Pages (`client/src/pages/`)

| Page | Purpose |
|------|---------|
| `auth.tsx` | Login/registration |
| `home.tsx` | Dashboard |
| `claim-detail.tsx` | Main claim view with tabs |
| `claims-map.tsx` | Map view of claims |
| `flow-progress.tsx` | Flow execution UI |
| `flow-builder.tsx` | Flow definition editor |
| `movement-execution.tsx` | Individual movement completion |
| `photos.tsx` | Photo gallery |
| `calendar.tsx` | Calendar view |
| `settings.tsx` | User settings |
| `profile.tsx` | User profile |
| `not-found.tsx` | 404 page |
| `legacy/my-day.tsx` | Legacy daily summary |

### Flow Components (`client/src/components/flow/`) - **ACTIVE**

| Component | Purpose |
|-----------|---------|
| `ClaimFlowSection.tsx` | Flow section in claim detail |
| `FlowStatusCard.tsx` | Flow status display |
| `StartFlowButton.tsx` | Initiate new flow |
| `PhaseCard.tsx` | Display flow phase |
| `FlowProgressBar.tsx` | Progress indicator |
| `VoiceGuidedInspection.tsx` | Voice-guided capture |
| `FlowSketchCapture.tsx` | Sketch integration |
| `EvidenceGrid.tsx` | Evidence display |
| `EmptyState.tsx` | No flow state |
| `ErrorBanner.tsx` | Error display |
| `OfflineBanner.tsx` | Offline indicator |
| `StatusBadge.tsx` | Status badges |
| `LoadingButton.tsx` | Loading state button |

### Voice Sketch (`client/src/features/voice-sketch/`)

| Component | Purpose |
|-----------|---------|
| `VoiceSketchPage.tsx` | Main voice sketch page |
| `VoiceSketchController.tsx` | Voice sketch logic |
| `VoicePhotoCapture.tsx` | Photo capture during sketch |
| `SketchToolbar.tsx` | Sketch tools |
| `CommandHistory.tsx` | Voice command history |
| `RoomPreview.tsx` | Room preview |
| `FloorPlanPreview.tsx` | Floor plan visualization |
| `PhotoAlbum.tsx` | Photo gallery |

### UI Components (`client/src/components/ui/`)

Standard shadcn/ui component library including: Button, Card, Dialog, Dropdown, Form, Input, Select, Table, Tabs, Toast, etc.

### Feature Components (`client/src/components/`)

| Component | Purpose |
|-----------|---------|
| `scope-panel.tsx` | Scope management panel |
| `briefing-panel.tsx` | AI briefing display |
| `sketch-canvas.tsx` | Sketch canvas |
| `document-viewer.tsx` | Document viewing |
| `claim-card.tsx` | Claim card display |
| `ClaimUploadWizard.tsx` | Document upload wizard |
| `BulkUploadZone.tsx` | Bulk upload |
| `carrier-guidance-panel.tsx` | Carrier guidance |
| `validation-warnings.tsx` | Validation display |
| `line-item-picker.tsx` | Line item selection |
| `damage-zone-modal.tsx` | Damage zone editor |
| `peril-badge.tsx` | Peril display badge |
| `inspection-tips-panel.tsx` | Inspection tips |

### Claim Detail Components (`client/src/components/claim-detail/`)

| Component | Purpose |
|-----------|---------|
| `CoverageHighlights.tsx` | Coverage summary |
| `ScopeItems.tsx` | Scope items display |
| `DocumentCard.tsx` | Document card |

---

## 5. Seed Data

### Seed Files (`db/seeds/`)

| File | Purpose |
|------|---------|
| `001_ai_prompts.sql` | Required AI prompts for document extraction |
| `COMBINED_SEED_FOR_SUPABASE.sql` | Combined seed data |

### Seed Script

`scripts/seed-supabase.ts` - Analyzes seed files for Supabase deployment

### Required Seed Tables

- `ai_prompts` - AI prompt configurations
- `line_item_categories` - Line item category hierarchy
- `materials` - Material definitions
- `price_lists` - Regional price lists
- `coverage_types` - Coverage type definitions
- `tax_rates` - Regional tax rates
- `depreciation_schedules` - Depreciation rules
- `labor_rates` - Labor rate data
- `regional_multipliers` - Regional cost multipliers
- `xact_line_items` - Xactimate line item catalog

---

## 6. Package Dependencies

### Frontend

| Package | Purpose |
|---------|---------|
| `react@19.2.0` | UI framework |
| `@tanstack/react-query@5.60.5` | Server state management |
| `wouter@3.3.5` | Client-side routing |
| `zustand@5.0.9` | State management |
| `tailwindcss@4.1.14` | CSS framework |
| `@radix-ui/*` | UI primitives (shadcn/ui) |
| `lucide-react` | Icons |
| `recharts` | Charts |
| `framer-motion` | Animations |
| `react-leaflet` | Maps |
| `dexie` | IndexedDB (offline) |

### Backend

| Package | Purpose |
|---------|---------|
| `express@4.21.2` | HTTP server |
| `drizzle-orm@0.39.3` | Database ORM |
| `postgres@3.4.8` | PostgreSQL client |
| `passport@0.7.0` | Authentication |
| `@supabase/supabase-js@2.89.0` | Supabase client |
| `openai@6.13.0` | OpenAI API |
| `@anthropic-ai/sdk@0.71.2` | Anthropic API |
| `puppeteer@23.0.0` | PDF generation |
| `multer@2.0.2` | File uploads |
| `ws@8.18.0` | WebSockets |

### Shared

| Package | Purpose |
|---------|---------|
| `zod@3.25.76` | Schema validation |
| `date-fns@3.6.0` | Date utilities |
| `fast-xml-parser@5.3.3` | XML parsing (ESX) |
| `xlsx@0.18.5` | Excel export |

---

## 7. Architecture Summary

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claims IQ Sketch                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TypeScript)                               │
│  ├── Pages: claim-detail, flow-progress, flow-builder           │
│  ├── Components: flow/*, voice-sketch/*, ui/*                   │
│  └── State: TanStack Query + Zustand                            │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Express + TypeScript)                                  │
│  ├── Routes: claims, flows, estimates, documents, ai            │
│  ├── Services: flowEngine, scopeEngine, rulesEngine             │
│  └── Integrations: OpenAI, Supabase, MS365                      │
├─────────────────────────────────────────────────────────────────┤
│  Database (PostgreSQL via Drizzle)                               │
│  ├── Core: claims, estimates, documents                         │
│  ├── Flow: flow_definitions, claim_flow_instances               │
│  └── Pricing: xact_line_items, carrier_profiles                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Movement-Based Inspection Flows** (NEW - Active)
   - Flow definitions → Flow instances → Phases → Movements → Evidence
   - Voice-guided inspection with real-time progress

2. **Deterministic Engines**
   - Scope Engine: No AI - rule-based line item applicability
   - Quantity Engine: Safe formula evaluation
   - Rules Engine: Carrier/jurisdiction rule application with audit trail

3. **AI Services**
   - Document extraction (FNOL, Policy, Endorsement)
   - Claim briefings (peril-aware, policy-aware)
   - Line item suggestions
   - Photo analysis and categorization

4. **Multi-Tenant Architecture**
   - Organizations with role-based access
   - Carrier profiles with custom rules
   - Regional pricing and tax configuration

### Active vs Deprecated Systems

| System | Status | Location |
|--------|--------|----------|
| Flow Engine | **ACTIVE** | `flowEngineService.ts`, `components/flow/*` |
| Workflow System | **DEPRECATED** | `inspectionWorkflows` tables (empty) |
| Scope Engine | **ACTIVE** | `scopeEngine.ts`, `scopeRoutes.ts` |
| Rules Engine | **ACTIVE** | `rulesEngine.ts`, `workflowRulesEngine.ts` |

---

*This audit represents the complete inventory of the Claims IQ Sketch codebase as of 2026-01-18.*
