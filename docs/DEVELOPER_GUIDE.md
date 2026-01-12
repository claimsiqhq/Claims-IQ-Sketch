# Developer Guide

Complete guide for developers working on Claims IQ.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js**: 20.x or higher
- **PostgreSQL**: 14+ (or Supabase)
- **npm**: 9.x or higher
- **Git**: Latest version

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd claims-iq

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Required:
# - DATABASE_URL
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
# - OPENAI_API_KEY
# - SESSION_SECRET

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for all required variables.

**Required**:
- `DATABASE_URL` - PostgreSQL connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key
- `SESSION_SECRET` - Random secret for sessions

**Optional**:
- `MS365_CLIENT_ID` - Microsoft 365 app ID
- `MS365_CLIENT_SECRET` - Microsoft 365 secret
- `MS365_TENANT_ID` - Microsoft 365 tenant
- `PORT` - Server port (default: 5000)

---

## Project Structure

```
claims-iq/
├── client/                    # Frontend React app
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   └── ...           # Custom components
│   │   ├── features/          # Feature modules
│   │   │   ├── voice-sketch/ # Voice sketching feature
│   │   │   └── voice-scope/  # Voice scoping feature
│   │   ├── pages/            # Page components
│   │   ├── lib/              # Utilities
│   │   │   ├── api.ts       # API client
│   │   │   ├── queryClient.ts
│   │   │   └── ...
│   │   ├── contexts/         # React contexts
│   │   ├── hooks/           # Custom hooks
│   │   └── App.tsx          # Root component
│   ├── public/              # Static assets
│   └── index.html           # HTML entry point
│
├── server/                   # Backend Express app
│   ├── services/            # Business logic
│   │   ├── claims.ts
│   │   ├── documents.ts
│   │   └── ...
│   ├── routes.ts           # API route definitions
│   ├── middleware/         # Express middleware
│   │   ├── auth.ts
│   │   └── tenant.ts
│   ├── lib/                # Utilities
│   │   ├── supabaseAdmin.ts
│   │   └── ...
│   ├── config/            # Configuration
│   └── index.ts           # Server entry point
│
├── shared/                 # Shared code
│   └── schema.ts          # Database schema (Drizzle)
│
├── db/                    # Database
│   ├── migrations/       # Migration files
│   └── seeds/           # Seed data
│
└── docs/                 # Documentation
```

---

## Development Workflow

### Starting Development

```bash
# Start both frontend and backend
npm run dev

# Or start separately:
npm run dev:client  # Frontend only (port 5000)
npm run dev         # Backend only
```

### Making Changes

1. **Create Feature Branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**:
   - Write code following standards
   - Add tests if applicable
   - Update documentation

3. **Test Locally**:
   ```bash
   npm run check    # TypeScript check
   npm test         # Run tests (when implemented)
   ```

4. **Commit**:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push and Create PR**:
   ```bash
   git push origin feature/my-feature
   # Create pull request on GitHub
   ```

### Code Review Process

1. PR created
2. Automated checks run (TypeScript, linting)
3. Code review by team
4. Address feedback
5. Merge to main

---

## Code Standards

### TypeScript

- **Strict Mode**: Always enabled
- **No `any`**: Use proper types
- **Interfaces**: For object shapes
- **Types**: For unions, intersections
- **Enums**: For constants

**Example**:
```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

type Status = 'pending' | 'completed' | 'failed';

// Bad
const user: any = { ... };
```

### React Components

- **Functional Components**: Use function components
- **Hooks**: Prefer hooks over classes
- **Props Interface**: Define props interface
- **Default Props**: Use default parameters

**Example**:
```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button onClick={onClick} className={variant}>
      {label}
    </button>
  );
}
```

### File Naming

- **Components**: PascalCase (`UserProfile.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Services**: camelCase (`claimService.ts`)
- **Types**: camelCase (`types.ts`)

### Import Order

1. External libraries
2. Internal modules
3. Types
4. Styles

**Example**:
```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';

import type { Claim } from '@/lib/types';
```

### Error Handling

- **Try-Catch**: Always wrap async operations
- **Error Messages**: User-friendly messages
- **Logging**: Use logger utility
- **Fallbacks**: Provide fallback UI

**Example**:
```typescript
try {
  const result = await apiCall();
  return result;
} catch (error) {
  logger.error('API call failed', error);
  toast.error('Failed to load data. Please try again.');
  throw error;
}
```

### State Management

- **Server State**: TanStack Query
- **Client State**: Zustand
- **Form State**: React Hook Form
- **Local State**: useState

---

## Testing

### Unit Tests

```typescript
// Example test structure
import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('formats date correctly', () => {
    const date = new Date('2024-01-15');
    expect(formatDate(date)).toBe('Jan 15, 2024');
  });
});
```

### Integration Tests

Test API endpoints:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server';

describe('GET /api/claims', () => {
  it('returns claims list', async () => {
    const response = await request(app)
      .get('/api/claims')
      .set('Cookie', 'session=...');
    
    expect(response.status).toBe(200);
    expect(response.body.claims).toBeInstanceOf(Array);
  });
});
```

