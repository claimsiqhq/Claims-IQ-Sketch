# Quick Reference Guide

Quick reference for common tasks and information in Claims IQ.

## Common Commands

### Development

```bash
# Start development server
npm run dev

# Start frontend only
npm run dev:client

# Type check
npm run check

# Build for production
npm run build

# Start production server
npm start

# Database migrations
npm run db:push
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/my-feature
```

---

## File Locations

### Frontend

- **Pages**: `client/src/pages/`
- **Components**: `client/src/components/`
- **Features**: `client/src/features/`
- **API Client**: `client/src/lib/api.ts`
- **State**: `client/src/lib/store.ts` (Zustand)

### Backend

- **Routes**: `server/routes.ts`
- **Services**: `server/services/`
- **Middleware**: `server/middleware/`
- **Database**: `server/db.ts`

### Shared

- **Schema**: `shared/schema.ts`
- **Types**: `shared/types.ts`

---

## Common Patterns

### Creating a New API Endpoint

1. **Add route** (`server/routes.ts`):
```typescript
app.get('/api/my-endpoint', requireAuth, async (req, res) => {
  const result = await myService.getData();
  res.json(result);
});
```

2. **Create service** (`server/services/myService.ts`):
```typescript
export async function getData() {
  // Business logic
  return data;
}
```

3. **Add API client** (`client/src/lib/api.ts`):
```typescript
export async function getMyData() {
  const response = await fetch(`${API_BASE}/my-endpoint`, {
    credentials: 'include',
  });
  return response.json();
}
```

### Creating a New Page

1. **Create component** (`client/src/pages/MyPage.tsx`):
```typescript
export default function MyPage() {
  return <div>My Page</div>;
}
```

2. **Add route** (`client/src/App.tsx`):
```typescript
<Route path="/my-page">
  <ProtectedRoute>
    <MyPage />
  </ProtectedRoute>
</Route>
```

### Using React Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { getMyData } from '@/lib/api';

function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['myData'],
    queryFn: getMyData,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error</div>;
  
  return <div>{data}</div>;
}
```

### Using Zustand Store

```typescript
import { useStore } from '@/lib/store';

function MyComponent() {
  const user = useStore((state) => state.authUser);
  const setUser = useStore((state) => state.setAuthUser);
  
  return <div>{user?.name}</div>;
}
```

---

## Environment Variables

### Required

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=sk-...
SESSION_SECRET=...
```

### Optional

```env
PORT=5000
MS365_CLIENT_ID=...
MS365_CLIENT_SECRET=...
MS365_TENANT_ID=...
```

---

## Database Queries

### Get Claims

```typescript
const claims = await db
  .select()
  .from(claims)
  .where(eq(claims.organizationId, orgId));
```

### Get Claim with Relations

```typescript
const claim = await db.query.claims.findFirst({
  where: eq(claims.id, claimId),
  with: {
    structures: {
      with: {
        rooms: true,
      },
    },
    photos: true,
  },
});
```

### Create Claim

```typescript
const [newClaim] = await db
  .insert(claims)
  .values({
    organizationId: orgId,
    claimId: 'CLM-001',
    insuredName: 'John Doe',
  })
  .returning();
```

---

## API Endpoints

### Claims

- `GET /api/claims` - List claims
- `GET /api/claims/:id` - Get claim
- `POST /api/claims` - Create claim
- `PUT /api/claims/:id` - Update claim
- `DELETE /api/claims/:id` - Delete claim

### Documents

- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document
- `GET /api/documents/:id/download` - Download
- `DELETE /api/documents/:id` - Delete

### Photos

- `POST /api/photos` - Upload photo
- `GET /api/photos/:id` - Get photo
- `PUT /api/photos/:id` - Update photo
- `DELETE /api/photos/:id` - Delete photo

### Estimates

- `GET /api/estimates` - List estimates
- `GET /api/estimates/:id` - Get estimate
- `POST /api/estimates` - Create estimate
- `PUT /api/estimates/:id` - Update estimate
- `POST /api/estimates/:id/calculate` - Calculate
- `POST /api/estimates/:id/submit` - Submit

---

## Component Patterns

### Form with React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

function MyForm() {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      <input {...register('email')} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Modal Dialog

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function MyModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My Modal</DialogTitle>
        </DialogHeader>
        <div>Content</div>
      </DialogContent>
    </Dialog>
  );
}
```

### Toast Notifications

```typescript
import { toast } from 'sonner';

// Success
toast.success('Operation completed');

// Error
toast.error('Operation failed');

// Info
toast.info('Information');

// Loading
const loadingToast = toast.loading('Processing...');
toast.dismiss(loadingToast);
toast.success('Done');
```

---

## TypeScript Types

### Common Types

```typescript
// Claim
type Claim = {
  id: string;
  claimId: string;
  insuredName: string;
  status: 'draft' | 'in_progress' | 'completed';
  // ...
};

// User
type User = {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'org_admin' | 'adjuster';
  // ...
};

// Document
type Document = {
  id: string;
  name: string;
  type: 'fnol' | 'policy' | 'endorsement';
  processingStatus: 'pending' | 'processing' | 'completed';
  // ...
};
```

---

## Error Handling

### API Error

```typescript
try {
  const data = await apiCall();
  return data;
} catch (error) {
  logger.error('API call failed', error);
  toast.error('Failed to load data');
  throw error;
}
```

### Form Validation

```typescript
const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password too short'),
});
```

---

## Testing

### Component Test

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

### API Test

```typescript
import request from 'supertest';
import app from '../server';

test('GET /api/claims', async () => {
  const response = await request(app)
    .get('/api/claims')
    .set('Cookie', 'session=...');
  
  expect(response.status).toBe(200);
});
```

---

## Debugging Tips

1. **Frontend**: Use React DevTools, browser console
2. **Backend**: Use `logger.debug()`, VS Code debugger
3. **Database**: Query directly in Supabase dashboard
4. **Network**: Use browser DevTools Network tab
5. **State**: Use React Query DevTools, Zustand DevTools

---

## Common Issues

### Issue: TypeScript Errors

**Solution**: Run `npm run check` to see all errors

### Issue: Database Connection Fails

**Solution**: Check `DATABASE_URL` in `.env`

### Issue: API Returns 401

**Solution**: Check session cookie, login again

### Issue: Build Fails

**Solution**: Clear `node_modules`, reinstall

---

## Useful Links

- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TanStack Query](https://tanstack.com/query)
- [Drizzle ORM](https://orm.drizzle.team)
- [Express.js](https://expressjs.com)

---

For detailed documentation, see:
- [README.md](../README.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Feature Documentation](./COMPLETE_FEATURE_DOCUMENTATION.md)
- [Developer Guide](./DEVELOPER_GUIDE.md)
