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

async function blobToDataUrl(blob) {
  return await fileToDataUrl(blob);
}

async function fileToDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }

  const dataUrl = await fileToDataUrl(file);
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = dataUrl;
  });
}

async function canvasToBlob(canvas, quality) {
  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1).replace(/\.0$/, '')}MB`;
  }
  if (value >= 1024) {
    return `${Math.ceil(value / 1024)}KB`;
  }
  return `${value}B`;
}

export async function compressImage(file, maxSize = 1600, quality = 0.82, targetBytes = 1048576) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const source = await fileToDrawable(file);
  const sourceWidth = source.width || source.naturalWidth || 1;
  const sourceHeight = source.height || source.naturalHeight || 1;
  const qualitySteps = [quality, 0.72, 0.62, 0.52, 0.42];
  let currentMaxSize = maxSize;
  const minMaxSize = Math.min(96, Math.max(1, maxSize));
  let best = null;

  while (currentMaxSize >= minMaxSize) {
    const ratio = Math.min(1, currentMaxSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, width, height);

    for (const stepQuality of qualitySteps) {
      const blob = await canvasToBlob(canvas, stepQuality);
      if (!blob || blob.type !== 'image/webp') {
        throw new Error('当前浏览器不支持 WebP 图片压缩');
      }

      const candidate = { blob, width, height };
      if (!best || candidate.blob.size < best.blob.size) best = candidate;
      if (blob.size <= targetBytes) {
        if (typeof source.close === 'function') source.close();
        const dataUrl = await blobToDataUrl(blob);
        return {
          dataUrl,
          previewUrl: dataUrl,
          sizeBytes: blob.size,
          contentType: blob.type,
          width,
          height
        };
      }
    }

    currentMaxSize = Math.floor(currentMaxSize * 0.82);
  }

  if (typeof source.close === 'function') source.close();
  if (best?.blob && best.blob.size <= targetBytes) {
    const dataUrl = await blobToDataUrl(best.blob);
    return {
      dataUrl,
      previewUrl: dataUrl,
      sizeBytes: best.blob.size,
      contentType: best.blob.type,
      width: best.width,
      height: best.height
    };
  }

  throw new Error(`图片压缩后仍超过 ${formatFileSize(targetBytes)}，请选择更小的图片`);
}
