import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-pdf');

// Document type definitions - matches FNOL JSON format
export interface ExtractedClaimData {
  // Claim identifier
  claimId?: string;

  // Policyholder info
  policyholder?: string;

  // Loss details
  dateOfLoss?: string; // Format: "MM/DD/YYYY@HH:MM AM/PM"
  riskLocation?: string; // Full address string
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc.
  lossDescription?: string;

  // Policy details
  policyDetails?: {
    policyNumber?: string;
    state?: string;
    yearRoofInstall?: string; // Format: "MM-DD-YYYY"
    windHailDeductible?: string; // Format: "$X,XXX X%"
    dwellingLimit?: string; // Format: "$XXX,XXX"
    endorsementsListed?: string[]; // Array of endorsement strings
  };

  // Flattened policy details for direct access
  policyNumber?: string;
  state?: string;
  yearRoofInstall?: string;
  windHailDeductible?: string;
  dwellingLimit?: string;
  endorsementsListed?: string[];

  // Raw text (for reference)
  rawText?: string;
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
        extractedData = { rawText: 'AI extraction not available - OpenAI API key not configured' };
      } else {
        // Read file
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const filePath = path.join(uploadDir, doc.storage_path);

        if (!fs.existsSync(filePath)) {
          throw new Error('Document file not found on disk');
        }

        // Process based on document type
        if (doc.mime_type === 'application/pdf') {
          extractedData = await extractFromPDF(filePath, doc.type);
        } else if (doc.mime_type.startsWith('image/')) {
          extractedData = await extractFromImage(filePath, doc.type);
        } else {
          extractedData = { rawText: 'Unsupported file type for extraction' };
        }
      }

      // Update document with extracted data
      await client.query(
        `UPDATE documents
         SET extracted_data = $1, processing_status = 'completed', updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(extractedData), documentId]
      );

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
 * Extract data from a single image using Vision API
 */
async function extractFromSingleImage(
  imagePath: string,
  documentType: string,
  pageNum: number,
  totalPages: number
): Promise<ExtractedClaimData> {
  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');

  const systemPrompt = getExtractionPrompt(documentType);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt
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
            text: `This is page ${pageNum} of ${totalPages} of a ${documentType} document. Extract all relevant information from this page. Return ONLY valid JSON with extracted fields.`
          }
        ]
      }
    ],
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {};
  }

  return JSON.parse(content) as ExtractedClaimData;
}

/**
 * Extract data from a PDF document by converting to images first
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

    const pageResults: ExtractedClaimData[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const pageData = await extractFromSingleImage(
          imagePaths[i],
          documentType,
          i + 1,
          imagePaths.length
        );
        pageResults.push(pageData);
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
      }
    }

    const merged = mergeExtractedData(...pageResults);
    merged.rawText = `Successfully extracted from ${pageResults.length} page(s)`;
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
          content: systemPrompt
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
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { rawText: 'No content extracted' };
    }

    return JSON.parse(content) as ExtractedClaimData;

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
  "policyholder": "Full name(s) of the policyholder(s)",
  "dateOfLoss": "Date and time of loss (format: MM/DD/YYYY@HH:MM AM/PM)",
  "riskLocation": "Full property address including street, city, state, and ZIP",
  "causeOfLoss": "Cause of loss (e.g., Hail, Fire, Water, Wind, Impact)",
  "lossDescription": "Detailed description of the loss/damage",
  "policyDetails": {
    "policyNumber": "Policy number",
    "state": "State code (2-letter)",
    "yearRoofInstall": "Roof installation date (format: MM-DD-YYYY)",
    "windHailDeductible": "Wind/hail deductible with percentage (format: $X,XXX X%)",
    "dwellingLimit": "Dwelling coverage limit (format: $XXX,XXX)",
    "endorsementsListed": ["Array of endorsement codes and names"]
  }
}`;

    case 'policy':
      return `${basePrompt}
{
  "policyholder": "Named insured on the policy",
  "riskLocation": "Full insured property address",
  "policyDetails": {
    "policyNumber": "Policy number",
    "state": "State code (2-letter)",
    "yearRoofInstall": "Roof installation date if available (format: MM-DD-YYYY)",
    "windHailDeductible": "Wind/hail deductible (format: $X,XXX X%)",
    "dwellingLimit": "Coverage A/Dwelling limit (format: $XXX,XXX)",
    "endorsementsListed": ["Array of endorsement codes and names"]
  }
}`;

    case 'endorsement':
      return `${basePrompt}
{
  "policyDetails": {
    "policyNumber": "Policy number this endorsement applies to",
    "endorsementsListed": ["Array of endorsement form numbers and names, e.g., 'HO 84 28 - Hidden Water Coverage'"]
  }
}`;

    default:
      return `${basePrompt}
Extract any insurance-related information you can find including:
- Policyholder name(s)
- Risk location/property address
- Policy number, state, coverage limits
- Claim/loss information if present
- Any endorsements listed`;
  }
}

/**
 * Merge extracted data from multiple documents
 */
export function mergeExtractedData(
  ...documents: ExtractedClaimData[]
): ExtractedClaimData {
  const merged: ExtractedClaimData = {};

  for (const doc of documents) {
    if (!doc) continue;

    // Merge each field, preferring non-null values
    for (const [key, value] of Object.entries(doc)) {
      if (value !== null && value !== undefined && value !== '') {
        if (key === 'endorsements' && Array.isArray(value)) {
          // Merge endorsements arrays
          merged.endorsements = [
            ...(merged.endorsements || []),
            ...value
          ];
        } else if (!(merged as any)[key]) {
          (merged as any)[key] = value;
        }
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
    const state = claimData.state || policyDetails.state || null;
    const yearRoofInstall = claimData.yearRoofInstall || policyDetails.yearRoofInstall || null;
    const windHailDeductible = claimData.windHailDeductible || policyDetails.windHailDeductible || null;
    const dwellingLimit = claimData.dwellingLimit || policyDetails.dwellingLimit || null;
    const endorsementsListed = claimData.endorsementsListed || policyDetails.endorsementsListed || [];

    // Generate claim ID if not provided
    const generatedClaimId = claimData.claimId || await generateClaimId(client, organizationId);

    // Create claim with new schema
    const claimResult = await client.query(
      `INSERT INTO claims (
        organization_id, claim_id, policyholder,
        date_of_loss, risk_location, cause_of_loss, loss_description,
        policy_number, state, year_roof_install, wind_hail_deductible,
        dwelling_limit, endorsements_listed,
        status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        organizationId,
        generatedClaimId,
        claimData.policyholder || null,
        claimData.dateOfLoss || null,
        claimData.riskLocation || null,
        claimData.causeOfLoss || null,
        claimData.lossDescription || null,
        policyNumber,
        state,
        yearRoofInstall,
        windHailDeductible,
        dwellingLimit,
        JSON.stringify(endorsementsListed),
        'fnol',
        JSON.stringify({
          extractedFrom: documentIds
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
