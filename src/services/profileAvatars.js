import { profileAvatarBucketName, supabase } from '../lib/supabase.js';

const AVATAR_STORAGE_PREFIX = `storage:${profileAvatarBucketName}/`;
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('头像读取失败');
  return await response.blob();
}

function normalizeAvatarStorageError(error) {
  const message = String(error?.message || error || '');
  if (/bucket not found|nosuchbucket/i.test(message)) {
    return `Supabase Storage bucket "${profileAvatarBucketName}" 不存在，请先执行 supabase/migrations/002_profile_avatars.sql`;
  }
  if (/row-level security|permission denied|not allowed/i.test(message)) {
    return `头像 Storage 权限未配置好，请检查 profile-avatars 的 policy`;
  }
  return message || '头像 Storage 操作失败';
}

export function avatarStoragePathFromValue(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return '';
  if (raw.startsWith(AVATAR_STORAGE_PREFIX)) return raw.slice(AVATAR_STORAGE_PREFIX.length);
  if (raw.startsWith(`${profileAvatarBucketName}/`)) return raw.slice(profileAvatarBucketName.length + 1);
  return raw.includes('/') ? raw : '';
}

export function avatarStorageValue(path = '') {
  const cleanPath = String(path || '').trim();
  return cleanPath ? `${AVATAR_STORAGE_PREFIX}${cleanPath}` : '';
}

export async function resolveProfileAvatars(profileRows = [], expiresIn = 60 * 60) {
  ensureSupabase();

  const entries = await Promise.all(
    profileRows.map(async (profile) => {
      const rawAvatar = String(profile.avatar_url || '').trim();
      const storagePath = avatarStoragePathFromValue(rawAvatar);
      if (!storagePath) {
        return [
          profile.id,
          {
            rawAvatar,
            storagePath: '',
            displayUrl: rawAvatar
          }
        ];
      }

      try {
        const { data, error } = await supabase.storage.from(profileAvatarBucketName).createSignedUrl(storagePath, expiresIn);
        return [
          profile.id,
          {
            rawAvatar,
            storagePath,
            displayUrl: error ? (/^(?:https?:|data:)/i.test(rawAvatar) ? rawAvatar : '') : data?.signedUrl || ''
          }
        ];
      } catch {
        return [
          profile.id,
          {
            rawAvatar,
            storagePath,
            displayUrl: /^(?:https?:|data:)/i.test(rawAvatar) ? rawAvatar : ''
          }
        ];
      }
    })
  );

  return new Map(entries);
}

export async function uploadProfileAvatar({ userId, image }) {
  ensureSupabase();
  if (!userId) throw new Error('用户不存在');
  if (!image?.dataUrl && !image?.previewUrl) throw new Error('头像缺少内容');

  const blob = await dataUrlToBlob(image.dataUrl || image.previewUrl);
  const contentType = blob.type || 'image/webp';
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('头像格式仅支持 WebP、JPEG 或 PNG');
  }
  if (blob.size > MAX_AVATAR_BYTES) {
    throw new Error('头像不能超过 512KB');
  }

  const storagePath = `${userId}/avatar-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(profileAvatarBucketName).upload(storagePath, blob, {
    contentType,
    upsert: false
  });
  if (error) throw new Error(normalizeAvatarStorageError(error));

  return storagePath;
}

export async function deleteProfileAvatar(storagePath) {
  ensureSupabase();
  const path = avatarStoragePathFromValue(storagePath);
  if (!path) return;
  const { error } = await supabase.storage.from(profileAvatarBucketName).remove([path]);
  if (error) throw new Error(normalizeAvatarStorageError(error));
}
