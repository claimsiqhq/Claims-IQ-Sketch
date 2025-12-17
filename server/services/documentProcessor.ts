import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { inferPeril, type PerilInferenceInput } from './perilNormalizer';
import { Peril, PromptKey } from '../../shared/schema';
import { getSupabaseAdmin } from '../lib/supabase';
import { getPromptWithFallback, substituteVariables } from './promptService';

const execAsync = promisify(exec);

// Using user's own OpenAI API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-pdf');
const DOCUMENTS_BUCKET = 'documents';

/**
 * Download a file from Supabase Storage to a local temp path
 */
async function downloadFromStorage(storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  // Download file from Supabase Storage
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);
  
  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || 'No data returned'}`);
  }
  
  // Create temp directory if needed
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Write to temp file
  const ext = path.extname(storagePath) || '.bin';
  const tempPath = path.join(TEMP_DIR, `doc-${Date.now()}${ext}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);
  
  return tempPath;
}

// Coverage details interface
export interface CoverageDetail {
  code: string; // A, B, C, D, E, F
  name: string;
  limit?: string;
  percentage?: string;
  valuationMethod?: string;
  deductible?: string;
}

// Scheduled structure interface
export interface ScheduledStructure {
  description: string;
  value: string;
  articleNumber?: string;
  valuationMethod?: string;
}

// Endorsement detail interface
export interface EndorsementDetail {
  formNumber: string;
  name: string;
  additionalInfo?: string;
}

// Document type definitions - matches FNOL JSON format
export interface ExtractedClaimData {
  // Claim identifier
  claimId?: string;

  // Policyholder info
  policyholder?: string;
  policyholderSecondary?: string; // Second named insured
  contactPhone?: string;
  contactEmail?: string;

  // Loss details
  dateOfLoss?: string; // Format: "MM/DD/YYYY@HH:MM AM/PM"
  riskLocation?: string; // Full property address string
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc.
  lossDescription?: string;
  dwellingDamageDescription?: string;
  otherStructureDamageDescription?: string;
  damageLocation?: string; // Interior, Exterior, Both

  // Property details
  yearBuilt?: string;
  yearRoofInstall?: string; // Format: "MM-DD-YYYY" or year
  isWoodRoof?: boolean;

  // Policy info
  policyNumber?: string;
  state?: string;
  carrier?: string;
  lineOfBusiness?: string;
  policyStatus?: string;
  policyInceptionDate?: string;

  // Deductibles
  policyDeductible?: string;
  windHailDeductible?: string;
  windHailDeductiblePercent?: string;

  // Coverages (comprehensive)
  coverages?: CoverageDetail[];
  dwellingLimit?: string; // Coverage A
  otherStructuresLimit?: string; // Coverage B
  personalPropertyLimit?: string; // Coverage C
  lossOfUseLimit?: string; // Coverage D
  liabilityLimit?: string; // Coverage E
  medicalLimit?: string; // Coverage F

  // Scheduled structures (Coverage B - Scheduled)
  scheduledStructures?: ScheduledStructure[];
  unscheduledStructuresLimit?: string;

  // Additional coverages
  additionalCoverages?: {
    name: string;
    limit?: string;
    deductible?: string;
  }[];

  // Endorsements
  endorsementsListed?: string[]; // Simple list of endorsement codes
  endorsementDetails?: EndorsementDetail[]; // Detailed endorsement info

  // Third parties
  mortgagee?: string;
  producer?: string;
  producerPhone?: string;
  producerEmail?: string;

  // Assignment info
  reportedBy?: string;
  reportedDate?: string;
  droneEligible?: boolean;

  // Legacy policyDetails for backward compatibility
  policyDetails?: {
    policyNumber?: string;
    state?: string;
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
  };

  // HO Policy Form structure fields (new)
  documentType?: string;
  formNumber?: string;
  documentTitle?: string;
  baseStructure?: {
    sectionHeadings?: string[];
    definitionOfACV?: string;
  };
  defaultPolicyProvisionSummary?: {
    windHailLossSettlement?: string;
    unoccupiedExclusionPeriod?: string;
  };

  // Raw text (for reference)
  rawText?: string;

  // Full text extraction fields
  pageTexts?: string[];
  fullText?: string;
}

// Extended result from single page extraction
interface PageExtractionResult extends ExtractedClaimData {
  pageText?: string;
}

