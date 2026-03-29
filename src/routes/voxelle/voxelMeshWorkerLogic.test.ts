import { describe, it, expect } from 'vitest';
import { processVoxelMeshMessage } from './voxelMeshWorkerLogic';
import { plasticVoxel, type Voxel } from './voxelMaterial';
import { packSparseChunksForWorker, packVoxelsForWorker } from './meshWorkerTransfer';
import { coordKey } from './coordUtils';

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

  it('builds dual contour mesh when mode is dualContour', () => {
    const output = processVoxelMeshMessage({
      mode: 'dualContour',
      voxels: [['0,0,0', plasticVoxel(0xff5733)]]
    });
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].bucketKey).toBe(`${0xff5733}|plastic`);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
    expect(output.results[0].indices.length).toBeGreaterThan(0);
    expect(output.results[0].indices.length % 3).toBe(0);
  });

  it('builds separate dual contour meshes per material bucket', () => {
    const output = processVoxelMeshMessage({
      mode: 'dualContour',
      voxels: [
        ['0,0,0', { color: 0xff00aa, material: 'glow' }],
        ['4,0,0', { color: 0x88ccff, material: 'glass' }]
      ]
    });
    const buckets = new Set(output.results.map((r) => r.bucketKey));
    expect(buckets.has(`${0xff00aa}|glow`)).toBe(true);
    expect(buckets.has(`${0x88ccff}|glass`)).toBe(true);
  });

  it('dual contour iso-field uses full voxel map so adjacent color buckets still get a surface', () => {
    const output = processVoxelMeshMessage({
      mode: 'dualContour',
      voxels: [
        ['0,0,0', { color: 0xff0000, material: 'plastic' }],
        ['1,0,0', { color: 0x00ff00, material: 'plastic' }]
      ]
    });
    expect(output.results.length).toBe(2);
    for (const r of output.results) {
      expect(r.indices.length).toBeGreaterThan(0);
    }
  });

  it('dual contour merges packed sparse chunk occupancy (null voxels map)', () => {
    const voxelMap = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(1, 0, 0), plasticVoxel(0xff5733)]
    ]);
    const sparse = packSparseChunksForWorker(voxelMap, ['0,0,0'], ['0,0,0'], 32);
    const output = processVoxelMeshMessage({
      mode: 'dualContour',
      voxels: sparse,
      options: { chunkSize: 32 }
    });
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].positions.length).toBeGreaterThan(0);
  });

  it('marching cubes applies adaptive transmission bound for transmissive buckets', () => {
    const output = processVoxelMeshMessage({
      mode: 'marchingCubes',
      voxels: [
        ['0,0,0', { color: 0x1b4e92, material: 'water' }],
        ['1,0,0', { color: 0x1b4e92, material: 'water' }],
        ['2,0,0', { color: 0x1b4e92, material: 'water' }]
      ]
    });
    expect(output.results).toHaveLength(1);
    const colors = output.results[0].colors;
    let maxR = 0;
    for (let i = 0; i < colors.length; i += 3) maxR = Math.max(maxR, colors[i]!);
    const rawR = ((0x1b4e92 >> 16) & 0xff) / 255;
    expect(maxR).toBeLessThan(rawR);
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

  it('echoes gen for dual contour rebuild tracking', () => {
    const output = processVoxelMeshMessage({
      mode: 'dualContour',
      voxels: [['0,0,0', plasticVoxel(0xffffff)]],
      gen: 11
    });
    expect(output.gen).toBe(11);
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
    const totalIndices = output.results.reduce((s, r) => s + r.indices.length, 0);
    // Two adjacent voxels should render 10 faces total (60 triangle indices), not 12 (72).
    expect(totalIndices).toBe(60);
  });

  it('small glass slab still builds valid chunked greedy output', () => {
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
    expect(chunked.results.length).toBeGreaterThan(0);
    const f = full.results[0]!;
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
    expect(chunked.results.every((part) => minOf(part.colors) > 0)).toBe(true);
    expect(chunked.results.every((part) => maxOf(part.slabThickness) > 0)).toBe(true);
    expect(maxOf(f.slabThickness)).toBe(21);
  });

  it('chunked greedy re-merges glass with full scene so geometry matches unchunked glass', () => {
    const voxels: [string, { color: number; material: 'glass' }][] = [];
    for (let x = 0; x < 17; x++) {
      for (let z = 0; z < 17; z++) {
        voxels.push([`${x},0,${z}`, { color: 0x88ccff, material: 'glass' }]);
      }
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
    expect(c.indices.length).toBe(f.indices.length);
    expect(c.positions.length).toBe(f.positions.length);
    expect(c.slabThickness.length).toBe(f.slabThickness.length);
  });

  it('produces matching greedy output for packed typed-array input', () => {
    const voxelMap = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(1, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(0, 1, 0), { color: 0x88ccff, material: 'glass' }]
    ]);
    const arrayInput = [...voxelMap] as [string, Voxel][];
    const packedInput = packVoxelsForWorker(voxelMap);
    const arrayOut = processVoxelMeshMessage({ mode: 'greedy', voxels: arrayInput });
    const packedOut = processVoxelMeshMessage({ mode: 'greedy', voxels: packedInput });
    expect(packedOut.results).toHaveLength(arrayOut.results.length);
    const byBucket = new Map(arrayOut.results.map((r) => [r.bucketKey, r]));
    for (const r of packedOut.results) {
      const expected = byBucket.get(r.bucketKey);
      expect(expected).toBeTruthy();
      expect(r.positions.length).toBe(expected!.positions.length);
      expect(r.normals.length).toBe(expected!.normals.length);
      expect(r.colors.length).toBe(expected!.colors.length);
      expect(r.indices.length).toBe(expected!.indices.length);
      expect(r.slabThickness.length).toBe(expected!.slabThickness.length);
    }
  });

  it('supports incremental dirty chunk rebuilds with changed bucket list', () => {
    const initial = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(1, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(40, 0, 0), plasticVoxel(0x33aaff)]
    ]);
    const initialOut = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: packVoxelsForWorker(initial),
      options: { chunkSize: 32 }
    });
    expect(initialOut.results.length).toBeGreaterThan(0);

    const next = new Map(initial);
    next.set(coordKey(2, 0, 0), plasticVoxel(0xff5733));
    const sparse = packSparseChunksForWorker(next, ['0,0,0'], ['1,0,0'], 32);
    const incrementalOut = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: sparse,
      options: { chunkSize: 32 },
      dirtyChunkIds: ['0,0,0']
    });
    const fullOut = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: packVoxelsForWorker(next),
      options: { chunkSize: 32 }
    });
    expect((incrementalOut.changedBuckets ?? []).length).toBeGreaterThan(0);
    const fullByMeshKey = new Map(fullOut.results.map((r) => [r.meshKey ?? r.bucketKey, r]));
    for (const r of incrementalOut.results) {
      const expected = fullByMeshKey.get(r.meshKey ?? r.bucketKey);
      expect(expected).toBeTruthy();
      expect(r.positions.length).toBe(expected!.positions.length);
      expect(r.indices.length).toBe(expected!.indices.length);
    }
  });

  it('supports sparse dirty+halo payload incremental rebuild', () => {
    const initial = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(1, 0, 0), plasticVoxel(0xff5733)],
      [coordKey(40, 0, 0), plasticVoxel(0x33aaff)]
    ]);
    processVoxelMeshMessage({
      mode: 'greedy',
      voxels: packVoxelsForWorker(initial),
      options: { chunkSize: 32 }
    });

    const next = new Map(initial);
    next.set(coordKey(2, 0, 0), plasticVoxel(0xff5733));
    const sparse = packSparseChunksForWorker(next, ['0,0,0'], ['1,0,0'], 32);
    const incrementalOut = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: sparse,
      options: { chunkSize: 32 },
      dirtyChunkIds: ['0,0,0']
    });
    const fullOut = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: packVoxelsForWorker(next),
      options: { chunkSize: 32 }
    });
    expect(incrementalOut.changedBuckets).toBeTruthy();
    expect(incrementalOut.results.length).toBeLessThanOrEqual(fullOut.results.length);
    const fullByMeshKey = new Map(fullOut.results.map((r) => [r.meshKey ?? r.bucketKey, r]));
    const changed = new Set(incrementalOut.changedBuckets ?? []);
    for (const r of incrementalOut.results) {
      expect(changed.has(r.meshKey ?? r.bucketKey)).toBe(true);
      const expected = fullByMeshKey.get(r.meshKey ?? r.bucketKey);
      expect(expected).toBeTruthy();
      expect(r.positions.length).toBe(expected!.positions.length);
      expect(r.indices.length).toBe(expected!.indices.length);
    }
  });

  it('falls back safely when sparse payload is invalid for incremental state', () => {
    const sparse = packSparseChunksForWorker(
      new Map([[coordKey(0, 0, 0), plasticVoxel(0xff5733)]]),
      ['0,0,0'],
      [],
      32
    );
    const out = processVoxelMeshMessage({
      mode: 'greedy',
      voxels: sparse,
      options: { chunkSize: 16 },
      dirtyChunkIds: ['0,0,0']
    });
    expect(out.changedBuckets ?? []).toHaveLength(0);
  });
});
