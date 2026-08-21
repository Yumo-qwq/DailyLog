import { createId } from '../utils.js';

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeImageRecord(image = {}, previewUrl = '') {
  const storagePath = image.storage_path || image.storagePath || '';
  return {
    id: storagePath || image.id || createId(),
    storage_path: storagePath,
    name: image.file_name || image.name || (storagePath ? storagePath.split('/').pop() : '图片'),
    content_type: image.content_type || image.contentType || 'image/webp',
    size_bytes: Number(image.size_bytes || image.sizeBytes || 0),
    previewUrl: image.previewUrl || image.signedUrl || image.url || previewUrl || '',
    created_at: image.created_at || nowIso()
  };
}

export function normalizeCellRecord(cell = null) {
  if (!cell) return null;

  const content = String(cell.content || '').trim();
  const images = Array.isArray(cell.images) ? cell.images.map((item) => normalizeImageRecord(item)).filter(Boolean) : [];

  if (!content && images.length === 0) return null;

  return {
    content,
    images,
    created_at: cell.created_at || nowIso(),
    updated_at: cell.updated_at || nowIso()
  };
}

export function hasCellData(cell) {
  return Boolean((cell?.content || '').trim() || (cell?.images || []).length);
}

export function imageSignature(images = []) {
  return images
    .map((item) => item.storage_path || item.id || item.previewUrl || item.dataUrl || '')
    .join('|');
}

export function flattenCellImages(entries = {}) {
  return Object.values(entries).flatMap((cell) => cell?.images || []);
}

export function buildContentSummary(entries = {}, columns = []) {
  return columns
    .map((column) => {
      const cell = normalizeCellRecord(entries[column.id]);
      if (cell?.content) return `${column.name}：${cell.content.slice(0, 14)}`;
      if (cell?.images?.length) return `${column.name}：图片${cell.images.length}张`;
      return '';
    })
    .filter(Boolean)
    .join('；');
}

function buildLogRecord(log = {}) {
  return {
    id: log.id || createId(),
    user_id: log.user_id || '',
    user_name: log.user_name || '',
    checkin_id: log.checkin_id || '',
    date: log.date || '',
    column_id: log.column_id || '',
    column_name: log.column_name || '',
    action: log.action || 'update',
    summary: log.summary || '',
    created_at: log.created_at || nowIso()
  };
}

function sortCheckins(items = []) {
  return [...items].sort((a, b) => `${b.date}T${b.updated_at}`.localeCompare(`${a.date}T${a.updated_at}`));
}

function sortColumns(items = []) {
  return [...items].sort((a, b) => (a.column_order ?? a.order ?? 0) - (b.column_order ?? b.order ?? 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

export function buildStateSnapshot({
  profiles = [],
  learningColumns = [],
  checkins = [],
  checkinEntries = [],
  checkinImages = [],
  activityLogs = [],
  sessionUserId = null,
  signedUrlsByPath = new Map(),
  profileAvatarsByUserId = new Map()
} = {}) {
  const columnsByUser = new Map();
  for (const column of learningColumns) {
    const nextColumn = { ...column };
    if (!columnsByUser.has(nextColumn.user_id)) columnsByUser.set(nextColumn.user_id, []);
    columnsByUser.get(nextColumn.user_id).push(nextColumn);
  }

  for (const [userId, items] of columnsByUser.entries()) {
    columnsByUser.set(userId, sortColumns(items));
  }

  const entryByCell = new Map();
  for (const row of checkinEntries) {
    entryByCell.set(`${row.checkin_id}:${row.column_id}`, { ...row });
  }

  const imagesByCell = new Map();
  for (const row of checkinImages) {
    const key = `${row.checkin_id}:${row.column_id}`;
    if (!imagesByCell.has(key)) imagesByCell.set(key, []);
    imagesByCell.get(key).push({
      ...row,
      previewUrl: signedUrlsByPath.get(row.storage_path) || ''
    });
  }

  const nextCheckins = sortCheckins(checkins).map((checkin) => {
    const userColumns = columnsByUser.get(checkin.user_id) || [];
    const entries = {};

    for (const column of userColumns) {
      const key = `${checkin.id}:${column.id}`;
      const entryRow = entryByCell.get(key);
      const cellImages = (imagesByCell.get(key) || []).map((item) => normalizeImageRecord(item, signedUrlsByPath.get(item.storage_path) || ''));
      const normalized = normalizeCellRecord(entryRow);
      if (normalized || cellImages.length > 0) {
        entries[column.id] = {
          content: normalized?.content || '',
          images: cellImages,
          created_at: entryRow?.created_at || checkin.created_at || nowIso(),
          updated_at: entryRow?.updated_at || checkin.updated_at || nowIso()
        };
      }
    }

    return {
      ...clone(checkin),
      entries,
      images: flattenCellImages(entries),
      content: buildContentSummary(entries, userColumns) || String(checkin.content || ''),
      created_at: checkin.created_at || nowIso(),
      updated_at: checkin.updated_at || checkin.created_at || nowIso()
    };
  });

  return {
    users: profiles.map((item) => {
      const avatar = profileAvatarsByUserId.get(item.id) || {};
      const username = item.username || '';
      return {
        ...item,
        username,
        display_name: item.display_name || username || '成员',
        avatar_raw: avatar.rawAvatar || item.avatar_url || '',
        avatar_storage_path: avatar.storagePath || '',
        avatar_url: avatar.displayUrl || ''
      };
    }),
    learningColumns: sortColumns(learningColumns.map((item) => ({ ...item }))),
    checkins: nextCheckins,
    activityLogs: [...activityLogs].map(buildLogRecord).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    sessionUserId
  };
}
