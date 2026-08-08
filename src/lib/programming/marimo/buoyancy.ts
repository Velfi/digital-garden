/**
 * The motion clock: how the ball moves through the water.
 *
 * Gravity and buoyancy combined, quadratic drag against the local water
 * velocity, and added mass — which matters a great deal here, because a marimo
 * spends most of its time near neutral buoyancy where the added mass of the
 * water it has to shove aside is comparable to its own.
 *
 * Rotation skips a full inertia tensor and just relaxes toward a target, which
 * is unconditionally stable at any timestep and one line. When the ball is on
 * the gravel the target is the rolling-without-slipping solution, so shoving it
 * around makes it roll — and rolling is what re-rounds a marimo.
 *
 * The gravel contact is Coulomb rather than viscous, in both the sliding and
 * the turning: a bounded bite per step, capped so it can never push past the
 * thing it is chasing. That cap is the whole difference between slowing down
 * and stopping, and a marimo at the bottom of a jar is quite definitely stopped.
 */

import {
  ADDED_MASS_COEF,
  DRAG_COEF,
  FACET_MAX_DEPTH,
  FACET_MIN_DEPTH,
  FACET_SETTLE_GAIN,
  FACET_SETTLE_SPEED,
  FLOOR_BED_ACCEL,
  FLOOR_MU_ROLL,
  FLOOR_MU_SLIDE,
  FLOOR_RESTITUTION,
  FLOOR_Y,
  GAS_FULL_FRACTION,
  GRAVITY,
  RHO_AIR,
  RHO_ALGA,
  RHO_WATER,
  SPIN_COUPLE_TAU,
  SPIN_FRICTION_COEF,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_Y
} from './constants';
import { clamp } from './careSim';
import { deepestFacet, surfaceScale, type MarimoShape } from './facets';
import type { BodyState } from './types';

export interface BodyEnv {
  /** Mean radius in metres. */
  radiusM: number;
  /** Trapped gas 0..1. */
  gas: number;
  /** Body-frame surface: SH coefficients and flat faces. */
  shape: MarimoShape;
  /** Water velocity at the body's position, m/s. */
  waterVel: readonly [number, number, number];
  /** Water rotation about +Y at the body's position, rad/s. */
  waterOmegaY: number;
  /** Surface height. Animated during a water change so the ball rides it down. */
  waterY?: number;
  /**
   * Set while the ball is being held, to the normal of the surface it is being
   * rolled against — in practice the camera's forward axis, which is what
   * rolling something between your palms amounts to.
   *
   * Without this, dragging the marimo through open water only translates it and
   * never turns it, so the one interaction that repairs the flat spot would do
   * nothing unless you happened to shove it along the gravel.
   */
  handRoll?: readonly [number, number, number] | null;
}

export function newBody(y = FLOOR_Y): BodyState {
  return {
    position: [0, y, 0],
    velocity: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    omega: [0, 0, 0],
    grounded: false,
    venting: 0
  };
}

/** Effective density of the ball at a given trapped-gas fraction. */
export function effectiveDensity(gas: number): number {
  const f = clamp(gas, 0, 1) * GAS_FULL_FRACTION;
  return RHO_ALGA * (1 - f) + RHO_AIR * f;
}

/** Net vertical force in newtons: positive is up. */
export function netVerticalForce(radiusM: number, gas: number): number {
  const volume = (4 / 3) * Math.PI * radiusM ** 3;
  return (RHO_WATER - effectiveDensity(gas)) * volume * GRAVITY;
}

/** Steady-state speed in still water. Positive means rising. */
export function terminalVelocity(radiusM: number, gas: number): number {
  const force = netVerticalForce(radiusM, gas);
  const area = Math.PI * radiusM * radiusM;
  const speed = Math.sqrt((2 * Math.abs(force)) / (RHO_WATER * DRAG_COEF * area));
  return force >= 0 ? speed : -speed;
}

/** Gas fraction at which the ball neither rises nor sinks. */
export function neutralGas(): number {
  return (RHO_ALGA - RHO_WATER) / (GAS_FULL_FRACTION * (RHO_ALGA - RHO_AIR));
}

/** Rotate a world-space vector into the body frame by the conjugate of `q`. */
export function worldToBody(
  q: readonly [number, number, number, number],
  x: number,
  y: number,
  z: number,
  out: [number, number, number]
): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  // v' = q^-1 * v * q, expanded.
  const tx = 2 * (-qy * z + qz * y);
  const ty = 2 * (-qz * x + qx * z);
  const tz = 2 * (-qx * y + qy * x);
  out[0] = x + qw * tx + (-qy * tz + qz * ty);
  out[1] = y + qw * ty + (-qz * tx + qx * tz);
  out[2] = z + qw * tz + (-qx * ty + qy * tx);
  return out;
}

