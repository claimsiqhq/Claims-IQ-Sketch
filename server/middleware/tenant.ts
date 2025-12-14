import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      role: string;
      currentOrganizationId?: string;
    }
    interface Request {
      organizationId?: string;
      organization?: {
        id: string;
        name: string;
        slug: string;
        type: string;
        status: string;
      };
      membershipRole?: string;
    }
  }
}

/**
 * Middleware that resolves and validates the current organization context.
 * Adds organizationId and organization to req for use in route handlers.
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip if not authenticated
  if (!req.isAuthenticated() || !req.user) {
    return next();
  }

  try {
    const client = await pool.connect();
    try {
      // Check if user has an active organization set
      let orgId = req.user.currentOrganizationId;

      // If no current org, try to get the first organization the user is a member of
      if (!orgId) {
        const membershipResult = await client.query(
          `SELECT om.organization_id, om.role
           FROM organization_memberships om
           WHERE om.user_id = $1 AND om.status = 'active'
           ORDER BY om.created_at ASC
           LIMIT 1`,
          [req.user.id]
        );

        if (membershipResult.rows.length > 0) {
          orgId = membershipResult.rows[0].organization_id;
          req.membershipRole = membershipResult.rows[0].role;

          // Update user's current organization
          await client.query(
            `UPDATE users SET current_organization_id = $1 WHERE id = $2`,
            [orgId, req.user.id]
          );
        }
      } else {
        // Verify membership in current org
        const membershipResult = await client.query(
          `SELECT role FROM organization_memberships
           WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
          [req.user.id, orgId]
        );

        if (membershipResult.rows.length > 0) {
          req.membershipRole = membershipResult.rows[0].role;
        } else {
          // User no longer has access to this org, clear it
          orgId = undefined;
          await client.query(
            `UPDATE users SET current_organization_id = NULL WHERE id = $1`,
            [req.user.id]
          );
        }
      }

      if (orgId) {
        // Fetch organization details
        const orgResult = await client.query(
          `SELECT id, name, slug, type, status FROM organizations WHERE id = $1`,
          [orgId]
        );

        if (orgResult.rows.length > 0) {
          req.organizationId = orgId;
          req.organization = orgResult.rows[0];
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Tenant middleware error:', error);
    // Don't fail the request, just log and continue without org context
  }

  next();
}

/**
 * Middleware that requires a valid organization context.
 * Returns 403 if no organization is set.
 */
export function requireOrganization(req: Request, res: Response, next: NextFunction) {
  if (!req.organizationId) {
    return res.status(403).json({
      error: 'No organization context. Please select or join an organization.'
    });
  }
  next();
}

/**
 * Middleware that requires specific roles within the organization.
 */
export function requireOrgRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.organizationId) {
      return res.status(403).json({
        error: 'No organization context'
      });
    }

    // Super admins can do anything
    if (req.user?.role === 'super_admin') {
      return next();
    }

    if (!req.membershipRole || !allowedRoles.includes(req.membershipRole)) {
      return res.status(403).json({
        error: `Requires one of roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Middleware that requires super admin access (system-wide admin).
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Super admin access required'
    });
  }
  next();
}
