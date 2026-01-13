/**
 * Fix MS365 Tokens Schema
 * 
 * This script fixes the user_ms365_tokens table to ensure:
 * 1. Unique constraint on user_id exists
 * 2. account_id column exists
 * 3. expires_at is nullable
 * 
 * Run with: npx tsx scripts/fix_ms365_tokens_schema.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: SUPABASE_DATABASE_URL or DATABASE_URL must be set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Running MS365 tokens schema fix...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '../db/migrations/030_fix_ms365_tokens_unique_constraint.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('The user_ms365_tokens table now has:');
    console.log('  - Unique constraint on user_id');
    console.log('  - account_id column');
    console.log('  - Nullable expires_at column');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
