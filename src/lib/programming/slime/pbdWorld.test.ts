import { describe, expect, it } from 'vitest';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y } from './constants';
import { createPbdWorld, type ParticleWorld } from './pbdWorld';
import { makeStone, stoneExtents, stoneKindById, stoneSurface } from '../marimo/stones';

/**
 * The particle body, probed against the ORB spec (user mandate 2026-08-13:
 * "an orb like a water balloon" — the slumped-gumdrop/beanbag doctrine is
 * retired). The material is a plump elastic ball: it squashes while
 * pressed and springs back with a jiggle, ignores orientation, survives
 * abuse, and fits the frame budget. Note what is *not* here: no shred
 * test, no constraint-detonation test, and no lingering-dent test — a
 * water balloon does not hold dents.
 *
 * Probes aim at the body's measured centroid, the way the scene's pointer
 * raycasts do — the spawn transient parks the ball a few millimetres off
 * the origin, and a press aimed at the origin shoves it instead of
 * squashing it.
 */

function stepSeconds(world: ParticleWorld, seconds: number): void {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) world.step(dt);
}

interface Silhouette {
  height: number;
  minY: number;
  cx: number;
  cz: number;
  /** Widest horizontal extent (from the centroid axis) per height band. */
  widest: Float32Array;
  maxAbs: number;
}

function silhouette(world: ParticleWorld, bands = 6): Silhouette {
  const positions = new Float32Array(world.particleCount * 3);
  world.readPositions(positions);
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cz = 0;
  let maxAbs = 0;
  for (let i = 0; i < world.particleCount; i++) {
    const y = positions[i * 3 + 1];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    cx += positions[i * 3];
    cz += positions[i * 3 + 2];
    maxAbs = Math.max(maxAbs, Math.abs(positions[i * 3]), Math.abs(positions[i * 3 + 2]));
  }
  cx /= world.particleCount;
  cz /= world.particleCount;
  const height = maxY - minY;
  const widest = new Float32Array(bands);
  for (let i = 0; i < world.particleCount; i++) {
    const h = (positions[i * 3 + 1] - minY) / Math.max(height, 1e-6);
    const band = Math.min(bands - 1, Math.floor(h * bands));
    const r = Math.hypot(positions[i * 3] - cx, positions[i * 3 + 2] - cz);
    widest[band] = Math.max(widest[band], r);
  }
  return { height, minY, cx, cz, widest, maxAbs };
}

/** Height of the body's surface directly under the press axis — the honest
 * "did it squash under my finger" measure: a balloon's displaced volume
 * raises the rim, so global height barely moves while the crown dips. */
function crownHeight(world: ParticleWorld, cx: number, cz: number, minY: number): number {
  const positions = new Float32Array(world.particleCount * 3);
  world.readPositions(positions);
  let crown = minY;
  for (let i = 0; i < world.particleCount; i++) {
    const dx = positions[i * 3] - cx;
    const dz = positions[i * 3 + 2] - cz;
    if (dx * dx + dz * dz < 0.01 * 0.01) {
      crown = Math.max(crown, positions[i * 3 + 1]);
    }
  }
  return crown - minY;
}

