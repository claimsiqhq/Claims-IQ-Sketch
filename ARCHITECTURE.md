# Claims IQ - Technical Architecture

This document provides detailed technical architecture documentation for the Claims IQ platform.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Schema](#database-schema)
6. [Authentication System](#authentication-system)
7. [AI Integration](#ai-integration)
8. [Document Processing Pipeline](#document-processing-pipeline)
9. [Estimate System](#estimate-system)
10. [Voice Features](#voice-features)
11. [Multi-Tenant Architecture](#multi-tenant-architecture)
12. [Data Flow Diagrams](#data-flow-diagrams)
13. [Security Architecture](#security-architecture)
14. [Deployment](#deployment)
15. [Performance Considerations](#performance-considerations)

---

## System Overview

Claims IQ is a full-stack TypeScript application designed for property insurance claims estimation. The system follows a monorepo structure with shared types between frontend and backend.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React     │  │   Zustand   │  │   TanStack Query        │  │
│  │   Pages     │  │   Store     │  │   (Server State)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                        API Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │  Passport   │  │    Tenant Middleware    │  │
│  │   Routes    │  │   Auth      │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Service Layer                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Claims │ Documents │ Estimates │ Pricing │ AI Services  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Data Layer                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Supabase   │  │  Supabase   │  │      Drizzle ORM        │  │
│  │  PostgreSQL │  │  Storage    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   External Services                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   OpenAI    │  │   Weather   │  │     Xactimate Data      │  │
│  │   GPT-4     │  │   Service   │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2 | UI framework with concurrent features |
| **TypeScript** | 5.6 | Static type checking |
| **Vite** | 7.1 | Build tool with HMR |
| **Wouter** | 3.3 | Lightweight routing (2KB) |
| **Zustand** | 5.0 | Minimal state management |
| **TanStack Query** | 5.60 | Server state caching |
| **Tailwind CSS** | 4.1 | Utility-first styling |
| **shadcn/ui** | Latest | Accessible component primitives |
| **Framer Motion** | 12.23 | Animation library |
| **Leaflet** | 1.9 | Interactive maps |
| **Recharts** | 2.15 | Data visualization |
| **OpenAI Agents SDK** | 0.3 | Voice WebRTC features |

### Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Express.js** | 4.21 | HTTP server framework |
| **TypeScript** | 5.6 | Static type checking |
| **Drizzle ORM** | 0.39 | Type-safe SQL ORM |
| **Passport.js** | 0.7 | Authentication middleware |
| **OpenAI SDK** | 6.13 | AI API client |
| **Puppeteer** | 23.0 | PDF rendering & screenshots |
| **Multer** | 2.0 | Multipart file handling |
| **bcryptjs** | 3.0 | Password hashing |
| **express-session** | 1.18 | Session management |

### Infrastructure

| Component | Provider | Purpose |
|-----------|----------|---------|
| **Database** | Supabase PostgreSQL | Primary data store |
| **Storage** | Supabase Storage | File uploads |
| **Hosting** | Replit | Application hosting |
| **AI** | OpenAI | GPT-4, Vision, Realtime |
| **Weather** | NWS API | Weather data |

---

## Frontend Architecture

### Directory Structure

```
client/src/
├── features/                    # Feature-based modules
│   ├── voice-sketch/           # Voice room documentation
│   │   ├── VoiceSketch.tsx     # Main voice sketch page
│   │   ├── VoiceSketchSession.tsx
│   │   ├── FloorPlanCanvas.tsx # Canvas rendering
│   │   ├── RoomEditor.tsx
│   │   ├── TranscriptPanel.tsx
│   │   └── index.ts
│   └── voice-scope/            # Voice damage documentation
│       ├── VoiceScope.tsx
│       ├── ScopeSession.tsx
│       └── index.ts
├── pages/                       # Route pages
│   ├── auth.tsx                # Authentication (500+ lines)
│   ├── home.tsx                # Claims list
│   ├── my-day.tsx              # Daily dashboard
│   ├── claim-detail.tsx        # Main claim view (4000+ lines)
│   ├── claims-map.tsx          # Geographic view
│   ├── photos.tsx              # Photo gallery
│   ├── settings.tsx            # App settings
│   └── profile.tsx             # User profile
├── components/
│   ├── ui/                     # 30+ shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── toast.tsx
│   │   └── ... (25+ more)
│   ├── layouts/
│   │   ├── DesktopLayout.tsx
│   │   └── MobileLayout.tsx
│   ├── workflow/               # Inspection workflow UI
│   │   ├── WorkflowPanel.tsx
│   │   ├── WorkflowStep.tsx
│   │   └── AssetCapture.tsx
│   └── ProtectedRoute.tsx      # Auth guard
├── hooks/                       # Custom React hooks
│   ├── useAuth.ts
│   ├── useClaims.ts
│   ├── useEstimate.ts
│   └── useVoice.ts
├── contexts/
│   └── DeviceModeContext.tsx   # Desktop/mobile detection
├── lib/
│   ├── api.ts                  # API client functions
│   ├── store.ts                # Zustand store definition
│   ├── types.ts                # TypeScript interfaces
│   ├── queryClient.ts          # TanStack Query setup
│   ├── utils.ts                # Utility functions
│   ├── uploadQueue.ts          # Document upload queue
│   └── supabase.ts             # Supabase client
└── assets/                      # Static assets
    ├── logo-wordmark.png
    └── logo-icon.png
```

### State Management

#### Zustand Store (`lib/store.ts`)

```typescript
interface AppStore {
  // Authentication
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;

  // Claims
  claims: Claim[];
  activeClaim: Claim | null;
  setClaims: (claims: Claim[]) => void;
  setActiveClaim: (claim: Claim | null) => void;

  // Estimates
  activeEstimate: Estimate | null;
  estimateHierarchy: EstimateHierarchy | null;
  setActiveEstimate: (estimate: Estimate | null) => void;

  // Settings
  carrierProfile: CarrierProfile | null;
  regionData: RegionData | null;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}
```

#### React Query Patterns

```typescript
// Queries use consistent patterns
const { data: claims } = useQuery({
  queryKey: ['claims', organizationId],
  queryFn: () => api.getClaims(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Mutations with optimistic updates
const createClaim = useMutation({
  mutationFn: api.createClaim,
  onSuccess: () => {
    queryClient.invalidateQueries(['claims']);
  },
});
```

### Routing

Routes are defined using Wouter's declarative syntax:

```typescript
// App.tsx
<Switch>
  <Route path="/auth" component={AuthPage} />
  <ProtectedRoute path="/" component={MyDayPage} />
  <ProtectedRoute path="/claims" component={ClaimsPage} />
  <ProtectedRoute path="/claim/:id" component={ClaimDetailPage} />
  <ProtectedRoute path="/map" component={MapPage} />
  <ProtectedRoute path="/voice-sketch/:claimId?" component={VoiceSketchPage} />
  <ProtectedRoute path="/photos" component={PhotosPage} />
  <ProtectedRoute path="/settings" component={SettingsPage} />
  <ProtectedRoute path="/profile" component={ProfilePage} />
</Switch>
```

### Component Patterns

#### Compound Components

```typescript
// Estimate builder uses compound components
<EstimateBuilder>
  <EstimateBuilder.Header />
  <EstimateBuilder.CoverageSelector />
  <EstimateBuilder.StructureList>
    <EstimateBuilder.Structure>
      <EstimateBuilder.AreaList>
        <EstimateBuilder.Area>
          <EstimateBuilder.ZoneList>
            <EstimateBuilder.Zone>
              <EstimateBuilder.LineItemTable />
            </EstimateBuilder.Zone>
          </EstimateBuilder.ZoneList>
        </EstimateBuilder.Area>
      </EstimateBuilder.AreaList>
    </EstimateBuilder.Structure>
  </EstimateBuilder.StructureList>
  <EstimateBuilder.Totals />
</EstimateBuilder>
```

---

## Backend Architecture

### Directory Structure

```
server/
├── index.ts                     # Express app initialization
├── routes.ts                    # All API routes (2500+ lines)
├── db.ts                        # Database configuration
├── vite.ts                      # Vite dev server integration
├── middleware/
│   ├── auth.ts                  # Passport.js configuration
│   └── tenant.ts                # Multi-tenant isolation
├── lib/
│   ├── supabase.ts              # Supabase HTTP client
│   ├── supabaseAdmin.ts         # Admin client (RLS bypass)
│   └── supabaseSessionStore.ts  # Session persistence
├── services/                    # Business logic (38 services)
│   ├── claims.ts                # Claim CRUD operations
│   ├── documents.ts             # Document upload/storage
│   ├── documentProcessor.ts     # AI extraction pipeline
│   ├── documentQueue.ts         # Async processing queue
│   ├── documentClassifier.ts    # Document type detection
│   ├── estimateCalculator.ts    # Pricing calculations
│   ├── estimateHierarchy.ts     # Estimate structure management
│   ├── estimateSubmission.ts    # Estimate locking/export
│   ├── estimateValidator.ts     # Validation rules
│   ├── xactPricing.ts           # Xactimate pricing lookups
│   ├── sketchTools.ts           # Floor plan generation
│   ├── scopeEngine.ts           # Damage documentation
│   ├── rulesEngine.ts           # Carrier/jurisdiction rules
│   ├── quantityEngine.ts        # Dimension calculations
│   ├── zoneMetrics.ts           # Zone measurements
│   ├── pricing.ts               # Regional pricing
│   ├── pdfGenerator.ts          # PDF report generation
│   ├── reportGenerator.ts       # ESX/CSV export
│   ├── voice-session.ts         # OpenAI ephemeral keys
│   ├── claimBriefingService.ts  # AI claim briefings
│   ├── inspectionWorkflowService.ts # Workflow generation
│   ├── checklistTemplateService.ts  # Checklists
│   ├── carrierOverlayService.ts # Carrier preferences
│   ├── perilAwareContext.ts     # Peril context building
│   ├── perilNormalizer.ts       # Peril inference
│   ├── effectivePolicyService.ts # Policy resolution
│   ├── policyValidationService.ts # Policy validation
│   ├── depreciationEngine.ts    # ACV calculations
│   ├── myDayAnalysis.ts         # Daily insights
│   ├── weatherService.ts        # Weather API
│   ├── geocoding.ts             # Address geocoding
│   ├── routeOptimization.ts     # Route planning
│   ├── organizations.ts         # Org management
│   ├── auth.ts                  # Authentication logic
│   ├── supabaseAuth.ts          # Supabase JWT auth
│   ├── photos.ts                # Photo management
│   ├── rooms.ts                 # Room management
│   ├── promptService.ts         # AI prompt management
│   ├── ai-estimate-suggest.ts   # AI line item suggestions
│   └── __tests__/               # Unit tests
└── config/
    └── perilInspectionRules.ts  # Peril-specific guidance (44KB)
```

### Express Application Setup

```typescript
// server/index.ts
const app = express();

// Middleware stack
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new SupabaseSessionStore(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none',
  },
}));

// Authentication
app.use(passport.initialize());
app.use(passport.session());

// Tenant middleware
app.use(tenantMiddleware);

// Routes
registerRoutes(app);

// Static files (production)
app.use(express.static('dist/public'));
```

### Service Layer Pattern

Services encapsulate business logic and database operations:

```typescript
// server/services/claims.ts
export async function getClaims(organizationId: string): Promise<Claim[]> {
  const { data, error } = await supabaseAdmin
    .from('claims')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createClaim(
  claim: InsertClaim,
  organizationId: string
): Promise<Claim> {
  const { data, error } = await supabaseAdmin
    .from('claims')
    .insert({ ...claim, organization_id: organizationId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

### API Route Categories

| Category | Count | Examples |
|----------|-------|----------|
| Authentication | 8 | `/api/auth/login`, `/api/auth/me` |
| Claims | 15 | `/api/claims`, `/api/claims/:id/briefing` |
| Documents | 8 | `/api/documents/upload`, `/api/documents/:id/process` |
| Estimates | 20 | `/api/estimates/:id/hierarchy`, `/api/zones/:id/line-items` |
| Pricing | 10 | `/api/xact/search`, `/api/pricing/calculate` |
| Voice | 2 | `/api/voice/session` |
| Weather | 3 | `/api/weather/locations`, `/api/my-day/analyze` |
| Organizations | 8 | `/api/organizations`, `/api/organizations/:id/members` |
| Photos | 5 | `/api/claims/:id/photos`, `/api/photos/:id` |
| Admin | 6 | `/api/system/status`, `/api/prompts/:key` |
| Maps | 3 | `/api/claims/map`, `/api/map/stats` |
| **Total** | **88+** | |

---

## Database Schema

### Schema Organization

The database schema is defined in `shared/schema.ts` using Drizzle ORM with Zod validation.

### Core Tables

#### Organizations & Users

```typescript
// Organizations table
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'carrier', 'tpa', 'contractor'
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  fullName: text('full_name'),
  role: text('role').default('adjuster'),
  organizationId: uuid('organization_id').references(() => organizations.id),
  isSuperAdmin: boolean('is_super_admin').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Organization memberships
export const organizationMemberships = pgTable('organization_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  role: text('role').notNull(), // 'owner', 'admin', 'adjuster', 'viewer'
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});
```

#### Claims & Documents

```typescript
// Claims table
export const claims = pgTable('claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimNumber: text('claim_number').notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  assignedTo: uuid('assigned_to').references(() => users.id),
  status: text('status').default('draft'),

  // Property information
  propertyAddress: text('property_address'),
  propertyCity: text('property_city'),
  propertyState: text('property_state'),
  propertyZip: text('property_zip'),
  latitude: numeric('latitude'),
  longitude: numeric('longitude'),

  // Policyholder
  insuredName: text('insured_name'),
  insuredEmail: text('insured_email'),
  insuredPhone: text('insured_phone'),

  // Loss details
  dateOfLoss: date('date_of_loss'),
  primaryPeril: text('primary_peril'), // Canonical peril enum
  secondaryPerils: jsonb('secondary_perils'), // Array of perils
  lossDescription: text('loss_description'),

  // Loss context (FNOL-extracted structured data)
  lossContext: jsonb('loss_context'),

  // Policy reference
  policyNumber: text('policy_number'),
  policyFormId: uuid('policy_form_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Documents table
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimId: uuid('claim_id').references(() => claims.id),
  organizationId: uuid('organization_id').references(() => organizations.id),
  type: text('type').notNull(), // 'fnol', 'policy', 'endorsement', 'photo', 'other'
  filename: text('filename').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type'),
  size: integer('size'),
  status: text('status').default('pending'), // 'pending', 'processing', 'completed', 'failed'
  extractedData: jsonb('extracted_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

#### Estimates Hierarchy

```typescript
// Estimates
export const estimates = pgTable('estimates', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimId: uuid('claim_id').references(() => claims.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  status: text('status').default('draft'),
  version: integer('version').default(1),
  priceListId: uuid('price_list_id'),
  regionCode: text('region_code'),

  // Calculated totals
  totalRcv: numeric('total_rcv'),
  totalAcv: numeric('total_acv'),
  totalTax: numeric('total_tax'),
  totalOp: numeric('total_op'),
  grandTotal: numeric('grand_total'),

  lockedAt: timestamp('locked_at'),
  lockedBy: uuid('locked_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Estimate Coverages (A, B, C, D)
export const estimateCoverages = pgTable('estimate_coverages', {
  id: uuid('id').defaultRandom().primaryKey(),
  estimateId: uuid('estimate_id').references(() => estimates.id).notNull(),
  coverageType: text('coverage_type').notNull(), // 'A', 'B', 'C', 'D'
  coverageLimit: numeric('coverage_limit'),
  deductible: numeric('deductible'),
  totalRcv: numeric('total_rcv'),
  totalAcv: numeric('total_acv'),
});

// Estimate Structures (buildings)
export const estimateStructures = pgTable('estimate_structures', {
  id: uuid('id').defaultRandom().primaryKey(),
  estimateId: uuid('estimate_id').references(() => estimates.id).notNull(),
  coverageId: uuid('coverage_id').references(() => estimateCoverages.id),
  name: text('name').notNull(),
  type: text('type'), // 'main_dwelling', 'detached_garage', 'shed', etc.
  totalRcv: numeric('total_rcv'),
  totalAcv: numeric('total_acv'),
});

// Estimate Areas (roofing, interior, exterior)
export const estimateAreas = pgTable('estimate_areas', {
  id: uuid('id').defaultRandom().primaryKey(),
  structureId: uuid('structure_id').references(() => estimateStructures.id).notNull(),
  areaType: text('area_type').notNull(), // 'roofing', 'interior', 'exterior', etc.
  name: text('name'),
  totalRcv: numeric('total_rcv'),
  totalAcv: numeric('total_acv'),
});

// Estimate Zones (rooms, damage areas)
export const estimateZones = pgTable('estimate_zones', {
  id: uuid('id').defaultRandom().primaryKey(),
  areaId: uuid('area_id').references(() => estimateAreas.id).notNull(),
  name: text('name').notNull(),
  roomType: text('room_type'),

  // Dimensions
  length: numeric('length'),
  width: numeric('width'),
  height: numeric('height'),
  squareFeet: numeric('square_feet'),
  linearFeet: numeric('linear_feet'),
  perimeter: numeric('perimeter'),

  // Damage context
  peril: text('peril'),
  damageDescription: text('damage_description'),

  totalRcv: numeric('total_rcv'),
  totalAcv: numeric('total_acv'),
});

// Estimate Line Items
export const estimateLineItems = pgTable('estimate_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  zoneId: uuid('zone_id').references(() => estimateZones.id).notNull(),

  // Xactimate reference
  xactCode: text('xact_code'),
  xactDescription: text('xact_description'),
  category: text('category'),

  // Quantity
  quantity: numeric('quantity').notNull(),
  unit: text('unit'), // 'SF', 'LF', 'EA', 'SY', etc.

  // Pricing
  unitPrice: numeric('unit_price'),
  materialCost: numeric('material_cost'),
  laborCost: numeric('labor_cost'),
  equipmentCost: numeric('equipment_cost'),
  totalRcv: numeric('total_rcv'),

  // Depreciation
  age: integer('age'),
  condition: text('condition'),
  depreciationPercent: numeric('depreciation_percent'),
  depreciationAmount: numeric('depreciation_amount'),
  totalAcv: numeric('total_acv'),

  // Flags
  isRemove: boolean('is_remove').default(false),
  isReplace: boolean('is_replace').default(false),
  notes: text('notes'),
});
```

#### Policy & Endorsements

```typescript
// Policy form extractions
export const policyFormExtractions = pgTable('policy_form_extractions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id),
  claimId: uuid('claim_id').references(() => claims.id),

  // Coverages
  coverageA: numeric('coverage_a'),
  coverageB: numeric('coverage_b'),
  coverageC: numeric('coverage_c'),
  coverageD: numeric('coverage_d'),

  // Deductibles
  deductibleAmount: numeric('deductible_amount'),
  deductibleType: text('deductible_type'),
  hurricaneDeductible: numeric('hurricane_deductible'),
  windHailDeductible: numeric('wind_hail_deductible'),

  // Policy details
  effectiveDate: date('effective_date'),
  expirationDate: date('expiration_date'),
  lossSettlementType: text('loss_settlement_type'), // 'RCV', 'ACV'

  // Full extraction
  extractedData: jsonb('extracted_data'),
  sourceHash: text('source_hash'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Endorsement extractions
export const endorsementExtractions = pgTable('endorsement_extractions', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id),
  claimId: uuid('claim_id').references(() => claims.id),

  formNumber: text('form_number'),
  title: text('title'),
  effectiveDate: date('effective_date'),
  precedence: integer('precedence').default(0), // Higher = takes priority

  // Delta changes only
  modifications: jsonb('modifications'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

#### Xactimate Pricing

```typescript
// Xactimate categories
export const xactCategories = pgTable('xact_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  parentCode: text('parent_code'),
  level: integer('level').default(1),
});

// Xactimate line items (20,000+)
export const xactLineItems = pgTable('xact_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
  categoryCode: text('category_code').references(() => xactCategories.code),
  unit: text('unit').notNull(),

  // Base pricing
  materialUnit: numeric('material_unit'),
  laborUnit: numeric('labor_unit'),
  equipmentUnit: numeric('equipment_unit'),
  totalUnit: numeric('total_unit'),

  // Labor details
  laborHours: numeric('labor_hours'),
  laborMinimum: numeric('labor_minimum'),

  // Flags
  isActive: boolean('is_active').default(true),
  isDepreciable: boolean('is_depreciable').default(true),
});
```

#### AI & Workflows

```typescript
// AI prompts (database-driven)
export const aiPrompts = pgTable('ai_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  userPromptTemplate: text('user_prompt_template'),
  model: text('model').default('gpt-4o'),
  temperature: numeric('temperature').default('0.7'),
  maxTokens: integer('max_tokens').default(4096),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Claim briefings
export const claimBriefings = pgTable('claim_briefings', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimId: uuid('claim_id').references(() => claims.id).notNull(),

  // Content
  summary: text('summary'),
  inspectionStrategy: text('inspection_strategy'),
  perilRisks: jsonb('peril_risks'),
  policyWatchouts: jsonb('policy_watchouts'),
  photoRequirements: jsonb('photo_requirements'),
  depreciationNotes: text('depreciation_notes'),
  openQuestions: jsonb('open_questions'),

  // Full briefing
  content: jsonb('content'),
  sourceHash: text('source_hash'), // For caching

  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Inspection workflows
export const inspectionWorkflows = pgTable('inspection_workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimId: uuid('claim_id').references(() => claims.id).notNull(),
  briefingId: uuid('briefing_id').references(() => claimBriefings.id),

  status: text('status').default('pending'), // 'pending', 'in_progress', 'completed'
  currentPhase: text('current_phase'),
  completedSteps: integer('completed_steps').default(0),
  totalSteps: integer('total_steps'),

  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Workflow steps
export const inspectionWorkflowSteps = pgTable('inspection_workflow_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').references(() => inspectionWorkflows.id).notNull(),

  phase: text('phase').notNull(),
  stepNumber: integer('step_number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type'), // 'photo', 'measurement', 'checklist', 'observation'

  isRequired: boolean('is_required').default(true),
  status: text('status').default('pending'),
  completedAt: timestamp('completed_at'),

  // Captured data
  capturedData: jsonb('captured_data'),
  notes: text('notes'),
});
```

### Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  organizations  │─────│     users       │─────│  memberships    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │
         │                      │
         ▼                      ▼
┌─────────────────┐     ┌─────────────────┐
│     claims      │─────│   documents     │
└─────────────────┘     └─────────────────┘
         │                      │
         │                      ├────────────────────────────┐
         ▼                      ▼                            ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   estimates     │     │  policy_forms   │     │  endorsements   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   coverages     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   structures    │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│     areas       │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│     zones       │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   line_items    │
└─────────────────┘
```

---

## Authentication System

### Dual Authentication Strategy

Claims IQ supports two authentication methods:

#### 1. Session-Based Authentication (Passport.js)

Primary method for web application:

```typescript
// server/middleware/auth.ts
passport.use(new LocalStrategy(
  async (username, password, done) => {
    const user = await getUserByUsername(username);
    if (!user) return done(null, false);

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return done(null, false);

    return done(null, user);
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await getUserById(id);
  done(null, user);
});
```

Session storage in Supabase for persistence:

```typescript
// server/lib/supabaseSessionStore.ts
class SupabaseSessionStore extends session.Store {
  async get(sid: string, callback: Function) {
    const { data } = await supabaseAdmin
      .from('sessions')
      .select('sess')
      .eq('sid', sid)
      .single();
    callback(null, data?.sess);
  }

  async set(sid: string, sess: any, callback: Function) {
    await supabaseAdmin
      .from('sessions')
      .upsert({ sid, sess, expire: new Date(Date.now() + sess.cookie.maxAge) });
    callback();
  }

  async destroy(sid: string, callback: Function) {
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('sid', sid);
    callback();
  }
}
```

#### 2. Supabase JWT Authentication

Alternative for headless/mobile clients:

```typescript
// server/services/supabaseAuth.ts
export async function verifyToken(token: string): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Get app user from database
  const appUser = await getUserByEmail(user.email);
  return appUser;
}
```

### Authentication Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌────────────┐
│ Client  │────▶│  POST       │────▶│  Passport   │────▶│  Session   │
│         │     │  /auth/login│     │  Validate   │     │  Created   │
└─────────┘     └─────────────┘     └─────────────┘     └────────────┘
     │                                                         │
     │                                                         ▼
     │          ┌─────────────┐     ┌─────────────┐     ┌────────────┐
     └─────────▶│  Subsequent │────▶│  Session    │────▶│  User      │
                │  Requests   │     │  Lookup     │     │  Attached  │
                └─────────────┘     └─────────────┘     └────────────┘
```

### Multi-Tenant Middleware

```typescript
// server/middleware/tenant.ts
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();

  // Get user's primary organization
  const membership = await getActiveMembership(req.user.id);
  if (membership) {
    req.organizationId = membership.organizationId;
    req.organizationRole = membership.role;
  }

  next();
}

// Middleware helpers
export function requireOrganization(req: Request, res: Response, next: NextFunction) {
  if (!req.organizationId) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  next();
}

export function requireOrgRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.organizationRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

---

## AI Integration

### OpenAI Services

Claims IQ uses multiple OpenAI capabilities:

| Service | Model | Purpose |
|---------|-------|---------|
| Document Extraction | GPT-4o Vision | Extract text/structure from PDFs |
| Claim Briefing | GPT-4o | Generate inspection guidance |
| Workflow Generation | GPT-4o | Create step-by-step workflows |
| Line Item Suggestions | GPT-4o | Match damage to Xact codes |
| Voice Sketch | GPT Realtime | Voice-to-floor-plan |
| Voice Scope | GPT Realtime | Voice-to-line-items |

### AI Prompt Management

Prompts are stored in the database for easy modification:

```typescript
// server/services/promptService.ts
export async function getPrompt(key: string): Promise<AIPrompt> {
  const { data } = await supabaseAdmin
    .from('ai_prompts')
    .select('*')
    .eq('key', key)
    .eq('is_active', true)
    .single();
  return data;
}

export async function executePrompt(
  key: string,
  variables: Record<string, string>
): Promise<string> {
  const prompt = await getPrompt(key);

  // Interpolate variables into template
  let userPrompt = prompt.userPromptTemplate;
  for (const [k, v] of Object.entries(variables)) {
    userPrompt = userPrompt.replace(`{{${k}}}`, v);
  }

  const response = await openai.chat.completions.create({
    model: prompt.model,
    temperature: Number(prompt.temperature),
    max_tokens: prompt.maxTokens,
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices[0].message.content;
}
```

### Claim Briefing Generation

```typescript
// server/services/claimBriefingService.ts
export async function generateBriefing(claimId: string): Promise<ClaimBriefing> {
  // Gather context
  const claim = await getClaim(claimId);
  const documents = await getClaimDocuments(claimId);
  const policy = await getEffectivePolicy(claimId);
  const endorsements = await getEndorsements(claimId);

  // Build peril-aware context
  const perilContext = buildPerilContext(claim.primaryPeril, claim.secondaryPerils);

  // Check cache
  const sourceHash = hashSources(claim, policy, endorsements);
  const cached = await getCachedBriefing(claimId, sourceHash);
  if (cached) return cached;

  // Generate via AI
  const response = await executePrompt('claim_briefing', {
    claimNumber: claim.claimNumber,
    peril: claim.primaryPeril,
    lossDescription: claim.lossDescription,
    policyDetails: JSON.stringify(policy),
    endorsements: JSON.stringify(endorsements),
    perilGuidance: JSON.stringify(perilContext),
  });

  // Parse structured response
  const briefing = parseBriefingResponse(response);

  // Save to database
  return await saveBriefing(claimId, briefing, sourceHash);
}
```

---

## Document Processing Pipeline

### Pipeline Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│  Classify   │────▶│  Extract    │────▶│   Store     │
│   File      │     │  Doc Type   │     │  Content    │     │   Data      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │   Trigger   │◀────│   Update    │◀────│   Validate  │
                    │   AI Gen    │     │   Claim     │     │   Extract   │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

### Document Classification

```typescript
// server/services/documentClassifier.ts
export async function classifyDocument(file: Express.Multer.File): Promise<DocType> {
  // Check filename patterns
  const filename = file.originalname.toLowerCase();
  if (filename.includes('fnol') || filename.includes('first notice')) {
    return 'fnol';
  }
  if (filename.includes('policy') || filename.includes('declarations')) {
    return 'policy';
  }
  if (filename.includes('endorsement') || filename.includes('amendment')) {
    return 'endorsement';
  }

  // Use AI for ambiguous cases
  const pageImages = await convertPdfToImages(file.buffer);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Classify this insurance document...' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: pageImages[0] } }] },
    ],
  });

  return parseClassification(response);
}
```

### FNOL Extraction

```typescript
// server/services/documentProcessor.ts
export async function processFnolDocument(documentId: string): Promise<void> {
  const document = await getDocument(documentId);
  const file = await downloadFromStorage(document.storagePath);

  // Convert PDF pages to images
  const pageImages = await convertPdfToImages(file);

  // Extract via GPT-4 Vision
  const extraction = await extractFnolData(pageImages);

  // Validate extraction
  validateFnolExtraction(extraction);

  // Update claim with extracted data
  await updateClaimFromFnol(document.claimId, {
    claimNumber: extraction.claimNumber,
    insuredName: extraction.insuredName,
    propertyAddress: extraction.propertyAddress,
    dateOfLoss: extraction.dateOfLoss,
    lossDescription: extraction.lossDescription,
    primaryPeril: inferPeril(extraction.lossDescription),
    lossContext: extraction, // Store full extraction
  });

  // Mark document as processed
  await updateDocument(documentId, { status: 'completed', extractedData: extraction });

  // Trigger AI generation pipeline
  await queueAiGeneration(document.claimId);
}
```

### Policy Extraction

```typescript
export async function processPolicyDocument(documentId: string): Promise<void> {
  const document = await getDocument(documentId);
  const pageImages = await convertPdfToImages(await downloadFromStorage(document.storagePath));

  // Extract policy details
  const extraction = await extractPolicyData(pageImages);

  // Save policy form extraction
  await createPolicyFormExtraction({
    documentId,
    claimId: document.claimId,
    coverageA: extraction.coverages?.dwelling,
    coverageB: extraction.coverages?.otherStructures,
    coverageC: extraction.coverages?.personalProperty,
    coverageD: extraction.coverages?.lossOfUse,
    deductibleAmount: extraction.deductible?.amount,
    deductibleType: extraction.deductible?.type,
    lossSettlementType: extraction.lossSettlement,
    extractedData: extraction,
    sourceHash: hashContent(pageImages),
  });

  // Update document status
  await updateDocument(documentId, { status: 'completed', extractedData: extraction });
}
```

---

## Estimate System

### Estimate Hierarchy

The estimate system uses a strict hierarchy:

```
Estimate
├── Coverage A (Dwelling)
│   └── Main Dwelling
│       ├── Roofing
│       │   ├── Main Roof Section
│       │   │   ├── Remove 3-tab shingles (100 SF)
│       │   │   ├── Install architectural shingles (100 SF)
│       │   │   └── Install felt underlayment (100 SF)
│       │   └── Garage Roof Section
│       └── Interior
│           ├── Living Room
│           │   ├── Remove drywall (80 SF)
│           │   └── Install drywall (80 SF)
│           └── Kitchen
├── Coverage B (Other Structures)
│   └── Detached Garage
│       └── Exterior
│           └── Garage Siding
└── Coverage C (Contents)
    └── Personal Property
        └── Living Room Contents
            └── Replace carpet (120 SF)
```

### Pricing Calculation

```typescript
// server/services/estimateCalculator.ts
export async function calculateLineItemPrice(
  lineItem: EstimateLineItem,
  region: string,
  carrierProfile?: CarrierProfile
): Promise<PricingResult> {
  // Get Xactimate base pricing
  const xactItem = await getXactLineItem(lineItem.xactCode);

  // Get regional multipliers
  const multipliers = await getRegionalMultipliers(region);

  // Calculate components
  const material = xactItem.materialUnit * lineItem.quantity * multipliers.material;
  const labor = xactItem.laborUnit * lineItem.quantity * multipliers.labor;
  const equipment = xactItem.equipmentUnit * lineItem.quantity * multipliers.equipment;

  // Total RCV
  const rcv = material + labor + equipment;

  // Calculate depreciation
  const depreciation = calculateDepreciation(xactItem, lineItem.age, lineItem.condition);
  const acv = rcv - depreciation;

  return {
    materialCost: material,
    laborCost: labor,
    equipmentCost: equipment,
    totalRcv: rcv,
    depreciationPercent: depreciation.percent,
    depreciationAmount: depreciation.amount,
    totalAcv: acv,
  };
}
```

### Estimate Totals

```typescript
export async function recalculateEstimateTotals(estimateId: string): Promise<void> {
  const hierarchy = await getEstimateHierarchy(estimateId);

  // Roll up from line items → zones → areas → structures → coverages → estimate
  for (const coverage of hierarchy.coverages) {
    let coverageRcv = 0;
    let coverageAcv = 0;

    for (const structure of coverage.structures) {
      let structureRcv = 0;
      let structureAcv = 0;

      for (const area of structure.areas) {
        let areaRcv = 0;
        let areaAcv = 0;

        for (const zone of area.zones) {
          const zoneTotals = await calculateZoneTotals(zone);
          areaRcv += zoneTotals.rcv;
          areaAcv += zoneTotals.acv;
        }

        await updateArea(area.id, { totalRcv: areaRcv, totalAcv: areaAcv });
        structureRcv += areaRcv;
        structureAcv += areaAcv;
      }

      await updateStructure(structure.id, { totalRcv: structureRcv, totalAcv: structureAcv });
      coverageRcv += structureRcv;
      coverageAcv += structureAcv;
    }

    await updateCoverage(coverage.id, { totalRcv: coverageRcv, totalAcv: coverageAcv });
  }

  // Calculate O&P
  const opAmount = calculateOverheadAndProfit(hierarchy);

  // Calculate tax
  const taxAmount = await calculateTax(hierarchy, estimate.regionCode);

  // Update estimate totals
  await updateEstimate(estimateId, {
    totalRcv: hierarchy.totalRcv,
    totalAcv: hierarchy.totalAcv,
    totalOp: opAmount,
    totalTax: taxAmount,
    grandTotal: hierarchy.totalRcv + opAmount + taxAmount,
  });
}
```

---

## Voice Features

### Voice Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Express   │────▶│   OpenAI    │
│   WebRTC    │     │   /voice    │     │   Realtime  │
└─────────────┘     └─────────────┘     └─────────────┘
      │                                        │
      │                                        │
      └────────────────────────────────────────┘
                  WebRTC Connection
```

### Ephemeral Key Generation

```typescript
// server/services/voice-session.ts
export async function createVoiceSession(): Promise<VoiceSession> {
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'alloy',
    }),
  });

  const session = await response.json();

  return {
    id: session.id,
    ephemeralKey: session.client_secret.value,
    expiresAt: session.client_secret.expires_at,
  };
}
```

### Voice Sketch Tools

```typescript
// server/services/sketchTools.ts
export const voiceSketchTools = [
  {
    type: 'function',
    name: 'create_room',
    description: 'Create a new room with dimensions',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Room name (e.g., Living Room)' },
        length: { type: 'number', description: 'Length in feet' },
        width: { type: 'number', description: 'Width in feet' },
        height: { type: 'number', description: 'Ceiling height in feet', default: 8 },
      },
      required: ['name', 'length', 'width'],
    },
  },
  {
    type: 'function',
    name: 'add_opening',
    description: 'Add a door or window between rooms',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['door', 'window', 'archway'] },
        fromRoom: { type: 'string' },
        toRoom: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['type', 'fromRoom', 'toRoom'],
    },
  },
  {
    type: 'function',
    name: 'create_structure',
    description: 'Create a new structure (building)',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['main_dwelling', 'detached_garage', 'shed', 'barn'] },
      },
      required: ['name', 'type'],
    },
  },
];
```

---

## Multi-Tenant Architecture

### Tenant Isolation

All data is isolated by organization:

```typescript
// Every query includes organization filter
const claims = await supabaseAdmin
  .from('claims')
  .select('*')
  .eq('organization_id', req.organizationId);  // Always filtered

