import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.ts';

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
