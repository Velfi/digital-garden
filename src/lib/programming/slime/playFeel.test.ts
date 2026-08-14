import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh, volumeOf, type EggMesh } from './eggMesh';
import { createInteraction, type PointerRay } from './interaction';
import { createTerrariumWorld, type SlimeBody, type TerrariumWorld } from './joltWorld';

/**
 * The play-feel bench: real gestures through the production path, with the
 * numbers printed rather than pinned.
 *
 * The other test files assert invariants; this one *measures the toy*. Each
 * scenario is a thing a player actually does — drop it, poke it, shake it,
 * throw it — and the console output is the feel report: how flat it splats,
 * how long it wobbles, how far it flies. The assertions here are only the
 * explosion net (stays in the box, volume stays meaningful, comes back to
 * rest), so the bench doubles as a regression test for the failure mode that
 * actually matters while tuning: a gesture that shreds the mesh.
 *
 * Run it alone for a feel report:
 *   npx vitest run src/lib/programming/slime/playFeel.test.ts
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

interface Rig {
  world: TerrariumWorld;
  egg: EggMesh;
  slime: SlimeBody;
  positions: Float32Array;
}

function rig(spawnHeight = FLOOR_Y + 0.002): Rig {
  const world = createTerrariumWorld(J);
  const egg = buildEggMesh();
  const slime = world.addSlime(egg, [0, spawnHeight, 0]);
  return { world, egg, slime, positions: new Float32Array(egg.vertexCount * 3) };
}

interface Frame {
  minY: number;
  maxY: number;
  height: number;
  /** Widest horizontal reach from the centroid, metres. */
  spread: number;
  centre: [number, number, number];
  maxAbsX: number;
  maxAbsZ: number;
  volumeRatio: number;
}

