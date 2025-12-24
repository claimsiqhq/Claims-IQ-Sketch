#!/usr/bin/env npx tsx
/**
 * Supabase Connection Validation Script
 *
 * This script validates:
 * 1. Environment variable configuration (new and legacy keys)
 * 2. Database connectivity via PostgreSQL pool
 * 3. Supabase API connectivity
 * 4. Storage bucket configuration
 * 5. Data population status
 *
 * Usage: npx tsx scripts/validate-supabase.ts
 *
 * Environment Variables (New Format - Recommended):
 * - SUPABASE_URL - Project URL
 * - SUPABASE_PUBLISHABLE_API_KEY - Publishable key (sb_publishable_...)
 * - SUPABASE_SECRET_KEY - Secret key (sb_secret_...)
 * - SUPABASE_DATABASE_URL - PostgreSQL connection string
 *
 * Legacy Variables (Deprecated):
 * - SUPABASE_ANON_KEY - Legacy anon key
 * - SUPABASE_SERVICE_ROLE_KEY - Legacy service role key
 * - DATABASE_URL - Legacy database URL
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pkg from 'pg';
const { Pool } = pkg;

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

function log(result: ValidationResult) {
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log(`   Details:`, JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

/**
 * Detect API key type
 */
function detectKeyType(key: string | undefined): 'new' | 'legacy' | 'unknown' {
  if (!key) return 'unknown';
  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    return 'new';
  }
  if (key.startsWith('eyJ')) {
    return 'legacy';
  }
  return 'unknown';
}

