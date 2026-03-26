/**
 * CPU soft-shadow jitter for ray/shadow sampling.
 * Keep formulas in sync with any GPU-side equivalent if one exists.
 */

export const MAX_SOFT_SHADOW_SAMPLES = 8;

export const DEFAULT_SHADOW_RAY_SAMPLES = 8;

/** Cone half-angle toward the light (radians). */
export const DEFAULT_SHADOW_SOFTNESS_RADIANS = (4 * Math.PI) / 180;

export function clampShadowSamples(n: number): number {
  const r = Math.round(Number(n));
  if (!Number.isFinite(r)) return DEFAULT_SHADOW_RAY_SAMPLES;
  return Math.max(1, Math.min(MAX_SOFT_SHADOW_SAMPLES, r));
}

export function shadowConeTanFromRadians(rad: number): number {
  const r = Number(rad);
  if (!Number.isFinite(r) || r <= 0) return Math.tan(DEFAULT_SHADOW_SOFTNESS_RADIANS);
  const clamped = Math.min(r, (85 * Math.PI) / 180);
  return Math.tan(clamped);
}

/**
 * Two independent-ish [0,1) values for disk sampling (stable per pixel + sample index).
 */
function fract01(x: number): number {
  return x - Math.floor(x);
}

export function softShadowHash01(u: number, v: number, sampleIdx: number): [number, number] {
  const fu = u * 12.9898 + v * 78.233 + sampleIdx * 19.1;
  const fv = u * 93.9898 + v * 67.345 + sampleIdx * 13.7;
  const h0 = fract01(Math.sin(fu) * 43758.5453123);
  const h1 = fract01(Math.sin(fv) * 24634.6345123);
  return [h0, h1];
}

/** Uniform disk in unit circle: radius in [0,1), angle in [0, 2π). */
export function softShadowDiskPolar(
  u: number,
  v: number,
  sampleIdx: number
): { radius: number; angle: number } {
  const [h0, h1] = softShadowHash01(u, v, sampleIdx);
  return { radius: Math.sqrt(h0), angle: h1 * (Math.PI * 2) };
}

/** Vogel / golden-spiral disk sampling; shared by CPU tracer and GPU TSL shadow pass. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Quasi-uniform disk samples (Vogel / golden spiral). Same pattern for every pixel so soft
 * shadows do not show high-frequency stippling from independent per-pixel jitter.
 */
export function softShadowDiskStratified(
  sampleIdx: number,
  nSamples: number
): { radius: number; angle: number } {
  const n = Math.max(1, Math.floor(nSamples));
  if (n === 1) return { radius: 0, angle: 0 };
  const i = Math.min(Math.max(0, sampleIdx), n - 1);
  const r = Math.sqrt(i / (n - 0.5));
  const angle = (i * GOLDEN_ANGLE) % (2 * Math.PI);
  return { radius: r, angle };
}
