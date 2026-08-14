import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh } from './eggMesh';
import { createInteraction, type PointerRay } from './interaction';
import { createTerrariumWorld } from './joltWorld';

/**
 * The hand, against a real soft body. These run the entire gesture through
 * the production code path — press, the poke-to-grab promotion, the carried
 * lift, the release — and assert what a visitor would see: the slime comes
 * off the floor in the hand and comes back to rest out of it.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

function downRay(originY: number): PointerRay {
  return { origin: [0, originY, 0], dir: [0, -1, 0] };
}

describe('poking and grabbing', () => {
  it('lifts the slime when grabbed and raised, and settles it when released', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    const hand = createInteraction(world, slime, egg);

    // Let it land first.
    for (let i = 0; i < 240; i++) world.step(SIM_STEP_SEC);

    const positions = new Float32Array(egg.vertexCount * 3);
    const minY = () => {
      world.readSlimeVertices(slime, positions);
      let lowest = Infinity;
      for (let i = 0; i < egg.vertexCount; i++) {
        lowest = Math.min(lowest, positions[i * 3 + 1]);
      }
      return lowest;
    };

    // Press straight down onto the apex, hit distance measured to where the
    // apex actually settled — the way the scene's raycast would find it.
    world.readSlimeVertices(slime, positions);
    const rayTop = 0.1;
    const hitDistance = rayTop - positions[1];
    hand.press(downRay(rayTop), [0, 0], egg.yolkFaceStart, hitDistance);
    expect(hand.state()).toBe('poking');

    // Drag well past the threshold: the press becomes a grab.
    hand.move(downRay(rayTop), [0.2, 0]);
    expect(hand.state()).toBe('grabbing');

    // Raise the hand 30 mm and give the spring a second to carry the slime
    // up. The anchor follows the ray's origin because the hit distance along
    // it is fixed — the same reason a real pointer lift lifts.
    hand.move(downRay(rayTop + 0.03), [0.2, 0.2]);
    for (let i = 0; i < 120; i++) {
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    // Held aloft: even its lowest point has left the substrate.
    expect(minY()).toBeGreaterThan(FLOOR_Y + 0.01);

    // Let go, let it fall and resettle.
    hand.release();
    expect(hand.state()).toBe('idle');
    for (let i = 0; i < 600; i++) world.step(SIM_STEP_SEC);
    expect(minY()).toBeGreaterThan(FLOOR_Y - 0.002);
    expect(minY()).toBeLessThan(FLOOR_Y + 0.003);

    world.dispose();
  });

  it('dragging along the floor stays glitch-free: nothing leaves the box', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    const hand = createInteraction(world, slime, egg);
    for (let i = 0; i < 240; i++) world.step(SIM_STEP_SEC);

    const positions = new Float32Array(egg.vertexCount * 3);
    const bounds = () => {
      world.readSlimeVertices(slime, positions);
      let minY = Infinity;
      let maxAbs = 0;
      for (let i = 0; i < egg.vertexCount; i++) {
        minY = Math.min(minY, positions[i * 3 + 1]);
        maxAbs = Math.max(maxAbs, Math.abs(positions[i * 3]), Math.abs(positions[i * 3 + 2]));
      }
      return { minY, maxAbs };
    };

    // Grab a low face — the white's rim, near the floor — and haul it from
    // side to side at floor height for two seconds. This was a real glitch:
    // pinned vertices written under the floor crushed the body against it.
    const rimFace = 200;
    const rayTop = 0.1;
    world.readSlimeVertices(slime, positions);
    const rimVert = egg.faces[rimFace * 3];
    const rimY = positions[rimVert * 3 + 1];
    hand.press(downRay(rayTop), [0, 0], rimFace, rayTop - rimY);
    hand.move(downRay(rayTop), [0.3, 0]);
    expect(hand.state()).toBe('grabbing');

    for (let i = 0; i < 240; i++) {
      // The pointer sweeps the box: the ray's origin slides ±3 cm.
      const sweep = Math.sin((i / 240) * Math.PI * 4) * 0.03;
      hand.move({ origin: [sweep, rayTop, 0], dir: [0, -1, 0] }, [0.3 + sweep, 0]);
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);

      const { minY, maxAbs } = bounds();
      expect(minY).toBeGreaterThan(FLOOR_Y - 0.003);
      expect(maxAbs).toBeLessThan(0.08);
    }

    hand.release();
    for (let i = 0; i < 600; i++) world.step(SIM_STEP_SEC);
    const { minY, maxAbs } = bounds();
    expect(minY).toBeGreaterThan(FLOOR_Y - 0.002);
    expect(minY).toBeLessThan(FLOOR_Y + 0.004);
    expect(maxAbs).toBeLessThan(0.062);

    world.dispose();
  });

  it('a poke dents without displacing: the slime stays put and recovers', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    const hand = createInteraction(world, slime, egg);

    for (let i = 0; i < 240; i++) world.step(SIM_STEP_SEC);

    const positions = new Float32Array(egg.vertexCount * 3);
    const apexHeight = () => {
      world.readSlimeVertices(slime, positions);
      // Vertex 0 is the apex by construction.
      return positions[1];
    };
    const restingApex = apexHeight();

    // Hit distance measured to where the apex actually is after settling, the
    // way the scene's raycast would find it.
    const rayTop = 0.1;
    hand.press(downRay(rayTop), [0, 0], egg.yolkFaceStart, rayTop - restingApex);

    // Hold the press for a second: the finger eases in and the dome gives.
    for (let i = 0; i < 120; i++) {
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    const pressedApex = apexHeight();
    expect(pressedApex).toBeLessThan(restingApex - 0.002);

    // Off, and the pressure plumps it most of the way back inside a second.
    hand.release();
    for (let i = 0; i < 240; i++) world.step(SIM_STEP_SEC);
    expect(apexHeight()).toBeGreaterThan(restingApex - 0.003);

    world.dispose();
  });
});
