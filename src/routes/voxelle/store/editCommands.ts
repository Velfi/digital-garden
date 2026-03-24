/**
 * Document-edit entry points: prefer these at boundaries for consistent undo and tests.
 */
import { get } from 'svelte/store';
import type { Voxel } from '../voxelMaterial';
import { commitUndoAfter, runVoxelStroke, selection, voxels, type SelectionMode } from './core';
import { mergeSelection } from './selection';

export { commitUndoAfter, runVoxelStroke };

/** Selection-only change as one undo snapshot (voxel map unchanged). */
export function commitSelectionMergeEdit(
  incoming: Map<string, Voxel>,
  mode: SelectionMode,
  shiftAdd: boolean
): void {
  commitUndoAfter(() => {
    const next = mergeSelection(get(selection), incoming, shiftAdd ? 'add' : mode);
    selection.set(next);
  });
}

/** Replace the entire voxel map as one undo step. */
export function commitVoxelMapReplace(next: Map<string, Voxel>): void {
  commitUndoAfter(() => {
    voxels.set(next);
  });
}
