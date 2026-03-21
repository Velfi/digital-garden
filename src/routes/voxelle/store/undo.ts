import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { serializeVoxels, deserializeVoxels } from './serialization';
import type { Voxel } from '../voxelMaterial';

const MAX_UNDO = 50;

type UndoEntry = { v: string; s: string };

export type UndoSnapshot = {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
};

export function createUndo(
  voxels: Writable<Map<string, Voxel>>,
  selection: Writable<Map<string, Voxel>>
) {
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];

  function pushUndo() {
    redoStack.length = 0;
    undoStack.push({
      v: serializeVoxels(get(voxels)),
      s: serializeVoxels(get(selection))
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(false);
  }

  function doUndo() {
    if (undoStack.length === 0) return;
    redoStack.push({
      v: serializeVoxels(get(voxels)),
      s: serializeVoxels(get(selection))
    });
    const snapshot = undoStack.pop()!;
    voxels.set(deserializeVoxels(snapshot.v));
    selection.set(deserializeVoxels(snapshot.s));
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(redoStack.length > 0);
  }

  function doRedo() {
    if (redoStack.length === 0) return;
    undoStack.push({
      v: serializeVoxels(get(voxels)),
      s: serializeVoxels(get(selection))
    });
    const snapshot = redoStack.pop()!;
    voxels.set(deserializeVoxels(snapshot.v));
    selection.set(deserializeVoxels(snapshot.s));
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(redoStack.length > 0);
  }

  function reset() {
    undoStack.length = 0;
    redoStack.length = 0;
    canUndoStore.set(false);
    canRedoStore.set(false);
  }

  function getSnapshot(): UndoSnapshot {
    return {
      undoStack: [...undoStack],
      redoStack: [...redoStack]
    };
  }

  function restoreSnapshot(snapshot: UndoSnapshot) {
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push(...snapshot.undoStack);
    redoStack.push(...snapshot.redoStack);
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(redoStack.length > 0);
  }

  return {
    pushUndo,
    doUndo,
    doRedo,
    reset,
    getSnapshot,
    restoreSnapshot,
    history: {
      undo: doUndo,
      redo: doRedo,
      get canUndo() {
        return canUndoStore;
      },
      get canRedo() {
        return canRedoStore;
      }
    },
    canUndoStore,
    canRedoStore
  };
}
