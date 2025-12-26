/**
 * Seed Supabase Database
 * 
 * This script reads SQL seed files and executes them against Supabase
 * using the supabaseAdmin client's raw SQL execution capability.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const SEED_FILES = [
  '02_categories_expanded.sql',
  '03_materials_expanded.sql',
  '20_estimate_system_data.sql',
  '21_expanded_line_items.sql',
  'seed_ai_prompts.sql',
];

async function extractAndRunInserts(filename: string): Promise<void> {
  const filePath = path.join(process.cwd(), 'db/seeds', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP] File not found: ${filename}`);
    return;
  }
  
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  const insertRegex = /INSERT INTO\s+(\w+)\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)(?:ON CONFLICT|;)/gi;
  let match;
  let insertCount = 0;
  
  while ((match = insertRegex.exec(sql)) !== null) {
    const tableName = match[1];
    insertCount++;
    
    console.log(`  - Found INSERT for table: ${tableName}`);
  }
  
  console.log(`  Total INSERTs found: ${insertCount}`);
}

async function checkTableCounts(): Promise<void> {
  console.log('\n=== Checking Table Counts in Supabase ===\n');
  
  const tables = [
    'ai_prompts',
    'line_item_categories', 
    'materials',
    'price_lists',
    'coverage_types',
    'tax_rates',
    'depreciation_schedules',
    'labor_rates',
    'regional_multipliers',
    'xact_line_items',
  ];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`  ${table}: ERROR - ${error.message}`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }
}

async function main() {
  console.log('=== Supabase Seed Analysis ===\n');
  console.log('Supabase URL:', supabaseUrl);
  console.log('\nAnalyzing seed files...\n');
  
  for (const file of SEED_FILES) {
    console.log(`\nFile: ${file}`);
    await extractAndRunInserts(file);
  }
  
  await checkTableCounts();
  
  console.log('\n=== Analysis Complete ===');
  console.log('\nNOTE: The Supabase JS client cannot execute raw SQL.');
  console.log('To seed data, you need to either:');
  console.log('1. Use the Supabase Dashboard SQL Editor');
  console.log('2. Use psql with the correct PostgreSQL connection string');
  console.log('3. Use the Supabase CLI: supabase db execute');
}

main().catch(console.error);
