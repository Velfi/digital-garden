import { describe, it, expect } from 'vitest';
import { processVoxelMeshMessage } from './voxelMeshWorkerLogic';

describe('voxelMeshWorkerLogic', () => {
  it('builds greedy mesh when mode is greedy', () => {
    const output = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: [['0,0,0', 0xff5733]]
    });
    expect(output.results).toHaveLength(1);
    expect(output.results[0].color).toBe(0xff5733);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
  });

  it('builds marching cubes mesh when mode is marchingCubes', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [['0,0,0', 0xff5733]]
    });
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
    expect(output.results[0].indices.length).toBeGreaterThan(0);
  });

  it('echoes gen for mode-independent rebuild tracking', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [['0,0,0', 0xffffff]],
      gen: 7
    });
    expect(output.gen).toBe(7);
  });
});
