import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { coordKey } from '../coordUtils';
import {
  voxels,
  selection,
  gridSize,
  resetUndo,
  hexToInt,
  intToHex,
  getStampOffsetForFace,
  cloneVoxels,
  ensureGridFitsPositions,
  shiftVoxelsAndSelection,
  shiftSelection,
  centerOriginOnObject,
  centerOriginOnSelection,
  addShapeAt,
  getPaintColorResolver,
  color,
  selectedColors
} from './core';

describe('core', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  describe('hexToInt', () => {
    it('parses 6-digit hex with hash', () => {
      expect(hexToInt('#ff5733')).toBe(0xff5733);
    });
    it('parses 6-digit hex without hash', () => {
      expect(hexToInt('3357ff')).toBe(0x3357ff);
    });
    it('parses lowercase', () => {
      expect(hexToInt('#abcdef')).toBe(0xabcdef);
    });
    it('returns default for invalid', () => {
      expect(hexToInt('xyz')).toBe(0x888888);
      expect(hexToInt('')).toBe(0x888888);
    });
  });

  describe('intToHex', () => {
    it('formats to 6-digit hex with hash', () => {
      expect(intToHex(0xff5733)).toBe('#ff5733');
    });
    it('pads zeros', () => {
      expect(intToHex(0x000001)).toBe('#000001');
    });
  });

  describe('getStampOffsetForFace', () => {
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 };

    it('computes offset for +X face', () => {
      const offset = getStampOffsetForFace([5, 1, 1], [1, 0, 0], bounds);
      expect(offset).toEqual([6, 1, 1]);
    });
    it('computes offset for -X face', () => {
      const offset = getStampOffsetForFace([5, 1, 1], [-1, 0, 0], bounds);
      expect(offset).toEqual([2, 1, 1]);
    });
    it('computes offset for +Y face', () => {
      const offset = getStampOffsetForFace([1, 5, 1], [0, 1, 0], bounds);
      expect(offset).toEqual([1, 6, 1]);
    });
    it('computes offset for neutral face (inside plane)', () => {
      const offset = getStampOffsetForFace([1, 1, 1], [0, 0, 0], bounds);
      expect(offset).toEqual([1, 1, 1]);
    });
  });

  describe('cloneVoxels', () => {
    it('returns new map with same entries', () => {
      const orig = new Map([['0,0,0', 0xff0000]]);
      const cloned = cloneVoxels(orig);
      expect(cloned).not.toBe(orig);
      expect(cloned.get('0,0,0')).toBe(0xff0000);
    });
  });

  describe('ensureGridFitsPositions', () => {
    it('grows grid when position exceeds bounds', () => {
      gridSize.set(8);
      ensureGridFitsPositions([[10, 0, 0]]);
      expect(get(gridSize)).toBe(22);
    });
    it('does not grow when within bounds', () => {
      gridSize.set(32);
      ensureGridFitsPositions([[5, 5, 5]]);
      expect(get(gridSize)).toBe(32);
    });
    it('does not exceed MAX_GRID_SIZE', () => {
      gridSize.set(8);
      ensureGridFitsPositions([[200, 0, 0]]);
      expect(get(gridSize)).toBeLessThanOrEqual(256);
    });
  });

  describe('shiftVoxelsAndSelection', () => {
    it('shifts voxels and selection by delta', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), 0xff0000],
          [coordKey(1, 0, 0), 0x00ff00]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), 0xff0000]]));

      shiftVoxelsAndSelection(2, 1, -1);

      const v = get(voxels);
      const s = get(selection);
      expect(v.get('2,1,-1')).toBe(0xff0000);
      expect(v.get('3,1,-1')).toBe(0x00ff00);
      expect(s.get('2,1,-1')).toBe(0xff0000);
    });
    it('no-op when both empty', () => {
      shiftVoxelsAndSelection(1, 1, 1);
      expect(get(voxels).size).toBe(0);
    });
    it('no-op when delta is zero', () => {
      voxels.set(new Map([['0,0,0', 0xff0000]]));
      shiftVoxelsAndSelection(0, 0, 0);
      expect(get(voxels).get('0,0,0')).toBe(0xff0000);
    });
  });

  describe('shiftSelection', () => {
    it('shifts only selected voxels', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), 0xff0000],
          [coordKey(1, 0, 0), 0x00ff00]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), 0xff0000]]));

      shiftSelection(3, 0, 0);

      const v = get(voxels);
      const s = get(selection);
      expect(v.get('3,0,0')).toBe(0xff0000);
      expect(v.get('1,0,0')).toBe(0x00ff00);
      expect(s.get('3,0,0')).toBe(0xff0000);
    });
    it('no-op when selection empty', () => {
      voxels.set(new Map([['0,0,0', 0xff0000]]));
      shiftSelection(1, 1, 1);
      expect(get(voxels).get('0,0,0')).toBe(0xff0000);
    });
  });

  describe('centerOriginOnObject', () => {
    it('centers voxels on origin', () => {
      voxels.set(
        new Map([
          [coordKey(4, 4, 4), 0xff0000],
          [coordKey(6, 6, 6), 0x00ff00]
        ])
      );
      centerOriginOnObject();
      const v = get(voxels);
      expect(v.has('-1,-1,-1')).toBe(true);
      expect(v.has('1,1,1')).toBe(true);
    });
  });

  describe('centerOriginOnSelection', () => {
    it('centers selection on origin', () => {
      voxels.set(
        new Map([
          [coordKey(4, 4, 4), 0xff0000],
          [coordKey(6, 6, 6), 0x00ff00]
        ])
      );
      selection.set(
        new Map([
          [coordKey(4, 4, 4), 0xff0000],
          [coordKey(6, 6, 6), 0x00ff00]
        ])
      );
      centerOriginOnSelection();
      const v = get(voxels);
      expect(v.has('-1,-1,-1')).toBe(true);
      expect(v.has('1,1,1')).toBe(true);
    });
  });

  describe('addShapeAt', () => {
    it('adds cube at position', () => {
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'cube',
        size: 2,
        getColor: () => 0xff0000
      });
      const v = get(voxels);
      expect(v.size).toBeGreaterThan(0);
      expect(v.get('0,0,0')).toBe(0xff0000);
    });
    it('no-op for empty shape', () => {
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'empty',
        size: 4,
        getColor: () => 0xff0000
      });
      expect(get(voxels).size).toBe(0);
    });
    it('no-op for size < 1', () => {
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'cube',
        size: 0,
        getColor: () => 0xff0000
      });
      expect(get(voxels).size).toBe(0);
    });
  });

  describe('getPaintColorResolver', () => {
    it('returns single color when one selected', () => {
      selectedColors.set([]);
      color.set('#ff0000');
      const resolver = getPaintColorResolver();
      expect(resolver()).toBe(0xff0000);
      expect(resolver()).toBe(0xff0000);
    });
    it('returns from selectedColors when non-empty', () => {
      selectedColors.set(['#ff0000', '#00ff00']);
      const resolver = getPaintColorResolver();
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) results.add(resolver());
      expect(results.has(0xff0000)).toBe(true);
      expect(results.has(0x00ff00)).toBe(true);
    });
  });
});
