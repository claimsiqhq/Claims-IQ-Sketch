import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

/**
 * Database Connection Configuration
 *
 * This module connects to the Supabase PostgreSQL database.
 *
 * NEW VARIABLE (recommended):
 * - SUPABASE_DATABASE_URL - Direct PostgreSQL connection string
 *
 * LEGACY VARIABLE (deprecated):
 * - DATABASE_URL - Legacy database URL (for backwards compatibility)
 *
 * Connection string format:
 * postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */

// NEW variable name (preferred), falls back to legacy DATABASE_URL
const databaseUrl =
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'SUPABASE_DATABASE_URL must be set. ' +
    'Configure with your Supabase database connection string. ' +
    'Legacy DATABASE_URL is also accepted for backwards compatibility.'
  );
}

// Log if using legacy variable
if (!process.env.SUPABASE_DATABASE_URL && process.env.DATABASE_URL) {
  console.warn(
    '[database] Using legacy DATABASE_URL. Consider renaming to SUPABASE_DATABASE_URL.'
  );
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
