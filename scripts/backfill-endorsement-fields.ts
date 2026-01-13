/**
 * Backfill script to populate missing fields in endorsement_extractions table
 * 
 * This script:
 * 1. Populates raw_text from the linked document's full_text field
 * 2. Extracts jurisdiction and edition_date from extraction_data if available
 * 
 * Usage: npx tsx scripts/backfill-endorsement-fields.ts
 */

import { supabaseAdmin } from '../server/lib/supabaseAdmin';

/**
 * Extract jurisdiction and edition_date from extraction_data
 */
function extractFieldsFromExtractionData(extractionData: any): {
  jurisdiction: string | null;
  editionDate: string | null;
} {
  let jurisdiction: string | null = null;
  let editionDate: string | null = null;

  if (extractionData) {
    // Try direct fields first
    jurisdiction = extractionData.jurisdiction || null;
    editionDate = extractionData.edition_date || null;

    // If not found, try nested structures
    if (!jurisdiction && extractionData.definitions_modified) {
      // Some endorsements have jurisdiction in definitions_modified
      // This is less common but worth checking
    }

    // Check if there's a colorado_amendatory_endorsement or similar nested structure
    if (!jurisdiction && extractionData.colorado_amendatory_endorsement) {
      jurisdiction = 'Colorado';
    }
  }

  return { jurisdiction, editionDate };
}

/**
 * Backfill a single endorsement extraction
 */
async function backfillEndorsement(ee: any): Promise<void> {
  const {
    id,
    document_id,
    raw_text,
    jurisdiction,
    edition_date,
    extraction_data,
  } = ee;

  // Skip if all fields are already populated
  if (raw_text && jurisdiction && edition_date) {
    console.log(`[SKIP] Endorsement ${id} already has all fields populated`);
    return;
  }

  console.log(`[PROCESSING] Endorsement ${id} (form_code: ${ee.form_code})`);

  let updates: any = {};

  // Get raw_text from linked document if missing
  if (!raw_text && document_id) {
    try {
      const { data: docData, error } = await supabaseAdmin
        .from('documents')
        .select('full_text')
        .eq('id', document_id)
        .single();

      if (!error && docData?.full_text) {
        updates.raw_text = docData.full_text;
        console.log(`  Found raw_text from document: ${docData.full_text.length} chars`);
      } else {
        console.log(`  No full_text found in linked document ${document_id}`);
      }
    } catch (error) {
      console.error(`  Error fetching document ${document_id}:`, error);
    }
  }

  // Extract jurisdiction and edition_date from extraction_data
  if ((!jurisdiction || !edition_date) && extraction_data) {
    const { jurisdiction: extractedJurisdiction, editionDate: extractedEditionDate } =
      extractFieldsFromExtractionData(extraction_data);

    if (extractedJurisdiction && !jurisdiction) {
      updates.jurisdiction = extractedJurisdiction;
      console.log(`  Extracted jurisdiction: ${extractedJurisdiction}`);
    }

    if (extractedEditionDate && !edition_date) {
      updates.edition_date = extractedEditionDate;
      console.log(`  Extracted edition_date: ${extractedEditionDate}`);
    }
  }

  // Update endorsement extraction if we have any changes
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('endorsement_extractions')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error(`  Error updating endorsement ${id}:`, error);
    } else {
      console.log(`  Updated endorsement ${id} with:`, Object.keys(updates).join(', '));
    }
  } else {
    console.log(`  No updates needed for endorsement ${id}`);
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('Starting endorsement_extractions fields backfill...\n');

  try {
    // Get all endorsement extractions that are missing fields
    const { data: endorsements, error } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('id, document_id, raw_text, jurisdiction, edition_date, extraction_data, form_code')
      .or('raw_text.is.null,jurisdiction.is.null,edition_date.is.null')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch endorsement extractions: ${error.message}`);
    }

    if (!endorsements || endorsements.length === 0) {
      console.log('No endorsement extractions found that need backfilling.');
      return;
    }

    console.log(`Found ${endorsements.length} endorsement extractions to process\n`);

    let processed = 0;
    let errors = 0;

    for (const ee of endorsements) {
      try {
        await backfillEndorsement(ee);
        processed++;
      } catch (error) {
        console.error(`Error processing endorsement ${ee.id}:`, error);
        errors++;
      }
    }

    console.log(`\nBackfill complete!`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total: ${endorsements.length}`);

  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main as backfillEndorsementFields };
