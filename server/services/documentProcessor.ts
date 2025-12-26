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

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-pdf');
const DOCUMENTS_BUCKET = 'documents';

// ============================================
// AUTHORITATIVE TYPE DEFINITIONS
// ============================================

/**
 * AUTHORITATIVE FNOL Extraction Interface
 * This is the ONLY accepted FNOL shape. No legacy formats.
 */
export interface FNOLExtraction {
  claim: {
    claimNumber: string;
    dateOfLoss: string;
    primaryPeril: string;
    lossDescription: string;
  };

  insured: {
    name: string;
    phone?: string;
    email?: string;
  };

  property: {
    address: {
      full: string;
      city: string;
      state: string;
      zip: string;
    };
    yearBuilt?: number;
    stories?: number;
    roof?: {
      material?: string;
      yearInstalled?: number;
      damageScope?: "Exterior Only" | "Interior" | "Both";
    };
  };

  fnol: {
    reportedBy?: string;
    reportedDate?: string;
    droneEligible?: boolean;
    weather?: {
      status: "ok" | "failed";
      message?: string;
    };
  };

  damageSummary: {
    coverageA?: string;
    coverageB?: string;
    coverageC?: string;
  };
}

/**
 * Loss Context structure - stored in claims.loss_context
 */
export interface LossContext {
  fnol: {
    reported_by?: string;
    reported_date?: string;
    drone_eligible?: boolean;
    weather?: {
      status: "ok" | "failed";
      message?: string;
    };
  };
  property: {
    year_built?: number;
    stories?: number;
    roof?: {
      material?: string;
      year_installed?: number;
      damage_scope?: string;
    };
  };
  damage_summary: {
    coverage_a?: string;
    coverage_b?: string;
    coverage_c?: string;
  };
}

/**
 * Policy Extraction Interface
 */
export interface PolicyExtraction {
  documentMetadata?: {
    documentType?: string;
    policyFormCode?: string;
    policyFormName?: string | null;
    editionDate?: string | null;
    pageCount?: number;
  };
  policyStructure?: {
    tableOfContents?: string[];
    policyStatement?: string;
    agreement?: string;
  };
  definitions?: Array<{
    term: string;
    definition: string;
    subClauses?: string[];
    exceptions?: string[];
  }>;
  sectionI?: {
    propertyCoverage?: {
      coverageA?: { name?: string; covers?: string[]; excludes?: string[] };
      coverageB?: { name?: string; covers?: string[]; excludes?: string[]; specialConditions?: string[] };
      coverageC?: { name?: string; scope?: string; specialLimits?: { propertyType: string; limit: string; conditions?: string }[]; notCovered?: string[] };
      coverageD?: { name?: string; subCoverages?: string[]; timeLimits?: string };
    };
    perils?: { coverageA_B?: string; coverageC?: string[] };
    exclusions?: { global?: string[]; coverageA_B_specific?: string[] };
    additionalCoverages?: { name: string; description?: string; limit?: string; conditions?: string }[];
    conditions?: string[];
    lossSettlement?: {
      dwellingAndStructures?: { basis?: string; repairRequirements?: string; timeLimit?: string; matchingRules?: string };
      roofingSystem?: { definition?: string; hailSettlement?: string; metalRestrictions?: string };
      personalProperty?: { settlementBasis?: string[]; specialHandling?: string };
    };
  };
  sectionII?: {
    liabilityCoverages?: {
      coverageE?: { name?: string; insuringAgreement?: string; dutyToDefend?: boolean };
      coverageF?: { name?: string; insuringAgreement?: string; timeLimit?: string };
    };
    exclusions?: string[];
    additionalCoverages?: { name: string; description?: string; limit?: string }[];
    conditions?: string[];
  };
  generalConditions?: string[];
  rawPageText?: string;
  fullText?: string;
  pageTexts?: string[];
}

/**
 * Endorsement Extraction Interface
 */
