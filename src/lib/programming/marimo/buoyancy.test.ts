import { describe, expect, it } from 'vitest';
import {
  bodyToWorld,
  effectiveDensity,
  neutralGas,
  netVerticalForce,
  newBody,
  spinMagnitude,
  stepBody,
  terminalVelocity,
  worldToBody
} from './buoyancy';
import { FLOOR_Y, RHO_WATER, WATER_Y } from './constants';
import { zeroShape } from './sphericalHarmonics';
import { deepestFacet, shapeFrom } from './facets';
import { mulberry32 } from './rng';
import type { BodyEnv } from './buoyancy';
import type { BodyState } from './types';

const STILL: readonly [number, number, number] = [0, 0, 0];

function env(gas: number, radiusM = 0.012): BodyEnv {
  return { radiusM, gas, shape: shapeFrom(zeroShape()), waterVel: STILL, waterOmegaY: 0 };
}

function settle(body: ReturnType<typeof newBody>, e: BodyEnv, seconds: number) {
  const dt = 1 / 240;
  for (let i = 0; i < seconds * 240; i++) stepBody(body, e, dt);
}

/**
 * Run without ever letting the ball reach a boundary, by pinning it back to
 * mid-water each step. The tank is only 20 cm tall and terminal velocity is
 * ~0.11 m/s, so it would otherwise hit the floor in about two seconds.
 */
function drift(body: ReturnType<typeof newBody>, e: BodyEnv, seconds: number) {
  const dt = 1 / 240;
  for (let i = 0; i < seconds * 240; i++) {
    stepBody(body, e, dt);
    body.position[1] = 0;
  }
}

describe('densities', () => {
  it('is denser than water with no gas, lighter when full', () => {
    expect(effectiveDensity(0)).toBeGreaterThan(RHO_WATER);
    expect(effectiveDensity(1)).toBeLessThan(RHO_WATER);
  });

  it('has zero net force at the neutral gas fraction', () => {
    const g = neutralGas();
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
    expect(netVerticalForce(0.012, g)).toBeCloseTo(0, 9);
    // Documented in the plan as roughly 0.57 - a slow drift up, not a pop.
    expect(g).toBeGreaterThan(0.5);
    expect(g).toBeLessThan(0.65);
  });
});

