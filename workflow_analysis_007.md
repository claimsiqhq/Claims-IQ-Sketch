# Workflow Analysis 007 - Comprehensive Codebase Audit

## Executive Summary
- **Total issues by severity:** Critical: 1, High: 7, Medium: 10, Low: 2
- **Top 3 risks requiring immediate attention:**
  - **Default admin credentials are seeded in code** (Critical) and can be exploited if not overridden.
  - **Dual routing stacks are out of sync** (High), creating a real risk of unprotected endpoints and contract drift.
  - **Destructive migrations delete data without rollback** (High), including production-critical records.
- **Overall production readiness:** **Not production-ready**. There are critical security weaknesses, high-risk data loss migrations, and substantial API inconsistencies that must be resolved before deployment.

---

## 1. Data Layer Integrity

### 1.1 Missing foreign key for claims organization
- **Location:** `shared/schema.ts` L212-L215
- **Severity:** Medium
- **Category:** Data layer integrity / Referential integrity
- **Description:** `claims.organization_id` is required but is **not** constrained to `organizations.id`. This allows orphan claims and weakens tenant isolation.
- **Recommendation:** Add FK constraint in schema + migration.
```
212:215:shared/schema.ts
export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull(),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: 'set null' }),
```

### 1.2 Claims map query uses non-existent columns
- **Location:** `server/routes/claims.ts` L96-L103 and `shared/schema.ts` L229-L241
- **Severity:** High
- **Category:** Data layer integrity / Type consistency
- **Description:** Map query selects `latitude`, `longitude`, `loss_date`, `claim_id` but schema uses `property_latitude`, `property_longitude`, `date_of_loss`, and `claim_number`. This likely fails at runtime or returns empty/incorrect data.
- **Recommendation:** Align query field names with schema.
```
96:103:server/routes/claims.ts
const { data: claims, error } = await supabaseAdmin
  .from('claims')
  .select('id, claim_id, insured_name, latitude, longitude, status, primary_peril, loss_date')
  .eq('organization_id', organizationId)
```
```
229:241:shared/schema.ts
propertyLatitude: decimal("property_latitude", { precision: 10, scale: 7 }),
propertyLongitude: decimal("property_longitude", { precision: 10, scale: 7 }),
dateOfLoss: date("date_of_loss"),
```

### 1.3 Destructive migration deletes orphaned data
- **Location:** `db/migrations/032_add_foreign_key_constraints.sql` L1-L108
- **Severity:** High
- **Category:** Data layer integrity / Migration safety
- **Description:** Migration explicitly deletes data to clean orphans before adding constraints, with no rollback. This is irreversible data loss.
- **Recommendation:** Split into a “report-only” migration and a controlled cleanup job with backups.
```
1:8:db/migrations/032_add_foreign_key_constraints.sql
-- WARNING: NON-REVERSIBLE MIGRATION
-- This migration performs DELETE operations to clean up orphaned records
-- before adding foreign key constraints. These deletes are NOT reversible.
```

### 1.4 Workflow wipe migration is destructive
- **Location:** `db/migrations/046_clear_legacy_workflows.sql` L11-L18
- **Severity:** Medium
- **Category:** Data layer integrity / Migration safety
- **Description:** Deletes all workflow data. This is intentional but still a production data loss risk if run accidentally.
- **Recommendation:** Guard with an environment flag or require manual confirmation via migration tooling.
```
11:18:db/migrations/046_clear_legacy_workflows.sql
DELETE FROM inspection_workflow_steps;
DELETE FROM inspection_workflow_assets;
DELETE FROM inspection_workflows;
```

### 1.5 Deprecated tables dropped without backup
- **Location:** `db/migrations/029_drop_deprecated_tables.sql` L7-L11
- **Severity:** Medium
- **Category:** Data layer integrity / Migration safety
- **Description:** Drops `policy_forms` and `endorsements` with `CASCADE`. If still referenced, data is lost.
- **Recommendation:** Add a migration guard or require manual export first.
```
7:11:db/migrations/029_drop_deprecated_tables.sql
DROP TABLE IF EXISTS policy_forms CASCADE;
DROP TABLE IF EXISTS endorsements CASCADE;
```

### 1.6 N+1 query in document batch status
- **Location:** `server/routes.ts` L4548-L4556
- **Severity:** Medium
- **Category:** Data layer integrity / Query efficiency
- **Description:** Batch status fetch loops per document and runs individual queries. This scales poorly for large batches.
- **Recommendation:** Use `IN` query to fetch all statuses in one call.
```
4548:4556:server/routes.ts
for (const docId of documentIds) {
  try {
    const doc = await getDocument(docId, req.organizationId!);
    result[docId] = doc?.processingStatus || 'pending';
```

