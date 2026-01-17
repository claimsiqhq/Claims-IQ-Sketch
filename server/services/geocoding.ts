import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'geocoding' });

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_API_KEY || '';

export interface ReverseGeocodeResult {
  formattedAddress: string;
  shortAddress: string;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  if (!GOOGLE_GEOCODING_API_KEY) {
    log.warn('Google Geocoding API key not configured, skipping reverse geocoding');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_GEOCODING_API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      log.error({ status: response.status }, 'Google Reverse Geocoding failed');
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      log.error({ status: data.status }, 'Google Reverse Geocoding returned error status');
      return null;
    }

    const result = data.results[0];
    
    let shortAddress = '';
    for (const component of result.address_components || []) {
      if (component.types.includes('locality')) {
        shortAddress = component.long_name;
        break;
      }
      if (component.types.includes('neighborhood') && !shortAddress) {
        shortAddress = component.long_name;
      }
      if (component.types.includes('sublocality') && !shortAddress) {
        shortAddress = component.long_name;
      }
    }
    
    if (!shortAddress) {
      shortAddress = result.formatted_address.split(',')[0];
    }

    return {
      formattedAddress: result.formatted_address,
      shortAddress
    };
  } catch (error) {
    log.error({ error }, 'Reverse geocoding error');
    return null;
  }
}

// Rate limiting for Nominatim (max 1 request per second)
let lastNominatimRequest = 0;
const NOMINATIM_MIN_DELAY_MS = 1100; // 1.1 seconds between requests

async function geocodeWithNominatim(addressString: string, retryCount = 0): Promise<GeocodeResult | null> {
  // Rate limiting: ensure at least 1.1 seconds between Nominatim requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastNominatimRequest;
  if (timeSinceLastRequest < NOMINATIM_MIN_DELAY_MS) {
    const delay = NOMINATIM_MIN_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastNominatimRequest = Date.now();

  // Try different address formats if first attempt fails
  const addressVariations = [
    addressString, // Original
    addressString.replace(/,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/, ', $1 $2'), // Ensure space between state and zip
    addressString.replace(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/, ', $1, $2'), // Normalize commas
    addressString.split(',').slice(0, -1).join(',').trim(), // Remove zip code
    addressString.split(',').slice(0, 2).join(',').trim(), // Just street and city
  ].filter((addr, index, arr) => addr && arr.indexOf(addr) === index); // Remove duplicates

  for (const addressToTry of addressVariations) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressToTry)}&limit=1&countrycodes=us&addressdetails=1`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClaimsIQ/1.0 (contact: support@claimsiq.com)',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          log.warn('[Geocoding] Nominatim rate limited (429). Waiting before retry...');
          // Wait longer if rate limited
          await new Promise(resolve => setTimeout(resolve, 5000));
          // Retry once if rate limited
          if (retryCount === 0) {
            return geocodeWithNominatim(addressString, 1);
          }
          return null;
        }
        if (addressToTry === addressVariations[0]) {
          log.error({ status: response.status, address: addressToTry }, '[Geocoding] Nominatim failed');
        }
        continue; // Try next variation
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        log.info({ address: addressToTry }, '[Geocoding] Nominatim success');
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          displayName: result.display_name
        };
      }
      
      // If no results and this wasn't the last variation, try next one
      if (addressToTry !== addressVariations[addressVariations.length - 1]) {
        log.debug({ address: addressToTry }, '[Geocoding] No results, trying next variation');
        // Small delay between variations
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
    } catch (error) {
      if (addressToTry === addressVariations[0]) {
        log.error({ error, address: addressToTry }, '[Geocoding] Nominatim error');
      }
      // Continue to next variation
      continue;
    }
  }
  
  log.warn({ address: addressString }, '[Geocoding] Nominatim returned no results for all variations');
  return null;
}

/**
 * Intelligently build address string, avoiding duplication
 * If address already contains city/state/zip, don't add them again
 */
function buildAddressString(address: string, city?: string, state?: string, zip?: string): string {
  if (!address || address.trim() === '') {
    return [city, state, zip].filter(Boolean).join(', ');
  }

  // Normalize the address for comparison
  const addressTrimmed = address.trim();
  const addressLower = addressTrimmed.toLowerCase();
  const cityLower = city?.toLowerCase().trim() || '';
  const stateLower = state?.toLowerCase().trim() || '';
  const zipLower = zip?.toLowerCase().trim() || '';

  // Check if address already contains city, state, or zip
  // City: check if city name appears in address
  const hasCity = cityLower && addressLower.includes(cityLower);
  
  // State: check if state code appears (2-letter codes) or state name
  const statePattern = stateLower ? new RegExp(`\\b${stateLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
  const hasState = stateLower && (statePattern?.test(addressLower) || 
    // Also check for common state abbreviations
    (stateLower.length === 2 && addressLower.match(/\b(co|ca|tx|fl|ny|il|pa|oh|ga|nc|mi|nj|va|wa|az|ma|tn|in|mo|md|wi|mn|sc|al|la|ky|or|ok|ct|ia|ar|ms|ks|ut|nv|nm|wv|ne|id|hi|nh|me|ri|mt|de|sd|nd|ak|dc|vt|wy)\b/i)?.includes(stateLower)));
  
  // Zip: check if zip code appears (with or without dash)
  const zipDigits = zipLower.replace(/-/g, '');
  const hasZip = zipDigits && (
    addressLower.includes(zipDigits) || 
    addressLower.includes(zipLower)
  );

  // If address already contains all parts, use it as-is
  if (hasCity && hasState && hasZip) {
    log.debug({ address: addressTrimmed }, '[Geocoding] Address already contains city/state/zip, using as-is');
    return addressTrimmed;
  }

  // Build address parts intelligently
  const parts: string[] = [addressTrimmed];
  
  // Only add city if not already in address
  if (city && !hasCity) {
    parts.push(city);
  }
  
  // Only add state if not already in address
  if (state && !hasState) {
    parts.push(state);
  }
  
  // Only add zip if not already in address
  if (zip && !hasZip) {
    parts.push(zip);
  }

  const result = parts.filter(Boolean).join(', ');
  log.debug({ result, original: addressTrimmed, city, state, zip }, '[Geocoding] Built address string');
  return result;
}

