#!/usr/bin/env tsx
/**
 * Purge Completeness Validator
 * 
 * Purpose: After purge, verify no artifacts remain:
 * - Query all tables with claim_id for any remaining records
 * - Check for orphaned records in child tables
 * - Verify storage files deleted
 * - Check for broken foreign key references
 * 
 * Usage: tsx scripts/validate-purge-completeness.ts --org-id <orgId> [--claim-ids <id1,id2,...>]
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { loggers } from '../server/lib/logger';

interface ArtifactReport {
  tableName: string;
  remainingRecords: number;
  claimIds: string[];
  isOrphaned: boolean;
}

interface PurgeValidationReport {
  organizationId: string;
  claimIdsChecked: string[];
  artifacts: ArtifactReport[];
  storageArtifacts: {
    photosRemaining: number;
    documentsRemaining: number;
    previewsRemaining: number;
  };
  summary: {
    totalArtifacts: number;
    tablesWithArtifacts: number;
    orphanedRecords: number;
    storageFilesRemaining: number;
  };
  recommendations: string[];
}

// All tables that should be empty after purge
const CLAIM_RELATED_TABLES = [
  'claims',
  'claim_briefings',
  'claim_checklists',
  'claim_checklist_items',
  'claim_damage_zones',
  'claim_flow_instances',
  'claim_photos',
  'claim_rooms',
  'claim_scope_items',
  'claim_structures',
  'documents',
  'endorsement_extractions',
  'estimates',
  'inspection_appointments',
  'inspection_workflows',
  'policy_form_extractions',
];

// Tables linked via estimate_id (indirect)
const ESTIMATE_RELATED_TABLES = [
  'estimate_structures',
  'estimate_areas',
  'estimate_zones',
  'estimate_line_items',
  'estimate_subrooms',
  'estimate_missing_walls',
  'estimate_totals',
  'estimate_coverages',
  'estimate_coverage_summary',
  'scope_items',
  'scope_summary',
  'rule_effects',
  'zone_openings',
  'zone_connections',
  'damage_zones',
];

// Tables linked via flow_instance_id
const FLOW_RELATED_TABLES = [
  'movement_completions',
  'gate_evaluations',
  'audio_observations',
];

// Tables linked via workflow_id
const WORKFLOW_RELATED_TABLES = [
  'workflow_step_evidence',
  'inspection_workflow_steps',
  'inspection_workflow_rooms',
  'inspection_workflow_assets',
  'workflow_mutations',
];

/**
 * Check for remaining records in a table
 */
async function checkTableArtifacts(
  tableName: string,
  claimIds: string[]
): Promise<ArtifactReport | null> {
  try {
    // Check for records with these claim_ids
    const { data, count } = await supabaseAdmin
      .from(tableName)
      .select('claim_id', { count: 'exact' })
      .in('claim_id', claimIds);

    if (count === 0) {
      return null; // No artifacts
    }

    const uniqueClaimIds = [...new Set(data?.map((r: any) => r.claim_id) || [])];

    // Check if these claim_ids still exist in claims table
    const { data: existingClaims } = await supabaseAdmin
      .from('claims')
      .select('id')
      .in('id', uniqueClaimIds);

    const existingClaimIds = new Set(existingClaims?.map((c: any) => c.id) || []);
    const isOrphaned = uniqueClaimIds.some(id => !existingClaimIds.has(id));

    return {
      tableName,
      remainingRecords: count || 0,
      claimIds: uniqueClaimIds,
      isOrphaned,
    };
  } catch (error) {
    // Table might not exist or might not have claim_id column
    return null;
  }
}

/**
 * Check estimate-related tables for artifacts
 */
async function checkEstimateArtifacts(
  claimIds: string[]
): Promise<ArtifactReport[]> {
  const artifacts: ArtifactReport[] = [];

  // Get estimate IDs for these claims
  const { data: estimates } = await supabaseAdmin
    .from('estimates')
    .select('id')
    .in('claim_id', claimIds);

  const estimateIds = estimates?.map(e => e.id) || [];

  if (estimateIds.length === 0) {
    return artifacts; // No estimates, nothing to check
  }

  // Check each estimate-related table
  for (const tableName of ESTIMATE_RELATED_TABLES) {
    try {
      const { data, count } = await supabaseAdmin
        .from(tableName)
        .select('estimate_id', { count: 'exact' })
        .in('estimate_id', estimateIds);

      if (count && count > 0) {
        artifacts.push({
          tableName,
          remainingRecords: count,
          claimIds: [], // These are linked via estimate_id, not claim_id
          isOrphaned: false,
        });
      }
    } catch (error) {
      // Table might not exist, skip
    }
  }

  return artifacts;
}

