/**
 * Shared 3D value noise + FBM for generators and paint-color distribution.
 */

/** Hash four integers to a float in [0, 1]. Deterministic. */
export function hash3(seed: number, x: number, y: number, z: number): number {
  let h = (seed >>> 0) ^ (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise at fractional coords (seeded). Returns 0–1. */
export function valueNoise3(seed: number, x: number, y: number, z: number): number {
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
export function seedToRange(seed: number, lo: number, hi: number): number {
  let h = (seed >>> 0) * 0x9e3779b9;
  h = (h ^ (h >>> 16)) * 0x85ebca6b;
  h = (h ^ (h >>> 13)) * 0xc2b2ae35;
  return lo + ((h >>> 0) / 4294967296) * (hi - lo);
}

/**
 * Fractional Brownian motion in 3D. Returns approximately [0, 1] (normalized sum of octaves).
 */
export function fbmValue3(
  seed: number,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
  frequency: number
): number {
  const nOct = Math.max(1, Math.min(12, Math.floor(octaves)));
  let amp = 1;
  let freq = Math.max(1e-6, frequency);
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < nOct; o++) {
    const s = seed + o * 0x9e3779b1;
    sum += amp * valueNoise3(s, x * freq, y * freq, z * freq);
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