/**
 * Process a document and extract claim-relevant data using AI
 */
export async function processDocument(
  documentId: string,
  organizationId: string
): Promise<ExtractedClaimData> {
  const client = await pool.connect();

  try {
    // Get document info
    const docResult = await client.query(
      `SELECT * FROM documents WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId]
    );

    if (docResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const doc = docResult.rows[0];

    // Update status to processing
    await client.query(
      `UPDATE documents SET processing_status = 'processing', updated_at = NOW() WHERE id = $1`,
      [documentId]
    );

    let extractedData: ExtractedClaimData = {};

    try {
      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OpenAI API key not configured, skipping AI extraction');
        extractedData = { rawText: 'AI extraction not available - OPENAI_API_KEY not configured' };
      } else {
        // Download file from Supabase Storage to temp location
        let tempFilePath: string | null = null;
        try {
          console.log(`Downloading document from storage: ${doc.storage_path}`);
          tempFilePath = await downloadFromStorage(doc.storage_path);
          console.log(`Downloaded to temp: ${tempFilePath}`);

          // Process based on document type
          if (doc.mime_type === 'application/pdf') {
            extractedData = await extractFromPDF(tempFilePath, doc.type);
          } else if (doc.mime_type.startsWith('image/')) {
            extractedData = await extractFromImage(tempFilePath, doc.type);
          } else {
            extractedData = { rawText: 'Unsupported file type for extraction' };
          }
        } finally {
          // Clean up temp file
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (cleanupErr) {
              console.warn('Failed to cleanup temp file:', tempFilePath);
            }
          }
        }
      }

      // Update document with extracted data including full text
      await client.query(
        `UPDATE documents
         SET extracted_data = $1,
             full_text = $2,
             page_texts = $3,
             processing_status = 'completed',
             updated_at = NOW()
         WHERE id = $4`,
        [
          JSON.stringify(extractedData),
          extractedData.fullText || null,
          JSON.stringify(extractedData.pageTexts || []),
          documentId
        ]
      );

      // For policy documents, create/update a policy_forms record if form data was extracted
      if (doc.type === 'policy' && (extractedData.formNumber || extractedData.documentTitle)) {
        const keyProvisions = {
          sectionHeadings: extractedData.baseStructure?.sectionHeadings || [],
          definitionOfACV: extractedData.baseStructure?.definitionOfACV || null,
          windHailLossSettlement: extractedData.defaultPolicyProvisionSummary?.windHailLossSettlement || null,
          unoccupiedExclusionPeriod: extractedData.defaultPolicyProvisionSummary?.unoccupiedExclusionPeriod || null,
        };

        // Check if a policy_form already exists for this claim
        const existingForm = await client.query(
          `SELECT id FROM policy_forms
           WHERE organization_id = $1 AND claim_id = $2 AND form_number = $3
           LIMIT 1`,
          [organizationId, doc.claim_id, extractedData.formNumber || 'UNKNOWN']
        );

        if (existingForm.rows.length > 0) {
          // Update existing policy form
          await client.query(
            `UPDATE policy_forms
             SET document_title = COALESCE($1, document_title),
                 key_provisions = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [extractedData.documentTitle, JSON.stringify(keyProvisions), existingForm.rows[0].id]
          );
        } else if (doc.claim_id) {
          // Create new policy form record
          await client.query(
            `INSERT INTO policy_forms (organization_id, claim_id, form_type, form_number, document_title, key_provisions)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              organizationId,
              doc.claim_id,
              extractedData.documentType || 'Policy Form',
              extractedData.formNumber || 'UNKNOWN',
              extractedData.documentTitle || null,
              JSON.stringify(keyProvisions)
            ]
          );
        }
      }

      return extractedData;

    } catch (error) {
      // Update status to failed
      await client.query(
        `UPDATE documents
         SET processing_status = 'failed',
             extracted_data = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ error: (error as Error).message }), documentId]
      );
      throw error;
    }

  } finally {
    client.release();
  }
}

/**
 * Convert PDF pages to images using pdftoppm command (poppler-utils)
 */
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

/**
 * Clean up temporary image files
 */
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

/**
 * Get the prompt key for a document type
 */
