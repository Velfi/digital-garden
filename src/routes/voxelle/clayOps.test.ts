import { describe, it, expect } from 'vitest';
import { applySmooth, applyLevel, applyMelt } from './clayOps';
import { coordKey } from './coordUtils';
import { plasticVoxel, type Voxel } from './voxelMaterial';

const gray = plasticVoxel(0x888888);

describe('applySmooth', () => {
  it('fills single-voxel concavity when 4+ neighbors filled', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 0, 0), gray);
    v.set(coordKey(1, 0, 0), gray);
    v.set(coordKey(0, 1, 0), gray);
    v.set(coordKey(0, 0, 1), gray);
    v.set(coordKey(1, 1, 0), gray);
    v.set(coordKey(1, 0, 1), gray);
    v.set(coordKey(0, 1, 1), gray);
    v.set(coordKey(2, 1, 1), gray);
    const brush: [number, number, number][] = [[1, 1, 1]];
    const { toAdd } = applySmooth(v, brush, 8);
    expect(toAdd.has(coordKey(1, 1, 1))).toBe(true);
  });

  it('removes single-voxel bump when 2 or fewer neighbors', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 0, 0), gray);
    v.set(coordKey(1, 0, 0), gray);
    const brush: [number, number, number][] = [[0, 0, 0]];
    const { toRemove } = applySmooth(v, brush, 8);
    expect(toRemove.has(coordKey(0, 0, 0))).toBe(true);
  });

  it('returns empty when brush outside grid', () => {
    const v = new Map([[coordKey(0, 0, 0), gray]]);
    const brush: [number, number, number][] = [[100, 100, 100]];
    const { toAdd, toRemove } = applySmooth(v, brush, 8);
    expect(toAdd.size).toBe(0);
    expect(toRemove.size).toBe(0);
  });
});

describe('applyLevel', () => {
  it('adds voxels at levelY for xz positions in brush', () => {
    const v = new Map<string, Voxel>();
    const brush: [number, number, number][] = [
      [0, 2, 0],
      [1, 2, 1],
      [2, 1, 2]
    ];
    const levelY = 0;
    let colorCalls = 0;
    const getVoxel = () => {
      colorCalls++;
      return plasticVoxel(0xff0000);
    };
    const { toAdd, toRemove } = applyLevel(v, brush, levelY, getVoxel, 8);
    expect(toAdd.has(coordKey(0, 0, 0))).toBe(true);
    expect(toAdd.has(coordKey(1, 0, 1))).toBe(true);
    expect(toAdd.has(coordKey(2, 0, 2))).toBe(true);
    expect(toRemove.size).toBe(0);
  });

  it('does not add where voxel already exists', () => {
    const v = new Map([[coordKey(0, 4, 0), gray]]);
    const brush: [number, number, number][] = [[0, 5, 0]];
    const { toAdd } = applyLevel(v, brush, 4, () => plasticVoxel(0xff0000), 8);
    expect(toAdd.has(coordKey(0, 4, 0))).toBe(false);
  });
});

describe('applyMelt', () => {
  it('moves voxels downward when space below is empty', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 2, 0), gray);
    const brush: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0]
    ];
    const { toAdd, toRemove } = applyMelt(v, brush, 8);
    expect(toRemove.has(coordKey(0, 2, 0))).toBe(true);
    expect(toAdd.has(coordKey(0, 0, 0))).toBe(true);
    expect(toAdd.size).toBe(1);
    expect(toRemove.size).toBe(1);
  });

  it('conserves blocks when voxel moves multiple steps (net delta)', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 3, 0), gray);
    const brush: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [0, 3, 0]
    ];
    const { toAdd, toRemove } = applyMelt(v, brush, 8);
    expect(toRemove.size).toBe(1);
    expect(toAdd.size).toBe(1);
    expect(toRemove.has(coordKey(0, 3, 0))).toBe(true);
    expect(toAdd.has(coordKey(0, 0, 0))).toBe(true);
    expect(toAdd.get(coordKey(0, 0, 0))).toEqual(gray);
  });
});
