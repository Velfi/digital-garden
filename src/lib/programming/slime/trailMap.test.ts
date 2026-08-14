import { describe, expect, it } from 'vitest';
import { BOX_HALF_X, BOX_HALF_Z, TRAIL_HEIGHT, TRAIL_WIDTH } from './constants';
import { createTrailField } from './trailMap';

describe('the trail field', () => {
  it('decays step-size invariantly: n small steps equal one big one', () => {
    const a = createTrailField();
    const b = createTrailField();
    a.splat(0, 0, 0.8);
    b.splat(0, 0, 0.8);

    a.decay(10);
    for (let i = 0; i < 100; i++) b.decay(0.1);

    for (let i = 0; i < a.data.length; i++) {
      expect(Math.abs(a.data[i] - b.data[i])).toBeLessThan(1e-6);
    }
  });

  it('saturates at one however hard it is painted', () => {
    const field = createTrailField();
    for (let i = 0; i < 100; i++) field.splat(0.001, -0.002, 0.5);
    let peak = 0;
    for (const value of field.data) peak = Math.max(peak, value);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.99);
  });

  it('stamps inside the floor and clamps at its edges', () => {
    const field = createTrailField();
    // A splat in the far corner must neither throw nor wrap to the other side.
    field.splat(BOX_HALF_X, BOX_HALF_Z, 1);
    field.splat(-BOX_HALF_X, -BOX_HALF_Z, 1);

    // The corner texel is painted...
    expect(field.data[TRAIL_WIDTH * TRAIL_HEIGHT - 1]).toBeGreaterThan(0);
    expect(field.data[0]).toBeGreaterThan(0);
    // ...and the opposite mid-edges are not (no wraparound).
    expect(field.data[TRAIL_WIDTH / 2]).toBe(0);
  });

  it('fades to nothing: no permanent residue', () => {
    const field = createTrailField();
    field.splat(0, 0, 1);
    field.decay(60 * 10);
    let peak = 0;
    for (const value of field.data) peak = Math.max(peak, value);
    expect(peak).toBeLessThan(1e-3);
  });
});
