import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit Configuration
 *
 * Uses the new Supabase database URL variable format.
 * Falls back to legacy DATABASE_URL for backwards compatibility.
 */

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. " +
    "Legacy DATABASE_URL is also accepted for backwards compatibility."
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
