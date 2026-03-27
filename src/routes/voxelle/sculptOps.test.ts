import { describe, it, expect } from 'vitest';
import { applySmooth } from './sculptOps';
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
