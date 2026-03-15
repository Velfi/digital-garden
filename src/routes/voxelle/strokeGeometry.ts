import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export type Vec3Like = { x: number; y: number; z: number };

/** Path from origin stepping along direction for length voxel steps. Direction is normalized. */
export function getRayDirectionPath(
  origin: [number, number, number],
  direction: Vec3Like,
  length: number
): [number, number, number][] {
  if (length <= 0) return [origin];
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return [origin];
  const ndx = dx / len;
  const ndy = dy / len;
  const ndz = dz / len;
  const positions: [number, number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= length; i++) {
    const x = Math.round(origin[0] + i * ndx);
    const y = Math.round(origin[1] + i * ndy);
    const z = Math.round(origin[2] + i * ndz);
    const k = `${x},${y},${z}`;
    if (!seen.has(k)) {
      seen.add(k);
      positions.push([x, y, z]);
    }
  }
  return positions;
}

/** Map continuous radius to discrete size (0=1x1, 0.5=2x2, 1=3x3, 2=5x5...) so taper hits 3→2→1. */
function taperRadiusToSize(c: number): number {
  if (c <= 0) return 0;
  if (c < 0.5) return 0;
  if (c < 1) return 0.5; // 2x2
  if (c < 2) return 1;
  if (c < 3) return 2;
  return 3;
}

/** Add voxels for a single path point with given size. Size 0=1x1, 0.5=2x2, 1+=cube radius. */
function addThickenPoint(
  px: number,
  py: number,
  pz: number,
  size: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (size === 0) {
    const k = `${px},${py},${pz}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push([px, py, pz]);
    }
    return;
  }
  if (size === 0.5) {
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        for (let k = 0; k <= 1; k++) {
          const x = px + i;
          const y = py + j;
          const z = pz + k;
          const key = `${x},${y},${z}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push([x, y, z]);
          }
        }
      }
    }
    return;
  }
  const radius = Math.floor(size);
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const x = px + dx;
        const y = py + dy;
        const z = pz + dz;
        const key = `${x},${y},${z}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push([x, y, z]);
        }
      }
    }
  }
}

/** Like thickenPath but radius interpolates from baseRadius (start) to tipRadius (end). Uses discrete steps 3→2→1. */
export function thickenPathTapered(
  positions: [number, number, number][],
  baseRadius: number,
  tipRadius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (baseRadius <= 0 && tipRadius <= 0) return positions;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  const n = positions.length;
  for (let idx = 0; idx < n; idx++) {
    const t = n === 1 ? 0 : idx / (n - 1);
    const c = baseRadius + t * (tipRadius - baseRadius);
    const size = taperRadiusToSize(Math.max(0, c));
    const [px, py, pz] = positions[idx];
    addThickenPoint(px, py, pz, size, seen, result);
  }
  return result;
}

/** Expands each path point into a cube of radius r (Chebyshev). Radius 0 = single voxel. */
export function thickenPath(
  positions: [number, number, number][],
  radius: number
): [number, number, number][] {
  if (radius <= 0) return positions;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = px + dx;
          const y = py + dy;
          const z = pz + dz;
          const k = `${x},${y},${z}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([x, y, z]);
          }
        }
      }
    }
  }
  return result;
}

