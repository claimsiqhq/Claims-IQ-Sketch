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
import { execFile } from 'child_process';
import { promisify } from 'util';
import { inferPeril, type PerilInferenceInput } from './perilNormalizer';
import { PromptKey } from '../../shared/schema';
import { getSupabaseAdmin } from '../lib/supabase';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPromptWithFallback, substituteVariables } from './promptService';
import { recomputeEffectivePolicyIfNeeded } from './effectivePolicyService';
import { queueGeocoding } from './geocoding';
import { extractCatastropheNumber, storeCatastropheNumber } from './catastropheIntelligence';
import { getRegionByZip } from './pricing';

/**
 * Auto-trigger AI generation pipeline after document processing
 * Runs asynchronously to not block the main response
 *
 * Pipeline steps:
 * 1. Autofill coverage fields from FNOL data
 * 2. Generate AI claim briefing
 * 3. Generate inspection workflow
 */
async function triggerAIGenerationPipeline(claimId: string, organizationId: string, documentType: string): Promise<void> {
  try {
    console.log(`[AI Pipeline] Starting auto-generation for claim ${claimId} after ${documentType} processing`);

    // Step 0: Autofill coverage fields from FNOL/policy data
    // This ensures coverage limits are populated before briefing generation
    if (documentType === 'fnol' || documentType === 'policy') {
      console.log(`[AI Pipeline] Autofilling coverage fields for claim ${claimId}...`);
      const { autofillClaimCoverage } = await import('./claimAutofillService');
      const autofillResult = await autofillClaimCoverage(claimId, organizationId);
      if (autofillResult.success && autofillResult.fieldsUpdated.length > 0) {
        console.log(`[AI Pipeline] Autofilled fields: ${autofillResult.fieldsUpdated.join(', ')} for claim ${claimId}`);
      } else if (!autofillResult.success) {
        console.warn(`[AI Pipeline] Autofill warning for claim ${claimId}: ${autofillResult.error}`);
      }
    }

    // Dynamically import to avoid circular dependencies
    const { generateClaimBriefing } = await import('./claimBriefingService');
    const { startFlowForClaim, getCurrentFlow } = await import('./flowEngineService');

    // Step 1: Generate briefing (if FNOL, policy, or endorsement was just processed)
    console.log(`[AI Pipeline] Generating briefing for claim ${claimId}...`);
    const briefingResult = await generateClaimBriefing(claimId, organizationId, false);

    if (briefingResult.success) {
      console.log(`[AI Pipeline] Briefing generated successfully for claim ${claimId}`);

      // Step 2: Start inspection flow (replaces old workflow generation)
      // First check if flow already exists
      const existingFlow = await getCurrentFlow(claimId);
      if (!existingFlow) {
        // Get claim to determine peril type
        const { data: claim } = await supabaseAdmin
          .from('claims')
          .select('primary_peril')
          .eq('id', claimId)
          .single();

        const perilType = claim?.primary_peril || 'general';
        console.log(`[AI Pipeline] Starting inspection flow for claim ${claimId} with peril type: ${perilType}...`);

        try {
          const flowInstanceId = await startFlowForClaim(claimId, perilType);
          console.log(`[AI Pipeline] Inspection flow started successfully for claim ${claimId}, flow instance: ${flowInstanceId}`);
        } catch (flowError) {
          // Flow may fail if no flow definition exists for this peril type - that's ok
          console.warn(`[AI Pipeline] Flow start skipped for claim ${claimId}:`, flowError instanceof Error ? flowError.message : flowError);
        }
      } else {
        console.log(`[AI Pipeline] Flow already exists for claim ${claimId}, skipping flow creation`);
      }
    } else {
      console.warn(`[AI Pipeline] Briefing generation failed for claim ${claimId}:`, briefingResult.error);
    }
  } catch (error) {
    console.error(`[AI Pipeline] Error in auto-generation for claim ${claimId}:`, error);
  }
}

const execFileAsync = promisify(execFile);

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
 * Handles formats like:
 * - "$500,000"
 * - "500000"
 * - "$1,000.00"
 * - "Personal Property $187,900" (extracts the dollar amount)
 * - "Loss Of Use $94,000" (extracts the dollar amount)
 * Returns null if parsing fails or no dollar amount found
 */
function parseCurrencyToNumber(value: string | null | undefined): number | null {
  if (!value) return null;

  // First, try to extract a dollar amount using regex
  // This handles cases like "Personal Property $187,900" or "$469,600"
  const dollarMatch = value.match(/\$[\d,]+(?:\.\d{2})?/);

  let amountStr: string;
  if (dollarMatch) {
    // Found a dollar amount - use it
    amountStr = dollarMatch[0];
  } else {
    // No dollar sign - check if it's a pure number
    amountStr = value;
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();

  // If it contains non-numeric chars (except decimal point), return null
  if (!/^[\d.]+$/.test(cleaned)) return null;

  // Parse the number
  const parsed = parseFloat(cleaned);

  // Return null if not a valid number
  if (isNaN(parsed) || !isFinite(parsed)) return null;

  // Return the parsed value (rounded to 2 decimal places for currency)
  return Math.round(parsed * 100) / 100;
}

/**
 * Parse address string to extract city, state, and zip
 * Handles formats like "897 E DIABERLVILLE St, Dodgeville, WI 53533-1427"
 */
function parseAddressParts(address: string | null | undefined): { city: string | null; state: string | null; zip: string | null } {
  if (!address) return { city: null, state: null, zip: null };

  // Try to match common address patterns
  // Pattern: "..., City, ST ZIPCODE" or "..., City, ST ZIPCODE-XXXX"
  const match = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);

  if (match) {
    return {
      city: match[1].trim(),
      state: match[2].toUpperCase(),
      zip: match[3],
    };
  }

  // Fallback: try to extract just state and zip from the end
  const stateZipMatch = address.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i);
  if (stateZipMatch) {
    return {
      city: null,
      state: stateZipMatch[1].toUpperCase(),
      zip: stateZipMatch[2],
    };
  }

  return { city: null, state: null, zip: null };
}