function measure(r: Rig): Frame {
  r.world.readSlimeVertices(r.slime, r.positions);
  const n = r.egg.vertexCount;
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let maxAbsX = 0;
  let maxAbsZ = 0;
  for (let i = 0; i < n; i++) {
    const x = r.positions[i * 3];
    const y = r.positions[i * 3 + 1];
    const z = r.positions[i * 3 + 2];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    cx += x;
    cy += y;
    cz += z;
    maxAbsX = Math.max(maxAbsX, Math.abs(x));
    maxAbsZ = Math.max(maxAbsZ, Math.abs(z));
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let spread = 0;
  for (let i = 0; i < n; i++) {
    const dx = r.positions[i * 3] - cx;
    const dz = r.positions[i * 3 + 2] - cz;
    spread = Math.max(spread, Math.hypot(dx, dz));
  }
  const volume = volumeOf({
    positions: r.positions,
    faces: r.egg.faces,
    faceCount: r.egg.faceCount
  });
  return {
    minY,
    maxY,
    height: maxY - minY,
    spread,
    centre: [cx, cy, cz],
    maxAbsX,
    maxAbsZ,
    volumeRatio: volume / r.slime.restVolume
  };
}

/** The explosion net. Every scenario runs inside it, every step. */
function assertIntact(f: Frame): void {
  expect(f.maxAbsX).toBeLessThan(BOX_HALF_X + 0.01);
  expect(f.maxAbsZ).toBeLessThan(BOX_HALF_Z + 0.01);
  expect(f.minY).toBeGreaterThan(FLOOR_Y - 0.01);
  expect(f.maxY).toBeLessThan(FLOOR_Y + 0.12);
  expect(f.volumeRatio).toBeGreaterThan(-0.5);
  expect(f.volumeRatio).toBeLessThan(3);
}

function run(r: Rig, steps: number, each?: (f: Frame, i: number) => void): void {
  for (let i = 0; i < steps; i++) {
    r.world.step(SIM_STEP_SEC);
    const f = measure(r);
    assertIntact(f);
    each?.(f, i);
  }
}

function runWithHand(
  r: Rig,
  hand: ReturnType<typeof createInteraction>,
  steps: number,
  each?: (f: Frame, i: number) => void
): void {
  for (let i = 0; i < steps; i++) {
    hand.step(SIM_STEP_SEC);
    r.world.step(SIM_STEP_SEC);
    const f = measure(r);
    assertIntact(f);
    each?.(f, i);
  }
}

function settleTime(r: Rig, maxSec = 6): number {
  // Settled = the whole vertex cloud stops moving: worst per-step displacement
  // under a twentieth of a millimetre for a quarter second straight.
  const before = new Float32Array(r.positions.length);
  let calmSteps = 0;
  const need = Math.round(0.25 / SIM_STEP_SEC);
  const cap = Math.round(maxSec / SIM_STEP_SEC);
  for (let i = 0; i < cap; i++) {
    before.set(r.positions);
    r.world.step(SIM_STEP_SEC);
    const f = measure(r);
    assertIntact(f);
    let worst = 0;
    for (let k = 0; k < before.length; k++) {
      worst = Math.max(worst, Math.abs(r.positions[k] - before[k]));
    }
    calmSteps = worst < 0.00005 ? calmSteps + 1 : 0;
    if (calmSteps >= need) return (i - need) * SIM_STEP_SEC;
  }
  return maxSec;
}

/**
 * Oscillation read-out from a time series: peak-to-peak count and the decay
 * from the first swing to the last, plus a frequency from zero crossings of
 * the detrended tail.
 */
function wobbleOf(samples: number[]): { cycles: number; hz: number; decay: number } {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const detrended = samples.map((s) => s - mean);
  let crossings = 0;
  for (let i = 1; i < detrended.length; i++) {
    if (detrended[i - 1] < 0 !== detrended[i] < 0) crossings++;
  }
  const seconds = samples.length * SIM_STEP_SEC;
  const hz = crossings / 2 / seconds;
  const firstHalf = detrended.slice(0, Math.floor(detrended.length / 2));
  const secondHalf = detrended.slice(Math.floor(detrended.length / 2));
  const amp = (xs: number[]) => Math.max(...xs.map(Math.abs));
  const decay = amp(secondHalf) / Math.max(1e-9, amp(firstHalf));
  return { cycles: crossings / 2, hz, decay };
}

const mm = (m: number) => (m * 1000).toFixed(1);

describe('play feel', () => {
  it('drop from 40 mm: splat, recover, settle', () => {
    const r = rig(FLOOR_Y + 0.04);
    const restHeight = 0.024;

    let squashiest = Infinity;
    let widest = 0;
    let minVolume = Infinity;
    let maxVolume = 0;
    let landedAt = -1;
    run(r, Math.round(1.2 / SIM_STEP_SEC), (f, i) => {
      if (landedAt < 0 && f.minY < FLOOR_Y + 0.003) landedAt = i;
      if (landedAt >= 0) {
        squashiest = Math.min(squashiest, f.height);
        widest = Math.max(widest, f.spread);
        minVolume = Math.min(minVolume, f.volumeRatio);
        maxVolume = Math.max(maxVolume, f.volumeRatio);
      }
    });
    const settled = settleTime(r);
    const final = measure(r);

    console.log(
      `[drop 40mm] squash to ${mm(squashiest)}mm of ${mm(restHeight)}mm rest ` +
        `(${((squashiest / restHeight) * 100).toFixed(0)}%), spread ${mm(widest)}mm, ` +
        `volume ${minVolume.toFixed(2)}–${maxVolume.toFixed(2)}×, ` +
        `settle ${settled.toFixed(2)}s, final height ${mm(final.height)}mm`
    );

    // It came back: standing, roughly rest-shaped, on the floor.
    expect(final.height).toBeGreaterThan(0.014);
    expect(final.minY).toBeLessThan(FLOOR_Y + 0.003);
    expect(settled).toBeLessThan(6);
  });

  it('poke and let go: the jiggle report', () => {
    const r = rig();
    const hand = createInteraction(r.world, r.slime, r.egg);
    run(r, 240);

    const restApex = measure(r).maxY;
    const rayTop = 0.1;
    const down: PointerRay = { origin: [0, rayTop, 0], dir: [0, -1, 0] };
    hand.press(down, [0, 0], r.egg.yolkFaceStart, rayTop - restApex);
    runWithHand(r, hand, Math.round(0.4 / SIM_STEP_SEC));
    hand.release();

    const apex: number[] = [];
    run(r, Math.round(2 / SIM_STEP_SEC), (f) => apex.push(f.maxY));
    const w = wobbleOf(apex);
    const recovered = measure(r).maxY;

    console.log(
      `[poke] dent ${mm(restApex - Math.min(...apex))}mm, wobble ${w.hz.toFixed(1)} Hz over ` +
        `${w.cycles.toFixed(1)} cycles, tail/head amplitude ${w.decay.toFixed(2)}, ` +
        `apex back to ${mm(recovered)}mm of ${mm(restApex)}mm`
    );

    expect(recovered).toBeGreaterThan(restApex - 0.004);
  });

  it('grab, shake hard, release mid-swing: the throw report', () => {
    const r = rig();
    const hand = createInteraction(r.world, r.slime, r.egg);
    run(r, 240);

    const restApex = measure(r).maxY;
    const rayTop = 0.1;
    hand.press(
      { origin: [0, rayTop, 0], dir: [0, -1, 0] },
      [0, 0],
      r.egg.yolkFaceStart,
      rayTop - restApex
    );
    hand.move({ origin: [0, rayTop, 0], dir: [0, -1, 0] }, [0.2, 0]);
    expect(hand.state()).toBe('grabbing');

    // Lift, then whip side to side at 2.5 Hz, ±3 cm, for eight tenths.
    hand.move({ origin: [0, rayTop + 0.03, 0], dir: [0, -1, 0] }, [0.2, 0.2]);
    runWithHand(r, hand, Math.round(0.5 / SIM_STEP_SEC));
    const whipSteps = Math.round(0.8 / SIM_STEP_SEC);
    runWithHand(r, hand, whipSteps, (_, i) => {
      const sweep = Math.sin((i / whipSteps) * Math.PI * 2 * 2) * 0.03;
      hand.move({ origin: [sweep, rayTop + 0.03, 0], dir: [0, -1, 0] }, [0.2 + sweep, 0.2]);
    });

    const atRelease = measure(r);
    hand.release();

    let peakSpread = 0;
    let minVolume = Infinity;
    let landedFlat = Infinity;
    run(r, Math.round(1.5 / SIM_STEP_SEC), (f) => {
      peakSpread = Math.max(peakSpread, f.spread);
      minVolume = Math.min(minVolume, f.volumeRatio);
      if (f.minY < FLOOR_Y + 0.003) landedFlat = Math.min(landedFlat, f.height);
    });
    const settled = settleTime(r);
    const final = measure(r);
    const carried = Math.hypot(
      final.centre[0] - atRelease.centre[0],
      final.centre[2] - atRelease.centre[2]
    );

    console.log(
      `[throw] flew ${mm(carried)}mm sideways, splat height ${mm(landedFlat)}mm, ` +
        `peak spread ${mm(peakSpread)}mm, volume dipped to ${minVolume.toFixed(2)}×, ` +
        `settle ${settled.toFixed(2)}s, final height ${mm(final.height)}mm`
    );

    expect(final.height).toBeGreaterThan(0.014);
    expect(settled).toBeLessThan(6);
  });

  it('floor drag at speed, release: the smear report', () => {
    const r = rig();
    const hand = createInteraction(r.world, r.slime, r.egg);
    run(r, 240);

    // Grab low on the flank and haul it across the whole box in half a second.
    const rimFace = 200;
    r.world.readSlimeVertices(r.slime, r.positions);
    const rimVert = r.egg.faces[rimFace * 3];
    const rimY = r.positions[rimVert * 3 + 1];
    const rayTop = 0.1;
    hand.press({ origin: [0, rayTop, 0], dir: [0, -1, 0] }, [0, 0], rimFace, rayTop - rimY);
    hand.move({ origin: [0, rayTop, 0], dir: [0, -1, 0] }, [0.3, 0]);
    expect(hand.state()).toBe('grabbing');

    const dragSteps = Math.round(0.5 / SIM_STEP_SEC);
    let lowestDuring = Infinity;
    runWithHand(r, hand, dragSteps, (f, i) => {
      const x = -0.04 + (i / dragSteps) * 0.08;
      hand.move({ origin: [x, rayTop, 0], dir: [0, -1, 0] }, [0.3 + x, 0]);
      lowestDuring = Math.min(lowestDuring, f.minY);
    });
    hand.release();
    const settled = settleTime(r);
    const final = measure(r);

    console.log(
      `[drag] lowest point during ${mm(lowestDuring - FLOOR_Y)}mm above floor, ` +
        `settle ${settled.toFixed(2)}s, final height ${mm(final.height)}mm at ` +
        `x ${mm(final.centre[0])}mm`
    );

    expect(final.height).toBeGreaterThan(0.014);
    expect(settled).toBeLessThan(6);
  });
});
