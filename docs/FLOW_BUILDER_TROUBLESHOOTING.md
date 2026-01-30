# Flow Builder Troubleshooting Guide

## Issue: "Unexpected JSON" Error and Flows Not Loading

### Symptoms
- Flow Builder tab shows "Unexpected JSON" error
- No flows appear in the UI
- Browser console shows JSON parsing errors

### Root Causes

1. **Invalid JSON in Database**: The `flow_json` column contains malformed JSON
2. **Serialization Issues**: JSONB data from Supabase not properly serialized for API responses
3. **Schema Mismatch**: Flow JSON structure doesn't match expected TypeScript types

### Diagnosis

Run the diagnostic script to check for issues:

```bash
tsx scripts/diagnose-flow-json-issues.ts
```

This will:
- Check all flow definitions in the database
- Validate JSON structure
- Report any invalid flows
- Show schema versions and structure counts

### Fixes Applied

1. **Enhanced Error Handling in Service Layer** (`server/services/flowDefinitionService.ts`):
   - Added safe JSON parsing for both string and object formats
   - Added explicit JSON serialization to ensure clean API responses
   - Added validation before returning flow definitions

2. **Improved API Client Validation** (`client/src/lib/api.ts`):
   - Added response format validation
   - Better error messages for JSON parsing failures
   - Validates flow structure before returning to UI

3. **Defensive UI Checks** (`client/src/pages/flow-builder.tsx`):
   - Validates flow structure before setting state
   - Better error messages for corrupted flows
   - Graceful fallback when flows can't be loaded

### Manual Fixes

If flows are corrupted in the database:

1. **Mark as Inactive** (safest):
   ```bash
   tsx scripts/diagnose-flow-json-issues.ts --fix
   ```
   This will mark invalid flows as inactive.

2. **Delete Corrupted Flows**:
   ```sql
   -- Find corrupted flows
   SELECT id, name FROM flow_definitions 
   WHERE flow_json IS NULL 
      OR flow_json::text = 'null' 
      OR NOT (flow_json ? 'phases');
   
   -- Delete specific flow (replace ID)
   DELETE FROM flow_definitions WHERE id = 'flow-id-here';
   ```

3. **Repair Flow JSON**:
   ```sql
   -- Check flow structure
   SELECT 
     id, 
     name,
     flow_json->'phases' as phases,
     flow_json->'gates' as gates
   FROM flow_definitions
   WHERE id = 'flow-id-here';
   
   -- Update with valid structure (example)
   UPDATE flow_definitions
   SET flow_json = '{
     "schema_version": "1.0",
     "metadata": {
       "name": "Flow Name",
       "description": "",
       "estimated_duration_minutes": 60,
       "primary_peril": "water",
       "secondary_perils": []
     },
     "phases": [],
     "gates": []
   }'::jsonb
   WHERE id = 'flow-id-here';
   ```

### Prevention

1. **Always Validate Before Saving**:
   - Use the validation endpoint: `POST /api/flow-definitions/validate`
   - Check validation results before creating/updating flows

2. **Test Flow Loading**:
   - After creating a flow, immediately try to load it in the UI
   - Check browser console for any errors

3. **Monitor Logs**:
   - Check server logs for `[FlowDefinitionService]` errors
   - Look for JSON parsing warnings

### Common Issues

#### Issue: "flow_json is not an object"
**Cause**: Database column contains null or invalid JSON string
**Fix**: Check database directly and repair or delete the flow

#### Issue: "Missing phases array"
**Cause**: Flow JSON structure is incomplete
**Fix**: Use the flow builder to recreate the flow or manually fix the JSON

#### Issue: "Invalid JSON response from server"
**Cause**: API response contains non-serializable data
**Fix**: The service layer now handles this automatically, but check server logs

### Testing

After fixes, verify:
1. Flow list loads without errors
2. Individual flows can be opened
3. Flow editor displays correctly
4. Changes can be saved

### Support

If issues persist:
1. Run diagnostic script and share output
2. Check browser console for specific error messages
3. Check server logs for backend errors
4. Verify database connection and permissions
