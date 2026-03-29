import { coordKey, parseCoordKey } from '../../coordUtils';
import type { FaceNormal, FloraPresetId } from '../core';
import type { Voxel } from '../../voxelMaterial';
import { cloneVoxel } from '../../voxelMaterial';

/** Max voxels per flora placement (performance / runaway guard). */
export const FLORA_VOXEL_CAP = 1400;

export type GenerateFloraOptions = {
  preset: FloraPresetId;
  height: number;
  girth: number;
  wobble: number;
  taper: number;
  stemCount: number;
  clusterRadius: number;
  branchCount: number;
  branchDepth: number;
  branchStart: number;
  branchSpread: number;
  braidStrands: number;
  braidTwist: number;
  barkJitter: number;
};

export type FloraNumericFields = Omit<GenerateFloraOptions, 'preset'>;

/** Preset knob bundles (glossary-inspired silhouettes). */
export const FLORA_PRESET_NUMERIC: Record<Exclude<FloraPresetId, 'custom'>, FloraNumericFields> = {
  stalk: {
    height: 14,
    girth: 0,
    wobble: 0.12,
    taper: 0.12,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 1,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0
  },
  trunk: {
    height: 20,
    girth: 3,
    wobble: 0.08,
    taper: 0.55,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 1,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0.08
  },
  contorted: {
    height: 22,
    girth: 1,
    wobble: 0.72,
    taper: 0.2,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 2,
    braidStrands: 1,
    braidTwist: 0.45,
    barkJitter: 0.05
  },
  multi_stem: {
    height: 16,
    girth: 1,
    wobble: 0.22,
    taper: 0.25,
    stemCount: 4,
    clusterRadius: 2,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 2,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0
  },
  branched: {
    height: 18,
    girth: 2,
    wobble: 0.18,
    taper: 0.35,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 4,
    branchDepth: 2,
    branchStart: 0.48,
    branchSpread: 2,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0.06
  },
  braided: {
    height: 16,
    girth: 1,
    wobble: 0.15,
    taper: 0.15,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 1,
    braidStrands: 3,
    braidTwist: 0.52,
    barkJitter: 0.04
  },
  tuft: {
    height: 6,
    girth: 0,
    wobble: 0.35,
    taper: 0.05,
    stemCount: 9,
    clusterRadius: 3,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.5,
    branchSpread: 1,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0
  }
};

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

function clusterRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getTangentVectors(normal: FaceNormal): [FaceNormal, FaceNormal] {
  const [nx, ny] = normal;
  if (nx !== 0)
    return [
      [0, 1, 0],
      [0, 0, 1]
    ];
  if (ny !== 0)
    return [
      [1, 0, 0],
      [0, 0, 1]
    ];
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clampOptions(o: GenerateFloraOptions): GenerateFloraOptions {
  return {
    preset: o.preset,
    height: clamp(Math.floor(o.height), 1, 48),
    girth: clamp(o.girth, 0, 4),
    wobble: clamp(o.wobble, 0, 1),
    taper: clamp(o.taper, 0, 1),
    stemCount: clamp(Math.floor(o.stemCount), 1, 8),
    clusterRadius: clamp(Math.floor(o.clusterRadius), 0, 4),
    branchCount: clamp(Math.floor(o.branchCount), 0, 6),
    branchDepth: clamp(Math.floor(o.branchDepth), 1, 2),
    branchStart: clamp(o.branchStart, 0, 0.9),
    branchSpread: clamp(Math.floor(o.branchSpread), 0, 3),
    braidStrands: clamp(Math.floor(o.braidStrands), 1, 5),
    braidTwist: clamp(o.braidTwist, 0, 1),
    barkJitter: clamp(o.barkJitter, 0, 1)
  };
}

function effectiveGirthAt(
  stepIndex: number,
  height: number,
  baseGirth: number,
  taper01: number
): number {
  const g = clamp(baseGirth, 0, 4);
  if (g === 0) return 0;
  if (taper01 <= 0 || height <= 1) return g;
  const t = stepIndex / (height - 1);
  return Math.max(0, g * (1 - taper01 * t));
}

function tryAddKey(keys: Set<string>, key: string, cap: { left: number }): boolean {
  if (keys.has(key)) return true;
  if (cap.left <= 0) return false;
  keys.add(key);
  cap.left--;
  return true;
}

function addDiskChebyshev(
  keys: Set<string>,
  px: number,
  py: number,
  pz: number,
  t1: FaceNormal,
  t2: FaceNormal,
  R: number,
  cap: { left: number }
): void {
  if (cap.left <= 0) return;
  const radius = Math.max(0, R);
  const side = Math.max(1, Math.floor(radius * 2) + 1);
  if (side <= 1) {
    tryAddKey(keys, coordKey(px, py, pz), cap);
    return;
  }
  const lo = -Math.floor((side - 1) / 2);
  const hi = lo + side - 1;
  for (let u = lo; u <= hi; u++) {
    for (let v = lo; v <= hi; v++) {
      const x = px + u * t1[0] + v * t2[0];
      const y = py + u * t1[1] + v * t2[1];
      const z = pz + u * t1[2] + v * t2[2];
      if (!tryAddKey(keys, coordKey(x, y, z), cap)) return;
    }
  }
}

/** Integer 3D walk from start toward end, at most maxSteps new cells (excluding start if already visited). */
function walkToward(
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ey: number,
  ez: number,
  maxSteps: number
): [number, number, number][] {
  const out: [number, number, number][] = [];
  let x = sx;
  let y = sy;
  let z = sz;
  out.push([x, y, z]);
  for (let i = 0; i < maxSteps; i++) {
    if (x === ex && y === ey && z === ez) break;
    const adx = Math.abs(ex - x);
    const ady = Math.abs(ey - y);
    const adz = Math.abs(ez - z);
    if (adx >= ady && adx >= adz && adx > 0) x += Math.sign(ex - x);
    else if (ady >= adz && ady > 0) y += Math.sign(ey - y);
    else if (adz > 0) z += Math.sign(ez - z);
    else break;
    out.push([x, y, z]);
  }
  return out;
}

function buildMeanBackbone(
  root: [number, number, number],
  normal: FaceNormal,
  height: number,
  wobble: number,
  t1: FaceNormal,
  t2: FaceNormal,
  rng: () => number
): [number, number, number][] {
  const [nx, ny, nz] = normal;
  const maxDrift = 2 + Math.floor(height * 0.42 * wobble);
  let u = 0;
  let v = 0;
  const out: [number, number, number][] = [];
  const [cx, cy, cz] = root;
  for (let k = 0; k < height; k++) {
    const x = cx + k * nx + u * t1[0] + v * t2[0];
    const y = cy + k * ny + u * t1[1] + v * t2[1];
    const z = cz + k * nz + u * t1[2] + v * t2[2];
    out.push([x, y, z]);
    if (k < height - 1) {
      if (rng() < 0.15 + wobble * 0.75) {
        const roll = rng();
        if (roll < 1 / 3) u += rng() < 0.5 ? -1 : 1;
        else if (roll < 2 / 3) v += rng() < 0.5 ? -1 : 1;
        else {
          u += rng() < 0.5 ? -1 : 1;
          v += rng() < 0.5 ? -1 : 1;
        }
      }
      u = clamp(u, -maxDrift, maxDrift);
      v = clamp(v, -maxDrift, maxDrift);
    }
  }
  return out;
}

function braidOffsets(
  strandIndex: number,
  strandCount: number,
  k: number,
  twist: number
): [number, number] {
  const R = 1 + Math.floor(twist * 2.2);
  const angle = (strandIndex / strandCount) * Math.PI * 2 + k * (0.35 + twist * 0.95);
  return [Math.round(R * Math.cos(angle)), Math.round(R * Math.sin(angle))];
}

function clusterOffset(
  stemIndex: number,
  seed: number,
  clusterRadius: number,
  t1: FaceNormal,
  t2: FaceNormal
): [number, number, number] {
  if (clusterRadius <= 0) return [0, 0, 0];
  const rng = clusterRng(seed + stemIndex * 0x9e3779b9);
  const du = Math.floor(rng() * (2 * clusterRadius + 1)) - clusterRadius;
  const dv = Math.floor(rng() * (2 * clusterRadius + 1)) - clusterRadius;
  return [du * t1[0] + dv * t2[0], du * t1[1] + dv * t2[1], du * t1[2] + dv * t2[2]];
}

function addBranchesToKeys(
  keys: Set<string>,
  meanBackbone: [number, number, number][],
  normal: FaceNormal,
  t1: FaceNormal,
  t2: FaceNormal,
  o: GenerateFloraOptions,
  stemSeed: number,
  cap: { left: number }
): void {
  const bc = o.branchCount;
  if (bc <= 0 || meanBackbone.length < 3) return;
  const height = meanBackbone.length;
  const startK = clamp(Math.ceil(o.branchStart * (height - 1)), 1, height - 2);
  const endK = height - 2;
  if (startK > endK) return;

  const forkCount = Math.min(bc, endK - startK + 1, 8);
  const rng = createRng(stemSeed ^ 0x51d1e4f);
  const used = new Set<number>();
  for (let b = 0; b < forkCount; b++) {
    if (cap.left <= 0) return;
    let fk = startK + Math.floor(rng() * (endK - startK + 1));
    let guard = 0;
    while (used.has(fk) && guard++ < 32) {
      fk = startK + Math.floor(rng() * (endK - startK + 1));
    }
    used.add(fk);
    const P = meanBackbone[fk]!;
    const spread = o.branchSpread;
    const childLen = clamp(Math.floor(height * 0.38 + rng() * 4), 2, 24);
    const du = Math.floor((rng() * 2 - 1) * (spread + 1));
    const dv = Math.floor((rng() * 2 - 1) * (spread + 1));
    const [nx, ny, nz] = normal;
    const ex = P[0] + nx * childLen + du * t1[0] + dv * t2[0];
    const ey = P[1] + ny * childLen + du * t1[1] + dv * t2[1];
    const ez = P[2] + nz * childLen + du * t1[2] + dv * t2[2];
    const path = walkToward(P[0], P[1], P[2], ex, ey, ez, childLen + 2);
    const girthB = Math.max(0, effectiveGirthAt(fk, height, o.girth, o.taper) - 1);
    for (let i = 1; i < path.length; i++) {
      if (cap.left <= 0) return;
      const [px, py, pz] = path[i]!;
      const gStep = Math.max(0, girthB - Math.floor(i / 3));
      addDiskChebyshev(keys, px, py, pz, t1, t2, gStep, cap);
    }
    if (o.branchDepth >= 2 && path.length > 3 && cap.left > 0) {
      const tip = path[path.length - 1]!;
      const rng2 = createRng(stemSeed ^ (b * 0xdeadbeef));
      const du2 = Math.floor((rng2() * 2 - 1) * spread);
      const dv2 = Math.floor((rng2() * 2 - 1) * spread);
      const len2 = clamp(Math.floor(childLen * 0.55), 2, 12);
      const ex2 = tip[0] + du2 * t1[0] + dv2 * t2[0] + nx * len2;
      const ey2 = tip[1] + du2 * t1[1] + dv2 * t2[1] + ny * len2;
      const ez2 = tip[2] + du2 * t1[2] + dv2 * t2[2] + nz * len2;
      const path2 = walkToward(tip[0], tip[1], tip[2], ex2, ey2, ez2, len2 + 1);
      for (let j = 1; j < path2.length; j++) {
        if (cap.left <= 0) return;
        const [px, py, pz] = path2[j]!;
        addDiskChebyshev(keys, px, py, pz, t1, t2, 0, cap);
      }
    }
  }
}

function collectFloraKeys(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  raw: GenerateFloraOptions
): Set<string> {
  const o = clampOptions(raw);
  const keys = new Set<string>();
  const cap = { left: FLORA_VOXEL_CAP };
  const [t1, t2] = getTangentVectors(normal);
  const stemCount = o.stemCount;

  for (let si = stemCount - 1; si >= 0; si--) {
    const stemSeed = (seed ^ (si * 0x85ebca6b)) >>> 0;
    const [ox, oy, oz] = clusterOffset(si, seed, o.clusterRadius, t1, t2);
    const root: [number, number, number] = [center[0] + ox, center[1] + oy, center[2] + oz];
    const rng = createRng(stemSeed);
    const meanB = buildMeanBackbone(root, normal, o.height, o.wobble, t1, t2, rng);

    const spines: [number, number, number][][] = [];
    if (o.braidStrands <= 1) {
      spines.push(meanB);
    } else {
      for (let s = 0; s < o.braidStrands; s++) {
        const strand: [number, number, number][] = [];
        for (let k = 0; k < meanB.length; k++) {
          const [bu, bv] = braidOffsets(s, o.braidStrands, k, o.braidTwist);
          const M = meanB[k]!;
          strand.push([
            M[0] + bu * t1[0] + bv * t2[0],
            M[1] + bu * t1[1] + bv * t2[1],
            M[2] + bu * t1[2] + bv * t2[2]
          ]);
        }
        spines.push(strand);
      }
    }

    for (const spine of spines) {
      for (let k = 0; k < spine.length; k++) {
        if (cap.left <= 0) break;
        const [px, py, pz] = spine[k]!;
        let R = effectiveGirthAt(k, o.height, o.girth, o.taper);
        if (o.braidStrands > 1) R = Math.max(0, R - 1);
        addDiskChebyshev(keys, px, py, pz, t1, t2, R, cap);
      }
    }

    addBranchesToKeys(keys, meanB, normal, t1, t2, o, stemSeed, cap);
  }

  return keys;
}

function jitterColor(base: Voxel, amount: number, key: string, seed: number): Voxel {
  if (amount <= 0) return base;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const rng = createRng((seed ^ h) >>> 0);
  const delta = Math.floor((rng() * 2 - 1) * amount * 28);
  const c = (base.color + delta) & 0xffffff;
  return { ...base, color: c };
}

export function getFloraPositions(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  options: GenerateFloraOptions
): [number, number, number][] {
  const keys = collectFloraKeys(seed, center, normal, options);
  return [...keys].sort().map((k) => parseCoordKey(k) as [number, number, number]);
}

export function generateFloraVoxels(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  options: GenerateFloraOptions,
  getVoxel: (x: number, y: number, z: number) => Voxel
): Map<string, Voxel> {
  const keys = collectFloraKeys(seed, center, normal, options);
  const sorted = [...keys].sort();
  const out = new Map<string, Voxel>();
  const jitter = clamp(options.barkJitter, 0, 1);
  for (const key of sorted) {
    const [x, y, z] = parseCoordKey(key);
    const base = cloneVoxel(getVoxel(x, y, z));
    out.set(key, jitter > 0 ? jitterColor(base, jitter, key, seed) : base);
  }
  return out;
}