/** Rotate a body-frame vector into world space by `q`. The inverse of `worldToBody`. */
export function bodyToWorld(
  q: readonly [number, number, number, number],
  x: number,
  y: number,
  z: number,
  out: [number, number, number]
): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  // v' = q * v * q^-1, expanded.
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

const dirScratch: [number, number, number] = [0, 0, 0];
const faceScratch: [number, number, number] = [0, 0, 0];

/** Surface radius in metres along a world-space direction. */
export function radiusAlong(
  env: Pick<BodyEnv, 'radiusM' | 'shape'>,
  q: readonly [number, number, number, number],
  x: number,
  y: number,
  z: number
): number {
  worldToBody(q, x, y, z, dirScratch);
  return env.radiusM * surfaceScale(env.shape, dirScratch[0], dirScratch[1], dirScratch[2]);
}

function integrateQuaternion(
  q: [number, number, number, number],
  w: readonly number[],
  dt: number
) {
  const [x, y, z, s] = q;
  const [wx, wy, wz] = w;
  // dq/dt = 0.5 * omega_quat * q
  const dx = 0.5 * (wx * s + wy * z - wz * y);
  const dy = 0.5 * (wy * s + wz * x - wx * z);
  const dz = 0.5 * (wz * s + wx * y - wy * x);
  const ds = 0.5 * (-wx * x - wy * y - wz * z);

  let nx = x + dx * dt;
  let ny = y + dy * dt;
  let nz = z + dz * dt;
  let ns = s + ds * dt;

  const len = Math.hypot(nx, ny, nz, ns) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  ns /= len;

  q[0] = nx;
  q[1] = ny;
  q[2] = nz;
  q[3] = ns;
}

/**
 * Advance the body one fixed timestep. Mutates `body` in place.
 * Returns true if the ball touched the surface this step.
 */
