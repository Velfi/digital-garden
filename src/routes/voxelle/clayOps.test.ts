import { describe, it, expect } from 'vitest';
import { applySmooth, applyLevel, applyMelt, applyMeltFriedEgg } from './clayOps';
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

  it('gentle strength does not fill when only four face neighbors are filled', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 0, 0), gray);
    v.set(coordKey(1, 0, 0), gray);
    v.set(coordKey(0, 1, 0), gray);
    v.set(coordKey(0, 0, 1), gray);
    v.set(coordKey(1, 1, 0), gray);
    const brush: [number, number, number][] = [[1, 1, 1]];
    const { toAdd } = applySmooth(v, brush, 8, { aggressiveness: 0 });
    expect(toAdd.has(coordKey(1, 1, 1))).toBe(false);
  });

  it('wider reach fills a pocket that has sparse face neighbors but dense local shell', () => {
    const hx = 5;
    const hy = 5;
    const hz = 5;
    const emptyFaceKeys = new Set([
      coordKey(hx + 1, hy, hz),
      coordKey(hx, hy + 1, hz),
      coordKey(hx, hy, hz + 1)
    ]);
    const v = new Map<string, Voxel>();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const k = coordKey(hx + dx, hy + dy, hz + dz);
          if (emptyFaceKeys.has(k)) continue;
          v.set(k, gray);
        }
      }
    }
    const brush: [number, number, number][] = [[hx, hy, hz]];
    expect(applySmooth(v, brush, 32).toAdd.size).toBe(0);
    expect(applySmooth(v, brush, 32, { neighborRadius: 1 }).toAdd.has(coordKey(hx, hy, hz))).toBe(
      true
    );
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
    const getVoxel = () => plasticVoxel(0xff0000);
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
    const { toAdd, toRemove } = applyMelt(v, brush, 8, { meltStyle: 'gravity' });
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
    const { toAdd, toRemove } = applyMelt(v, brush, 8, { meltStyle: 'gravity' });
    expect(toRemove.size).toBe(1);
    expect(toAdd.size).toBe(1);
    expect(toRemove.has(coordKey(0, 3, 0))).toBe(true);
    expect(toAdd.has(coordKey(0, 0, 0))).toBe(true);
    expect(toAdd.get(coordKey(0, 0, 0))).toEqual(gray);
  });

  it('maxPassesCap limits how far voxels settle in one stroke', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 2, 0), gray);
    const brush: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0]
    ];
    const partial = applyMelt(v, brush, 8, { maxPassesCap: 1, meltStyle: 'gravity' });
    expect(partial.toAdd.has(coordKey(0, 1, 0))).toBe(true);
    const full = applyMelt(v, brush, 8, { meltStyle: 'gravity' });
    expect(full.toAdd.has(coordKey(0, 0, 0))).toBe(true);
  });

  it('fried egg stacks more voxels in the center column than at the brush corner', () => {
    const v = new Map<string, Voxel>();
    const brush: [number, number, number][] = [];
    for (let y = -1; y <= 1; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          brush.push([x, y, z]);
        }
      }
    }
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          v.set(coordKey(x, y, z), gray);
        }
      }
    }
    const { toAdd, toRemove } = applyMeltFriedEgg(v, brush, 32);
    const next = new Map(v);
    for (const k of toRemove) next.delete(k);
    for (const [k, val] of toAdd) next.set(k, val);
    const col = (x: number, z: number) => {
      let n = 0;
      for (const k of next.keys()) {
        const [a, , b] = k.split(',').map(Number);
        if (a === x && b === z) n++;
      }
      return n;
    };
    expect(col(0, 0)).toBeGreaterThan(col(2, 2));
  });
});
