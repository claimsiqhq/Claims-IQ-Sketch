import { supabaseAdmin } from '../lib/supabaseAdmin';

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
    console.warn('Google Geocoding API key not configured, skipping reverse geocoding');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_GEOCODING_API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Google Reverse Geocoding failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.error(`Google Reverse Geocoding returned status: ${data.status}`);
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
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

async function geocodeWithNominatim(addressString: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}&limit=1&countrycodes=us`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ClaimsIQ/1.0 (claims-management-system)'
      }
    });
    
    if (!response.ok) {
      console.error(`Nominatim Geocoding failed with status ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`Nominatim Geocoding returned no results for: ${addressString}`);
      return null;
    }
    
    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name
    };
  } catch (error) {
    console.error('Nominatim geocoding error:', error);
    return null;
  }
}

export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | null> {
  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length === 0) return null;
  
  const addressString = parts.join(', ');
  
  // Try Google Geocoding first if API key is available
  if (GOOGLE_GEOCODING_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${GOOGLE_GEOCODING_API_KEY}`;
    
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const result = data.results[0];
          return {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng,
            displayName: result.formatted_address
          };
        }
      }
    } catch (error) {
      console.error('Google geocoding error, falling back to Nominatim:', error);
    }
  }
  
  // Fall back to OpenStreetMap Nominatim (free, no API key required)
  console.log('[Geocoding] Using Nominatim for:', addressString);
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
      console.error(`Claim ${claimId} not found for geocoding`);
      return false;
    }

    if (claim.property_latitude && claim.property_longitude && claim.geocode_status === 'success') {
      return true;
    }

    if (!claim.property_address) {
      await supabaseAdmin
        .from('claims')
        .update({
          geocode_status: 'skipped',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
      return false;
    }

    const result = await geocodeAddress(
      claim.property_address,
      claim.property_city,
      claim.property_state,
      claim.property_zip
    );

    if (result) {
      await supabaseAdmin
        .from('claims')
        .update({
          property_latitude: result.latitude,
          property_longitude: result.longitude,
          geocode_status: 'success',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
      console.log(`Geocoded claim ${claimId}: ${result.latitude}, ${result.longitude}`);
      return true;
    } else {
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
    console.error(`Error geocoding claim ${claimId}:`, error);
    try {
      await supabaseAdmin
        .from('claims')
        .update({
          geocode_status: 'failed',
          geocoded_at: new Date().toISOString()
        })
        .eq('id', claimId);
    } catch {
      // Ignore update error
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
  
  while (geocodeQueue.length > 0) {
    const claimId = geocodeQueue.shift();
    if (claimId) {
      try {
        await geocodeClaimAddress(claimId);
      } catch (error) {
        console.error(`Failed to geocode claim ${claimId}:`, error);
      }
    }
  }
  
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

  console.log(`[Geocoding] Query returned ${claims?.length || 0} claims to process (error: ${error?.message || 'none'})`);

  if (error || !claims) {
    console.error('[Geocoding] Query error:', error);
    return 0;
  }

  let count = 0;
  for (const row of claims) {
    console.log(`[Geocoding] Queueing claim ${row.id} (status: ${row.geocode_status})`);
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

  if (error || !claims) {
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
