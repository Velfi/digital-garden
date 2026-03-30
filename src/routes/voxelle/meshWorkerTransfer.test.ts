import { describe, it, expect } from 'vitest';
import { parseCoordKey, parseCoordKeyInts } from './coordUtils';
import { packSparseChunksForWorker } from './meshWorkerTransfer';
import { plasticVoxel } from './voxelMaterial';
import { coordKey } from './coordUtils';
import {
  getVoxelKeysInChunkForMesh,
  replaceVoxelChunkIndexFromMap,
  VOXEL_MESH_CHUNK_SIZE
} from './store/voxelChunkIndex';

describe('meshWorkerTransfer', () => {
  it('parseCoordKeyInts matches parseCoordKey', () => {
    const keys = ['0,0,0', '-12,3,44', '10,-20,0'];
    for (const k of keys) {
      expect(parseCoordKeyInts(k)).toEqual(parseCoordKey(k));
    }
  });

  it('packSparseChunksForWorker skips empty halo chunks', () => {
    const voxels = new Map([
      [coordKey(0, 0, 0), plasticVoxel(0xff0000)],
      [coordKey(40, 0, 0), plasticVoxel(0x00ff00)]
    ]);
    const sparse = packSparseChunksForWorker(voxels, ['0,0,0'], ['5,0,0', '1,0,0'], 32);
    expect(sparse.dirtyChunks).toHaveLength(1);
    expect(sparse.haloChunks.every((h) => h.voxels.coords.length > 0)).toBe(true);
    expect(sparse.haloChunks.map((h) => h.chunkId).includes('5,0,0')).toBe(false);
  });

  it('packSparseChunksForWorker matches full scan inside region', () => {
    const voxels = new Map<string, ReturnType<typeof plasticVoxel>>();
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          voxels.set(coordKey(x, y, z), plasticVoxel(0xaa00ff));
        }
      }
    }
    voxels.set(coordKey(99, 99, 99), plasticVoxel(0x00ff00));
    const a = packSparseChunksForWorker(voxels, ['0,0,0'], ['1,0,0'], 4);
    const fromFull = (chunkId: string) => {
      const out: Array<[string, ReturnType<typeof plasticVoxel>]> = [];
      const cs = 4;
      for (const [key, v] of voxels) {
        const [x, y, z] = parseCoordKeyInts(key);
        const id = `${Math.floor(x / cs)},${Math.floor(y / cs)},${Math.floor(z / cs)}`;
        if (id !== chunkId) continue;
        out.push([key, v]);
      }
      return out;
    };
    expect(a.dirtyChunks[0]!.voxels.colors.length).toBe(fromFull('0,0,0').length);
    if (a.haloChunks.length > 0) {
      expect(a.haloChunks[0]!.voxels.colors.length).toBe(fromFull(a.haloChunks[0]!.chunkId).length);
    }
  });

  it('packSparseChunksForWorker keysForChunk path matches bbox scan at chunk size 32', () => {
    const voxels = new Map<string, ReturnType<typeof plasticVoxel>>();
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        voxels.set(coordKey(x, y, 0), plasticVoxel(0xaa00ff));
      }
    }
    voxels.set(coordKey(200, 0, 0), plasticVoxel(0x00ff00));
    replaceVoxelChunkIndexFromMap(voxels, VOXEL_MESH_CHUNK_SIZE);
    const dirty = ['0,0,0'];
    const halo = ['1,0,0'];
    const scan = packSparseChunksForWorker(voxels, dirty, halo, 32);
    const indexed = packSparseChunksForWorker(voxels, dirty, halo, 32, {
      keysForChunk: getVoxelKeysInChunkForMesh
    });
    expect(indexed.totalTransmissiveCount).toBe(scan.totalTransmissiveCount);
    expect(indexed.dirtyChunks.length).toBe(scan.dirtyChunks.length);
    expect(indexed.haloChunks.length).toBe(scan.haloChunks.length);
    for (let i = 0; i < scan.dirtyChunks.length; i++) {
      expect(indexed.dirtyChunks[i]!.voxels.coords).toEqual(scan.dirtyChunks[i]!.voxels.coords);
      expect(indexed.dirtyChunks[i]!.voxels.colors).toEqual(scan.dirtyChunks[i]!.voxels.colors);
    }
    for (let i = 0; i < scan.haloChunks.length; i++) {
      expect(indexed.haloChunks[i]!.voxels.coords).toEqual(scan.haloChunks[i]!.voxels.coords);
    }
  });
});
