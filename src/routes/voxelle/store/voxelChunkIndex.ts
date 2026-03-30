import { parseCoordKeyInts } from '../coordUtils';
import type { Voxel } from '../voxelMaterial';

/**
 * Chunk size for the greedy mesh incremental path (see `CHUNK_THRESHOLD` in meshManager).
 * Index must match `chunkSize` passed to `packSparseChunksForWorker` when using the fast path.
 */
export const VOXEL_MESH_CHUNK_SIZE = 32;

const chunkIdToKeys = new Map<string, Set<string>>();

export function chunkIdFromKey(key: string, chunkSize: number): string {
  const [x, y, z] = parseCoordKeyInts(key);
  return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)},${Math.floor(z / chunkSize)}`;
}

function addKeyToChunk(key: string, chunkSize: number): void {
  const cid = chunkIdFromKey(key, chunkSize);
  let set = chunkIdToKeys.get(cid);
  if (!set) {
    set = new Set();
    chunkIdToKeys.set(cid, set);
  }
  set.add(key);
}

function removeKeyFromChunk(key: string, chunkSize: number): void {
  const cid = chunkIdFromKey(key, chunkSize);
  const set = chunkIdToKeys.get(cid);
  if (!set) return;
  set.delete(key);
  if (set.size === 0) chunkIdToKeys.delete(cid);
}

/**
 * Replace index from a full voxel map (after `voxels.set` or load).
 */
export function replaceVoxelChunkIndexFromMap(
  voxels: Map<string, Voxel>,
  chunkSize: number = VOXEL_MESH_CHUNK_SIZE
): void {
  chunkIdToKeys.clear();
  for (const key of voxels.keys()) {
    addKeyToChunk(key, chunkSize);
  }
}

/**
 * After mutating the voxel map at `key` from `before` to `after` (undefined = empty).
 * Same-key color/material-only updates are a no-op for chunk membership.
 */
export function applyVoxelChunkIndexAfterKeyChange(
  key: string,
  before: Voxel | undefined,
  after: Voxel | undefined,
  chunkSize: number = VOXEL_MESH_CHUNK_SIZE
): void {
  const had = before !== undefined;
  const has = after !== undefined;
  if (!had && has) {
    addKeyToChunk(key, chunkSize);
  } else if (had && !has) {
    removeKeyFromChunk(key, chunkSize);
  }
}

/** Keys in a chunk (possibly empty); used by mesh sparse pack. */
export function getVoxelKeysInChunkForMesh(chunkId: string): string[] {
  const set = chunkIdToKeys.get(chunkId);
  if (!set || set.size === 0) return [];
  return [...set];
}