describe('stepBody', () => {
  it('reaches the closed-form terminal velocity when sinking', () => {
    const e = env(0);
    const body = newBody(0);
    drift(body, e, 5);
    const expected = terminalVelocity(e.radiusM, 0);
    expect(expected).toBeLessThan(0);
    expect(Math.abs(body.velocity[1] / expected - 1)).toBeLessThan(0.02);
  });

  it('reaches the closed-form terminal velocity when rising', () => {
    const e = env(1);
    const body = newBody(0);
    drift(body, e, 5);
    const expected = terminalVelocity(e.radiusM, 1);
    expect(expected).toBeGreaterThan(0);
    expect(Math.abs(body.velocity[1] / expected - 1)).toBeLessThan(0.02);
  });

  it('settles on the floor and stops', () => {
    const e = env(0);
    const body = newBody(WATER_Y - 0.02);
    settle(body, e, 10);
    expect(body.position[1]).toBeCloseTo(FLOOR_Y + e.radiusM, 4);
    expect(Math.hypot(...body.velocity)).toBeLessThan(1e-3);
    expect(body.grounded).toBe(true);
  });

  it('rises to the surface and reports touching it', () => {
    const e = env(1);
    const body = newBody(FLOOR_Y + e.radiusM);
    let touched = false;
    const dt = 1 / 240;
    for (let i = 0; i < 240 * 10; i++) {
      if (stepBody(body, e, dt)) touched = true;
    }
    expect(touched).toBe(true);
    expect(body.position[1]).toBeCloseTo(WATER_Y - 0.75 * e.radiusM, 4);
  });

  it('rolls rather than sliding when pushed along the gravel', () => {
    const e = env(0);
    const body = newBody(FLOOR_Y + e.radiusM);
    settle(body, e, 2);
    body.velocity[0] = 0.05;
    settle(body, e, 0.25);
    // Rolling without slipping about +x motion means spin about -z.
    expect(body.omega[2]).toBeLessThan(0);
    expect(spinMagnitude(body, 1.5)).toBeGreaterThan(0);
  });

  it('comes to a dead stop on the gravel rather than creeping', () => {
    // The gravel is Coulomb, not viscous, and the difference is the whole point.
    // Exponential damping leaves a millimetre a second of creep the eye cannot
    // see, which is four degrees a second of turn it can: the marimo used to sit
    // on the bottom revolving quietly for as long as anyone cared to watch.
    const e = env(0);
    const body = newBody(FLOOR_Y + e.radiusM);
    settle(body, e, 2);
    body.velocity[0] = 0.03;
    body.velocity[2] = -0.02;
    settle(body, e, 4);
    expect(body.velocity[0]).toBe(0);
    expect(body.velocity[2]).toBe(0);
    expect(Math.hypot(...body.omega)).toBe(0);
  });

  it('is not moved at all by a current too weak to overcome the gravel', () => {
    // Stiction. Any push under the friction limit has to do nothing whatsoever,
    // not merely a little: a steady trickle that moves the ball a hair a second
    // still turns it, because the rolling rate is that speed over a 12 mm radius.
    const e = { ...env(0), waterVel: [0.004, 0, 0] as const };
    const body = newBody(FLOOR_Y + e.radiusM);
    settle(body, e, 3);
    const parked = body.position[0];
    settle(body, e, 3);
    expect(body.position[0]).toBe(parked);
    expect(Math.hypot(...body.omega)).toBe(0);
  });

  it('rolls when handled in open water, not only on the gravel', () => {
    // Without `handRoll`, dragging the marimo through the water only translated
    // it, so the interaction the UI advertises for fixing the flat spot did
    // nothing at all unless you happened to shove it along the bottom.
    const e: BodyEnv = { ...env(0.5), handRoll: [0, 0, 1] };
    const body = newBody(0);
    const dt = 1 / 240;
    for (let i = 0; i < 240; i++) {
      body.velocity[0] = 0.05; // held, moving sideways across the view
      stepBody(body, e, dt);
      body.position[1] = 0;
    }
    expect(body.grounded).toBe(false);
    expect(spinMagnitude(body, 1.5)).toBeGreaterThan(0.5);

    // The same motion with no hand on it barely turns the ball.
    const loose = newBody(0);
    const looseEnv = env(0.5);
    for (let i = 0; i < 240; i++) {
      loose.velocity[0] = 0.05;
      stepBody(loose, looseEnv, dt);
      loose.position[1] = 0;
    }
    expect(spinMagnitude(loose, 1.5)).toBeLessThan(0.05);
  });

  it('spins up faster than a typical drag reverses direction', () => {
    // SPIN_COUPLE_TAU acts as a low-pass on the rotation target. If it is slower
    // than the back-and-forth of rolling the ball, handling it never registers.
    const e: BodyEnv = { ...env(0.5), handRoll: [0, 0, 1] };
    const body = newBody(0);
    const dt = 1 / 240;
    for (let i = 0; i < 240 * 0.4; i++) {
      body.velocity[0] = 0.05;
      stepBody(body, e, dt);
      body.position[1] = 0;
    }
    // Most of the way to target within a few tenths of a second.
    expect(spinMagnitude(body, 1.5)).toBeGreaterThan(0.5);
  });

  it('is deterministic for identical inputs', () => {
    const run = () => {
      const e = env(0.5);
      const body = newBody(0.02);
      body.velocity[0] = 0.03;
      settle(body, e, 4);
      return [...body.position, ...body.velocity, ...body.quaternion];
    };
    expect(run()).toEqual(run());
  });

  it('keeps the ball inside the glass', () => {
    const e = env(0.5);
    const body = newBody(0);
    body.velocity[0] = 5;
    body.velocity[2] = -5;
    settle(body, e, 3);
    expect(Math.abs(body.position[0])).toBeLessThanOrEqual(0.11);
    expect(Math.abs(body.position[2])).toBeLessThanOrEqual(0.085);
  });
});

