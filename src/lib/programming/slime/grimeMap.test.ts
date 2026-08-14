import { describe, expect, it } from 'vitest';
import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  FLOOR_Y,
  GRIME_HEIGHT,
  GRIME_WIDTH,
  SQUEEGEE_WIPE_HALF_WIDTH,
  SQUEEGEE_WIPE_STRENGTH
} from './constants';
import {
  PANE_COUNT,
  PANE_XN,
  PANE_XP,
  PANE_ZN,
  PANE_ZP,
  createGrimeField,
  paneDistance,
  paneUv,
  paneWorld
} from './grimeMap';

describe('pane coordinates', () => {
  it('round-trip: world → (u, v) → world lands on the same spot', () => {
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      for (const u of [0, 0.25, 0.6, 1]) {
        for (const v of [0, 0.4, 1]) {
          const [x, y, z] = paneWorld(pane, u, v);
          const [u2, v2] = paneUv(pane, x, y, z);
          expect(u2).toBeCloseTo(u, 9);
          expect(v2).toBeCloseTo(v, 9);
        }
      }
    }
  });

  it('measures distance to the inner surface, positive inside the box', () => {
    expect(paneDistance(PANE_XP, BOX_HALF_X - 0.01, 0, 0)).toBeCloseTo(0.01, 9);
    expect(paneDistance(PANE_XN, -BOX_HALF_X + 0.02, 0, 0)).toBeCloseTo(0.02, 9);
    expect(paneDistance(PANE_ZP, 0, 0, BOX_HALF_Z)).toBeCloseTo(0, 9);
    expect(paneDistance(PANE_ZN, 0, 0, -BOX_HALF_Z + 0.005)).toBeCloseTo(0.005, 9);
  });

  it('pins v to the pane height: floor is 0, rim is 1', () => {
    const [, v0] = paneUv(PANE_ZP, 0, FLOOR_Y, BOX_HALF_Z);
    const [, v1] = paneUv(PANE_ZP, 0, FLOOR_Y + BOX_HEIGHT, BOX_HALF_Z);
    expect(v0).toBeCloseTo(0, 9);
    expect(v1).toBeCloseTo(1, 9);
  });
});

/** Splat until every texel on the pane carries real grime. */
function dirtyWholePane(field: ReturnType<typeof createGrimeField>, pane: number): void {
  for (let u = 0.05; u < 1; u += 0.05) {
    for (let v = 0.05; v < 1; v += 0.05) {
      for (let n = 0; n < 20; n++) field.splat(pane, u, v, 0.3, 0.1);
    }
  }
}

