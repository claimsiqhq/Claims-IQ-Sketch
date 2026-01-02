/**
 * Pricing Routes
 * 
 * Line items, pricing calculations, and reference data.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  searchLineItems,
  getCategories,
  calculatePrice,
  getRegionByZip
} from '../services/pricing';
import {
  calculateXactPrice,
  searchXactItemsWithPricing,
  getXactItemForEstimate
} from '../services/xactPricing';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createLogger } from '../lib/logger';

const router = Router();
const log = createLogger({ module: 'pricing-routes' });

// =================================================
// Line Items
// =================================================

/**
 * GET /api/line-items
 * Search line items
 */
router.get('/line-items', async (req: Request, res: Response) => {
  try {
    const { q, category, limit } = req.query;
    
    const items = await searchLineItems({
      query: q as string,
      category: category as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ items });
  } catch (error) {
    log.error({ err: error }, 'Search line items error');
    res.status(500).json({ message: 'Failed to search line items' });
  }
});

/**
 * GET /api/line-items/categories
 * Get all line item categories
 */
router.get('/line-items/categories', async (req: Request, res: Response) => {
  try {
    const categories = await getCategories();
    res.json({ categories });
  } catch (error) {
    log.error({ err: error }, 'Get categories error');
    res.status(500).json({ message: 'Failed to get categories' });
  }
});

// =================================================
// Pricing Calculations
// =================================================

/**
 * POST /api/pricing/calculate
 * Calculate price for line items
 */
router.post('/pricing/calculate', async (req: Request, res: Response) => {
  try {
    const { lineItems, regionCode, carrierProfileId } = req.body;

    if (!lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({ message: 'Line items array required' });
    }

    const result = await calculatePrice(lineItems, { regionCode, carrierProfileId });
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Calculate price error');
    res.status(500).json({ message: 'Failed to calculate price' });
  }
});

/**
 * GET /api/pricing/region/:zipCode
 * Get region by zip code
 */
router.get('/pricing/region/:zipCode', async (req: Request, res: Response) => {
  try {
    const { zipCode } = req.params;
    const region = await getRegionByZip(zipCode);
    
    if (!region) {
      return res.status(404).json({ message: 'Region not found for zip code' });
    }

    res.json({ region });
  } catch (error) {
    log.error({ err: error }, 'Get region error');
    res.status(500).json({ message: 'Failed to get region' });
  }
});

// =================================================
// Xactimate Pricing
// =================================================

/**
 * POST /api/pricing/xact/calculate
 * Calculate Xactimate price for a line item
 */
router.post('/pricing/xact/calculate', async (req: Request, res: Response) => {
  try {
    const { itemCode, quantity, regionCode } = req.body;

    if (!itemCode) {
      return res.status(400).json({ message: 'Item code required' });
    }

    const result = await calculateXactPrice(itemCode, quantity || 1, regionCode);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Calculate Xact price error');
    res.status(500).json({ message: 'Failed to calculate price' });
  }
});

/**
 * GET /api/pricing/xact/search
 * Search Xactimate items with pricing
 */
router.get('/pricing/xact/search', async (req: Request, res: Response) => {
  try {
    const { q, category, regionCode, limit } = req.query;

    const results = await searchXactItemsWithPricing({
      query: q as string,
      category: category as string,
      regionCode: regionCode as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ items: results });
  } catch (error) {
    log.error({ err: error }, 'Search Xact items error');
    res.status(500).json({ message: 'Failed to search items' });
  }
});

/**
 * GET /api/pricing/xact/item/:code
 * Get Xactimate item for estimate
 */
router.get('/pricing/xact/item/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { regionCode } = req.query;

    const item = await getXactItemForEstimate(code, regionCode as string);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json({ item });
  } catch (error) {
    log.error({ err: error }, 'Get Xact item error');
    res.status(500).json({ message: 'Failed to get item' });
  }
});

// =================================================
// Reference Data
// =================================================

/**
 * GET /api/carrier-profiles
 * Get all carrier profiles
 */
router.get('/carrier-profiles', async (req: Request, res: Response) => {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('carrier_profiles')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json({ profiles });
  } catch (error) {
    log.error({ err: error }, 'Get carrier profiles error');
    res.status(500).json({ message: 'Failed to get carrier profiles' });
  }
});

