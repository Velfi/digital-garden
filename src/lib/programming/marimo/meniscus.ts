import * as THREE from 'three';
import { GRAVITY, RHO_WATER } from './constants';

/**
 * The meniscus: where the water climbs the glass.
 *
 * This is the one part of the water surface that is genuinely *static*. The
 * ripples move, the light moves, the camera moves — the fillet does not. It is
 * the solution of a boundary value problem set by the jar and the liquid, and
 * once the jar is filled it simply sits there. So it is solved once, on the CPU,
 * and baked into the surface mesh: the shader never evaluates it at all.
 *
 * ## The shape
 *
 * A liquid surface pinned to a vertical wall balances hydrostatic pressure
 * against surface tension. For a two-dimensional profile `z(d)`, `d` measured
 * out from the wall,
 *
 *     rho * g * z = sigma * z'' / (1 + z'^2)^(3/2)
 *
 * Multiplying by `z'` and integrating, with `z -> 0` and `z' -> 0` far from the
 * wall, gives a first integral with no free constants left in it:
 *
 *     z^2 / (2 * lambda^2) = 1 - cos(psi),      lambda^2 = sigma / (rho * g)
 *
 * where `psi` is the angle the surface makes with the horizontal, so
 * `tan(psi) = -z'`. That collapses to `z = 2 * lambda * sin(psi / 2)`: the
 * height at any point on the meniscus is fixed by its slope there, and nothing
 * else. `lambda` — the capillary length, 2.7 mm for water — is the only length
 * in the problem, which is why the fillet is the same size in a jam jar as in a
 * swimming pool.
 *
 * Taking `psi` as the parameter rather than `d` makes the whole profile
 * elementary. Integrating `dd = -dz / tan(psi)` gives
 *
 *     d(psi) = lambda * [ (ln tan(psi/4) + 2 cos(psi/2))_wall - (same at psi) ]
 *
 * so `d`, `z` and `z'` all come straight from `psi` with no inversion, no
 * iteration, and no table. `z(d)` — which is what a shader would want — has no
 * closed form, and that asymmetry is exactly why this lives in the mesh: the
 * vertices are placed *along* the curve, at parameter values we choose, instead
 * of being asked where the curve is at parameter values the grid chose.
 *
 * ## What the jar gets
 *
 * The wall boundary condition is the contact angle. At the wall the surface
 * meets the glass at `theta`, so `psi = 90 - theta` and the contact line sits at
 *
 *     h0 = 2 * lambda * sin(45 - theta/2) = lambda * sqrt(2 * (1 - sin theta))
 *
 * — 3.1 mm for water on glass. Against a 24 mm marimo that is not a detail.
 */

/** Surface tension of water against air at 20 C, N/m. */
export const SURFACE_TENSION = 0.0728;

/**
 * The capillary length, metres. The only length scale in the problem: the
 * fillet's height and the distance it reaches out from the wall are both a
 * couple of multiples of this, and neither depends on the size of the jar.
 */
export const CAPILLARY_LENGTH = Math.sqrt(SURFACE_TENSION / (RHO_WATER * GRAVITY));

/**
 * Contact angle of water on the inside of the jar, degrees.
 *
 * Scrupulously clean glass is near zero, which would stand the surface
 * perfectly vertical where it meets the wall — an infinite slope, and a normal
 * that swings through a right angle inside one vertex. A jar that has had a
 * marimo in it for a month is not scrupulously clean, and 20 degrees is both
 * the honest number for glass with a little organic film on it and the one that
 * keeps the contact line finite.
 */
export const CONTACT_ANGLE_DEG = 20;

/** Angle the surface makes with the horizontal where it meets the glass. */
function wallAngle(contactAngleDeg: number): number {
  return Math.PI / 2 - (contactAngleDeg * Math.PI) / 180;
}

/**
 * The antiderivative that turns the parameter into a distance.
 *
 * `d(psi) = lambda * (F(psi_wall) - F(psi))`. It diverges to minus infinity as
 * `psi -> 0`, which is the statement that the meniscus never quite ends — it
 * decays exponentially with a scale of exactly one capillary length.
 */
function distanceIntegral(psi: number): number {
  return Math.log(Math.tan(psi / 4)) + 2 * Math.cos(psi / 2);
}

export interface MeniscusPoint {
  /** Distance out from the wall, metres. */
  distance: number;
  /** Height above the flat waterline, metres. */
  height: number;
  /** `|dz/dd|` — the surface falls away from the wall, so the true slope is minus this. */
  slope: number;
}

