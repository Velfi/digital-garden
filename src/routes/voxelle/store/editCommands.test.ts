import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { coordKey } from '../coordUtils';
import { selection, voxels, resetUndo, gridSize, history } from './core';
import { plasticVoxel } from '../voxelMaterial';
import { commitSelectionMergeEdit, commitVoxelMapReplace } from './editCommands';

describe('editCommands', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  it('commitSelectionMergeEdit records one undo step', () => {
    const incoming = new Map([[coordKey(0, 0, 0), plasticVoxel(0xff0000)]]);
    commitSelectionMergeEdit(incoming, 'replace', false);
    expect(get(selection).has(coordKey(0, 0, 0))).toBe(true);
    history.undo();
    expect(get(selection).size).toBe(0);
  });

  it('commitVoxelMapReplace records one undo step', () => {
    const next = new Map([[coordKey(1, 1, 1), plasticVoxel(0x00ff00)]]);
    commitVoxelMapReplace(next);
    expect(get(voxels).get(coordKey(1, 1, 1))).toBeDefined();
    history.undo();
    expect(get(voxels).size).toBe(0);
  });
});