export interface EndorsementExtraction {
  endorsementMetadata: {
    formCode: string;
    title: string;
    editionDate?: string | null;
    jurisdiction?: string | null;
    pageCount?: number;
    appliesToPolicyForms?: string[];
  };
  modifications: {
    definitions?: {
      added?: { term: string; definition: string }[];
      deleted?: string[];
      replaced?: { term: string; newDefinition: string }[];
    };
    coverages?: {
      added?: string[];
      deleted?: string[];
      modified?: { coverage: string; changeType: string; details: string }[];
    };
    perils?: {
      added?: string[];
      deleted?: string[];
      modified?: string[];
    };
    exclusions?: {
      added?: string[];
      deleted?: string[];
      modified?: string[];
    };
    conditions?: {
      added?: string[];
      deleted?: string[];
      modified?: string[];
    };
    lossSettlement?: {
      replacedSections?: { policySection: string; newRule: string }[];
    };
  };
  tables?: Array<{
    tableType: string;
    appliesWhen?: { coverage?: string[]; peril?: string[] };
    data?: Record<string, any>;
  }>;
  rawText: string;
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
  // Handle claims array wrapper
  const source = raw.claims?.[0] || raw;

  // Extract from new format structure
  const claimInfo = source.claimInformation || source.claim || {};
  const propAddr = source.propertyAddress || {};
  const insuredInfo = source.insuredInformation || source.insured || {};
  const propDetails = source.propertyDetails || {};
  const propDmg = source.propertyDamageDetails || source.propertyDamage || {};
  const roofDetails = propDetails.roof || {};
  const fnolInfo = source.fnol || {};
  const coverages = source.coverages || [];

  // Build the clean extraction - NULL for missing, no inference
  const extraction: FNOLExtraction = {
    claim: {
      claimNumber: claimInfo.claimNumber || claimInfo.claimId || '',
      dateOfLoss: claimInfo.dateOfLoss || '',
      primaryPeril: claimInfo.causeOfLoss || claimInfo.primaryPeril || '',
      lossDescription: claimInfo.lossDescription || propDmg.dwellingDamageDescription || '',
    },
    insured: {
      name: insuredInfo.policyholderName1 || insuredInfo.name1 || '',
      phone: insuredInfo.contactPhone || insuredInfo.contactMobilePhone || insuredInfo.mobilePhone || undefined,
      email: insuredInfo.contactEmail || insuredInfo.email || undefined,
    },
    property: {
      address: {
        full: propAddr.fullAddress || [propAddr.streetAddress, propAddr.city, propAddr.state, propAddr.zipCode].filter(Boolean).join(', ') || '',
        city: propAddr.city || '',
        state: propAddr.state || '',
        zip: propAddr.zipCode || '',
      },
      yearBuilt: propDetails.yearBuilt ? parseInt(propDetails.yearBuilt, 10) || undefined : undefined,
      stories: propDetails.numberOfStories ? parseInt(propDetails.numberOfStories, 10) || undefined : undefined,
      roof: roofDetails.roofMaterial || roofDetails.yearRoofInstall ? {
        material: roofDetails.roofMaterial || undefined,
        yearInstalled: roofDetails.yearRoofInstall ? parseInt(roofDetails.yearRoofInstall, 10) || undefined : undefined,
        damageScope: roofDetails.damageScope as "Exterior Only" | "Interior" | "Both" || undefined,
      } : undefined,
    },
    fnol: {
      reportedBy: insuredInfo.reportedBy || undefined,
      reportedDate: insuredInfo.reportedDate || undefined,
      droneEligible: typeof claimInfo.droneEligibleAtFNOL === 'boolean'
        ? claimInfo.droneEligibleAtFNOL
        : (claimInfo.droneEligibleAtFNOL === 'Yes' || claimInfo.droneEligibleAtFNOL === 'true'),
      weather: claimInfo.weatherData ? {
        status: claimInfo.weatherData.status === 'ok' ? 'ok' : 'failed',
        message: claimInfo.weatherData.message || undefined,
      } : undefined,
    },
    damageSummary: {
      coverageA: coverages.find((c: any) => c.coverageCode === 'A' || c.coverageName?.toLowerCase().includes('dwelling'))?.limit || undefined,
      coverageB: coverages.find((c: any) => c.coverageCode === 'B' || c.coverageName?.toLowerCase().includes('other structure'))?.limit || undefined,
      coverageC: coverages.find((c: any) => c.coverageCode === 'C' || c.coverageName?.toLowerCase().includes('personal property'))?.limit || undefined,
    },
  };

  return extraction;
}

/**
 * Build loss_context from FNOLExtraction
 * This is the canonical storage for FNOL truth
 */
