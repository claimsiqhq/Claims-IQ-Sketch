# Claims-IQ Codebase Audit Report

**Date:** 2026-01-13
**Auditor:** Staff Engineer - Comprehensive Production Readiness Review
**Codebase:** Claims-IQ-Sketch
**Version:** Pre-Production Audit

---

## EXECUTIVE SUMMARY

### Issue Counts by Severity

| Severity | Count | Categories |
|----------|-------|------------|
| **CRITICAL** | 14 | Security (3), Data Layer (5), API (4), State (2) |
| **HIGH** | 47 | API Auth (12), Data Layer (8), Feature (10), Security (5), UI-API (6), State (4), Cross-Cutting (2) |
| **MEDIUM** | 68 | Validation (15), Logging (8), Accessibility (12), Feature (18), State (8), Response Consistency (7) |
| **LOW** | 23 | Documentation, Minor gaps, Code quality |

**Total Issues Identified: 152**

---

### Top 3 Risks Requiring Immediate Attention

#### 1. CRITICAL: Unprotected API Endpoints (Security/Authorization)
**Risk Level:** CRITICAL - Production Blocker
**Impact:** Complete data exposure, unauthorized access to all estimates, pricing, and scope data

- **42+ endpoints** in `/api/scope/*`, `/api/pricing/*`, `/api/estimates/export/*` have **NO authentication**
- Anyone can read, modify, or delete estimates without logging in
- No tenant isolation - cross-organization data access possible
- **Files:** `server/routes/scopeRoutes.ts`, `server/routes/pricing.ts`, `server/routes/estimates.ts`

**Immediate Action Required:**
```typescript
// Add to ALL routes in scopeRoutes.ts, pricing.ts
router.use(requireAuth);
router.use(requireOrganization);
```

#### 2. CRITICAL: Shell Command Injection Vulnerability
**Risk Level:** CRITICAL - Security Vulnerability
**Impact:** Remote code execution on server

- `exec()` calls with user-controlled file paths in document processing
- Attackers can execute arbitrary system commands via malicious filenames
- **Files:**
  - `server/services/documentProcessor.ts` (lines 623, 636, 662)
  - `server/services/documents.ts` (lines 447, 457)

**Immediate Action Required:**
```typescript
// Replace exec() with execFile()
import { execFile } from 'child_process';
await execFile('pdftotext', ['-f', pageNum, '-l', pageNum, pdfPath, '-']);
```

#### 3. CRITICAL: Missing Foreign Key Constraints (Data Integrity)
**Risk Level:** CRITICAL - Data Corruption Risk
**Impact:** Orphan records, broken relationships, calculation errors

- `damageZoneId` in estimateLineItems has NO foreign key reference
- `assignedUserId` in claims has NO reference to users table
- `carrierId` has NO reference to carriers table
- Missing cascades allow orphan records when parents deleted
- **File:** `shared/schema.ts`

**Immediate Action Required:**
```typescript
// Add FK references
damageZoneId: uuid("damage_zone_id").references(() => damageZones.id, { onDelete: 'cascade' }),
assignedUserId: uuid("assigned_user_id").references(() => users.id),
```

---

### Overall Production-Readiness Assessment

| Dimension | Status | Score |
|-----------|--------|-------|
| Data Layer Integrity | ⚠️ Needs Work | 5/10 |
| API Surface | ❌ Critical Issues | 3/10 |
| UI ↔ API Contract | ⚠️ Needs Work | 6/10 |
| Feature Completeness | ⚠️ Partial | 6/10 |
| State & Data Flow | ⚠️ Needs Work | 6/10 |
| Security Surface | ❌ Critical Issues | 4/10 |
| Cross-Cutting Concerns | ⚠️ Needs Work | 6/10 |

**Overall Score: 5.1/10 - NOT READY FOR PRODUCTION**

The codebase requires significant security hardening and data integrity fixes before production deployment. The core functionality is implemented, but critical gaps in authentication, authorization, and data layer integrity create unacceptable risk.

---

## DETAILED FINDINGS BY CATEGORY

---

## 1. DATA LAYER INTEGRITY

### 1.1 Missing Foreign Key References

