import { supabase } from '../lib/supabase.js';

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

export async function getSession() {
  ensureSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function signInWithPassword(email, password) {
  ensureSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || '')
  });
  if (error) throw error;
  return data.session || null;
}

export async function signOut() {
  ensureSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(handler) {
  ensureSupabase();
  return supabase.auth.onAuthStateChange(handler);
}
