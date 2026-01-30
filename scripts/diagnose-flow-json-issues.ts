#!/usr/bin/env tsx
/**
 * Flow JSON Diagnostic Script
 * 
 * Purpose: Diagnose JSON parsing issues in flow_definitions table
 * - Check for invalid JSON in flow_json column
 * - Identify malformed flow definitions
 * - Report schema mismatches
 * 
 * Usage: tsx scripts/diagnose-flow-json-issues.ts [--fix]
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { loggers } from '../server/lib/logger';
import { fileURLToPath } from 'url';

const logger = loggers.claims;

interface FlowDiagnostic {
  id: string;
  name: string;
  organizationId: string | null;
  hasFlowJson: boolean;
  flowJsonType: string;
  isValidJson: boolean;
  jsonError?: string;
  schemaVersion?: string;
  phaseCount?: number;
  movementCount?: number;
  issues: string[];
}

/**
 * Validate flow JSON structure
 */
function validateFlowJsonStructure(flowJson: any): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!flowJson) {
    return { isValid: false, issues: ['flow_json is null or undefined'] };
  }

  if (typeof flowJson !== 'object') {
    return { isValid: false, issues: [`flow_json is not an object (type: ${typeof flowJson})`] };
  }

  // Check required top-level fields
  if (!flowJson.schema_version) {
    issues.push('Missing schema_version');
  }

  if (!flowJson.metadata) {
    issues.push('Missing metadata');
  } else {
    if (!flowJson.metadata.name) {
      issues.push('Missing metadata.name');
    }
    if (!flowJson.metadata.primary_peril) {
      issues.push('Missing metadata.primary_peril');
    }
  }

  if (!flowJson.phases) {
    issues.push('Missing phases');
  } else if (!Array.isArray(flowJson.phases)) {
    issues.push('phases is not an array');
  } else {
    flowJson.phases.forEach((phase: any, idx: number) => {
      if (!phase.id) {
        issues.push(`Phase ${idx} missing id`);
      }
      if (!phase.name) {
        issues.push(`Phase ${idx} missing name`);
      }
      if (!Array.isArray(phase.movements)) {
        issues.push(`Phase ${idx} movements is not an array`);
      } else {
        phase.movements?.forEach((movement: any, mIdx: number) => {
          if (!movement.id) {
            issues.push(`Phase ${idx}, Movement ${mIdx} missing id`);
          }
          if (!movement.name) {
            issues.push(`Phase ${idx}, Movement ${mIdx} missing name`);
          }
        });
      }
    });
  }

  if (!flowJson.gates) {
    issues.push('Missing gates');
  } else if (!Array.isArray(flowJson.gates)) {
    issues.push('gates is not an array');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Diagnose a single flow definition
 */
async function diagnoseFlow(id: string, row: any): Promise<FlowDiagnostic> {
  const diagnostic: FlowDiagnostic = {
    id,
    name: row.name || 'Unknown',
    organizationId: row.organization_id,
    hasFlowJson: !!row.flow_json,
    flowJsonType: typeof row.flow_json,
    isValidJson: false,
    issues: [],
  };

  if (!row.flow_json) {
    diagnostic.issues.push('flow_json column is null');
    return diagnostic;
  }

  // Check if it's already parsed (JSONB comes as object) or needs parsing
  let flowJson: any;
  if (typeof row.flow_json === 'string') {
    try {
      flowJson = JSON.parse(row.flow_json);
      diagnostic.isValidJson = true;
    } catch (e) {
      diagnostic.isValidJson = false;
      diagnostic.jsonError = e instanceof Error ? e.message : 'Unknown JSON parse error';
      diagnostic.issues.push(`JSON parse error: ${diagnostic.jsonError}`);
      return diagnostic;
    }
  } else {
    // Already parsed (JSONB)
    flowJson = row.flow_json;
    diagnostic.isValidJson = true;
  }

  // Validate structure
  const validation = validateFlowJsonStructure(flowJson);
  if (!validation.isValid) {
    diagnostic.issues.push(...validation.issues);
  }

  // Extract metadata
  if (flowJson.schema_version) {
    diagnostic.schemaVersion = flowJson.schema_version;
  }
  if (Array.isArray(flowJson.phases)) {
    diagnostic.phaseCount = flowJson.phases.length;
    diagnostic.movementCount = flowJson.phases.reduce(
      (sum: number, phase: any) => sum + (Array.isArray(phase.movements) ? phase.movements.length : 0),
      0
    );
  }

  return diagnostic;
}

/**
 * Fix invalid flow JSON
 */
async function fixFlowJson(id: string, diagnostic: FlowDiagnostic): Promise<boolean> {
  if (diagnostic.isValidJson && diagnostic.issues.length === 0) {
    return true; // Nothing to fix
  }

  // For now, just mark as inactive if invalid
  // In production, you might want to attempt repair or delete
  try {
    await supabaseAdmin
      .from('flow_definitions')
      .update({ is_active: false })
      .eq('id', id);
    
    logger.warn({ id, name: diagnostic.name }, 'Marked invalid flow as inactive');
    return true;
  } catch (error) {
    logger.error({ error, id }, 'Failed to fix flow');
    return false;
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostic(fix: boolean = false): Promise<void> {
  logger.info('Starting flow JSON diagnostic...');

  // Get all flow definitions
  const { data: flows, error } = await supabaseAdmin
    .from('flow_definitions')
    .select('id, name, organization_id, flow_json, is_active')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error }, 'Failed to fetch flow definitions');
    throw error;
  }

  if (!flows || flows.length === 0) {
    console.log('\n✅ No flow definitions found in database');
    return;
  }

  console.log(`\nFound ${flows.length} flow definition(s)\n`);

  const diagnostics: FlowDiagnostic[] = [];
  let fixedCount = 0;

  for (const flow of flows) {
    const diagnostic = await diagnoseFlow(flow.id, flow);
    diagnostics.push(diagnostic);

    if (fix && (!diagnostic.isValidJson || diagnostic.issues.length > 0)) {
      const fixed = await fixFlowJson(flow.id, diagnostic);
      if (fixed) fixedCount++;
    }
  }

  // Print report
  console.log('='.repeat(80));
  console.log('FLOW JSON DIAGNOSTIC REPORT');
  console.log('='.repeat(80) + '\n');

  const validFlows = diagnostics.filter(d => d.isValidJson && d.issues.length === 0);
  const invalidFlows = diagnostics.filter(d => !d.isValidJson || d.issues.length > 0);

  console.log(`Total flows: ${diagnostics.length}`);
  console.log(`Valid flows: ${validFlows.length} ✅`);
  console.log(`Invalid flows: ${invalidFlows.length} ❌`);

  if (invalidFlows.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('INVALID FLOWS');
    console.log('-'.repeat(80));

    invalidFlows.forEach(d => {
      console.log(`\nFlow: ${d.name} (ID: ${d.id})`);
      console.log(`  Organization: ${d.organizationId || 'System-wide'}`);
      console.log(`  Has flow_json: ${d.hasFlowJson}`);
      console.log(`  Type: ${d.flowJsonType}`);
      console.log(`  Valid JSON: ${d.isValidJson ? 'Yes' : 'No'}`);
      if (d.jsonError) {
        console.log(`  JSON Error: ${d.jsonError}`);
      }
      if (d.schemaVersion) {
        console.log(`  Schema Version: ${d.schemaVersion}`);
      }
      if (d.phaseCount !== undefined) {
        console.log(`  Phases: ${d.phaseCount}, Movements: ${d.movementCount}`);
      }
      if (d.issues.length > 0) {
        console.log(`  Issues:`);
        d.issues.forEach(issue => {
          console.log(`    - ${issue}`);
        });
      }
    });
  }

  if (validFlows.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('VALID FLOWS');
    console.log('-'.repeat(80));

    validFlows.forEach(d => {
      console.log(`\n✅ ${d.name} (ID: ${d.id})`);
      console.log(`   Schema: ${d.schemaVersion || 'unknown'}`);
      console.log(`   Phases: ${d.phaseCount || 0}, Movements: ${d.movementCount || 0}`);
    });
  }

  if (fix && fixedCount > 0) {
    console.log(`\n✅ Fixed ${fixedCount} flow(s) (marked as inactive)`);
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Exit with error code if issues found
  if (invalidFlows.length > 0 && !fix) {
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');

  try {
    await runDiagnostic(fix);
  } catch (error) {
    logger.error({ error }, 'Diagnostic failed');
    process.exit(1);
  }
}

// ES module equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { runDiagnostic, diagnoseFlow };
