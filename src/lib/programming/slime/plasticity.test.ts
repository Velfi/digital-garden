import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh } from './eggMesh';
import { createInteraction, type PointerRay } from './interaction';
import { createTerrariumWorld } from './joltWorld';

/**
 * The beanbag property, pinned: deformation past the yield *sticks* for a
 * beat (plastic flow), then the body slowly remembers its built shape
 * (recovery). An elastic body fails the first half — it re-plumps the moment
 * the finger leaves; a purely plastic one fails the second — it never
 * re-plumps at all. The material lives between, and these brackets hold it
 * there.
 */

let J: typeof Jolt;
beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

const downRay = (y: number): PointerRay => ({ origin: [0, y, 0], dir: [0, -1, 0] });

describe('viscoplasticity', () => {
  it('a deep poke lingers, then heals', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    const hand = createInteraction(world, slime, egg);
    for (let i = 0; i < 360; i++) world.step(SIM_STEP_SEC);

    const positions = new Float32Array(egg.vertexCount * 3);
    const apexHeight = () => {
      world.readSlimeVertices(slime, positions);
      return positions[1];
    };
    const restingApex = apexHeight();

    // A deep press, held for two seconds — long enough for the strain to
    // flow into the rest lengths.
    const rayTop = 0.1;
    hand.press(downRay(rayTop), [0, 0], egg.yolkFaceStart, rayTop - restingApex);
    for (let i = 0; i < 240; i++) {
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    const pressedApex = apexHeight();
    expect(pressedApex).toBeLessThan(restingApex - 0.003);
    hand.release();

    // Half a second later the dent is still visibly there: the squash stuck.
    // An elastic body had recovered to within a millimetre by now.
    for (let i = 0; i < 60; i++) world.step(SIM_STEP_SEC);
    const lingering = apexHeight();
    expect(lingering).toBeLessThan(restingApex - 0.0015);

    // Ten seconds on, the body has remembered most of its shape.
    for (let i = 0; i < 1200; i++) world.step(SIM_STEP_SEC);
    const healed = apexHeight();
    expect(healed).toBeGreaterThan(restingApex - 0.004);
    expect(healed).toBeGreaterThan(lingering + 0.0005);

    world.dispose();
  });

  it('rest lengths never leave their clamps, and settle drift stays small', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.03, 0]);
    // A drop plus a settle: plenty of yielding.
    for (let i = 0; i < 720; i++) world.step(SIM_STEP_SEC);

    for (let e = 0; e < slime.plasticEdgeBase.length; e++) {
      const ratio = slime.plasticEdgeCurrent[e] / slime.plasticEdgeBase[e];
      expect(ratio).toBeGreaterThanOrEqual(0.6 - 1e-6);
      expect(ratio).toBeLessThanOrEqual(1.55 + 1e-6);
    }
    // At rest, the learned shape hovers near the built one — the pass has
    // converged and gone quiet, not wandered.
    let worst = 0;
    for (let i = 0; i < slime.plasticSpokeBase.length; i++) {
      worst = Math.max(worst, Math.abs(slime.plasticSpokeCurrent[i] / slime.plasticSpokeBase[i] - 1));
    }
    expect(worst).toBeLessThan(0.2);

    world.dispose();
  });
});
