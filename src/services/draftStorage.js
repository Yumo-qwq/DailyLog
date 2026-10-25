const DATABASE_NAME = 'dailylog-drafts';
const STORE_NAME = 'drafts';
const DRAFT_ID = 'current';
const LEGACY_KEY = 'dailylog-draft-v1';

let databasePromise;

function legacyDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(LEGACY_KEY) || '{}');
  } catch {
    return {};
  }
}

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB 不可用'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function read(databaseHandle) {
  return new Promise((resolve, reject) => {
    const request = databaseHandle.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DRAFT_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function write(databaseHandle, value) {
  return new Promise((resolve, reject) => {
    const transaction = databaseHandle.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (value === null) store.delete(DRAFT_ID);
    else store.put(value, DRAFT_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadDraft() {
  const legacy = legacyDraft();
  try {
    const handle = await database();
    const stored = await read(handle);
    if (stored) return stored;
    if (Object.keys(legacy).length) {
      await write(handle, legacy);
      sessionStorage.removeItem(LEGACY_KEY);
    }
    return legacy;
  } catch {
    return legacy;
  }
}

export async function saveDraft(draft) {
  try {
    await write(await database(), draft);
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    sessionStorage.setItem(LEGACY_KEY, JSON.stringify(draft));
  }
}

export async function clearDraft() {
  sessionStorage.removeItem(LEGACY_KEY);
  try {
    await write(await database(), null);
  } catch {
    // The fallback store was already cleared.
  }
}
