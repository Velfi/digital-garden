import { describe, it, expect } from 'vitest';
import { averageLinearLuminanceFromRgba } from './autoExposureProbe';

describe('averageLinearLuminanceFromRgba', () => {
  it('returns ~0 for black pixels', () => {
    const data = new Uint8ClampedArray(4 * 4);
    expect(averageLinearLuminanceFromRgba(data, 4, 4)).toBe(0);
  });

  it('returns high luminance for white pixels', () => {
    const data = new Uint8ClampedArray(4);
    data[0] = 255;
    data[1] = 255;
    data[2] = 255;
    data[3] = 255;
    const lum = averageLinearLuminanceFromRgba(data, 1, 1);
    expect(lum).toBeGreaterThan(0.9);
    expect(lum).toBeLessThanOrEqual(1);
  });
});

describe('bias-normalized metering (L ∝ M_auto × bias)', () => {
  it('measured/bias is unchanged when measured scales with bias for fixed M_auto', () => {
    const bias1 = 2;
    const bias2 = 4;
    const measured1 = 0.36;
    const measured2 = measured1 * (bias2 / bias1);
    expect(measured1 / bias1).toBeCloseTo(measured2 / bias2);
  });
});
