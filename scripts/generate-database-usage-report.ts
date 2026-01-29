#!/usr/bin/env tsx
/**
 * Database Usage Report Generator
 * 
 * Purpose: Comprehensive report showing:
 * - Table usage statistics
 * - Column population rates
 * - Foreign key relationship health
 * - Index usage
 * - Recommendations for optimization
 * 
 * Usage: tsx scripts/generate-database-usage-report.ts [--org-id <orgId>] [--output <file.json>]
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { loggers } from '../server/lib/logger';
import { runAudit, type AuditReport } from './audit-database-usage';
import { runValidation, type ValidationReport } from './validate-column-population';
import { validatePurge, type PurgeValidationReport } from './validate-purge-completeness';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const logger = loggers.claims;

interface DatabaseHealthMetrics {
  totalClaims: number;
  totalDocuments: number;
  totalPhotos: number;
  totalEstimates: number;
  totalFlowInstances: number;
  averageDocumentsPerClaim: number;
  averagePhotosPerClaim: number;
  claimsByStatus: Record<string, number>;
  claimsByPeril: Record<string, number>;
}

interface DatabaseUsageReport {
  generatedAt: string;
  organizationId?: string;
  healthMetrics: DatabaseHealthMetrics;
  schemaAudit: AuditReport;
  columnValidation: ValidationReport;
  purgeValidation?: PurgeValidationReport;
  recommendations: string[];
  summary: {
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
    criticalIssues: number;
    warnings: number;
    optimizations: number;
  };
}

/**
 * Get database health metrics
 */
async function getHealthMetrics(organizationId?: string): Promise<DatabaseHealthMetrics> {
  let claimsQuery = supabaseAdmin.from('claims').select('id, status, primary_peril', { count: 'exact' });
  if (organizationId) {
    claimsQuery = claimsQuery.eq('organization_id', organizationId);
  }
  const { data: claims, count: totalClaims } = await claimsQuery;

  const claimIds = claims?.map(c => c.id) || [];

  // Get document count
  let docsQuery = supabaseAdmin.from('documents').select('*', { count: 'exact', head: true });
  if (organizationId) {
    docsQuery = docsQuery.eq('organization_id', organizationId);
  }
  if (claimIds.length > 0) {
    docsQuery = docsQuery.in('claim_id', claimIds);
  }
  const { count: totalDocuments } = await docsQuery;

  // Get photo count
  let photosQuery = supabaseAdmin.from('claim_photos').select('*', { count: 'exact', head: true });
  if (organizationId) {
    photosQuery = photosQuery.eq('organization_id', organizationId);
  }
  if (claimIds.length > 0) {
    photosQuery = photosQuery.in('claim_id', claimIds);
  }
  const { count: totalPhotos } = await photosQuery;

  // Get estimate count
  let estimatesQuery = supabaseAdmin.from('estimates').select('*', { count: 'exact', head: true });
  if (organizationId) {
    estimatesQuery = estimatesQuery.eq('organization_id', organizationId);
  }
  if (claimIds.length > 0) {
    estimatesQuery = estimatesQuery.in('claim_id', claimIds);
  }
  const { count: totalEstimates } = await estimatesQuery;

  // Get flow instance count
  let flowsQuery = supabaseAdmin.from('claim_flow_instances').select('*', { count: 'exact', head: true });
  if (claimIds.length > 0) {
    flowsQuery = flowsQuery.in('claim_id', claimIds);
  }
  const { count: totalFlowInstances } = await flowsQuery;

  // Calculate averages
  const averageDocumentsPerClaim = totalClaims && totalClaims > 0
    ? Math.round((totalDocuments || 0) / totalClaims * 100) / 100
    : 0;
  const averagePhotosPerClaim = totalClaims && totalClaims > 0
    ? Math.round((totalPhotos || 0) / totalClaims * 100) / 100
    : 0;

  // Claims by status
  const claimsByStatus: Record<string, number> = {};
  claims?.forEach(claim => {
    const status = claim.status || 'unknown';
    claimsByStatus[status] = (claimsByStatus[status] || 0) + 1;
  });

  // Claims by peril
  const claimsByPeril: Record<string, number> = {};
  claims?.forEach(claim => {
    const peril = (claim as any).primary_peril || 'unknown';
    claimsByPeril[peril] = (claimsByPeril[peril] || 0) + 1;
  });

  return {
    totalClaims: totalClaims || 0,
    totalDocuments: totalDocuments || 0,
    totalPhotos: totalPhotos || 0,
    totalEstimates: totalEstimates || 0,
    totalFlowInstances: totalFlowInstances || 0,
    averageDocumentsPerClaim,
    averagePhotosPerClaim,
    claimsByStatus,
    claimsByPeril,
  };
}