| Issue | File | Line(s) | Severity |
|-------|------|---------|----------|
| `assignedUserId` no FK to users | `shared/schema.ts` | 215 | CRITICAL |
| `carrierId` no FK reference | `shared/schema.ts` | 221 | CRITICAL |
| `damageZoneId` no FK to damageZones | `shared/schema.ts` | 1079 | CRITICAL |
| `currentOrganizationId` no FK to orgs | `shared/schema.ts` | 165 | HIGH |
| `estimateId` in damageZones no FK | `shared/schema.ts` | 1125-1127 | CRITICAL |

**Description:** These missing FK constraints allow invalid references and orphan records. The `damageZoneId` issue is particularly critical as it affects estimate calculations - line items can reference non-existent damage zones.

**Recommendation:**
```typescript
// shared/schema.ts - Add references
assignedUserId: uuid("assigned_user_id").references(() => users.id),
carrierId: uuid("carrier_id").references(() => carrierProfiles.id),
damageZoneId: uuid("damage_zone_id").references(() => damageZones.id, { onDelete: 'cascade' }),
currentOrganizationId: uuid("current_organization_id").references(() => organizations.id),
```

### 1.2 Incorrect Cascade Settings

| Issue | File | Line(s) | Severity |
|-------|------|---------|----------|
| claimPhotos.structureId uses `set null` | `shared/schema.ts` | ~920 | HIGH |
| claimPhotos.roomId uses `set null` | `shared/schema.ts` | ~921 | HIGH |
| claimPhotos.damageZoneId uses `set null` | `shared/schema.ts` | ~922 | HIGH |

**Description:** When parent entities (structures, rooms) are deleted, photos become orphaned with NULL references instead of being deleted. This leads to ghost data accumulation.

**Recommendation:** Change to `onDelete: 'cascade'` for child entities that have no meaning without their parent.

### 1.3 User Tracking Fields Not Linked

| Field | Tables | Severity |
|-------|--------|----------|
| `createdBy` | documents, templates | HIGH |
| `uploadedBy` | documents, photos | HIGH |
| `approvedBy` | estimates | HIGH |
| `completedBy` | workflow steps, checklists | HIGH |

**Description:** These VARCHAR fields store user identifiers but aren't foreign keys. Cannot efficiently query "what did user X create?" or enforce that values are valid user IDs.

**Recommendation:** Convert to `uuid().references(() => users.id)`.

### 1.4 Missing Database Indexes

| Table | Column | Usage Pattern | Severity |
|-------|--------|---------------|----------|
| claims | assignedUserId | JOIN to users | MEDIUM |
| estimates | carrierProfileId | JOIN filtering | MEDIUM |
| estimateLineItems | estimateId | FK lookup | MEDIUM |
| damageZones | estimateId | FK lookup | MEDIUM |
| endorsementExtractions | claimId | Claim lookup | MEDIUM |

**Description:** Only 24 indexes exist for 100+ FK relationships. Missing indexes on frequently filtered/joined columns cause slow queries.

**Recommendation:**
```sql
CREATE INDEX idx_claims_assigned_user ON claims(assigned_user_id);
CREATE INDEX idx_estimates_carrier_profile ON estimates(carrier_profile_id);
CREATE INDEX idx_estimate_line_items_estimate ON estimate_line_items(estimate_id);
CREATE INDEX idx_damage_zones_estimate ON damage_zones(estimate_id);
```

### 1.5 N+1 Query Patterns

| Location | File | Line(s) | Severity |
|----------|------|---------|----------|
| Line item loop queries | `server/services/estimateCalculator.ts` | 173, 554 | HIGH |
| Estimate hierarchy fetching | `server/services/estimateHierarchy.ts` | Multiple | HIGH |
| Sequential page processing | `server/services/documents.ts` | 461, 469, 572 | MEDIUM |

**Description:** Queries inside loops create O(N) database round trips instead of batch queries.

**Recommendation:** Use Drizzle relations with eager loading:
```typescript
const result = await db.query.estimates.findFirst({
  where: (e) => eq(e.id, estimateId),
  with: {
    zones: { with: { lineItems: true } }
  }
});
```

---

## 2. API SURFACE AUDIT

### 2.1 CRITICAL: Unprotected Endpoints

#### Scope Routes - ALL UNPROTECTED
**File:** `server/routes/scopeRoutes.ts`

| Line | Endpoint | Risk |
|------|----------|------|
| 136 | `GET /api/scope/estimate/:estimateId` | Data exposure |
| 180 | `POST /api/scope/estimate/:estimateId/assemble` | Unauthorized modification |
| 222 | `DELETE /api/scope/estimate/:estimateId` | Data deletion |
| 322 | `PATCH /api/scope/items/:itemId/status` | Status manipulation |
| 352 | `POST /api/scope/estimate/:estimateId/approve-all` | Unauthorized approval |

