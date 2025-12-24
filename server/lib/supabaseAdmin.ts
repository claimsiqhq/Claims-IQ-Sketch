import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client
 *
 * This module creates a standalone admin client using the new API key format.
 * For most use cases, prefer importing from './supabase.ts' which provides
 * both public and admin clients with proper configuration.
 *
 * NEW KEYS (required):
 * - SUPABASE_SECRET_KEY (sb_secret_...) - Server-side only, bypasses RLS
 *
 * LEGACY KEYS (deprecated):
 * - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE
 */

const supabaseUrl = process.env.SUPABASE_URL;

// NEW API key format (preferred) - sb_secret_xxx
// Falls back to legacy service role key for backwards compatibility
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SECRET_KEY must be set. ' +
    'Legacy variables SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE are also accepted for backwards compatibility.'
  );
}

/**
 * Admin Supabase client for server-side operations
 * BYPASSES Row Level Security (RLS) - use with caution!
 *
 * Security: This key should NEVER be exposed to the client.
 * The new sb_secret_xxx keys will return 401 if used in browsers.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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
      console.error('[supabase] Connection test failed:', error.message);
      return false;
    }

    console.log('[supabase] Database connection successful');
    return true;
  } catch (err) {
    console.error('[supabase] Connection test error:', err);
    return false;
  }
}
