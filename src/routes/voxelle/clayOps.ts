import { coordKey, inBounds } from './coordUtils';

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

/** Smooth: fill single-voxel concavities, remove single-voxel bumps. */
export function applySmooth(
  v: Map<string, number>,
  brushPositions: [number, number, number][],
  gridSize: number
): { toAdd: Map<string, number>; toRemove: Set<string> } {
  const toAdd = new Map<string, number>();
  const toRemove = new Set<string>();
  const brushSet = new Set(brushPositions.map(([x, y, z]) => coordKey(x, y, z)));

  for (const [x, y, z] of brushPositions) {
    if (!inBounds(x, y, z, gridSize)) continue;
    const key = coordKey(x, y, z);
    const filled = v.has(key);
    const neighbors = getFaceNeighbors(x, y, z);
    let filledCount = 0;
    const neighborColors: number[] = [];
    for (const [nx, ny, nz] of neighbors) {
      if (!inBounds(nx, ny, nz, gridSize)) continue;
      const nk = coordKey(nx, ny, nz);
      if (v.has(nk)) {
        filledCount++;
        neighborColors.push(v.get(nk)!);
      }
    }

    if (!filled && filledCount >= 4) {
      const avg =
        neighborColors.length > 0
          ? Math.round(
              neighborColors.reduce((a, c) => a + c, 0) / neighborColors.length
            )
          : 0x888888;
      toAdd.set(key, avg);
    } else if (filled && filledCount <= 2) {
      toRemove.add(key);
    }
  }
  return { toAdd, toRemove };
}

/** Inflate: push surface outward along face normals. For each filled brush voxel, add a voxel in each empty face-neighbor direction with probability strength (0–1). */
export function applyInflate(
  v: Map<string, number>,
  brushPositions: [number, number, number][],
  gridSize: number,
  strength: number
): { toAdd: Map<string, number>; toRemove: Set<string> } {
  const toAdd = new Map<string, number>();
  const toRemove = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!inBounds(x, y, z, gridSize)) continue;
    const key = coordKey(x, y, z);
    if (!v.has(key)) continue;
    const color = v.get(key)!;
    const neighbors = getFaceNeighbors(x, y, z);
    for (const [nx, ny, nz] of neighbors) {
      if (!inBounds(nx, ny, nz, gridSize)) continue;
      const nk = coordKey(nx, ny, nz);
      if (!v.has(nk) && (strength >= 1 || Math.random() < strength)) toAdd.set(nk, color);
    }
  }
  return { toAdd, toRemove };
}

/** Level: add voxels at levelY to fill depressions. Only affects y <= levelY; never removes above. */
export function applyLevel(
  v: Map<string, number>,
  brushPositions: [number, number, number][],
  levelY: number,
  getColor: () => number,
  gridSize: number
): { toAdd: Map<string, number>; toRemove: Set<string> } {
  const toAdd = new Map<string, number>();
  const toRemove = new Set<string>();
  const xzInBrush = new Set<string>();

  for (const [x, y, z] of brushPositions) {
    if (!inBounds(x, y, z, gridSize)) continue;
    xzInBrush.add(`${x},${z}`);
  }

  for (const xz of xzInBrush) {
    const [x, z] = xz.split(',').map(Number);
    const key = coordKey(x, levelY, z);
    if (!inBounds(x, levelY, z, gridSize)) continue;
    if (!v.has(key)) toAdd.set(key, getColor());
  }
  return { toAdd, toRemove };
}

/** Melt: spread voxels downhill, highest first. Multi-pass: each pass lets voxels fall one step until no more move. */
export function applyMelt(
  v: Map<string, number>,
  brushPositions: [number, number, number][],
  gridSize: number
): { toAdd: Map<string, number>; toRemove: Set<string> } {
  const toAdd = new Map<string, number>();
  const toRemove = new Set<string>();
  const brushSet = new Set(brushPositions.map(([x, y, z]) => coordKey(x, y, z)));
  const occupied = new Map(v);
  const maxPasses = gridSize; // tower height at most

  for (let pass = 0; pass < maxPasses; pass++) {
    const voxelsInBrush = [...occupied.keys()]
      .map((k) => {
        const [x, y, z] = k.split(',').map(Number);
        return [x, y, z] as [number, number, number];
      })
      .filter(([x, y, z]) => brushSet.has(coordKey(x, y, z)) && inBounds(x, y, z, gridSize))
      .sort((a, b) => b[1] - a[1]); // Y descending

    let moved = false;
    for (const [x, y, z] of voxelsInBrush) {
      const key = coordKey(x, y, z);
      if (!occupied.has(key)) continue;
      const color = occupied.get(key)!;
      occupied.delete(key);

      const neighbors = getFaceNeighbors(x, y, z);
      // Down or sideways into empty space (candle-style); only to positions inside brush so we only rearrange, never create
      const candidates = neighbors.filter(
        ([nx, ny, nz]) =>
          inBounds(nx, ny, nz, gridSize) &&
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
        toRemove.add(key);
        toAdd.set(destKey, color);
        occupied.set(destKey, color);
        moved = true;
      } else {
        occupied.set(key, color);
      }
    }
    if (!moved) break;
  }
  return { toAdd, toRemove };
}