#### Pricing Routes - ALL UNPROTECTED
**File:** `server/routes/pricing.ts`

| Line | Endpoint | Risk |
|------|----------|------|
| 73 | `POST /api/pricing/calculate` | Free access to pricing |
| 117 | `POST /api/pricing/xact/calculate` | Resource abuse |
| 393-596 | All `/api/pricing/*` endpoints | Complete exposure |

#### AI Routes - PARTIALLY UNPROTECTED
**File:** `server/routes/ai.ts`

| Line | Endpoint | Risk |
|------|----------|------|
| 37 | `POST /api/ai/suggest-estimate` | AI abuse |
| 60 | `POST /api/ai/quick-suggest` | AI abuse |
| 108 | `POST /api/voice/session` | Unlimited sessions |

#### Estimate Exports - UNPROTECTED
**File:** `server/routes/estimates.ts`

| Line | Endpoint | Risk |
|------|----------|------|
| 317 | `GET /api/estimates/:id/report/pdf` | Sensitive data |
| 340 | `GET /api/estimates/:id/export/esx` | Data export |
| 376 | `GET /api/estimates/:id/export/csv` | Data export |

**Recommendation:** Add authentication middleware to ALL routes:
```typescript
// At top of each route file
router.use(requireAuth);
router.use(requireOrganization);
```

### 2.2 Missing Tenant Isolation

**Files:** `server/routes/scopeRoutes.ts`, `server/routes/pricing.ts`, `server/routes/estimates.ts`

**Description:** Even where auth exists, organizationId is not validated. Users can access other organizations' data by guessing IDs.

**Recommendation:**
```typescript
// Add to all data queries
const estimate = await db.query.estimates.findFirst({
  where: and(
    eq(estimates.id, estimateId),
    eq(estimates.organizationId, req.organizationId) // Tenant check
  )
});
```

### 2.3 Missing Request Validation

**Severity:** HIGH
**Affected:** ALL route files

**Description:** No Zod or structured validation schemas found. Request bodies accepted without validation.

```typescript
// Current - INSECURE
router.post('/', async (req, res) => {
  const claimData = req.body; // Accepts ANY data
  const claim = await createClaim(organizationId, claimData);
});
```

**Recommendation:**
```typescript
import { z } from 'zod';

const createClaimSchema = z.object({
  insuredName: z.string().min(1),
  propertyAddress: z.string().min(1),
  lossType: z.enum(['wind', 'fire', 'water', 'flood']),
  dateOfLoss: z.string().datetime(),
});

router.post('/', async (req, res) => {
  const validated = createClaimSchema.parse(req.body);
  const claim = await createClaim(organizationId, validated);
});
```

### 2.4 Inconsistent Response Formats

| Pattern | Example | Files |
|---------|---------|-------|
| `{ message: }` | `res.json({ message: 'Failed' })` | claims.ts:50 |
| `{ error: }` | `res.json({ error: 'Failed' })` | scopeRoutes.ts:39 |
| Wrapped | `res.json({ claim })` | claims.ts:48 |
| Unwrapped | `res.json(stats)` | claims.ts:85 |

**Description:** Clients must handle multiple response structures. No standard error envelope.

**Recommendation:** Implement standard response envelope:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  requestId: string;
}
```

### 2.5 Missing CRUD Endpoints

| Entity | Missing Operation | Severity |
|--------|-------------------|----------|
| Organizations | DELETE | HIGH |
| Estimates | DELETE | HIGH |
| Documents | PUT (update) | MEDIUM |
| Rooms | PUT individual | MEDIUM |
| Rooms | DELETE individual | MEDIUM |
| Damage Zones | PUT/DELETE | MEDIUM |
| Users | LIST, DELETE | MEDIUM |

---

## 3. UI ↔ API CONTRACT

### 3.1 Payload Mismatches

| Issue | Server | Client | Severity |
|-------|--------|--------|----------|
| Estimate Templates | Returns `{ templates }` | Expects array | CRITICAL |
| Calculate Estimate | Returns `{ estimate: result }` | Expects unwrapped | CRITICAL |
| Template Query Param | Ignores `damage_type` | Sends filter param | HIGH |

**File (Server):** `server/routes/estimates.ts:507`
**File (Client):** `client/src/lib/api.ts:517-528`

```typescript
// Server returns
res.json({ templates }); // Wrapped object

