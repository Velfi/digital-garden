/**
 * Pure helpers for multi-color paint: palette mapping, Bayer ordered dither,
 * Floyd–Steinberg on axis-aligned full rectangles, sequential 1D fallback.
 */
import { coordKey } from '../coordUtils';
import { hash3 } from './valueNoise3d';

/** Deterministic palette index for a voxel coordinate (spatial white noise). */
export function paintColorIndexForCoord(x: number, y: number, z: number, paletteSize: number): number {
  if (paletteSize <= 1) return 0;
  const xi = Math.floor(x) | 0;
  const yi = Math.floor(y) | 0;
  const zi = Math.floor(z) | 0;
  let h =
    Math.imul(xi, 0x9e3779b1) ^ Math.imul(yi, 0x85ebca6b) ^ Math.imul(zi, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) % paletteSize;
}

export function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Interpolate RGB along ordered palette; t in [0,1], endpoints map to first/last color. */
export function lerpPaletteRgb(colors: number[], t: number): number {
  const n = colors.length;
  if (n === 0) return 0;
  if (n === 1) return colors[0]! & 0xffffff;
  const u = clamp01(t) * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(u));
  const f = u - i0;
  const a = colors[i0]! & 0xffffff;
  const b = colors[i0 + 1]! & 0xffffff;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

/** Quantized: index = floor(t * n) clamped to n-1 when n > 1. */
export function quantizePaletteIndex(colors: number[], t: number): number {
  const n = colors.length;
  if (n <= 1) return 0;
  const u = clamp01(t);
  return Math.min(n - 1, Math.floor(u * n));
}

export function voxelFromT(
  colors: number[],
  t: number,
  quantized: boolean,
  material: import('../voxelMaterial').VoxelMaterialId
): import('../voxelMaterial').Voxel {
  const c = quantized
    ? colors[quantizePaletteIndex(colors, t)]! & 0xffffff
    : lerpPaletteRgb(colors, t);
  return { color: c, material };
}

const BAYER_2: readonly number[] = [0, 2, 3, 1];
const BAYER_4: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5
];
const BAYER_8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
];

export function bayerThreshold(size: 2 | 4 | 8, x: number, y: number): number {
  const xi = Math.abs(Math.floor(x)) % size;
  const yi = Math.abs(Math.floor(y)) % size;
  const idx = yi * size + xi;
  if (size === 2) return BAYER_2[idx]! / 4;
  if (size === 4) return BAYER_4[idx]! / 16;
  return BAYER_8[idx]! / 64;
}

/** Adjust continuous t with ordered dither before quantization / lerp. */
export function orderedDitherT(
  t: number,
  x: number,
  y: number,
  size: 2 | 4 | 8,
  strength: number
): number {
  const th = bayerThreshold(size, x, y);
  const delta = (th - 0.5) * 2 * strength;
  return clamp01(t + delta);
}

type PlaneKind = 'xy' | 'xz' | 'yz';

function detectFullRectanglePlane(
  positions: [number, number, number][]
): { kind: PlaneKind; fixed: number; uMin: number; uMax: number; vMin: number; vMax: number } | null {
  if (positions.length === 0) return null;
  const eps = 1e-6;
  const first = positions[0]!;
  let allSameX = true;
  let allSameY = true;
  let allSameZ = true;
  for (const p of positions) {
    if (Math.abs(p[0] - first[0]) > eps) allSameX = false;
    if (Math.abs(p[1] - first[1]) > eps) allSameY = false;
    if (Math.abs(p[2] - first[2]) > eps) allSameZ = false;
  }
  let kind: PlaneKind | null = null;
  let uIdx: 0 | 1 = 0;
  let vIdx: 1 | 2 = 1;
  let fixed = 0;
  if (allSameZ) {
    kind = 'xy';
    fixed = first[2];
    uIdx = 0;
    vIdx = 1;
  } else if (allSameY) {
    kind = 'xz';
    fixed = first[1];
    uIdx = 0;
    vIdx = 2;
  } else if (allSameX) {
    kind = 'yz';
    fixed = first[0];
    uIdx = 1;
    vIdx = 2;
  } else {
    return null;
  }

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of positions) {
    const u = p[uIdx];
    const v = p[vIdx];
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const w = Math.round(uMax - uMin) + 1;
  const h = Math.round(vMax - vMin) + 1;
  if (w <= 0 || h <= 0 || w * h !== positions.length) return null;

  const set = new Set<string>();
  for (const p of positions) {
    const u = Math.round(p[uIdx] - uMin);
    const v = Math.round(p[vIdx] - vMin);
    set.add(`${u},${v}`);
  }
  if (set.size !== w * h) return null;

  return { kind, fixed, uMin, uMax, vMin, vMax };
}

