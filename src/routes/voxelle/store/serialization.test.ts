import { describe, it, expect } from 'vitest';
import { cloneVoxels, serializeVoxels, deserializeVoxels } from './serialization';

describe('serialization', () => {
  describe('cloneVoxels', () => {
    it('returns a new Map', () => {
      const orig = new Map([['0,0,0', 0xff0000]]);
      const cloned = cloneVoxels(orig);
      expect(cloned).not.toBe(orig);
      expect(cloned).toBeInstanceOf(Map);
    });

    it('deep copies entries', () => {
      const orig = new Map([
        ['0,0,0', 0xff0000],
        ['1,1,1', 0x00ff00]
      ]);
      const cloned = cloneVoxels(orig);
      expect(cloned.size).toBe(2);
      expect(cloned.get('0,0,0')).toBe(0xff0000);
      expect(cloned.get('1,1,1')).toBe(0x00ff00);
    });
  });

  describe('serializeVoxels / deserializeVoxels', () => {
    it('round-trips empty map', () => {
      const empty = new Map<string, number>();
      const json = serializeVoxels(empty);
      const restored = deserializeVoxels(json);
      expect(restored.size).toBe(0);
    });

    it('round-trips non-empty map', () => {
      const map = new Map([
        ['0,0,0', 0xff5733],
        ['-1,2,3', 0x3357ff]
      ]);
      const json = serializeVoxels(map);
      const restored = deserializeVoxels(json);
      expect(restored.size).toBe(2);
      expect(restored.get('0,0,0')).toBe(0xff5733);
      expect(restored.get('-1,2,3')).toBe(0x3357ff);
    });
  });
});
