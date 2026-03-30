import { coordKey, parseCoordKey } from '../../coordUtils';
import type { FaceNormal } from '../core';
import type {
  FloraPresetId,
  FloraColorMode,
  FloraCrossSection,
  FloraBranchPlacementMode
} from '../generatorSettings';
import type { Voxel } from '../../voxelMaterial';
import { cloneVoxel } from '../../voxelMaterial';

/**
 * Hard ceiling: abusive slider combos cannot allocate unbounded memory or freeze meshing.
 * Normal placements use {@link computeFloraVoxelCap} from current options instead.
 */
export const FLORA_VOXEL_CAP_ABSOLUTE_MAX = 150_000;

/** Minimum budget so overlap-heavy clumps rarely hit the cap mid-stroke. */
export const FLORA_VOXEL_CAP_MIN = 512;

/** @deprecated Use {@link FLORA_VOXEL_CAP_ABSOLUTE_MAX} or {@link computeFloraVoxelCap}. */
export const FLORA_VOXEL_CAP = FLORA_VOXEL_CAP_ABSOLUTE_MAX;

/** Max stem cross-section parameter (0 = single column; Chebyshev disk spans up to `floor(girth×2)+1` per axis). */
export const FLORA_GIRTH_MAX = 20;

/** Extra headroom over the analytic gross voxel sum (overlap, path length, braid offset). */
const FLORA_VOXEL_BUDGET_SLACK = 1.22;

/** Golden-angle phyllotaxis step (≈137.5°): successive lateral organs spiral around the stem. */
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

export type { FloraColorMode, FloraCrossSection } from '../generatorSettings';

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
  /** Spiral phyllotaxis, decussate (alternating), or random attachment. */
  branchPlacement: FloraBranchPlacementMode;
  /** World XZ compass (°): horizontal bias projected onto tangent plane for wind-shaped crowns. */
  branchWindYawDeg: number;
  /** 0–1: blend lateral growth toward {@link branchWindYawDeg} on the tangent plane. */
  branchWindStrength: number;
  braidStrands: number;
  braidTwist: number;
  barkJitter: number;
  /** How paint / multi-color is sampled for each voxel. */
  colorMode: FloraColorMode;
  /** 0 = none, 1 = dense terminal foliage voxels around stem and branch tips. */
  canopy: number;
  stemCrossSection: FloraCrossSection;
};

export type FloraCellMeta = {
  stemRoot: [number, number, number];
  along: number;
  stemId: number;
  branchDepth: number;
  strandIndex: number;
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0,
    colorMode: 'alongStem',
    canopy: 0.18,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0.08,
    colorMode: 'alongStem',
    canopy: 0.06,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.45,
    barkJitter: 0.05,
    colorMode: 'alongStem',
    canopy: 0.12,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0,
    colorMode: 'alongStem',
    canopy: 0.22,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0.06,
    colorMode: 'alongStem',
    canopy: 0.38,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 3,
    braidTwist: 0.52,
    barkJitter: 0.04,
    colorMode: 'alongStem',
    canopy: 0.1,
    stemCrossSection: 'euclidean'
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
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.35,
    barkJitter: 0,
    colorMode: 'alongStem',
    canopy: 0.52,
    stemCrossSection: 'euclidean'
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
    height: clamp(Math.floor(o.height), 1, 96),
    girth: clamp(o.girth, 0, FLORA_GIRTH_MAX),
    wobble: clamp(o.wobble, 0, 1),
    taper: clamp(o.taper, 0, 1),
    stemCount: clamp(Math.floor(o.stemCount), 1, 8),
    clusterRadius: clamp(Math.floor(o.clusterRadius), 0, 4),
    branchCount: clamp(Math.floor(o.branchCount), 0, 6),
    branchDepth: clamp(Math.floor(o.branchDepth), 1, 2),
    branchStart: clamp(o.branchStart, 0, 0.9),
    branchSpread: clamp(Math.floor(o.branchSpread), 0, 3),
    branchPlacement:
      o.branchPlacement === 'alternate' || o.branchPlacement === 'random'
        ? o.branchPlacement
        : 'spiral',
    branchWindYawDeg: ((o.branchWindYawDeg % 360) + 360) % 360,
    branchWindStrength: clamp(o.branchWindStrength, 0, 1),
    braidStrands: clamp(Math.floor(o.braidStrands), 1, 5),
    braidTwist: clamp(o.braidTwist, 0, 1),
    barkJitter: clamp(o.barkJitter, 0, 1),
    colorMode: o.colorMode === 'world' || o.colorMode === 'perPlacement' || o.colorMode === 'alongStem' ? o.colorMode : 'alongStem',
    canopy: clamp(o.canopy, 0, 1),
    stemCrossSection: o.stemCrossSection === 'chebyshev' ? 'chebyshev' : 'euclidean'
  };
}

