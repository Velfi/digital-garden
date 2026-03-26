import { describe, expect, it } from 'vitest';
import {
  fogFactorFromDistance,
  fogFactorFromViewDistance,
  planeFromPointAndNormal,
  signedDistanceToPlane
} from './atmosphereMath';

describe('planeFromPointAndNormal', () => {
  it('normalizes normal and sets c for horizontal plane through y=2', () => {
    const p = planeFromPointAndNormal(0, 2, 0, 0, 2, 0);
    expect(p.nx).toBeCloseTo(0);
    expect(p.ny).toBeCloseTo(1);
    expect(p.nz).toBeCloseTo(0);
    expect(p.c).toBeCloseTo(-2);
  });
});

describe('signedDistanceToPlane', () => {
  it('matches plane equation', () => {
    const pl = planeFromPointAndNormal(0, 0, 0, 0, 1, 0);
    expect(signedDistanceToPlane(0, 3, 0, pl)).toBeCloseTo(3);
    expect(signedDistanceToPlane(0, -1, 0, pl)).toBeCloseTo(-1);
  });
});

describe('fogFactorFromDistance', () => {
  it('is full at plane in slab mode', () => {
    expect(fogFactorFromDistance(0, 10, 1, 'slab')).toBeCloseTo(1);
  });
  it('stays soft and non-zero past linear slab edge (Gaussian)', () => {
    const f = fogFactorFromDistance(12, 10, 1, 'slab');
    expect(f).toBeGreaterThan(0.01);
    expect(f).toBeLessThan(0.5);
  });
  it('positiveSide is near zero well below the plane', () => {
    expect(fogFactorFromDistance(-50, 10, 1, 'positiveSide')).toBeLessThan(0.02);
  });
  it('positiveSide is strong just above the plane', () => {
    const f = fogFactorFromDistance(0, 10, 1, 'positiveSide');
    expect(f).toBeGreaterThan(0.85);
  });
});

describe('fogFactorFromViewDistance', () => {
  it('is zero at the camera', () => {
    expect(fogFactorFromViewDistance(0, 20, 1)).toBeCloseTo(0);
  });
  it('ramps with distance', () => {
    const f = fogFactorFromViewDistance(30, 20, 1);
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThanOrEqual(1);
  });
});
