/**
 * Document Classification Service
 *
 * Uses AI vision to automatically detect document types from uploaded files.
 * This enables users to drop multiple claim documents without pre-sorting them.
 *
 * Supported document types:
 * - fnol: First Notice of Loss forms
 * - policy: Insurance policy documents (declarations, forms)
 * - endorsement: Policy endorsements/amendments
 * - photo: Property/damage photos
 * - estimate: Repair estimates, contractor bids
 * - correspondence: Letters, emails, notes
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSupabaseAdmin } from '../lib/supabase';

const execFileAsync = promisify(execFile);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-classify');
const DOCUMENTS_BUCKET = 'documents';

// ============================================
// TYPES
// ============================================

export type ClassifiableDocumentType = 'fnol' | 'policy' | 'endorsement' | 'photo' | 'estimate' | 'correspondence';

export interface ClassificationResult {
  documentType: ClassifiableDocumentType;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  detectedFormCode?: string; // e.g., "HO-3", "HO 04 90", "FNOL-001"
  detectedTitle?: string;
}

// ============================================
// CLASSIFICATION PROMPT
// ============================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert insurance document classifier. Your task is to analyze an image of a document and determine what type of insurance document it is.

Document Types (choose exactly one):

1. **fnol** - First Notice of Loss
   - Claim intake forms
   - Loss reports filed by insured
   - Contains: claim number, date of loss, property address, damage description
   - Often has "CLAIM", "LOSS NOTICE", "FNOL" in header

2. **policy** - Insurance Policy Documents
   - Policy declarations pages
   - Policy forms (HO-3, HO-5, DP-3, etc.)
   - Contains: coverage limits, policy number, named insured, property address
   - Has form codes like "HO 00 03", "HO 00 05", "DP 00 03"
   - Multi-page contracts with definitions, conditions, exclusions

3. **endorsement** - Policy Endorsements/Amendments
   - Modifications to base policy
   - Has form codes like "HO 04 90", "HO 06 XX", "IL XX XX"
   - Usually says "ENDORSEMENT" or "AMENDATORY"
   - References the policy it modifies
   - Changes specific coverages, limits, or conditions

4. **photo** - Photographs
   - Property photos
   - Damage documentation photos
   - No text-heavy content, primarily images

5. **estimate** - Repair Estimates
   - Contractor estimates/bids
   - Xactimate estimates
   - Contains line items, quantities, prices
   - Scope of work documents

6. **correspondence** - Letters/Communications
   - Emails
   - Letters from/to insured
   - Adjuster notes
   - General documentation

Respond with a JSON object:
{
  "documentType": "<one of: fnol, policy, endorsement, photo, estimate, correspondence>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation of why you classified it this way>",
  "detectedFormCode": "<form code if visible, e.g., 'HO 00 03', 'HO 04 90', or null>",
  "detectedTitle": "<document title if visible, or null>"
}

Key distinguishing factors:
- Policy forms have broad coverage language and are foundational documents
- Endorsements MODIFY policies - they reference what they change
- FNOLs are claim-specific with loss details and reporting info
- Estimates have pricing, line items, quantities
- Correspondence is informal or transactional communication`;

// ============================================
// IMAGE PROCESSING
// ============================================

const MAX_CLASSIFICATION_PAGES = 3;

/**
 * Extract up to 3 pages from a document as base64 images for classification
 */
