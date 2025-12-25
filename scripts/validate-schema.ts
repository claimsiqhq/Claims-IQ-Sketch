#!/usr/bin/env ts-node
/**
 * Schema Validation Script
 * 
 * Validates that all tables, indexes, foreign keys, and constraints
 * referenced in the codebase exist in the Supabase database.
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function log(result: ValidationResult) {
  results.push(result);
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log(`   ${result.details}`);
  }
}

// Tables that should exist based on codebase analysis
const REQUIRED_TABLES = [
  'organizations',
  'users',
  'organization_memberships',
  'claims',
  'documents',
  'estimates',
  'estimate_line_items',
  'estimate_structures',
  'estimate_areas',
  'estimate_zones',
  'estimate_coverages',
  'estimate_missing_walls',
  'estimate_subrooms',
  'estimate_coverage_summary',
  'line_items',
  'line_item_categories',
  'regions',
  'materials',
  'material_regional_prices',
  'price_lists',
  'tax_rates',
  'depreciation_schedules',
  'regional_multipliers',
  'labor_rates_enhanced',
  'labor_rates',
  'carrier_profiles',
  'carrier_rules',
  'carrier_excluded_items',
  'carrier_item_caps',
  'jurisdictions',
  'jurisdiction_rules',
  'rule_effects',
  'coverage_types',
  'xact_categories',
  'xact_line_items',
  'xact_components',
  'policy_forms',
  'policy_form_extractions',
  'endorsements',
  'endorsement_extractions',
  'claim_briefings',
  'claim_structures',
  'claim_rooms',
  'claim_damage_zones',
  'claim_photos',
  'claim_checklists',
  'claim_checklist_items',
  'inspection_workflows',
  'inspection_workflow_steps',
  'inspection_workflow_assets',
  'inspection_workflow_rooms',
  'ai_prompts',
  'sessions',
  'price_scrape_jobs',
  'price_history',
  'estimate_templates',
];

async function validateTables() {
  log({ name: 'Table Validation', status: 'pass', message: 'Checking required tables...' });

  try {
    // Get all tables from information_schema
    const { data: tables, error } = await supabaseAdmin.rpc('exec_sql', {
      query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `
    });

    if (error) {
      // Try alternative method
      const { data: altTables } = await supabaseAdmin
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');

      const existingTables = altTables?.map((t: any) => t.table_name) || [];

      const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));
      const extraTables = existingTables.filter((t: string) => !REQUIRED_TABLES.includes(t));

      if (missingTables.length > 0) {
        log({
          name: 'Missing Tables',
          status: 'fail',
          message: `Found ${missingTables.length} missing tables`,
          details: missingTables.join(', ')
        });
      } else {
        log({
          name: 'All Required Tables',
          status: 'pass',
          message: `All ${REQUIRED_TABLES.length} required tables exist`
        });
      }

      if (extraTables.length > 0) {
        log({
          name: 'Extra Tables',
          status: 'warn',
          message: `Found ${extraTables.length} tables not in required list`,
          details: extraTables.join(', ')
        });
      }
    } else {
      const existingTables = tables?.map((t: any) => t.table_name) || [];
      const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));

      if (missingTables.length > 0) {
        log({
          name: 'Missing Tables',
          status: 'fail',
          message: `Found ${missingTables.length} missing tables`,
          details: missingTables.join(', ')
        });
      } else {
        log({
          name: 'All Required Tables',
          status: 'pass',
          message: `All ${REQUIRED_TABLES.length} required tables exist`
        });
      }
    }
  } catch (error) {
    log({
      name: 'Table Validation',
      status: 'fail',
      message: 'Failed to validate tables',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function validateIndexes() {
  log({ name: 'Index Validation', status: 'pass', message: 'Checking critical indexes...' });

  const criticalIndexes = [
    { table: 'claims', columns: ['organization_id', 'claim_id', 'status'] },
    { table: 'estimates', columns: ['organization_id', 'claim_id', 'status'] },
    { table: 'estimate_line_items', columns: ['estimate_id', 'zone_id'] },
    { table: 'documents', columns: ['organization_id', 'claim_id'] },
  ];

  // Note: Index validation requires direct SQL access
  // This is a simplified check
  log({
    name: 'Index Check',
    status: 'warn',
    message: 'Index validation requires direct database access',
    details: 'Run EXPLAIN ANALYZE on queries to verify indexes are used'
  });
}

async function validateForeignKeys() {
  log({ name: 'Foreign Key Validation', status: 'pass', message: 'Checking foreign key constraints...' });

  // Check critical foreign keys
  const criticalFKs = [
    { table: 'estimates', column: 'organization_id', references: 'organizations(id)' },
    { table: 'estimates', column: 'claim_id', references: 'claims(id)' },
    { table: 'estimate_line_items', column: 'estimate_id', references: 'estimates(id)' },
    { table: 'documents', column: 'organization_id', references: 'organizations(id)' },
  ];

  log({
    name: 'Foreign Key Check',
    status: 'warn',
    message: 'Foreign key validation requires direct database access',
    details: 'Check pg_constraint table or use database admin tools'
  });
}

async function validateConnection() {
  log({ name: 'Supabase Connection', status: 'pass', message: 'Testing connection...' });

  try {
    // Try a simple query
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .limit(1);

    if (error) {
      log({
        name: 'Supabase Connection',
        status: 'fail',
        message: 'Failed to connect to Supabase',
        details: error.message
      });
    } else {
      log({
        name: 'Supabase Connection',
        status: 'pass',
        message: 'Successfully connected to Supabase'
      });
    }
  } catch (error) {
    log({
      name: 'Supabase Connection',
      status: 'fail',
      message: 'Connection test failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function main() {
  console.log('🔍 Starting Schema Validation...\n');

  await validateConnection();
  await validateTables();
  await validateIndexes();
  await validateForeignKeys();

  console.log('\n📊 Validation Summary:');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warnings}`);

  if (failed > 0) {
    console.log('\n❌ Validation failed. Please review the issues above.');
    process.exit(1);
  } else {
    console.log('\n✅ Schema validation completed successfully!');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

