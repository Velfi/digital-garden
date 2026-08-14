import { beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh, volumeOf, type EggMesh } from './eggMesh';
import { createInteraction, type Interaction } from './interaction';
import { createTerrariumWorld, type SlimeBody, type TerrariumWorld } from './joltWorld';

/**
 * The gesture battery: production tuning against every way a player has
 * actually broken the slime — whips at three tempos, carried drops from two
 * heights, a fast floor drag, and a free fall (each of these shredded or
 * launched the mesh at some point during tuning; the drops and the free
 * fall are different code paths and have failed independently). The
 * stability landscape near the cliff is chaotic, so no single gesture is
 * proof — the battery passes only when *every* gesture leaves a healthy
 * slime standing on the floor.
 *
 * This file grew out of the tuning sweep; the per-config scaffolding lives
 * on in git history for the next retune.
 */

let J: typeof Jolt;
beforeAll(async () => {
  J = await loadJolt();
}, 60_000);

interface Rig {
  world: TerrariumWorld;
  egg: EggMesh;
  slime: SlimeBody;
  hand: Interaction;
  positions: Float32Array;
}

function makeRig(spawnHeight = FLOOR_Y + 0.002): Rig {
  const world = createTerrariumWorld(J);
  const egg = buildEggMesh();
  const slime = world.addSlime(egg, [0, spawnHeight, 0]);
  const hand = createInteraction(world, slime, egg);
  return { world, egg, slime, hand, positions: new Float32Array(egg.vertexCount * 3) };
}

interface Frame {
  minY: number;
  height: number;
  maxAbs: number;
  vol: number;
}

function measure(r: Rig): Frame {
  r.world.readSlimeVertices(r.slime, r.positions);
  let minY = Infinity;
  let maxY = -Infinity;
  let maxAbs = 0;
  for (let i = 0; i < r.egg.vertexCount; i++) {
    minY = Math.min(minY, r.positions[i * 3 + 1]);
    maxY = Math.max(maxY, r.positions[i * 3 + 1]);
    maxAbs = Math.max(maxAbs, Math.abs(r.positions[i * 3]), Math.abs(r.positions[i * 3 + 2]));
  }
  const vol =
    volumeOf({ positions: r.positions, faces: r.egg.faces, faceCount: r.egg.faceCount }) /
    r.slime.restVolume;
  return { minY, height: maxY - minY, maxAbs, vol };
}

const steps = (r: Rig, n: number, withHand = false) => {
  for (let i = 0; i < n; i++) {
    if (withHand) r.hand.step(SIM_STEP_SEC);
    r.world.step(SIM_STEP_SEC);
  }
};

const down = (x: number, y: number) =>
  ({ origin: [x, y, 0], dir: [0, -1, 0] }) as const;

function apexY(r: Rig): number {
  r.world.readSlimeVertices(r.slime, r.positions);
  let top = -Infinity;
  for (let i = 0; i < r.egg.vertexCount; i++) top = Math.max(top, r.positions[i * 3 + 1]);
  return top;
}

/** Grab at the apex, lift, whip, release. The killer gesture, parameterised. */
function whip(r: Rig, hz: number, ampM: number, releasePhase: number): void {
  const rayTop = 0.1;
  r.hand.press(down(0, rayTop), [0, 0], r.egg.yolkFaceStart, rayTop - apexY(r));
  r.hand.move(down(0, rayTop), [0.2, 0]);
  r.hand.move(down(0, rayTop + 0.03), [0.2, 0.2]);
  steps(r, 60, true);
  const total = Math.round((1 / hz) * (2 + releasePhase) / SIM_STEP_SEC);
  for (let i = 0; i < total; i++) {
    const sweep = Math.sin(i * SIM_STEP_SEC * Math.PI * 2 * hz) * ampM;
    r.hand.move(down(sweep, rayTop + 0.03), [0.2 + sweep, 0.2]);
    r.hand.step(SIM_STEP_SEC);
    r.world.step(SIM_STEP_SEC);
  }
  r.hand.release();
  steps(r, Math.round(2 / SIM_STEP_SEC));
}

/** Carry it up high, let it fall. */
function dropFrom(r: Rig, heightM: number): void {
  const rayTop = 0.1;
  r.hand.press(down(0, rayTop), [0, 0], r.egg.yolkFaceStart, rayTop - apexY(r));
  r.hand.move(down(0, rayTop), [0.2, 0]);
  r.hand.move(down(0, rayTop + heightM), [0.2, 0.2]);
  steps(r, 90, true);
  r.hand.release();
  steps(r, Math.round(2 / SIM_STEP_SEC));
}

