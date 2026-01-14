/**
 * Request Validation Middleware
 * 
 * Provides Zod-based validation middleware for Express routes
 * Validates request bodies and query parameters using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Validate query parameters against a Zod schema
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter validation failed',
          code: 'VALIDATION_ERROR',
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Validate request parameters (route params) against a Zod schema
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Parameter validation failed',
          code: 'VALIDATION_ERROR',
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
}
