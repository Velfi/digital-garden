import { get } from 'svelte/store';
import {
  coordKey,
  parseCoordKey,
  getSelectionBounds,
  getMirrorCoordKeys,
  type SymmetryAxes
} from '../coordUtils';
import {
  voxels,
  selection,
  updateVoxels,
  ensureGridFitsPositions,
  addPanelStore,
  symmetryX,
  symmetryY,
  symmetryZ
} from './core';
import type { Voxel } from '../voxelMaterial';
import { parseVoxelMaterial, plasticVoxel } from '../voxelMaterial';
import { rotatePositionAroundOrigin, clampQuarterTurn } from './shapes';

const DBG = '[voxelle:clipboard]';

/** Clipboard entry: relative position + voxel (v1 pastes used 4-tuple with color only = plastic). */
export type VoxelleClipboard = {
  type: 'voxelle';
  entries: [number, number, number, number, string?][];
};

function isVoxelleClipboardPayload(data: unknown): data is VoxelleClipboard {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as VoxelleClipboard).type === 'voxelle' &&
    Array.isArray((data as VoxelleClipboard).entries)
  );
}

export async function copySelection(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    console.debug(DBG, 'copy skipped: no clipboard.writeText');
    return false;
  }
  const v = get(voxels);
  const sel = get(selection);
  const bounds = getSelectionBounds(sel);
  if (!bounds) {
    console.debug(DBG, 'copy skipped: no selection bounds', { selectionKeys: sel.size });
    return false;
  }
  const entries: VoxelleClipboard['entries'] = [];
  for (const [key] of sel) {
    if (!v.has(key)) continue;
    const vx = v.get(key)!;
    const [x, y, z] = parseCoordKey(key);
    entries.push([x - bounds.minX, y - bounds.minY, z - bounds.minZ, vx.color, vx.material]);
  }
  if (entries.length === 0) {
    console.debug(DBG, 'copy skipped: no voxels in selection', { selectionKeys: sel.size });
    return false;
  }
  const payload: VoxelleClipboard = { type: 'voxelle', entries };
  const json = JSON.stringify(payload);
  await navigator.clipboard.writeText(json);
  console.debug(DBG, 'copy wrote clipboard', {
    entries: entries.length,
    bboxMin: [bounds.minX, bounds.minY, bounds.minZ],
    jsonChars: json.length
  });
  return true;
}

export async function cutSelection(): Promise<boolean> {
  if (!(await copySelection())) return false;
  const sel = get(selection);
  const n = sel.size;
  updateVoxels((v) => {
    for (const key of sel.keys()) v.delete(key);
  });
  selection.set(new Map());
  console.debug(DBG, 'cut removed voxels', { selectionKeys: n });
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

export function clipboardEntryToVoxel(entry: VoxelleClipboard['entries'][number]): Voxel {
  if (entry.length >= 5 && typeof entry[4] === 'string') {
    return {
      color: (entry[3] as number) & 0xffffff,
      material: parseVoxelMaterial(entry[4])
    };
  }
  return plasticVoxel(entry[3] as number);
}

/**
 * World-space voxel map for a clipboard pattern at the given placement (after rotation) and mirror axes.
 * Last writer wins per cell if multiple source entries map to the same key.
 */
export function buildPastePlacementVoxelMap(
  entries: VoxelleClipboard['entries'],
  position: [number, number, number],
  rotation: [number, number, number],
  symmetryAxes: SymmetryAxes
): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  const [px, py, pz] = position;
  const [rx, ry, rz] = [
    clampQuarterTurn(rotation[0]),
    clampQuarterTurn(rotation[1]),
    clampQuarterTurn(rotation[2])
  ];
  const sym = symmetryAxes.x || symmetryAxes.y || symmetryAxes.z;
  for (const e of entries) {
    const [dx, dy, dz] = e;
    const r = rotatePositionAroundOrigin([dx, dy, dz], [rx, ry, rz]);
    const x = r[0] + px;
    const y = r[1] + py;
    const z = r[2] + pz;
    const vx = clipboardEntryToVoxel(e);
    if (!sym) {
      out.set(coordKey(x, y, z), vx);
    } else {
      for (const mk of getMirrorCoordKeys(x, y, z, symmetryAxes)) {
        out.set(mk, vx);
      }
    }
  }
  return out;
}

function getSymmetryAxesFromStore(): SymmetryAxes {
  return {
    x: get(symmetryX),
    y: get(symmetryY),
    z: get(symmetryZ)
  };
}

/**
 * Commit paste placement (position + quarter-turn rotations + mirror symmetry).
 * Cells that already contain voxels are replaced by the pasted voxel (color + material).
 */
export function placePastePatternAt(
  position: [number, number, number],
  rotation: [number, number, number],
  entries: VoxelleClipboard['entries']
): void {
  if (entries.length === 0) {
    console.debug(DBG, 'placePaste skipped: empty entries');
    return;
  }
  const sym = getSymmetryAxesFromStore();
  const map = buildPastePlacementVoxelMap(entries, position, rotation, sym);
  if (map.size === 0) {
    console.debug(DBG, 'placePaste skipped: empty map');
    return;
  }
  const positions = [...map.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
  ensureGridFitsPositions(positions);
  const current = get(voxels);
  let overwritingCells = 0;
  for (const key of map.keys()) {
    if (current.has(key)) overwritingCells++;
  }
  console.debug(DBG, 'placePaste commit', {
    sourceEntries: entries.length,
    worldVoxels: map.size,
    overwritingCells,
    position,
    rotationQuarters: [
      clampQuarterTurn(rotation[0]),
      clampQuarterTurn(rotation[1]),
      clampQuarterTurn(rotation[2])
    ],
    symmetry: { x: sym.x, y: sym.y, z: sym.z }
  });
  updateVoxels((v) => {
    for (const [key, vx] of map) {
      v.set(key, vx);
    }
  });
}

export async function pasteFromClipboard(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    console.debug(DBG, 'paste skipped: no clipboard.readText');
    return false;
  }
  try {
    const text = await navigator.clipboard.readText();
    console.debug(DBG, 'paste read clipboard', { textChars: text.length });
    const data = JSON.parse(text) as unknown;
    if (!isVoxelleClipboardPayload(data)) {
      console.debug(DBG, 'paste rejected: not voxelle payload', {
        parsedType:
          typeof data === 'object' && data !== null ? (data as { type?: string }).type : null
      });
      return false;
    }
    if (data.entries.length === 0) {
      console.debug(DBG, 'paste rejected: empty entries');
      return false;
    }
    addPanelStore.set({
      open: true,
      placementAnchorPending: true,
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      shape: 'cube',
      size: 8,
      mode: 'paste',
      overwriteIntersecting: true,
      pasteEntries: data.entries
    });
    console.debug(DBG, 'paste opened placement panel', { entries: data.entries.length });
    return true;
  } catch (err) {
    console.debug(DBG, 'paste failed', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
