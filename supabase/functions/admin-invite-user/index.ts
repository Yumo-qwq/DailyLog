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
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function assertUsername(username: string) {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new Error('用户名只能包含小写字母、数字和下划线，长度 3-32 位');
  }
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('请输入有效的邮箱地址');
  }
}

function displayNameFor(value: unknown, username: string) {
  return String(value || '').trim() || username;
}

function inviteRedirectTo() {
  const appUrl = Deno.env.get('DAILYLOG_APP_URL') || '';
  if (!appUrl) throw new Error('DAILYLOG_APP_URL is not configured');
  return new URL('/set-password', appUrl).toString();
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
    return jsonResponse({ error: 'Admin invite service is not configured' }, 500);
  }

  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!bearer) return jsonResponse({ error: '未登录' }, 401);

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

  let body: { email?: string; username?: string; role?: string; display_name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式不正确' }, 400);
  }

  const email = normalizeEmail(body.email);
  const username = normalizeUsername(body.username);
  const role = body.role === 'admin' ? 'admin' : 'member';
  const displayName = displayNameFor(body.display_name, username);

  try {
    assertEmail(email);
    assertUsername(username);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : '邀请信息不合法' }, 400);
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

  const options: Record<string, unknown> = {
    data: {
      username,
      display_name: displayName
    }
  };
  try {
    options.redirectTo = inviteRedirectTo();
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : '邀请回调地址未配置' }, 500);
  }

  // Supabase generates and stores the credential internally. This endpoint never receives a password.
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, options);
  if (inviteError || !invited?.user?.id) {
    return jsonResponse({ error: inviteError?.message || '发送邀请失败' }, 400);
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .update({
      display_name: displayName,
      role,
      is_active: true
    })
    .eq('id', invited.user.id)
    .select('id, username, display_name, avatar_url, role, is_active, created_at')
    .single();

  if (profileError || !profile || profile.username !== username) {
    await adminClient.auth.admin.deleteUser(invited.user.id);
    return jsonResponse({ error: profileError?.message || '用户资料创建失败' }, 500);
  }

  return jsonResponse({ profile, invitation_sent: true });
});