// Client expects
const response = await fetch('/api/estimate-templates');
return response.json(); // Expects EstimateTemplate[] directly
```

**Recommendation:** Standardize response format - either always wrap or never wrap.

### 3.2 Route Registration Mismatch

**Severity:** HIGH

- **Registration:** `/api/estimate-templates` mounted to `estimatesRoutes`
- **Route Definition:** `router.get('/templates', ...)`
- **Actual Path:** `/api/estimate-templates/templates`
- **Called Path:** `/api/estimate-templates`

**Result:** 404 errors when frontend calls template endpoints.

### 3.3 Dead Endpoints

| Endpoint | Status |
|----------|--------|
| `getEstimateTemplates()` | Never called from UI |
| `createEstimateFromTemplate()` | Never called from UI |

**File:** `client/src/lib/api.ts:517-552`

### 3.4 Missing Loading/Error States

| Component | Issue | Severity |
|-----------|-------|----------|
| Workflow mutations | Errors silently swallowed | MEDIUM |
| Checklist updates | No loading indicator | LOW |

**File:** `client/src/pages/claim-detail.tsx:960-990`

```typescript
try {
  await Promise.allSettled([...mutations]);
} catch {
  // Workflow mutation is best-effort - don't fail the whole save
  // BUT: No visibility into failures
}
```

---

## 4. FEATURE COMPLETENESS

### 4.1 Stub Implementations

| Feature | File | Line(s) | Severity |
|---------|------|---------|----------|
| Editable Sketch Encoder | `shared/geometry/sketchEncoder.ts` | 1-30, 240-250 | HIGH |
| Sentry Error Tracking | `client/src/lib/logger.ts` | 30 | MEDIUM |
| Error Boundary Reporting | `client/src/components/ErrorBoundary.tsx` | 49 | MEDIUM |

**Sketch Encoder:**
```typescript
export class StubSketchEncoder implements EditableSketchEncoder {
  readonly id = 'stub';
  readonly name = 'Stub Encoder (Not Available)';
  // Returns error: 'Stub encoder cannot validate geometry'
}
```

**Impact:** Xactimate SKX export not functional - only PDF underlays supported.

### 4.2 Hardcoded Credentials - CRITICAL

| Issue | File | Line | Value |
|-------|------|------|-------|
| Admin password | `server/services/auth.ts` | 213 | `'admin123'` |
| Admin fallback | `server/services/supabaseAuth.ts` | 323-324 | `'admin123'` |

```typescript
// CRITICAL SECURITY ISSUE
const hashedPassword = await hashPassword('admin123');
```

**Recommendation:** Require environment variables, generate random on first run:
```typescript
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!password) {
  throw new Error('INITIAL_ADMIN_PASSWORD must be set');
}
```

### 4.3 Hardcoded Localhost URLs

| File | Line | Issue |
|------|------|-------|
| `server/services/ms365AuthService.ts` | 22, 25 | Falls back to `localhost:5000` |
| `server/services/supabaseAuth.ts` | 277 | Password reset URL fallback |

**Impact:** Features break in production if env vars missing.

### 4.4 Empty API Key Fallbacks

| File | Line | Variable |
|------|------|----------|
| `server/services/geocoding.ts` | 9 | `GOOGLE_API_KEY || ''` |
| `server/services/routeOptimization.ts` | 28 | Multiple Google keys |
| `server/services/ms365AuthService.ts` | 14-16 | Azure credentials |

**Description:** Empty string fallbacks cause silent failures instead of startup errors.

**Recommendation:**
```typescript
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY required');
}
```

### 4.5 TODO/FIXME Comments

| Pattern | Count | Examples |
|---------|-------|----------|
| `// TODO` | 15+ | Error tracking, carrier ID assignment |
| Commented code | 10+ | Sentry integration |
| `carrier_id: null` | 1 | documentProcessor.ts:2041 |

```typescript
// documentProcessor.ts:2041
carrier_id: null, // TODO: Determine from policy info or organization default
```

### 4.6 Fire-and-Forget Error Handling

