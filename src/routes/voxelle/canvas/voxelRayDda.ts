/**
 * Grid-aligned 3D-DDA through integer voxels (axis-aligned “ray marching”).
 * Voxel (i,j,k) occupies [i,i+1)×[j,j+1)×[k,k+1) in world space.
 */
import { coordKey } from '../coordUtils';
import {
  lookupDense,
  lookupHashTable,
  unpackVoxelPayload,
  type GpuVoxelAccel
} from './gpuVoxelAccel';
import type { Voxel } from '../voxelMaterial';
import { VOXEL_MATERIAL_IDS } from '../voxelMaterial';

const EPS = 1e-9;

/** Matches `greedyMeshCore` glass absorption per world unit through glass. */
export const GLASS_ABSORPTION_PER_UNIT = 0.16;

function isTransmissiveMaterial(material: Voxel['material']): boolean {
  return material === 'glass' || material === 'water';
}

function absorptionPerUnit(material: Voxel['material']): number {
  return material === 'water' ? GLASS_ABSORPTION_PER_UNIT * 0.09 : GLASS_ABSORPTION_PER_UNIT;
}

function transmissiveTint(material: Voxel['material'], color24: number): [number, number, number] {
  if (material === 'water') return [1, 1, 1];
  return hexToLinearRgb(color24 & 0xffffff);
}

function absorptionRgbPerUnit(material: Voxel['material']): [number, number, number] {
  if (material === 'water') {
    // Approximate visible-spectrum behavior of clear water: red attenuates fastest, blue slowest.
    return [0.03, 0.012, 0.006];
  }
  const a = absorptionPerUnit(material);
  return [a, a, a];
}

function hexToLinearRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

export type DdaHit = {
  /** Distance from origin along the ray (world units). */
  t: number;
  cell: [number, number, number];
  /** Outward from the solid voxel, axis-aligned (matches mesh face normals for tools). */
  faceNormal: [number, number, number];
  voxel: Voxel;
};

export type DdaPickHit = {
  point: [number, number, number];
  faceNormal: [number, number, number];
};

function signAxis(v: number): number {
  if (v > EPS) return 1;
  if (v < -EPS) return -1;
  return 0;
}

export function lookupVoxel(
  voxels: Map<string, Voxel>,
  x: number,
  y: number,
  z: number
): Voxel | null {
  return voxels.get(coordKey(x, y, z)) ?? null;
}

/** Dense/hash GPU accel or Map fallback (string keys). */
export function lookupVoxelAccel(
  accel: GpuVoxelAccel | null | undefined,
  voxels: Map<string, Voxel>,
  x: number,
  y: number,
  z: number
): Voxel | null {
  if (!accel || accel.kind === 'empty') {
    return lookupVoxel(voxels, x, y, z);
  }
  const packed =
    accel.kind === 'dense' ? lookupDense(accel, x, y, z) : lookupHashTable(accel, x, y, z);
  const u = unpackVoxelPayload(packed);
  if (!u) return null;
  const material = VOXEL_MATERIAL_IDS[u.materialIndex] ?? 'plastic';
  return { color: u.color, material };
}

function dominantAxisFromDir(dx: number, dy: number, dz: number): [number, number, number] {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ax >= ay && ax >= az) return [Math.sign(dx) || 1, 0, 0];
  if (ay >= ax && ay >= az) return [0, Math.sign(dy) || 1, 0];
  return [0, 0, Math.sign(dz) || 1];
}

/**
 * First hit along the ray in world space. Direction need not be normalized; returned `t` is
 * Euclidean distance from the origin to the hit point.
 */
export function traceRayDda(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  voxels: Map<string, Voxel>,
  maxDistance: number,
  accel?: GpuVoxelAccel | null
): DdaHit | null {
  const V = (xi: number, yi: number, zi: number) => lookupVoxelAccel(accel, voxels, xi, yi, zi);
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return null;
  const rdx = dx / len;
  const rdy = dy / len;
  const rdz = dz / len;

  const oxp = ox + EPS * rdx;
  const oyp = oy + EPS * rdy;
  const ozp = oz + EPS * rdz;

  let x = Math.floor(oxp);
  let y = Math.floor(oyp);
  let z = Math.floor(ozp);

  const stepX = signAxis(rdx);
  const stepY = signAxis(rdy);
  const stepZ = signAxis(rdz);

  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / rdx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / rdy);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / rdz);

  let tMaxX: number;
  if (stepX > 0) tMaxX = (x + 1 - oxp) / rdx;
  else if (stepX < 0) tMaxX = (x - oxp) / rdx;
  else tMaxX = Infinity;

  let tMaxY: number;
  if (stepY > 0) tMaxY = (y + 1 - oyp) / rdy;
  else if (stepY < 0) tMaxY = (y - oyp) / rdy;
  else tMaxY = Infinity;

  let tMaxZ: number;
  if (stepZ > 0) tMaxZ = (z + 1 - ozp) / rdz;
  else if (stepZ < 0) tMaxZ = (z - ozp) / rdz;
  else tMaxZ = Infinity;

  if (tMaxX < 0) tMaxX = 0;
  if (tMaxY < 0) tMaxY = 0;
  if (tMaxZ < 0) tMaxZ = 0;

  const hitStart = V(x, y, z);
  if (hitStart) {
    const [nx, ny, nz] = dominantAxisFromDir(-rdx, -rdy, -rdz);
    return {
      t: 0,
      cell: [x, y, z],
      faceNormal: [nx, ny, nz],
      voxel: hitStart
    };
  }

  let t = 0;
  const maxT = maxDistance;

  while (t <= maxT) {
    let axis: 0 | 1 | 2;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      axis = 0;
      t = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
    } else if (tMaxY <= tMaxZ) {
      axis = 1;
      t = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
    } else {
      axis = 2;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      z += stepZ;
    }

    if (t > maxT) break;

    const v = V(x, y, z);
    if (v) {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (axis === 0) nx = stepX > 0 ? -1 : 1;
      else if (axis === 1) ny = stepY > 0 ? -1 : 1;
      else nz = stepZ > 0 ? -1 : 1;
      return {
        t,
        cell: [x, y, z],
        faceNormal: [nx, ny, nz],
        voxel: v
      };
    }
  }

  return null;
}

