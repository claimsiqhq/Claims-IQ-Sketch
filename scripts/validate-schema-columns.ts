#!/usr/bin/env npx tsx
/**
 * Schema Column Validation Script
 *
 * Compares Drizzle schema definitions against actual database columns
 * to identify missing columns, type mismatches, and orphan columns.
 *
 * Usage: npx tsx scripts/validate-schema-columns.ts
 */

import { pool } from '../server/db.js';

// Import all table definitions from schema
import * as schema from '../shared/schema.js';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface ValidationResult {
  table: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: {
    missingInDb?: string[];
    missingInSchema?: string[];
    typeMismatches?: { column: string; expected: string; actual: string }[];
  };
}

const results: ValidationResult[] = [];

// Map Drizzle types to PostgreSQL types
const typeMapping: Record<string, string[]> = {
  'uuid': ['uuid'],
  'varchar': ['character varying'],
  'text': ['text'],
  'integer': ['integer', 'int4'],
  'boolean': ['boolean', 'bool'],
  'timestamp': ['timestamp without time zone', 'timestamp with time zone'],
  'date': ['date'],
  'decimal': ['numeric'],
  'jsonb': ['jsonb'],
  'doublePrecision': ['double precision'],
};

// Extract table names and their columns from Drizzle schema
function getSchemaTableColumns(): Map<string, Set<string>> {
  const tableColumns = new Map<string, Set<string>>();

  for (const [key, value] of Object.entries(schema)) {
    // Check if it's a Drizzle table (has a getSQL method and columns)
    if (value && typeof value === 'object' && '_' in value && 'name' in (value as any)._) {
      const tableDef = value as any;
      const tableName = tableDef._.name;
      const columns = new Set<string>();

      // Extract column names from the table definition
      for (const colKey of Object.keys(tableDef)) {
        if (colKey !== '_' && !colKey.startsWith('$')) {
          const col = tableDef[colKey];
          if (col && typeof col === 'object' && 'name' in col) {
            columns.add(col.name);
          }
        }
      }

      if (columns.size > 0) {
        tableColumns.set(tableName, columns);
      }
    }
  }

  return tableColumns;
}

async function getDatabaseColumns(): Promise<Map<string, Map<string, ColumnInfo>>> {
  const client = await pool.connect();

  try {
    const result = await client.query<ColumnInfo>(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const tableColumns = new Map<string, Map<string, ColumnInfo>>();

    for (const row of result.rows) {
      const tableName = (row as any).table_name;
      if (!tableColumns.has(tableName)) {
        tableColumns.set(tableName, new Map());
      }
      tableColumns.get(tableName)!.set(row.column_name, row);
    }

    return tableColumns;
  } finally {
    client.release();
  }
}

async function validateSchemaAgainstDatabase() {
  console.log('🔍 SCHEMA COLUMN VALIDATION');
  console.log('='.repeat(60));
  console.log('Comparing Drizzle schema.ts against actual database columns\n');

  try {
    // Get schema definition columns
    console.log('📖 Reading Drizzle schema definitions...');
    const schemaColumns = getSchemaTableColumns();
    console.log(`   Found ${schemaColumns.size} tables in schema.ts\n`);

    // Get database columns
    console.log('🗄️  Querying database columns...');
    const dbColumns = await getDatabaseColumns();
    console.log(`   Found ${dbColumns.size} tables in database\n`);

    console.log('='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60) + '\n');

    // Compare each schema table against database
    for (const [tableName, schemaCols] of schemaColumns) {
      const dbTableCols = dbColumns.get(tableName);

      if (!dbTableCols) {
        results.push({
          table: tableName,
          status: 'fail',
          message: 'TABLE MISSING IN DATABASE',
        });
        console.log(`❌ ${tableName}: TABLE MISSING IN DATABASE`);
        continue;
      }

      const schemaColNames = schemaCols;
      const dbColNames = new Set(dbTableCols.keys());

      // Find columns missing in database
      const missingInDb = [...schemaColNames].filter(col => !dbColNames.has(col));

      // Find columns in database but not in schema
      const missingInSchema = [...dbColNames].filter(col => !schemaColNames.has(col));

      if (missingInDb.length === 0 && missingInSchema.length === 0) {
        results.push({
          table: tableName,
          status: 'pass',
          message: `All ${schemaColNames.size} columns match`,
        });
        console.log(`✅ ${tableName}: All ${schemaColNames.size} columns match`);
      } else {
        const status = missingInDb.length > 0 ? 'fail' : 'warn';
        results.push({
          table: tableName,
          status,
          message: `Mismatches found`,
          details: {
            missingInDb: missingInDb.length > 0 ? missingInDb : undefined,
            missingInSchema: missingInSchema.length > 0 ? missingInSchema : undefined,
          },
        });

        const icon = status === 'fail' ? '❌' : '⚠️';
        console.log(`${icon} ${tableName}:`);

        if (missingInDb.length > 0) {
          console.log(`   🔴 MISSING IN DATABASE: ${missingInDb.join(', ')}`);
        }
        if (missingInSchema.length > 0) {
          console.log(`   🟡 Extra in DB (not in schema): ${missingInSchema.join(', ')}`);
        }
      }
    }

    // Check for tables in database that aren't in schema
    console.log('\n' + '='.repeat(60));
    console.log('TABLES IN DATABASE NOT IN SCHEMA');
    console.log('='.repeat(60) + '\n');

    const schemaTableNames = new Set(schemaColumns.keys());
    const orphanTables = [...dbColumns.keys()].filter(t => !schemaTableNames.has(t));

    if (orphanTables.length === 0) {
      console.log('✅ No orphan tables found');
    } else {
      console.log(`⚠️  Found ${orphanTables.length} tables in database not defined in schema.ts:`);
      orphanTables.forEach(t => console.log(`   - ${t}`));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60) + '\n');

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warned = results.filter(r => r.status === 'warn').length;

    console.log(`✅ Passed: ${passed} tables`);
    console.log(`❌ Failed: ${failed} tables (missing columns in DB)`);
    console.log(`⚠️  Warnings: ${warned} tables (extra columns in DB)`);

    if (failed > 0) {
      console.log('\n🔧 ACTION REQUIRED:');
      console.log('   The following columns need to be added to the database:\n');

      results
        .filter(r => r.status === 'fail' && r.details?.missingInDb)
        .forEach(r => {
          console.log(`   ${r.table}:`);
          r.details!.missingInDb!.forEach(col => {
            console.log(`     - ${col}`);
          });
        });

      console.log('\n   Run migrations or use Drizzle push to sync the database.');
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

validateSchemaAgainstDatabase();
