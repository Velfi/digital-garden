import { coordKey, parseCoordKey } from '../../coordUtils';
import type { SquishyMetaball } from './state';

const FACE_DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

export type MetaballFieldOptions = {
  threshold?: number;
  epsilon?: number;
  maxVoxelCount?: number;
  padding?: number;
};

export type MetaballVoxelizationResult = {
  positions: [number, number, number][];
  truncated: boolean;
};

const DEFAULT_THRESHOLD = 1;
const DEFAULT_EPSILON = 1e-6;
const DEFAULT_PADDING = 2;
const DEFAULT_MAX_VOXEL_COUNT = 200_000;

export function sampleMetaballFieldAtCellCenter(
  balls: readonly SquishyMetaball[],
  x: number,
  y: number,
  z: number,
  epsilon = DEFAULT_EPSILON
): number {
  const px = x + 0.5;
  const py = y + 0.5;
  const pz = z + 0.5;
  let field = 0;
  for (const ball of balls) {
    // Metaball integer coords are voxel indices; center matches pick wireframe at (x+0.5, …).
    const bx = ball.x + 0.5;
    const by = ball.y + 0.5;
    const bz = ball.z + 0.5;
    const dx = px - bx;
    const dy = py - by;
    const dz = pz - bz;
    const distSq = dx * dx + dy * dy + dz * dz;
    field += (ball.radius * ball.radius) / Math.max(distSq, epsilon);
  }
  return field;
}

/**
 * Same isosurface test as `sampleMetaballFieldAtCellCenter(...) >= threshold`, but stops
 * summing once the partial field reaches `threshold` (inside cells).
 */
export function metaballFieldAtCellCenterMeetsThreshold(
  balls: readonly SquishyMetaball[],
  x: number,
  y: number,
  z: number,
  threshold: number,
  epsilon = DEFAULT_EPSILON
): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  const pz = z + 0.5;
  let field = 0;
  for (const ball of balls) {
    const bx = ball.x + 0.5;
    const by = ball.y + 0.5;
    const bz = ball.z + 0.5;
    const dx = px - bx;
    const dy = py - by;
    const dz = pz - bz;
    const distSq = dx * dx + dy * dy + dz * dz;
    field += (ball.radius * ball.radius) / Math.max(distSq, epsilon);
    if (field >= threshold) return true;
  }
  return false;
}

export function computeMetaballVoxelPositions(
  balls: readonly SquishyMetaball[],
  options: MetaballFieldOptions = {}
): MetaballVoxelizationResult {
  if (balls.length === 0) return { positions: [], truncated: false };
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const padding = options.padding ?? DEFAULT_PADDING;
  const maxVoxelCount = options.maxVoxelCount ?? DEFAULT_MAX_VOXEL_COUNT;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const ball of balls) {
    const extent = Math.ceil(ball.radius + padding);
    minX = Math.min(minX, ball.x - extent);
    minY = Math.min(minY, ball.y - extent);
    minZ = Math.min(minZ, ball.z - extent);
    maxX = Math.max(maxX, ball.x + extent);
    maxY = Math.max(maxY, ball.y + extent);
    maxZ = Math.max(maxZ, ball.z + extent);
  }

  const positions: [number, number, number][] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (!metaballFieldAtCellCenterMeetsThreshold(balls, x, y, z, threshold, epsilon))
          continue;
        positions.push([x, y, z]);
        if (positions.length >= maxVoxelCount) return { positions, truncated: true };
      }
    }
  }
  return { positions, truncated: false };
}

/**
 * Keep voxels within `wallThickness` layers of the exterior (face-adjacent / 6-neighborhood).
 * `wallThickness` 1 = outer surface only; larger values extend the shell inward.
 * Unreachable interior (e.g. sealed voids) is dropped.
 */
export function shellVoxelPositions(
  positions: [number, number, number][],
  wallThickness: number
): [number, number, number][] {
  if (positions.length === 0) return positions;
  const w = Math.max(1, Math.floor(wallThickness));
  const solid = new Set(positions.map(([x, y, z]) => coordKey(x, y, z)));

  const dist = new Map<string, number>();
  const queue: [number, number, number][] = [];

  for (const key of solid) {
    const [x, y, z] = parseCoordKey(key);
    let touchesOutside = false;
    for (const [dx, dy, dz] of FACE_DIRS) {
      if (!solid.has(coordKey(x + dx, y + dy, z + dz))) {
        touchesOutside = true;
        break;
      }
    }
    if (touchesOutside) {
      dist.set(key, 0);
      queue.push([x, y, z]);
    }
  }

  if (queue.length === 0) return [];

  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y, z] = queue[qi]!;
    const d = dist.get(coordKey(x, y, z))!;
    const nd = d + 1;
    for (const [dx, dy, dz] of FACE_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const nk = coordKey(nx, ny, nz);
      if (!solid.has(nk) || dist.has(nk)) continue;
      dist.set(nk, nd);
      queue.push([nx, ny, nz]);
    }
  }

  const out: [number, number, number][] = [];
  for (const key of solid) {
    const d = dist.get(key);
    if (d !== undefined && d < w) out.push(parseCoordKey(key));
  }
  return out;
}
