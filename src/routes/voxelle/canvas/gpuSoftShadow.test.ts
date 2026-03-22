import { describe, expect, it } from 'vitest';
import {
  clampShadowSamples,
  DEFAULT_SHADOW_RAY_SAMPLES,
  MAX_SOFT_SHADOW_SAMPLES,
  shadowConeTanFromRadians,
  softShadowDiskPolar,
  softShadowDiskStratified,
  softShadowHash01
} from './gpuSoftShadow';

describe('clampShadowSamples', () => {
  it('clamps to 1..MAX_SOFT_SHADOW_SAMPLES', () => {
    expect(clampShadowSamples(0)).toBe(1);
    expect(clampShadowSamples(-5)).toBe(1);
    expect(clampShadowSamples(1)).toBe(1);
    expect(clampShadowSamples(8)).toBe(8);
    expect(clampShadowSamples(9)).toBe(8);
    expect(clampShadowSamples(3.2)).toBe(3);
  });

  it('falls back for non-finite', () => {
    expect(clampShadowSamples(Number.NaN)).toBe(DEFAULT_SHADOW_RAY_SAMPLES);
  });
});

describe('shadowConeTanFromRadians', () => {
  it('returns tan for sane angles', () => {
    const t = shadowConeTanFromRadians(Math.PI / 18); // 10°
    expect(t).toBeGreaterThan(0);
    expect(t).toBeCloseTo(Math.tan(Math.PI / 18), 6);
  });

  it('uses default for non-positive', () => {
    const d = shadowConeTanFromRadians(0);
    expect(d).toBeGreaterThan(0);
  });
});

describe('softShadowHash01', () => {
  it('is deterministic per (u,v,sampleIdx)', () => {
    expect(softShadowHash01(10, 20, 0)).toEqual(softShadowHash01(10, 20, 0));
    expect(softShadowHash01(10, 20, 0)).not.toEqual(softShadowHash01(10, 20, 1));
  });

  it('returns values in [0,1)', () => {
    for (let u = 0; u < 5; u++) {
      for (let v = 0; v < 5; v++) {
        for (let s = 0; s < MAX_SOFT_SHADOW_SAMPLES; s++) {
          const [a, b] = softShadowHash01(u, v, s);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(1);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(1);
        }
      }
    }
  });
});

describe('softShadowDiskPolar', () => {
  it('matches sqrt-uniform disk mapping', () => {
    const { radius, angle } = softShadowDiskPolar(3, 7, 2);
    const [h0, h1] = softShadowHash01(3, 7, 2);
    expect(radius).toBeCloseTo(Math.sqrt(h0), 12);
    expect(angle).toBeCloseTo(h1 * (Math.PI * 2), 12);
  });
});

describe('softShadowDiskStratified', () => {
  it('is deterministic and independent of screen position', () => {
    expect(softShadowDiskStratified(2, 8)).toEqual(softShadowDiskStratified(2, 8));
  });

  it('uses center for single sample', () => {
    expect(softShadowDiskStratified(0, 1)).toEqual({ radius: 0, angle: 0 });
  });

  it('keeps radius in unit disk for n>1', () => {
    const n = MAX_SOFT_SHADOW_SAMPLES;
    for (let i = 0; i < n; i++) {
      const { radius } = softShadowDiskStratified(i, n);
      expect(radius).toBeGreaterThanOrEqual(0);
      expect(radius).toBeLessThanOrEqual(1);
    }
  });
});