/** Thickens path only in the plane perpendicular to the given axis (0=X, 1=Y, 2=Z). Used for wall width so height is unaffected. */
function thickenPathInPlane(
  positions: [number, number, number][],
  radius: number,
  normalAxis: 0 | 1 | 2
): [number, number, number][] {
  if (radius <= 0) return positions;
  const seen = new Set<string>(positions.map(([x, y, z]) => `${x},${y},${z}`));
  const result: [number, number, number][] = [...positions];
  for (const [px, py, pz] of positions) {
    if (normalAxis === 0) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const k = `${px},${py + dy},${pz + dz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px, py + dy, pz + dz]);
          }
        }
      }
    } else if (normalAxis === 1) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const k = `${px + dx},${py},${pz + dz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px + dx, py, pz + dz]);
          }
        }
      }
    } else {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const k = `${px + dx},${py + dy},${pz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px + dx, py + dy, pz]);
          }
        }
      }
    }
  }
  return result;
}

/** Sphere: x²+y²+z² <= r² (Euclidean). r=0 → single voxel, r=1 → 3³ sphere (~14 voxels), r=2 → 5³ sphere. */
function getSphereVoxels(
  cx: number,
  cy: number,
  cz: number,
  r: number
): [number, number, number][] {
  if (r <= 0) return [[Math.round(cx), Math.round(cy), Math.round(cz)]];
  const ri = Math.floor(r);
  const rSq = ri * ri;
  const positions: [number, number, number][] = [];
  for (let dx = -ri; dx <= ri; dx++) {
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dz = -ri; dz <= ri; dz++) {
        if (dx * dx + dy * dy + dz * dz <= rSq) {
          positions.push([cx + dx, cy + dy, cz + dz]);
        }
      }
    }
  }
  return positions;
}

/** Expands each path point into a sphere. Radius 0=single voxel, 1=3³, 2=5³, 3=7³, 4=9³, 5=11³. Scatter: max voxel offset for sphere centers (0=none). When radiusMin/radiusMax provided and radiusMax > radiusMin, picks random radius per sphere. */
export function puffPath(
  positions: [number, number, number][],
  radius: number,
  scatter: number = 0,
  radiusMin?: number,
  radiusMax?: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  const useRange =
    radiusMin !== undefined &&
    radiusMax !== undefined &&
    Math.floor(radiusMax) > Math.floor(radiusMin);
  const rMin = useRange ? Math.max(0, Math.floor(radiusMin!)) : Math.max(0, Math.floor(radius));
  const rMax = useRange ? Math.max(0, Math.floor(radiusMax!)) : rMin;
  const s = Math.max(0, Math.floor(scatter));
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    const ox = s > 0 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    const oy = s > 0 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    const oz = s > 0 ? Math.round((Math.random() * 2 - 1) * s) : 0;
    const r = useRange ? rMin + Math.floor(Math.random() * (rMax - rMin + 1)) : rMin;
    const voxels = getSphereVoxels(px + ox, py + oy, pz + oz, r);
    for (const [x, y, z] of voxels) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      const zi = Math.round(z);
      const k = `${xi},${yi},${zi}`;
      if (!seen.has(k)) {
        seen.add(k);
        result.push([xi, yi, zi]);
      }
    }
  }
  return result;
}

/** World-axis direction for wall/spray. 'auto' = use face normal (wall only). */
export type SprayDirectionName = 'none' | 'auto' | 'down' | 'up' | 'forward' | 'back' | 'left' | 'right';

/** Snap face normal to nearest principal axis (max |component|). */
export function snapNormalToAxis(n: { x: number; y: number; z: number }): [number, number, number] {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return [n.x >= 0 ? 1 : -1, 0, 0];
  if (ay >= az) return [0, n.y >= 0 ? 1 : -1, 0];
  return [0, 0, n.z >= 0 ? 1 : -1];
}

/** Returns [dx, dy, dz] for the given direction. When dir is 'auto', pass faceNormal to use it. */
export function getSprayDirectionVector(
  dir: SprayDirectionName,
  faceNormal?: { x: number; y: number; z: number } | null
): [number, number, number] | null {
  if (dir === 'auto' && faceNormal) return snapNormalToAxis(faceNormal);
  switch (dir) {
    case 'none':
    case 'auto':
      return null;
    case 'down':
      return [0, -1, 0];
    case 'up':
      return [0, 1, 0];
    case 'forward':
      return [0, 0, -1];
    case 'back':
      return [0, 0, 1];
    case 'left':
      return [-1, 0, 0];
    case 'right':
      return [1, 0, 0];
    default:
      return null;
  }
}

/** One voxel step perpendicular to direction (for 2-voxel wall width). */
function perpendicularStep(dir: [number, number, number]): [number, number, number] {
  const [dx, dy, dz] = dir;
  if (dx !== 0) return [0, 1, 0];
  if (dy !== 0) return [1, 0, 0];
  return [0, 1, 0];
}

/** From each path point, add voxels at point + k*direction for k = 1..streakLength. Dedupes via seen set. */
function directionalStreakFromPath(
  positions: [number, number, number][],
  direction: [number, number, number],
  streakLength: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  const len = Math.max(0, Math.floor(streakLength));
  if (len === 0) return;
  const [dx, dy, dz] = direction;
  for (const [px, py, pz] of positions) {
    const xi = Math.round(px);
    const yi = Math.round(py);
    const zi = Math.round(pz);
    for (let k = 1; k <= len; k++) {
      const x = xi + k * dx;
      const y = yi + k * dy;
      const z = zi + k * dz;
      const key = `${x},${y},${z}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push([x, y, z]);
      }
    }
  }
}

