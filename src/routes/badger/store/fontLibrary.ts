// Font library: maps fontId -> parsed opentype.js Font. Holds fonts from
// three sources:
//  - System fonts (Chromium's window.queryLocalFonts). The returned FontData
//    objects include a blob() method for the TTF bytes; we parse them on
//    demand.
//  - Uploaded fonts (File -> ArrayBuffer -> parsed). Persist across reloads
//    via IndexedDB so the user doesn't have to re-upload each session.
//  - None. When a text element references a fontId whose blob isn't
//    available yet (system fonts don't survive reload on non-Chromium),
//    expansion returns no paths and the UI surfaces a "font unavailable"
//    hint prompting re-selection or upload.

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import opentype from 'opentype.js';

// Shape of Chromium's FontData (not yet in lib.dom.d.ts at time of writing).
type FontDataLike = {
  postscriptName: string;
  fullName: string;
  family: string;
  style: string;
  blob(): Promise<Blob>;
};

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontDataLike[]>;
  }
}

export type FontEntry = {
  id: string; // stable: postscriptName for system, 'upload:<hash>' for uploaded
  label: string; // fullName or uploaded filename
  family: string;
  style: string;
  source: 'system' | 'upload';
};

// The parsed Font objects themselves are kept off-store (they don't need to
// trigger reactivity; text expansion pulls them directly). The store just
// tracks metadata + a tick counter so expanded paths recompute when fonts
// finish loading.
const fontCache = new Map<string, opentype.Font>();

export const fontLibrary = writable<FontEntry[]>([]);
// Tick incremented whenever a font's bytes finish loading. Derived stores
// that depend on text expansion subscribe so they recompute on load.
export const fontLoadTick = writable(0);

// Used by expansion code. Returns null if the font isn't loaded yet.
export function getLoadedFont(id: string): opentype.Font | null {
  return fontCache.get(id) ?? null;
}

// True when the browser exposes the Local Font Access API. User-gesture gated
// — caller must invoke queryLocalFonts from a click handler.
export function canAccessSystemFonts(): boolean {
  return browser && typeof window.queryLocalFonts === 'function';
}

// Populate the library with system font metadata. Does not load the bytes —
// that happens lazily on selection. Requires a user gesture, throws
// otherwise.
export async function loadSystemFonts(): Promise<void> {
  if (!canAccessSystemFonts()) return;
  const fonts = await window.queryLocalFonts!();
  const entries: FontEntry[] = [];
  const seen = new Set<string>();
  for (const f of fonts) {
    if (!f.postscriptName || seen.has(f.postscriptName)) continue;
    seen.add(f.postscriptName);
    entries.push({
      id: f.postscriptName,
      label: f.fullName || f.postscriptName,
      family: f.family,
      style: f.style,
      source: 'system'
    });
  }
  // Keep existing uploaded entries, replace system entries with fresh list.
  fontLibrary.update((prev) => [
    ...prev.filter((e) => e.source !== 'system'),
    ...entries
  ]);
  systemFontDataById = new Map(fonts.filter((f) => !!f.postscriptName).map((f) => [f.postscriptName, f]));
}

// Chromium's FontData objects are live handles; keep them around so we can
// fetch blobs lazily without requerying (which would pop the picker again).
let systemFontDataById: Map<string, FontDataLike> = new Map();

// Ensure the font at `id` has its bytes loaded and parsed. Resolves once the
// cache is populated (or already was); rejects if the font can't be found.
export async function ensureFontLoaded(id: string): Promise<void> {
  if (fontCache.has(id)) return;
  const entry = get(fontLibrary).find((e) => e.id === id);
  if (!entry) throw new Error(`font not in library: ${id}`);

  let buf: ArrayBuffer;
  if (entry.source === 'system') {
    const data = systemFontDataById.get(id);
    if (!data) throw new Error(`system font handle missing: ${id}`);
    buf = await (await data.blob()).arrayBuffer();
  } else {
    const uploaded = await loadUploadedFontBytes(id);
    if (!uploaded) throw new Error(`uploaded font bytes missing: ${id}`);
    buf = uploaded;
  }
  const font = opentype.parse(buf);
  fontCache.set(id, font);
  fontLoadTick.update((t) => t + 1);
}

// Uploaded font: add to library and persist bytes to IndexedDB. Returns the
// assigned id.
export async function addUploadedFont(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const font = opentype.parse(buf);
  const id = `upload:${file.name}:${buf.byteLength}`;
  const label = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
  fontCache.set(id, font);
  fontLibrary.update((prev) => {
    if (prev.some((e) => e.id === id)) return prev;
    return [
      ...prev,
      {
        id,
        label,
        family: font.names.fontFamily?.en ?? label,
        style: font.names.fontSubfamily?.en ?? '',
        source: 'upload'
      }
    ];
  });
  await saveUploadedFontBytes(id, buf);
  fontLoadTick.update((t) => t + 1);
  return id;
}

// ---- IndexedDB for uploaded fonts ----

const UPLOAD_DB_NAME = 'badger-fonts';
const UPLOAD_STORE = 'uploads';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(UPLOAD_DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(UPLOAD_STORE);
    };
  });
}

async function saveUploadedFontBytes(id: string, buf: ArrayBuffer): Promise<void> {
  if (!browser) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    tx.objectStore(UPLOAD_STORE).put(buf, id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function loadUploadedFontBytes(id: string): Promise<ArrayBuffer | null> {
  if (!browser) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UPLOAD_STORE, 'readonly');
    const req = tx.objectStore(UPLOAD_STORE).get(id);
    req.onsuccess = () => {
      db.close();
      resolve(req.result instanceof ArrayBuffer ? req.result : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// List persisted uploads so the library can restore them on app boot without
// needing the user to re-upload. Bytes themselves load lazily via
// ensureFontLoaded.
export async function restoreUploadedFonts(): Promise<void> {
  if (!browser) return;
  const db = await openDb();
  const ids = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(UPLOAD_STORE, 'readonly');
    const req = tx.objectStore(UPLOAD_STORE).getAllKeys();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as IDBValidKey[]).filter((k): k is string => typeof k === 'string'));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
  if (ids.length === 0) return;

  // Load each font's parsed Font so it's usable immediately. The label comes
  // from the font's own name records, which means we must parse to get it.
  for (const id of ids) {
    try {
      const buf = await loadUploadedFontBytes(id);
      if (!buf) continue;
      const font = opentype.parse(buf);
      fontCache.set(id, font);
      const label = id.startsWith('upload:')
        ? id.slice('upload:'.length).split(':')[0].replace(/\.(ttf|otf|woff|woff2)$/i, '')
        : id;
      fontLibrary.update((prev) => {
        if (prev.some((e) => e.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            label,
            family: font.names.fontFamily?.en ?? label,
            style: font.names.fontSubfamily?.en ?? '',
            source: 'upload'
          }
        ];
      });
    } catch {
      /* skip bad bytes silently */
    }
  }
  fontLoadTick.update((t) => t + 1);
}

export async function deleteUploadedFont(id: string): Promise<void> {
  if (!browser) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    tx.objectStore(UPLOAD_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  fontCache.delete(id);
  fontLibrary.update((prev) => prev.filter((e) => e.id !== id));
}