function getPromptKeyForDocumentType(documentType: string): PromptKey {
  switch (documentType) {
    case 'fnol':
      return PromptKey.DOCUMENT_EXTRACTION_FNOL;
    case 'policy':
      return PromptKey.DOCUMENT_EXTRACTION_POLICY;
    case 'endorsement':
      return PromptKey.DOCUMENT_EXTRACTION_ENDORSEMENT;
    default:
      return PromptKey.DOCUMENT_EXTRACTION_FNOL; // Default to FNOL for unknown types
  }
}

/**
 * Extract data from a single image using Vision API
 * Also extracts the complete page text for full document storage
 */
async function extractFromSingleImage(
  imagePath: string,
  documentType: string,
  pageNum: number,
  totalPages: number
): Promise<PageExtractionResult> {
  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');

  // Get prompt from database (falls back to hardcoded if not available)
  const promptKey = getPromptKeyForDocumentType(documentType);
  const promptConfig = await getPromptWithFallback(promptKey);

  // Build the user prompt with variable substitution
  const userPromptText = promptConfig.userPromptTemplate
    ? substituteVariables(promptConfig.userPromptTemplate, {
        pageNum: String(pageNum),
        totalPages: String(totalPages),
      })
    : `This is page ${pageNum} of ${totalPages} of a ${documentType} document. Extract all relevant information AND transcribe the complete text from this page. Return ONLY valid JSON with extracted fields and "pageText" containing the full page text.`;

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

  return JSON.parse(content) as PageExtractionResult;
}

/**
 * Extract data from a PDF document by converting to images first
 * Collects both structured data and full page text from each page
 */
async function extractFromPDF(
  filePath: string,
  documentType: string
): Promise<ExtractedClaimData> {
  let imagePaths: string[] = [];

  try {
    console.log(`Converting PDF to images: ${filePath}`);
    imagePaths = await convertPdfToImages(filePath);

    if (imagePaths.length === 0) {
      return { rawText: 'No pages could be extracted from PDF' };
    }

    console.log(`Processing ${imagePaths.length} page(s) with Vision API`);

    const pageResults: PageExtractionResult[] = [];
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
        
        // Collect page text if available
        if (pageData.pageText) {
          pageTexts.push(pageData.pageText);
        }
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
        pageTexts.push(`[Error extracting page ${i + 1}]`);
      }
    }

    const merged = mergeExtractedData(...pageResults);
    merged.rawText = `Successfully extracted from ${pageResults.length} page(s)`;
    
    // Add full text extraction results
    merged.pageTexts = pageTexts;
    merged.fullText = pageTexts.join('\n\n--- Page Break ---\n\n');
    
    return merged;

  } catch (error) {
    console.error('PDF extraction error:', error);
    return { rawText: `Extraction failed: ${(error as Error).message}` };
  } finally {
    cleanupTempImages(imagePaths);
  }
}

/**
 * Extract data from an image document
 * Also extracts the complete page text for full document storage
 */
async function extractFromImage(
  filePath: string,
  documentType: string
): Promise<ExtractedClaimData> {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const systemPrompt = getExtractionPrompt(documentType);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt + `\n\nADDITIONALLY: Include a "pageText" field in your JSON response containing the complete verbatim text from this document, preserving the original layout as much as possible.`
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
              text: `Extract all relevant information AND transcribe the complete text from this ${documentType} document. Return ONLY valid JSON with extracted fields and "pageText" containing the full document text.`
            }
          ]
        }
      ],
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { rawText: 'No content extracted' };
    }

    const result = JSON.parse(content) as PageExtractionResult;
    
    // Set full text fields for single image documents
    if (result.pageText) {
      result.pageTexts = [result.pageText];
      result.fullText = result.pageText;
    }
    
    return result;

  } catch (error) {
    console.error('Image extraction error:', error);
    return { rawText: `Extraction failed: ${(error as Error).message}` };
  }
}

/**
 * Get the appropriate extraction prompt based on document type
 */
