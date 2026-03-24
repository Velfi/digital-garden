import { describe, expect, it } from 'vitest';
import { computeTransmissionBound } from './transmissionPolicy';

describe('transmissionPolicy', () => {
  it('does not modify non-transmissive materials', () => {
    expect(computeTransmissionBound(0x112233, 'plastic', 10)).toBe(1);
    expect(computeTransmissionBound(0x112233, 'metal', 10)).toBe(1);
  });

  it('darkens with depth for transmissive materials', () => {
    const glassThin = computeTransmissionBound(0x88ccff, 'glass', 1);
    const glassThick = computeTransmissionBound(0x88ccff, 'glass', 12);
    const waterThin = computeTransmissionBound(0x2f6fff, 'water', 1);
    const waterThick = computeTransmissionBound(0x2f6fff, 'water', 12);
    expect(glassThick).toBeLessThan(glassThin);
    expect(waterThick).toBeLessThan(waterThin);
  });

  it('bounds transmittance by color luminance', () => {
    const bright = computeTransmissionBound(0xbde8ff, 'water', 6);
    const dark = computeTransmissionBound(0x001a33, 'water', 6);
    expect(bright).toBeGreaterThan(dark);
  });
});
