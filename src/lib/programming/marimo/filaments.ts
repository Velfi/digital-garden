/**
 * Strand placement for the fuzz.
 *
 * A Fibonacci sphere gives a near-uniform set of directions with no poles and
 * no seam, which is exactly what shell texturing struggles with here: shells
 * hash a UV grid, and `IcosahedronGeometry` inherits equirectangular UVs from
 * `PolyhedronGeometry`, so strands would pinch to nothing at both poles and
 * break along the seam. Placing one instance per direction sidesteps the whole
 * problem, and radiating filaments are what a marimo actually is.
 */

import { FILAMENT_DIR_JITTER } from './constants';
import { mulberry32 } from './rng';

export interface FilamentBuffers {
  count: number;
  /** vec3 per instance: the (jittered) outward direction. */
  direction: Float32Array;
  /** vec4 per instance: length jitter, curl phase, colour jitter, bend gain. */
  variation: Float32Array;
}

/** Near-uniform directions on the unit sphere. */
export function fibonacciDirections(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const z = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = goldenAngle * i;
    out[i * 3 + 0] = r * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(theta);
    out[i * 3 + 2] = z;
  }
  return out;
}

/**
 * Build the per-instance attributes.
 *
 * Directions are jittered off pure-radial, which is the difference between
 * velvet and a sea urchin — perfectly radial strands read as spines because
 * every silhouette strand points straight at the eye.
 */
export function buildFilaments(count: number, seed: number): FilamentBuffers {
  const direction = fibonacciDirections(count);
  const variation = new Float32Array(count * 4);
  const rand = mulberry32(seed >>> 0);

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    let x = direction[o];
    let y = direction[o + 1];
    let z = direction[o + 2];

    // Nudge each strand off the radial, then renormalise.
    x += (rand() * 2 - 1) * FILAMENT_DIR_JITTER;
    y += (rand() * 2 - 1) * FILAMENT_DIR_JITTER;
    z += (rand() * 2 - 1) * FILAMENT_DIR_JITTER;
    const len = Math.hypot(x, y, z) || 1;
    direction[o] = x / len;
    direction[o + 1] = y / len;
    direction[o + 2] = z / len;

    const v = i * 4;
    variation[v + 0] = 0.72 + rand() * 0.56; // length multiplier
    variation[v + 1] = rand() * Math.PI * 2; // curl phase
    variation[v + 2] = rand(); // colour jitter
    variation[v + 3] = 0.6 + rand() * 0.8; // how much it yields to the flow
  }

  return { count, direction, variation };
}

/**
 * The base sliver: a two-triangle tapered quad, billboarded about its own
 * radial axis in the vertex shader so it never turns edge-on and vanishes.
 *
 * `aSide` is -1/+1 across the strand, `aAlong` is 0 at the root and 1 at the tip.
 */
export function strandTemplate(): {
  side: Float32Array;
  along: Float32Array;
  index: Uint16Array;
} {
  return {
    side: new Float32Array([-1, 1, -1, 1]),
    along: new Float32Array([0, 0, 1, 1]),
    index: new Uint16Array([0, 1, 2, 2, 1, 3])
  };
}
