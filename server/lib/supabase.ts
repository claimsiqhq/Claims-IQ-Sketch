import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration - optional, app works without it
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

// Flag to check if Supabase is configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

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

// Storage bucket name for documents
export const DOCUMENTS_BUCKET = 'documents';

// Export configuration for use in other modules
export const supabaseConfig = {
  url: supabaseUrl || '',
  anonKey: supabaseAnonKey || '',
  hasServiceKey: !!supabaseServiceKey,
  isConfigured: isSupabaseConfigured,
};
