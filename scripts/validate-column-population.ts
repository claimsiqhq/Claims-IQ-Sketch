#!/usr/bin/env tsx
/**
 * Column Population Validator
 * 
 * Purpose: For each claim-related table, verify:
 * - Which columns are always NULL (unused)
 * - Which columns are sometimes NULL (optional vs missing)
 * - Population patterns by claim status
 * - Missing required data
 * 
 * Usage: tsx scripts/validate-column-population.ts [--table <tableName>] [--org-id <orgId>]
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { loggers } from '../server/lib/logger';
import { fileURLToPath } from 'url';

const logger = loggers.claims;

interface ColumnStats {
  columnName: string;
  dataType: string;
  totalRows: number;
  populatedRows: number;
  nullRows: number;
  populationPct: number;
  sampleValues: any[];
  isAlwaysNull: boolean;
  isAlwaysPopulated: boolean;
}

interface TableColumnReport {
  tableName: string;
  totalRows: number;
  columns: ColumnStats[];
  recommendations: string[];
}

interface ValidationReport {
  tables: TableColumnReport[];
  summary: {
    totalTables: number;
    totalColumns: number;
    alwaysNullColumns: number;
    alwaysPopulatedColumns: number;
    lowPopulationColumns: number;
  };
}

// Known claim-related tables and their important columns
const CLAIM_TABLES_CONFIG: Record<string, {
  importantColumns: string[];
  requiredColumns: string[];
}> = {
  claims: {
    importantColumns: [
      'claim_number', 'organization_id', 'status', 'date_of_loss',
      'primary_peril', 'loss_context', 'property_address', 'policy_number',
      'coverage_a', 'coverage_b', 'coverage_c', 'coverage_d',
      'total_rcv', 'total_acv', 'dol_weather_temp', 'dol_weather_summary',
    ],
    requiredColumns: ['claim_number', 'organization_id', 'status'],
  },
  documents: {
    importantColumns: [
      'name', 'type', 'storage_path', 'processing_status',
      'extracted_data', 'full_text', 'preview_status',
    ],
    requiredColumns: ['name', 'type', 'storage_path'],
  },
  claim_photos: {
    importantColumns: [
      'storage_path', 'public_url', 'file_name', 'ai_analysis',
      'analysis_status', 'taxonomy_prefix', 'damage_detected',
    ],
    requiredColumns: ['storage_path', 'public_url', 'file_name'],
  },
  estimates: {
    importantColumns: [
      'claim_id', 'status', 'subtotal', 'grand_total',
      'total_rcv', 'total_acv', 'is_locked',
    ],
    requiredColumns: ['claim_id', 'status'],
  },
  claim_flow_instances: {
    importantColumns: [
      'claim_id', 'flow_definition_id', 'status',
      'current_phase_id', 'completed_movements',
    ],
    requiredColumns: ['claim_id', 'flow_definition_id', 'status'],
  },
};

/**
 * Get column statistics for a table
 */
