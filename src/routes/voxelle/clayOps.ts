import { coordKey, inBounds, inBoundsBox } from './coordUtils';
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

/** Smooth: fill single-voxel concavities, remove single-voxel bumps. */
export function applySmooth(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const toAdd = new Map<string, Voxel>();
  const toRemove = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!withinBounds(x, y, z, gridSizeOrBounds)) continue;
    const key = coordKey(x, y, z);
    const filled = v.has(key);
    const neighbors = getFaceNeighbors(x, y, z);
    let filledCount = 0;
    const neighborVoxels: Voxel[] = [];
    for (const [nx, ny, nz] of neighbors) {
      if (!withinBounds(nx, ny, nz, gridSizeOrBounds)) continue;
      const nk = coordKey(nx, ny, nz);
      if (v.has(nk)) {
        filledCount++;
        neighborVoxels.push(v.get(nk)!);
      }
    }

    if (!filled && filledCount >= 4) {
      const blended =
        neighborVoxels.length > 0 ? blendVoxelsForSmooth(neighborVoxels) : {
            color: 0x888888,
            material: 'plastic' as const
          };
      toAdd.set(key, blended);
    } else if (filled && filledCount <= 2) {
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

/** Melt: spread voxels downhill, highest first. Multi-pass: each pass lets voxels fall one step until no more move. Conserves blocks: returns net delta (initial vs final). */
export function applyMelt(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const brushSet = new Set(brushPositions.map(([x, y, z]) => coordKey(x, y, z)));
  const occupied = new Map<string, Voxel>();
  for (const [k, vx] of v) occupied.set(k, cloneVoxel(vx));
  const maxPasses =
    typeof gridSizeOrBounds === 'number'
      ? gridSizeOrBounds
      : Math.min(1024, gridSizeOrBounds.maxY - gridSizeOrBounds.minY + 1);

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
      // Down or sideways into empty space (candle-style); only to positions inside brush so we only rearrange, never create
      const candidates = neighbors.filter(
        ([nx, ny, nz]) =>
          withinBounds(nx, ny, nz, gridSizeOrBounds) &&
          brushSet.has(coordKey(nx, ny, nz)) &&
          !occupied.has(coordKey(nx, ny, nz)) &&
          (ny < y || (ny === y && (nx !== x || nz !== z)))
      );

      if (candidates.length > 0) {
        // Prefer downward; if multiple at same Y (horizontal), pick one
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

  // Net delta: cells that lost a voxel vs cells that gained one (conserves block count)
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