/**
 * Parse date string to ISO format for database storage
 * Handles formats like:
 * - "04/18/2025 @ 9:00 AM"
 * - "04/18/2025"
 * - "2025-04-18T09:00:00Z"
 * - "01-01-2006"
 */
function parseDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  // If already in ISO format, return as-is (just the date part)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr.split('T')[0];
  }

  // Handle "MM/DD/YYYY @ TIME" or "MM/DD/YYYY"
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle "MM-DD-YYYY"
  const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashMatch) {
    const [, month, day, year] = dashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try native Date parsing as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
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
 * This captures 100% of data from FNOL/Claim Information Reports.
 * No data loss - every field in the source document is preserved.
 */
export interface FNOLExtraction {
  // ============================================
  // CLAIM INFORMATION REPORT
  // ============================================
  claim_information_report: {
    claim_number: string;                    // "01-002-161543 (CAT-PCS2532-2532)"
    date_of_loss: string;                    // "04/18/2025 @ 9:00 AM"
    policy_number?: string;                  // "735886411388"
    policyholders?: string[];                // ["DANNY DIKKER", "LEANN DIKKER"]
    claim_status?: string;                   // "Open"
    operating_company?: string;              // "American Family Insurance"
    loss_details: {
      cause: string;                         // "Hail"
      location?: string;                     // Full property address
      description?: string;                  // "hail damage to roof and soft metals."
      weather_data_status?: string;          // "Unable to retrieve Weather Data from Decision Hub."
      drone_eligible_at_fnol?: string;       // "Yes" | "No"
    };
  };

  // ============================================
  // INSURED INFORMATION
  // ============================================
  insured_information: {
    name_1?: string;                         // "DANNY DIKKER"
    name_1_address?: string;                 // "329 W Division St, Dodgeville, WI 53533-1427"
    name_2?: string;                         // "LEANN DIKKER"
    name_2_address?: string;                 // "329 W Division St, Dodgeville, WI 53533"
    email?: string;                          // Contact email
    phone?: string;                          // Contact phone
  };

  // ============================================
  // PROPERTY DAMAGE INFORMATION
  // ============================================
  property_damage_information: {
    dwelling_incident_damages?: string;      // "hail damage to roof and soft metals."
    roof_damage?: string;                    // "Yes (Exterior Only)"
    exterior_damages?: string;               // "Yes"
    interior_damages?: string;               // "Yes" | "No"
    number_of_stories?: number;              // 2
    wood_roof?: string;                      // "Yes" | "No"
    year_roof_installed?: string;            // "01-01-2006"
    year_built?: string;                     // "01-01-1917"
  };

  // ============================================
  // POLICY INFORMATION
  // ============================================
  policy_information: {
    producer?: {
      name?: string;                         // "Anthonie Rose"
      address?: string;                      // "597 S TEXAS ST, DODGEVILLE, WI 53533-1547"
      phone?: string;                        // "(608) 555-32716"
      email?: string;                        // "radler1@amfam.com"
    };
    risk_address?: string;                   // "897 E DIABERLVILLE St, Dodgeville, WI 53533-1427"
    policy_type?: string;                    // "Homeowners"
    status?: string;                         // "In force"
    inception_date?: string;                 // "01/22/2018"
    expiration_date?: string;                // Policy expiration
    legal_description?: string;              // "No Legal Description for this Policy"
    third_party_interest?: string;           // "FISHERS SAVINGS BANK ITS SUCCESSORS AND/OR ASSIGNS"
    line_of_business?: string;               // "Homeowners Line"
    deductibles?: {
      policy_deductible?: string;            // "$2,348 (0%)"
      wind_hail_deductible?: string;         // "$4,696 (1%)"
      hurricane_deductible?: string;
      flood_deductible?: string;
      earthquake_deductible?: string;
      [key: string]: string | undefined;     // Allow other deductible types
    };
  };

  // ============================================
  // POLICY LEVEL ENDORSEMENTS
  // ============================================
  policy_level_endorsements?: Array<{
    code: string;                            // "HO 04 16"
    description: string;                     // "Premises Alarm Or Fire Protection System"
  }>;

  // ============================================
  // POLICY COVERAGE
  // ============================================
  policy_coverage?: {
    location?: string;                       // "897 E DIABERLVILLE St, Dodgeville, WI 53533-1427"
    coverages?: {
      coverage_a_dwelling?: {
        limit?: string;                      // "$469,600"
        percentage?: string;                 // "100%"
        valuation_method?: string;           // "Replacement Cost Value"
      };
      coverage_b_scheduled_structures?: {
        limit?: string;                      // "$55,900"
        item?: string;                       // "Garage - Detached without Living Quarters"
        article_number?: string;             // "2339053"
        valuation_method?: string;
      };
      coverage_b_unscheduled_structures?: {
        limit?: string;                      // "$5,000"
        valuation_method?: string;
      };
      coverage_c_personal_property?: {
        limit?: string;                      // "$187,900"
        percentage?: string;                 // "40%"
      };
      coverage_d_loss_of_use?: {
        limit?: string;                      // "$94,000"
        percentage?: string;                 // "20%"
      };
      coverage_e_personal_liability?: {
        limit?: string;                      // "$300,000"
      };
      coverage_f_medical_expense?: {
        limit?: string;                      // "$2,000"
      };
      // Additional coverages
      [key: string]: {
        limit?: string;
        percentage?: string;
        valuation_method?: string;
        item?: string;
        article_number?: string;
      } | undefined;
    };
  };

  // ============================================
  // REPORT METADATA
  // ============================================
  report_metadata?: {
    reported_by?: string;                    // "Jose Smith"
    report_method?: string;                  // "Phone (773) 555-2212"
    reported_date?: string;                  // "08/11/2025"
    entered_date?: string;                   // "08/11/2025"
    report_source?: string;                  // "Mobile App" | "Phone" | "Agent" | etc.
  };
}

/**
 * Loss Context structure - stored in claims.loss_context
 * This is the COMPLETE FNOLExtraction - no data filtering.
 * 100% of extracted FNOL data is preserved here.
 */
export type LossContext = FNOLExtraction;

/**
 * AUTHORITATIVE Policy Form Extraction Interface
 * This captures 100% of data from policy forms.
 * No data loss - every field in the source document is preserved.
 */
export interface PolicyFormExtraction {
  // Document metadata
  document_info?: {
    form_number?: string;                    // "HO 80 03 01 14"
    form_name?: string;                      // "HOMEOWNERS FORM"
    total_pages?: number;
    copyright?: string;
    execution?: {
      location?: string;
      signatories?: string[];
    };
  };

  // Table of contents with page numbers
  table_of_contents?: Record<string, number>;

  // Agreement and definitions section
  agreement_and_definitions?: {
    policy_components?: string[];
    key_definitions?: Record<string, string>;
  };

  // Section I - Property Coverages
  section_I_property_coverages?: {
    coverage_a_dwelling?: {
      included?: string[];
      excluded?: string[];
    };
    coverage_b_other_structures?: {
      definition?: string;
      excluded_types?: string[];
    };
    coverage_c_personal_property?: {
      scope?: string;
      limit_away_from_premises?: string;
      special_limits_of_liability?: Record<string, number | string>;
    };
    coverage_d_loss_of_use?: {
      additional_living_expense?: string;
      civil_authority_prohibits_use?: string;
    };
  };

  // Section I - Perils
  section_I_perils_insured_against?: {
    personal_property_perils?: string[];
    dwelling_perils?: string[];
  };

  // Section I - Exclusions
  section_I_exclusions?: {
    general_exclusions?: string[];
  };

  // Section I - Additional Coverages
  section_I_additional_coverages?: Record<string, string | number>;

  // Section I - Loss Settlement
  section_I_how_we_settle_losses?: {
    dwelling_and_other_structures?: {
      initial_payment?: string;
      replacement_cost?: string;
      hail_damage_metal_siding?: string;
    };
    roofing_system?: {
      settlement_method?: string;
      cosmetic_exclusion?: string;
    };
  };

  // Section II - Liability Coverages
  section_II_liability_coverages?: {
    coverage_e_personal_liability?: string;
    coverage_f_medical_expense?: string;
    liability_exclusions?: string[];
  };

  // General Conditions
  general_conditions?: Record<string, string>;

  // Property Characteristics (from Declarations if present)
  property_characteristics?: {
    year_built?: string;
    construction_type?: string;
    roof_year?: string;
    square_footage?: number;
    occupancy_type?: string;
  };

  // Legacy fields for backward compatibility
  form_code?: string;
  form_name?: string;
  edition_date?: string;
  jurisdiction?: string;
  structure?: {
    definitions?: Record<string, { definition: string; depreciation_includes?: string[] }>;
    coverages?: Record<string, { name?: string; valuation?: string; includes?: string[] }>;
    perils?: { coverage_a_b?: string; coverage_c_named?: string[] };
    exclusions?: string[];
    conditions?: string[];
    loss_settlement?: { default?: { basis?: string; repair_time_limit_months?: number } };
    additional_coverages?: string[];
  };
  raw_text?: string;
}

/**
 * AUTHORITATIVE Endorsement Extraction Interface
 * This captures 100% of data from endorsement documents.
 * No data loss - every modification and schedule is preserved.
 *
 * The structure uses endorsement name as key to allow flexible extraction
 * of any endorsement type with its specific modifications.
 */
export interface EndorsementExtraction {
  // Form identification
  form_number?: string;                      // "HO 81 53 12 22"
  purpose?: string;                          // Purpose of the endorsement

  // Definition modifications
  definitions_modified?: Record<string, {
    definition?: string;
    depreciable_components?: string[];
    factors_considered?: string[];
  } | string>;

  // Property coverage changes
  property_coverage_changes?: {
    excluded_property_additions?: string[];
    uninhabited_thresholds?: string;
    loss_of_use_deductible?: string;
    intentional_act_exception?: string;
    [key: string]: string | string[] | undefined;
  };

  // Settlement and conditions
  settlement_and_conditions?: {
    total_loss_provision?: string;
    loss_payment_timing?: string;
    cancellation_notice?: Record<string, string>;
    nonrenewal_notice?: string;
    [key: string]: string | Record<string, string> | undefined;
  };

  // Liability modifications
  liability_modifications?: Record<string, string>;

  // Roof surface payment schedule (for HO 88 02)
  scope?: string;
  settlement_calculation?: string;
  hail_functional_requirement?: string;
  roof_surface_payment_schedule_examples?: {
    description?: string;
    [key: string]: Record<string, string> | string | undefined;
  };
  complete_schedule?: Array<{
    roof_age_years?: number;
    architectural_shingle_pct?: number;
    other_composition_pct?: number;
    metal_pct?: number;
    tile_pct?: number;
    slate_pct?: number;
    wood_pct?: number;
    rubber_pct?: number;
    [key: string]: number | undefined;
  }>;

  // O&L Coverage (for HO 84 16)
  coverage_a_increased_cost?: string;
  coverage_b_demolition_cost?: string;
  coverage_c_increased_construction_cost?: string;

  // Personal Property RCV (for HO 04 90)
  settlement_basis?: string;
  conditions?: string[];

  // Legacy fields for backward compatibility
  form_code?: string;
  title?: string;
  edition_date?: string;
  jurisdiction?: string;
  applies_to_forms?: string[];
  applies_to_coverages?: string[];
  endorsement_type?: string;
  precedence_priority?: number;
  modifications?: {
    definitions?: { added?: Array<{ term: string; definition: string }>; deleted?: string[]; replaced?: Array<{ term: string; new_definition: string }> };
    loss_settlement?: { replaces?: Array<{ section: string; new_rule: { basis?: string; repair_time_limit_months?: number; fallback_basis?: string; conditions?: string[] } }> };
    exclusions?: { added?: string[]; deleted?: string[] };
  };
  tables?: Array<{ table_type: string; applies_when?: { peril?: string; coverage?: string[] }; data?: Record<string, unknown>; schedule?: any[] }>;
  raw_text?: string;
}

/**
 * Container for multiple endorsement extractions
 * Each key is the endorsement name/type
 */
export type EndorsementExtractionSet = Record<string, EndorsementExtraction>;

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

/**
 * Extract raw text from PDF using pdftotext
 * Returns array of text per page
 */
async function extractRawTextFromPDF(pdfPath: string): Promise<{ fullText: string; pageTexts: string[]; pageCount: number }> {
  try {
    // Get page count first
    let pageCount = 1;
    try {
      const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
      const pageMatch = stdout.match(/Pages:\s*(\d+)/);
      if (pageMatch) {
        pageCount = parseInt(pageMatch[1]);
      }
    } catch (e) {
      console.warn('[extractRawTextFromPDF] Could not get PDF page count, defaulting to 1');
    }

    // Extract text per page
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const { stdout } = await execFileAsync('pdftotext', ['-f', String(pageNum), '-l', String(pageNum), pdfPath, '-']);
        pageTexts.push(stdout || '');
      } catch (e) {
        console.warn(`[extractRawTextFromPDF] Failed to extract text from page ${pageNum}`);
        pageTexts.push('');
      }
    }

    const fullText = pageTexts.join('\n\n--- Page Break ---\n\n');
    return { fullText, pageTexts, pageCount };
  } catch (error) {
    console.error('[extractRawTextFromPDF] Error:', error);
    return { fullText: '', pageTexts: [], pageCount: 0 };
  }
}

