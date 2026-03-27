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

/** Smooth (voxel): majority-style fill/remove in the brush over a configurable neighborhood (not mesh Laplacian). */
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
