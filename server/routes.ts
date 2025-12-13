import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runScrapeJob, testScrape, PRODUCT_MAPPINGS, STORE_REGIONS } from "./scraper/homeDepot";
import {
  searchLineItems,
  getCategories,
  calculatePrice,
  getRegionByZip
} from "./services/pricing";
import { createVoiceSession, VOICE_CONFIG } from "./services/voice-session";
import {
  calculateEstimate,
  saveEstimate,
  getEstimate,
  updateEstimate,
  addLineItemToEstimate,
  removeLineItemFromEstimate,
  listEstimates,
  getEstimateTemplates,
  createEstimateFromTemplate
} from "./services/estimateCalculator";
import {
  generateEstimateSuggestions,
  quickSuggestLineItems,
  searchLineItemsByDescription
} from "./services/ai-estimate-suggest";
import { passport, requireAuth } from "./middleware/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============================================
  // AUTH ROUTES
  // ============================================

  // Login endpoint
  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error' });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Invalid credentials' });
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: 'Login error' });
        }
        return res.json({
          user: { id: user.id, username: user.username },
          message: 'Login successful'
        });
      });
    })(req, res, next);
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout error' });
      }
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          return res.status(500).json({ error: 'Session destroy error' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logout successful' });
      });
    });
  });

  // Get current user endpoint
  app.get('/api/auth/me', (req, res) => {
    if (req.isAuthenticated() && req.user) {
      return res.json({
        user: { id: req.user.id, username: req.user.username },
        authenticated: true
      });
    }
    return res.json({ user: null, authenticated: false });
  });

  // Check authentication status
  app.get('/api/auth/check', (req, res) => {
    res.json({ authenticated: req.isAuthenticated() });
  });

  // ============================================
  // LINE ITEMS ROUTES
  // ============================================

  app.get('/api/line-items', async (req, res) => {
    try {
      const { q, category, damage_type, limit, offset } = req.query;
      const result = await searchLineItems({
        q: q as string,
        category: category as string,
        damageType: damage_type as string,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/line-items/categories', async (req, res) => {
    try {
      const categories = await getCategories();
      res.json(categories);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/pricing/calculate', async (req, res) => {
    try {
      const { line_item_code, quantity, region_id, carrier_id } = req.body;
      
      if (!line_item_code || !quantity || !region_id) {
        return res.status(400).json({ 
          error: 'Missing required fields: line_item_code, quantity, region_id' 
        });
      }
      
      const result = await calculatePrice(
        line_item_code,
        parseFloat(quantity),
        region_id,
        carrier_id
      );
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  app.get('/api/pricing/region/:zipCode', async (req, res) => {
    try {
      const region = await getRegionByZip(req.params.zipCode);
      if (!region) {
        return res.status(404).json({ error: 'Region not found' });
      }
      res.json(region);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/scrape/home-depot', async (req, res) => {
    try {
      const result = await runScrapeJob();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/scrape/test', async (req, res) => {
    try {
      const results = await testScrape();
      const data = Array.from(results.entries()).map(([sku, product]) => ({
        sku,
        name: product.name,
        price: product.price,
        unit: product.unit,
        url: product.url
      }));
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/scrape/config', (req, res) => {
    res.json({
      productMappings: PRODUCT_MAPPINGS,
      storeRegions: STORE_REGIONS
    });
  });

  // Get scraped prices from database for visualization
  app.get('/api/scrape/prices', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT
            m.sku,
            m.name as material_name,
            m.unit,
            mrp.region_id,
            mrp.price,
            mrp.source,
            mrp.effective_date
          FROM material_regional_prices mrp
          JOIN materials m ON m.id = mrp.material_id
          WHERE mrp.source = 'home_depot_scrape'
          ORDER BY mrp.effective_date DESC, m.sku, mrp.region_id
        `);
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get scrape job history
  app.get('/api/scrape/jobs', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT id, source, status, started_at, completed_at,
                 items_processed, items_updated, errors
          FROM price_scrape_jobs
          ORDER BY started_at DESC
          LIMIT 10
        `);
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // System status endpoint
  app.get('/api/system/status', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        // Test database connection
        const dbResult = await client.query('SELECT NOW() as time, version() as version');
        const dbTime = dbResult.rows[0].time;
        const dbVersion = dbResult.rows[0].version;

        // Get table counts
        const countsResult = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM materials) as materials_count,
            (SELECT COUNT(*) FROM line_items) as line_items_count,
            (SELECT COUNT(*) FROM regions) as regions_count,
            (SELECT COUNT(*) FROM material_regional_prices) as prices_count
        `);
        const counts = countsResult.rows[0];

        // Get regions list
        const regionsResult = await client.query(`
          SELECT id, name FROM regions ORDER BY id
        `);

        res.json({
          database: {
            connected: true,
            time: dbTime,
            version: dbVersion.split(' ')[0] + ' ' + dbVersion.split(' ')[1]
          },
          counts: {
            materials: parseInt(counts.materials_count),
            lineItems: parseInt(counts.line_items_count),
            regions: parseInt(counts.regions_count),
            prices: parseInt(counts.prices_count)
          },
          regions: regionsResult.rows,
          environment: process.env.NODE_ENV || 'development',
          openaiConfigured: !!process.env.OPENAI_API_KEY
        });
      } finally {
        client.release();
      }
    } catch (error) {
      res.json({
        database: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        environment: process.env.NODE_ENV || 'development',
        openaiConfigured: !!process.env.OPENAI_API_KEY
      });
    }
  });

  // Voice Session Routes
  app.post('/api/voice/session', async (req, res) => {
    try {
      const result = await createVoiceSession();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Voice session creation error:', message);
      if (message.includes('not configured')) {
        res.status(500).json({ error: 'Voice service not configured' });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  app.get('/api/voice/config', (req, res) => {
    res.json({
      availableVoices: VOICE_CONFIG.availableVoices,
      defaultVoice: VOICE_CONFIG.defaultVoice,
      model: VOICE_CONFIG.model
    });
  });

  // ============================================
  // AI ESTIMATE SUGGESTION ROUTES
  // ============================================

  // Generate AI suggestions from damage zones
  app.post('/api/ai/suggest-estimate', async (req, res) => {
    try {
      const { damageZones, regionId } = req.body;

      if (!damageZones || !Array.isArray(damageZones) || damageZones.length === 0) {
        return res.status(400).json({
          error: 'Missing required field: damageZones (array of damage zone objects)'
        });
      }

      const result = await generateEstimateSuggestions(damageZones, regionId);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('AI suggestion error:', message);
      if (message.includes('not configured')) {
        res.status(500).json({ error: 'AI service not configured' });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Quick suggest line items (for voice interface)
  app.post('/api/ai/quick-suggest', async (req, res) => {
    try {
      const { description, roomName, damageType, quantity } = req.body;

      if (!description || !roomName || !damageType) {
        return res.status(400).json({
          error: 'Missing required fields: description, roomName, damageType'
        });
      }

      const suggestions = await quickSuggestLineItems(
        description,
        roomName,
        damageType,
        quantity
      );
      res.json({ suggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Search line items by natural language
  app.get('/api/ai/search-line-items', async (req, res) => {
    try {
      const { q, limit } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Missing query parameter: q' });
      }

      const results = await searchLineItemsByDescription(
        q as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // ESTIMATE ROUTES
  // ============================================

  // Calculate estimate without saving (preview)
  app.post('/api/estimates/calculate', async (req, res) => {
    try {
      const result = await calculateEstimate(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Create and save new estimate
  app.post('/api/estimates', async (req, res) => {
    try {
      const calculation = await calculateEstimate(req.body);
      const savedEstimate = await saveEstimate(req.body, calculation);
      res.status(201).json(savedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // List estimates
  app.get('/api/estimates', async (req, res) => {
    try {
      const { status, claim_id, limit, offset } = req.query;
      const result = await listEstimates({
        status: status as string,
        claimId: claim_id as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get estimate by ID
  app.get('/api/estimates/:id', async (req, res) => {
    try {
      const estimate = await getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ error: 'Estimate not found' });
      }
      res.json(estimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update estimate
  app.put('/api/estimates/:id', async (req, res) => {
    try {
      const updatedEstimate = await updateEstimate(req.params.id, req.body);
      res.json(updatedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Add line item to estimate
  app.post('/api/estimates/:id/line-items', async (req, res) => {
    try {
      const { lineItemCode, quantity, notes, roomName } = req.body;
      if (!lineItemCode || !quantity) {
        return res.status(400).json({
          error: 'Missing required fields: lineItemCode, quantity'
        });
      }
      const updatedEstimate = await addLineItemToEstimate(
        req.params.id,
        { lineItemCode, quantity, notes, roomName }
      );
      res.json(updatedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Remove line item from estimate
  app.delete('/api/estimates/:id/line-items/:code', async (req, res) => {
    try {
      const updatedEstimate = await removeLineItemFromEstimate(
        req.params.id,
        req.params.code
      );
      res.json(updatedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get estimate templates
  app.get('/api/estimate-templates', async (req, res) => {
    try {
      const { damage_type } = req.query;
      const templates = await getEstimateTemplates(damage_type as string);
      res.json(templates);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Create estimate from template
  app.post('/api/estimate-templates/:id/create', async (req, res) => {
    try {
      const { quantities, ...estimateInput } = req.body;
      if (!quantities || typeof quantities !== 'object') {
        return res.status(400).json({
          error: 'Missing required field: quantities (object with line item codes as keys)'
        });
      }
      const savedEstimate = await createEstimateFromTemplate(
        req.params.id,
        quantities,
        estimateInput
      );
      res.status(201).json(savedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get carrier profiles
  app.get('/api/carrier-profiles', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM carrier_profiles WHERE is_active = true ORDER BY name'
        );
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get regions
  app.get('/api/regions', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM regions ORDER BY id'
        );
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
