import { coordKey, parseCoordKey } from '../../coordUtils';
import type { Voxel } from '../../voxelMaterial';
import { plasticVoxel } from '../../voxelMaterial';

/** Hash three integers to a float in [0, 1]. Deterministic. */
function hash3(seed: number, x: number, y: number, z: number): number {
  let h = (seed >>> 0) ^ (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise at integer coords (seeded). Returns 0–1. */
function noise3(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const n000 = hash3(seed, x0, y0, z0);
  const n100 = hash3(seed, x0 + 1, y0, z0);
  const n010 = hash3(seed, x0, y0 + 1, z0);
  const n110 = hash3(seed, x0 + 1, y0 + 1, z0);
  const n001 = hash3(seed, x0, y0, z0 + 1);
  const n101 = hash3(seed, x0 + 1, y0, z0 + 1);
  const n011 = hash3(seed, x0, y0 + 1, z0 + 1);
  const n111 = hash3(seed, x0 + 1, y0 + 1, z0 + 1);
  const nx00 = n000 * (1 - u) + n100 * u;
  const nx10 = n010 * (1 - u) + n110 * u;
  const nx01 = n001 * (1 - u) + n101 * u;
  const nx11 = n011 * (1 - u) + n111 * u;
  const nxy0 = nx00 * (1 - v) + nx10 * v;
  const nxy1 = nx01 * (1 - v) + nx11 * v;
  return nxy0 * (1 - w) + nxy1 * w;
}

/** Derive a float in [lo, hi] from seed. */
function seedToRange(seed: number, lo: number, hi: number): number {
  let h = (seed >>> 0) * 0x9e3779b9;
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  return lo + ((h >>> 0) / 4294967296) * (hi - lo);
}

/**
 * Generate a single rock as a voxel map in local space (origin at center).
 * Shape: asymmetric lump – ellipsoid base (stretched/squashed by axis), 3D noise
 * for lumpiness, flat base (sitting face), and sometimes one angular facet.
 * Colors: baseColor (use paint color / multi-color selection for variation).
 */
export function generateRockVoxels(
  seed: number,
  size: number,
  roughness: number,
  baseColor: number
): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  if (size < 1) return out;

  const r = Math.max(1, Math.floor(size));
  const lumpiness = Math.max(0, Math.min(1, roughness)) * 0.6;
  const scale = 2.5 / Math.max(r, 1);

  // Asymmetric stretch per axis so rocks aren't round (elongated, flat, or chunky)
  const sx = seedToRange(seed + 1, 0.6, 1.4);
  const sy = seedToRange(seed + 2, 0.6, 1.4);
  const sz = seedToRange(seed + 3, 0.6, 1.4);

  // Optional one planar facet (fracture face) – normal and depth from seed
  const doFacet = seedToRange(seed + 4, 0, 1) < 0.55;
  const fnx = seedToRange(seed + 5, -1, 1);
  const fny = seedToRange(seed + 6, -1, 1);
  const fnz = seedToRange(seed + 7, -1, 1);
  const flen = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz) || 1;
  const facetDepth = r * (0.15 + seedToRange(seed + 8, 0, 0.35));

  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        // Ellipsoid in stretched space (breaks round silhouette)
        const px = x / sx;
        const py = y / sy;
        const pz = z / sz;
        const d = Math.sqrt(px * px + py * py + pz * pz);
        if (d > r + 1) continue;
        const n = noise3(seed + 0x1234, x * scale, y * scale, z * scale);
        const n2 = noise3(seed + 0x5678, x * scale * 1.7 + 3, y * scale * 1.7, z * scale * 1.7);
        const perturb = (n - 0.5) * 2 * lumpiness + (n2 - 0.5) * lumpiness * 0.5;
        const rEffective = r * (1 + perturb);
        if (d > rEffective) continue;
        // One angular facet: exclude voxels on one side of a plane
        if (doFacet) {
          const dist = x * (fnx / flen) + y * (fny / flen) + z * (fnz / flen);
          if (dist < -facetDepth) continue;
        }
        out.set(coordKey(x, y, z), plasticVoxel(0));
      }
    }
  }

  // Flat base – clip bottom so rock has a resting face (not a round bottom)
  const floorY = -r * 0.4;
  for (const key of [...out.keys()]) {
    const [, y] = parseCoordKey(key);
    if (y < floorY) out.delete(key);
  }

  const pv = plasticVoxel(baseColor);
  for (const key of out.keys()) {
    out.set(key, pv);
  }

  return out;
}