/** Params for path thickening; used by both preview and apply to avoid divergence. */
export interface PathThickenParams {
  strokeMode: string;
  clayMode?: string;
  clayBrushRadius: number;
  branchTaper: boolean;
  puffRadius: number;
  puffScatter: number;
  puffRadiusRange: boolean;
  puffRadiusMin: number;
  puffRadiusMax: number;
  airbrushRadius: number;
  airbrushScatter: number;
  airbrushRadiusRange: boolean;
  airbrushRadiusMin: number;
  airbrushRadiusMax: number;
  /** Wall/spray direction. 'auto' uses wallFaceNormal when present. */
  sprayDirection?: SprayDirectionName;
  sprayStreakLength?: number;
  /** Wall: path thickness (0 = 1 voxel, 1+ = thickenPath radius). */
  wallWidth?: number;
  /** Wall: extension along direction (min 2). */
  wallHeight?: number;
  /** Wall: when direction is 'auto', use this face normal. */
  wallFaceNormal?: { x: number; y: number; z: number } | null;
  drawBrushShape?: 'sphere' | 'cube' | 'pyramid';
  drawBrushSize?: number;
  /** When true and drawBrushFaceNormal set, offset brush by radius*normal so it sits on surface */
  drawBrushSnapToSurface?: boolean;
  drawBrushFaceNormal?: { x: number; y: number; z: number };
}

const CLAY_PATH_MODES = ['bulk', 'smooth', 'level', 'gouge', 'branch', 'puffy', 'melt', 'wall', 'inflate'] as const;

/**
 * Thickens a path according to stroke/clay mode. Single source of truth for preview and apply.
 * Priority: clay puffy > airbrush > clay branch+taper > clay thicken > raw.
 */
export function thickenPathForStroke(
  positions: [number, number, number][],
  params: PathThickenParams
): [number, number, number][] {
  if (positions.length === 0) return [];
  const isClayPath =
    params.clayMode !== undefined && CLAY_PATH_MODES.includes(params.clayMode as (typeof CLAY_PATH_MODES)[number]);

  // Clay modes take precedence; stroke mode (e.g. airbrush) only applies to Draw tools
  if (isClayPath && params.clayMode === 'puffy') {
    return puffPath(
      positions,
      params.puffRadius,
      params.puffScatter,
      params.puffRadiusRange ? params.puffRadiusMin : undefined,
      params.puffRadiusRange ? params.puffRadiusMax : undefined
    );
  }
  if (isClayPath && params.clayMode === 'wall') {
    const dir = params.sprayDirection ?? 'auto';
    const dirVec = getSprayDirectionVector(dir, params.wallFaceNormal ?? undefined);
    if (!dirVec) return positions;
    const width = Math.max(0, Math.floor(params.wallWidth ?? 0));
    let basePositions: [number, number, number][];
    if (width === 0) {
      basePositions = positions;
    } else if (width === 1) {
      // 2 voxels thick: path + one step perpendicular to direction
      const perp = perpendicularStep(dirVec);
      const seen = new Set<string>(positions.map(([x, y, z]) => `${x},${y},${z}`));
      basePositions = [...positions];
      for (const [px, py, pz] of positions) {
        const x = px + perp[0];
        const y = py + perp[1];
        const z = pz + perp[2];
        const key = `${x},${y},${z}`;
        if (!seen.has(key)) {
          seen.add(key);
          basePositions.push([x, y, z]);
        }
      }
    } else {
      // Thicken only in the plane perpendicular to wall direction so width does not affect height
      const dirAxis = (dirVec[0] !== 0 ? 0 : dirVec[1] !== 0 ? 1 : 2) as 0 | 1 | 2;
      basePositions = thickenPathInPlane(positions, width - 1, dirAxis);
    }
    const height = Math.max(2, Math.floor(params.wallHeight ?? params.sprayStreakLength ?? 2));
    const seen = new Set<string>(basePositions.map(([x, y, z]) => `${x},${y},${z}`));
    const result: [number, number, number][] = [...basePositions];
    directionalStreakFromPath(basePositions, dirVec, height, seen, result);
    return result;
  }
  if (isClayPath && params.clayMode === 'branch' && params.branchTaper) {
    return thickenPathTapered(positions, params.clayBrushRadius, 0);
  }
  if (isClayPath && params.clayBrushRadius > 0) {
    return thickenPath(positions, params.clayBrushRadius);
  }
  if (isClayPath) return positions;
  if (params.strokeMode === 'airbrush') {
    return puffPath(
      positions,
      params.airbrushRadius,
      params.airbrushScatter,
      params.airbrushRadiusRange ? params.airbrushRadiusMin : undefined,
      params.airbrushRadiusRange ? params.airbrushRadiusMax : undefined
    );
  }
  const dbs = params.drawBrushSize ?? 0;
  if (dbs > 0) {
    const shape = params.drawBrushShape ?? 'sphere';
    const snap = params.drawBrushSnapToSurface ?? false;
    const n = snap ? params.drawBrushFaceNormal : undefined;
    const r = Math.floor(dbs);
    const positionsToUse =
      n && r > 0
        ? positions.map(([px, py, pz]) => [
            px + n.x * r,
            py + n.y * r,
            pz + n.z * r
          ] as [number, number, number])
        : positions;
    if (shape === 'pyramid') return pyramidPath(positionsToUse, dbs);
    if (shape === 'cube') return thickenPath(positionsToUse, dbs);
    return puffPath(positionsToUse, dbs, 0);
  }
  return positions;
}