/**
 * Generate comprehensive recommendations
 */
function generateRecommendations(
  healthMetrics: DatabaseHealthMetrics,
  schemaAudit: AuditReport,
  columnValidation: ValidationReport,
  purgeValidation?: PurgeValidationReport
): string[] {
  const recommendations: string[] = [];

  // Health metrics recommendations
  if (healthMetrics.averageDocumentsPerClaim < 1) {
    recommendations.push('Low document-to-claim ratio. Consider reviewing document upload process.');
  }
  if (healthMetrics.averagePhotosPerClaim < 5) {
    recommendations.push('Low photo-to-claim ratio. Consider reviewing photo capture requirements.');
  }

  // Schema audit recommendations
  if (schemaAudit.summary.totalOrphanedRecords > 0) {
    recommendations.push(
      `Found ${schemaAudit.summary.totalOrphanedRecords} orphaned records. Run cleanup script to remove.`
    );
  }
  if (schemaAudit.summary.tablesMissingIndexes > 0) {
    recommendations.push(
      `Found ${schemaAudit.summary.tablesMissingIndexes} table(s) missing indexes on claim_id. Add indexes for better performance.`
    );
  }

  // Column validation recommendations
  if (columnValidation.summary.alwaysNullColumns > 0) {
    recommendations.push(
      `Found ${columnValidation.summary.alwaysNullColumns} column(s) that are always NULL. Consider removing unused columns.`
    );
  }
  if (columnValidation.summary.lowPopulationColumns > 0) {
    recommendations.push(
      `Found ${columnValidation.summary.lowPopulationColumns} column(s) with low population rates. Review if these columns are needed.`
    );
  }

  // Purge validation recommendations
  if (purgeValidation && purgeValidation.summary.totalArtifacts > 0) {
    recommendations.push(
      `Purge validation found ${purgeValidation.summary.totalArtifacts} artifact(s). Review purge function completeness.`
    );
  }

  // Performance recommendations
  const totalRecords = healthMetrics.totalClaims + healthMetrics.totalDocuments + healthMetrics.totalPhotos;
  if (totalRecords > 100000) {
    recommendations.push('Large dataset detected. Consider implementing data archiving strategy.');
  }

  // Data quality recommendations
  const unknownStatusClaims = healthMetrics.claimsByStatus['unknown'] || 0;
  if (unknownStatusClaims > 0) {
    recommendations.push(
      `Found ${unknownStatusClaims} claim(s) with unknown status. Review data quality.`
    );
  }

  return recommendations;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(
  schemaAudit: AuditReport,
  columnValidation: ValidationReport,
  purgeValidation?: PurgeValidationReport
): 'excellent' | 'good' | 'fair' | 'poor' {
  let score = 100;

  // Deduct points for issues
  if (schemaAudit.summary.totalOrphanedRecords > 0) score -= 20;
  if (schemaAudit.summary.tablesMissingIndexes > 0) score -= 15;
  if (columnValidation.summary.alwaysNullColumns > 10) score -= 10;
  if (columnValidation.summary.lowPopulationColumns > 20) score -= 10;
  if (purgeValidation && purgeValidation.summary.totalArtifacts > 0) score -= 25;

  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

/**
 * Generate comprehensive report
 */
async function generateReport(organizationId?: string): Promise<DatabaseUsageReport> {
  logger.info('Generating comprehensive database usage report...');

  // Run all audits
  const [healthMetrics, schemaAudit, columnValidation] = await Promise.all([
    getHealthMetrics(organizationId),
    runAudit(organizationId),
    runValidation(undefined, organizationId),
  ]);

  // Optionally run purge validation if org ID provided
  let purgeValidation: PurgeValidationReport | undefined;
  if (organizationId) {
    try {
      purgeValidation = await validatePurge(organizationId);
    } catch (error) {
      logger.warn({ error }, 'Purge validation skipped');
    }
  }

  // Generate recommendations
  const recommendations = generateRecommendations(
    healthMetrics,
    schemaAudit,
    columnValidation,
    purgeValidation
  );

  // Calculate health score
  const overallHealth = calculateHealthScore(schemaAudit, columnValidation, purgeValidation);

  // Count issues
  const criticalIssues = [
    schemaAudit.summary.totalOrphanedRecords > 0,
    purgeValidation && purgeValidation.summary.totalArtifacts > 0,
  ].filter(Boolean).length;

  const warnings = [
    schemaAudit.summary.tablesMissingIndexes > 0,
    columnValidation.summary.alwaysNullColumns > 0,
    columnValidation.summary.lowPopulationColumns > 0,
  ].filter(Boolean).length;

  const optimizations = recommendations.length;

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    healthMetrics,
    schemaAudit,
    columnValidation,
    purgeValidation,
    recommendations,
    summary: {
      overallHealth,
      criticalIssues,
      warnings,
      optimizations,
    },
  };
}

/**
 * Print report
 */
function printReport(report: DatabaseUsageReport) {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE USAGE REPORT');
  console.log('='.repeat(80) + '\n');

  console.log(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  if (report.organizationId) {
    console.log(`Organization ID: ${report.organizationId}`);
  }

  console.log('\n' + '-'.repeat(80));
  console.log('OVERALL HEALTH: ' + report.summary.overallHealth.toUpperCase());
  console.log('-'.repeat(80));
  console.log(`Critical Issues: ${report.summary.criticalIssues}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log(`Optimization Opportunities: ${report.summary.optimizations}`);

  console.log('\n' + '-'.repeat(80));
  console.log('HEALTH METRICS');
  console.log('-'.repeat(80));
  console.log(`Total Claims: ${report.healthMetrics.totalClaims}`);
  console.log(`Total Documents: ${report.healthMetrics.totalDocuments}`);
  console.log(`Total Photos: ${report.healthMetrics.totalPhotos}`);
  console.log(`Total Estimates: ${report.healthMetrics.totalEstimates}`);
  console.log(`Total Flow Instances: ${report.healthMetrics.totalFlowInstances}`);
  console.log(`Avg Documents/Claim: ${report.healthMetrics.averageDocumentsPerClaim}`);
  console.log(`Avg Photos/Claim: ${report.healthMetrics.averagePhotosPerClaim}`);

  if (Object.keys(report.healthMetrics.claimsByStatus).length > 0) {
    console.log('\nClaims by Status:');
    Object.entries(report.healthMetrics.claimsByStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  if (Object.keys(report.healthMetrics.claimsByPeril).length > 0) {
    console.log('\nClaims by Peril:');
    Object.entries(report.healthMetrics.claimsByPeril).forEach(([peril, count]) => {
      console.log(`  ${peril}: ${count}`);
    });
  }

  console.log('\n' + '-'.repeat(80));
  console.log('SCHEMA AUDIT SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Tables with claim_id: ${report.schemaAudit.summary.totalTables}`);
  console.log(`Orphaned records: ${report.schemaAudit.summary.totalOrphanedRecords}`);
  console.log(`Tables missing indexes: ${report.schemaAudit.summary.tablesMissingIndexes}`);

  console.log('\n' + '-'.repeat(80));
  console.log('COLUMN VALIDATION SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Tables analyzed: ${report.columnValidation.summary.totalTables}`);
  console.log(`Total columns: ${report.columnValidation.summary.totalColumns}`);
  console.log(`Always NULL columns: ${report.columnValidation.summary.alwaysNullColumns}`);
  console.log(`Low population columns: ${report.columnValidation.summary.lowPopulationColumns}`);

  if (report.purgeValidation) {
    console.log('\n' + '-'.repeat(80));
    console.log('PURGE VALIDATION SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Artifacts found: ${report.purgeValidation.summary.totalArtifacts}`);
    console.log(`Tables with artifacts: ${report.purgeValidation.summary.tablesWithArtifacts}`);
    console.log(`Storage files remaining: ${report.purgeValidation.summary.storageFilesRemaining}`);
  }

  if (report.recommendations.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('-'.repeat(80));
    report.recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec}`);
    });
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const orgIdIndex = args.indexOf('--org-id');
  const organizationId = orgIdIndex >= 0 && args[orgIdIndex + 1] ? args[orgIdIndex + 1] : undefined;

  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 && args[outputIndex + 1] ? args[outputIndex + 1] : undefined;

  try {
    const report = await generateReport(organizationId);
    printReport(report);

    // Save to file if requested
    if (outputFile) {
      const outputPath = path.resolve(outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${outputPath}`);
    }

    // Exit with error code if critical issues found
    if (report.summary.criticalIssues > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error({ error }, 'Report generation failed');
    process.exit(1);
  }
}

// ES module equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { generateReport, printReport, type DatabaseUsageReport };
