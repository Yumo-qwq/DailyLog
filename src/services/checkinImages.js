import { createId } from '../utils.js';
import { supabase, supabaseBucketName } from '../lib/supabase.js';
import { normalizeImageRecord } from './model.js';

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase 未配置');
}

const MAX_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('图片读取失败');
  return await response.blob();
}

export function storagePathForImage({ userId, checkinId, image }) {
  const existingPath = image.storage_path || (typeof image.id === 'string' && image.id.includes('/') ? image.id : '');
  if (existingPath) return existingPath;
  const imageId = image.id || createId();
  return `${userId}/${checkinId}/${imageId}.webp`;
}

export async function resolveSignedImageUrls(imageRows = [], expiresIn = 60 * 60) {
  ensureSupabase();
  const entries = await Promise.all(
    imageRows.map(async (row) => {
      try {
        const { data, error } = await supabase.storage.from(supabaseBucketName).createSignedUrl(row.storage_path, expiresIn);
        if (error || !data?.signedUrl) return [row.storage_path, ''];
        return [row.storage_path, data.signedUrl];
      } catch {
        return [row.storage_path, ''];
      }
    })
  );

  return new Map(entries);
}

export async function syncCheckinImages({ userId, checkinId, columnId, images = [] }) {
  ensureSupabase();

  const { data: existingRows = [], error: existingError } = await supabase
    .from('checkin_images')
    .select('*')
    .eq('checkin_id', checkinId)
    .eq('column_id', columnId);

  if (existingError) throw existingError;

  const existingByPath = new Map(existingRows.map((row) => [row.storage_path, row]));
  const desiredRows = [];
  const desiredPaths = new Set();
  const staleRows = [];

  for (const image of images || []) {
    const storagePath = storagePathForImage({ userId, checkinId, image });
    desiredPaths.add(storagePath);

    const existingRow = existingByPath.get(storagePath);
    if (existingRow) {
      desiredRows.push(existingRow);
      continue;
    }

    if (!image?.dataUrl && !image?.previewUrl) {
      throw new Error('图片缺少内容');
    }

    const dataUrl = image.dataUrl || image.previewUrl;
    const blob = await dataUrlToBlob(dataUrl);
    const contentType = blob.type || 'image/webp';
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error('图片格式仅支持 WebP、JPEG 或 PNG');
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error('单张图片不能超过 1MB');
    }

    const { error: uploadError } = await supabase.storage.from(supabaseBucketName).upload(storagePath, blob, {
      contentType,
      upsert: true
    });

    if (uploadError) throw uploadError;

    const insertPayload = {
      checkin_id: checkinId,
      column_id: columnId,
      storage_path: storagePath,
      file_name: image.name || storagePath.split('/').pop() || 'image.webp',
      content_type: contentType,
      size_bytes: blob.size
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('checkin_images')
      .upsert(insertPayload, { onConflict: 'storage_path' })
      .select('*')
      .single();

    if (insertError) {
      await supabase.storage.from(supabaseBucketName).remove([storagePath]).catch(() => {});
      throw insertError;
    }

    desiredRows.push(insertedRow);
  }

  for (const row of existingRows) {
    if (!desiredPaths.has(row.storage_path)) {
      staleRows.push(row);
    }
  }

  if (staleRows.length > 0) {
    const stalePaths = staleRows.map((row) => row.storage_path);
    const { error: storageDeleteError } = await supabase.storage.from(supabaseBucketName).remove(stalePaths);
    if (storageDeleteError) throw storageDeleteError;
    const { error: deleteError } = await supabase.from('checkin_images').delete().in('storage_path', stalePaths);
    if (deleteError) throw deleteError;
  }

  const finalRows = desiredRows.map((row) => normalizeImageRecord(row));
  const signedUrls = await resolveSignedImageUrls(finalRows);
  return finalRows.map((row) => ({
    ...row,
    previewUrl: signedUrls.get(row.storage_path) || row.previewUrl || ''
  }));
}
