/**
 * Routes Index
 * 
 * Consolidates all route modules and exports the main route registration function.
 * This replaces the monolithic routes.ts file with modular route handling.
 */

import { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { createLogger, logError } from '../lib/logger';

// Import route modules
import authRoutes from './auth';
import claimsRoutes from './claims';
import estimatesRoutes from './estimates';
import organizationsRoutes from './organizations';
import documentsRoutes from './documents';
import aiRoutes from './ai';
import pricingRoutes from './pricing';
import scopeRoutes from './scopeRoutes';
import audioObservationsRoutes, { claimAudioObservationsRouter } from './audioObservations';
import flowDefinitionRoutes from './flowDefinitionRoutes';
import flowEngineRoutes from './flowEngineRoutes';
import photoTaxonomyRoutes from './photoTaxonomyRoutes';
import voiceInspectionRoutes from './voiceInspectionRoutes';

const log = createLogger({ module: 'routes' });

/**
 * Central error response interface for consistent API errors
 */
interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Centralized error handling middleware
 * Provides consistent error responses across all routes
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  logError(log, err, 'Request error', {
    path: req.path,
    method: req.method,
    userId: (req.user as any)?.id,
  });

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Build error response
  const errorResponse: Record<string, unknown> = {
    success: false,
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: (req.user as any)?.id,
    };

    if (res.statusCode >= 400) {
      log.warn(logData, 'Request completed with error');
    } else if (duration > 1000) {
      log.warn(logData, 'Slow request');
    } else {
      log.debug(logData, 'Request completed');
    }
  });

  next();
}

/**
 * Register all routes with the Express app
 * 
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Add request logging
  app.use(requestLogger);

  // =================================================
  // Mount Route Modules
  // =================================================

  // Auth routes (includes user profile)
  app.use('/api/auth', authRoutes);
  app.use('/api/users', authRoutes); // User routes are part of auth module

  // Organization routes
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/admin/organizations', organizationsRoutes);

  // Claims routes
  app.use('/api/claims', claimsRoutes);

  // Estimates routes
  app.use('/api/estimates', estimatesRoutes);
  app.use('/api/estimate-templates', estimatesRoutes);

  // Documents routes
  app.use('/api', documentsRoutes);

  // AI routes
  app.use('/api/ai', aiRoutes);
  app.use('/api/voice', aiRoutes);

  // Pricing routes
  app.use('/api', pricingRoutes);

  // Scope Engine routes
  app.use('/api/scope', scopeRoutes);

  // Audio Observations routes
  app.use('/api/audio-observations', audioObservationsRoutes);
  app.use('/api/claims', claimAudioObservationsRouter);

  // Flow Definition routes
  app.use('/api/flow-definitions', flowDefinitionRoutes);

  // Flow Engine routes (replaces legacy workflow endpoints)
  app.use('/api', flowEngineRoutes);

  // Photo Taxonomy routes
  app.use('/api', photoTaxonomyRoutes);

  // Voice Inspection routes (voice-guided flow navigation)
  app.use('/api/voice-inspection', voiceInspectionRoutes);

  // =================================================
  // Health Check
  // =================================================

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // =================================================
  // Error Handling
  // =================================================

  // 404 handler for API routes
  app.use('/api/*', notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  // =================================================
  // Create HTTP Server
  // =================================================

  const httpServer = createServer(app);

  log.info('Routes registered successfully');

  return httpServer;
}

/**
 * Export individual route modules for testing
 */
export {
  authRoutes,
  claimsRoutes,
  estimatesRoutes,
  organizationsRoutes,
  documentsRoutes,
  aiRoutes,
  pricingRoutes,
  scopeRoutes,
  audioObservationsRoutes,
  flowDefinitionRoutes,
  flowEngineRoutes,
  voiceInspectionRoutes,
};