// RLS policies in Supabase
CREATE POLICY "Users can only see their org's claims"
ON claims FOR SELECT
USING (organization_id = auth.jwt() ->> 'organization_id');
```

### Organization Hierarchy

```
Organization (Carrier/TPA/Contractor)
├── Owner (1)
├── Admins (0+)
├── Adjusters (0+)
└── Viewers (0+)
```

### Role Permissions

| Action | Owner | Admin | Adjuster | Viewer |
|--------|-------|-------|----------|--------|
| Create claims | Yes | Yes | Yes | No |
| Edit claims | Yes | Yes | Yes | No |
| Delete claims | Yes | Yes | No | No |
| View claims | Yes | Yes | Yes | Yes |
| Manage members | Yes | Yes | No | No |
| Manage settings | Yes | Yes | No | No |
| Delete org | Yes | No | No | No |

---

## Data Flow Diagrams

### Claim Lifecycle

```
┌─────────────┐
│   Upload    │
│   FNOL PDF  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Classify   │────▶│  Extract    │
│  Document   │     │  FNOL Data  │
└─────────────┘     └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │     │  Infer      │     │   Update    │
│   Policy    │     │  Peril      │     │   Claim     │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Extract    │────▶│  Generate   │────▶│  Generate   │
│  Policy     │     │  Briefing   │     │  Workflow   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
       ┌───────────────────────────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Inspect    │────▶│  Document   │────▶│  Build      │
