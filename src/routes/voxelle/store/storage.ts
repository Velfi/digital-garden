import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
  voxels,
  hiddenVoxels,
  gridSize,
  resizeGridToContent,
  focalLength,
  orthographic,
  resetUndo,
  getUndoSnapshot,
  restoreUndoSnapshot,
  serializeVoxels,
  deserializeVoxels
} from './core';
import type { UndoSnapshot } from './undo';
import { getAutosaveSnapshot, putAutosaveSnapshot } from './idbAutosave';

const VOXELLE_STORAGE_KEY = 'voxelle';
const SKIP_STARTUP_KEY = 'voxelle-skip-startup';

/** Set when localStorage autosave fails; cleared on next successful save. */
export const autosaveError = writable<string | null>(null);

export function getSkipStartup(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(SKIP_STARTUP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipStartup(value: boolean) {
  if (!browser) return;
  try {
    localStorage.setItem(SKIP_STARTUP_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

function applyStoragePayload(data: unknown): boolean {
  try {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    const sz = d.gridSize;
    if (typeof sz !== 'number' || sz < 1 || !Number.isInteger(sz)) return false;
    gridSize.set(sz);
    voxels.set(deserializeVoxels(d.voxelsJson as string));
    if (typeof d.hiddenVoxelsJson === 'string') {
      hiddenVoxels.set(deserializeVoxels(d.hiddenVoxelsJson));
    } else {
      hiddenVoxels.set(new Map());
    }
    if (d.undoSnapshot && typeof d.undoSnapshot === 'object') {
      try {
        restoreUndoSnapshot(d.undoSnapshot as UndoSnapshot);
      } catch {
        resetUndo();
      }
    } else {
      resetUndo();
    }
    if (typeof d.focalLength === 'number' && d.focalLength >= 15 && d.focalLength <= 200) {
      focalLength.set(d.focalLength);
    }
    if (typeof d.orthographic === 'boolean') {
      orthographic.set(d.orthographic);
    }
    return true;
  } catch {
    return false;
  }
}

/** Load snapshot from localStorage only (sync). Used for migration and tests. */
function loadFromLocalStorage(): boolean {
  if (!browser) return false;
  try {
    const raw = localStorage.getItem(VOXELLE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return applyStoragePayload(data);
  } catch {
    return false;
  }
}

/**
 * Load snapshot from localStorage only (sync).
 * Prefer `loadFromStorageAsync` in the app so IndexedDB is used when available.
 */
export function loadFromStorage(): boolean {
  return loadFromLocalStorage();
}

/**
 * Load autosave: IndexedDB first (large quota), then localStorage (legacy / fallback).
 * If data was only in localStorage, schedules a write to IndexedDB.
 */
export async function loadFromStorageAsync(): Promise<boolean> {
  if (!browser) return false;
  if (typeof indexedDB !== 'undefined') {
    try {
      const raw = await getAutosaveSnapshot();
      if (raw) {
        const data = JSON.parse(raw);
        if (applyStoragePayload(data)) return true;
      }
    } catch {
      // fall through to localStorage
    }
  }
  const migrated = loadFromLocalStorage();
  if (migrated && typeof indexedDB !== 'undefined') {
    void saveToStorageAsync();
  }
  return migrated;
}

function buildPayloadString(): string {
  return JSON.stringify({
    gridSize: get(gridSize),
    voxelsJson: serializeVoxels(get(voxels)),
    hiddenVoxelsJson: serializeVoxels(get(hiddenVoxels)),
    undoSnapshot: getUndoSnapshot(),
    focalLength: get(focalLength),
    orthographic: get(orthographic)
  });
}

function getAutosaveErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (name === 'QuotaExceededError' || /quota|full|exceeded/i.test(msg)) {
    return 'Browser storage is full.';
  }
  if (name === 'SecurityError' || /security|disabled|access/i.test(msg)) {
    return 'Browser blocked access to storage (e.g. private mode or site data disabled).';
  }
  return 'Autosave failed.';
}

function saveToStorageSyncLocal(): void {
  try {
    localStorage.setItem(VOXELLE_STORAGE_KEY, buildPayloadString());
    autosaveError.set(null);
  } catch (err) {
    autosaveError.set(getAutosaveErrorMessage(err));
  }
}

async function saveToStorageAsync(): Promise<void> {
  const payload = buildPayloadString();
  let saved = false;
  try {
    await putAutosaveSnapshot(payload);
    saved = true;
    autosaveError.set(null);
    try {
      localStorage.removeItem(VOXELLE_STORAGE_KEY);
    } catch {
      // ignore
    }
  } catch {
    // IndexedDB unavailable or write failed
  }
  if (!saved) {
    try {
      localStorage.setItem(VOXELLE_STORAGE_KEY, payload);
      autosaveError.set(null);
    } catch (err) {
      autosaveError.set(getAutosaveErrorMessage(err));
    }
  }
}

/**
 * Persist snapshot. Uses IndexedDB when available (larger quota), otherwise localStorage.
 * Fire-and-forget async when IndexedDB exists.
 */
export function saveToStorage() {
  if (!browser) return;
  resizeGridToContent();
  if (typeof indexedDB === 'undefined') {
    saveToStorageSyncLocal();
  } else {
    void saveToStorageAsync();
  }
}

/** Await full persist (IndexedDB path). Useful for tests. */
export async function saveToStoragePromise(): Promise<void> {
  if (!browser) return;
  resizeGridToContent();
  if (typeof indexedDB === 'undefined') {
    saveToStorageSyncLocal();
    return;
  }
  await saveToStorageAsync();
}