describe('worldToBody', () => {
  it('is the identity for an identity quaternion', () => {
    const out: [number, number, number] = [0, 0, 0];
    worldToBody([0, 0, 0, 1], 0, -1, 0, out);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(-1, 12);
    expect(out[2]).toBeCloseTo(0, 12);
  });

  it('inverts a quarter turn about Z', () => {
    const s = Math.SQRT1_2;
    const q: [number, number, number, number] = [0, 0, s, s]; // +90 deg about Z
    const out: [number, number, number] = [0, 0, 0];
    // World +Y came from body +X under that rotation.
    worldToBody(q, 0, 1, 0, out);
    expect(out[0]).toBeCloseTo(1, 9);
    expect(out[1]).toBeCloseTo(0, 9);
    expect(out[2]).toBeCloseTo(0, 9);
  });

  it('preserves length', () => {
    const q: [number, number, number, number] = [0.3, -0.2, 0.5, 0.7887];
    const len = Math.hypot(...q);
    const nq = q.map((c) => c / len) as [number, number, number, number];
    const out: [number, number, number] = [0, 0, 0];
    worldToBody(nq, 0.3, -0.9, 0.31, out);
    expect(Math.hypot(...out)).toBeCloseTo(Math.hypot(0.3, -0.9, 0.31), 9);
  });
});

describe('bodyToWorld', () => {
  it('undoes worldToBody', () => {
    const rand = mulberry32(808);
    const out: [number, number, number] = [0, 0, 0];
    const back: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 20; i++) {
      const raw = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const len = Math.hypot(...raw);
      const q = raw.map((c) => c / len) as [number, number, number, number];

      worldToBody(q, 0.2, -0.7, 0.4, out);
      bodyToWorld(q, out[0], out[1], out[2], back);
      expect(back[0]).toBeCloseTo(0.2, 9);
      expect(back[1]).toBeCloseTo(-0.7, 9);
      expect(back[2]).toBeCloseTo(0.4, 9);
    }
  });
});

describe('turning underwater', () => {
  /** A ball spun about +Y and then left to itself in open water. */
  function spun(omegaY: number, radiusM = 0.012) {
    const e = env(0.5, radiusM);
    const body = newBody(0);
    body.omega[1] = omegaY;
    return { body, e };
  }

  it('coasts to a stop rather than being clamped to the water', () => {
    // Water resists turning; it does not dictate a rate. A marimo let go of
    // mid-jar goes on turning for a second or two, which is the difference
    // between a thing moving through water and a thing being animated.
    const { body, e } = spun(3);
    drift(body, e, 0.3);
    expect(body.omega[1]).toBeGreaterThan(1.2);
    drift(body, e, 6);
    expect(Math.abs(body.omega[1])).toBeLessThan(0.02);
  });

  it('lets a big marimo turn long after a small one has stopped', () => {
    // The damping is 15*mu/(rho*R^2), so it falls off as the square of the
    // radius: size shows up in how long a ball coasts, not only in how big it
    // looks. Nothing else in the model would have told you they differ.
    const small = spun(3, 0.01);
    const large = spun(3, 0.03);
    drift(small.body, small.e, 2);
    drift(large.body, large.e, 2);
    expect(large.body.omega[1]).toBeGreaterThan(small.body.omega[1] * 3);
  });

  it('sheds a fast spin faster than a slow one', () => {
    // Form drag is quadratic, so a flicked marimo loses a larger *fraction* of
    // its spin per second than a drifting one does. Anything linear — the old
    // relaxation included — loses the same fraction from any speed, which is
    // what made a hard flick and a nudge look like the same gesture.
    const fast = spun(8);
    const slow = spun(0.2);
    drift(fast.body, fast.e, 1);
    drift(slow.body, slow.e, 1);
    expect(fast.body.omega[1] / 8).toBeLessThan(slow.body.omega[1] / 0.2);
  });
});

