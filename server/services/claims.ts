import { pool } from '../db';

export interface ClaimWithDocuments {
  id: string;
  organizationId: string;
  // Claim identifier
  claimId: string; // Format: XX-XXX-XXXXXX (alias for claimNumber)
  claimNumber?: string;
  carrierId?: string;
  regionId?: string;
  // Policyholder info (from FNOL)
  policyholder?: string; // Alias for insuredName
  insuredName?: string;
  insuredEmail?: string;
  insuredPhone?: string;
  // Property/Risk location (from FNOL)
  riskLocation?: string; // Computed from property fields
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  // Loss details (from FNOL)
  dateOfLoss?: string;
  causeOfLoss?: string; // Alias for lossType
  lossType?: string;
  lossDescription?: string;
  // Policy details (from FNOL)
  policyNumber?: string;
  claimType?: string;
  state?: string; // Alias for propertyState
  yearRoofInstall?: string; // Format: "01-01-2016"
  windHailDeductible?: string; // Format: "$7,932 1%"
  dwellingLimit?: string; // Format: "$793,200"
  endorsementsListed?: string[]; // Array of endorsement codes from FNOL
  // Coverage amounts
  coverageA?: string;
  coverageB?: string;
  coverageC?: string;
  coverageD?: string;
  deductible?: string;
  // Status
  status: string;
  assignedAdjusterId?: string;
  // Totals
  totalRcv?: string;
  totalAcv?: string;
  totalPaid?: string;
  // Metadata
  metadata?: Record<string, any>;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  // Counts
  documentCount?: number;
  estimateCount?: number;
}

/**
 * Map database row to ClaimWithDocuments (converts snake_case to camelCase)
 * Includes all FNOL fields from the claims table
 */
function mapRowToClaim(row: any): ClaimWithDocuments {
  // Build risk location from individual address parts
  const riskLocation = row.property_address 
    ? [row.property_address, row.property_city, row.property_state, row.property_zip].filter(Boolean).join(', ')
    : undefined;
    
  return {
    id: row.id,
    organizationId: row.organization_id,
    // Claim identifier
    claimId: row.claim_number, // Primary identifier
    claimNumber: row.claim_number,
    carrierId: row.carrier_id,
    regionId: row.region_id,
    // Policyholder info (from FNOL)
    policyholder: row.insured_name, // Alias
    insuredName: row.insured_name,
    insuredEmail: row.insured_email,
    insuredPhone: row.insured_phone,
    // Property/Risk location (from FNOL)
    riskLocation: riskLocation,
    propertyAddress: row.property_address,
    propertyCity: row.property_city,
    propertyState: row.property_state,
    propertyZip: row.property_zip,
    // Loss details (from FNOL)
    dateOfLoss: row.date_of_loss,
    causeOfLoss: row.loss_type, // Alias
    lossType: row.loss_type,
    lossDescription: row.loss_description,
    // Policy details (from FNOL)
    policyNumber: row.policy_number,
    claimType: row.claim_type,
    state: row.property_state, // Alias
    yearRoofInstall: row.year_roof_install,
    windHailDeductible: row.wind_hail_deductible,
    dwellingLimit: row.dwelling_limit,
    endorsementsListed: row.endorsements_listed,
    // Coverage amounts
    coverageA: row.coverage_a,
    coverageB: row.coverage_b,
    coverageC: row.coverage_c,
    coverageD: row.coverage_d,
    deductible: row.deductible,
    // Status
    status: row.status,
    assignedAdjusterId: row.assigned_adjuster_id,
    // Totals
    totalRcv: row.total_rcv,
    totalAcv: row.total_acv,
    totalPaid: row.total_paid,
    // Metadata
    metadata: row.metadata,
    // Timestamps
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    // Counts
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
 * Create a new claim with all FNOL fields
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
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
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
        year_roof_install, wind_hail_deductible, dwelling_limit, endorsements_listed,
        coverage_a, coverage_b, coverage_c, coverage_d, deductible,
        assigned_adjuster_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
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
        data.yearRoofInstall || null,
        data.windHailDeductible || null,
        data.dwellingLimit || null,
        JSON.stringify(data.endorsementsListed || []),
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
      yearRoofInstall: 'year_roof_install',
      windHailDeductible: 'wind_hail_deductible',
      dwellingLimit: 'dwelling_limit',
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

/**
 * Permanently delete ALL claims and related data for an organization
 * This is a destructive operation that cannot be undone
 */
export async function purgeAllClaims(organizationId: string): Promise<{
  claimsDeleted: number;
  relatedRecordsDeleted: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all claim IDs for this organization
    const claimIdsResult = await client.query(
      `SELECT id FROM claims WHERE organization_id = $1`,
      [organizationId]
    );
    const claimIds = claimIdsResult.rows.map(r => r.id);

    if (claimIds.length === 0) {
      await client.query('COMMIT');
      return { claimsDeleted: 0, relatedRecordsDeleted: 0 };
    }

    let relatedRecordsDeleted = 0;

    // Delete related records in order (respecting foreign key constraints)
    // 1. Inspection workflows
    const workflowsResult = await client.query(
      `DELETE FROM inspection_workflows WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += workflowsResult.rowCount || 0;

    // 2. Claim briefings
    const briefingsResult = await client.query(
      `DELETE FROM claim_briefings WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += briefingsResult.rowCount || 0;

    // 3. Claim photos
    const photosResult = await client.query(
      `DELETE FROM claim_photos WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += photosResult.rowCount || 0;

    // 4. Claim damage zones
    const zonesResult = await client.query(
      `DELETE FROM claim_damage_zones WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += zonesResult.rowCount || 0;

    // 5. Claim rooms
    const roomsResult = await client.query(
      `DELETE FROM claim_rooms WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += roomsResult.rowCount || 0;

    // 6. Claim structures
    const structuresResult = await client.query(
      `DELETE FROM claim_structures WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += structuresResult.rowCount || 0;

    // 7. Documents
    const documentsResult = await client.query(
      `DELETE FROM documents WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += documentsResult.rowCount || 0;

    // 8. Estimates and related tables
    const estimatesResult = await client.query(
      `DELETE FROM estimates WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += estimatesResult.rowCount || 0;

    // 9. Policy forms
    const policyFormsResult = await client.query(
      `DELETE FROM policy_forms WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += policyFormsResult.rowCount || 0;

    // 10. Endorsements
    const endorsementsResult = await client.query(
      `DELETE FROM endorsements WHERE claim_id = ANY($1::uuid[])`,
      [claimIds]
    );
    relatedRecordsDeleted += endorsementsResult.rowCount || 0;

    // Finally, delete the claims themselves
    const claimsResult = await client.query(
      `DELETE FROM claims WHERE organization_id = $1`,
      [organizationId]
    );
    const claimsDeleted = claimsResult.rowCount || 0;

    await client.query('COMMIT');

    return { claimsDeleted, relatedRecordsDeleted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
