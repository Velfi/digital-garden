import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { coordKey } from '../coordUtils';
import {
  voxels,
  hiddenVoxels,
  selection,
  gridSize,
  resetUndo,
  hexToInt,
  intToHex,
  getStampOffsetForFace,
  getPunchOffsetForFace,
  cloneVoxels,
  ensureGridFitsPositions,
  shiftVoxelsAndSelection,
  scaleProjectUniform,
  scaleProjectBy2,
  scaleProjectByHalf,
  rotateProjectByAngle,
  rotateProjectQuarterTurns,
  mirrorProjectAcrossAxis,
  runVoxelStroke,
  applySelectionMirrorAcrossAxisInStroke,
  shiftSelection,
  centerOriginOnObject,
  centerOriginOnSelection,
  addShapeAt,
  getPaintColorResolver,
  color,
  selectedColors,
  voxelMaterial,
  beginStroke,
  endStrokeUndo,
  applySelectionTranslationInStroke,
  applySelectionTranslationAlongAxis,
  applySelectionRotationInStroke,
  applySelectionRotationRadiansInStroke,
  applySelectionScaleInStroke,
  hideSelectedVoxels,
  unhideAllVoxels,
  updateVoxels,
  consumeDirtyVoxelKeys,
  type FaceNormal
} from './core';
import { plasticVoxel, type Voxel } from '../voxelMaterial';

function pv(rgb: number): Voxel {
  return plasticVoxel(rgb);
}

