import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "./storage";
import { supabaseAdmin } from './lib/supabaseAdmin';
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
import {
  getAllPrompts,
  getPrompt,
  updatePrompt,
  getPromptWithFallback,
  refreshCache,
} from "./services/promptService";
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
  getClaimStats,
  purgeAllClaims
} from "./services/claims";
import {
  generateChecklistForClaim,
  getChecklistForClaim,
  updateChecklistItemStatus,
  addCustomChecklistItem,
  inferSeverityFromClaim
} from "./services/checklistTemplateService";
import { Peril, ClaimSeverity, ChecklistCategory } from "@shared/schema";
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
  initializeStorageBucket,
  generateDocumentPreviews,
  getDocumentPreviewUrls
} from "./services/documents";
import {
  processDocument as processDocumentAI,
  createClaimFromDocuments
} from "./services/documentProcessor";
import {
  queueDocumentProcessing,
  queueDocumentsProcessing,
  getBatchProcessingStatus,
  getQueueStats as getDocumentQueueStats,
} from "./services/documentQueue";
import {
  getClaimsForMap,
  getMapStats,
  geocodePendingClaims,
  queueGeocoding
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
  generateInspectionWorkflow,
  regenerateWorkflow,
  expandWorkflowForRooms,
  validateWorkflowJson,
  getWorkflow,
  getClaimWorkflow,
  updateWorkflowStep,
  addWorkflowStep,
  addWorkflowRoom,
  shouldRegenerateWorkflow,
} from "./services/inspectionWorkflowService";
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

/**
 * Normalize peril value from database to Peril enum
 * Handles various formats: "Wind/Hail", "WATER", "wind_hail", etc.
 */
