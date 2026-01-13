# Schema vs Code vs Database Audit Report
**Date:** 2026-01-12
**Updated:** After database schema review

## Summary
This audit compares:
1. Tables defined in `shared/schema.ts` (Drizzle schema)
2. Tables referenced in code (`server/**/*.ts`)
3. **Actual database tables** (from provided schema dump)

## Database Status
✅ **Database schema matches Drizzle schema** - All 59 tables defined in `shared/schema.ts` exist in the database.

---

## ❌ Tables Referenced in Code but NOT in Database/Schema

### 1. `claim_scope_items` ⚠️ **CRITICAL**
- **Referenced in:** `server/routes/claims.ts` (lines 331, 357)
- **Usage:** GET and POST endpoints for claim-scoped items
- **Database Status:** ❌ **DOES NOT EXIST**
- **Schema Status:** ❌ Not defined in `shared/schema.ts`
- **Impact:** Code will fail when these endpoints are called
- **Action Required:** 
  - **Option A:** Create `claim_scope_items` table (add to schema + migration)
  - **Option B:** Update code to use `scope_items` with claim_id filtering

### 2. `labor_rates` ✅ **FIXED**
- **Referenced in:** `server/services/pricing.ts` (line 114)
- **Usage:** ~~Legacy labor rates table~~ **REMOVED - Code updated to use `labor_rates_enhanced`**
- **Database Status:** ✅ **DOES NOT EXIST** (correct - using `labor_rates_enhanced`)
- **Schema Status:** ✅ Not defined (correct)
- **Impact:** ~~Pricing service will fail~~ **FIXED - Code now uses `labor_rates_enhanced`**
- **Action Required:** ✅ **COMPLETE** - Code updated, table not created

### 3. `material_regional_prices` ⚠️ **CRITICAL**
- **Referenced in:** 
  - `server/routes.ts` (line 1047)
  - `server/scraper/homeDepot.ts` (line 265)
  - `server/services/pricing.ts` (line 78)
- **Usage:** Stores regional pricing for materials
- **Database Status:** ❌ **DOES NOT EXIST**
- **Schema Status:** ❌ Not defined in `shared/schema.ts`
- **Impact:** Material pricing queries will fail
- **Action Required:** Create table definition + migration

### 4. `materials` ⚠️ **CRITICAL**
- **Referenced in:**
  - `server/routes.ts` (line 1053)
  - `server/scraper/homeDepot.ts` (line 252)
  - `server/services/pricing.ts` (line 66)
- **Usage:** Material catalog/SKU table
- **Database Status:** ❌ **DOES NOT EXIST**
- **Schema Status:** ❌ Not defined in `shared/schema.ts`
- **Impact:** Material catalog queries will fail
- **Action Required:** Create table definition + migration

### 5. `price_scrape_jobs` ⚠️ **CRITICAL**
- **Referenced in:**
  - `server/routes.ts` (line 1087)
  - `server/scraper/homeDepot.ts` (lines 291, 315, 346)
- **Usage:** Tracks price scraping jobs
- **Database Status:** ❌ **DOES NOT EXIST**
- **Schema Status:** ❌ Not defined in `shared/schema.ts`
- **Impact:** Scraper job tracking will fail (code has fallback handling)
- **Action Required:** Create table definition + migration (code mentions migration 018)

### 6. `regions` ⚠️ **CRITICAL**
- **Referenced in:**
  - `server/routes.ts` (line 1727)
  - `server/routes/pricing.ts` (line 205)
  - `server/services/estimatePricingEngine.ts` (lines 541, 576)
  - `server/services/pricing.ts` (lines 101, 209, 340, 348)
- **Usage:** Regional data for pricing calculations
- **Database Status:** ❌ **DOES NOT EXIST** (only `regional_multipliers` exists)
- **Schema Status:** ❌ Not defined in `shared/schema.ts`
- **Impact:** Regional pricing queries will fail
- **Action Required:** Create `regions` table OR update code to use `regional_multipliers` with region_code

---

## ⚠️ Tables in Database/Schema but NOT Referenced in Code

### 1. `damage_areas`
- **Defined in:** `shared/schema.ts` (line 1320)
- **Database Status:** ✅ **EXISTS** in database
- **Purpose:** Appears to be for damage area tracking
- **Status:** Defined in schema and database, but never queried/inserted in code
- **Action Required:** 
  - Verify if this is legacy/unused (consider removing)
  - OR implement code to use this table if it's meant for future features
  - **Note:** `damage_zones` (estimate-scoped) and `claim_damage_zones` (claim-scoped) are used instead

### 2. `workflow_rules`
- **Defined in:** `shared/schema.ts` (line 4593)
- **Database Status:** ✅ **EXISTS** in database
- **Purpose:** Stores workflow rule definitions for dynamic workflow generation
- **Status:** Defined in schema and database, but never queried/inserted in code
- **Action Required:** 
  - Verify if this is for future use (likely for dynamic workflow rules engine)
  - OR implement code to use this table
  - **Note:** Workflow generation currently uses hardcoded rules in `dynamicWorkflowService.ts`

---

