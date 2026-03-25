import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { serializeVoxels, deserializeVoxels } from './serialization';
import type { UndoDelta } from './serialization';
import {
  applyUndoDeltaInverse,
  applyUndoDeltaForward,
  isUndoDeltaEmpty,
  voxelKeysTouchedInUndoDeltaVoxels
} from './serialization';
import type { Voxel } from '../voxelMaterial';
import { recomputeGlowVoxelCountFromMap } from './voxelDerivedStats';
import {
  clearPendingUndoRedoGesture,
  measureRedoDuration,
  measureUndoDuration
} from './projectPerf';

const MAX_UNDO = 50;

/** Delta step (forward: state before edit → state after) or legacy full snapshot. */
export type UndoStackEntry = { k: 'd'; d: UndoDelta } | { k: 'f'; v: string; s: string };

export type UndoSnapshot = {
  undoStack: UndoStackEntry[];
  redoStack: UndoStackEntry[];
};

function normalizeLoadedEntry(raw: unknown): UndoStackEntry {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid undo entry');
  const o = raw as Record<string, unknown>;
  if (o.k === 'd' && o.d && typeof o.d === 'object') {
    const d = o.d as UndoDelta;
    return {
      k: 'd',
      d: {
        voxelAdded: Array.isArray(d.voxelAdded) ? d.voxelAdded : [],
        voxelRemoved: Array.isArray(d.voxelRemoved) ? d.voxelRemoved : [],
        selectionAdded: Array.isArray(d.selectionAdded) ? d.selectionAdded : [],
        selectionRemoved: Array.isArray(d.selectionRemoved) ? d.selectionRemoved : []
      }
    };
  }
  if (o.k === 'f' && typeof o.v === 'string' && typeof o.s === 'string') {
    return { k: 'f', v: o.v, s: o.s };
  }
  if (typeof o.v === 'string' && typeof o.s === 'string') {
    return { k: 'f', v: o.v, s: o.s };
  }
  throw new Error('Invalid undo entry shape');
}

export type UndoMeshDirtyOptions = {
  /** Mark these voxel keys dirty so the mesh worker can incrementally rebuild (delta steps only). */
  noteVoxelKeysDirty?: (keys: ReadonlySet<string>) => void;
};

export function createUndo(
  voxels: Writable<Map<string, Voxel>>,
  selection: Writable<Map<string, Voxel>>,
  meshDirty?: UndoMeshDirtyOptions
) {
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const undoStack: UndoStackEntry[] = [];
  const redoStack: UndoStackEntry[] = [];

  function clearRedo() {
    redoStack.length = 0;
    canRedoStore.set(false);
  }

  function pushUndoDelta(delta: UndoDelta) {
    if (isUndoDeltaEmpty(delta)) return;
    clearRedo();
    undoStack.push({ k: 'd', d: delta });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    canUndoStore.set(undoStack.length > 0);
  }

  function doUndo() {
    measureUndoDuration(() => {
      if (undoStack.length === 0) {
        clearPendingUndoRedoGesture();
        return;
      }
      const entry = undoStack.pop()!;
      if (entry.k === 'f') {
        redoStack.push({
          k: 'f',
          v: serializeVoxels(get(voxels)),
          s: serializeVoxels(get(selection))
        });
        voxels.set(deserializeVoxels(entry.v));
        recomputeGlowVoxelCountFromMap(get(voxels));
        selection.set(deserializeVoxels(entry.s));
      } else {
        redoStack.push(entry);
        meshDirty?.noteVoxelKeysDirty?.(voxelKeysTouchedInUndoDeltaVoxels(entry.d));
        const curV = get(voxels);
        const curS = get(selection);
        const { v, s } = applyUndoDeltaInverse(curV, curS, entry.d);
        voxels.set(v);
        recomputeGlowVoxelCountFromMap(v);
        selection.set(s);
      }
      canUndoStore.set(undoStack.length > 0);
      canRedoStore.set(redoStack.length > 0);
    });
  }

  function doRedo() {
    measureRedoDuration(() => {
      if (redoStack.length === 0) {
        clearPendingUndoRedoGesture();
        return;
      }
      const entry = redoStack.pop()!;
      if (entry.k === 'f') {
        undoStack.push({
          k: 'f',
          v: serializeVoxels(get(voxels)),
          s: serializeVoxels(get(selection))
        });
        voxels.set(deserializeVoxels(entry.v));
        recomputeGlowVoxelCountFromMap(get(voxels));
        selection.set(deserializeVoxels(entry.s));
      } else {
        undoStack.push(entry);
        meshDirty?.noteVoxelKeysDirty?.(voxelKeysTouchedInUndoDeltaVoxels(entry.d));
        const curV = get(voxels);
        const curS = get(selection);
        const { v, s } = applyUndoDeltaForward(curV, curS, entry.d);
        voxels.set(v);
        recomputeGlowVoxelCountFromMap(v);
        selection.set(s);
      }
      canUndoStore.set(undoStack.length > 0);
      canRedoStore.set(redoStack.length > 0);
    });
  }

  function reset() {
    undoStack.length = 0;
    redoStack.length = 0;
    canUndoStore.set(false);
    canRedoStore.set(false);
  }

  function getSnapshot(): UndoSnapshot {
    return {
      undoStack: undoStack.map((e) => structuredClone(e)),
      redoStack: redoStack.map((e) => structuredClone(e))
    };
  }

  function restoreSnapshot(snapshot: UndoSnapshot) {
    undoStack.length = 0;
    redoStack.length = 0;
    for (const e of snapshot.undoStack) {
      undoStack.push(normalizeLoadedEntry(e));
    }
    for (const e of snapshot.redoStack) {
      redoStack.push(normalizeLoadedEntry(e));
    }
    canUndoStore.set(undoStack.length > 0);
    canRedoStore.set(redoStack.length > 0);
  }

  return {
    pushUndoDelta,
    /** Clears redo; exposed for tests and advanced callers. */
    clearRedo,
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