function getExtractionPrompt(documentType: string): string {
  const basePrompt = `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):`;

  switch (documentType) {
    case 'fnol':
      return `${basePrompt}
{
  "claimId": "Claim ID/number (format: XX-XXX-XXXXXX)",
  "policyholder": "Primary policyholder full name",
  "policyholderSecondary": "Second named insured if any",
  "contactPhone": "Mobile or primary phone number",
  "contactEmail": "Email address",
  "dateOfLoss": "Date and time of loss (format: MM/DD/YYYY@HH:MM AM/PM)",
  "riskLocation": "Full property address including street, city, state, and ZIP",
  "causeOfLoss": "Cause of loss (e.g., Hail, Fire, Water, Wind)",
  "lossDescription": "Detailed description of the loss/damage",
  "dwellingDamageDescription": "Description of dwelling damage",
  "otherStructureDamageDescription": "Description of other structure damage",
  "damageLocation": "Interior, Exterior, or Both",
  "yearBuilt": "Year property was built",
  "yearRoofInstall": "Year or date roof was installed",
  "isWoodRoof": "Whether roof is wood (true/false)",
  "policyNumber": "Policy number",
  "state": "State code (2-letter)",
  "carrier": "Insurance carrier/company name",
  "lineOfBusiness": "Line of business (Homeowners, etc.)",
  "policyInceptionDate": "Policy inception/in-force date",
  "policyDeductible": "Policy deductible amount ($X,XXX)",
  "windHailDeductible": "Wind/hail deductible amount ($X,XXX)",
  "windHailDeductiblePercent": "Wind/hail deductible percentage (X%)",
  "coverages": [
    {"code": "A", "name": "Coverage A - Dwelling", "limit": "$XXX,XXX", "percentage": "XX%", "valuationMethod": "RCV or ACV"},
    {"code": "B", "name": "Coverage B - Other Structures", "limit": "$XXX,XXX"},
    {"code": "C", "name": "Coverage C - Personal Property", "limit": "$XXX,XXX", "percentage": "XX%"},
    {"code": "D", "name": "Coverage D - Loss of Use", "limit": "$XXX,XXX", "percentage": "XX%"},
    {"code": "E", "name": "Coverage E - Personal Liability", "limit": "$XXX,XXX"},
    {"code": "F", "name": "Coverage F - Medical Expense", "limit": "$X,XXX"}
  ],
  "dwellingLimit": "Coverage A limit",
  "scheduledStructures": [
    {"description": "Structure description (shed, garage, etc.)", "value": "$XX,XXX", "articleNumber": "Article number if any", "valuationMethod": "RCV or ACV"}
  ],
  "unscheduledStructuresLimit": "Coverage B unscheduled limit",
  "additionalCoverages": [
    {"name": "Coverage name (Ordinance/Law, Fungi, etc.)", "limit": "$XX,XXX", "deductible": "$X,XXX if any"}
  ],
  "endorsementDetails": [
    {"formNumber": "HO XX XX", "name": "Endorsement name", "additionalInfo": "Any notes"}
  ],
  "endorsementsListed": ["Array of endorsement form numbers"],
  "mortgagee": "Mortgagee/lender name and info",
  "producer": "Agent/producer name",
  "producerPhone": "Agent phone",
  "producerEmail": "Agent email",
  "reportedBy": "Who reported the claim",
  "reportedDate": "Date claim was reported"
}`;

    case 'policy':
      return `${basePrompt}
{
  "policyholder": "Named insured on the policy",
  "policyholderSecondary": "Second named insured",
  "riskLocation": "Full insured property address",
  "policyNumber": "Policy number",
  "state": "State code (2-letter)",
  "carrier": "Insurance company name",
  "yearRoofInstall": "Roof installation date if available",
  "policyDeductible": "Policy deductible ($X,XXX)",
  "windHailDeductible": "Wind/hail deductible ($X,XXX X%)",
  "coverages": [
    {"code": "A", "name": "Coverage A - Dwelling", "limit": "$XXX,XXX", "valuationMethod": "RCV or ACV"},
    {"code": "B", "name": "Coverage B - Other Structures", "limit": "$XXX,XXX"},
    {"code": "C", "name": "Coverage C - Personal Property", "limit": "$XXX,XXX"},
    {"code": "D", "name": "Coverage D - Loss of Use", "limit": "$XXX,XXX"}
  ],
  "dwellingLimit": "Coverage A limit",
  "scheduledStructures": [{"description": "Description", "value": "$XX,XXX"}],
  "endorsementDetails": [{"formNumber": "HO XX XX", "name": "Endorsement name"}],
  "endorsementsListed": ["Array of endorsement form numbers"],
  "mortgagee": "Mortgagee/lender info"
}`;

    case 'endorsement':
      return `${basePrompt}
{
  "policyNumber": "Policy number this endorsement applies to",
  "endorsementDetails": [
    {"formNumber": "HO XX XX", "name": "Full endorsement name", "additionalInfo": "Key provisions or limits"}
  ],
  "endorsementsListed": ["Array of endorsement form numbers, e.g., 'HO 84 28'"]
}`;

    default:
      return `${basePrompt}
Extract any insurance-related information you can find including:
- Policyholder name(s) and contact info
- Risk location/property address
- Policy number, state, carrier
- All coverage limits (A through F)
- Deductibles (policy, wind/hail)
- Scheduled structures with values
- All endorsements listed
- Claim/loss information if present
- Mortgagee and producer info`;
  }
}