describe('core', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    hiddenVoxels.set(new Map());
    selection.set(new Map());
    voxelMaterial.set('plastic');
    consumeDirtyVoxelKeys();
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

  describe('getPunchOffsetForFace', () => {
    it('single-voxel selection: inward -Y aligns maxY to hit layer (not one below)', () => {
      const one = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
      const inwardY: FaceNormal = [0, -1, 0];
      const [dx, dy, dz] = getPunchOffsetForFace([0, 0, 0], inwardY, one);
      expect([dx, dy, dz]).toEqual([0, 0, 0]);
    });
    it('inward +X aligns minX to hit layer', () => {
      const one = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
      const [dx, dy, dz] = getPunchOffsetForFace([5, 0, 0], [1, 0, 0], one);
      expect([dx, dy, dz]).toEqual([5, 0, 0]);
    });
  });

  describe('cloneVoxels', () => {
    it('returns new map with same entries', () => {
      const orig = new Map([['0,0,0', pv(0xff0000)]]);
      const cloned = cloneVoxels(orig);
      expect(cloned).not.toBe(orig);
      expect(cloned.get('0,0,0')).toEqual(pv(0xff0000));
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
      expect(get(gridSize)).toBeLessThanOrEqual(65536);
    });
    it('expands grid when positions exceed grid', () => {
      gridSize.set(8);
      ensureGridFitsPositions([[50, 0, 0]]);
      expect(get(gridSize)).toBe(102);
    });
  });

  describe('shiftVoxelsAndSelection', () => {
    it('shifts voxels and selection by delta', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));

      shiftVoxelsAndSelection(2, 1, -1);

      const v = get(voxels);
      const s = get(selection);
      expect(v.get('2,1,-1')).toEqual(pv(0xff0000));
      expect(v.get('3,1,-1')).toEqual(pv(0x00ff00));
      expect(s.get('2,1,-1')).toEqual(pv(0xff0000));
    });
    it('no-op when both empty', () => {
      shiftVoxelsAndSelection(1, 1, 1);
      expect(get(voxels).size).toBe(0);
    });
    it('no-op when delta is zero', () => {
      voxels.set(new Map([['0,0,0', pv(0xff0000)]]));
      shiftVoxelsAndSelection(0, 0, 0);
      expect(get(voxels).get('0,0,0')).toEqual(pv(0xff0000));
    });
  });

  describe('scaleProjectBy2', () => {
    it('upscales with nearest-neighbor fill around model center', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      scaleProjectBy2();
      const v = get(voxels);
      expect(v.size).toBe(9 * 9 * 9);
      expect(v.get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
      expect(get(selection).size).toBe(9 * 9 * 9);
    });
    it('fills space between adjacent sources after upscale (NN)', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      scaleProjectBy2();
      const v = get(voxels);
      expect(v.size).toBe(972);
      const xs = [...v.keys()].map((k) => Number(k.split(',')[0]));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      expect(maxX - minX).toBeGreaterThanOrEqual(2);
      const colors = new Set([...v.values()].map((vx) => vx.color));
      expect(colors.has(0xff0000)).toBe(true);
      expect(colors.has(0x00ff00)).toBe(true);
    });
    it('no-op when voxels empty', () => {
      scaleProjectBy2();
      expect(get(voxels).size).toBe(0);
    });
  });

  describe('scaleProjectByHalf', () => {
    it('leaves a single voxel stable around center', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      scaleProjectByHalf();
      expect(get(voxels).size).toBe(1);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
    });
    it('after 2× NN upscale, ½× merges to a smaller solid block (not sparse inverse)', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      scaleProjectBy2();
      expect(get(voxels).size).toBe(9 * 9 * 9);
      scaleProjectByHalf();
      expect(get(voxels).size).toBe(5 * 5 * 5);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
      expect([...get(voxels).values()].every((vx) => vx.color === 0xff0000)).toBe(true);
    });
    it('no-op when voxels empty', () => {
      scaleProjectByHalf();
      expect(get(voxels).size).toBe(0);
    });
  });

  describe('rotateProjectQuarterTurns', () => {
    it('no-op when voxels empty', () => {
      rotateProjectQuarterTurns(2, 1);
      expect(get(voxels).size).toBe(0);
    });
    it('single voxel at origin is unchanged by 90° Z', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      rotateProjectQuarterTurns(2, 1);
      expect(get(voxels).size).toBe(1);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
    });
    it('90° Z keeps two-voxel bar size (matches selection gizmo math)', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(cloneVoxels(get(voxels)));
      beginStroke();
      applySelectionRotationInStroke(2, 1);
      const expected = cloneVoxels(get(voxels));
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(new Map());
      rotateProjectQuarterTurns(2, 1);
      expect(get(voxels)).toEqual(expected);
    });
  });

  describe('rotateProjectByAngle', () => {
    it('supports arbitrary-angle project rotation', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      rotateProjectByAngle(2, (33 * Math.PI) / 180);
      const v = get(voxels);
      expect(v.size).toBeGreaterThanOrEqual(2);
      const colors = new Set([...v.values()].map((x) => x.color));
      expect(colors.has(0xff0000)).toBe(true);
      expect(colors.has(0x00ff00)).toBe(true);
    });
  });

  describe('mirrorProjectAcrossAxis', () => {
    it('swaps two voxels symmetric about model center on X', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(new Map());
      mirrorProjectAcrossAxis(0);
      const v = get(voxels);
      expect(v.get(coordKey(0, 0, 0))).toEqual(pv(0x00ff00));
      expect(v.get(coordKey(1, 0, 0))).toEqual(pv(0xff0000));
    });
  });

  describe('applySelectionMirrorAcrossAxisInStroke', () => {
    it('mirrors only selected voxels across selection center', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(2, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(2, 0, 0), pv(0x00ff00)]
        ])
      );
      runVoxelStroke(() => {
        applySelectionMirrorAcrossAxisInStroke(0);
      });
      const v = get(voxels);
      const s = get(selection);
      expect(v.get(coordKey(0, 0, 0))).toEqual(pv(0x00ff00));
      expect(v.get(coordKey(2, 0, 0))).toEqual(pv(0xff0000));
      expect(s.get(coordKey(0, 0, 0))).toEqual(pv(0x00ff00));
      expect(s.get(coordKey(2, 0, 0))).toEqual(pv(0xff0000));
    });
  });

  describe('scaleProjectUniform', () => {
    it('merges deterministically for scale-down collisions', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xaa0000)],
          [coordKey(1, 0, 0), pv(0x00aa00)],
          [coordKey(2, 0, 0), pv(0x0000aa)]
        ])
      );
      scaleProjectUniform(0.2);
      const v = get(voxels);
      expect(v.size).toBe(1);
      expect([...v.values()][0]).toEqual(pv(0xaa0000));
    });
  });

  describe('shiftSelection', () => {
    it('shifts only selected voxels', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));

      shiftSelection(3, 0, 0);

      const v = get(voxels);
      const s = get(selection);
      expect(v.get('3,0,0')).toEqual(pv(0xff0000));
      expect(v.get('1,0,0')).toEqual(pv(0x00ff00));
      expect(s.get('3,0,0')).toEqual(pv(0xff0000));
    });
    it('no-op when selection empty', () => {
      voxels.set(new Map([['0,0,0', pv(0xff0000)]]));
      shiftSelection(1, 1, 1);
      expect(get(voxels).get('0,0,0')).toEqual(pv(0xff0000));
    });
  });

  describe('centerOriginOnObject', () => {
    it('centers voxels on origin', () => {
      voxels.set(
        new Map([
          [coordKey(4, 4, 4), pv(0xff0000)],
          [coordKey(6, 6, 6), pv(0x00ff00)]
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
          [coordKey(4, 4, 4), pv(0xff0000)],
          [coordKey(6, 6, 6), pv(0x00ff00)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(4, 4, 4), pv(0xff0000)],
          [coordKey(6, 6, 6), pv(0x00ff00)]
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
        getVoxel: () => pv(0xff0000)
      });
      const v = get(voxels);
      expect(v.size).toBeGreaterThan(0);
      expect(v.get('0,0,0')).toEqual(pv(0xff0000));
    });
    it('no-op for empty shape', () => {
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'empty',
        size: 4,
        getVoxel: () => pv(0xff0000)
      });
      expect(get(voxels).size).toBe(0);
    });
    it('no-op for size < 1', () => {
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'cube',
        size: 0,
        getVoxel: () => pv(0xff0000)
      });
      expect(get(voxels).size).toBe(0);
    });
    it('when overwriteIntersecting is false, leaves occupied cells unchanged', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0x00ff00)]]));
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'cube',
        size: 1,
        getVoxel: () => pv(0xff0000),
        overwriteIntersecting: false
      });
      const v = get(voxels);
      expect(v.size).toBe(1);
      expect(v.get(coordKey(0, 0, 0))).toEqual(pv(0x00ff00));
    });
    it('when overwriteIntersecting is false, fills only empty cells in shape', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0x00ff00)]]));
      addShapeAt({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shape: 'cube',
        size: 2,
        getVoxel: () => pv(0xff0000),
        overwriteIntersecting: false
      });
      const v = get(voxels);
      expect(v.get(coordKey(0, 0, 0))).toEqual(pv(0x00ff00));
      expect(v.size).toBe(8);
      expect(v.get(coordKey(-1, -1, -1))).toEqual(pv(0xff0000));
    });
  });

  describe('applySelectionTranslationInStroke', () => {
    it('moves selected voxel through wall, overwrites destination, leaves no duplicate', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x0000ff)]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionTranslationInStroke(1, 0, 0);
      const v = get(voxels);
      expect(v.has(coordKey(0, 0, 0))).toBe(false);
      expect(v.get(coordKey(1, 0, 0))).toEqual(pv(0xff0000));
      expect(get(selection).has(coordKey(1, 0, 0))).toBe(true);
    });

    it('translates all selected voxels together', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(2, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(2, 0, 0), pv(0x00ff00)]
        ])
      );
      beginStroke();
      applySelectionTranslationInStroke(0, 1, 0);
      const v = get(voxels);
      expect(v.has(coordKey(0, 0, 0))).toBe(false);
      expect(v.has(coordKey(2, 0, 0))).toBe(false);
      expect(v.get(coordKey(0, 1, 0))).toEqual(pv(0xff0000));
      expect(v.get(coordKey(2, 1, 0))).toEqual(pv(0x00ff00));
      const s = get(selection);
      expect(s.has(coordKey(0, 1, 0))).toBe(true);
      expect(s.has(coordKey(2, 1, 0))).toBe(true);
    });

    it('translates selection keys when no voxels at keys (no voxel map change)', () => {
      selection.set(new Map([[coordKey(5, 5, 5), pv(0xff0000)]]));
      beginStroke();
      applySelectionTranslationInStroke(-1, 0, 2);
      const s = get(selection);
      expect(s.has(coordKey(4, 5, 7))).toBe(true);
      expect(get(voxels).size).toBe(0);
    });

    it('no-op for zero delta', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionTranslationInStroke(0, 0, 0);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
      expect(get(selection).has(coordKey(0, 0, 0))).toBe(true);
    });
  });

  describe('applySelectionTranslationAlongAxis', () => {
    it('delegates to applySelectionTranslationInStroke per axis', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionTranslationAlongAxis(0, 2);
      expect(get(voxels).get(coordKey(2, 0, 0))).toEqual(pv(0xff0000));
      beginStroke();
      applySelectionTranslationAlongAxis(1, -1);
      expect(get(voxels).get(coordKey(2, -1, 0))).toEqual(pv(0xff0000));
      beginStroke();
      applySelectionTranslationAlongAxis(2, 1);
      expect(get(voxels).get(coordKey(2, -1, 1))).toEqual(pv(0xff0000));
    });
  });

  describe('applySelectionRotationInStroke', () => {
    it('keeps a single selected voxel on the same cell after 90° Z (re-centered after round)', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionRotationInStroke(2, 1);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
      expect(get(selection).has(coordKey(0, 0, 0))).toBe(true);
    });

    it('90° Z rotation applies when footprint overlaps unselected voxels (replaces them)', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0xff0000)],
          [coordKey(1, 1, 0), pv(0x00ff00)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0xff0000)]
        ])
      );
      beginStroke();
      applySelectionRotationInStroke(2, 1);
      const s = get(selection);
      expect(s.size).toBeGreaterThanOrEqual(2);
      expect([...s.values()].every((vx) => vx.color === 0xff0000)).toBe(true);
      expect(get(voxels).get(coordKey(1, 1, 0))?.color).toBe(0xff0000);
    });

    it('no-op for zero quarter steps', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionRotationInStroke(1, 0);
      expect(get(voxels).get(coordKey(0, 0, 0))).toEqual(pv(0xff0000));
    });

    it('supports arbitrary-angle selection rotation', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(cloneVoxels(get(voxels)));
      beginStroke();
      applySelectionRotationRadiansInStroke(2, (33 * Math.PI) / 180);
      const s = get(selection);
      expect(s.size).toBeGreaterThanOrEqual(2);
      const colors = new Set([...s.values()].map((x) => x.color));
      expect(colors.has(0xff0000)).toBe(true);
      expect(colors.has(0x00ff00)).toBe(true);
    });

    it('arbitrary-angle rotation applies when footprint overlaps unselected voxels', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0xff0000)],
          [coordKey(1, 1, 0), pv(0x00ff00)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0xff0000)]
        ])
      );
      beginStroke();
      applySelectionRotationRadiansInStroke(2, Math.PI / 2);
      const s = get(selection);
      expect(s.size).toBeGreaterThanOrEqual(2);
      expect([...s.values()].every((vx) => vx.color === 0xff0000)).toBe(true);
      expect(get(voxels).get(coordKey(1, 1, 0))?.color).toBe(0xff0000);
    });

    it('scales selection down with lexicographic merge', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xaa0000)],
          [coordKey(1, 0, 0), pv(0x00aa00)],
          [coordKey(2, 0, 0), pv(0x0000aa)]
        ])
      );
      selection.set(cloneVoxels(get(voxels)));
      beginStroke();
      applySelectionScaleInStroke(0.2);
      const v = get(voxels);
      expect(v.size).toBe(1);
      expect([...v.values()][0]).toEqual(pv(0xaa0000));
      expect(get(selection).size).toBe(1);
    });

    it('scale-up fills past unselected neighbors (NN expansion, no intrusion abort)', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      selection.set(new Map([[coordKey(0, 0, 0), pv(0xff0000)]]));
      beginStroke();
      applySelectionScaleInStroke(2);
      endStrokeUndo();
      expect(get(voxels).size).toBeGreaterThan(1);
    });
  });

  describe('hide/unhide voxels', () => {
    it('hides selected occupied voxels and supports incremental hides', () => {
      voxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)],
          [coordKey(2, 0, 0), pv(0x0000ff)]
        ])
      );
      selection.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      hideSelectedVoxels();
      expect(get(voxels).has(coordKey(0, 0, 0))).toBe(false);
      expect(get(voxels).has(coordKey(1, 0, 0))).toBe(false);
      expect(get(hiddenVoxels).has(coordKey(0, 0, 0))).toBe(true);
      expect(get(hiddenVoxels).has(coordKey(1, 0, 0))).toBe(true);
      expect(get(selection).size).toBe(0);

      selection.set(new Map([[coordKey(2, 0, 0), pv(0x0000ff)]]));
      hideSelectedVoxels();
      expect(get(voxels).size).toBe(0);
      expect(get(hiddenVoxels).size).toBe(3);
    });

    it('unhide all restores hidden voxels and clears hidden store', () => {
      voxels.set(new Map([[coordKey(5, 0, 0), pv(0x111111)]]));
      hiddenVoxels.set(
        new Map([
          [coordKey(0, 0, 0), pv(0xff0000)],
          [coordKey(1, 0, 0), pv(0x00ff00)]
        ])
      );
      unhideAllVoxels();
      const v = get(voxels);
      expect(v.has(coordKey(0, 0, 0))).toBe(true);
      expect(v.has(coordKey(1, 0, 0))).toBe(true);
      expect(v.has(coordKey(5, 0, 0))).toBe(true);
      expect(get(hiddenVoxels).size).toBe(0);
    });
  });

  describe('getPaintColorResolver', () => {
    it('returns single voxel when one selected', () => {
      selectedColors.set([]);
      color.set('#ff0000');
      voxelMaterial.set('plastic');
      const resolver = getPaintColorResolver();
      expect(resolver(0, 0, 0)).toEqual({ color: 0xff0000, material: 'plastic' });
      expect(resolver(10, -3, 4)).toEqual({ color: 0xff0000, material: 'plastic' });
    });
    it('returns deterministic colors from selectedColors when non-empty', () => {
      selectedColors.set(['#ff0000', '#00ff00']);
      voxelMaterial.set('metal');
      const resolver = getPaintColorResolver();
      const a = resolver(3, 7, -1);
      const b = resolver(3, 7, -1);
      const c = resolver(4, 7, -1);
      expect(a.material).toBe('metal');
      expect(b.material).toBe('metal');
      expect(c.material).toBe('metal');
      expect(a.color).toBe(b.color);
      expect(new Set([a.color, c.color]).size).toBeGreaterThanOrEqual(1);
      expect(new Set([a.color, c.color]).size).toBeLessThanOrEqual(2);
    });
  });

  describe('dirty voxel tracking', () => {
    it('tracks changed keys and clears on consume', () => {
      updateVoxels((v) => {
        v.set(coordKey(1, 2, 3), pv(0xff0000));
        v.set(coordKey(2, 2, 3), pv(0x00ff00));
      });
      const dirty = consumeDirtyVoxelKeys();
      expect(dirty.has(coordKey(1, 2, 3))).toBe(true);
      expect(dirty.has(coordKey(2, 2, 3))).toBe(true);
      expect(consumeDirtyVoxelKeys().size).toBe(0);
    });

    it('does not track no-op writes', () => {
      voxels.set(new Map([[coordKey(0, 0, 0), pv(0xff00ff)]]));
      consumeDirtyVoxelKeys();
      updateVoxels((v) => {
        v.set(coordKey(0, 0, 0), pv(0xff00ff));
      });
      expect(consumeDirtyVoxelKeys().size).toBe(0);
    });
  });
});
