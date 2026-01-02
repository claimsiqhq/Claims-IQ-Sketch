import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loggers, logError } from './logger';

/**
 * Supabase Client Configuration (Consolidated)
 *
 * This is the SINGLE SOURCE OF TRUTH for all Supabase clients.
 * Import from this file for all Supabase operations.
 *
 * NEW KEYS (required):
 * - SUPABASE_PUBLISHABLE_API_KEY (sb_publishable_...) - Safe for client-side use
 * - SUPABASE_SECRET_KEY (sb_secret_...) - Server-side only, bypasses RLS
 * - SUPABASE_DATABASE_URL - Direct PostgreSQL connection string
 *
 * LEGACY KEYS (deprecated, for backwards compatibility only):
 * - SUPABASE_ANON_KEY - Legacy public key
 * - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE - Legacy admin key
 * - DATABASE_URL - Legacy database URL
 *
 * Migration Guide: https://supabase.com/docs/guides/api/api-keys
 */

// Supabase project URL
const supabaseUrl = process.env.SUPABASE_URL;

// NEW API key format (preferred) - sb_publishable_xxx
// Falls back to legacy anon key for backwards compatibility
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_API_KEY ||
  process.env.SUPABASE_ANON_KEY;

// NEW API key format (preferred) - sb_secret_xxx
// Falls back to legacy service role key for backwards compatibility
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

/**
 * Detect the type of API key being used
 */
export type SupabaseKeyType = 'new' | 'legacy' | 'unknown';

export function detectKeyType(key: string | undefined): SupabaseKeyType {
  if (!key) return 'unknown';
  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    return 'new';
  }
  // Legacy JWT-based keys are typically longer and start with 'eyJ'
  if (key.startsWith('eyJ')) {
    return 'legacy';
  }
  return 'unknown';
}

/**
 * Validate that a key is safe for client-side use
 * Secret keys (sb_secret_xxx) should NEVER be exposed to browsers
 */
export function isClientSafeKey(key: string | undefined): boolean {
  if (!key) return false;
  // New secret keys are NOT safe for client use
  if (key.startsWith('sb_secret_')) return false;
  // Publishable keys are safe
  if (key.startsWith('sb_publishable_')) return true;
  // For legacy keys, anon keys are safe (we can't easily distinguish without decoding JWT)
  return true;
}

/**
 * Validate that SUPABASE_URL is a valid HTTPS URL (not a postgres:// connection string)
 */
function isValidSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Validate configuration on startup
const hasValidUrl = isValidSupabaseUrl(supabaseUrl);
const hasPublishableKey = !!supabasePublishableKey;
const hasSecretKey = !!supabaseSecretKey;

// Flag to check if Supabase is configured with valid URLs and keys
export const isSupabaseConfigured = hasValidUrl && hasSecretKey;

// Log configuration status (only warnings for issues)
if (process.env.NODE_ENV !== 'test') {
  if (!hasValidUrl) {
    if (supabaseUrl) {
      loggers.supabase.warn('SUPABASE_URL is not a valid HTTP/HTTPS URL. Supabase features will be disabled.');
    } else {
      loggers.supabase.warn('SUPABASE_URL is not set. Supabase features will be disabled.');
    }
  }
  if (!hasSecretKey) {
    loggers.supabase.warn('SUPABASE_SECRET_KEY is not set. Server-side Supabase operations will fail.');
  }
}

// Throw early if required config is missing (fail fast)
if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    'Supabase configuration is incomplete. Required environment variables:\n' +
    '- SUPABASE_URL: ' + (supabaseUrl ? '✓' : '✗ missing') + '\n' +
    '- SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY): ' + (supabaseSecretKey ? '✓' : '✗ missing')
  );
}

/**
 * Public Supabase client for operations respecting RLS
 * Uses publishable key (new) or anon key (legacy)
 * Respects Row Level Security (RLS) policies
 * 
 * Note: This client is OPTIONAL - most server operations use supabaseAdmin
 */
export const supabase: SupabaseClient | null = hasValidUrl && hasPublishableKey
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // Server-side doesn't need session persistence
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Admin Supabase client for server-side operations
 * Uses secret key (new) or service role key (legacy)
 * BYPASSES Row Level Security (RLS) - use with caution!
 *
 * Security: This key should NEVER be exposed to the client.
 * The new sb_secret_xxx keys will return 401 if used in browsers.
 * 
 * This is guaranteed to be non-null due to the early throw above.
 */
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl!, supabaseSecretKey!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Helper to get the admin client (for backwards compatibility)
 * Since we throw on startup if not configured, this is guaranteed to return a valid client.
 */
export function getSupabaseAdmin(): SupabaseClient {
  return supabaseAdmin;
}

/**
 * Helper to get the public client
 * @throws Error if public client is not configured
 */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase public client is not configured. ' +
      'Please set SUPABASE_PUBLISHABLE_API_KEY environment variable.'
    );
  }
  return supabase;
}

/**
 * Test the Supabase connection
 * @returns true if connection is successful, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      loggers.supabase.error({ error: error.message }, 'Connection test failed');
      return false;
    }

    loggers.supabase.info('Database connection successful');
    return true;
  } catch (err) {
    logError(loggers.supabase, err, 'Connection test error');
    return false;
  }
}

// Storage bucket names
export const DOCUMENTS_BUCKET = 'documents';
export const PREVIEWS_BUCKET = 'document-previews';
export const PHOTOS_BUCKET = 'claim-photos';

/**
 * Configuration export for use in other modules
 * Includes key type information for migration planning
 */
export const supabaseConfig = {
  url: supabaseUrl || '',
  publishableKey: supabasePublishableKey || '',
  hasSecretKey: !!supabaseSecretKey,
  isConfigured: isSupabaseConfigured,
  keyTypes: {
    publishable: detectKeyType(supabasePublishableKey),
    secret: detectKeyType(supabaseSecretKey),
  },
  // Legacy property names for backwards compatibility
  anonKey: supabasePublishableKey || '',
  hasServiceKey: !!supabaseSecretKey,
};
