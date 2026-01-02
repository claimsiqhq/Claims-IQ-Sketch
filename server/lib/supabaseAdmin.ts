/**
 * Supabase Admin Client Re-export
 *
 * This file re-exports the admin client from the consolidated supabase.ts module.
 * This ensures backwards compatibility with existing imports while maintaining
 * a single source of truth.
 *
 * PREFERRED: Import directly from './supabase.ts':
 *   import { supabaseAdmin, testConnection } from './supabase';
 *
 * STILL WORKS (backwards compatible):
 *   import { supabaseAdmin, testConnection } from './supabaseAdmin';
 */

export { 
  supabaseAdmin, 
  testConnection,
  getSupabaseAdmin,
  isSupabaseConfigured,
  supabaseConfig,
} from './supabase';
