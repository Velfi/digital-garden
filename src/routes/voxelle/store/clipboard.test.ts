import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { voxels, selection, gridSize, resetUndo } from './core';
import { copySelection, pasteFromClipboard, cutSelection } from './clipboard';
import { plasticVoxel, type Voxel } from '../voxelMaterial';

function makeVoxels(entries: [number, number, number, number][]): Map<string, Voxel> {
  const m = new Map<string, Voxel>();
  for (const [x, y, z, col] of entries) m.set(`${x},${y},${z}`, plasticVoxel(col));
  return m;
}

describe('clipboard', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const readText = vi.fn();

  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
    vi.stubGlobal('navigator', {
      clipboard: { writeText, readText }
    });
    writeText.mockClear();
    readText.mockClear();
  });

  describe('copySelection', () => {
    it('returns false when selection empty', async () => {
      voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
      const result = await copySelection();
      expect(result).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('writes valid JSON when selection has voxels', async () => {
      voxels.set(
        makeVoxels([
          [0, 0, 0, 0xff0000],
          [1, 0, 0, 0x00ff00]
        ])
      );
      selection.set(
        makeVoxels([
          [0, 0, 0, 0xff0000],
          [1, 0, 0, 0x00ff00]
        ])
      );
      const result = await copySelection();
      expect(result).toBe(true);
      expect(writeText).toHaveBeenCalledTimes(1);
      const written = JSON.parse(writeText.mock.calls[0][0]);
      expect(written.type).toBe('voxelle');
      expect(written.entries).toHaveLength(2);
    });

    it('skips selection entries with no voxel', async () => {
      voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
      selection.set(
        makeVoxels([
          [0, 0, 0, 0xff0000],
          [5, 5, 5, 0x00ff00]
        ])
      );
      const result = await copySelection();
      expect(result).toBe(true);
      const written = JSON.parse(writeText.mock.calls[0][0]);
      expect(written.entries).toHaveLength(1);
    });
  });

  describe('pasteFromClipboard', () => {
    it('returns false for invalid JSON', async () => {
      readText.mockResolvedValue('invalid');
      const result = await pasteFromClipboard();
      expect(result).toBe(false);
    });

    it('returns false for wrong type', async () => {
      readText.mockResolvedValue(JSON.stringify({ type: 'other', entries: [] }));
      const result = await pasteFromClipboard();
      expect(result).toBe(false);
    });

    it('pastes valid voxelle data', async () => {
      const payload = {
        type: 'voxelle',
        entries: [
          [0, 0, 0, 0xff0000],
          [1, 1, 1, 0x00ff00]
        ]
      };
      readText.mockResolvedValue(JSON.stringify(payload));
      const result = await pasteFromClipboard();
      expect(result).toBe(true);
      const v = get(voxels);
      expect(v.get('0,0,0')).toEqual(plasticVoxel(0xff0000));
      expect(v.get('1,1,1')).toEqual(plasticVoxel(0x00ff00));
    });
  });

  describe('cutSelection', () => {
    it('copies and removes voxels', async () => {
      voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
      selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
      const result = await cutSelection();
      expect(result).toBe(true);
      expect(writeText).toHaveBeenCalled();
      expect(get(voxels).has('0,0,0')).toBe(false);
      expect(get(selection).size).toBe(0);
    });
  });
});