async function validateEnvironmentVariables() {
  console.log('\n📋 Checking Environment Variables...\n');

  // Get key values with fallbacks
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_API_KEY || process.env.SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  // Check SUPABASE_URL
  if (supabaseUrl) {
    log({
      name: 'SUPABASE_URL',
      status: 'pass',
      message: 'Configured',
      details: `${supabaseUrl.substring(0, 40)}...`
    });
  } else {
    log({
      name: 'SUPABASE_URL',
      status: 'fail',
      message: 'Not configured - this is required!'
    });
  }

  // Check Publishable Key (new or legacy)
  if (publishableKey) {
    const keyType = detectKeyType(publishableKey);
    const varName = process.env.SUPABASE_PUBLISHABLE_API_KEY
      ? 'SUPABASE_PUBLISHABLE_API_KEY'
      : 'SUPABASE_ANON_KEY (legacy)';

    log({
      name: varName,
      status: keyType === 'legacy' ? 'warn' : 'pass',
      message: keyType === 'legacy'
        ? 'Using legacy anon key - consider migrating to SUPABASE_PUBLISHABLE_API_KEY'
        : 'Configured with new API key format',
      details: `${publishableKey.substring(0, 30)}... (${keyType} format)`
    });
  } else {
    log({
      name: 'Publishable/Anon Key',
      status: 'fail',
      message: 'Not configured - set SUPABASE_PUBLISHABLE_API_KEY or SUPABASE_ANON_KEY'
    });
  }

  // Check Secret Key (new or legacy)
  if (secretKey) {
    const keyType = detectKeyType(secretKey);
    const varName = process.env.SUPABASE_SECRET_KEY
      ? 'SUPABASE_SECRET_KEY'
      : (process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY (legacy)' : 'SUPABASE_SERVICE_ROLE (legacy)');

    log({
      name: varName,
      status: keyType === 'legacy' ? 'warn' : 'pass',
      message: keyType === 'legacy'
        ? 'Using legacy service role key - consider migrating to SUPABASE_SECRET_KEY'
        : 'Configured with new API key format'
    });
  } else {
    log({
      name: 'Secret/Service Role Key',
      status: 'warn',
      message: 'Not configured - set SUPABASE_SECRET_KEY for admin features'
    });
  }

  // Check Database URL (new or legacy)
  if (databaseUrl) {
    const varName = process.env.SUPABASE_DATABASE_URL
      ? 'SUPABASE_DATABASE_URL'
      : 'DATABASE_URL (legacy)';

    log({
      name: varName,
      status: process.env.SUPABASE_DATABASE_URL ? 'pass' : 'warn',
      message: process.env.SUPABASE_DATABASE_URL
        ? 'Configured'
        : 'Using legacy DATABASE_URL - consider renaming to SUPABASE_DATABASE_URL',
      details: `${databaseUrl.substring(0, 50)}...`
    });
  } else {
    log({
      name: 'Database URL',
      status: 'fail',
      message: 'Not configured - set SUPABASE_DATABASE_URL'
    });
  }

  // Optional variables
  const optionalVars = [
    'SESSION_SECRET',
    'OPENAI_API_KEY',
  ];

  for (const varName of optionalVars) {
    if (process.env[varName]) {
      log({
        name: varName,
        status: 'pass',
        message: 'Configured (optional)'
      });
    } else {
      log({
        name: varName,
        status: 'warn',
        message: 'Not configured (optional - some features may be limited)'
      });
    }
  }
}

async function validateDatabaseConnection() {
  console.log('\n🗄️  Testing Database Connection...\n');

  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    log({
      name: 'Database Connection',
      status: 'fail',
      message: 'SUPABASE_DATABASE_URL not set - cannot test connection'
    });
    return null;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();

    // Test basic connection
    const timeResult = await client.query('SELECT NOW() as time, version() as version');
    log({
      name: 'Database Connection',
      status: 'pass',
      message: 'Successfully connected to PostgreSQL',
      details: {
        time: timeResult.rows[0].time,
        version: timeResult.rows[0].version.split(' ').slice(0, 2).join(' ')
      }
    });

    // Check for tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableCount = tablesResult.rows.length;
    log({
      name: 'Database Tables',
      status: tableCount > 0 ? 'pass' : 'warn',
      message: `Found ${tableCount} tables in public schema`,
      details: tableCount > 0 ? { tables: tablesResult.rows.map(r => r.table_name) } : undefined
    });

    // Check data population
    const countsResult = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM materials) as materials_count,
        (SELECT COUNT(*) FROM line_items) as line_items_count,
        (SELECT COUNT(*) FROM regions) as regions_count,
        (SELECT COUNT(*) FROM material_regional_prices) as prices_count,
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM organizations) as orgs_count,
        (SELECT COUNT(*) FROM claims) as claims_count
    `);

    const counts = countsResult.rows[0];
    const dataPopulated =
      parseInt(counts.materials_count) > 0 ||
      parseInt(counts.line_items_count) > 0 ||
      parseInt(counts.regions_count) > 0;

    log({
      name: 'Data Population',
      status: dataPopulated ? 'pass' : 'warn',
      message: dataPopulated ? 'Database contains data' : 'Database appears empty',
      details: {
        materials: parseInt(counts.materials_count),
        lineItems: parseInt(counts.line_items_count),
        regions: parseInt(counts.regions_count),
        materialPrices: parseInt(counts.prices_count),
        users: parseInt(counts.users_count),
        organizations: parseInt(counts.orgs_count),
        claims: parseInt(counts.claims_count)
      }
    });

    // Check regions specifically
    if (parseInt(counts.regions_count) > 0) {
      const regionsResult = await client.query('SELECT id, name FROM regions ORDER BY id LIMIT 10');
      log({
        name: 'Regions Data',
        status: 'pass',
        message: `Found ${counts.regions_count} regions`,
        details: { sample: regionsResult.rows }
      });
    }

    client.release();
    return pool;
  } catch (error) {
    log({
      name: 'Database Connection',
      status: 'fail',
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    return null;
  } finally {
    await pool.end();
  }
}

async function validateSupabaseAPI() {
  console.log('\n🔌 Testing Supabase API Connection...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_API_KEY || process.env.SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !publishableKey) {
    log({
      name: 'Supabase API',
      status: 'fail',
      message: 'SUPABASE_URL or publishable key not configured'
    });
    return;
  }

  // Detect key types
  const publishableKeyType = detectKeyType(publishableKey);
  const secretKeyType = detectKeyType(secretKey);

  log({
    name: 'API Key Types',
    status: (publishableKeyType === 'new' || secretKeyType === 'new') ? 'pass' : 'warn',
    message: `Publishable: ${publishableKeyType}, Secret: ${secretKeyType}`,
    details: publishableKeyType === 'legacy'
      ? 'Consider migrating to new sb_publishable_/sb_secret_ key format'
      : undefined
  });

  // Test public client
  const publicClient = createClient(supabaseUrl, publishableKey);

  try {
    // Test auth health
    const { data: authData, error: authError } = await publicClient.auth.getSession();
    log({
      name: 'Supabase Auth API',
      status: authError ? 'fail' : 'pass',
      message: authError ? `Auth check failed: ${authError.message}` : 'Auth API responding'
    });
  } catch (error) {
    log({
      name: 'Supabase Auth API',
      status: 'fail',
      message: `Auth API error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }

  // Test admin client if service key is available
  if (secretKey) {
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    try {
      // Test storage access
      const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();
      if (bucketsError) {
        log({
          name: 'Supabase Storage',
          status: 'fail',
          message: `Storage access failed: ${bucketsError.message}`
        });
      } else {
        const documentsBucket = buckets?.find(b => b.name === 'documents');
        log({
          name: 'Supabase Storage',
          status: 'pass',
          message: `Found ${buckets?.length || 0} storage buckets`,
          details: {
            buckets: buckets?.map(b => b.name) || [],
            documentsConfigured: !!documentsBucket
          }
        });
      }

      // Test admin auth
      const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 1 });
      log({
        name: 'Supabase Admin API',
        status: usersError ? 'fail' : 'pass',
        message: usersError
          ? `Admin API error: ${usersError.message}`
          : `Admin API working - ${users?.users?.length || 0} auth users found`
      });
    } catch (error) {
      log({
        name: 'Supabase Admin Features',
        status: 'fail',
        message: `Admin features error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  } else {
    log({
      name: 'Supabase Admin Features',
      status: 'warn',
      message: 'SUPABASE_SECRET_KEY not configured - admin features unavailable'
    });
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All critical checks passed! Supabase is connected and working.');
  } else {
    console.log('🔧 Some checks failed. Please review the configuration above.');
    console.log('\nFailed checks:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }

  if (warned > 0) {
    console.log('\nWarnings to review:');
    results.filter(r => r.status === 'warn').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }

  // Migration guidance
  const legacyWarnings = results.filter(r =>
    r.status === 'warn' &&
    (r.name.includes('legacy') || r.message.includes('legacy'))
  );

  if (legacyWarnings.length > 0) {
    console.log('\n📚 API Key Migration Guide:');
    console.log('   https://supabase.com/docs/guides/api/api-keys');
    console.log('   New key format: sb_publishable_xxx / sb_secret_xxx');
  }

  console.log('\n');
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 SUPABASE CONNECTION VALIDATION');
  console.log('   Claims-IQ Sketch');
  console.log('   Supports new API key format (June 2025+)');
  console.log('='.repeat(60));

  await validateEnvironmentVariables();
  await validateDatabaseConnection();
  await validateSupabaseAPI();
  await printSummary();

  // Exit with error code if any critical failures
  const failed = results.filter(r => r.status === 'fail').length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Validation script error:', error);
  process.exit(1);
});