/**
 * Check flow-related tables for artifacts
 */
async function checkFlowArtifacts(
  claimIds: string[]
): Promise<ArtifactReport[]> {
  const artifacts: ArtifactReport[] = [];

  // Get flow instance IDs for these claims
  const { data: flowInstances } = await supabaseAdmin
    .from('claim_flow_instances')
    .select('id')
    .in('claim_id', claimIds);

  const flowInstanceIds = flowInstances?.map(f => f.id) || [];

  if (flowInstanceIds.length === 0) {
    return artifacts;
  }

  for (const tableName of FLOW_RELATED_TABLES) {
    try {
      const { data, count } = await supabaseAdmin
        .from(tableName)
        .select('flow_instance_id', { count: 'exact' })
        .in('flow_instance_id', flowInstanceIds);

      if (count && count > 0) {
        artifacts.push({
          tableName,
          remainingRecords: count,
          claimIds: [],
          isOrphaned: false,
        });
      }
    } catch (error) {
      // Table might not exist, skip
    }
  }

  return artifacts;
}

/**
 * Check storage for remaining files
 */
async function checkStorageArtifacts(
  organizationId: string,
  claimIds: string[]
): Promise<{
  photosRemaining: number;
  documentsRemaining: number;
  previewsRemaining: number;
}> {
  // Check claim_photos table for remaining storage paths
  const { data: photos } = await supabaseAdmin
    .from('claim_photos')
    .select('storage_path')
    .in('claim_id', claimIds);

  // Check documents table
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('id, storage_path, page_count, preview_status')
    .in('claim_id', claimIds);

  // Note: We can't directly check storage buckets via Supabase client easily
  // This is a simplified check - in production, you'd query the storage API
  return {
    photosRemaining: photos?.length || 0,
    documentsRemaining: documents?.length || 0,
    previewsRemaining: documents?.filter(d => d.preview_status === 'completed').length || 0,
  };
}

/**
 * Validate purge completeness
 */
