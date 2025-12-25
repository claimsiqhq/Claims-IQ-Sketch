import { supabaseAdmin } from '../lib/supabaseAdmin';

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_API_KEY || '';

export interface ReverseGeocodeResult {
  formattedAddress: string;
  shortAddress: string; // Just street or locality
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
    
    // Extract a short address (locality or neighborhood)
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
    
    // Fallback to formatted address if no locality found
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

export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | null> {
  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length === 0) return null;
  
  if (!GOOGLE_GEOCODING_API_KEY) {
    console.warn('Google Geocoding API key not configured, skipping geocoding');
    return null;
  }
  
  const addressString = parts.join(', ');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${GOOGLE_GEOCODING_API_KEY}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Google Geocoding failed with status ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.error(`Google Geocoding returned status: ${data.status}`);
      return null;
    }
    
    const result = data.results[0];
    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      displayName: result.formatted_address
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function geocodeClaimAddress(claimId: string): Promise<boolean> {
  try {
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('property_address, property_city, property_state, property_zip, metadata')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      console.error(`Claim ${claimId} not found for geocoding`);
      return false;
    }

    const metadata = claim.metadata || {};

    // Check if already geocoded in metadata
    if (metadata.lat && metadata.lng && metadata.geocoded) {
      return true;
    }

    if (!claim.property_address) {
      // Mark as skipped in metadata
      await supabaseAdmin
        .from('claims')
        .update({
          metadata: { ...metadata, geocodeStatus: 'skipped', geocodedAt: new Date().toISOString() }
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
      // Store coordinates in metadata JSONB field
      const geocodeData = {
        ...metadata,
        lat: result.latitude,
        lng: result.longitude,
        geocoded: true,
        geocodeStatus: 'success',
        geocodedAt: new Date().toISOString()
      };
      await supabaseAdmin
        .from('claims')
        .update({ metadata: geocodeData })
        .eq('id', claimId);
      console.log(`Geocoded claim ${claimId}: ${result.latitude}, ${result.longitude}`);
      return true;
    } else {
      await supabaseAdmin
        .from('claims')
        .update({
          metadata: { ...metadata, geocodeStatus: 'failed', geocodedAt: new Date().toISOString() }
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
          metadata: { geocodeStatus: 'failed', geocodedAt: new Date().toISOString() }
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
  let query = supabaseAdmin
    .from('claims')
    .select('id')
    .not('property_address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Note: Supabase doesn't directly support IS NULL on JSONB fields with ->> notation
  // We'll filter for claims that need geocoding

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: claims, error } = await query;

  if (error || !claims) {
    return 0;
  }

  // Filter for claims that need geocoding (geocodeStatus is null or pending)
  let count = 0;
  for (const row of claims) {
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
    .select('id, claim_id, insured_name, property_address, property_city, property_state, metadata, status, loss_type, date_of_loss, assigned_adjuster_id')
    .eq('organization_id', organizationId)
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

  // Filter for claims that have lat/lng in metadata
  return claims
    .filter(row => {
      const metadata = row.metadata || {};
      return metadata.lat && metadata.lng;
    })
    .map(row => {
      const metadata = row.metadata || {};
      return {
        id: row.id,
        claimNumber: row.claim_id,
        insuredName: row.insured_name,
        address: row.property_address,
        city: row.property_city,
        state: row.property_state,
        lat: parseFloat(metadata.lat) || 0,
        lng: parseFloat(metadata.lng) || 0,
        status: row.status,
        lossType: row.loss_type,
        dateOfLoss: row.date_of_loss
      };
    });
}

export async function getMapStats(organizationId: string): Promise<{
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
}> {
  const { data: claims, error } = await supabaseAdmin
    .from('claims')
    .select('metadata')
    .eq('organization_id', organizationId);

  if (error || !claims) {
    return { total: 0, geocoded: 0, pending: 0, failed: 0 };
  }

  let geocoded = 0;
  let pending = 0;
  let failed = 0;

  for (const claim of claims) {
    const metadata = claim.metadata || {};
    const status = metadata.geocodeStatus;

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
