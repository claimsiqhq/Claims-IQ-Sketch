import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

// Database connection - uses Supabase PostgreSQL
// DATABASE_URL should be set to your Supabase database connection string:
// postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// Use the "Transaction" pooler connection string from Supabase dashboard for best performance

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Configure with your Supabase database connection string.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase pooler recommended settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool);
