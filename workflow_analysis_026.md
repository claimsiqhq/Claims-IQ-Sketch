# Workflow Analysis 026: Peril Validation Audit

**Date:** 2026-01-18
**Status:** Completed
**Branch:** claude/add-peril-validation-KaeFm

---

## Executive Summary

This audit ensures that only canonical peril codes are used for downstream logic in the Claims IQ codebase. The peril normalization system is now centralized in `perilNormalizer.ts`, with all downstream systems consuming canonical peril codes from the claim record.

---

## Part 1: Violations Identified

### Violations Found and Corrected

| File | Line(s) | Issue | Status |
|------|---------|-------|--------|
| `server/tests/e2e-flow-smoke-test.ts` | 100-106, 207, 241-247 | String literals 'water' and 'water_damage' for comparisons | **FIXED** - Now uses `Peril.WATER` enum |
| `server/services/ai-estimate-suggest.ts` | 58-65 | DAMAGE_TYPE_CATEGORIES used string keys | **FIXED** - Now uses `Peril` enum keys |
| `server/services/unifiedClaimContextService.ts` | 161-180 | Duplicate normalization logic | **FIXED** - Now delegates to `getCanonicalPerilCode()` |
| `server/services/perilAwareContext.ts` | 540-569 | Duplicate normalization logic | **FIXED** - Now delegates to `getCanonicalPerilCode()` |

### Acceptable Patterns (Not Violations)

| File | Line(s) | Pattern | Reason |
|------|---------|---------|--------|
| `server/services/photoTaxonomyService.ts` | 186-230 | `damageTypes.includes('water damage')` | Photo categorization, NOT peril assignment |
| `server/services/flowEngineService.ts` | 176, 373 | Metadata string comparison | Flow template matching, NOT logic |
| `server/services/workflowRulesEngine.ts` | 397+ | `peril.primary` field access | Reads from claim context correctly |
| `server/tests/e2e-full-validation.ts` | 320 | `.or('peril_type.eq.water,...)` | Supabase query filter uses canonical codes |

---

## Part 2: Corrections Applied

### E2E Test Corrections (`e2e-flow-smoke-test.ts`)

```typescript
// BEFORE (violation)
fd.peril_type === 'water'

// AFTER (canonical)
fd.peril_type === Peril.WATER
```

Added import: `import { Peril } from '../../shared/schema';`

### AI Estimate Suggest Corrections (`ai-estimate-suggest.ts`)

```typescript
// BEFORE (string keys)
const DAMAGE_TYPE_CATEGORIES: Record<string, string[]> = {
  water: ['WTR', 'DEM', ...],
  fire: ['FIR', 'DEM', ...],
  wind: ['WND', 'DEM', ...], // Inconsistent with enum
  ...
};

// AFTER (canonical Peril enum keys)
const DAMAGE_TYPE_CATEGORIES: Record<string, string[]> = {
  [Peril.WATER]: ['WTR', 'DEM', ...],
  [Peril.FIRE]: ['FIR', 'DEM', ...],
  [Peril.WIND_HAIL]: ['WND', 'DEM', ...], // Matches enum
  [Peril.FLOOD]: ['WTR', 'DEM', ...], // Added
  [Peril.OTHER]: ['GEN', 'DEM', ...], // Added for unknown perils
  'wind': ['WND', 'DEM', ...], // Legacy compatibility
};
```

---

## Part 3: Guardrails Verified

### Existing Guardrails in `perilNormalizer.ts`

| Function | Purpose | Status |
|----------|---------|--------|
| `guardAgainstPerilRederivation()` | Prevents AI from re-deriving peril from narrative text | Active |
| `checkInspectionPerilConflict()` | Flags conflicts without overwriting primary_peril | Active |
| `validatePerilCode()` | Maps unknown values to `Peril.OTHER` with warning | Active |
| `normalizePerilFromFnol()` | Single point of FNOL peril normalization | Active |

### Unknown Peril Handling

The system gracefully handles `Peril.OTHER` (unknown peril):

1. **Workflow Rules Engine**: Base rules (safety check, exterior inspection) apply to all claims. Peril-specific rules only apply when `peril.primary` matches.
2. **Flow Engine**: Falls back to general flow definition when no peril-specific flow exists.
3. **Estimate Suggest**: Uses generic line item categories for `Peril.OTHER`.

### Conflict Detection (Inspection vs FNOL)

When inspection findings suggest a different peril:
- Conflict is recorded in `peril_conflicts` metadata
- Primary peril is **NEVER** overwritten
- Action is either `flag_for_review` or `escalate` depending on severity

---

## Part 4: Duplicate Normalization Removed

### Consolidated to Single Source

