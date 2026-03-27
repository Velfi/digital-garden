import { coordKey } from './coordUtils';
import { createSeededRng } from './strokeGeometry';

function distSqPointSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-12) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    return dx * dx + dy * dy + dz * dz;
  }
  let t = (apx * abx + apy * aby + apz * abz) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  const qz = az + t * abz;
  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/** Minimum distance from point (world units, e.g. voxel cell centers) to polyline spine. */
export function minDistPointToPolyline(
  px: number,
  py: number,
  pz: number,
  spine: [number, number, number][]
): number {
  if (spine.length === 0) return 0;
  if (spine.length === 1) {
    const [sx, sy, sz] = spine[0]!;
    const cx = sx + 0.5;
    const cy = sy + 0.5;
    const cz = sz + 0.5;
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  let minD = Infinity;
  for (let i = 0; i < spine.length - 1; i++) {
    const [ax, ay, az] = spine[i]!;
    const [bx, by, bz] = spine[i + 1]!;
    const d = Math.sqrt(
      distSqPointSegment(
        px,
        py,
        pz,
        ax + 0.5,
        ay + 0.5,
        az + 0.5,
        bx + 0.5,
        by + 0.5,
        bz + 0.5
      )
    );
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Per-voxel weights in [0,1]. falloffBlend 0 => all 1. Higher falloff => lower weight away from spine.
 */
export function computeSculptVoxelWeights(
  positions: [number, number, number][],
  spine: [number, number, number][],
  radiusVox: number,
  falloffBlend: number
): Map<string, number> {
  const map = new Map<string, number>();
  const F = Math.min(1, Math.max(0, falloffBlend));
  const R = Math.max(radiusVox, 1e-6);

  const seen = new Set<string>();
  if (F <= 1e-9 || spine.length === 0) {
    for (const [x, y, z] of positions) {
      const k = coordKey(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      map.set(k, 1);
    }
    return map;
  }

  seen.clear();
  for (const [x, y, z] of positions) {
    const k = coordKey(x, y, z);
    if (seen.has(k)) continue;
    seen.add(k);
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;
    const d = minDistPointToPolyline(cx, cy, cz, spine);
    const t = Math.min(1, d / R);
    const soft = (1 - t) * (1 - t);
    const w = (1 - F) * 1 + F * soft;
    map.set(k, Math.max(0, Math.min(1, w)));
  }
  return map;
}

/**
 * Deterministic stochastic thinning: keep voxel with probability weight[key] * strength (seeded).
 */
export function filterPositionsBySculptBrush(
  positions: [number, number, number][],
  weights: Map<string, number>,
  strength: number,
  seed: number
): [number, number, number][] {
  const str = Math.min(1, Math.max(0, strength));
  let allOnes = true;
  for (const w of weights.values()) {
    if (w < 1 - 1e-9) {
      allOnes = false;
      break;
    }
  }
  if (allOnes && str >= 1 - 1e-9) {
    const out: [number, number, number][] = [];
    const seen = new Set<string>();
    for (const [x, y, z] of positions) {
      const k = coordKey(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([x, y, z]);
    }
    return out;
  }

  const rng = createSeededRng(seed >>> 0);
  const out: [number, number, number][] = [];
  const seen = new Set<string>();
  for (const [x, y, z] of positions) {
    const k = coordKey(x, y, z);
    if (seen.has(k)) continue;
    seen.add(k);
    const w = weights.get(k) ?? 1;
    const p = w * str;
    if (p >= 1 - 1e-9) {
      out.push([x, y, z]);
      continue;
    }
    if (p <= 1e-9) continue;
    if (rng() < p) out.push([x, y, z]);
  }
  return out;
}