describe('the grime field', () => {
  it('decays step-size invariantly: n small steps equal one big one', () => {
    const a = createGrimeField();
    const b = createGrimeField();
    a.splat(PANE_ZP, 0.5, 0.3, 0.5, 0.02);
    b.splat(PANE_ZP, 0.5, 0.3, 0.5, 0.02);

    a.decay(120);
    for (let i = 0; i < 120; i++) b.decay(1);

    for (let i = 0; i < a.data[PANE_ZP].length; i++) {
      expect(Math.abs(a.data[PANE_ZP][i] - b.data[PANE_ZP][i])).toBeLessThan(1e-6);
    }
  });

  it('smears harder when the contact slides', () => {
    const resting = createGrimeField();
    const sliding = createGrimeField();
    resting.splat(PANE_ZP, 0.5, 0.5, 0.1, 0);
    sliding.splat(PANE_ZP, 0.5, 0.5, 0.1, 0.05);
    expect(sliding.meanOn(PANE_ZP)).toBeGreaterThan(resting.meanOn(PANE_ZP) * 3);
  });

  it('saturates at one and stays on its own pane', () => {
    const field = createGrimeField();
    for (let i = 0; i < 400; i++) field.splat(PANE_XP, 0.02, 0.98, 0.25, 0.1);
    let peak = 0;
    for (const value of field.data[PANE_XP]) peak = Math.max(peak, value);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.99);
    for (const pane of [PANE_XN, PANE_ZP, PANE_ZN]) {
      expect(field.meanOn(pane)).toBe(0);
    }
  });

  it('a squeegee stroke clears its band and leaves the rest', () => {
    const field = createGrimeField();
    dirtyWholePane(field, PANE_ZP);
    const before = field.meanOn(PANE_ZP);
    expect(before).toBeGreaterThan(0.5);

    // A full-height stroke down the middle.
    field.wipe(PANE_ZP, 0.5, 1, 0.5, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);

    // The stroke's own texels are nearly clean...
    const mid = Math.floor(GRIME_HEIGHT / 2) * GRIME_WIDTH + Math.floor(GRIME_WIDTH / 2);
    expect(field.data[PANE_ZP][mid]).toBeLessThan(0.12);
    // ...the far edge is untouched...
    const edge = Math.floor(GRIME_HEIGHT / 2) * GRIME_WIDTH + 4;
    expect(field.data[PANE_ZP][edge]).toBeGreaterThan(0.5);
    // ...and the pane as a whole got cleaner.
    expect(field.meanOn(PANE_ZP)).toBeLessThan(before * 0.9);
  });

  it('wipes a swept-blade rectangle: flat ends, no round brush caps', () => {
    const field = createGrimeField();
    dirtyWholePane(field, PANE_ZP);
    const before = field.data[PANE_ZP].slice();
    // A horizontal stroke mid-pane; the blade lies vertical, across it.
    field.wipe(PANE_ZP, 0.3, 0.5, 0.5, 0.5, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);

    const texel = (u: number, v: number) =>
      Math.floor(v * GRIME_HEIGHT) * GRIME_WIDTH + Math.floor(u * GRIME_WIDTH);
    const spanU = BOX_HALF_X * 2;

    // On the stroke, a centimetre above the line: inside the blade's reach.
    const onStroke = texel(0.4, 0.5 + 0.01 / BOX_HEIGHT);
    expect(field.data[PANE_ZP][onStroke]).toBeLessThan(before[onStroke] * 0.2);
    // Eight millimetres past where the blade lifted: a round cap would have
    // cleaned this (it is well inside the old capsule radius); a blade's
    // flat end does not.
    const pastEnd = texel(0.5 + 0.008 / spanU, 0.5);
    expect(field.data[PANE_ZP][pastEnd]).toBe(before[pastEnd]);
  });

  it('a bare press stamps the resting blade\'s contact line', () => {
    const field = createGrimeField();
    dirtyWholePane(field, PANE_ZP);
    const before = field.data[PANE_ZP].slice();
    field.wipe(PANE_ZP, 0.5, 0.5, 0.5, 0.5, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);

    const texel = (u: number, v: number) =>
      Math.floor(v * GRIME_HEIGHT) * GRIME_WIDTH + Math.floor(u * GRIME_WIDTH);
    const spanU = BOX_HALF_X * 2;

    // A centimetre along the blade: wiped — the blade rests horizontal.
    const onBlade = texel(0.5 - 0.01 / spanU, 0.5);
    expect(field.data[PANE_ZP][onBlade]).toBeLessThan(before[onBlade] * 0.2);
    // Six millimetres up the pane: untouched — the contact line is thin.
    const above = texel(0.5, 0.5 + 0.006 / BOX_HEIGHT);
    expect(field.data[PANE_ZP][above]).toBe(before[above]);
  });

  it('repeated passes leave a pane honestly clean', () => {
    const field = createGrimeField();
    for (let n = 0; n < 60; n++) field.splat(PANE_ZP, 0.5, 0.5, 0.3, 0.1);
    for (let pass = 0; pass < 4; pass++) {
      field.wipe(PANE_ZP, 0.5, 1, 0.5, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
      field.wipe(PANE_ZP, 0.42, 1, 0.42, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
      field.wipe(PANE_ZP, 0.58, 1, 0.58, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
    }
    expect(field.meanOn(PANE_ZP)).toBeLessThan(0.01);
  });
});
