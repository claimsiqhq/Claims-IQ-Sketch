/**
 * Document Processor - Clean FNOL → Policy → Endorsement Pipeline
 *
 * This module implements a deterministic document processing pipeline with:
 * - ONE extraction model per document type (FNOL, Policy, Endorsement)
 * - ONE deterministic database mapping per document type
 * - NO legacy extraction paths, fallbacks, or conditional merges
 * - Missing data remains NULL — never inferred
 * - FNOL truth stored in loss_context, not metadata
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { inferPeril, type PerilInferenceInput } from './perilNormalizer';
import { PromptKey } from '../../shared/schema';
import { getSupabaseAdmin } from '../lib/supabase';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPromptWithFallback, substituteVariables } from './promptService';
import { recomputeEffectivePolicyIfNeeded } from './effectivePolicyService';
import { queueGeocoding } from './geocoding';

/**
 * Auto-trigger AI generation pipeline after document processing
 * Runs asynchronously to not block the main response
 */
async function triggerAIGenerationPipeline(claimId: string, organizationId: string, documentType: string): Promise<void> {
  try {
    console.log(`[AI Pipeline] Starting auto-generation for claim ${claimId} after ${documentType} processing`);
    
    // Dynamically import to avoid circular dependencies
    const { generateClaimBriefing } = await import('./claimBriefingService');
    const { generateInspectionWorkflow } = await import('./inspectionWorkflowService');
    
    // Step 1: Generate briefing (if FNOL, policy, or endorsement was just processed)
    console.log(`[AI Pipeline] Generating briefing for claim ${claimId}...`);
    const briefingResult = await generateClaimBriefing(claimId, organizationId, false);
    
    if (briefingResult.success) {
      console.log(`[AI Pipeline] Briefing generated successfully for claim ${claimId}`);
      
      // Step 2: Generate inspection workflow after briefing
      console.log(`[AI Pipeline] Generating inspection workflow for claim ${claimId}...`);
      const workflowResult = await generateInspectionWorkflow(claimId, organizationId, undefined, false);
      
      if (workflowResult.success) {
        console.log(`[AI Pipeline] Inspection workflow generated successfully for claim ${claimId}`);
      } else {
        console.warn(`[AI Pipeline] Workflow generation failed for claim ${claimId}:`, workflowResult.error);
      }
    } else {
      console.warn(`[AI Pipeline] Briefing generation failed for claim ${claimId}:`, briefingResult.error);
    }
  } catch (error) {
    console.error(`[AI Pipeline] Error in auto-generation for claim ${claimId}:`, error);
  }
}

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-pdf');
const DOCUMENTS_BUCKET = 'documents';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse currency string to numeric value
 * Handles formats like "$500,000", "500000", "$1,000.00", "2%", etc.
 * Returns null if parsing fails or value is percentage
 */
function parseCurrencyToNumber(value: string | null | undefined): number | null {
  if (!value) return null;

  // Skip percentage values - they shouldn't be stored as numeric amounts
  if (value.includes('%')) return null;

  // Remove currency symbols, commas, and whitespace
  const cleaned = value.replace(/[$,\s]/g, '').trim();

  // Parse the number
  const parsed = parseFloat(cleaned);

  // Return null if not a valid number
  if (isNaN(parsed) || !isFinite(parsed)) return null;

  // Return the parsed value (rounded to 2 decimal places for currency)
  return Math.round(parsed * 100) / 100;
}

/**
 * Deep merge two objects, handling arrays and nested objects
 * Used for merging multi-page extraction results (modifications, etc.)
 */
function deepMergeObjects(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (result[key] === undefined) {
      result[key] = value;
    } else if (Array.isArray(value) && Array.isArray(result[key])) {
      // Concatenate arrays
      result[key] = [...result[key], ...value];
    } else if (typeof value === 'object' && !Array.isArray(value) &&
               typeof result[key] === 'object' && !Array.isArray(result[key])) {
      // Recursively merge objects
      result[key] = deepMergeObjects(result[key], value);
    } else if (typeof value !== 'object') {
      // For scalars, override if existing value is empty/falsy and new value has content
      // This ensures later pages can provide values when earlier pages had empty strings
      const existingIsEmpty = result[key] === '' || result[key] === null || result[key] === undefined;
      const newHasContent = value !== '' && value !== null && value !== undefined;
      if (existingIsEmpty && newHasContent) {
        result[key] = value;
      }
      // Otherwise keep existing value (first non-empty value wins)
    }
  }

  return result;
}

// ============================================
// AUTHORITATIVE TYPE DEFINITIONS
// ============================================

/**
 * AUTHORITATIVE FNOL Extraction Interface
 * This is the ONLY accepted FNOL shape. No legacy formats.
 */
export interface FNOLExtraction {
  fnol: {
    reported_by?: string;
    reported_date?: string;
    drone_eligible?: boolean;
    weather?: {
      lookup_status: "ok" | "failed";
      message?: string;
    };
  };

  claim: {
    claim_number: string;
    date_of_loss: string;
    primary_peril: string;
    secondary_perils?: string[];
    loss_description: string;
  };

  insured: {
    primary_name: string;
    secondary_name?: string;
    email?: string;
    phone?: string;
  };

  property: {
    address: {
      full: string;
      city: string;
      state: string;
      zip: string;
    };
    year_built?: number;
    stories?: number;
    occupancy?: string;
    roof?: {
      material?: string;
      year_installed?: number;
      damage_scope?: "Exterior Only" | "Interior" | "Both";
      wood_roof?: boolean;
    };
  };

  damage_summary: {
    coverage_a?: string;
    coverage_b?: string;
    coverage_c?: string;
    coverage_d?: string;
  };
}

/**
 * Loss Context structure - stored in claims.loss_context
 * Matches canonical FNOL structure (snake_case)
 */
export interface LossContext {
  fnol: {
    reported_by?: string;
    reported_date?: string;
    drone_eligible?: boolean;
    weather?: {
      lookup_status: "ok" | "failed";
      message?: string;
    };
  };
  property: {
    year_built?: number;
    stories?: number;
    occupancy?: string;
    roof?: {
      material?: string;
      year_installed?: number;
      damage_scope?: string;
      wood_roof?: boolean;
    };
  };
  damage_summary: {
    coverage_a?: string;
    coverage_b?: string;
    coverage_c?: string;
    coverage_d?: string;
  };
}