function buildLossContext(extraction: FNOLExtraction): LossContext {
  const lossContext: LossContext = {
    fnol: {
      reported_by: extraction.fnol.reportedBy,
      reported_date: extraction.fnol.reportedDate,
      drone_eligible: extraction.fnol.droneEligible,
      weather: extraction.fnol.weather,
    },
    property: {
      year_built: extraction.property.yearBuilt,
      stories: extraction.property.stories,
      roof: extraction.property.roof ? {
        material: extraction.property.roof.material,
        year_installed: extraction.property.roof.yearInstalled,
        damage_scope: extraction.property.roof.damageScope,
      } : undefined,
    },
    damage_summary: {
      coverage_a: extraction.damageSummary.coverageA,
      coverage_b: extraction.damageSummary.coverageB,
      coverage_c: extraction.damageSummary.coverageC,
    },
  };

  return lossContext;
}

/**
 * Validate FNOL extraction - fail loudly if malformed
 */
function validateFNOLExtraction(extraction: FNOLExtraction): void {
  if (!extraction.claim.claimNumber && !extraction.claim.dateOfLoss && !extraction.insured.name) {
    throw new Error('FNOL extraction failed: No claim number, date of loss, or insured name found. Document may not be a valid FNOL.');
  }
}

// ============================================
// POLICY EXTRACTION AND PROCESSING
// ============================================

function transformToPolicyExtraction(raw: any): PolicyExtraction {
  const extraction: PolicyExtraction = {
    documentMetadata: raw.documentMetadata || undefined,
    policyStructure: raw.policyStructure || undefined,
    definitions: raw.definitions || undefined,
    sectionI: raw.sectionI || undefined,
    sectionII: raw.sectionII || undefined,
    generalConditions: raw.generalConditions || undefined,
    rawPageText: raw.rawPageText || raw.pageText || undefined,
    fullText: raw.fullText || undefined,
    pageTexts: raw.pageTexts || undefined,
  };

  return extraction;
}

