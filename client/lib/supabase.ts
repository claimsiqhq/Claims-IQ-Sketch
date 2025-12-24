import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client-Side Configuration
 *
 * This module supports the new Supabase API key format for client-side use:
 *
 * NEW KEYS (recommended):
 * - VITE_SUPABASE_PUBLISHABLE_API_KEY (sb_publishable_...) - Safe for client-side use
 *
 * LEGACY KEYS (deprecated):
 * - VITE_SUPABASE_ANON_KEY - Legacy public key
 *
 * IMPORTANT: Never use secret keys (sb_secret_xxx) in client-side code!
 * The new secret keys will return HTTP 401 if used in browsers.
 *
 * Migration Guide: https://supabase.com/docs/guides/api/api-keys
 */

// Get Supabase configuration from window (injected by server)
declare global {
  interface Window {
    __SUPABASE_CONFIG__?: {
      url: string;
      publishableKey?: string;
      anonKey?: string; // Legacy property name
    };
  }
}

function getSupabaseConfig() {
  // Priority 1: New Vite environment variables (preferred)
  // Priority 2: Legacy Vite environment variables
  // Priority 3: Injected config from server (production)
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    window.__SUPABASE_CONFIG__?.url;

  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_API_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    window.__SUPABASE_CONFIG__?.publishableKey ||
    window.__SUPABASE_CONFIG__?.anonKey;

  if (!url || !publishableKey) {
    console.warn(
      '[supabase] Configuration not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_API_KEY. ' +
      'Some features may not work.'
    );
    return null;
  }

  // Detect key type for logging
  const keyType = publishableKey.startsWith('sb_publishable_')
    ? 'new'
    : publishableKey.startsWith('eyJ')
    ? 'legacy'
    : 'unknown';

  if (keyType === 'legacy') {
    console.warn(
      '[supabase] Using legacy anon key. Consider migrating to sb_publishable_ key format. ' +
      'See: https://supabase.com/docs/guides/api/api-keys'
    );
  }

  // Security check: Ensure secret keys are never used in client
  if (publishableKey.startsWith('sb_secret_')) {
    console.error(
      '[supabase] CRITICAL: Secret key detected in client-side code! ' +
      'This is a security vulnerability. Use VITE_SUPABASE_PUBLISHABLE_API_KEY instead.'
    );
    return null;
  }

  return { url, publishableKey };
}

const config = getSupabaseConfig();

/**
 * Supabase client for client-side operations
 * Uses publishable key (new) or anon key (legacy)
 * Respects Row Level Security (RLS) policies
 */
export const supabase = config
  ? createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Helper to check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// Storage bucket name for documents
export const DOCUMENTS_BUCKET = 'documents';
