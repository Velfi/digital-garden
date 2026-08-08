/**
 * Bulk water motion. You stir it, it spins, it settles.
 *
 * Two decaying modes. A rigid-core vortex about the tank's vertical axis,
 * falling to zero at the walls, and an overturning cell — water rising up the
 * middle and sinking down the outside, or the reverse.
 *
 * The cell is deliberately divergence-free and bounded by the floor and the
 * surface. A jar is closed, so there is no such thing as bulk vertical flow in
 * it: whatever goes up the core has to come back down somewhere, and nothing
 * moves vertically at all right against the glass bottom or right under the
 * surface. Modelling the vertical drag as a uniform lift instead used to fire
 * the marimo straight into the surface and pin it there, because the ball is
 * near neutral buoyancy and simply goes wherever the water goes.
 */

import {
  FLOOR_Y,
  SWIRL_MAX_OMEGA,
  SWIRL_MAX_VY,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_DRIFT_TAU,
  WATER_SPIN_TAU,
  WATER_Y
} from './constants';
import { clamp } from './careSim';
import type { SwirlState } from './types';

export function newSwirl(): SwirlState {
  return { omegaY: 0, vy: 0 };
}

export function stepSwirl(swirl: SwirlState, dt: number): void {
  swirl.omegaY *= Math.exp(-dt / WATER_SPIN_TAU);
  swirl.vy *= Math.exp(-dt / WATER_DRIFT_TAU);
}

/** Add a stir impulse, clamped so a frantic drag can't launch the ball. */
export function stirSwirl(swirl: SwirlState, dOmegaY: number, dVy: number): void {
  swirl.omegaY = clamp(swirl.omegaY + dOmegaY, -SWIRL_MAX_OMEGA, SWIRL_MAX_OMEGA);
  swirl.vy = clamp(swirl.vy + dVy, -SWIRL_MAX_VY, SWIRL_MAX_VY);
}

const TANK_RADIUS = Math.min(TANK_HALF_X, TANK_HALF_Z);
const COLUMN_HEIGHT = WATER_Y - FLOOR_Y;

/**
 * Radial shape of the cell's vertical flow: up in the core, down outside
 * r = R/√2. The coefficients are the ones that make the net flux through any
 * horizontal slice exactly zero — ∫₀¹ (1 - 2t²) 2t dt = 0 — which is what
 * "the jar is closed" means in one line.
 */
function cellVertical(t: number): number {
  return 1 - 2 * t * t;
}

/**
 * Vertical envelope. Zero on the gravel and zero at the surface, peaking at
 * mid-depth. This is the term that keeps a hard upward drag from carrying the
 * ball the whole way up: the closer it gets to the surface, the less the water
 * there is doing.
 */
function cellEnvelope(y: number): number {
  const yn = clamp((y - FLOOR_Y) / COLUMN_HEIGHT, 0, 1);
  return Math.sin(Math.PI * yn);
}

/** d/dy of the envelope, for the radial branch of the cell. */
function cellEnvelopeSlope(y: number): number {
  const yn = clamp((y - FLOOR_Y) / COLUMN_HEIGHT, 0, 1);
  return (Math.PI / COLUMN_HEIGHT) * Math.cos(Math.PI * yn);
}

/**
 * Water velocity at a point, written into `out`.
 *
 * The swirl's `1 - (r/R)^2` profile gives a rigid core that goes to zero at the
 * walls, which both looks right and keeps the ball from being flung into the
 * glass. The cell adds the vertical and radial parts, which together satisfy
 * continuity exactly: water pushed up the core spreads outwards near the
 * surface, sinks at the rim, and returns along the floor.
 */
export function waterVelocityAt(
  swirl: SwirlState,
  x: number,
  y: number,
  z: number,
  out: [number, number, number]
): [number, number, number] {
  const r = Math.hypot(x, z);
  const t = Math.min(1, r / TANK_RADIUS);
  const profile = 1 - t * t;

  // omega about +Y crossed with the radial offset.
  out[0] = -swirl.omegaY * z * profile;
  out[1] = swirl.vy * cellVertical(t) * cellEnvelope(y);
  out[2] = swirl.omegaY * x * profile;

  // Radial return flow. Solving (1/r) d(r·vr)/dr = -dvy/dy for the profile
  // above gives vr = -vy·(r/2)(1 - t²)·envelope', zero on the axis and zero at
  // the wall, so the cell closes on itself instead of leaking through the glass.
  if (r > 1e-6) {
    const vr = -swirl.vy * 0.5 * r * (1 - t * t) * cellEnvelopeSlope(y);
    out[0] += (vr * x) / r;
    out[2] += (vr * z) / r;
  }
  return out;
}

/** Angular velocity the water imposes on a free-floating body. */
export function waterSpinAt(swirl: SwirlState, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const t = Math.min(1, r / TANK_RADIUS);
  return swirl.omegaY * (1 - t * t);
}
