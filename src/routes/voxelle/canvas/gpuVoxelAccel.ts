/**
 * CPU-side voxel acceleration structures (dense grid or open-addressed i32 hash table).
 * Intended for future WebGPU / tooling; ray mode uses CPU DDA on the voxel map directly.
 */
import { coordKey, getVoxelBounds, parseCoordKey } from '../coordUtils';
import type { Voxel } from '../voxelMaterial';
import { VOXEL_MATERIAL_IDS } from '../voxelMaterial';

const PAD = 8;

/** Max cells (dx*dy*dz) for dense 3D texture path (~64MB u32 at 16M cells). */
export const DENSE_CELL_BUDGET = 2_500_000;

/** Max hash slots (power of two); ~64MiB buffer at 4M * 16 bytes. */
export const MAX_HASH_SLOTS = 4 * 1024 * 1024;

const MAT_INDEX = new Map<string, number>(VOXEL_MATERIAL_IDS.map((m, i) => [m, i] as const));

export function materialIndexForGpu(material: Voxel['material']): number {
  return MAT_INDEX.get(material) ?? 0;
}

/** Non-zero packed payload: (mat+1)<<24 | color — never 0 for real voxels. */
export function packVoxelPayload(color: number, materialIndex: number): number {
  return ((color & 0xffffff) | ((materialIndex + 1) << 24)) >>> 0;
}

export function unpackVoxelPayload(
  packed: number
): { color: number; materialIndex: number } | null {
  const u = packed >>> 0;
  if (u === 0) return null;
  const matEnc = u >>> 24;
  if (matEnc === 0) return null;
  return { color: u & 0xffffff, materialIndex: matEnc - 1 };
}

/** FNV-1a style u32 mix for open-addressed GPU hash keys. */
export function hashCoords(x: number, y: number, z: number): number {
  const xi = x | 0;
  const yi = y | 0;
  const zi = z | 0;
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ xi, 16777619) >>> 0;
  h = Math.imul(h ^ yi, 16777619) >>> 0;
  h = Math.imul(h ^ zi, 16777619) >>> 0;
  return h >>> 0;
}

export type GpuVoxelAccelEmpty = { kind: 'empty' };

export type GpuVoxelAccelDense = {
  kind: 'dense';
  origin: [number, number, number];
  dims: [number, number, number];
  /** Linear index: x + y*dx + z*dx*dy */
  data: Uint32Array;
};

export type GpuVoxelAccelHash = {
  kind: 'hash';
  mask: number;
  tableLen: number;
  /** Per slot: ix, iy, iz (int32), packed (int32 bits of uint32) */
  table: Int32Array;
};

export type GpuVoxelAccel = GpuVoxelAccelEmpty | GpuVoxelAccelDense | GpuVoxelAccelHash;

