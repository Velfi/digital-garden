import { writable } from 'svelte/store';
import { coordKey } from '../coordUtils';
import type { VoxelMaterialId } from '../voxelMaterial';
import type { Voxel } from '../voxelMaterial';
import { fbmValue3 } from './valueNoise3d';
import {
  buildFloydSteinbergMap,
  buildSequentialErrorDiffusionMap,
  hashTForCoord,
  orderedDitherT,
  paintColorIndexForCoord,
  voxelFromT
} from './paintColorDistributionMath';

export type PaintColorDistributionMode =
  | 'whiteNoise'
  | 'randomSingle'
  | 'fbmNoise'
  | 'gradient'
  | 'dither';

export type PaintColorDistributionState = {
  mode: PaintColorDistributionMode;
  fbm: {
    octaves: number;
    lacunarity: number;
    persistence: number;
    frequency: number;
    noiseSeed: number;
    quantized: boolean;
  };
  gradient: {
    kind: 'linear' | 'radial';
    linearAxis: 0 | 1 | 2;
    scale: number;
    phase: number;
    radialCenter: [number, number, number];
    quantized: boolean;
  };
  dither: {
    orderedSize: 2 | 4 | 8;
    orderedStrength: number;
    errorDiffusion: 'none' | 'floydSteinberg';
  };
};

export const DEFAULT_PAINT_COLOR_DISTRIBUTION: PaintColorDistributionState = {
  mode: 'whiteNoise',
  fbm: {
    octaves: 4,
    lacunarity: 2,
    persistence: 0.5,
    frequency: 0.15,
    noiseSeed: 0x12345678,
    quantized: false
  },
  gradient: {
    kind: 'linear',
    linearAxis: 1,
    scale: 0.08,
    phase: 0,
    radialCenter: [0, 0, 0],
    quantized: false
  },
  dither: {
    orderedSize: 4,
    orderedStrength: 0.35,
    errorDiffusion: 'none'
  }
};

function clampOrderedSize(n: number): 2 | 4 | 8 {
  if (n === 2 || n === 4 || n === 8) return n;
  return 4;
}

export function mergePaintColorDistribution(
  partial: unknown,
  base: PaintColorDistributionState = DEFAULT_PAINT_COLOR_DISTRIBUTION
): PaintColorDistributionState {
  if (!partial || typeof partial !== 'object')
    return { ...base, fbm: { ...base.fbm }, gradient: { ...base.gradient }, dither: { ...base.dither } };
  const o = partial as Record<string, unknown>;
  const mode = o.mode;
  const m: PaintColorDistributionMode =
    mode === 'whiteNoise' ||
    mode === 'randomSingle' ||
    mode === 'fbmNoise' ||
    mode === 'gradient' ||
    mode === 'dither'
      ? mode
      : base.mode;
  const f = o.fbm && typeof o.fbm === 'object' ? (o.fbm as Record<string, unknown>) : {};
  const g = o.gradient && typeof o.gradient === 'object' ? (o.gradient as Record<string, unknown>) : {};
  const d = o.dither && typeof o.dither === 'object' ? (o.dither as Record<string, unknown>) : {};
  return {
    mode: m,
    fbm: {
      octaves:
        typeof f.octaves === 'number' && Number.isFinite(f.octaves)
          ? Math.max(1, Math.min(12, Math.round(f.octaves)))
          : base.fbm.octaves,
      lacunarity:
        typeof f.lacunarity === 'number' && Number.isFinite(f.lacunarity) && f.lacunarity > 0
          ? f.lacunarity
          : base.fbm.lacunarity,
      persistence:
        typeof f.persistence === 'number' && Number.isFinite(f.persistence) && f.persistence > 0
          ? Math.min(1, f.persistence)
          : base.fbm.persistence,
      frequency:
        typeof f.frequency === 'number' && Number.isFinite(f.frequency) && f.frequency > 0
          ? f.frequency
          : base.fbm.frequency,
      noiseSeed:
        typeof f.noiseSeed === 'number' && Number.isFinite(f.noiseSeed)
          ? (f.noiseSeed >>> 0)
          : base.fbm.noiseSeed,
      quantized: typeof f.quantized === 'boolean' ? f.quantized : base.fbm.quantized
    },
    gradient: {
      kind: g.kind === 'radial' ? 'radial' : 'linear',
      linearAxis:
        g.linearAxis === 0 || g.linearAxis === 1 || g.linearAxis === 2 ? g.linearAxis : base.gradient.linearAxis,
      scale:
        typeof g.scale === 'number' && Number.isFinite(g.scale) && g.scale > 0 ? g.scale : base.gradient.scale,
      phase: typeof g.phase === 'number' && Number.isFinite(g.phase) ? g.phase : base.gradient.phase,
      radialCenter:
        Array.isArray(g.radialCenter) && g.radialCenter.length >= 3
          ? [
              Number(g.radialCenter[0]) || 0,
              Number(g.radialCenter[1]) || 0,
              Number(g.radialCenter[2]) || 0
            ]
          : [...base.gradient.radialCenter],
      quantized: typeof g.quantized === 'boolean' ? g.quantized : base.gradient.quantized
    },
    dither: {
      orderedSize: clampOrderedSize(
        typeof d.orderedSize === 'number' ? d.orderedSize : base.dither.orderedSize
      ),
      orderedStrength:
        typeof d.orderedStrength === 'number' && Number.isFinite(d.orderedStrength)
          ? Math.max(0, Math.min(1, d.orderedStrength))
          : base.dither.orderedStrength,
      errorDiffusion: d.errorDiffusion === 'floydSteinberg' ? 'floydSteinberg' : 'none'
    }
  };
}