/**
 * A point on the profile, from the surface angle there.
 *
 * `psi` runs from `wallAngle` at the contact line down towards zero out in the
 * flat. Everything is closed form; there is nothing to converge.
 */
export function meniscusPoint(psi: number, contactAngleDeg = CONTACT_ANGLE_DEG): MeniscusPoint {
  const wall = wallAngle(contactAngleDeg);
  const clamped = Math.max(1e-9, Math.min(wall, psi));
  return {
    distance: CAPILLARY_LENGTH * (distanceIntegral(wall) - distanceIntegral(clamped)),
    height: 2 * CAPILLARY_LENGTH * Math.sin(clamped / 2),
    slope: Math.tan(clamped)
  };
}

/** Height of the contact line above the flat waterline, metres. */
export function meniscusRise(contactAngleDeg = CONTACT_ANGLE_DEG): number {
  return meniscusPoint(wallAngle(contactAngleDeg), contactAngleDeg).height;
}

/**
 * Where the fillet is treated as over.
 *
 * A fiftieth of the rise: sixty microns of climb, on a surface tilted by a bit
 * over a degree. That is under a pixel of height and well below the tilt the
 * ripples are putting on the same water, so nothing past here is doing any work
 * — and cutting it there rather than chasing the tail to nothing is what leaves
 * the budget to resolve the steep end properly.
 */
const RIM_END_FRACTION = 0.02;

/**
 * How many vertices the fillet gets, per wall.
 *
 * The whole point of solving on the CPU is that the shading normal is carried
 * on the vertices, so this is the resolution of the meniscus itself rather than
 * just of its silhouette. Twenty puts the closest pair about a third of a
 * millimetre apart at the glass and half a millimetre apart at the far end of
 * the fillet.
 */
const RIM_STEPS = 20;

/**
 * Vertex placements across the fillet, from the wall outwards.
 *
 * Spaced evenly in `log(height)` rather than in distance. Height falls off as
 * `exp(-d / lambda)` out in the tail, so even steps in its logarithm are even
 * steps in distance there; up at the wall, where the surface is steep, the same
 * rule pulls the samples in tight against the glass. One rule, and it resolves
 * both ends of a curve whose scale changes by two orders of magnitude.
 */
export function rimProfile(
  steps = RIM_STEPS,
  contactAngleDeg = CONTACT_ANGLE_DEG
): MeniscusPoint[] {
  const wall = wallAngle(contactAngleDeg);
  const rise = meniscusRise(contactAngleDeg);
  const points: MeniscusPoint[] = [];

  for (let i = 0; i < steps; i++) {
    if (i === 0) {
      points.push(meniscusPoint(wall, contactAngleDeg));
      continue;
    }
    const height = rise * Math.pow(RIM_END_FRACTION, i / (steps - 1));
    // Invert z = 2 lambda sin(psi/2), which is the one step that is exactly
    // invertible — the distance follows from psi, never the other way round.
    const psi = 2 * Math.asin(Math.min(1, height / (2 * CAPILLARY_LENGTH)));
    points.push(meniscusPoint(psi, contactAngleDeg));
  }

  return points;
}

/** How far the fillet reaches out from the glass before the mesh goes flat again. */
export function rimWidth(steps = RIM_STEPS, contactAngleDeg = CONTACT_ANGLE_DEG): number {
  const profile = rimProfile(steps, contactAngleDeg);
  return profile[profile.length - 1].distance;
}

/**
 * The far field, past where the fillet's own vertices stop.
 *
 * Out here the surface is shallow enough that `(1 + z'^2)^(3/2)` is one and the
 * equation has linearised to `z'' = z / lambda^2`, whose decaying solution is a
 * plain exponential — which is the same thing as saying the meniscus has a tail
 * rather than an edge. Continuing it costs an `exp` and buys a mesh with no seam
 * in it: truncating instead would leave the last rim vertex sixty microns in the
 * air with a flat grid starting beside it, and a step is a step however small.
 *
 * It is matched to the profile at the handover, in height and in slope at once,
 * which is free rather than fitted: down here `|z'|` and `z / lambda` agree to
 * two parts in ten thousand.
 */
export function meniscusTail(distance: number, edge: MeniscusPoint): MeniscusPoint {
  const height = edge.height * Math.exp((edge.distance - distance) / CAPILLARY_LENGTH);
  return { distance, height, slope: height / CAPILLARY_LENGTH };
}

