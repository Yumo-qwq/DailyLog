import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function normalizeUsername(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || '';
}

function invalidLogin() {
  return jsonResponse({ error: '用户名或密码不正确' }, 400);
}

function dashboardEmailFor(username: string) {
  const domain = Deno.env.get('DAILYLOG_INTERNAL_EMAIL_DOMAIN') || 'dailylog.local';
  return `${username}@${domain}`;
}

async function passwordGrant(supabaseUrl: string, anonKey: string, email: string, password: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  if (!response.ok) return null;
  return await response.json();
}

async function getTokenUser(supabaseUrl: string, anonKey: string, accessToken: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return await response.json();
}

async function ensureDashboardProfile(adminClient: ReturnType<typeof createClient>, authUser: Record<string, unknown>, username: string) {
  const userId = String(authUser?.id || '');
  if (!userId) return false;

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('profiles')
    .select('id, username, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfileError) return false;
  if (existingProfile?.id) {
    return existingProfile.username === username && existingProfile.is_active;
  }

  const { error: insertProfileError } = await adminClient.from('profiles').insert({
    id: userId,
    username,
    display_name: username,
    avatar_url: '',
    role: 'member',
    is_active: true
  });
  if (insertProfileError) return false;

  const { error: columnsError } = await adminClient.from('learning_columns').upsert(
    [
      { user_id: userId, name: '英语', column_order: 1 },
      { user_id: userId, name: '组成原理', column_order: 2 },
      { user_id: userId, name: '线性代数', column_order: 3 }
    ],
    { onConflict: 'user_id,name' }
  );

  return !columnsError;
}

function sessionPayload(tokenPayload: Record<string, unknown>) {
  return jsonResponse({
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    expires_in: tokenPayload.expires_in,
    expires_at: tokenPayload.expires_at,
    token_type: tokenPayload.token_type || 'bearer'
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Username login service is not configured' }, 500);
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return invalidLogin();
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  if (!username || !password) {
    return invalidLogin();
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, username, is_active')
    .eq('username', username)
    .maybeSingle();

  if (profileError) {
    return invalidLogin();
  }

  if (profile?.id) {
    if (!profile.is_active) return invalidLogin();

    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(profile.id);
    const email = authUser?.user?.email || '';
    if (authUserError || !email) return invalidLogin();

    const tokenPayload = await passwordGrant(supabaseUrl, anonKey, email, password);
    if (!tokenPayload?.access_token || !tokenPayload?.refresh_token) return invalidLogin();
    return sessionPayload(tokenPayload);
  }

  const dashboardEmail = dashboardEmailFor(username);
  const tokenPayload = await passwordGrant(supabaseUrl, anonKey, dashboardEmail, password);
  if (!tokenPayload?.access_token || !tokenPayload?.refresh_token) return invalidLogin();

  const authUser = tokenPayload.user || await getTokenUser(supabaseUrl, anonKey, tokenPayload.access_token);
  const profileReady = await ensureDashboardProfile(adminClient, authUser, username);
  if (!profileReady) return invalidLogin();

  return sessionPayload(tokenPayload);
});
