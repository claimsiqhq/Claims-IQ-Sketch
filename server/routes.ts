import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { xactCategories, xactLineItems, xactComponents } from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";
import {
  calculateXactPrice,
  searchXactItemsWithPricing,
  getXactItemForEstimate
} from "./services/xactPricing";
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
import { generateEstimatePdf, isPdfGenerationAvailable } from "./services/pdfGenerator";
import {
  submitEstimate,
  validateEstimateForSubmission,
  assertEstimateNotLocked,
  getEstimateLockStatus,
  getEstimateIdFromZone,
  getEstimateIdFromLineItem,
  getEstimateIdFromStructure,
  getEstimateIdFromArea,
} from "./services/estimateSubmission";
import { passport, requireAuth } from "./middleware/auth";
import { updateUserProfile, changeUserPassword } from "./services/auth";
import {
  signUp as supabaseSignUp,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  verifyToken,
  requestPasswordReset,
  updatePassword,
  findUserById as supabaseFindUser
} from "./services/supabaseAuth";
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
  getDocumentDownloadUrl,
  downloadDocumentFile,
  listDocuments,
  updateDocument,
  deleteDocument,
  getClaimDocuments,
  associateDocumentWithClaim,
  getDocumentStats,
  initializeStorageBucket
} from "./services/documents";
import {
  processDocument as processDocumentAI,
  createClaimFromDocuments
} from "./services/documentProcessor";
import {
  getClaimsForMap,
  getMapStats,
  geocodePendingClaims
} from "./services/geocoding";
import {
  generateFloorplanData,
  createOrUpdateRoom,
  addRoomOpening,
  addMissingWall,
  getSketchState
} from "./services/sketchTools";
import {
  getInspectionRulesForPeril,
  getQuickInspectionTips,
  getEscalationTriggers,
  getMergedInspectionGuidance,
} from "./config/perilInspectionRules";
import {
  buildInspectionIntelligence,
  getInspectionIntelligenceForPeril,
} from "./services/perilAwareContext";
import {
  generateClaimBriefing,
  getClaimBriefing,
  isBriefingStale,
  deleteClaimBriefings,
} from "./services/claimBriefingService";
import {
  getCarrierOverlays,
  getCarrierOverlaysForClaim,
  getMergedInspectionForClaim,
  updateCarrierOverlays,
} from "./services/carrierOverlayService";
import {
  createStructure,
  getStructure,
  updateStructure,
  deleteStructure,
  createArea,
  getArea,
  updateArea,
  deleteArea,
  createZone,
  getZone,
  getZoneWithChildren,
  updateZone,
  deleteZone,
  recalculateZoneDimensions,
  createMissingWall,
  getMissingWall,
  updateMissingWall,
  deleteMissingWall,
  createSubroom,
  getSubroom,
  updateSubroom,
  deleteSubroom,
  getEstimateHierarchy,
  initializeEstimateHierarchy,
  addLineItemToZone,
  addLineItemFromDimension,
  createCoverage,
  getCoverages,
  updateLineItemCoverage,
  getLineItemsByCoverage,
  addScopeItemToClaim,
  getScopeItemsForClaim,
  updateScopeItem,
  deleteScopeItem,
} from "./services/estimateHierarchy";

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
          // Disable caching for login response to prevent 304 issues
          res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
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

  // Get current user endpoint (supports both session and Supabase auth)
  app.get('/api/auth/me', async (req, res) => {
    // Disable all caching for auth endpoints
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json; charset=utf-8'
    });

    // Check session-based auth
    if (req.isAuthenticated() && req.user) {
      try {
        const { pool } = await import('./db');
        const result = await pool.query(
          'SELECT id, username, first_name, last_name, email FROM users WHERE id = $1',
          [req.user.id]
        );
        const user = result.rows[0];
        const data = {
          user: {
            id: user.id,
            username: user.username,
            name: user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.username,
            email: user.email || ''
          },
          authenticated: true
        };
        res.status(200).send(JSON.stringify(data));
      } catch (error) {
        res.status(200).send(JSON.stringify({ user: { id: req.user.id, username: req.user.username }, authenticated: true }));
      }
      return;
    }

    // Check Supabase auth via Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const user = await verifyToken(token);
        if (user) {
          const data = {
            user: {
              id: user.id,
              username: user.username,
              name: user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.username,
              email: user.email || ''
            },
            authenticated: true
          };
          res.status(200).send(JSON.stringify(data));
          return;
        }
      } catch (error) {
        console.error('Token verification error:', error);
      }
    }

    res.status(200).send(JSON.stringify({ user: null, authenticated: false }));
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

    // Check both session and Supabase auth
    const isAuthenticated = req.isAuthenticated() || !!(req as any).isSupabaseAuth;
    res.status(200).send(JSON.stringify({ authenticated: isAuthenticated }));
  });

  // ============================================
  // SUPABASE AUTH ROUTES
  // ============================================

  // Supabase login endpoint
  app.post('/api/auth/supabase/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { user, session, error } = await supabaseSignIn(email, password);

      if (error) {
        return res.status(401).json({ error });
      }

      res.json({
        user: {
          id: user!.id,
          username: user!.username,
          email: user!.email,
          firstName: user!.firstName,
          lastName: user!.lastName,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        },
        message: 'Login successful'
      });
    } catch (error) {
      console.error('Supabase login error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  });

  // Supabase registration endpoint
  app.post('/api/auth/supabase/register', async (req, res) => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { user, error } = await supabaseSignUp(email, password, {
        username,
        firstName,
        lastName,
      });

      if (error) {
        return res.status(400).json({ error });
      }

      res.json({
        user: {
          id: user!.id,
          username: user!.username,
          email: user!.email,
        },
        message: 'Registration successful. Please check your email to verify your account.'
      });
    } catch (error) {
      console.error('Supabase registration error:', error);
      res.status(500).json({ error: 'Registration error' });
    }
  });

  // Supabase logout endpoint
  app.post('/api/auth/supabase/logout', async (req, res) => {
    try {
      const { error } = await supabaseSignOut();

      if (error) {
        return res.status(500).json({ error });
      }

      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Supabase logout error:', error);
      res.status(500).json({ error: 'Logout error' });
    }
  });

  // Supabase password reset request
  app.post('/api/auth/supabase/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const { error } = await requestPasswordReset(email);

      if (error) {
        return res.status(400).json({ error });
      }

      res.json({ message: 'Password reset email sent' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: 'Failed to send password reset email' });
    }
  });

  // Supabase get current user (from token)
  app.get('/api/auth/supabase/me', async (req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({ user: null, authenticated: false });
      }

      const token = authHeader.substring(7);
      const user = await verifyToken(token);

      if (!user) {
        return res.json({ user: null, authenticated: false });
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          currentOrganizationId: user.currentOrganizationId,
        },
        authenticated: true
      });
    } catch (error) {
      console.error('Get current user error:', error);
      res.json({ user: null, authenticated: false });
    }
  });

  // ============================================
  // USER PROFILE ROUTES
  // ============================================

  // Update user profile
  app.put('/api/users/profile', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { name, email } = req.body;
      
      const updatedUser = await updateUserProfile(userId, { name, email });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ user: updatedUser, message: 'Profile updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Change user password
  app.put('/api/users/password', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      
      const result = await changeUserPassword(userId, currentPassword, newPassword);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get user preferences
  app.get('/api/users/preferences', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT preferences FROM users WHERE id = $1',
          [userId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0].preferences || {});
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update user preferences
  app.put('/api/users/preferences', requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const preferences = req.body;
      
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const existingResult = await client.query(
          'SELECT preferences FROM users WHERE id = $1',
          [userId]
        );
        if (existingResult.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        const existingPrefs = existingResult.rows[0].preferences || {};
        const mergedPrefs = { ...existingPrefs, ...preferences };
        
        await client.query(
          'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
          [mergedPrefs, userId]
        );
        
        res.json({ preferences: mergedPrefs, message: 'Preferences saved successfully' });
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
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
  app.post('/api/estimates', requireAuth, async (req, res) => {
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
  app.get('/api/estimates', requireAuth, async (req, res) => {
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
  app.get('/api/estimates/:id', requireAuth, async (req, res) => {
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
  app.put('/api/estimates/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      await assertEstimateNotLocked(req.params.id);

      const updatedEstimate = await updateEstimate(req.params.id, req.body);
      res.json(updatedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Add line item to estimate
  app.post('/api/estimates/:id/line-items', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      await assertEstimateNotLocked(req.params.id);

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
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Remove line item from estimate
  app.delete('/api/estimates/:id/line-items/:code', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      await assertEstimateNotLocked(req.params.id);

      const updatedEstimate = await removeLineItemFromEstimate(
        req.params.id,
        req.params.code
      );
      res.json(updatedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // ESTIMATE SUBMISSION/FINALIZATION ROUTES
  // ============================================

  // Submit estimate for review (finalize)
  app.post('/api/estimates/:id/submit', requireAuth, async (req, res) => {
    try {
      const result = await submitEstimate(req.params.id);

      if (!result.success) {
        // Validation errors block submission
        return res.status(400).json(result);
      }

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

  // Validate estimate before submission (preview)
  app.get('/api/estimates/:id/validate', requireAuth, async (req, res) => {
    try {
      const result = await validateEstimateForSubmission(req.params.id);

      res.json({
        isValid: result.isValid,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        infoCount: result.infoCount,
        errors: result.issues.filter(i => i.severity === 'error'),
        warnings: result.issues.filter(i => i.severity === 'warning'),
        info: result.issues.filter(i => i.severity === 'info'),
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

  // Get estimate lock status (accepts estimate ID or claim ID)
  app.get('/api/estimates/:id/lock-status', requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      const { pool } = await import('./db');
      const client = await pool.connect();
      
      try {
        // First try by estimate ID
        let result = await client.query(
          `SELECT id, status, finalized_at
           FROM estimates
           WHERE id = $1`,
          [id]
        );
        
        // If not found, try by claim ID
        if (result.rows.length === 0) {
          result = await client.query(
            `SELECT id, status, finalized_at
             FROM estimates
             WHERE claim_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [id]
          );
        }
        
        if (result.rows.length === 0) {
          // No estimate exists - return default unlocked status
          return res.json({
            isLocked: false,
            status: 'none',
            submittedAt: null,
          });
        }
        
        const row = result.rows[0];
        const isLocked = row.status === 'submitted' || row.status === 'finalized' || row.finalized_at !== null;
        
        return res.json({
          isLocked,
          status: row.status || 'draft',
          submittedAt: row.finalized_at ? new Date(row.finalized_at) : null,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
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
  app.post('/api/estimate-templates/:id/create', requireAuth, async (req, res) => {
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

  // Generate PDF report (returns real PDF if Puppeteer available, HTML otherwise)
  app.get('/api/estimates/:id/report/pdf', async (req, res) => {
    try {
      const options = {
        includeLineItemDetails: req.query.includeLineItems !== 'false',
        includeDepreciation: req.query.includeDepreciation !== 'false',
        includeCoverageSummary: req.query.includeCoverage !== 'false',
        companyName: req.query.companyName as string,
      };

      // Check if client wants HTML only (for preview)
      const htmlOnly = req.query.format === 'html';

      if (htmlOnly) {
        // Return HTML for preview
        const html = await generatePdfReport(req.params.id, options);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }

      // Try to generate real PDF
      const pdfAvailable = await isPdfGenerationAvailable();

      if (pdfAvailable) {
        const pdfBuffer = await generateEstimatePdf(req.params.id, options);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="estimate-${req.params.id}.pdf"`);
        res.send(pdfBuffer);
      } else {
        // Fallback to HTML with instructions
        const html = await generatePdfReport(req.params.id, options);
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('X-PDF-Fallback', 'true');
        res.send(html);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get HTML report preview
  app.get('/api/estimates/:id/report/html', async (req, res) => {
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
  // ESTIMATE HIERARCHY ROUTES
  // Structure -> Area -> Zone -> Line Items
  // ============================================

  // Get full estimate hierarchy
  app.get('/api/estimates/:id/hierarchy', requireAuth, async (req, res) => {
    try {
      const hierarchy = await getEstimateHierarchy(req.params.id);
      res.json(hierarchy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Initialize estimate hierarchy with defaults
  app.post('/api/estimates/:id/hierarchy/initialize', requireAuth, async (req, res) => {
    try {
      const { structureName, includeInterior, includeExterior, includeRoofing } = req.body;
      const hierarchy = await initializeEstimateHierarchy(req.params.id, {
        structureName,
        includeInterior,
        includeExterior,
        includeRoofing,
      });
      res.status(201).json(hierarchy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Recalculate estimate totals
  app.post('/api/estimates/:id/recalculate', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      await assertEstimateNotLocked(req.params.id);

      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        await client.query('SELECT recalculate_estimate_totals($1)', [req.params.id]);
        const estimate = await getEstimate(req.params.id);
        res.json(estimate);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // STRUCTURE ROUTES
  // ============================================

  // Create structure
  app.post('/api/estimates/:id/structures', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      await assertEstimateNotLocked(req.params.id);

      const structure = await createStructure({
        estimateId: req.params.id,
        ...req.body,
      });
      res.status(201).json(structure);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get structure
  app.get('/api/structures/:id', requireAuth, async (req, res) => {
    try {
      const structure = await getStructure(req.params.id);
      if (!structure) {
        return res.status(404).json({ error: 'Structure not found' });
      }
      res.json(structure);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update structure
  app.put('/api/structures/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromStructure(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const structure = await updateStructure(req.params.id, req.body);
      if (!structure) {
        return res.status(404).json({ error: 'Structure not found' });
      }
      res.json(structure);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Delete structure
  app.delete('/api/structures/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromStructure(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const success = await deleteStructure(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Structure not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // AREA ROUTES
  // ============================================

  // Create area in structure
  app.post('/api/structures/:id/areas', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromStructure(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const area = await createArea({
        structureId: req.params.id,
        ...req.body,
      });
      res.status(201).json(area);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get area
  app.get('/api/areas/:id', requireAuth, async (req, res) => {
    try {
      const area = await getArea(req.params.id);
      if (!area) {
        return res.status(404).json({ error: 'Area not found' });
      }
      res.json(area);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update area
  app.put('/api/areas/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromArea(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const area = await updateArea(req.params.id, req.body);
      if (!area) {
        return res.status(404).json({ error: 'Area not found' });
      }
      res.json(area);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Delete area
  app.delete('/api/areas/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromArea(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const success = await deleteArea(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Area not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // ZONE ROUTES
  // ============================================

  // Create zone in area
  app.post('/api/areas/:id/zones', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromArea(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const zone = await createZone({
        areaId: req.params.id,
        ...req.body,
      });
      res.status(201).json(zone);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Get zone
  app.get('/api/zones/:id', requireAuth, async (req, res) => {
    try {
      const zone = await getZone(req.params.id);
      if (!zone) {
        return res.status(404).json({ error: 'Zone not found' });
      }
      res.json(zone);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get zone with children (missing walls, subrooms, line items)
  app.get('/api/zones/:id/full', requireAuth, async (req, res) => {
    try {
      const zone = await getZoneWithChildren(req.params.id);
      if (!zone) {
        return res.status(404).json({ error: 'Zone not found' });
      }
      res.json(zone);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update zone
  app.put('/api/zones/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromZone(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const zone = await updateZone(req.params.id, req.body);
      if (!zone) {
        return res.status(404).json({ error: 'Zone not found' });
      }
      res.json(zone);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Recalculate zone dimensions
  app.post('/api/zones/:id/calculate-dimensions', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromZone(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const dimensions = await recalculateZoneDimensions(req.params.id);
      res.json({ dimensions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Delete zone
  app.delete('/api/zones/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromZone(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const success = await deleteZone(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Zone not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ============================================
  // MISSING WALL ROUTES
  // ============================================

  // Add missing wall to zone
  app.post('/api/zones/:id/missing-walls', requireAuth, async (req, res) => {
    try {
      const { widthFt, heightFt } = req.body;
      if (!widthFt || !heightFt) {
        return res.status(400).json({ error: 'widthFt and heightFt required' });
      }
      const wall = await createMissingWall({
        zoneId: req.params.id,
        ...req.body,
      });
      res.status(201).json(wall);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get missing wall
  app.get('/api/missing-walls/:id', requireAuth, async (req, res) => {
    try {
      const wall = await getMissingWall(req.params.id);
      if (!wall) {
        return res.status(404).json({ error: 'Missing wall not found' });
      }
      res.json(wall);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update missing wall
  app.put('/api/missing-walls/:id', requireAuth, async (req, res) => {
    try {
      const wall = await updateMissingWall(req.params.id, req.body);
      if (!wall) {
        return res.status(404).json({ error: 'Missing wall not found' });
      }
      res.json(wall);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete missing wall
  app.delete('/api/missing-walls/:id', requireAuth, async (req, res) => {
    try {
      const success = await deleteMissingWall(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Missing wall not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // SUBROOM ROUTES
  // ============================================

  // Add subroom to zone
  app.post('/api/zones/:id/subrooms', requireAuth, async (req, res) => {
    try {
      const { name, lengthFt, widthFt } = req.body;
      if (!name || !lengthFt || !widthFt) {
        return res.status(400).json({ error: 'name, lengthFt, and widthFt required' });
      }
      const subroom = await createSubroom({
        zoneId: req.params.id,
        ...req.body,
      });
      res.status(201).json(subroom);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete subroom
  app.delete('/api/subrooms/:id', requireAuth, async (req, res) => {
    try {
      const success = await deleteSubroom(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Subroom not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // ZONE LINE ITEM ROUTES
  // ============================================

  // Get zone line items
  app.get('/api/zones/:id/line-items', requireAuth, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM estimate_line_items WHERE zone_id = $1 ORDER BY sort_order`,
          [req.params.id]
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

  // Add line item to zone
  app.post('/api/zones/:id/line-items', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromZone(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const { lineItemCode, quantity } = req.body;
      if (!lineItemCode || !quantity) {
        return res.status(400).json({ error: 'lineItemCode and quantity required' });
      }
      await addLineItemToZone(req.params.id, req.body);
      const zone = await getZoneWithChildren(req.params.id);
      res.status(201).json(zone);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Delete line item from zone
  app.delete('/api/line-items/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromLineItem(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          'DELETE FROM estimate_line_items WHERE id = $1',
          [req.params.id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Line item not found' });
        }
        res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('finalized')) {
        res.status(403).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // Update line item
  app.put('/api/line-items/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromLineItem(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        const allowedFields = [
          'quantity', 'notes', 'is_homeowner', 'is_credit', 'is_non_op',
          'depreciation_pct', 'depreciation_amount', 'age_years', 'life_expectancy_years',
          'is_recoverable', 'calc_ref'
        ];

        for (const field of allowedFields) {
          const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          if (req.body[camelField] !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            values.push(req.body[camelField]);
          }
        }

        if (setClauses.length === 0) {
          const result = await client.query(
            'SELECT * FROM estimate_line_items WHERE id = $1',
            [req.params.id]
          );
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Line item not found' });
          }
          return res.json(result.rows[0]);
        }

        setClauses.push('updated_at = NOW()');
        values.push(req.params.id);

        const result = await client.query(
          `UPDATE estimate_line_items SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Line item not found' });
        }

        // Recalculate subtotal if quantity changed
        if (req.body.quantity !== undefined) {
          await client.query(
            `UPDATE estimate_line_items
             SET subtotal = quantity * unit_price,
                 acv = (quantity * unit_price + COALESCE(tax_amount, 0)) * (1 - COALESCE(depreciation_pct, 0) / 100)
             WHERE id = $1`,
            [req.params.id]
          );
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

  // Add line item from zone dimension (auto-calculate quantity)
  app.post('/api/zones/:id/line-items/from-dimension', requireAuth, async (req, res) => {
    try {
      const { lineItemCode, dimensionKey, unitPrice, taxRate, depreciationPct, isRecoverable, notes } = req.body;
      if (!lineItemCode || !dimensionKey) {
        return res.status(400).json({ error: 'lineItemCode and dimensionKey required' });
      }
      const result = await addLineItemFromDimension({
        zoneId: req.params.id,
        lineItemCode,
        dimensionKey,
        unitPrice,
        taxRate,
        depreciationPct,
        isRecoverable,
        notes,
      });
      const zone = await getZoneWithChildren(req.params.id);
      res.status(201).json({ ...result, zone });
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
  // SUBROOM ROUTES
  // ============================================

  // Get subroom
  app.get('/api/subrooms/:id', requireAuth, async (req, res) => {
    try {
      const subroom = await getSubroom(req.params.id);
      if (!subroom) {
        return res.status(404).json({ error: 'Subroom not found' });
      }
      res.json(subroom);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update subroom
  app.put('/api/subrooms/:id', requireAuth, async (req, res) => {
    try {
      const subroom = await updateSubroom(req.params.id, req.body);
      if (!subroom) {
        return res.status(404).json({ error: 'Subroom not found' });
      }
      res.json(subroom);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete subroom
  app.delete('/api/subrooms/:id', requireAuth, async (req, res) => {
    try {
      const success = await deleteSubroom(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Subroom not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // COVERAGE ROUTES
  // ============================================

  // Get coverages for an estimate
  app.get('/api/estimates/:id/coverages', requireAuth, async (req, res) => {
    try {
      const coverages = await getCoverages(req.params.id);
      res.json(coverages);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Create coverage for an estimate
  app.post('/api/estimates/:id/coverages', requireAuth, async (req, res) => {
    try {
      const { coverageType, coverageName, policyLimit, deductible } = req.body;
      if (!coverageType || !coverageName) {
        return res.status(400).json({ error: 'coverageType and coverageName required' });
      }
      const coverage = await createCoverage({
        estimateId: req.params.id,
        coverageType,
        coverageName,
        policyLimit,
        deductible,
      });
      res.status(201).json(coverage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get line items grouped by coverage
  app.get('/api/estimates/:id/line-items/by-coverage', requireAuth, async (req, res) => {
    try {
      const grouped = await getLineItemsByCoverage(req.params.id);
      res.json(grouped);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update line item coverage assignment
  app.put('/api/line-items/:id/coverage', requireAuth, async (req, res) => {
    try {
      const { coverageId } = req.body;
      await updateLineItemCoverage(req.params.id, coverageId || null);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
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

      // Associate documents with the claim if documentIds are provided in metadata
      const documentIds = req.body.metadata?.documentIds;
      if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
        const { pool } = await import('./db');
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE documents SET claim_id = $1, updated_at = NOW()
             WHERE id = ANY($2) AND organization_id = $3`,
            [claim.id, documentIds, req.organizationId]
          );
        } finally {
          client.release();
        }
      }

      res.status(201).json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // List claims for organization
  app.get('/api/claims', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { status, loss_type, adjuster_id, search, limit, offset, include_closed } = req.query;
      const result = await listClaims(req.organizationId!, {
        status: status as string,
        lossType: loss_type as string,
        assignedAdjusterId: adjuster_id as string,
        search: search as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        includeClosed: include_closed === 'true'
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

  // Get claims for map display
  app.get('/api/claims/map', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { adjuster_id, status, loss_type, my_claims } = req.query;

      // If my_claims=true and user is an adjuster, filter to their claims
      let assignedAdjusterId = adjuster_id as string | undefined;
      if (my_claims === 'true' && req.user?.id) {
        assignedAdjusterId = req.user.id;
      }

      const claims = await getClaimsForMap(req.organizationId!, {
        assignedAdjusterId,
        status: status as string,
        lossType: loss_type as string
      });
      res.json({ claims, total: claims.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get map geocoding statistics
  app.get('/api/claims/map/stats', requireAuth, requireOrganization, async (req, res) => {
    try {
      const stats = await getMapStats(req.organizationId!);
      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Trigger geocoding for pending claims
  app.post('/api/claims/geocode-pending', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { limit } = req.body;
      const count = await geocodePendingClaims(req.organizationId!, limit || 100);
      res.json({ queued: count, message: `Queued ${count} claims for geocoding` });
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

  // Save rooms to claim (uses claim_rooms and claim_damage_zones tables)
  app.post('/api/claims/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { rooms } = req.body;
      const { saveClaimRoomsAndZones } = await import('./services/rooms');
      
      // Verify claim exists and belongs to organization
      const { pool } = await import('./db');
      const claimCheck = await pool.query(
        `SELECT id FROM claims WHERE id = $1 AND organization_id = $2`,
        [req.params.id, req.organizationId]
      );
      if (claimCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      
      const result = await saveClaimRoomsAndZones(
        req.params.id,
        req.organizationId!,
        rooms || []
      );
      
      res.json({ 
        success: true, 
        roomsSaved: result.rooms.length, 
        damageZonesSaved: result.damageZones.length,
        rooms: result.rooms,
        damageZones: result.damageZones
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get claim rooms (from claim_rooms and claim_damage_zones tables)
  app.get('/api/claims/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { getClaimRoomsAndZones } = await import('./services/rooms');
      
      // Verify claim exists and belongs to organization
      const { pool } = await import('./db');
      const claimCheck = await pool.query(
        `SELECT id FROM claims WHERE id = $1 AND organization_id = $2`,
        [req.params.id, req.organizationId]
      );
      if (claimCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      
      const result = await getClaimRoomsAndZones(req.params.id);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // CLAIM SCOPE ITEMS (uses estimate infrastructure)
  // ============================================

  // Get scope items for a claim
  app.get('/api/claims/:id/scope-items', requireAuth, requireOrganization, async (req, res) => {
    try {
      const items = await getScopeItemsForClaim(req.params.id);
      res.json(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Add scope item to claim
  app.post('/api/claims/:id/scope-items', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { lineItemCode, description, category, quantity, unit, unitPrice, roomName, notes } = req.body;
      
      if (!lineItemCode || !description || !quantity || !unit || unitPrice === undefined) {
        return res.status(400).json({ 
          error: 'Missing required fields: lineItemCode, description, quantity, unit, unitPrice' 
        });
      }

      const item = await addScopeItemToClaim(
        req.params.id,
        req.organizationId!,
        { lineItemCode, description, category, quantity, unit, unitPrice, roomName, notes }
      );
      res.status(201).json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update scope item
  app.patch('/api/scope-items/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { quantity, notes } = req.body;
      const item = await updateScopeItem(req.params.id, { quantity, notes });
      if (!item) {
        return res.status(404).json({ error: 'Scope item not found' });
      }
      res.json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete scope item
  app.delete('/api/scope-items/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const success = await deleteScopeItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Scope item not found' });
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

  // Get claim policy forms
  app.get('/api/claims/:id/policy-forms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM policy_forms WHERE claim_id = $1 AND organization_id = $2 ORDER BY created_at`,
          [req.params.id, req.organizationId]
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

  // Get claim endorsements
  app.get('/api/claims/:id/endorsements', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM endorsements WHERE claim_id = $1 AND organization_id = $2 ORDER BY created_at`,
          [req.params.id, req.organizationId]
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
  // INSPECTION INTELLIGENCE ROUTES
  // ============================================

  /**
   * GET /api/inspection-intelligence/:peril
   * Get inspection intelligence for a specific peril.
   * Returns deterministic inspection rules, tips, and escalation triggers.
   */
  app.get('/api/inspection-intelligence/:peril', requireAuth, async (req, res) => {
    try {
      const { peril } = req.params;
      const intelligence = getInspectionIntelligenceForPeril(peril);
      res.json(intelligence);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/inspection-intelligence/:peril/tips
   * Get quick inspection tips for a specific peril (for UI micro-hints).
   */
  app.get('/api/inspection-intelligence/:peril/tips', requireAuth, async (req, res) => {
    try {
      const { peril } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;
      const tips = getQuickInspectionTips(peril, limit);
      res.json({ tips });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/claims/:id/inspection-intelligence
   * Get inspection intelligence for a claim based on its peril.
   */
  app.get('/api/claims/:id/inspection-intelligence', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        // Get the claim's peril
        const claimResult = await client.query(
          `SELECT primary_peril, secondary_perils FROM claims WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (claimResult.rows.length === 0) {
          return res.status(404).json({ error: 'Claim not found' });
        }
        const { primary_peril, secondary_perils } = claimResult.rows[0];
        const peril = primary_peril || 'other';
        const secondaryPerils = Array.isArray(secondary_perils) ? secondary_perils : [];

        // Build inspection intelligence
        const intelligence = buildInspectionIntelligence(peril, secondaryPerils);
        res.json(intelligence);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // CLAIM BRIEFING ROUTES
  // ============================================

  /**
   * GET /api/claims/:id/briefing
   * Get the latest AI-generated briefing for a claim.
   */
  app.get('/api/claims/:id/briefing', requireAuth, requireOrganization, async (req, res) => {
    try {
      const briefing = await getClaimBriefing(req.params.id, req.organizationId!);
      if (!briefing) {
        return res.status(404).json({ error: 'No briefing found for this claim' });
      }
      res.json(briefing);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/claims/:id/briefing/generate
   * Generate a new AI briefing for a claim.
   * Query params:
   * - force: boolean - Force regeneration even if cached
   */
  app.post('/api/claims/:id/briefing/generate', requireAuth, requireOrganization, async (req, res) => {
    try {
      const forceRegenerate = req.query.force === 'true';
      const result = await generateClaimBriefing(
        req.params.id,
        req.organizationId!,
        forceRegenerate
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        briefing: result.briefing,
        briefingId: result.briefingId,
        sourceHash: result.sourceHash,
        cached: result.cached,
        model: result.model,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/claims/:id/briefing/status
   * Check if the briefing is stale (claim data has changed).
   */
  app.get('/api/claims/:id/briefing/status', requireAuth, requireOrganization, async (req, res) => {
    try {
      const briefing = await getClaimBriefing(req.params.id, req.organizationId!);
      const isStale = await isBriefingStale(req.params.id, req.organizationId!);

      res.json({
        hasBriefing: !!briefing,
        isStale,
        lastUpdated: briefing?.updatedAt || null,
        model: briefing?.model || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/claims/:id/briefing
   * Delete all briefings for a claim.
   */
  app.delete('/api/claims/:id/briefing', requireAuth, requireOrganization, async (req, res) => {
    try {
      const deletedCount = await deleteClaimBriefings(req.params.id, req.organizationId!);
      res.json({ deleted: deletedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // CARRIER OVERLAY ROUTES
  // ============================================

  /**
   * GET /api/carriers/:id/overlays
   * Get carrier-specific inspection overlays.
   */
  app.get('/api/carriers/:id/overlays', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { carrier, overlays } = await getCarrierOverlays(req.params.id);
      if (!carrier) {
        return res.status(404).json({ error: 'Carrier not found' });
      }
      res.json({ carrier, overlays });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * PUT /api/carriers/:id/overlays
   * Update carrier-specific inspection overlays.
   */
  app.put('/api/carriers/:id/overlays', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), async (req, res) => {
    try {
      const { overlays } = req.body;
      if (!overlays) {
        return res.status(400).json({ error: 'overlays object required' });
      }
      const success = await updateCarrierOverlays(req.params.id, overlays);
      if (!success) {
        return res.status(404).json({ error: 'Carrier not found' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/claims/:id/carrier-guidance
   * Get carrier guidance for a claim based on its carrier and peril.
   */
  app.get('/api/claims/:id/carrier-guidance', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        // Get the claim's peril
        const claimResult = await client.query(
          `SELECT primary_peril FROM claims WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (claimResult.rows.length === 0) {
          return res.status(404).json({ error: 'Claim not found' });
        }
        const peril = claimResult.rows[0].primary_peril || 'other';

        // Get merged inspection with carrier overlay
        const mergedInspection = await getMergedInspectionForClaim(req.params.id, peril);
        res.json(mergedInspection);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // POLICY FORMS ROUTES
  // ============================================

  // Create policy form
  app.post('/api/policy-forms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { claimId, formNumber, documentTitle, description, keyProvisions } = req.body;
        if (!formNumber) {
          return res.status(400).json({ error: 'formNumber required' });
        }
        const result = await client.query(
          `INSERT INTO policy_forms (organization_id, claim_id, form_number, document_title, description, key_provisions)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [req.organizationId, claimId || null, formNumber, documentTitle || null, description || null, JSON.stringify(keyProvisions || {})]
        );
        res.status(201).json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get policy form
  app.get('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM policy_forms WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Policy form not found' });
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

  // Update policy form
  app.put('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { formNumber, documentTitle, description, keyProvisions, claimId } = req.body;
        const result = await client.query(
          `UPDATE policy_forms SET
             form_number = COALESCE($1, form_number),
             document_title = COALESCE($2, document_title),
             description = COALESCE($3, description),
             key_provisions = COALESCE($4, key_provisions),
             claim_id = COALESCE($5, claim_id),
             updated_at = NOW()
           WHERE id = $6 AND organization_id = $7
           RETURNING *`,
          [formNumber, documentTitle, description, keyProvisions ? JSON.stringify(keyProvisions) : null, claimId, req.params.id, req.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Policy form not found' });
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

  // Delete policy form
  app.delete('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `DELETE FROM policy_forms WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Policy form not found' });
        }
        res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // ENDORSEMENTS ROUTES
  // ============================================

  // Create endorsement
  app.post('/api/endorsements', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { claimId, formNumber, documentTitle, description, keyChanges } = req.body;
        if (!formNumber) {
          return res.status(400).json({ error: 'formNumber required' });
        }
        const result = await client.query(
          `INSERT INTO endorsements (organization_id, claim_id, form_number, document_title, description, key_changes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [req.organizationId, claimId || null, formNumber, documentTitle || null, description || null, JSON.stringify(keyChanges || {})]
        );
        res.status(201).json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Bulk create endorsements
  app.post('/api/endorsements/bulk', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { claimId, endorsements } = req.body;
        if (!endorsements || !Array.isArray(endorsements) || endorsements.length === 0) {
          return res.status(400).json({ error: 'endorsements array required' });
        }

        const results = [];
        for (const endorsement of endorsements) {
          const { formNumber, documentTitle, description, keyChanges } = endorsement;
          if (!formNumber) continue;

          const result = await client.query(
            `INSERT INTO endorsements (organization_id, claim_id, form_number, document_title, description, key_changes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.organizationId, claimId || null, formNumber, documentTitle || null, description || null, JSON.stringify(keyChanges || {})]
          );
          results.push(result.rows[0]);
        }

        // Also update the documents associated with the endorsements to link to the claim
        if (claimId) {
          const docIds = endorsements
            .filter((e: any) => e.documentId)
            .map((e: any) => e.documentId);

          if (docIds.length > 0) {
            await client.query(
              `UPDATE documents SET claim_id = $1, updated_at = NOW() WHERE id = ANY($2) AND organization_id = $3`,
              [claimId, docIds, req.organizationId]
            );
          }
        }

        res.status(201).json({ endorsements: results, count: results.length });
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get endorsement
  app.get('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM endorsements WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Endorsement not found' });
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

  // Update endorsement
  app.put('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const { formNumber, documentTitle, description, keyChanges, claimId } = req.body;
        const result = await client.query(
          `UPDATE endorsements SET
             form_number = COALESCE($1, form_number),
             document_title = COALESCE($2, document_title),
             description = COALESCE($3, description),
             key_changes = COALESCE($4, key_changes),
             claim_id = COALESCE($5, claim_id),
             updated_at = NOW()
           WHERE id = $6 AND organization_id = $7
           RETURNING *`,
          [formNumber, documentTitle, description, keyChanges ? JSON.stringify(keyChanges) : null, claimId, req.params.id, req.organizationId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Endorsement not found' });
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

  // Delete endorsement
  app.delete('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { pool } = await import('./db');
      const client = await pool.connect();
      try {
        const result = await client.query(
          `DELETE FROM endorsements WHERE id = $1 AND organization_id = $2`,
          [req.params.id, req.organizationId]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Endorsement not found' });
        }
        res.json({ success: true });
      } finally {
        client.release();
      }
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

  // Download document file (redirects to Supabase Storage signed URL)
  app.get('/api/documents/:id/download', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Get a signed URL from Supabase Storage (valid for 1 hour)
      const signedUrl = await getDocumentDownloadUrl(doc.storagePath, 3600);

      // Redirect to the signed URL for download
      res.redirect(signedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get document as images (for viewing PDFs and images)
  app.get('/api/documents/:id/images', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // For images, return a single image reference
      if (doc.mimeType.startsWith('image/')) {
        return res.json({
          pages: 1,
          images: [`/api/documents/${req.params.id}/image/1`]
        });
      }

      // For PDFs, download from Supabase and get page count
      if (doc.mimeType === 'application/pdf') {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const os = await import('os');
        const execAsync = promisify(exec);

        // Download file from Supabase to temp directory
        const tempDir = path.join(os.tmpdir(), 'claimsiq-docs');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `${req.params.id}.pdf`);

        // Download if not cached
        if (!fs.existsSync(tempFilePath)) {
          const { data } = await downloadDocumentFile(doc.storagePath);
          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(tempFilePath, buffer);
        }

        // Get page count using pdfinfo
        try {
          const { stdout } = await execAsync(`pdfinfo "${tempFilePath}" | grep Pages`);
          const pageMatch = stdout.match(/Pages:\s*(\d+)/);
          const pageCount = pageMatch ? parseInt(pageMatch[1]) : 1;

          const images = [];
          for (let i = 1; i <= pageCount; i++) {
            images.push(`/api/documents/${req.params.id}/image/${i}`);
          }

          return res.json({
            pages: pageCount,
            images
          });
        } catch (pdfError) {
          // Fallback: assume 1 page
          return res.json({
            pages: 1,
            images: [`/api/documents/${req.params.id}/image/1`]
          });
        }
      }

      res.status(400).json({ error: 'Unsupported document type for image viewing' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get specific page image from document
  app.get('/api/documents/:id/image/:page', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const pageNum = parseInt(req.params.page) || 1;
      const os = await import('os');
      const tempDir = path.join(os.tmpdir(), 'claimsiq-docs');

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // For images, download from Supabase and serve
      if (doc.mimeType.startsWith('image/')) {
        const tempFilePath = path.join(tempDir, `${req.params.id}-image`);

        // Download if not cached
        if (!fs.existsSync(tempFilePath)) {
          const { data } = await downloadDocumentFile(doc.storagePath);
          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(tempFilePath, buffer);
        }

        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(path.resolve(tempFilePath));
      }

      // For PDFs, download from Supabase, convert to image and serve
      if (doc.mimeType === 'application/pdf') {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const pdfFilePath = path.join(tempDir, `${req.params.id}.pdf`);
        const outputFile = path.join(tempDir, `${req.params.id}-page${pageNum}.png`);

        // Download PDF if not cached
        if (!fs.existsSync(pdfFilePath)) {
          const { data } = await downloadDocumentFile(doc.storagePath);
          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(pdfFilePath, buffer);
        }

        // Check if page image is already cached
        if (!fs.existsSync(outputFile)) {
          // Convert specific page using pdftoppm
          const outputPrefix = path.join(tempDir, `${req.params.id}-page${pageNum}`);
          await execAsync(`pdftoppm -png -r 150 -f ${pageNum} -l ${pageNum} "${pdfFilePath}" "${outputPrefix}"`);

          // pdftoppm adds page number suffix with zero-padding
          // Try various formats: -1.png, -01.png, -001.png
          const possibleFiles = [
            `${outputPrefix}-${pageNum}.png`,
            `${outputPrefix}-${String(pageNum).padStart(2, '0')}.png`,
            `${outputPrefix}-${String(pageNum).padStart(3, '0')}.png`,
          ];
          
          for (const generatedFile of possibleFiles) {
            if (fs.existsSync(generatedFile)) {
              fs.renameSync(generatedFile, outputFile);
              break;
            }
          }
        }

        if (fs.existsSync(outputFile)) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.sendFile(path.resolve(outputFile));
        }

        return res.status(500).json({ error: 'Failed to convert PDF page to image' });
      }

      res.status(400).json({ error: 'Unsupported document type' });
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

  // ============================================
  // SKETCH TOOLS API ROUTES
  // ============================================
  // These endpoints provide sketch creation tools for autonomous agent use

  /**
   * POST /api/sketch/generate-floorplan-data
   * Generate structured floorplan data (rooms and connections) from input.
   * This validates and transforms the input data.
   */
  app.post('/api/sketch/generate-floorplan-data', requireAuth, async (req, res) => {
    try {
      const result = await generateFloorplanData(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/sketch/rooms
   * Create or update a room in the estimate sketch.
   */
  app.post('/api/sketch/rooms', requireAuth, async (req, res) => {
    try {
      const result = await createOrUpdateRoom(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/sketch/rooms/:room_id/openings
   * Add an opening (door/window/cased) to a room wall.
   */
  app.post('/api/sketch/rooms/:room_id/openings', requireAuth, async (req, res) => {
    try {
      const result = await addRoomOpening({
        room_id: req.params.room_id,
        ...req.body,
      });
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/sketch/rooms/:room_id/missing-walls
   * Mark a missing wall segment for a room.
   */
  app.post('/api/sketch/rooms/:room_id/missing-walls', requireAuth, async (req, res) => {
    try {
      const result = await addMissingWall({
        room_id: req.params.room_id,
        ...req.body,
      });
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/sketch/estimates/:estimate_id/state
   * Retrieve current sketch state for an estimate.
   */
  app.get('/api/sketch/estimates/:estimate_id/state', requireAuth, async (req, res) => {
    try {
      const result = await getSketchState(req.params.estimate_id);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // XACTIMATE LINE ITEM CATALOG ENDPOINTS
  // ============================================

  /**
   * GET /api/xact/categories
   * List all Xactimate categories
   */
  app.get('/api/xact/categories', async (req, res) => {
    try {
      const result = await db
        .select()
        .from(xactCategories)
        .orderBy(xactCategories.code);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/categories/:code
   * Get a specific category by code
   */
  app.get('/api/xact/categories/:code', async (req, res) => {
    try {
      const result = await db
        .select()
        .from(xactCategories)
        .where(eq(xactCategories.code, req.params.code.toUpperCase()))
        .limit(1);
      if (result.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }
      res.json(result[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/line-items
   * Search line items with optional filters
   * Query params:
   *   - q: search query (matches description, fullCode, or selectorCode)
   *   - category: filter by category code
   *   - limit: max results (default 50, max 500)
   *   - offset: pagination offset
   */
  app.get('/api/xact/line-items', async (req, res) => {
    try {
      const { q, category, limit = '50', offset = '0' } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 50, 500);
      const offsetNum = parseInt(offset as string) || 0;

      let query = db.select().from(xactLineItems);
      const conditions: any[] = [];

      if (q) {
        const searchTerm = `%${(q as string).toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${xactLineItems.description}) LIKE ${searchTerm} 
               OR LOWER(${xactLineItems.fullCode}) LIKE ${searchTerm}
               OR LOWER(${xactLineItems.selectorCode}) LIKE ${searchTerm})`
        );
      }

      if (category) {
        conditions.push(eq(xactLineItems.categoryCode, (category as string).toUpperCase()));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query
        .orderBy(xactLineItems.fullCode)
        .limit(limitNum)
        .offset(offsetNum);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(xactLineItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      res.json({
        items: results,
        total: Number(countResult[0]?.count || 0),
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/line-items/:code
   * Get a specific line item by full code
   */
  app.get('/api/xact/line-items/:code', async (req, res) => {
    try {
      const result = await db
        .select()
        .from(xactLineItems)
        .where(eq(xactLineItems.fullCode, req.params.code.toUpperCase()))
        .limit(1);
      if (result.length === 0) {
        return res.status(404).json({ error: 'Line item not found' });
      }
      res.json(result[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/stats
   * Get statistics about the Xactimate catalog
   */
  app.get('/api/xact/stats', async (req, res) => {
    try {
      const catCount = await db.select({ count: sql<number>`count(*)` }).from(xactCategories);
      const itemCount = await db.select({ count: sql<number>`count(*)` }).from(xactLineItems);
      const compCount = await db.select({ count: sql<number>`count(*)` }).from(xactComponents);
      
      const topCategories = await db
        .select({
          code: xactLineItems.categoryCode,
          count: sql<number>`count(*)`,
        })
        .from(xactLineItems)
        .groupBy(xactLineItems.categoryCode)
        .orderBy(sql`count(*) DESC`)
        .limit(10);

      const componentBreakdown = await db
        .select({
          type: xactComponents.componentType,
          count: sql<number>`count(*)`,
          avgPrice: sql<number>`avg(amount::numeric)::decimal(10,2)`,
        })
        .from(xactComponents)
        .groupBy(xactComponents.componentType);

      res.json({
        totalCategories: Number(catCount[0]?.count || 0),
        totalLineItems: Number(itemCount[0]?.count || 0),
        totalComponents: Number(compCount[0]?.count || 0),
        topCategories,
        componentBreakdown,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/components
   * Search components (materials, equipment, labor) with pricing
   * Query params:
   *   - q: search query
   *   - type: filter by type (material, equipment, labor)
   *   - limit: max results (default 50, max 500)
   *   - offset: pagination offset
   */
  app.get('/api/xact/components', async (req, res) => {
    try {
      const { q, type, limit = '50', offset = '0' } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 50, 500);
      const offsetNum = parseInt(offset as string) || 0;

      const conditions: any[] = [];

      if (q) {
        const searchTerm = `%${(q as string).toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${xactComponents.description}) LIKE ${searchTerm} 
               OR LOWER(${xactComponents.code}) LIKE ${searchTerm})`
        );
      }

      if (type) {
        conditions.push(eq(xactComponents.componentType, type as string));
      }

      let query = db.select().from(xactComponents);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query
        .orderBy(xactComponents.code)
        .limit(limitNum)
        .offset(offsetNum);

      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(xactComponents)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      res.json({
        items: results,
        total: Number(countResult[0]?.count || 0),
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/components/:code
   * Get a specific component by code with its price
   */
  app.get('/api/xact/components/:code', async (req, res) => {
    try {
      const result = await db
        .select()
        .from(xactComponents)
        .where(eq(xactComponents.code, req.params.code.toUpperCase()))
        .limit(1);
      if (result.length === 0) {
        return res.status(404).json({ error: 'Component not found' });
      }
      res.json(result[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/search
   * Search Xactimate line items WITH calculated prices
   * Query params:
   *   - q: search query (required)
   *   - category: filter by category code
   *   - limit: max results (default 20)
   *   - offset: pagination offset
   */
  app.get('/api/xact/search', async (req, res) => {
    try {
      const { q, category, limit = '20', offset = '0' } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Search query (q) is required' });
      }
      
      const result = await searchXactItemsWithPricing(q as string, {
        category: category as string | undefined,
        limit: Math.min(parseInt(limit as string) || 20, 100),
        offset: parseInt(offset as string) || 0,
      });
      
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/xact/price/:code
   * Get full price breakdown for a Xactimate line item
   */
  app.get('/api/xact/price/:code', async (req, res) => {
    try {
      const result = await calculateXactPrice(req.params.code);
      if (!result) {
        return res.status(404).json({ error: 'Line item not found' });
      }
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/estimates/:id/xact-items
   * Add a Xactimate line item to an estimate with auto-calculated pricing
   */
  app.post('/api/estimates/:id/xact-items', requireAuth, async (req, res) => {
    try {
      const { lineItemCode, quantity, damageZoneId, roomName, notes } = req.body;
      
      if (!lineItemCode || !quantity) {
        return res.status(400).json({ error: 'lineItemCode and quantity are required' });
      }
      
      const xactItem = await getXactItemForEstimate(lineItemCode, quantity);
      if (!xactItem) {
        return res.status(404).json({ error: `Xactimate line item ${lineItemCode} not found` });
      }
      
      const insertResult = await db.execute(sql`
        INSERT INTO estimate_line_items (
          estimate_id, line_item_code, line_item_description, category_id,
          quantity, unit, unit_price, material_cost, labor_cost, equipment_cost,
          subtotal, source, damage_zone_id, room_name, notes
        ) VALUES (
          ${req.params.id}, ${xactItem.code}, ${xactItem.description}, ${xactItem.categoryCode},
          ${xactItem.quantity}, ${xactItem.unit}, ${xactItem.unitPrice}, 
          ${xactItem.materialCost}, ${xactItem.laborCost}, ${xactItem.equipmentCost},
          ${xactItem.subtotal}, 'xactimate', ${damageZoneId || null}, ${roomName || null}, ${notes || null}
        )
        RETURNING *
      `);
      
      res.json({
        success: true,
        lineItem: insertResult.rows[0],
        pricing: xactItem,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
