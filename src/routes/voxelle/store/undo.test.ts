import { describe, it, expect } from 'vitest';
import { writable, get } from 'svelte/store';
import { createUndo } from './undo';
import { computeUndoDelta } from './serialization';
import type { Voxel } from '../voxelMaterial';
import { plasticVoxel } from '../voxelMaterial';

function makeVoxels(entries: [string, Voxel][]) {
  return new Map(entries);
}

/** Matches `commitUndoAfter`: clear redo, mutate, push forward delta. */
function commitDelta(
  undo: ReturnType<typeof createUndo>,
  voxels: ReturnType<typeof writable<Map<string, Voxel>>>,
  selection: ReturnType<typeof writable<Map<string, Voxel>>>,
  mutate: () => void
) {
  undo.clearRedo();
  const oldV = get(voxels);
  const oldS = get(selection);
  mutate();
  undo.pushUndoDelta(computeUndoDelta(oldV, oldS, get(voxels), get(selection)));
}

describe('createUndo', () => {
  it('delta undo restores prior voxels and selection', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
      selection.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

    undo.doUndo();

    expect(get(voxels).get('0,0,0')!.color).toBe(0xff0000);
    expect(get(voxels).has('1,1,1')).toBe(false);
  });

  it('doRedo restores forward', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

    undo.doUndo();
    undo.doRedo();

    expect(get(voxels).get('1,1,1')!.color).toBe(0x00ff00);
    expect(get(voxels).has('0,0,0')).toBe(false);
  });

  it('reset clears stacks', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

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

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

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

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

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

  it('new commit clears redo stack', () => {
    const voxels = writable(makeVoxels([['0,0,0', plasticVoxel(0xff0000)]]));
    const selection = writable(new Map<string, Voxel>());
    const undo = createUndo(voxels, selection);

    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['1,1,1', plasticVoxel(0x00ff00)]]));
    });

    undo.doUndo();
    commitDelta(undo, voxels, selection, () => {
      voxels.set(makeVoxels([['2,2,2', plasticVoxel(0x0000ff)]]));
    });

    expect(get(undo.canRedoStore)).toBe(false);
    undo.doRedo();
    expect(get(voxels).get('2,2,2')!.color).toBe(0x0000ff);
  });
});