| File | Line(s) | Issue |
|------|---------|-------|
| `server/services/documentProcessor.ts` | 1689, 1804, 2205 | `.catch(err => {})` |
| `server/services/documentQueue.ts` | 170 | Silent failure |
| `server/services/photos.ts` | 369, 425 | Background analysis errors lost |

```typescript
// Errors silently swallowed
triggerAIGenerationPipeline(claimId, organizationId, 'fnol').catch(err => {
  // No action taken
});
```

---

## 5. STATE & DATA FLOW

### 5.1 Potential Infinite Loop

**Severity:** CRITICAL
**File:** `client/src/features/voice-sketch/VoiceSketchPage.tsx`
**Lines:** 78-162

```typescript
useEffect(() => {
  if (loadedForClaimId === claimId) return;
  resetAndLoadForClaim(claimId, convertedRooms);
}, [existingRoomsData, claimId, loadedForClaimId, resetAndLoadForClaim]);
```

**Description:** Circular dependency - `resetAndLoadForClaim` updates `loadedForClaimId` which triggers the effect again.

**Recommendation:** Use a ref to track whether already called:
```typescript
const hasLoaded = useRef(false);
useEffect(() => {
  if (hasLoaded.current || loadedForClaimId === claimId) return;
  hasLoaded.current = true;
  resetAndLoadForClaim(claimId, convertedRooms);
}, [claimId]);
```

### 5.2 Memory Leaks - Uncleared Timeouts

| File | Line | Issue |
|------|------|-------|
| `VoicePhotoCapture.tsx` | 139 | `setTimeout` without cleanup |
| `claim-detail.tsx` | 795 | `setTimeout` in async function |

```typescript
// No cleanup if component unmounts
setTimeout(() => setPhase('annotation'), 2500);
```

**Recommendation:**
```typescript
useEffect(() => {
  const id = setTimeout(() => setPhase('annotation'), 2500);
  return () => clearTimeout(id);
}, []);
```

### 5.3 Race Conditions

| Issue | File | Line(s) | Severity |
|-------|------|---------|----------|
| 7-way Promise.all | `claim-detail.tsx` | 563-571 | HIGH |
| Concurrent API without sync | `VoiceSketchPage.tsx` | 174-199 | HIGH |
| Promise.allSettled no monitoring | `claim-detail.tsx` | 986 | MEDIUM |

```typescript
// 7 concurrent calls with individual .catch() - data inconsistency risk
const [claimData, docsData, endorsementsData, scopeData, roomsData, contextData, coverageData] =
  await Promise.all([...]);
```

### 5.4 Cache Rollback Vulnerability

**File:** `client/src/pages/claim-detail.tsx:307-327`

```typescript
onError: (error, _variables, context) => {
  if (context?.previousPhotos) {
    queryClient.setQueryData(['claimPhotos', params?.id], context.previousPhotos);
  }
  // What if context is undefined? Rollback silently fails
}
```

---

## 6. SECURITY SURFACE

### 6.1 Shell Command Injection - CRITICAL

**Files:**
- `server/services/documentProcessor.ts` (lines 623, 636, 662)
- `server/services/documents.ts` (lines 447, 457)