/**
 * AUTHORITATIVE Policy Form Extraction Interface
 * This is the ONLY accepted policy extraction shape. Matches canonical schema.
 *
 * Rules:
 * - Lossless extraction of policy language
 * - NO summarization
 * - NO interpretation
 * - raw_text must contain full verbatim policy text
 * - Uses snake_case to match canonical schema
 */
export interface PolicyFormExtraction {
  form_code: string;
  form_name?: string;
  edition_date?: string;
  jurisdiction?: string;

  structure: {
    definitions?: Record<string, {
      definition: string;
      depreciation_includes?: string[];
    }>;
    coverages?: {
      A?: { name?: string; valuation?: string; includes?: string[] };
      B?: { name?: string; valuation?: string };
      C?: { name?: string; valuation?: string };
      D?: { name?: string; valuation?: string };
    };
    perils?: {
      coverage_a_b?: string;
      coverage_c_named?: string[];
    };
    exclusions?: string[];
    conditions?: string[];
    loss_settlement?: {
      default?: {
        basis?: string;
        repair_time_limit_months?: number;
      };
    };
    additional_coverages?: string[];
  };

  raw_text: string;
}

/**
 * AUTHORITATIVE Endorsement Extraction Interface
 * This is the ONLY accepted endorsement extraction shape. Matches canonical schema.
 *
 * Rules:
 * - Extraction MUST be delta-only (what the endorsement changes)
 * - NEVER reprint base policy language
 * - NEVER merge with other endorsements
 * - NEVER interpret impact
 * - raw_text must contain full endorsement text
 * - Uses snake_case to match canonical schema
 */
export interface EndorsementExtraction {
  form_code: string;
  title?: string;
  edition_date?: string;
  jurisdiction?: string;
  applies_to_forms?: string[];
  applies_to_coverages?: string[];
  endorsement_type?: string;
  precedence_priority?: number;

  modifications?: {
    definitions?: {
      added?: Array<{ term: string; definition: string }>;
      deleted?: string[];
      replaced?: Array<{ term: string; new_definition: string }>;
    };
    loss_settlement?: {
      replaces?: Array<{
        section: string;
        new_rule: {
          basis?: string;
          repair_time_limit_months?: number;
          fallback_basis?: string;
          conditions?: string[];
        };
      }>;
    };
    exclusions?: {
      added?: string[];
      deleted?: string[];
    };
  };

  tables?: Array<{
    table_type: string;
    applies_when?: {
      peril?: string;
      coverage?: string[];
    };
    data?: Record<string, unknown>;
    schedule?: any[];
  }>;

  raw_text: string;
}

/**
 * Document type enum for routing
 */
type DocumentType = 'fnol' | 'policy' | 'endorsement';

// ============================================
// STORAGE UTILITIES
// ============================================

async function downloadFromStorage(storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || 'No data returned'}`);
  }

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const ext = path.extname(storagePath) || '.bin';
  const tempPath = path.join(TEMP_DIR, `doc-${Date.now()}${ext}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);

  return tempPath;
}

// ============================================
// PDF/IMAGE PROCESSING UTILITIES
// ============================================

async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const baseName = path.basename(pdfPath, '.pdf').replace(/[^a-zA-Z0-9-_]/g, '_');
  const timestamp = Date.now();
  const outputPrefix = path.join(TEMP_DIR, `${baseName}-${timestamp}`);

  try {
    await execAsync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPrefix}"`);
  } catch (error) {
    console.error('pdftoppm error:', error);
    throw new Error(`PDF conversion failed: ${(error as Error).message}`);
  }

  const files = fs.readdirSync(TEMP_DIR);
  const imageFiles = files
    .filter((f: string) => f.startsWith(`${baseName}-${timestamp}`) && f.endsWith('.png'))
    .sort()
    .map((f: string) => path.join(TEMP_DIR, f));

  return imageFiles;
}

function cleanupTempImages(imagePaths: string[]): void {
  for (const imgPath of imagePaths) {
    try {
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    } catch (e) {
      console.warn('Failed to cleanup temp image:', imgPath);
    }
  }
}

// ============================================
// PROMPT CONFIGURATION
// ============================================

function getPromptKeyForDocumentType(documentType: DocumentType): PromptKey {
  switch (documentType) {
    case 'fnol':
      return PromptKey.DOCUMENT_EXTRACTION_FNOL;
    case 'policy':
      return PromptKey.DOCUMENT_EXTRACTION_POLICY;
    case 'endorsement':
      return PromptKey.DOCUMENT_EXTRACTION_ENDORSEMENT;
  }
}

// ============================================
// FNOL EXTRACTION AND PROCESSING
// ============================================

/**
 * Transform raw OpenAI response to FNOLExtraction
 * Strict mapping - no fallbacks, no inference
 */
function transformToFNOLExtraction(raw: any): FNOLExtraction {
  // OpenAI returns canonical structure directly (snake_case)
  // No fallbacks - if structure is wrong, fail loudly
  
  const extraction: FNOLExtraction = {
    fnol: raw.fnol || {},
    claim: raw.claim || { claim_number: '', date_of_loss: '', primary_peril: '', loss_description: '' },
    insured: raw.insured || { primary_name: '' },
    property: raw.property || { address: { full: '', city: '', state: '', zip: '' } },
    damage_summary: raw.damage_summary || {},
  };
  
  // Validate required fields
  if (!extraction.claim.claim_number && !extraction.claim.date_of_loss && !extraction.insured.primary_name) {
    console.warn('[FNOL Transform] Missing critical fields:', {
      claim_number: extraction.claim.claim_number,
      date_of_loss: extraction.claim.date_of_loss,
      primary_name: extraction.insured.primary_name,
    });
  }
  
  return extraction;
}

/**
 * Build loss_context from FNOLExtraction
 * This is the canonical storage for FNOL truth
 * Matches canonical schema structure (snake_case)
 */
