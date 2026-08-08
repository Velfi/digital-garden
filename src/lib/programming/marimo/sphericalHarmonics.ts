/**
 * The marimo's shape is a radial field over directions, stored as 16 real
 * spherical-harmonic coefficients (l <= 3) in the *body* frame:
 *
 *     r(n) = meanRadius * (1 + sum_k c[k] * Y_k(n))
 *
 * Keeping it in the body frame is what makes this cheap: the mesh's own
 * quaternion carries rotation, so no coefficient rotation is ever needed.
 * "Which side is down" is one quaternion conjugate.
 *
 * The GLSL below must stay byte-for-byte equivalent to the TypeScript above
 * it — same basis, same coefficient order. `sphericalHarmonics.test.ts` pins
 * the ordering with hand-computed values at the six axis directions so a
 * reordering can't slip through silently.
 */

import { SHAPE_DEVIATION_CLAMP } from './constants';

export const SH_COUNT = 16;

/** Band index l for each of the 16 coefficients, in storage order. */
export const SH_BAND: readonly number[] = [0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3];

/**
 * Per-band weights for a rotationally symmetric dent, before normalisation.
 *
 * Band 0 is deliberately zero. l=0 is the mean radius, so excluding it means a
 * dent redistributes volume — it bulges the far side instead of shrinking the
 * ball — which is what a flat-sided marimo actually looks like, and it leaves
 * `radiusMm` as the sole owner of volume.
 */
const RAW_DENT_KERNEL = [0, 0.9, 0.55, 0.22];

/**
 * Value of the raw kernel at the dent centre. By the SH addition theorem,
 * sum_m Y_lm(d) Y_lm(n) = (2l+1)/(4pi) * P_l(d.n), so at n == d each band
 * contributes A[l] * (2l+1)/(4pi).
 */
const DENT_KERNEL_PEAK = RAW_DENT_KERNEL.reduce(
  (sum, a, l) => sum + (a * (2 * l + 1)) / (4 * Math.PI),
  0
);

/** Normalised so a dent of amount `a` flattens exactly `a` at its centre. */
export const DENT_KERNEL: readonly number[] = RAW_DENT_KERNEL.map((a) => a / DENT_KERNEL_PEAK);

/**
 * Coefficient norm of a unit-amplitude dent — the same for every direction.
 *
 * By the addition theorem sum_m Y_lm(d)^2 = (2l+1)/(4pi) regardless of d, so
 * this is a constant, which is what lets `shapeMagnitude` stand in for peak
 * deviation when capping the bias. A cap on the norm is then rotation
 * invariant: no direction can sneak past it.
 */
export const DENT_UNIT_NORM = Math.sqrt(
  DENT_KERNEL.reduce((sum, a, l) => sum + a * a * ((2 * l + 1) / (4 * Math.PI)), 0)
);

// Real SH basis constants (Sloan, "Stupid Spherical Harmonics Tricks").
const K0 = 0.28209479177387814; // 1/2 sqrt(1/pi)
const K1 = 0.4886025119029199; // 1/2 sqrt(3/pi)
const K2a = 1.0925484305920792; // 1/2 sqrt(15/pi)
const K2b = 0.31539156525252005; // 1/4 sqrt(5/pi)
const K2c = 0.5462742152960396; // 1/4 sqrt(15/pi)
const K3a = 0.5900435899266435; // 1/4 sqrt(35/(2pi))
const K3b = 2.890611442640554; // 1/2 sqrt(105/pi)
const K3c = 0.4570457994644658; // 1/4 sqrt(21/(2pi))
const K3d = 0.3731763325901154; // 1/4 sqrt(7/pi)
const K3e = 1.445305721320277; // 1/4 sqrt(105/pi)

/**
 * Evaluate all 16 basis functions at a unit direction.
 * `out` is filled in place and returned; pass a scratch array to avoid garbage.
 */
export function shBasis(
  x: number,
  y: number,
  z: number,
  out: number[] | Float32Array = new Array(SH_COUNT)
): number[] | Float32Array {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;

  out[0] = K0;

  out[1] = K1 * y;
  out[2] = K1 * z;
  out[3] = K1 * x;

  out[4] = K2a * x * y;
  out[5] = K2a * y * z;
  out[6] = K2b * (3 * zz - 1);
  out[7] = K2a * x * z;
  out[8] = K2c * (xx - yy);

  out[9] = K3a * y * (3 * xx - yy);
  out[10] = K3b * x * y * z;
  out[11] = K3c * y * (5 * zz - 1);
  out[12] = K3d * z * (5 * zz - 3);
  out[13] = K3c * x * (5 * zz - 1);
  out[14] = K3e * z * (xx - yy);
  out[15] = K3a * x * (xx - 3 * yy);

  return out;
}

