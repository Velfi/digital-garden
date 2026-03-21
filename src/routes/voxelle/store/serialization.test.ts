import { describe, it, expect } from 'vitest';
import { cloneVoxels, serializeVoxels, deserializeVoxels } from './serialization';
import { plasticVoxel, voxelEquals } from '../voxelMaterial';

describe('serialization', () => {
  describe('cloneVoxels', () => {
    it('returns a new Map', () => {
      const orig = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
      const cloned = cloneVoxels(orig);
      expect(cloned).not.toBe(orig);
      expect(cloned).toBeInstanceOf(Map);
    });

    it('deep copies entries', () => {
      const a = plasticVoxel(0xff0000);
      const b = plasticVoxel(0x00ff00);
      const orig = new Map([
        ['0,0,0', a],
        ['1,1,1', b]
      ]);
      const cloned = cloneVoxels(orig);
      expect(cloned.size).toBe(2);
      expect(voxelEquals(cloned.get('0,0,0')!, a)).toBe(true);
      expect(voxelEquals(cloned.get('1,1,1')!, b)).toBe(true);
      expect(cloned.get('0,0,0')).not.toBe(a);
    });
  });

  describe('serializeVoxels / deserializeVoxels', () => {
    it('round-trips empty map', () => {
      const empty = new Map<string, import('../voxelMaterial').Voxel>();
      const json = serializeVoxels(empty);
      const restored = deserializeVoxels(json);
      expect(restored.size).toBe(0);
    });

    it('round-trips non-empty map', () => {
      const map = new Map([
        ['0,0,0', plasticVoxel(0xff5733)],
        ['-1,2,3', plasticVoxel(0x3357ff)]
      ]);
      const json = serializeVoxels(map);
      const restored = deserializeVoxels(json);
      expect(restored.size).toBe(2);
      expect(restored.get('0,0,0')).toEqual(plasticVoxel(0xff5733));
      expect(restored.get('-1,2,3')).toEqual(plasticVoxel(0x3357ff));
    });

    it('deserializes legacy numeric entries as plastic', () => {
      const json = JSON.stringify([
        ['0,0,0', 0xff5733],
        ['1,0,0', 0x112233]
      ]);
      const restored = deserializeVoxels(json);
      expect(restored.get('0,0,0')).toEqual({ color: 0xff5733, material: 'plastic' });
    });
  });
});