function effectiveGirthAt(
  stepIndex: number,
  height: number,
  baseGirth: number,
  taper01: number
): number {
  const g = clamp(baseGirth, 0, FLORA_GIRTH_MAX);
  if (g === 0) return 0;
  if (taper01 <= 0 || height <= 1) return g;
  const t = stepIndex / (height - 1);
  return Math.max(0, g * (1 - taper01 * t));
}

/** Limb thickness at fork: scales with trunk girth; lower forks stay slightly thicker than high ones. */
function branchBaseRadiusAtFork(trunkGirth: number, heightFrac01: number): number {
  if (trunkGirth <= 0) return 0;
  const limbScale = 0.38 + 0.32 * (1 - clamp(heightFrac01, 0, 1));
  return clamp(Math.round(trunkGirth * limbScale), 0, FLORA_GIRTH_MAX);
}

/** Disk R along branch: slow taper from fork to tip (avoids single-voxel “filaments”). */
function branchDiskRAtStep(baseR: number, segIndex: number, segCount: number): number {
  if (baseR <= 0) return 0;
  if (segCount <= 1) return Math.max(0, Math.round(baseR));
  const t = segIndex / (segCount - 1);
  return Math.max(0, Math.round(baseR * (1 - t * 0.82)));
}

/** Euclidean radius in tangent integer steps (similar visual weight to legacy Chebyshev). */
function euclideanRadiusSteps(R: number): number {
  const radius = Math.max(0, R);
  return Math.max(0, Math.round(radius * 1.85));
}

/** Cell count for one stem disk (matches addDiskChebyshev / addDiskEuclidean worst case). */
function countEuclideanDiskCells(r: number): number {
  if (r <= 0) return 1;
  let n = 0;
  const r2 = r * r;
  for (let u = -r; u <= r; u++) {
    for (let v = -r; v <= r; v++) {
      if (u * u + v * v <= r2) n++;
    }
  }
  return n;
}

function diskCellBudget(R: number, section: FloraCrossSection): number {
  if (section === 'chebyshev') {
    const radius = Math.max(0, R);
    const side = Math.max(1, Math.floor(radius * 2) + 1);
    return side * side;
  }
  return countEuclideanDiskCells(euclideanRadiusSteps(R));
}

/**
 * Predicts a safe voxel budget for one flora placement from clamped dimensions.
 * Tight enough for small plants, scales with height × girth × stems × branches × canopy.
 */
