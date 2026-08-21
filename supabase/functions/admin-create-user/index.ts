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

function assertUsername(username: string) {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new Error('用户名只能包含小写字母、数字和下划线，长度 3-32 位');
  }
}

function internalEmailFor(username: string) {
  const domain = Deno.env.get('DAILYLOG_INTERNAL_EMAIL_DOMAIN') || 'dailylog.local';
  return `${username}.${crypto.randomUUID()}@${domain}`;
}

function displayNameFor(value: unknown, username: string) {
  return String(value || '').trim() || username;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Admin create user service is not configured' }, 500);
  }

  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!bearer) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: requester, error: requesterError } = await adminClient.auth.getUser(bearer);
  if (requesterError || !requester?.user?.id) {
    return jsonResponse({ error: '登录状态无效' }, 401);
  }

  const { data: requesterProfile, error: requesterProfileError } = await adminClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', requester.user.id)
    .maybeSingle();

  if (requesterProfileError || requesterProfile?.role !== 'admin' || !requesterProfile.is_active) {
    return jsonResponse({ error: '需要管理员权限' }, 403);
  }

  let body: { username?: string; password?: string; role?: string; display_name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式不正确' }, 400);
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'member';
  const displayName = displayNameFor(body.display_name, username);

  try {
    assertUsername(username);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : '用户名不合法' }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ error: '密码至少 6 位' }, 400);
  }

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existingProfileError) {
    return jsonResponse({ error: existingProfileError.message }, 500);
  }
  if (existingProfile?.id) {
    return jsonResponse({ error: '用户名已存在' }, 409);
  }

  const email = internalEmailFor(username);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName
    }
  });

  if (createError || !created?.user?.id) {
    return jsonResponse({ error: createError?.message || '创建账号失败' }, 400);
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .update({
      display_name: displayName,
      role,
      is_active: true
    })
    .eq('id', created.user.id)
    .select('id, username, display_name, avatar_url, role, is_active, created_at')
    .single();

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileError.message }, 500);
  }

  return jsonResponse({ profile });
});
