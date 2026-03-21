import { describe, it, expect } from 'vitest';
import { processVoxelMeshMessage } from './voxelMeshWorkerLogic';
import { plasticVoxel } from './voxelMaterial';

describe('voxelMeshWorkerLogic', () => {
  it('builds greedy mesh when mode is greedy', () => {
    const output = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: [['0,0,0', plasticVoxel(0xff5733)]]
    });
    expect(output.results).toHaveLength(1);
    expect(output.results[0].bucketKey).toBe(`${0xff5733}|plastic`);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
  });

  it('builds marching cubes mesh when mode is marchingCubes', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [['0,0,0', plasticVoxel(0xff5733)]]
    });
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].bucketKey).toBe(`${0xff5733}|plastic`);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
    expect(output.results[0].indices.length).toBeGreaterThan(0);
  });

  it('builds separate marching meshes per material bucket', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [
        ['0,0,0', { color: 0xff00aa, material: 'glow' }],
        ['4,0,0', { color: 0x88ccff, material: 'glass' }]
      ]
    });
    const buckets = new Set(output.results.map((r) => r.bucketKey));
    expect(buckets.has(`${0xff00aa}|glow`)).toBe(true);
    expect(buckets.has(`${0x88ccff}|glass`)).toBe(true);
  });

  it('echoes gen for mode-independent rebuild tracking', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [['0,0,0', plasticVoxel(0xffffff)]],
      gen: 7
    });
    expect(output.gen).toBe(7);
  });
});
