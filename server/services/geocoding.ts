import { pool } from '../db';

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_API_KEY || '';

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
  const client = await pool.connect();
  
  try {
    const claimResult = await client.query(
      `SELECT property_address, property_city, property_state, property_zip,
              property_latitude, property_longitude, geocode_status
       FROM claims WHERE id = $1`,
      [claimId]
    );
    
    if (claimResult.rows.length === 0) {
      console.error(`Claim ${claimId} not found for geocoding`);
      return false;
    }
    
    const claim = claimResult.rows[0];
    
    if (claim.property_latitude && claim.property_longitude && claim.geocode_status === 'success') {
      return true;
    }
    
    if (!claim.property_address) {
      await client.query(
        `UPDATE claims SET geocode_status = 'skipped', geocoded_at = NOW() WHERE id = $1`,
        [claimId]
      );
      return false;
    }
    
    const result = await geocodeAddress(
      claim.property_address,
      claim.property_city,
      claim.property_state,
      claim.property_zip
    );
    
    if (result) {
      await client.query(
        `UPDATE claims 
         SET property_latitude = $1, property_longitude = $2, 
             geocode_status = 'success', geocoded_at = NOW()
         WHERE id = $3`,
        [result.latitude, result.longitude, claimId]
      );
      console.log(`Geocoded claim ${claimId}: ${result.latitude}, ${result.longitude}`);
      return true;
    } else {
      await client.query(
        `UPDATE claims SET geocode_status = 'failed', geocoded_at = NOW() WHERE id = $1`,
        [claimId]
      );
      return false;
    }
  } catch (error) {
    console.error(`Error geocoding claim ${claimId}:`, error);
    await client.query(
      `UPDATE claims SET geocode_status = 'failed', geocoded_at = NOW() WHERE id = $1`,
      [claimId]
    ).catch(() => {});
    return false;
  } finally {
    client.release();
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
  const client = await pool.connect();
  
  try {
    let query = `
      SELECT id FROM claims 
      WHERE (geocode_status = 'pending' OR geocode_status IS NULL)
        AND property_address IS NOT NULL
    `;
    const params: any[] = [];
    
    if (organizationId) {
      query += ` AND organization_id = $1`;
      params.push(organizationId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ${limit}`;
    
    const result = await client.query(query, params);
    
    for (const row of result.rows) {
      queueGeocoding(row.id);
    }
    
    return result.rows.length;
  } finally {
    client.release();
  }
}

export async function getClaimsForMap(organizationId: string, filters?: {
  assignedAdjusterId?: string;
  status?: string;
  lossType?: string;
}): Promise<any[]> {
  const client = await pool.connect();
  
  try {
    let query = `SELECT id, claim_number, insured_name, property_address, property_city, property_state,
              property_latitude, property_longitude, status, loss_type, date_of_loss, assigned_adjuster_id
       FROM claims 
       WHERE organization_id = $1 
         AND property_latitude IS NOT NULL 
         AND property_longitude IS NOT NULL`;
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (filters?.assignedAdjusterId) {
      query += ` AND assigned_adjuster_id = $${paramIndex}`;
      params.push(filters.assignedAdjusterId);
      paramIndex++;
    }
    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    if (filters?.lossType) {
      query += ` AND loss_type = $${paramIndex}`;
      params.push(filters.lossType);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await client.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      claimNumber: row.claim_number,
      insuredName: row.insured_name,
      address: row.property_address,
      city: row.property_city,
      state: row.property_state,
      lat: parseFloat(row.property_latitude),
      lng: parseFloat(row.property_longitude),
      status: row.status,
      lossType: row.loss_type,
      dateOfLoss: row.date_of_loss
    }));
  } finally {
    client.release();
  }
}

export async function getMapStats(organizationId: string): Promise<{
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
}> {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE geocode_status = 'success') as geocoded,
        COUNT(*) FILTER (WHERE geocode_status IS NULL OR geocode_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE geocode_status = 'failed') as failed
       FROM claims 
       WHERE organization_id = $1`,
      [organizationId]
    );
    
    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      geocoded: parseInt(row.geocoded),
      pending: parseInt(row.pending),
      failed: parseInt(row.failed)
    };
  } finally {
    client.release();
  }
}