async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const baseName = path.basename(pdfPath, '.pdf').replace(/[^a-zA-Z0-9-_]/g, '_');
  const timestamp = Date.now();
  const outputPrefix = path.join(TEMP_DIR, `${baseName}-${timestamp}`);

  try {
    await execFileAsync('pdftoppm', ['-png', '-r', '200', pdfPath, outputPrefix]);
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
  // OpenAI returns the new comprehensive structure directly (snake_case)
  // This captures 100% of FNOL data

  const extraction: FNOLExtraction = {
    claim_information_report: raw.claim_information_report || {
      claim_number: '',
      date_of_loss: '',
      loss_details: { cause: '' },
    },
    insured_information: raw.insured_information || {},
    property_damage_information: raw.property_damage_information || {},
    policy_information: raw.policy_information || {},
    policy_level_endorsements: raw.policy_level_endorsements || [],
    policy_coverage: raw.policy_coverage || {},
    report_metadata: raw.report_metadata || {},
  };

  // Validate required fields
  const claimNum = extraction.claim_information_report.claim_number;
  const dateOfLoss = extraction.claim_information_report.date_of_loss;
  const insuredName = extraction.insured_information.name_1;

  if (!claimNum && !dateOfLoss && !insuredName) {
    console.warn('[FNOL Transform] Missing critical fields:', {
      claim_number: claimNum,
      date_of_loss: dateOfLoss,
      name_1: insuredName,
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
  // Return the COMPLETE extraction - no filtering.
  // 100% of FNOL data is preserved in loss_context.
  return extraction;
}

/**
 * Validate FNOL extraction - fail loudly if malformed
 */
function validateFNOLExtraction(extraction: FNOLExtraction): void {
  const claimNum = extraction.claim_information_report?.claim_number;
  const dateOfLoss = extraction.claim_information_report?.date_of_loss;
  const insuredName = extraction.insured_information?.name_1;

  if (!claimNum && !dateOfLoss && !insuredName) {
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
    property_characteristics: raw.property_characteristics,
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
  organizationId: string,
  rawOpenaiResponse?: any
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
    // Raw OpenAI response - stored BEFORE any transformation for debugging/auditing
    raw_openai_response: rawOpenaiResponse || null,
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
 * Extract additional fields from AI output that aren't part of the base schema
 * This preserves data like definitions_modified, property_coverage_changes, complete_schedule, etc.
 */
function extractAdditionalFields(e: any): Partial<EndorsementExtraction> {
  const baseFields = [
    'form_code', 'form_number', 'title', 'purpose', 'edition_date', 'jurisdiction',
    'applies_to_forms', 'applies_to_coverages', 'endorsement_type', 'precedence_priority',
    'modifications', 'tables', 'raw_text', '_endorsement_key'
  ];

  const additional: Partial<EndorsementExtraction> = {};

  for (const [key, value] of Object.entries(e)) {
    if (!baseFields.includes(key) && value !== null && value !== undefined) {
      (additional as any)[key] = value;
    }
  }

  return additional;
}

/**
 * Transform raw AI extraction to strict EndorsementExtraction[]
 * Rules:
 * - Delta-only extraction (what the endorsement changes)
 * - NEVER reprint base policy language
 * - NEVER merge with other endorsements
 * - Missing data remains NULL
 *
 * Handles two AI output formats:
 * 1. Object with endorsement names as keys: { "wisconsin_amendatory": { "form_number": "HO 81 53", ... } }
 * 2. Array format: { "endorsements": [{ "form_code": "HO 81 53", ... }] }
 */
function transformToEndorsementExtraction(raw: any, documentFullText?: string | null): EndorsementExtraction[] {
  // Use document's full text as fallback if available, otherwise try raw extraction
  const fullTextFallback = documentFullText || raw.full_text || raw.fullText || '';

  // Handle AI output format: object with endorsement names as keys
  // The AI prompt returns: { "wisconsin_amendatory_endorsement": {...}, "roof_surface_payment_schedule": {...} }
  let endorsements: any[];

  if (raw.endorsements && Array.isArray(raw.endorsements)) {
    // New array format (if provided)
    endorsements = raw.endorsements;
  } else {
    // Object format: convert object keys to array of endorsement objects
    // Skip internal fields like fullText, pageTexts, full_text, _progress
    const internalKeys = ['fullText', 'pageTexts', 'full_text', '_progress', 'pageText'];
    endorsements = Object.entries(raw)
      .filter(([key, value]) => !internalKeys.includes(key) && typeof value === 'object' && value !== null)
      .map(([endorsementName, data]: [string, any]) => ({
        ...data,
        _endorsement_key: endorsementName, // Preserve the key name for reference
      }));

    // If no endorsements found using object keys, fall back to wrapping raw
    if (endorsements.length === 0) {
      endorsements = [raw];
    }
  }

  console.log(`[Endorsement Transform] Found ${endorsements.length} endorsement(s) to process`);

  // Transform each endorsement entry - canonical structure only
  const transformed = endorsements.map((e: any) => {
    // Handle both form_code and form_number (AI prompt uses form_number)
    const formCode = e.form_code || e.form_number || '';
    // Use endorsement key name as title fallback if no explicit title
    const title = e.title || e.purpose || e._endorsement_key?.replace(/_/g, ' ') || '';

    const extraction: EndorsementExtraction = {
      form_code: formCode,
      title: title,
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
      // Preserve all other extracted fields in the extraction object
      // This ensures data like definitions_modified, property_coverage_changes, etc. are kept
      ...extractAdditionalFields(e),
    };

    console.log(`[Endorsement Transform] Processed: form_code="${formCode}", title="${title}"`);

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
  documentId?: string,
  rawOpenaiResponse?: any,
  documentFullText?: string | null
): Promise<void> {
  console.log(`[storeEndorsements] Processing ${extractions.length} endorsement(s) for claim ${claimId}`);

  for (let i = 0; i < extractions.length; i++) {
    const endorsement = extractions[i];
    let formCode = endorsement.form_code;

    // If no form_code, try to generate one from title or use a fallback
    if (!formCode) {
      if (endorsement.title) {
        // Generate form code from title (e.g., "Wisconsin Amendatory Endorsement" -> "WISCONSIN_AMENDATORY")
        formCode = endorsement.title
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        console.log(`[storeEndorsements] Generated form_code "${formCode}" from title for endorsement ${i + 1}`);
      } else {
        // Use document-based fallback
        formCode = `ENDORSEMENT_${documentId || 'UNKNOWN'}_${i + 1}`;
        console.log(`[storeEndorsements] Using fallback form_code "${formCode}" for endorsement ${i + 1} (no form_code or title)`);
      }
    }

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

    // Use document's full text as fallback for raw_text if endorsement doesn't have it
    const rawText = endorsement.raw_text || documentFullText || null;
    
    // Extract jurisdiction and edition_date from extraction_data if not already set
    const extractionData = endorsement as any;
    const jurisdiction = endorsement.jurisdiction || extractionData.jurisdiction || null;
    const editionDate = endorsement.edition_date || extractionData.edition_date || null;

    const extractionRow = {
      organization_id: organizationId,
      claim_id: claimId,
      document_id: documentId || null,
      form_code: formCode,
      title: endorsement.title || null,
      edition_date: editionDate,
      jurisdiction: jurisdiction,
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
      raw_text: rawText,
      // Raw OpenAI response - stored BEFORE any transformation for debugging/auditing
      raw_openai_response: rawOpenaiResponse || null,
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

  // Extract raw text from PDF FIRST (before AI processing)
  console.log(`[extractFromPDF] Extracting raw text from PDF: ${filePath}`);
  const rawTextData = await extractRawTextFromPDF(filePath);
  console.log(`[extractFromPDF] Extracted ${rawTextData.pageCount} pages, ${rawTextData.fullText.length} chars total`);

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

    // Use extracted raw text instead of AI response (AI doesn't return raw text)
    merged.pageTexts = rawTextData.pageTexts.length > 0 ? rawTextData.pageTexts : pageTexts;
    merged.fullText = rawTextData.fullText || pageTexts.join('\n\n--- Page Break ---\n\n');
    merged.pageCount = rawTextData.pageCount || imagePaths.length;

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
        // Images don't have multiple pages or extractable text
        rawExtraction.pageCount = 1;
        rawExtraction.pageTexts = [];
        rawExtraction.fullText = null;
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
        // Also store _raw_openai_response for passing to claims table later
        const finalExtractedData = existingProgress
          ? { ...fnolExtraction, _progress: { ...existingProgress, stage: 'completed' }, _raw_openai_response: rawExtraction }
          : { ...fnolExtraction, _raw_openai_response: rawExtraction };

        // Determine category and description from extracted data
        const category = 'fnol'; // FNOL documents are always 'fnol' category
        const description = fnolExtraction.claim_information_report?.claim_number 
          ? `FNOL for claim ${fnolExtraction.claim_information_report.claim_number}`
          : 'First Notice of Loss document';

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalExtractedData,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            page_count: rawExtraction.pageCount || null,
            category: category,
            description: description,
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

        // Auto-trigger AI generation pipeline if claim already exists
        // (If claim was just created, pipeline is triggered in createClaimFromDocuments)
        if (claimId) {
          // Auto-trigger AI generation pipeline (async, non-blocking)
          triggerAIGenerationPipeline(claimId, organizationId, 'fnol').catch(err => {
            console.error('[AI Pipeline] Background error:', err);
          });
        }

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

        // Determine category and description from extracted data
        const category = 'policy'; // Policy documents
        const description = policyExtraction.form_code 
          ? `${policyExtraction.form_name || 'Policy Form'} (${policyExtraction.form_code})`
          : policyExtraction.form_name || 'Policy document';

        console.log(`[Policy] Updating documents table with extracted_data...`);
        const { error: docUpdateError } = await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalPolicyData,
            full_text: rawExtraction.fullText || rawExtraction.full_text || policyExtraction.raw_text || null,
            page_texts: rawExtraction.pageTexts || [],
            page_count: rawExtraction.pageCount || null,
            category: category,
            description: description,
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
        await storePolicy(policyExtraction, documentId, claimIdToUse, organizationId, rawExtraction);
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

        // Get document's full_text to use as raw_text fallback for endorsements
        const { data: docData } = await supabaseAdmin
          .from('documents')
          .select('full_text')
          .eq('id', documentId)
          .single();
        
        const endorsementExtractions = transformToEndorsementExtraction(
          rawExtraction,
          docData?.full_text || rawExtraction.fullText || null
        );

        console.log(`[Endorsement] Transformed ${endorsementExtractions.length} endorsement(s)`);
        for (const e of endorsementExtractions) {
          console.log(`[Endorsement]   - ${e.form_code}: title="${e.title}", raw_text=${e.raw_text?.length || 0} chars, tables=${e.tables?.length || 0}, modifications keys=${Object.keys(e.modifications || {}).join(',') || 'none'}`);
        }

        // Store endorsement extractions as proper array with metadata wrapper
        // This preserves the array structure while allowing _progress tracking
        const finalEndorsementData = existingProgress
          ? { endorsements: endorsementExtractions, _progress: { ...existingProgress, stage: 'completed' } }
          : { endorsements: endorsementExtractions };

        // Determine category and description from extracted data
        const category = 'endorsement'; // Endorsement documents
        const firstEndorsement = endorsementExtractions[0];
        const description = firstEndorsement?.form_code 
          ? `${firstEndorsement.title || 'Endorsement'} (${firstEndorsement.form_code})`
          : firstEndorsement?.title || 'Endorsement document';

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: finalEndorsementData,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            page_count: rawExtraction.pageCount || null,
            category: category,
            description: description,
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
          // Get document's full_text to use as raw_text fallback for endorsements
          const { data: docData } = await supabaseAdmin
            .from('documents')
            .select('full_text')
            .eq('id', documentId)
            .single();
          
          await storeEndorsements(
            endorsementExtractions, 
            claimIdToUse, 
            organizationId, 
            documentId, 
            rawExtraction,
            docData?.full_text || rawExtraction.fullText || null
          );

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
/**
 * Determine carrier ID for a claim
 * Priority: 1. Policy info carrier, 2. Organization default carrier, 3. DEFAULT profile
 */
async function determineCarrierId(
  organizationId: string,
  policyInfo?: any
): Promise<string | null> {
  // 1. Check if policy info contains carrier information
  if (policyInfo?.carrier_id) {
    return policyInfo.carrier_id;
  }
  if (policyInfo?.carrier_name || policyInfo?.carrier_code) {
    // Try to find carrier by name or code
    const carrierName = policyInfo.carrier_name;
    const carrierCode = policyInfo.carrier_code;
    
    if (carrierCode) {
      const { data: carrier } = await supabaseAdmin
        .from('carrier_profiles')
        .select('id')
        .eq('code', carrierCode)
        .eq('is_active', true)
        .single();
      
      if (carrier) {
        return carrier.id;
      }
    }
    
    if (carrierName) {
      const { data: carrier } = await supabaseAdmin
        .from('carrier_profiles')
        .select('id')
        .ilike('name', `%${carrierName}%`)
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (carrier) {
        return carrier.id;
      }
    }
  }
  
  // 2. Check organization settings for default carrier
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single();
  
  if (org?.settings?.defaultCarrierId) {
    return org.settings.defaultCarrierId;
  }
  
  // 3. Fall back to DEFAULT carrier profile
  const { data: defaultCarrier } = await supabaseAdmin
    .from('carrier_profiles')
    .select('id')
    .eq('code', 'DEFAULT')
    .eq('is_active', true)
    .single();
  
  return defaultCarrier?.id || null;
}

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

  // Extract raw OpenAI response stored during document processing
  const rawOpenaiResponse = extractedData._raw_openai_response || null;

  // Check if already in FNOLExtraction format (new comprehensive structure)
  if (extractedData.claim_information_report && extractedData.insured_information) {
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
  if (!lossContext.claim_information_report && !lossContext.insured_information) {
    throw new Error('FNOL ingestion failed: loss_context is empty or malformed');
  }

  // Extract fields from new comprehensive structure
  const claimInfo = fnolExtraction.claim_information_report;
  const insuredInfo = fnolExtraction.insured_information;
  const propertyDamageInfo = fnolExtraction.property_damage_information;
  const policyInfo = fnolExtraction.policy_information;
  const policyCoverage = fnolExtraction.policy_coverage;
  const endorsements = fnolExtraction.policy_level_endorsements;

  // Generate claim number (strip CAT code suffix for database storage, but preserve in loss_context)
  const rawClaimNumber = claimInfo.claim_number || '';
  const claimNumber = rawClaimNumber.split(' ')[0] || await generateClaimId(organizationId);

  // Extract catastrophe number from claim number (e.g., "01-002-161543 (CAT-PCS2532-2532)")
  const catastropheNumber = extractCatastropheNumber(rawClaimNumber);
  if (catastropheNumber) {
    console.log(`[FNOL] Extracted catastrophe number: ${catastropheNumber}`);
  }

  // Build insured name from name_1 and name_2
  const insuredName = [insuredInfo.name_1, insuredInfo.name_2]
    .filter(Boolean)
    .join(' ') || null;

  // Parse property address - use risk_address from policy_information or loss_details.location
  const propertyAddress = policyInfo?.risk_address || claimInfo.loss_details?.location || null;

  // Parse city, state, zip from address if available
  const addressParts = parseAddressParts(propertyAddress);

  // PERIL NORMALIZATION
  const perilInput: PerilInferenceInput = {
    causeOfLoss: claimInfo.loss_details?.cause || '',
    lossDescription: claimInfo.loss_details?.description || '',
  };

  const perilInference = inferPeril(perilInput);

  console.log(`[Peril Normalization] Claim ${claimNumber}:`, {
    primaryPeril: perilInference.primaryPeril,
    secondaryPerils: perilInference.secondaryPerils,
    confidence: perilInference.confidence,
  });

  // Extract coverage limits from policy_coverage
  const coverages = policyCoverage?.coverages || {};
  const coverageALimit = coverages.coverage_a_dwelling?.limit;
  const coverageBScheduled = coverages.coverage_b_scheduled_structures?.limit;
  const coverageBUnscheduled = coverages.coverage_b_unscheduled_structures?.limit;
  const coverageCLimit = coverages.coverage_c_personal_property?.limit;
  const coverageDLimit = coverages.coverage_d_loss_of_use?.limit;

  // Parse coverage A to numeric for dwelling_limit
  const coverageANumeric = parseCurrencyToNumber(coverageALimit);

  // Format dwelling_limit as currency string (e.g., "$793,200")
  const dwellingLimit = coverageANumeric 
    ? `$${coverageANumeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : null;

  // Determine region_id from zip code
  let regionId: string | null = null;
  if (addressParts.zip) {
    try {
      const region = await getRegionByZip(addressParts.zip);
      regionId = region?.id || null;
    } catch (error) {
      console.log(`[ClaimCreation] Failed to get region for zip ${addressParts.zip}:`, error);
    }
  }
  // Fallback to US-NATIONAL if no region found
  if (!regionId) {
    regionId = 'US-NATIONAL';
  }

  // Map primary_peril to legacy loss_type for backward compatibility
  const lossTypeMap: Record<string, string> = {
    'wind_hail': 'Hail',
    'fire': 'Fire',
    'water': 'Water',
    'flood': 'Flood',
    'smoke': 'Smoke',
    'mold': 'Mold',
    'impact': 'Impact',
    'other': 'Other'
  };
  const lossType = lossTypeMap[perilInference.primaryPeril] || perilInference.primaryPeril;

  // Debug: Log policy values being stored
  console.log(`[ClaimCreation] Policy values for claim ${claimNumber}:`, {
    coverageA: coverageALimit || null,
    coverageB: coverageBScheduled || coverageBUnscheduled || null,
    coverageC: coverageCLimit || null,
    coverageD: coverageDLimit || null,
    policyNumber: claimInfo.policy_number || null,
    deductibles: policyInfo?.deductibles || null,
    dwellingLimit,
    regionId,
    lossType,
  });

  // Build peril-specific deductibles from policy_information.deductibles
  const perilDeductibles: Record<string, string> = {};
  if (policyInfo?.deductibles) {
    if (policyInfo.deductibles.wind_hail_deductible) {
      perilDeductibles.wind_hail = policyInfo.deductibles.wind_hail_deductible;
    }
    if (policyInfo.deductibles.hurricane_deductible) {
      perilDeductibles.hurricane = policyInfo.deductibles.hurricane_deductible;
    }
    if (policyInfo.deductibles.flood_deductible) {
      perilDeductibles.flood = policyInfo.deductibles.flood_deductible;
    }
    if (policyInfo.deductibles.earthquake_deductible) {
      perilDeductibles.earthquake = policyInfo.deductibles.earthquake_deductible;
    }
  }

  // CREATE CLAIM - COMPREHENSIVE MAPPING FROM NEW STRUCTURE
  const { data: newClaim, error: claimError } = await supabaseAdmin
    .from('claims')
    .insert({
      organization_id: organizationId,
      claim_number: claimNumber,

      // Policy number from FNOL
      policy_number: claimInfo.policy_number || null,

      // Insured info
      insured_name: insuredName,
      insured_phone: insuredInfo.phone || null,
      insured_email: insuredInfo.email || null,

      // Property address
      property_address: propertyAddress,
      property_city: addressParts.city || null,
      property_state: addressParts.state || null,
      property_zip: addressParts.zip || null,

      // Loss details
      date_of_loss: parseDateString(claimInfo.date_of_loss) || null,
      primary_peril: perilInference.primaryPeril,
      loss_type: lossType, // Legacy field for backward compatibility
      loss_description: claimInfo.loss_details?.description || null,

      // Carrier/Region
      // Determine carrier ID: check policy info first, then organization default, then DEFAULT profile
      carrier_id: await determineCarrierId(organizationId, policyInfo),
      region_id: regionId,

      // Deductibles - both base and peril-specific
      deductible: parseCurrencyToNumber(policyInfo?.deductibles?.policy_deductible),
      peril_specific_deductibles: perilDeductibles,

      // Coverage amounts (numeric) - parsed from policy_coverage limits
      coverage_a: coverageANumeric,
      coverage_b: parseCurrencyToNumber(coverageBScheduled) || parseCurrencyToNumber(coverageBUnscheduled),
      coverage_c: parseCurrencyToNumber(coverageCLimit),
      coverage_d: parseCurrencyToNumber(coverageDLimit),

      // Dwelling limit (formatted currency string)
      dwelling_limit: dwellingLimit,

      // Endorsements from FNOL
      endorsements_listed: endorsements || [],

      // Peril inference
      secondary_perils: perilInference.secondaryPerils,
      peril_confidence: perilInference.confidence,
      peril_metadata: perilInference.perilMetadata,

      // LOSS CONTEXT - ALL FNOL TRUTH GOES HERE (100% of extracted data)
      loss_context: lossContext,

      // Raw OpenAI response - stored BEFORE any transformation for debugging/auditing
      raw_openai_response: rawOpenaiResponse,

      // Status
      status: 'fnol',

      // Metadata
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

  // Store catastrophe number if extracted
  if (catastropheNumber) {
    await storeCatastropheNumber(claimId, catastropheNumber);
  }

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
    if (endDoc.extracted_data) {
      const extractedData = endDoc.extracted_data as any;
      let extractions: EndorsementExtraction[];
      let endDocFullText: string | null | undefined = undefined; // Use undefined as sentinel for "not fetched yet"

      // Handle multiple formats:
      // 1. New wrapper format: { endorsements: [...], _progress: {...} }
      // 2. Direct array format: [...]
      // 3. Raw AI format: transform it
      if (extractedData.endorsements && Array.isArray(extractedData.endorsements)) {
        extractions = extractedData.endorsements;
      } else if (Array.isArray(extractedData)) {
        extractions = extractedData;
      } else {
        // Raw AI format - transform it
        // Get document's full_text to use as raw_text fallback
        const { data: endDocData } = await supabaseAdmin
          .from('documents')
          .select('full_text')
          .eq('id', endDoc.id)
          .single();
        
        endDocFullText = endDocData?.full_text || null; // null means fetched but no full_text
        extractions = transformToEndorsementExtraction(
          extractedData,
          endDocFullText
        );
      }

      if (extractions.length > 0) {
        // Fetch endDocFullText only if not already fetched (undefined means not fetched yet)
        if (endDocFullText === undefined) {
          const { data: endDocData } = await supabaseAdmin
            .from('documents')
            .select('full_text')
            .eq('id', endDoc.id)
            .single();
          endDocFullText = endDocData?.full_text || null;
        }
        
        await storeEndorsements(
          extractions, 
          claimId, 
          organizationId, 
          endDoc.id,
          undefined, // rawOpenaiResponse not available here
          endDocFullText
        );
        console.log(`[ClaimCreation] Stored ${extractions.length} endorsement extraction(s) for document ${endDoc.id}`);
      }
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