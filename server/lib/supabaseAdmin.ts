import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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
