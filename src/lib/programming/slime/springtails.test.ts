import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y } from './constants';
import { createTerrariumWorld, type TerrariumWorld } from './joltWorld';
import { createSpringtails, type SpringtailPredator } from './springtails';

/**
 * The crew, probed headlessly — on real Jolt bodies now, so these are
 * envelope tests, not trajectory tests: wander stays in the box, mold
 * gets eaten, pings displace, arcs are Mario-shaped, nobody is ever
 * eaten by a playful footprint. Exact positions belong to the solver.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

const flat = () => 0;
const stone = { x: 0.03, z: 0.02, radius: 0.01 };
const STEP = 1 / 120;
/** Contact skin: physics poses may rest a hair over analytic lines. */
const SKIN = 0.002;

/** A world with a coarse dome hull standing in for the test stone. */
function makeWorld(): TerrariumWorld {
  const world = createTerrariumWorld(J);
  const pts: number[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const h = (ring / 2) * 0.006;
    const r = stone.radius * (1 - 0.35 * (ring / 2));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * r, h, Math.sin(a) * r);
    }
  }
  pts.push(0, 0.007, 0);
  world.addStaticHull(new Float32Array(pts), [stone.x, FLOOR_Y, stone.z], 0);
  return world;
}

interface Rig {
  crew: ReturnType<typeof createSpringtails>;
  world: TerrariumWorld;
  /** One rendered frame: two 120 Hz physics substeps, then the look. */
  frame(
    moldAt?: readonly number[] | null,
    predator?: SpringtailPredator | null
  ): ReturnType<ReturnType<typeof createSpringtails>['update']>;
  done(): void;
}

function makeRig(seed: number, hull = true): Rig {
  // Arc-shape tests run hull-less: a spit that happens to clip the test
  // dome is correct physics but the wrong fixture for measuring the arc.
  const world = hull ? makeWorld() : createTerrariumWorld(J);
  const crew = createSpringtails(seed, flat, [stone], world);
  return {
    crew,
    world,
    frame(moldAt = null, predator = null) {
      crew.stepPhysics(STEP, moldAt, predator);
      world.step(STEP);
      crew.stepPhysics(STEP, moldAt, predator);
      world.step(STEP);
      return crew.update(1 / 60);
    },
    done() {
      crew.dispose();
      world.dispose();
    }
  };
}

function positionsOf(crew: Rig['crew']): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const m = crew.mesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < crew.mesh.count; i++) {
    out.push([m[i * 16 + 12], m[i * 16 + 13], m[i * 16 + 14]]);
  }
  return out;
}

