import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration - optional, app works without it
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

// Validate that SUPABASE_URL is a valid HTTPS URL (not a postgres:// connection string)
function isValidSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Flag to check if Supabase is configured with valid URLs
export const isSupabaseConfigured = !!(isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey);

// Log warning if misconfigured
if (supabaseUrl && !isValidSupabaseUrl(supabaseUrl)) {
  console.warn('[supabase] SUPABASE_URL is not a valid HTTP/HTTPS URL. Supabase storage will be disabled.');
  console.warn('[supabase] SUPABASE_URL should be like: https://xxxxx.supabase.co');
}

// Public client for client-side operations (respects RLS)
// Will be null if Supabase is not configured
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

// Admin client for server-side operations (bypasses RLS)
// Only use this for server-side operations that need elevated privileges
export const supabaseAdmin: SupabaseClient | null = 
  isSupabaseConfigured && supabaseServiceKey
    ? createClient(supabaseUrl!, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

// Helper to get the admin client (throws if not configured)
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  return supabaseAdmin;
}

// Helper to get the public client (throws if not configured)
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }
  return supabase;
}

// Storage bucket names
export const DOCUMENTS_BUCKET = 'documents';
export const PREVIEWS_BUCKET = 'document-previews';

// Export configuration for use in other modules
export const supabaseConfig = {
  url: supabaseUrl || '',
  anonKey: supabaseAnonKey || '',
  hasServiceKey: !!supabaseServiceKey,
  isConfigured: isSupabaseConfigured,
};