/** Grab low, haul across the floor fast, let go mid-motion. */
function floorDrag(r: Rig): void {
  const rimFace = 200;
  r.world.readSlimeVertices(r.slime, r.positions);
  const rimY = r.positions[r.egg.faces[rimFace * 3] * 3 + 1];
  const rayTop = 0.1;
  r.hand.press(down(0, rayTop), [0, 0], rimFace, rayTop - rimY);
  r.hand.move(down(0, rayTop), [0.3, 0]);
  const dragSteps = Math.round(0.4 / SIM_STEP_SEC);
  for (let i = 0; i < dragSteps; i++) {
    const x = -0.04 + (i / dragSteps) * 0.08;
    r.hand.move(down(x, rayTop), [0.3 + x, 0]);
    r.hand.step(SIM_STEP_SEC);
    r.world.step(SIM_STEP_SEC);
  }
  r.hand.release();
  steps(r, Math.round(2 / SIM_STEP_SEC));
}

const GESTURES: Array<[string, (r: Rig) => void]> = [
  ['whip2.5', (r) => whip(r, 2.5, 0.03, 0)],
  ['whip3.5', (r) => whip(r, 3.5, 0.025, 0.25)],
  ['whip2.0', (r) => whip(r, 2.0, 0.035, 0.5)],
  ['drop40', (r) => dropFrom(r, 0.04)],
  ['drop70', (r) => dropFrom(r, 0.07)],
  ['drag', (r) => floorDrag(r)]
];

/** Did the last gesture leave a healthy slime standing on the floor? */
function healthy(f: Frame): boolean {
  return (
    f.maxAbs < 0.07 && f.height > 0.012 && f.height < 0.034 && f.vol > 0.5 && f.vol < 2.2
  );
}

/** Seconds after a 40 mm drop until the worst per-step move stays calm. */
function ringDown(r: Rig): number {
  dropFrom(r, 0.04);
  // dropFrom already ran 2 s of aftermath; measure from here.
  const prev = new Float32Array(r.positions.length);
  let calm = 0;
  const need = Math.round(0.25 / SIM_STEP_SEC);
  const cap = Math.round(6 / SIM_STEP_SEC);
  for (let i = 0; i < cap; i++) {
    r.world.readSlimeVertices(r.slime, prev);
    r.world.step(SIM_STEP_SEC);
    r.world.readSlimeVertices(r.slime, r.positions);
    let worst = 0;
    for (let k = 0; k < prev.length; k++) {
      worst = Math.max(worst, Math.abs(r.positions[k] - prev[k]));
    }
    calm = worst < 0.00002 ? calm + 1 : 0;
    if (calm >= need) return (i - need) * SIM_STEP_SEC;
  }
  return 6;
}

/** Did the last gesture leave a healthy slime standing on the floor? */
function healthyEnd(f: Frame): boolean {
  return f.maxAbs < 0.07 && f.height > 0.012 && f.height < 0.034 && f.vol > 0.5 && f.vol < 2.2;
}

describe('the gesture battery', () => {
  it('rests, stops ringing, and can actually be lifted', () => {
    const r = makeRig();
    steps(r, 360);
    const rest = measure(r);
    // Standing slime-shaped on the substrate, holding its volume.
    expect(rest.height).toBeGreaterThan(0.018);
    expect(rest.height).toBeLessThan(0.028);
    expect(rest.vol).toBeGreaterThan(0.85);
    expect(rest.vol).toBeLessThan(1.2);
    // A drop stops ringing fast — the "constant shaking" regression.
    expect(ringDown(r)).toBeLessThan(1.5);
    r.world.dispose();

    // The grip must genuinely lift: a grip too weak to raise the body once
    // passed a whole tuning sweep by making every drop gesture vacuous.
    const lifted = makeRig();
    steps(lifted, 300);
    const rayTop = 0.1;
    lifted.hand.press(
      down(0, rayTop),
      [0, 0],
      lifted.egg.yolkFaceStart,
      rayTop - apexY(lifted)
    );
    lifted.hand.move(down(0, rayTop), [0.2, 0]);
    lifted.hand.move(down(0, rayTop + 0.04), [0.2, 0.2]);
    steps(lifted, 120, true);
    expect(measure(lifted).minY).toBeGreaterThan(FLOOR_Y + 0.01);
    lifted.world.dispose();
  });

  it('survives the free fall', () => {
    const r = makeRig(FLOOR_Y + 0.05);
    steps(r, Math.round(3 / SIM_STEP_SEC));
    expect(healthyEnd(measure(r))).toBe(true);
    expect(r.slime.rollbacks).toBe(0);
    r.world.dispose();
  });

  for (const [name, gesture] of GESTURES) {
    it(`survives ${name}`, () => {
      const r = makeRig();
      steps(r, 300);
      gesture(r);
      steps(r, Math.round(1 / SIM_STEP_SEC));
      expect(healthyEnd(measure(r))).toBe(true);
      r.world.dispose();
    });
  }
});
