#!/usr/bin/env tsx
/**
 * Comprehensive Codebase Validation Script
 * 
 * Finds schema mismatches, API inconsistencies, missing error handling,
 * and other common issues before they cause production bugs.
 * 
 * Run: npm run validate
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

interface ValidationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  file: string;
  line?: number;
  message: string;
  recommendation?: string;
  code?: string;
}

const issues: ValidationIssue[] = [];

// ============================================
// 1. SCHEMA VALIDATION - Check for missing organization_id
// ============================================

function validateSchemaConsistency() {
  console.log('🔍 Validating schema consistency...');
  
  const serviceFiles = [
    'server/services/checklistTemplateService.ts',
    'server/routes.ts',
  ];
  
  for (const filePath of serviceFiles) {
    const fullPath = join(ROOT_DIR, filePath);
    if (!existsSync(fullPath)) continue;
    
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      // Find all inserts into claim_checklist_items
      const insertPattern = /\.insert\([\s\S]{0,2000}?\)/g;
      let match;
      
      while ((match = insertPattern.exec(content)) !== null) {
        const insertCode = match[0];
        const lineNum = content.substring(0, match.index).split('\n').length;
        
        // Check if this is a claim_checklist_items insert
        const contextBefore = content.substring(Math.max(0, match.index - 200), match.index);
        if (contextBefore.includes('claim_checklist_items') || 
            contextBefore.includes("'claim_checklist_items'") ||
            contextBefore.includes('"claim_checklist_items"')) {
          
          // Check for missing organization_id
          if (!insertCode.includes('organization_id') && 
              !insertCode.includes('organizationId')) {
            issues.push({
              severity: 'critical',
              category: 'schema',
              file: filePath,
              line: lineNum,
              message: 'Insert into claim_checklist_items missing organization_id',
              recommendation: 'Add organization_id to insert statement (required for multi-tenant tables)',
              code: insertCode.substring(0, 200) + '...',
            });
          }
        }
      }
      
      // Check for non-existent columns
      if (content.includes('item_code') || content.includes('item_name')) {
        const itemCodeMatches = content.matchAll(/item_code/g);
        for (const match of itemCodeMatches) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          issues.push({
            severity: 'critical',
            category: 'schema',
            file: filePath,
            line: lineNum,
            message: 'References non-existent column: item_code',
            recommendation: 'Remove item_code - this column does not exist in claim_checklist_items table',
          });
        }
      }
      
      if (content.includes('item_name')) {
        const itemNameMatches = content.matchAll(/item_name/g);
        for (const match of itemNameMatches) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          issues.push({
            severity: 'critical',
            category: 'schema',
            file: filePath,
            line: lineNum,
            message: 'References non-existent column: item_name',
            recommendation: 'Remove item_name - this column does not exist in claim_checklist_items table',
          });
        }
      }
    } catch (error: any) {
      issues.push({
        severity: 'high',
        category: 'schema',
        file: filePath,
        message: `Error reading file: ${error.message}`,
      });
    }
  }
}

// ============================================
// 2. API ROUTE VALIDATION
// ============================================

function validateAPIRoutes() {
  console.log('🔍 Validating API routes...');
  
  const routesPath = join(ROOT_DIR, 'server/routes.ts');
  if (!existsSync(routesPath)) return;
  
  try {
    const content = readFileSync(routesPath, 'utf-8');
    const lines = content.split('\n');
    
    // Check for inconsistent response formats
    const directJsonCount = (content.match(/res\.json\(\{/g) || []).length;
    const sendSuccessCount = (content.match(/sendSuccess\(/g) || []).length;
    const sendErrorCount = (content.match(/sendError\(/g) || []).length;
    
    if (directJsonCount > 0 && (sendSuccessCount > 0 || sendErrorCount > 0)) {
      issues.push({
        severity: 'medium',
        category: 'api',
        file: 'server/routes.ts',
        message: `Mixed response formats: ${directJsonCount} direct res.json() calls vs ${sendSuccessCount} sendSuccess() calls`,
        recommendation: 'Standardize on sendSuccess/sendError helpers for consistent API responses',
      });
    }
    
    // Check for routes without error handling
    const routePattern = /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"][\s\S]{0,3000}?\}\);/g;
    const routesWithoutErrorHandling: Array<{ route: string; line: number }> = [];
    
    let routeMatch;
    while ((routeMatch = routePattern.exec(content)) !== null) {
      const routeStart = routeMatch.index;
      const routeEnd = content.indexOf('});', routeStart);
      if (routeEnd === -1) continue;
      
      const routeBody = content.substring(routeStart, routeEnd);
      const hasTryCatch = routeBody.includes('try {') || routeBody.includes('asyncHandler');
      const hasErrorNext = routeBody.includes('next(err') || routeBody.includes('errors.');
      const hasAwait = routeBody.includes('await');
      
      if (hasAwait && !hasTryCatch && !hasErrorNext) {
        const lineNum = content.substring(0, routeStart).split('\n').length;
        routesWithoutErrorHandling.push({
          route: routeMatch[2],
          line: lineNum,
        });
      }
    }
    
    if (routesWithoutErrorHandling.length > 0) {
      issues.push({
        severity: 'high',
        category: 'api',
        file: 'server/routes.ts',
        message: `${routesWithoutErrorHandling.length} routes without error handling`,
        recommendation: 'Wrap async route handlers with asyncHandler or try/catch. Routes: ' + 
          routesWithoutErrorHandling.slice(0, 5).map(r => r.route).join(', '),
      });
    }
  } catch (error: any) {
    issues.push({
      severity: 'high',
      category: 'api',
      file: 'server/routes.ts',
      message: `Error reading routes: ${error.message}`,
    });
  }
}

// ============================================
// 3. SERVICE FUNCTION VALIDATION
// ============================================

function validateServiceFunctions() {
  console.log('🔍 Validating service functions...');
  
  const serviceFiles = [
    'server/services/checklistTemplateService.ts',
    'server/services/flowEngineService.ts',
    'server/services/scopeEngine.ts',
    'server/services/estimateCalculator.ts',
  ];
  
  for (const filePath of serviceFiles) {
    const fullPath = join(ROOT_DIR, filePath);
    if (!existsSync(fullPath)) continue;
    
    try {
      const content = readFileSync(fullPath, 'utf-8');
      
      // Check for async functions without error handling
      const asyncFunctionPattern = /export\s+(async\s+)?function\s+(\w+)[\s\S]{0,3000}?\n\}/g;
      let funcMatch;
      
      while ((funcMatch = asyncFunctionPattern.exec(content)) !== null) {
        const funcName = funcMatch[2];
        const funcStart = funcMatch.index;
        const funcEnd = content.indexOf('\n}', funcStart);
        if (funcEnd === -1) continue;
        
        const funcBody = content.substring(funcStart, funcEnd);
        const isAsync = funcBody.includes('async');
        const hasTryCatch = funcBody.includes('try {');
        const hasAwait = funcBody.includes('await');
        
        if (isAsync && hasAwait && !hasTryCatch) {
          const lineNum = content.substring(0, funcStart).split('\n').length;
          issues.push({
            severity: 'medium',
            category: 'service',
            file: filePath,
            line: lineNum,
            message: `Function ${funcName} has await but no try/catch`,
            recommendation: 'Add try/catch error handling to prevent unhandled promise rejections',
          });
        }
      }
      
      // Check for database operations without error handling
      const dbOps = ['insert', 'update', 'delete', 'select'];
      for (const op of dbOps) {
        const pattern = new RegExp(`\\.${op}\\([\\s\\S]{0,500}?\\)`, 'g');
        let dbMatch;
        while ((dbMatch = pattern.exec(content)) !== null) {
          const contextStart = Math.max(0, dbMatch.index - 300);
          const contextEnd = Math.min(content.length, dbMatch.index + dbMatch[0].length + 300);
          const context = content.substring(contextStart, contextEnd);
          
          // Check if error is handled
          const hasErrorCheck = context.includes('error') || context.includes('Error');
          const hasTryCatch = content.substring(0, dbMatch.index).includes('try {');
          
          if (!hasErrorCheck && !hasTryCatch) {
            const lineNum = content.substring(0, dbMatch.index).split('\n').length;
            issues.push({
              severity: 'medium',
              category: 'service',
              file: filePath,
              line: lineNum,
              message: `Database ${op} operation without error handling`,
              recommendation: 'Check for error in response and handle appropriately',
            });
          }
        }
      }
    } catch (error: any) {
      issues.push({
        severity: 'medium',
        category: 'service',
        file: filePath,
        message: `Error reading file: ${error.message}`,
      });
    }
  }
}

// ============================================
// 4. DATABASE MIGRATION VALIDATION
// ============================================

function validateMigrations() {
  console.log('🔍 Validating migrations...');
  
  const migrationsDir = join(ROOT_DIR, 'db/migrations');
  if (!existsSync(migrationsDir)) return;
  
  const migrationFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  // Check for DOWN migrations
  const hasDownMigrations = migrationFiles.some(f => 
    f.includes('_DOWN') || f.includes('DOWN') || f.includes('down')
  );
  
  if (!hasDownMigrations && migrationFiles.length > 5) {
    issues.push({
      severity: 'low',
      category: 'migration',
      file: 'db/migrations',
      message: 'No DOWN migrations found - migrations may not be reversible',
      recommendation: 'Consider adding DOWN migrations for rollback capability',
    });
  }
  
  // Check for migration naming consistency
  const namingIssues = migrationFiles.filter(f => !/^\d{3}_/.test(f));
  if (namingIssues.length > 0) {
    issues.push({
      severity: 'low',
      category: 'migration',
      file: 'db/migrations',
      message: `Inconsistent migration naming: ${namingIssues.slice(0, 3).join(', ')}`,
      recommendation: 'Use format: XXX_description.sql',
    });
  }
}

// ============================================
// 5. ORPHANED CODE DETECTION
// ============================================

function detectOrphanedCode() {
  console.log('🔍 Detecting orphaned code...');
  
  // Check for deprecated workflow components
  const workflowComponents = [
    'components/workflow-panel.tsx',
    'components/workflow/workflow-wizard.tsx',
  ];
  
  for (const component of workflowComponents) {
    const fullPath = join(ROOT_DIR, 'client/src', component);
    if (existsSync(fullPath)) {
      issues.push({
        severity: 'medium',
        category: 'orphaned',
        file: component,
        message: 'Deprecated workflow component still exists',
        recommendation: 'Remove deprecated workflow components per architecture docs',
      });
    }
  }
  
  // Check for references to deprecated API endpoints
  const apiPath = join(ROOT_DIR, 'client/src/lib/api.ts');
  if (existsSync(apiPath)) {
    const apiContent = readFileSync(apiPath, 'utf-8');
    const deprecatedEndpoints = [
      'generateInspectionWorkflow',
      'getClaimWorkflow',
      'updateWorkflowStep',
    ];
    
    for (const endpoint of deprecatedEndpoints) {
      if (apiContent.includes(endpoint)) {
        issues.push({
          severity: 'high',
          category: 'orphaned',
          file: 'client/src/lib/api.ts',
          message: `References deprecated endpoint: ${endpoint}`,
          recommendation: 'Remove or update to use new flow engine endpoints',
        });
      }
    }
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  
  console.log('🚀 Starting comprehensive codebase validation...\n');
  
  validateSchemaConsistency();
  validateAPIRoutes();
  validateServiceFunctions();
  validateMigrations();
  detectOrphanedCode();
  
  // Group issues by severity
  const critical = issues.filter(i => i.severity === 'critical');
  const high = issues.filter(i => i.severity === 'high');
  const medium = issues.filter(i => i.severity === 'medium');
  const low = issues.filter(i => i.severity === 'low');
  
  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(80));
  console.log(`\n📊 Total Issues Found: ${issues.length}`);
  console.log(`  🔴 Critical: ${critical.length}`);
  console.log(`  🟠 High: ${high.length}`);
  console.log(`  🟡 Medium: ${medium.length}`);
  console.log(`  🔵 Low: ${low.length}`);
  
  if (critical.length > 0) {
    console.log('\n🔴 CRITICAL ISSUES:');
    critical.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. [${issue.category.toUpperCase()}] ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.message}`);
      if (issue.recommendation) {
        console.log(`   💡 ${issue.recommendation}`);
      }
      if (issue.code) {
        console.log(`   Code: ${issue.code}`);
      }
    });
  }
  
  if (high.length > 0) {
    console.log('\n🟠 HIGH PRIORITY ISSUES:');
    high.slice(0, 10).forEach((issue, idx) => {
      console.log(`\n${idx + 1}. [${issue.category.toUpperCase()}] ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.message}`);
      if (issue.recommendation) {
        console.log(`   💡 ${issue.recommendation}`);
      }
    });
    if (high.length > 10) {
      console.log(`\n   ... and ${high.length - 10} more high priority issues`);
    }
  }
  
  // Generate JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: issues.length,
      critical: critical.length,
      high: high.length,
      medium: medium.length,
      low: low.length,
    },
    issues: issues.map(i => ({
      severity: i.severity,
      category: i.category,
      file: i.file,
      line: i.line,
      message: i.message,
      recommendation: i.recommendation,
    })),
  };
  
  const reportPath = join(ROOT_DIR, 'validation-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: validation-report.json`);
  
  // Exit with error code if critical issues found
  if (critical.length > 0) {
    console.log('\n❌ Validation failed: Critical issues found');
    console.log('   Run with --fix to attempt automatic fixes (coming soon)');
    process.exit(1);
  }
  
  if (high.length > 0) {
    console.log('\n⚠️  Validation completed with warnings');
    process.exit(0);
  }
  
  console.log('\n✅ Validation passed!');
  process.exit(0);
}

main();
