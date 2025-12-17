import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

// Database connection - uses Supabase PostgreSQL
// SUPABASE_URL should be set to your Supabase database connection string

const databaseUrl = process.env.SUPABASE_URL;

if (!databaseUrl) {
  throw new Error('SUPABASE_URL must be set. Configure with your Supabase database connection string.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  // Supabase pooler recommended settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool);