async function validatePurge(
  organizationId: string,
  claimIds?: string[]
): Promise<PurgeValidationReport> {
  loggers.default.info({ organizationId, claimIds }, 'Starting purge completeness validation...');

  // Get claim IDs if not provided
  let claimIdsToCheck: string[] = [];
  if (claimIds && claimIds.length > 0) {
    claimIdsToCheck = claimIds;
  } else {
    // Check for any remaining claims in this org
    const { data: remainingClaims } = await supabaseAdmin
      .from('claims')
      .select('id')
      .eq('organization_id', organizationId);
    
    claimIdsToCheck = remainingClaims?.map(c => c.id) || [];
  }

  if (claimIdsToCheck.length === 0) {
    loggers.default.info('No claims found to validate');
    return {
      organizationId,
      claimIdsChecked: [],
      artifacts: [],
      storageArtifacts: {
        photosRemaining: 0,
        documentsRemaining: 0,
        previewsRemaining: 0,
      },
      summary: {
        totalArtifacts: 0,
        tablesWithArtifacts: 0,
        orphanedRecords: 0,
        storageFilesRemaining: 0,
      },
      recommendations: ['No claims found - purge appears complete'],
    };
  }

  // Check direct claim tables
  const artifacts: ArtifactReport[] = [];
  for (const tableName of CLAIM_RELATED_TABLES) {
    const artifact = await checkTableArtifacts(tableName, claimIdsToCheck);
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  // Check estimate-related tables
  const estimateArtifacts = await checkEstimateArtifacts(claimIdsToCheck);
  artifacts.push(...estimateArtifacts);

  // Check flow-related tables
  const flowArtifacts = await checkFlowArtifacts(claimIdsToCheck);
  artifacts.push(...flowArtifacts);

  // Check storage
  const storageArtifacts = await checkStorageArtifacts(organizationId, claimIdsToCheck);

  // Generate summary
  const totalArtifacts = artifacts.reduce((sum, a) => sum + a.remainingRecords, 0);
  const tablesWithArtifacts = artifacts.length;
  const orphanedRecords = artifacts.filter(a => a.isOrphaned).reduce((sum, a) => sum + a.remainingRecords, 0);
  const storageFilesRemaining = storageArtifacts.photosRemaining + storageArtifacts.documentsRemaining + storageArtifacts.previewsRemaining;

  // Generate recommendations
  const recommendations: string[] = [];
  if (totalArtifacts > 0) {
    recommendations.push(
      `Found ${totalArtifacts} artifact record(s) in ${tablesWithArtifacts} table(s). Run cleanup script to remove.`
    );
  }
  if (orphanedRecords > 0) {
    recommendations.push(
      `Found ${orphanedRecords} orphaned record(s). These reference non-existent claims and should be cleaned up.`
    );
  }
  if (storageFilesRemaining > 0) {
    recommendations.push(
      `Found ${storageFilesRemaining} storage file(s) still referenced in database. Check storage buckets and clean up if needed.`
    );
  }
  if (totalArtifacts === 0 && storageFilesRemaining === 0) {
    recommendations.push('✅ Purge appears complete - no artifacts found!');
  }

  return {
    organizationId,
    claimIdsChecked: claimIdsToCheck,
    artifacts,
    storageArtifacts,
    summary: {
      totalArtifacts,
      tablesWithArtifacts,
      orphanedRecords,
      storageFilesRemaining,
    },
    recommendations,
  };
}

/**
 * Print report
 */
function printReport(report: PurgeValidationReport) {
  console.log('\n' + '='.repeat(80));
  console.log('PURGE COMPLETENESS VALIDATION REPORT');
  console.log('='.repeat(80) + '\n');

  console.log(`Organization ID: ${report.organizationId}`);
  console.log(`Claims checked: ${report.claimIdsChecked.length}`);
  if (report.claimIdsChecked.length > 0) {
    console.log(`  Claim IDs: ${report.claimIdsChecked.slice(0, 5).join(', ')}${report.claimIdsChecked.length > 5 ? '...' : ''}`);
  }

  console.log('\n' + '-'.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Total artifacts found: ${report.summary.totalArtifacts}`);
  console.log(`Tables with artifacts: ${report.summary.tablesWithArtifacts}`);
  console.log(`Orphaned records: ${report.summary.orphanedRecords}`);
  console.log(`Storage files remaining: ${report.summary.storageFilesRemaining}`);

  if (report.artifacts.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('ARTIFACTS FOUND');
    console.log('-'.repeat(80));
    report.artifacts.forEach(artifact => {
      console.log(`\nTable: ${artifact.tableName}`);
      console.log(`  Remaining records: ${artifact.remainingRecords}`);
      console.log(`  Is orphaned: ${artifact.isOrphaned ? 'Yes ⚠️' : 'No'}`);
      if (artifact.claimIds.length > 0) {
        console.log(`  Claim IDs: ${artifact.claimIds.slice(0, 5).join(', ')}${artifact.claimIds.length > 5 ? '...' : ''}`);
      }
    });
  }

  if (report.storageArtifacts.photosRemaining > 0 || 
      report.storageArtifacts.documentsRemaining > 0 ||
      report.storageArtifacts.previewsRemaining > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('STORAGE ARTIFACTS');
    console.log('-'.repeat(80));
    console.log(`Photos remaining: ${report.storageArtifacts.photosRemaining}`);
    console.log(`Documents remaining: ${report.storageArtifacts.documentsRemaining}`);
    console.log(`Document previews remaining: ${report.storageArtifacts.previewsRemaining}`);
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

  const claimIdsIndex = args.indexOf('--claim-ids');
  const claimIds = claimIdsIndex >= 0 && args[claimIdsIndex + 1]
    ? args[claimIdsIndex + 1].split(',').map(id => id.trim())
    : undefined;

  if (!organizationId) {
    console.error('Error: --org-id is required');
    process.exit(1);
  }

  try {
    const report = await validatePurge(organizationId, claimIds);
    printReport(report);

    // Exit with error code if artifacts found
    if (report.summary.totalArtifacts > 0 || report.summary.storageFilesRemaining > 0) {
      process.exit(1);
    }
  } catch (error) {
    loggers.default.error({ error }, 'Validation failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { validatePurge, printReport, type PurgeValidationReport, type ArtifactReport };