function normalizePeril(value: string | null | undefined): Peril {
  if (!value) return Peril.OTHER;

  const normalized = value.toLowerCase().trim();

  // Direct matches
  if (Object.values(Peril).includes(normalized as Peril)) {
    return normalized as Peril;
  }

  // Handle common variations
  if (normalized.includes('wind') || normalized.includes('hail')) return Peril.WIND_HAIL;
  if (normalized.includes('fire')) return Peril.FIRE;
  if (normalized.includes('water') && !normalized.includes('flood')) return Peril.WATER;
  if (normalized.includes('flood')) return Peril.FLOOD;
  if (normalized.includes('smoke')) return Peril.SMOKE;
  if (normalized.includes('mold') || normalized.includes('mildew')) return Peril.MOLD;
  if (normalized.includes('impact') || normalized.includes('tree') || normalized.includes('vehicle')) return Peril.IMPACT;

  return Peril.OTHER;
}

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
            user: { 
              id: user.id, 
              username: user.username,
              currentOrganizationId: user.currentOrganizationId
            },
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
        const { supabaseAdmin } = await import('./lib/supabaseAdmin');
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, username, first_name, last_name, email, current_organization_id')
          .eq('id', req.user.id)
          .single();
        
        if (user) {
          const data = {
            user: {
              id: user.id,
              username: user.username,
              name: user.first_name && user.last_name
                ? `${user.first_name} ${user.last_name}`
                : user.username,
              email: user.email || '',
              currentOrganizationId: user.current_organization_id
            },
            authenticated: true
          };
          res.status(200).send(JSON.stringify(data));
          return;
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      }
      res.status(200).send(JSON.stringify({ user: { id: req.user.id, username: req.user.username, currentOrganizationId: req.user.currentOrganizationId }, authenticated: true }));
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
      const { name, displayName, firstName, lastName, email } = req.body;

      // Support 'displayName', 'name' (split into first/last), and explicit firstName/lastName
      let first = firstName;
      let last = lastName;

      // Use displayName or name if explicit firstName/lastName not provided
      const nameValue = displayName || name;
      if (nameValue && !firstName && !lastName) {
        // Split name into first and last
        const nameParts = nameValue.trim().split(/\s+/);
        first = nameParts[0] || '';
        last = nameParts.slice(1).join(' ') || '';
      }

      const updatedUser = await updateUserProfile(userId, {
        firstName: first,
        lastName: last,
        email
      });
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update the session with the new user data so subsequent auth checks reflect the changes
      if (req.user) {
        req.user.firstName = updatedUser.firstName;
        req.user.lastName = updatedUser.lastName;
        if (updatedUser.email) req.user.email = updatedUser.email;
      }

      // Re-login to persist the updated user in the session
      req.login(updatedUser, (err) => {
        if (err) {
          console.error('Session update error:', err);
        }
      });

      // Return user with combined name for client compatibility
      const userWithName = {
        ...updatedUser,
        name: [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ') || updatedUser.username
      };

      res.json({ user: userWithName, message: 'Profile updated successfully' });
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
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'User not found' });
        }
        throw error;
      }

      res.json(data.preferences || {});
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

      // Get existing preferences
      const { data: existingData, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'User not found' });
        }
        throw fetchError;
      }

      const existingPrefs = existingData.preferences || {};
      const mergedPrefs = { ...existingPrefs, ...preferences };

      // Update preferences
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          preferences: mergedPrefs,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      res.json({ preferences: mergedPrefs, message: 'Preferences saved successfully' });
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
      const { data, error } = await supabaseAdmin
        .from('material_regional_prices')
        .select(`
          region_id,
          price,
          source,
          effective_date,
          materials (
            sku,
            name,
            unit
          )
        `)
        .order('effective_date', { ascending: false })
        .order('materials(sku)', { ascending: true })
        .order('region_id', { ascending: true });

      if (error) throw error;

      // Transform to match original format
      const transformed = data.map(item => ({
        sku: item.materials.sku,
        material_name: item.materials.name,
        unit: item.materials.unit,
        region_id: item.region_id,
        price: item.price,
        source: item.source,
        effective_date: item.effective_date
      }));

      res.json(transformed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get scrape job history
  app.get('/api/scrape/jobs', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('price_scrape_jobs')
        .select('id, source, status, started_at, completed_at, items_processed, items_updated, errors')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // System status endpoint
  app.get('/api/system/status', async (req, res) => {
    try {
      // Test database connection
      const { data: timeData, error: timeError } = await supabaseAdmin
        .rpc('get_current_time');

      const dbTime = timeData || new Date().toISOString();
      const dbVersion = 'PostgreSQL (Supabase)';

      // Helper function to safely count table rows
      const safeCount = async (tableName: string): Promise<number> => {
        try {
          const { count, error } = await supabaseAdmin
            .from(tableName)
            .select('*', { count: 'exact', head: true });

          if (error) return 0;
          return count || 0;
        } catch {
          return 0; // Table doesn't exist
        }
      };

      // Get table counts (handle missing tables gracefully)
      const [claimsCount, estimatesCount, lineItemsCount, priceListsCount, regionsCount] = await Promise.all([
        safeCount('claims'),
        safeCount('estimates'),
        safeCount('xact_line_items'),
        safeCount('price_lists'),
        safeCount('regional_multipliers'),
      ]);

      // Try to get regions list from regional_multipliers
      let regions: { id: string; name: string }[] = [];
      try {
        const { data: regionsData, error: regionsError } = await supabaseAdmin
          .from('regional_multipliers')
          .select('region_code, region_name')
          .eq('is_active', true)
          .order('region_code');

        if (!regionsError && regionsData) {
          regions = regionsData.map(r => ({
            id: r.region_code,
            name: r.region_name
          }));
        }
      } catch {
        // Table doesn't exist, that's ok
      }

      res.json({
        database: {
          connected: true,
          time: dbTime,
          version: dbVersion
        },
        counts: {
          claims: claimsCount,
          estimates: estimatesCount,
          lineItems: lineItemsCount,
          priceLists: priceListsCount,
          regions: regionsCount
        },
        regions,
        environment: process.env.NODE_ENV || 'development',
        openaiConfigured: !!process.env.OPENAI_API_KEY
      });
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

  // ============================================
  // ROUTE OPTIMIZATION
  // ============================================

  app.post('/api/route/optimize', requireAuth, async (req, res) => {
    try {
      const { optimizeRoute } = await import('./services/routeOptimization');
      const { origin, stops } = req.body;

      if (!stops || !Array.isArray(stops)) {
        return res.status(400).json({ error: 'stops array is required' });
      }

      // Filter stops with valid coordinates
      const validStops = stops.filter((s: any) => 
        s.id && typeof s.lat === 'number' && typeof s.lng === 'number' &&
        s.lat !== 0 && s.lng !== 0
      );

      if (validStops.length === 0) {
        return res.json({
          orderedStops: stops.map((s: any) => s.id),
          legs: [],
          totalDuration: 0,
          totalDistance: 0,
          optimized: false,
          reason: 'No stops with valid coordinates'
        });
      }

      // Default origin to first stop if not provided
      const routeOrigin = origin || { lat: validStops[0].lat, lng: validStops[0].lng };

      const result = await optimizeRoute(routeOrigin, validStops);
      res.json({ ...result, optimized: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Route optimization error:', message);
      
      if (message.includes('not configured')) {
        res.status(500).json({ error: 'Route optimization service not configured' });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  app.post('/api/route/drive-times', requireAuth, async (req, res) => {
    try {
      const { calculateDriveTimes } = await import('./services/routeOptimization');
      const { stops } = req.body;

      if (!stops || !Array.isArray(stops)) {
        return res.status(400).json({ error: 'stops array is required' });
      }

      const validStops = stops.filter((s: any) => 
        s.id && typeof s.lat === 'number' && typeof s.lng === 'number' &&
        s.lat !== 0 && s.lng !== 0
      );

      const driveTimes = await calculateDriveTimes(validStops);
      
      // Convert Map to object for JSON
      const result: Record<string, { duration: number; durationText: string }> = {};
      driveTimes.forEach((value, key) => {
        result[key] = value;
      });

      res.json({ driveTimes: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Drive times calculation error:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // WEATHER API ROUTES
  // ============================================
  
  app.post('/api/weather/locations', requireAuth, async (req, res) => {
    try {
      const { getWeatherForLocations } = await import('./services/weatherService');
      const { locations } = req.body;

      if (!locations || !Array.isArray(locations)) {
        return res.status(400).json({ error: 'locations array is required' });
      }

      const validLocations = locations.filter((loc: any) =>
        typeof loc.lat === 'number' && typeof loc.lng === 'number' &&
        loc.lat !== 0 && loc.lng !== 0
      ).map((loc: any) => ({
        lat: loc.lat,
        lng: loc.lng,
        stopId: loc.stopId || loc.id,
      }));

      if (validLocations.length === 0) {
        return res.json({ weather: [] });
      }

      const weather = await getWeatherForLocations(validLocations);
      res.json({ weather });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Weather fetch error:', message);
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // MY DAY AI ANALYSIS ROUTES
  // ============================================
  
  app.post('/api/my-day/analyze', requireAuth, async (req, res) => {
    try {
      const { analyzeMyDay } = await import('./services/myDayAnalysis');
      const { getWeatherForLocations } = await import('./services/weatherService');
      const { claims, inspectionRoute, userName } = req.body;

      if (!claims || !Array.isArray(claims)) {
        return res.status(400).json({ error: 'claims array is required' });
      }

      if (!inspectionRoute || !Array.isArray(inspectionRoute)) {
        return res.status(400).json({ error: 'inspectionRoute array is required' });
      }

      // Fetch weather for all stops with valid coordinates
      const locations = inspectionRoute
        .filter((stop: any) => stop.lat && stop.lng && stop.lat !== 0 && stop.lng !== 0)
        .map((stop: any) => ({
          lat: stop.lat,
          lng: stop.lng,
          stopId: stop.claimId,
        }));

      const weatherData = locations.length > 0 
        ? await getWeatherForLocations(locations) 
        : [];

      // Run AI analysis with user's name for personalization
      const analysis = await analyzeMyDay(claims, inspectionRoute, weatherData, userName);
      
      res.json({
        ...analysis,
        weatherData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('My Day analysis error:', message);
      res.status(500).json({ error: message });
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

      // First try by estimate ID
      let { data, error } = await supabaseAdmin
        .from('estimates')
        .select('id, status, finalized_at')
        .eq('id', id)
        .single();

      // If not found, try by claim ID
      if (error && error.code === 'PGRST116') {
        const claimResult = await supabaseAdmin
          .from('estimates')
          .select('id, status, finalized_at')
          .eq('claim_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        data = claimResult.data;
        error = claimResult.error;
      }

      if (error && error.code === 'PGRST116') {
        // No estimate exists - return default unlocked status
        return res.json({
          isLocked: false,
          status: 'none',
          submittedAt: null,
        });
      }

      if (error) throw error;

      const isLocked = data.status === 'submitted' || data.status === 'finalized' || data.finalized_at !== null;

      return res.json({
        isLocked,
        status: data.status || 'draft',
        submittedAt: data.finalized_at ? new Date(data.finalized_at) : null,
      });
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
      const { data, error } = await supabaseAdmin
        .from('carrier_profiles')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get regions
  app.get('/api/regions', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('regions')
        .select('*')
        .order('id');

      if (error) throw error;

      res.json(data);
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
      const { data, error } = await supabaseAdmin
        .from('coverage_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('code');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get coverage type by code
  app.get('/api/coverage-types/:code', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('coverage_types')
        .select('*')
        .eq('code', req.params.code)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Coverage type not found' });
        }
        throw error;
      }

      res.json(data);
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
      const { region_code, tax_type } = req.query;

      let query = supabaseAdmin
        .from('tax_rates')
        .select('*')
        .eq('is_active', true);

      if (region_code) {
        query = query.eq('region_code', region_code as string);
      }
      if (tax_type) {
        query = query.eq('tax_type', tax_type as string);
      }

      const { data, error } = await query
        .order('region_code')
        .order('tax_type');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get tax rate for a specific region
  app.get('/api/tax-rates/region/:regionCode', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('tax_rates')
        .select('*')
        .eq('region_code', req.params.regionCode)
        .eq('is_active', true)
        .order('tax_type');

      if (error) throw error;

      res.json(data);
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
      const { category_code, item_type } = req.query;

      let query = supabaseAdmin
        .from('depreciation_schedules')
        .select('*');

      if (category_code) {
        query = query.eq('category_code', category_code as string);
      }
      if (item_type) {
        query = query.ilike('item_type', `%${item_type}%`);
      }

      const { data, error } = await query
        .order('category_code')
        .order('item_type');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get depreciation schedule by category
  app.get('/api/depreciation-schedules/category/:categoryCode', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('depreciation_schedules')
        .select('*')
        .eq('category_code', req.params.categoryCode)
        .order('item_type');

      if (error) throw error;

      res.json(data);
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
      const { data, error } = await supabaseAdmin
        .from('regional_multipliers')
        .select('*')
        .eq('is_active', true)
        .order('region_code');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get regional multiplier by region code
  app.get('/api/regional-multipliers/:regionCode', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('regional_multipliers')
        .select('*')
        .eq('region_code', req.params.regionCode)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Regional multiplier not found' });
        }
        throw error;
      }

      res.json(data);
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
      const { trade_code, region_code } = req.query;

      let query = supabaseAdmin
        .from('labor_rates_enhanced')
        .select('*')
        .eq('is_active', true);

      if (trade_code) {
        query = query.eq('trade_code', trade_code as string);
      }
      if (region_code) {
        query = query.eq('region_code', region_code as string);
      }

      const { data, error } = await query
        .order('trade_code')
        .order('region_code');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get labor rate for specific trade
  app.get('/api/labor-rates/trade/:tradeCode', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('labor_rates_enhanced')
        .select('*')
        .eq('trade_code', req.params.tradeCode)
        .eq('is_active', true)
        .order('region_code');

      if (error) throw error;

      res.json(data);
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
      const { data, error } = await supabaseAdmin
        .from('price_lists')
        .select('*')
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .order('region_code');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get price list by code
  app.get('/api/price-lists/:code', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('price_lists')
        .select('*')
        .eq('code', req.params.code)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Price list not found' });
        }
        throw error;
      }

      res.json(data);
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

      const { error } = await supabaseAdmin.rpc('recalculate_estimate_totals', {
        estimate_id: req.params.id
      });

      if (error) throw error;

      const estimate = await getEstimate(req.params.id);
      res.json(estimate);
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
      const { data, error } = await supabaseAdmin
        .from('estimate_line_items')
        .select('*')
        .eq('zone_id', req.params.id)
        .order('sort_order');

      if (error) throw error;

      res.json(data);
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

      const { data, error, count } = await supabaseAdmin
        .from('estimate_line_items')
        .delete({ count: 'exact' })
        .eq('id', req.params.id);

      if (error) throw error;

      if (count === 0) {
        return res.status(404).json({ error: 'Line item not found' });
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

  // Update line item
  app.put('/api/line-items/:id', requireAuth, async (req, res) => {
    try {
      // Check if estimate is locked
      const estimateId = await getEstimateIdFromLineItem(req.params.id);
      if (estimateId) {
        await assertEstimateNotLocked(estimateId);
      }

      const allowedFields = [
        'quantity', 'notes', 'is_homeowner', 'is_credit', 'is_non_op',
        'depreciation_pct', 'depreciation_amount', 'age_years', 'life_expectancy_years',
        'is_recoverable', 'calc_ref'
      ];

      const updateData: any = {};
      for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (req.body[camelField] !== undefined) {
          updateData[field] = req.body[camelField];
        }
      }

      if (Object.keys(updateData).length === 0) {
        const { data, error } = await supabaseAdmin
          .from('estimate_line_items')
          .select('*')
          .eq('id', req.params.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Line item not found' });
          }
          throw error;
        }

        return res.json(data);
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('estimate_line_items')
        .update(updateData)
        .eq('id', req.params.id)
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Line item not found' });
        }
        throw error;
      }

      // Recalculate subtotal if quantity changed
      if (req.body.quantity !== undefined) {
        await supabaseAdmin.rpc('recalculate_line_item_totals', {
          line_item_id: req.params.id
        });
      }

      res.json(data);
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
        const { error } = await supabaseAdmin
          .from('documents')
          .update({
            claim_id: claim.id,
            updated_at: new Date().toISOString()
          })
          .in('id', documentIds)
          .eq('organization_id', req.organizationId);

        if (error) throw error;
      }

      // Queue geocoding for the new claim address
      queueGeocoding(claim.id);

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

      // Associate any documents from metadata.documentIds with the claim
      const documentIds = claim.metadata?.documentIds;
      if (Array.isArray(documentIds) && documentIds.length > 0) {
        const { error } = await supabaseAdmin
          .from('documents')
          .update({
            claim_id: claim.id,
            updated_at: new Date().toISOString()
          })
          .in('id', documentIds)
          .eq('organization_id', req.organizationId!)
          .is('claim_id', null);

        if (error) throw error;
      }

      // Re-geocode if address fields were updated
      if (req.body.propertyAddress || req.body.propertyCity || req.body.propertyState || req.body.propertyZip) {
        queueGeocoding(claim.id);
      }

      res.json(claim);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Purge ALL claims - permanently delete all claims and related data
  // NOTE: Must be defined BEFORE /api/claims/:id to avoid :id matching "purge-all"
  app.delete('/api/claims/purge-all', requireAuth, requireOrganization, requireOrgRole('owner'), async (req, res) => {
    try {
      const result = await purgeAllClaims(req.organizationId!);
      res.json({
        success: true,
        message: `Permanently deleted ${result.claimsDeleted} claims and ${result.relatedRecordsDeleted} related records`,
        ...result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Purge all claims failed:', error);
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

  // Save rooms to claim with full hierarchy (structures → rooms → damage zones)
  app.post('/api/claims/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { rooms, structures } = req.body;
      const { saveClaimHierarchy, saveClaimRoomsAndZones } = await import('./services/rooms');
      
      // Verify claim exists and belongs to organization
      const { data: claimCheck, error: claimError } = await supabaseAdmin
        .from('claims')
        .select('id')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId)
        .single();
      if (claimError || !claimCheck) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      // Use new hierarchy save if structures provided
      if (structures && structures.length > 0) {
        const result = await saveClaimHierarchy(
          req.params.id,
          req.organizationId!,
          structures,
          rooms || []
        );
        
        res.json({ 
          success: true, 
          structuresSaved: result.structures.length,
          roomsSaved: result.rooms.length, 
          damageZonesSaved: result.damageZones.length,
          structures: result.structures,
          rooms: result.rooms,
          damageZones: result.damageZones
        });
      } else {
        // Legacy: rooms only
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get claim rooms with hierarchy (structures → rooms → damage zones)
  app.get('/api/claims/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { getClaimHierarchy } = await import('./services/rooms');
      
      // Verify claim exists and belongs to organization
      const { data: claimCheck, error: claimError } = await supabaseAdmin
        .from('claims')
        .select('id')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId)
        .single();
      if (claimError || !claimCheck) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      const result = await getClaimHierarchy(req.params.id);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete all rooms and structures for a claim (for deleting saved sketches)
  app.delete('/api/claims/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { deleteRoomsByClaimId, deleteStructuresByClaimId } = await import('./services/rooms');

      // Verify claim exists and belongs to organization
      const { data: claimCheck, error: claimError } = await supabaseAdmin
        .from('claims')
        .select('id')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId)
        .single();
      if (claimError || !claimCheck) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      // Delete rooms (this also deletes damage zones)
      const roomsDeleted = await deleteRoomsByClaimId(req.params.id);
      // Delete structures
      const structuresDeleted = await deleteStructuresByClaimId(req.params.id);

      res.json({
        success: true,
        roomsDeleted,
        structuresDeleted
      });
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
      const { data, error } = await supabaseAdmin
        .from('policy_forms')
        .select('*')
        .eq('claim_id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .order('created_at');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get comprehensive policy form extractions for a claim
  app.get('/api/claims/:id/policy-extractions', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('policy_form_extractions')
        .select('*')
        .eq('claim_id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json(data || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get a specific policy extraction by ID
  app.get('/api/policy-extractions/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('policy_form_extractions')
        .select('*')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Policy extraction not found' });
      }

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get comprehensive endorsement extractions for a claim
  app.get('/api/claims/:id/endorsement-extractions', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('endorsement_extractions')
        .select('*')
        .eq('claim_id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json(data || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get a specific endorsement extraction by ID
  app.get('/api/endorsement-extractions/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('endorsement_extractions')
        .select('*')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Endorsement extraction not found' });
      }

      res.json(data);
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
      // Get the claim's peril
      const { data, error } = await supabaseAdmin
        .from('claims')
        .select('primary_peril, secondary_perils')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Claim not found' });
        }
        throw error;
      }

      const peril = data.primary_peril || 'other';
      const secondaryPerils = Array.isArray(data.secondary_perils) ? data.secondary_perils : [];

      // Build inspection intelligence
      const intelligence = buildInspectionIntelligence(peril, secondaryPerils);
      res.json(intelligence);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // EFFECTIVE POLICY ROUTES
  // ============================================

  /**
   * GET /api/claims/:id/effective-policy
   * Get the dynamically computed effective policy for a claim.
   *
   * This endpoint computes the effective policy by:
   * 1. Loading base policy form extractions
   * 2. Loading endorsement extractions (sorted by precedence)
   * 3. Merging according to "most specific rule wins"
   *
   * The effective policy is NEVER cached - always computed fresh.
   */
  app.get('/api/claims/:id/effective-policy', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { getEffectivePolicyForClaim, generateEffectivePolicySummary } = await import('./services/effectivePolicyService');

      const effectivePolicy = await getEffectivePolicyForClaim(req.params.id, req.organizationId!);

      if (!effectivePolicy) {
        // Return empty policy if no extractions exist yet
        return res.json({
          effectivePolicy: null,
          summary: null,
          message: 'No policy or endorsement extractions found for this claim',
        });
      }

      // Generate AI-friendly summary
      const summary = generateEffectivePolicySummary(effectivePolicy);

      res.json({
        effectivePolicy,
        summary,
      });
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
  // CLAIM CHECKLIST ROUTES
  // ============================================

  /**
   * GET /api/claims/:id/checklist
   * Get the dynamic checklist for a claim, auto-generating if needed
   */
  app.get('/api/claims/:id/checklist', requireAuth, requireOrganization, async (req, res) => {
    try {
      const claimId = req.params.id;
      const organizationId = req.organizationId!;

      let { checklist, items } = await getChecklistForClaim(claimId);

      if (!checklist) {
        const { data: claim } = await supabaseAdmin
          .from('claims')
          .select('id, primary_peril, reserve_amount, metadata')
          .eq('id', claimId)
          .eq('organization_id', organizationId)
          .single();

        if (!claim) {
          return res.status(404).json({ error: 'Claim not found' });
        }

        const peril = normalizePeril(claim.primary_peril);
        const severity = inferSeverityFromClaim({
          reserveAmount: claim.reserve_amount ? parseFloat(claim.reserve_amount) : null,
          metadata: claim.metadata as Record<string, any> | null,
        });

        const result = await generateChecklistForClaim(claimId, organizationId, peril, severity);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        const generated = await getChecklistForClaim(claimId);
        checklist = generated.checklist;
        items = generated.items;
      }

      res.json({ checklist, items });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/claims/:id/checklist/generate
   * Force generate or regenerate a checklist for a claim
   */
  app.post('/api/claims/:id/checklist/generate', requireAuth, requireOrganization, async (req, res) => {
    try {
      const claimId = req.params.id;
      const organizationId = req.organizationId!;
      const { peril: overridePeril, severity: overrideSeverity } = req.body;

      // Use Supabase consistently with the rest of the codebase
      const { data: claim, error: claimError } = await supabaseAdmin
        .from('claims')
        .select('id, primary_peril, metadata')
        .eq('id', claimId)
        .eq('organization_id', organizationId)
        .single();

      if (claimError || !claim) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      // Archive existing active checklists
      await supabaseAdmin
        .from('claim_checklists')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('claim_id', claimId)
        .eq('status', 'active');

      const peril = overridePeril ? normalizePeril(overridePeril) : normalizePeril(claim.primary_peril);
      const severity = (overrideSeverity as ClaimSeverity) || inferSeverityFromClaim({
        reserveAmount: null,
        metadata: claim.metadata as Record<string, any> | null,
      });

      const result = await generateChecklistForClaim(claimId, organizationId, peril, severity);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      const { checklist, items } = await getChecklistForClaim(claimId);
      res.json({ checklist, items, regenerated: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * PUT /api/checklists/items/:itemId
   * Update a checklist item status
   */
  app.put('/api/checklists/items/:itemId', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { status, notes, skippedReason } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'blocked', 'na'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const result = await updateChecklistItemStatus(
        req.params.itemId,
        status,
        req.user?.id,
        notes,
        skippedReason
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/checklists/:checklistId/items
   * Add a custom item to a checklist
   */
  app.post('/api/checklists/:checklistId/items', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { title, category, description, required, priority } = req.body;

      if (!title || !category) {
        return res.status(400).json({ error: 'Title and category are required' });
      }

      const validCategories = Object.values(ChecklistCategory);
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
      }

      const result = await addCustomChecklistItem(
        req.params.checklistId,
        title,
        category as ChecklistCategory,
        { description, required, priority }
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, item: result.item });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // INSPECTION WORKFLOW ROUTES
  // ============================================

  /**
   * POST /api/claims/:id/workflow/generate
   * Generate a new inspection workflow for a claim.
   * Uses FNOL, policy, endorsements, briefing, peril rules, and optional wizard context.
   */
  app.post('/api/claims/:id/workflow/generate', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { forceRegenerate, wizardContext } = req.body;
      const result = await generateInspectionWorkflow(
        req.params.id,
        req.organizationId!,
        req.user?.id,
        forceRegenerate === true,
        wizardContext
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        workflow: result.workflow,
        workflowId: result.workflowId,
        version: result.version,
        model: result.model,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/claims/:id/workflow
   * Get the current inspection workflow for a claim with all steps and rooms.
   */
  app.get('/api/claims/:id/workflow', requireAuth, requireOrganization, async (req, res) => {
    try {
      const workflow = await getClaimWorkflow(req.params.id, req.organizationId!);

      if (!workflow) {
        return res.status(404).json({ error: 'No workflow found for this claim' });
      }

      res.json(workflow);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/claims/:id/workflow/status
   * Check if the workflow should be regenerated due to claim changes.
   */
  app.get('/api/claims/:id/workflow/status', requireAuth, requireOrganization, async (req, res) => {
    try {
      const result = await shouldRegenerateWorkflow(req.params.id, req.organizationId!);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/claims/:id/workflow/regenerate
   * Regenerate a workflow due to claim changes.
   * Archives the previous workflow and creates a new version.
   */
  app.post('/api/claims/:id/workflow/regenerate', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: 'reason is required for regeneration' });
      }

      const result = await regenerateWorkflow(
        req.params.id,
        req.organizationId!,
        reason,
        req.user?.id
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        workflow: result.workflow,
        workflowId: result.workflowId,
        version: result.version,
        model: result.model,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/workflow/:id
   * Get a specific workflow by ID with all steps and rooms.
   */
  app.get('/api/workflow/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const workflow = await getWorkflow(req.params.id, req.organizationId!);

      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json(workflow);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * PATCH /api/workflow/:id/steps/:stepId
   * Update a workflow step (status, notes, actual minutes, etc.)
   */
  app.patch('/api/workflow/:id/steps/:stepId', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { status, notes, actualMinutes } = req.body;

      const updates: Parameters<typeof updateWorkflowStep>[1] = {};
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      if (actualMinutes !== undefined) updates.actualMinutes = actualMinutes;
      if (status === 'completed' && req.user?.id) {
        updates.completedBy = req.user.id;
      }

      const step = await updateWorkflowStep(req.params.stepId, updates);

      if (!step) {
        return res.status(404).json({ error: 'Step not found' });
      }

      res.json({ step });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/workflow/:id/steps
   * Add a new custom step to a workflow.
   */
  app.post('/api/workflow/:id/steps', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { phase, stepType, title, instructions, required, estimatedMinutes, roomId, roomName } = req.body;

      if (!phase || !stepType || !title) {
        return res.status(400).json({ error: 'phase, stepType, and title are required' });
      }

      const step = await addWorkflowStep(req.params.id, {
        phase,
        stepType,
        title,
        instructions,
        required,
        estimatedMinutes,
        roomId,
        roomName,
      });

      if (!step) {
        return res.status(400).json({ error: 'Failed to add step' });
      }

      res.status(201).json({ step });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/workflow/:id/rooms
   * Add a new room to a workflow.
   */
  app.post('/api/workflow/:id/rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { name, level, roomType, notes } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const room = await addWorkflowRoom(req.params.id, {
        name,
        level,
        roomType,
        notes,
      });

      if (!room) {
        return res.status(400).json({ error: 'Failed to add room' });
      }

      res.status(201).json({ room });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/workflow/:id/expand-rooms
   * Expand the workflow by adding room-specific steps for the given rooms.
   * Uses the room template defined in the workflow JSON.
   */
  app.post('/api/workflow/:id/expand-rooms', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { roomNames } = req.body;

      if (!roomNames || !Array.isArray(roomNames) || roomNames.length === 0) {
        return res.status(400).json({ error: 'roomNames array is required' });
      }

      const result = await expandWorkflowForRooms(
        req.params.id,
        roomNames,
        req.user?.id
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, addedSteps: result.addedSteps });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/workflow/:id/validate
   * Validate a workflow JSON structure.
   */
  app.post('/api/workflow/:id/validate', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { workflowJson } = req.body;

      if (!workflowJson) {
        return res.status(400).json({ error: 'workflowJson is required' });
      }

      const result = validateWorkflowJson(workflowJson);
      res.json(result);
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
      // Get the claim's peril
      const { data, error } = await supabaseAdmin
        .from('claims')
        .select('primary_peril')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Claim not found' });
        }
        throw error;
      }

      const peril = data.primary_peril || 'other';

      // Get merged inspection with carrier overlay
      const mergedInspection = await getMergedInspectionForClaim(req.params.id, peril);
      res.json(mergedInspection);
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
      const { claimId, formNumber, documentTitle, description, keyProvisions } = req.body;
      if (!formNumber) {
        return res.status(400).json({ error: 'formNumber required' });
      }

      const { data, error } = await supabaseAdmin
        .from('policy_forms')
        .insert({
          organization_id: req.organizationId,
          claim_id: claimId || null,
          form_number: formNumber,
          document_title: documentTitle || null,
          description: description || null,
          key_provisions: keyProvisions || {}
        })
        .select('*')
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get policy form
  app.get('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('policy_forms')
        .select('*')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Policy form not found' });
        }
        throw error;
      }

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update policy form
  app.put('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { formNumber, documentTitle, description, keyProvisions, claimId } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (formNumber !== undefined) updateData.form_number = formNumber;
      if (documentTitle !== undefined) updateData.document_title = documentTitle;
      if (description !== undefined) updateData.description = description;
      if (keyProvisions !== undefined) updateData.key_provisions = keyProvisions;
      if (claimId !== undefined) updateData.claim_id = claimId;

      const { data, error } = await supabaseAdmin
        .from('policy_forms')
        .update(updateData)
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Policy form not found' });
        }
        throw error;
      }

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete policy form
  app.delete('/api/policy-forms/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error, count } = await supabaseAdmin
        .from('policy_forms')
        .delete({ count: 'exact' })
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!);

      if (error) throw error;

      if (count === 0) {
        return res.status(404).json({ error: 'Policy form not found' });
      }

      res.json({ success: true });
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
      const { claimId, formNumber, documentTitle, description, appliesToState, keyChanges } = req.body;
      if (!formNumber) {
        return res.status(400).json({ error: 'formNumber required' });
      }

      const { data, error } = await supabaseAdmin
        .from('endorsements')
        .insert({
          organization_id: req.organizationId,
          claim_id: claimId || null,
          form_number: formNumber,
          document_title: documentTitle || null,
          description: description || null,
          applies_to_state: appliesToState || null,
          key_changes: keyChanges || {}
        })
        .select('*')
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Bulk create endorsements
  app.post('/api/endorsements/bulk', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { claimId, endorsements } = req.body;
      if (!endorsements || !Array.isArray(endorsements) || endorsements.length === 0) {
        return res.status(400).json({ error: 'endorsements array required' });
      }

      const endorsementsToInsert = endorsements
        .filter((e: any) => e.formNumber)
        .map((endorsement: any) => ({
          organization_id: req.organizationId,
          claim_id: claimId || null,
          form_number: endorsement.formNumber,
          document_title: endorsement.documentTitle || null,
          description: endorsement.description || null,
          applies_to_state: endorsement.appliesToState || null,
          key_changes: endorsement.keyChanges || {}
        }));

      const { data, error } = await supabaseAdmin
        .from('endorsements')
        .insert(endorsementsToInsert)
        .select('*');

      if (error) throw error;

      // Also update the documents associated with the endorsements to link to the claim
      if (claimId) {
        const docIds = endorsements
          .filter((e: any) => e.documentId)
          .map((e: any) => e.documentId);

        if (docIds.length > 0) {
          const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({
              claim_id: claimId,
              updated_at: new Date().toISOString()
            })
            .in('id', docIds)
            .eq('organization_id', req.organizationId!);

          if (docError) throw docError;
        }
      }

      res.status(201).json({ endorsements: data, count: data.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get endorsement
  app.get('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('endorsements')
        .select('*')
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Endorsement not found' });
        }
        throw error;
      }

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Update endorsement
  app.put('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { formNumber, documentTitle, description, appliesToState, keyChanges, claimId } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (formNumber !== undefined) updateData.form_number = formNumber;
      if (documentTitle !== undefined) updateData.document_title = documentTitle;
      if (description !== undefined) updateData.description = description;
      if (appliesToState !== undefined) updateData.applies_to_state = appliesToState;
      if (keyChanges !== undefined) updateData.key_changes = keyChanges;
      if (claimId !== undefined) updateData.claim_id = claimId;

      const { data, error } = await supabaseAdmin
        .from('endorsements')
        .update(updateData)
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!)
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Endorsement not found' });
        }
        throw error;
      }

      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete endorsement
  app.delete('/api/endorsements/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { data, error, count } = await supabaseAdmin
        .from('endorsements')
        .delete({ count: 'exact' })
        .eq('id', req.params.id)
        .eq('organization_id', req.organizationId!);

      if (error) throw error;

      if (count === 0) {
        return res.status(404).json({ error: 'Endorsement not found' });
      }

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // PHOTO ROUTES (Voice Sketch)
  // ============================================

  // Upload photo with AI analysis
  app.post('/api/photos/upload', requireAuth, requireOrganization, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { uploadAndAnalyzePhoto } = await import('./services/photos');
      const { claimId, structureId, roomId, subRoomId, objectId, label, hierarchyPath, latitude, longitude } = req.body;

      // Get user display name for uploadedBy field
      const user = req.user;
      let uploadedBy: string | undefined;
      if (user) {
        if (user.firstName && user.lastName) {
          uploadedBy = `${user.firstName} ${user.lastName}`;
        } else if (user.firstName) {
          uploadedBy = user.firstName;
        } else if (user.email) {
          uploadedBy = user.email;
        } else if (user.username) {
          uploadedBy = user.username;
        }
      }

      const photo = await uploadAndAnalyzePhoto({
        file: {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
        claimId,
        organizationId: req.organizationId,
        structureId,
        roomId,
        subRoomId,
        objectId,
        label,
        hierarchyPath,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        uploadedBy,
      });

      res.status(201).json(photo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] Upload error:', error);
      res.status(500).json({ error: message });
    }
  });

  // Get signed URL for a photo
  app.get('/api/photos/:storagePath(*)/url', requireAuth, async (req, res) => {
    try {
      const { getPhotoSignedUrl } = await import('./services/photos');
      const url = await getPhotoSignedUrl(req.params.storagePath);
      if (!url) {
        return res.status(404).json({ error: 'Photo not found or URL generation failed' });
      }
      res.json({ url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete a photo by storage path (legacy)
  app.delete('/api/photos/by-path/:storagePath(*)', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { deletePhoto } = await import('./services/photos');
      const success = await deletePhoto(req.params.storagePath);
      if (!success) {
        return res.status(500).json({ error: 'Failed to delete photo' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // List photos for a claim (with filters)
  app.get('/api/claims/:claimId/photos', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { listClaimPhotos } = await import('./services/photos');
      const { claimId } = req.params;
      const { structureId, roomId, damageZoneId, damageDetected } = req.query;

      const filters: Record<string, string | boolean> = {};
      if (structureId) filters.structureId = structureId as string;
      if (roomId) filters.roomId = roomId as string;
      if (damageZoneId) filters.damageZoneId = damageZoneId as string;
      if (damageDetected !== undefined) filters.damageDetected = damageDetected === 'true';

      const photos = await listClaimPhotos(claimId, filters);
      res.json(photos);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] List error:', error);
      res.status(500).json({ error: message });
    }
  });

  // Get single photo by ID
  app.get('/api/photos/:id', requireAuth, async (req, res) => {
    try {
      const { getClaimPhoto } = await import('./services/photos');
      const photo = await getClaimPhoto(req.params.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      res.json(photo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Delete photo by ID (deletes from both database and Supabase storage)
  app.delete('/api/photos/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { deleteClaimPhoto } = await import('./services/photos');
      const success = await deleteClaimPhoto(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Photo not found or deletion failed' });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] Delete error:', error);
      res.status(500).json({ error: message });
    }
  });

  // Update photo (label, hierarchy path, claim assignment, structure associations)
  app.patch('/api/photos/:id', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { updateClaimPhoto } = await import('./services/photos');
      const { label, hierarchyPath, claimId, structureId, roomId, damageZoneId } = req.body;

      const updated = await updateClaimPhoto(req.params.id, {
        label,
        hierarchyPath,
        claimId, // Allows reassigning photo to different claim or setting to null to unassign
        structureId,
        roomId,
        damageZoneId,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] Update error:', error);
      res.status(500).json({ error: message });
    }
  });

  // List all photos for organization (across all claims)
  app.get('/api/photos', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { listAllClaimPhotos } = await import('./services/photos');
      const organizationId = req.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }
      const photos = await listAllClaimPhotos(organizationId);
      res.json(photos);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] List all error:', error);
      res.status(500).json({ error: message });
    }
  });

  // Re-analyze photo (retry failed analysis or update analysis)
  app.post('/api/photos/:id/reanalyze', requireAuth, requireOrganization, async (req, res) => {
    try {
      const { reanalyzePhoto } = await import('./services/photos');
      const result = await reanalyzePhoto(req.params.id);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: 'Analysis started in background' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[photos] Re-analyze error:', error);
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
        return res.status(400).json({ error: 'Document type required (fnol, policy, endorsement, photo, estimate, correspondence, or auto)' });
      }

      // For 'auto' type, store as 'pending' initially - will be classified by the queue
      const isAutoClassify = type === 'auto';
      const storageType = isAutoClassify ? 'pending' : type;

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
          type: storageType,
          category,
          description,
          tags: tags ? JSON.parse(tags) : undefined,
          uploadedBy: req.user!.id
        }
      );

      // Auto-trigger background processing
      // For 'auto' type: classify first, then extract
      // For specific types: extract directly (if applicable)
      if (isAutoClassify) {
        queueDocumentProcessing(doc.id, req.organizationId!, true); // needsClassification = true
        console.log(`[DocumentUpload] Queued auto-classification for document ${doc.id}`);
      } else if (['fnol', 'policy', 'endorsement'].includes(type)) {
        queueDocumentProcessing(doc.id, req.organizationId!, false);
        console.log(`[DocumentUpload] Queued background processing for document ${doc.id} (type: ${type})`);
      }

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
        return res.status(400).json({ error: 'Document type required (fnol, policy, endorsement, photo, estimate, correspondence, or auto)' });
      }

      // For 'auto' type, store as 'pending' initially - will be classified by the queue
      const isAutoClassify = type === 'auto';
      const storageType = isAutoClassify ? 'pending' : type;

      const results = [];
      const toProcess: Array<{ documentId: string; organizationId: string; needsClassification?: boolean }> = [];

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
            type: storageType,
            category,
            uploadedBy: req.user!.id
          }
        );
        results.push(doc);

        // Queue for background processing
        if (isAutoClassify) {
          toProcess.push({ documentId: doc.id, organizationId: req.organizationId!, needsClassification: true });
        } else if (['fnol', 'policy', 'endorsement'].includes(type)) {
          toProcess.push({ documentId: doc.id, organizationId: req.organizationId!, needsClassification: false });
        }
      }

      // Auto-trigger background processing for all applicable documents
      if (toProcess.length > 0) {
        queueDocumentsProcessing(toProcess);
        console.log(`[DocumentUpload] Queued ${isAutoClassify ? 'auto-classification' : 'background processing'} for ${toProcess.length} documents`);
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

  // Get batch processing status for multiple documents
  // Used by the upload queue to poll for completion
  app.get('/api/documents/batch-status', requireAuth, requireOrganization, async (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) {
        return res.status(400).json({ error: 'Document IDs required (comma-separated)' });
      }

      const documentIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
      if (documentIds.length === 0) {
        return res.status(400).json({ error: 'No valid document IDs provided' });
      }

      // Get status from the processing queue
      const queueStatus = getBatchProcessingStatus(documentIds);

      // Also fetch actual document status from the database
      const result: Record<string, string> = {};

      for (const docId of documentIds) {
        // If in queue, use queue status
        if (queueStatus[docId] && queueStatus[docId] !== 'pending') {
          result[docId] = queueStatus[docId];
        } else {
          // Otherwise, check the database
          try {
            const doc = await getDocument(docId, req.organizationId!);
            result[docId] = doc?.processingStatus || 'pending';
          } catch {
            result[docId] = 'pending';
          }
        }
      }

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get document processing queue statistics
  app.get('/api/documents/queue-stats', requireAuth, requireOrganization, async (req, res) => {
    try {
      const stats = getDocumentQueueStats();
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

  // Get document processing status (for polling after upload)
  app.get('/api/documents/:id/status', requireAuth, requireOrganization, async (req, res) => {
    try {
      const doc = await getDocument(req.params.id, req.organizationId!);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({
        documentId: doc.id,
        processingStatus: doc.processingStatus || 'pending',
        claimId: doc.claimId || null,
        claimNumber: doc.claimNumber || null,
        documentType: doc.documentType || null,
        error: doc.processingError || null,
      });
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

  // Get document preview URLs from Supabase (persistent cloud storage)
  app.get('/api/documents/:id/previews', requireAuth, requireOrganization, async (req, res) => {
    try {
      const result = await getDocumentPreviewUrls(req.params.id, req.organizationId!);
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

  // Trigger preview generation for a document
  app.post('/api/documents/:id/generate-previews', requireAuth, requireOrganization, async (req, res) => {
    try {
      const result = await generateDocumentPreviews(req.params.id, req.organizationId!);
      if (result.success) {
        res.json({ success: true, pageCount: result.pageCount });
      } else {
        res.status(500).json({ error: result.error || 'Failed to generate previews' });
      }
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

      // Queue geocoding for the new claim address
      queueGeocoding(claimId);

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
      const { data, error } = await supabaseAdmin
        .from('xact_categories')
        .select('*')
        .order('code');
      if (error) throw new Error(error.message);
      res.json(data);
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
      const { data, error } = await supabaseAdmin
        .from('xact_categories')
        .select('*')
        .eq('code', req.params.code.toUpperCase())
        .limit(1)
        .maybeSingle();
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: 'Category not found' });
      }
      res.json(data);
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

      let query = supabaseAdmin
        .from('xact_line_items')
        .select('*', { count: 'exact' });

      if (q) {
        const searchTerm = (q as string).toLowerCase();
        query = query.or(`description.ilike.%${searchTerm}%,full_code.ilike.%${searchTerm}%,selector_code.ilike.%${searchTerm}%`);
      }

      if (category) {
        query = query.eq('category_code', (category as string).toUpperCase());
      }

      const { data, error, count } = await query
        .order('full_code')
        .range(offsetNum, offsetNum + limitNum - 1);

      if (error) throw new Error(error.message);

      res.json({
        items: data,
        total: count || 0,
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
      const { data, error } = await supabaseAdmin
        .from('xact_line_items')
        .select('*')
        .eq('full_code', req.params.code.toUpperCase())
        .limit(1)
        .single();
      if (error || !data) {
        return res.status(404).json({ error: 'Line item not found' });
      }
      res.json(data);
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
      const { count: catCount } = await supabaseAdmin.from('xact_categories').select('*', { count: 'exact', head: true });
      const { count: itemCount } = await supabaseAdmin.from('xact_line_items').select('*', { count: 'exact', head: true });
      const { count: compCount } = await supabaseAdmin.from('xact_components').select('*', { count: 'exact', head: true });
      
      // For top categories and component breakdown, use RPC or simple queries
      // Simplified version - just return counts
      res.json({
        totalCategories: catCount || 0,
        totalLineItems: itemCount || 0,
        totalComponents: compCount || 0,
        topCategories: [],
        componentBreakdown: [],
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

      let query = supabaseAdmin
        .from('xact_components')
        .select('*', { count: 'exact' });

      if (q) {
        const searchTerm = (q as string).toLowerCase();
        query = query.or(`description.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      if (type) {
        query = query.eq('component_type', type as string);
      }

      const { data, error, count } = await query
        .order('code')
        .range(offsetNum, offsetNum + limitNum - 1);

      if (error) throw new Error(error.message);

      res.json({
        items: data,
        total: count || 0,
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
      const { data, error } = await supabaseAdmin
        .from('xact_components')
        .select('*')
        .eq('code', req.params.code.toUpperCase())
        .limit(1)
        .single();
      if (error || !data) {
        return res.status(404).json({ error: 'Component not found' });
      }
      res.json(data);
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
      
      const { data: insertedItem, error } = await supabaseAdmin
        .from('estimate_line_items')
        .insert({
          estimate_id: req.params.id,
          line_item_code: xactItem.code,
          line_item_description: xactItem.description,
          category_id: xactItem.categoryCode,
          quantity: xactItem.quantity,
          unit: xactItem.unit,
          unit_price: xactItem.unitPrice,
          material_cost: xactItem.materialCost,
          labor_cost: xactItem.laborCost,
          equipment_cost: xactItem.equipmentCost,
          subtotal: xactItem.subtotal,
          source: 'xactimate',
          damage_zone_id: damageZoneId || null,
          room_name: roomName || null,
          notes: notes || null
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      
      res.json({
        success: true,
        lineItem: insertedItem,
        pricing: xactItem,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // ============================================
  // AI PROMPTS MANAGEMENT API
  // ============================================

  /**
   * GET /api/prompts
   * List all AI prompts (for admin UI)
   */
  app.get('/api/prompts', requireAuth, async (req, res) => {
    try {
      const prompts = await getAllPrompts();
      res.json({ prompts });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/prompts/:key
   * Get a specific prompt by key
   */
  app.get('/api/prompts/:key', requireAuth, async (req, res) => {
    try {
      const prompt = await getPrompt(req.params.key);
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }
      res.json({ prompt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/prompts/:key/config
   * Get full prompt configuration for API calls (includes fallback)
   */
  app.get('/api/prompts/:key/config', requireAuth, async (req, res) => {
    try {
      const config = await getPromptWithFallback(req.params.key);
      res.json({ config });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * PUT /api/prompts/:key
   * Update an AI prompt (admin only)
   */
  app.put('/api/prompts/:key', requireAuth, async (req, res) => {
    try {
      const { systemPrompt, userPromptTemplate, model, temperature, maxTokens, responseFormat, description, isActive } = req.body;

      const updated = await updatePrompt(req.params.key, {
        systemPrompt,
        userPromptTemplate,
        model,
        temperature,
        maxTokens,
        responseFormat,
        description,
        isActive,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      res.json({ prompt: updated, message: 'Prompt updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/prompts/refresh-cache
   * Force refresh the prompts cache
   */
  app.post('/api/prompts/refresh-cache', requireAuth, async (req, res) => {
    try {
      await refreshCache();
      res.json({ message: 'Cache refreshed successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return httpServer;
}
