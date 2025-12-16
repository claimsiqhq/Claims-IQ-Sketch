import { pool } from '../db';

export interface ClaimWithDocuments {
  id: string;
  organizationId: string;
  claimId: string; // Format: XX-XXX-XXXXXX (renamed from claim_number)
  carrierId?: string;
  policyNumber?: string;
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM (now VARCHAR)
  claimType?: string;
  status: string;
  regionId?: string;
  policyholder?: string; // Renamed from insured_name
  riskLocation?: string; // Replaces property_address, city, state, zip
  causeOfLoss?: string; // Renamed from loss_type
  lossDescription?: string;
  state?: string; // State code (e.g., CO)
  yearRoofInstall?: string; // Format: MM-DD-YYYY
  windHailDeductible?: string; // Format: $X,XXX X%
  dwellingLimit?: string; // Format: $XXX,XXX
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
 */
function mapRowToClaim(row: any): ClaimWithDocuments {
  return {
    id: row.id,
    organizationId: row.organization_id,
    claimId: row.claim_id, // Renamed from claim_number
    carrierId: row.carrier_id,
    policyNumber: row.policy_number,
    dateOfLoss: row.date_of_loss,
    claimType: row.claim_type,
    status: row.status,
    regionId: row.region_id,
    policyholder: row.policyholder, // Renamed from insured_name
    riskLocation: row.risk_location, // Replaces property_address fields
    causeOfLoss: row.cause_of_loss, // Renamed from loss_type
    lossDescription: row.loss_description,
    state: row.state,
    yearRoofInstall: row.year_roof_install,
    windHailDeductible: row.wind_hail_deductible,
    dwellingLimit: row.dwelling_limit,
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
 */
export async function createClaim(
  organizationId: string,
  data: {
    claimId?: string;
    policyNumber?: string;
    dateOfLoss?: string;
    claimType?: string;
    status?: string;
    policyholder?: string;
    riskLocation?: string;
    causeOfLoss?: string;
    lossDescription?: string;
    state?: string;
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
    assignedAdjusterId?: string;
    metadata?: Record<string, any>;
  }
): Promise<ClaimWithDocuments> {
  const client = await pool.connect();
  try {
    const claimId = data.claimId || await generateClaimNumber(organizationId);

    const result = await client.query(
      `INSERT INTO claims (
        organization_id, claim_id, policy_number,
        date_of_loss, claim_type, status,
        policyholder, risk_location, cause_of_loss, loss_description,
        state, year_roof_install, wind_hail_deductible, dwelling_limit,
        endorsements_listed, assigned_adjuster_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        organizationId,
        claimId,
        data.policyNumber || null,
        data.dateOfLoss || null,
        data.claimType || null,
        data.status || 'fnol',
        data.policyholder || null,
        data.riskLocation || null,
        data.causeOfLoss || null,
        data.lossDescription || null,
        data.state || null,
        data.yearRoofInstall || null,
        data.windHailDeductible || null,
        data.dwellingLimit || null,
        JSON.stringify(data.endorsementsListed || []),
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
  }
): Promise<{ claims: ClaimWithDocuments[]; total: number }> {
  const client = await pool.connect();
  try {
    const conditions: string[] = ['c.organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (options?.status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }
    if (options?.lossType) {
      conditions.push(`c.cause_of_loss = $${paramIndex}`);
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
        c.claim_id ILIKE $${paramIndex} OR
        c.policy_number ILIKE $${paramIndex} OR
        c.policyholder ILIKE $${paramIndex} OR
        c.risk_location ILIKE $${paramIndex}
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

    const fieldMap: Record<string, string> = {
      claimId: 'claim_id',
      policyNumber: 'policy_number',
      dateOfLoss: 'date_of_loss',
      claimType: 'claim_type',
      status: 'status',
      policyholder: 'policyholder',
      riskLocation: 'risk_location',
      causeOfLoss: 'cause_of_loss',
      lossDescription: 'loss_description',
      state: 'state',
      yearRoofInstall: 'year_roof_install',
      windHailDeductible: 'wind_hail_deductible',
      dwellingLimit: 'dwelling_limit',
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
      `SELECT cause_of_loss, COUNT(*) as count FROM claims
       WHERE organization_id = $1 AND status != 'deleted' AND cause_of_loss IS NOT NULL
       GROUP BY cause_of_loss`,
      [organizationId]
    );

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count);
    });

    const byLossType: Record<string, number> = {};
    lossTypeResult.rows.forEach(row => {
      byLossType[row.cause_of_loss] = parseInt(row.count);
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
