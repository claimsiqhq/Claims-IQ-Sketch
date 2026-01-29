# Database Validation Scripts Usage Guide

## Overview

These scripts help validate database usage and ensure purge functions work correctly:

1. **audit-database-usage.ts** - Finds orphaned records and missing indexes
2. **validate-column-population.ts** - Checks column usage and population rates
3. **validate-purge-completeness.ts** - Verifies no artifacts remain after purge
4. **generate-database-usage-report.ts** - Comprehensive health report

## Prerequisites

1. **Environment Variables**: Ensure your `.env` file has Supabase credentials:
   ```bash
   SUPABASE_URL=your-project-url
   SUPABASE_SECRET_KEY=your-secret-key
   # OR legacy:
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. **Dependencies**: Already installed (uses `tsx` from package.json)

## Running the Scripts

### 1. Audit Database Usage

Finds all tables with `claim_id` and checks for orphaned records, missing indexes, and foreign key issues.

```bash
# Audit all tables
tsx scripts/audit-database-usage.ts

# Audit specific organization
tsx scripts/audit-database-usage.ts --org-id <your-org-id>
```

**Output**: Lists tables with `claim_id`, orphaned record counts, missing indexes, and recommendations.

**Exit Code**: 
- `0` = No issues found
- `1` = Issues found (orphaned records or missing indexes)

---

### 2. Validate Column Population

Analyzes column usage patterns to identify unused columns and missing data.

```bash
# Validate all claim-related tables
tsx scripts/validate-column-population.ts

# Validate specific table
tsx scripts/validate-column-population.ts --table claims

# Validate for specific organization
tsx scripts/validate-column-population.ts --org-id <your-org-id>
```

**Output**: Shows column population percentages, identifies always-NULL columns, and flags low-population columns.

**Exit Code**:
- `0` = No issues found
- `1` = Issues found (unused columns or low population)

---

### 3. Validate Purge Completeness

Verifies that purge operations removed all claim-related data.

```bash
# Validate purge for organization
tsx scripts/validate-purge-completeness.ts --org-id <your-org-id>

# Validate specific claims
tsx scripts/validate-purge-completeness.ts --org-id <your-org-id> --claim-ids <id1,id2,id3>
```

**Output**: Lists any remaining artifacts in database tables and storage buckets.

**Exit Code**:
- `0` = No artifacts found
- `1` = Artifacts found

---

### 4. Generate Comprehensive Database Usage Report

Combines all audits into a single comprehensive report.

```bash
# Generate report for all data
tsx scripts/generate-database-usage-report.ts

# Generate report for specific organization
tsx scripts/generate-database-usage-report.ts --org-id <your-org-id>

# Save report to JSON file
tsx scripts/generate-database-usage-report.ts --org-id <your-org-id> --output report.json
```

**Output**: 
- Overall health score
- Health metrics (claims, documents, photos counts)
- Schema audit summary
- Column validation summary
- Purge validation summary
- Recommendations

**Exit Code**:
- `0` = No critical issues
- `1` = Critical issues found

---

## Quick Start Example

```bash
# 1. First, get your organization ID from the database or UI
# You can find it in the organizations table or from your user session

# 2. Run comprehensive report
tsx scripts/generate-database-usage-report.ts --org-id <your-org-id> --output db-report.json

# 3. Review the output and recommendations

# 4. If issues found, run specific audits:
tsx scripts/audit-database-usage.ts --org-id <your-org-id>
tsx scripts/validate-column-population.ts --org-id <your-org-id>

# 5. After running purge, validate completeness:
tsx scripts/validate-purge-completeness.ts --org-id <your-org-id>
```

## Understanding the Output

### Health Scores
- **Excellent** (90-100): No issues found
- **Good** (75-89): Minor issues, optimizations available
- **Fair** (60-74): Some issues that should be addressed
- **Poor** (<60): Critical issues requiring immediate attention

### Common Issues and Fixes

1. **Orphaned Records**: Records referencing non-existent claims
   - Fix: Run cleanup script or use purge function

2. **Missing Indexes**: Tables with `claim_id` but no index
   - Fix: Add indexes via migration: `CREATE INDEX idx_table_claim_id ON table(claim_id);`

3. **Always-NULL Columns**: Columns never populated
   - Fix: Review if column is needed, consider removing or populating

4. **Low Population Columns**: Columns rarely populated (<10%)
   - Fix: Review business logic to ensure proper population

5. **Purge Artifacts**: Records remaining after purge
   - Fix: Review and update `purgeAllClaims` function

## Integration with CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Validate Database
  run: |
    tsx scripts/generate-database-usage-report.ts --org-id ${{ secrets.ORG_ID }}
  continue-on-error: true
```

