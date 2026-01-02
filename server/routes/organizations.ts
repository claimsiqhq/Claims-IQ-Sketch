/**
 * Organizations Routes
 * 
 * Multi-tenant organization management including members and settings.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrganization, requireOrgRole, requireSuperAdmin } from '../middleware/tenant';
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
  getUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  getOrganizationMembers,
  switchOrganization
} from '../services/organizations';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'organizations-routes' });

// =================================================
// User's Organizations
// =================================================

/**
 * GET /api/organizations/mine
 * Get organizations the current user belongs to
 */
router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const organizations = await getUserOrganizations(userId);
    res.json({ organizations });
  } catch (error) {
    log.error({ err: error }, 'Get user organizations error');
    res.status(500).json({ message: 'Failed to get organizations' });
  }
});

/**
 * POST /api/organizations/switch
 * Switch to a different organization
 */
router.post('/switch', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ message: 'Organization ID required' });
    }

    const result = await switchOrganization(userId, organizationId);
    if (!result.success) {
      return res.status(403).json({ message: result.error || 'Cannot switch to organization' });
    }

    log.info({ userId, organizationId }, 'User switched organization');
    res.json({ 
      message: 'Switched organization',
      organization: result.organization 
    });
  } catch (error) {
    log.error({ err: error }, 'Switch organization error');
    res.status(500).json({ message: 'Failed to switch organization' });
  }
});

/**
 * POST /api/organizations
 * Create a new organization
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { name, slug, settings } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Organization name required' });
    }

    const organization = await createOrganization({
      name,
      slug,
      settings,
      createdBy: userId,
    });

    log.info({ organizationId: organization.id, userId }, 'Organization created');
    res.status(201).json({ organization });
  } catch (error) {
    log.error({ err: error }, 'Create organization error');
    res.status(500).json({ message: 'Failed to create organization' });
  }
});

// =================================================
// Admin Routes
// =================================================

/**
 * GET /api/admin/organizations
 * List all organizations (super admin only)
 */
router.get('/admin/all', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { limit, offset } = req.query;
    const organizations = await listOrganizations({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ organizations });
  } catch (error) {
    log.error({ err: error }, 'List organizations error');
    res.status(500).json({ message: 'Failed to list organizations' });
  }
});

// =================================================
// Current Organization
// =================================================

/**
 * GET /api/organizations/current
 * Get current organization details
 */
router.get('/current', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const organization = await getOrganization(organizationId);
    
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    res.json({ organization });
  } catch (error) {
    log.error({ err: error }, 'Get current organization error');
    res.status(500).json({ message: 'Failed to get organization' });
  }
});

/**
 * PUT /api/organizations/current
 * Update current organization (admin only)
 */
router.put('/current', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const updates = req.body;

    const organization = await updateOrganization(organizationId, updates);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    log.info({ organizationId }, 'Organization updated');
    res.json({ organization });
  } catch (error) {
    log.error({ err: error }, 'Update organization error');
    res.status(500).json({ message: 'Failed to update organization' });
  }
});

// =================================================
// Organization Members
// =================================================

/**
 * GET /api/organizations/current/members
 * Get members of current organization
 */
router.get('/current/members', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const members = await getOrganizationMembers(organizationId);
    res.json({ members });
  } catch (error) {
    log.error({ err: error }, 'Get organization members error');
    res.status(500).json({ message: 'Failed to get members' });
  }
});

/**
 * POST /api/organizations/current/members
 * Add member to current organization (admin only)
 */
router.post('/current/members', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const { userId, email, role } = req.body;

    if (!userId && !email) {
      return res.status(400).json({ message: 'User ID or email required' });
    }

    const member = await addOrganizationMember(organizationId, { userId, email, role });
    log.info({ organizationId, newMemberId: member.userId }, 'Member added to organization');
    res.status(201).json({ member });
  } catch (error) {
    log.error({ err: error }, 'Add organization member error');
    res.status(500).json({ message: 'Failed to add member' });
  }
});

/**
 * DELETE /api/organizations/current/members/:userId
 * Remove member from current organization (admin only)
 */
router.delete('/current/members/:userId', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const { userId } = req.params;
    const currentUserId = (req.user as any).id;

    if (userId === currentUserId) {
      return res.status(400).json({ message: 'Cannot remove yourself from organization' });
    }

    await removeOrganizationMember(organizationId, userId);
    log.info({ organizationId, removedUserId: userId }, 'Member removed from organization');
    res.json({ message: 'Member removed' });
  } catch (error) {
    log.error({ err: error }, 'Remove organization member error');
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

export default router;
