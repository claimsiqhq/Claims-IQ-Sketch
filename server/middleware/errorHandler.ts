/**
 * Centralized Error Handling Middleware
 * 
 * Provides consistent error responses across all API routes.
 * Includes structured logging and environment-aware error details.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger, logError } from '../lib/logger';

const log = createLogger({ module: 'error-handler' });

/**
 * Extended Error interface for API errors
 */
export interface ApiError extends Error {
  /** HTTP status code */
  statusCode?: number;
  /** Error code for client-side handling */
  code?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether the error is operational (expected) vs programming error */
  isOperational?: boolean;
}

/**
 * Create an API error with proper typing
 */
export function createApiError(
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR',
  details?: Record<string, unknown>
): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.isOperational = true;
  return error;
}

/**
 * Common error factory functions
 */
export const errors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    createApiError(message, 400, 'BAD_REQUEST', details),
  
  unauthorized: (message: string = 'Authentication required') =>
    createApiError(message, 401, 'UNAUTHORIZED'),
  
  forbidden: (message: string = 'Access denied') =>
    createApiError(message, 403, 'FORBIDDEN'),
  
  notFound: (resource: string = 'Resource') =>
    createApiError(`${resource} not found`, 404, 'NOT_FOUND'),
  
  conflict: (message: string, details?: Record<string, unknown>) =>
    createApiError(message, 409, 'CONFLICT', details),
  
  validation: (message: string, details?: Record<string, unknown>) =>
    createApiError(message, 422, 'VALIDATION_ERROR', details),
  
  internal: (message: string = 'Internal server error') =>
    createApiError(message, 500, 'INTERNAL_ERROR'),
  
  serviceUnavailable: (message: string = 'Service temporarily unavailable') =>
    createApiError(message, 503, 'SERVICE_UNAVAILABLE'),
};

/**
 * Standard API response format
 */
interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  stack?: string;
  requestId?: string;
}

/**
 * Extract request ID from headers or generate one
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 
         (req.headers['x-correlation-id'] as string) ||
         crypto.randomUUID();
}

/**
 * Centralized error handling middleware
 * 
 * Must be registered AFTER all route handlers.
 * Catches all errors and returns consistent JSON responses.
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or extract request ID for tracking
  const requestId = getRequestId(req);

  // Log the error with context
  logError(log, err, 'Request error', {
    requestId,
    path: req.path,
    method: req.method,
    userId: (req.user as any)?.id,
    organizationId: (req as any).organizationId,
    statusCode: err.statusCode || 500,
    isOperational: err.isOperational,
  });

  // Determine if this is an operational error or a programming error
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Build error response
  const response: ErrorResponse = {
    success: false,
    message: isProduction && statusCode === 500 
      ? 'An unexpected error occurred' 
      : err.message,
    code: err.code || 'INTERNAL_ERROR',
    requestId,
  };

  // Include details in non-production or for operational errors
  if (!isProduction || err.isOperational) {
    response.details = err.details;
  }

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Not found handler for undefined routes
 * Register after all route definitions but before the error handler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method,
  });
}

/**
 * Async handler wrapper to catch errors from async route handlers
 * 
 * @example
 * router.get('/example', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate required fields in request body
 * Throws a validation error if any required fields are missing
 */
export function validateRequired(
  body: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(field => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw errors.validation(
      `Missing required fields: ${missing.join(', ')}`,
      { missing }
    );
  }
}

export default errorHandler;
