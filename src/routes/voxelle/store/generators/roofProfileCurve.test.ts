import { describe, it, expect } from 'vitest';
import {
  normalizeRoofProfilePoints,
  sampleRoofProfileCurve,
  ROOF_PROFILE_CURVE_DEFAULT
} from './roofProfileCurve';

describe('roofProfileCurve', () => {
  it('samples endpoints', () => {
    const p = [
      { x: 0, y: 0.2 },
      { x: 1, y: 0.9 }
    ];
    expect(sampleRoofProfileCurve(p, 0)).toBeCloseTo(0.2);
    expect(sampleRoofProfileCurve(p, 1)).toBeCloseTo(0.9);
  });

  it('interpolates mid segment', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 }
    ];
    expect(sampleRoofProfileCurve(p, 0.25)).toBeCloseTo(0.25);
  });

  it('normalize pins first and last x', () => {
    const n = normalizeRoofProfilePoints([
      { x: 0.05, y: 0.1 },
      { x: 0.9, y: 0.8 }
    ]);
    expect(n[0]!.x).toBe(0);
    expect(n[n.length - 1]!.x).toBe(1);
  });

  it('default matches linear ramp', () => {
    expect(sampleRoofProfileCurve(ROOF_PROFILE_CURVE_DEFAULT, 0.25)).toBeCloseTo(0.25);
  });
});
