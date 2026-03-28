import { describe, expect, it } from 'vitest';
import type { FaceNormal } from '../../core';
import { FAUNA_DEFAULTS } from './presets';
import { clampFaunaOptions, generateFaunaVoxels, getFaunaPositions } from './pipeline';
import { solveTwoBoneIk } from './ik';

const place: [number, number, number] = [0, 5, 0];
const normal: FaceNormal = [0, 1, 0];

describe('fauna generator', () => {
  it('returns non-empty for stance presets', () => {
    for (const stance of ['quadruped', 'biped'] as const) {
      const map = generateFaunaVoxels(1, place, normal, FAUNA_DEFAULTS[stance], () => ({
        color: 0x44aaee,
        material: 'plastic'
      }));
      expect(map.size).toBeGreaterThan(60);
    }
  });

  it('biped and quadruped presets produce different keys', () => {
    const q = new Set(getFaunaPositions(2, place, normal, FAUNA_DEFAULTS.quadruped).map((p) => p.join(',')));
    const b = new Set(getFaunaPositions(2, place, normal, FAUNA_DEFAULTS.biped).map((p) => p.join(',')));
    let diff = 0;
    for (const k of q) if (!b.has(k)) diff++;
    for (const k of b) if (!q.has(k)) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it('is deterministic for fixed options', () => {
    const opts = { ...FAUNA_DEFAULTS.quadruped };
    const a = getFaunaPositions(42, place, normal, opts).map((p) => p.join(',')).sort();
    const b = getFaunaPositions(42, place, normal, opts).map((p) => p.join(',')).sort();
    expect(a).toEqual(b);
  });

  it('ik solver clamps and reaches finite joint/end points', () => {
    const out = solveTwoBoneIk([0, 0, 0], [100, 0, 0], [0, 1, 0], 3, 2);
    expect(Number.isFinite(out.joint[0])).toBe(true);
    expect(Number.isFinite(out.end[0])).toBe(true);
    expect(out.end[0]).toBeLessThanOrEqual(5.001);
  });

  it('auto foot placement aligns front feet forward with torso + shoulder', () => {
    const base = { ...FAUNA_DEFAULTS.quadruped, autoFootPlacement: true };
    const c = clampFaunaOptions(base);
    const seg = base.spineSegments;
    const step = base.bodyDims.length / seg;
    const wantF = seg * step + base.shoulderOffsetForward;
    expect(c.limbTargets.frontLeft[0]).toBeCloseTo(wantF, 5);
    expect(c.limbTargets.frontRight[0]).toBeCloseTo(wantF, 5);
  });

});

