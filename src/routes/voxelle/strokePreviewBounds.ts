/**
 * Analytic AABBs for large plane / cuboid / line stroke previews (avoid enumerating voxels).
 */
import type { SelectionBounds, SymmetryAxes } from './coordUtils';
import type { PathThickenParams, Vec3Like } from './strokeGeometry';

/** Above this voxel count, use bbox preview mesh instead of greedy preview. */
export const PREVIEW_BBOX_VOXEL_THRESHOLD = 20_000;

/** Above this selection size, skip per-voxel greedy overlay (wireframe + bbox fill only). */
export const SELECTION_OVERLAY_MESH_THRESHOLD = 20_000;

function fixedAxisFromNormal(faceNormal: Vec3Like): 0 | 1 | 2 {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  return (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
}

/** Outer AABB of an axis-aligned plane rectangle (same for hollow vs solid). */
export function planeStrokeBounds(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like
): SelectionBounds {
  const fixedAxis = fixedAxisFromNormal(faceNormal);
  if (fixedAxis === 0) {
    const x = a[0];
    return {
      minX: x,
      maxX: x,
      minY: Math.min(a[1], b[1]),
      maxY: Math.max(a[1], b[1]),
      minZ: Math.min(a[2], b[2]),
      maxZ: Math.max(a[2], b[2])
    };
  }
  if (fixedAxis === 1) {
    const y = a[1];
    return {
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minY: y,
      maxY: y,
      minZ: Math.min(a[2], b[2]),
      maxZ: Math.max(a[2], b[2])
    };
  }
  const z = a[2];
  return {
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1]),
    minZ: z,
    maxZ: z
  };
}

/** Outer AABB of axis-aligned cuboid extrusion (hollow uses same outer box as solid). */
export function cuboidStrokeBounds(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): SelectionBounds {
  const plane = planeStrokeBounds(a, b, faceNormal);
  const fixedAxis = fixedAxisFromNormal(faceNormal);
  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][fixedAxis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const axisCoordA = a[fixedAxis];
  const dir = depth > 0 ? step : -step;
  const endCoord = axisCoordA + dir * layers;
  const lo = Math.min(axisCoordA, endCoord);
  const hi = Math.max(axisCoordA, endCoord);
  const out = { ...plane };
  if (fixedAxis === 0) {
    out.minX = lo;
    out.maxX = hi;
  } else if (fixedAxis === 1) {
    out.minY = lo;
    out.maxY = hi;
  } else {
    out.minZ = lo;
    out.maxZ = hi;
  }
  return out;
}

/** Solid cuboid voxel count (matches `getAxisAlignedCuboid` with hollow off). */
export function cuboidSolidVoxelCount(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): number {
  const box = cuboidStrokeBounds(a, b, faceNormal, depth);
  const wx = box.maxX - box.minX + 1;
  const wy = box.maxY - box.minY + 1;
  const wz = box.maxZ - box.minZ + 1;
  return wx * wy * wz;
}

/** Conservative AABB for a disk in the plane normal to `faceNormal` (matches circle stroke extent). */
export function diskStrokeBounds(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like
): SelectionBounds {
  const fixedAxis = fixedAxisFromNormal(faceNormal);
  let cu: number;
  let cv: number;
  let eu: number;
  let ev: number;
  if (fixedAxis === 0) {
    cu = center[1];
    cv = center[2];
    eu = edge[1];
    ev = edge[2];
  } else if (fixedAxis === 1) {
    cu = center[0];
    cv = center[2];
    eu = edge[0];
    ev = edge[2];
  } else {
    cu = center[0];
    cv = center[1];
    eu = edge[0];
    ev = edge[1];
  }
  const du = eu - cu;
  const dv = ev - cv;
  const rSq = du * du + dv * dv;
  const R = Math.ceil(Math.sqrt(rSq));
  if (fixedAxis === 0) {
    const x = center[0];
    return {
      minX: x,
      maxX: x,
      minY: cu - R,
      maxY: cu + R,
      minZ: cv - R,
      maxZ: cv + R
    };
  }
  if (fixedAxis === 1) {
    const y = center[1];
    return {
      minX: cu - R,
      maxX: cu + R,
      minY: y,
      maxY: y,
      minZ: cv - R,
      maxZ: cv + R
    };
  }
  const z = center[2];
  return {
    minX: cu - R,
    maxX: cu + R,
    minY: cv - R,
    maxY: cv + R,
    minZ: z,
    maxZ: z
  };
}

