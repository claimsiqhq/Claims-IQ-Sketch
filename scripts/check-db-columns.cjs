#!/usr/bin/env node
/**
 * Quick database column check script
 * Compares expected schema columns against actual database
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Expected columns from schema.ts (key tables)
const expectedSchema = {
  organizations: ['id', 'name', 'slug', 'type', 'email', 'phone', 'address', 'settings', 'status', 'created_at', 'updated_at'],
  users: ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'current_organization_id', 'preferences', 'created_at', 'updated_at'],
  organization_memberships: ['id', 'user_id', 'organization_id', 'role', 'status', 'created_at', 'updated_at'],
  claims: [
    'id', 'organization_id', 'assigned_user_id', 'claim_number', 'carrier_id', 'region_id',
    'insured_name', 'insured_email', 'insured_phone',
    'property_address', 'property_city', 'property_state', 'property_zip',
    'property_latitude', 'property_longitude', 'geocode_status', 'geocoded_at',
    'date_of_loss', 'loss_type', 'loss_description',
    'primary_peril', 'secondary_perils', 'peril_confidence', 'peril_metadata',
    'policy_number', 'claim_type', 'year_roof_install', 'wind_hail_deductible', 'dwelling_limit',
    'endorsements_listed', 'coverage_a', 'coverage_b', 'coverage_c', 'coverage_d', 'deductible',
    'status', 'assigned_adjuster_id', 'total_rcv', 'total_acv', 'total_paid',
    'pricing_snapshot', 'metadata', 'loss_context',
    'created_at', 'updated_at', 'closed_at'
  ],
  documents: [
    'id', 'organization_id', 'claim_id', 'name', 'type', 'category',
    'file_name', 'file_size', 'mime_type', 'storage_path',
    'extracted_data', 'processing_status', 'full_text', 'page_texts',
    'page_count', 'preview_status', 'preview_generated_at', 'preview_error',
    'description', 'tags', 'uploaded_by', 'created_at', 'updated_at'
  ],
  policy_form_extractions: [
    'id', 'organization_id', 'claim_id', 'document_id',
    'document_type', 'policy_form_code', 'policy_form_name', 'edition_date', 'jurisdiction', 'page_count',
    'extraction_data', 'extraction_version', 'source_form_code', 'is_canonical',
    'policy_structure', 'definitions', 'section_i', 'section_ii', 'general_conditions',
    'raw_page_text', 'extraction_model', 'extraction_version_str', 'extraction_status',
    'prompt_tokens', 'completion_tokens', 'total_tokens',
    'status', 'error_message', 'created_at', 'updated_at'
  ],
  endorsement_extractions: [
    'id', 'organization_id', 'claim_id', 'document_id',
    'form_code', 'title', 'edition_date', 'jurisdiction',
    'applies_to_policy_forms', 'applies_to_coverages',
    'extraction_data', 'extraction_version',
    'endorsement_type', 'precedence_priority',
    'modifications', 'tables', 'raw_text',
    'extraction_model', 'extraction_status', 'status', 'error_message',
    'created_at', 'updated_at'
  ],
  claim_briefings: [
    'id', 'organization_id', 'claim_id', 'peril', 'secondary_perils', 'source_hash',
    'briefing_json', 'status', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens',
    'error_message', 'created_at', 'updated_at'
  ],
  claim_structures: [
    'id', 'claim_id', 'organization_id', 'name', 'structure_type', 'description', 'address',
    'stories', 'year_built', 'construction_type', 'roof_type',
    'photos', 'notes', 'sort_order', 'created_at', 'updated_at'
  ],
  claim_rooms: [
    'id', 'claim_id', 'organization_id', 'structure_id', 'name', 'room_type', 'floor_level',
    'shape', 'width_ft', 'length_ft', 'ceiling_height_ft',
    'origin_x_ft', 'origin_y_ft', 'polygon',
    'l_shape_config', 't_shape_config', 'openings', 'features', 'notes',
    'sort_order', 'created_at', 'updated_at'
  ],
  claim_damage_zones: [
    'id', 'claim_id', 'room_id', 'organization_id',
    'damage_type', 'category', 'associated_peril', 'peril_confidence',
    'affected_walls', 'floor_affected', 'ceiling_affected',
    'extent_ft', 'severity', 'source', 'polygon', 'is_freeform', 'notes',
    'sort_order', 'created_at', 'updated_at'
  ],
  claim_photos: [
    'id', 'claim_id', 'organization_id', 'structure_id', 'room_id', 'damage_zone_id',
    'storage_path', 'public_url', 'file_name', 'mime_type', 'file_size',
    'label', 'hierarchy_path', 'description',
    'latitude', 'longitude', 'geo_address',
    'ai_analysis', 'quality_score', 'damage_detected',
    'analysis_status', 'analysis_error',
    'captured_at', 'analyzed_at', 'uploaded_by', 'created_at', 'updated_at'
  ],
  estimates: [
    'id', 'organization_id', 'claim_id', 'claim_number', 'property_address',
    'status', 'version',
    'subtotal', 'overhead_amount', 'overhead_pct', 'profit_amount', 'profit_pct',
    'tax_amount', 'tax_pct', 'grand_total',
    'region_id', 'carrier_profile_id',
    'created_by', 'approved_by', 'notes', 'is_locked',
    'created_at', 'updated_at', 'submitted_at'
  ],
  estimate_line_items: [
    'id', 'estimate_id', 'line_item_id', 'line_item_code', 'line_item_description', 'category_id',
    'quantity', 'unit', 'unit_price', 'material_cost', 'labor_cost', 'equipment_cost', 'subtotal',
    'source', 'damage_zone_id', 'room_name', 'notes', 'is_approved', 'sort_order',
    'created_at', 'updated_at'
  ],
  estimate_zones: [
    'id', 'area_id', 'name', 'zone_code', 'zone_type', 'status',
    'room_type', 'floor_level',
    'length_ft', 'width_ft', 'height_ft', 'pitch', 'pitch_multiplier',
    'dimensions', 'room_info', 'sketch_polygon',
    'damage_type', 'damage_severity', 'water_category', 'water_class', 'affected_surfaces',
    'associated_peril', 'peril_confidence', 'photo_ids',
    'line_item_count', 'rcv_total', 'acv_total',
    'notes', 'sort_order', 'created_at', 'updated_at'
  ],
  inspection_workflows: [
    'id', 'organization_id', 'claim_id', 'version', 'status',
    'primary_peril', 'secondary_perils', 'source_briefing_id',
    'workflow_json', 'generated_from',
    'created_by', 'created_at', 'updated_at', 'completed_at', 'archived_at'
  ],
  inspection_workflow_steps: [
    'id', 'workflow_id', 'step_index', 'phase', 'step_type', 'title', 'instructions',
    'required', 'tags', 'dependencies',
    'estimated_minutes', 'actual_minutes',
    'status', 'completed_by', 'completed_at', 'notes',
    'room_id', 'room_name', 'peril_specific',
    'created_at', 'updated_at'
  ],
  ai_prompts: [
    'id', 'prompt_key', 'prompt_name', 'category',
    'system_prompt', 'user_prompt_template',
    'model', 'temperature', 'max_tokens', 'response_format',
    'description', 'version', 'is_active',
    'usage_count', 'last_used_at', 'avg_tokens_used',
    'created_at', 'updated_at'
  ],
  claim_checklists: [
    'id', 'claim_id', 'organization_id', 'name', 'description',
    'peril', 'severity', 'template_version',
    'total_items', 'completed_items', 'status',
    'metadata', 'created_at', 'updated_at', 'completed_at'
  ],
  claim_checklist_items: [
    'id', 'checklist_id', 'title', 'description', 'category',
    'required_for_perils', 'required_for_severities', 'conditional_logic',
    'required', 'priority', 'sort_order',
    'status', 'completed_by', 'completed_at', 'skipped_reason',
    'notes', 'linked_document_ids', 'due_date',
    'created_at', 'updated_at'
  ],
};

async function run() {
  console.log('🔍 SCHEMA COLUMN VALIDATION');
  console.log('='.repeat(60));
  console.log('Comparing schema.ts against actual database columns\n');

  try {
    const client = await pool.connect();

    // Get all tables and columns from database
    const result = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    // Group by table
    const dbTables = {};
    for (const row of result.rows) {
      if (!dbTables[row.table_name]) dbTables[row.table_name] = new Set();
      dbTables[row.table_name].add(row.column_name);
    }

    console.log(`Found ${Object.keys(dbTables).length} tables in database\n`);
    console.log('='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60) + '\n');

    let totalMissing = 0;
    let tablesWithIssues = [];

    for (const [tableName, expectedCols] of Object.entries(expectedSchema)) {
      const dbCols = dbTables[tableName];

      if (!dbCols) {
        console.log(`❌ ${tableName}: TABLE MISSING IN DATABASE`);
        tablesWithIssues.push({ table: tableName, missing: expectedCols });
        totalMissing += expectedCols.length;
        continue;
      }

      const missing = expectedCols.filter(col => !dbCols.has(col));
      const extra = [...dbCols].filter(col => !expectedCols.includes(col));

      if (missing.length === 0) {
        console.log(`✅ ${tableName}: All ${expectedCols.length} columns match`);
        if (extra.length > 0) {
          console.log(`   ℹ️  Extra in DB: ${extra.join(', ')}`);
        }
      } else {
        console.log(`❌ ${tableName}: MISSING ${missing.length} columns`);
        console.log(`   🔴 MISSING: ${missing.join(', ')}`);
        tablesWithIssues.push({ table: tableName, missing });
        totalMissing += missing.length;
        if (extra.length > 0) {
          console.log(`   ℹ️  Extra in DB: ${extra.join(', ')}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60) + '\n');

    if (totalMissing === 0) {
      console.log('✅ All checked tables have all expected columns!');
    } else {
      console.log(`❌ Found ${totalMissing} missing columns across ${tablesWithIssues.length} tables\n`);
      console.log('COLUMNS THAT NEED TO BE ADDED TO DATABASE:');
      console.log('-'.repeat(40));
      for (const { table, missing } of tablesWithIssues) {
        console.log(`\n${table}:`);
        for (const col of missing) {
          console.log(`  - ${col}`);
        }
      }
    }

    client.release();
    await pool.end();

    process.exit(totalMissing > 0 ? 1 : 0);

  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

run();
