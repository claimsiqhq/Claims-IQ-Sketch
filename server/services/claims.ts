import { pool } from '../db';

export interface ClaimWithDocuments {
  id: string;
  organizationId: string;
  claimId: string; // Format: XX-XXX-XXXXXX or claim_number
  claimNumber?: string; // Display claim number
  carrierId?: string;
  policyNumber?: string;
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM or date
  claimType?: string;
  status: string;
  regionId?: string;
  policyholder?: string; // Also known as insured_name
  insuredName?: string;
  riskLocation?: string; // Full address string
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  causeOfLoss?: string; // Also known as loss_type
  lossType?: string;
  lossDescription?: string;
  state?: string; // State code (e.g., CO)
  yearRoofInstall?: string; // Format: MM-DD-YYYY
  windHailDeductible?: string; // Format: $X,XXX X%
  dwellingLimit?: string; // Format: $XXX,XXX
  coverageA?: string;
  coverageB?: string;
  coverageC?: string;
  coverageD?: string;
  deductible?: string;
  endorsementsListed?: string[]; // JSONB array of endorsement codes
  assignedAdjusterId?: string;
  totalRcv?: string;
  totalAcv?: string;
  totalPaid?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  documentCount?: number;
  estimateCount?: number;
}

/**
 * Map database row to ClaimWithDocuments (converts snake_case to camelCase)
 * Uses actual database column names from the claims table
 */
function mapRowToClaim(row: any): ClaimWithDocuments {
  // Build risk location from individual address parts if present
  const riskLocation = row.property_address 
    ? [row.property_address, row.property_city, row.property_state, row.property_zip].filter(Boolean).join(', ')
    : row.risk_location;
    
  return {
    id: row.id,
    organizationId: row.organization_id,
    claimId: row.claim_number || row.claim_id, // claim_number is the actual DB column
    claimNumber: row.claim_number,
    carrierId: row.carrier_id,
    policyNumber: row.policy_number,
    dateOfLoss: row.date_of_loss,
    claimType: row.claim_type,
    status: row.status,
    regionId: row.region_id,
    policyholder: row.insured_name || row.policyholder, // insured_name is actual DB column
    insuredName: row.insured_name,
    riskLocation: riskLocation,
    propertyAddress: row.property_address,
    propertyCity: row.property_city,
    propertyState: row.property_state,
    propertyZip: row.property_zip,
    causeOfLoss: row.loss_type || row.cause_of_loss, // loss_type is actual DB column
    lossType: row.loss_type,
    lossDescription: row.loss_description,
    state: row.property_state || row.state,
    yearRoofInstall: row.year_roof_install,
    windHailDeductible: row.wind_hail_deductible,
    dwellingLimit: row.dwelling_limit,
    coverageA: row.coverage_a,
    coverageB: row.coverage_b,
    coverageC: row.coverage_c,
    coverageD: row.coverage_d,
    deductible: row.deductible,
    endorsementsListed: row.endorsements_listed,
    assignedAdjusterId: row.assigned_adjuster_id,
    totalRcv: row.total_rcv,
    totalAcv: row.total_acv,
    totalPaid: row.total_paid,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    documentCount: row.document_count ? parseInt(row.document_count) : undefined,
    estimateCount: row.estimate_count ? parseInt(row.estimate_count) : undefined
  };
}

/**
 * Generate unique claim number in format XX-XXX-XXXXXX
 */
async function generateClaimNumber(organizationId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const year = new Date().getFullYear();
    const result = await client.query(
      `SELECT COUNT(*) + 1 as next_num FROM claims
       WHERE organization_id = $1
       AND EXTRACT(YEAR FROM created_at) = $2`,
      [organizationId, year]
    );
    const seq = String(result.rows[0].next_num).padStart(6, '0');
    return `01-${String(year).slice(-3)}-${seq}`;
  } finally {
    client.release();
  }
}

/**
 * Create a new claim
 * Only uses columns that exist in the actual claims table
 */