/** Outer AABB of cylinder extrusion (cone fits inside the same box as a cylinder with the base radius). */
export function cylinderStrokeBounds(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): SelectionBounds {
  const plane = diskStrokeBounds(center, edge, faceNormal);
  const fixedAxis = fixedAxisFromNormal(faceNormal);
  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][fixedAxis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;
  const axisCoord = center[fixedAxis];
  const endCoord = axisCoord + dir * layers;
  const lo = Math.min(axisCoord, endCoord);
  const hi = Math.max(axisCoord, endCoord);
  const out = { ...plane };
  if (fixedAxis === 0) {
    out.minX = lo;
    out.maxX = hi;
  } else if (fixedAxis === 1) {
    out.minY = lo;
    out.maxY = hi;
  } else {
    out.minZ = lo;
    out.maxZ = hi;
  }
  return out;
}

/** Upper-bound voxel count inside cylinderStrokeBounds (preview LOD threshold; not exact fill count). */
export function cylinderSolidVoxelCount(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): number {
  const box = cylinderStrokeBounds(center, edge, faceNormal, depth);
  const wx = box.maxX - box.minX + 1;
  const wy = box.maxY - box.minY + 1;
  const wz = box.maxZ - box.minZ + 1;
  return wx * wy * wz;
}

/**
 * Oriented cylinder/cone proxy for large cylinder stroke preview (meshManager).
 * Local +Y is the axis from base (radiusBottom at −Y) toward tip (radiusTop at +Y).
 */
export type CylinderPreviewVolume = {
  center: [number, number, number];
  height: number;
  radiusBottom: number;
  radiusTop: number;
  axisX: number;
  axisY: number;
  axisZ: number;
};

const MIN_PREVIEW_CYLINDER_RADIUS = 0.25;

/** Build a right cylinder or tapered solid matching cylinderStrokeBounds extent and base disk. */
export function buildCylinderPreviewVolume(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like,
  bounds: SelectionBounds,
  depth: number,
  taperPct: number
): CylinderPreviewVolume {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;

  let cu: number;
  let cv: number;
  let eu: number;
  let ev: number;
  if (fixedAxis === 0) {
    cu = center[1];
    cv = center[2];
    eu = edge[1];
    ev = edge[2];
  } else if (fixedAxis === 1) {
    cu = center[0];
    cv = center[2];
    eu = edge[0];
    ev = edge[2];
  } else {
    cu = center[0];
    cv = center[1];
    eu = edge[0];
    ev = edge[1];
  }

  const baseR = Math.sqrt((eu - cu) ** 2 + (ev - cv) ** 2);
  const R = Math.max(baseR, MIN_PREVIEW_CYLINDER_RADIUS);

  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][fixedAxis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;
  const taper = Math.min(100, Math.max(0, taperPct));

  const axis: [number, number, number] = [0, 0, 0];
  axis[fixedAxis] = dir > 0 ? 1 : -1;

  let height: number;
  if (fixedAxis === 0) height = bounds.maxX - bounds.minX + 1;
  else if (fixedAxis === 1) height = bounds.maxY - bounds.minY + 1;
  else height = bounds.maxZ - bounds.minZ + 1;

  const c: [number, number, number] = [center[0], center[1], center[2]];
  c[fixedAxis] = center[fixedAxis] + (dir * layers) / 2;

  const radiusTop = R * (1 - taper / 100);

  return {
    center: c,
    height: Math.max(height, MIN_PREVIEW_CYLINDER_RADIUS),
    radiusBottom: R,
    radiusTop: Math.max(radiusTop, 0),
    axisX: axis[0],
    axisY: axis[1],
    axisZ: axis[2]
  };
}