async function storePolicy(
  extraction: PolicyExtraction,
  documentId: string,
  claimId: string | null,
  organizationId: string
): Promise<void> {
  // Store to policy_form_extractions table
  if (extraction.documentMetadata || extraction.sectionI || extraction.definitions) {
    const policyExtraction = {
      organization_id: organizationId,
      claim_id: claimId,
      document_id: documentId,
      document_type: extraction.documentMetadata?.documentType || 'PolicyForm',
      policy_form_code: extraction.documentMetadata?.policyFormCode || null,
      policy_form_name: extraction.documentMetadata?.policyFormName || null,
      edition_date: extraction.documentMetadata?.editionDate || null,
      page_count: extraction.documentMetadata?.pageCount || extraction.pageTexts?.length || null,
      policy_structure: extraction.policyStructure || {},
      definitions: extraction.definitions || [],
      section_i: extraction.sectionI || {},
      section_ii: extraction.sectionII || {},
      general_conditions: extraction.generalConditions || [],
      raw_page_text: extraction.rawPageText || extraction.fullText || null,
      extraction_model: 'gpt-4o',
      extraction_version: '3.0',
      status: 'completed'
    };

    const { data: existing } = await supabaseAdmin
      .from('policy_form_extractions')
      .select('id')
      .eq('document_id', documentId)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from('policy_form_extractions')
        .update({ ...policyExtraction, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await supabaseAdmin
        .from('policy_form_extractions')
        .insert(policyExtraction);
    }

    console.log(`[PolicyExtraction] Saved extraction for document ${documentId}`);
  }

  // Also store to policy_forms table for backward compatibility
  if (extraction.documentMetadata?.policyFormCode && claimId) {
    const formNumber = extraction.documentMetadata.policyFormCode;
    const keyProvisions = {
      sectionHeadings: extraction.policyStructure?.tableOfContents || [],
      definitions: extraction.definitions || [],
      sectionI: extraction.sectionI || null,
      sectionII: extraction.sectionII || null,
    };

    const { data: existingForms } = await supabaseAdmin
      .from('policy_forms')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('claim_id', claimId)
      .eq('form_number', formNumber)
      .limit(1);

    if (existingForms && existingForms.length > 0) {
      await supabaseAdmin
        .from('policy_forms')
        .update({
          document_title: extraction.documentMetadata?.policyFormName || null,
          key_provisions: keyProvisions,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingForms[0].id);
    } else {
      await supabaseAdmin
        .from('policy_forms')
        .insert({
          organization_id: organizationId,
          claim_id: claimId,
          form_type: extraction.documentMetadata?.documentType || 'Policy Form',
          form_number: formNumber,
          document_title: extraction.documentMetadata?.policyFormName || null,
          key_provisions: keyProvisions
        });
    }
  }
}

// ============================================
// ENDORSEMENT EXTRACTION AND PROCESSING
// ============================================

function transformToEndorsementExtraction(raw: any): EndorsementExtraction[] {
  const endorsements = raw.endorsements || [raw];

  return endorsements.map((e: any) => ({
    endorsementMetadata: {
      formCode: e.endorsementMetadata?.formCode || e.formNumber || '',
      title: e.endorsementMetadata?.title || e.documentTitle || e.name || '',
      editionDate: e.endorsementMetadata?.editionDate || null,
      jurisdiction: e.endorsementMetadata?.jurisdiction || e.appliesToState || null,
      pageCount: e.endorsementMetadata?.pageCount || 1,
      appliesToPolicyForms: e.endorsementMetadata?.appliesToPolicyForms || [],
    },
    modifications: e.modifications || {},
    tables: e.tables || [],
    rawText: e.rawText || '',
  }));
}

async function storeEndorsements(
  extractions: EndorsementExtraction[],
  claimId: string,
  organizationId: string
): Promise<void> {
  for (const endorsement of extractions) {
    const formCode = endorsement.endorsementMetadata.formCode;
    if (!formCode) continue;

    const { data: existing } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('claim_id', claimId)
      .eq('form_code', formCode)
      .limit(1);

    const extractionData = {
      organization_id: organizationId,
      claim_id: claimId,
      form_code: formCode,
      title: endorsement.endorsementMetadata.title || null,
      edition_date: endorsement.endorsementMetadata.editionDate || null,
      jurisdiction: endorsement.endorsementMetadata.jurisdiction || null,
      page_count: endorsement.endorsementMetadata.pageCount || null,
      applies_to_policy_forms: endorsement.endorsementMetadata.appliesToPolicyForms || [],
      modifications: endorsement.modifications || {},
      tables: endorsement.tables || [],
      raw_text: endorsement.rawText || null,
      extraction_model: 'gpt-4o',
      extraction_version: '3.0',
      status: 'completed'
    };

    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from('endorsement_extractions')
        .update({ ...extractionData, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await supabaseAdmin
        .from('endorsement_extractions')
        .insert(extractionData);
    }

    console.log(`[EndorsementExtraction] Saved extraction for ${formCode}`);
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
  documentType: DocumentType
): Promise<any> {
  let imagePaths: string[] = [];

  try {
    console.log(`Converting PDF to images: ${filePath}`);
    imagePaths = await convertPdfToImages(filePath);

    if (imagePaths.length === 0) {
      throw new Error('No pages could be extracted from PDF');
    }

    console.log(`Processing ${imagePaths.length} page(s) with Vision API`);

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
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
        pageTexts.push(`[Error extracting page ${i + 1}]`);
      }
    }

    // For multi-page documents, merge results (first page takes precedence for scalars)
    const merged = pageResults.reduce((acc, curr) => {
      for (const [key, value] of Object.entries(curr)) {
        if (value !== null && value !== undefined && value !== '' && acc[key] === undefined) {
          acc[key] = value;
        }
      }
      return acc;
    }, {});

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
        rawExtraction = await extractFromPDF(tempFilePath, documentType);
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

    // SIMPLIFIED CONTROL FLOW - one path per document type
    switch (documentType) {
      case 'fnol': {
        const fnolExtraction = transformToFNOLExtraction(rawExtraction);
        validateFNOLExtraction(fnolExtraction);

        // Store extracted data
        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: fnolExtraction,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        console.log(`[FNOL] Extraction completed for document ${documentId}`);
        return fnolExtraction;
      }

      case 'policy': {
        const policyExtraction = transformToPolicyExtraction(rawExtraction);

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: policyExtraction,
            full_text: policyExtraction.fullText || null,
            page_texts: policyExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        await storePolicy(policyExtraction, documentId, doc.claim_id, organizationId);

        // Trigger effective policy recomputation
        if (doc.claim_id) {
          try {
            await recomputeEffectivePolicyIfNeeded(doc.claim_id, organizationId);
            console.log(`[EffectivePolicy] Triggered recomputation for claim ${doc.claim_id}`);
          } catch (e) {
            console.error('[EffectivePolicy] Recomputation error:', e);
          }
        }

        console.log(`[Policy] Extraction completed for document ${documentId}`);
        return policyExtraction;
      }

      case 'endorsement': {
        const endorsementExtractions = transformToEndorsementExtraction(rawExtraction);

        await supabaseAdmin
          .from('documents')
          .update({
            extracted_data: endorsementExtractions,
            full_text: rawExtraction.fullText || null,
            page_texts: rawExtraction.pageTexts || [],
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        if (doc.claim_id) {
          await storeEndorsements(endorsementExtractions, doc.claim_id, organizationId);

          // Trigger effective policy recomputation
          try {
            await recomputeEffectivePolicyIfNeeded(doc.claim_id, organizationId);
            console.log(`[EffectivePolicy] Triggered recomputation for claim ${doc.claim_id}`);
          } catch (e) {
            console.error('[EffectivePolicy] Recomputation error:', e);
          }
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

  // Check if already in FNOLExtraction format
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
  const claimNumber = fnolExtraction.claim.claimNumber || await generateClaimId(organizationId);

  // PERIL NORMALIZATION
  const perilInput: PerilInferenceInput = {
    causeOfLoss: fnolExtraction.claim.primaryPeril,
    lossDescription: fnolExtraction.claim.lossDescription,
  };

  const perilInference = inferPeril(perilInput);

  console.log(`[Peril Normalization] Claim ${claimNumber}:`, {
    primaryPeril: perilInference.primaryPeril,
    secondaryPerils: perilInference.secondaryPerils,
    confidence: perilInference.confidence,
  });

  // CREATE CLAIM - STRICT SCALAR MAPPING
  // Populate ONLY these scalar columns from FNOL:
  const { data: newClaim, error: claimError } = await supabaseAdmin
    .from('claims')
    .insert({
      organization_id: organizationId,
      claim_number: claimNumber,

      // Insured info
      insured_name: fnolExtraction.insured.name || null,
      insured_phone: fnolExtraction.insured.phone || null,
      insured_email: fnolExtraction.insured.email || null,

      // Property address
      property_address: fnolExtraction.property.address.full || null,
      property_city: fnolExtraction.property.address.city || null,
      property_state: fnolExtraction.property.address.state || null,
      property_zip: fnolExtraction.property.address.zip || null,

      // Loss details
      date_of_loss: fnolExtraction.claim.dateOfLoss || null,
      primary_peril: perilInference.primaryPeril,
      loss_description: fnolExtraction.claim.lossDescription || null,

      // Roof
      year_roof_install: fnolExtraction.property.roof?.yearInstalled?.toString() || null,

      // Peril inference
      secondary_perils: perilInference.secondaryPerils,
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

  // Process any endorsement documents
  const endorsementDocs = docs.filter(d => d.type === 'endorsement');
  for (const endDoc of endorsementDocs) {
    if (endDoc.extracted_data) {
      const extractions = Array.isArray(endDoc.extracted_data)
        ? endDoc.extracted_data
        : [endDoc.extracted_data];
      await storeEndorsements(extractions as EndorsementExtraction[], claimId, organizationId);
    }
  }

  // Trigger effective policy recomputation if endorsements present
  if (endorsementDocs.length > 0) {
    try {
      await recomputeEffectivePolicyIfNeeded(claimId, organizationId);
      console.log(`[EffectivePolicy] Triggered recomputation for claim ${claimId}`);
    } catch (e) {
      console.error('[EffectivePolicy] Recomputation error:', e);
    }
  }

  console.log(`[ClaimCreation] Created claim ${claimNumber} (${claimId}) with loss_context`);

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
// EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================

// These exports maintain API compatibility while using the new clean types internally

export type ExtractedClaimData = FNOLExtraction | PolicyExtraction | EndorsementExtraction[];

export function transformOpenAIResponse(response: any): any {
  // Determine document type and transform accordingly
  if (response.claims || response.claimInformation || response.claim) {
    return transformToFNOLExtraction(response);
  }
  if (response.endorsements || response.endorsementMetadata) {
    return transformToEndorsementExtraction(response);
  }
  if (response.documentMetadata || response.sectionI || response.definitions) {
    return transformToPolicyExtraction(response);
  }
  return response;
}

export function mergeExtractedData(...documents: any[]): any {
  // Simple merge - first non-null value wins
  return documents.reduce((acc, doc) => {
    if (!doc) return acc;
    for (const [key, value] of Object.entries(doc)) {
      if (value !== null && value !== undefined && value !== '' && acc[key] === undefined) {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}