function buildLossContext(extraction: FNOLExtraction): LossContext {
  return {
    fnol: extraction.fnol,
    property: {
      year_built: extraction.property.year_built,
      stories: extraction.property.stories,
      occupancy: extraction.property.occupancy,
      roof: extraction.property.roof,
    },
    damage_summary: extraction.damage_summary,
  };
}

/**
 * Validate FNOL extraction - fail loudly if malformed
 */
function validateFNOLExtraction(extraction: FNOLExtraction): void {
  if (!extraction.claim.claim_number && !extraction.claim.date_of_loss && !extraction.insured.primary_name) {
    throw new Error('FNOL extraction failed: No claim number, date of loss, or insured name found. Document may not be a valid FNOL.');
  }
}

// ============================================
// POLICY EXTRACTION AND PROCESSING
// ============================================

/**
 * Transform raw AI extraction to strict PolicyFormExtraction
 * Rules:
 * - Lossless extraction
 * - NO summarization
 * - NO interpretation
 * - Missing data remains NULL
 */
function transformToPolicyExtraction(raw: any): PolicyFormExtraction {
  // OpenAI returns canonical structure directly (snake_case)
  // Multi-page merging already handled in extractFromPDF
  
  const extraction: PolicyFormExtraction = {
    form_code: raw.form_code || '',
    form_name: raw.form_name,
    edition_date: raw.edition_date,
    jurisdiction: raw.jurisdiction,
    structure: raw.structure || {
      definitions: {},
      coverages: {},
      perils: {},
      exclusions: [],
      conditions: [],
      loss_settlement: {},
      additional_coverages: [],
    },
    raw_text: raw.raw_text || raw.full_text || '',
  };

  return extraction;
}

/**
 * Store policy extraction to database
 * Rules:
 * - ONE row per document
 * - Mark existing canonical rows as non-canonical
 * - Do NOT write to legacy policy_forms table
 * - Do NOT update claims table
 */
