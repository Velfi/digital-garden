import { coordKey, inBounds, inBoundsBox, parseCoordKey } from './coordUtils';
import type { SelectionBounds } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { blendVoxelsForSmooth, cloneVoxel } from './voxelMaterial';

const FACE_OFFSETS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

function getFaceNeighbors(x: number, y: number, z: number): [number, number, number][] {
  return FACE_OFFSETS.map(([dx, dy, dz]) => [x + dx, y + dy, z + dz] as [number, number, number]);
}

/** Bounds check: either grid size (number) or explicit bounds. */
function withinBounds(
  x: number,
  y: number,
  z: number,
  sizeOrBounds: number | SelectionBounds
): boolean {
  if (typeof sizeOrBounds === 'number') return inBounds(x, y, z, sizeOrBounds);
  return inBoundsBox(x, y, z, sizeOrBounds);
}

/** Max Chebyshev radius for smooth neighborhood (odd cube side 2R+1). */
export const SMOOTH_NEIGHBOR_RADIUS_MAX = 6;

export type ApplySmoothOptions = {
  /**
   * 0: use six face-adjacent voxels only (original behavior).
   * R≥1: count neighbors in the inclusive (2R+1)³ cube minus the center cell.
   */
  neighborRadius: number;
  /**
   * 0: gentle (need a larger majority to fill; remove only thin spikes).
   * 100: same decision rule as legacy, scaled to neighborhood size.
   */
  aggressiveness: number;
};

const DEFAULT_SMOOTH: ApplySmoothOptions = {
  neighborRadius: 0,
  aggressiveness: 100
};

function smoothThresholds(
  neighborCount: number,
  aggressiveness: number
): { minFilledToAdd: number; maxFilledToRemove: number } {
  const t = Math.min(100, Math.max(0, aggressiveness)) / 100;
  const fillRatio = (5 / 6) * (1 - t) + (4 / 6) * t;
  const removeRatio = (1 / 6) * (1 - t) + (2 / 6) * t;
  return {
    minFilledToAdd: Math.ceil(fillRatio * neighborCount),
    maxFilledToRemove: Math.floor(removeRatio * neighborCount)
  };
}

function collectNeighborStats(
  v: Map<string, Voxel>,
  x: number,
  y: number,
  z: number,
  neighborRadius: number,
  gridSizeOrBounds: number | SelectionBounds
): { filledCount: number; neighborVoxels: Voxel[]; neighborSlotCount: number } {
  const neighborVoxels: Voxel[] = [];
  if (neighborRadius <= 0) {
    let filledCount = 0;
    let neighborSlotCount = 0;
    for (const [nx, ny, nz] of getFaceNeighbors(x, y, z)) {
      if (!withinBounds(nx, ny, nz, gridSizeOrBounds)) continue;
      neighborSlotCount++;
      const nk = coordKey(nx, ny, nz);
      if (v.has(nk)) {
        filledCount++;
        neighborVoxels.push(v.get(nk)!);
      }
    }
    return { filledCount, neighborVoxels, neighborSlotCount };
  }

  const r = neighborRadius;
  let filledCount = 0;
  let neighborSlotCount = 0;
  for (let dz = -r; dz <= r; dz++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!withinBounds(nx, ny, nz, gridSizeOrBounds)) continue;
        neighborSlotCount++;
        const nk = coordKey(nx, ny, nz);
        if (v.has(nk)) {
          filledCount++;
          neighborVoxels.push(v.get(nk)!);
        }
      }
    }
  }
  return { filledCount, neighborVoxels, neighborSlotCount };
}

/** Smooth: fill concavities and remove bumps using configurable neighborhood and strength. */
export function applySmooth(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  options: Partial<ApplySmoothOptions> = {}
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const neighborRadius = Math.min(
    SMOOTH_NEIGHBOR_RADIUS_MAX,
    Math.max(0, Math.floor(options.neighborRadius ?? DEFAULT_SMOOTH.neighborRadius))
  );
  const aggressiveness = options.aggressiveness ?? DEFAULT_SMOOTH.aggressiveness;

  const toAdd = new Map<string, Voxel>();
  const toRemove = new Set<string>();
  const seenBrush = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    const key = coordKey(x, y, z);
    if (seenBrush.has(key)) continue;
    seenBrush.add(key);
    const filled = v.has(key);
    const { filledCount, neighborVoxels, neighborSlotCount } = collectNeighborStats(
      v,
      x,
      y,
      z,
      neighborRadius,
      gridSizeOrBounds
    );
    if (neighborSlotCount === 0) continue;
    const { minFilledToAdd, maxFilledToRemove } = smoothThresholds(
      neighborSlotCount,
      aggressiveness
    );

    if (!filled && filledCount >= minFilledToAdd) {
      const blended =
        neighborVoxels.length > 0
          ? blendVoxelsForSmooth(neighborVoxels)
          : {
              color: 0x888888,
              material: 'plastic' as const
            };
      toAdd.set(key, blended);
    } else if (filled && filledCount <= maxFilledToRemove) {
      toRemove.add(key);
    }
  }
  return { toAdd, toRemove };
}

