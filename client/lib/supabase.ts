import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from window (injected by server)
declare global {
  interface Window {
    __SUPABASE_CONFIG__?: {
      url: string;
      anonKey: string;
    };
  }
}

function getSupabaseConfig() {
  // In development, use environment variables via Vite
  // In production, use injected config from server
  const url = import.meta.env.VITE_SUPABASE_URL || window.__SUPABASE_CONFIG__?.url;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || window.__SUPABASE_CONFIG__?.anonKey;

  if (!url || !anonKey) {
    console.warn('Supabase configuration not found. Some features may not work.');
    return null;
  }

  return { url, anonKey };
}

const config = getSupabaseConfig();

// Create Supabase client (or null if not configured)
export const supabase = config
  ? createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Helper to check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// Storage bucket name for documents
export const DOCUMENTS_BUCKET = 'documents';
