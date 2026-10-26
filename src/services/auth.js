import { supabase } from '../lib/supabase.js';
import { passwordResetError } from './passwordResetError.js';

const recoveryListeners = new Set();
let recoverySession = null;

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoverySession = session;
      for (const listener of recoveryListeners) listener(session);
    } else if (event === 'SIGNED_OUT') {
      recoverySession = null;
    }
  });
}

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

export async function getSession() {
  ensureSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function signInWithEmail(email, password) {
  ensureSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password: String(password || '')
  });
  if (error) throw new Error('邮箱或密码不正确');
  return data.session || null;
}

export async function updatePassword(password) {
  ensureSupabase();
  const { data, error } = await supabase.auth.updateUser({
    password: String(password || '')
  });
  if (error) throw error;
  return data.user || null;
}

export async function getCurrentAuthUser() {
  ensureSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function requestPasswordResetEmail(email) {
  ensureSupabase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('请填写邮箱');

  const isAndroidAsset = typeof window !== 'undefined' && window.location.hostname === 'appassets.androidplatform.net';
  const webAppUrl = import.meta.env.VITE_PUBLIC_APP_URL
    || (isAndroidAsset ? 'https://dailylog.top/' : window.location.origin);
  const redirectTo = new URL('/reset-password', webAppUrl).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
  if (error) throw passwordResetError(error);
}

export function onPasswordRecovery(listener) {
  recoveryListeners.add(listener);
  if (recoverySession) {
    const session = recoverySession;
    queueMicrotask(() => {
      if (recoveryListeners.has(listener)) listener(session);
    });
  }
  return () => recoveryListeners.delete(listener);
}

export function hasVerifiedPasswordRecovery() {
  return Boolean(recoverySession?.user?.id);
}

export function clearPasswordRecovery() {
  recoverySession = null;
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