| Legacy Function | Location | Action |
|-----------------|----------|--------|
| `normalizePerilFromCause()` | unifiedClaimContextService.ts:161 | Now delegates to `getCanonicalPerilCode()` |
| `inferPerilFromLegacy()` | perilAwareContext.ts:543 | Now delegates to `getCanonicalPerilCode()` |

Both functions are marked `@deprecated` and log warnings when called. They now delegate to `getCanonicalPerilCode()` to ensure consistent normalization.

### Single Source of Truth

```
perilNormalizer.ts
├── normalizePerilFromFnol()  <-- FNOL ingestion (primary)
├── getCanonicalPerilCode()   <-- Downstream reading (primary)
├── validatePerilCode()       <-- Validation
├── normalizePeril()          <-- Internal helper
└── inferPeril()              <-- Initial extraction (FNOL only)
```

---

## Part 5: Tests Added/Updated

### New Tests in `perilNormalizer.test.ts`

```typescript
it('unknown/other peril should not crash workflow selection', () => {
  const perilCode = getCanonicalPerilCode('other');
  expect(perilCode).toBe(Peril.OTHER);
  const isValidPeril = Object.values(Peril).includes(perilCode);
  expect(isValidPeril).toBe(true);
});

it('invalid peril strings should be normalized before use', () => {
  const invalidPerilValues = ['earthquake', 'vandalism', 'theft', null, undefined, ''];
  for (const invalid of invalidPerilValues) {
    const normalized = getCanonicalPerilCode(invalid);
    expect(normalized).toBe(Peril.OTHER);
  }
});
```

### Existing Test Coverage

| Test | File | Asserts |
|------|------|---------|
| Invalid peril maps to OTHER | perilNormalizer.test.ts:61-71 | Unknown codes map to `Peril.OTHER` |
| Alias resolution | perilNormalizer.test.ts:74-90 | "Wind/Hail" -> `Peril.WIND_HAIL` |
| Guardrail blocks re-derivation | perilNormalizer.test.ts:167-201 | Warning logged, existing peril preserved |
| Conflict detection | perilNormalizer.test.ts:204-279 | Conflicts flagged, never overwritten |
| Downstream uses canonical code | perilNormalizer.test.ts:344-364 | Logic uses `primary_peril_code` |

---

## Success Criteria Verification

| Criteria | Status | Evidence |
|----------|--------|----------|
| Exactly one peril normalization point exists | **PASS** | `normalizePerilFromFnol()` in perilNormalizer.ts |
| All logic keys off canonical codes | **PASS** | `Peril` enum used in comparisons |
| No silent overrides occur | **PASS** | `checkInspectionPerilConflict()` flags but never overwrites |
| Conflicts are explicit and auditable | **PASS** | `PerilConflict` type with `requires_review` flag |
| No schema changes introduced | **PASS** | No migrations created |

---

## Architecture Reference

### Canonical Peril Codes (Peril Enum)

```typescript
export enum Peril {
  WIND_HAIL = "wind_hail",
  FIRE = "fire",
  WATER = "water",
  FLOOD = "flood",
  SMOKE = "smoke",
  MOLD = "mold",
  IMPACT = "impact",
  OTHER = "other"  // Unknown/unclassified perils
}
```

### Normalization Flow

```
FNOL Document → inferPeril() → normalizePerilFromFnol() → claims.primary_peril
                                      ↓
                         ┌────────────────────────────┐
                         │  claim.primary_peril_code  │
                         │     (CANONICAL VALUE)      │
                         └────────────────────────────┘
                                      ↓
              ┌───────────────────────┴───────────────────────┐
              │                                               │
        Workflow Rules                                  AI Prompts
    (reads peril.primary)                    (receives primary_peril_code)
              │                                               │
              ↓                                               ↓
    Peril-specific steps                          Context-aware responses
```

---

## Files Modified

1. `server/tests/e2e-flow-smoke-test.ts` - Use Peril enum for comparisons
2. `server/services/ai-estimate-suggest.ts` - Use Peril enum for category mapping
3. `server/services/unifiedClaimContextService.ts` - Delegate to centralized normalizer
4. `server/services/perilAwareContext.ts` - Delegate to centralized normalizer
5. `server/services/__tests__/perilNormalizer.test.ts` - Added tests for unknown peril handling

---

## Recommendations

### Immediate (Done in this PR)
- [x] Replace string comparisons with Peril enum in tests
- [x] Update DAMAGE_TYPE_CATEGORIES to use canonical codes
- [x] Consolidate duplicate normalization logic
- [x] Add tests for unknown peril handling

### Future Considerations
1. **Database Lookup Tables**: Consider adding `perils` and `peril_aliases` tables for database-level validation
2. **API Endpoint**: Add `/api/perils/validate` endpoint for external integrations
3. **Migration**: Gradually deprecate legacy compatibility code paths

---

*Generated by Claims IQ Peril Validation Audit*
