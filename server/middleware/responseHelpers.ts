/**
 * Standardized API Response Helpers
 * 
 * Provides consistent response envelope format across all endpoints.
 * All successful responses follow: { success: true, data?: T, message?: string }
 * All error responses follow: { success: false, message: string, code: string, ... }
 */

import { Response } from 'express';

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  requestId?: string;
}

/**
 * Standard error response format (matches errorHandler.ts)
 */
export interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Send a successful response with data
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  // Add request ID if available
  const requestId = res.locals.requestId;
  if (requestId) {
    response.requestId = requestId;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Send a successful response without data (for operations like DELETE)
 */
export function sendSuccessMessage(
  res: Response,
  message: string,
  statusCode: number = 200
): void {
  const response: SuccessResponse = {
    success: true,
    message,
  };
  
  const requestId = res.locals.requestId;
  if (requestId) {
    response.requestId = requestId;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Send a created response (201)
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string
): void {
  sendSuccess(res, data, message, 201);
}

/**
 * Send a no content response (204)
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}