```typescript
// VULNERABLE - User path in shell command
const { stdout } = await execAsync(`pdfinfo "${pdfPath}"`);
const { stdout } = await execAsync(`pdftotext -f ${pageNum} -l ${pageNum} "${pdfPath}" -`);
await execAsync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPrefix}"`);
```

**Attack Vector:** Upload file with backticks in name to escape quotes and execute commands.

**Recommendation:** Use `execFile()` instead of `exec()`:
```typescript
import { execFile } from 'child_process';
await execFile('pdftotext', ['-f', String(pageNum), '-l', String(pageNum), pdfPath, '-']);
```

### 6.2 Missing CORS Configuration - HIGH

**File:** `server/index.ts`

**Description:** No CORS middleware configured. Vulnerable to CSRF and cross-origin attacks.

**Recommendation:**
```typescript
import cors from 'cors';
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
```

### 6.3 Missing Security Headers - HIGH

**Missing:**
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security

**Recommendation:**
```typescript
import helmet from 'helmet';
app.use(helmet());
```

### 6.4 Hardcoded Session Secret

**File:** `server/middleware/auth.ts:86`

```typescript
secret: sessionSecret || 'dev-only-insecure-key-do-not-use-in-production',
```

**Risk:** If deployed without SESSION_SECRET env var, sessions can be forged.

### 6.5 Upload Rate Limiter Not Applied

**File:** `server/routes/documents.ts` (lines 57, 188)

**Description:** Document upload endpoints use multer but don't apply `uploadRateLimiter`.

### 6.6 MIME Type Spoofing Risk

**File:** `server/routes/documents.ts:30-45`

**Description:** Only checks client-provided MIME type. No server-side magic number verification.

**Recommendation:** Add file signature validation:
```typescript
const buffer = file.buffer;
// PDF magic number: %PDF (0x25 0x50 0x44 0x46)
if (buffer[0] !== 0x25 || buffer[1] !== 0x50) {
  throw new Error('Invalid PDF file');
}
```

### 6.7 Sensitive Data in Logs

**Files:** Multiple services

**Description:** PII (insured names, emails, phones) logged without redaction.

```typescript
// Exposes sensitive data
console.log(`[PolicyExtraction] Extraction data: form_code=${extraction.form_code}...`);
```

---

## 7. CROSS-CUTTING CONCERNS

### 7.1 Logging Inconsistency

| Issue | Scope | Severity |
|-------|-------|----------|
| Client uses raw console.log | 50+ locations | HIGH |
| Server mixes console and Pino | 100+ locations | HIGH |
| No request correlation IDs | Client-Server | HIGH |
| PII exposure in logs | Multiple services | CRITICAL |

**Files with console.log:**
- `client/src/pages/claim-detail.tsx` (lines 644, 661, 685, 801, 822, etc.)
- `server/services/documentProcessor.ts` (34, 41, 45, 48, 52, 54, 57, 60)
- `server/services/rulesEngine.ts` (903, 926, 950, 972, 991, etc.)

### 7.2 Error Boundaries - Insufficient

| Component | Status | Issue |
|-----------|--------|-------|
| Root ErrorBoundary | ✓ Exists | Single point of failure |
| Feature-level boundaries | ✗ Missing | Cascading crashes |
| Sentry integration | ✗ TODO | No error tracking |

**File:** `client/src/App.tsx:75` - Only one boundary at root level.

### 7.3 Accessibility Issues

| Issue | Files | Severity |
|-------|-------|----------|
| Canvas not accessible | `sketch-canvas.tsx`, `sketch-canvas-walls.tsx` | CRITICAL |
| No keyboard navigation for sketch | Voice sketch components | HIGH |
| Missing ARIA on canvas | Drawing components | HIGH |
| Some form labels missing | damage-zone-modal.tsx | MEDIUM |

```typescript
// Missing accessibility
<div
  className="canvas-content absolute inset-0"
  onMouseDown={handleCanvasMouseDown}
  onTouchStart={handleCanvasTouchStart}
  // MISSING: role, aria-label, tabIndex, keyboard handlers