### 1.7 Full-table scan for claim stats
- **Location:** `server/services/claims.ts` L719-L777
- **Severity:** Medium
- **Category:** Data layer integrity / Query efficiency
- **Description:** Stats are calculated by loading all claim rows. This will be slow at scale.
- **Recommendation:** Use SQL aggregation (`count`, `sum`, `group by`) instead of fetching all rows.
```
719:777:server/services/claims.ts
const { data: claims, count, error: claimsError } = await supabaseAdmin
  .from('claims')
  .select('status, loss_type, total_rcv, total_acv', { count: 'exact' })
```

### 1.8 Transaction placeholder throws at runtime
- **Location:** `server/lib/transactions.ts` L86-L104
- **Severity:** Medium
- **Category:** Data layer integrity / Feature completeness
- **Description:** `saveEstimateTransaction` is a placeholder that throws, which can break workflows if called.
- **Recommendation:** Implement transactional RPC or remove the API to avoid accidental usage.
```
86:104:server/lib/transactions.ts
export async function saveEstimateTransaction(...) {
  // TODO: Implement using a PostgreSQL function for true transaction support
  throw new Error('Transaction support not yet implemented. Use individual operations.');
}
```

---

## 2. API Surface Audit

### 2.1 Dual routing stacks with diverging behavior
- **Location:** `server/index.ts` L1-L7 and `server/routes/index.ts` L8-L15
- **Severity:** High
- **Category:** API surface / Route-to-handler mapping
- **Description:** The app imports `registerRoutes` from `./routes` (monolithic `routes.ts`), but modular routes exist in `routes/index.ts`. These two stacks define overlapping but inconsistent endpoints.
- **Recommendation:** Remove the unused routing stack or consolidate into one canonical router.
```
1:7:server/index.ts
import { registerRoutes } from "./routes";
```
```
8:15:server/routes/index.ts
import authRoutes from './auth';
import claimsRoutes from './claims';
```

### 2.2 Modular routes lack auth and validation
- **Location:** `server/routes/ai.ts` L33-L81, `server/routes/pricing.ts` L30-L55, `server/routes/claims.ts` L35-L68
- **Severity:** High
- **Category:** API surface / Authentication & request validation
- **Description:** Modular routes omit `requireAuth` and zod validation for sensitive endpoints. If this stack is activated, endpoints are exposed.
- **Recommendation:** Apply `requireAuth`, `requireOrganization`, and validation middleware consistently.
```
33:81:server/routes/ai.ts
router.post('/suggest-estimate', async (req: Request, res: Response) => {
  // no auth or validation
```

### 2.3 Response envelope inconsistency
- **Location:** `server/routes/claims.ts` L81-L86, `server/routes.ts` L1044-L1047
- **Severity:** Medium
- **Category:** API surface / Response consistency
- **Description:** Some endpoints return wrapped objects, others return raw values. This complicates client expectations.
- **Recommendation:** Standardize response shapes across all endpoints.
```
81:86:server/routes/claims.ts
const stats = await getClaimStats(organizationId);
res.json(stats); // Return stats directly, not wrapped
```
```
1044:1047:server/routes.ts
app.get('/api/line-items/categories', ...);
res.json(categories);
```

---

## 3. UI ↔ API Contract

### 3.1 Profile response shape mismatch
- **Location:** `client/src/lib/api.ts` L126-L139 and `server/routes.ts` L944-L950
- **Severity:** Medium
- **Category:** UI ↔ API contract
- **Description:** Client expects `displayName`, server returns `name`. This can break UI display or type safety.
- **Recommendation:** Align response shape (add `displayName` on server or adjust client typings).
```
126:139:client/src/lib/api.ts
export interface UpdateProfileResponse {
  user: {
    ...
    displayName: string;
  };
}
```
```
944:950:server/routes.ts
const userWithName = {
  ...updatedUser,
  name: [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ') || updatedUser.username
};
```

### 3.2 Voice session response mismatch in modular routes
- **Location:** `server/routes/ai.ts` L154-L160 and `server/services/voice-session.ts` L33-L82
- **Severity:** Medium
- **Category:** UI ↔ API contract
- **Description:** Modular route returns `{ session }`, but voice-session service returns `{ ephemeral_key }` and client expects `ephemeral_key`.
- **Recommendation:** Ensure response matches the client contract across all routing stacks.
```
154:160:server/routes/ai.ts
const session = await createVoiceSession({ ... });
res.json({ session });
```
```
33:82:server/services/voice-session.ts
return {
  ephemeral_key: data.value,
  expires_at: data.expires_at,
};
```

---

## 4. Feature Completeness

### 4.1 Sketch encoder is stubbed
- **Location:** `shared/geometry/sketchEncoder.ts` L8-L167
- **Severity:** Medium
- **Category:** Feature completeness / Stubbed code
- **Description:** Editable sketch encoding is explicitly stubbed. Any features depending on editable sketches will fail.
- **Recommendation:** Either implement or explicitly disable/guard UI flows that require editable sketches.
```
8:8:shared/geometry/sketchEncoder.ts
* CURRENT STATUS: Stub implementation only
```