const basisScratch = new Array<number>(SH_COUNT);

/**
 * Radial deviation at a unit direction, as the coefficients ask for it —
 * before the clamp the shader applies.
 */
export function deviationAt(coeffs: readonly number[], x: number, y: number, z: number): number {
  const b = shBasis(x, y, z, basisScratch) as number[];
  let sum = 0;
  for (let k = 0; k < SH_COUNT; k++) sum += coeffs[k] * b[k];
  return sum;
}

/**
 * Radial scale at a unit direction: 1 at a perfect sphere, less where dented.
 * Clamped the same way the vertex shader clamps, so physics and rendering agree.
 */
export function radiusScaleAt(coeffs: readonly number[], x: number, y: number, z: number): number {
  return 1 + clampDeviation(deviationAt(coeffs, x, y, z));
}

/** Shared clamp, mirrored in GLSL. Keeps l<=3 ringing from ever inverting the ball. */
export function clampDeviation(d: number): number {
  if (d < -SHAPE_DEVIATION_CLAMP) return -SHAPE_DEVIATION_CLAMP;
  if (d > SHAPE_DEVIATION_CLAMP) return SHAPE_DEVIATION_CLAMP;
  return d;
}

/**
 * Coefficients for a dent of depth `amount` centred on unit direction (x,y,z).
 *
 * Because these are `kernel[l] * Y_k(d)`, the addition theorem guarantees the
 * result is exactly rotationally symmetric about d — the property the whole
 * resting-flat-spot model rests on.
 */
export function dentCoefficients(
  x: number,
  y: number,
  z: number,
  amount: number,
  out: number[] = new Array(SH_COUNT)
): number[] {
  return tiltedDentCoefficients(x, y, z, amount, FLAT_TILT, out);
}

/** Per-band weights that leave `dentCoefficients` exactly as it is. */
const FLAT_TILT: readonly number[] = [1, 1, 1, 1];

/**
 * A dent with its bands re-weighted: same rotational symmetry, different profile.
 *
 * Still `weight[l] * Y_k(d)` per band, so the addition theorem still applies and
 * the result is still exactly symmetric about d — only the radial falloff
 * changes. Which is what lets a caller trade the bands off against each other:
 * see `shapeRoughness` for why l=1 is worth spending less on.
 */
export function tiltedDentCoefficients(
  x: number,
  y: number,
  z: number,
  amount: number,
  tilt: readonly number[],
  out: number[] = new Array(SH_COUNT)
): number[] {
  const b = shBasis(x, y, z, basisScratch) as number[];
  for (let k = 0; k < SH_COUNT; k++) {
    const l = SH_BAND[k];
    out[k] = -amount * DENT_KERNEL[l] * tilt[l] * b[k];
  }
  return out;
}

/** A perfectly round marimo. */
export function zeroShape(): number[] {
  return new Array<number>(SH_COUNT).fill(0);
}

/** `out = a + b`, coefficient-wise. `out` may alias either input. */
export function addShapes(
  a: readonly number[],
  b: readonly number[],
  out: number[] = new Array(SH_COUNT)
): number[] {
  for (let k = 0; k < SH_COUNT; k++) out[k] = a[k] + b[k];
  return out;
}

/**
 * Scale `coeffs` in place so its norm is at most `maxAmplitude` dents' worth.
 *
 * Scaling rather than clamping per coefficient is what keeps the shape itself
 * intact — a per-coefficient clamp would deform the lobes it touches and break
 * the rotational symmetry the dent model depends on.
 */
export function capShape(coeffs: number[], maxAmplitude: number): number[] {
  const limit = maxAmplitude * DENT_UNIT_NORM;
  const magnitude = shapeMagnitude(coeffs);
  if (magnitude <= limit || magnitude === 0) return coeffs;
  const scale = limit / magnitude;
  for (let k = 0; k < SH_COUNT; k++) coeffs[k] *= scale;
  return coeffs;
}

/** Largest radial deviation anywhere on the ball, sampled analytically per band. */
export function shapeMagnitude(coeffs: readonly number[]): number {
  let sum = 0;
  for (let k = 0; k < SH_COUNT; k++) sum += coeffs[k] * coeffs[k];
  return Math.sqrt(sum);
}