/**
 * Floyd–Steinberg error diffusion on a full w×h grid of t values in [0,1].
 * Mutates `grid` in place; returns the same reference.
 */
export function floydSteinberg2DInPlace(grid: number[][], quantized: boolean, colors: number[]): void {
  const h = grid.length;
  if (h === 0) return;
  const w = grid[0]!.length;

  const n = colors.length;
  const quantizeT = (t: number): number => {
    if (quantized) {
      const idx = quantizePaletteIndex(colors, t);
      return n <= 1 ? 0 : idx / Math.max(1, n - 1);
    }
    return Math.round(clamp01(t) * 255) / 255;
  };

  for (let y = 0; y < h; y++) {
    const row = grid[y]!;
    for (let x = 0; x < w; x++) {
      const oldT = row[x]!;
      const newT = quantizeT(oldT);
      const err = oldT - newT;
      row[x] = newT;
      const e7 = (err * 7) / 16;
      const e3 = (err * 3) / 16;
      const e5 = (err * 5) / 16;
      const e1 = err / 16;
      if (x + 1 < w) row[x + 1]! += e7;
      if (y + 1 < h) {
        const below = grid[y + 1]!;
        if (x > 0) below[x - 1]! += e3;
        below[x]! += e5;
        if (x + 1 < w) below[x + 1]! += e1;
      }
    }
  }
}

export type TAtPosition = (x: number, y: number, z: number) => number;

/**
 * When positions form a full axis-aligned rectangle in one plane, run 2D Floyd–Steinberg.
 * Otherwise returns null (caller: fall back to per-voxel ordered dither or plain t).
 */
export function buildFloydSteinbergMap(
  positions: [number, number, number][],
  getT: TAtPosition,
  colors: number[],
  quantized: boolean
): Map<string, number> | null {
  const plane = detectFullRectanglePlane(positions);
  if (!plane) return null;
  const { kind, fixed, uMin, uMax, vMin, vMax } = plane;
  const w = Math.round(uMax - uMin) + 1;
  const h = Math.round(vMax - vMin) + 1;
  const grid: number[][] = [];
  for (let j = 0; j < h; j++) {
    const row: number[] = [];
    for (let i = 0; i < w; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (kind === 'xy') {
        x = uMin + i;
        y = vMin + j;
        z = fixed;
      } else if (kind === 'xz') {
        x = uMin + i;
        y = fixed;
        z = vMin + j;
      } else {
        x = fixed;
        y = uMin + i;
        z = vMin + j;
      }
      row.push(clamp01(getT(x, y, z)));
    }
    grid.push(row);
  }
  floydSteinberg2DInPlace(grid, quantized, colors);
  const out = new Map<string, number>();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (kind === 'xy') {
        x = uMin + i;
        y = vMin + j;
        z = fixed;
      } else if (kind === 'xz') {
        x = uMin + i;
        y = fixed;
        z = vMin + j;
      } else {
        x = fixed;
        y = uMin + i;
        z = vMin + j;
      }
      out.set(coordKey(x, y, z), grid[j]![i]!);
    }
  }
  return out;
}

/** Sequential error diffusion: push error forward along z,y,x sorted order (1D, approximate). */
export function buildSequentialErrorDiffusionMap(
  positions: [number, number, number][],
  getT: TAtPosition,
  colors: number[],
  quantized: boolean
): Map<string, number> {
  const sorted = [...positions].sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const out = new Map<string, number>();
  let carry = 0;
  const n = colors.length;
  for (const p of sorted) {
    const [x, y, z] = p;
    let t = clamp01(getT(x, y, z) + carry);
    const target = quantized
      ? (() => {
          const idx = quantizePaletteIndex(colors, t);
          return n <= 1 ? 0 : idx / Math.max(1, n - 1);
        })()
      : t;
    const err = t - target;
    carry = err * 0.5;
    out.set(coordKey(x, y, z), target);
  }
  return out;
}

export function hashTForCoord(seed: number, x: number, y: number, z: number): number {
  return hash3(seed, x, y, z);
}