/**
 * Shadow ray toward the light: opaque voxels block; transmissive voxels attenuate and tint (Beer–Lambert).
 * Returns RGB factor in linear space (1,1,1 = fully lit, 0,0,0 = fully occluded).
 * Caller should offset origin slightly along the shaded surface normal (into free space).
 */
export function traceShadowRayDda(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  voxels: Map<string, Voxel>,
  maxDistance: number,
  accel?: GpuVoxelAccel | null
): [number, number, number] {
  const W = (xi: number, yi: number, zi: number) => lookupVoxelAccel(accel, voxels, xi, yi, zi);
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return [1, 1, 1];
  const rdx = dx / len;
  const rdy = dy / len;
  const rdz = dz / len;

  const oxp = ox + EPS * rdx;
  const oyp = oy + EPS * rdy;
  const ozp = oz + EPS * rdz;

  let x = Math.floor(oxp);
  let y = Math.floor(oyp);
  let z = Math.floor(ozp);

  const stepX = signAxis(rdx);
  const stepY = signAxis(rdy);
  const stepZ = signAxis(rdz);

  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / rdx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / rdy);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / rdz);

  let tMaxX: number;
  if (stepX > 0) tMaxX = (x + 1 - oxp) / rdx;
  else if (stepX < 0) tMaxX = (x - oxp) / rdx;
  else tMaxX = Infinity;

  let tMaxY: number;
  if (stepY > 0) tMaxY = (y + 1 - oyp) / rdy;
  else if (stepY < 0) tMaxY = (y - oyp) / rdy;
  else tMaxY = Infinity;

  let tMaxZ: number;
  if (stepZ > 0) tMaxZ = (z + 1 - ozp) / rdz;
  else if (stepZ < 0) tMaxZ = (z - ozp) / rdz;
  else tMaxZ = Infinity;

  if (tMaxX < 0) tMaxX = 0;
  if (tMaxY < 0) tMaxY = 0;
  if (tMaxZ < 0) tMaxZ = 0;

  let fr = 1;
  let fg = 1;
  let fb = 1;
  let tPrev = 0;
  const maxT = maxDistance;

  const applySegment = (v: Voxel | null, segLen: number) => {
    if (!v || segLen <= 0) return;
    const [absR, absG, absB] = absorptionRgbPerUnit(v.material);
    const attR = Math.exp(-absR * segLen);
    const attG = Math.exp(-absG * segLen);
    const attB = Math.exp(-absB * segLen);
    if (isTransmissiveMaterial(v.material)) {
      const [tr, tg, tb] = transmissiveTint(v.material, v.color);
      fr *= tr * attR;
      fg *= tg * attG;
      fb *= tb * attB;
    } else {
      fr = 0;
      fg = 0;
      fb = 0;
    }
  };

  const hitStart = W(x, y, z);
  if (hitStart) {
    if (!isTransmissiveMaterial(hitStart.material)) {
      return [0, 0, 0];
    }
    const tFirst = Math.min(tMaxX, tMaxY, tMaxZ);
    const seg0 = Math.min(Math.max(0, tFirst), maxT);
    applySegment(hitStart, seg0);
    if (fr <= 0 && fg <= 0 && fb <= 0) return [0, 0, 0];
    if (tFirst >= maxT) {
      return [Math.max(0, fr), Math.max(0, fg), Math.max(0, fb)];
    }
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      tPrev = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
    } else if (tMaxY <= tMaxZ) {
      tPrev = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
    } else {
      tPrev = tMaxZ;
      tMaxZ += tDeltaZ;
      z += stepZ;
    }
  }

  while (tPrev <= maxT) {
    if (fr <= 0 && fg <= 0 && fb <= 0) return [0, 0, 0];

    let axis: 0 | 1 | 2;
    let t: number;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      axis = 0;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      axis = 1;
      t = tMaxY;
      tMaxY += tDeltaY;
    } else {
      axis = 2;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }

    const x0 = x;
    const y0 = y;
    const z0 = z;
    const seg = Math.min(t, maxT) - tPrev;
    if (seg > 0) {
      applySegment(W(x0, y0, z0), seg);
      if (fr <= 0 && fg <= 0 && fb <= 0) return [0, 0, 0];
    }

    if (t > maxT) break;

    if (axis === 0) x += stepX;
    else if (axis === 1) y += stepY;
    else z += stepZ;

    tPrev = t;
  }

  return [Math.max(0, fr), Math.max(0, fg), Math.max(0, fb)];
}