/** Pyramid: base (2r+1)² at y=-r, tapering to 1x1 at y=+r. */
function getPyramidVoxels(
  cx: number,
  cy: number,
  cz: number,
  r: number
): [number, number, number][] {
  if (r <= 0) return [[Math.round(cx), Math.round(cy), Math.round(cz)]];
  const ri = Math.floor(r);
  const positions: [number, number, number][] = [];
  for (let dy = -ri; dy <= ri; dy++) {
    const layerR = Math.round(ri * (1 - (dy + ri) / (2 * ri)));
    for (let dx = -layerR; dx <= layerR; dx++) {
      for (let dz = -layerR; dz <= layerR; dz++) {
        positions.push([cx + dx, cy + dy, cz + dz]);
      }
    }
  }
  return positions;
}

/** Expands each path point into a pyramid brush. */
export function pyramidPath(
  positions: [number, number, number][],
  radius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (radius <= 0) return positions;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    for (const [x, y, z] of getPyramidVoxels(px, py, pz, radius)) {
      const k = `${x},${y},${z}`;
      if (!seen.has(k)) {
        seen.add(k);
        result.push([x, y, z]);
      }
    }
  }
  return result;
}

/** Applies a brush along a path. Sphere uses puffPath (scatter=0); cube uses thickenPath. */
export function applyBrushAlongPath(
  positions: [number, number, number][],
  shape: 'sphere' | 'cube',
  radius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (shape === 'sphere') {
    return puffPath(positions, radius, 0);
  }
  return thickenPath(positions, Math.floor(radius));
}