function maxRayDistanceForBounds(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): number {
  const w = maxX - minX + 1 + PAD * 2;
  const h = maxY - minY + 1 + PAD * 2;
  const d = maxZ - minZ + 1 + PAD * 2;
  const diag = Math.sqrt(w * w + h * h + d * d);
  return Math.min(Math.max(diag * 3, 256), 20000);
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function buildDense(
  voxels: Map<string, Voxel>,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): GpuVoxelAccelDense {
  const ox = minX - PAD;
  const oy = minY - PAD;
  const oz = minZ - PAD;
  const dx = maxX - minX + 1 + PAD * 2;
  const dy = maxY - minY + 1 + PAD * 2;
  const dz = maxZ - minZ + 1 + PAD * 2;
  const n = dx * dy * dz;
  const data = new Uint32Array(n);
  for (const [key, v] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const ix = x - ox;
    const iy = y - oy;
    const iz = z - oz;
    if (ix < 0 || iy < 0 || iz < 0 || ix >= dx || iy >= dy || iz >= dz) continue;
    const mi = materialIndexForGpu(v.material);
    data[ix + iy * dx + iz * dx * dy] = packVoxelPayload(v.color, mi);
  }
  return { kind: 'dense', origin: [ox, oy, oz], dims: [dx, dy, dz], data };
}

export function buildGpuVoxelHashOnlyFromMap(
  voxels: Map<string, Voxel>
): GpuVoxelAccelHash | GpuVoxelAccelEmpty {
  if (voxels.size === 0) return { kind: 'empty' };
  return buildHashTable(voxels);
}

function buildHashTable(voxels: Map<string, Voxel>): GpuVoxelAccelHash {
  const need = Math.max(256, voxels.size * 2);
  let tableLen = nextPow2(need);
  if (tableLen > MAX_HASH_SLOTS) tableLen = MAX_HASH_SLOTS;
  const mask = tableLen - 1;
  const table = new Int32Array(tableLen * 4);

  const tryInsert = (x: number, y: number, z: number, packed: number): boolean => {
    let idx = hashCoords(x, y, z) & mask;
    for (let probe = 0; probe < tableLen; probe++) {
      const o = idx * 4;
      const d = table[o + 3];
      if (d === 0) {
        table[o] = x;
        table[o + 1] = y;
        table[o + 2] = z;
        table[o + 3] = packed | 0;
        return true;
      }
      if (table[o] === x && table[o + 1] === y && table[o + 2] === z) return true;
      idx = (idx + 1) & mask;
    }
    return false;
  };

  for (const [key, v] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const packed = packVoxelPayload(v.color, materialIndexForGpu(v.material));
    if (!tryInsert(x, y, z, packed)) {
      throw new Error('voxelle: GPU voxel hash table overflow; reduce model spread or voxel count');
    }
  }

  return { kind: 'hash', mask, tableLen, table };
}

/**
 * Lookup used by tests / CPU parity (mirrors GPU hash probe).
 */
export function lookupHashTable(accel: GpuVoxelAccelHash, x: number, y: number, z: number): number {
  const { mask, tableLen, table } = accel;
  let idx = hashCoords(x, y, z) & mask;
  for (let probe = 0; probe < tableLen; probe++) {
    const o = idx * 4;
    const d = table[o + 3];
    if (d === 0) return 0;
    if (table[o] === x && table[o + 1] === y && table[o + 2] === z) return d >>> 0;
    idx = (idx + 1) & mask;
  }
  return 0;
}

export function lookupDense(accel: GpuVoxelAccelDense, x: number, y: number, z: number): number {
  const [ox, oy, oz] = accel.origin;
  const [dx, dy, dz] = accel.dims;
  const ix = x - ox;
  const iy = y - oy;
  const iz = z - oz;
  if (ix < 0 || iy < 0 || iz < 0 || ix >= dx || iy >= dy || iz >= dz) return 0;
  return accel.data[ix + iy * dx + iz * dx * dy];
}

/** Build acceleration structure for the current voxel map. */
export function buildGpuVoxelAccelFromMap(voxels: Map<string, Voxel>): GpuVoxelAccel {
  if (voxels.size === 0) return { kind: 'empty' };

  const b = getVoxelBounds(voxels);
  if (!b) return { kind: 'empty' };

  const minX = b.minX;
  const minY = b.minY;
  const minZ = b.minZ;
  const maxX = b.maxX;
  const maxY = b.maxY;
  const maxZ = b.maxZ;

  const dx = maxX - minX + 1 + PAD * 2;
  const dy = maxY - minY + 1 + PAD * 2;
  const dz = maxZ - minZ + 1 + PAD * 2;
  const cells = dx * dy * dz;

  if (cells <= DENSE_CELL_BUDGET) {
    return buildDense(voxels, minX, minY, minZ, maxX, maxY, maxZ);
  }
  return buildHashTable(voxels);
}

export function maxDistanceForGpuAccel(accel: GpuVoxelAccel, voxels: Map<string, Voxel>): number {
  if (accel.kind === 'empty' || voxels.size === 0) return 4000;
  const b = getVoxelBounds(voxels)!;
  return maxRayDistanceForBounds(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
}

/**
 * GPU path uses a hash table only; convert dense acceleration to hash by rescanning voxels.
 */
export function flattenGpuAccelToHash(
  accel: GpuVoxelAccel
): GpuVoxelAccelHash | GpuVoxelAccelEmpty {
  if (accel.kind === 'empty') return { kind: 'empty' };
  if (accel.kind === 'hash') return accel;
  const [ox, oy, oz] = accel.origin;
  const [dx, dy, dz] = accel.dims;
  const v = new Map<string, Voxel>();
  for (let iz = 0; iz < dz; iz++) {
    for (let iy = 0; iy < dy; iy++) {
      for (let ix = 0; ix < dx; ix++) {
        const packed = accel.data[ix + iy * dx + iz * dx * dy];
        if (!packed) continue;
        const u = unpackVoxelPayload(packed);
        if (!u) continue;
        const mat = VOXEL_MATERIAL_IDS[u.materialIndex] ?? 'plastic';
        v.set(coordKey(ox + ix, oy + iy, oz + iz), { color: u.color, material: mat });
      }
    }
  }
  if (v.size === 0) return { kind: 'empty' };
  return buildHashTable(v);
}
