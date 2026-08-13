import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import {
  FLOOR_MU_ROLL,
  FLOOR_Y,
  SPIN_FRICTION_COEF,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_Y
} from './constants';
import { contactGrip, effectiveDensity, spinDragRate } from './buoyancy';
import { createJoltWorld, loadJolt, type JoltWorld } from './joltWorld';
import { STONE_KINDS, makeStone, stoneExtents, stoneHullPoints } from './stones';

/**
 * The jar, on Jolt.
 *
 * These are not tests of Jolt — it has its own, and rather more of them. They
 * are tests of the *bindings*: the unit scaling, the buoyancy factor, the walls,
 * and the handful of behaviours the tank leans on. Every one of them would have
 * caught a real mistake in getting the engine wired up, and none of them would
 * fail if Jolt changed its solver.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

const still = (_x: number, _y: number, _z: number, out: [number, number, number]) => {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
};

function drop(world: JoltWorld, kindId: string, seed: number, x = 0, z = 0) {
  const kind = STONE_KINDS.find((entry) => entry.id === kindId);
  if (!kind) throw new Error(`no ${kindId} in the catalogue`);
  const stone = makeStone(kind, seed);
  const handle = world.addStone(stoneHullPoints(stone), [x, WATER_Y, z], [0, 0, 0, 1]);
  if (!handle) throw new Error('hull rejected');
  return { handle, extents: stoneExtents(stone) };
}

function run(world: JoltWorld, steps: number) {
  for (let i = 0; i < steps; i++) world.step(1 / 240, WATER_Y, still);
}

const position: [number, number, number] = [0, 0, 0];
const quaternion: [number, number, number, number] = [0, 0, 0, 1];
const linear: [number, number, number] = [0, 0, 0];
const angular: [number, number, number] = [0, 0, 0];

describe('a stone in the jar', () => {
  it('sinks and comes to rest on the gravel', () => {
    const world = createJoltWorld(J);
    const { handle, extents } = drop(world, 'agate', 101);

    run(world, 1200);
    world.readPose(handle, position, quaternion);

    // Its middle ends up within its own half-height of the floor: it is lying
    // on the gravel, not hovering over it and not through it.
    expect(position[1]).toBeGreaterThan(FLOOR_Y);
    expect(position[1]).toBeLessThan(FLOOR_Y + Math.max(...extents) + 0.001);
    world.dispose();
  });

  it('goes to sleep, and stays exactly where it stopped', () => {
    const world = createJoltWorld(J);
    const { handle } = drop(world, 'granite', 7, 0.01, -0.01);

    run(world, 1800);
    expect(world.asleep(handle)).toBe(true);

    world.readPose(handle, position, quaternion);
    const resting = [...position];
    const facing = [...quaternion];

    run(world, 600);
    world.readPose(handle, position, quaternion);
    expect([...position]).toEqual(resting);
    expect([...quaternion]).toEqual(facing);
    world.dispose();
  });

  it('does not turn on the spot once it has settled', () => {
    // The complaint that sent this to a real engine in the first place.
    const world = createJoltWorld(J);
    const { handle } = drop(world, 'slate', 91);
    run(world, 1800);

    world.readPose(handle, position, quaternion);
    const before = [...quaternion];
    run(world, 480);
    world.readPose(handle, position, quaternion);

    const dot = Math.abs(
      before[0] * quaternion[0] +
        before[1] * quaternion[1] +
        before[2] * quaternion[2] +
        before[3] * quaternion[3]
    );
    expect((2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeLessThan(0.5);
    world.dispose();
  });

  it('sinks rather than floating, and not at the speed of a falling brick', () => {
    // The buoyancy factor is the ratio of the densities, so this is the check
    // that the ratio is the right way up and that the drag is reaching the body.
    const world = createJoltWorld(J);
    const { handle } = drop(world, 'quartz', 55);

    // Measured early: at true scale this stone is on the gravel inside a fifth
    // of a second, which is the whole of why the drop wants slowing down for
    // the look of it. See `GRAVITY_SCALED`.
    run(world, 16);
    world.readVelocity(handle, linear, angular);
    expect(linear[1]).toBeLessThan(0);
    expect(-linear[1]).toBeLessThan(1.2);
    world.dispose();
  });

  it('stays inside the glass however hard it is thrown', () => {
    const world = createJoltWorld(J);
    const { handle, extents } = drop(world, 'flint', 21);
    world.setVelocity(handle, [3, 0, 2.2]);

    for (let i = 0; i < 1200; i++) {
      world.step(1 / 240, WATER_Y, still);
      world.readPose(handle, position, quaternion);
      const reach = Math.max(...extents);
      expect(Math.abs(position[0])).toBeLessThan(TANK_HALF_X + reach);
      expect(Math.abs(position[2])).toBeLessThan(TANK_HALF_Z + reach);
      expect(position[1]).toBeGreaterThan(FLOOR_Y - reach);
    }
    world.dispose();
  });

  it('knows when it is being held up by something', () => {
    const world = createJoltWorld(J);
    const { handle } = drop(world, 'basalt', 3);

    world.step(1 / 240, WATER_Y, still);
    expect(world.isSupported(handle)).toBe(false);

    run(world, 1200);
    expect(world.isSupported(handle)).toBe(true);
    world.dispose();
  });
});

describe('two stones', () => {
  it('end up beside or on top of each other, never inside', () => {
    // Deliberately not a test that they stack. Dropped one on another, a real
    // stone usually rolls off — which is what the hand-rolled solver could not
    // do and what an engine gets right. What must hold either way is that they
    // are two solids.
    const world = createJoltWorld(J);
    const bottom = drop(world, 'granite', 31);
    run(world, 900);
    const top = drop(world, 'agate', 32);
    run(world, 2400);

    world.readPose(bottom.handle, position, quaternion);
    const below: [number, number, number] = [...position];
    world.readPose(top.handle, position, quaternion);

    const apart = Math.hypot(
      position[0] - below[0],
      position[1] - below[1],
      position[2] - below[2]
    );
    // Two stones of this size cannot have their middles closer than this
    // without one being inside the other.
    expect(apart).toBeGreaterThan(0.008);
    world.dispose();
  });
});

describe('a held stone', () => {
  it('comes to the hand, and falls when it is let go', () => {
    const world = createJoltWorld(J);
    const { handle } = drop(world, 'serpentine', 44);
    run(world, 900);

    const lifted: [number, number, number] = [0.01, FLOOR_Y + 0.05, 0.005];
    world.wake(handle);
    handle.grabTarget = lifted;
    run(world, 480);

    world.readPose(handle, position, quaternion);
    expect(position[1]).toBeGreaterThan(FLOOR_Y + 0.035);
    expect(Math.hypot(position[0] - lifted[0], position[2] - lifted[2])).toBeLessThan(0.006);

    handle.grabTarget = null;
    world.wake(handle);
    run(world, 900);
    world.readPose(handle, position, quaternion);
    expect(position[1]).toBeLessThan(FLOOR_Y + 0.03);
    world.dispose();
  });
});

describe('addTorque', () => {
  it('means rad/s², whatever the body', () => {
    // The regression that motivates this test: a settle torque documented in
    // rad/s² was once fed to the engine as newton-metres. Against the marimo's
    // true inertia of ~4×10⁻⁷ kg·m² that made it a kilohertz spring, and the
    // pet rocked on the gravel forever. The contract now is that one step of
    // `α` changes the spin by `α·dt`, for a pebble and a marimo alike — bodies
    // whose inertias differ by orders of magnitude.
    const world = createJoltWorld(J);

    // Both in the air above the surface, deliberately. In the water the probe
    // is contaminated: a body straddling the waterline feels a real righting
    // torque, because its centre of buoyancy is not its centre of mass — that
    // is the physics working, and it is an order of magnitude bigger than the
    // twist being measured.
    const marimo = world.addMarimo(0.012, [0, WATER_Y + 0.05, 0]);
    if (!marimo) throw new Error('no marimo');
    const kind = STONE_KINDS.find((entry) => entry.id === 'granite');
    if (!kind) throw new Error('no granite');
    const rock = makeStone(kind, 5);
    const stone = world.addStone(stoneHullPoints(rock), [0.03, WATER_Y + 0.06, 0.02], [0, 0, 0, 1]);
    if (!stone) throw new Error('hull rejected');

    const dt = 1 / 240;
    for (const [name, handle] of [
      ['marimo', marimo],
      ['stone', stone]
    ] as const) {
      world.wake(handle);
      world.setSpin(handle, [0, 0, 0]);
      world.addTorque(handle, 12, 0, 0);
      world.step(dt, WATER_Y, still);
      world.readVelocity(handle, linear, angular);
      // Within a few per cent: the same step also applies angular drag from
      // the buoyancy impulse, which at these speeds is a rounding error.
      expect(angular[0], name).toBeGreaterThan(12 * dt * 0.9);
      expect(angular[0], name).toBeLessThan(12 * dt * 1.1);
    }
    world.dispose();
  });

  it('lets a spring-and-damper settle instead of ringing', () => {
    // The whole facet-settle mechanism, driven the way the scene drives it:
    // pull an off-axis body direction toward down, damp the rocking, and the
    // ball must come to rest — not oscillate at the bottom of the tank.
    const world = createJoltWorld(J);
    const marimo = world.addMarimo(0.012, [0, FLOOR_Y + 0.0125, 0]);
    if (!marimo) throw new Error('no marimo');
    world.setMarimoShape(marimo, 0.0121, 1035);

    const face: [number, number, number] = [Math.sin(0.6), -Math.cos(0.6), 0];
    const pose: [number, number, number, number] = [0, 0, 0, 1];
    const at: [number, number, number] = [0, 0, 0];

    let peakLate = 0;
    for (let i = 0; i < 1440; i++) {
      world.readPose(marimo, at, pose);
      world.readVelocity(marimo, linear, angular);
      if (!world.asleep(marimo)) {
        // The scene's own arithmetic: rotate the face into the world, spring
        // toward down, damp the horizontal spin.
        const [qx, qy, qz, qw] = pose;
        const wx =
          face[0] * (1 - 2 * (qy * qy + qz * qz)) +
          face[1] * 2 * (qx * qy - qw * qz) +
          face[2] * 2 * (qx * qz + qw * qy);
        const wz =
          face[0] * 2 * (qx * qz - qw * qy) +
          face[1] * 2 * (qy * qz + qw * qx) +
          face[2] * (1 - 2 * (qx * qx + qy * qy));
        world.addTorque(marimo, wz * 26 - angular[0] * 10, 0, -wx * 26 - angular[2] * 10);
      }
      world.step(1 / 240, WATER_Y, still);
      if (i > 960) {
        world.readVelocity(marimo, linear, angular);
        peakLate = Math.max(peakLate, Math.hypot(angular[0], angular[1], angular[2]));
      }
    }

    // Four seconds in it is still, not swinging — and quiet enough to sleep.
    expect(peakLate).toBeLessThan(0.25);
    world.dispose();
  });
});

describe('a spun marimo', () => {
  /**
   * The scene's own rotational-friction arithmetic, applied the way the scene
   * applies it. What the loop asserts is the property one sideways drag used
   * to break: banked spin has to die, because neither Jolt's point-contact
   * friction nor its smooth-body buoyancy drag will kill it alone.
   */
  function runWithFriction(
    world: JoltWorld,
    handle: NonNullable<ReturnType<JoltWorld['addMarimo']>>,
    radiusM: number,
    grounded: boolean,
    steps: number
  ) {
    const rhoEff = effectiveDensity(0.1);
    for (let i = 0; i < steps; i++) {
      world.readVelocity(handle, linear, angular);
      const slip = Math.hypot(angular[0], angular[1], angular[2]);
      if (!world.asleep(handle) && slip > 1e-4) {
        const rate = spinDragRate(rhoEff, radiusM, slip);
        world.addTorque(handle, -angular[0] * rate, -angular[1] * rate, -angular[2] * rate);
        if (grounded) {
          const decel = (SPIN_FRICTION_COEF * FLOOR_MU_ROLL * contactGrip(rhoEff)) / radiusM;
          const cap = Math.min(decel / slip, 30);
          world.addTorque(handle, -angular[0] * cap, -angular[1] * cap, -angular[2] * cap);
        }
      }
      world.step(1 / 240, WATER_Y, still);
    }
  }

  it('coasts down in open water instead of spinning forever', () => {
    const world = createJoltWorld(J);
    const handle = world.addMarimo(0.012, [0, FLOOR_Y + 0.04, 0]);
    if (!handle) throw new Error('no marimo');

    // The spin one hard sideways drag banks: rolling between the palms at
    // v = 0.12 m/s over a 12 mm ball.
    world.setSpin(handle, [0, 10, 0]);
    runWithFriction(world, handle, 0.012, false, 720);

    world.readVelocity(handle, linear, angular);
    expect(Math.hypot(angular[0], angular[1], angular[2])).toBeLessThan(0.6);
    world.dispose();
  });

  it('is stopped by the gravel faster than by the water', () => {
    const world = createJoltWorld(J);
    const free = world.addMarimo(0.012, [-0.03, FLOOR_Y + 0.04, 0]);
    const bedded = world.addMarimo(0.012, [0.03, FLOOR_Y + 0.0125, 0]);
    if (!free || !bedded) throw new Error('no marimo');

    world.setSpin(free, [0, 8, 0]);
    world.setSpin(bedded, [0, 8, 0]);
    runWithFriction(world, free, 0.012, false, 360);
    runWithFriction(world, bedded, 0.012, true, 360);

    world.readVelocity(free, linear, angular);
    const freeSpin = Math.hypot(angular[0], angular[1], angular[2]);
    world.readVelocity(bedded, linear, angular);
    const beddedSpin = Math.hypot(angular[0], angular[1], angular[2]);

    expect(beddedSpin).toBeLessThan(freeSpin);
    expect(beddedSpin).toBeLessThan(0.2);
    world.dispose();
  });
});

describe('the marimo', () => {
  it('floats when it is full of gas and sinks when it is not', () => {
    const world = createJoltWorld(J);
    const handle = world.addMarimo(0.012, [0, FLOOR_Y + 0.03, 0]);
    if (!handle) throw new Error('no marimo');

    // Denser than water: down.
    world.setMarimoShape(handle, 0.0121, 1035);
    world.wake(handle);
    run(world, 60);
    world.readVelocity(handle, linear, angular);
    expect(linear[1]).toBeLessThan(0);

    // Lighter than water: up.
    world.setMarimoShape(handle, 0.0122, 940);
    world.wake(handle);
    run(world, 60);
    world.readVelocity(handle, linear, angular);
    expect(linear[1]).toBeGreaterThan(0);
    world.dispose();
  });
});
