import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh, volumeOf, type EggMesh } from './eggMesh';
import { createTerrariumWorld, type SlimeBody, type TerrariumWorld } from './joltWorld';

/**
 * The terrarium, on Jolt.
 *
 * Following the marimo's `joltWorld.test.ts`: these are tests of the bindings
 * and the tuning, not of Jolt's solver — invariants a wiring mistake would
 * break, asserted as brackets rather than exact floats. The soft body is the
 * new ground: a pressurised closed mesh with hand-built constraints has
 * several quiet ways to be wrong (inward winding, a leaked edge, a bad
 * compliance scale), and every one of them fails the settle test below.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

function settle(world: TerrariumWorld, steps: number): number {
  const start = performance.now();
  for (let i = 0; i < steps; i++) world.step(SIM_STEP_SEC);
  return performance.now() - start;
}

function worldVolume(egg: EggMesh, positions: Float32Array): number {
  return volumeOf({ positions, faces: egg.faces, faceCount: egg.faceCount });
}

describe('the slime soft body', () => {
  it('settles onto the floor, in the box, near its rest volume', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime: SlimeBody = world.addSlime(egg, [0, FLOOR_Y + 0.004, 0]);

    // Four simulated seconds, and a step-rate readout while we are here: the
    // budget conversation (verts × iterations × Hz) wants a number, and this
    // is the one place physics runs with nothing else on the clock.
    const ms = settle(world, 480);
    console.log(`slime step: ${(ms / 480).toFixed(3)} ms over 480 steps`);

    const positions = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, positions);

    let minY = Infinity;
    let maxY = -Infinity;
    let maxR = 0;
    for (let i = 0; i < egg.vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      maxR = Math.max(maxR, Math.abs(x), Math.abs(z));
    }

    // Resting on the substrate: the underside is at the floor within the
    // contact skin, not hovering, not through it.
    expect(minY).toBeGreaterThan(FLOOR_Y - 0.002);
    expect(minY).toBeLessThan(FLOOR_Y + 0.003);
    // Inside the glass.
    expect(maxR).toBeLessThan(Math.max(BOX_HALF_X, BOX_HALF_Z));
    // Still slime-sized and slime-shaped: a blown-up balloon or a punctured
    // one both leave this bracket. Height may sag or plump a little.
    expect(maxY - minY).toBeGreaterThan(0.008);
    expect(maxY - minY).toBeLessThan(0.028);

    // Pressure holds the enclosed volume near rest — within a third either
    // way. Inward winding fails this at zero; runaway pressure fails it high.
    const volume = worldVolume(egg, positions);
    const rest = volumeOf(egg);
    expect(volume).toBeGreaterThan(rest * 0.67);
    expect(volume).toBeLessThan(rest * 1.33);

    world.dispose();
  });

  it('stays settled: another simulated minute moves nothing visibly', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.004, 0]);
    settle(world, 480);

    const before = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, before);
    settle(world, 1200);
    const after = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, after);

    let worst = 0;
    for (let i = 0; i < before.length; i++) {
      worst = Math.max(worst, Math.abs(after[i] - before[i]));
    }
    // "Standing still" loosened for the viscoplastic body: gravity-aligned
    // recovery keeps re-flowing the goo gently for tens of seconds, and a
    // few millimetres of creep is the material working, not a fault. The
    // old 1 mm bracket encoded the elastic body's instant equilibrium.
    expect(worst).toBeLessThan(0.005);

    world.dispose();
  });

  it('carries the whole menagerie: slime, ten critters, three hulls', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    world.addSlime(egg, [0, FLOOR_Y + 0.004, 0]);
    // Three coarse tetrahedron-ish hulls standing in for the rocks.
    for (let k = 0; k < 3; k++) {
      const cx = -0.03 + k * 0.03;
      world.addStaticHull(
        new Float32Array([0.006, 0, 0, -0.006, 0, 0.004, -0.006, 0, -0.004, 0, 0.006, 0]),
        [cx, FLOOR_Y, 0.03],
        k
      );
    }
    const critters = Array.from({ length: 10 }, (_, i) =>
      world.addCritter(0.0012, [-0.045 + i * 0.01, FLOOR_Y + 0.01, -0.03])
    );
    settle(world, 480);
    // Everyone came to rest inside the box, above the floor — and rest
    // means rest: the sleep policy has put (nearly) all of them under.
    const pos: [number, number, number] = [0, 0, 0];
    const quat: [number, number, number, number] = [0, 0, 0, 1];
    let asleep = 0;
    for (const c of critters) {
      world.readPose(c, pos, quat);
      expect(pos[1]).toBeGreaterThan(FLOOR_Y - 0.001);
      expect(pos[1]).toBeLessThan(FLOOR_Y + 0.01);
      expect(Math.abs(pos[0])).toBeLessThanOrEqual(BOX_HALF_X + 0.002);
      expect(Math.abs(pos[2])).toBeLessThanOrEqual(BOX_HALF_Z + 0.002);
      if (!c.body.IsActive()) asleep += 1;
    }
    expect(asleep).toBeGreaterThanOrEqual(8);
    world.dispose();
  });
});
