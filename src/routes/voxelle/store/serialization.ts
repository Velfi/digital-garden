import { coordKey, parseCoordKey } from '../coordUtils';
import type { Voxel } from '../voxelMaterial';
import { cloneVoxel, normalizeLegacyVoxel, parseVoxelMaterial } from '../voxelMaterial';

/**
 * One voxel per integer cell for persistence. Re-keys with `coordKey(floor(x),…)` so aliased
 * map keys (e.g. fractional coords) merge; later entries win the same as `Map.set`.
 */
export function canonicalizeVoxelMap(voxelMap: Map<string, Voxel>): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  for (const [key, vx] of voxelMap) {
    const [x, y, z] = parseCoordKey(key);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out.set(coordKey(x, y, z), vx);
  }
  return out;
}

export function cloneVoxels(voxels: Map<string, Voxel>): Map<string, Voxel> {
  const next = new Map<string, Voxel>();
  for (const [k, v] of voxels) next.set(k, cloneVoxel(v));
  return next;
}

export function serializeVoxels(voxelMap: Map<string, Voxel>): string {
  return JSON.stringify([...canonicalizeVoxelMap(voxelMap).entries()]);
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
    if (!oldC || oldC.color !== c.color || oldC.material !== c.material) {
      voxelAdded.push([k, c]);
      if (oldC) voxelRemoved.push([k, oldC]);
    }
  }
  for (const [k, c] of oldV) {
    if (!newV.has(k)) voxelRemoved.push([k, c]);
  }
  for (const [k, c] of newS) {
    const oldC = oldS.get(k);
    if (!oldC || oldC.color !== c.color || oldC.material !== c.material) {
      selectionAdded.push([k, c]);
      if (oldC) selectionRemoved.push([k, oldC]);
    }
  }
  for (const [k, c] of oldS) {
    if (!newS.has(k)) selectionRemoved.push([k, c]);
  }
  return { voxelAdded, voxelRemoved, selectionAdded, selectionRemoved };
}

/** Voxel diff only for keys that were touched (e.g. via sculpt updater). */
export function computeUndoDeltaForVoxelKeys(
  oldV: Map<string, Voxel>,
  newV: Map<string, Voxel>,
  touchedKeys: ReadonlySet<string>
): Pick<UndoDelta, 'voxelAdded' | 'voxelRemoved'> {
  const voxelAdded: [string, Voxel][] = [];
  const voxelRemoved: [string, Voxel][] = [];
  for (const k of touchedKeys) {
    const oldC = oldV.get(k);
    const newC = newV.get(k);
    if (!oldC && newC) {
      voxelAdded.push([k, newC]);
    } else if (oldC && !newC) {
      voxelRemoved.push([k, oldC]);
    } else if (oldC && newC && (oldC.color !== newC.color || oldC.material !== newC.material)) {
      voxelRemoved.push([k, oldC]);
      voxelAdded.push([k, newC]);
    }
  }
  return { voxelAdded, voxelRemoved };
}

/** Selection diff only (full walk of both maps; selection is usually smaller than voxels). */
export function computeUndoDeltaForSelectionOnly(
  oldS: Map<string, Voxel>,
  newS: Map<string, Voxel>
): Pick<UndoDelta, 'selectionAdded' | 'selectionRemoved'> {
  const selectionAdded: [string, Voxel][] = [];
  const selectionRemoved: [string, Voxel][] = [];
  for (const [k, c] of newS) {
    const oldC = oldS.get(k);
    if (!oldC || oldC.color !== c.color || oldC.material !== c.material) {
      selectionAdded.push([k, c]);
      if (oldC) selectionRemoved.push([k, oldC]);
    }
  }
  for (const [k, c] of oldS) {
    if (!newS.has(k)) selectionRemoved.push([k, c]);
  }
  return { selectionAdded, selectionRemoved };
}

export function mergeUndoParts(
  voxelPart: Pick<UndoDelta, 'voxelAdded' | 'voxelRemoved'>,
  selectionPart: Pick<UndoDelta, 'selectionAdded' | 'selectionRemoved'>
): UndoDelta {
  return {
    voxelAdded: voxelPart.voxelAdded,
    voxelRemoved: voxelPart.voxelRemoved,
    selectionAdded: selectionPart.selectionAdded,
    selectionRemoved: selectionPart.selectionRemoved
  };
}

/**
 * Stroke-end voxel delta: compare per-key “before stroke” snapshot (lazy) to current map.
 * `beforeSnapshot` stores `null` when the cell was empty at first touch in the stroke.
 */
export function computeStrokeVoxelUndoDelta(
  newV: Map<string, Voxel>,
  touchedKeys: ReadonlySet<string>,
  beforeSnapshot: ReadonlyMap<string, Voxel | null>
): Pick<UndoDelta, 'voxelAdded' | 'voxelRemoved'> {
  const voxelAdded: [string, Voxel][] = [];
  const voxelRemoved: [string, Voxel][] = [];
  for (const k of touchedKeys) {
    const beforeRec = beforeSnapshot.get(k);
    const before: Voxel | null = beforeRec !== undefined ? beforeRec : null;
    const after = newV.get(k);
    if (before === null && after) {
      voxelAdded.push([k, after]);
    } else if (before !== null && !after) {
      voxelRemoved.push([k, before]);
    } else if (
      before !== null &&
      after &&
      (before.color !== after.color || before.material !== after.material)
    ) {
      voxelRemoved.push([k, before]);
      voxelAdded.push([k, after]);
    }
  }
  return { voxelAdded, voxelRemoved };
}

/** Voxel keys touched when applying this delta (same set for forward and inverse). */
export function voxelKeysTouchedInUndoDeltaVoxels(delta: UndoDelta): Set<string> {
  const keys = new Set<string>();
  for (const [k] of delta.voxelAdded) keys.add(k);
  for (const [k] of delta.voxelRemoved) keys.add(k);
  return keys;
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