/** Inflate: push surface outward along face normals. For each filled brush voxel, add a voxel in each empty face-neighbor direction with probability strength (0–1). */
export function applyInflate(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  strength: number
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const toAdd = new Map<string, Voxel>();
  const toRemove = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    const key = coordKey(x, y, z);
    if (!v.has(key)) continue;
    const voxel = cloneVoxel(v.get(key)!);
    const neighbors = getFaceNeighbors(x, y, z);
    for (const [nx, ny, nz] of neighbors) {
      if (!withinBounds(nx, ny, nz, gridSizeOrBounds)) continue;
      const nk = coordKey(nx, ny, nz);
      if (!v.has(nk) && (strength >= 1 || Math.random() < strength)) toAdd.set(nk, voxel);
    }
  }
  return { toAdd, toRemove };
}

/** Level: add voxels at levelY to fill depressions. Only affects y <= levelY; never removes above. */
export function applyLevel(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  levelY: number,
  getVoxel: () => Voxel,
  gridSizeOrBounds: number | SelectionBounds
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const toAdd = new Map<string, Voxel>();
  const toRemove = new Set<string>();
  const xzInBrush = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    xzInBrush.add(`${x},${z}`);
  }

  for (const xz of xzInBrush) {
    const [x, z] = xz.split(',').map(Number);
    const key = coordKey(x, levelY, z);
    if (!withinBounds(x, levelY, z, gridSizeOrBounds)) continue;
    if (!v.has(key)) toAdd.set(key, cloneVoxel(getVoxel()));
  }
  return { toAdd, toRemove };
}

export type MeltStyle = 'friedEgg' | 'gravity';

export type ApplyMeltOptions = {
  /** Gravity mode only: 0 = auto from grid/bounds. */
  maxPassesCap?: number;
  meltStyle?: MeltStyle;
};

type ColumnInfo = {
  x: number;
  z: number;
  ysAsc: number[];
  cap: number;
  dist: number;
  weight: number;
};

