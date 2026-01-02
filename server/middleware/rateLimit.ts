/**
 * Rate Limiting Middleware
 * 
 * Protects authentication endpoints and other sensitive routes from abuse.
 * Uses express-rate-limit with configurable windows and limits.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { createLogger } from '../lib/logger';

const log = createLogger({ module: 'rate-limit' });

/**
 * Rate limit exceeded handler
 */
function rateLimitHandler(req: Request, res: Response) {
  log.warn({
    path: req.path,
    ip: req.ip,
    method: req.method,
  }, 'Rate limit exceeded');

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  });
}

/**
 * Strict rate limiter for authentication endpoints
 * 
 * - 5 attempts per 15 minutes for login/register
 * - Helps prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator: (req: Request) => {
    // Use IP + username/email for more granular limiting
    const identifier = req.body?.username || req.body?.email || '';
    return `${req.ip}-${identifier}`;
  },
  handler: rateLimitHandler,
  skip: (req: Request) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  },
});

/**
 * Moderate rate limiter for password reset
 * 
 * - 3 attempts per hour
 * - Prevents email enumeration and spam
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: 'Too many password reset requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = req.body?.email || '';
    return `${req.ip}-${email}`;
  },
  handler: rateLimitHandler,
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
});

/**
 * General API rate limiter
 * 
 * - 100 requests per minute for authenticated users
 * - Prevents API abuse while allowing normal usage
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise IP
    const userId = (req.user as any)?.id;
    return userId || req.ip || 'unknown';
  },
  handler: rateLimitHandler,
  skip: (req: Request) => {
    // Skip for health checks and in test environment
    return req.path === '/api/health' || process.env.NODE_ENV === 'test';
  },
});

/**
 * AI endpoint rate limiter
 * 
 * - 20 requests per minute
 * - AI operations are expensive, so stricter limits
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many AI requests. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req.user as any)?.id;
    const orgId = (req as any).organizationId;
    return `${userId || req.ip}-${orgId || 'no-org'}`;
  },
  handler: rateLimitHandler,
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
});

/**
 * Document upload rate limiter
 * 
 * - 30 uploads per hour
 * - Prevents storage abuse
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 uploads per hour
  message: 'Upload limit reached. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req.user as any)?.id;
    const orgId = (req as any).organizationId;
    return `upload-${userId || req.ip}-${orgId || 'no-org'}`;
  },
  handler: rateLimitHandler,
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
});

export default {
  authRateLimiter,
  passwordResetRateLimiter,
  apiRateLimiter,
  aiRateLimiter,
  uploadRateLimiter,
};
