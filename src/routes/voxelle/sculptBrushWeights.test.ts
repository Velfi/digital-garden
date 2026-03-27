import { describe, it, expect } from 'vitest';
import {
  minDistPointToPolyline,
  computeSculptVoxelWeights,
  filterPositionsBySculptBrush
} from './sculptBrushWeights';
import { coordKey } from './coordUtils';

describe('minDistPointToPolyline', () => {
  it('returns 0 at a spine vertex center', () => {
    const spine: [number, number, number][] = [[0, 0, 0]];
    expect(minDistPointToPolyline(0.5, 0.5, 0.5, spine)).toBe(0);
  });

  it('matches distance to segment midpoint', () => {
    const spine: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0]
    ];
    const d = minDistPointToPolyline(1.5, 0.5, 0.5, spine);
    expect(d).toBeLessThan(0.01);
  });
});

describe('computeSculptVoxelWeights', () => {
  it('returns all 1 when falloff blend is 0', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
    const spine: [number, number, number][] = [[0, 0, 0]];
    const m = computeSculptVoxelWeights(positions, spine, 1, 0);
    expect(m.get(coordKey(0, 0, 0))).toBe(1);
    expect(m.get(coordKey(1, 0, 0))).toBe(1);
  });

  it('lowers weight away from spine when falloff is on', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0]
    ];
    const spine: [number, number, number][] = [[0, 0, 0]];
    const m = computeSculptVoxelWeights(positions, spine, 1, 1);
    const w0 = m.get(coordKey(0, 0, 0))!;
    const w1 = m.get(coordKey(3, 0, 0))!;
    expect(w0).toBeGreaterThan(w1);
  });
});

describe('filterPositionsBySculptBrush', () => {
  it('keeps all positions when strength 1 and weights 1', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
    const weights = new Map([
      [coordKey(0, 0, 0), 1],
      [coordKey(1, 0, 0), 1]
    ]);
    const out = filterPositionsBySculptBrush(positions, weights, 1, 12345);
    expect(out.length).toBe(2);
  });

  it('is deterministic for same seed', () => {
    const positions: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
    const weights = new Map(positions.map(([x, y, z]) => [coordKey(x, y, z), 0.5] as const));
    const a = filterPositionsBySculptBrush(positions, weights, 0.9, 999);
    const b = filterPositionsBySculptBrush(positions, weights, 0.9, 999);
    expect(a.map((p) => p.join(',')).sort()).toEqual(b.map((p) => p.join(',')).sort());
  });
});