---

## 5. State & Data Flow

### 5.1 Document preview polling has no cancellation
- **Location:** `client/src/components/document-viewer.tsx` L66-L103
- **Severity:** Medium
- **Category:** State & data flow / Race conditions
- **Description:** Polling loop runs even if component unmounts or selected document changes, risking state updates after unmount and wasted work.
- **Recommendation:** Add abort/cancellation and guard state updates.
```
66:103:client/src/components/document-viewer.tsx
while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  const pollResponse = await fetch(`/api/documents/${selectedDoc.id}/previews`, {
    credentials: 'include'
  });
  ...
}
```

---

## 6. Security Surface

### 6.1 Default admin credentials seeded in code
- **Location:** `server/services/auth.ts` L200-L219 and `server/services/supabaseAuth.ts` L322-L355
- **Severity:** Critical
- **Category:** Security / Secrets exposure
- **Description:** Admin user is created with `admin/admin123` defaults. If not overridden in production, this is an immediate compromise risk.
- **Recommendation:** Remove hardcoded credentials; require env vars and fail startup if missing.
```
200:219:server/services/auth.ts
const hashedPassword = await hashPassword('admin123');
...
username: 'admin',
```

### 6.2 Prompt updates are not restricted to admins
- **Location:** `server/routes.ts` L5345-L5349
- **Severity:** High
- **Category:** Security / Authorization
- **Description:** Any authenticated user can update AI prompts, which can materially change system behavior.
- **Recommendation:** Add `requireSuperAdmin` or org role checks.
```
5345:5349:server/routes.ts
app.put('/api/prompts/:key', requireAuth, apiRateLimiter, ...);
```

### 6.3 Response body logging may leak PII
- **Location:** `server/index.ts` L57-L74
- **Severity:** High
- **Category:** Security / Logging
- **Description:** Logs full JSON responses for every API call, including personal and claim data.
- **Recommendation:** Log metadata only or redact sensitive fields.
```
57:74:server/index.ts
if (capturedJsonResponse) {
  logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
}
```

### 6.4 File upload validation only checks MIME type
- **Location:** `server/routes/documents.ts` L25-L45
- **Severity:** Medium
- **Category:** Security / File upload handling
- **Description:** Only MIME type is validated; no content sniffing or antivirus scanning.
- **Recommendation:** Add file signature validation and optional malware scanning.
```
25:45:server/routes/documents.ts
fileFilter: (req, file, cb) => {
  const allowedMimes = [ ... ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
```

---

## 7. Cross-Cutting Concerns

### 7.1 Error handler throws after responding
- **Location:** `server/index.ts` L141-L146
- **Severity:** High
- **Category:** Cross-cutting / Error handling
- **Description:** Errors are re-thrown after sending a response, which can crash the server process.
- **Recommendation:** Remove `throw err` and rely on centralized error handling.
```
141:146:server/index.ts
res.status(status).json({ message });
throw err;
```

### 7.2 Accessibility: icon-only buttons lack aria-label
- **Location:** `client/src/components/document-viewer.tsx` L269-L295
- **Severity:** Low
- **Category:** Cross-cutting / Accessibility
- **Description:** Icon-only buttons do not include `aria-label`, making them inaccessible to screen readers.
- **Recommendation:** Add `aria-label` attributes for icon-only actions.
```
269:295:client/src/components/document-viewer.tsx
<Button ...>
  <ChevronLeft className="w-4 h-4" />
</Button>
```

### 7.3 Logging inconsistency across services
- **Location:** `server/services/claims.ts` L726-L760
- **Severity:** Low
- **Category:** Cross-cutting / Logging consistency
- **Description:** Mixed `console.*` and structured logger usage makes tracing harder across the system.
- **Recommendation:** Standardize on a single structured logger and remove raw console calls.
```
726:760:server/services/claims.ts
console.error('[getClaimStats] Error fetching claims:', claimsError);
console.warn('[getClaimStats] Error fetching total documents:', totalDocsError);
```

---

## Prioritized Remediation Checklist

1. **Remove default admin credentials** and enforce env-only admin setup.
2. **Collapse to a single routing stack** (either modular or monolithic) and delete the other.
3. **Lock down prompt update endpoints** with admin-only auth.
4. **Fix claims map query column mismatches** and add missing FK for `claims.organization_id`.
5. **Review and rework destructive migrations** (032, 046, 029) with backups and guarded execution.
6. **Stop logging full API response bodies**; implement structured redaction.
7. **Fix error handler to avoid process crash** (`throw err`).
8. **Optimize batch document status and claim stats** to avoid N+1 and full scans.
9. **Align profile response contract** (`displayName` vs `name`).
10. **Add cancellation to document preview polling**.
11. **Add stronger upload validation** (file signatures and malware scanning).
12. **Improve accessibility for icon-only controls**.

---

**Audit coverage note:** All requested categories were reviewed. Findings are documented where evidence exists; no category was skipped.
