import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

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

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return next();
  }

  try {
    let orgId = req.user.currentOrganizationId;

    if (!orgId) {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('organization_id, role')
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (membership) {
        orgId = membership.organization_id;
        req.membershipRole = membership.role;

        await supabaseAdmin
          .from('users')
          .update({ current_organization_id: orgId })
          .eq('id', req.user.id);
      }
    } else {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('role')
        .eq('user_id', req.user.id)
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .single();

      if (membership) {
        req.membershipRole = membership.role;
      } else {
        orgId = undefined;
        await supabaseAdmin
          .from('users')
          .update({ current_organization_id: null })
          .eq('id', req.user.id);
      }
    }

    if (orgId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, slug, type, status')
        .eq('id', orgId)
        .single();

      if (org) {
        req.organizationId = orgId;
        req.organization = org;
      }
    }
  } catch (error) {
    console.error('Tenant middleware error:', error);
  }

  next();
}

export function requireOrganization(req: Request, res: Response, next: NextFunction) {
  if (!req.organizationId) {
    return res.status(403).json({
      error: 'No organization context. Please select or join an organization.'
    });
  }
  next();
}

export function requireOrgRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.organizationId) {
      return res.status(403).json({
        error: 'No organization context'
      });
    }

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

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Super admin access required'
    });
  }
  next();
}
