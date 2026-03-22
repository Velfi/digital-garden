/**
 * CPU mirror of WebGPU soft-shadow jitter in `gpuVoxelRayPipeline` (TSL).
 * Keep formulas in sync when changing the compute shader.
 */

export const MAX_SOFT_SHADOW_SAMPLES = 8;

export const DEFAULT_SHADOW_RAY_SAMPLES = 6;

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