### E2E Tests

Use Playwright or Cypress for end-to-end tests.

---

## Debugging

### Frontend Debugging

1. **React DevTools**: Install browser extension
2. **Console Logging**: Use `logger.debug()`
3. **Breakpoints**: Use browser DevTools
4. **React Query DevTools**: For server state

### Backend Debugging

1. **Console Logging**: Use `logger` utility
2. **Debugger**: Use VS Code debugger
3. **API Testing**: Use Postman or curl
4. **Database**: Query directly in Supabase

### Common Issues

**Issue**: TypeScript errors
**Solution**: Run `npm run check` to see all errors

**Issue**: Database connection fails
**Solution**: Check `DATABASE_URL` in `.env`

**Issue**: API returns 401
**Solution**: Check session cookie, login again

**Issue**: Build fails
**Solution**: Clear `node_modules` and reinstall

---

## Common Tasks

### Adding a New API Endpoint

1. **Add Route** (`server/routes.ts`):
   ```typescript
   app.get('/api/my-endpoint', requireAuth, async (req, res) => {
     const result = await myService.getData();
     res.json(result);
   });
   ```

2. **Create Service** (`server/services/myService.ts`):
   ```typescript
   export async function getData() {
     // Business logic
     return data;
   }
   ```

3. **Add API Client** (`client/src/lib/api.ts`):
   ```typescript
   export async function getMyData() {
     const response = await fetch(`${API_BASE}/my-endpoint`, {
       credentials: 'include',
     });
     return response.json();
   }
   ```

4. **Use in Component**:
   ```typescript
   const { data } = useQuery({
     queryKey: ['myData'],
     queryFn: getMyData,
   });
   ```

### Adding a New Database Table

1. **Define Schema** (`shared/schema.ts`):
   ```typescript
   export const myTable = pgTable('my_table', {
     id: uuid('id').primaryKey().defaultRandom(),
     name: varchar('name').notNull(),
     createdAt: timestamp('created_at').defaultNow(),
   });
   ```

2. **Run Migration**:
   ```bash
   npm run db:push
   ```

3. **Update Types**:
   Types are auto-generated from schema.

### Adding a New Page

1. **Create Component** (`client/src/pages/MyPage.tsx`):
   ```typescript
   export default function MyPage() {
     return <div>My Page</div>;
   }
   ```

2. **Add Route** (`client/src/App.tsx`):
   ```typescript
   <Route path="/my-page">
     <ProtectedRoute>
       <MyPage />
     </ProtectedRoute>
   </Route>
   ```

3. **Add Navigation** (`client/src/components/layouts/MobileLayout.tsx`):
   Add link to navigation menu.

### Adding a New Feature Module

1. **Create Feature Directory**:
   ```
   client/src/features/my-feature/
   ├── components/
   ├── hooks/
   ├── services/
   └── index.ts
   ```

2. **Export from Index**:
   ```typescript
   export { MyFeatureComponent } from './components/MyFeatureComponent';
   export { useMyFeature } from './hooks/useMyFeature';
   ```

3. **Use in App**:
   ```typescript
   import { MyFeatureComponent } from '@/features/my-feature';
   ```

---

## Troubleshooting

### Database Issues

**Problem**: Migrations fail
**Solution**: Check database connection, verify schema matches

**Problem**: RLS policies blocking queries
**Solution**: Check `organizationId` is set, verify RLS policies

### Build Issues

**Problem**: TypeScript errors
**Solution**: Run `npm run check`, fix type errors

**Problem**: Build fails
**Solution**: Clear `dist/` folder, rebuild

### Runtime Issues

**Problem**: API returns 500
**Solution**: Check server logs, verify database connection

**Problem**: Frontend doesn't update
**Solution**: Clear browser cache, check React Query cache

### Performance Issues

**Problem**: Slow API responses
**Solution**: Check database queries, add indexes

**Problem**: Large bundle size
**Solution**: Code splitting, lazy loading

---

## Best Practices

1. **Keep Components Small**: Single responsibility
2. **Reuse Code**: Extract common logic
3. **Type Everything**: No `any` types
4. **Handle Errors**: Always catch and handle
5. **Test Critical Paths**: Test user flows
6. **Document Complex Logic**: Add comments
7. **Follow Conventions**: Consistent patterns
8. **Optimize Performance**: Lazy load, memoize
9. **Security First**: Validate inputs, sanitize
10. **Mobile First**: Design for mobile first

---

## Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TanStack Query](https://tanstack.com/query)
- [Drizzle ORM](https://orm.drizzle.team)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

For more specific documentation, see:
- [API Documentation](./API_DOCUMENTATION.md)
- [Feature Documentation](./COMPLETE_FEATURE_DOCUMENTATION.md)
- [Database Schema](./DATABASE_SCHEMA.md)