export async function createClaim(
  organizationId: string,
  data: {
    claimNumber?: string;
    policyNumber?: string;
    dateOfLoss?: string;
    claimType?: string;
    status?: string;
    insuredName?: string;
    lossType?: string;
    lossDescription?: string;
    propertyAddress?: string;
    propertyCity?: string;
    propertyState?: string;
    propertyZip?: string;
    coverageA?: number;
    coverageB?: number;
    coverageC?: number;
    coverageD?: number;
    deductible?: number;
    assignedAdjusterId?: string;
    metadata?: Record<string, any>;
  }
): Promise<ClaimWithDocuments> {
  const client = await pool.connect();
  try {
    const claimNumber = data.claimNumber || await generateClaimNumber(organizationId);

    const result = await client.query(
      `INSERT INTO claims (
        organization_id, claim_number, policy_number,
        date_of_loss, claim_type, status,
        insured_name, loss_type, loss_description,
        property_address, property_city, property_state, property_zip,
        coverage_a, coverage_b, coverage_c, coverage_d, deductible,
        assigned_adjuster_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        organizationId,
        claimNumber,
        data.policyNumber || null,
        data.dateOfLoss || null,
        data.claimType || null,
        data.status || 'fnol',
        data.insuredName || null,
        data.lossType || null,
        data.lossDescription || null,
        data.propertyAddress || null,
        data.propertyCity || null,
        data.propertyState || null,
        data.propertyZip || null,
        data.coverageA || null,
        data.coverageB || null,
        data.coverageC || null,
        data.coverageD || null,
        data.deductible || null,
        data.assignedAdjusterId || null,
        JSON.stringify(data.metadata || {})
      ]
    );

    return mapRowToClaim(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Get claim by ID (with tenant check)
 */
export async function getClaim(
  id: string,
  organizationId: string
): Promise<ClaimWithDocuments | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM documents WHERE claim_id = c.id) as document_count,
         (SELECT COUNT(*) FROM estimates WHERE claim_id = c.id) as estimate_count
       FROM claims c
       WHERE c.id = $1 AND c.organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) return null;
    return mapRowToClaim(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * List claims for organization
 */
export async function listClaims(
  organizationId: string,
  options?: {
    status?: string;
    lossType?: string;
    assignedAdjusterId?: string;
    search?: string;
    limit?: number;
    offset?: number;
    includeClosed?: boolean;
  }
): Promise<{ claims: ClaimWithDocuments[]; total: number }> {
  const client = await pool.connect();
  try {
    const conditions: string[] = ['c.organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // By default, exclude closed claims unless explicitly requested
    if (!options?.includeClosed && !options?.status) {
      conditions.push(`c.status != 'closed'`);
    }

    if (options?.status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }
    if (options?.lossType) {
      conditions.push(`c.loss_type = $${paramIndex}`);
      params.push(options.lossType);
      paramIndex++;
    }
    if (options?.assignedAdjusterId) {
      conditions.push(`c.assigned_adjuster_id = $${paramIndex}`);
      params.push(options.assignedAdjusterId);
      paramIndex++;
    }
    if (options?.search) {
      conditions.push(`(
        c.claim_number ILIKE $${paramIndex} OR
        c.policy_number ILIKE $${paramIndex} OR
        c.insured_name ILIKE $${paramIndex} OR
        c.property_address ILIKE $${paramIndex}
      )`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM claims c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get claims with counts
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await client.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM documents WHERE claim_id = c.id) as document_count,
         (SELECT COUNT(*) FROM estimates WHERE claim_id = c.id) as estimate_count
       FROM claims c
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const claims = result.rows.map(mapRowToClaim);
    return { claims, total };
  } finally {
    client.release();
  }
}

/**
 * Update claim
 */
export async function updateClaim(
  id: string,
  organizationId: string,
  updates: Partial<{
    claimId: string;
    policyNumber: string;
    dateOfLoss: string;
    claimType: string;
    status: string;
    policyholder: string;
    riskLocation: string;
    causeOfLoss: string;
    lossDescription: string;
    state: string;
    yearRoofInstall: string;
    windHailDeductible: string;
    dwellingLimit: string;
    endorsementsListed: string[];
    assignedAdjusterId: string;
    totalRcv: string;
    totalAcv: string;
    totalPaid: string;
    metadata: Record<string, any>;
  }>
): Promise<ClaimWithDocuments | null> {
  const client = await pool.connect();
  try {
    // Verify claim exists and belongs to org
    const existing = await client.query(
      `SELECT id FROM claims WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (existing.rows.length === 0) return null;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Map camelCase field names to actual database column names
    // Only includes columns that exist in the claims table
    const fieldMap: Record<string, string> = {
      claimId: 'claim_number',
      claimNumber: 'claim_number',
      policyNumber: 'policy_number',
      dateOfLoss: 'date_of_loss',
      claimType: 'claim_type',
      status: 'status',
      policyholder: 'insured_name',
      insuredName: 'insured_name',
      causeOfLoss: 'loss_type',
      lossType: 'loss_type',
      lossDescription: 'loss_description',
      propertyAddress: 'property_address',
      propertyCity: 'property_city',
      propertyState: 'property_state',
      propertyZip: 'property_zip',
      coverageA: 'coverage_a',
      coverageB: 'coverage_b',
      coverageC: 'coverage_c',
      coverageD: 'coverage_d',
      deductible: 'deductible',
      assignedAdjusterId: 'assigned_adjuster_id',
      totalRcv: 'total_rcv',
      totalAcv: 'total_acv',
      totalPaid: 'total_paid',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        setClauses.push(`${column} = $${paramIndex}`);
        params.push((updates as any)[key]);
        paramIndex++;
      }
    }

    // Handle endorsementsListed as JSONB
    if (updates.endorsementsListed !== undefined) {
      setClauses.push(`endorsements_listed = $${paramIndex}`);
      params.push(JSON.stringify(updates.endorsementsListed));
      paramIndex++;
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(updates.metadata));
      paramIndex++;
    }

    // Handle status change to closed
    if (updates.status === 'closed') {
      setClauses.push(`closed_at = NOW()`);
    }

    if (setClauses.length === 0) {
      return getClaim(id, organizationId);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id, organizationId);

    await client.query(
      `UPDATE claims SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}`,
      params
    );

    return getClaim(id, organizationId);
  } finally {
    client.release();
  }
}