async function extractPreviewImages(filePath: string, mimeType: string): Promise<string[]> {
  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // For images, just return the file directly as base64 (single image)
  if (mimeType.startsWith('image/')) {
    const buffer = fs.readFileSync(filePath);
    return [buffer.toString('base64')];
  }

  // For PDFs, extract up to 3 pages as images
  if (mimeType === 'application/pdf') {
    const baseName = path.basename(filePath, '.pdf').replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = Date.now();
    const outputPrefix = path.join(TEMP_DIR, `${baseName}-${timestamp}`);

    try {
      // Extract up to 3 pages (-f 1 -l 3)
      await execFileAsync('pdftoppm', ['-png', '-f', '1', '-l', String(MAX_CLASSIFICATION_PAGES), '-r', '150', filePath, outputPrefix]);

      // Find all generated files (pdftoppm adds page number suffix like -1.png, -2.png, -3.png)
      const files = fs.readdirSync(TEMP_DIR);
      const generatedFiles = files
        .filter(f => f.startsWith(`${baseName}-${timestamp}`) && f.endsWith('.png'))
        .sort(); // Sort to ensure page order

      if (generatedFiles.length === 0) {
        throw new Error('PDF conversion produced no output');
      }

      console.log(`[Classification] Extracted ${generatedFiles.length} pages for classification`);

      const base64Images: string[] = [];
      for (const file of generatedFiles) {
        const fullPath = path.join(TEMP_DIR, file);
        const buffer = fs.readFileSync(fullPath);
        base64Images.push(buffer.toString('base64'));

        // Cleanup each file after reading
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      return base64Images;
    } catch (error) {
      console.error('[Classification] PDF conversion error:', error);
      throw new Error(`Failed to convert PDF for classification: ${(error as Error).message}`);
    }
  }

  throw new Error(`Unsupported file type for classification: ${mimeType}`);
}

// ============================================
// CLASSIFICATION
// ============================================

/**
 * Classify a document from a file buffer
 */
export async function classifyDocumentFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ClassificationResult> {
  // Write buffer to temp file
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const ext = path.extname(fileName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
  const tempPath = path.join(TEMP_DIR, `classify-${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tempPath, buffer);
    return await classifyDocumentFromFile(tempPath, mimeType);
  } finally {
    // Cleanup temp file
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Classify a document from a file path
 */
export async function classifyDocumentFromFile(
  filePath: string,
  mimeType: string
): Promise<ClassificationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  console.log(`[Classification] Classifying document: ${filePath} (${mimeType})`);

  // Extract up to 3 pages as images
  const base64Images = await extractPreviewImages(filePath, mimeType);
  const imageMimeType = 'image/png'; // pdftoppm outputs PNG

  console.log(`[Classification] Sending ${base64Images.length} page(s) to AI for classification`);

  // Build content array with all page images
  const contentParts: Array<{ type: 'image_url'; image_url: { url: string; detail: 'high' } } | { type: 'text'; text: string }> = [];

  // Add all page images first
  for (let i = 0; i < base64Images.length; i++) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${imageMimeType};base64,${base64Images[i]}`,
        detail: 'high',
      },
    });
  }

  // Add the text instruction at the end
  contentParts.push({
    type: 'text',
    text: `Classify this insurance document. I'm showing you ${base64Images.length} page(s) from the document. Analyze all pages to determine the document type. Return only the JSON response.`,
  });

  // Call OpenAI Vision
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: CLASSIFICATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: contentParts,
      },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from classification API');
  }

  const result = JSON.parse(content) as ClassificationResult;

  // Validate document type
  const validTypes: ClassifiableDocumentType[] = ['fnol', 'policy', 'endorsement', 'photo', 'estimate', 'correspondence'];
  if (!validTypes.includes(result.documentType)) {
    console.warn(`[Classification] Invalid document type returned: ${result.documentType}, defaulting to correspondence`);
    result.documentType = 'correspondence';
    result.confidence = 0.5;
  }

  console.log(`[Classification] Result: ${result.documentType} (confidence: ${result.confidence}) - ${result.reasoning}`);

  return result;
}

/**
 * Classify a document from Supabase storage
 */
export async function classifyDocumentFromStorage(
  storagePath: string
): Promise<ClassificationResult> {
  const supabase = getSupabaseAdmin();

  // Download file
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download document for classification: ${error?.message || 'No data'}`);
  }

  // Determine mime type from path
  const ext = path.extname(storagePath).toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.pdf') mimeType = 'application/pdf';
  else if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';

  const buffer = Buffer.from(await data.arrayBuffer());
  return classifyDocumentFromBuffer(buffer, mimeType, path.basename(storagePath));
}

// ============================================
// BATCH CLASSIFICATION
// ============================================

export interface BatchClassificationResult {
  fileName: string;
  classification: ClassificationResult;
  error?: string;
}

/**
 * Classify multiple documents in parallel
 */
export async function classifyDocumentsBatch(
  documents: Array<{ buffer: Buffer; mimeType: string; fileName: string }>
): Promise<BatchClassificationResult[]> {
  const results: BatchClassificationResult[] = [];

  // Process in parallel with concurrency limit
  const CONCURRENCY = 4;
  for (let i = 0; i < documents.length; i += CONCURRENCY) {
    const batch = documents.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (doc) => {
        try {
          const classification = await classifyDocumentFromBuffer(doc.buffer, doc.mimeType, doc.fileName);
          return { fileName: doc.fileName, classification };
        } catch (error) {
          return {
            fileName: doc.fileName,
            classification: {
              documentType: 'correspondence' as ClassifiableDocumentType,
              confidence: 0,
              reasoning: 'Classification failed',
            },
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}
