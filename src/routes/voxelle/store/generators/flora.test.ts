import { describe, it, expect } from 'vitest';
import {
  generateFloraVoxels,
  getFloraPositions,
  FLORA_PRESET_NUMERIC,
  FLORA_VOXEL_CAP_ABSOLUTE_MAX,
  computeFloraVoxelCap,
  type GenerateFloraOptions
} from './flora';
import type { FloraPresetId } from '../core';

const baseVoxel = () => ({ color: 0x336633, material: 'plastic' as const });

function opts(over: Partial<GenerateFloraOptions> = {}): GenerateFloraOptions {
  return {
    preset: 'custom',
    height: 10,
    girth: 1,
    wobble: 0.3,
    taper: 0.2,
    stemCount: 1,
    clusterRadius: 0,
    branchCount: 0,
    branchDepth: 1,
    branchStart: 0.4,
    branchSpread: 2,
    branchPlacement: 'spiral',
    branchWindYawDeg: 0,
    branchWindStrength: 0,
    braidStrands: 1,
    braidTwist: 0.4,
    barkJitter: 0,
    colorMode: 'alongStem',
    canopy: 0,
    stemCrossSection: 'euclidean',
    ...over
  };
}

describe('flora generator', () => {
  it('is deterministic for same seed and options', () => {
    const o = opts();
    const center: [number, number, number] = [2, 0, -1];
    const normal: [number, number, number] = [0, 1, 0];
    const a = generateFloraVoxels(0xabc, center, normal, o, baseVoxel);
    const b = generateFloraVoxels(0xabc, center, normal, o, baseVoxel);
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  });

  it('getFloraPositions matches voxel keys', () => {
    const o = opts({ branchCount: 2, height: 14 });
    const center: [number, number, number] = [0, 0, 0];
    const normal: [number, number, number] = [1, 0, 0];
    const map = generateFloraVoxels(99, center, normal, o, baseVoxel);
    const pos = getFloraPositions(99, center, normal, o);
    const keysFromPos = new Set(pos.map(([x, y, z]) => `${x},${y},${z}`));
    expect(keysFromPos.size).toBe(map.size);
    for (const k of map.keys()) {
      expect(keysFromPos.has(k)).toBe(true);
    }
  });

  it('returns non-empty for typical stalk', () => {
    const o = opts({ height: 6, girth: 0, wobble: 0.1 });
    const pos = getFloraPositions(1, [0, 0, 0], [0, 0, 1], o);
    expect(pos.length).toBeGreaterThan(0);
  });

  it('handles height 1 and girth 0', () => {
    const o = opts({ height: 1, girth: 0, wobble: 0 });
    const pos = getFloraPositions(42, [0, 0, 0], [0, 1, 0], o);
    expect(pos.length).toBe(1);
  });

  it('wobble 0 keeps stem collinear with face normal (no lateral drift)', () => {
    const center: [number, number, number] = [5, 10, 3];
    const normal: [number, number, number] = [0, 1, 0];
    const o = opts({
      height: 14,
      girth: 0,
      wobble: 0,
      stemCount: 1,
      clusterRadius: 0,
      canopy: 0,
      branchCount: 0
    });
    const pos = getFloraPositions(0xbeef, center, normal, o);
    for (const [x, y, z] of pos) {
      expect(x).toBe(center[0]);
      expect(z).toBe(center[2]);
      expect(y).toBeGreaterThanOrEqual(center[1]);
    }
  });

  it('supports even girth cross-sections with half-step girth (square / chebyshev)', () => {
    const o = opts({ height: 1, girth: 0.5, wobble: 0, taper: 0, stemCrossSection: 'chebyshev' });
    const pos = getFloraPositions(42, [0, 0, 0], [0, 1, 0], o);
    expect(pos.length).toBe(4);
  });

  it('euclidean cross-section differs from chebyshev for girth > 0', () => {
    const base = opts({ height: 8, girth: 2, wobble: 0, taper: 0, stemCrossSection: 'chebyshev' });
    const round = opts({ height: 8, girth: 2, wobble: 0, taper: 0, stemCrossSection: 'euclidean' });
    const a = getFloraPositions(0x33, [0, 0, 0], [0, 1, 0], base).length;
    const b = getFloraPositions(0x33, [0, 0, 0], [0, 1, 0], round).length;
    expect(b).not.toBe(a);
  });

  it('multi-stem produces more voxels than single when clustered', () => {
    const single = getFloraPositions(7, [0, 0, 0], [0, 1, 0], opts({ stemCount: 1, height: 8 }));
    const multi = getFloraPositions(
      7,
      [0, 0, 0],
      [0, 1, 0],
      opts({ stemCount: 4, clusterRadius: 2, height: 8 })
    );
    expect(multi.length).toBeGreaterThanOrEqual(single.length);
  });

  it('braid strands > 1 changes footprint vs single strand', () => {
    const base = opts({ braidStrands: 1, height: 12, girth: 1 });
    const braided = opts({ braidStrands: 3, braidTwist: 0.6, height: 12, girth: 1 });
    const a = getFloraPositions(0x55, [0, 0, 0], [0, 0, 1], base).length;
    const b = getFloraPositions(0x55, [0, 0, 0], [0, 0, 1], braided).length;
    expect(b).not.toBe(a);
  });

  it('respects dynamic voxel budget and absolute ceiling', () => {
    const o = opts({ height: 96, girth: 4, stemCount: 8, branchCount: 6 });
    const budget = computeFloraVoxelCap(o);
    const pos = getFloraPositions(123, [0, 0, 0], [0, 1, 0], o);
    expect(pos.length).toBeLessThanOrEqual(budget);
    expect(pos.length).toBeLessThanOrEqual(FLORA_VOXEL_CAP_ABSOLUTE_MAX);
  });

  it('actual voxel count stays within computeFloraVoxelCap for varied seeds', () => {
    const o = opts({ height: 24, girth: 2, stemCount: 3, branchCount: 4, canopy: 0.4 });
    const budget = computeFloraVoxelCap(o);
    for (let s = 0; s < 40; s++) {
      const n = getFloraPositions(s * 0x9e3779b1, [0, 0, 0], [0, 0, 1], o).length;
      expect(n).toBeLessThanOrEqual(budget);
    }
  });

  it('computeFloraVoxelCap grows with height and girth', () => {
    const base = { taper: 0 as const, stemCrossSection: 'chebyshev' as const };
    const small = computeFloraVoxelCap(opts({ height: 22, girth: 2, ...base }));
    const tall = computeFloraVoxelCap(opts({ height: 40, girth: 2, ...base }));
    const thick = computeFloraVoxelCap(opts({ height: 15, girth: 4, ...base }));
    expect(tall).toBeGreaterThan(small);
    expect(thick).toBeGreaterThan(computeFloraVoxelCap(opts({ height: 15, girth: 0, ...base })));
  });

  it('bark jitter changes colors but not keys', () => {
    const o0 = opts({ barkJitter: 0 });
    const o1 = opts({ barkJitter: 0.9 });
    const m0 = generateFloraVoxels(5, [1, 1, 1], [0, 0, 1], o0, baseVoxel);
    const m1 = generateFloraVoxels(5, [1, 1, 1], [0, 0, 1], o1, baseVoxel);
    expect([...m0.keys()].sort()).toEqual([...m1.keys()].sort());
    let anyDiff = false;
    for (const k of m0.keys()) {
      if (m0.get(k)!.color !== m1.get(k)!.color) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });

  it('color mode perPlacement uses stem root for sampling', () => {
    const getVoxel = (x: number, y: number, z: number) => ({
      color: (x + y * 100 + z * 10000) & 0xffffff,
      material: 'plastic' as const
    });
    const center: [number, number, number] = [5, 0, 0];
    const o = opts({ colorMode: 'perPlacement', height: 6, girth: 0, wobble: 0 });
    const map = generateFloraVoxels(1, center, [0, 1, 0], o, getVoxel);
    const expected = getVoxel(center[0], center[1], center[2]).color;
    for (const vx of map.values()) {
      expect(vx.color).toBe(expected);
    }
  });

  it('color mode world uses world coords (differs along stem vs uniform root)', () => {
    const getVoxel = (x: number, y: number, z: number) => ({
      color: (x * 17 + y * 3 + z * 11) & 0xffffff,
      material: 'plastic' as const
    });
    const center: [number, number, number] = [0, 0, 0];
    const normal: [number, number, number] = [0, 0, 1];
    const worldMap = generateFloraVoxels(2, center, normal, opts({ colorMode: 'world', height: 8, girth: 0 }), getVoxel);
    const placeMap = generateFloraVoxels(
      2,
      center,
      normal,
      opts({ colorMode: 'perPlacement', height: 8, girth: 0 }),
      getVoxel
    );
    const worldColors = [...new Set([...worldMap.values()].map((v) => v.color))];
    const placeColors = [...new Set([...placeMap.values()].map((v) => v.color))];
    expect(worldColors.length).toBeGreaterThan(1);
    expect(placeColors.length).toBe(1);
  });

  it('canopy adds voxels when > 0', () => {
    const none = getFloraPositions(8, [0, 0, 0], [0, 1, 0], opts({ height: 10, girth: 0, canopy: 0 }));
    const some = getFloraPositions(8, [0, 0, 0], [0, 1, 0], opts({ height: 10, girth: 0, canopy: 0.9 }));
    expect(some.length).toBeGreaterThan(none.length);
  });

  it('every preset has valid numeric fields', () => {
    const ids = Object.keys(FLORA_PRESET_NUMERIC) as Exclude<FloraPresetId, 'custom'>[];
    for (const id of ids) {
      const n = FLORA_PRESET_NUMERIC[id];
      expect(n.height).toBeGreaterThanOrEqual(1);
      expect(n.stemCount).toBeGreaterThanOrEqual(1);
      expect(n.braidStrands).toBeGreaterThanOrEqual(1);
      expect(n.colorMode).toMatch(/^(world|perPlacement|alongStem)$/);
      expect(n.canopy).toBeGreaterThanOrEqual(0);
      expect(n.canopy).toBeLessThanOrEqual(1);
    }
  });

  it('sorted positions align with sorted keys', () => {
    const o = opts();
    const keys = [...generateFloraVoxels(8, [0, 0, 0], [-1, 0, 0], o, baseVoxel).keys()].sort();
    const pos = getFloraPositions(8, [0, 0, 0], [-1, 0, 0], o);
    const fromPos = pos.map(([x, y, z]) => `${x},${y},${z}`).sort();
    expect(fromPos).toEqual(keys);
  });
});