export function computeFloraVoxelCap(raw: GenerateFloraOptions): number {
  const o = clampOptions(raw);
  let gross = 0;
  const h = o.height;
  const strandN = o.braidStrands;
  const gMinus = strandN > 1 ? 1 : 0;

  let spinePerStrand = 0;
  for (let k = 0; k < h; k++) {
    const R = Math.max(0, effectiveGirthAt(k, h, o.girth, o.taper) - gMinus);
    spinePerStrand += diskCellBudget(R, o.stemCrossSection);
  }
  gross += o.stemCount * strandN * spinePerStrand;

  if (h >= 3 && o.branchCount > 0) {
    const startK = clamp(Math.ceil(o.branchStart * (h - 1)), 1, h - 2);
    const endK = h - 2;
    if (startK <= endK) {
      const forkCount = Math.min(o.branchCount, endK - startK + 1, 8);
      const childLenMax = clamp(Math.floor(h * 0.72 + o.girth * 3 + 12), 3, 64);
      const brSpread = o.branchSpread;
      const path1Max = Math.min(168, Math.floor(childLenMax * 2.9) + brSpread * 10 + 28);
      const maxBranchR = clamp(Math.round(o.girth * 0.78), 0, FLORA_GIRTH_MAX);
      const dBranch = diskCellBudget(maxBranchR, o.stemCrossSection);
      let perFork = path1Max * dBranch;
      if (o.branchDepth >= 2) {
        const len2Max = clamp(Math.floor(childLenMax * 0.72), 3, 42);
        const path2Max = Math.min(168, Math.floor(len2Max * 2.9) + Math.max(1, brSpread) * 10 + 28);
        const child2R = clamp(Math.round(maxBranchR * 0.78), 0, FLORA_GIRTH_MAX);
        perFork += path2Max * diskCellBudget(child2R, o.stemCrossSection);
      }
      gross += o.stemCount * forkCount * perFork;
    }
  }

  if (o.canopy > 0) {
    const layers = 1 + Math.floor(o.canopy * 2);
    const r = 1 + Math.floor(2 * o.canopy);
    const perTip = layers * (2 * r + 1) * (2 * r + 1);
    gross += o.stemCount * strandN * perTip;
  }

  const padded = Math.ceil(gross * FLORA_VOXEL_BUDGET_SLACK);
  return clamp(padded, FLORA_VOXEL_CAP_MIN, FLORA_VOXEL_CAP_ABSOLUTE_MAX);
}

function tryAddCell(
  cells: Map<string, FloraCellMeta>,
  key: string,
  meta: FloraCellMeta,
  cap: { left: number }
): boolean {
  if (cells.has(key)) return true;
  if (cap.left <= 0) return false;
  cells.set(key, meta);
  cap.left--;
  return true;
}

function addDiskChebyshev(
  cells: Map<string, FloraCellMeta>,
  px: number,
  py: number,
  pz: number,
  t1: FaceNormal,
  t2: FaceNormal,
  R: number,
  cap: { left: number },
  meta: FloraCellMeta
): void {
  if (cap.left <= 0) return;
  const radius = Math.max(0, R);
  const side = Math.max(1, Math.floor(radius * 2) + 1);
  if (side <= 1) {
    tryAddCell(cells, coordKey(px, py, pz), meta, cap);
    return;
  }
  const lo = -Math.floor((side - 1) / 2);
  const hi = lo + side - 1;
  for (let u = lo; u <= hi; u++) {
    for (let v = lo; v <= hi; v++) {
      const x = px + u * t1[0] + v * t2[0];
      const y = py + u * t1[1] + v * t2[1];
      const z = pz + u * t1[2] + v * t2[2];
      if (!tryAddCell(cells, coordKey(x, y, z), meta, cap)) return;
    }
  }
}

function addDiskEuclidean(
  cells: Map<string, FloraCellMeta>,
  px: number,
  py: number,
  pz: number,
  t1: FaceNormal,
  t2: FaceNormal,
  R: number,
  cap: { left: number },
  meta: FloraCellMeta
): void {
  if (cap.left <= 0) return;
  const r = euclideanRadiusSteps(R);
  if (r <= 0) {
    tryAddCell(cells, coordKey(px, py, pz), meta, cap);
    return;
  }
  const r2 = r * r;
  for (let u = -r; u <= r; u++) {
    for (let v = -r; v <= r; v++) {
      if (u * u + v * v > r2) continue;
      const x = px + u * t1[0] + v * t2[0];
      const y = py + u * t1[1] + v * t2[1];
      const z = pz + u * t1[2] + v * t2[2];
      if (!tryAddCell(cells, coordKey(x, y, z), meta, cap)) return;
    }
  }
}