/** Allocate `total` voxels across columns with integer caps; greedy toward proportional targets. */
function allocateVoxelsAcrossColumns(cols: ColumnInfo[], total: number): number[] {
  const n = cols.length;
  const alloc = new Array(n).fill(0);
  if (total === 0 || n === 0) return alloc;
  const wsum = cols.reduce((s, c) => s + c.weight, 0) || 1;
  const target = cols.map((c) => (total * c.weight) / wsum);
  for (let step = 0; step < total; step++) {
    let best = -1;
    let bestNeed = -Infinity;
    for (let i = 0; i < n; i++) {
      if (alloc[i] >= cols[i].cap) continue;
      const need = target[i] - alloc[i];
      if (need > bestNeed) {
        bestNeed = need;
        best = i;
      }
    }
    if (best < 0) break;
    alloc[best]++;
  }
  let placed = alloc.reduce((a, b) => a + b, 0);
  while (placed < total) {
    let progressed = false;
    for (let i = 0; i < n && placed < total; i++) {
      if (alloc[i] < cols[i].cap) {
        alloc[i]++;
        placed++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return alloc;
}

/**
 * “Fried egg” melt: flatten an orb into a puddle with a thicker center (yolk) and thinner edge (white).
 * Uses horizontal center of mass; column heights follow a wide parabola plus a narrow Gaussian.
 */
export function applyMeltFriedEgg(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const brushSet = new Set(brushPositions.map(([x, y, z]) => coordKey(x, y, z)));
  const blocks: { x: number; y: number; z: number; voxel: Voxel }[] = [];
  for (const [k, vx] of v) {
    if (!brushSet.has(k)) continue;
    const [x, y, z] = parseCoordKey(k);
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    blocks.push({ x, y, z, voxel: cloneVoxel(vx) });
  }

  const empty = { toAdd: new Map<string, Voxel>(), toRemove: new Set<string>() };
  if (blocks.length === 0) return empty;

  const xzToYs = new Map<string, number[]>();
  for (const [bx, by, bz] of brushPositions) {
    if (!withinBounds(bx, by, bz, gridSizeOrBounds)) continue;
    const xz = `${bx},${bz}`;
    let arr = xzToYs.get(xz);
    if (!arr) {
      arr = [];
      xzToYs.set(xz, arr);
    }
    arr.push(by);
  }
  for (const arr of xzToYs.values()) {
    arr.sort((a, b) => a - b);
  }

  let sx = 0;
  let sz = 0;
  for (const b of blocks) {
    sx += b.x;
    sz += b.z;
  }
  const cx = sx / blocks.length;
  const cz = sz / blocks.length;

  const cols: ColumnInfo[] = [];
  for (const [xz, ysAsc] of xzToYs) {
    const [xs, zs] = xz.split(',').map(Number);
    const dist = Math.hypot(xs - cx, zs - cz);
    cols.push({ x: xs, z: zs, ysAsc, cap: ysAsc.length, dist, weight: 0 });
  }

  const dMax = Math.max(...cols.map((c) => c.dist), 1e-6);
  const yolkSigmaT = 0.2;
  for (const c of cols) {
    const t = Math.min(1, c.dist / dMax);
    const white = (1 - t * t) ** 2;
    const yolk = Math.exp(-((t / yolkSigmaT) ** 2));
    c.weight = 0.62 * white + 0.38 * yolk;
  }

  const N = blocks.length;
  const alloc = allocateVoxelsAcrossColumns(cols, N);

  const withAlloc = cols.map((c, i) => ({ c, n: alloc[i] }));
  withAlloc.sort((a, b) => b.c.dist - a.c.dist);

  const slotKeys: string[] = [];
  for (const { c, n } of withAlloc) {
    for (let j = 0; j < n; j++) {
      slotKeys.push(coordKey(c.x, c.ysAsc[j], c.z));
    }
  }

  blocks.sort((a, b) => a.y - b.y);

  const next = new Map<string, Voxel>();
  for (const [k, vx] of v) {
    if (!brushSet.has(k)) next.set(k, cloneVoxel(vx));
  }
  const use = Math.min(N, slotKeys.length);
  for (let i = 0; i < use; i++) {
    next.set(slotKeys[i], cloneVoxel(blocks[i].voxel));
  }

  const toRemove = new Set<string>();
  const toAdd = new Map<string, Voxel>();
  for (const key of v.keys()) {
    if (!next.has(key)) toRemove.add(key);
  }
  for (const [key, voxel] of next) {
    if (!v.has(key)) toAdd.set(key, voxel);
  }
  return { toAdd, toRemove };
}

/** Legacy melt: spread voxels downhill inside the brush until settled or pass cap. */
function applyMeltGravity(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  options: ApplyMeltOptions
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const maxPassesCap = Math.max(0, Math.floor(options.maxPassesCap ?? 0));
  const brushSet = new Set(brushPositions.map(([x, y, z]) => coordKey(x, y, z)));
  const occupied = new Map<string, Voxel>();
  for (const [k, vx] of v) occupied.set(k, cloneVoxel(vx));
  let maxPasses =
    typeof gridSizeOrBounds === 'number'
      ? gridSizeOrBounds
      : Math.min(1024, gridSizeOrBounds.maxY - gridSizeOrBounds.minY + 1);
  if (maxPassesCap > 0) {
    maxPasses = Math.min(maxPasses, maxPassesCap);
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    const voxelsInBrush = [...occupied.keys()]
      .map((k) => {
        const [x, y, z] = k.split(',').map(Number);
        return [x, y, z] as [number, number, number];
      })
      .filter(
        ([x, y, z]) => brushSet.has(coordKey(x, y, z)) && withinBounds(x, y, z, gridSizeOrBounds)
      )
      .sort((a, b) => b[1] - a[1]); // Y descending

    let moved = false;
    for (const [x, y, z] of voxelsInBrush) {
      const key = coordKey(x, y, z);
      if (!occupied.has(key)) continue;
      const voxel = cloneVoxel(occupied.get(key)!);
      occupied.delete(key);

      const neighbors = getFaceNeighbors(x, y, z);
      const candidates = neighbors.filter(
        ([nx, ny, nz]) =>
          withinBounds(nx, ny, nz, gridSizeOrBounds) &&
          brushSet.has(coordKey(nx, ny, nz)) &&
          !occupied.has(coordKey(nx, ny, nz)) &&
          (ny < y || (ny === y && (nx !== x || nz !== z)))
      );

      if (candidates.length > 0) {
        const dest = candidates.reduce((best, curr) =>
          curr[1] < best[1] ? curr : curr[1] > best[1] ? best : curr
        );
        const destKey = coordKey(dest[0], dest[1], dest[2]);
        occupied.set(destKey, voxel);
        moved = true;
      } else {
        occupied.set(key, voxel);
      }
    }
    if (!moved) break;
  }

  const toRemove = new Set<string>();
  const toAdd = new Map<string, Voxel>();
  for (const key of v.keys()) {
    if (!occupied.has(key)) toRemove.add(key);
  }
  for (const [key, voxel] of occupied) {
    if (!v.has(key)) toAdd.set(key, voxel);
  }
  return { toAdd, toRemove };
}

export function applyMelt(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  options: ApplyMeltOptions = {}
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const style = options.meltStyle ?? 'friedEgg';
  if (style === 'friedEgg') {
    return applyMeltFriedEgg(v, brushPositions, gridSizeOrBounds);
  }
  return applyMeltGravity(v, brushPositions, gridSizeOrBounds, options);
}