async function getColumnStats(
  tableName: string,
  organizationId?: string
): Promise<ColumnStats[]> {
  const stats: ColumnStats[] = [];

  // Get total row count
  let query = supabaseAdmin.from(tableName).select('*', { count: 'exact', head: true });
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }
  const { count: totalRows } = await query;
  const total = totalRows || 0;

  if (total === 0) {
    return stats; // No data to analyze
  }

  // Get sample data to identify columns
  let sampleQuery = supabaseAdmin.from(tableName).select('*').limit(10);
  if (organizationId) {
    sampleQuery = sampleQuery.eq('organization_id', organizationId);
  }
  const { data: sampleData } = await sampleQuery;

  if (!sampleData || sampleData.length === 0) {
    return stats;
  }

  // Analyze each column
  const columns = Object.keys(sampleData[0]);
  const importantColumns = CLAIM_TABLES_CONFIG[tableName]?.importantColumns || [];

  for (const columnName of columns) {
    // Skip internal columns
    if (columnName.startsWith('_')) continue;

    // Count populated vs null
    let populatedQuery = supabaseAdmin
      .from(tableName)
      .select(columnName, { count: 'exact', head: true })
      .not(columnName, 'is', null);
    
    if (organizationId) {
      populatedQuery = populatedQuery.eq('organization_id', organizationId);
    }

    const { count: populatedRows } = await populatedQuery;
    const populated = populatedRows || 0;
    const nullRows = total - populated;
    const populationPct = total > 0 ? (populated / total * 100) : 0;

    // Get sample values (non-null)
    let sampleQuery = supabaseAdmin
      .from(tableName)
      .select(columnName)
      .not(columnName, 'is', null)
      .limit(5);
    
    if (organizationId) {
      sampleQuery = sampleQuery.eq('organization_id', organizationId);
    }

    const { data: sampleValuesData } = await sampleQuery;
    const sampleValues = sampleValuesData?.map((r: any) => r[columnName]).filter((v: any) => v !== null) || [];

    // Infer data type from sample
    const dataType = sampleValues.length > 0
      ? typeof sampleValues[0] === 'string' ? 'text' : typeof sampleValues[0]
      : 'unknown';

    stats.push({
      columnName,
      dataType,
      totalRows: total,
      populatedRows: populated,
      nullRows,
      populationPct: Math.round(populationPct * 100) / 100,
      sampleValues: sampleValues.slice(0, 3),
      isAlwaysNull: populated === 0 && total > 0,
      isAlwaysPopulated: nullRows === 0 && total > 0,
    });
  }

  return stats;
}

/**
 * Analyze table and generate report
 */
async function analyzeTable(
  tableName: string,
  organizationId?: string
): Promise<TableColumnReport | null> {
  try {
    logger.info({ tableName }, 'Analyzing table columns');

    const columnStats = await getColumnStats(tableName, organizationId);
    
    if (columnStats.length === 0) {
      return null;
    }

    const totalRows = columnStats[0]?.totalRows || 0;
    const config = CLAIM_TABLES_CONFIG[tableName];
    const recommendations: string[] = [];

    // Check for always-null columns
    const alwaysNullColumns = columnStats.filter(c => c.isAlwaysNull);
    if (alwaysNullColumns.length > 0) {
      recommendations.push(
        `Found ${alwaysNullColumns.length} column(s) that are always NULL: ${alwaysNullColumns.map(c => c.columnName).join(', ')}. Consider if these are needed.`
      );
    }

    // Check for low population columns
    const lowPopulationColumns = columnStats.filter(
      c => c.populationPct < 10 && c.totalRows > 100 && !c.isAlwaysNull
    );
    if (lowPopulationColumns.length > 0) {
      recommendations.push(
        `Found ${lowPopulationColumns.length} column(s) with low population (<10%): ${lowPopulationColumns.map(c => `${c.columnName} (${c.populationPct}%)`).join(', ')}.`
      );
    }

    // Check required columns
    if (config?.requiredColumns) {
      for (const reqCol of config.requiredColumns) {
        const colStat = columnStats.find(c => c.columnName === reqCol);
        if (colStat && colStat.nullRows > 0) {
          recommendations.push(
            `Required column '${reqCol}' has ${colStat.nullRows} NULL values. This may indicate data quality issues.`
          );
        }
      }
    }

    // Check important columns
    if (config?.importantColumns) {
      const importantStats = columnStats.filter(c => config.importantColumns.includes(c.columnName));
      const lowPopImportant = importantStats.filter(c => c.populationPct < 50);
      if (lowPopImportant.length > 0) {
        recommendations.push(
          `Important columns with low population: ${lowPopImportant.map(c => `${c.columnName} (${c.populationPct}%)`).join(', ')}.`
        );
      }
    }

    return {
      tableName,
      totalRows,
      columns: columnStats.sort((a, b) => b.populationPct - a.populationPct),
      recommendations,
    };
  } catch (error) {
    logger.error({ error, tableName }, `Failed to analyze table ${tableName}`);
    return null;
  }
}

