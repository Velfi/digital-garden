import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { serializeVoxels, deserializeVoxels } from './serialization';

const MAX_UNDO = 50;

type UndoSnapshot = { v: string; s: string };

export function createUndo(
  voxels: Writable<Map<string, number>>,
  selection: Writable<Map<string, number>>
) {
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const undoStack: UndoSnapshot[] = [];
  const redoStack: UndoSnapshot[] = [];

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

  return {
    pushUndo,
    doUndo,
    doRedo,
    reset,
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
