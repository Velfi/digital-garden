import type { UndoDelta } from './serialization';
import { applyVoxelChunkIndexAfterKeyChange, VOXEL_MESH_CHUNK_SIZE } from './voxelChunkIndex';
import { bumpGlowVoxelCount } from './voxelDerivedStats';
import type { Voxel } from '../voxelMaterial';

/** Mutate voxel map for undo (inverse of forward edit). O(delta) — no full-map clone. */
export function applyUndoDeltaInverseToVoxelsInPlace(v: Map<string, Voxel>, delta: UndoDelta): void {
  for (const [k] of delta.voxelAdded) {
    const before = v.get(k);
    v.delete(k);
    applyVoxelChunkIndexAfterKeyChange(k, before, undefined, VOXEL_MESH_CHUNK_SIZE);
    bumpGlowVoxelCount(before, undefined);
  }
  for (const [k, c] of delta.voxelRemoved) {
    const before = v.get(k);
    v.set(k, c);
    applyVoxelChunkIndexAfterKeyChange(k, before, c, VOXEL_MESH_CHUNK_SIZE);
    bumpGlowVoxelCount(before, c);
  }
}

/** Mutate voxel map for redo (re-apply forward edit). O(delta) — no full-map clone. */
export function applyUndoDeltaForwardToVoxelsInPlace(v: Map<string, Voxel>, delta: UndoDelta): void {
  for (const [k] of delta.voxelRemoved) {
    const before = v.get(k);
    v.delete(k);
    applyVoxelChunkIndexAfterKeyChange(k, before, undefined, VOXEL_MESH_CHUNK_SIZE);
    bumpGlowVoxelCount(before, undefined);
  }
  for (const [k, c] of delta.voxelAdded) {
    const before = v.get(k);
    v.set(k, c);
    applyVoxelChunkIndexAfterKeyChange(k, before, c, VOXEL_MESH_CHUNK_SIZE);
    bumpGlowVoxelCount(before, c);
  }
}

export function applyUndoDeltaInverseToSelectionInPlace(s: Map<string, Voxel>, delta: UndoDelta): void {
  for (const [k] of delta.selectionAdded) s.delete(k);
  for (const [k, c] of delta.selectionRemoved) s.set(k, c);
}

export function applyUndoDeltaForwardToSelectionInPlace(s: Map<string, Voxel>, delta: UndoDelta): void {
  for (const [k] of delta.selectionRemoved) s.delete(k);
  for (const [k, c] of delta.selectionAdded) s.set(k, c);
}
