import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";
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
import {
  getEstimateSketch,
  updateEstimateSketch,
  validateEstimateSketchForExport
} from "./services/sketchService";
import { generateEsxZipArchive } from "./services/esxExport";
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
import { validateBody, validateQuery, validateParams } from "./middleware/validation";
import { errors, asyncHandler } from "./middleware/errorHandler";
import { createLogger, logError } from "./lib/logger";
import {
  estimateCalculationInputSchema,
  estimateUpdateSchema,
  addLineItemToEstimateSchema,
  claimCreateSchema,
  claimUpdateSchema,
  aiSuggestEstimateSchema,
  aiQuickSuggestSchema,
  workflowRegenerateSchema,
  workflowExpandRoomsSchema,
  addLineItemToZoneSchema,
  updateLineItemSchema,
  passwordChangeSchema,
  checklistItemUpdateSchema,
  checklistItemCreateSchema,
  checklistGenerateSchema,
  organizationCreateSchema,
  organizationUpdateSchema,
  organizationSwitchSchema,
  organizationAddMemberSchema,
  documentProcessSchema,
  documentClaimAssociationSchema,
  createClaimFromDocumentsSchema,
  promptUpdateSchema,
  sketchFloorplanDataSchema,
  sketchRoomSchema,
  sketchOpeningSchema,
  sketchMissingWallSchema,
  structureCreateSchema,
  structureUpdateSchema,
  areaCreateSchema,
  areaUpdateSchema,
  zoneCreateSchema,
  zoneUpdateSchema,
  subroomCreateSchema,
  subroomUpdateSchema,
  coverageCreateSchema,
  lineItemCoverageUpdateSchema,
  workflowStepUpdateSchema,
  workflowStepCreateSchema,
  workflowRoomCreateSchema,
  workflowEvidenceSchema,
  workflowMutationSchema,
  calendarAppointmentCreateSchema,
  claimRoomsSaveSchema,
  scopeItemCreateSchema,
  scopeItemUpdateSchema,
  sketchConnectionCreateSchema,
  sketchConnectionUpdateSchema,
  estimateFromTemplateSchema,
  missingWallCreateSchema,
  missingWallUpdateSchema,
  lineItemFromDimensionSchema,
  calendarSyncFromMs365Schema,
  calendarSyncToMs365Schema,
  calendarSyncFullSchema,
  sketchUpdateSchema,
  documentUpdateSchema,
} from "./middleware/validationSchemas";
import {
  authRateLimiter,
  apiRateLimiter,
  aiRateLimiter,
  uploadRateLimiter,
} from "./middleware/rateLimit";
import { uuidParamSchema, paginationQuerySchema, statusQuerySchema } from "./middleware/queryValidation";
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
import { normalizePeril } from "./services/perilNormalizer";
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
  app.post('/api/auth/login', authRateLimiter, (req, res, next) => {
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
            logError(log, saveErr, 'Session save error');
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
        res.clearCookie('claimsiq.sid');
        res.json({ message: 'Logout successful' });
      });
    });
  });

  // ============================================
  // MS365 CALENDAR INTEGRATION ROUTES
  // ============================================
  
  // Get MS365 connection status
  app.get('/api/auth/ms365/status', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { getConnectionStatus } = await import('./services/ms365AuthService');
    const status = await getConnectionStatus(req.user!.id);
    res.json(status);
  }));

  // Initiate MS365 OAuth flow - redirects directly to Microsoft
  app.get('/api/auth/ms365/connect', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    try {
      const { getAuthorizationUrl, isMs365Configured } = await import('./services/ms365AuthService');
      
      if (!isMs365Configured()) {
        return res.redirect('/settings?ms365_error=not_configured');
      }

      const authUrl = await getAuthorizationUrl(req.user!.id);
      log.debug({ authUrl }, '[MS365] Redirecting to auth URL');
      res.redirect(authUrl);
    } catch (error) {
      logError(log, error, '[MS365] Auth URL generation failed');
      res.redirect('/settings?ms365_error=auth_failed');
    }
  }));

  // MS365 OAuth callback
  app.get('/api/auth/ms365/callback', asyncHandler(async (req, res, next) => {
    const { code, state, error: authError } = req.query;

    if (authError) {
      log.error({ authError }, '[MS365] OAuth error');
      return res.redirect('/settings?ms365_error=auth_denied');
    }

    if (!code || !state) {
      return res.redirect('/settings?ms365_error=invalid_callback');
    }

    try {
      const { exchangeCodeForTokens } = await import('./services/ms365AuthService');
      const result = await exchangeCodeForTokens(code as string, state as string);

      if (result.success) {
        res.redirect('/settings?ms365_connected=true');
      } else {
        logError(log, new Error(result.error || 'Token exchange failed'), '[MS365] Token exchange failed');
        res.redirect('/settings?ms365_error=token_exchange');
      }
    } catch (error) {
      logError(log, error, '[MS365] Callback error');
      res.redirect('/settings?ms365_error=callback_failed');
    }
  }));

  // Disconnect from MS365
  app.post('/api/auth/ms365/disconnect', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { disconnectUser } = await import('./services/ms365AuthService');
    const success = await disconnectUser(req.user!.id);
    
    if (success) {
      res.json({ success: true, message: 'Disconnected from Microsoft 365' });
    } else {
      next(errors.internal('Failed to disconnect'));
    }
  }));

  // ============================================
  // CALENDAR / APPOINTMENTS ROUTES
  // ============================================

  // Get today's appointments
  app.get('/api/calendar/today', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { getTodayAppointments } = await import('./services/ms365CalendarService');
    const appointments = await getTodayAppointments(req.user!.id, req.organizationId!);
    res.json({ appointments });
  }));

  // Get appointments for a specific date or date range
  app.get('/api/calendar/appointments', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    date: z.string().datetime().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { getAppointmentsForDate } = await import('./services/ms365CalendarService');
    
    // Support date range (startDate/endDate) or single date
    if (req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      // Get appointments for each day in the range
      const allAppointments: any[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dayAppointments = await getAppointmentsForDate(req.user!.id, req.organizationId!, new Date(currentDate));
        allAppointments.push(...dayAppointments);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Deduplicate by ID
      const uniqueAppointments = Array.from(
        new Map(allAppointments.map(apt => [apt.id, apt])).values()
      );
      
      res.json({ appointments: uniqueAppointments });
    } else {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const appointments = await getAppointmentsForDate(req.user!.id, req.organizationId!, date);
      res.json({ appointments });
    }
  }));

  // Create a new appointment
  app.post('/api/calendar/appointments', requireAuth, requireOrganization, apiRateLimiter, validateBody(calendarAppointmentCreateSchema), asyncHandler(async (req, res, next) => {
    const { createInspectionAppointment } = await import('./services/ms365CalendarService');
    const { isUserConnected } = await import('./services/ms365AuthService');
    
    const isConnected = await isUserConnected(req.user!.id);
    
    const appointment = await createInspectionAppointment({
      ...req.body,
      organizationId: req.organizationId!,
      adjusterId: req.user!.id,
      syncToMs365: isConnected && req.body.syncToMs365 !== false,
    });
    
    res.json({ appointment });
  }));

  // Get appointments for a claim
  app.get('/api/claims/:id/appointments', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { getAppointmentsForClaim } = await import('./services/ms365CalendarService');
    const appointments = await getAppointmentsForClaim(req.params.id, req.organizationId!);
    res.json({ appointments });
  }));

  // Update an appointment
  app.patch('/api/calendar/appointments/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd: z.string().datetime().optional(),
    notes: z.string().optional(),
    syncToMs365: z.boolean().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { updateAppointment } = await import('./services/ms365CalendarService');
    const appointment = await updateAppointment(
      req.params.id,
      req.organizationId!,
      req.body,
      req.body.syncToMs365 !== false
    );
    
    if (!appointment) {
      return next(errors.notFound('Appointment'));
    }
    
    res.json({ appointment });
  }));

  // Delete an appointment
  app.delete('/api/calendar/appointments/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateQuery(z.object({
    deleteFromMs365: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { deleteAppointment } = await import('./services/ms365CalendarService');
    const success = await deleteAppointment(
      req.params.id,
      req.organizationId!,
      req.query.deleteFromMs365 !== 'false'
    );
    
    if (!success) {
      return next(errors.notFound('Appointment'));
    }
    
    res.json({ success: true });
  }));

  // Fetch MS365 calendar events (for viewing external events)
  app.get('/api/calendar/ms365/events', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { fetchCalendarEvents, fetchTodayEvents } = await import('./services/ms365CalendarService');
    const { isUserConnected } = await import('./services/ms365AuthService');
      
    const isConnected = await isUserConnected(req.user!.id);
    if (!isConnected) {
      return res.json({ events: [], connected: false });
    }
    
    // Support date range or default to today
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date();
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    
    if (req.query.startDate || req.query.endDate) {
      const events = await fetchCalendarEvents(req.user!.id, startDate, endDate);
      res.json({ events, connected: true });
    } else {
      const events = await fetchTodayEvents(req.user!.id);
      res.json({ events, connected: true });
    }
  }));

  // ============================================
  // CALENDAR SYNC ENDPOINTS
  // ============================================

  // Get MS365 connection status
  app.get('/api/calendar/ms365/connection-status', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { getConnectionStatus } = await import('./services/ms365AuthService');
    const status = await getConnectionStatus(req.user!.id);
    res.json(status);
  }));

  // Pull sync from MS365
  app.post('/api/calendar/sync/from-ms365', requireAuth, requireOrganization, apiRateLimiter, validateBody(calendarSyncFromMs365Schema), asyncHandler(async (req, res, next) => {
    const { syncFromMs365 } = await import('./services/ms365CalendarSyncService');
    const { startDate, endDate } = req.body;

    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    const result = await syncFromMs365(req.user!.id, req.organizationId!, start, end);
    res.json(result);
  }));

  // Push sync to MS365
  app.post('/api/calendar/sync/to-ms365', requireAuth, requireOrganization, apiRateLimiter, validateBody(calendarSyncToMs365Schema), asyncHandler(async (req, res, next) => {
    const { syncToMs365 } = await import('./services/ms365CalendarSyncService');
    const { appointmentIds, startDate, endDate } = req.body;

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate || endDate) {
      start = startDate ? new Date(startDate) : new Date();
      start.setHours(0, 0, 0, 0);
      end = endDate ? new Date(endDate) : new Date();
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);
    }

    const result = await syncToMs365(
      req.user!.id,
      req.organizationId!,
      appointmentIds,
      start,
      end
    );
    res.json(result);
  }));

  // Full bidirectional sync
  app.post('/api/calendar/sync/full', requireAuth, requireOrganization, apiRateLimiter, validateBody(calendarSyncFullSchema), asyncHandler(async (req, res, next) => {
    const { fullSync } = await import('./services/ms365CalendarSyncService');
    const { startDate, endDate } = req.body;

    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    const result = await fullSync(req.user!.id, req.organizationId!, start, end);
    res.json(result);
  }));

  // Get sync status
  app.get('/api/calendar/sync/status', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { getSyncStatus } = await import('./services/ms365CalendarSyncService');
    const status = await getSyncStatus(req.user!.id, req.organizationId!);
    res.json(status);
  }));

  // Get current user endpoint (supports both session and Supabase auth)
  app.get('/api/auth/me', asyncHandler(async (req, res, next) => {
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
        logError(log, error, 'Error fetching user');
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
        logError(log, error, 'Token verification error');
      }
    }

    res.status(200).send(JSON.stringify({ user: null, authenticated: false }));
  }));

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
  app.post('/api/auth/supabase/login', authRateLimiter, asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(errors.badRequest('Email and password are required'));
    }

    const { user, session, error } = await supabaseSignIn(email, password);

    if (error) {
      return next(errors.unauthorized(error));
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
  }));

  // Supabase registration endpoint
  app.post('/api/auth/supabase/register', asyncHandler(async (req, res, next) => {
    const { email, password, username, firstName, lastName } = req.body;

    if (!email || !password) {
      return next(errors.badRequest('Email and password are required'));
    }

    const { user, error } = await supabaseSignUp(email, password, {
      username,
      firstName,
      lastName,
    });

    if (error) {
      return next(errors.badRequest(error));
    }

    res.json({
      user: {
        id: user!.id,
        username: user!.username,
        email: user!.email,
      },
      message: 'Registration successful. Please check your email to verify your account.'
    });
  }));

  // Supabase logout endpoint
  app.post('/api/auth/supabase/logout', asyncHandler(async (req, res, next) => {
    const { error } = await supabaseSignOut();

    if (error) {
      return next(errors.internal(error));
    }

    res.json({ message: 'Logout successful' });
  }));

  // Supabase password reset request
  app.post('/api/auth/supabase/forgot-password', asyncHandler(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
      return next(errors.badRequest('Email is required'));
    }

    const { error } = await requestPasswordReset(email);

    if (error) {
      return next(errors.badRequest(error));
    }

    res.json({ message: 'Password reset email sent' });
  }));

  // Supabase get current user (from token)
  app.get('/api/auth/supabase/me', asyncHandler(async (req, res, next) => {
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
      logError(log, error, 'Get current user error');
      res.json({ user: null, authenticated: false });
    }
  }));

  // ============================================
  // USER PROFILE ROUTES
  // ============================================

  // Update user profile
  app.put('/api/users/profile', requireAuth, validateBody(z.object({
    name: z.string().optional(),
    displayName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
  })), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('User'));
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
        logError(log, err, 'Session update error');
      }
    });

    // Return user with combined name for client compatibility
    const userWithName = {
      ...updatedUser,
      name: [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ') || updatedUser.username
    };

    res.json({ user: userWithName, message: 'Profile updated successfully' });
  }));

  // Change user password
  app.put('/api/users/password', requireAuth, apiRateLimiter, validateBody(passwordChangeSchema), asyncHandler(async (req, res, next) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;
    
    const result = await changeUserPassword(userId, currentPassword, newPassword);
    if (!result.success) {
      return next(errors.badRequest(result.error));
    }
    
    res.json({ message: 'Password changed successfully' });
  }));

  // Get user preferences
  app.get('/api/users/preferences', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const userId = req.user!.id;
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('User'));
      }
      throw error;
    }

    res.json(data.preferences || {});
  }));

  // Update user preferences
  app.put('/api/users/preferences', requireAuth, apiRateLimiter, validateBody(z.record(z.unknown())), asyncHandler(async (req, res, next) => {
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
        return next(errors.notFound('User'));
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
  }));


  // ============================================
  // LINE ITEMS ROUTES
  // ============================================

  app.get('/api/line-items', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    q: z.string().optional(),
    category: z.string().optional(),
    damage_type: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { q, category, damage_type, limit, offset } = req.query;
    const result = await searchLineItems({
      q: q as string,
      category: category as string,
      damageType: damage_type as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0
    });
    res.json(result);
  }));

  app.get('/api/line-items/categories', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const categories = await getCategories();
    res.json(categories);
  }));

  app.post('/api/pricing/calculate', requireAuth, requireOrganization, apiRateLimiter, validateBody(z.object({
    line_item_code: z.string().min(1, 'Line item code is required'),
    quantity: z.coerce.number().positive('Quantity must be positive'),
    region_id: z.string().min(1, 'Region ID is required'),
    carrier_id: z.string().uuid().optional(),
  })), asyncHandler(async (req, res, next) => {
    const { line_item_code, quantity, region_id, carrier_id } = req.body;
    
    try {
      const result = await calculatePrice(
        line_item_code,
        parseFloat(quantity.toString()),
        region_id,
        carrier_id
      );
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        return next(errors.notFound('Line item or region'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  app.get('/api/pricing/region/:zipCode', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ zipCode: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const region = await getRegionByZip(req.params.zipCode);
    if (!region) {
      return next(errors.notFound('Region'));
    }
    res.json(region);
  }));

  app.post('/api/scrape/home-depot', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const result = await runScrapeJob();
    res.json(result);
  }));

  app.get('/api/scrape/test', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const results = await testScrape();
    const data = Array.from(results.entries()).map(([sku, product]) => ({
      sku,
      name: product.name,
      price: product.price,
      unit: product.unit,
      url: product.url
    }));
    res.json(data);
  }));

  app.get('/api/scrape/config', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    res.json({
      productMappings: PRODUCT_MAPPINGS,
      storeRegions: STORE_REGIONS
    });
  }));

  // Get scraped prices from database for visualization
  app.get('/api/scrape/prices', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
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
  }));

  // Get scrape job history
  app.get('/api/scrape/jobs', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('price_scrape_jobs')
      .select('id, source, status, started_at, completed_at, items_processed, items_updated, errors')
      .order('started_at', { ascending: false })
      .limit(10);

      if (error) throw error;

      res.json(data);
  }));

  // System status endpoint (minimal information for health checks)
  // Note: This endpoint is intentionally unprotected for monitoring tools,
  // but exposes minimal information to reduce data leakage risk
  app.get('/api/system/status', asyncHandler(async (req, res, next) => {
    try {
      // Test database connection
      const { data: timeData, error: timeError } = await supabaseAdmin
        .rpc('get_current_time');

      const dbTime = timeData || new Date().toISOString();
      const dbVersion = 'PostgreSQL (Supabase)';

      // Only return basic health information - no row counts or sensitive data
      // For detailed status, use authenticated endpoints
      res.json({
        database: {
          connected: !timeError,
          time: dbTime,
          version: dbVersion
        },
        status: 'ok',
        environment: process.env.NODE_ENV || 'development'
        // Note: Removed row counts and regions list to reduce information leakage
        // Use authenticated /api/admin/system/stats for detailed metrics
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
  }));

  // ============================================
  // ROUTE OPTIMIZATION
  // ============================================

  app.post('/api/route/optimize', requireAuth, apiRateLimiter, validateBody(z.object({
    origin: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    stops: z.array(z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
    })).min(1, 'stops array is required'),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { optimizeRoute } = await import('./services/routeOptimization');
    const { origin, stops } = req.body;

    if (!stops || !Array.isArray(stops)) {
      return next(errors.badRequest('stops array is required'));
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

    try {
      const result = await optimizeRoute(routeOrigin, validStops);
      res.json({ ...result, optimized: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(log, error, 'Route optimization error');
      
      if (message.includes('not configured')) {
        return next(errors.internal('Route optimization service not configured'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  app.post('/api/route/drive-times', requireAuth, asyncHandler(async (req, res, next) => {
    const { calculateDriveTimes } = await import('./services/routeOptimization');
    const { stops } = req.body;

    if (!stops || !Array.isArray(stops)) {
      return next(errors.badRequest('stops array is required'));
    }

    const validStops = stops.filter((s: any) => 
      s.id && typeof s.lat === 'number' && typeof s.lng === 'number' &&
      s.lat !== 0 && s.lng !== 0
    );

    try {
      const driveTimes = await calculateDriveTimes(validStops);
      
      // Convert Map to object for JSON
      const result: Record<string, { duration: number; durationText: string }> = {};
      driveTimes.forEach((value, key) => {
        result[key] = value;
      });

      res.json({ driveTimes: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(log, error, 'Drive times calculation error');
      return next(errors.internal(message));
    }
  }));

  // ============================================
  // WEATHER API ROUTES
  // ============================================
  
  app.post('/api/weather/locations', requireAuth, apiRateLimiter, validateBody(z.object({
    locations: z.array(z.object({
      lat: z.number(),
      lng: z.number(),
      stopId: z.string().optional(),
      id: z.string().optional(),
    })).min(1, 'locations array is required'),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const { getWeatherForLocations } = await import('./services/weatherService');
    const { locations } = req.body;

    if (!locations || !Array.isArray(locations)) {
      return next(errors.badRequest('locations array is required'));
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

    try {
      const weather = await getWeatherForLocations(validLocations);
      res.json({ weather });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(log, error, 'Weather fetch error');
      return next(errors.internal(message));
    }
  }));

  // ============================================
  // MY DAY AI ANALYSIS ROUTES (DEPRECATED - Feature removed from UI)
  // ============================================
  // The My Day feature has been deprecated and removed from the application.
  // This endpoint is disabled to save OpenAI API resources.
  // The code is preserved here for reference if the feature is re-enabled in the future.
  /*
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
      logError(log, error, 'My Day analysis error');
      res.status(500).json({ error: message });
    }
  });
  */

  // Voice Session Routes
  app.post('/api/voice/session', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    try {
      const result = await createVoiceSession();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(log, error, 'Voice session creation error');
      if (message.includes('not configured')) {
        return next(errors.internal('Voice service not configured'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  app.get('/api/voice/config', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    res.json({
      availableVoices: VOICE_CONFIG.availableVoices,
      defaultVoice: VOICE_CONFIG.defaultVoice,
      model: VOICE_CONFIG.model
    });
  }));

  // ============================================
  // AI ESTIMATE SUGGESTION ROUTES
  // ============================================

  // Generate AI suggestions from damage zones
  app.post('/api/ai/suggest-estimate', requireAuth, requireOrganization, aiRateLimiter, validateBody(aiSuggestEstimateSchema), asyncHandler(async (req, res, next) => {
    const { damageZones, regionId } = req.body;

    if (!damageZones || !Array.isArray(damageZones) || damageZones.length === 0) {
      return next(errors.badRequest('Missing required field: damageZones (array of damage zone objects)'));
    }

    try {
      const result = await generateEstimateSuggestions(damageZones, regionId);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(log, error, 'AI suggestion error');
      if (message.includes('not configured')) {
        return next(errors.internal('AI service not configured'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  // Quick suggest line items (for voice interface)
  app.post('/api/ai/quick-suggest', requireAuth, requireOrganization, aiRateLimiter, validateBody(aiQuickSuggestSchema), asyncHandler(async (req, res, next) => {
    const { description, roomName, damageType, quantity } = req.body;

    if (!description || !roomName || !damageType) {
      return next(errors.badRequest('Missing required fields: description, roomName, damageType'));
    }

    try {
      const suggestions = await quickSuggestLineItems(
        description,
        roomName,
        damageType,
        quantity
      );
      res.json({ suggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return next(errors.internal(message));
    }
  }));

  // Search line items by natural language
  app.get('/api/ai/search-line-items', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    q: z.string().min(1, 'Search query (q) is required'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })), asyncHandler(async (req, res, next) => {
    const { q, limit } = req.query;

    if (!q) {
      return next(errors.badRequest('Missing query parameter: q'));
    }

    try {
      const results = await searchLineItemsByDescription(
        q as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return next(errors.internal(message));
    }
  }));

  // ============================================
  // ESTIMATE ROUTES
  // ============================================

  // Calculate estimate without saving (preview)
  app.post('/api/estimates/calculate', requireAuth, requireOrganization, apiRateLimiter, validateBody(estimateCalculationInputSchema), asyncHandler(async (req, res, next) => {
    try {
      const result = await calculateEstimate(req.body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return next(errors.internal(message));
    }
  }));

  // Create and save new estimate
  app.post('/api/estimates', requireAuth, apiRateLimiter, validateBody(estimateCalculationInputSchema), asyncHandler(async (req, res, next) => {
    try {
      const calculation = await calculateEstimate(req.body);
      const savedEstimate = await saveEstimate(req.body, calculation);
      res.status(201).json(savedEstimate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return next(errors.internal(message));
    }
  }));

  // List estimates
  app.get('/api/estimates', requireAuth, requireOrganization, apiRateLimiter, validateQuery(paginationQuerySchema.merge(statusQuerySchema).extend({
    claim_id: z.string().uuid().optional(),
  })), asyncHandler(async (req, res, next) => {
    const { status, claim_id, limit, offset } = req.query;
    const result = await listEstimates({
      organizationId: req.organizationId!,
      status: status as string,
      claimId: claim_id as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  }));

  // Get estimate by ID
  app.get('/api/estimates/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
      const estimate = await getEstimate(req.params.id, req.organizationId!);
      if (!estimate) {
        return next(errors.notFound('Estimate'));
      }
      res.json(estimate);
  }));

  // Update estimate
  app.put('/api/estimates/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(estimateUpdateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    await assertEstimateNotLocked(req.params.id);

    const updatedEstimate = await updateEstimate(req.params.id, req.body);
    res.json(updatedEstimate);
  }));

  // Add line item to estimate
  app.post('/api/estimates/:id/line-items', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(addLineItemToEstimateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    await assertEstimateNotLocked(req.params.id);

    const { lineItemCode, quantity, notes, roomName } = req.body;
    if (!lineItemCode || !quantity) {
      return next(errors.badRequest('Missing required fields: lineItemCode, quantity'));
    }
    const updatedEstimate = await addLineItemToEstimate(
      req.params.id,
      { lineItemCode, quantity, notes, roomName }
    );
    res.json(updatedEstimate);
  }));

  // Remove line item from estimate
  app.delete('/api/estimates/:id/line-items/:code', requireAuth, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), code: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    await assertEstimateNotLocked(req.params.id);

    const updatedEstimate = await removeLineItemFromEstimate(
      req.params.id,
      req.params.code
    );
    res.json(updatedEstimate);
  }));

  // ============================================
  // ESTIMATE SUBMISSION/FINALIZATION ROUTES
  // ============================================

  // Submit estimate for review (finalize)
  app.post('/api/estimates/:id/submit', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const result = await submitEstimate(req.params.id);

    if (!result.success) {
      // Validation errors block submission
      if (result.validation.errorCount > 0) {
        return next(errors.badRequest(result.message));
      } else {
        return next(errors.forbidden(result.message));
      }
    }

    res.json(result);
  }));

  // Validate estimate before submission (preview)
  app.get('/api/estimates/:id/validate', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
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
        return next(errors.notFound('Estimate'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  // Get estimate lock status (accepts estimate ID or claim ID)
  app.get('/api/estimates/:id/lock-status', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
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
  }));

  // Get estimate templates
  app.get('/api/estimate-templates', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({ damage_type: z.string().optional() }).passthrough()), asyncHandler(async (req, res, next) => {
    const { damage_type } = req.query;
    const templates = await getEstimateTemplates(damage_type as string);
    res.json(templates);
  }));

  // Create estimate from template
  app.post('/api/estimate-templates/:id/create', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(estimateFromTemplateSchema), asyncHandler(async (req, res, next) => {
    const { quantities, ...estimateInput } = req.body;
    if (!quantities || typeof quantities !== 'object') {
      return next(errors.badRequest('Missing required field: quantities (object with line item codes as keys)'));
    }
    const savedEstimate = await createEstimateFromTemplate(
      req.params.id,
      quantities,
      estimateInput
    );
    res.status(201).json(savedEstimate);
  }));

  // Get carrier profiles
  app.get('/api/carrier-profiles', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('carrier_profiles')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    res.json(data);
  }));

  // Get regions
  app.get('/api/regions', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('regions')
      .select('*')
      .order('id');

    if (error) throw error;

    res.json(data);
  }));

  // ============================================
  // COVERAGE TYPES ROUTES
  // ============================================

  // Get all coverage types
  app.get('/api/coverage-types', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('coverage_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('code');

    if (error) throw error;

    res.json(data);
  }));

  // Get coverage type by code
  app.get('/api/coverage-types/:code', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ code: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('coverage_types')
      .select('*')
      .eq('code', req.params.code)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('Coverage type'));
      }
      throw error;
    }

    res.json(data);
  }));

  // ============================================
  // TAX RATES ROUTES
  // ============================================

  // Get all tax rates
  app.get('/api/tax-rates', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    region_code: z.string().optional(),
    tax_type: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get tax rate for a specific region
  app.get('/api/tax-rates/region/:regionCode', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ regionCode: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('tax_rates')
      .select('*')
      .eq('region_code', req.params.regionCode)
      .eq('is_active', true)
      .order('tax_type');

    if (error) throw error;

    res.json(data);
  }));

  // ============================================
  // DEPRECIATION SCHEDULES ROUTES
  // ============================================

  // Get all depreciation schedules
  app.get('/api/depreciation-schedules', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    category_code: z.string().optional(),
    item_type: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get depreciation schedule by category
  app.get('/api/depreciation-schedules/category/:categoryCode', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ categoryCode: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('depreciation_schedules')
      .select('*')
      .eq('category_code', req.params.categoryCode)
      .order('item_type');

    if (error) throw error;

    res.json(data);
  }));

  // ============================================
  // REGIONAL MULTIPLIERS ROUTES
  // ============================================

  // Get all regional multipliers
  app.get('/api/regional-multipliers', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('regional_multipliers')
      .select('*')
      .eq('is_active', true)
      .order('region_code');

    if (error) throw error;

    res.json(data);
  }));

  // Get regional multiplier by region code
  app.get('/api/regional-multipliers/:regionCode', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ regionCode: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('regional_multipliers')
      .select('*')
      .eq('region_code', req.params.regionCode)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('Regional multiplier'));
      }
      throw error;
    }

    res.json(data);
  }));

  // ============================================
  // LABOR RATES ROUTES
  // ============================================

  // Get all labor rates
  app.get('/api/labor-rates', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    trade_code: z.string().optional(),
    region_code: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get labor rate for specific trade
  app.get('/api/labor-rates/trade/:tradeCode', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ tradeCode: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('labor_rates_enhanced')
      .select('*')
      .eq('trade_code', req.params.tradeCode)
      .eq('is_active', true)
      .order('region_code');

    if (error) throw error;

    res.json(data);
  }));

  // ============================================
  // PRICE LISTS ROUTES
  // ============================================

  // Get all price lists
  app.get('/api/price-lists', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('price_lists')
      .select('*')
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .order('region_code');

    if (error) throw error;

    res.json(data);
  }));

  // Get price list by code
  app.get('/api/price-lists/:code', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ code: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('price_lists')
      .select('*')
      .eq('code', req.params.code)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('Price list'));
      }
      throw error;
    }

    res.json(data);
  }));

  // ============================================
  // REPORT & EXPORT ROUTES
  // ============================================

  // Generate PDF report (returns real PDF if Puppeteer available, HTML otherwise)
  app.get('/api/estimates/:id/report/pdf', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateQuery(z.object({
    includeLineItems: z.string().optional(),
    includeDepreciation: z.string().optional(),
    includeCoverage: z.string().optional(),
    companyName: z.string().optional(),
    format: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get HTML report preview
  app.get('/api/estimates/:id/report/html', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateQuery(z.object({
    includeLineItems: z.string().optional(),
    includeDepreciation: z.string().optional(),
    includeCoverage: z.string().optional(),
    companyName: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const options = {
      includeLineItemDetails: req.query.includeLineItems !== 'false',
      includeDepreciation: req.query.includeDepreciation !== 'false',
      includeCoverageSummary: req.query.includeCoverage !== 'false',
      companyName: req.query.companyName as string,
    };
    const html = await generatePdfReport(req.params.id, options);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }));

  // Generate ESX JSON export
  app.get('/api/estimates/:id/export/esx', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
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
        return next(errors.notFound('Estimate'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  // Generate ESX XML export
  app.get('/api/estimates/:id/export/esx-xml', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateQuery(z.object({
    dateOfLoss: z.string().optional(),
    insuredName: z.string().optional(),
    adjusterName: z.string().optional(),
    priceListDate: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Generate CSV export
  app.get('/api/estimates/:id/export/csv', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const csv = await generateCsvExport(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${req.params.id}.csv"`);
    res.send(csv);
  }));

  // Generate ESX ZIP archive (Tier A - standards-compliant, with sketch PDF)
  // This is the primary export format for Xactimate import
  app.get('/api/estimates/:id/export/esx-zip', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateQuery(z.object({
    includeSketch: z.string().optional(),
    includePhotos: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
    const includeSketch = req.query.includeSketch !== 'false';
    const includePhotos = req.query.includePhotos === 'true';

    const esxZip = await generateEsxZipArchive(req.params.id, {
      includeSketchPdf: includeSketch,
      includePhotos,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${req.params.id}.esx"`);
    res.setHeader('Content-Length', esxZip.length);
    res.send(esxZip);
  }));

  // ============================================
  // ESTIMATE HIERARCHY ROUTES
  // Structure -> Area -> Zone -> Line Items
  // ============================================

  // Get full estimate hierarchy
  app.get('/api/estimates/:id/hierarchy', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const hierarchy = await getEstimateHierarchy(req.params.id);
    res.json(hierarchy);
  }));

  // Initialize estimate hierarchy with defaults
  app.post('/api/estimates/:id/hierarchy/initialize', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    structureName: z.string().optional(),
    includeInterior: z.boolean().optional(),
    includeExterior: z.boolean().optional(),
    includeRoofing: z.boolean().optional(),
  })), asyncHandler(async (req, res, next) => {
    const { structureName, includeInterior, includeExterior, includeRoofing } = req.body;
    const hierarchy = await initializeEstimateHierarchy(req.params.id, {
      structureName,
      includeInterior,
      includeExterior,
      includeRoofing,
    });
    res.status(201).json(hierarchy);
  }));

  // ============================================
  // SKETCH GEOMETRY ROUTES (Voice-First)
  // ============================================

  // Get sketch geometry for an estimate
  app.get('/api/estimates/:id/sketch', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    try {
      const sketch = await getEstimateSketch(req.params.id);
      res.json(sketch);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        return next(errors.notFound('Sketch'));
      } else {
        return next(errors.internal(message));
      }
    }
  }));

  // Update sketch geometry for an estimate
  app.put('/api/estimates/:id/sketch', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(sketchUpdateSchema), asyncHandler(async (req, res, next) => {
    const sketch = await updateEstimateSketch(req.params.id, req.body);
    res.json(sketch);
  }));

  // Validate sketch geometry for export
  app.post('/api/estimates/:id/sketch/validate', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const validation = await validateEstimateSketchForExport(req.params.id);
    res.json(validation);
  }));

  // ============================================
  // ZONE CONNECTIONS API
  // ============================================

  /**
   * POST /api/estimates/:id/sketch/connections
   * Create a new zone connection
   */
  app.post('/api/estimates/:id/sketch/connections', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(sketchConnectionCreateSchema), asyncHandler(async (req, res, next) => {
    const estimateId = req.params.id;
    const { fromZoneId, toZoneId, connectionType, openingId } = req.body;

    if (!fromZoneId || !toZoneId || !connectionType) {
      return next(errors.badRequest('fromZoneId, toZoneId, and connectionType are required'));
    }

    const validTypes = ['door', 'opening', 'shared_wall', 'hallway', 'stairway'];
    if (!validTypes.includes(connectionType)) {
      return next(errors.badRequest(`connectionType must be one of: ${validTypes.join(', ')}`));
    }

    // Verify estimate exists and is not locked
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id, is_locked')
      .eq('id', estimateId)
      .maybeSingle();

    if (estimateError || !estimate) {
      return next(errors.notFound('Estimate'));
    }

    if (estimate.is_locked) {
      return next(errors.badRequest('Cannot modify a locked estimate'));
    }

    // Verify zones exist and belong to this estimate
    const { data: zones, error: zonesError } = await supabaseAdmin
      .from('estimate_zones')
      .select('id, estimate_areas!inner(estimate_structures!inner(estimate_id))')
      .in('id', [fromZoneId, toZoneId]);

    if (zonesError || !zones || zones.length !== 2) {
      return next(errors.badRequest('Invalid zone IDs or zones do not belong to this estimate'));
    }

    // Create connection
    const { data: connection, error: insertError } = await supabaseAdmin
      .from('zone_connections')
      .insert({
        estimate_id: estimateId,
        from_zone_id: fromZoneId,
        to_zone_id: toZoneId,
        connection_type: connectionType,
        opening_id: openingId || null,
      })
      .select('*')
      .single();

    if (insertError || !connection) {
      return next(errors.internal(insertError?.message || 'Failed to create connection'));
    }

    res.json(connection);
  }));

  /**
   * PUT /api/estimates/:id/sketch/connections/:connId
   * Update an existing zone connection
   */
  app.put('/api/estimates/:id/sketch/connections/:connId', requireAuth, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), connId: z.string().uuid() })), validateBody(sketchConnectionUpdateSchema), asyncHandler(async (req, res, next) => {
    const estimateId = req.params.id;
    const connId = req.params.connId;
    const { connectionType, openingId } = req.body;

    // Verify estimate exists and is not locked
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id, is_locked')
      .eq('id', estimateId)
      .maybeSingle();

    if (estimateError || !estimate) {
      return next(errors.notFound('Estimate'));
    }

    if (estimate.is_locked) {
      return next(errors.badRequest('Cannot modify a locked estimate'));
    }

    // Verify connection exists and belongs to this estimate
    const { data: existingConn, error: connError } = await supabaseAdmin
      .from('zone_connections')
      .select('*')
      .eq('id', connId)
      .eq('estimate_id', estimateId)
      .maybeSingle();

    if (connError || !existingConn) {
      return next(errors.notFound('Connection'));
    }

    // Update connection
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (connectionType) {
      const validTypes = ['door', 'opening', 'shared_wall', 'hallway', 'stairway'];
      if (!validTypes.includes(connectionType)) {
        return next(errors.badRequest(`connectionType must be one of: ${validTypes.join(', ')}`));
      }
      updateData.connection_type = connectionType;
    }

    if (openingId !== undefined) {
      updateData.opening_id = openingId || null;
    }

    const { data: updatedConn, error: updateError } = await supabaseAdmin
      .from('zone_connections')
      .update(updateData)
      .eq('id', connId)
      .select('*')
      .single();

    if (updateError || !updatedConn) {
      return next(errors.internal(updateError?.message || 'Failed to update connection'));
    }

    res.json(updatedConn);
  }));

  /**
   * DELETE /api/estimates/:id/sketch/connections/:connId
   * Delete a zone connection
   */
  app.delete('/api/estimates/:id/sketch/connections/:connId', requireAuth, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), connId: z.string().uuid() })), asyncHandler(async (req, res, next) => {
    const estimateId = req.params.id;
    const connId = req.params.connId;

    // Verify estimate exists and is not locked
    const { data: estimate, error: estimateError } = await supabaseAdmin
      .from('estimates')
      .select('id, is_locked')
      .eq('id', estimateId)
      .maybeSingle();

    if (estimateError || !estimate) {
      return next(errors.notFound('Estimate'));
    }

    if (estimate.is_locked) {
      return next(errors.badRequest('Cannot modify a locked estimate'));
    }

    // Verify connection exists and belongs to this estimate
    const { data: existingConn, error: connError } = await supabaseAdmin
      .from('zone_connections')
      .select('id')
      .eq('id', connId)
      .eq('estimate_id', estimateId)
      .maybeSingle();

    if (connError || !existingConn) {
      return next(errors.notFound('Connection'));
    }

    // Delete connection
    const { error: deleteError } = await supabaseAdmin
      .from('zone_connections')
      .delete()
      .eq('id', connId);

    if (deleteError) {
      return next(errors.internal(deleteError.message));
    }

    res.json({ success: true });
  }));

  /**
   * GET /api/estimates/:id/sketch/connections
   * Get all zone connections for an estimate
   */
  app.get('/api/estimates/:id/sketch/connections', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const estimateId = req.params.id;

    const { data: connections, error } = await supabaseAdmin
      .from('zone_connections')
      .select('*')
      .eq('estimate_id', estimateId)
      .order('created_at', { ascending: true });

    if (error) {
      return next(errors.internal(error.message));
    }

    res.json(connections || []);
  }));

  // Recalculate estimate totals
  app.post('/api/estimates/:id/recalculate', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    await assertEstimateNotLocked(req.params.id);

    const { error } = await supabaseAdmin.rpc('recalculate_estimate_totals', {
      estimate_id: req.params.id
    });

    if (error) throw error;

    const estimate = await getEstimate(req.params.id, req.organizationId!);
    res.json(estimate);
  }));

  // ============================================
  // STRUCTURE ROUTES
  // ============================================

  // Create structure
  app.post('/api/estimates/:id/structures', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(structureCreateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    await assertEstimateNotLocked(req.params.id);

    const structure = await createStructure({
      estimateId: req.params.id,
      ...req.body,
    });
    res.status(201).json(structure);
  }));

  // Get structure
  app.get('/api/structures/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const structure = await getStructure(req.params.id);
    if (!structure) {
      return next(errors.notFound('Structure'));
    }
    res.json(structure);
  }));

  // Update structure
  app.put('/api/structures/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(structureUpdateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromStructure(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const structure = await updateStructure(req.params.id, req.body);
    if (!structure) {
      return next(errors.notFound('Structure'));
    }
    res.json(structure);
  }));

  // Delete structure
  app.delete('/api/structures/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromStructure(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const success = await deleteStructure(req.params.id);
    if (!success) {
      return next(errors.notFound('Structure'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // AREA ROUTES
  // ============================================

  // Create area in structure
  app.post('/api/structures/:id/areas', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(areaCreateSchema), asyncHandler(async (req, res, next) => {
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
  }));

  // Get area
  app.get('/api/areas/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const area = await getArea(req.params.id);
    if (!area) {
      return next(errors.notFound('Area'));
    }
    res.json(area);
  }));

  // Update area
  app.put('/api/areas/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(areaUpdateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromArea(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const area = await updateArea(req.params.id, req.body);
    if (!area) {
      return next(errors.notFound('Area'));
    }
    res.json(area);
  }));

  // Delete area
  app.delete('/api/areas/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromArea(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const success = await deleteArea(req.params.id);
    if (!success) {
      return next(errors.notFound('Area'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // ZONE ROUTES
  // ============================================

  // Create zone in area
  app.post('/api/areas/:id/zones', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(zoneCreateSchema), asyncHandler(async (req, res, next) => {
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
  }));

  // Get zone
  app.get('/api/zones/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const zone = await getZone(req.params.id);
    if (!zone) {
      return next(errors.notFound('Zone'));
    }
    res.json(zone);
  }));

  // Get zone with children (missing walls, subrooms, line items)
  app.get('/api/zones/:id/full', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const zone = await getZoneWithChildren(req.params.id);
    if (!zone) {
      return next(errors.notFound('Zone'));
    }
    res.json(zone);
  }));

  // Update zone
  app.put('/api/zones/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(zoneUpdateSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromZone(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const zone = await updateZone(req.params.id, req.body);
    if (!zone) {
      return next(errors.notFound('Zone'));
    }
    res.json(zone);
  }));

  // Recalculate zone dimensions
  app.post('/api/zones/:id/calculate-dimensions', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromZone(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const dimensions = await recalculateZoneDimensions(req.params.id);
    res.json({ dimensions });
  }));

  // Delete zone
  app.delete('/api/zones/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromZone(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const success = await deleteZone(req.params.id);
    if (!success) {
      return next(errors.notFound('Zone'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // MISSING WALL ROUTES
  // ============================================

  // Add missing wall to zone
  app.post('/api/zones/:id/missing-walls', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(missingWallCreateSchema), asyncHandler(async (req, res, next) => {
    const { widthFt, heightFt } = req.body;
    if (!widthFt || !heightFt) {
      return next(errors.badRequest('widthFt and heightFt required'));
    }
    const wall = await createMissingWall({
      zoneId: req.params.id,
      ...req.body,
    });
    res.status(201).json(wall);
  }));

  // Get missing wall
  app.get('/api/missing-walls/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const wall = await getMissingWall(req.params.id);
    if (!wall) {
      return next(errors.notFound('Missing wall'));
    }
    res.json(wall);
  }));

  // Update missing wall
  app.put('/api/missing-walls/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(missingWallUpdateSchema), asyncHandler(async (req, res, next) => {
    const wall = await updateMissingWall(req.params.id, req.body);
    if (!wall) {
      return next(errors.notFound('Missing wall'));
    }
    res.json(wall);
  }));

  // Delete missing wall
  app.delete('/api/missing-walls/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const success = await deleteMissingWall(req.params.id);
    if (!success) {
      return next(errors.notFound('Missing wall'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // SUBROOM ROUTES
  // ============================================

  // Add subroom to zone
  app.post('/api/zones/:id/subrooms', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(subroomCreateSchema), asyncHandler(async (req, res, next) => {
    const { name, lengthFt, widthFt } = req.body;
    if (!name || !lengthFt || !widthFt) {
      return next(errors.badRequest('name, lengthFt, and widthFt required'));
    }
    const subroom = await createSubroom({
      zoneId: req.params.id,
      ...req.body,
    });
    res.status(201).json(subroom);
  }));

  // Delete subroom
  app.delete('/api/subrooms/:id', requireAuth, asyncHandler(async (req, res, next) => {
    const success = await deleteSubroom(req.params.id);
    if (!success) {
      return next(errors.notFound('Subroom'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // ZONE LINE ITEM ROUTES
  // ============================================

  // Get zone line items
  app.get('/api/zones/:id/line-items', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('estimate_line_items')
      .select('*')
      .eq('zone_id', req.params.id)
      .order('sort_order');

    if (error) throw error;

    res.json(data);
  }));

  // Add line item to zone
  app.post('/api/zones/:id/line-items', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(addLineItemToZoneSchema), asyncHandler(async (req, res, next) => {
    // Check if estimate is locked
    const estimateId = await getEstimateIdFromZone(req.params.id);
    if (estimateId) {
      await assertEstimateNotLocked(estimateId);
    }

    const { lineItemCode, quantity } = req.body;
    if (!lineItemCode || !quantity) {
      return next(errors.badRequest('lineItemCode and quantity required'));
    }
    await addLineItemToZone(req.params.id, req.body);
    const zone = await getZoneWithChildren(req.params.id);
    res.status(201).json(zone);
  }));

  // Delete line item from zone
  app.delete('/api/line-items/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('Line item'));
    }

    res.json({ success: true });
  }));

  // Update line item
  app.put('/api/line-items/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(updateLineItemSchema), asyncHandler(async (req, res, next) => {
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
          return next(errors.notFound('Line item'));
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
        return next(errors.notFound('Line item'));
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
  }));

  // Add line item from zone dimension (auto-calculate quantity)
  app.post('/api/zones/:id/line-items/from-dimension', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(lineItemFromDimensionSchema), asyncHandler(async (req, res, next) => {
    const { lineItemCode, dimensionKey, unitPrice, taxRate, depreciationPct, isRecoverable, notes } = req.body;
    if (!lineItemCode || !dimensionKey) {
      return next(errors.badRequest('lineItemCode and dimensionKey required'));
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
  }));

  // ============================================
  // SUBROOM ROUTES
  // ============================================

  // Get subroom
  app.get('/api/subrooms/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const subroom = await getSubroom(req.params.id);
    if (!subroom) {
      return next(errors.notFound('Subroom'));
    }
    res.json(subroom);
  }));

  // Update subroom
  app.put('/api/subrooms/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(subroomUpdateSchema), asyncHandler(async (req, res, next) => {
    const subroom = await updateSubroom(req.params.id, req.body);
    if (!subroom) {
      return next(errors.notFound('Subroom'));
    }
    res.json(subroom);
  }));

  // Delete subroom
  app.delete('/api/subrooms/:id', requireAuth, asyncHandler(async (req, res, next) => {
    const success = await deleteSubroom(req.params.id);
    if (!success) {
      return next(errors.notFound('Subroom'));
    }
    res.json({ success: true });
  }));

  // ============================================
  // COVERAGE ROUTES
  // ============================================

  // Get coverages for an estimate
  app.get('/api/estimates/:id/coverages', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const coverages = await getCoverages(req.params.id);
    res.json(coverages);
  }));

  // Create coverage for an estimate
  app.post('/api/estimates/:id/coverages', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(coverageCreateSchema), asyncHandler(async (req, res, next) => {
    const { coverageType, coverageName, policyLimit, deductible } = req.body;
    if (!coverageType || !coverageName) {
      return next(errors.badRequest('coverageType and coverageName required'));
    }
    const coverage = await createCoverage({
      estimateId: req.params.id,
      coverageType,
      coverageName,
      policyLimit,
      deductible,
    });
    res.status(201).json(coverage);
  }));

  // Get line items grouped by coverage
  app.get('/api/estimates/:id/line-items/by-coverage', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const grouped = await getLineItemsByCoverage(req.params.id);
    res.json(grouped);
  }));

  // Update line item coverage assignment
  app.put('/api/line-items/:id/coverage', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(lineItemCoverageUpdateSchema), asyncHandler(async (req, res, next) => {
    const { coverageId } = req.body;
    await updateLineItemCoverage(req.params.id, coverageId || null);
    res.json({ success: true });
  }));

  // ============================================
  // ORGANIZATION (TENANT) ROUTES
  // ============================================

  // Get current user's organizations
  app.get('/api/organizations/mine', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const orgs = await getUserOrganizations(req.user!.id);
    res.json({
      organizations: orgs,
      currentOrganizationId: req.organizationId
    });
  }));

  // Switch current organization
  app.post('/api/organizations/switch', requireAuth, apiRateLimiter, validateBody(organizationSwitchSchema), asyncHandler(async (req, res, next) => {
    const { organizationId } = req.body;
    if (!organizationId) {
      return next(errors.badRequest('organizationId required'));
    }
    const success = await switchOrganization(req.user!.id, organizationId);
    if (!success) {
      return next(errors.forbidden('Not a member of this organization'));
    }
    res.json({ success: true, currentOrganizationId: organizationId });
  }));

  // Create new organization
  app.post('/api/organizations', requireAuth, apiRateLimiter, validateBody(organizationCreateSchema), asyncHandler(async (req, res, next) => {
    const org = await createOrganization(req.body, req.user!.id);
    res.status(201).json(org);
  }));

  // List all organizations (super admin only)
  app.get('/api/admin/organizations', requireAuth, requireSuperAdmin, apiRateLimiter, validateQuery(paginationQuerySchema.merge(z.object({
    status: z.string().optional(),
    type: z.string().optional(),
  }).passthrough())), asyncHandler(async (req, res, next) => {
    const { status, type, limit, offset } = req.query;
    const result = await listOrganizations({
      status: status as string,
      type: type as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined
    });
    res.json(result);
  }));

  // Get current organization details
  app.get('/api/organizations/current', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const org = await getOrganization(req.organizationId!);
    if (!org) {
      return next(errors.notFound('Organization'));
    }
    res.json(org);
  }));

  // Update current organization
  app.put('/api/organizations/current', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), apiRateLimiter, validateBody(organizationUpdateSchema), asyncHandler(async (req, res, next) => {
    const org = await updateOrganization(req.organizationId!, req.body);
    if (!org) {
      return next(errors.notFound('Organization'));
    }
    res.json(org);
  }));

  // Get organization members
  app.get('/api/organizations/current/members', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const members = await getOrganizationMembers(req.organizationId!);
    res.json(members);
  }));

  // Add member to organization
  app.post('/api/organizations/current/members', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), apiRateLimiter, validateBody(organizationAddMemberSchema), asyncHandler(async (req, res, next) => {
    const { userId, role } = req.body;
    if (!userId) {
      return next(errors.badRequest('userId required'));
    }
    await addOrganizationMember(req.organizationId!, userId, role || 'member');
    res.status(201).json({ success: true });
  }));

  // Remove member from organization
  app.delete('/api/organizations/current/members/:userId', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), apiRateLimiter, validateParams(z.object({ userId: z.string().uuid() })), asyncHandler(async (req, res, next) => {
    await removeOrganizationMember(req.organizationId!, req.params.userId);
    res.json({ success: true });
  }));

  // ============================================
  // CLAIMS ROUTES
  // ============================================

  // Create new claim
  app.post('/api/claims', requireAuth, requireOrganization, apiRateLimiter, validateBody(claimCreateSchema), asyncHandler(async (req, res, next) => {
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
  }));

  // List claims for organization
  app.get('/api/claims', requireAuth, requireOrganization, apiRateLimiter, validateQuery(paginationQuerySchema.merge(statusQuerySchema)), asyncHandler(async (req, res, next) => {
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
  }));

  // Get claim statistics
  app.get('/api/claims/stats', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const stats = await getClaimStats(req.organizationId!);
    res.json(stats);
  }));

  // Get claims for map display
  app.get('/api/claims/map', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    adjuster_id: z.string().uuid().optional(),
    status: z.string().optional(),
    loss_type: z.string().optional(),
    my_claims: z.string().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get map geocoding statistics
  app.get('/api/claims/map/stats', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const stats = await getMapStats(req.organizationId!);
    res.json(stats);
  }));

  // Trigger geocoding for pending claims
  app.post('/api/claims/geocode-pending', requireAuth, requireOrganization, apiRateLimiter, validateBody(z.object({
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  })), asyncHandler(async (req, res, next) => {
    const { limit } = req.body;
    const count = await geocodePendingClaims(req.organizationId!, limit || 100);
    res.json({ queued: count, message: `Queued ${count} claims for geocoding` });
  }));

  // Get single claim
  app.get('/api/claims/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const claim = await getClaim(req.params.id, req.organizationId!);
    if (!claim) {
      return next(errors.notFound('Claim'));
    }
    res.json(claim);
  }));

  // Update claim
  app.put('/api/claims/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(claimUpdateSchema), asyncHandler(async (req, res, next) => {
    const claim = await updateClaim(req.params.id, req.organizationId!, req.body);
    if (!claim) {
      return next(errors.notFound('Claim'));
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
  }));

  // Purge ALL claims - permanently delete all claims and related data
  // NOTE: Must be defined BEFORE /api/claims/:id to avoid :id matching "purge-all"
  app.delete('/api/claims/purge-all', (req, res, next) => {
    log.debug({ 
      isAuthenticated: req.isAuthenticated(), 
      userId: req.user?.id, 
      orgId: req.organizationId, 
      memberRole: req.membershipRole 
    }, '[Purge] Request received');
    next();
  }, requireAuth, requireOrganization, requireOrgRole('owner'), apiRateLimiter, asyncHandler(async (req, res, next) => {
    log.info({ orgId: req.organizationId }, '[Purge] Passed all auth checks, deleting claims');
    const result = await purgeAllClaims(req.organizationId!);
    res.json({
      success: true,
      message: `Permanently deleted ${result.claimsDeleted} claims and ${result.relatedRecordsDeleted} related records`,
      ...result
    });
  }));

  // Delete claim
  app.delete('/api/claims/:id', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const success = await deleteClaim(req.params.id, req.organizationId!);
    if (!success) {
      return next(errors.notFound('Claim'));
    }
    res.json({ success: true });
  }));

  // Save rooms to claim with full hierarchy (structures → rooms → damage zones)
  app.post('/api/claims/:id/rooms', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(claimRoomsSaveSchema), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('Claim'));
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
  }));

  // Get claim rooms with hierarchy (structures → rooms → damage zones)
  app.get('/api/claims/:id/rooms', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { getClaimHierarchy } = await import('./services/rooms');
    
    // Verify claim exists and belongs to organization
    const { data: claimCheck, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('id')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId)
      .single();
    if (claimError || !claimCheck) {
      return next(errors.notFound('Claim'));
    }

    const result = await getClaimHierarchy(req.params.id);
    res.json(result);
  }));

  // Delete all rooms and structures for a claim (for deleting saved sketches)
  app.delete('/api/claims/:id/rooms', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { deleteRoomsByClaimId, deleteStructuresByClaimId } = await import('./services/rooms');

    // Verify claim exists and belongs to organization
    const { data: claimCheck, error: claimError } = await supabaseAdmin
      .from('claims')
      .select('id')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId)
      .single();
    if (claimError || !claimCheck) {
      return next(errors.notFound('Claim'));
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
  }));

  // ============================================
  // CLAIM SCOPE ITEMS (uses estimate infrastructure)
  // ============================================

  // Get scope items for a claim
  app.get('/api/claims/:id/scope-items', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const items = await getScopeItemsForClaim(req.params.id);
    res.json(items);
  }));

  // Add scope item to claim
  app.post('/api/claims/:id/scope-items', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(scopeItemCreateSchema), asyncHandler(async (req, res, next) => {
    const { lineItemCode, description, category, quantity, unit, unitPrice, roomName, notes } = req.body;
    
    if (!lineItemCode || !description || !quantity || !unit || unitPrice === undefined) {
      return next(errors.badRequest('Missing required fields: lineItemCode, description, quantity, unit, unitPrice'));
    }

    const item = await addScopeItemToClaim(
      req.params.id,
      req.organizationId!,
      { lineItemCode, description, category, quantity, unit, unitPrice, roomName, notes }
    );
    res.status(201).json(item);
  }));

  // Update scope item
  app.patch('/api/scope-items/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(scopeItemUpdateSchema), asyncHandler(async (req, res, next) => {
    const { quantity, notes } = req.body;
    const item = await updateScopeItem(req.params.id, { quantity, notes });
    if (!item) {
      return next(errors.notFound('Scope item'));
    }
    res.json(item);
  }));

  // Delete scope item
  app.delete('/api/scope-items/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const success = await deleteScopeItem(req.params.id);
    if (!success) {
      return next(errors.notFound('Scope item'));
    }
    res.json({ success: true });
  }));

  // Get claim documents
  app.get('/api/claims/:id/documents', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const documents = await getClaimDocuments(req.params.id, req.organizationId!);
    res.json(documents);
  }));

  // Get comprehensive policy form extractions for a claim
  app.get('/api/claims/:id/policy-extractions', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('policy_form_extractions')
      .select('*')
      .eq('claim_id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  }));

  // Get a specific policy extraction by ID
  app.get('/api/policy-extractions/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('policy_form_extractions')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .single();

    if (error) throw error;

    if (!data) {
      return next(errors.notFound('Policy extraction'));
    }

    res.json(data);
  }));

  // Get comprehensive endorsement extractions for a claim
  app.get('/api/claims/:id/endorsement-extractions', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('*')
      .eq('claim_id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  }));

  // Get a specific endorsement extraction by ID
  app.get('/api/endorsement-extractions/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('endorsement_extractions')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .single();

    if (error) throw error;

    if (!data) {
      return next(errors.notFound('Endorsement extraction'));
    }

    res.json(data);
  }));

  // ============================================
  // INSPECTION INTELLIGENCE ROUTES
  // ============================================

  /**
   * GET /api/inspection-intelligence/:peril
   * Get inspection intelligence for a specific peril.
   * Returns deterministic inspection rules, tips, and escalation triggers.
   */
  app.get('/api/inspection-intelligence/:peril', requireAuth, apiRateLimiter, validateParams(z.object({ peril: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { peril } = req.params;
    const intelligence = getInspectionIntelligenceForPeril(peril);
    res.json(intelligence);
  }));

  /**
   * GET /api/inspection-intelligence/:peril/tips
   * Get quick inspection tips for a specific peril (for UI micro-hints).
   */
  app.get('/api/inspection-intelligence/:peril/tips', requireAuth, apiRateLimiter, validateParams(z.object({ peril: z.string().min(1) })), validateQuery(z.object({ limit: z.coerce.number().int().min(1).max(100).optional() })), asyncHandler(async (req, res, next) => {
    const { peril } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;
    const tips = getQuickInspectionTips(peril, limit);
    res.json({ tips });
  }));

  /**
   * GET /api/claims/:id/inspection-intelligence
   * Get inspection intelligence for a claim based on its peril.
   */
  app.get('/api/claims/:id/inspection-intelligence', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Get the claim's peril
    const { data, error } = await supabaseAdmin
      .from('claims')
      .select('primary_peril, secondary_perils')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('Claim'));
      }
      throw error;
    }

    const peril = data.primary_peril || 'other';
    const secondaryPerils = Array.isArray(data.secondary_perils) ? data.secondary_perils : [];

    // Build inspection intelligence
    const intelligence = buildInspectionIntelligence(peril, secondaryPerils);
    res.json(intelligence);
  }));

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
  app.get('/api/claims/:id/effective-policy', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
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
  }));

  // ============================================
  // CLAIM BRIEFING ROUTES
  // ============================================

  /**
   * GET /api/claims/:id/briefing
   * Get the latest AI-generated briefing for a claim.
   */
  app.get('/api/claims/:id/briefing', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const briefing = await getClaimBriefing(req.params.id, req.organizationId!);
    if (!briefing) {
      return next(errors.notFound('Briefing'));
    }
    res.json(briefing);
  }));

  /**
   * POST /api/claims/:id/briefing/generate
   * Generate a new AI briefing for a claim.
   * Query params:
   * - force: boolean - Force regeneration even if cached
   */
  app.post('/api/claims/:id/briefing/generate', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const forceRegenerate = req.query.force === 'true';
    const result = await generateClaimBriefing(
      req.params.id,
      req.organizationId!,
      forceRegenerate
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to generate briefing'));
    }

    res.json({
      briefing: result.briefing,
      briefingId: result.briefingId,
      sourceHash: result.sourceHash,
      cached: result.cached,
      model: result.model,
      tokenUsage: result.tokenUsage,
    });
  }));

  /**
   * GET /api/claims/:id/briefing/status
   * Check if the briefing is stale (claim data has changed).
   */
  app.get('/api/claims/:id/briefing/status', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const briefing = await getClaimBriefing(req.params.id, req.organizationId!);
    const isStale = await isBriefingStale(req.params.id, req.organizationId!);

    res.json({
      hasBriefing: !!briefing,
      isStale,
      lastUpdated: briefing?.updatedAt || null,
      model: briefing?.model || null,
    });
  }));

  /**
   * DELETE /api/claims/:id/briefing
   * Delete all briefings for a claim.
   */
  app.delete('/api/claims/:id/briefing', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const deletedCount = await deleteClaimBriefings(req.params.id, req.organizationId!);
    res.json({ deleted: deletedCount });
  }));

  // ============================================
  // UNIFIED CLAIM CONTEXT & COVERAGE ANALYSIS
  // ============================================

  /**
   * GET /api/claims/:id/context
   * Get the unified claim context with all FNOL, Policy, and Endorsement data merged.
   * This is the single source of truth for claim data.
   */
  app.get('/api/claims/:id/context', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { buildUnifiedClaimContext } = await import('./services/unifiedClaimContextService');
    const context = await buildUnifiedClaimContext(req.params.id, req.organizationId!);

    if (!context) {
      return next(errors.notFound('Claim or context'));
    }

    res.json(context);
  }));

  /**
   * GET /api/claims/:id/coverage-analysis
   * Get comprehensive coverage analysis including alerts, depreciation, and recommendations.
   */
  app.get('/api/claims/:id/coverage-analysis', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { analyzeCoverage } = await import('./services/coverageAnalysisService');
    const analysis = await analyzeCoverage(req.params.id, req.organizationId!);

    if (!analysis) {
      return next(errors.notFound('Claim or analysis'));
    }

    res.json(analysis);
  }));

  /**
   * GET /api/claims/:id/coverage-analysis/summary
   * Get a quick summary of coverage analysis for UI display.
   */
  app.get('/api/claims/:id/coverage-analysis/summary', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { getCoverageAnalysisSummary } = await import('./services/coverageAnalysisService');
    const summary = await getCoverageAnalysisSummary(req.params.id, req.organizationId!);

    if (!summary) {
      return next(errors.notFound('Claim or summary'));
    }

    res.json(summary);
  }));

  /**
   * POST /api/claims/:id/briefing/generate-enhanced
   * Generate an enhanced AI briefing using UnifiedClaimContext.
   * NOTE: The main generateClaimBriefing now uses enhanced context by default.
   */
  app.post('/api/claims/:id/briefing/generate-enhanced', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { generateClaimBriefing } = await import('./services/claimBriefingService');
    const forceRegenerate = req.query.force === 'true';

    const result = await generateClaimBriefing(
      req.params.id,
      req.organizationId!,
      forceRegenerate
    );

    if (!result.success) {
      return next(errors.internal(result.error || 'Failed to generate briefing'));
    }

    res.json(result);
  }));

  /**
   * POST /api/claims/:id/workflow/generate-enhanced
   * Generate an enhanced inspection workflow using UnifiedClaimContext.
   * NOTE: The main generateInspectionWorkflow now uses enhanced context by default.
   */
  app.post('/api/claims/:id/workflow/generate-enhanced', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { generateInspectionWorkflow } = await import('./services/inspectionWorkflowService');
    const forceRegenerate = req.query.force === 'true';

    const result = await generateInspectionWorkflow(
      req.params.id,
      req.organizationId!,
      undefined, // userId
      forceRegenerate
    );

    if (!result.success) {
      return next(errors.internal(result.error || 'Failed to generate workflow'));
    }

    res.json(result);
  }));

  // ============================================
  // CLAIM CHECKLIST ROUTES
  // ============================================

  /**
   * GET /api/claims/:id/checklist
   * Get the dynamic checklist for a claim, auto-generating if needed
   */
  app.get('/api/claims/:id/checklist', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const claimId = req.params.id;
    const organizationId = req.organizationId!;

    log.debug({ claimId, organizationId }, '[Checklist] GET request');

    let { checklist, items } = await getChecklistForClaim(claimId);

    if (!checklist) {
      const { data: claim, error: claimError } = await supabaseAdmin
        .from('claims')
        .select('id, primary_peril, total_rcv, metadata')
        .eq('id', claimId)
        .eq('organization_id', organizationId)
        .single();

      if (claimError) {
        logError(log, claimError, '[Checklist] Claim lookup error');
      }

      if (!claim) {
        log.warn({ claimId, organizationId }, '[Checklist] Claim not found');
        return next(errors.notFound('Claim'));
      }

      const peril = normalizePeril(claim.primary_peril);
      const severity = inferSeverityFromClaim({
        reserveAmount: claim.total_rcv ? parseFloat(claim.total_rcv) : null,
        metadata: claim.metadata as Record<string, any> | null,
      });

      const result = await generateChecklistForClaim(
        claimId,
        organizationId,
        peril,
        severity,
        { userId: (req.user as any)?.id }
      );

      if (!result.success) {
        return next(errors.internal(result.error || 'Failed to generate checklist'));
      }

      const generated = await getChecklistForClaim(claimId);
      checklist = generated.checklist;
      items = generated.items;
    }

    res.json({ checklist, items });
  }));

  /**
   * POST /api/claims/:id/checklist/generate
   * Force generate or regenerate a checklist for a claim
   */
  app.post('/api/claims/:id/checklist/generate', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), validateBody(checklistGenerateSchema), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('Claim'));
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

    const result = await generateChecklistForClaim(
      claimId,
      organizationId,
      peril,
      severity,
      { userId: (req.user as any)?.id }
    );

    if (!result.success) {
      return next(errors.internal(result.error || 'Failed to generate checklist'));
    }

    const { checklist, items } = await getChecklistForClaim(claimId);
    res.json({ checklist, items, regenerated: true });
  }));

  /**
   * PUT /api/checklists/items/:itemId
   * Update a checklist item status
   */
  app.put('/api/checklists/items/:itemId', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ itemId: z.string().uuid() })), validateBody(checklistItemUpdateSchema), asyncHandler(async (req, res, next) => {
    const { status, notes, skippedReason } = req.body;

    if (!status) {
      return next(errors.badRequest('Status is required'));
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'blocked', 'na'];
    if (!validStatuses.includes(status)) {
      return next(errors.badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`));
    }

    const result = await updateChecklistItemStatus(
      req.params.itemId,
      status,
      req.user?.id,
      notes,
      skippedReason
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to update checklist item'));
    }

    res.json({ success: true });
  }));

  /**
   * POST /api/checklists/:checklistId/items
   * Add a custom item to a checklist
   */
  app.post('/api/checklists/:checklistId/items', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ checklistId: z.string().uuid() })), validateBody(checklistItemCreateSchema), asyncHandler(async (req, res, next) => {
    const { title, category, description, required, priority } = req.body;

    if (!title || !category) {
      return next(errors.badRequest('Title and category are required'));
    }

    const validCategories = Object.values(ChecklistCategory);
    if (!validCategories.includes(category)) {
      return next(errors.badRequest(`Invalid category. Must be one of: ${validCategories.join(', ')}`));
    }

    const result = await addCustomChecklistItem(
      req.params.checklistId,
      title,
      category as ChecklistCategory,
      { description, required, priority }
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to add checklist item'));
    }

    res.json({ success: true, item: result.item });
  }));

  // ============================================
  // INSPECTION WORKFLOW ROUTES
  // ============================================

  /**
   * POST /api/claims/:id/workflow/generate
   * Generate a new inspection workflow for a claim.
   * Uses FNOL, policy, endorsements, briefing, peril rules, and optional wizard context.
   */
  app.post('/api/claims/:id/workflow/generate', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { forceRegenerate, wizardContext } = req.body;
    const result = await generateInspectionWorkflow(
      req.params.id,
      req.organizationId!,
      req.user?.id,
      forceRegenerate === true,
      wizardContext
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to generate workflow'));
    }

    res.json({
      workflow: result.workflow,
      workflowId: result.workflowId,
      version: result.version,
      model: result.model,
      tokenUsage: result.tokenUsage,
    });
  }));

  /**
   * GET /api/claims/:id/workflow
   * Get the current inspection workflow for a claim with all steps and rooms.
   */
  app.get('/api/claims/:id/workflow', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const workflow = await getClaimWorkflow(req.params.id, req.organizationId!);

    if (!workflow) {
      return next(errors.notFound('Workflow'));
    }

    res.json(workflow);
  }));

  /**
   * GET /api/claims/:id/workflow/status
   * Check if the workflow should be regenerated due to claim changes.
   */
  app.get('/api/claims/:id/workflow/status', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const result = await shouldRegenerateWorkflow(req.params.id, req.organizationId!);
    res.json(result);
  }));

  /**
   * POST /api/claims/:id/workflow/regenerate
   * Regenerate a workflow due to claim changes.
   * Archives the previous workflow and creates a new version.
   */
  app.post('/api/claims/:id/workflow/regenerate', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowRegenerateSchema), asyncHandler(async (req, res, next) => {
    const { reason } = req.body;
    if (!reason) {
      return next(errors.badRequest('reason is required for regeneration'));
    }

    try {
      const result = await regenerateWorkflow(
        req.params.id,
        req.organizationId!,
        reason,
        req.user?.id
      );

      if (!result.success) {
        return next(errors.badRequest(result.error || 'Failed to regenerate workflow'));
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
      return next(errors.internal(message));
    }
  }));

  /**
   * GET /api/workflow/:id
   * Get a specific workflow by ID with all steps and rooms.
   */
  app.get('/api/workflow/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const workflow = await getWorkflow(req.params.id, req.organizationId!);

    if (!workflow) {
      return next(errors.notFound('Workflow'));
    }

    res.json(workflow);
  }));

  /**
   * PATCH /api/workflow/:id/steps/:stepId
   * Update a workflow step (status, notes, actual minutes, etc.)
   * Enforces evidence requirements for blocking steps when completing.
   */
  app.patch('/api/workflow/:id/steps/:stepId', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), stepId: z.string().uuid() })), validateBody(workflowStepUpdateSchema), asyncHandler(async (req, res, next) => {
    const { status, notes, actualMinutes, skipValidation } = req.body;

    // If completing a step, validate evidence requirements for blocking steps
    if (status === 'completed' && !skipValidation) {
      // Get the step with evidence to check requirements
      const { data: stepData, error: fetchError } = await supabaseAdmin
        .from('inspection_workflow_steps')
        .select(`
          id,
          required,
          evidence_requirements,
          evidence:workflow_step_evidence(id, evidence_type, requirement_id)
        `)
        .eq('id', req.params.stepId)
        .single();

      if (fetchError || !stepData) {
        return next(errors.notFound('Step'));
      }

      // Check if this is a blocking step with evidence requirements
      if (stepData.required && stepData.evidence_requirements) {
        const evidenceReqs = stepData.evidence_requirements as Array<{
          type: string;
          required: boolean;
          photo?: { minCount?: number; count?: number };
        }>;
        const attachedEvidence = (stepData.evidence || []) as Array<{ evidence_type: string }>;

        for (const req of evidenceReqs) {
          if (req.required) {
            if (req.type === 'photo') {
              const photoCount = attachedEvidence.filter(e => e.evidence_type === 'photo').length;
              const minPhotos = req.photo?.minCount || req.photo?.count || 1;
              if (photoCount < minPhotos) {
                return next(errors.badRequest('Evidence requirements not met', {
                  details: {
                    type: 'photos',
                    required: minPhotos,
                    current: photoCount
                  }
                }));
              }
            }
            if (req.type === 'measurement') {
              const measurementCount = attachedEvidence.filter(e => e.evidence_type === 'measurement').length;
              if (measurementCount === 0) {
                return next(errors.badRequest('Evidence requirements not met', {
                  details: { type: 'measurements', required: 1, current: 0 }
                }));
              }
            }
          }
        }
      }
    }

    const updates: Parameters<typeof updateWorkflowStep>[1] = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (actualMinutes !== undefined) updates.actualMinutes = actualMinutes;
    if (status === 'completed' && req.user?.id) {
      updates.completedBy = req.user.id;
    }

    const step = await updateWorkflowStep(req.params.stepId, updates);

    if (!step) {
      return next(errors.notFound('Step'));
    }

    res.json({ step });
  }));

  /**
   * POST /api/workflow/:id/steps
   * Add a new custom step to a workflow.
   */
  app.post('/api/workflow/:id/steps', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowStepCreateSchema), asyncHandler(async (req, res, next) => {
    const { phase, stepType, title, instructions, required, estimatedMinutes, roomId, roomName } = req.body;

    if (!phase || !stepType || !title) {
      return next(errors.badRequest('phase, stepType, and title are required'));
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
      return next(errors.badRequest('Failed to add step'));
    }

    res.status(201).json({ step });
  }));

  /**
   * POST /api/workflow/:id/rooms
   * Add a new room to a workflow.
   */
  app.post('/api/workflow/:id/rooms', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowRoomCreateSchema), asyncHandler(async (req, res, next) => {
    const { name, level, roomType, notes } = req.body;

    if (!name) {
      return next(errors.badRequest('name is required'));
    }

    const room = await addWorkflowRoom(req.params.id, {
      name,
      level,
      roomType,
      notes,
    });

    if (!room) {
      return next(errors.badRequest('Failed to add room'));
    }

    res.status(201).json({ room });
  }));

  /**
   * POST /api/workflow/:id/expand-rooms
   * Expand the workflow by adding room-specific steps for the given rooms.
   * Uses the room template defined in the workflow JSON.
   */
  app.post('/api/workflow/:id/expand-rooms', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowExpandRoomsSchema), asyncHandler(async (req, res, next) => {
    const { roomNames } = req.body;

    if (!roomNames || !Array.isArray(roomNames) || roomNames.length === 0) {
      return next(errors.badRequest('roomNames array is required'));
    }

    try {
      const result = await expandWorkflowForRooms(
        req.params.id,
        roomNames,
        req.user?.id
      );

      if (!result.success) {
        return next(errors.badRequest(result.error || 'Failed to expand workflow'));
      }

      res.json({ success: true, addedSteps: result.addedSteps });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return next(errors.internal(message));
    }
  }));

  /**
   * POST /api/workflow/:id/validate
   * Validate a workflow JSON structure.
   */
  app.post('/api/workflow/:id/validate', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    workflowJson: z.any().refine((val) => val !== undefined && val !== null, 'workflowJson is required'),
  })), asyncHandler(async (req, res, next) => {
    const { workflowJson } = req.body;

    if (!workflowJson) {
      return next(errors.badRequest('workflowJson is required'));
    }

    const result = validateWorkflowJson(workflowJson);
    res.json(result);
  }));

  // ============================================
  // DYNAMIC WORKFLOW ROUTES (Rule-Driven)
  // ============================================

  /**
   * POST /api/claims/:id/workflow/dynamic/generate
   * Generate a rule-driven dynamic workflow for a claim.
   */
  app.post('/api/claims/:id/workflow/dynamic/generate', requireAuth, requireOrganization, aiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { generateDynamicWorkflow } = await import('./services/dynamicWorkflowService');
    const { forceRegenerate } = req.body;

    const result = await generateDynamicWorkflow(
      req.params.id,
      req.organizationId!,
      req.user?.id,
      forceRegenerate
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to generate dynamic workflow'));
    }

    res.json({
      success: true,
      workflowId: result.workflowId,
      version: result.version,
      stepsGenerated: result.stepsGenerated,
    });
  }));

  /**
   * GET /api/workflow/:id/evidence
   * Get workflow with full evidence status.
   */
  app.get('/api/workflow/:id/evidence', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { getWorkflowWithEvidence } = await import('./services/dynamicWorkflowService');
    const result = await getWorkflowWithEvidence(req.params.id, req.organizationId!);

    if (!result) {
      return next(errors.notFound('Workflow'));
    }

    res.json(result);
  }));

  /**
   * POST /api/workflow/:id/steps/:stepId/evidence
   * Attach evidence to a workflow step.
   */
  app.post('/api/workflow/:id/steps/:stepId/evidence', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), stepId: z.string().uuid() })), validateBody(workflowEvidenceSchema), asyncHandler(async (req, res, next) => {
    const { attachEvidenceToStep } = await import('./services/dynamicWorkflowService');
    const { requirementId, type, photoId, measurementData, noteData } = req.body;

    if (!requirementId || !type) {
      return next(errors.badRequest('requirementId and type are required'));
    }

    const result = await attachEvidenceToStep(
      req.params.stepId,
      requirementId,
      { type, photoId, measurementData, noteData },
      req.user?.id
    );

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to attach evidence'));
    }

    res.json({
      success: true,
      evidenceId: result.evidenceId,
      fulfilled: result.fulfilled,
    });
  }));

  /**
   * GET /api/workflow/:id/steps/:stepId/evidence
   * Get evidence attached to a step.
   */
  app.get('/api/workflow/:id/steps/:stepId/evidence', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), stepId: z.string().uuid() })), asyncHandler(async (req, res, next) => {
    const { getStepEvidence } = await import('./services/dynamicWorkflowService');
    const evidence = await getStepEvidence(req.params.stepId);
    res.json({ evidence });
  }));

  /**
   * POST /api/workflow/:id/validate-export
   * Validate workflow for export readiness with evidence completeness check.
   */
  app.post('/api/workflow/:id/validate-export', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { validateWorkflowForExport } = await import('./services/dynamicWorkflowService');
    const result = await validateWorkflowForExport(req.params.id, req.organizationId!);
    res.json(result);
  }));

  /**
   * POST /api/workflow/:id/mutation/room-added
   * Trigger workflow mutation when a room is added.
   */
  app.post('/api/workflow/:id/mutation/room-added', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowMutationSchema), asyncHandler(async (req, res, next) => {
    const { onRoomAdded } = await import('./services/dynamicWorkflowService');
    const { roomId, roomName } = req.body;

    if (!roomId || !roomName) {
      return next(errors.badRequest('roomId and roomName are required'));
    }

    const result = await onRoomAdded(req.params.id, roomId, roomName, req.user?.id);
    res.json({
      success: true,
      stepsAdded: result.stepsAdded.length,
      stepsModified: result.stepsModified.length,
    });
  }));

  /**
   * POST /api/workflow/:id/mutation/damage-added
   * Trigger workflow mutation when a damage zone is added.
   */
  app.post('/api/workflow/:id/mutation/damage-added', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowMutationSchema), asyncHandler(async (req, res, next) => {
    const { onDamageZoneAdded } = await import('./services/dynamicWorkflowService');
    const { zoneId, roomId, damageType } = req.body;

    if (!zoneId || !roomId || !damageType) {
      return next(errors.badRequest('zoneId, roomId, and damageType are required'));
    }

    const result = await onDamageZoneAdded(req.params.id, zoneId, roomId, damageType, req.user?.id);
    res.json({
      success: true,
      stepsAdded: result.stepsAdded.length,
      stepsModified: result.stepsModified.length,
    });
  }));

  /**
   * POST /api/workflow/:id/mutation/photo-added
   * Trigger workflow mutation when a photo is added.
   */
  app.post('/api/workflow/:id/mutation/photo-added', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(workflowMutationSchema), asyncHandler(async (req, res, next) => {
    const { onPhotoAdded } = await import('./services/dynamicWorkflowService');
    const { photoId, roomId, zoneId, stepId } = req.body;

    if (!photoId) {
      return next(errors.badRequest('photoId is required'));
    }

    const result = await onPhotoAdded(req.params.id, photoId, roomId, zoneId, stepId, req.user?.id);
    res.json({
      success: true,
      stepsAdded: result.stepsAdded.length,
      stepsModified: result.stepsModified.length,
    });
  }));

  // ============================================
  // CARRIER OVERLAY ROUTES
  // ============================================

  /**
   * GET /api/carriers/:id/overlays
   * Get carrier-specific inspection overlays.
   */
  app.get('/api/carriers/:id/overlays', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { carrier, overlays } = await getCarrierOverlays(req.params.id);
    if (!carrier) {
      return next(errors.notFound('Carrier'));
    }
    res.json({ carrier, overlays });
  }));

  /**
   * PUT /api/carriers/:id/overlays
   * Update carrier-specific inspection overlays.
   */
  app.put('/api/carriers/:id/overlays', requireAuth, requireOrganization, requireOrgRole('owner', 'admin'), apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    overlays: z.record(z.unknown(), 'Overlays object is required'),
  })), asyncHandler(async (req, res, next) => {
    const { overlays } = req.body;
    if (!overlays) {
      return next(errors.badRequest('overlays object required'));
    }
    const success = await updateCarrierOverlays(req.params.id, overlays);
    if (!success) {
      return next(errors.notFound('Carrier'));
    }
    res.json({ success: true });
  }));

  /**
   * GET /api/claims/:id/carrier-guidance
   * Get carrier guidance for a claim based on its carrier and peril.
   */
  app.get('/api/claims/:id/carrier-guidance', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    // Get the claim's peril
    const { data, error } = await supabaseAdmin
      .from('claims')
      .select('primary_peril')
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId!)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return next(errors.notFound('Claim'));
      }
      throw error;
    }

    const peril = data.primary_peril || 'other';

    // Get merged inspection with carrier overlay
    const mergedInspection = await getMergedInspectionForClaim(req.params.id, peril);
    res.json(mergedInspection);
  }));

  // ============================================
  // PHOTO ROUTES (Voice Sketch)
  // ============================================

  // Upload photo with AI analysis
  app.post('/api/photos/upload', requireAuth, requireOrganization, uploadRateLimiter, upload.single('file'), asyncHandler(async (req, res, next) => {
    if (!req.file) {
      return next(errors.badRequest('No file uploaded'));
    }

      const { uploadAndAnalyzePhoto } = await import('./services/photos');
      const { linkPhotoToWorkflowStep } = await import('./services/dynamicWorkflowService');
      const { claimId, structureId, roomId, subRoomId, objectId, label, hierarchyPath, latitude, longitude, workflowStepId, damageZoneId } = req.body;

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

      log.info({ 
        photoId: photo.id, 
        claimId: photo.claimId, 
        storagePath: photo.storagePath 
      }, '[photos] Upload successful');

      // Link photo to workflow step if workflowStepId is provided or try to auto-match
      let stepLinkResult: { stepId?: string; stepProgress?: string; stepComplete?: boolean } = {};
      if (claimId) {
        try {
          const linkResult = await linkPhotoToWorkflowStep({
            claimId,
            photoId: photo.id,
            roomId,
            damageZoneId,
            explicitStepId: workflowStepId,
            organizationId: req.organizationId!
          });
          if (linkResult.success) {
            stepLinkResult = {
              stepId: linkResult.stepId,
              stepProgress: linkResult.stepProgress,
              stepComplete: linkResult.stepComplete
            };
            log.debug({ stepLinkResult }, '[photos] Photo linked to workflow step');
          }
        } catch (linkError) {
          log.warn({ linkError }, '[photos] Failed to link photo to workflow step');
          // Don't fail the upload if linking fails
        }
      }

      res.status(201).json({ ...photo, ...stepLinkResult });
  }));

  // Get signed URL for a photo
  app.get('/api/photos/:storagePath(*)/url', requireAuth, asyncHandler(async (req, res, next) => {
    const { getPhotoSignedUrl } = await import('./services/photos');
    const url = await getPhotoSignedUrl(req.params.storagePath);
    if (!url) {
      return next(errors.notFound('Photo or URL'));
    }
    res.json({ url });
  }));

  // Delete a photo by storage path (legacy)
  app.delete('/api/photos/by-path/:storagePath(*)', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { deletePhoto } = await import('./services/photos');
    const success = await deletePhoto(req.params.storagePath);
    if (!success) {
      return next(errors.internal('Failed to delete photo'));
    }
    res.json({ success: true });
  }));

  // List photos for a claim (with filters)
  app.get('/api/claims/:claimId/photos', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ claimId: z.string().uuid() })), asyncHandler(async (req, res, next) => {
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
  }));

  // Get single photo by ID
  app.get('/api/photos/:id', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { getClaimPhoto } = await import('./services/photos');
    const photo = await getClaimPhoto(req.params.id);
    if (!photo) {
      return next(errors.notFound('Photo'));
    }
    res.json(photo);
  }));

  // Delete photo by ID (deletes from both database and Supabase storage)
  app.delete('/api/photos/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { deleteClaimPhoto } = await import('./services/photos');
    const success = await deleteClaimPhoto(req.params.id);
    if (!success) {
      return next(errors.notFound('Photo'));
    }
    res.json({ success: true });
  }));

  // Update photo (label, hierarchy path, claim assignment, structure associations)
  app.patch('/api/photos/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    label: z.string().optional(),
    hierarchyPath: z.string().optional(),
    claimId: z.string().uuid().optional(),
    structureId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    damageZoneId: z.string().uuid().optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('Photo'));
    }

    res.json(updated);
  }));

  // List all photos for organization (across all claims)
  app.get('/api/photos', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { listAllClaimPhotos } = await import('./services/photos');
    const organizationId = req.organizationId;
    if (!organizationId) {
      return next(errors.badRequest('Organization required'));
    }
    const photos = await listAllClaimPhotos(organizationId);
    res.json(photos);
  }));

  // Re-analyze photo (retry failed analysis or update analysis)
  app.post('/api/photos/:id/reanalyze', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const { reanalyzePhoto } = await import('./services/photos');
    const result = await reanalyzePhoto(req.params.id);

    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to reanalyze photo'));
    }

    res.json({ success: true, message: 'Analysis started in background' });
  }));

  // ============================================
  // DOCUMENT ROUTES
  // ============================================

  // Upload document
  app.post('/api/documents', requireAuth, requireOrganization, uploadRateLimiter, upload.single('file'), asyncHandler(async (req, res, next) => {
    if (!req.file) {
      return next(errors.badRequest('No file uploaded'));
    }

    const { claimId, name, type, category, description, tags } = req.body;
    if (!type) {
      return next(errors.badRequest('Document type required (fnol, policy, endorsement, photo, estimate, correspondence, or auto)'));
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
      log.debug({ documentId: doc.id }, '[DocumentUpload] Queued auto-classification');
    } else if (['fnol', 'policy', 'endorsement'].includes(type)) {
      queueDocumentProcessing(doc.id, req.organizationId!, false);
      log.debug({ documentId: doc.id, type }, '[DocumentUpload] Queued background processing');
    }

    res.status(201).json(doc);
  }));

  // Upload multiple documents
  app.post('/api/documents/bulk', requireAuth, requireOrganization, uploadRateLimiter, upload.array('files', 20), asyncHandler(async (req, res, next) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return next(errors.badRequest('No files uploaded'));
    }

      const { claimId, type, category } = req.body;
      if (!type) {
        return next(errors.badRequest('Document type required (fnol, policy, endorsement, photo, estimate, correspondence, or auto)'));
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
        log.info({ count: toProcess.length, isAutoClassify }, '[DocumentUpload] Queued document processing');
      }

      res.status(201).json({ documents: results });
  }));

  // List documents
  app.get('/api/documents', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({
    claim_id: z.string().uuid().optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }).passthrough()), asyncHandler(async (req, res, next) => {
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
  }));

  // Get document statistics
  app.get('/api/documents/stats', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const stats = await getDocumentStats(req.organizationId!);
    res.json(stats);
  }));

  // Get batch processing status for multiple documents
  // Used by the upload queue to poll for completion
  app.get('/api/documents/batch-status', requireAuth, requireOrganization, apiRateLimiter, validateQuery(z.object({ ids: z.string().min(1, 'Document IDs required (comma-separated)') })), asyncHandler(async (req, res, next) => {
    const idsParam = req.query.ids as string;
    if (!idsParam) {
      return next(errors.badRequest('Document IDs required (comma-separated)'));
    }

    const documentIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
    if (documentIds.length === 0) {
      return next(errors.badRequest('No valid document IDs provided'));
    }

    try {
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
      return next(errors.internal(message));
    }
  }));

  // Get document processing queue statistics
  app.get('/api/documents/queue-stats', requireAuth, requireOrganization, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const stats = getDocumentQueueStats();
    res.json(stats);
  }));

  // Get document processing status (for polling after upload)
  // NOTE: This must be before /api/documents/:id to avoid route collision
  app.get('/api/documents/:id/status', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const doc = await getDocument(req.params.id, req.organizationId!);
    if (!doc) {
      return next(errors.notFound('Document'));
    }
    
    // If there's a claimId, lookup the claim number
    let claimNumber: string | null = null;
    if (doc.claimId) {
      const { data: claim } = await supabaseAdmin
        .from('claims')
        .select('claim_number')
        .eq('id', doc.claimId)
        .single();
      claimNumber = claim?.claim_number || null;
    }
    
    // Extract progress info from extracted_data
    const extractedData = doc.extractedData as any;
    const progress = extractedData?._progress || null;
    
    res.json({
      documentId: doc.id,
      processingStatus: doc.processingStatus || 'pending',
      claimId: doc.claimId || null,
      claimNumber,
      documentType: doc.type || null,
      error: extractedData?.error || extractedData?.claimCreationError || null,
      progress: progress ? {
        totalPages: progress.totalPages || 0,
        pagesProcessed: progress.pagesProcessed || 0,
        percentComplete: progress.percentComplete || 0,
        stage: progress.stage || 'pending',
        currentPage: progress.currentPage || 0,
      } : null,
    });
  }));

  // Get single document metadata
  app.get('/api/documents/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const doc = await getDocument(req.params.id, req.organizationId!);
    if (!doc) {
      return next(errors.notFound('Document'));
    }
    res.json(doc);
  }));

  // Download document file (redirects to Supabase Storage signed URL)
  app.get('/api/documents/:id/download', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const doc = await getDocument(req.params.id, req.organizationId!);
    if (!doc) {
      return next(errors.notFound('Document'));
    }

    // Get a signed URL from Supabase Storage (valid for 1 hour)
    const signedUrl = await getDocumentDownloadUrl(doc.storagePath, 3600);

    // Redirect to the signed URL for download
    res.redirect(signedUrl);
  }));

  // Get document as images (for viewing PDFs and images)
  app.get('/api/documents/:id/images', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const doc = await getDocument(req.params.id, req.organizationId!);
    if (!doc) {
      return next(errors.notFound('Document'));
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
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const os = await import('os');
      const execFileAsync = promisify(execFile);

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
        const { stdout } = await execFileAsync('pdfinfo', [tempFilePath]);
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

    return next(errors.badRequest('Unsupported document type for image viewing'));
  }));

  // Get specific page image from document
  app.get('/api/documents/:id/image/:page', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ id: z.string().uuid(), page: z.coerce.number().int().min(1) })), asyncHandler(async (req, res, next) => {
    const doc = await getDocument(req.params.id, req.organizationId!);
    if (!doc) {
      return next(errors.notFound('Document'));
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
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

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
        await execFileAsync('pdftoppm', ['-png', '-r', '150', '-f', String(pageNum), '-l', String(pageNum), pdfFilePath, outputPrefix]);

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

      return next(errors.internal('Failed to convert PDF page to image'));
    }

    return next(errors.badRequest('Unsupported document type'));
  }));

  // Get document preview URLs from Supabase (persistent cloud storage)
  app.get('/api/documents/:id/previews', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const result = await getDocumentPreviewUrls(req.params.id, req.organizationId!);
    res.json(result);
  }));

  // Trigger preview generation for a document
  app.post('/api/documents/:id/generate-previews', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const result = await generateDocumentPreviews(req.params.id, req.organizationId!);
    if (result.success) {
      res.json({ success: true, pageCount: result.pageCount });
    } else {
      return next(errors.internal(result.error || 'Failed to generate previews'));
    }
  }));

  // Update document metadata
  app.put('/api/documents/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(documentUpdateSchema), asyncHandler(async (req, res, next) => {
    const doc = await updateDocument(req.params.id, req.organizationId!, req.body);
    if (!doc) {
      return next(errors.notFound('Document'));
    }
    res.json(doc);
  }));

  // Associate document with claim
  app.post('/api/documents/:id/claim', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(documentClaimAssociationSchema), asyncHandler(async (req, res, next) => {
    const { claimId } = req.body;
    if (!claimId) {
      return next(errors.badRequest('claimId required'));
    }
    const success = await associateDocumentWithClaim(req.params.id, claimId, req.organizationId!);
    if (!success) {
      return next(errors.notFound('Document'));
    }
    res.json({ success: true });
  }));

  // Delete document
  app.delete('/api/documents/:id', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const success = await deleteDocument(req.params.id, req.organizationId!);
    if (!success) {
      return next(errors.notFound('Document'));
    }
    res.json({ success: true });
  }));

  // Process document with AI extraction
  app.post('/api/documents/:id/process', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), validateBody(documentProcessSchema), asyncHandler(async (req, res, next) => {
    const extractedData = await processDocumentAI(req.params.id, req.organizationId!);
    res.json({
      extractedData,
      processingStatus: 'completed'
    });
  }));

  // Create claim from uploaded documents
  app.post('/api/claims/from-documents', requireAuth, requireOrganization, apiRateLimiter, validateBody(createClaimFromDocumentsSchema), asyncHandler(async (req, res, next) => {
    const { documentIds, overrides } = req.body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return next(errors.badRequest('documentIds array required'));
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
  }));

  // ============================================
  // SKETCH TOOLS API ROUTES
  // ============================================
  // These endpoints provide sketch creation tools for autonomous agent use

  /**
   * POST /api/sketch/generate-floorplan-data
   * Generate structured floorplan data (rooms and connections) from input.
   * This validates and transforms the input data.
   */
  app.post('/api/sketch/generate-floorplan-data', requireAuth, apiRateLimiter, validateBody(sketchFloorplanDataSchema), asyncHandler(async (req, res, next) => {
    const result = await generateFloorplanData(req.body);
    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to generate floorplan data'));
    }
    res.json(result.data);
  }));

  /**
   * POST /api/sketch/rooms
   * Create or update a room in the estimate sketch.
   */
  app.post('/api/sketch/rooms', requireAuth, apiRateLimiter, validateBody(sketchRoomSchema), asyncHandler(async (req, res, next) => {
    const result = await createOrUpdateRoom(req.body);
    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to create or update room'));
    }
    res.json(result.data);
  }));

  /**
   * POST /api/sketch/rooms/:room_id/openings
   * Add an opening (door/window/cased) to a room wall.
   */
  app.post('/api/sketch/rooms/:room_id/openings', requireAuth, apiRateLimiter, validateParams(z.object({ room_id: z.string().uuid() })), validateBody(sketchOpeningSchema), asyncHandler(async (req, res, next) => {
    const result = await addRoomOpening({
      room_id: req.params.room_id,
      ...req.body,
    });
    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to add room opening'));
    }
    res.json(result.data);
  }));

  /**
   * POST /api/sketch/rooms/:room_id/missing-walls
   * Mark a missing wall segment for a room.
   */
  app.post('/api/sketch/rooms/:room_id/missing-walls', requireAuth, apiRateLimiter, validateParams(z.object({ room_id: z.string().uuid() })), validateBody(sketchMissingWallSchema), asyncHandler(async (req, res, next) => {
    const result = await addMissingWall({
      room_id: req.params.room_id,
      ...req.body,
    });
    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to add missing wall'));
    }
    res.json(result.data);
  }));

  /**
   * GET /api/sketch/estimates/:estimate_id/state
   * Retrieve current sketch state for an estimate.
   */
  app.get('/api/sketch/estimates/:estimate_id/state', requireAuth, asyncHandler(async (req, res, next) => {
    const result = await getSketchState(req.params.estimate_id);
    if (!result.success) {
      return next(errors.badRequest(result.error || 'Failed to get sketch state'));
    }
    res.json(result.data);
  }));

  // ============================================
  // XACTIMATE LINE ITEM CATALOG ENDPOINTS
  // ============================================

  /**
   * GET /api/xact/categories
   * List all Xactimate categories
   */
  app.get('/api/xact/categories', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('xact_categories')
      .select('*')
      .order('code');
    if (error) throw new Error(error.message);
    res.json(data);
  }));

  /**
   * GET /api/xact/categories/:code
   * Get a specific category by code
   */
  app.get('/api/xact/categories/:code', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('xact_categories')
      .select('*')
      .eq('code', req.params.code.toUpperCase())
      .limit(1)
      .maybeSingle();
    
    if (error) {
      return next(errors.internal(error.message));
    }
    if (!data) {
      return next(errors.notFound('Category'));
    }
    res.json(data);
  }));

  /**
   * GET /api/xact/line-items
   * Search line items with optional filters
   * Query params:
   *   - q: search query (matches description, fullCode, or selectorCode)
   *   - category: filter by category code
   *   - limit: max results (default 50, max 500)
   *   - offset: pagination offset
   */
  app.get('/api/xact/line-items', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
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
  }));

  /**
   * GET /api/xact/line-items/:code
   * Get a specific line item by full code
   */
  app.get('/api/xact/line-items/:code', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('xact_line_items')
      .select('*')
      .eq('full_code', req.params.code.toUpperCase())
      .limit(1)
      .single();
    if (error || !data) {
      return next(errors.notFound('Line item'));
    }
    res.json(data);
  }));

  /**
   * GET /api/xact/stats
   * Get statistics about the Xactimate catalog
   */
  app.get('/api/xact/stats', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
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
  }));

  /**
   * GET /api/xact/components
   * Search components (materials, equipment, labor) with pricing
   * Query params:
   *   - q: search query
   *   - type: filter by type (material, equipment, labor)
   *   - limit: max results (default 50, max 500)
   *   - offset: pagination offset
   */
  app.get('/api/xact/components', requireAuth, requireOrganization, asyncHandler(async (req, res, next) => {
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
  }));

  /**
   * GET /api/xact/components/:code
   * Get a specific component by code with its price
   */
  app.get('/api/xact/components/:code', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ code: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const { data, error } = await supabaseAdmin
      .from('xact_components')
      .select('*')
      .eq('code', req.params.code.toUpperCase())
      .limit(1)
      .single();
    if (error || !data) {
      return next(errors.notFound('Component'));
    }
    res.json(data);
  }));

  /**
   * GET /api/xact/search
   * Search Xactimate line items WITH calculated prices
   * Query params:
   *   - q: search query (required)
   *   - category: filter by category code
   *   - limit: max results (default 20)
   *   - offset: pagination offset
   */
  app.get('/api/xact/search', apiRateLimiter, validateQuery(z.object({
    q: z.string().min(1, 'Search query (q) is required'),
    category: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })), asyncHandler(async (req, res, next) => {
    const { q, category, limit = '20', offset = '0' } = req.query;
    
    if (!q) {
      return next(errors.badRequest('Search query (q) is required'));
    }
    
    const result = await searchXactItemsWithPricing(q as string, {
      category: category as string | undefined,
      limit: Math.min(parseInt(limit as string) || 20, 100),
      offset: parseInt(offset as string) || 0,
    });
    
    res.json(result);
  }));

  /**
   * GET /api/xact/price/:code
   * Get full price breakdown for a Xactimate line item
   */
  app.get('/api/xact/price/:code', requireAuth, requireOrganization, apiRateLimiter, validateParams(z.object({ code: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const result = await calculateXactPrice(req.params.code);
    if (!result) {
      return next(errors.notFound('Line item'));
    }
    res.json(result);
  }));

  /**
   * POST /api/estimates/:id/xact-items
   * Add a Xactimate line item to an estimate with auto-calculated pricing
   */
  app.post('/api/estimates/:id/xact-items', requireAuth, apiRateLimiter, validateParams(uuidParamSchema), validateBody(z.object({
    lineItemCode: z.string().min(1, 'Line item code is required'),
    quantity: z.number().positive('Quantity must be positive'),
    damageZoneId: z.string().uuid().optional(),
    roomName: z.string().optional(),
    notes: z.string().optional(),
  })), asyncHandler(async (req, res, next) => {
    const { lineItemCode, quantity, damageZoneId, roomName, notes } = req.body;
    
    if (!lineItemCode || !quantity) {
      return next(errors.badRequest('lineItemCode and quantity are required'));
    }
    
    const xactItem = await getXactItemForEstimate(lineItemCode, quantity);
    if (!xactItem) {
      return next(errors.notFound(`Xactimate line item ${lineItemCode}`));
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
  }));

  // ============================================
  // AI PROMPTS MANAGEMENT API
  // ============================================

  /**
   * GET /api/prompts
   * List all AI prompts (for admin UI)
   */
  app.get('/api/prompts', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    const prompts = await getAllPrompts();
    res.json({ prompts });
  }));

  /**
   * GET /api/prompts/:key
   * Get a specific prompt by key
   */
  app.get('/api/prompts/:key', requireAuth, apiRateLimiter, validateParams(z.object({ key: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const prompt = await getPrompt(req.params.key);
    if (!prompt) {
      return next(errors.notFound('Prompt'));
    }
    res.json({ prompt });
  }));

  /**
   * GET /api/prompts/:key/config
   * Get full prompt configuration for API calls (includes fallback)
   */
  app.get('/api/prompts/:key/config', requireAuth, apiRateLimiter, validateParams(z.object({ key: z.string().min(1) })), asyncHandler(async (req, res, next) => {
    const config = await getPromptWithFallback(req.params.key);
    res.json({ config });
  }));

  /**
   * GET /api/claims/:id/scope-context
   * Get claim context (briefing, workflow, peril) for scope agent
   *
   * Includes:
   * - readiness: Whether prerequisites (briefing + workflow) exist
   * - briefingVersion / workflowVersion: For cache invalidation
   * - briefing: AI-generated claim briefing summary
   * - workflow: Inspection workflow steps
   */
  app.get('/api/claims/:id/scope-context', requireAuth, requireOrganization, apiRateLimiter, validateParams(uuidParamSchema), asyncHandler(async (req, res, next) => {
    const claimId = req.params.id;
    const organizationId = req.organizationId!;

    // Import services dynamically
    const { getClaimBriefing } = await import('./services/claimBriefingService');
    const { getClaimWorkflow } = await import('./services/inspectionWorkflowService');

    // Get briefing
    const briefing = await getClaimBriefing(claimId, organizationId);

    // Get workflow
    const workflow = await getClaimWorkflow(claimId, organizationId);

    // Get claim for peril info and version numbers
    const claim = await getClaim(claimId, organizationId);

    // Get version numbers from claim (need to fetch directly as getClaim may not include them)
    // Handle case where columns don't exist (migration 042 may not have run)
    let claimVersions: { briefing_version?: number; workflow_version?: number } | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .from('claims')
        .select('briefing_version, workflow_version')
        .eq('id', claimId)
        .eq('organization_id', organizationId)
        .single();
      
      if (error && error.message?.includes('does not exist')) {
        // Columns don't exist - migration 042 needs to be run
        log.warn({ claimId }, 'Version columns do not exist. Please run migration 042_add_briefing_workflow_versions.sql');
        claimVersions = { briefing_version: 0, workflow_version: 0 };
      } else {
        claimVersions = data;
      }
    } catch (error) {
      // If columns don't exist, use defaults
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not exist')) {
        log.warn({ claimId }, 'Version columns do not exist. Please run migration 042_add_briefing_workflow_versions.sql');
        claimVersions = { briefing_version: 0, workflow_version: 0 };
      } else {
        throw error;
      }
    }

    // Determine readiness status
    const hasBriefing = briefing !== null;
    const hasWorkflow = workflow !== null;
    const isReady = hasBriefing && hasWorkflow;

    // Build context summary
    const context = {
      claimId,
      claimNumber: claim?.claimNumber || 'Unknown',
      primaryPeril: claim?.primaryPeril || 'Unknown',
      secondaryPerils: claim?.secondaryPerils || [],

      // Readiness status for voice agent prerequisites
      readiness: {
        isReady,
        hasBriefing,
        hasWorkflow,
        message: isReady
          ? 'Ready for voice agent'
          : `Missing: ${!hasBriefing ? 'briefing' : ''}${!hasBriefing && !hasWorkflow ? ', ' : ''}${!hasWorkflow ? 'workflow' : ''}`.trim(),
      },

      // Version numbers for cache invalidation
      briefingVersion: claimVersions?.briefing_version || 0,
      workflowVersion: claimVersions?.workflow_version || 0,

      briefing: briefing ? {
        id: briefing.id,
        primaryPeril: briefing.briefingJson?.claim_summary?.primary_peril,
        overview: briefing.briefingJson?.claim_summary?.overview || [],
        priorities: briefing.briefingJson?.inspection_strategy?.what_to_prioritize || [],
        commonMisses: briefing.briefingJson?.inspection_strategy?.common_misses || [],
        photoRequirements: briefing.briefingJson?.photo_requirements || [],
        sketchRequirements: briefing.briefingJson?.sketch_requirements || [],
        depreciationConsiderations: briefing.briefingJson?.depreciation_considerations || [],
      } : null,
      workflow: workflow ? {
        id: workflow.workflow?.id,
        totalSteps: workflow.steps?.length || 0,
        steps: workflow.steps?.slice(0, 10).map(s => ({
          phase: s.phase,
          title: s.title,
          instructions: s.instructions,
          required: s.required,
        })) || [],
      } : null,
    };

    res.json(context);
  }));

  /**
   * PUT /api/prompts/:key
   * Update an AI prompt (admin only)
   */
  app.put('/api/prompts/:key', requireAuth, apiRateLimiter, validateParams(z.object({ key: z.string().min(1) })), validateBody(promptUpdateSchema), asyncHandler(async (req, res, next) => {
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
      return next(errors.notFound('Prompt'));
    }

    res.json({ prompt: updated, message: 'Prompt updated successfully' });
  }));

  /**
   * POST /api/prompts/refresh-cache
   * Force refresh the prompts cache
   */
  app.post('/api/prompts/refresh-cache', requireAuth, apiRateLimiter, asyncHandler(async (req, res, next) => {
    await refreshCache();
    res.json({ message: 'Cache refreshed successfully' });
  }));

  return httpServer;
}