## Troubleshooting

### "Cannot find module" errors
```bash
# Ensure dependencies are installed
npm install
```

### "Supabase configuration is incomplete" errors
```bash
# Check your .env file has required variables
cat .env | grep SUPABASE
```

### Scripts run but show no data
- Verify organization ID is correct
- Check that you have data in the database
- Ensure Supabase credentials have proper permissions

## Next Steps

After running these scripts:

1. **Review Recommendations**: Each script provides specific recommendations
2. **Fix Critical Issues**: Address orphaned records and missing indexes first
3. **Optimize**: Review low-population columns and consider removing unused ones
4. **Monitor**: Run scripts regularly (weekly/monthly) to track database health
5. **Document**: Keep track of issues found and fixes applied

## Fixing Issues Found

After running validation scripts, you can fix issues automatically:

### Option 1: Generate SQL Migration File (Recommended)

```bash
# Generate a SQL migration file with all fixes
tsx scripts/fix-database-issues.ts --generate-sql
```

This creates a migration file in `db/migrations/` that you can review and run manually.

### Option 2: Use Pre-Created Migration

A migration file has been created at `db/migrations/059_fix_validation_issues.sql` that fixes:
- Missing indexes on `claim_scope_items` and `endorsement_extractions`
- Missing FK constraints on the same tables

Run it via your database client or migration tool.

### Option 3: Manual SQL Execution

For the issues found in your report:

```sql
-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_claim_scope_items_claim_id 
  ON claim_scope_items(claim_id);

CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_claim_id 
  ON endorsement_extractions(claim_id);

-- Add missing FK constraints (after cleaning orphans)
ALTER TABLE claim_scope_items
  ADD CONSTRAINT fk_claim_scope_items_claim
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;

ALTER TABLE endorsement_extractions
  ADD CONSTRAINT fk_endorsement_extractions_claim
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;
```

## Understanding Your Results

Based on your validation report:

### ✅ Good News
- **No orphaned records** - Data integrity is good
- **No critical issues** - Database is in good shape
- **Good document/photo ratios** - 3.67 docs/claim, 2.33 photos/claim

### ⚠️ Items to Address

1. **Missing Indexes** (2 tables)
   - `claim_scope_items` - Add index on `claim_id`
   - `endorsement_extractions` - Add index on `claim_id`
   - **Impact**: Slower queries when filtering by claim_id
   - **Fix**: Run migration `059_fix_validation_issues.sql`

2. **Missing FK Constraints** (2 tables)
   - Same tables as above
   - **Impact**: No automatic cleanup on claim deletion
   - **Fix**: Run migration `059_fix_validation_issues.sql`

3. **Always-NULL Columns** (16 columns)
   - These columns are never populated
   - **Impact**: Wasted storage, potential confusion
   - **Action**: Review if columns are needed:
     - **claims table**: `assigned_user_id`, `carrier_id`, `claim_type`, `coverage_d`, `assigned_adjuster_id`, `closed_at`, `dol_weather_hail_size`, `dol_weather_humidity`
     - **documents table**: `preview_error`
     - **claim_photos table**: `structure_id`, `room_id`, `damage_zone_id`, `uploaded_by`, `geo_address`, `taxonomy_prefix`, `taxonomy_category_id`
   - **Decision**: Keep if planned for future use, remove if truly unused

## Related Functions

The scripts work alongside these updated functions:

- `deleteClaim(id, organizationId, hardDelete?)` - Now supports hard delete
- `purgeAllClaims(organizationId)` - Now includes all related tables

See `server/services/claims.ts` for implementation details.