describe('lying on a flat side', () => {
  /** A sunken marimo with one flat face, tipped `radians` off flat-side-down. */
  function flatOnFloor(depth: number, radians: number): { body: BodyState; e: BodyEnv } {
    const e = env(0);
    e.shape = shapeFrom(zeroShape(), [{ d: [0, -1, 0], depth }]);
    const body = newBody();
    body.position[1] = FLOOR_Y + 0.012;
    // Roll it about Z by `radians`, so the face no longer points down.
    body.quaternion = [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)];
    return { body, e };
  }

  /** How far the face is from pointing straight down, in radians. */
  function tilt(body: BodyState, e: BodyEnv): number {
    const facet = deepestFacet(e.shape)!;
    const out: [number, number, number] = [0, 0, 0];
    bodyToWorld(body.quaternion, facet.d[0], facet.d[1], facet.d[2], out);
    return Math.acos(Math.max(-1, Math.min(1, -out[1])));
  }

  it('tips itself flat-side-down when it comes to rest', () => {
    // The whole point of modelling a flat as a flat: it does not merely look
    // pressed, it lies the way a pressed thing lies.
    const { body, e } = flatOnFloor(0.12, 0.6);
    expect(tilt(body, e)).toBeCloseTo(0.6, 6);

    settle(body, e, 12);
    expect(tilt(body, e)).toBeLessThan(0.08);
  });

  it('stays put once it is lying on it', () => {
    const { body, e } = flatOnFloor(0.12, 0);
    settle(body, e, 12);
    expect(tilt(body, e)).toBeLessThan(1e-6);
    expect(Math.hypot(...body.omega)).toBeLessThan(1e-6);
  });

  it('leaves a round marimo alone', () => {
    const e = env(0);
    const body = newBody();
    body.position[1] = FLOOR_Y + 0.012;
    settle(body, e, 8);
    expect(Math.hypot(...body.omega)).toBeLessThan(1e-9);
  });

  it('does not fight a marimo that is being rolled', () => {
    // Settling is for a ball at rest. If it fought the roll it would drag on
    // every push, and rolling is the one interaction that re-rounds a marimo.
    //
    // Both balls are held against the floor rather than left to their own
    // height, because a deep flat makes a rolling ball hop — the support radius
    // changes as the face comes round — and an airborne ball is not being
    // asked to roll or to settle.
    const slow = flatOnFloor(0.15, 0.9);
    const fast = flatOnFloor(0.15, 0.9);
    const dt = 1 / 240;
    for (let i = 0; i < 480; i++) {
      slow.body.velocity[0] = 0.004; // under FACET_SETTLE_SPEED: still settling
      fast.body.velocity[0] = 0.06; // over it: rolling
      // Held down so both stay grounded, and held back from the wall — the
      // tank is 11 cm across and the wall zeroes the velocity that drives the
      // roll, which would leave the "fast" ball sitting still against the glass.
      slow.body.position[0] = 0;
      fast.body.position[0] = 0;
      slow.body.position[1] = FLOOR_Y + 0.009;
      fast.body.position[1] = FLOOR_Y + 0.009;
      stepBody(slow.body, slow.e, dt);
      stepBody(fast.body, fast.e, dt);
    }

    // The one being rolled turns at the rolling-without-slipping rate, not at
    // whatever holding its face down would have wanted. The rate is set by the
    // velocity it has when the rotation is solved, which is after the floor has
    // taken its friction bite out of the velocity the test just handed it — a
    // bite of one step's worth of deceleration, so a shade under the full rate.
    expect(fast.body.omega[2]).toBeCloseTo(-0.06 / 0.012, 1);

    // The one merely nudged has come most of the way down, and settles at the
    // angle where the two disagree: the nudge rolls it off its face at
    // `v / R` and the face pulls it back at whatever the water will allow, so
    // where they balance is a real number and not a tuned one.
    expect(tilt(slow.body, slow.e)).toBeLessThan(0.35);

    // Stop nudging and it lies all the way down.
    settle(slow.body, slow.e, 6);
    expect(tilt(slow.body, slow.e)).toBeLessThan(0.02);
  });

  it('starts from rest and gathers pace, the way a torque does', () => {
    // It used to relax toward a target *rate*, so the ball turned at its
    // fastest the instant it was released and only ever slowed: a lopsided
    // marimo revolved evenly in place until it ran out of angle. A torque has
    // to accelerate it against the water first, so the quickest part of lying
    // down is the middle of it.
    const { body, e } = flatOnFloor(0.15, 0.9);
    settle(body, e, 0.05);
    const early = Math.abs(body.omega[2]);
    settle(body, e, 0.7);
    const mid = Math.abs(body.omega[2]);
    expect(early).toBeLessThan(0.1 * mid);
  });

  it('turns fastest halfway down and eases into its face', () => {
    // The shape of the fall is the fluid's, not a constant's: the torque falls
    // off as the face comes round, the water is still resisting, so the ball
    // arrives slowly and lies down rather than stopping mid-turn. Under a fixed
    // target rate the fastest moment was the first one.
    const { body, e } = flatOnFloor(0.15, 0.9);
    const dt = 1 / 240;
    let peak = 0;
    let peakAt = 0;
    for (let i = 0; i < 240 * 6; i++) {
      stepBody(body, e, dt);
      const w = Math.abs(body.omega[2]);
      if (w > peak) {
        peak = w;
        peakAt = i / 240;
      }
    }
    expect(peakAt).toBeGreaterThan(0.4);
    expect(peakAt).toBeLessThan(2);
    // And it does not overshoot: the gravel takes the arrival, so a marimo
    // lies down on its face rather than bouncing on it like a dropped die.
    expect(tilt(body, e)).toBeLessThan(0.01);

    // Then it is over — no creep left behind to turn the ball for the rest of
    // the afternoon, which is the failure this whole file is organised against.
    settle(body, e, 20);
    expect(tilt(body, e)).toBeLessThan(1e-3);
    expect(Math.hypot(...body.omega)).toBeLessThan(1e-6);
  });

  it('can still be rolled off its face by a current', () => {
    // The one that matters. A marimo lying flat is tipped by nothing, so the
    // axis its own settling wants is exactly the axis a current has to turn it
    // about to get it off its flat — and a settling term that simply claimed
    // that axis deadlocked the ball, which then slid along the gravel keeping
    // the same side down forever. Rolling is the only thing that mends a flat,
    // so it has to survive contact with the thing that makes them.
    const { body, e } = flatOnFloor(0.15, 0);
    // Carrying some gas, as one resting on the gravel does — waterlogged, it is
    // simply too heavy for a current this size to shift at all, which is the
    // gravel's stiction doing its job and a different test.
    e.gas = 0.3;
    settle(body, e, 1);
    expect(tilt(body, e)).toBeLessThan(0.01); // lying on it to start with

    e.waterVel = [0.06, 0, 0];
    const dt = 1 / 240;
    let rolled = 0;
    for (let i = 0; i < 240 * 3; i++) {
      stepBody(body, e, dt);
      body.position[0] = 0; // held off the glass; the wall would stop the roll
      rolled = Math.max(rolled, tilt(body, e));
    }
    expect(rolled).toBeGreaterThan(1);
  });

  it('is gentler about a shallow face than a deep one', () => {
    const shallow = flatOnFloor(0.02, 0.6);
    const deep = flatOnFloor(0.15, 0.6);
    settle(shallow.body, shallow.e, 2);
    settle(deep.body, deep.e, 2);
    expect(tilt(deep.body, deep.e)).toBeLessThan(tilt(shallow.body, shallow.e));
  });
});
