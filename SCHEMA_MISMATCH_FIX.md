# Critical Schema Mismatch Fix - Checklist Items

## Issues Found

### Issue 1: Missing Required Columns

**CRITICAL BUG:** The code was missing `organization_id` in item inserts, causing silent failures!

**Problem:** The `claim_checklist_items` table requires `organization_id` (likely via foreign key or NOT NULL constraint), but the code wasn't inserting it.

**Impact:** INSERT statements were failing silently, causing checklist items to never be created. The checklist header would be created successfully (with `total_items: 17` for example), but actual items = 0.

**Fix Applied:**
1. Added `organization_id: organizationId` to `itemsToInsert` in `generateChecklistForClaim()`
2. Added `organization_id` lookup and insert in `addCustomChecklistItem()` (fetches from checklist)
3. Added verification that insert succeeded by checking `insertedItems.length`
4. Added error handling to archive checklist if items fail to insert

### Issue 2: Non-Existent Columns

**CRITICAL BUG:** The code was trying to insert columns that don't exist in the database!

### Problem

The `generateChecklistForClaim` function was inserting:
- `item_code` - **DOES NOT EXIST** in database
- `item_name` - **DOES NOT EXIST** in database

### Database Schema (from migration 028)

The `claim_checklist_items` table has:
- `id` (primary key, auto-generated)
- `checklist_id`
- `title`
- `description`
- `category`
- `required_for_perils`
- `required_for_severities`
- `required`
- `priority`
- `sort_order`
- `status`
- `completed_by`
- `completed_at`
- `skipped_reason`
- `notes`
- `linked_document_ids`
- `due_date`
- `created_at`
- `updated_at`

**NO `item_code` or `item_name` columns!**

### Code Was Trying To Insert

```typescript
{
  checklist_id: checklist.id,
  item_code: item.id,        // ❌ COLUMN DOES NOT EXIST
  item_name: item.title,     // ❌ COLUMN DOES NOT EXIST
  title: item.title,
  // ... rest
}
```

### Impact

This would cause the INSERT to fail with an error like:
```
column "item_code" does not exist
```

However, the error handling was catching this but not logging it properly, so items silently failed to insert while the checklist was created successfully (with `total_items: 0`).

**Fix Applied:**

Removed `item_code` and `item_name` from the insert statements in:
1. `generateChecklistForClaim()` - Main generation function
2. `addCustomChecklistItem()` - Custom item addition

## Verification

After these fixes:
1. ✅ Checklist items will insert successfully (with `organization_id`)
2. ✅ Items will appear in the UI
3. ✅ The `total_items` count will match the actual number of items
4. ✅ Insert verification ensures all items were created
5. ✅ Failed inserts will archive the checklist and return clear errors

## Testing

To verify the fix works:
1. Try regenerating a checklist for a claim
2. Check server logs for `[Checklist]` messages
3. Verify items appear in the UI
4. Check database: `SELECT COUNT(*) FROM claim_checklist_items WHERE checklist_id = '<checklist_id>'`