│  Property   │     │  Damage     │     │  Estimate   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
       ┌───────────────────────────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Apply      │────▶│  Export     │────▶│   Close     │
│  Pricing    │     │  PDF/ESX    │     │   Claim     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Estimate Calculation Flow

```
┌─────────────┐
│  Add Line   │
│   Item      │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Get Xact   │────▶│  Apply      │
│  Base Price │     │  Multipliers│
└─────────────┘     └──────┬──────┘
                           │
       ┌───────────────────┤
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│  Calculate  │     │  Calculate  │
│  RCV        │     │  Deprec.    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
       ┌─────────────────┐
       │  Check Carrier  │
       │  Rules          │
       └────────┬────────┘
                │
       ┌────────┴────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  Apply      │   │  Apply      │
│  Exclusions │   │  Caps       │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └─────────┬───────┘
                 │
                 ▼
       ┌─────────────────┐
       │  Roll Up        │
       │  Totals         │
       └────────┬────────┘
                │
       ┌────────┼────────┐
       │        │        │
       ▼        ▼        ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ O&P     │ │ Tax     │ │ Grand   │
│ Calc    │ │ Calc    │ │ Total   │
└─────────┘ └─────────┘ └─────────┘
```

---

## Security Architecture

### Security Layers

| Layer | Mechanism |
|-------|-----------|
| **Transport** | HTTPS/TLS |
| **Authentication** | Passport.js sessions + Supabase JWT |
| **Authorization** | Role-based + tenant isolation |
| **Data Access** | RLS policies in Supabase |
| **Input Validation** | Zod schemas |
| **File Upload** | MIME type validation, size limits |
| **Sessions** | httpOnly, secure, sameSite cookies |
| **Passwords** | bcrypt hashing |

