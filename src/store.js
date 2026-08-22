import { buildHeatmap, computeStreak, createId, todayKey } from './utils.js';

const KEY = 'dailylog-state-v1';
const DRAFT_KEY = 'dailylog-draft-v1';
const MAX_ACTIVITY_LOGS = 240;

const DEFAULT_COLUMNS = [
  { suffix: 'english', name: '英语', order: 1 },
  { suffix: 'computer-organization', name: '组成原理', order: 2 },
  { suffix: 'linear-algebra', name: '线性代数', order: 3 }
];

function nowIso() {
  return new Date().toISOString();
}

function seedTimestamp(dateKey, time = '09:00:00') {
  return new Date(`${dateKey}T${time}+08:00`).toISOString();
}

function daysAgo(baseDate, amount) {
  const date = new Date(`${baseDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - amount);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function defaultColumnsForUser(userId, timestamp = nowIso()) {
  return DEFAULT_COLUMNS.map((item) => ({
    id: `${userId}-${item.suffix}`,
    user_id: userId,
    name: item.name,
    order: item.order,
    created_at: timestamp
  }));
}

function createCell(content = '', images = [], timestamp = nowIso()) {
  return {
    content,
    images,
    created_at: timestamp,
    updated_at: timestamp
  };
}

function normalizeImage(image, fallbackTimestamp = nowIso()) {
  if (!image) return null;
  if (typeof image === 'string') {
    return {
      id: createId(),
      name: '图片',
      dataUrl: image,
      previewUrl: image,
      created_at: fallbackTimestamp
    };
  }

  const dataUrl = image.dataUrl || image.previewUrl || image.url || '';
  return {
    id: image.id || createId(),
    name: image.name || '图片',
    dataUrl,
    previewUrl: image.previewUrl || dataUrl,
    created_at: image.created_at || fallbackTimestamp
  };
}

function normalizeCell(value, fallbackTimestamp = nowIso()) {
  if (!value) return null;

  if (typeof value === 'string') {
    const content = value.trim();
    return content ? createCell(content, [], fallbackTimestamp) : null;
  }

  const content = String(value.content || '').trim();
  const images = Array.isArray(value.images)
    ? value.images.map((item) => normalizeImage(item, fallbackTimestamp)).filter(Boolean)
    : [];

  if (!content && images.length === 0) return null;

  return {
    content,
    images,
    created_at: value.created_at || fallbackTimestamp,
    updated_at: value.updated_at || fallbackTimestamp
  };
}

function flattenImagesFromEntries(entries = {}) {
  return Object.values(entries).flatMap((cell) => cell?.images || []);
}

function cellSummaryText(column, cell) {
  const content = cell?.content?.trim() || '';
  if (content) return `${column.name}：${content}`;
  const count = cell?.images?.length || 0;
  if (count) return `${column.name}：图片${count}张`;
  return '';
}

function buildContentSummary(entries, columns) {
  return columns
    .map((column) => cellSummaryText(column, entries[column.id]))
    .filter(Boolean)
    .join('；');
}

function parseLegacySummary(content) {
  const result = {};
  if (!content) return result;
  const parts = String(content)
    .split(/[；;]\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const part of parts) {
    const separatorIndex = part.includes('：') ? part.indexOf('：') : part.indexOf(':');
    if (separatorIndex <= 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name && value) result[name] = value;
  }

  return result;
}

function normalizeCheckinRecord(state, record) {
  const timestamp = record.updated_at || record.created_at || nowIso();
  const columns = getLearningColumns(state, record.user_id);
  const legacyMap = parseLegacySummary(record.content);
  const entries = {};

  if (record.entries && typeof record.entries === 'object') {
    for (const [columnId, value] of Object.entries(record.entries)) {
      const cell = normalizeCell(value, timestamp);
      if (cell) entries[columnId] = cell;
    }
  } else if (Object.keys(legacyMap).length > 0) {
    for (const column of columns) {
      const content = legacyMap[column.name];
      if (content) entries[column.id] = createCell(content, [], timestamp);
    }
  } else if (record.content) {
    const firstColumn = columns[0];
    if (firstColumn) entries[firstColumn.id] = createCell(String(record.content).trim(), [], timestamp);
  }

  const legacyImages = Array.isArray(record.images)
    ? record.images.map((item) => normalizeImage(item, timestamp)).filter(Boolean)
    : [];

  if (legacyImages.length > 0) {
    const targetColumnId = Object.keys(entries)[0] || columns[0]?.id;
    if (targetColumnId) {
      const target = entries[targetColumnId] || createCell('', [], timestamp);
      if (!target.images.length) {
        target.images = legacyImages;
        target.updated_at = target.updated_at || timestamp;
      }
      entries[targetColumnId] = target;
    }
  }

  const normalized = {
    ...record,
    entries,
    images: flattenImagesFromEntries(entries),
    content: buildContentSummary(entries, columns) || String(record.content || '').trim(),
    created_at: record.created_at || timestamp,
    updated_at: timestamp
  };

  return normalized;
}

function buildSeedLogsForCheckin(userName, checkin) {
  const columns = getLearningColumns({ learningColumns: checkin._seedColumns || [] }, checkin.user_id);
  const logs = [];
  const stamp = checkin.updated_at;
  for (const [columnId, cell] of Object.entries(checkin.entries || {})) {
    const column = columns.find((item) => item.id === columnId);
    if (!column) continue;
    logs.push({
      id: createId(),
      user_id: checkin.user_id,
      user_name: userName,
      checkin_id: checkin.id,
      date: checkin.date,
      column_id: column.id,
      column_name: column.name,
      action: 'seed',
      summary: cellSummaryText(column, cell) || `${column.name} 已初始化`,
      created_at: stamp
    });
  }
  return logs;
}

function normalizeActivityLog(log) {
  return {
    id: log.id || createId(),
    user_id: log.user_id || '',
    user_name: log.user_name || '',
    checkin_id: log.checkin_id || '',
    date: log.date || todayKey(),
    column_id: log.column_id || '',
    column_name: log.column_name || '',
    action: log.action || 'update',
    summary: log.summary || '',
    created_at: log.created_at || nowIso()
  };
}

function recordActivity(state, logs = []) {
  if (!logs.length) return;
  const normalized = logs.map(normalizeActivityLog);
  state.activityLogs = [...normalized, ...(state.activityLogs || [])].slice(0, MAX_ACTIVITY_LOGS);
}

function seedState() {
  const current = todayKey();
  const users = [
    {
      id: 'u-admin',
      username: 'admin',
      display_name: 'admin',
      avatar_url: '',
      role: 'admin',
      is_active: true,
      created_at: nowIso()
    },
    {
      id: 'u-alice',
      username: 'alice',
      display_name: 'alice',
      avatar_url: '',
      role: 'member',
      is_active: true,
      created_at: nowIso()
    },
    {
      id: 'u-bob',
      username: 'bob',
      display_name: 'bob',
      avatar_url: '',
      role: 'member',
      is_active: true,
      created_at: nowIso()
    },
    {
      id: 'u-charlie',
      username: 'charlie',
      display_name: 'charlie',
      avatar_url: '',
      role: 'member',
      is_active: true,
      created_at: nowIso()
    }
  ];

  const learningColumns = users.flatMap((user) => defaultColumnsForUser(user.id, seedTimestamp(current, '08:00:00')));
  const plans = {
    'u-alice': [
      { english: '复习', computer: '总线', algebra: '行列式' },
      { english: '听力 20 分钟', computer: 'CPU 指令', algebra: '矩阵乘法' },
      { english: '单词 80 个', computer: '存储层次', algebra: '线性方程组' }
    ],
    'u-bob': [
      { english: '阅读短文', computer: '流水线', algebra: '向量空间' },
      { english: '语法整理', computer: '缓存', algebra: '特征值' },
      { english: '口语跟读', computer: 'I/O 系统', algebra: '矩阵分解' }
    ],
    'u-charlie': [
      { english: '翻译练习', computer: '中断', algebra: '秩' },
      { english: '长难句', computer: '总线协议', algebra: '基变换' },
      { english: '阅读理解', computer: '寻址方式', algebra: '正交' }
    ]
  };

  const minutes = [120, 90, 150, 180, 75, 135];
  const checkins = [];
  const activityLogs = [];
  let index = 0;

  for (const user of users.filter((item) => item.role === 'member')) {
    for (let day = 0; day < 14; day += 1) {
      if ((day + index) % 4 === 0) continue;
      const date = daysAgo(current, day);
      const createdAt = seedTimestamp(date, '09:10:00');
      const updatedAt = seedTimestamp(date, '09:20:00');
      const plan = plans[user.id][(day + index) % plans[user.id].length];
      const entries = {
        [`${user.id}-english`]: createCell(plan.english, [], updatedAt),
        [`${user.id}-computer-organization`]: createCell(plan.computer, [], updatedAt),
        [`${user.id}-linear-algebra`]: createCell(plan.algebra, [], updatedAt)
      };
      const checkin = {
        id: createId(),
        user_id: user.id,
        date,
        content: buildContentSummary(entries, learningColumns.filter((item) => item.user_id === user.id)),
        entries,
        study_minutes: minutes[(day + index) % minutes.length],
        created_at: createdAt,
        updated_at: updatedAt,
        images: flattenImagesFromEntries(entries)
      };
      checkins.push(checkin);
      activityLogs.push(...buildSeedLogsForCheckin(user.display_name, { ...checkin, _seedColumns: learningColumns }));
    }
    index += 1;
  }

  return {
    users,
    learningColumns,
    checkins,
    activityLogs,
    sessionUserId: 'u-alice'
  };
}

function ensureTableShape(state) {
  state.users = Array.isArray(state.users) ? state.users : [];
  state.learningColumns = Array.isArray(state.learningColumns) ? state.learningColumns : [];
  state.checkins = Array.isArray(state.checkins) ? state.checkins : [];
  state.activityLogs = Array.isArray(state.activityLogs) ? state.activityLogs : [];

  // Remove password remnants from older local demo snapshots.
  for (const user of state.users) delete user.password;

  for (const user of state.users) {
    const userColumns = state.learningColumns.filter((item) => item.user_id === user.id);
    if (userColumns.length === 0) {
      state.learningColumns.push(...defaultColumnsForUser(user.id));
    }
  }

  state.checkins = state.checkins.map((record) => normalizeCheckinRecord(state, record));
  state.activityLogs = state.activityLogs.map(normalizeActivityLog);

  if (state.activityLogs.length === 0) {
    state.activityLogs = state.checkins.flatMap((record) => {
      const user = getProfile(state, record.user_id);
      const columns = getLearningColumns(state, record.user_id);
      return Object.entries(record.entries || {})
        .map(([columnId, cell]) => {
          const column = columns.find((item) => item.id === columnId);
          if (!column) return null;
          return {
            id: createId(),
            user_id: record.user_id,
            user_name: user?.display_name || '',
            checkin_id: record.id,
            date: record.date,
            column_id: column.id,
            column_name: column.name,
            action: 'seed',
            summary: cellSummaryText(column, cell) || `${column.name} 已初始化`,
            created_at: cell?.updated_at || record.updated_at || record.created_at || nowIso()
          };
        })
        .filter(Boolean);
    });
  }

  state.activityLogs = state.activityLogs.slice(0, MAX_ACTIVITY_LOGS);
  return state;
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const state = seedState();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.users || !parsed.checkins) throw new Error('invalid state');
    const migrated = ensureTableShape(parsed);
    localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const state = seedState();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getLearningColumns(state, userId) {
  return (state.learningColumns || [])
    .filter((item) => item.user_id === userId)
    .sort((a, b) => a.order - b.order || a.created_at.localeCompare(b.created_at));
}

export function getActivityLogs(state, limit = 40) {
  return [...(state.activityLogs || [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export function createLearningColumn(state, userId, name) {
  const user = getProfile(state, userId);
  if (!user || !user.is_active) throw new Error('用户不可用');
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('请填写列名');

  const columns = getLearningColumns(state, userId);
  if (columns.some((item) => item.name === trimmed)) throw new Error('这个列名已经存在');

  const timestamp = nowIso();
  const column = {
    id: createId(),
    user_id: userId,
    name: trimmed,
    order: columns.length ? Math.max(...columns.map((item) => item.order)) + 1 : 1,
    created_at: timestamp
  };

  state.learningColumns.push(column);
  recordActivity(state, [
    {
      user_id: userId,
      user_name: user.display_name,
      column_id: column.id,
      column_name: column.name,
      action: 'column-create',
      summary: `新增学习列「${column.name}」`,
      created_at: timestamp
    }
  ]);
  saveState(state);
  return column;
}

export function renameLearningColumn(state, userId, columnId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('请填写列名');
  const column = (state.learningColumns || []).find((item) => item.user_id === userId && item.id === columnId);
  if (!column) throw new Error('列不存在');

  const previousName = column.name;
  column.name = trimmed;
  const timestamp = nowIso();
  recordActivity(state, [
    {
      user_id: userId,
      user_name: getProfile(state, userId)?.display_name || '',
      column_id: column.id,
      column_name: column.name,
      action: 'column-rename',
      summary: `「${previousName}」改名为「${column.name}」`,
      created_at: timestamp
    }
  ]);
  saveState(state);
  return column;
}

export function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function getCurrentUser(state) {
  return state.users.find((item) => item.id === state.sessionUserId) || null;
}

export function getProfile(state, userId) {
  return state.users.find((item) => item.id === userId) || null;
}

export function isAdmin(user) {
  return Boolean(user && user.role === 'admin' && user.is_active);
}

export function isActive(user) {
  return Boolean(user && user.is_active);
}

export function findTodayCheckin(state, userId, currentDate = todayKey()) {
  return state.checkins.find((item) => item.user_id === userId && item.date === currentDate) || null;
}

export function getCellEntry(record, columnId) {
  return normalizeCell(record?.entries?.[columnId], record?.updated_at || nowIso());
}

export function metricsForUser(state, userId, currentDate = todayKey()) {
  const userCheckins = state.checkins.filter((item) => item.user_id === userId);
  const today = userCheckins.find((item) => item.date === currentDate) || null;
  const streak = computeStreak(state.checkins, userId, currentDate);
  return {
    total: userCheckins.length,
    streak,
    today,
    heatmap: buildHeatmap(state.checkins, userId, 84, currentDate)
  };
}

export function globalStats(state, currentDate = todayKey()) {
  const users = state.users.filter((item) => item.is_active);
  const totalCheckins = state.checkins.length;
  const todayCount = state.checkins.filter((item) => item.date === currentDate).length;
  const streaks = users.map((item) => computeStreak(state.checkins, item.id, currentDate));
  return {
    totalUsers: users.length,
    totalCheckins,
    todayCount,
    bestStreak: streaks.length ? Math.max(...streaks) : 0
  };
}

export function recentCheckins(state, limit = 8) {
  return [...state.checkins]
    .sort((a, b) => `${b.date}T${b.updated_at}`.localeCompare(`${a.date}T${a.updated_at}`))
    .slice(0, limit);
}

export function logout(state) {
  state.sessionUserId = null;
  saveState(state);
}

export function updateProfile(state, userId, payload) {
  const user = getProfile(state, userId);
  if (!user) throw new Error('用户不存在');

  const changes = [];
  if (payload.display_name && payload.display_name.trim() !== user.display_name) {
    changes.push(`昵称：${user.display_name} → ${payload.display_name.trim()}`);
    user.display_name = payload.display_name.trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'avatar_url') && payload.avatar_url !== user.avatar_url) {
    changes.push('头像已更新');
    user.avatar_url = payload.avatar_url;
  }

  if (changes.length > 0) {
    recordActivity(state, [
      {
        user_id: user.id,
        user_name: user.display_name,
        action: 'profile-update',
        summary: changes.join('；'),
        created_at: nowIso()
      }
    ]);
  }

  saveState(state);
  return user;
}

export function setUserActive(state, userId, isActive) {
  const user = getProfile(state, userId);
  if (!user) throw new Error('用户不存在');
  if (user.is_active === Boolean(isActive)) return user;

  user.is_active = Boolean(isActive);
  const timestamp = nowIso();
  recordActivity(state, [
    {
      user_id: user.id,
      user_name: user.display_name,
      action: user.is_active ? 'user-enable' : 'user-disable',
      summary: `${user.display_name} 已${user.is_active ? '启用' : '禁用'}`,
      created_at: timestamp
    }
  ]);
  saveState(state);
  return user;
}

export function createOrUpdateTodayCheckin(state, userId, payload) {
  const currentDate = todayKey();
  const user = getProfile(state, userId);
  if (!user || !user.is_active) throw new Error('用户不可用');

  const timestamp = nowIso();
  let record = findTodayCheckin(state, userId, currentDate);
  if (!record) {
    record = {
      id: payload.id || createId(),
      user_id: userId,
      date: currentDate,
      content: '',
      study_minutes: 0,
      created_at: timestamp,
      updated_at: timestamp,
      images: [],
      entries: {}
    };
    state.checkins.push(record);
  }

  const nextEntries = payload.entries && typeof payload.entries === 'object' ? payload.entries : record.entries || {};
  const columns = getLearningColumns(state, userId);
  const normalizedEntries = {};
  for (const column of columns) {
    const cell = normalizeCell(nextEntries[column.id], timestamp);
    if (cell) {
      normalizedEntries[column.id] = cell;
    }
  }

  if (payload.entries !== undefined) {
    record.entries = normalizedEntries;
  } else if (!record.entries) {
    record.entries = normalizedEntries;
  }

  if (payload.content !== undefined) {
    record.content = String(payload.content).trim();
  } else {
    record.content = buildContentSummary(record.entries, columns);
  }

  if (payload.study_minutes !== undefined) {
    record.study_minutes = Number(payload.study_minutes) || 0;
  } else {
    record.study_minutes = Object.values(record.entries || {}).filter((cell) => (cell?.content || cell?.images?.length)).length;
  }

  record.images = flattenImagesFromEntries(record.entries);
  record.updated_at = timestamp;

  if (Array.isArray(payload.logs) && payload.logs.length > 0) {
    recordActivity(state, payload.logs);
  }

  saveState(state);
  return record;
}

export function addImagesToCheckin(state, checkinId, images) {
  const record = state.checkins.find((item) => item.id === checkinId);
  if (!record) throw new Error('打卡不存在');
  const columns = getLearningColumns(state, record.user_id);
  const firstColumn = columns[0];
  if (!firstColumn) return record;

  const cell = normalizeCell(record.entries?.[firstColumn.id], record.updated_at || nowIso()) || createCell('', [], nowIso());
  cell.images = [...(cell.images || []), ...(images || []).map((item) => normalizeImage(item)).filter(Boolean)];
  cell.updated_at = nowIso();
  record.entries = record.entries || {};
  record.entries[firstColumn.id] = cell;
  record.images = flattenImagesFromEntries(record.entries);
  record.content = buildContentSummary(record.entries, columns);
  record.updated_at = nowIso();
  saveState(state);
  return record;
}

export function removeImageFromCheckin(state, checkinId, imageId) {
  const record = state.checkins.find((item) => item.id === checkinId);
  if (!record) throw new Error('打卡不存在');
  const columns = getLearningColumns(state, record.user_id);
  let changed = false;

  record.entries = record.entries || {};
  for (const [columnId, cell] of Object.entries(record.entries)) {
    const nextImages = (cell?.images || []).filter((item) => item.id !== imageId);
    if (nextImages.length !== (cell?.images || []).length) {
      record.entries[columnId] = {
        ...cell,
        images: nextImages,
        updated_at: nowIso()
      };
      changed = true;
    }
  }

  if (changed) {
    record.images = flattenImagesFromEntries(record.entries);
    record.content = buildContentSummary(record.entries, columns);
    record.updated_at = nowIso();
    saveState(state);
  }

  return record;
}

export function canCurrentUserEditRecord(state, record, currentDate = todayKey()) {
  const currentUser = getCurrentUser(state);
  return Boolean(currentUser && record && record.user_id === currentUser.id && record.date === currentDate && currentUser.is_active);
}

export function allowRecordMutation(state, record) {
  const currentUser = getCurrentUser(state);
  if (!currentUser || !record) return false;
  return currentUser.id === record.user_id && record.date === todayKey();
}

export function recordImages(record) {
  if (!record) return [];
  if (Array.isArray(record.images) && record.images.length > 0) return record.images;
  return flattenImagesFromEntries(record.entries || {});
}

export function allHistory(state, filters = {}) {
  const userId = filters.userId || 'all';
  const month = filters.month || 'all';
  return [...state.checkins]
    .filter((item) => userId === 'all' || item.user_id === userId)
    .filter((item) => month === 'all' || item.date.startsWith(month))
    .sort((a, b) => `${b.date}T${b.updated_at}`.localeCompare(`${a.date}T${a.updated_at}`));
}
