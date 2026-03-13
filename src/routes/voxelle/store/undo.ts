import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { serializeVoxels, deserializeVoxels } from './serialization';

const MAX_UNDO = 50;

export function createUndo(voxels: Writable<Map<string, number>>) {
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const undoStack: string[] = [];
  const redoStack: string[] = [];

  function pushUndo() {
    const v = get(voxels);
    redoStack.length = 0;
    undoStack.push(serializeVoxels(v));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(false);
  }

  function doUndo() {
    if (undoStack.length === 0) return;
    const current = serializeVoxels(get(voxels));
    redoStack.push(current);
    const snapshot = undoStack.pop()!;
    voxels.set(deserializeVoxels(snapshot));
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(redoStack.length > 0);
  }

  function doRedo() {
    if (redoStack.length === 0) return;
    const current = serializeVoxels(get(voxels));
    undoStack.push(current);
    const snapshot = redoStack.pop()!;
    voxels.set(deserializeVoxels(snapshot));
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
