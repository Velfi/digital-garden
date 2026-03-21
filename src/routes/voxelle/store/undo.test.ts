import { describe, it, expect } from 'vitest';
import { writable, get } from 'svelte/store';
import { createUndo } from './undo';
import type { Voxel } from '../voxelMaterial';
import { plasticVoxel } from '../voxelMaterial';

function makeVoxels(entries: [string, Voxel][]) {
  return new Map(entries);
}

describe('createUndo', () => {
  it('pushUndo snapshots state and doUndo restores', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.pushUndo();
    voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    selection.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));

    undo.doUndo();

    expect(get(voxels).get('0,0,0')!.color).toBe(0xff0000);
    expect(get(voxels).has('1,1,1')).toBe(false);
  });

  it('doRedo restores forward', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.pushUndo();
    voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    undo.doUndo();
    undo.doRedo();

    expect(get(voxels).get('1,1,1')!.color).toBe(0x00ff00);
    expect(get(voxels).has('0,0,0')).toBe(false);
  });

  it('reset clears stacks', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.pushUndo();
    voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    undo.reset();

    expect(get(undo.canUndoStore)).toBe(false);
    expect(get(undo.canRedoStore)).toBe(false);
    undo.doUndo();
    expect(get(voxels).get('1,1,1')!.color).toBe(0x00ff00);
  });

  it('canUndo and canRedo store updates', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    expect(get(undo.canUndoStore)).toBe(false);
    expect(get(undo.canRedoStore)).toBe(false);

    undo.pushUndo();
    expect(get(undo.canUndoStore)).toBe(true);
    expect(get(undo.canRedoStore)).toBe(false);

    undo.doUndo();
    expect(get(undo.canUndoStore)).toBe(false);
    expect(get(undo.canRedoStore)).toBe(true);

    undo.doRedo();
    expect(get(undo.canUndoStore)).toBe(true);
    expect(get(undo.canRedoStore)).toBe(false);
  });

  it('history.undo and history.redo work', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.pushUndo();
    voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    undo.history.undo();
    expect(get(voxels).get('0,0,0')!.color).toBe(0xff0000);

    undo.history.redo();
    expect(get(voxels).get('1,1,1')!.color).toBe(0x00ff00);
  });

  it('doUndo is no-op when stack empty', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.doUndo();
    expect(get(voxels).get('0,0,0')!.color).toBe(0xff0000);
  });

  it('pushUndo clears redo stack', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    undo.pushUndo();
    voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    undo.doUndo();
    undo.pushUndo();
    expect(get(undo.canRedoStore)).toBe(false);
    undo.doRedo();
    expect(get(voxels).get('0,0,0')!.color).toBe(0xff0000);
  });
});