describe('the particle slime', () => {
  const T = 60_000;
  it(
    'settles as a plump orb within budget',
    () => {
      const world = createPbdWorld();
      const start = performance.now();
      stepSeconds(world, 3);
      const ms = performance.now() - start;
      console.log(
        `pbd: ${world.particleCount} particles, 3 sim-seconds in ${ms.toFixed(0)}ms ` +
          `(${(ms / 180).toFixed(2)} ms per 60Hz frame)`
      );

      const s = silhouette(world);
      // On the floor, inside the box, and a BALL: tall relative to its
      // width (a gumdrop reads ~0.4, the orb holds ~0.6), with a real
      // waistline — the widest band beats the top band.
      expect(s.minY).toBeGreaterThan(FLOOR_Y - 0.002);
      expect(s.minY).toBeLessThan(FLOOR_Y + 0.006);
      expect(s.maxAbs).toBeLessThan(Math.max(BOX_HALF_X, BOX_HALF_Z));
      expect(s.height).toBeGreaterThan(0.016);
      expect(s.height).toBeLessThan(0.034);
      let widthMax = 0;
      for (const w of s.widest) widthMax = Math.max(widthMax, w);
      expect(s.height).toBeGreaterThan(2 * widthMax * 0.5);
      expect(widthMax).toBeGreaterThan(s.widest[5] * 1.1);

      // Frame budget: a 60 Hz frame of simulation must cost a small slice of
      // the 16 ms budget on CI-class hardware.
      expect(ms / 180).toBeLessThan(8);
    },
    T
  );

  it(
    'is the same orb after being set down upside down',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 2);
      world.flipForTest();
      stepSeconds(world, 6);

      const s = silhouette(world);
      expect(s.minY).toBeGreaterThan(FLOOR_Y - 0.002);
      expect(s.minY).toBeLessThan(FLOOR_Y + 0.006);
      expect(s.height).toBeGreaterThan(0.016);
      expect(s.height).toBeLessThan(0.034);
    },
    T
  );

  it(
    'a press squashes, and release springs back with no lasting dent',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 2);
      const rest = silhouette(world);
      const restCrown = crownHeight(world, rest.cx, rest.cz, rest.minY);

      // Press straight down on the crown for most of a second, aimed at
      // the body the way the pointer would be.
      for (let i = 0; i < 50; i++) {
        world.pushFrom(rest.cx, rest.minY + rest.height + 0.006, rest.cz, 0.028, 0.12);
        world.step(1 / 60);
      }
      // Measured at the moment the press ends — a water balloon does not
      // hold the dent for later. The crown under the finger dips even as
      // the displaced volume raises the rim.
      const pressed = silhouette(world);
      const pressedCrown = crownHeight(world, rest.cx, rest.cz, pressed.minY);
      expect(pressedCrown).toBeLessThan(restCrown * 0.93);

      // Released: springs back to a ball within a few seconds, and the
      // wobble never leaves it taller than it started.
      stepSeconds(world, 3);
      const sprung = silhouette(world);
      const sprungCrown = crownHeight(world, sprung.cx, sprung.cz, sprung.minY);
      expect(sprungCrown).toBeGreaterThan(restCrown * 0.88);
      expect(sprung.height).toBeLessThan(rest.height * 1.12);
    },
    T
  );

  it(
    'survives a violent shake-and-drop battery intact',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);

      // Yank the body around with the hand at full strength, changing
      // direction every few frames, then let go mid-swing. Three rounds.
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 90; i++) {
          const angle = i * 0.4 + round;
          world.pullTowards(
            Math.cos(angle) * 0.03,
            FLOOR_Y + 0.045,
            Math.sin(angle) * 0.02,
            0.025,
            Math.cos(angle + 1) * 1.5,
            Math.sin(angle * 1.7) * 1.5,
            Math.sin(angle + 2) * 1.5,
            1
          );
          world.step(1 / 60);
        }
        stepSeconds(world, 1.5);
      }

      const s = silhouette(world);
      // Still one coherent body in the box, on the floor.
      expect(s.maxAbs).toBeLessThan(Math.max(BOX_HALF_X, BOX_HALF_Z));
      expect(s.minY).toBeGreaterThan(FLOOR_Y - 0.002);
      expect(s.minY).toBeLessThan(FLOOR_Y + 0.01);
      expect(s.height).toBeGreaterThan(0.008);
      expect(s.height).toBeLessThan(0.045);

      // No NaNs anywhere — the classic mesh failure cannot happen, but pin it.
      const positions = new Float32Array(world.particleCount * 3);
      world.readPositions(positions);
      for (let i = 0; i < positions.length; i++) {
        expect(Number.isFinite(positions[i])).toBe(true);
      }
    },
    T
  );

  it(
    'can be lifted clear of the floor by the hand, and drops back',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      // Hold a pull upward above the crown for two seconds.
      for (let i = 0; i < 120; i++) {
        world.pullTowards(rest.cx, rest.minY + rest.height + 0.015, rest.cz, 0.028, 0, 0.5, 0, 1);
        world.step(1 / 60);
      }
      const held = silhouette(world);
      expect(held.minY).toBeGreaterThan(rest.minY + 0.004);

      stepSeconds(world, 4);
      const landed = silhouette(world);
      expect(landed.minY).toBeGreaterThan(FLOOR_Y - 0.002);
      expect(landed.minY).toBeLessThan(FLOOR_Y + 0.006);
    },
    T
  );

  it(
    'a rock is solid: a body lured across it never enters the stone',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      // A river stone half-buried right at the body's edge, then a lure that
      // drags the mound straight over it. Agate: worn smooth, no face cuts,
      // so penetration along the warped radial is well-defined everywhere.
      const rock = makeStone(stoneKindById('agate')!, 12345, 'medium');
      const rockX = rest.cx + 0.02;
      const rockY = FLOOR_Y + 0.003;
      world.setRocks([{ x: rockX, y: rockY, z: rest.cz, yaw: 0, stone: rock }]);
      world.setLure(rest.cx + 0.045, rest.cz);
      const p = new Float32Array(world.particleCount * 3);
      const surf: [number, number, number] = [0, 0, 0];
      let worstIn = 0;
      for (let s = 0; s < 8 * 60; s++) {
        world.step(1 / 60);
        world.readPositions(p);
        for (let i = 0; i < world.particleCount; i++) {
          // The solver's own inside test, replayed: compare the offset with
          // its surface point along the same warped radial.
          const lx = p[i * 3] - rockX;
          const ly = p[i * 3 + 1] - rockY;
          const lz = p[i * 3 + 2] - rest.cz;
          const wx = lx / rock.axes[0];
          const wy = ly / rock.axes[1];
          const wz = lz / rock.axes[2];
          const wl = Math.hypot(wx, wy, wz);
          if (wl <= 1e-9) continue;
          stoneSurface(rock, wx / wl, wy / wl, wz / wl, surf);
          worstIn = Math.max(
            worstIn,
            Math.hypot(surf[0], surf[1], surf[2]) - Math.hypot(lx, ly, lz)
          );
        }
      }
      // Never meaningfully inside (a substep's transit is allowed), and the
      // body is still finite goo afterwards.
      expect(worstIn).toBeLessThan(0.0015);
      const after = silhouette(world);
      expect(Number.isFinite(after.cx)).toBe(true);
      expect(after.height).toBeGreaterThan(0.008);
    },
    T
  );

  it(
    'asked onto a rock, the body climbs it and perches on top',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      // A basalt cobble a body-length away, and the lure parked on its
      // footprint — the "climb it" request. The grip-haul (ROCK_HAUL) is
      // what carries this; the corral's lean alone heaps against the flank
      // and stalls, which is exactly what this test pins against returning.
      const rock = makeStone(stoneKindById('basalt')!, 999, 'medium');
      const ext = stoneExtents(rock);
      const rockX = rest.cx + 0.035;
      const rockY = FLOOR_Y + ext[1] * 0.35;
      world.setRocks([{ x: rockX, y: rockY, z: rest.cz, yaw: 0, stone: rock }]);
      world.setLure(rockX, rest.cz, 1);
      stepSeconds(world, 15);

      const p = new Float32Array(world.particleCount * 3);
      world.readPositions(p);
      const footprint = Math.hypot(ext[0], ext[2]);
      let cx = 0;
      let onTop = 0;
      let maxY = -Infinity;
      for (let i = 0; i < world.particleCount; i++) {
        cx += p[i * 3];
        maxY = Math.max(maxY, p[i * 3 + 1]);
        const hx = p[i * 3] - rockX;
        const hz = p[i * 3 + 2] - rest.cz;
        if (Math.hypot(hx, hz) < footprint && p[i * 3 + 1] > rockY + ext[1] * 0.6) onTop += 1;
      }
      cx /= world.particleCount;

      // Perched: centred over the stone, a real crowd on its crown, and the
      // mound cresting above the rock's top — draped over it, not beside it.
      expect(Math.abs(cx - rockX)).toBeLessThan(footprint * 0.5);
      expect(onTop).toBeGreaterThan(world.particleCount * 0.1);
      expect(maxY).toBeGreaterThan(rockY + ext[1]);
    },
    T
  );

  it(
    'the play ball settles on the floor, and a body crawled into it bats it away',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      // Dropped from hand height just beside the body: it must bounce,
      // come to rest ON the floor (not in it, not hovering), and sleep.
      const ballR = 0.0075;
      const dropX = rest.cx + 0.028;
      world.setBall(dropX, FLOOR_Y + 0.05, rest.cz, ballR);
      stepSeconds(world, 3);
      const pose = new Float32Array(7);
      expect(world.readBall(pose)).toBe(true);
      expect(pose[1]).toBeGreaterThan(FLOOR_Y + ballR * 0.9);
      expect(pose[1]).toBeLessThan(FLOOR_Y + ballR * 1.4);
      const settledX = pose[0];
      const settledZ = pose[2];

      // Now the chase: lure the body straight through the ball's spot.
      world.setLure(settledX + 0.03, settledZ, 1.4);
      stepSeconds(world, 8);
      expect(world.readBall(pose)).toBe(true);
      // The toy was genuinely batted — it moved a body-scale distance —
      // and everything is still finite and inside the box.
      const scoot = Math.hypot(pose[0] - settledX, pose[2] - settledZ);
      expect(scoot).toBeGreaterThan(0.004);
      for (let i = 0; i < 7; i++) expect(Number.isFinite(pose[i])).toBe(true);
      expect(Math.abs(pose[0])).toBeLessThan(BOX_HALF_X);
      expect(Math.abs(pose[2])).toBeLessThan(BOX_HALF_Z);
      const after = silhouette(world);
      expect(after.height).toBeGreaterThan(0.008);
      expect(Number.isFinite(after.cx)).toBe(true);
    },
    T
  );

  it(
    'the ball is solid to the goo: particles never sink meaningfully inside it',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      // Park the ball at the body's rim and lure the body across it.
      const ballR = 0.0075;
      world.setBall(rest.cx + 0.018, FLOOR_Y + ballR, rest.cz, ballR);
      world.setLure(rest.cx + 0.045, rest.cz, 1.2);
      const p = new Float32Array(world.particleCount * 3);
      const pose = new Float32Array(7);
      let worstIn = 0;
      for (let s = 0; s < 6 * 60; s++) {
        world.step(1 / 60);
        world.readPositions(p);
        world.readBall(pose);
        for (let i = 0; i < world.particleCount; i++) {
          const dx = p[i * 3] - pose[0];
          const dy = p[i * 3 + 1] - pose[1];
          const dz = p[i * 3 + 2] - pose[2];
          worstIn = Math.max(worstIn, ballR - Math.hypot(dx, dy, dz));
        }
      }
      // Same allowance as the stone: a substep's transit, nothing lasting.
      expect(worstIn).toBeLessThan(0.0015);
    },
    T
  );

  it(
    'a hop pops the settled body off the floor and it lands as an orb',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);
      const rest = silhouette(world);

      world.hop(0.65);
      // The lowest particle must genuinely leave the ground — daylight
      // under the whole body, not a surface slosh.
      const p = new Float32Array(world.particleCount * 3);
      let maxClearance = 0;
      for (let s = 0; s < 60; s++) {
        world.step(1 / 60);
        world.readPositions(p);
        let minY = Infinity;
        for (let i = 0; i < world.particleCount; i++) {
          minY = Math.min(minY, p[i * 3 + 1]);
        }
        maxClearance = Math.max(maxClearance, minY - FLOOR_Y);
      }
      expect(maxClearance).toBeGreaterThan(0.004);

      // And the landing is a landing: back at rest, same orb, no shred.
      stepSeconds(world, 2);
      const after = silhouette(world);
      expect(after.minY).toBeLessThan(FLOOR_Y + 0.003);
      expect(after.height).toBeGreaterThan(rest.height * 0.8);
      expect(after.height).toBeLessThan(rest.height * 1.2);
      expect(Number.isFinite(after.cx)).toBe(true);
    },
    T
  );

  it(
    'a hop asked of an airborne body fizzles: no double jump',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1.5);

      world.hop(0.5);
      stepSeconds(world, 0.1); // launched, on the way up
      world.hop(0.5); // greedy second ask, mid-air
      const p = new Float32Array(world.particleCount * 3);
      let peak = -Infinity;
      for (let s = 0; s < 90; s++) {
        world.step(1 / 60);
        world.readPositions(p);
        let minY = Infinity;
        for (let i = 0; i < world.particleCount; i++) {
          minY = Math.min(minY, p[i * 3 + 1]);
        }
        peak = Math.max(peak, minY - FLOOR_Y);
      }
      // v²/2g for the capped single hop is ~13 mm; a stacked double would
      // clear far more. Generous margin for solver slosh.
      expect(peak).toBeLessThan(0.02);
    },
    T
  );

  it(
    'a thrown ball flies its arc, bounces, and comes to rest in the box',
    () => {
      const world = createPbdWorld();
      stepSeconds(world, 1);

      // A hard fling toward the far wall from near this one.
      const ballR = 0.0075;
      world.setBall(-BOX_HALF_X + 0.02, FLOOR_Y + 0.05, 0, ballR, 0.6, 0.25, 0);
      const pose = new Float32Array(7);
      let maxX = -Infinity;
      for (let s = 0; s < 6 * 60; s++) {
        world.step(1 / 60);
        expect(world.readBall(pose)).toBe(true);
        maxX = Math.max(maxX, pose[0]);
        // Always inside the box, never through the floor.
        expect(Math.abs(pose[0])).toBeLessThanOrEqual(BOX_HALF_X - ballR + 1e-6);
        expect(Math.abs(pose[2])).toBeLessThanOrEqual(BOX_HALF_Z - ballR + 1e-6);
        expect(pose[1]).toBeGreaterThan(FLOOR_Y + ballR * 0.9);
      }
      // It genuinely crossed the tank (a throw, not a dribble)…
      expect(maxX).toBeGreaterThan(BOX_HALF_X - ballR - 0.002);
      // …and six seconds on it is parked on the floor, finite.
      expect(pose[1]).toBeLessThan(FLOOR_Y + ballR * 1.4);
      for (let i = 0; i < 7; i++) expect(Number.isFinite(pose[i])).toBe(true);
    },
    T
  );

  it(
    'a kicked ball hops away from where it sat, and settles again',
    () => {
      const world = createPbdWorld();
      const ballR = 0.0075;
      world.setBall(0.03, FLOOR_Y + ballR, 0.02, ballR);
      stepSeconds(world, 1.5);
      const pose = new Float32Array(7);
      world.readBall(pose);
      const sx = pose[0];
      const sz = pose[2];

      world.kickBall(-0.2, 0.3, 0.1);
      let peak = -Infinity;
      for (let s = 0; s < 4 * 60; s++) {
        world.step(1 / 60);
        world.readBall(pose);
        peak = Math.max(peak, pose[1]);
      }
      // It jumped (a 0.3 m/s boot tops out at v²/2g ≈ 4.6 mm over where it
      // sat) and landed somewhere else.
      expect(peak).toBeGreaterThan(FLOOR_Y + ballR + 0.003);
      expect(Math.hypot(pose[0] - sx, pose[2] - sz)).toBeGreaterThan(0.01);
      expect(pose[1]).toBeLessThan(FLOOR_Y + ballR * 1.4);
    },
    T
  );
});
