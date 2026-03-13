import { get } from 'svelte/store';
import { coordKey, parseCoordKey, getSelectionBounds } from '../coordUtils';
import { voxels, selection, updateVoxels, ensureGridFitsPositions } from './core';

export type VoxelleClipboard = {
  type: 'voxelle';
  entries: [number, number, number, number][];
};

export async function copySelection(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  const v = get(voxels);
  const sel = get(selection);
  const bounds = getSelectionBounds(sel);
  if (!bounds) return false;
  const entries: [number, number, number, number][] = [];
  for (const [key, col] of sel) {
    if (!v.has(key)) continue;
    const [x, y, z] = parseCoordKey(key);
    entries.push([x - bounds.minX, y - bounds.minY, z - bounds.minZ, col]);
  }
  if (entries.length === 0) return false;
  const payload: VoxelleClipboard = { type: 'voxelle', entries };
  await navigator.clipboard.writeText(JSON.stringify(payload));
  return true;
}

export async function cutSelection(): Promise<boolean> {
  if (!(await copySelection())) return false;
  const sel = get(selection);
  updateVoxels((v) => {
    for (const key of sel.keys()) v.delete(key);
  });
  selection.set(new Map());
  return true;
}

export async function pasteFromClipboard(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return false;
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text) as VoxelleClipboard;
    if (data?.type !== 'voxelle' || !Array.isArray(data.entries)) return false;
    const positions = data.entries.map(([x, y, z]) => [x, y, z] as [number, number, number]);
    ensureGridFitsPositions(positions);
    updateVoxels((v) => {
      for (const [dx, dy, dz, col] of data.entries) {
        v.set(coordKey(dx, dy, dz), col >>> 0);
      }
    });
    return true;
  } catch {
    return false;
  }
}
