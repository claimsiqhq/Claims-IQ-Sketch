#!/usr/bin/env tsx
/**
 * Database Issues Fix Script
 * 
 * Purpose: Automatically fix issues found by validation scripts:
 * - Add missing indexes on claim_id columns
 * - Add missing foreign key constraints
 * - Optionally clean up always-NULL columns (with confirmation)
 * 
 * Usage: tsx scripts/fix-database-issues.ts [--dry-run] [--fix-indexes] [--fix-fks] [--clean-null-columns]
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { loggers } from '../server/lib/logger';
import { fileURLToPath } from 'url';

const logger = loggers.claims;

interface FixResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Add missing indexes on claim_id columns
 */
async function fixMissingIndexes(dryRun: boolean = false): Promise<FixResult[]> {
  const results: FixResult[] = [];
  
  // Tables that need indexes based on audit results
  const tablesNeedingIndexes = [
    'claim_scope_items',
    'endorsement_extractions',
  ];

  for (const tableName of tablesNeedingIndexes) {
    const indexName = `idx_${tableName}_claim_id`;
    
    if (dryRun) {
      results.push({
        success: true,
        message: `Would create index: ${indexName} on ${tableName}(claim_id)`,
      });
      continue;
    }

    try {
      // Check if index already exists
      const { data: existingIndexes } = await supabaseAdmin.rpc('exec_sql', {
        query: `
          SELECT indexname 
          FROM pg_indexes 
          WHERE schemaname = 'public' 
            AND tablename = '${tableName}' 
            AND indexname = '${indexName}';
        `
      }).catch(() => ({ data: null }));

      if (existingIndexes && Array.isArray(existingIndexes) && existingIndexes.length > 0) {
        results.push({
          success: true,
          message: `Index ${indexName} already exists on ${tableName}`,
        });
        continue;
      }

      // Create index using raw SQL (Supabase doesn't have direct index creation API)
      // Note: This requires direct database access or a custom RPC function
      logger.warn({ tableName }, `Index creation requires direct database access. Manual SQL needed for ${indexName}`);
      
      results.push({
        success: false,
        message: `Index creation requires manual SQL: CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(claim_id);`,
        details: {
          sql: `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(claim_id);`,
        },
      });
    } catch (error) {
      results.push({
        success: false,
        message: `Failed to create index ${indexName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return results;
}

/**
 * Add missing foreign key constraints
 */
async function fixMissingFKConstraints(dryRun: boolean = false): Promise<FixResult[]> {
  const results: FixResult[] = [];
  
  // Tables that need FK constraints based on audit results
  const tablesNeedingFKs = [
    {
      table: 'claim_scope_items',
      column: 'claim_id',
      constraint: 'fk_claim_scope_items_claim',
      references: 'claims(id)',
    },
    {
      table: 'endorsement_extractions',
      column: 'claim_id',
      constraint: 'fk_endorsement_extractions_claim',
      references: 'claims(id)',
    },
  ];

  for (const { table, column, constraint, references } of tablesNeedingFKs) {
    if (dryRun) {
      results.push({
        success: true,
        message: `Would add FK constraint: ${constraint} on ${table}(${column})`,
      });
      continue;
    }

    try {
      // Check if constraint already exists
      const { data: existingConstraints } = await supabaseAdmin.rpc('exec_sql', {
        query: `
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_schema = 'public' 
            AND table_name = '${table}' 
            AND constraint_name = '${constraint}';
        `
      }).catch(() => ({ data: null }));

      if (existingConstraints && Array.isArray(existingConstraints) && existingConstraints.length > 0) {
        results.push({
          success: true,
          message: `FK constraint ${constraint} already exists on ${table}`,
        });
        continue;
      }

      // FK creation requires direct database access
      logger.warn({ table }, `FK constraint creation requires direct database access. Manual SQL needed for ${constraint}`);
      
      results.push({
        success: false,
        message: `FK constraint creation requires manual SQL`,
        details: {
          sql: `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES ${references} ON DELETE CASCADE;`,
        },
      });
    } catch (error) {
      results.push({
        success: false,
        message: `Failed to add FK constraint ${constraint}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return results;
}

/**
 * Generate SQL migration file for manual execution
 */
function generateMigrationSQL(): string {
  return `-- Migration: Fix Database Issues Found by Validation Scripts
-- Generated: ${new Date().toISOString()}
-- Purpose: Add missing indexes and FK constraints

-- ============================================
-- ADD MISSING INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_claim_scope_items_claim_id 
  ON claim_scope_items(claim_id);

CREATE INDEX IF NOT EXISTS idx_endorsement_extractions_claim_id 
  ON endorsement_extractions(claim_id);

-- ============================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Note: Check for orphaned records first before adding FK constraints
-- Run: tsx scripts/audit-database-usage.ts to check for orphans

DO $$ 
BEGIN
  -- Add FK for claim_scope_items if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_claim_scope_items_claim'
  ) THEN
    -- Clean up orphaned records first
    DELETE FROM claim_scope_items 
    WHERE claim_id IS NOT NULL 
      AND claim_id NOT IN (SELECT id FROM claims);
    
    ALTER TABLE claim_scope_items
      ADD CONSTRAINT fk_claim_scope_items_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;
  END IF;

  -- Add FK for endorsement_extractions if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_endorsement_extractions_claim'
  ) THEN
    -- Clean up orphaned records first
    DELETE FROM endorsement_extractions 
    WHERE claim_id IS NOT NULL 
      AND claim_id NOT IN (SELECT id FROM claims);
    
    ALTER TABLE endorsement_extractions
      ADD CONSTRAINT fk_endorsement_extractions_claim
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- VERIFY INDEXES CREATED
-- ============================================

SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('claim_scope_items', 'endorsement_extractions')
  AND indexname LIKE '%claim_id%'
ORDER BY tablename, indexname;

-- ============================================
-- VERIFY FK CONSTRAINTS CREATED
-- ============================================

SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('claim_scope_items', 'endorsement_extractions')
ORDER BY tc.table_name, tc.constraint_name;
`;
}

/**
 * Main fix function
 */
async function runFixes(options: {
  dryRun?: boolean;
  fixIndexes?: boolean;
  fixFKs?: boolean;
  generateSQL?: boolean;
}): Promise<void> {
  const { dryRun = false, fixIndexes = false, fixFKs = false, generateSQL = false } = options;

  console.log('\n' + '='.repeat(80));
  console.log('DATABASE ISSUES FIX SCRIPT');
  console.log('='.repeat(80) + '\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  if (generateSQL) {
    const sql = generateMigrationSQL();
    const fs = await import('fs');
    const path = await import('path');
    const sqlFile = path.join(process.cwd(), 'db', 'migrations', `fix_validation_issues_${Date.now()}.sql`);
    
    fs.writeFileSync(sqlFile, sql);
    console.log(`✅ SQL migration file generated: ${sqlFile}\n`);
    console.log('Review the SQL file and run it manually via your database client.\n');
    return;
  }

  const allResults: FixResult[] = [];

  if (fixIndexes) {
    console.log('-'.repeat(80));
    console.log('FIXING MISSING INDEXES');
    console.log('-'.repeat(80));
    const indexResults = await fixMissingIndexes(dryRun);
    allResults.push(...indexResults);
    indexResults.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.message}`);
      if (result.details?.sql) {
        console.log(`   SQL: ${result.details.sql}`);
      }
    });
    console.log('');
  }

  if (fixFKs) {
    console.log('-'.repeat(80));
    console.log('FIXING MISSING FK CONSTRAINTS');
    console.log('-'.repeat(80));
    const fkResults = await fixMissingFKConstraints(dryRun);
    allResults.push(...fkResults);
    fkResults.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.message}`);
      if (result.details?.sql) {
        console.log(`   SQL: ${result.details.sql}`);
      }
    });
    console.log('');
  }

  // Summary
  const successful = allResults.filter(r => r.success).length;
  const failed = allResults.filter(r => !r.success).length;

  console.log('-'.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Total operations: ${allResults.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Some operations require manual SQL execution.');
    console.log('   Use --generate-sql to create a migration file.\n');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fixIndexes = args.includes('--fix-indexes');
  const fixFKs = args.includes('--fix-fks');
  const generateSQL = args.includes('--generate-sql');

  // If no specific fix requested, generate SQL by default
  const shouldGenerateSQL = generateSQL || (!fixIndexes && !fixFKs);

  try {
    await runFixes({
      dryRun,
      fixIndexes,
      fixFKs,
      generateSQL: shouldGenerateSQL,
    });
  } catch (error) {
    logger.error({ error }, 'Fix script failed');
    process.exit(1);
  }
}

// ES module equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { runFixes, generateMigrationSQL };
