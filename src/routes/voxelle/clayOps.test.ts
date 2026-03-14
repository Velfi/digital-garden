import { describe, it, expect } from 'vitest';
import { applySmooth, applyLevel, applyMelt } from './clayOps';
import { coordKey } from './coordUtils';

describe('applySmooth', () => {
  it('fills single-voxel concavity when 4+ neighbors filled', () => {
    const v = new Map<string, number>();
    v.set(coordKey(0, 0, 0), 0x888888);
    v.set(coordKey(1, 0, 0), 0x888888);
    v.set(coordKey(0, 1, 0), 0x888888);
    v.set(coordKey(0, 0, 1), 0x888888);
    // (0,0,0) has 3 neighbors; add one more to create concavity at (1,1,1)
    v.set(coordKey(1, 1, 0), 0x888888);
    v.set(coordKey(1, 0, 1), 0x888888);
    v.set(coordKey(0, 1, 1), 0x888888);
    // (1,1,1) is empty with 3 neighbors; need 4+ to fill. Add (2,1,1)
    v.set(coordKey(2, 1, 1), 0x888888);
    const brush: [number, number, number][] = [[1, 1, 1]];
    const { toAdd, toRemove } = applySmooth(v, brush, 8);
    expect(toAdd.has(coordKey(1, 1, 1))).toBe(true);
  });

  it('removes single-voxel bump when 2 or fewer neighbors', () => {
    const v = new Map<string, number>();
    v.set(coordKey(0, 0, 0), 0x888888);
    v.set(coordKey(1, 0, 0), 0x888888);
    // (0,0,0) has 1 neighbor - should be removed
    const brush: [number, number, number][] = [[0, 0, 0]];
    const { toAdd, toRemove } = applySmooth(v, brush, 8);
    expect(toRemove.has(coordKey(0, 0, 0))).toBe(true);
  });

  it('returns empty when brush outside grid', () => {
    const v = new Map([[coordKey(0, 0, 0), 0x888888]]);
    const brush: [number, number, number][] = [[100, 100, 100]];
    const { toAdd, toRemove } = applySmooth(v, brush, 8);
    expect(toAdd.size).toBe(0);
    expect(toRemove.size).toBe(0);
  });
});

describe('applyLevel', () => {
  it('adds voxels at levelY for xz positions in brush', () => {
    const v = new Map<string, number>();
    const brush: [number, number, number][] = [
      [0, 2, 0],
      [1, 2, 1],
      [2, 1, 2]
    ];
    const levelY = 0;
    let colorCalls = 0;
    const getColor = () => {
      colorCalls++;
      return 0xff0000;
    };
    const { toAdd, toRemove } = applyLevel(v, brush, levelY, getColor, 8);
    expect(toAdd.has(coordKey(0, 0, 0))).toBe(true);
    expect(toAdd.has(coordKey(1, 0, 1))).toBe(true);
    expect(toAdd.has(coordKey(2, 0, 2))).toBe(true);
    expect(toRemove.size).toBe(0);
  });

  it('does not add where voxel already exists', () => {
    const v = new Map([[coordKey(0, 4, 0), 0x888888]]);
    const brush: [number, number, number][] = [[0, 5, 0]];
    const { toAdd } = applyLevel(v, brush, 4, () => 0xff0000, 8);
    expect(toAdd.has(coordKey(0, 4, 0))).toBe(false);
  });
});

describe('applyMelt', () => {
  it('moves voxels downward when space below is empty', () => {
    const v = new Map<string, number>();
    v.set(coordKey(0, 2, 0), 0x888888);
    // (0,1,0) empty - (0,2,0) should fall one step to (0,1,0)
    const brush: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0]
    ];
    const { toAdd, toRemove } = applyMelt(v, brush, 8);
    expect(toRemove.has(coordKey(0, 2, 0))).toBe(true);
    expect(toAdd.has(coordKey(0, 1, 0))).toBe(true);
  });
});
