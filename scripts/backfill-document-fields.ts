/**
 * Backfill script to populate missing fields in documents table
 * 
 * This script:
 * 1. Extracts raw text from PDFs using pdftotext
 * 2. Populates full_text, page_texts, page_count
 * 3. Populates category and description based on document type and extracted data
 * 
 * Usage: npx tsx scripts/backfill-document-fields.ts
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), 'document-backfill');

/**
 * Extract raw text from PDF using pdftotext
 */
async function extractRawTextFromPDF(pdfPath: string): Promise<{ fullText: string; pageTexts: string[]; pageCount: number }> {
  try {
    // Get page count first
    let pageCount = 1;
    try {
      const { stdout } = await execAsync(`pdfinfo "${pdfPath}"`);
      const pageMatch = stdout.match(/Pages:\s*(\d+)/);
      if (pageMatch) {
        pageCount = parseInt(pageMatch[1]);
      }
    } catch (e) {
      console.warn(`[extractRawTextFromPDF] Could not get PDF page count for ${pdfPath}, defaulting to 1`);
    }

    // Extract text per page
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const { stdout } = await execAsync(`pdftotext -f ${pageNum} -l ${pageNum} "${pdfPath}" -`);
        pageTexts.push(stdout || '');
      } catch (e) {
        console.warn(`[extractRawTextFromPDF] Failed to extract text from page ${pageNum} of ${pdfPath}`);
        pageTexts.push('');
      }
    }

    const fullText = pageTexts.join('\n\n--- Page Break ---\n\n');
    return { fullText, pageTexts, pageCount };
  } catch (error) {
    console.error(`[extractRawTextFromPDF] Error processing ${pdfPath}:`, error);
    return { fullText: '', pageTexts: [], pageCount: 0 };
  }
}

/**
 * Download document from Supabase storage
 */
async function downloadDocument(storagePath: string): Promise<string> {
  const { getSupabaseAdmin, DOCUMENTS_BUCKET } = await import('../server/lib/supabase');
  const supabaseClient = getSupabaseAdmin();

  const { data, error } = await supabaseClient.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download: ${error?.message || 'No data returned'}`);
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

/**
 * Determine category and description from document data
 */
function getCategoryAndDescription(
  docType: string,
  extractedData: any
): { category: string | null; description: string | null } {
  let category: string | null = null;
  let description: string | null = null;

  switch (docType) {
    case 'fnol':
      category = 'fnol';
      const claimNumber = extractedData?.claim_information_report?.claim_number;
      description = claimNumber 
        ? `FNOL for claim ${claimNumber}`
        : 'First Notice of Loss document';
      break;

    case 'policy':
      category = 'policy';
      const formCode = extractedData?.form_code;
      const formName = extractedData?.form_name;
      description = formCode 
        ? `${formName || 'Policy Form'} (${formCode})`
        : formName || 'Policy document';
      break;

    case 'endorsement':
      category = 'endorsement';
      const endorsements = extractedData?.endorsements || [];
      const firstEndorsement = Array.isArray(endorsements) ? endorsements[0] : null;
      if (firstEndorsement?.form_code) {
        description = `${firstEndorsement.title || 'Endorsement'} (${firstEndorsement.form_code})`;
      } else if (firstEndorsement?.title) {
        description = firstEndorsement.title;
      } else {
        description = 'Endorsement document';
      }
      break;

    case 'photo':
      category = 'photos';
      description = 'Photo document';
      break;

    default:
      category = null;
      description = null;
  }

  return { category, description };
}

/**
 * Backfill a single document
 */
async function backfillDocument(doc: any): Promise<void> {
  const { id, storage_path, mime_type, type, extracted_data, full_text, page_texts, page_count, category, description } = doc;

  // Skip if all fields are already populated
  if (full_text && page_texts && page_count && category && description) {
    console.log(`[SKIP] Document ${id} already has all fields populated`);
    return;
  }

  console.log(`[PROCESSING] Document ${id} (${type}, ${mime_type})`);

  let updates: any = {};

  // Extract text from PDF if it's a PDF and missing text
  if (mime_type === 'application/pdf' && (!full_text || !page_texts || !page_count)) {
    try {
      console.log(`  Downloading PDF from storage: ${storage_path}`);
      const tempPath = await downloadDocument(storage_path);
      
      console.log(`  Extracting text from PDF...`);
      const textData = await extractRawTextFromPDF(tempPath);
      
      if (textData.fullText) {
        updates.full_text = textData.fullText;
        updates.page_texts = textData.pageTexts;
        updates.page_count = textData.pageCount;
        console.log(`  Extracted ${textData.pageCount} pages, ${textData.fullText.length} chars`);
      }

      // Cleanup temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (error) {
      console.error(`  Error extracting text from PDF:`, error);
    }
  } else if (mime_type?.startsWith('image/')) {
    // Images don't have extractable text, but should have page_count = 1
    if (!page_count) {
      updates.page_count = 1;
    }
  }

  // Populate category and description from extracted data
  if (!category || !description) {
    const { category: newCategory, description: newDescription } = getCategoryAndDescription(type, extracted_data);
    if (newCategory && !category) {
      updates.category = newCategory;
    }
    if (newDescription && !description) {
      updates.description = newDescription;
    }
  }

  // Update document if we have any changes
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('documents')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error(`  Error updating document ${id}:`, error);
    } else {
      console.log(`  Updated document ${id} with:`, Object.keys(updates).join(', '));
    }
  } else {
    console.log(`  No updates needed for document ${id}`);
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('Starting document fields backfill...\n');

  try {
    // Get all documents that are missing fields
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('id, storage_path, mime_type, type, extracted_data, full_text, page_texts, page_count, category, description')
      .or('full_text.is.null,page_texts.is.null,page_count.is.null,category.is.null,description.is.null')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found that need backfilling.');
      return;
    }

    console.log(`Found ${documents.length} documents to process\n`);

    let processed = 0;
    let errors = 0;

    for (const doc of documents) {
      try {
        await backfillDocument(doc);
        processed++;
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error);
        errors++;
      }
    }

    console.log(`\nBackfill complete!`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total: ${documents.length}`);

  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
      try {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to cleanup temp directory:', e);
      }
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as backfillDocumentFields };