/** AABB containing axis-aligned or face-plane Bresenham line voxels between a and b. */
export function lineStrokeBounds(
  a: [number, number, number],
  b: [number, number, number],
  faceAligned: boolean
): SelectionBounds {
  if (faceAligned) {
    return {
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minY: Math.min(a[1], b[1]),
      maxY: Math.max(a[1], b[1]),
      minZ: Math.min(a[2], b[2]),
      maxZ: Math.max(a[2], b[2])
    };
  }
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  if (dx >= dy && dx >= dz) {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    return {
      minX: x0,
      maxX: x1,
      minY: a[1],
      maxY: a[1],
      minZ: a[2],
      maxZ: a[2]
    };
  }
  if (dy >= dx && dy >= dz) {
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    return {
      minX: a[0],
      maxX: a[0],
      minY: y0,
      maxY: y1,
      minZ: a[2],
      maxZ: a[2]
    };
  }
  const z0 = Math.min(a[2], b[2]);
  const z1 = Math.max(a[2], b[2]);
  return {
    minX: a[0],
    maxX: a[0],
    minY: a[1],
    maxY: a[1],
    minZ: z0,
    maxZ: z1
  };
}

function cornersOfBounds(b: SelectionBounds): [number, number, number][] {
  return [
    [b.minX, b.minY, b.minZ],
    [b.maxX, b.minY, b.minZ],
    [b.minX, b.maxY, b.minZ],
    [b.maxX, b.maxY, b.minZ],
    [b.minX, b.minY, b.maxZ],
    [b.maxX, b.minY, b.maxZ],
    [b.minX, b.maxY, b.maxZ],
    [b.maxX, b.maxY, b.maxZ]
  ];
}

function boundsFromMinMax(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): SelectionBounds {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Union AABB after origin mirrors (symmetryX/Y/Z). */
export function expandStrokePreviewBoundsOriginMirror(
  b: SelectionBounds,
  axes: SymmetryAxes
): SelectionBounds {
  if (!axes.x && !axes.y && !axes.z) return b;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of cornersOfBounds(b)) {
    const xVals = axes.x ? [x, -x] : [x];
    const yVals = axes.y ? [y, -y] : [y];
    const zVals = axes.z ? [z, -z] : [z];
    for (const px of xVals) {
      for (const py of yVals) {
        for (const pz of zVals) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          minZ = Math.min(minZ, pz);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
          maxZ = Math.max(maxZ, pz);
        }
      }
    }
  }
  return boundsFromMinMax(minX, minY, minZ, maxX, maxY, maxZ);
}

/** Union AABB after mirroring about integer center (shift-plane symmetry). */
export function expandStrokePreviewBoundsAroundCenter(
  b: SelectionBounds,
  center: [number, number, number],
  axes: SymmetryAxes
): SelectionBounds {
  if (!axes.x && !axes.y && !axes.z) return b;
  const [cx, cy, cz] = center.map(Math.floor) as [number, number, number];
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of cornersOfBounds(b)) {
    const xVals = axes.x ? [x, 2 * cx - x] : [x];
    const yVals = axes.y ? [y, 2 * cy - y] : [y];
    const zVals = axes.z ? [z, 2 * cz - z] : [z];
    for (const px of xVals) {
      for (const py of yVals) {
        for (const pz of zVals) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          minZ = Math.min(minZ, pz);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
          maxZ = Math.max(maxZ, pz);
        }
      }
    }
  }
  return boundsFromMinMax(minX, minY, minZ, maxX, maxY, maxZ);
}

/**
 * Conservative expansion for draw brush on plane/cuboid/line preview.
 * Clay / Spray / wall etc. should not use bbox preview path.
 */
export function inflateStrokePreviewBoundsForDrawBrush(
  b: SelectionBounds,
  params: Pick<PathThickenParams, 'drawBrushShape' | 'drawBrushSize'>
): SelectionBounds {
  const dbs = params.drawBrushSize ?? 0;
  if (dbs <= 0) return b;
  const shape = params.drawBrushShape ?? 'sphere';
  const m =
    shape === 'cube'
      ? Math.ceil(Math.abs(dbs))
      : shape === 'pyramid'
        ? Math.ceil(2 * Math.abs(dbs))
        : Math.ceil(Math.abs(dbs));
  return {
    minX: b.minX - m,
    minY: b.minY - m,
    minZ: b.minZ - m,
    maxX: b.maxX + m,
    maxY: b.maxY + m,
    maxZ: b.maxZ + m
  };
}
