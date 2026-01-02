import pino from 'pino';

/**
 * Structured Logger Configuration
 * 
 * Provides consistent, structured logging across the application.
 * Uses pino for high-performance JSON logging in production,
 * and pino-pretty for human-readable output in development.
 * 
 * Log Levels:
 * - fatal: System is unusable
 * - error: Error conditions
 * - warn: Warning conditions  
 * - info: Normal operational messages
 * - debug: Debugging messages
 * - trace: Fine-grained debugging
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Configure log level from environment
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Configure transport for pretty printing in development
const transport = isDevelopment && !isTest
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    }
  : undefined;

/**
 * Base logger configuration
 */
export const logger = pino({
  level: isTest ? 'silent' : logLevel,
  transport,
  base: {
    env: process.env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 * 
 * @param context - Object with context properties (e.g., { module: 'auth' })
 * @returns A child logger instance
 * 
 * @example
 * const authLogger = createLogger({ module: 'auth' });
 * authLogger.info({ userId: '123' }, 'User logged in');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  auth: createLogger({ module: 'auth' }),
  claims: createLogger({ module: 'claims' }),
  documents: createLogger({ module: 'documents' }),
  ai: createLogger({ module: 'ai' }),
  supabase: createLogger({ module: 'supabase' }),
  api: createLogger({ module: 'api' }),
  estimate: createLogger({ module: 'estimate' }),
  workflow: createLogger({ module: 'workflow' }),
};

/**
 * Request logger middleware context creator
 * Use this to add request-specific context to logs
 */
export interface RequestContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  path?: string;
  method?: string;
}

export function createRequestLogger(context: RequestContext) {
  return logger.child({
    module: 'http',
    ...context,
  });
}

/**
 * Error logging helper with stack trace handling
 */
export function logError(
  loggerInstance: pino.Logger,
  error: unknown,
  message: string,
  context?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : new Error(String(error));
  loggerInstance.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      ...context,
    },
    message
  );
}

/**
 * Performance timing helper
 */
export function logTiming(
  loggerInstance: pino.Logger,
  operation: string,
  startTime: number,
  context?: Record<string, unknown>
) {
  const duration = Date.now() - startTime;
  loggerInstance.info(
    {
      operation,
      durationMs: duration,
      ...context,
    },
    `${operation} completed in ${duration}ms`
  );
}

export default logger;
