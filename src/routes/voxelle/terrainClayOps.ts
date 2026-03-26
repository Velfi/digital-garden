import { coordKey, inBounds, inBoundsBox } from './coordUtils';
import type { SelectionBounds } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { cloneVoxel } from './voxelMaterial';
import type { TerrainClayOp } from './store/core';

function withinBounds(
  x: number,
  y: number,
  z: number,
  sizeOrBounds: number | SelectionBounds
): boolean {
  if (typeof sizeOrBounds === 'number') return inBounds(x, y, z, sizeOrBounds);
  return inBoundsBox(x, y, z, sizeOrBounds);
}

function yRange(gridSizeOrBounds: number | SelectionBounds): { y0: number; y1: number } {
  if (typeof gridSizeOrBounds === 'number') {
    return { y0: 0, y1: gridSizeOrBounds - 1 };
  }
  return { y0: gridSizeOrBounds.minY, y1: gridSizeOrBounds.maxY };
}

/**
 * Min/max Y with voxels in column (x, z), or null if empty.
 * Scans from top for maxY and from bottom for minY (O(occupied span), not full world Y range).
 */
export function getColumnTopBottom(
  v: Map<string, Voxel>,
  x: number,
  z: number,
  gridSizeOrBounds: number | SelectionBounds
): { minY: number; maxY: number } | null {
  const { y0, y1 } = yRange(gridSizeOrBounds);
  let maxY: number | null = null;
  for (let y = y1; y >= y0; y--) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    if (v.has(coordKey(x, y, z))) {
      maxY = y;
      break;
    }
  }
  if (maxY === null) return null;
  let minY = y0;
  for (let y = y0; y <= maxY; y++) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    if (v.has(coordKey(x, y, z))) {
      minY = y;
      break;
    }
  }
  return { minY, maxY };
}

/** Highest solid Y in column, or null if empty (descending scan). */
function getColumnMaxY(
  v: Map<string, Voxel>,
  x: number,
  z: number,
  gridSizeOrBounds: number | SelectionBounds
): number | null {
  const { y0, y1 } = yRange(gridSizeOrBounds);
  for (let y = y1; y >= y0; y--) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    if (v.has(coordKey(x, y, z))) return y;
  }
  return null;
}

/** Smoothstep on [0,1] (Hermite). */
function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * 1 at the stroke spine, 0 at and beyond effective radius.
 * XZ distance is to the nearest point on `falloffSamples` (stroke polyline), not the thickened footprint —
 * otherwise every column in the disk would sit on a sample and falloff would be flat.
 */
function brushFalloff(
  x: number,
  z: number,
  falloffSamples: [number, number, number][],
  brushRadius: number
): number {
  let dMin = Infinity;
  for (const [px, , pz] of falloffSamples) {
    const d = Math.hypot(x - px, z - pz);
    if (d < dMin) dMin = d;
  }
  if (!Number.isFinite(dMin)) return 0;
  const R = Math.max(0.25, brushRadius + 0.25);
  const u = Math.max(0, Math.min(1, dMin / R));
  return 1 - smoothstep01(u);
}

export type ApplyTerrainStrokeOptions = {
  op: TerrainClayOp;
  terrainBaseY: number;
  strength: number;
  smoothRadius: number;
  brushRadius: number;
  /**
   * Pre-thicken stroke samples for raise/lower radial falloff (XZ distance to nearest sample).
   * When omitted, `brushPositions` is used (e.g. unit tests with a single sample).
   * Thickened footprints from the canvas must pass the spine so the brush edge falls off correctly.
   */
  falloffPath?: [number, number, number][];
};

function xzKey(x: number, z: number): string {
  return `${x},${z}`;
}

function uniqueColumns(
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds
): Map<string, { x: number; z: number }> {
  const m = new Map<string, { x: number; z: number }>();
  for (const [x, y, z] of brushPositions) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    const k = xzKey(x, z);
    if (!m.has(k)) m.set(k, { x, z });
  }
  return m;
}

/**
 * Heightfield terrain sculpt: each affected (x,z) becomes a solid stack from yFill through H.
 * No overhangs within edited columns (caves in those columns collapse).
 */