export interface MeniscusAxis {
  /** Vertex coordinates along one axis, ascending from `-half` to `+half`. */
  positions: number[];
  /** Meniscus height contributed by this axis' two walls, metres. */
  heights: number[];
  /** `d(height)/d(coordinate)` — signed, and vanishing towards the middle. */
  slopes: number[];
}

/**
 * One axis of the surface grid: a fillet at each end and a plain grid between.
 *
 * Built per axis rather than per vertex because the jar is a box, so the height
 * is separable — a point's climb is what the two `x` walls give it plus what the
 * two `z` walls give it. Superposing the walls that way is exactly right where
 * the surface is shallow, and in the corners, where it is not, it overstates the
 * rise. That is the correct direction to be wrong in: a square corner really
 * does draw the water up higher than a flat wall does, far enough that the
 * proper treatment has no bounded solution at all for a contact angle this low.
 * The sum tops out at twice the wall rise, which is about what a real corner
 * looks like before you go hunting for the spike with a magnifying glass.
 */
export function meniscusAxis(
  half: number,
  interiorStep: number,
  steps = RIM_STEPS,
  contactAngleDeg = CONTACT_ANGLE_DEG
): MeniscusAxis {
  const profile = rimProfile(steps, contactAngleDeg);
  const edge = profile[profile.length - 1];
  const rim = edge.distance;

  const positions: number[] = [];
  const heights: number[] = [];
  const slopes: number[] = [];

  /**
   * Both walls, at one coordinate. `near` is the profile point if this vertex
   * was placed on the fillet, and the far wall is always in its tail.
   *
   * Height adds and slope subtracts, which is only the geometry: climbing
   * towards the wall on the left means falling as the coordinate rises, and
   * climbing towards the one on the right means the opposite.
   */
  function place(position: number, near?: MeniscusPoint) {
    const left = near ?? meniscusTail(position + half, edge);
    const right = meniscusTail(half - position, edge);
    positions.push(position);
    heights.push(left.height + right.height);
    slopes.push(right.slope - left.slope);
  }

  // The near wall's fillet, from the glass inwards.
  for (const point of profile) {
    place(-half + point.distance, point);
  }

  // The middle. Flat to any eye, but carried by the same tail the fillet ends
  // on rather than clamped to zero, so the mesh has no seam where the two meet.
  // A jar narrower than two fillets is not a jar with a meniscus in it, it is a
  // capillary tube, so there may be nothing to do here at all.
  const span = 2 * (half - rim);
  if (span > 0) {
    const cells = Math.max(1, Math.round(span / interiorStep));
    for (let i = 1; i < cells; i++) {
      place(-half + rim + (span * i) / cells);
    }
  }

  // The far wall's fillet, mirrored.
  for (let i = profile.length - 1; i >= 0; i--) {
    const point = profile[i];
    positions.push(half - point.distance);
    heights.push(heights[i]);
    slopes.push(-slopes[i]);
  }

  return { positions, heights, slopes };
}

/**
 * The water surface mesh, with the meniscus built into it.
 *
 * Positions carry the height and a `aMeniscusSlope` attribute carries the
 * gradient, so the shader gets the fillet's shape *and* its normal for the price
 * of a varying. Vertices are laid out on the profile rather than on a regular
 * grid, which is what lets a mesh only twice the size of a plain plane resolve a
 * three-millimetre curve inside a hundred-millimetre jar.
 */
export function createSurfaceGeometry(
  halfX: number,
  halfZ: number,
  interiorStep: number,
  contactAngleDeg = CONTACT_ANGLE_DEG
): THREE.BufferGeometry {
  const xs = meniscusAxis(halfX, interiorStep, RIM_STEPS, contactAngleDeg);
  const zs = meniscusAxis(halfZ, interiorStep, RIM_STEPS, contactAngleDeg);
  const nx = xs.positions.length;
  const nz = zs.positions.length;

  const positions = new Float32Array(nx * nz * 3);
  const slopes = new Float32Array(nx * nz * 2);

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      positions[v * 3] = xs.positions[i];
      positions[v * 3 + 1] = xs.heights[i] + zs.heights[j];
      positions[v * 3 + 2] = zs.positions[j];
      slopes[v * 2] = xs.slopes[i];
      slopes[v * 2 + 1] = zs.slopes[j];
    }
  }

  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + nx;
      const c = b + 1;
      const d = a + 1;
      // Wound so the face normal is up, matching the +Y the shader assumes.
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aMeniscusSlope', new THREE.BufferAttribute(slopes, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