function addStemDisk(
  cells: Map<string, FloraCellMeta>,
  px: number,
  py: number,
  pz: number,
  t1: FaceNormal,
  t2: FaceNormal,
  R: number,
  cap: { left: number },
  meta: FloraCellMeta,
  section: FloraCrossSection
): void {
  if (section === 'chebyshev') {
    addDiskChebyshev(cells, px, py, pz, t1, t2, R, cap, meta);
  } else {
    addDiskEuclidean(cells, px, py, pz, t1, t2, R, cap, meta);
  }
}

/** 3D Bresenham line; inclusive endpoints; capped length. */
function line3DBresenham(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  maxPoints: number
): [number, number, number][] {
  const points: [number, number, number][] = [];
  if (maxPoints <= 0) return points;
  let x = x1;
  let y = y1;
  let z = z1;
  points.push([x, y, z]);
  if (x1 === x2 && y1 === y2 && z1 === z2) return points;

  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dz = Math.abs(z2 - z1);
  const xs = x2 > x1 ? 1 : x2 < x1 ? -1 : 0;
  const ys = y2 > y1 ? 1 : y2 < y1 ? -1 : 0;
  const zs = z2 > z1 ? 1 : z2 < z1 ? -1 : 0;

  if (dx >= dy && dx >= dz) {
    let p1 = 2 * dy - dx;
    let p2 = 2 * dz - dx;
    while (x !== x2) {
      x += xs;
      if (p1 >= 0) {
        y += ys;
        p1 -= 2 * dx;
      }
      if (p2 >= 0) {
        z += zs;
        p2 -= 2 * dx;
      }
      p1 += 2 * dy;
      p2 += 2 * dz;
      points.push([x, y, z]);
      if (points.length >= maxPoints) return points;
    }
  } else if (dy >= dx && dy >= dz) {
    let p1 = 2 * dx - dy;
    let p2 = 2 * dz - dy;
    while (y !== y2) {
      y += ys;
      if (p1 >= 0) {
        x += xs;
        p1 -= 2 * dy;
      }
      if (p2 >= 0) {
        z += zs;
        p2 -= 2 * dy;
      }
      p1 += 2 * dx;
      p2 += 2 * dz;
      points.push([x, y, z]);
      if (points.length >= maxPoints) return points;
    }
  } else {
    let p1 = 2 * dy - dz;
    let p2 = 2 * dx - dz;
    while (z !== z2) {
      z += zs;
      if (p1 >= 0) {
        y += ys;
        p1 -= 2 * dz;
      }
      if (p2 >= 0) {
        x += xs;
        p2 -= 2 * dz;
      }
      p1 += 2 * dy;
      p2 += 2 * dx;
      points.push([x, y, z]);
      if (points.length >= maxPoints) return points;
    }
  }
  return points;
}

