import { describe, it, expect } from 'vitest';
import { buildGridPositions } from './gridLines';
import { coordKey } from './coordUtils';
import { plasticVoxel } from './voxelMaterial';

describe('buildGridPositions', () => {
  it('returns empty for empty voxels', () => {
    expect(buildGridPositions(new Map())).toEqual([]);
  });

  it('single voxel produces 12 edges (x1,y1,z1,x2,y2,z2 per edge)', () => {
    const v = new Map([[coordKey(0, 0, 0), plasticVoxel(0x888888)]]);
    const pos = buildGridPositions(v);
    expect(pos.length).toBe(12 * 6); // 12 edges × 6 floats
  });

  it('two adjacent voxels produce positions (shared face edges omitted)', () => {
    const v = new Map([
      [coordKey(0, 0, 0), plasticVoxel(0x888888)],
      [coordKey(1, 0, 0), plasticVoxel(0x888888)]
    ]);
    const pos = buildGridPositions(v);
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.length % 6).toBe(0);
  });
});