/** Golden-angle increment, for the sphere sweeps below. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The direction where the shape deviates furthest from round, found by sampling.
 *
 * Sampled rather than solved because the extremum of a band-limited field has no
 * closed form past l=1, and a Fibonacci sphere gets within about a degree for a
 * couple of hundred dot products. `shapeMagnitude` is the cheap conservative
 * bound; this is the honest answer, for the handful of places that want to *say*
 * how lopsided something is rather than guarantee it is not too lopsided.
 */
export function extremeDirection(
  coeffs: readonly number[],
  samples = 192
): [number, number, number] {
  let best: [number, number, number] = [0, -1, 0];
  let bestMagnitude = -1;

  for (let i = 0; i < samples; i++) {
    const z = 1 - (2 * i + 1) / samples;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = GOLDEN_ANGLE * i;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    // Ranked unclamped: once the clamp has bitten, every direction past it ties,
    // and the argmax would fall to whichever was sampled first.
    const magnitude = Math.abs(deviationAt(coeffs, x, y, z));
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
      best = [x, y, z];
    }
  }

  return best;
}

/** How far from round the shape gets at its most extreme point, as drawn. */
export function peakDeviation(coeffs: readonly number[], samples = 192): number {
  const [x, y, z] = extremeDirection(coeffs, samples);
  return Math.abs(radiusScaleAt(coeffs, x, y, z) - 1);
}

/**
 * The same peak, before the clamp.
 *
 * What scaling a shape to a target roughness has to divide by: past the clamp
 * the drawn peak stops responding to the coefficients, so a factor derived from
 * `peakDeviation` would overshoot by however much was being clamped away.
 */
export function peakDeviationRaw(coeffs: readonly number[], samples = 192): number {
  const [x, y, z] = extremeDirection(coeffs, samples);
  return Math.abs(deviationAt(coeffs, x, y, z));
}

const roughnessScratch = new Array<number>(SH_COUNT);

/**
 * How lumpy the shape *looks*, as a fraction of mean radius.
 *
 * Bands 0 and 1 are dropped on purpose. l=0 is the mean radius, and an l=1 term
 * is, to first order, a translation: it slides the whole ball sideways inside
 * its own frame rather than deforming it, so it spends deviation budget without
 * changing the silhouette at all. What is left is the part someone looking at
 * the jar would call lumpiness — the right thing to grade a fragment by, and
 * the right thing to put in a label.
 *
 * Unclamped, like `peakDeviationRaw`: this is a question about part of a shape,
 * and the clamp only has an opinion about the whole of one.
 */
export function shapeRoughness(coeffs: readonly number[], samples = 384): number {
  for (let k = 0; k < SH_COUNT; k++) roughnessScratch[k] = SH_BAND[k] >= 2 ? coeffs[k] : 0;
  return peakDeviationRaw(roughnessScratch, samples);
}

/**
 * The GLSL twin of `shBasis` / `radiusScaleAt` / `clampDeviation`.
 *
 * KEEP IN SYNC with the TypeScript above. Coefficients arrive as four vec4s
 * so they fit the uniform layout without padding waste.
 */
export const SH_GLSL = /* glsl */ `
const float SH_CLAMP = ${SHAPE_DEVIATION_CLAMP.toFixed(6)};

float marimoClampDeviation(float d) {
  return clamp(d, -SH_CLAMP, SH_CLAMP);
}

float marimoRadiusScale(vec4 c0, vec4 c1, vec4 c2, vec4 c3, vec3 n) {
  float x = n.x, y = n.y, z = n.z;
  float xx = x * x, yy = y * y, zz = z * z;

  vec4 b0 = vec4(
    ${K0},
    ${K1} * y,
    ${K1} * z,
    ${K1} * x
  );
  vec4 b1 = vec4(
    ${K2a} * x * y,
    ${K2a} * y * z,
    ${K2b} * (3.0 * zz - 1.0),
    ${K2a} * x * z
  );
  vec4 b2 = vec4(
    ${K2c} * (xx - yy),
    ${K3a} * y * (3.0 * xx - yy),
    ${K3b} * x * y * z,
    ${K3c} * y * (5.0 * zz - 1.0)
  );
  vec4 b3 = vec4(
    ${K3d} * z * (5.0 * zz - 3.0),
    ${K3c} * x * (5.0 * zz - 1.0),
    ${K3e} * z * (xx - yy),
    ${K3a} * x * (xx - 3.0 * yy)
  );

  float d = dot(c0, b0) + dot(c1, b1) + dot(c2, b2) + dot(c3, b3);
  return 1.0 + marimoClampDeviation(d);
}
`;