/**
 * Run validation for all claim tables
 */
async function runValidation(
  tableName?: string,
  organizationId?: string
): Promise<ValidationReport> {
  logger.info('Starting column population validation...');

  const tablesToAnalyze = tableName
    ? [tableName]
    : Object.keys(CLAIM_TABLES_CONFIG);

  const tableReports: TableColumnReport[] = [];

  for (const table of tablesToAnalyze) {
    const report = await analyzeTable(table, organizationId);
    if (report) {
      tableReports.push(report);
    }
  }

  // Generate summary
  const allColumns = tableReports.flatMap(r => r.columns);
  const alwaysNullColumns = allColumns.filter(c => c.isAlwaysNull);
  const alwaysPopulatedColumns = allColumns.filter(c => c.isAlwaysPopulated);
  const lowPopulationColumns = allColumns.filter(
    c => c.populationPct < 10 && c.totalRows > 100 && !c.isAlwaysNull
  );

  return {
    tables: tableReports,
    summary: {
      totalTables: tableReports.length,
      totalColumns: allColumns.length,
      alwaysNullColumns: alwaysNullColumns.length,
      alwaysPopulatedColumns: alwaysPopulatedColumns.length,
      lowPopulationColumns: lowPopulationColumns.length,
    },
  };
}

/**
 * Print report
 */
function printReport(report: ValidationReport) {
  console.log('\n' + '='.repeat(80));
  console.log('COLUMN POPULATION VALIDATION REPORT');
  console.log('='.repeat(80) + '\n');

  console.log('-'.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Tables analyzed: ${report.summary.totalTables}`);
  console.log(`Total columns: ${report.summary.totalColumns}`);
  console.log(`Always NULL columns: ${report.summary.alwaysNullColumns}`);
  console.log(`Always populated columns: ${report.summary.alwaysPopulatedColumns}`);
  console.log(`Low population columns (<10%): ${report.summary.lowPopulationColumns}`);

  console.log('\n' + '-'.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('-'.repeat(80));

  for (const tableReport of report.tables) {
    console.log(`\nTable: ${tableReport.tableName} (${tableReport.totalRows} rows)`);
    
    if (tableReport.recommendations.length > 0) {
      console.log('  Recommendations:');
      tableReport.recommendations.forEach(rec => {
        console.log(`    - ${rec}`);
      });
    }

    console.log('\n  Column Population:');
    console.log('    ' + 'Column'.padEnd(30) + 'Type'.padEnd(15) + 'Populated'.padEnd(12) + 'Population %');
    console.log('    ' + '-'.repeat(70));
    
    for (const col of tableReport.columns.slice(0, 20)) {
      const status = col.isAlwaysNull ? '⚠️  NULL' : col.isAlwaysPopulated ? '✓ Full' : '';
      console.log(
        `    ${col.columnName.padEnd(30)}${col.dataType.padEnd(15)}${col.populatedRows.toString().padEnd(12)}${col.populationPct.toFixed(2)}% ${status}`
      );
    }

    if (tableReport.columns.length > 20) {
      console.log(`    ... and ${tableReport.columns.length - 20} more columns`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const tableIndex = args.indexOf('--table');
  const tableName = tableIndex >= 0 && args[tableIndex + 1] ? args[tableIndex + 1] : undefined;
  
  const orgIdIndex = args.indexOf('--org-id');
  const organizationId = orgIdIndex >= 0 && args[orgIdIndex + 1] ? args[orgIdIndex + 1] : undefined;

  try {
    const report = await runValidation(tableName, organizationId);
    printReport(report);

    // Exit with error code if issues found
    if (report.summary.alwaysNullColumns > 0 || report.summary.lowPopulationColumns > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error({ error }, 'Validation failed');
    process.exit(1);
  }
}

// ES module equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { runValidation, printReport, type ValidationReport, type TableColumnReport };
