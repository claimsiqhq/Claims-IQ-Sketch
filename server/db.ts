import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

// Database connection - uses Supabase PostgreSQL
// DATABASE_URL should be set to your Supabase database connection string:
// postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set. Configure with your Supabase database connection string.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  // Supabase pooler requires SSL
  ssl: { rejectUnauthorized: false },
  // Supabase pooler recommended settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool);