/**
 * Delete claim (soft delete by setting status)
 */
export async function deleteClaim(
  id: string,
  organizationId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE claims SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}

/**
 * Get claim statistics for organization
 */
export async function getClaimStats(organizationId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byLossType: Record<string, number>;
  totalRcv: number;
  totalAcv: number;
}> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CAST(total_rcv AS DECIMAL)), 0) as total_rcv,
         COALESCE(SUM(CAST(total_acv AS DECIMAL)), 0) as total_acv
       FROM claims WHERE organization_id = $1 AND status != 'deleted'`,
      [organizationId]
    );

    const statusResult = await client.query(
      `SELECT status, COUNT(*) as count FROM claims
       WHERE organization_id = $1 AND status != 'deleted'
       GROUP BY status`,
      [organizationId]
    );

    const lossTypeResult = await client.query(
      `SELECT loss_type, COUNT(*) as count FROM claims
       WHERE organization_id = $1 AND status != 'deleted' AND loss_type IS NOT NULL
       GROUP BY loss_type`,
      [organizationId]
    );

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count);
    });

    const byLossType: Record<string, number> = {};
    lossTypeResult.rows.forEach(row => {
      byLossType[row.loss_type] = parseInt(row.count);
    });

    return {
      total: parseInt(result.rows[0].total),
      byStatus,
      byLossType,
      totalRcv: parseFloat(result.rows[0].total_rcv),
      totalAcv: parseFloat(result.rows[0].total_acv)
    };
  } finally {
    client.release();
  }
}
