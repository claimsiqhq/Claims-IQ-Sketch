import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Database Connection Configuration
 *
 * This module connects to the Supabase PostgreSQL database using postgres.js.
 * Uses the Supabase connection pooler with prepare: false for transaction mode.
 *
 * Connection string format:
 * postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 */

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

if (!process.env.SUPABASE_DATABASE_URL && process.env.DATABASE_URL) {
  console.warn(
    '[database] Using legacy DATABASE_URL. Consider renaming to SUPABASE_DATABASE_URL.'
  );
}

const client = postgres(databaseUrl, {
  prepare: false,
  ssl: 'require',
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client);

export { client as pool };
