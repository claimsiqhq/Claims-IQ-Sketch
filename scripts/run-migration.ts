#!/usr/bin/env tsx
/**
 * Run SQL Migration Script
 * 
 * Usage: tsx scripts/run-migration.ts <migration-file.sql>
 */

import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: tsx scripts/run-migration.ts <migration-file.sql>');
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: SUPABASE_DATABASE_URL or DATABASE_URL must be set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    const migrationPath = resolve(__dirname, '..', migrationFile);
    console.log(`Reading migration file: ${migrationPath}`);
    
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Running Migration:', migrationFile);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Execute the migration
    await client.query(sql);
    
    console.log('\n✅ Migration completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