### Security Checklist

- [x] All endpoints require authentication
- [x] Multi-tenant data isolation
- [x] Session cookies are httpOnly and secure
- [x] Passwords are bcrypt hashed
- [x] File uploads validated by MIME type
- [x] 50MB upload size limit
- [x] SQL injection prevented by ORM
- [x] XSS prevented by React escaping
- [x] CSRF protection via SameSite cookies
- [x] Secrets in environment variables only

---

## Deployment

### Build Process

```typescript
// script/build.ts
async function build() {
  // 1. Build client (Vite)
  await exec('npx vite build --outDir dist/public');

  // 2. Build server (esbuild)
  await esbuild.build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/index.mjs',
    external: ['pg-native', 'puppeteer', '@supabase/supabase-js'],
  });

  // 3. Create CJS wrapper for compatibility
  await writeFile('dist/index.cjs', `
    import('./index.mjs').catch(console.error);
  `);
}
```

### Environment Requirements

| Requirement | Value |
|-------------|-------|
| Node.js | 20+ |
| PostgreSQL | Via Supabase |
| Memory | 512MB+ |
| Storage | For file uploads |
| Network | HTTPS, WebSocket |

### Replit Configuration

```json
// .replit
{
  "run": "npm run start",
  "entrypoint": "server/index.ts",
  "hidden": [".config", "node_modules"],
  "ports": [5000]
}
```

