/**
 * Fix Address Duplication Script
 * 
 * This script fixes existing claims where property_address contains the full address
 * including city, state, and zip - which causes duplication when displayed.
 * 
 * The fix extracts just the street address portion from property_address.
 * 
 * Run with: npx tsx scripts/fix-address-duplication.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Parse address to extract just the street portion
 */
function extractStreetAddress(fullAddress: string, city: string | null, state: string | null, zip: string | null): string {
  if (!fullAddress) return fullAddress;
  
  // If address doesn't contain city/state/zip duplicates, return as-is
  const hasCityStateZip = city && state && zip;
  if (!hasCityStateZip) {
    // Try to extract street address from pattern anyway
    const match = fullAddress.match(/^(.+?),\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i);
    if (match) {
      return match[1].trim();
    }
    return fullAddress;
  }
  
  // Check if the address contains the city/state/zip that we already have separately
  const cityPattern = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statePattern = state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const zipPattern = zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern: "Street, City, ST ZIP" or "Street, City, ST ZIP-XXXX"
  const regex = new RegExp(`,\\s*${cityPattern},\\s*${statePattern}\\s+${zipPattern}(?:-\\d{4})?\\s*$`, 'i');
  
  if (regex.test(fullAddress)) {
    // Remove the city, state, zip portion
    return fullAddress.replace(regex, '').trim();
  }
  
  // Alternative: try generic pattern match
  const match = fullAddress.match(/^(.+?),\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i);
  if (match) {
    return match[1].trim();
  }
  
  return fullAddress;
}

async function fixAddressDuplication() {
  console.log('Starting address duplication fix...\n');
  
  // Fetch all claims with property addresses
  const { data: claims, error } = await supabase
    .from('claims')
    .select('id, claim_number, property_address, property_city, property_state, property_zip')
    .not('property_address', 'is', null);
  
  if (error) {
    console.error('Error fetching claims:', error);
    process.exit(1);
  }
  
  if (!claims || claims.length === 0) {
    console.log('No claims found with property addresses.');
    return;
  }
  
  console.log(`Found ${claims.length} claims with property addresses.\n`);
  
  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const claim of claims) {
    const { id, claim_number, property_address, property_city, property_state, property_zip } = claim;
    
    // Check if this address needs fixing (contains city/state/zip pattern at the end)
    const hasTrailingCityStateZip = /,\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i.test(property_address);
    
    if (!hasTrailingCityStateZip) {
      skippedCount++;
      continue;
    }
    
    const streetAddress = extractStreetAddress(property_address, property_city, property_state, property_zip);
    
    if (streetAddress === property_address) {
      skippedCount++;
      continue;
    }
    
    console.log(`Claim ${claim_number}:`);
    console.log(`  Before: "${property_address}"`);
    console.log(`  After:  "${streetAddress}"`);
    console.log(`  City/State/Zip: ${property_city}, ${property_state} ${property_zip}\n`);
    
    // Update the claim
    const { error: updateError } = await supabase
      .from('claims')
      .update({ property_address: streetAddress })
      .eq('id', id);
    
    if (updateError) {
      console.error(`  Error updating claim ${claim_number}:`, updateError);
      errorCount++;
    } else {
      fixedCount++;
    }
  }
  
  console.log('\n--- Summary ---');
  console.log(`Fixed: ${fixedCount}`);
  console.log(`Skipped (already correct): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${claims.length}`);
}

fixAddressDuplication().catch(console.error);