async function storePolicy(
  extraction: PolicyFormExtraction,
  documentId: string,
  claimId: string | null,
  organizationId: string
): Promise<void> {
  console.log(`[PolicyExtraction] Starting storePolicy for document ${documentId}, org ${organizationId}, claimId: ${claimId}`);
  console.log(`[PolicyExtraction] Extraction data: form_code=${extraction.form_code}, form_name=${extraction.form_name}`);

  // If existing canonical extraction exists for same claim + form, mark it non-canonical
  if (claimId && extraction.form_code) {
    const { error: updateError } = await supabaseAdmin
      .from('policy_form_extractions')
      .update({ is_canonical: false, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('claim_id', claimId)
      .eq('policy_form_code', extraction.form_code)
      .eq('is_canonical', true);

    if (updateError) {
      console.warn(`[PolicyExtraction] Warning: Failed to mark existing canonical as non-canonical: ${updateError.message}`);
    }
  }

  // Safely filter conditions - handle case where conditions may be objects instead of strings
  const conditions = extraction.structure?.conditions || [];
  const filteredConditions = conditions.filter(c => {
    if (typeof c === 'string') {
      return !c.toLowerCase().includes('liability');
    }
    // If it's an object, keep it (can't filter by string content)
    return true;
  });

  // Build the extraction data payload
  const policyExtractionRow = {
    organization_id: organizationId,
    claim_id: claimId,
    document_id: documentId,
    policy_form_code: extraction.form_code || null,
    policy_form_name: extraction.form_name || null,
    edition_date: extraction.edition_date || null,
    document_type: 'policy',
    // Store the complete extraction as JSONB (canonical structure)
    extraction_data: extraction,
    extraction_version: 1,
    source_form_code: extraction.form_code || null,
    jurisdiction: extraction.jurisdiction || null,
    is_canonical: true,
    extraction_status: 'completed',
    extraction_model: 'gpt-4o',
    // Also store structured fields (database columns exist, but we read from extraction_data only)
    definitions: extraction.structure?.definitions || {},
    section_i: {
      propertyCoverage: extraction.structure?.coverages || {},
      perils: extraction.structure?.perils || {},
      exclusions: extraction.structure?.exclusions || [],
      conditions: filteredConditions,
      lossSettlement: extraction.structure?.loss_settlement || {},
      additionalCoverages: extraction.structure?.additional_coverages || [],
    },
    section_ii: {},
    general_conditions: filteredConditions,
    raw_page_text: extraction.raw_text || null,
    status: 'completed',
  };

  console.log(`[PolicyExtraction] Built extraction row, checking for existing document extraction...`);

  // Check for existing extraction for this document
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('policy_form_extractions')
    .select('id')
    .eq('document_id', documentId)
    .limit(1);

  if (selectError) {
    console.error(`[PolicyExtraction] Error checking for existing extraction: ${selectError.message}`);
    throw new Error(`Failed to check for existing extraction: ${selectError.message}`);
  }

  if (existing && existing.length > 0) {
    console.log(`[PolicyExtraction] Found existing extraction ${existing[0].id}, updating...`);
    const { error: updateError } = await supabaseAdmin
      .from('policy_form_extractions')
      .update({ ...policyExtractionRow, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id);

    if (updateError) {
      console.error(`[PolicyExtraction] Update failed: ${updateError.message}`, updateError);
      throw new Error(`Failed to update policy extraction: ${updateError.message}`);
    }
    console.log(`[PolicyExtraction] Successfully updated extraction ${existing[0].id}`);
  } else {
    console.log(`[PolicyExtraction] No existing extraction, inserting new record...`);
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('policy_form_extractions')
      .insert(policyExtractionRow)
      .select('id')
      .single();

    if (insertError) {
      console.error(`[PolicyExtraction] Insert failed: ${insertError.message}`, insertError);
      console.error(`[PolicyExtraction] Insert row data:`, JSON.stringify(policyExtractionRow, null, 2));
      throw new Error(`Failed to insert policy extraction: ${insertError.message}`);
    }
    console.log(`[PolicyExtraction] Successfully inserted new extraction: ${insertData?.id}`);
  }

  console.log(`[PolicyExtraction] Saved canonical extraction for document ${documentId}, form ${extraction.form_code}`);
}

// ============================================
// ENDORSEMENT EXTRACTION AND PROCESSING
// ============================================

/**
 * Infer endorsement type from form code and modifications
 * Priority ranges:
 * - 1-10: loss_settlement (depreciation schedules, ACV rules)
 * - 11-30: coverage_specific (hidden water, equipment breakdown)
 * - 31-50: state_amendatory (state-specific requirements)
 * - 51-100: general (miscellaneous endorsements)
 */
function inferEndorsementTypeAndPriority(
  formCode: string,
  modifications: EndorsementExtraction['modifications']
): { endorsementType: string; precedencePriority: number } {
  const lowerFormCode = formCode.toLowerCase();

  // Loss settlement endorsements (highest priority)
  if (lowerFormCode.includes('81') || // Roof schedules
      lowerFormCode.includes('84') || // Hidden water / loss settlement
      modifications?.loss_settlement?.replaces?.length) {
    return { endorsementType: 'loss_settlement', precedencePriority: 5 };
  }

  // Coverage-specific endorsements
  if (lowerFormCode.includes('04') || // Coverage modifications
      lowerFormCode.includes('06')) { // Equipment breakdown
    return { endorsementType: 'coverage_specific', precedencePriority: 20 };
  }

  // State amendatory endorsements
  if (lowerFormCode.includes('53') || // State amendatory
      lowerFormCode.includes('amendatory')) {
    return { endorsementType: 'state_amendatory', precedencePriority: 40 };
  }

  // General endorsements
  return { endorsementType: 'general', precedencePriority: 75 };
}

/**
 * Transform raw AI extraction to strict EndorsementExtraction[]
 * Rules:
 * - Delta-only extraction (what the endorsement changes)
 * - NEVER reprint base policy language
 * - NEVER merge with other endorsements
 * - Missing data remains NULL
 */
function transformToEndorsementExtraction(raw: any): EndorsementExtraction[] {
  const endorsements = raw.endorsements || [raw];
  const fullTextFallback = raw.full_text || '';

  // Transform each endorsement entry - canonical structure only
  const transformed = endorsements.map((e: any) => {
    const extraction: EndorsementExtraction = {
      form_code: e.form_code || '',
      title: e.title,
      edition_date: e.edition_date,
      jurisdiction: e.jurisdiction,
      applies_to_forms: e.applies_to_forms || [],
      applies_to_coverages: e.applies_to_coverages || [],
      endorsement_type: e.endorsement_type,
      precedence_priority: e.precedence_priority,
      modifications: e.modifications || {},
      tables: e.tables ? e.tables.map((t: any) => ({
        table_type: t.table_type,
        applies_when: t.applies_when,
        schedule: t.schedule,
      })) : [],
      raw_text: e.raw_text || fullTextFallback,
    };

    return extraction;
  });

  // Second pass: deduplicate and merge endorsements with same form_code
  // This handles multi-page documents where each page returns the same endorsement partially
  const mergedByFormCode = new Map<string, EndorsementExtraction>();

  for (const endorsement of transformed) {
    const key = endorsement.form_code || 'unknown';
    const existing = mergedByFormCode.get(key);

    if (!existing) {
      mergedByFormCode.set(key, endorsement);
    } else {
      // Merge: concatenate raw_text, merge modifications, concat tables
      const merged: EndorsementExtraction = {
        ...existing,
        title: existing.title || endorsement.title,
        edition_date: existing.edition_date || endorsement.edition_date,
        jurisdiction: existing.jurisdiction || endorsement.jurisdiction,
        applies_to_forms: [...new Set([...(existing.applies_to_forms || []), ...(endorsement.applies_to_forms || [])])],
        applies_to_coverages: [...new Set([...(existing.applies_to_coverages || []), ...(endorsement.applies_to_coverages || [])])],
        modifications: deepMergeObjects(existing.modifications || {}, endorsement.modifications || {}),
        tables: [...(existing.tables || []), ...(endorsement.tables || [])],
        raw_text: [existing.raw_text, endorsement.raw_text].filter(Boolean).join('\n\n'),
      };
      mergedByFormCode.set(key, merged);
    }
  }

  // Apply full_text fallback to any endorsement with empty raw_text
  const result = Array.from(mergedByFormCode.values()).map(e => ({
    ...e,
    raw_text: e.raw_text || fullTextFallback,
  }));

  return result;
}

/**
 * Store endorsement extractions to database
 * Rules:
 * - ONE row per endorsement document
 * - precedence_priority must be explicitly set
 * - endorsement_type must be explicitly set
 * - Do NOT merge endorsements
 * - Do NOT update policy rows
 * - Do NOT update claims table
 */
async function storeEndorsements(
  extractions: EndorsementExtraction[],
  claimId: string,
  organizationId: string,
  documentId?: string
): Promise<void> {
  for (const endorsement of extractions) {
    const formCode = endorsement.form_code;
    if (!formCode) continue;

    // Infer type and priority
    const { endorsementType, precedencePriority } = inferEndorsementTypeAndPriority(
      formCode,
      endorsement.modifications
    );

    const { data: existing } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('claim_id', claimId)
      .eq('form_code', formCode)
      .limit(1);

    const extractionRow = {
      organization_id: organizationId,
      claim_id: claimId,
      document_id: documentId || null,
      form_code: formCode,
      title: endorsement.title || null,
      edition_date: endorsement.edition_date || null,
      jurisdiction: endorsement.jurisdiction || null,
      applies_to_policy_forms: endorsement.applies_to_forms || [],
      applies_to_coverages: endorsement.applies_to_coverages || [],
      // Store the complete extraction as JSONB
      extraction_data: endorsement,
      extraction_version: 1,
      // Type and priority - MANDATORY
      endorsement_type: endorsementType,
      precedence_priority: precedencePriority,
      // Also store in legacy columns (database columns exist, but we read from extraction_data only)
      modifications: endorsement.modifications || {},
      tables: endorsement.tables || [],
      raw_text: endorsement.raw_text || null,
      extraction_model: 'gpt-4o',
      extraction_status: 'completed',
      status: 'completed',
    };

    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from('endorsement_extractions')
        .update({ ...extractionRow, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await supabaseAdmin
        .from('endorsement_extractions')
        .insert(extractionRow);
    }

    console.log(`[EndorsementExtraction] Saved extraction for ${formCode} (type: ${endorsementType}, priority: ${precedencePriority})`);
  }
}

// ============================================
// AI EXTRACTION
// ============================================

async function extractFromSingleImage(
  imagePath: string,
  documentType: DocumentType,
  pageNum: number,
  totalPages: number
): Promise<any> {
  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');

  const promptKey = getPromptKeyForDocumentType(documentType);
  const promptConfig = await getPromptWithFallback(promptKey);

  const userPromptText = promptConfig.userPromptTemplate
    ? substituteVariables(promptConfig.userPromptTemplate, {
        pageNum: String(pageNum),
        totalPages: String(totalPages),
      })
    : `This is page ${pageNum} of ${totalPages} of a ${documentType} document. Extract all relevant information. Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: promptConfig.model,
    messages: [
      {
        role: 'system',
        content: promptConfig.systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64}`,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: userPromptText
          }
        ]
      }
    ],
    max_tokens: promptConfig.maxTokens || 4000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {};
  }

  return JSON.parse(content);
}

