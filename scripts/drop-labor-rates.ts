#!/usr/bin/env tsx
/**
 * Drop labor_rates table - code now uses labor_rates_enhanced
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

async function dropLaborRates() {
  const client = await pool.connect();
  
  try {
    // Check if labor_rates exists and drop it
    const exists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'labor_rates'
      )
    `);
    
    if (exists.rows[0].exists) {
      await client.query('DROP TABLE IF EXISTS public.labor_rates CASCADE');
      console.log('✅ Dropped labor_rates table (code now uses labor_rates_enhanced)');
    } else {
      console.log('✅ labor_rates table does not exist (already removed)');
    }
  } catch (error) {
    console.error('❌ Failed to drop labor_rates:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

dropLaborRates().catch(console.error);
