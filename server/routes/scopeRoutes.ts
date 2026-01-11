/**
 * Scope Engine API Routes - Claims IQ Sketch
 *
 * REST API endpoints for the scope engine.
 * Scope defines WHAT work is required, independent of pricing.
 *
 * See: docs/SCOPE_ENGINE.md for architecture details.
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  assembleEstimateScope,
  saveScopeItems,
  clearEstimateScope,
  getScopeItems,
  updateScopeSummary,
} from '../services/scopeAssemblyService';

const router = Router();

// ============================================
// TRADES
// ============================================

/**
 * GET /api/scope/trades
 * List all available trades
 */
router.get('/trades', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('xact_categories') // Use xact_categories as trades
      .select('code, description') // map description to name
      .order('code');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const trades = data.map(t => ({
      code: t.code,
      name: t.description,
      is_active: true
    }));

    res.json({ trades });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// LINE ITEM CATALOG
// ============================================

/**
 * GET /api/scope/catalog
 * List all line items in the catalog
 */
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const { trade, unit, activity, search } = req.query;

    let query = supabaseAdmin
      .from('line_items')
      .select(`
        *
      `)
      .eq('is_active', true);

    // Apply filters
    if (trade) {
      query = query.eq('trade_code', trade);
    }
    if (unit) {
      query = query.eq('unit', unit);
    }
    if (activity) {
      query = query.eq('activity_type', activity);
    }
    if (search) {
      query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query.order('trade_code').order('sort_order');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      items: data,
      count: data?.length || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scope/catalog/:code
 * Get a single line item by code
 */
router.get('/catalog/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabaseAdmin
      .from('line_items')
      .select(`
        *
      `)
      .eq('code', code)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Line item not found' });
    }

    res.json({ item: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SCOPE ITEMS
// ============================================

/**
 * GET /api/scope/estimate/:estimateId
 * Get scope items for an estimate
 */
router.get('/estimate/:estimateId', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;
    const { groupBy } = req.query;

    const { data, error } = await supabaseAdmin
      .from('scope_items')
      .select(`
        *,
        line_item:line_items!line_item_id(code, description, unit, trade_code),
        zone:estimate_zones!zone_id(id, name, zone_type, room_type)
      `)
      .eq('estimate_id', estimateId)
      .order('trade_code')
      .order('sort_order');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Optionally group by trade or zone
    if (groupBy === 'trade') {
      const grouped = groupByTrade(data || []);
      return res.json({ items: grouped, groupedBy: 'trade' });
    }

    if (groupBy === 'zone') {
      const grouped = groupByZone(data || []);
      return res.json({ items: grouped, groupedBy: 'zone' });
    }

    res.json({
      items: data,
      count: data?.length || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scope/estimate/:estimateId/assemble
 * Assemble scope from geometry
 */
router.post('/estimate/:estimateId/assemble', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;
    const { clearExisting = true } = req.body;

    // Clear existing scope if requested
    if (clearExisting) {
      await clearEstimateScope(estimateId);
    }

    // Assemble scope from zones
    const result = await assembleEstimateScope(estimateId);

    // Save to database
    const { inserted, errors } = await saveScopeItems(result.items);

    // Update summary
    await updateScopeSummary(estimateId);

    res.json({
      success: true,
      estimateId,
      itemsAssembled: result.items.length,
      itemsInserted: inserted,
      zones: result.zones.map(z => ({
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        itemCount: z.itemCount,
      })),
      summary: result.summary,
      errors: errors.length > 0 ? errors : undefined,
      assembledAt: result.assembledAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/scope/estimate/:estimateId
 * Clear all scope items for an estimate
 */
router.delete('/estimate/:estimateId', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;

    await clearEstimateScope(estimateId);
    await updateScopeSummary(estimateId);

    res.json({
      success: true,
      message: 'Scope cleared',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SCOPE SUMMARY
// ============================================

/**
 * GET /api/scope/estimate/:estimateId/summary
 * Get scope summary by trade
 */
router.get('/estimate/:estimateId/summary', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('scope_summary')
      .select(`
        *
      `)
      .eq('estimate_id', estimateId)
      .order('trade_code');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Calculate totals
    const totals = {
      lineItemCount: 0,
      zoneCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      excludedCount: 0,
      tradeCount: data?.length || 0,
    };

    for (const summary of data || []) {
      totals.lineItemCount += summary.line_item_count || 0;
      totals.pendingCount += summary.pending_count || 0;
      totals.approvedCount += summary.approved_count || 0;
      totals.excludedCount += summary.excluded_count || 0;
    }

    // Count unique zones
    const uniqueZones = new Set<string>();
    for (const summary of data || []) {
      // Zone count is already per-trade, we need unique total
      // For now, use the max zone count as approximation
    }

    res.json({
      summary: data,
      totals,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scope/estimate/:estimateId/summary/refresh
 * Refresh scope summary
 */
router.post('/estimate/:estimateId/summary/refresh', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;

    await updateScopeSummary(estimateId);

    res.json({
      success: true,
      message: 'Summary refreshed',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ITEM STATUS MANAGEMENT
// ============================================

/**
 * PATCH /api/scope/items/:itemId/status
 * Update scope item status
 */
router.patch('/items/:itemId/status', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'excluded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabaseAdmin
      .from('scope_items')
      .update({ status })
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ item: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scope/estimate/:estimateId/approve-all
 * Approve all pending scope items
 */
router.post('/estimate/:estimateId/approve-all', async (req: Request, res: Response) => {
  try {
    const { estimateId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('scope_items')
      .update({ status: 'approved' })
      .eq('estimate_id', estimateId)
      .eq('status', 'pending')
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await updateScopeSummary(estimateId);

    res.json({
      success: true,
      approvedCount: data?.length || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function groupByTrade(items: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};

  for (const item of items) {
    const trade = item.trade_code || 'OTHER';
    if (!grouped[trade]) {
      grouped[trade] = [];
    }
    grouped[trade].push(item);
  }

  return grouped;
}

function groupByZone(items: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};

  for (const item of items) {
    const zoneId = item.zone_id || 'NO_ZONE';
    const zoneName = item.zone?.name || 'Unassigned';
    const key = `${zoneId}|${zoneName}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  }

  return grouped;
}

export default router;
