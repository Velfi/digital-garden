export function coordKey(x: number, y: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function parseCoordKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/** Grid bounds: x,y,z in [-size/2, size/2) */
export function inBounds(x: number, y: number, z: number, size: number): boolean {
  const h = size / 2;
  return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
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
