import { describe, it, expect } from 'vitest';
import {
  applyTerrainStroke,
  getColumnTopBottom,
  columnIsContiguousHeightfield
} from './terrainClayOps';
import { coordKey } from './coordUtils';
import { plasticVoxel, type Voxel } from './voxelMaterial';

const gray = plasticVoxel(0x888888);
const getVoxel = (): Voxel => plasticVoxel(0x00ff00);

const bounds = 32;

describe('getColumnTopBottom', () => {
  it('returns null for empty column', () => {
    const v = new Map<string, Voxel>();
    expect(getColumnTopBottom(v, 0, 0, bounds)).toBe(null);
  });

  it('returns min and max Y', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 2, 0), gray);
    v.set(coordKey(0, 3, 0), gray);
    expect(getColumnTopBottom(v, 0, 0, bounds)).toEqual({ minY: 2, maxY: 3 });
  });
});

describe('applyTerrainStroke', () => {
  it('raise adds contiguous stack from base on empty column', () => {
    const v = new Map<string, Voxel>();
    const brush: [number, number, number][] = [[0, 5, 0]];
    const { toAdd, toRemove } = applyTerrainStroke(v, brush, bounds, {
      op: 'raise',
      terrainBaseY: 0,
      strength: 3,
      smoothRadius: 1,
      brushRadius: 1
    }, getVoxel);
    expect(toRemove.size).toBe(0);
    expect(toAdd.size).toBeGreaterThan(0);
    const next = new Map(v);
    for (const k of toRemove) next.delete(k);
    for (const [k, val] of toAdd) next.set(k, val);
    expect(columnIsContiguousHeightfield(next, 0, 0, 0, bounds)).toBe(true);
    expect(getColumnTopBottom(next, 0, 0, bounds)?.maxY).toBeGreaterThanOrEqual(0);
  });

  it('lower removes from top', () => {
    const v = new Map<string, Voxel>();
    for (let y = 0; y <= 4; y++) v.set(coordKey(0, y, 0), gray);
    const brush: [number, number, number][] = [[0, 4, 0]];
    const { toAdd, toRemove } = applyTerrainStroke(v, brush, bounds, {
      op: 'lower',
      terrainBaseY: 0,
      strength: 2,
      smoothRadius: 1,
      brushRadius: 2
    }, getVoxel);
    const next = new Map(v);
    for (const k of toRemove) next.delete(k);
    for (const [k, val] of toAdd) next.set(k, val);
    const ext = getColumnTopBottom(next, 0, 0, bounds);
    expect(ext).not.toBeNull();
    expect(ext!.maxY).toBeLessThan(4);
    expect(columnIsContiguousHeightfield(next, 0, 0, 0, bounds)).toBe(true);
  });

  it('raise uses radial falloff from falloffPath when footprint is wider than spine', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 0, 0), gray);
    v.set(coordKey(3, 0, 0), gray);
    v.set(coordKey(4, 0, 0), gray);
    const footprint: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0],
      [4, 0, 0]
    ];
    const { toAdd, toRemove } = applyTerrainStroke(v, footprint, bounds, {
      op: 'raise',
      terrainBaseY: 0,
      strength: 10,
      smoothRadius: 1,
      brushRadius: 2,
      falloffPath: [[0, 0, 0]]
    }, getVoxel);
    const next = new Map(v);
    for (const k of toRemove) next.delete(k);
    for (const [k, val] of toAdd) next.set(k, val);
    const centerH = getColumnTopBottom(next, 0, 0, bounds)!.maxY;
    const midH = getColumnTopBottom(next, 3, 0, bounds)!.maxY;
    expect(centerH).toBeGreaterThan(midH + 2);
    expect(midH).toBe(0);
  });

  it('smooth pulls peak toward neighbors', () => {
    const v = new Map<string, Voxel>();
    const plateau = 4;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx === 0 && dz === 0) continue;
        for (let y = 0; y <= plateau; y++) {
          v.set(coordKey(dx, y, dz), gray);
        }
      }
    }
    for (let y = 0; y <= 6; y++) v.set(coordKey(0, y, 0), gray);
    const brush: [number, number, number][] = [[0, 6, 0]];
    const { toAdd, toRemove } = applyTerrainStroke(v, brush, bounds, {
      op: 'smooth',
      terrainBaseY: 0,
      strength: 1,
      smoothRadius: 1,
      brushRadius: 1
    }, getVoxel);
    const next = new Map(v);
    for (const k of toRemove) next.delete(k);
    for (const [k, val] of toAdd) next.set(k, val);
    const centerH = getColumnTopBottom(next, 0, 0, bounds)!.maxY;
    expect(centerH).toBeLessThan(6);
    expect(centerH).toBeGreaterThan(2);
  });
});
