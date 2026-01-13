#!/usr/bin/env tsx
/**
 * Verify Migration Results
 */

import { Pool } from 'pg';

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: SUPABASE_DATABASE_URL or DATABASE_URL must be set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    // Check if tables were created
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('claim_scope_items', 'materials', 'material_regional_prices', 'regions', 'price_scrape_jobs', 'labor_rates')
      ORDER BY table_name
    `);
    console.log('✅ Created tables:', tables.rows.map(r => r.table_name).join(', '));
    console.log(`   Total: ${tables.rows.length} of 6 tables\n`);
    
    // Check migration counts
    const laborRates = await client.query('SELECT COUNT(*) as count FROM labor_rates');
    const regions = await client.query('SELECT COUNT(*) as count FROM regions');
    console.log('📊 Migration results:');
    console.log('  - labor_rates:', laborRates.rows[0].count, 'rows');
    console.log('  - regions:', regions.rows[0].count, 'rows\n');
    
    // Check if unused tables still exist
    const damageAreas = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'damage_areas'
    `);
    const workflowRules = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'workflow_rules'
    `);
    
    console.log('🗑️  Unused tables status:');
    console.log('  - damage_areas:', damageAreas.rows[0].count === '1' ? 'EXISTS (check data)' : 'REMOVED ✅');
    console.log('  - workflow_rules:', workflowRules.rows[0].count === '1' ? 'EXISTS (check data)' : 'REMOVED ✅');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyMigration().catch(console.error);