/**
 * GET /api/regions
 * Get all regions
 */
router.get('/regions', async (req: Request, res: Response) => {
  try {
    const { data: regions, error } = await supabaseAdmin
      .from('regions')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json({ regions });
  } catch (error) {
    log.error({ err: error }, 'Get regions error');
    res.status(500).json({ message: 'Failed to get regions' });
  }
});

/**
 * GET /api/coverage-types
 * Get all coverage types
 */
router.get('/coverage-types', async (req: Request, res: Response) => {
  try {
    const { data: coverageTypes, error } = await supabaseAdmin
      .from('coverage_types')
      .select('*')
      .order('sort_order');

    if (error) throw error;
    res.json({ coverageTypes });
  } catch (error) {
    log.error({ err: error }, 'Get coverage types error');
    res.status(500).json({ message: 'Failed to get coverage types' });
  }
});

/**
 * GET /api/coverage-types/:code
 * Get a specific coverage type
 */
router.get('/coverage-types/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    
    const { data: coverageType, error } = await supabaseAdmin
      .from('coverage_types')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !coverageType) {
      return res.status(404).json({ message: 'Coverage type not found' });
    }

    res.json({ coverageType });
  } catch (error) {
    log.error({ err: error }, 'Get coverage type error');
    res.status(500).json({ message: 'Failed to get coverage type' });
  }
});

/**
 * GET /api/tax-rates
 * Get all tax rates
 */
router.get('/tax-rates', async (req: Request, res: Response) => {
  try {
    const { regionCode } = req.query;
    
    let query = supabaseAdmin.from('tax_rates').select('*');
    
    if (regionCode) {
      query = query.eq('region_code', regionCode);
    }

    const { data: taxRates, error } = await query.order('region_code');

    if (error) throw error;
    res.json({ taxRates });
  } catch (error) {
    log.error({ err: error }, 'Get tax rates error');
    res.status(500).json({ message: 'Failed to get tax rates' });
  }
});

/**
 * GET /api/depreciation-schedules
 * Get all depreciation schedules
 */
router.get('/depreciation-schedules', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    
    let query = supabaseAdmin.from('depreciation_schedules').select('*');
    
    if (category) {
      query = query.eq('category_code', category);
    }

    const { data: schedules, error } = await query.order('category_code');

    if (error) throw error;
    res.json({ schedules });
  } catch (error) {
    log.error({ err: error }, 'Get depreciation schedules error');
    res.status(500).json({ message: 'Failed to get depreciation schedules' });
  }
});

/**
 * GET /api/regional-multipliers
 * Get all regional multipliers
 */
router.get('/regional-multipliers', async (req: Request, res: Response) => {
  try {
    const { data: multipliers, error } = await supabaseAdmin
      .from('regional_multipliers')
      .select('*')
      .order('region_code');

    if (error) throw error;
    res.json({ multipliers });
  } catch (error) {
    log.error({ err: error }, 'Get regional multipliers error');
    res.status(500).json({ message: 'Failed to get regional multipliers' });
  }
});

/**
 * GET /api/labor-rates
 * Get all labor rates
 */
router.get('/labor-rates', async (req: Request, res: Response) => {
  try {
    const { regionCode, tradeCode } = req.query;
    
    let query = supabaseAdmin.from('labor_rates_enhanced').select('*');
    
    if (regionCode) {
      query = query.eq('region_code', regionCode);
    }
    if (tradeCode) {
      query = query.eq('trade_code', tradeCode);
    }

    const { data: rates, error } = await query.order('trade_code');

    if (error) throw error;
    res.json({ rates });
  } catch (error) {
    log.error({ err: error }, 'Get labor rates error');
    res.status(500).json({ message: 'Failed to get labor rates' });
  }
});

/**
 * GET /api/price-lists
 * Get all price lists
 */
router.get('/price-lists', async (req: Request, res: Response) => {
  try {
    const { data: priceLists, error } = await supabaseAdmin
      .from('price_lists')
      .select('*')
      .order('effective_date', { ascending: false });

    if (error) throw error;
    res.json({ priceLists });
  } catch (error) {
    log.error({ err: error }, 'Get price lists error');
    res.status(500).json({ message: 'Failed to get price lists' });
  }
});

export default router;