describe('the cleanup crew', () => {
  it('wanders without leaving the box, never inside the rock', { timeout: 30_000 }, () => {
    const rig = makeRig(1234);
    for (let s = 0; s < 60 * 60; s++) {
      const result = rig.frame();
      expect(result.moldCleared).toBe(false);
      expect(result.eaten).toBe(0);
    }
    for (const [x, y, z] of positionsOf(rig.crew)) {
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(BOX_HALF_X + SKIN);
      expect(Math.abs(z)).toBeLessThanOrEqual(BOX_HALF_Z + SKIN);
      // Inside the rock's footprint is allowed only ON the hull (a
      // critter may climb a rock now — that is the feature), never
      // embedded at floor level within it.
      const inFootprint = Math.hypot(x - stone.x, z - stone.z) < stone.radius - SKIN;
      if (inFootprint) expect(y).toBeGreaterThan(FLOOR_Y + 0.0008);
    }
    rig.done();
  });

  it('converges on mold and eats it through, once', { timeout: 60_000 }, () => {
    const rig = makeRig(77);
    const mold = [-0.03, FLOOR_Y, -0.02] as const;
    let eatenAt = -1;
    for (let s = 0; s < 60 * 60 * 6; s++) {
      if (rig.frame(mold).moldCleared) {
        eatenAt = s / 60;
        break;
      }
    }
    // Cleared within a few minutes, and not implausibly fast.
    expect(eatenAt).toBeGreaterThan(20);
    expect(eatenAt).toBeLessThan(360);
    // Most of the crew is at the table by the end...
    let near = 0;
    let onTop = 0;
    for (const [x, , z] of positionsOf(rig.crew)) {
      if (Math.hypot(x - mold[0], z - mold[2]) < 0.014) near += 1;
      if (Math.hypot(x - mold[0], z - mold[2]) < 0.002) onTop += 1;
    }
    expect(near).toBeGreaterThanOrEqual(5);
    // ...ringed around the flake, not piled on top of it.
    expect(onTop).toBeLessThanOrEqual(3);
    rig.done();
  });

  it('a hungry slime eats critters that touch it, and the moss restocks', { timeout: 60_000 }, () => {
    const rig = makeRig(4321);
    // A predator parked mid-tank, wide enough that wanderers blunder in.
    const predator = { x: 0, z: 0, radius: 0.025 };
    let eaten = 0;
    for (let s = 0; s < 60 * 60 * 3; s++) {
      eaten += rig.frame(null, predator).eaten;
    }
    expect(eaten).toBeGreaterThan(0);
    // But the furcula saves most of the crew: hunting thins the tank,
    // it does not empty it.
    expect(eaten).toBeLessThan(60);
    // Respawns keep the tank stocked: someone is visible.
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    let visible = 0;
    for (let i = 0; i < rig.crew.mesh.count; i++) {
      if (m[i * 16 + 0] !== 0) visible += 1;
    }
    expect(visible).toBeGreaterThanOrEqual(1);
    rig.done();
  });

  it('a decimated crew blooms back within seconds of the predator leaving', { timeout: 60_000 }, () => {
    const rig = makeRig(555);
    // A footprint covering the whole tank: nowhere to flee to, so even
    // furcula escapes only delay things — everyone is eaten in seconds.
    const everywhere = { x: 0, z: 0, radius: 1 };
    let eaten = 0;
    for (let s = 0; s < 60 * 60 && eaten < 10; s++) {
      eaten += rig.frame(null, everywhere).eaten;
    }
    expect(eaten).toBe(10);
    // Predator gone; the bloom hurries every respawn to within ~10s.
    for (let s = 0; s < 60 * 15; s++) rig.frame();
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    let visible = 0;
    for (let i = 0; i < rig.crew.mesh.count; i++) {
      if (m[i * 16 + 0] !== 0) visible += 1;
    }
    expect(visible).toBe(10);
    rig.done();
  });

  it('respawned crew arrives as juveniles and grows to full size', { timeout: 90_000 }, () => {
    const rig = makeRig(2024);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    // The X-scale is the first column's magnitude, rotation and all.
    const scaleX = (i: number) => Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]);
    rig.frame();
    const adult = Array.from({ length: rig.crew.mesh.count }, (_, i) => scaleX(i));
    // Eat everyone, then let the bloom restock the tank.
    const everywhere = { x: 0, z: 0, radius: 1 };
    let eaten = 0;
    for (let s = 0; s < 60 * 60 && eaten < 10; s++) {
      eaten += rig.frame(null, everywhere).eaten;
    }
    expect(eaten).toBe(10);
    for (let s = 0; s < 60 * 15; s++) rig.frame();
    for (let i = 0; i < rig.crew.mesh.count; i++) {
      expect(scaleX(i)).toBeGreaterThan(0);
      expect(scaleX(i)).toBeLessThan(adult[i] * 0.75);
    }
    // A few minutes on, the juveniles have grown back into their sizes.
    for (let s = 0; s < 60 * 150; s++) rig.frame();
    for (let i = 0; i < rig.crew.mesh.count; i++) {
      expect(scaleX(i)).toBeCloseTo(adult[i], 5);
    }
    rig.done();
  });

  it('a furcula ping is a burst, not a stroll', { timeout: 60_000 }, () => {
    const rig = makeRig(31337);
    const predator = { x: 0, z: 0, radius: 0.025 };
    // Track each critter's position 0.15 s (9 frames) ago; a ping shows
    // up as covering more than 5 mm in that window — walking pace covers
    // barely 2 mm.
    const history: Array<Array<[number, number]>> = [];
    let biggest = 0;
    for (let s = 0; s < 60 * 60 * 2; s++) {
      rig.frame(null, predator);
      const now = positionsOf(rig.crew).map(([x, , z]) => [x, z] as [number, number]);
      history.push(now);
      if (history.length > 9) {
        const then = history.shift()!;
        for (let i = 0; i < now.length; i++) {
          const d = Math.hypot(now[i][0] - then[i][0], now[i][1] - then[i][1]);
          // Ignore respawn teleports to the walls; pings are mid-tank.
          if (d > biggest && d < 0.03) biggest = d;
        }
      }
    }
    expect(biggest).toBeGreaterThan(0.005);
    rig.done();
  });

  it('a playful footprint sets off pings but never eats anyone', { timeout: 60_000 }, () => {
    const rig = makeRig(808);
    const chaser = { x: 0, z: 0, radius: 0.025, playful: true };
    let pinged = 0;
    for (let s = 0; s < 60 * 60 * 3; s++) {
      const got = rig.frame(null, chaser);
      expect(got.eaten).toBe(0);
      pinged += got.pinged;
    }
    // Plenty of tag over three minutes, and a full tank at the end.
    expect(pinged).toBeGreaterThan(5);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    let visible = 0;
    for (let i = 0; i < rig.crew.mesh.count; i++) {
      if (m[i * 16 + 0] !== 0) visible += 1;
    }
    expect(visible).toBe(10);
    rig.done();
  });

  it('points the chase at the nearest live critter', () => {
    const rig = makeRig(64);
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const at = rig.crew.positionOf(idx);
    expect(at).not.toBeNull();
    // Nearest means nearest: no other live critter is closer.
    const d0 = Math.hypot(at![0], at![1]);
    for (const [x, , z] of positionsOf(rig.crew)) {
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(d0 - 1e-9);
    }
    expect(rig.crew.positionOf(-1)).toBeNull();
    rig.done();
  });

  it('slurp and ptooey: held critters hide, spat ones arc and land safe', { timeout: 30_000 }, () => {
    const rig = makeRig(999, false);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    expect(rig.crew.capture(idx)).toBe(true);
    rig.frame();
    // Held: invisible, untargetable, and not capturable twice.
    expect(m[idx * 16 + 0]).toBe(0);
    expect(rig.crew.positionOf(idx)).toBeNull();
    expect(rig.crew.capture(idx)).toBe(false);
    expect(rig.crew.nearestLive(0, 0)).not.toBe(idx);
    // Ptooey from mid-tank: it flies a real arc — up, along, and down.
    rig.crew.eject(idx, 0, 0);
    const groundY = FLOOR_Y + 0.0006;
    let apex = -Infinity;
    let landedAt = -1;
    for (let s = 0; s < 60 * 5; s++) {
      const r = rig.frame();
      expect(r.eaten).toBe(0);
      const y = m[idx * 16 + 13];
      if (y > apex) apex = y;
      if (landedAt < 0 && s > 5 && y <= groundY + 0.001) landedAt = s;
    }
    expect(apex).toBeGreaterThan(FLOOR_Y + 0.01);
    expect(landedAt).toBeGreaterThan(0);
    // Settled for good: back at ground height, no longer "in flight".
    expect(m[idx * 16 + 13]).toBeLessThanOrEqual(groundY + SKIN);
    expect(rig.crew.flightPositionOf(idx)).toBeNull();
    // Down, alive, visible, inside the tank.
    const at = rig.crew.positionOf(idx);
    expect(at).not.toBeNull();
    expect(Math.abs(at![0])).toBeLessThanOrEqual(BOX_HALF_X + SKIN);
    expect(Math.abs(at![1])).toBeLessThanOrEqual(BOX_HALF_Z + SKIN);
    expect(m[idx * 16 + 0]).not.toBe(0);
    // Eject without a hold is a no-op.
    const before = rig.crew.positionOf(idx)!;
    rig.crew.eject(idx, 0.02, 0.02);
    expect(rig.crew.positionOf(idx)![0]).toBe(before[0]);
    rig.done();
  });

  it('the arc is Mario-shaped: floaty rise, hanging apex, snappy fall', { timeout: 30_000 }, () => {
    const rig = makeRig(555_01, false);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    rig.crew.capture(idx);
    rig.crew.eject(idx, 0, 0);
    let apexY = -Infinity;
    let apexFrame = -1;
    let firstTouchFrame = -1;
    let settledFrame = -1;
    const groundBand = FLOOR_Y + 0.002;
    for (let s = 0; s < 60 * 5; s++) {
      rig.frame();
      const y = m[idx * 16 + 13];
      if (y > apexY) {
        apexY = y;
        apexFrame = s;
      }
      if (firstTouchFrame < 0 && s > 3 && y <= groundBand) firstTouchFrame = s;
      if (settledFrame < 0 && rig.crew.flightPositionOf(idx) === null) settledFrame = s;
    }
    // The lie that reads: longer going up than coming down.
    expect(firstTouchFrame).toBeGreaterThan(0);
    expect(apexFrame).toBeGreaterThan(firstTouchFrame - apexFrame);
    // And the whole show fits a watchable window.
    expect(settledFrame / 60).toBeGreaterThan(0.3);
    expect(settledFrame / 60).toBeLessThan(2.0);
    rig.done();
  });

  it('lands with one little bounce, then stays down', { timeout: 30_000 }, () => {
    const rig = makeRig(555_02, false);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    rig.crew.capture(idx);
    rig.crew.eject(idx, 0, 0);
    const groundBand = FLOOR_Y + 0.002;
    let apexY = -Infinity;
    let touched = false;
    let reboundY = -Infinity;
    for (let s = 0; s < 60 * 5; s++) {
      rig.frame();
      const y = m[idx * 16 + 13];
      if (!touched) {
        apexY = Math.max(apexY, y);
        if (s > 3 && y <= groundBand) touched = true;
      } else {
        reboundY = Math.max(reboundY, y);
      }
    }
    // It came back up after the first touch — but much lower than the arc.
    expect(reboundY).toBeGreaterThan(groundBand);
    expect(reboundY - FLOOR_Y).toBeLessThan((apexY - FLOOR_Y) * 0.5);
    rig.done();
  });

  it('reports exactly one landing per spit, inside the tank', { timeout: 30_000 }, () => {
    const rig = makeRig(555_03, false);
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    rig.crew.capture(idx);
    rig.crew.eject(idx, 0, 0);
    let landings = 0;
    for (let s = 0; s < 60 * 5; s++) {
      const r = rig.frame();
      if (r.landings) {
        for (const [lx, lz] of r.landings) {
          landings += 1;
          expect(Math.abs(lx)).toBeLessThanOrEqual(BOX_HALF_X + SKIN);
          expect(Math.abs(lz)).toBeLessThanOrEqual(BOX_HALF_Z + SKIN);
        }
      }
    }
    expect(landings).toBe(1);
    rig.done();
  });

  it('flightPositionOf tracks the arc and only the arc', { timeout: 30_000 }, () => {
    const rig = makeRig(555_04, false);
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    expect(rig.crew.flightPositionOf(idx)).toBeNull(); // just wandering
    rig.crew.capture(idx);
    expect(rig.crew.flightPositionOf(idx)).toBeNull(); // held inside
    rig.crew.eject(idx, 0, 0);
    const inFlight = rig.crew.flightPositionOf(idx);
    expect(inFlight).not.toBeNull();
    expect(inFlight![1]).toBeGreaterThan(FLOOR_Y + 0.005); // up in the air
    for (let s = 0; s < 60 * 5; s++) rig.frame();
    expect(rig.crew.flightPositionOf(idx)).toBeNull(); // settled
    rig.done();
  });

  it('reduced motion flies the arc plain: no stretch, no bounce', { timeout: 30_000 }, () => {
    const rig = makeRig(555_05, false);
    rig.crew.setMotionScale(0.3, false);
    const m = rig.crew.mesh.instanceMatrix.array as Float32Array;
    rig.frame();
    const idx = rig.crew.nearestLive(0, 0);
    rig.crew.capture(idx);
    rig.crew.eject(idx, 0, 0);
    const groundBand = FLOOR_Y + 0.002;
    let touched = false;
    let reboundY = -Infinity;
    for (let s = 0; s < 60 * 5; s++) {
      rig.frame();
      if (rig.crew.flightPositionOf(idx)) {
        // Column norms of the instance matrix are the raw scales; the
        // resting proportions are x:z = 0.7 and y:z = 0.55.
        const sx = Math.hypot(m[idx * 16], m[idx * 16 + 1], m[idx * 16 + 2]);
        const sy = Math.hypot(m[idx * 16 + 4], m[idx * 16 + 5], m[idx * 16 + 6]);
        const sz = Math.hypot(m[idx * 16 + 8], m[idx * 16 + 9], m[idx * 16 + 10]);
        expect(sx / sz).toBeCloseTo(0.7, 2);
        expect(sy / sz).toBeCloseTo(0.55, 2);
      }
      const y = m[idx * 16 + 13];
      if (!touched) {
        if (y <= groundBand && rig.crew.flightPositionOf(idx) === null) touched = true;
      } else {
        reboundY = Math.max(reboundY, y);
      }
    }
    // No bounce: once down it never comes back up.
    expect(touched).toBe(true);
    expect(reboundY).toBeLessThanOrEqual(groundBand);
    rig.done();
  });

  it('never eats anyone when no predator is passed', { timeout: 30_000 }, () => {
    const rig = makeRig(9);
    for (let s = 0; s < 60 * 30; s++) {
      expect(rig.frame().eaten).toBe(0);
    }
    rig.done();
  });
});
