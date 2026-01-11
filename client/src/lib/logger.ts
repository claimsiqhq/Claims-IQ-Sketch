/**
 * Client-side logging utility
 * In development: logs to console
 * In production: can be extended to send to error tracking service
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';

function log(level: LogLevel, message: string, ...args: unknown[]) {
  if (!isDevelopment && level === 'debug') {
    return; // Don't log debug in production
  }

  const prefix = `[${level.toUpperCase()}]`;
  
  switch (level) {
    case 'debug':
      console.log(prefix, message, ...args);
      break;
    case 'info':
      console.info(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    case 'error':
      console.error(prefix, message, ...args);
      // TODO: Send to error tracking service (e.g., Sentry) in production
      // if (window.Sentry && level === 'error') {
      //   window.Sentry.captureMessage(message, { level: 'error', extra: args });
      // }
      break;
  }
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};
