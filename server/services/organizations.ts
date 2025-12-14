import { pool } from '../db';
import { InsertOrganization } from '../../shared/schema';

export interface OrganizationWithStats {
  id: string;
  name: string;
  slug: string;
  type: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
  settings: Record<string, any>;
  createdAt: Date;
  memberCount?: number;
  claimCount?: number;
}

/**
 * Create a new organization (tenant)
 */
export async function createOrganization(
  data: InsertOrganization,
  creatorUserId?: string
): Promise<OrganizationWithStats> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate slug from name if not provided
    const slug = data.slug || data.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existingSlug = await client.query(
      'SELECT id FROM organizations WHERE slug = $1',
      [slug]
    );
    if (existingSlug.rows.length > 0) {
      throw new Error('Organization slug already exists');
    }

    // Create organization
    const result = await client.query(
      `INSERT INTO organizations (name, slug, type, email, phone, address, status, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.name,
        slug,
        data.type || 'carrier',
        data.email || null,
        data.phone || null,
        data.address || null,
        data.status || 'active',
        JSON.stringify(data.settings || {})
      ]
    );

    const org = result.rows[0];

    // If a creator user ID is provided, make them the owner
    if (creatorUserId) {
      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [creatorUserId, org.id]
      );

      // Set as user's current organization
      await client.query(
        `UPDATE users SET current_organization_id = $1 WHERE id = $2`,
        [org.id, creatorUserId]
      );
    }

    await client.query('COMMIT');
    return org;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get organization by ID
 */
export async function getOrganization(id: string): Promise<OrganizationWithStats | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'active') as member_count,
         (SELECT COUNT(*) FROM claims WHERE organization_id = o.id) as claim_count
       FROM organizations o WHERE o.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      memberCount: parseInt(row.member_count),
      claimCount: parseInt(row.claim_count)
    };
  } finally {
    client.release();
  }
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string): Promise<OrganizationWithStats | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'active') as member_count,
         (SELECT COUNT(*) FROM claims WHERE organization_id = o.id) as claim_count
       FROM organizations o WHERE o.slug = $1`,
      [slug]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      memberCount: parseInt(row.member_count),
      claimCount: parseInt(row.claim_count)
    };
  } finally {
    client.release();
  }
}

/**
 * List all organizations (admin only)
 */
export async function listOrganizations(options?: {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ organizations: OrganizationWithStats[]; total: number }> {
  const client = await pool.connect();
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options?.status) {
      conditions.push(`o.status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }
    if (options?.type) {
      conditions.push(`o.type = $${paramIndex}`);
      params.push(options.type);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) FROM organizations o ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get organizations with stats
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await client.query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'active') as member_count,
         (SELECT COUNT(*) FROM claims WHERE organization_id = o.id) as claim_count
       FROM organizations o
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const organizations = result.rows.map(row => ({
      ...row,
      memberCount: parseInt(row.member_count),
      claimCount: parseInt(row.claim_count)
    }));

    return { organizations, total };
  } finally {
    client.release();
  }
}

/**
 * Update organization
 */
export async function updateOrganization(
  id: string,
  updates: Partial<InsertOrganization>
): Promise<OrganizationWithStats | null> {
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      params.push(updates.name);
      paramIndex++;
    }
    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex}`);
      params.push(updates.type);
      paramIndex++;
    }
    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex}`);
      params.push(updates.email);
      paramIndex++;
    }
    if (updates.phone !== undefined) {
      setClauses.push(`phone = $${paramIndex}`);
      params.push(updates.phone);
      paramIndex++;
    }
    if (updates.address !== undefined) {
      setClauses.push(`address = $${paramIndex}`);
      params.push(updates.address);
      paramIndex++;
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      params.push(updates.status);
      paramIndex++;
    }
    if (updates.settings !== undefined) {
      setClauses.push(`settings = $${paramIndex}`);
      params.push(JSON.stringify(updates.settings));
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return getOrganization(id);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await client.query(
      `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return getOrganization(id);
  } finally {
    client.release();
  }
}

/**
 * Get organizations for a user
 */
export async function getUserOrganizations(userId: string): Promise<OrganizationWithStats[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT o.*, om.role as membership_role,
         (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'active') as member_count,
         (SELECT COUNT(*) FROM claims WHERE organization_id = o.id) as claim_count
       FROM organizations o
       JOIN organization_memberships om ON o.id = om.organization_id
       WHERE om.user_id = $1 AND om.status = 'active'
       ORDER BY o.name`,
      [userId]
    );

    return result.rows.map(row => ({
      ...row,
      memberCount: parseInt(row.member_count),
      claimCount: parseInt(row.claim_count)
    }));
  } finally {
    client.release();
  }
}

/**
 * Add member to organization
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: string = 'member'
): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if already a member
    const existing = await client.query(
      `SELECT id FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );

    if (existing.rows.length > 0) {
      // Update existing membership
      await client.query(
        `UPDATE organization_memberships SET role = $1, status = 'active', updated_at = NOW()
         WHERE organization_id = $2 AND user_id = $3`,
        [role, organizationId, userId]
      );
    } else {
      // Create new membership
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')`,
        [organizationId, userId, role]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Remove member from organization
 */
export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE organization_memberships SET status = 'removed', updated_at = NOW()
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );

    // If this was the user's current org, clear it
    await client.query(
      `UPDATE users SET current_organization_id = NULL
       WHERE id = $1 AND current_organization_id = $2`,
      [userId, organizationId]
    );
  } finally {
    client.release();
  }
}

/**
 * Get organization members
 */
export async function getOrganizationMembers(organizationId: string): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role as system_role,
              om.role as org_role, om.status, om.created_at as joined_at
       FROM users u
       JOIN organization_memberships om ON u.id = om.user_id
       WHERE om.organization_id = $1 AND om.status = 'active'
       ORDER BY om.created_at`,
      [organizationId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Switch user's current organization
 */
export async function switchOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const client = await pool.connect();
  try {
    // Verify membership
    const membership = await client.query(
      `SELECT id FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [userId, organizationId]
    );

    if (membership.rows.length === 0) {
      return false;
    }

    await client.query(
      `UPDATE users SET current_organization_id = $1, updated_at = NOW() WHERE id = $2`,
      [organizationId, userId]
    );

    return true;
  } finally {
    client.release();
  }
}
