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

  it('returns no meshes for ray mode', () => {
    const output = processVoxelMeshMessage({
      mode: 'ray',
      voxels: [['0,0,0', plasticVoxel(0xff5733)]],
      gen: 3
    });
    expect(output.results).toHaveLength(0);
    expect(output.gen).toBe(3);
  });

  it('echoes gen for mode-independent rebuild tracking', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [['0,0,0', plasticVoxel(0xffffff)]],
      gen: 7
    });
    expect(output.gen).toBe(7);
  });

  it('does not emit internal faces across chunk boundaries', () => {
    const output = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: [
        ['15,0,0', plasticVoxel(0xff5733)],
        ['16,0,0', plasticVoxel(0xff5733)]
      ],
      options: { chunkSize: 16 }
    });
    expect(output.results).toHaveLength(1);
    // Two adjacent voxels should render 10 faces total (60 triangle indices), not 12 (72).
    expect(output.results[0].indices.length).toBe(60);
  });

  it('glass slab darkest tint and max slabThickness match chunked vs single (full-scene thickness)', () => {
    const voxels: [string, { color: number; material: 'glass' }][] = [];
    for (let x = 0; x <= 20; x++) {
      voxels.push([`${x},0,0`, { color: 0x88ccff, material: 'glass' }]);
    }
    const full = processVoxelMeshMessage({ mode: 'greedy', voxels });
    const chunked = processVoxelMeshMessage({
      mode: 'greedy',
      voxels,
      options: { chunkSize: 16 }
    });
    expect(full.results).toHaveLength(1);
    expect(chunked.results).toHaveLength(1);
    const f = full.results[0]!;
    const c = chunked.results[0]!;
    const minOf = (a: Float32Array) => {
      let m = Infinity;
      for (let i = 0; i < a.length; i++) m = Math.min(m, a[i]!);
      return m;
    };
    const maxOf = (a: Float32Array) => {
      let m = -Infinity;
      for (let i = 0; i < a.length; i++) m = Math.max(m, a[i]!);
      return m;
    };
    expect(minOf(c.colors)).toBeCloseTo(minOf(f.colors), 5);
    expect(maxOf(c.slabThickness)).toBe(maxOf(f.slabThickness));
    expect(maxOf(f.slabThickness)).toBe(21);
  });
});
