# Codebase Validation Guide

## Overview

This project includes comprehensive validation scripts to catch schema mismatches, API inconsistencies, missing error handling, and other common issues **before** they cause production bugs.

## Running Validation

### Basic Validation

```bash
npm run validate
```

This will:
- Check for schema mismatches (missing `organization_id`, non-existent columns)
- Validate API route consistency
- Check for missing error handling
- Detect orphaned/deprecated code
- Generate a `validation-report.json` file

### Exit Codes

- `0` - Validation passed (no critical or high issues)
- `1` - Critical issues found (blocks commit/CI)

## What Gets Checked

### 1. Schema Consistency ✅

**Checks:**
- Missing `organization_id` in multi-tenant table inserts
- References to non-existent columns (`item_code`, `item_name`)
- Schema vs database migration mismatches

**Example Issue:**
```
🔴 CRITICAL: Insert into claim_checklist_items missing organization_id
   File: server/services/checklistTemplateService.ts:562
   💡 Add organization_id to insert statement
```

### 2. API Route Validation ✅

**Checks:**
- Inconsistent response formats (`res.json()` vs `sendSuccess()`)
- Routes without error handling
- Missing error handling in async routes

**Example Issue:**
```
🟠 HIGH: 5 routes without error handling
   File: server/routes.ts
   💡 Wrap async route handlers with asyncHandler or try/catch
```

### 3. Service Function Validation ✅

**Checks:**
- Async functions without try/catch
- Database operations without error handling
- Missing error checks on database responses

**Example Issue:**
```
🟡 MEDIUM: Function generateChecklist has await but no try/catch
   File: server/services/checklistTemplateService.ts:483
   💡 Add try/catch error handling
```

### 4. Migration Validation ✅

**Checks:**
- Missing DOWN migrations
- Inconsistent migration naming

### 5. Orphaned Code Detection ✅

**Checks:**
- Deprecated workflow components still in codebase
- References to deprecated API endpoints

## Integration

### Pre-commit Hook

Validation runs automatically before commits (via Husky):

```bash
# Install Husky (if not already installed)
npm install --save-dev husky
npx husky install
```

The `.husky/pre-commit` hook will run validation before allowing commits.

### CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Validate codebase
  run: npm run validate
```

### VS Code Integration

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Validate Codebase",
      "type": "shell",
      "command": "npm run validate",
      "problemMatcher": []
    }
  ]
}
```

## Fixing Issues

### Automatic Fixes (Coming Soon)

```bash
npm run validate:fix
```

Currently, validation only **reports** issues. Automatic fixes are planned for:
- Adding missing `organization_id` to inserts
- Standardizing API responses
- Adding try/catch blocks

### Manual Fixes

1. **Schema Issues:**
   - Add missing `organization_id` to inserts
   - Remove references to non-existent columns
   - Update schema.ts if database structure changed

2. **API Issues:**
   - Standardize on `sendSuccess()` / `sendError()` helpers
   - Wrap async routes with `asyncHandler()`
   - Add error handling to database operations

3. **Service Issues:**
   - Add try/catch to async functions
   - Check for errors in database responses
   - Handle edge cases

## Report Format

The `validation-report.json` file contains:

```json
{
  "timestamp": "2026-01-18T...",
  "summary": {
    "total": 15,
    "critical": 2,
    "high": 5,
    "medium": 6,
    "low": 2
  },
  "issues": [
    {
      "severity": "critical",
      "category": "schema",
      "file": "server/services/checklistTemplateService.ts",
      "line": 562,
      "message": "Insert missing organization_id",
      "recommendation": "Add organization_id to insert"
    }
  ]
}
```

## Best Practices

1. **Run validation before committing:**
   ```bash
   npm run validate
   ```

2. **Fix critical issues immediately:**
   - These will cause production bugs
   - Block commits/CI if not fixed

3. **Address high-priority issues in current sprint:**
   - These can cause issues but are less urgent

4. **Schedule medium/low issues:**
   - Technical debt items
   - Can be addressed in future sprints

5. **Review validation-report.json regularly:**
   - Track progress on fixing issues
   - Identify patterns in issues

## Common Issues & Solutions

### Issue: Missing organization_id

**Problem:**
```typescript
// ❌ Missing organization_id
.insert({
  checklist_id: checklist.id,
  title: item.title,
})
```

**Solution:**
```typescript
// ✅ Include organization_id
.insert({
  checklist_id: checklist.id,
  organization_id: organizationId, // Required!
  title: item.title,
})
```

### Issue: Non-existent columns

**Problem:**
```typescript
// ❌ Column doesn't exist
item_code: item.id,
item_name: item.title,
```

**Solution:**
```typescript
// ✅ Remove non-existent columns
// (item_code and item_name don't exist in schema)
```

### Issue: Missing error handling

**Problem:**
```typescript
// ❌ No error handling
const { data } = await supabase.from('table').insert(values);
```

**Solution:**
```typescript
// ✅ Check for errors
const { data, error } = await supabase.from('table').insert(values);
if (error) {
  throw new Error(error.message);
}
```

## Contributing

To add new validation checks:

1. Add a new validation function in `scripts/validate-codebase.ts`
2. Call it from `main()`
3. Use the `issues.push()` pattern to report findings
4. Document the check in this guide

## Questions?

- Check `validation-report.json` for detailed issue list
- Review this guide for common solutions
- Ask the team for help with complex issues
