export function coordKey(x: number, y: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function parseCoordKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/** Build a voxel Map from a list of positions and a single color. */
export function positionsToVoxelMap(
  positions: [number, number, number][],
  color: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [x, y, z] of positions) {
    map.set(coordKey(x, y, z), color);
  }
  return map;
}

export type SymmetryAxes = { x: boolean; y: boolean; z: boolean };

/** Returns coord keys for (x,y,z) and all mirror positions for the given axes. Deduplicated. */
export function getMirrorCoordKeys(
  x: number,
  y: number,
  z: number,
  axes: SymmetryAxes
): string[] {
  const keys = new Set<string>();
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xVals = axes.x ? [xi, -xi] : [xi];
  const yVals = axes.y ? [yi, -yi] : [yi];
  const zVals = axes.z ? [zi, -zi] : [zi];
  for (const px of xVals) {
    for (const py of yVals) {
      for (const pz of zVals) {
        keys.add(coordKey(px, py, pz));
      }
    }
  }
  return [...keys];
}

/** Returns [x,y,z] and all mirror positions for the given axes. Deduplicated. */
export function getMirrorPositions(
  x: number,
  y: number,
  z: number,
  axes: SymmetryAxes
): [number, number, number][] {
  const keys = getMirrorCoordKeys(x, y, z, axes);
  return keys.map((k) => parseCoordKey(k) as [number, number, number]);
}

/** Expands a list of positions with all symmetry mirrors. Deduplicated. */
export function expandPositionsWithSymmetry(
  positions: [number, number, number][],
  axes: SymmetryAxes
): [number, number, number][] {
  if (!axes.x && !axes.y && !axes.z) return positions;
  const keys = new Set<string>();
  for (const [x, y, z] of positions) {
    for (const k of getMirrorCoordKeys(x, y, z, axes)) {
      keys.add(k);
    }
  }
  return [...keys].map((k) => parseCoordKey(k) as [number, number, number]);
}

/** Grid bounds: x,y,z in [-size/2, size/2). When size is undefined or null, always true (unbounded). */
export function inBounds(
  x: number,
  y: number,
  z: number,
  size?: number | null
): boolean {
  if (size == null || size === undefined) return true;
  const h = size / 2;
  return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
}

/** Whether (x,y,z) is inside the given bounding box (inclusive on min/max). */
export function inBoundsBox(
  x: number,
  y: number,
  z: number,
  b: SelectionBounds
): boolean {
  return (
    x >= b.minX &&
    x <= b.maxX &&
    y >= b.minY &&
    y <= b.maxY &&
    z >= b.minZ &&
    z <= b.maxZ
  );
}

/** Bounds for operations that need a finite search space. When unbounded, use voxel extent + margin; when empty use a large box around origin. */
export function getEffectiveBounds(
  voxels: Map<string, number>,
  gridSize: number | undefined | null,
  unbounded: boolean,
  margin: number = 256
): SelectionBounds {
  if (!unbounded && gridSize != null && gridSize > 0) {
    const h = gridSize / 2;
    return {
      minX: -Math.floor(h),
      minY: -Math.floor(h),
      minZ: -Math.floor(h),
      maxX: Math.ceil(h) - 1,
      maxY: Math.ceil(h) - 1,
      maxZ: Math.ceil(h) - 1
    };
  }
  const b = getVoxelBounds(voxels);
  if (b) {
    return {
      minX: b.minX - margin,
      minY: b.minY - margin,
      minZ: b.minZ - margin,
      maxX: b.maxX + margin,
      maxY: b.maxY + margin,
      maxZ: b.maxZ + margin
    };
  }
  const m = Math.min(margin, 1e5);
  return {
    minX: -m,
    minY: -m,
    minZ: -m,
    maxX: m,
    maxY: m,
    maxZ: m
  };
}

/** Min corner [x,y,z] of selection bounding box; null if empty. */
export function getSelectionAnchor(sel: Map<string, number>): [number, number, number] | null {
  if (sel.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
  }
  return [minX, minY, minZ];
}

export type SelectionBounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

/** Bounding box of selection; null if empty. */
export function getSelectionBounds(sel: Map<string, number>): SelectionBounds | null {
  if (sel.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Bounding box of voxels; null if empty. */
export function getVoxelBounds(v: Map<string, number>): SelectionBounds | null {
  if (v.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const key of v.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Center of voxel bounding box (voxel-space). Null if empty. */
export function getVoxelCenter(v: Map<string, number>): [number, number, number] | null {
  const b = getVoxelBounds(v);
  if (!b) return null;
  return [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2];
}

/** Bounding box of positions array; null if empty. */
export function getBoundsFromPositions(
  positions: [number, number, number][]
): SelectionBounds | null {
  if (positions.length === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Center of selection bounding box. Null if empty. */
export function getSelectionCenter(sel: Map<string, number>): [number, number, number] | null {
  const b = getSelectionBounds(sel);
  if (!b) return null;
  return [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2];
}
