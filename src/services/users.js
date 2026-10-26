import { supabase } from '../lib/supabase.js';
import { edgeFunctionErrorMessage } from './edgeFunctionError.js';

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

export function normalizeUsername(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function inviteUser(payload = {}) {
  ensureSupabase();
  const email = String(payload.email || '').trim().toLowerCase();
  const username = normalizeUsername(payload.username);
  const { data, error } = await supabase.functions.invoke('admin-invite-user', {
    body: {
      email,
      username,
      display_name: String(payload.display_name || '').trim(),
      role: payload.role === 'admin' ? 'admin' : 'member'
    }
  });

  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, '发送用户邀请'));
  }

  if (!data?.profile) {
    const message = typeof data?.error === 'string' ? data.error.trim() : '';
    throw new Error(message && message !== '{}' ? message : '发送邀请失败，请检查 Supabase Edge Function 日志');
  }
  return data.profile;
}

export async function setUserActive(userId, isActive) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: Boolean(isActive) })
    .eq('id', userId)
    .select('id, username, display_name, avatar_url, role, is_active, created_at')
    .single();

  if (error) throw error;
  return data;
}