---

## Performance Considerations

### Caching Strategy

| Data | Cache Location | TTL |
|------|----------------|-----|
| Claims list | React Query | 5 min |
| Xactimate items | In-memory | 1 hour |
| Regional multipliers | In-memory | 1 hour |
| AI briefings | Database (hash) | Until sources change |
| Sessions | Supabase | 24 hours |

### Query Optimization

- Indexes on frequently queried columns (organization_id, claim_id, status)
- Pagination for large result sets
- Selective field fetching (not SELECT *)
- Eager loading for related data when needed

### File Handling

- 50MB upload limit
- Supabase Storage for persistence
- PDF-to-image conversion for AI processing
- Async document processing queue

---

## Appendix

### Peril Types

```typescript
export type Peril =
  | 'WIND_HAIL'
  | 'FIRE'
  | 'WATER'
  | 'FLOOD'
  | 'SMOKE'
  | 'MOLD'
  | 'IMPACT'
  | 'OTHER';
```

### Claim Statuses

```typescript
export type ClaimStatus =
  | 'draft'
  | 'fnol'
  | 'open'
  | 'in_progress'
  | 'review'
  | 'approved'
  | 'closed';
```

### Estimate Statuses

```typescript
export type EstimateStatus =
  | 'draft'
  | 'in_progress'
  | 'review'
  | 'approved'
  | 'locked'
  | 'submitted';
```

### Coverage Types

```typescript
export type CoverageType = 'A' | 'B' | 'C' | 'D';

// A = Dwelling
// B = Other Structures
// C = Personal Property
// D = Loss of Use
```

---

*Last updated: December 2024*