export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | null> {
  const addressString = buildAddressString(address, city, state, zip);
  
  if (!addressString || addressString.trim() === '') {
    log.warn('[Geocoding] No address parts provided');
    return null;
  }
  
  // Try Google Geocoding first if API key is available
  if (GOOGLE_GEOCODING_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${GOOGLE_GEOCODING_API_KEY}`;
    
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const result = data.results[0];
          log.info({ address: addressString }, '[Geocoding] Google success');
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            displayName: result.formatted_address
          };
        } else {
          log.warn({ status: data.status, errorMessage: data.error_message, address: addressString }, '[Geocoding] Google returned non-OK status');
        }
      } else {
        log.warn({ status: response.status }, '[Geocoding] Google API failed, falling back to Nominatim');
      }
    } catch (error) {
      log.error({ error, address: addressString }, '[Geocoding] Google API error, falling back to Nominatim');
    }
  } else {
    log.debug({ address: addressString }, '[Geocoding] Google API key not configured, using Nominatim');
  }
  
  // Fall back to OpenStreetMap Nominatim (free, no API key required)
  return geocodeWithNominatim(addressString);
}

export async function geocodeClaimAddress(claimId: string): Promise<boolean> {
  try {
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('property_address, property_city, property_state, property_zip, property_latitude, property_longitude, geocode_status')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      log.error({ claimId, error: claimError?.message }, '[Geocoding] Claim not found');
      return false;
    }

    // Already geocoded successfully
    if (claim.property_latitude && claim.property_longitude && claim.geocode_status === 'success') {
      log.debug({ claimId }, '[Geocoding] Claim already geocoded');
      return true;
    }

    // No address to geocode
    if (!claim.property_address || claim.property_address.trim() === '') {
      log.warn({ claimId }, '[Geocoding] Claim has no address, skipping');
      await supabaseAdmin
        .from('claims')
        .update({
          geocode_status: 'skipped',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
      return false;
    }

    // Build the address string that will actually be used
    const addressString = buildAddressString(
      claim.property_address,
      claim.property_city,
      claim.property_state,
      claim.property_zip
    );
    
    log.debug({ claimId, address: addressString }, '[Geocoding] Attempting to geocode claim');
    
    const result = await geocodeAddress(
      claim.property_address,
      claim.property_city,
      claim.property_state,
      claim.property_zip
    );

    if (result) {
      const { error: updateError } = await supabaseAdmin
        .from('claims')
        .update({
          property_latitude: result.latitude,
          property_longitude: result.longitude,
          geocode_status: 'success',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
      
      if (updateError) {
        log.error({ claimId, error: updateError }, '[Geocoding] Failed to save coordinates for claim');
        return false;
      }
      log.info({ claimId, latitude: result.latitude, longitude: result.longitude }, '[Geocoding] Successfully geocoded claim');
      return true;
    } else {
      log.warn({ claimId, address: addressString }, '[Geocoding] Geocoding failed for claim');
      await supabaseAdmin
        .from('claims')
        .update({
          geocode_status: 'failed',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
      return false;
    }
  } catch (error) {
    log.error({ claimId, error }, '[Geocoding] Exception geocoding claim');
    try {
      await supabaseAdmin
        .from('claims')
        .update({
          geocode_status: 'failed',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
    } catch (updateError) {
      log.error({ claimId, error: updateError }, '[Geocoding] Failed to update status for claim');
    }
    return false;
  }
}

const geocodeQueue: string[] = [];
let isProcessingQueue = false;

export function queueGeocoding(claimId: string): void {
  if (!geocodeQueue.includes(claimId)) {
    geocodeQueue.push(claimId);
  }
  
  if (!isProcessingQueue) {
    processQueue();
  }
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue || geocodeQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  log.info({ queueLength: geocodeQueue.length }, '[Geocoding] Processing queue');
  
  while (geocodeQueue.length > 0) {
    const claimId = geocodeQueue.shift();
    if (claimId) {
      try {
        const success = await geocodeClaimAddress(claimId);
        if (success) {
          log.info({ claimId }, '[Geocoding] Successfully geocoded claim');
        } else {
          log.warn({ claimId }, '[Geocoding] Failed to geocode claim');
        }
      } catch (error) {
        log.error({ claimId, error }, '[Geocoding] Exception geocoding claim');
      }
      
      // Add delay between requests to respect rate limits (especially for Nominatim)
      // Only delay if there are more items in queue
      if (geocodeQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2 second delay
      }
    }
  }
  
  log.info('[Geocoding] Queue processing complete');
  isProcessingQueue = false;
}

export async function geocodePendingClaims(organizationId?: string, limit = 100): Promise<number> {
  // Also retry failed/skipped claims since Nominatim might succeed where Google failed
  let query = supabaseAdmin
    .from('claims')
    .select('id, geocode_status')
    .not('property_address', 'is', null)
    .or('geocode_status.is.null,geocode_status.eq.pending,geocode_status.eq.failed,geocode_status.eq.skipped')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: claims, error } = await query;

  log.info({ claimsCount: claims?.length || 0, error: error?.message || null }, '[Geocoding] Query returned claims to process');

  if (error || !claims) {
    log.error({ error }, '[Geocoding] Query error');
    return 0;
  }

  let count = 0;
  for (const row of claims) {
    log.debug({ claimId: row.id, status: row.geocode_status }, '[Geocoding] Queueing claim');
    queueGeocoding(row.id);
    count++;
  }

  return count;
}

export async function getClaimsForMap(organizationId: string, filters?: {
  assignedAdjusterId?: string;
  status?: string;
  lossType?: string;
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('claims')
    .select('id, claim_id, insured_name, property_address, property_city, property_state, property_latitude, property_longitude, status, loss_type, date_of_loss, assigned_adjuster_id')
    .eq('organization_id', organizationId)
    .not('property_latitude', 'is', null)
    .not('property_longitude', 'is', null)
    .order('created_at', { ascending: false });

  if (filters?.assignedAdjusterId) {
    query = query.eq('assigned_adjuster_id', filters.assignedAdjusterId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.lossType) {
    query = query.eq('loss_type', filters.lossType);
  }

  const { data: claims, error } = await query;

  log.info({ organizationId, claimsCount: claims?.length || 0, error: error?.message || null }, '[Map] Query returned claims with coords');
  
  if (error || !claims) {
    log.error({ error }, '[Map] Query error');
    return [];
  }

  return claims.map(row => ({
    id: row.id,
    claimNumber: row.claim_id,
    insuredName: row.insured_name,
    address: row.property_address,
    city: row.property_city,
    state: row.property_state,
    lat: row.property_latitude ? parseFloat(String(row.property_latitude)) : 0,
    lng: row.property_longitude ? parseFloat(String(row.property_longitude)) : 0,
    status: row.status,
    lossType: row.loss_type,
    dateOfLoss: row.date_of_loss
  }));
}

export async function getMapStats(organizationId: string): Promise<{
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
}> {
  const { data: claims, error } = await supabaseAdmin
    .from('claims')
    .select('geocode_status')
    .eq('organization_id', organizationId);

  if (error || !claims) {
    return { total: 0, geocoded: 0, pending: 0, failed: 0 };
  }

  let geocoded = 0;
  let pending = 0;
  let failed = 0;

  for (const claim of claims) {
    const status = claim.geocode_status;

    if (status === 'success') {
      geocoded++;
    } else if (status === 'failed') {
      failed++;
    } else {
      pending++;
    }
  }

  return {
    total: claims.length,
    geocoded,
    pending,
    failed
  };
}
