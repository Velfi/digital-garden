import { describe, it, expect } from 'vitest';
import {
  cloneVoxels,
  serializeVoxels,
  deserializeVoxels,
  canonicalizeVoxelMap,
  computeUndoDeltaForVoxelKeys,
  computeUndoDeltaForSelectionOnly,
  computeStrokeVoxelUndoDelta,
  mergeUndoParts,
  isUndoDeltaEmpty
} from './serialization';
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

    it('serialize merges keys that canonicalize to the same cell', () => {
      const map = new Map([
        ['10.9,0,0', plasticVoxel(0xff0000)],
        ['10,0,0', plasticVoxel(0x00ff00)]
      ]);
      const restored = deserializeVoxels(serializeVoxels(map));
      expect(restored.size).toBe(1);
      expect(restored.get('10,0,0')).toEqual(plasticVoxel(0x00ff00));
    });
  });

  describe('canonicalizeVoxelMap', () => {
    it('drops entries with non-finite coordinates', () => {
      const map = new Map([
        ['0,0,0', plasticVoxel(1)],
        ['NaN,0,0', plasticVoxel(2)]
      ]);
      const c = canonicalizeVoxelMap(map);
      expect(c.size).toBe(1);
      expect(c.get('0,0,0')).toEqual(plasticVoxel(1));
    });
  });

  describe('sparse undo helpers', () => {
    it('computeUndoDeltaForVoxelKeys only inspects touched keys', () => {
      const oldV = new Map([
        ['0,0,0', plasticVoxel(0xff0000)],
        ['9,9,9', plasticVoxel(0x111111)]
      ]);
      const newV = new Map([
        ['0,0,0', { color: 0x00ff00, material: 'plastic' as const }],
        ['9,9,9', plasticVoxel(0x111111)]
      ]);
      const part = computeUndoDeltaForVoxelKeys(oldV, newV, new Set(['0,0,0']));
      expect(part.voxelRemoved.length).toBe(1);
      expect(part.voxelAdded.length).toBe(1);
      expect(part.voxelRemoved[0]![0]).toBe('0,0,0');
      expect(part.voxelAdded[0]![1].color).toBe(0x00ff00);
    });

    it('mergeUndoParts combines voxel and selection slices', () => {
      const vPart = computeUndoDeltaForVoxelKeys(
        new Map(),
        new Map([['0,0,0', plasticVoxel(0xff0000)]]),
        new Set(['0,0,0'])
      );
      const sPart = computeUndoDeltaForSelectionOnly(
        new Map(),
        new Map([['1,1,1', plasticVoxel(0x3357ff)]])
      );
      const d = mergeUndoParts(vPart, sPart);
      expect(isUndoDeltaEmpty(d)).toBe(false);
      expect(d.voxelAdded.length).toBe(1);
      expect(d.selectionAdded.length).toBe(1);
    });

    it('computeStrokeVoxelUndoDelta uses per-key before snapshot', () => {
      const before = new Map<string, import('../voxelMaterial').Voxel | null>([
        ['0,0,0', null],
        ['1,0,0', plasticVoxel(0xff0000)]
      ]);
      const newV = new Map([
        ['0,0,0', plasticVoxel(0x00ff00)],
        ['1,0,0', plasticVoxel(0x0000ff)]
      ]);
      const touched = new Set(['0,0,0', '1,0,0']);
      const part = computeStrokeVoxelUndoDelta(newV, touched, before);
      expect(part.voxelAdded.some(([k]) => k === '0,0,0')).toBe(true);
      expect(part.voxelRemoved.some(([k]) => k === '1,0,0')).toBe(true);
      expect(part.voxelAdded.some(([k]) => k === '1,0,0')).toBe(true);
    });
  });
});
