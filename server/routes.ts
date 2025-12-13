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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  return httpServer;
}