/** Distance along unit ray from `p` to exit the voxel cell [ix,ix+1)³ (strictly positive). */
export function distToExitUnitCell(
  px: number,
  py: number,
  pz: number,
  rdx: number,
  rdy: number,
  rdz: number,
  ix: number,
  iy: number,
  iz: number
): number {
  let tMin = Infinity;
  if (rdx > EPS) tMin = Math.min(tMin, (ix + 1 - px) / rdx);
  else if (rdx < -EPS) tMin = Math.min(tMin, (ix - px) / rdx);
  if (rdy > EPS) tMin = Math.min(tMin, (iy + 1 - py) / rdy);
  else if (rdy < -EPS) tMin = Math.min(tMin, (iy - py) / rdy);
  if (rdz > EPS) tMin = Math.min(tMin, (iz + 1 - pz) / rdz);
  else if (rdz < -EPS) tMin = Math.min(tMin, (iz - pz) / rdz);
  return tMin === Infinity ? EPS * 4 : tMin;
}

/**
 * Ray march skipping up to `maxGlassLayers` transmissive voxels; returns first hit on opaque voxels.
 */
export function traceRayThroughGlass(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  voxels: Map<string, Voxel>,
  maxDistance: number,
  maxGlassLayers: number,
  accel?: GpuVoxelAccel | null
): DdaHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len < EPS) return null;
  const rdx = dx / len;
  const rdy = dy / len;
  const rdz = dz / len;

  let remaining = maxDistance;
  let gx = ox;
  let gy = oy;
  let gz = oz;
  let glassUsed = 0;

  while (glassUsed <= maxGlassLayers) {
    const hit = traceRayDda(gx, gy, gz, dx, dy, dz, voxels, remaining, accel);
    if (!hit) return null;
    if (!isTransmissiveMaterial(hit.voxel.material)) return hit;
    if (glassUsed >= maxGlassLayers) return hit;

    const [ix, iy, iz] = hit.cell;
    const px = gx + rdx * hit.t;
    const py = gy + rdy * hit.t;
    const pz = gz + rdz * hit.t;
    const tThrough = distToExitUnitCell(px, py, pz, rdx, rdy, rdz, ix, iy, iz);
    const stepOut = Math.max(tThrough, EPS * 4);
    const traveled = hit.t + stepOut;
    gx += rdx * traveled;
    gy += rdy * traveled;
    gz += rdz * traveled;
    remaining -= traveled;
    glassUsed++;
    if (remaining < EPS) return null;
  }
  return null;
}

export function ddaPickVoxel(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  voxels: Map<string, Voxel>,
  maxDistance: number,
  accel?: GpuVoxelAccel | null
): DdaPickHit | null {
  const hit = traceRayDda(ox, oy, oz, dx, dy, dz, voxels, maxDistance, accel);
  if (!hit) return null;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  return {
    point: [ox + ux * hit.t, oy + uy * hit.t, oz + uz * hit.t],
    faceNormal: hit.faceNormal
  };
}

export function maxRayDistanceForVoxels(
  voxels: Map<string, Voxel>,
  rayOrigin?: readonly [number, number, number]
): number {
  if (voxels.size === 0) return 4000;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const key of voxels.keys()) {
    const [a, b, c] = key.split(',').map(Number);
    minX = Math.min(minX, a);
    minY = Math.min(minY, b);
    minZ = Math.min(minZ, c);
    maxX = Math.max(maxX, a);
    maxY = Math.max(maxY, b);
    maxZ = Math.max(maxZ, c);
  }
  const pad = 8;
  const w = maxX - minX + 1 + pad * 2;
  const h = maxY - minY + 1 + pad * 2;
  const d = maxZ - minZ + 1 + pad * 2;
  const diag = Math.sqrt(w * w + h * h + d * d);
  let budget = diag * 3;
  if (rayOrigin) {
    const [ox, oy, oz] = rayOrigin;
    const x0 = minX - pad;
    const y0 = minY - pad;
    const z0 = minZ - pad;
    const x1 = maxX + 1 + pad;
    const y1 = maxY + 1 + pad;
    const z1 = maxZ + 1 + pad;
    const fx = Math.max(Math.abs(ox - x0), Math.abs(ox - x1));
    const fy = Math.max(Math.abs(oy - y0), Math.abs(oy - y1));
    const fz = Math.max(Math.abs(oz - z0), Math.abs(oz - z1));
    const farToBounds = Math.hypot(fx, fy, fz);
    budget = Math.max(budget, farToBounds + diag);
  }
  return Math.min(Math.max(budget, 256), 2_000_000);
}