/** Catenary through two 3D points. tension 0=max sag, 1=taut (nearly straight). Returns centerline voxels. */
export function getRopeCurveVoxels(
  a: [number, number, number],
  b: [number, number, number],
  tension: number
): [number, number, number][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const Lh = Math.sqrt(dx * dx + dz * dz);
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 1e-9) return [a];

  const t0 = Math.max(0, Math.min(1, tension));
  const aMin = L * 0.3;
  const aMax = L * 50;
  const catA = aMin * Math.pow(aMax / aMin, t0);

  if (Lh < 1e-9) {
    return getBresenham3DLine(a, b);
  }

  const horzDirX = dx / Lh;
  const horzDirZ = dz / Lh;
  const y1 = a[1];
  const y2 = b[1];

  function catenaryY(x: number, x0: number, c: number): number {
    return catA * Math.cosh((x - x0) / catA) + c;
  }

  function f(x0: number): number {
    return catA * (Math.cosh((Lh - x0) / catA) - Math.cosh(-x0 / catA)) - (y2 - y1);
  }

  let x0 = Lh / 2;
  for (let i = 0; i < 30; i++) {
    const fx = f(x0);
    if (Math.abs(fx) < 1e-9) break;
    const eps = 1e-6;
    const df = (f(x0 + eps) - f(x0 - eps)) / (2 * eps);
    if (Math.abs(df) < 1e-12) break;
    x0 = x0 - fx / df;
    x0 = Math.max(-Lh * 2, Math.min(Lh * 2, x0));
  }

  const c = y1 - catA * Math.cosh(-x0 / catA);
  const steps = Math.max(50, Math.ceil(L * 2));
  const points: [number, number, number][] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * Lh;
    const y = catenaryY(x, x0, c);
    const px = a[0] + x * horzDirX;
    const pz = a[2] + x * horzDirZ;
    const xi = Math.round(px);
    const yi = Math.round(y);
    const zi = Math.round(pz);
    const k = `${xi},${yi},${zi}`;
    if (!seen.has(k)) {
      seen.add(k);
      points.push([xi, yi, zi]);
    }
  }

  const result: [number, number, number][] = [];
  const resultSeen = new Set<string>();
  for (let i = 0; i < points.length - 1; i++) {
    const seg = getBresenham3DLine(points[i], points[i + 1]);
    for (const p of seg) {
      const k = `${p[0]},${p[1]},${p[2]}`;
      if (!resultSeen.has(k)) {
        resultSeen.add(k);
        result.push(p);
      }
    }
  }
  if (points.length === 1) result.push(points[0]);
  return result.length > 0 ? result : [a, b];
}

/** Returns all voxels along a 3D line between a and b (6-connected path). */
export function getBresenham3DLine(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
  const positions: [number, number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a[0] + t * dx);
    const y = Math.round(a[1] + t * dy);
    const z = Math.round(a[2] + t * dz);
    const k = `${x},${y},${z}`;
    if (!seen.has(k)) {
      seen.add(k);
      positions.push([x, y, z]);
    }
  }
  return positions;
}

export function getAxisAlignedLine(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number][] {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  const positions: [number, number, number][] = [];
  if (dx >= dy && dx >= dz) {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    for (let x = x0; x <= x1; x++) positions.push([x, a[1], a[2]]);
  } else if (dy >= dx && dy >= dz) {
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let y = y0; y <= y1; y++) positions.push([a[0], y, a[2]]);
  } else {
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let z = z0; z <= z1; z++) positions.push([a[0], a[1], z]);
  }
  return positions;
}

export function getAxisAlignedPlaneFromNormal(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like
): [number, number, number][] {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const positions: [number, number, number][] = [];
  if (fixedAxis === 0) {
    const x = a[0];
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let py = y0; py <= y1; py++)
      for (let pz = z0; pz <= z1; pz++) positions.push([x, py, pz]);
  } else if (fixedAxis === 1) {
    const y = a[1];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let px = x0; px <= x1; px++)
      for (let pz = z0; pz <= z1; pz++) positions.push([px, y, pz]);
  } else {
    const z = a[2];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let px = x0; px <= x1; px++)
      for (let py = y0; py <= y1; py++) positions.push([px, py, z]);
  }
  return positions;
}

export function getAxisAlignedCuboid(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): [number, number, number][] {
  const planePositions = getAxisAlignedPlaneFromNormal(a, b, faceNormal);
  if (depth === 0) return planePositions;
  const positions: [number, number, number][] = [...planePositions];
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][axis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;
  for (let k = 1; k <= layers; k++) {
    const dk = dir * k;
    for (const [px, py, pz] of planePositions) {
      const pos: [number, number, number] = [px, py, pz];
      pos[axis] += dk;
      positions.push(pos);
    }
  }
  return positions;
}