async function extractFromPDF(
  filePath: string,
  documentType: DocumentType,
  documentId?: string
): Promise<any> {
  let imagePaths: string[] = [];

  try {
    console.log(`Converting PDF to images: ${filePath}`);
    imagePaths = await convertPdfToImages(filePath);

    if (imagePaths.length === 0) {
      throw new Error('No pages could be extracted from PDF');
    }

    console.log(`Processing ${imagePaths.length} page(s) with Vision API`);

    // Helper to update progress without overwriting existing extracted_data
    const updateProgress = async (progress: any) => {
      if (!documentId) return;
      
      // Fetch current extracted_data to preserve existing fields
      const { data: currentDoc } = await supabaseAdmin
        .from('documents')
        .select('extracted_data')
        .eq('id', documentId)
        .single();
      
      const currentData = (currentDoc?.extracted_data as any) || {};
      
      await supabaseAdmin
        .from('documents')
        .update({
          extracted_data: { ...currentData, _progress: progress },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
    };

    // Initial progress
    await updateProgress({
      totalPages: imagePaths.length,
      pagesProcessed: 0,
      percentComplete: 0,
      stage: 'extracting',
      startedAt: new Date().toISOString()
    });

    const pageResults: any[] = [];
    const pageTexts: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const pageData = await extractFromSingleImage(
          imagePaths[i],
          documentType,
          i + 1,
          imagePaths.length
        );
        pageResults.push(pageData);

        if (pageData.pageText) {
          pageTexts.push(pageData.pageText);
        }

        // Update progress after each page
        const pagesProcessed = i + 1;
        const percentComplete = Math.round((pagesProcessed / imagePaths.length) * 100);
        await updateProgress({
          totalPages: imagePaths.length,
          pagesProcessed,
          percentComplete,
          stage: pagesProcessed === imagePaths.length ? 'finalizing' : 'extracting',
          currentPage: pagesProcessed
        });
        console.log(`[Progress] Document ${documentId}: ${pagesProcessed}/${imagePaths.length} pages (${percentComplete}%)`);
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
        pageTexts.push(`[Error extracting page ${i + 1}]`);
      }
    }

    // For multi-page documents, merge results intelligently
    // - Arrays are concatenated (endorsements, tables, etc.)
    // - Objects are deep merged (modifications, etc.)
    // - Scalars use first non-empty value
    const merged = pageResults.reduce((acc, curr) => {
      for (const [key, value] of Object.entries(curr)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }

        if (acc[key] === undefined) {
          // First occurrence, just set it
          acc[key] = value;
        } else if (Array.isArray(value) && Array.isArray(acc[key])) {
          // Concatenate arrays (endorsements, tables, etc.)
          acc[key] = [...acc[key], ...value];
        } else if (typeof value === 'object' && !Array.isArray(value) &&
                   typeof acc[key] === 'object' && !Array.isArray(acc[key])) {
          // Deep merge objects (modifications, etc.)
          acc[key] = deepMergeObjects(acc[key], value);
        } else if (typeof value !== 'object') {
          // For scalars, override if existing value is empty/falsy and new value has content
          const existingIsEmpty = acc[key] === '' || acc[key] === null || acc[key] === undefined;
          if (existingIsEmpty) {
            acc[key] = value;
          }
          // Otherwise keep existing value (first non-empty value wins)
        }
      }
      return acc;
    }, {} as Record<string, any>);

    merged.pageTexts = pageTexts;
    merged.fullText = pageTexts.join('\n\n--- Page Break ---\n\n');

    return merged;

  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  } finally {
    cleanupTempImages(imagePaths);
  }
}

async function extractFromImage(
  filePath: string,
  documentType: DocumentType
): Promise<any> {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const promptKey = getPromptKeyForDocumentType(documentType);
  const promptConfig = await getPromptWithFallback(promptKey);

  const response = await openai.chat.completions.create({
    model: promptConfig.model,
    messages: [
      {
        role: 'system',
        content: promptConfig.systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: `Extract all relevant information from this ${documentType} document. Return ONLY valid JSON.`
          }
        ]
      }
    ],
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content extracted from image');
  }

  return JSON.parse(content);
}

// ============================================
// MAIN DOCUMENT PROCESSOR
// ============================================

/**
 * Process a document and extract data using AI
 * SIMPLIFIED CONTROL FLOW - no legacy branches
 */