export function applyTerrainStroke(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  options: ApplyTerrainStrokeOptions,
  getVoxel: () => Voxel
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const cols = uniqueColumns(brushPositions, gridSizeOrBounds);
  if (cols.size === 0) {
    return { toAdd: new Map(), toRemove: new Set() };
  }

  const { y0, y1 } = yRange(gridSizeOrBounds);
  const baseYGlobal = options.terrainBaseY;

  const colMeta = new Map<
    string,
    { x: number; z: number; yFill: number; oldMax: number; oldMin: number | null; template: Voxel }
  >();

  for (const [k, { x, z }] of cols) {
    const ext = getColumnTopBottom(v, x, z, gridSizeOrBounds);
    const yFill = ext ? Math.min(baseYGlobal, ext.minY) : baseYGlobal;
    const oldMax = ext ? ext.maxY : yFill - 1;
    const template =
      ext && v.has(coordKey(x, ext.maxY, z))
        ? cloneVoxel(v.get(coordKey(x, ext.maxY, z))!)
        : cloneVoxel(getVoxel());
    colMeta.set(k, { x, z, yFill, oldMax, oldMin: ext ? ext.minY : null, template });
  }

  const newH = new Map<string, number>();

  if (options.op === 'raise' || options.op === 'lower') {
    const falloffSamples =
      options.falloffPath && options.falloffPath.length > 0
        ? options.falloffPath
        : brushPositions;
    for (const [k, meta] of colMeta) {
      const { x, z, yFill, oldMax } = meta;
      const t = brushFalloff(x, z, falloffSamples, options.brushRadius);
      const delta = Math.round(Math.max(0, options.strength) * t);
      const oldH = oldMax;
      let h: number;
      if (options.op === 'raise') {
        h = oldH + delta;
      } else {
        h = oldH - delta;
        h = Math.max(h, yFill - 1);
      }
      newH.set(k, h);
    }
  } else {
    const R = Math.max(0, Math.floor(options.smoothRadius));
    const surfaceCache = new Map<string, number>();
    const surfaceH = (cx: number, cz: number): number => {
      const ck = xzKey(cx, cz);
      let h = surfaceCache.get(ck);
      if (h !== undefined) return h;
      const my = getColumnMaxY(v, cx, cz, gridSizeOrBounds);
      h = my !== null ? my : baseYGlobal - 1;
      surfaceCache.set(ck, h);
      return h;
    };
    for (const [k, { x, z }] of colMeta) {
      let sum = 0;
      let cnt = 0;
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (!withinBounds(nx, y0, nz, gridSizeOrBounds)) continue;
          sum += surfaceH(nx, nz);
          cnt++;
        }
      }
      const avg =
        cnt > 0 ? sum / cnt : surfaceH(x, z);
      newH.set(k, Math.round(avg));
    }
    for (const [k, meta] of colMeta) {
      const h = newH.get(k)!;
      const clamped = Math.max(meta.yFill - 1, h);
      newH.set(k, clamped);
    }
  }

  const toRemove = new Set<string>();
  const toAdd = new Map<string, Voxel>();
  for (const [k, meta] of colMeta) {
    const { x, z, yFill, template } = meta;
    const h = newH.get(k)!;
    for (let y = y0; y <= y1; y++) {
      if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
      const key = coordKey(x, y, z);
      if (v.has(key)) toRemove.add(key);
    }
    if (h >= yFill) {
      for (let y = yFill; y <= h; y++) {
        if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
        toAdd.set(coordKey(x, y, z), cloneVoxel(template));
      }
    }
  }
  return { toAdd, toRemove };
}

/** True if column (x,z) is a contiguous heightfield from yFill through maxY (no internal air). */
export function columnIsContiguousHeightfield(
  v: Map<string, Voxel>,
  x: number,
  z: number,
  yFill: number,
  gridSizeOrBounds: number | SelectionBounds
): boolean {
  const ext = getColumnTopBottom(v, x, z, gridSizeOrBounds);
  if (!ext) return true;
  if (ext.minY !== yFill) return false;
  for (let y = yFill; y <= ext.maxY; y++) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) return false;
    if (!v.has(coordKey(x, y, z))) return false;
  }
  return true;
}
