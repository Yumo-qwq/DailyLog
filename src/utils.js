export const STORAGE_KEY = 'dailylog-state-v1';
export const DRAFT_KEY = 'dailylog-draft-v1';
export const ZONE = 'Asia/Shanghai';

export function todayKey(timeZone = ZONE) {
  return formatDateKey(new Date(), timeZone);
}

export function formatDateKey(date, timeZone = ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function formatDate(dateLike, timeZone = ZONE) {
  const date = typeof dateLike === 'string' ? new Date(`${dateLike}T12:00:00Z`) : new Date(dateLike);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function formatDateTime(value, timeZone = ZONE) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

export function formatMinutes(value) {
  const minutes = Number(value) || 0;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }
  return `${minutes} 分`;
}

export function initials(name = '') {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1).toUpperCase();
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `id_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sortedDates(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function daysBetween(a, b) {
  const start = new Date(`${a}T12:00:00Z`);
  const end = new Date(`${b}T12:00:00Z`);
  return Math.round((end - start) / 86400000);
}

export function shiftDate(dateKey, delta, timeZone = ZONE) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDateKey(date, timeZone);
}

export function computeStreak(checkins, userId, currentDate = todayKey()) {
  const dates = new Set(checkins.filter((item) => item.user_id === userId).map((item) => item.date));
  let streak = 0;
  let cursor = currentDate;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function buildHeatmap(checkins, userId, days = 84, currentDate = todayKey()) {
  const countByDate = new Map();
  for (const item of checkins) {
    if (item.user_id !== userId) continue;
    countByDate.set(item.date, (countByDate.get(item.date) || 0) + 1);
  }

  const cells = [];
  const start = shiftDate(currentDate, -(days - 1));

  for (let i = 0; i < days; i += 1) {
    const key = shiftDate(start, i);
    const count = countByDate.get(key) || 0;
    let level = 0;
    if (count === 1) level = 1;
    else if (count === 2) level = 2;
    else if (count >= 3) level = 3;
    cells.push({ key, count, level });
  }

  return cells;
}

export function monthLabel(dateKey) {
  return dateKey.slice(0, 7);
}

export function toTimeString(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatClock(value, timeZone = ZONE) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

export function summarizeCheckin(checkin) {
  const imgCount = checkin.images?.length || 0;
  return {
    content: checkin.content?.slice(0, 32) || '暂无内容',
    minutes: formatMinutes(checkin.study_minutes || 0),
    images: imgCount
  };
}

export function createDemoImage(label = 'DailyLog') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="#eef4f6"/>
      <rect x="48" y="48" width="544" height="384" rx="24" fill="#ffffff" stroke="#d7e2e8"/>
      <rect x="92" y="92" width="200" height="18" rx="9" fill="#1f7ea4"/>
      <rect x="92" y="128" width="300" height="16" rx="8" fill="#b7c7d0"/>
      <rect x="92" y="164" width="440" height="214" rx="18" fill="#dfeaf0"/>
      <text x="92" y="410" font-family="Arial, sans-serif" font-size="24" fill="#36525f">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, maxSize = 1600, quality = 0.82) {
  if (typeof createImageBitmap !== 'function') {
    const dataUrl = await fileToDataUrl(file);
    return {
      dataUrl,
      previewUrl: dataUrl
    };
  }

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl) {
    const fallbackDataUrl = await fileToDataUrl(file);
    return {
      dataUrl: fallbackDataUrl,
      previewUrl: fallbackDataUrl
    };
  }

  return {
    dataUrl,
    previewUrl: dataUrl
  };
}
