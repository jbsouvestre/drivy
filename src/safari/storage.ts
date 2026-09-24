/**
 * Photo storage in IndexedDB. Photos are kept as Blobs (no base64 bloat), one
 * record each, written in the background: localStorage is too small for images
 * (≈5 MB for the whole site) and blocks the game while it writes.
 */

const DB_NAME = 'drivy';
const DB_VERSION = 2;

/** Pictures kept on purpose (the photobook), keyed by `id`. */
export const PHOTOBOOK = 'photobook';
/** Each species' best journal photo, keyed by `species`. */
export const JOURNAL_PHOTOS = 'journalPhotos';

let opening: Promise<IDBDatabase> | null = null;

/** The shared database (rejects if IndexedDB is unavailable, e.g. some private modes). */
export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTOBOOK)) db.createObjectStore(PHOTOBOOK, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(JOURNAL_PHOTOS)) db.createObjectStore(JOURNAL_PHOTOS, { keyPath: 'species' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Write (insert or replace) a record. Resolves false if it couldn't be saved (e.g. storage full). */
export async function put(store: string, value: unknown): Promise<boolean> {
  return write(store, (s) => s.put(value));
}

export async function remove(store: string, key: IDBValidKey): Promise<boolean> {
  return write(store, (s) => s.delete(key));
}

async function write(store: string, op: (s: IDBObjectStore) => IDBRequest): Promise<boolean> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    op(tx.objectStore(store));
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  });
}

let persistAsked = false;

/**
 * Ask the browser to keep our storage even when the disk runs low (Chrome and
 * Firefox honour it; it's a request, not a guarantee). Called on the first saved photo.
 */
export function requestPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}