/** Initialized to defaults; sync from `loadPreferences().paintColorDistribution` on app load (see voxelle layout). */
export const paintColorDistribution = writable<PaintColorDistributionState>(
  mergePaintColorDistribution(null)
);

export type PaintColorResolverOptions = {
  strokeSeed?: number;
  placementSeed?: number;
  /** When error diffusion is on, pass fill/stroke positions for batch FS (see math module). */
  positionsForErrorDiffusion?: [number, number, number][];
};

function mixSeedToIndex(seed: number, n: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h ^= h >>> 15;
  return n <= 1 ? 0 : (h >>> 0) % n;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function gradientTFixed(state: PaintColorDistributionState, x: number, y: number, z: number): number {
  const g = state.gradient;
  if (g.kind === 'linear') {
    const p = g.linearAxis === 0 ? x : g.linearAxis === 1 ? y : z;
    return fract(p * g.scale + g.phase);
  }
  const [cx, cy, cz] = g.radialCenter;
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return fract(dist * g.scale + g.phase);
}

export type PaintColorResolver = (x: number, y: number, z: number) => Voxel;

/**
 * Build per-voxel color resolver from distribution state and palette (multi-color only).
 */
export function buildPaintColorResolver(
  state: PaintColorDistributionState,
  colors: number[],
  material: VoxelMaterialId,
  opts?: PaintColorResolverOptions
): PaintColorResolver {
  const n = colors.length;
  if (n <= 1) {
    const c = (n === 1 ? colors[0]! : 0xffffff) & 0xffffff;
    return () => ({ color: c, material });
  }

  const mode = state.mode;
  const seedBase =
    (opts?.strokeSeed ?? opts?.placementSeed ?? undefined) !== undefined
      ? ((opts!.strokeSeed ?? opts!.placementSeed) as number) >>> 0
      : mode === 'randomSingle'
        ? Math.floor(Math.random() * 0xffffffff)
        : 0;

  if (mode === 'randomSingle') {
    const idx = mixSeedToIndex(seedBase, n);
    const c = colors[idx]! & 0xffffff;
    return () => ({ color: c, material });
  }

  const makeGetT = (): ((x: number, y: number, z: number) => number) => {
    switch (mode) {
      case 'whiteNoise':
        return (x, y, z) => (n <= 1 ? 0 : paintColorIndexForCoord(x, y, z, n) / Math.max(1, n - 1));
      case 'fbmNoise': {
        const f = state.fbm;
        return (x, y, z) =>
          fbmValue3(
            f.noiseSeed >>> 0,
            x,
            y,
            z,
            f.octaves,
            f.lacunarity,
            f.persistence,
            f.frequency
          );
      }
      case 'gradient':
        return (x, y, z) => gradientTFixed(state, x, y, z);
      case 'dither':
        return (x, y, z) => hashTForCoord(state.fbm.noiseSeed ^ 0xabc, x, y, z);
      default:
        return (x, y, z) => (n <= 1 ? 0 : paintColorIndexForCoord(x, y, z, n) / Math.max(1, n - 1));
    }
  };

  const getTRaw = makeGetT();

  const applyDitherOrdered = (t: number, x: number, y: number): number =>
    orderedDitherT(t, x, y, state.dither.orderedSize, state.dither.orderedStrength);

  const wantFs =
    mode === 'dither' &&
    state.dither.errorDiffusion === 'floydSteinberg' &&
    opts?.positionsForErrorDiffusion &&
    opts.positionsForErrorDiffusion.length > 0;

  if (wantFs) {
    const positions = opts!.positionsForErrorDiffusion!;
    const getTForBatch = (x: number, y: number, z: number) => {
      let t = getTRaw(x, y, z);
      t = applyDitherOrdered(t, x, y);
      return t;
    };
    const fsMap =
      buildFloydSteinbergMap(positions, getTForBatch, colors, true) ??
      buildSequentialErrorDiffusionMap(positions, getTForBatch, colors, true);
    return (x, y, z) => {
      const t = fsMap.get(coordKey(x, y, z));
      if (t === undefined) {
        let t0 = getTRaw(x, y, z);
        t0 = applyDitherOrdered(t0, x, y);
        return voxelFromT(colors, t0, true, material);
      }
      return voxelFromT(colors, t, true, material);
    };
  }

  return (x, y, z) => {
    let t = getTRaw(x, y, z);
    if (mode === 'dither') {
      t = applyDitherOrdered(t, x, y);
      return voxelFromT(colors, t, true, material);
    }
    if (mode === 'fbmNoise') {
      return voxelFromT(colors, t, state.fbm.quantized, material);
    }
    if (mode === 'gradient') {
      return voxelFromT(colors, t, state.gradient.quantized, material);
    }
    if (mode === 'whiteNoise') {
      const idx = paintColorIndexForCoord(x, y, z, n);
      return { color: colors[idx]! & 0xffffff, material };
    }
    return voxelFromT(colors, t, true, material);
  };
}
