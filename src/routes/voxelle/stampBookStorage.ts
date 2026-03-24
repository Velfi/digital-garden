/** IndexedDB persistence for Voxelle stamp book. */

export type StampBookEntryTuple = [number, number, number, number, string?];

export type StampBookRecord = {
  id: string;
  name: string;
  order: number;
  entries: StampBookEntryTuple[];
  createdAt: number;
  /** Normalized lowercase tags for search/filter. */
  tags?: string[];
  /** PNG thumbnail; omitted if generation failed. */
  previewBlob?: Blob;
};

const DB_NAME = 'voxelle-stamp-book';
const STORE_NAME = 'stamps';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Future migrations: bump DB_VERSION and add indexes / stores here.
      }
    };
  });
}

function closeOnComplete(
  db: IDBDatabase,
  tx: IDBTransaction,
  resolve: () => void,
  reject: (e: unknown) => void
) {
  tx.oncomplete = () => {
    db.close();
    resolve();
  };
  tx.onerror = () => {
    db.close();
    reject(tx.error ?? new Error('IndexedDB transaction failed'));
  };
  tx.onabort = () => {
    db.close();
    reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  };
}

export function isStampBookIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Raw rows from IndexedDB (tags may be missing on legacy records). */
export async function listStampsFromIndexedDb(): Promise<StampBookRecord[]> {
  if (!isStampBookIndexedDBAvailable()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result ?? []) as StampBookRecord[];
      rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      resolve(rows);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function putStamp(record: StampBookRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    closeOnComplete(db, tx, resolve, reject);
  });
}

export async function deleteStamp(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    closeOnComplete(db, tx, resolve, reject);
  });
}

/** Persist new order values after drag-reorder (each record should have updated `order`). */
export async function replaceAllOrders(records: StampBookRecord[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const r of records) {
      store.put(r);
    }
    closeOnComplete(db, tx, resolve, reject);
  });
}

export async function clearAllStamps(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    closeOnComplete(db, tx, resolve, reject);
  });
}

export async function getStampById(id: string): Promise<StampBookRecord | null> {
  if (!isStampBookIndexedDBAvailable()) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StampBookRecord) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
