/**
 * Query Parameter Validation Helpers
 * 
 * Provides utilities for validating common query parameters
 * (UUIDs, dates, pagination limits, etc.)
 */

import { z } from 'zod';

/**
 * Standard pagination query schema
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * UUID parameter schema
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

/**
 * Date query schema (ISO date strings)
 */
export const dateRangeQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
});

/**
 * Status query schema
 */
export const statusQuerySchema = z.object({
  status: z.string().min(1).optional(),
});

/**
 * Search query schema
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});
