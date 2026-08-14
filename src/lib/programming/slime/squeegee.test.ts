import { describe, expect, it } from 'vitest';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y } from './constants';
import { PANE_XP, PANE_ZP } from './grimeMap';
import { castSqueegee } from './squeegee';

/** A camera-ish viewpoint: outside the front glass, level with the pet. */
const EYE: [number, number, number] = [0, FLOOR_Y + 0.026, 0.15];

function toward(target: readonly [number, number, number]): [number, number, number] {
  const d: [number, number, number] = [target[0] - EYE[0], target[1] - EYE[1], target[2] - EYE[2]];
  const len = Math.hypot(...d);
  return [d[0] / len, d[1] / len, d[2] / len];
}

describe('castSqueegee', () => {
  it('finds the front pane from the camera side, with honest pane coords', () => {
    const hit = castSqueegee(EYE, toward([0, FLOOR_Y + 0.02, 0]));
    expect(hit).not.toBeNull();
    expect(hit!.pane).toBe(PANE_ZP);
    expect(hit!.u).toBeCloseTo(0.5, 2);
    expect(hit!.point[2]).toBeCloseTo(BOX_HALF_Z, 9);
    // The crossing sits below the aim point (the ray was descending).
    expect(hit!.v).toBeGreaterThan(0);
    expect(hit!.v).toBeLessThan(1);
  });

  it('misses when aimed over the box', () => {
    expect(castSqueegee(EYE, [0, 0.5, -0.8])).toBeNull();
  });

  it('reaches a side pane when the view comes around the corner', () => {
    // From out right of the box, looking in through the +X pane.
    const eye: [number, number, number] = [0.2, FLOOR_Y + 0.03, 0.02];
    const hit = castSqueegee(eye, [-1, -0.05, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.pane).toBe(PANE_XP);
    expect(hit!.point[0]).toBeCloseTo(BOX_HALF_X, 9);
  });

  it('picks the nearer pane when two are in the ray', () => {
    // Straight through the box front to back: the front pane wins.
    const hit = castSqueegee(EYE, toward([0, FLOOR_Y + 0.02, -BOX_HALF_Z]));
    expect(hit!.pane).toBe(PANE_ZP);
  });
});