## ✅ Tables Correctly Defined and Used

The following tables are properly defined in schema and referenced in code:
- `ai_prompts`
- `carrier_excluded_items`
- `carrier_item_caps`
- `carrier_profiles`
- `carrier_rules`
- `claim_briefings`
- `claim_checklist_items`
- `claim_checklists`
- `claim_damage_zones`
- `claim_photos`
- `claim_rooms`
- `claim_structures`
- `claims`
- `coverage_types`
- `damage_zones` (estimate-scoped, different from `claim_damage_zones`)
- `depreciation_schedules`
- `documents`
- `endorsement_extractions`
- `estimate_areas`
- `estimate_coverage_summary`
- `estimate_coverages`
- `estimate_line_items`
- `estimate_missing_walls` (used in purge function)
- `estimate_structures`
- `estimate_subrooms`
- `estimate_templates`
- `estimate_totals` (used via RPC call)
- `estimate_zones`
- `estimates`
- `inspection_appointments`
- `inspection_workflow_assets`
- `inspection_workflow_rooms`
- `inspection_workflow_steps`
- `inspection_workflows`
- `jurisdiction_rules`
- `jurisdictions`
- `labor_rates_enhanced`
- `line_items`
- `organization_memberships`
- `organizations`
- `policy_form_extractions`
- `price_lists`
- `regional_multipliers`
- `rule_effects`
- `scope_items` (estimate-scoped)
- `scope_summary`
- `scope_trades`
- `tax_rates`
- `user_ms365_tokens`
- `users`
- `workflow_mutations`
- `workflow_step_evidence`
- `xact_categories`
- `xact_components`
- `xact_line_items`
- `zone_connections`
- `zone_openings`

---

## 🔍 Key Findings

### Critical Issues
1. **`claim_scope_items` mismatch**: Code expects a claim-scoped scope items table, but schema only has estimate-scoped `scope_items`
2. **Missing pricing infrastructure tables**: `materials`, `material_regional_prices`, `regions`, `price_scrape_jobs` are used but not defined
3. **Legacy table reference**: `labor_rates` referenced but only `labor_rates_enhanced` exists

### Potential Issues
1. **Unused schema tables**: `damage_areas` and `workflow_rules` are defined but never used
2. **Table naming inconsistency**: `claim_damage_zones` vs `damage_zones` (claim-scoped vs estimate-scoped)

---

## 📋 Recommended Actions

### High Priority
1. **Add missing tables to schema:**
   - `materials` - Material catalog
   - `material_regional_prices` - Regional pricing
   - `regions` - Regional data
   - `price_scrape_jobs` - Scraping job tracking

2. **Resolve `claim_scope_items` vs `scope_items`:**
   - Option A: Add `claim_scope_items` table to schema
   - Option B: Update code to use `scope_items` with claim_id filtering

3. **Update `labor_rates` reference:**
   - Change code to use `labor_rates_enhanced` OR add `labor_rates` table

### Medium Priority
4. **Verify unused tables:**
   - Confirm if `damage_areas` and `workflow_rules` are legacy or future features
   - Document purpose or remove if unused

### Low Priority
5. **Consider table naming consistency:**
   - Review pattern: `claim_*` vs estimate-scoped tables
   - Document naming conventions

---

## Database Migration Status

### Missing Tables Requiring Migrations
The following tables are referenced in code but **DO NOT EXIST** in the database:
1. `claim_scope_items` - ✅ Created
2. ~~`labor_rates`~~ - ✅ **FIXED** - Code updated to use `labor_rates_enhanced` (no table needed)
3. `material_regional_prices` - ✅ Created
4. `materials` - ✅ Created
5. `price_scrape_jobs` - ✅ Created
6. `regions` - ✅ Created

### Existing Tables Verified ✅
All 59 tables defined in `shared/schema.ts` exist in the database:
- Schema definitions match database structure
- Foreign keys are properly defined
- Indexes are in place

---

## Next Steps

### Immediate Actions Required

1. **Fix Critical Missing Tables** (Code will fail without these):
   - **Priority 1:** `claim_scope_items` - ✅ Created
   - **Priority 2:** `materials` + `material_regional_prices` - ✅ Created
   - **Priority 3:** `regions` - ✅ Created
   - **Priority 4:** ~~`labor_rates`~~ - ✅ **FIXED** - Code updated to use `labor_rates_enhanced`
   - **Priority 5:** `price_scrape_jobs` - ✅ Created

2. **Create Schema Definitions:**
   - Add missing tables to `shared/schema.ts`
   - Create Drizzle migrations for each table
   - Ensure foreign keys and indexes match usage patterns

3. **Code Updates:**
   - Update `labor_rates` references to `labor_rates_enhanced`
   - Consider if `regions` can be replaced with `regional_multipliers`

4. **Verify Unused Tables:**
   - Document or remove `damage_areas` if unused
   - Implement `workflow_rules` usage or document as future feature

### Database Schema Status
✅ **Database schema is consistent with Drizzle schema definitions**
❌ **6 tables referenced in code do not exist in database**
⚠️ **2 tables exist in database but are unused in code**
