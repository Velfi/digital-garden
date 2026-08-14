import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh } from './eggMesh';
import { createTerrariumWorld } from './joltWorld';

let J: typeof Jolt;
beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

describe('resting silhouette probe', () => {
  it('prints width by height after a settle', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    for (let i = 0; i < 1200; i++) world.step(SIM_STEP_SEC);

    const positions = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, positions);

    // Bucket the surface by height above the floor; report the widest radius
    // in each band. The built shape is widest at the very bottom — if the
    // settled one is widest up top, the physics itself makes the bowl.
    const bands = 8;
    let maxY = -Infinity;
    for (let i = 0; i < egg.vertexCount; i++) {
      maxY = Math.max(maxY, positions[i * 3 + 1]);
    }
    const height = maxY - FLOOR_Y;
    const widest = new Float32Array(bands);
    for (let i = 0; i < egg.vertexCount; i++) {
      const h = (positions[i * 3 + 1] - FLOOR_Y) / height;
      const band = Math.min(bands - 1, Math.floor(h * bands));
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
      widest[band] = Math.max(widest[band], r);
    }
    console.log(`settled height ${(height * 1000).toFixed(1)}mm`);
    for (let b = 0; b < bands; b++) {
      const bar = '#'.repeat(Math.round(widest[b] * 1000));
      console.log(
        `band ${b} (${((b / bands) * 100).toFixed(0)}–${(((b + 1) / bands) * 100).toFixed(0)}%h): ` +
          `r=${(widest[b] * 1000).toFixed(1)}mm ${bar}`
      );
    }
    world.dispose();
  });

  it('re-forms the same silhouette after being set down upside down', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    for (let i = 0; i < 600; i++) world.step(SIM_STEP_SEC);

    // Flip it: every vertex mirrored through the body's mid-height, then
    // dropped back onto the floor. The crown vertices are now underneath.
    world.flipSlimeForTest(slime);
    for (let i = 0; i < 2400; i++) world.step(SIM_STEP_SEC); // 20 s to re-form

    const positions = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, positions);
    const bands = 6;
    let maxY = -Infinity;
    for (let i = 0; i < egg.vertexCount; i++) maxY = Math.max(maxY, positions[i * 3 + 1]);
    const height = maxY - FLOOR_Y;
    const widest = new Float32Array(bands);
    for (let i = 0; i < egg.vertexCount; i++) {
      const h = (positions[i * 3 + 1] - FLOOR_Y) / height;
      const band = Math.min(bands - 1, Math.floor(h * bands));
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
      widest[band] = Math.max(widest[band], r);
    }
    for (let b = 0; b < bands; b++) {
      console.log(`flipped band ${b}: r=${(widest[b] * 1000).toFixed(1)}mm`);
    }
    // The slime property: widest at the floor, narrowing upward — even
    // though the mesh's built "base" is now on top.
    expect(widest[0]).toBeGreaterThan(widest[bands - 1] * 1.4);
    expect(widest[1]).toBeGreaterThan(widest[bands - 2] * 1.05);

    world.dispose();
  });
});
