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

// Document type definitions
export interface ExtractedClaimData {
  // Insured Information
  insuredName?: string;
  insuredEmail?: string;
  insuredPhone?: string;

  // Policy Information
  policyNumber?: string;
  policyEffectiveDate?: string;
  policyExpirationDate?: string;

  // Property Information
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;

  // Loss Information
  dateOfLoss?: string;
  timeOfLoss?: string;
  lossType?: string;
  lossDescription?: string;
  causeOfLoss?: string;

  // Coverage Information
  coverageA?: number;
  coverageB?: number;
  coverageC?: number;
  coverageD?: number;
  deductible?: number;

  // Additional fields
  claimNumber?: string;
  reportedBy?: string;
  reportedDate?: string;

  // Endorsements
  endorsements?: Array<{
    code: string;
    name: string;
    premium?: number;
  }>;

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
  "insuredName": "Full name of the insured",
  "insuredPhone": "Phone number",
  "insuredEmail": "Email address",
  "policyNumber": "Policy number",
  "propertyAddress": "Street address of the property",
  "propertyCity": "City",
  "propertyState": "State (2-letter code)",
  "propertyZip": "ZIP code",
  "dateOfLoss": "Date of loss (YYYY-MM-DD format)",
  "timeOfLoss": "Time of loss if available",
  "lossType": "Type of loss (Water, Fire, Wind/Hail, Impact, Other)",
  "lossDescription": "Detailed description of the loss",
  "causeOfLoss": "Cause of the damage",
  "reportedBy": "Person who reported the claim",
  "reportedDate": "Date reported (YYYY-MM-DD format)",
  "claimNumber": "Claim number if assigned"
}`;

    case 'policy':
      return `${basePrompt}
{
  "insuredName": "Named insured on the policy",
  "policyNumber": "Policy number",
  "policyEffectiveDate": "Effective date (YYYY-MM-DD)",
  "policyExpirationDate": "Expiration date (YYYY-MM-DD)",
  "propertyAddress": "Insured property address",
  "propertyCity": "City",
  "propertyState": "State (2-letter code)",
  "propertyZip": "ZIP code",
  "coverageA": "Coverage A (Dwelling) limit as number",
  "coverageB": "Coverage B (Other Structures) limit as number",
  "coverageC": "Coverage C (Personal Property) limit as number",
  "coverageD": "Coverage D (Loss of Use) limit as number",
  "deductible": "Deductible amount as number"
}`;

    case 'endorsement':
      return `${basePrompt}
{
  "policyNumber": "Policy number this endorsement applies to",
  "endorsements": [
    {
      "code": "Endorsement form number/code",
      "name": "Endorsement name/description",
      "premium": "Additional premium if any"
    }
  ]
}`;

    default:
      return `${basePrompt}
Extract any insurance-related information you can find including:
- Insured name, address, contact info
- Policy number, dates, coverage limits
- Claim/loss information if present
- Any endorsements or special conditions`;
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

    // Generate claim number
    const year = new Date().getFullYear();
    const countResult = await client.query(
      `SELECT COUNT(*) + 1 as next_num FROM claims
       WHERE organization_id = $1
       AND EXTRACT(YEAR FROM created_at) = $2`,
      [organizationId, year]
    );
    const claimNumber = `CLM-${year}-${String(countResult.rows[0].next_num).padStart(6, '0')}`;

    // Create claim
    const claimResult = await client.query(
      `INSERT INTO claims (
        organization_id, claim_number, policy_number,
        insured_name, insured_email, insured_phone,
        property_address, property_city, property_state, property_zip,
        date_of_loss, loss_type, loss_description,
        coverage_a, coverage_b, coverage_c, coverage_d, deductible,
        status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id`,
      [
        organizationId,
        claimNumber,
        claimData.policyNumber || null,
        claimData.insuredName || null,
        claimData.insuredEmail || null,
        claimData.insuredPhone || null,
        claimData.propertyAddress || null,
        claimData.propertyCity || null,
        claimData.propertyState || null,
        claimData.propertyZip || null,
        claimData.dateOfLoss || null,
        claimData.lossType || null,
        claimData.lossDescription || null,
        claimData.coverageA || null,
        claimData.coverageB || null,
        claimData.coverageC || null,
        claimData.coverageD || null,
        claimData.deductible || null,
        'fnol',
        JSON.stringify({
          extractedFrom: documentIds,
          reportedBy: claimData.reportedBy,
          reportedDate: claimData.reportedDate,
          endorsements: claimData.endorsements
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
