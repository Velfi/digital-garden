/**
 * Flat faces, as plane cuts on the radius field.
 *
 * The spherical-harmonic field in `sphericalHarmonics.ts` is band-limited to
 * l <= 3, which is a hard ceiling on what it can say: every shape it can draw is
 * a smooth low-order bulge. A flat spot is not that. A flat spot is a *plateau
 * with a rim* — a face where the radius stops falling off and simply stays put,
 * and an edge where it picks up again. No coefficient vector at l <= 3 has that
 * in it, so a marimo that had been sitting still for a month came out with a
 * shallow bowl on the underside instead of a flat.
 *
 * So flatness is modelled as what it physically is: the ball resting against
 * something until the contact patch is planar. A facet is a plane at
 * `1 - depth` of the mean radius, and the surface is the smooth minimum of the
 * sphere and the plane. The blend radius is what gives the rim its softness —
 * a real marimo's flat side rolls off into the curve rather than meeting it at
 * an edge, because the coat is 3 mm deep and forgives everything.
 *
 * Two facts make this cheap. A plane cut is exact at any angle rather than
 * band-limited, so one facet costs four floats and no basis. And the smooth
 * minimum used here is *exact* outside its blend band, so a facet on the far
 * side of the ball has no effect whatsoever on this side — which is what lets
 * the physics, the shader and the 2D preview all evaluate the same short
 * function and agree to the last decimal.
 *
 * The GLSL at the bottom must stay byte-for-byte equivalent to the TypeScript
 * above it. `facets.test.ts` pins the shared behaviour.
 */

import { FACET_RIM } from './constants';
import { radiusScaleAt } from './sphericalHarmonics';

/** A flattened face on the ball. */
export interface Facet {
  /** Body-frame unit normal: the direction the face points. */
  d: [number, number, number];
  /**
   * How far the face is cut in, as a fraction of mean radius.
   *
   * Exactly what it says at the face centre: `depth` of 0.1 means the surface
   * sits at 0.9 of the mean radius there. Same units and same meaning as the
   * transient `dent`, so one can be handed to the other without conversion.
   */
  depth: number;
}

/**
 * Everything the surface is: the smooth field, plus its flat faces.
 *
 * `facets` is a fixed-capacity pool and `facetCount` says how much of it is
 * live, so the shape can be rebuilt every frame from the persisted state
 * without allocating. Entries past the count are stale and must be ignored.
 */
export interface MarimoShape {
  /** SH coefficients, body frame. */
  coeffs: number[];
  facets: Facet[];
  facetCount: number;
}

/** Below this the facet is edge-on and cuts nothing; also avoids dividing by ~0. */
const MIN_DOT = 1e-3;

export function newFacet(): Facet {
  return { d: [0, -1, 0], depth: 0 };
}

/** An empty shape with room for `capacity` facets. */
export function newShape(coeffs: number[], capacity: number): MarimoShape {
  return {
    coeffs,
    facets: Array.from({ length: capacity }, newFacet),
    facetCount: 0
  };
}

/** A shape read straight off a fragment or a stored marimo, for one-off use. */
export function shapeFrom(coeffs: number[], facets: readonly Facet[] = []): MarimoShape {
  return {
    coeffs,
    // Copied, not shared: a preview keeps its shape around while the tank walks
    // the real one forward.
    facets: facets.map((facet) => ({ depth: facet.depth, d: [...facet.d] as Facet['d'] })),
    facetCount: facets.length
  };
}

/**
 * The smooth minimum: `min(a, b)` with the corner rounded off over `k`.
 *
 * Exact when the two are further apart than `k` — the `h` term saturates and
 * the correction vanishes — which is the property the whole scheme leans on.
 * A `min` that quietly shaved a little off everywhere would shrink the ball by
 * `k/4` per facet and put the render out of step with the physics.
 */
export function smoothMin(a: number, b: number, k: number): number {
  if (!(k > 0)) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/** Radius scale along a unit direction, in the body frame: sphere, then cuts. */
export function surfaceScale(shape: MarimoShape, x: number, y: number, z: number): number {
  let scale = radiusScaleAt(shape.coeffs, x, y, z);

  for (let i = 0; i < shape.facetCount; i++) {
    const facet = shape.facets[i];
    if (!(facet.depth > 0)) continue;
    const towards = facet.d[0] * x + facet.d[1] * y + facet.d[2] * z;
    if (towards <= MIN_DOT) continue;
    // The rim can never be wider than the cut is deep, or the blend would still
    // be rounding at the middle of the face and `depth` would stop meaning the
    // depth. A shallow flat gets a correspondingly tight rim, which is also what
    // a shallow flat looks like.
    const rim = Math.min(FACET_RIM, facet.depth);
    scale = smoothMin(scale, (1 - facet.depth) / towards, rim);
  }

  return scale;
}

/** The deepest live facet, or null. What the ball will try to lie down on. */
export function deepestFacet(shape: MarimoShape): Facet | null {
  let best: Facet | null = null;
  for (let i = 0; i < shape.facetCount; i++) {
    const facet = shape.facets[i];
    if (facet.depth > 0 && (!best || facet.depth > best.depth)) best = facet;
  }
  return best;
}

/** Copy `from` into the pool slot `index`, growing the live count to cover it. */
export function writeFacet(
  shape: MarimoShape,
  index: number,
  d: readonly number[],
  depth: number
): void {
  const facet = shape.facets[index];
  facet.d[0] = d[0];
  facet.d[1] = d[1];
  facet.d[2] = d[2];
  facet.depth = depth;
  if (index >= shape.facetCount) shape.facetCount = index + 1;
}

/**
 * The GLSL twin of `smoothMin` / `surfaceScale`.
 *
 * KEEP IN SYNC with the TypeScript above. Facets arrive as an array of vec4 —
 * xyz is the axis, w is the depth — with `uFacetCount` live entries. The loop
 * bound is a compile-time constant because GLSL ES 1.00 requires it.
 */
export function facetGlsl(maxFacets: number): string {
  return /* glsl */ `
const int MARIMO_MAX_FACETS = ${maxFacets};
const float MARIMO_FACET_RIM = ${FACET_RIM.toFixed(6)};
const float MARIMO_FACET_MIN_DOT = ${MIN_DOT.toFixed(6)};

uniform vec4 uFacets[MARIMO_MAX_FACETS];
uniform int uFacetCount;

float marimoSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float marimoFacetCut(float scale, vec3 n) {
  for (int i = 0; i < MARIMO_MAX_FACETS; i++) {
    if (i >= uFacetCount) break;
    vec4 facet = uFacets[i];
    float towards = dot(facet.xyz, n);
    if (facet.w <= 0.0 || towards <= MARIMO_FACET_MIN_DOT) continue;
    float rim = min(MARIMO_FACET_RIM, facet.w);
    scale = marimoSmoothMin(scale, (1.0 - facet.w) / towards, rim);
  }
  return scale;
}
`;
}