export function stepBody(body: BodyState, env: BodyEnv, dt: number): boolean {
  const R = env.radiusM;
  const volume = (4 / 3) * Math.PI * R ** 3;
  const area = Math.PI * R * R;
  const rhoEff = effectiveDensity(env.gas);
  const effectiveMass = rhoEff * volume + ADDED_MASS_COEF * RHO_WATER * volume;

  const relX = body.velocity[0] - env.waterVel[0];
  const relY = body.velocity[1] - env.waterVel[1];
  const relZ = body.velocity[2] - env.waterVel[2];
  const relSpeed = Math.hypot(relX, relY, relZ);
  const dragK = 0.5 * RHO_WATER * DRAG_COEF * area * relSpeed;

  const fx = -dragK * relX;
  const fy = (RHO_WATER - rhoEff) * volume * GRAVITY - dragK * relY;
  const fz = -dragK * relZ;

  body.velocity[0] += (fx / effectiveMass) * dt;
  body.velocity[1] += (fy / effectiveMass) * dt;
  body.velocity[2] += (fz / effectiveMass) * dt;

  // --- gravel ---------------------------------------------------------------
  // Contact load per unit effective mass: whatever is left of the ball's weight
  // once the water has held up as much of it as it can, and never less than what
  // it takes to climb out of its own dimple in the bed.
  const grip = Math.max(((rhoEff - RHO_WATER) * volume * GRAVITY) / effectiveMass, FLOOR_BED_ACCEL);

  // Rolling resistance: a fixed bite out of the speed, capped at the speed
  // itself. The cap is what makes this a friction law rather than a damping
  // term — under it the ball is not slowing down, it has stopped, and a push too
  // weak to shift the gravel moves it not at all.
  //
  // Taken before the position is integrated, off `grounded` as the boundary pass
  // left it last step, because the alternative is to take it after: then a ball
  // pinned to the floor still advances by one step's worth of drag every step,
  // however hard the friction then zeroes the velocity, and creeps the width of
  // the jar over an afternoon.
  if (body.grounded) {
    const bite = FLOOR_MU_ROLL * grip * dt;
    const speed = Math.hypot(body.velocity[0], body.velocity[2]);
    if (speed > 0) {
      const keep = Math.max(0, 1 - bite / speed);
      body.velocity[0] *= keep;
      body.velocity[2] *= keep;
    }
  }

  body.position[0] += body.velocity[0] * dt;
  body.position[1] += body.velocity[1] * dt;
  body.position[2] += body.velocity[2] * dt;

  // --- boundaries -----------------------------------------------------------
  body.grounded = false;
  let touchedSurface = false;

  const floorLimit = FLOOR_Y + radiusAlong(env, body.quaternion, 0, -1, 0);
  if (body.position[1] <= floorLimit) {
    body.position[1] = floorLimit;
    body.velocity[1] = Math.max(0, body.velocity[1]) * FLOOR_RESTITUTION;
    body.grounded = true;
  }

  const surfaceLimit = (env.waterY ?? WATER_Y) - 0.75 * radiusAlong(env, body.quaternion, 0, 1, 0);
  if (body.position[1] >= surfaceLimit) {
    body.position[1] = surfaceLimit;
    body.velocity[1] = Math.min(0, body.velocity[1]);
    touchedSurface = true;
  }

  const wallX = TANK_HALF_X - R;
  if (body.position[0] > wallX) {
    body.position[0] = wallX;
    body.velocity[0] = Math.min(0, body.velocity[0]) * 0.4;
  } else if (body.position[0] < -wallX) {
    body.position[0] = -wallX;
    body.velocity[0] = Math.max(0, body.velocity[0]) * 0.4;
  }

  const wallZ = TANK_HALF_Z - R;
  if (body.position[2] > wallZ) {
    body.position[2] = wallZ;
    body.velocity[2] = Math.min(0, body.velocity[2]) * 0.4;
  } else if (body.position[2] < -wallZ) {
    body.position[2] = -wallZ;
    body.velocity[2] = Math.max(0, body.velocity[2]) * 0.4;
  }

  // --- rotation -------------------------------------------------------------
  let targetX: number;
  let targetY: number;
  let targetZ: number;

  const hand = env.handRoll;
  if (hand) {
    // Rolling without slipping against an arbitrary surface: omega = (n x v) / R.
    const [vx, vy, vz] = body.velocity;
    targetX = (hand[1] * vz - hand[2] * vy) / R;
    targetY = (hand[2] * vx - hand[0] * vz) / R;
    targetZ = (hand[0] * vy - hand[1] * vx) / R;
  } else if (body.grounded) {
    // Same thing, against a floor with normal +Y.
    targetX = body.velocity[2] / R;
    targetY = 0;
    targetZ = -body.velocity[0] / R;

    // A flat side is a stable place to lie, so a ball that has one finds it.
    // This is the whole point of modelling flats as flats: the shape does not
    // merely look pressed, it behaves pressed — it settles onto its face, and
    // it takes a real shove to roll it off one.
    const facet = deepestFacet(env.shape);
    if (facet && facet.depth > FACET_MIN_DEPTH) {
      const speed = Math.hypot(body.velocity[0], body.velocity[1], body.velocity[2]);
      const settling = 1 - clamp(speed / FACET_SETTLE_SPEED, 0, 1);
      if (settling > 0) {
        bodyToWorld(body.quaternion, facet.d[0], facet.d[1], facet.d[2], faceScratch);
        // Turn the face toward straight down: omega = gain * (face x down),
        // which vanishes exactly when it is lying on it.
        const gain = FACET_SETTLE_GAIN * settling * clamp(facet.depth / FACET_MAX_DEPTH, 0, 1);
        targetX += faceScratch[2] * gain;
        targetZ += -faceScratch[0] * gain;
      }
    }
  } else {
    targetX = 0;
    targetY = env.waterOmegaY;
    targetZ = 0;
  }

  const couple = 1 - Math.exp(-dt / SPIN_COUPLE_TAU);
  body.omega[0] += (targetX - body.omega[0]) * couple;
  body.omega[1] += (targetY - body.omega[1]) * couple;
  body.omega[2] += (targetZ - body.omega[2]) * couple;

  // Friction at the contact patch. Whatever is left of `target - omega` is the
  // slip rate there — the ball turning against gravel that is not moving — and
  // the gravel takes it out at a bounded rate rather than asymptotically. This
  // is what actually stops a resting marimo: the relaxation above only ever
  // halves the difference, so a ball spun up by a stir went on quietly
  // revolving in place for as long as anyone watched it.
  if (body.grounded) {
    const dx = targetX - body.omega[0];
    const dy = targetY - body.omega[1];
    const dz = targetZ - body.omega[2];
    const slip = Math.hypot(dx, dy, dz);
    if (slip > 0) {
      const k = Math.min(1, (SPIN_FRICTION_COEF * FLOOR_MU_SLIDE * grip * dt) / R / slip);
      body.omega[0] += dx * k;
      body.omega[1] += dy * k;
      body.omega[2] += dz * k;
    }
  }

  integrateQuaternion(body.quaternion, body.omega, dt);

  return touchedSurface;
}

/** Normalised spin, 0..1, for the care clock's `turnCredit`. */
export function spinMagnitude(body: BodyState, omegaRef: number): number {
  const w = Math.hypot(body.omega[0], body.omega[1], body.omega[2]);
  return clamp(w / omegaRef, 0, 1);
}
