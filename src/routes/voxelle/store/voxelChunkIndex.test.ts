import { describe, expect, it } from 'vitest';
import { coordKey } from '../coordUtils';
import { plasticVoxel } from '../voxelMaterial';
import {
  applyVoxelChunkIndexAfterKeyChange,
  chunkIdFromKey,
  getVoxelKeysInChunkForMesh,
  replaceVoxelChunkIndexFromMap,
  VOXEL_MESH_CHUNK_SIZE
} from './voxelChunkIndex';

describe('voxelChunkIndex', () => {
  it('chunkIdFromKey matches floor division', () => {
    expect(chunkIdFromKey(coordKey(0, 0, 0), 32)).toBe('0,0,0');
    expect(chunkIdFromKey(coordKey(31, 31, 31), 32)).toBe('0,0,0');
    expect(chunkIdFromKey(coordKey(32, 0, 0), 32)).toBe('1,0,0');
    expect(chunkIdFromKey(coordKey(-1, 0, 0), 32)).toBe('-1,0,0');
  });

  it('replaceVoxelChunkIndexFromMap buckets keys', () => {
    const m = new Map<string, ReturnType<typeof plasticVoxel>>();
    m.set(coordKey(0, 0, 0), plasticVoxel(0xff0000));
    m.set(coordKey(32, 0, 0), plasticVoxel(0x00ff00));
    replaceVoxelChunkIndexFromMap(m, VOXEL_MESH_CHUNK_SIZE);
    expect(new Set(getVoxelKeysInChunkForMesh('0,0,0'))).toEqual(new Set([coordKey(0, 0, 0)]));
    expect(new Set(getVoxelKeysInChunkForMesh('1,0,0'))).toEqual(new Set([coordKey(32, 0, 0)]));
  });

  it('applyVoxelChunkIndexAfterKeyChange add/remove', () => {
    replaceVoxelChunkIndexFromMap(new Map(), VOXEL_MESH_CHUNK_SIZE);
    const vx = plasticVoxel(0xff0000);
    applyVoxelChunkIndexAfterKeyChange(coordKey(5, 5, 5), undefined, vx, VOXEL_MESH_CHUNK_SIZE);
    expect(getVoxelKeysInChunkForMesh('0,0,0')).toContain(coordKey(5, 5, 5));
    applyVoxelChunkIndexAfterKeyChange(coordKey(5, 5, 5), vx, undefined, VOXEL_MESH_CHUNK_SIZE);
    expect(getVoxelKeysInChunkForMesh('0,0,0')).toEqual([]);
  });
});