>
```

### 7.4 Mobile Responsiveness - GOOD

| Aspect | Status |
|--------|--------|
| Touch targets (44px) | ✓ Implemented |
| Responsive breakpoints | ✓ Well used |
| Safe area support | ✓ Comprehensive |
| Separate layouts | ✓ Mobile/Desktop |

---

## PRIORITIZED REMEDIATION CHECKLIST

### Phase 1: Critical Security (Week 1) - PRODUCTION BLOCKERS

- [ ] **1.1** Add `requireAuth` + `requireOrganization` to ALL scope routes
  - File: `server/routes/scopeRoutes.ts`
- [ ] **1.2** Add `requireAuth` + `requireOrganization` to ALL pricing routes
  - File: `server/routes/pricing.ts`
- [ ] **1.3** Add `requireAuth` to ALL estimate export endpoints
  - File: `server/routes/estimates.ts` (lines 317-596)
- [ ] **1.4** Fix shell injection - replace `exec()` with `execFile()`
  - Files: `documentProcessor.ts`, `documents.ts`
- [ ] **1.5** Remove hardcoded admin password
  - Files: `auth.ts:213`, `supabaseAuth.ts:323-324`
- [ ] **1.6** Add CORS middleware
  - File: `server/index.ts`
- [ ] **1.7** Add security headers (helmet.js)
  - File: `server/index.ts`
- [ ] **1.8** Remove hardcoded session secret fallback
  - File: `server/middleware/auth.ts:86`

### Phase 2: Data Integrity (Week 2)

- [ ] **2.1** Add FK reference: `assignedUserId` → `users.id`
  - File: `shared/schema.ts`
- [ ] **2.2** Add FK reference: `carrierId` → `carrierProfiles.id`
  - File: `shared/schema.ts`
- [ ] **2.3** Add FK reference: `damageZoneId` → `damageZones.id`
  - File: `shared/schema.ts`
- [ ] **2.4** Add FK reference: `estimateId` in damageZones
  - File: `shared/schema.ts`
- [ ] **2.5** Fix cascade settings on claimPhotos
  - File: `shared/schema.ts`
- [ ] **2.6** Add missing indexes on FK columns
- [ ] **2.7** Create migration for all schema changes

### Phase 3: API Hardening (Week 3)

- [ ] **3.1** Implement Zod validation schemas for all routes
- [ ] **3.2** Standardize response envelope format
- [ ] **3.3** Add tenant isolation checks to all queries
- [ ] **3.4** Fix response wrapper mismatches (templates, estimates)
- [ ] **3.5** Add missing CRUD endpoints (org DELETE, estimate DELETE)
- [ ] **3.6** Apply upload rate limiter to document routes
- [ ] **3.7** Fix route registration for estimate-templates

### Phase 4: State & Error Handling (Week 4)

- [ ] **4.1** Fix circular dependency in VoiceSketchPage
- [ ] **4.2** Add cleanup to all setTimeout calls
- [ ] **4.3** Add feature-level ErrorBoundaries
- [ ] **4.4** Integrate Sentry error tracking
- [ ] **4.5** Fix fire-and-forget error handling patterns
- [ ] **4.6** Add request correlation IDs

### Phase 5: Observability & Quality (Week 5)

- [ ] **5.1** Replace all console.log with structured logger
- [ ] **5.2** Implement PII redaction in logs
- [ ] **5.3** Validate env vars at startup
- [ ] **5.4** Remove localhost fallbacks
- [ ] **5.5** Complete sketch encoder implementation OR document limitation
- [ ] **5.6** Resolve all TODO comments or create tickets

### Phase 6: Accessibility (Week 6)

- [ ] **6.1** Add ARIA labels to canvas components
- [ ] **6.2** Implement keyboard navigation for sketch tools
- [ ] **6.3** Add keyboard support for resize handles
- [ ] **6.4** Audit and fix form label associations
- [ ] **6.5** Test with screen reader

---

## APPENDIX: Files Requiring Changes

### Critical Priority

| File | Changes Needed |
|------|----------------|
| `server/routes/scopeRoutes.ts` | Add auth middleware (12 endpoints) |
| `server/routes/pricing.ts` | Add auth middleware (30+ endpoints) |
| `server/routes/estimates.ts` | Add auth to exports (lines 317-596) |
| `server/services/documentProcessor.ts` | Fix exec() (lines 623, 636, 662) |
| `server/services/documents.ts` | Fix exec() (lines 447, 457) |
| `server/services/auth.ts` | Remove hardcoded password (line 213) |
| `server/services/supabaseAuth.ts` | Remove hardcoded password (lines 323-324) |
| `server/middleware/auth.ts` | Remove secret fallback (line 86) |
| `server/index.ts` | Add CORS, helmet |
| `shared/schema.ts` | Add FK references (5 locations) |

### High Priority

| File | Changes Needed |
|------|----------------|
| `client/src/features/voice-sketch/VoiceSketchPage.tsx` | Fix infinite loop (lines 78-162) |
| `client/src/features/voice-sketch/components/VoicePhotoCapture.tsx` | Add timeout cleanup (line 139) |
| `client/src/pages/claim-detail.tsx` | Add timeout cleanup (line 795), error boundaries |
| `client/src/lib/api.ts` | Fix response type expectations |
| `server/routes/estimates.ts` | Fix template query params, response format |
| All route files | Add Zod validation |

---

## CONCLUSION

This codebase implements substantial functionality for a claims management system but has significant gaps that must be addressed before production deployment:

1. **Security is the primary concern** - 42+ unprotected endpoints and shell injection vulnerabilities are critical blockers.
2. **Data integrity requires attention** - Missing FK constraints will cause data corruption over time.
3. **Observability is insufficient** - Inconsistent logging and no error tracking make debugging difficult.

The remediation checklist provides a prioritized path to production readiness. Phases 1-3 should be completed before any production deployment.

---

*Report generated: 2026-01-13*
*Audit methodology: Systematic analysis across 7 dimensions with automated and manual code review*
