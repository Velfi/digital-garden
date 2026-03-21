import type { Voxel } from '../voxelMaterial';
import { cloneVoxel, normalizeLegacyVoxel, parseVoxelMaterial } from '../voxelMaterial';

export function cloneVoxels(voxels: Map<string, Voxel>): Map<string, Voxel> {
  const next = new Map<string, Voxel>();
  for (const [k, v] of voxels) next.set(k, cloneVoxel(v));
  return next;
}

export function serializeVoxels(voxelMap: Map<string, Voxel>): string {
  return JSON.stringify([...voxelMap.entries()]);
}

export function deserializeVoxels(json: string): Map<string, Voxel> {
  const entries = JSON.parse(json) as [string, unknown][];
  const m = new Map<string, Voxel>();
  for (const [k, val] of entries) {
    if (typeof val === 'number') {
      m.set(k, normalizeLegacyVoxel(val));
    } else if (val && typeof val === 'object' && typeof (val as Voxel).color === 'number') {
      const v = val as Voxel;
      m.set(k, {
        color: v.color & 0xffffff,
        material: parseVoxelMaterial(v.material)
      });
    }
  }
  return m;
}

/** Delta from old state to new state (forward). Used for memory-efficient undo. */
export type UndoDelta = {
  voxelAdded: [string, Voxel][];
  voxelRemoved: [string, Voxel][];
  selectionAdded: [string, Voxel][];
  selectionRemoved: [string, Voxel][];
};

function cloneMap(m: Map<string, Voxel>): Map<string, Voxel> {
  return new Map(m);
}

export function computeUndoDelta(
  oldV: Map<string, Voxel>,
  oldS: Map<string, Voxel>,
  newV: Map<string, Voxel>,
  newS: Map<string, Voxel>
): UndoDelta {
  const voxelAdded: [string, Voxel][] = [];
  const voxelRemoved: [string, Voxel][] = [];
  const selectionAdded: [string, Voxel][] = [];
  const selectionRemoved: [string, Voxel][] = [];
  for (const [k, c] of newV) {
    const oldC = oldV.get(k);
    if (!oldC || oldC.color !== c.color || oldC.material !== c.material) voxelAdded.push([k, c]);
  }
  for (const [k, c] of oldV) {
    if (!newV.has(k)) voxelRemoved.push([k, c]);
  }
  for (const [k, c] of newS) {
    const oldC = oldS.get(k);
    if (!oldC || oldC.color !== c.color || oldC.material !== c.material) selectionAdded.push([k, c]);
  }
  for (const [k, c] of oldS) {
    if (!newS.has(k)) selectionRemoved.push([k, c]);
  }
  return { voxelAdded, voxelRemoved, selectionAdded, selectionRemoved };
}

export function applyUndoDeltaForward(
  v: Map<string, Voxel>,
  s: Map<string, Voxel>,
  delta: UndoDelta
): { v: Map<string, Voxel>; s: Map<string, Voxel> } {
  const nextV = cloneMap(v);
  const nextS = cloneMap(s);
  for (const [k] of delta.voxelRemoved) nextV.delete(k);
  for (const [k, c] of delta.voxelAdded) nextV.set(k, c);
  for (const [k] of delta.selectionRemoved) nextS.delete(k);
  for (const [k, c] of delta.selectionAdded) nextS.set(k, c);
  return { v: nextV, s: nextS };
}

export function applyUndoDeltaInverse(
  v: Map<string, Voxel>,
  s: Map<string, Voxel>,
  delta: UndoDelta
): { v: Map<string, Voxel>; s: Map<string, Voxel> } {
  const nextV = cloneMap(v);
  const nextS = cloneMap(s);
  for (const [k] of delta.voxelAdded) nextV.delete(k);
  for (const [k, c] of delta.voxelRemoved) nextV.set(k, c);
  for (const [k] of delta.selectionAdded) nextS.delete(k);
  for (const [k, c] of delta.selectionRemoved) nextS.set(k, c);
  return { v: nextV, s: nextS };
}

export function isUndoDeltaEmpty(d: UndoDelta): boolean {
  return (
    d.voxelAdded.length === 0 &&
    d.voxelRemoved.length === 0 &&
    d.selectionAdded.length === 0 &&
    d.selectionRemoved.length === 0
  );
}
