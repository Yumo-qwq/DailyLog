import { readFileSync, existsSync } from 'node:fs';
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

function todayKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...headers
    },
    body
  });

  let payload = '';
  try {
    payload = await response.json();
  } catch {
    payload = await response.text();
  }

  return { status: response.status, ok: response.ok, payload };
}

async function probeTable(name, select) {
  return await request(`/rest/v1/${name}?select=${encodeURIComponent(select)}&limit=1`);
}

async function signInWithEmail() {
  if (!email || !password) return null;
  return await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

async function signIn() {
  return await signInWithEmail();
}

async function getAuthUser(accessToken) {
  const result = await request('/auth/v1/user', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return result.ok ? result.payload : null;
}

async function signOut(accessToken) {
  if (!accessToken) return;
  await request('/auth/v1/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
}

const tableChecks = {
  profiles: await probeTable('profiles', 'id,username,display_name,avatar_url,role,is_active,created_at'),
  checkins: await probeTable('checkins', 'id,user_id,date,content,study_minutes,checked_in_at,created_at,updated_at'),
  learning_columns: await probeTable('learning_columns', 'id,user_id,name,column_order,created_at'),
  checkin_entries: await probeTable('checkin_entries', 'id,checkin_id,column_id,content,created_at,updated_at'),
  checkin_images: await probeTable('checkin_images', 'id,checkin_id,column_id,storage_path,file_name,content_type,size_bytes,created_at'),
  checkin_change_logs: await probeTable('checkin_change_logs', 'id,checkin_id,column_id,user_id,date,user_name,column_name,action,summary,created_at'),
  old_images_column: await probeTable('checkin_entries', 'images')
};

const anonWrite = await request('/rest/v1/checkins', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({
    user_id: crypto.randomUUID(),
    date: todayKey(),
    content: 'anonymous should not write',
    study_minutes: 1
  })
});

const bucketProbe = await request('/storage/v1/bucket/checkin-images');

const auth = await signIn();
let memberChecks = null;

if (auth?.ok && auth.payload?.access_token) {
  const token = auth.payload.access_token;
  const authUser = await getAuthUser(token);
  const authUserId = authUser?.id || authUser?.user?.id || '';
  const tokenHeaders = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };

  const profileRead = await fetch(`${url}/rest/v1/profiles?select=id,username,display_name,role,is_active`, {
    headers: tokenHeaders
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.json().catch(async () => await response.text()) }));

  const memberProfilesRpc = await fetch(`${url}/rest/v1/rpc/member_profiles`, {
    method: 'POST',
    headers: {
      ...tokenHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.json().catch(async () => await response.text()) }));

  const ownTodayInsert = await fetch(`${url}/rest/v1/checkins`, {
    method: 'POST',
    headers: {
      ...tokenHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: authUserId,
      date: todayKey(),
      content: 'RLS probe',
      study_minutes: 1
    })
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.text() }));

  const pastInsert = await fetch(`${url}/rest/v1/checkins`, {
    method: 'POST',
    headers: {
      ...tokenHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: authUserId,
      date: todayKey(-1),
      content: 'past should fail',
      study_minutes: 1
    })
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.text() }));

  const futureInsert = await fetch(`${url}/rest/v1/checkins`, {
    method: 'POST',
    headers: {
      ...tokenHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: authUserId,
      date: todayKey(1),
      content: 'future should fail',
      study_minutes: 1
    })
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.text() }));

  const deleteProbe = await fetch(`${url}/rest/v1/checkins?user_id=eq.${encodeURIComponent(authUserId)}&date=eq.${encodeURIComponent(todayKey())}`, {
    method: 'DELETE',
    headers: tokenHeaders
  }).then(async (response) => ({ status: response.status, ok: response.ok, payload: await response.text() }));

  memberChecks = {
    loginOk: true,
    loginMode: 'email',
    userId: authUserId,
    canReadProfiles: profileRead.ok,
    profileRead,
    memberProfilesRpc,
    ownTodayInsert,
    pastInsert,
    futureInsert,
    deleteProbe
  };

  await signOut(token);
} else {
  memberChecks = {
    skipped: true,
    reason: 'Set DAILYLOG_TEST_EMAIL and DAILYLOG_TEST_PASSWORD to test logged-in permissions.'
  };
}

console.log(JSON.stringify({
  tables: Object.fromEntries(Object.entries(tableChecks).map(([name, result]) => [name, {
    status: result.status,
    ok: result.ok,
    rows: Array.isArray(result.payload) ? result.payload.length : 0,
    error: result.ok ? null : result.payload
  }])),
  anonWrite: {
    status: anonWrite.status,
    blocked: !anonWrite.ok,
    error: anonWrite.ok ? null : anonWrite.payload
  },
  bucketProbe: {
    status: bucketProbe.status,
    ok: bucketProbe.ok,
    payload: bucketProbe.payload
  },
  memberChecks
}, null, 2));
