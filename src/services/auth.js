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

async function usernameLoginErrorMessage(error) {
  if (error?.name === 'FunctionsFetchError') return '用户名登录服务未部署或不可用';

  const response = error?.context;
  if (response?.status >= 500 && typeof response.json === 'function') {
    try {
      const payload = await response.json();
      if (payload?.error) return payload.error;
    } catch {
      // Keep the public login error generic below.
    }
  }

  return '用户名或密码不正确';
}

export async function signInWithUsername(username, password) {
  ensureSupabase();

  const { data, error } = await supabase.functions.invoke('username-login', {
    body: {
      username: String(username || '').trim(),
      password: String(password || '')
    }
  });
  if (error) {
    throw new Error(await usernameLoginErrorMessage(error));
  }

  if (!data?.access_token || !data?.refresh_token) {
    throw new Error('用户名或密码不正确');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token
  });
  if (sessionError) throw sessionError;
  return sessionData.session || null;
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
