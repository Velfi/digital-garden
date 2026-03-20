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
export function getMirrorCoordKeys(x: number, y: number, z: number, axes: SymmetryAxes): string[] {
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
export function inBounds(x: number, y: number, z: number, size?: number | null): boolean {
  if (size == null || size === undefined) return true;
  const h = size / 2;
  return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
}

/** Whether (x,y,z) is inside the given bounding box (inclusive on min/max). */
export function inBoundsBox(x: number, y: number, z: number, b: SelectionBounds): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

/** Bounds for operations that need a finite search space: voxel extent ± margin per axis, or ±margin around origin when empty. */
export function getEffectiveBounds(voxels: Map<string, number>, margin: number = 256): SelectionBounds {
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

/**
 * Line segment vertices (pairs) for an axis-aligned box around voxels in [min, max]
 * treating each voxel as the unit cube [i, i+1]³. For THREE.LineSegments.
 */
export function selectionAabbWireframePositions(b: SelectionBounds): Float32Array {
  const x0 = b.minX;
  const y0 = b.minY;
  const z0 = b.minZ;
  const x1 = b.maxX + 1;
  const y1 = b.maxY + 1;
  const z1 = b.maxZ + 1;
  return new Float32Array([
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y0,
    z1,
    x1,
    y0,
    z1,
    x0,
    y0,
    z1,
    x0,
    y0,
    z1,
    x0,
    y0,
    z0,
    x0,
    y1,
    z0,
    x1,
    y1,
    z0,
    x1,
    y1,
    z0,
    x1,
    y1,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
    x0,
    y1,
    z1,
    x0,
    y1,
    z0,
    x0,
    y0,
    z0,
    x0,
    y1,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y0,
    z1,
    x0,
    y1,
    z1
  ]);
}

/** Set on selection overlay meshes + bbox wireframe; rotate gizmo pivots all marked children together. */
export const VOXELLE_SELECTION_PIVOT_CHILD_KEY = 'voxelleSelectionPivotChild';

/** Set only on the bbox wireframe; move-drag preview offsets the group, so this child is counter-shifted to stay put in world space until release. */
export const VOXELLE_SELECTION_BBOX_WIREFRAME_KEY = 'voxelleSelectionBboxWireframe';

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

/**
 * Integer voxel position when opening Add shape: model center if voxels exist,
 * otherwise rounded orbit / camera target.
 */
export function defaultAddShapePlacementAnchor(
  voxelMap: Map<string, number>,
  orbitTarget: { x: number; y: number; z: number }
): [number, number, number] {
  const c = getVoxelCenter(voxelMap);
  if (c) {
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
  }
  return [
    Math.round(orbitTarget.x),
    Math.round(orbitTarget.y),
    Math.round(orbitTarget.z)
  ];
}

/** Bounding box of positions array; null if empty. */
export function getBoundsFromPositions(
  positions: [number, number, number][]
): SelectionBounds | null {
  if (positions.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
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
