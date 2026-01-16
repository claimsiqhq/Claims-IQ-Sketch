/**
 * Request ID Middleware
 * 
 * Generates or extracts request ID and adds it to request/response context.
 * Request ID is used for tracing requests across the system.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'request-id' });

/**
 * Extract or generate request ID from headers
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 
         (req.headers['x-correlation-id'] as string) ||
         crypto.randomUUID();
}

/**
 * Middleware to add request ID to all requests
 * 
 * Adds request ID to:
 * - req.id (for use in route handlers)
 * - res.locals.requestId (for use in response helpers)
 * - Response header X-Request-ID
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = getRequestId(req);
  
  // Add to request object
  (req as any).id = requestId;
  
  // Add to response locals for response helpers
  res.locals.requestId = requestId;
  
  // Add to response header
  res.setHeader('X-Request-ID', requestId);
  
  // Add to logger context (if logger supports it)
  if (log.child) {
    req.logger = log.child({ requestId });
  }
  
  next();
}

// Extend Express types
declare global {
  namespace Express {
    interface Request {
      id?: string;
      logger?: ReturnType<typeof createLogger>;
    }
  }
}