export async function processDocument(
  documentId: string,
  organizationId: string
): Promise<any> {
  // Get document info
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('organization_id', organizationId)
    .single();

  if (docError || !doc) {
    throw new Error('Document not found');
  }

  const documentType = doc.type as DocumentType;
  console.log(`[ProcessDocument] Starting processing for document ${documentId}, type: ${documentType}, storage_path: ${doc.storage_path}`);

  // Update status to processing
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Download file from storage
    let tempFilePath: string | null = null;
    let rawExtraction: any;

    try {
      console.log(`Downloading document from storage: ${doc.storage_path}`);
      tempFilePath = await downloadFromStorage(doc.storage_path);
      console.log(`Downloaded to temp: ${tempFilePath}`);

      // Extract based on mime type
      if (doc.mime_type === 'application/pdf') {
        rawExtraction = await extractFromPDF(tempFilePath, documentType, documentId);
      } else if (doc.mime_type.startsWith('image/')) {
        rawExtraction = await extractFromImage(tempFilePath, documentType);
      } else {
        throw new Error(`Unsupported file type: ${doc.mime_type}`);
      }
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          console.warn('Failed to cleanup temp file:', tempFilePath);
        }
      }
    }

    // Fetch current extracted_data to preserve _progress
    const { data: currentDocData } = await supabaseAdmin
      .from('documents')
      .select('extracted_data')
      .eq('id', documentId)
      .single();
    const existingProgress = (currentDocData?.extracted_data as any)?._progress;

    console.log(`[ProcessDocument] Entering switch for documentType: '${documentType}' (raw type: ${typeof documentType})`);

    // SIMPLIFIED CONTROL FLOW - one path per document type
    switch (documentType) {
      case 'fnol': {
        const fnolExtraction = transformToFNOLExtraction(rawExtraction);
        validateFNOLExtraction(fnolExtraction);

        // Store extracted data, preserving progress info
        const finalExtractedData = existingProgress 
          ? { ...fnolExtraction, _progress: { ...existingProgress, stage: 'completed' } }
          : fnolExtraction;

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalExtractedData,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        // If no claim linked, automatically create one from the extracted FNOL data
        let claimId = doc.claim_id;
        if (!claimId) {
          console.log(`[FNOL] No claim linked - creating claim from FNOL extraction for document ${documentId}`);
          try {
            // Find related policy/endorsement documents that were uploaded recently without a claim
            // These are likely from the same bulk upload batch
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: relatedDocs } = await supabaseAdmin
              .from('documents')
              .select('id, type, extracted_data')
              .eq('organization_id', organizationId)
              .is('claim_id', null)
              .in('type', ['policy', 'endorsement'])
              .gte('created_at', fiveMinutesAgo)
              .neq('id', documentId);

            // Include FNOL document and any related policy/endorsement documents
            const allDocIds = [documentId];
            if (relatedDocs && relatedDocs.length > 0) {
              allDocIds.push(...relatedDocs.map(d => d.id));
              console.log(`[FNOL] Found ${relatedDocs.length} related policy/endorsement documents to include`);
            }

            claimId = await createClaimFromDocuments(organizationId, allDocIds);
            console.log(`[FNOL] Created claim ${claimId} from FNOL document ${documentId} with ${allDocIds.length - 1} related documents`);
          } catch (createError) {
            console.error(`[FNOL] Failed to create claim from FNOL:`, createError);
            // Update document with error info but keep extraction data
            await supabaseAdmin
              .from('documents')
              .update({
                processing_status: 'failed',
                extracted_data: {
                  ...fnolExtraction,
                  claimCreationError: (createError as Error).message
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', documentId);
            throw createError;
          }
        }

        // NOTE: AI Pipeline is now triggered ONLY inside createClaimFromDocuments
        // to prevent duplicate pipeline runs that cause performance issues

        console.log(`[FNOL] Extraction completed for document ${documentId}, claimId: ${claimId}`);
        return fnolExtraction;
      }

      case 'policy': {
        console.log(`[Policy] Processing policy document ${documentId}`);
        console.log(`[Policy] Raw extraction keys: ${Object.keys(rawExtraction || {}).join(', ')}`);

        const policyExtraction = transformToPolicyExtraction(rawExtraction);
        console.log(`[Policy] Transformed extraction: form_code=${policyExtraction.form_code}, form_name=${policyExtraction.form_name}`);

        const finalPolicyData = existingProgress
          ? { ...policyExtraction, _progress: { ...existingProgress, stage: 'completed' } }
          : policyExtraction;

        console.log(`[Policy] Updating documents table with extracted_data...`);
        const { error: docUpdateError } = await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalPolicyData,
            full_text: rawExtraction.full_text || policyExtraction.raw_text || null,
            page_texts: rawExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        if (docUpdateError) {
          console.error(`[Policy] Failed to update documents table: ${docUpdateError.message}`);
        } else {
          console.log(`[Policy] Successfully updated documents table`);
        }

        // If no claim_id, try to find a recently created claim to link to
        let claimIdToUse = doc.claim_id;
        console.log(`[Policy] Initial claimIdToUse: ${claimIdToUse}`)

        if (!claimIdToUse) {
          // Try to find a recently created claim from the same organization
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentClaim } = await supabaseAdmin
            .from('claims')
            .select('id')
            .eq('organization_id', organizationId)
            .gte('created_at', fiveMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (recentClaim) {
            claimIdToUse = recentClaim.id;
            // Update the document to link to this claim
            await supabaseAdmin
              .from('documents')
              .update({ claim_id: claimIdToUse, updated_at: new Date().toISOString() })
              .eq('id', documentId);
            console.log(`[Policy] Linked document ${documentId} to recently created claim ${claimIdToUse}`);
          }
        }

        console.log(`[Policy] Calling storePolicy with documentId=${documentId}, claimIdToUse=${claimIdToUse}, orgId=${organizationId}`);
        await storePolicy(policyExtraction, documentId, claimIdToUse, organizationId);
        console.log(`[Policy] storePolicy completed successfully`);

        // Trigger effective policy recomputation
        if (claimIdToUse) {
          try {
            await recomputeEffectivePolicyIfNeeded(claimIdToUse, organizationId);
            console.log(`[EffectivePolicy] Triggered recomputation for claim ${claimIdToUse}`);
          } catch (e) {
            console.error('[EffectivePolicy] Recomputation error:', e);
          }

          // Auto-trigger AI generation pipeline (async, non-blocking)
          triggerAIGenerationPipeline(claimIdToUse, organizationId, 'policy').catch(err => {
            console.error('[AI Pipeline] Background error:', err);
          });
        } else {
          console.log(`[Policy] No claim found to link document ${documentId} - will be linked by createClaimFromDocuments later`);
        }

        console.log(`[Policy] Extraction completed for document ${documentId}`);
        return policyExtraction;
      }

      case 'endorsement': {
        console.log(`[Endorsement] Raw extraction keys: ${Object.keys(rawExtraction || {}).join(', ')}`);
        console.log(`[Endorsement] Endorsements array length: ${rawExtraction?.endorsements?.length || 'N/A (using raw as single)'}`);
        console.log(`[Endorsement] fullText length: ${rawExtraction?.fullText?.length || 0} chars`);

        const endorsementExtractions = transformToEndorsementExtraction(rawExtraction);

        console.log(`[Endorsement] Transformed ${endorsementExtractions.length} endorsement(s)`);
        for (const e of endorsementExtractions) {
          console.log(`[Endorsement]   - ${e.form_code}: title="${e.title}", raw_text=${e.raw_text?.length || 0} chars, tables=${e.tables?.length || 0}, modifications keys=${Object.keys(e.modifications || {}).join(',') || 'none'}`);
        }

        const finalEndorsementData = existingProgress
          ? { ...endorsementExtractions, _progress: { ...existingProgress, stage: 'completed' } }
          : endorsementExtractions;

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalEndorsementData,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        // Always store endorsement extractions, even without claim_id
        // If no claim_id, they'll be linked later by createClaimFromDocuments
        // or we can try to find a recently created claim to link to
        let claimIdToUse = doc.claim_id;

        if (!claimIdToUse) {
          // Try to find a recently created claim from the same organization
          // that this endorsement might belong to
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentClaim } = await supabaseAdmin
            .from('claims')
            .select('id')
            .eq('organization_id', organizationId)
            .gte('created_at', fiveMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (recentClaim) {
            claimIdToUse = recentClaim.id;
            // Update the document to link to this claim
            await supabaseAdmin
              .from('documents')
              .update({ claim_id: claimIdToUse, updated_at: new Date().toISOString() })
              .eq('id', documentId);
            console.log(`[Endorsement] Linked document ${documentId} to recently created claim ${claimIdToUse}`);
          }
        }

        if (claimIdToUse) {
          await storeEndorsements(endorsementExtractions, claimIdToUse, organizationId, documentId);

          // Trigger effective policy recomputation
          try {
            await recomputeEffectivePolicyIfNeeded(claimIdToUse, organizationId);
            console.log(`[EffectivePolicy] Triggered recomputation for claim ${claimIdToUse}`);
          } catch (e) {
            console.error('[EffectivePolicy] Recomputation error:', e);
          }

          // Auto-trigger AI generation pipeline (async, non-blocking)
          triggerAIGenerationPipeline(claimIdToUse, organizationId, 'endorsement').catch(err => {
            console.error('[AI Pipeline] Background error:', err);
          });
        } else {
          console.log(`[Endorsement] No claim found to link document ${documentId} - will be linked by createClaimFromDocuments later`);
        }

        console.log(`[Endorsement] Extraction completed for document ${documentId}`);
        return endorsementExtractions;
      }

      default:
        throw new Error(`Unknown document type: ${documentType}`);
    }

  } catch (error) {
    console.error('Document processing error:', error);

    await supabaseAdmin
      .from('documents')
      .update({
        processing_status: 'failed',
        extracted_data: { error: (error as Error).message },
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    throw error;
  }
}

// ============================================
// CLAIM CREATION FROM DOCUMENTS
// ============================================

/**
 * Create a claim from extracted FNOL document data
 * STRICT MAPPING - populates ONLY specified scalar columns and loss_context
 */
export async function createClaimFromDocuments(
  organizationId: string,
  documentIds: string[],
  overrides?: Partial<FNOLExtraction>
): Promise<string> {
  // Get all documents and their extracted data
  const { data: docs, error: docsError } = await supabaseAdmin
    .from('documents')
    .select('id, type, extracted_data')
    .in('id', documentIds)
    .eq('organization_id', organizationId);

  if (docsError || !docs || docs.length === 0) {
    throw new Error(`Failed to fetch documents: ${docsError?.message || 'No documents found'}`);
  }

  // Find FNOL document - there should be exactly one
  const fnolDoc = docs.find(d => d.type === 'fnol');
  if (!fnolDoc || !fnolDoc.extracted_data) {
    throw new Error('No FNOL document found or extraction data missing');
  }

  // Transform to FNOLExtraction if needed
  let fnolExtraction: FNOLExtraction;
  const extractedData = fnolDoc.extracted_data as any;

  // Check if already in FNOLExtraction format (canonical structure)
  if (extractedData.claim && extractedData.insured && extractedData.property) {
    fnolExtraction = extractedData as FNOLExtraction;
  } else {
    fnolExtraction = transformToFNOLExtraction(extractedData);
  }

  // Apply overrides
  if (overrides) {
    fnolExtraction = { ...fnolExtraction, ...overrides };
  }

  // Validate extraction
  validateFNOLExtraction(fnolExtraction);

  // Build loss_context - MANDATORY
  const lossContext = buildLossContext(fnolExtraction);

  // Validate loss_context is not empty
  if (!lossContext.fnol && !lossContext.property && !lossContext.damage_summary) {
    throw new Error('FNOL ingestion failed: loss_context is empty or malformed');
  }

  // Generate claim number
  const claimNumber = fnolExtraction.claim.claim_number || await generateClaimId(organizationId);

  // PERIL NORMALIZATION
  const perilInput: PerilInferenceInput = {
    causeOfLoss: fnolExtraction.claim.primary_peril,
    lossDescription: fnolExtraction.claim.loss_description,
  };

  const perilInference = inferPeril(perilInput);

  console.log(`[Peril Normalization] Claim ${claimNumber}:`, {
    primaryPeril: perilInference.primaryPeril,
    secondaryPerils: perilInference.secondaryPerils,
    confidence: perilInference.confidence,
  });

  // Debug: Log policy values being stored
  console.log(`[ClaimCreation] Policy values for claim ${claimNumber}:`, {
    coverageA: fnolExtraction.damage_summary.coverage_a || null,
    coverageB: fnolExtraction.damage_summary.coverage_b || null,
    coverageC: fnolExtraction.damage_summary.coverage_c || null,
    coverageD: fnolExtraction.damage_summary.coverage_d || null,
  });

  // CREATE CLAIM - STRICT SCALAR MAPPING
  // Populate ONLY these scalar columns from FNOL:
  const { data: newClaim, error: claimError } = await supabaseAdmin
    .from('claims')
    .insert({
      organization_id: organizationId,
      claim_id: claimNumber,  // Required NOT NULL column in DB
      claim_number: claimNumber,

      // Insured info
      insured_name: fnolExtraction.insured.primary_name + 
        (fnolExtraction.insured.secondary_name ? ` ${fnolExtraction.insured.secondary_name}` : '') || null,
      insured_phone: fnolExtraction.insured.phone || null,
      insured_email: fnolExtraction.insured.email || null,

      // Property address
      property_address: fnolExtraction.property.address.full || null,
      property_city: fnolExtraction.property.address.city || null,
      property_state: fnolExtraction.property.address.state || null,
      property_zip: fnolExtraction.property.address.zip || null,

      // Loss details
      date_of_loss: fnolExtraction.claim.date_of_loss || null,
      primary_peril: perilInference.primaryPeril,
      loss_description: fnolExtraction.claim.loss_description || null,

      // Peril-specific deductibles (will be populated from policy/endorsements if needed)
      // Note: year_roof_install is stored in loss_context.property.roof.year_installed
      peril_specific_deductibles: {},

      // Coverage amounts (numeric) - parsed from damage_summary strings
      coverage_a: parseCurrencyToNumber(fnolExtraction.damage_summary.coverage_a),
      coverage_b: parseCurrencyToNumber(fnolExtraction.damage_summary.coverage_b),
      coverage_c: parseCurrencyToNumber(fnolExtraction.damage_summary.coverage_c),
      coverage_d: parseCurrencyToNumber(fnolExtraction.damage_summary.coverage_d),

      // Peril inference (merge FNOL secondary_perils with inferred ones)
      secondary_perils: [...(fnolExtraction.claim.secondary_perils || []), ...perilInference.secondaryPerils],
      peril_confidence: perilInference.confidence,
      peril_metadata: perilInference.perilMetadata,

      // LOSS CONTEXT - ALL FNOL TRUTH GOES HERE
      loss_context: lossContext,

      // Status
      status: 'fnol',

      // Empty metadata - no longer stuffing FNOL data here
      metadata: {
        extractedFrom: documentIds,
      }
    })
    .select('id')
    .single();

  if (claimError || !newClaim) {
    throw new Error(`Failed to create claim: ${claimError?.message}`);
  }

  const claimId = newClaim.id;

  // Associate documents with claim
  for (const docId of documentIds) {
    await supabaseAdmin
      .from('documents')
      .update({ claim_id: claimId, updated_at: new Date().toISOString() })
      .eq('id', docId);
  }

  // Process any policy documents - store extractions with correct claim_id
  const policyDocs = docs.filter(d => d.type === 'policy');
  for (const policyDoc of policyDocs) {
    if (policyDoc.extracted_data && !policyDoc.extracted_data._progress) {
      // Check if this looks like a valid PolicyFormExtraction
      const extraction = policyDoc.extracted_data as PolicyFormExtraction;
      if (extraction.form_code || extraction.form_name || extraction.structure) {
        await storePolicy(extraction, policyDoc.id, claimId, organizationId);
        console.log(`[ClaimCreation] Stored policy extraction for document ${policyDoc.id}`);
      }
    }
  }

  // Also update any existing policy_form_extractions that were stored with null claim_id
  for (const policyDoc of policyDocs) {
    await supabaseAdmin
      .from('policy_form_extractions')
      .update({ claim_id: claimId, updated_at: new Date().toISOString() })
      .eq('document_id', policyDoc.id)
      .is('claim_id', null);
  }

  // Process any endorsement documents
  const endorsementDocs = docs.filter(d => d.type === 'endorsement');
  for (const endDoc of endorsementDocs) {
    if (endDoc.extracted_data && !endDoc.extracted_data._progress) {
      const extractions = Array.isArray(endDoc.extracted_data)
        ? endDoc.extracted_data
        : [endDoc.extracted_data];
      await storeEndorsements(extractions as EndorsementExtraction[], claimId, organizationId, endDoc.id);
    }
  }

  // Also update any existing endorsement_extractions that were stored with null claim_id
  for (const endDoc of endorsementDocs) {
    await supabaseAdmin
      .from('endorsement_extractions')
      .update({ claim_id: claimId, updated_at: new Date().toISOString() })
      .eq('document_id', endDoc.id)
      .is('claim_id', null);
  }

  // Trigger effective policy recomputation if policy or endorsement documents present
  if (policyDocs.length > 0 || endorsementDocs.length > 0) {
    try {
      await recomputeEffectivePolicyIfNeeded(claimId, organizationId);
      console.log(`[EffectivePolicy] Triggered recomputation for claim ${claimId}`);
    } catch (e) {
      console.error('[EffectivePolicy] Recomputation error:', e);
    }
  }

  console.log(`[ClaimCreation] Created claim ${claimNumber} (${claimId}) with loss_context`);

  // Queue geocoding for the new claim address
  queueGeocoding(claimId);

  // Auto-trigger AI generation pipeline (async, non-blocking)
  // This generates briefing + inspection workflow automatically after claim creation
  triggerAIGenerationPipeline(claimId, organizationId, 'fnol').catch(err => {
    console.error('[AI Pipeline] Background error:', err);
  });

  return claimId;
}

/**
 * Generate a unique claim ID in format XX-XXX-XXXXXX
 */
async function generateClaimId(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const startOfYear = `${year}-01-01T00:00:00.000Z`;

  const { count } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', startOfYear);

  const seq = String((count || 0) + 1).padStart(6, '0');
  return `01-${String(year).slice(-3)}-${seq}`;
}

// ============================================
// NO BACKWARD COMPATIBILITY EXPORTS
// ============================================
// Legacy exports removed. Use the strict typed interfaces directly:
// - FNOLExtraction
// - PolicyFormExtraction
// - EndorsementExtraction
