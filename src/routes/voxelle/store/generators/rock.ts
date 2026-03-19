import { coordKey, parseCoordKey } from '../../coordUtils';

/** Seeded RNG (mulberry32). Returns 0–1. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function applyColorVariation(baseColor: number, tint: number): number {
  const r = ((baseColor >> 16) & 0xff) * tint;
  const g = ((baseColor >> 8) & 0xff) * tint;
  const b = (baseColor & 0xff) * tint;
  return (
    (Math.min(255, Math.max(0, Math.round(r))) << 16) |
    (Math.min(255, Math.max(0, Math.round(g))) << 8) |
    Math.min(255, Math.max(0, Math.round(b)))
  );
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
 * Colors: baseColor with per-voxel tint variation (deterministic from seed).
 */
export function generateRockVoxels(
  seed: number,
  size: number,
  roughness: number,
  baseColor: number,
  colorVariation: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (size < 1) return out;

  const rng = createRng(seed);
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
          const dist = (x * (fnx / flen) + y * (fny / flen) + z * (fnz / flen));
          if (dist < -facetDepth) continue;
        }
        out.set(coordKey(x, y, z), 0);
      }
    }
  }

  // Flat base – clip bottom so rock has a resting face (not a round bottom)
  const floorY = -r * 0.4;
  for (const key of [...out.keys()]) {
    const [, y] = parseCoordKey(key);
    if (y < floorY) out.delete(key);
  }

  // Assign colors with variation
  for (const key of out.keys()) {
    const tint =
      1 + (rng() - 0.5) * 2 * Math.max(0, Math.min(1, colorVariation));
    out.set(key, applyColorVariation(baseColor, tint));
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
  const map = generateRockVoxels(seed, size, roughness, 0x888888, 0);
  return [...map.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
}
