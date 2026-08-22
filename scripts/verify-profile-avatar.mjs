import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/g)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.DAILYLOG_TEST_EMAIL || '';
const password = process.env.DAILYLOG_TEST_PASSWORD || '';

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: headers.Authorization || `Bearer ${key}`,
      Accept: 'application/json',
      ...headers
    },
    body
  });

  const contentType = response.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text();
  }

  return { status: response.status, ok: response.ok, payload };
}

async function signIn() {
  return await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

async function getAuthUser(accessToken) {
  const result = await request('/auth/v1/user', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return result.ok ? result.payload : null;
}

function tempPngBlob() {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Z8ZkAAAAASUVORK5CYII=';
  return new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' });
}

const auth = await signIn();
if (!auth.ok || !auth.payload?.access_token) {
  throw new Error(`Login failed: ${JSON.stringify(auth.payload)}`);
}

const token = auth.payload.access_token;
const authUser = auth.payload.user || (await getAuthUser(token));
const userId = authUser?.id || authUser?.user?.id || '';
const authHeaders = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const currentProfile = await request(`/rest/v1/profiles?select=id,display_name,avatar_url&id=eq.${encodeURIComponent(userId)}`, {
  headers: authHeaders
});

const previousAvatarUrl = currentProfile.ok ? currentProfile.payload?.[0]?.avatar_url || '' : '';
const path = `${userId}/avatar-probe-${Date.now()}.png`;
const form = new FormData();
form.append('', tempPngBlob());
form.append('cacheControl', '3600');

const upload = await request(`/storage/v1/object/profile-avatars/${path}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'x-upsert': 'false'
  },
  body: form
});

let signed = null;
let profileUpdate = null;

if (upload.ok) {
  signed = await request(`/storage/v1/object/sign/profile-avatars/${path}`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ expiresIn: 60 })
  });

  profileUpdate = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders,
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      avatar_url: `storage:profile-avatars/${path}`
    })
  });
}

const restore = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
  method: 'PATCH',
  headers: {
    ...authHeaders,
    Prefer: 'return=representation'
  },
  body: JSON.stringify({
    avatar_url: previousAvatarUrl
  })
});

const cleanup = upload.ok
  ? await request(`/storage/v1/object/profile-avatars/${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
  : null;

await request('/auth/v1/logout', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});

console.log(
  JSON.stringify(
    {
      userId,
      previousAvatarUrl,
      upload,
      signed,
      profileUpdate,
      restore,
      cleanup
    },
    null,
    2
  )
);
