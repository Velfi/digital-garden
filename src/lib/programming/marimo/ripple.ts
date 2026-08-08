import * as THREE from 'three';
import {
  RIPPLE_CELL,
  RIPPLE_COLS,
  RIPPLE_ROWS,
  type RippleSimParams,
  DEFAULT_RIPPLE_SIM
} from './rippleSim';

/**
 * Reading the water surface.
 *
 * The surface itself is simulated in `rippleSim.ts` and lives in a texture. All
 * that happens here is the lookup: world position in, height and slope out, in
 * the shape the surface shader already wanted.
 *
 * This used to be a five-octave sum of sines evaluated per fragment, and the
 * whole of it — the octave stack, the crest sharpening, the counter-propagating
 * reflections, the spectral tuning — existed to make a closed-form expression
 * behave like water. It is all gone. What replaced it is four texture taps, and
 * the behaviour comes from the simulation having actually happened.
 *
 * The slope is a central difference rather than anything cleverer. The field is
 * a grid; the honest derivative of a grid is the difference between its
 * neighbours, and the target is sampled bilinearly so the result is continuous
 * across the water even where the water covers far more pixels than the grid has
 * cells.
 */

/** How the surface shader is handed the field. */
export interface RippleUniforms {
  uRippleTexture: { value: THREE.Texture | null };
  /** One cell, in uv. */
  uRippleTexel: { value: THREE.Vector2 };
  /** Metres across the whole grid, for the world-to-uv map. */
  uRippleSpan: { value: THREE.Vector2 };
  /** Metres of height per millimetre of field. */
  uRippleRelief: { value: number };
  /** Slope per millimetre of difference across two cells. */
  uRippleSlope: { value: number };
}

export const RIPPLE_GLSL = /* glsl */ `
uniform sampler2D uRippleTexture;
uniform vec2  uRippleTexel;
uniform vec2  uRippleSpan;
uniform float uRippleRelief;
uniform float uRippleSlope;

/** Where a point on the water sits in the simulation's grid. */
vec2 rippleUv(vec2 p) {
  return p / uRippleSpan + 0.5;
}

/**
 * The surface, as height and slope together.
 *
 *   .x   height offset from flat, metres
 *   .yz  d(height)/d(x, z)
 *
 * Four taps for the slope and one for the height. Clamped away from the very
 * edge so a fragment on the glass cannot difference against the wrap of the
 * texture — the simulation's wall is already a cell inside that.
 */
vec3 rippleField(vec2 p) {
  vec2 uv = clamp(rippleUv(p), uRippleTexel, 1.0 - uRippleTexel);

  float here = texture2D(uRippleTexture, uv).r;
  float left  = texture2D(uRippleTexture, uv - vec2(uRippleTexel.x, 0.0)).r;
  float right = texture2D(uRippleTexture, uv + vec2(uRippleTexel.x, 0.0)).r;
  float down  = texture2D(uRippleTexture, uv - vec2(0.0, uRippleTexel.y)).r;
  float up    = texture2D(uRippleTexture, uv + vec2(0.0, uRippleTexel.y)).r;

  return vec3(here * uRippleRelief, vec2(right - left, up - down) * uRippleSlope);
}

/** Upward surface normal. */
vec3 rippleNormal(vec2 p) {
  vec2 slope = rippleField(p).yz;
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}
`;

export function createRippleUniforms(
  params: RippleSimParams = DEFAULT_RIPPLE_SIM,
  cols = RIPPLE_COLS,
  rows = RIPPLE_ROWS,
  cell = RIPPLE_CELL
): RippleUniforms {
  const uniforms: RippleUniforms = {
    uRippleTexture: { value: null },
    uRippleTexel: { value: new THREE.Vector2(1 / cols, 1 / rows) },
    uRippleSpan: { value: new THREE.Vector2(cols * cell, rows * cell) },
    uRippleRelief: { value: 0 },
    uRippleSlope: { value: 0 }
  };
  writeRippleUniforms(uniforms, params, cell);
  return uniforms;
}

/** Push params into an existing uniform block. Allocates nothing. */
export function writeRippleUniforms(
  uniforms: RippleUniforms,
  params: RippleSimParams,
  cell = RIPPLE_CELL
): void {
  // The field is in millimetres; the scene is in metres.
  uniforms.uRippleRelief.value = params.reliefScale / 1000;
  // A central difference spans two cells, and both sides of the ratio are
  // millimetres, so the slope it gives back is already dimensionless.
  uniforms.uRippleSlope.value = params.reliefScale / (2 * cell * 1000);
}

/** Metres of height per millimetre of field — the number the bench displays. */
export function rippleReliefScale(params: RippleSimParams): number {
  return params.reliefScale / 1000;
}