/**
 * Get rock voxel positions only (for preview mesh). Returns positions in local space.
 */
export function getRockPositions(
  seed: number,
  size: number,
  roughness: number
): [number, number, number][] {
  const map = generateRockVoxels(seed, size, roughness, 0x888888);
  return [...map.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
}

/** Derive integer in [lo, hi] from seed. */
function seedToInt(seed: number, lo: number, hi: number): number {
  let h = (seed >>> 0) * 0x9e3779b9;
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  return lo + (((h >>> 0) % (hi - lo + 1)) | 0);
}

/**
 * Generate a single ashlar (dressed stone) block for walls: axis-aligned box with
 * rough edges. Dimensions vary by seed; roughness removes boundary voxels for a hand-cut look.
 * When thickness and thicknessAxis are provided, that axis is set to thickness (for thin walls).
 */
export function generateAshlarVoxels(
  seed: number,
  size: number,
  roughness: number,
  baseColor: number,
  thickness?: number,
  thicknessAxis?: 0 | 1 | 2
): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  if (size < 1) return out;

  const s = Math.max(1, Math.floor(size));
  const lo = Math.max(3, Math.floor(s / 2)); // min 3 so corner rounding doesn't remove all voxels
  const hi = Math.max(lo, Math.min(20, s + Math.floor(s / 2)));
  let wx = Math.max(3, seedToInt(seed, lo, hi));
  let wy = Math.max(3, seedToInt(seed + 1, lo, hi));
  let wz = Math.max(3, seedToInt(seed + 2, lo, hi));
  if (thickness != null && thicknessAxis !== undefined) {
    const t = Math.max(1, Math.min(20, Math.floor(thickness)));
    if (thicknessAxis === 0) wx = t;
    else if (thicknessAxis === 1) wy = t;
    else wz = t;
  }

  const rough = Math.max(0, Math.min(1, roughness));

  for (let x = 0; x < wx; x++) {
    for (let y = 0; y < wy; y++) {
      for (let z = 0; z < wz; z++) {
        const onBoundary =
          x === 0 ||
          x === wx - 1 ||
          y === 0 ||
          y === wy - 1 ||
          z === 0 ||
          z === wz - 1;
        if (onBoundary && rough > 0) {
          const h = hash3(seed + 0xabcd, x, y, z);
          if (h < rough * 0.4) continue;
        }
        // Slightly rounded edges: remove voxels near corners so edges read as rounded
        const corners: [number, number, number][] = [
          [0, 0, 0],
          [wx - 1, 0, 0],
          [0, wy - 1, 0],
          [wx - 1, wy - 1, 0],
          [0, 0, wz - 1],
          [wx - 1, 0, wz - 1],
          [0, wy - 1, wz - 1],
          [wx - 1, wy - 1, wz - 1]
        ];
        const roundRadius = 1.4; // voxel units; removes corner + adjacent edge voxels
        const nearCorner = corners.some(([cx, cy, cz]) => {
          const dx = x - cx;
          const dy = y - cy;
          const dz = z - cz;
          return Math.sqrt(dx * dx + dy * dy + dz * dz) < roundRadius;
        });
        if (nearCorner) continue;
        out.set(coordKey(x, y, z), plasticVoxel(0));
      }
    }
  }

  const pv = plasticVoxel(baseColor);
  for (const key of out.keys()) {
    out.set(key, pv);
  }

  const bounds = { minX: 0, maxX: wx - 1, minY: 0, maxY: wy - 1, minZ: 0, maxZ: wz - 1 };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  const centered = new Map<string, Voxel>();
  for (const [key, col] of out) {
    const [x, y, z] = parseCoordKey(key);
    centered.set(coordKey(x - cx, y - cy, z - cz), col);
  }
  return centered;
}

/**
 * Get ashlar voxel positions only (for preview mesh). Returns positions in local space (centered).
 */
export function getAshlarPositions(
  seed: number,
  size: number,
  roughness: number,
  thickness?: number,
  thicknessAxis?: 0 | 1 | 2
): [number, number, number][] {
  const map = generateAshlarVoxels(seed, size, roughness, 0x888888, thickness, thicknessAxis);
  return [...map.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
}
