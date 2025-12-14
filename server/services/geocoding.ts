import { pool } from '../db';

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ClaimsIQ/1.0 (claims-iq@example.com)';
const RATE_LIMIT_MS = 1100;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });
}

export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | null> {
  const parts = [address, city, state, zip].filter(Boolean);
  if (parts.length === 0) return null;
  
  const query = encodeURIComponent(parts.join(', '));
  const url = `${NOMINATIM_BASE_URL}/search?q=${query}&format=json&limit=1&countrycodes=us`;
  
  try {
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.error(`Geocoding failed with status ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.length === 0) {
      return null;
    }
    
    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name
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

export interface ClaimMapData {
  id: string;
  claimNumber: string;
  status: string;
  lossType?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  latitude: number;
  longitude: number;
  assignedAdjusterId?: string;
  insuredName?: string;
  dateOfLoss?: Date;
  createdAt: Date;
}

export async function getClaimsForMap(
  organizationId: string,
  options?: {
    assignedAdjusterId?: string;
    status?: string;
    lossType?: string;
  }
): Promise<ClaimMapData[]> {
  const client = await pool.connect();
  
  try {
    const conditions: string[] = [
      'organization_id = $1',
      'property_latitude IS NOT NULL',
      'property_longitude IS NOT NULL'
    ];
    const params: any[] = [organizationId];
    let paramIndex = 2;
    
    if (options?.assignedAdjusterId) {
      conditions.push(`assigned_adjuster_id = $${paramIndex}`);
      params.push(options.assignedAdjusterId);
      paramIndex++;
    }
    
    if (options?.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }
    
    if (options?.lossType) {
      conditions.push(`loss_type = $${paramIndex}`);
      params.push(options.lossType);
      paramIndex++;
    }
    
    const result = await client.query(
      `SELECT id, claim_number, status, loss_type, property_address, property_city, 
              property_state, property_latitude, property_longitude, assigned_adjuster_id,
              insured_name, date_of_loss, created_at
       FROM claims
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );
    
    return result.rows.map(row => ({
      id: row.id,
      claimNumber: row.claim_number,
      status: row.status,
      lossType: row.loss_type,
      propertyAddress: row.property_address,
      propertyCity: row.property_city,
      propertyState: row.property_state,
      latitude: parseFloat(row.property_latitude),
      longitude: parseFloat(row.property_longitude),
      assignedAdjusterId: row.assigned_adjuster_id,
      insuredName: row.insured_name,
      dateOfLoss: row.date_of_loss,
      createdAt: row.created_at
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
         COUNT(*) FILTER (WHERE geocode_status = 'pending' OR geocode_status IS NULL) as pending,
         COUNT(*) FILTER (WHERE geocode_status = 'failed') as failed
       FROM claims
       WHERE organization_id = $1`,
      [organizationId]
    );
    
    return {
      total: parseInt(result.rows[0].total),
      geocoded: parseInt(result.rows[0].geocoded),
      pending: parseInt(result.rows[0].pending),
      failed: parseInt(result.rows[0].failed)
    };
  } finally {
    client.release();
  }
}
