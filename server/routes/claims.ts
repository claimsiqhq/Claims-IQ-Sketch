/**
 * Claims Routes
 * 
 * CRUD operations for claims, including rooms, damage zones, and scope items.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrganization, requireOrgRole } from '../middleware/tenant';
import {
  createClaim,
  getClaim,
  listClaims,
  updateClaim,
  deleteClaim,
  getClaimStats,
  purgeAllClaims
} from '../services/claims';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createLogger } from '../lib/logger';
import { checkSublimitStatus, getAllSublimitAlerts } from '../services/sublimitTracker';

const router = Router();
const log = createLogger({ module: 'claims-routes' });

// =================================================
// Claims CRUD
// =================================================

/**
 * POST /api/claims
 * Create a new claim
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const userId = (req.user as any).id;
    const claimData = req.body;

    const claim = await createClaim(organizationId, {
      ...claimData,
      createdBy: userId,
    });

    log.info({ claimId: claim.id, organizationId }, 'Claim created');
    res.status(201).json({ claim });
  } catch (error) {
    log.error({ err: error }, 'Create claim error');
    res.status(500).json({ message: 'Failed to create claim' });
  }
});

/**
 * GET /api/claims
 * List claims for current organization
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const { status, limit, offset, search } = req.query;

    const claims = await listClaims(organizationId, {
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      search: search as string,
    });

    res.json({ claims });
  } catch (error) {
    log.error({ err: error }, 'List claims error');
    res.status(500).json({ message: 'Failed to list claims' });
  }
});

/**
 * GET /api/claims/stats
 * Get claim statistics for current organization
 */
router.get('/stats', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const stats = await getClaimStats(organizationId);
    res.json({ stats });
  } catch (error) {
    log.error({ err: error }, 'Get claim stats error');
    res.status(500).json({ message: 'Failed to get claim statistics' });
  }
});

/**
 * GET /api/claims/map
 * Get claims with geocoding data for map display
 */
router.get('/map', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    
    const { data: claims, error } = await supabaseAdmin
      .from('claims')
      .select('id, claim_id, insured_name, latitude, longitude, status, primary_peril, loss_date')
      .eq('organization_id', organizationId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) throw error;

    res.json({ claims });
  } catch (error) {
    log.error({ err: error }, 'Get claims map data error');
    res.status(500).json({ message: 'Failed to get map data' });
  }
});

/**
 * GET /api/claims/map/stats
 * Get map statistics
 */
router.get('/map/stats', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    
    const { count: totalClaims } = await supabaseAdmin
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { count: geocodedClaims } = await supabaseAdmin
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('latitude', 'is', null);

    res.json({
      stats: {
        total: totalClaims || 0,
        geocoded: geocodedClaims || 0,
        pending: (totalClaims || 0) - (geocodedClaims || 0),
      }
    });
  } catch (error) {
    log.error({ err: error }, 'Get map stats error');
    res.status(500).json({ message: 'Failed to get map statistics' });
  }
});

/**
 * GET /api/claims/:id
 * Get a specific claim by ID
 */
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;

    const claim = await getClaim(id, organizationId);
    if (!claim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    res.json({ claim });
  } catch (error) {
    log.error({ err: error }, 'Get claim error');
    res.status(500).json({ message: 'Failed to get claim' });
  }
});

/**
 * PUT /api/claims/:id
 * Update a claim
 */
router.put('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;
    const updates = req.body;

    const claim = await updateClaim(id, organizationId, updates);
    if (!claim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    log.info({ claimId: id }, 'Claim updated');
    res.json({ claim });
  } catch (error) {
    log.error({ err: error }, 'Update claim error');
    res.status(500).json({ message: 'Failed to update claim' });
  }
});

/**
 * DELETE /api/claims/:id
 * Delete a claim (admin only)
 */
router.delete('/:id', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).organizationId;

    const deleted = await deleteClaim(id, organizationId);
    if (!deleted) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    log.info({ claimId: id }, 'Claim deleted');
    res.json({ message: 'Claim deleted successfully' });
  } catch (error) {
    log.error({ err: error }, 'Delete claim error');
    res.status(500).json({ message: 'Failed to delete claim' });
  }
});

/**
 * DELETE /api/claims/purge-all
 * Purge all claims for organization (dangerous - admin only)
 */
