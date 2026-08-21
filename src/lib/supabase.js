import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const hasSupabaseConfig = Boolean(url && key);
export const supabaseBucketName = 'checkin-images';
export const profileAvatarBucketName = 'profile-avatars';

export const supabase = hasSupabaseConfig
  ? createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;
