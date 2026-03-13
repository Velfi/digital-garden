import { get } from 'svelte/store';
import { browser } from '$app/environment';
import {
  voxels,
  gridSize,
  focalLength,
  orthographic,
  resetUndo,
  serializeVoxels,
  deserializeVoxels
} from './core';

const VOXELLE_STORAGE_KEY = 'voxelle';

export function loadFromStorage(): boolean {
  if (!browser) return false;
  try {
    const raw = localStorage.getItem(VOXELLE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const sz = data.gridSize;
    if (typeof sz !== 'number' || sz < 1 || !Number.isInteger(sz)) return false;
    resetUndo();
    gridSize.set(sz);
    voxels.set(deserializeVoxels(data.voxelsJson));
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
        focalLength: get(focalLength),
        orthographic: get(orthographic)
      })
    );
  } catch {
    // ignore
  }
}