function branchPath(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  maxPoints: number,
  rng: () => number,
  t1: FaceNormal,
  t2: FaceNormal
): [number, number, number][] {
  const jku = rng() < 0.5 ? -1 : 1;
  const jkv = rng() < 0.5 ? -1 : 1;
  const mx = Math.round((ax + bx) / 2) + jku * t1[0] + jkv * t2[0];
  const my = Math.round((ay + by) / 2) + jku * t1[1] + jkv * t2[1];
  const mz = Math.round((az + bz) / 2) + jku * t1[2] + jkv * t2[2];
  const half = Math.max(1, Math.floor(maxPoints * 0.55));
  const p0 = line3DBresenham(ax, ay, az, mx, my, mz, half);
  const tip = p0[p0.length - 1]!;
  const rest = Math.max(1, maxPoints - p0.length);
  const p1 = line3DBresenham(tip[0], tip[1], tip[2], bx, by, bz, rest);
  const out: [number, number, number][] = [...p0];
  for (let i = 1; i < p1.length; i++) out.push(p1[i]!);
  return out.slice(0, maxPoints);
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
  const biasU = rng() < 0.5 ? -1 : 1;
  const biasV = rng() < 0.5 ? -1 : 1;
  const out: [number, number, number][] = [];
  const [cx, cy, cz] = root;
  for (let k = 0; k < height; k++) {
    const x = cx + k * nx + u * t1[0] + v * t2[0];
    const y = cy + k * ny + u * t1[1] + v * t2[1];
    const z = cz + k * nz + u * t1[2] + v * t2[2];
    out.push([x, y, z]);
    if (k < height - 1 && wobble > 0) {
      if (rng() < 0.15 + wobble * 0.75) {
        const roll = rng();
        if (roll < 1 / 3) u += (rng() < 0.55 ? biasU : -biasU);
        else if (roll < 2 / 3) v += (rng() < 0.55 ? biasV : -biasV);
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

type StemWork = {
  root: [number, number, number];
  stemSeed: number;
  meanB: [number, number, number][];
  spines: [number, number, number][][];
};

/** World horizontal wind / lean direction (Y-up, XZ plane) projected onto stem tangent plane. */
function windBiasInTangentPlane(
  windYawDeg: number,
  t1: FaceNormal,
  t2: FaceNormal
): [number, number] {
  const rad = (windYawDeg * Math.PI) / 180;
  const wx = Math.cos(rad);
  const wy = 0;
  const wz = Math.sin(rad);
  let bu = wx * t1[0] + wy * t1[1] + wz * t1[2];
  let bv = wx * t2[0] + wy * t2[1] + wz * t2[2];
  const len = Math.hypot(bu, bv);
  if (len < 1e-8) return [0, 0];
  return [bu / len, bv / len];
}

/** Evenly spaced fork heights between startK and endK (real trees: avoid clumped random whorls unless whorled mode). */
function partitionForkHeights(startK: number, endK: number, forkCount: number): number[] {
  const span = endK - startK;
  const n = Math.min(forkCount, span + 1);
  const out: number[] = [];
  if (n <= 0) return out;
  if (n === 1) {
    out.push(clamp(Math.round((startK + endK) / 2), startK, endK));
    return out;
  }
  for (let b = 0; b < n; b++) {
    const fk = startK + Math.round(((b + 1) / (n + 1)) * span);
    out.push(clamp(fk, startK, endK));
  }
  return out;
}

function branchAzimuthRad(
  mode: FloraBranchPlacementMode,
  branchIndex: number,
  stemSeed: number,
  rng: () => number
): number {
  if (mode === 'random') return rng() * Math.PI * 2;
  if (mode === 'alternate') {
    const base = ((stemSeed & 0xff) / 256) * Math.PI * 2;
    return (branchIndex % 2) * Math.PI + base;
  }
  return branchIndex * GOLDEN_ANGLE_RAD + ((stemSeed & 0xfff) / 4096) * Math.PI * 2;
}

/**
 * Branch tip offset: lateral direction from azimuth in (t1,t2), optional wind blend,
 * insertion angle from fork height (lower limbs more horizontal).
 */
function branchEndDelta(
  childLen: number,
  spread: number,
  normal: FaceNormal,
  t1: FaceNormal,
  t2: FaceNormal,
  rng: () => number,
  azimuthRad: number,
  forkHeightFrac: number,
  windU: number,
  windV: number,
  windStrength: number
): { dx: number; dy: number; dz: number; pathBudget: number } {
  const [nx, ny, nz] = normal;
  const s = Math.max(0, spread);
  const upShareBase = clamp(0.52 / (1 + s * 0.7) + 0.06, 0.1, 0.52);
  const insertion = clamp(0.36 + 0.64 * forkHeightFrac, 0.22, 1.05);
  const upShare = clamp(upShareBase * insertion, 0.08, 0.55);
  const upLen = clamp(Math.floor(childLen * upShare + rng() - 0.3), 1, Math.max(1, childLen - 1));
  const lateralMin = Math.max(1, childLen - upLen + Math.floor(s * 2.2));
  const latMag = Math.max(2, lateralMin + Math.floor(rng() * (5 + s * 3)));
  let du = Math.round(Math.cos(azimuthRad) * latMag);
  let dv = Math.round(Math.sin(azimuthRad) * latMag);
  const ws = clamp(windStrength, 0, 1);
  if (ws > 0 && (Math.abs(windU) > 1e-8 || Math.abs(windV) > 1e-8)) {
    const duW = windU * latMag;
    const dvW = windV * latMag;
    du = Math.round(du * (1 - ws) + duW * ws);
    dv = Math.round(dv * (1 - ws) + dvW * ws);
  }
  if (du === 0 && dv === 0) {
    du = rng() < 0.5 ? -1 : 1;
  }
  const dx = nx * upLen + du * t1[0] + dv * t2[0];
  const dy = ny * upLen + du * t1[1] + dv * t2[1];
  const dz = nz * upLen + du * t1[2] + dv * t2[2];
  const pathBudget = clamp(
    upLen + Math.abs(du) + Math.abs(dv) + 14,
    childLen + 8,
    Math.min(168, Math.floor(childLen * 2.85) + s * 10 + 18)
  );
  return { dx, dy, dz, pathBudget };
}

function addBranchesToCells(
  cells: Map<string, FloraCellMeta>,
  meanBackbone: [number, number, number][],
  normal: FaceNormal,
  t1: FaceNormal,
  t2: FaceNormal,
  root: [number, number, number],
  stemId: number,
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
  const spread = o.branchSpread;
  const placement = o.branchPlacement;
  const [windU, windV] = windBiasInTangentPlane(o.branchWindYawDeg, t1, t2);
  const windStrength = o.branchWindStrength;

  const used = new Set<number>();

  function placeOneBranch(fk: number, b: number, azimuthRad: number): void {
    if (cap.left <= 0) return;
    const P = meanBackbone[fk]!;
    const trunkG = effectiveGirthAt(fk, height, o.girth, o.taper);
    const heightFrac = fk / Math.max(1, height - 1);
    const lenFromHeight = height * (0.5 + rng() * 0.12);
    const lenFromGirth = trunkG * 1.35;
    const lenFromPosition = 1 + 0.26 * (1 - heightFrac);
    const childLen = clamp(
      Math.floor(lenFromHeight * lenFromPosition + lenFromGirth + rng() * 6),
      3,
      64
    );
    const delta = branchEndDelta(
      childLen,
      spread,
      normal,
      t1,
      t2,
      rng,
      azimuthRad,
      heightFrac,
      windU,
      windV,
      windStrength
    );
    const ex = P[0] + delta.dx;
    const ey = P[1] + delta.dy;
    const ez = P[2] + delta.dz;
    const maxPts = delta.pathBudget;
    const path = branchPath(P[0], P[1], P[2], ex, ey, ez, maxPts, rng, t1, t2);
    const baseBranchR = branchBaseRadiusAtFork(trunkG, heightFrac);
    const segCount = Math.max(1, path.length - 1);
    for (let i = 1; i < path.length; i++) {
      if (cap.left <= 0) return;
      const [px, py, pz] = path[i]!;
      const gStep = branchDiskRAtStep(baseBranchR, i - 1, segCount);
      const meta: FloraCellMeta = {
        stemRoot: root,
        along: fk + i,
        stemId,
        branchDepth: 1,
        strandIndex: 0
      };
      addStemDisk(cells, px, py, pz, t1, t2, gStep, cap, meta, o.stemCrossSection);
    }
    if (o.branchDepth >= 2 && path.length > 3 && cap.left > 0) {
      const tip = path[path.length - 1]!;
      const rng2 = createRng(stemSeed ^ (b * 0xdeadbeef));
      const len2 = clamp(Math.floor(childLen * (0.58 + rng2() * 0.1)), 3, 42);
      const twigAz =
        azimuthRad + GOLDEN_ANGLE_RAD * 0.37 + rng2() * 1.15;
      const delta2 = branchEndDelta(
        len2,
        Math.max(1, spread),
        normal,
        t1,
        t2,
        rng2,
        twigAz,
        0.94,
        windU,
        windV,
        windStrength
      );
      const ex2 = tip[0] + delta2.dx;
      const ey2 = tip[1] + delta2.dy;
      const ez2 = tip[2] + delta2.dz;
      const path2 = branchPath(tip[0], tip[1], tip[2], ex2, ey2, ez2, delta2.pathBudget, rng2, t1, t2);
      const parentTipR = branchDiskRAtStep(baseBranchR, segCount - 1, segCount);
      const child2BaseR = Math.max(
        0,
        Math.round(parentTipR * (0.62 + rng2() * 0.18))
      );
      const seg2 = Math.max(1, path2.length - 1);
      for (let j = 1; j < path2.length; j++) {
        if (cap.left <= 0) return;
        const [px, py, pz] = path2[j]!;
        const g2 = branchDiskRAtStep(child2BaseR, j - 1, seg2);
        const meta: FloraCellMeta = {
          stemRoot: root,
          along: fk + path.length + j,
          stemId,
          branchDepth: 2,
          strandIndex: 0
        };
        addStemDisk(cells, px, py, pz, t1, t2, g2, cap, meta, o.stemCrossSection);
      }
    }
  }

  if (placement === 'random') {
    for (let b = 0; b < forkCount; b++) {
      if (cap.left <= 0) return;
      let fk = startK + Math.floor(rng() * (endK - startK + 1));
      let guard = 0;
      while (used.has(fk) && guard++ < 32) {
        fk = startK + Math.floor(rng() * (endK - startK + 1));
      }
      used.add(fk);
      const az = branchAzimuthRad('random', b, stemSeed, rng);
      placeOneBranch(fk, b, az);
    }
  } else {
    const fks = partitionForkHeights(startK, endK, forkCount);
    for (let b = 0; b < fks.length; b++) {
      const fk = fks[b]!;
      const az = branchAzimuthRad(placement, b, stemSeed, rng);
      placeOneBranch(fk, b, az);
    }
  }
}

function addCanopyAt(
  cells: Map<string, FloraCellMeta>,
  tip: [number, number, number],
  normal: FaceNormal,
  t1: FaceNormal,
  t2: FaceNormal,
  stemRoot: [number, number, number],
  stemId: number,
  alongBase: number,
  canopy01: number,
  rng: () => number,
  cap: { left: number }
): void {
  if (cap.left <= 0 || canopy01 <= 0) return;
  const [nx, ny, nz] = normal;
  const r = 1 + Math.floor(rng() * 2 * canopy01);
  const layers = 1 + Math.floor(canopy01 * 2);
  for (let layer = 0; layer < layers; layer++) {
    for (let u = -r; u <= r; u++) {
      for (let v = -r; v <= r; v++) {
        if (u * u + v * v > r * r + 1) continue;
        if (rng() > 0.35 + canopy01 * 0.55) continue;
        const x = tip[0] + u * t1[0] + v * t2[0] + layer * nx;
        const y = tip[1] + u * t1[1] + v * t2[1] + layer * ny;
        const z = tip[2] + u * t1[2] + v * t2[2] + layer * nz;
        const meta: FloraCellMeta = {
          stemRoot,
          along: alongBase + layer * 10 + Math.abs(u) + Math.abs(v),
          stemId,
          branchDepth: 0,
          strandIndex: 7
        };
        tryAddCell(cells, coordKey(x, y, z), meta, cap);
        if (cap.left <= 0) return;
      }
    }
  }
}

function addCanopyPass(
  cells: Map<string, FloraCellMeta>,
  stems: StemWork[],
  normal: FaceNormal,
  t1: FaceNormal,
  t2: FaceNormal,
  o: GenerateFloraOptions,
  seed: number,
  cap: { left: number }
): void {
  if (o.canopy <= 0 || cap.left <= 0) return;
  for (let si = 0; si < stems.length; si++) {
    const sw = stems[si]!;
    for (const spine of sw.spines) {
      if (spine.length === 0) continue;
      const tip = spine[spine.length - 1]!;
      const rng = createRng((seed ^ sw.stemSeed ^ si * 0x1234abcd) >>> 0);
      addCanopyAt(cells, tip, normal, t1, t2, sw.root, si, spine.length, o.canopy, rng, cap);
    }
  }
}

function collectFloraCells(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  raw: GenerateFloraOptions
): Map<string, FloraCellMeta> {
  const o = clampOptions(raw);
  const cells = new Map<string, FloraCellMeta>();
  const cap = { left: computeFloraVoxelCap(o) };
  const [t1, t2] = getTangentVectors(normal);
  const stems: StemWork[] = [];

  for (let si = 0; si < o.stemCount; si++) {
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
    stems.push({ root, stemSeed, meanB, spines });
  }

  for (let si = 0; si < stems.length; si++) {
    const sw = stems[si]!;
    for (let s = 0; s < sw.spines.length; s++) {
      const spine = sw.spines[s]!;
      for (let k = 0; k < spine.length; k++) {
        if (cap.left <= 0) break;
        const [px, py, pz] = spine[k]!;
        let R = effectiveGirthAt(k, o.height, o.girth, o.taper);
        if (o.braidStrands > 1) R = Math.max(0, R - 1);
        const meta: FloraCellMeta = {
          stemRoot: sw.root,
          along: k,
          stemId: si,
          branchDepth: 0,
          strandIndex: s
        };
        addStemDisk(cells, px, py, pz, t1, t2, R, cap, meta, o.stemCrossSection);
      }
    }
  }

  for (let si = 0; si < stems.length; si++) {
    const sw = stems[si]!;
    addBranchesToCells(cells, sw.meanB, normal, t1, t2, sw.root, si, o, sw.stemSeed, cap);
  }

  if (o.canopy > 0) {
    addCanopyPass(cells, stems, normal, t1, t2, o, seed, cap);
  }

  return cells;
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

function resolveFloraColor(
  mode: FloraColorMode,
  getVoxel: (x: number, y: number, z: number) => Voxel,
  wx: number,
  wy: number,
  wz: number,
  meta: FloraCellMeta
): Voxel {
  if (mode === 'world') {
    return cloneVoxel(getVoxel(wx, wy, wz));
  }
  if (mode === 'perPlacement') {
    const [rx, ry, rz] = meta.stemRoot;
    return cloneVoxel(getVoxel(rx, ry, rz));
  }
  const ax = meta.along * 3 + meta.branchDepth * 120;
  const ay = meta.stemId * 17 + meta.strandIndex * 4;
  const az = meta.branchDepth * 31;
  return cloneVoxel(getVoxel(ax, ay, az));
}

export function getFloraPositions(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  options: GenerateFloraOptions
): [number, number, number][] {
  const cells = collectFloraCells(seed, center, normal, options);
  return [...cells.keys()].sort().map((k) => parseCoordKey(k) as [number, number, number]);
}

export function generateFloraVoxels(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  options: GenerateFloraOptions,
  getVoxel: (x: number, y: number, z: number) => Voxel
): Map<string, Voxel> {
  const o = clampOptions(options);
  const cells = collectFloraCells(seed, center, normal, o);
  const sorted = [...cells.keys()].sort();
  const out = new Map<string, Voxel>();
  const jitter = clamp(o.barkJitter, 0, 1);
  for (const key of sorted) {
    const meta = cells.get(key)!;
    const [wx, wy, wz] = parseCoordKey(key);
    const base = resolveFloraColor(o.colorMode, getVoxel, wx, wy, wz, meta);
    out.set(key, jitter > 0 ? jitterColor(base, jitter, key, seed) : base);
  }
  return out;
}
