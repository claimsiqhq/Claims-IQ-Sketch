/**
 * Fix MS365 Schema Issues
 * 
 * This script fixes:
 * 1. user_ms365_tokens table:
 *    - Unique constraint on user_id exists
 *    - account_id column exists
 *    - expires_at is nullable
 * 2. inspection_appointments table:
 *    - Rename adjuster_id to user_id if needed
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
    console.log('Running MS365 schema fixes...\n');
    
    // Fix user_ms365_tokens table
    console.log('1. Fixing user_ms365_tokens table...');
    const tokensMigrationPath = join(__dirname, '../db/migrations/030_fix_ms365_tokens_unique_constraint.sql');
    const tokensMigrationSQL = readFileSync(tokensMigrationPath, 'utf-8');
    await client.query(tokensMigrationSQL);
    console.log('   ✅ user_ms365_tokens table fixed\n');
    
    // Fix inspection_appointments table
    console.log('2. Fixing inspection_appointments table...');
    const appointmentsMigrationPath = join(__dirname, '../db/migrations/031_fix_inspection_appointments_user_id.sql');
    const appointmentsMigrationSQL = readFileSync(appointmentsMigrationPath, 'utf-8');
    await client.query(appointmentsMigrationSQL);
    console.log('   ✅ inspection_appointments table fixed\n');
    
    console.log('✅ All migrations completed successfully!');
    console.log('\nSummary:');
    console.log('  user_ms365_tokens:');
    console.log('    - Unique constraint on user_id');
    console.log('    - account_id column');
    console.log('    - Nullable expires_at column');
    console.log('  inspection_appointments:');
    console.log('    - Column renamed from adjuster_id to user_id');
    console.log('    - Indexes renamed accordingly');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