/** Ray-casting point-in-polygon (2D). Point is inside if ray in +x crosses odd number of edges. */
function pointInPolygon2D(px: number, py: number, polygon: [number, number][]): boolean {
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py) {
      const t = (py - yj) / (yi - yj);
      const x = xj + t * (xi - xj);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** True if all points lie on the plane through a,b,c (within tolerance). */
function areCoplanar(
  points: [number, number, number][],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  tol = 1e-6
): boolean {
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  if (normal.lengthSq() < tol * tol) return true; // degenerate, treat as coplanar
  normal.normalize();
  const d = -normal.x * a[0] - normal.y * a[1] - normal.z * a[2];
  for (const p of points) {
    const dist = Math.abs(normal.x * p[0] + normal.y * p[1] + normal.z * p[2] + d);
    if (dist > tol) return false;
  }
  return true;
}

export function getPolygonVoxels(points: [number, number, number][]): [number, number, number][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];
  if (points.length === 2) return getAxisAlignedLine(points[0], points[1]);
  if (points.length === 3) {
    const [a, b, c] = points;
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const uAxis = dropAxis === 0 ? 1 : 0;
    const vAxis = dropAxis === 2 ? 1 : 2;
    const to2D = (p: [number, number, number]) => [p[uAxis], p[vAxis]] as [number, number];
    const a2 = to2D(a);
    const b2 = to2D(b);
    const c2 = to2D(c);
    const v0x = b2[0] - a2[0];
    const v0y = b2[1] - a2[1];
    const v1x = c2[0] - a2[0];
    const v1y = c2[1] - a2[1];
    const denom = v0x * v1y - v0y * v1x;
    if (Math.abs(denom) < 1e-9) return getAxisAlignedLine(a, b);
    const minX = Math.floor(Math.min(a[0], b[0], c[0]));
    const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1]));
    const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const minZ = Math.floor(Math.min(a[2], b[2], c[2]));
    const maxZ = Math.ceil(Math.max(a[2], b[2], c[2]));
    const positions: [number, number, number][] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const cz = z + 0.5;
          const p2: [number, number] = [0, 0];
          p2[0] = [cx, cy, cz][uAxis];
          p2[1] = [cx, cy, cz][vAxis];
          const px = p2[0] - a2[0];
          const py = p2[1] - a2[1];
          const s = (px * v1y - py * v1x) / denom;
          const t = (py * v0x - px * v0y) / denom;
          if (s >= -1e-6 && t >= -1e-6 && s + t <= 1 + 1e-6) {
            positions.push([x, y, z]);
          }
        }
      }
    }
    return positions;
  }
  // 4+ points: if coplanar, fill actual polygon with 2D point-in-polygon; else 3D convex hull
  const [a, b, c] = points;
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const uAxis = dropAxis === 0 ? 1 : 0;
  const vAxis = dropAxis === 2 ? 1 : 2;
  const to2D = (p: [number, number, number]) => [p[uAxis], p[vAxis]] as [number, number];
  const polygon2D = points.map(to2D);
  const normalLenSq = normal.lengthSq();

  if (normalLenSq >= 1e-12 && areCoplanar(points, a, b, c)) {
    const minU = Math.min(...polygon2D.map(([u]) => u));
    const maxU = Math.max(...polygon2D.map(([u]) => u));
    const minV = Math.min(...polygon2D.map(([, v]) => v));
    const maxV = Math.max(...polygon2D.map(([, v]) => v));
    const floorU = Math.floor(minU);
    const ceilU = Math.ceil(maxU);
    const floorV = Math.floor(minV);
    const ceilV = Math.ceil(maxV);
    const n = normal.clone().normalize();
    const d = -n.x * a[0] - n.y * a[1] - n.z * a[2];
    const positions: [number, number, number][] = [];
    const coord = [0, 0, 0] as [number, number, number];
    for (let u = floorU; u <= ceilU; u++) {
      for (let v = floorV; v <= ceilV; v++) {
        const cx = u + 0.5;
        const cy = v + 0.5;
        if (!pointInPolygon2D(cx, cy, polygon2D)) continue;
        coord[uAxis] = u;
        coord[vAxis] = v;
        const nd = n.getComponent(dropAxis);
        if (Math.abs(nd) < 1e-9) continue;
        const third = -(d + n.getComponent(uAxis) * cx + n.getComponent(vAxis) * cy) / nd;
        coord[dropAxis] = Math.round(third);
        positions.push([...coord]);
      }
    }
    return positions;
  }

  const vecs = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const hull = new ConvexHull();
  hull.setFromPoints(vecs);
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const positions: [number, number, number][] = [];
  const test = new THREE.Vector3();
  for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.ceil(maxZ); z++) {
        test.set(x, y, z);
        if (hull.containsPoint(test)) positions.push([x, y, z]);
      }
    }
  }
  return positions;
}