router.delete('/purge-all', requireAuth, requireOrganization, requireOrgRole('owner'), async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    const { confirm } = req.body;

    if (confirm !== 'PURGE_ALL_CLAIMS') {
      return res.status(400).json({ 
        message: 'Confirmation required. Send { confirm: "PURGE_ALL_CLAIMS" } to proceed.' 
      });
    }

    const result = await purgeAllClaims(organizationId);
    log.warn({ organizationId, ...result }, 'All claims purged');
    res.json({ 
      message: 'All claims purged',
      ...result
    });
  } catch (error) {
    log.error({ err: error }, 'Purge claims error');
    res.status(500).json({ message: 'Failed to purge claims' });
  }
});

// =================================================
// Claim Rooms
// =================================================

/**
 * POST /api/claims/:id/rooms
 * Add a room to a claim
 */
router.post('/:id/rooms', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;
    const roomData = req.body;

    const { data: room, error } = await supabaseAdmin
      .from('claim_rooms')
      .insert({
        claim_id: claimId,
        organization_id: organizationId,
        ...roomData,
      })
      .select()
      .single();

    if (error) throw error;

    log.info({ claimId, roomId: room.id }, 'Room added to claim');
    res.status(201).json({ room });
  } catch (error) {
    log.error({ err: error }, 'Add room error');
    res.status(500).json({ message: 'Failed to add room' });
  }
});

/**
 * GET /api/claims/:id/rooms
 * Get all rooms for a claim
 */
router.get('/:id/rooms', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;

    const { data: rooms, error } = await supabaseAdmin
      .from('claim_rooms')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json({ rooms });
  } catch (error) {
    log.error({ err: error }, 'Get rooms error');
    res.status(500).json({ message: 'Failed to get rooms' });
  }
});

/**
 * DELETE /api/claims/:id/rooms
 * Delete all rooms for a claim
 */
router.delete('/:id/rooms', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;

    const { error } = await supabaseAdmin
      .from('claim_rooms')
      .delete()
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId);

    if (error) throw error;

    log.info({ claimId }, 'All rooms deleted from claim');
    res.json({ message: 'Rooms deleted' });
  } catch (error) {
    log.error({ err: error }, 'Delete rooms error');
    res.status(500).json({ message: 'Failed to delete rooms' });
  }
});

// =================================================
// Claim Scope Items
// =================================================

/**
 * GET /api/claims/:id/scope-items
 * Get scope items for a claim
 */
router.get('/:id/scope-items', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;

    const { data: scopeItems, error } = await supabaseAdmin
      .from('claim_scope_items')
      .select('*')
      .eq('claim_id', claimId)
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json({ scopeItems });
  } catch (error) {
    log.error({ err: error }, 'Get scope items error');
    res.status(500).json({ message: 'Failed to get scope items' });
  }
});

/**
 * POST /api/claims/:id/scope-items
 * Add a scope item to a claim
 */
router.post('/:id/scope-items', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id: claimId } = req.params;
    const organizationId = (req as any).organizationId;
    const itemData = req.body;

    const { data: scopeItem, error } = await supabaseAdmin
      .from('claim_scope_items')
      .insert({
        claim_id: claimId,
        organization_id: organizationId,
        ...itemData,
      })
      .select()
      .single();

    if (error) throw error;

    log.info({ claimId, scopeItemId: scopeItem.id }, 'Scope item added');
    res.status(201).json({ scopeItem });
  } catch (error) {
    log.error({ err: error }, 'Add scope item error');
    res.status(500).json({ message: 'Failed to add scope item' });
  }
});

// =================================================
// Sublimit Tracking
// =================================================

/**
 * POST /api/claims/:id/check-sublimits
 * Check if current estimate exceeds policy sublimits
 */
router.post('/:id/check-sublimits', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentEstimate, coverageType } = req.body;

    if (!currentEstimate || typeof currentEstimate !== 'number') {
      return res.status(400).json({ error: 'currentEstimate is required and must be a number' });
    }

    const alerts = coverageType
      ? [await checkSublimitStatus(id, currentEstimate, coverageType)]
      : await getAllSublimitAlerts(id, currentEstimate);

    res.json({ alerts: alerts.filter(a => a !== null) });
  } catch (error) {
    log.error({ err: error }, 'Check sublimits error');
    res.status(500).json({ message: 'Failed to check sublimits' });
  }
});

export default router;
