import { get } from 'svelte/store';
import { coordKey, parseCoordKey, getSelectionBounds } from '../coordUtils';
import { voxels, selection, updateVoxels, ensureGridFitsPositions } from './core';
import type { Voxel } from '../voxelMaterial';
import { parseVoxelMaterial, plasticVoxel } from '../voxelMaterial';

/** Clipboard entry: relative position + voxel (v1 pastes used 4-tuple with color only = plastic). */
export type VoxelleClipboard = {
  type: 'voxelle';
  entries: [number, number, number, number, string?][];
};

export async function copySelection(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  const v = get(voxels);
  const sel = get(selection);
  const bounds = getSelectionBounds(sel);
  if (!bounds) return false;
  const entries: VoxelleClipboard['entries'] = [];
  for (const [key] of sel) {
    if (!v.has(key)) continue;
    const vx = v.get(key)!;
    const [x, y, z] = parseCoordKey(key);
    entries.push([x - bounds.minX, y - bounds.minY, z - bounds.minZ, vx.color, vx.material]);
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

/** Remove voxels at selected keys; selection keys stay selected. No-op when selection is empty. */
export function deleteSelectedVoxels(): void {
  const sel = get(selection);
  if (sel.size === 0) return;
  updateVoxels((v) => {
    for (const key of sel.keys()) v.delete(key);
  });
}

function entryToVoxel(entry: VoxelleClipboard['entries'][number]): Voxel {
  if (entry.length >= 5 && typeof entry[4] === 'string') {
    return {
      color: (entry[3] as number) & 0xffffff,
      material: parseVoxelMaterial(entry[4])
    };
  }
  return plasticVoxel(entry[3] as number);
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
      for (const entry of data.entries) {
        const [dx, dy, dz] = entry;
        const key = coordKey(dx, dy, dz);
        v.set(key, entryToVoxel(entry));
      }
    });
    return true;
  } catch {
    return false;
  }
}
