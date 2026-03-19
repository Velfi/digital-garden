import { get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  voxels,
  gridSize,
  focalLength,
  orthographic,
  resetUndo,
  getUndoSnapshot,
  restoreUndoSnapshot,
  serializeVoxels,
  deserializeVoxels
} from './core';
import type { UndoSnapshot } from './undo';

const VOXELLE_STORAGE_KEY = 'voxelle';
const SKIP_STARTUP_KEY = 'voxelle-skip-startup';

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

export function loadFromStorage(): boolean {
  if (!browser) return false;
  try {
    const raw = localStorage.getItem(VOXELLE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const sz = data.gridSize;
    if (typeof sz !== 'number' || sz < 1 || !Number.isInteger(sz)) return false;
    gridSize.set(sz);
    voxels.set(deserializeVoxels(data.voxelsJson));
    if (data.undoSnapshot && typeof data.undoSnapshot === 'object') {
      try {
        restoreUndoSnapshot(data.undoSnapshot as UndoSnapshot);
      } catch {
        resetUndo();
      }
    } else {
      resetUndo();
    }
    if (typeof data.focalLength === 'number' && data.focalLength >= 15 && data.focalLength <= 200) {
      focalLength.set(data.focalLength);
    }
    if (typeof data.orthographic === 'boolean') {
      orthographic.set(data.orthographic);
    }
    return true;
  } catch {
    return false;
  }
}

export function saveToStorage() {
  if (!browser) return;
  try {
    localStorage.setItem(
      VOXELLE_STORAGE_KEY,
      JSON.stringify({
        gridSize: get(gridSize),
        voxelsJson: serializeVoxels(get(voxels)),
        undoSnapshot: getUndoSnapshot(),
        focalLength: get(focalLength),
        orthographic: get(orthographic)
      })
    );
  } catch {
    // ignore
  }
}