/**
 * Helper to merge two objects, filling in missing fields from source
 */
function enrichObject<T extends Record<string, any>>(existing: T, source: T): T {
  const result = { ...existing };
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined && value !== '' && !result[key]) {
      (result as any)[key] = value;
    }
  }
  return result;
}

/**
 * Merge extracted data from multiple documents/pages
 * Properly handles arrays by deduplicating and enriching existing entries
 */
export function mergeExtractedData(
  ...documents: ExtractedClaimData[]
): ExtractedClaimData {
  const merged: ExtractedClaimData = {};

  for (const doc of documents) {
    if (!doc) continue;

    for (const [key, value] of Object.entries(doc)) {
      if (value === null || value === undefined || value === '') continue;

      // Handle array fields with proper merging and enrichment
      if (key === 'coverages' && Array.isArray(value)) {
        const existing = merged.coverages || [];
        const byCode = new Map(existing.map(c => [c.code, c]));
        for (const cov of value as CoverageDetail[]) {
          const prev = byCode.get(cov.code);
          byCode.set(cov.code, prev ? enrichObject(prev, cov) : cov);
        }
        merged.coverages = Array.from(byCode.values());
      } else if (key === 'scheduledStructures' && Array.isArray(value)) {
        const existing = merged.scheduledStructures || [];
        const byDesc = new Map(existing.map(s => [s.description, s]));
        for (const str of value as ScheduledStructure[]) {
          const prev = byDesc.get(str.description);
          byDesc.set(str.description, prev ? enrichObject(prev, str) : str);
        }
        merged.scheduledStructures = Array.from(byDesc.values());
      } else if (key === 'additionalCoverages' && Array.isArray(value)) {
        const existing = merged.additionalCoverages || [];
        const byName = new Map(existing.map(c => [c.name, c]));
        for (const cov of value as { name: string; limit?: string; deductible?: string }[]) {
          const prev = byName.get(cov.name);
          byName.set(cov.name, prev ? enrichObject(prev, cov) : cov);
        }
        merged.additionalCoverages = Array.from(byName.values());
      } else if (key === 'endorsementDetails' && Array.isArray(value)) {
        const existing = merged.endorsementDetails || [];
        const byForm = new Map(existing.map(e => [e.formNumber, e]));
        for (const end of value as EndorsementDetail[]) {
          const prev = byForm.get(end.formNumber);
          byForm.set(end.formNumber, prev ? enrichObject(prev, end) : end);
        }
        merged.endorsementDetails = Array.from(byForm.values());
      } else if (key === 'endorsementsListed' && Array.isArray(value)) {
        const existing = merged.endorsementsListed || [];
        merged.endorsementsListed = [...new Set([...existing, ...value])];
      } else if (!(merged as any)[key]) {
        // For scalar fields, prefer first non-null value
        (merged as any)[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Create a claim from extracted document data
 */
export async function createClaimFromDocuments(
  organizationId: string,
  documentIds: string[],
  overrides?: Partial<ExtractedClaimData>
): Promise<string> {
  const client = await pool.connect();

  try {
    // Get all documents and their extracted data
    const docResult = await client.query(
      `SELECT id, type, extracted_data FROM documents
       WHERE id = ANY($1) AND organization_id = $2`,
      [documentIds, organizationId]
    );

    // Merge extracted data from all documents
    const extractedDatas = docResult.rows
      .map(d => d.extracted_data as ExtractedClaimData)
      .filter(Boolean);

    let claimData = mergeExtractedData(...extractedDatas);

    // Apply any overrides
    if (overrides) {
      claimData = { ...claimData, ...overrides };
    }

    // Flatten policy details if nested
    const policyDetails = claimData.policyDetails || {};
    const policyNumber = claimData.policyNumber || policyDetails.policyNumber || null;
    const dwellingLimit = claimData.dwellingLimit || policyDetails.dwellingLimit || null;
    const state = claimData.state || policyDetails.state || null;
    const yearRoofInstall = claimData.yearRoofInstall || policyDetails.yearRoofInstall || null;
    const windHailDeductible = claimData.windHailDeductible || policyDetails.windHailDeductible || null;
    const endorsementsListed = claimData.endorsementsListed || policyDetails.endorsementsListed || [];

    // Generate claim ID if not provided
    const generatedClaimId = claimData.claimId || await generateClaimId(client, organizationId);

    // ========================================
    // PERIL NORMALIZATION (Peril Parity)
    // ========================================
    // Infer primary peril, secondary perils, and peril-specific metadata
    // This ensures all perils are treated equally, not just wind/hail
    const perilInput: PerilInferenceInput = {
      causeOfLoss: claimData.causeOfLoss,
      lossDescription: claimData.lossDescription,
      damageLocation: claimData.damageLocation,
      dwellingDamageDescription: claimData.dwellingDamageDescription,
      otherStructureDamageDescription: claimData.otherStructureDamageDescription,
      fullText: claimData.fullText,
    };

    const perilInference = inferPeril(perilInput);

    console.log(`[Peril Normalization] Claim ${generatedClaimId}:`, {
      primaryPeril: perilInference.primaryPeril,
      secondaryPerils: perilInference.secondaryPerils,
      confidence: perilInference.confidence,
      reasoning: perilInference.inferenceReasoning
    });

    // Create claim with correct database schema columns
    const claimResult = await client.query(
      `INSERT INTO claims (
        organization_id, claim_number, insured_name,
        date_of_loss, property_address, property_city, property_state, property_zip,
        loss_type, loss_description,
        policy_number, year_roof_install, wind_hail_deductible,
        dwelling_limit, endorsements_listed,
        primary_peril, secondary_perils, peril_confidence, peril_metadata,
        status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING id`,
      [
        organizationId,
        generatedClaimId,
        claimData.policyholder || null,
        claimData.dateOfLoss || null,
        claimData.riskLocation || null,
        null,
        state,
        null,
        claimData.causeOfLoss || null,
        claimData.lossDescription || null,
        policyNumber,
        yearRoofInstall,
        windHailDeductible,
        dwellingLimit,
        JSON.stringify(endorsementsListed),
        perilInference.primaryPeril,
        JSON.stringify(perilInference.secondaryPerils),
        perilInference.confidence,
        JSON.stringify(perilInference.perilMetadata),
        'fnol',
        JSON.stringify({
          extractedFrom: documentIds,
          riskLocation: claimData.riskLocation,
          policyholderSecondary: claimData.policyholderSecondary,
          contactPhone: claimData.contactPhone,
          contactEmail: claimData.contactEmail,
          yearBuilt: claimData.yearBuilt,
          carrier: claimData.carrier,
          lineOfBusiness: claimData.lineOfBusiness,
          coverages: claimData.coverages,
          scheduledStructures: claimData.scheduledStructures,
          additionalCoverages: claimData.additionalCoverages,
          endorsementDetails: claimData.endorsementDetails,
          mortgagee: claimData.mortgagee,
          producer: claimData.producer,
          perilInferenceReasoning: perilInference.inferenceReasoning,
        })
      ]
    );

    const claimId = claimResult.rows[0].id;

    // Associate documents with claim
    await client.query(
      `UPDATE documents SET claim_id = $1, updated_at = NOW() WHERE id = ANY($2)`,
      [claimId, documentIds]
    );

    return claimId;

  } finally {
    client.release();
  }
}

/**
 * Generate a unique claim ID in format XX-XXX-XXXXXX
 */
async function generateClaimId(client: any, organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const countResult = await client.query(
    `SELECT COUNT(*) + 1 as next_num FROM claims
     WHERE organization_id = $1
     AND EXTRACT(YEAR FROM created_at) = $2`,
    [organizationId, year]
  );
  const seq = String(countResult.rows[0].next_num).padStart(6, '0');
  // Format: 01-XXX-XXXXXX where XXX is derived from year
  return `01-${String(year).slice(-3)}-${seq}`;
}
