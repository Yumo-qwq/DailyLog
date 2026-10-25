import { supabase } from '../lib/supabase.js';

const BATCH_SIZE = 100;
const cache = new Map();

export async function signedUrlsForPaths(bucket, paths, expiresIn = 60 * 60) {
  if (!supabase) throw new Error('Supabase 未配置');

  const now = Date.now();
  const result = new Map();
  const missing = [];
  for (const path of new Set(paths.filter(Boolean))) {
    const key = `${bucket}:${path}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) result.set(path, cached.url);
    else missing.push(path);
  }

  const batches = [];
  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    batches.push(missing.slice(index, index + BATCH_SIZE));
  }

  await Promise.all(batches.map(async (batch) => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(batch, expiresIn);
      if (error) return;
      for (const item of data || []) {
        if (!item.path || !item.signedUrl || item.error) continue;
        result.set(item.path, item.signedUrl);
        cache.set(`${bucket}:${item.path}`, {
          url: item.signedUrl,
          expiresAt: now + Math.max(0, expiresIn - 60) * 1000
        });
      }
    } catch {
      // A missing or inaccessible image keeps an empty preview, as before.
    }
  }));

  return result;
}
