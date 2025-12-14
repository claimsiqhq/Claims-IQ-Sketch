import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
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
import {
  generatePdfReport,
  generateEsxExport,
  generateEsxXml,
  generateCsvExport
} from "./services/reportGenerator";
import { passport, requireAuth } from "./middleware/auth";
import { tenantMiddleware, requireOrganization, requireOrgRole, requireSuperAdmin } from "./middleware/tenant";
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
} from "./services/organizations";
import {
  createClaim,
  getClaim,
  listClaims,
  updateClaim,
  deleteClaim,
  getClaimStats
} from "./services/claims";
import {
  createDocument,
  getDocument,
  getDocumentFilePath,
  listDocuments,
  updateDocument,
  deleteDocument,
  getClaimDocuments,
  associateDocumentWithClaim,
  getDocumentStats
} from "./services/documents";
import {
  processDocument as processDocumentAI,
  createClaimFromDocuments
} from "./services/documentProcessor";

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow PDFs, images, and common document types
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Apply tenant middleware to all routes (after auth)
  app.use(tenantMiddleware);

  // ============================================
  // AUTH ROUTES
  // ============================================

  // Login endpoint
  app.post('/api/auth/login', (req, res, next) => {
    const rememberMe = req.body.rememberMe === true;
    
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
        
        // Set session duration based on remember me
        if (rememberMe) {
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        } else {
          req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
        }
        
        // Explicitly save session to ensure it persists
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ error: 'Session save error' });
          }
          return res.json({
            user: { id: user.id, username: user.username },
            message: 'Login successful'
          });
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
    // Disable all caching for auth endpoints
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json; charset=utf-8'
    });
    
    const data = req.isAuthenticated() && req.user
      ? { user: { id: req.user.id, username: req.user.username }, authenticated: true }
      : { user: null, authenticated: false };
    
    // Use send() instead of json() to bypass ETag generation
    res.status(200).send(JSON.stringify(data));
  });

  // Check authentication status
  app.get('/api/auth/check', (req, res) => {
    // Disable all caching for auth endpoints
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json; charset=utf-8'
    });
    
    // Use send() instead of json() to bypass ETag generation
    res.status(200).send(JSON.stringify({ authenticated: req.isAuthenticated() }));
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

  // ============================================
  // COVERAGE TYPES ROUTES
  // ============================================

  // Get all coverage types
  app.get('/api/coverage-types', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM coverage_types WHERE is_active = true ORDER BY sort_order, code'
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

  // Get coverage type by code
  app.get('/api/coverage-types/:code', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM coverage_types WHERE code = $1 AND is_active = true',
          [req.params.code]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Coverage type not found' });
        }
        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // TAX RATES ROUTES
  // ============================================

  // Get all tax rates
  app.get('/api/tax-rates', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { region_code, tax_type } = req.query;
        let query = 'SELECT * FROM tax_rates WHERE is_active = true';
        const params: string[] = [];
        let paramIndex = 1;

        if (region_code) {
          query += ` AND region_code = $${paramIndex}`;
          params.push(region_code as string);
          paramIndex++;
        }
        if (tax_type) {
          query += ` AND tax_type = $${paramIndex}`;
          params.push(tax_type as string);
        }

        query += ' ORDER BY region_code, tax_type';
        const result = await client.query(query, params);
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get tax rate for a specific region
  app.get('/api/tax-rates/region/:regionCode', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM tax_rates
           WHERE region_code = $1 AND is_active = true
           ORDER BY tax_type`,
          [req.params.regionCode]
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

  // ============================================
  // DEPRECIATION SCHEDULES ROUTES
  // ============================================

  // Get all depreciation schedules
  app.get('/api/depreciation-schedules', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { category_code, item_type } = req.query;
        let query = 'SELECT * FROM depreciation_schedules WHERE 1=1';
        const params: string[] = [];
        let paramIndex = 1;

        if (category_code) {
          query += ` AND category_code = $${paramIndex}`;
          params.push(category_code as string);
          paramIndex++;
        }
        if (item_type) {
          query += ` AND item_type ILIKE $${paramIndex}`;
          params.push(`%${item_type}%`);
        }

        query += ' ORDER BY category_code, item_type';
        const result = await client.query(query, params);
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get depreciation schedule by category
  app.get('/api/depreciation-schedules/category/:categoryCode', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM depreciation_schedules
           WHERE category_code = $1
           ORDER BY item_type`,
          [req.params.categoryCode]
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

  // ============================================
  // REGIONAL MULTIPLIERS ROUTES
  // ============================================

  // Get all regional multipliers
  app.get('/api/regional-multipliers', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM regional_multipliers WHERE is_active = true ORDER BY region_code'
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

  // Get regional multiplier by region code
  app.get('/api/regional-multipliers/:regionCode', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM regional_multipliers WHERE region_code = $1 AND is_active = true',
          [req.params.regionCode]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Regional multiplier not found' });
        }
        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // LABOR RATES ROUTES
  // ============================================

  // Get all labor rates
  app.get('/api/labor-rates', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { trade_code, region_code } = req.query;
        let query = 'SELECT * FROM labor_rates_enhanced WHERE is_active = true';
        const params: string[] = [];
        let paramIndex = 1;

        if (trade_code) {
          query += ` AND trade_code = $${paramIndex}`;
          params.push(trade_code as string);
          paramIndex++;
        }
        if (region_code) {
          query += ` AND region_code = $${paramIndex}`;
          params.push(region_code as string);
        }

        query += ' ORDER BY trade_code, region_code';
        const result = await client.query(query, params);
        res.json(result.rows);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get labor rate for specific trade
  app.get('/api/labor-rates/trade/:tradeCode', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM labor_rates_enhanced
           WHERE trade_code = $1 AND is_active = true
           ORDER BY region_code`,
          [req.params.tradeCode]
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

  // ============================================
  // PRICE LISTS ROUTES
  // ============================================

  // Get all price lists
  app.get('/api/price-lists', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM price_lists
           WHERE is_active = true
           ORDER BY effective_date DESC, region_code`
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

  // Get price list by code
  app.get('/api/price-lists/:code', async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM price_lists WHERE code = $1 AND is_active = true',
          [req.params.code]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Price list not found' });
        }
        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // REPORT & EXPORT ROUTES
  // ============================================

  // Generate PDF report (returns HTML for PDF conversion)
  app.get('/api/estimates/:id/report/pdf', async (req, res) => {
    try {
      const options = {
        includeLineItemDetails: req.query.includeLineItems !== 'false',
        includeDepreciation: req.query.includeDepreciation !== 'false',
        includeCoverageSummary: req.query.includeCoverage !== 'false',
        companyName: req.query.companyName as string,
      };
      const html = await generatePdfReport(req.params.id, options);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Generate ESX JSON export
  app.get('/api/estimates/:id/export/esx', async (req, res) => {
    try {
      const metadata = {
        dateOfLoss: req.query.dateOfLoss as string,
        insuredName: req.query.insuredName as string,
        adjusterName: req.query.adjusterName as string,
        priceListDate: req.query.priceListDate as string,
      };
      const esxData = await generateEsxExport(req.params.id, metadata);
      res.json(esxData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Generate ESX XML export
  app.get('/api/estimates/:id/export/esx-xml', async (req, res) => {
    try {
      const metadata = {
        dateOfLoss: req.query.dateOfLoss as string,
        insuredName: req.query.insuredName as string,
        adjusterName: req.query.adjusterName as string,
        priceListDate: req.query.priceListDate as string,
      };
      const xml = await generateEsxXml(req.params.id, metadata);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="estimate-${req.params.id}.esx"`);
      res.send(xml);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Generate CSV export
  app.get('/api/estimates/:id/export/csv', async (req, res) => {
    try {
      const csv = await generateCsvExport(req.params.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="estimate-${req.params.id}.csv"`);
      res.send(csv);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // ORGANIZATION (TENANT) ROUTES
  // ============================================

  // Get current user's organizations
  app.get('/api/organizations/mine', requireAuth, async (req, res) => {
    try {
      const orgs = await getUserOrganizations(req.user!.id);
      res.json({
        organizations: orgs,
        currentOrganizationId: req.organizationId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Switch current organization
  app.post('/api/organizations/switch', requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ error: 'organizationId required' });
      }
      const success = await switchOrganization(req.user!.id, organizationId);
      if (!success) {
        return res.status(403).json({ error: 'Not a member of this organization' });
      }
      res.json({ success: true, currentOrganizationId: organizationId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Create new organization
  app.post('/api/organizations', requireAuth, async (req, res) => {
    try {
      const org = await createOrganization(req.body, req.user!.id);
      res.status(201).json(org);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('already exists')) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // List all organizations (super admin only)
  app.get('/api/admin/organizations', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { status, type, limit, offset } = req.query;
      const result = await listOrganizations({
        status: status as string,
        type: type as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get current organization details
  app.get('/api/organizations/current', requireAuth, requireOrganization, async (req, res) => {
    try {
      const org = await getOrganization(req.organizationId!);
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      res.json(org);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update current organization
  app.put('/api/organizations/current', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req, res) => {
    try {
      const org = await updateOrganization(req.organizationId!, req.body);
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      res.json(org);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get organization members
  app.get('/api/organizations/current/members', requireAuth, requireOrganization, async (req, res) => {
    try {
      const members = await getOrganizationMembers(req.organizationId!);
      res.json(members);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Add member to organization
  app.post('/api/organizations/current/members', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req, res) => {
    try {
      const { userId, role } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }
      await addOrganizationMember(req.organizationId!, userId, role || 'member');
      res.status(201).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Remove member from organization
  app.delete('/api/organizations/current/members/:userId', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req, res) => {
    try {
      await removeOrganizationMember(req.organizationId!, req.params.userId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // CLAIMS ROUTES
  // ============================================

  // Create new claim
  app.post('/api/claims', requireAuth, requireOrganization, async (req, res) => {
    try {
      const claim = await createClaim(req.organizationId!, req.body);
      res.status(201).json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // List claims for organization
  app.get('/api/claims', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { status, loss_type, adjuster_id, search, limit, offset } = req.query;
      const result = await listClaims(req.organizationId!, {
        status: status as string,
        lossType: loss_type as string,
        assignedAdjusterId: adjuster_id as string,
        search: search as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get claim statistics
  app.get('/api/claims/stats', requireAuth, requireOrganization, async (req, res) => {
    try {
      const stats = await getClaimStats(req.organizationId!);
      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get single claim
  app.get('/api/claims/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const claim = await getClaim(req.params.id, req.organizationId!);
      if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      res.json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update claim
  app.put('/api/claims/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const claim = await updateClaim(req.params.id, req.organizationId!, req.body);
      if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      res.json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete claim
  app.delete('/api/claims/:id', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req, res) => {
    try {
      const success = await deleteClaim(req.params.id, req.organizationId!);
      if (!success) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get claim documents
  app.get('/api/claims/:id/documents', requireAuth, requireOrganization, async (req, res) => {
    try {
      const documents = await getClaimDocuments(req.params.id, req.organizationId!);
      res.json(documents);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // DOCUMENT ROUTES
  // ============================================

  // Upload document
  app.post('/api/documents', requireAuth, requireOrganization, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { claimId, name, type, category, description, tags } = req.body;
      if (!type) {
        return res.status(400).json({ error: 'Document type required (fnol, policy, endorsement, photo, estimate, correspondence)' });
      }

      const doc = await createDocument(
        req.organizationId!,
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer
        },
        {
          claimId,
          name,
          type,
          category,
          description,
          tags: tags ? JSON.parse(tags) : undefined,
          uploadedBy: req.user!.id
        }
      );
      res.status(201).json(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Upload multiple documents
  app.post('/api/documents/bulk', requireAuth, requireOrganization, upload.array('files', 20), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const { claimId, type, category } = req.body;
      if (!type) {
        return res.status(400).json({ error: 'Document type required' });
      }

      const results = [];
      for (const file of files) {
        const doc = await createDocument(
          req.organizationId!,
          {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer
          },
          {
            claimId,
            type,
            category,
            uploadedBy: req.user!.id
          }
        );
        results.push(doc);
      }

      res.status(201).json({ documents: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // List documents
  app.get('/api/documents', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { claim_id, type, category, status, limit, offset } = req.query;
      const result = await listDocuments(req.organizationId!, {
        claimId: claim_id as string,
        type: type as string,
        category: category as string,
        processingStatus: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get document statistics
  app.get('/api/documents/stats', requireAuth, requireOrganization, async (req, res) => {
    try {
      const stats = await getDocumentStats(req.organizationId!);
      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get single document metadata
  app.get('/api/documents/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Download document file
  app.get('/api/documents/:id/download', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const filePath = getDocumentFilePath(doc.storagePath);
      res.download(filePath, doc.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update document metadata
  app.put('/api/documents/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await updateDocument(req.params.id, req.organizationId!, req.body);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Associate document with claim
  app.post('/api/documents/:id/claim', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { claimId } = req.body;
      if (!claimId) {
        return res.status(400).json({ error: 'claimId required' });
      }
      const success = await associateDocumentWithClaim(req.params.id, claimId, req.organizationId!);
      if (!success) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete document
  app.delete('/api/documents/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const success = await deleteDocument(req.params.id, req.organizationId!);
      if (!success) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Process document with AI extraction
  app.post('/api/documents/:id/process', requireAuth, requireOrganization, async (req, res) => {
    try {
      const extractedData = await processDocumentAI(req.params.id, req.organizationId!);
      res.json({
        extractedData,
        processingStatus: 'completed'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Create claim from uploaded documents
  app.post('/api/claims/from-documents', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { documentIds, overrides } = req.body;

      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds array required' });
      }

      const claimId = await createClaimFromDocuments(
        req.organizationId!,
        documentIds,
        overrides
      );

      // Get the created claim
      const claim = await getClaim(claimId, req.organizationId!);
      res.status(201).json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
