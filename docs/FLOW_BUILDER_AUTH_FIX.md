# Flow Builder Authentication Fix

## Issue Found
The flow definition routes were **NOT registered** in the main routes file, meaning the API endpoints didn't exist at all. This would cause:
- 404 errors when trying to access `/api/flow-definitions`
- "Unexpected JSON" errors if the client tried to parse error responses
- Flows not loading because the API calls were failing

## Fix Applied

### 1. Registered Flow Definition Routes
Added the missing route registration in `server/routes.ts`:

```typescript
import flowDefinitionRoutes from './routes/flowDefinitionRoutes';

// In registerRoutes function:
app.use('/api/flow-definitions', requireAuth, flowDefinitionRoutes);
```

### 2. Authentication Setup
The routes are now protected with `requireAuth` middleware, which checks:
- Passport session authentication (`req.isAuthenticated()`)
- OR Supabase token authentication (`req.user` with `isSupabaseAuth` flag)

### 3. Client Credentials
The API client already sends credentials correctly:
```typescript
fetch(url.toString(), {
  credentials: 'include',  // ✅ Sends cookies/session
});
```

## Authentication Flow

1. **User logs in** → Session created via Passport
2. **Session cookie** → Sent with all API requests (`credentials: 'include'`)
3. **requireAuth middleware** → Checks session or Supabase token
4. **Routes accessible** → Flow definitions can be fetched/edited

## Testing

After this fix, verify:
1. ✅ Flow Builder tab loads without errors
2. ✅ Flow list appears in UI
3. ✅ Individual flows can be opened
4. ✅ Flow editor works correctly

## If Still Having Issues

Check browser console for:
- **401 Unauthorized** → Authentication/session issue
- **404 Not Found** → Routes not registered (should be fixed now)
- **500 Server Error** → Backend error (check server logs)

Check server logs for:
- `[FlowDefinitionRoutes]` errors
- Authentication middleware errors
- Database connection issues
