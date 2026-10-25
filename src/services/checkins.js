import { supabase } from '../lib/supabase.js';
import { todayKey, createId } from '../utils.js';
import { buildContentSummary, buildStateSnapshot, hasCellData, normalizeCellRecord } from './model.js';
import { resolveSignedImageUrls, syncCheckinImages } from './checkinImages.js';
import { resolveProfileAvatars } from './profileAvatars.js';

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

function emptyRemoteState() {
  return {
    users: [],
    learningColumns: [],
    checkins: [],
    activityLogs: [],
    sessionUserId: null
  };
}

async function getSessionUserId() {
  ensureSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user?.id || null;
}

async function fetchTable(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function ensureOwnDefaultLearningColumns(userId, columnRows) {
  if (columnRows.some((column) => column.user_id === userId)) return columnRows;

  const defaults = ['英语', '组成原理', '线性代数'].map((name, index) => ({
    user_id: userId,
    name,
    column_order: index + 1
  }));
  const { error } = await supabase
    .from('learning_columns')
    .upsert(defaults, { onConflict: 'user_id,name', ignoreDuplicates: true });
  if (error) throw error;

  return await fetchTable(
    supabase
      .from('learning_columns')
      .select('*')
      .order('user_id', { ascending: true })
      .order('column_order', { ascending: true })
      .order('created_at', { ascending: true })
  );
}

function restoreProfilesMissingFromLegacyRpc(profileRows, columnRows, checkinRows, logRows) {
  const result = [...profileRows];
  const visibleIds = new Set(result.map((profile) => profile.id));
  const referencedIds = new Set([
    ...columnRows.map((column) => column.user_id),
    ...checkinRows.map((checkin) => checkin.user_id),
    ...logRows.map((log) => log.user_id)
  ].filter(Boolean));

  for (const userId of referencedIds) {
    if (visibleIds.has(userId)) continue;
    const displayName = logRows.find((log) => log.user_id === userId && log.user_name)?.user_name || '管理员';
    result.push({
      id: userId,
      display_name: displayName,
      avatar_url: '',
      role: 'admin',
      is_active: true,
      created_at: ''
    });
    visibleIds.add(userId);
  }

  return result;
}

export async function loadRemoteState() {
  ensureSupabase();

  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return emptyRemoteState();

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, role, is_active, created_at')
    .eq('id', sessionUserId)
    .single();

  if (currentProfileError) throw currentProfileError;
  if (!currentProfile || !currentProfile.is_active) {
    throw new Error('账号不存在或已被禁用');
  }

  const profileQuery = currentProfile.role === 'admin'
    ? supabase.from('profiles').select('id, username, display_name, avatar_url, role, is_active, created_at').order('created_at', { ascending: true })
    : supabase.rpc('member_profiles');

  let [visibleProfileRows, columnRows, checkinRows, entryRows, imageRows, logRows] = await Promise.all([
    fetchTable(profileQuery),
    fetchTable(supabase.from('learning_columns').select('*').order('user_id', { ascending: true }).order('column_order', { ascending: true }).order('created_at', { ascending: true })),
    fetchTable(supabase.from('checkins').select('*').order('date', { ascending: false }).order('updated_at', { ascending: false })),
    fetchTable(supabase.from('checkin_entries').select('*').order('created_at', { ascending: true })),
    fetchTable(supabase.from('checkin_images').select('*').order('created_at', { ascending: true })),
    fetchTable(supabase.from('checkin_change_logs').select('*').order('created_at', { ascending: false }))
  ]);

  columnRows = await ensureOwnDefaultLearningColumns(sessionUserId, columnRows);

  let profileRows = currentProfile.role === 'admin'
    ? visibleProfileRows
    : visibleProfileRows.map((profile) => (profile.id === sessionUserId ? { ...profile, username: currentProfile.username } : profile));
  if (currentProfile.role !== 'admin') {
    profileRows = restoreProfilesMissingFromLegacyRpc(profileRows, columnRows, checkinRows, logRows);
  }

  const [signedUrls, profileAvatars] = await Promise.all([
    resolveSignedImageUrls(imageRows),
    resolveProfileAvatars(profileRows)
  ]);
  return buildStateSnapshot({
    profiles: profileRows,
    learningColumns: columnRows,
    checkins: checkinRows,
    checkinEntries: entryRows,
    checkinImages: imageRows,
    activityLogs: logRows,
    sessionUserId,
    signedUrlsByPath: signedUrls,
    profileAvatarsByUserId: profileAvatars
  });
}

async function ensureTodayCheckinRecord(userId) {
  ensureSupabase();
  const currentDate = todayKey();

  const { data: existing, error: selectError } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', currentDate)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from('checkins')
    .insert({
      id: createId(),
      user_id: userId,
      date: currentDate,
      content: '',
      study_minutes: 0
    })
    .select('*')
    .single();

  if (!insertError) return inserted;
  if (insertError.code !== '23505') throw insertError;

  const { data: racedExisting, error: racedSelectError } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', currentDate)
    .single();

  if (racedSelectError) throw racedSelectError;
  return racedExisting;
}

export async function createTodayCheckinIfNeeded(userId) {
  return await ensureTodayCheckinRecord(userId);
}

export async function markTodayCheckin() {
  ensureSupabase();
  const { data, error } = await supabase.rpc('mark_today_checkin');
  if (error) throw error;
  return data;
}

export async function saveTodayCheckin({
  userId,
  columns = [],
  entries = {},
  logs = [],
  studyMinutes = null,
  changedColumnIds = null,
  imageChangedColumnIds = null
}) {
  ensureSupabase();
  const currentDate = todayKey();
  const checkin = await ensureTodayCheckinRecord(userId);
  const savedAt = new Date().toISOString();
  const nextEntries = {};
  const changedIds = new Set(changedColumnIds || columns.map((column) => column.id));
  const imageChangedIds = new Set(imageChangedColumnIds || changedIds);
  const changedColumns = columns.filter((column) => changedIds.has(column.id));

  for (const column of columns) {
    const desiredCell = normalizeCellRecord(entries[column.id]);
    if (desiredCell) {
      nextEntries[column.id] = {
        ...desiredCell,
        updated_at: changedIds.has(column.id) ? savedAt : desiredCell.updated_at
      };
    }
  }

  if (changedColumns.length > 0) {
    const entryPayloads = changedColumns.map((column) => ({
      checkin_id: checkin.id,
      column_id: column.id,
      content: nextEntries[column.id]?.content || ''
    }));
    const { data: savedEntryRows, error: entryError } = await supabase
      .from('checkin_entries')
      .upsert(entryPayloads, { onConflict: 'checkin_id,column_id' })
      .select('*');
    if (entryError) throw entryError;
    for (const row of savedEntryRows || []) {
      if (!nextEntries[row.column_id]) continue;
      nextEntries[row.column_id].created_at = row.created_at;
      nextEntries[row.column_id].updated_at = row.updated_at;
    }
  }

  const imageResults = await Promise.all(
    changedColumns.filter((column) => imageChangedIds.has(column.id)).map(async (column) => [
      column.id,
      await syncCheckinImages({
        userId,
        checkinId: checkin.id,
        columnId: column.id,
        images: nextEntries[column.id]?.images || []
      })
    ])
  );
  for (const [columnId, images] of imageResults) {
    if (nextEntries[columnId]) nextEntries[columnId].images = images;
  }

  const summary = buildContentSummary(nextEntries, columns);
  const nextStudyMinutes = typeof studyMinutes === 'number'
    ? studyMinutes
    : Object.values(nextEntries).filter((cell) => hasCellData(cell)).length;

  const { data: savedCheckin, error: checkinUpdateError } = await supabase
    .from('checkins')
    .update({
      content: summary,
      study_minutes: nextStudyMinutes,
      checked_in_at: checkin.checked_in_at || savedAt,
      updated_at: savedAt
    })
    .eq('id', checkin.id)
    .select('*')
    .single();
  if (checkinUpdateError) throw checkinUpdateError;

  let savedLogs = [];
  if (Array.isArray(logs) && logs.length > 0) {
    const logRows = logs.map((log) => ({
      checkin_id: checkin.id,
      column_id: log.column_id || null,
      user_id: log.user_id || userId,
      date: log.date || currentDate,
      user_name: log.user_name || '',
      column_name: log.column_name || '',
      action: log.action || 'update',
      summary: log.summary || '',
      created_at: log.created_at || new Date().toISOString()
    }));
    const { data, error: logError } = await supabase.from('checkin_change_logs').insert(logRows).select('*');
    if (logError) throw logError;
    savedLogs = data || [];
  }

  return {
    checkinId: checkin.id,
    checkin: savedCheckin,
    entries: nextEntries,
    logs: savedLogs
  };
}

export async function createLearningColumn(userId, name, order = null) {
  ensureSupabase();
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('请填写列名');

  const payload = {
    user_id: userId,
    name: trimmed,
    column_order: Number.isFinite(order) ? order : 0
  };

  const { data, error } = await supabase.from('learning_columns').insert(payload).select('*').single();
  if (error) throw error;
  const change = await recordTodayChangeLog({
    userId,
    columnId: data.id,
    columnName: data.name,
    action: 'column-create',
    summary: `新增学习列「${data.name}」`
  });
  return { column: data, ...change };
}

export async function renameLearningColumn(userId, columnId, name, previousName = '') {
  ensureSupabase();
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('请填写列名');

  const { data, error } = await supabase.from('learning_columns').update({ name: trimmed }).eq('id', columnId).select('*').single();
  if (error) throw error;
  const change = await recordTodayChangeLog({
    userId,
    columnId: data.id,
    columnName: data.name,
    action: 'column-rename',
    summary: previousName ? `「${previousName}」改名为「${data.name}」` : `列名改为「${data.name}」`
  });
  return { column: data, ...change };
}

export async function reorderLearningColumns(userId, orderedColumns = []) {
  ensureSupabase();
  const columns = Array.isArray(orderedColumns) ? orderedColumns : [];
  if (!columns.length) return [];
  if (columns.some((column) => !column?.id || column.user_id !== userId)) {
    throw new Error('列顺序数据无效');
  }

  const payload = columns.map((column, index) => ({
    id: column.id,
    user_id: userId,
    name: column.name,
    column_order: index + 1
  }));

  const { data, error } = await supabase
    .from('learning_columns')
    .upsert(payload, { onConflict: 'id' })
    .select('*');
  if (error) throw error;

  const change = await recordTodayChangeLog({
    userId,
    action: 'column-reorder',
    summary: `调整列顺序：${payload.map((column) => column.name).join('、')}`
  });
  return { columns: data || payload, ...change };
}

export async function updateProfile(userId, payload = {}) {
  ensureSupabase();
  const update = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'display_name')) update.display_name = String(payload.display_name || '').trim();
  if (Object.prototype.hasOwnProperty.call(payload, 'avatar_url')) update.avatar_url = String(payload.avatar_url || '').trim();

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select('id, username, display_name, avatar_url, role, is_active, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function recordTodayChangeLog({ userId, columnId = null, columnName = '', action = 'update', summary = '' }) {
  ensureSupabase();
  const checkin = await ensureTodayCheckinRecord(userId);
  const { data, error } = await supabase.from('checkin_change_logs').insert({
    checkin_id: checkin.id,
    column_id: columnId,
    user_id: userId,
    date: todayKey(),
    user_name: '',
    column_name: columnName,
    action,
    summary,
    created_at: new Date().toISOString()
  }).select('*').single();
  if (error) throw error;
  return { checkin, log: data };
}
