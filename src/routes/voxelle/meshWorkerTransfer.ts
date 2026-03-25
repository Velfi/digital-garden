import { parseCoordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { VOXEL_MATERIAL_IDS } from './voxelMaterial';

export type PackedVoxelInput = {
  coords: Int32Array;
  colors: Uint32Array;
  materials: Uint8Array;
};

export type PackedChunkVoxelInput = {
  chunkId: string;
  voxels: PackedVoxelInput;
};

export type PackedSparseChunkInput = {
  chunkSize: number;
  totalTransmissiveCount: number;
  dirtyChunks: PackedChunkVoxelInput[];
  haloChunks: PackedChunkVoxelInput[];
};

/** Encode voxel map into typed arrays for worker postMessage transfer. */
export function packVoxelsForWorker(voxels: Map<string, Voxel>): PackedVoxelInput {
  const count = voxels.size;
  const coords = new Int32Array(count * 3);
  const colors = new Uint32Array(count);
  const materials = new Uint8Array(count);
  let i = 0;
  for (const [key, voxel] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const o = i * 3;
    coords[o] = x;
    coords[o + 1] = y;
    coords[o + 2] = z;
    colors[i] = voxel.color & 0xffffff;
    const mi = VOXEL_MATERIAL_IDS.indexOf(voxel.material);
    materials[i] = mi >= 0 ? mi : 0;
    i++;
  }
  return { coords, colors, materials };
}

export function transferablesFromPackedVoxelInput(input: PackedVoxelInput): Transferable[] {
  return [input.coords.buffer, input.colors.buffer, input.materials.buffer];
}

function chunkIdForCoord(x: number, y: number, z: number, chunkSize: number): string {
  return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)},${Math.floor(z / chunkSize)}`;
}

function packVoxelEntries(entries: Array<[string, Voxel]>): PackedVoxelInput {
  const count = entries.length;
  const coords = new Int32Array(count * 3);
  const colors = new Uint32Array(count);
  const materials = new Uint8Array(count);
  let i = 0;
  for (const [key, voxel] of entries) {
    const [x, y, z] = parseCoordKey(key);
    const o = i * 3;
    coords[o] = x;
    coords[o + 1] = y;
    coords[o + 2] = z;
    colors[i] = voxel.color & 0xffffff;
    const mi = VOXEL_MATERIAL_IDS.indexOf(voxel.material);
    materials[i] = mi >= 0 ? mi : 0;
    i++;
  }
  return { coords, colors, materials };
}

/** Pack only requested dirty/halo chunks for incremental worker updates. */
export function packSparseChunksForWorker(
  voxels: Map<string, Voxel>,
  dirtyChunkIds: readonly string[],
  haloChunkIds: readonly string[],
  chunkSize: number
): PackedSparseChunkInput {
  const dirtySet = new Set(dirtyChunkIds);
  const haloSet = new Set(haloChunkIds);
  const dirtyByChunk = new Map<string, Array<[string, Voxel]>>();
  const haloByChunk = new Map<string, Array<[string, Voxel]>>();
  let totalTransmissiveCount = 0;
  for (const [key, voxel] of voxels) {
    if (voxel.material === 'glass' || voxel.material === 'water') totalTransmissiveCount++;
    const [x, y, z] = parseCoordKey(key);
    const chunkId = chunkIdForCoord(x, y, z, chunkSize);
    if (dirtySet.has(chunkId)) {
      const arr = dirtyByChunk.get(chunkId) ?? [];
      arr.push([key, voxel]);
      dirtyByChunk.set(chunkId, arr);
      continue;
    }
    if (haloSet.has(chunkId)) {
      const arr = haloByChunk.get(chunkId) ?? [];
      arr.push([key, voxel]);
      haloByChunk.set(chunkId, arr);
    }
  }
  const dirtyChunks: PackedChunkVoxelInput[] = [];
  for (const chunkId of dirtyChunkIds) {
    dirtyChunks.push({ chunkId, voxels: packVoxelEntries(dirtyByChunk.get(chunkId) ?? []) });
  }
  const haloChunks: PackedChunkVoxelInput[] = [];
  for (const chunkId of haloChunkIds) {
    haloChunks.push({ chunkId, voxels: packVoxelEntries(haloByChunk.get(chunkId) ?? []) });
  }
  return { chunkSize, totalTransmissiveCount, dirtyChunks, haloChunks };
}

export function transferablesFromPackedSparseChunks(input: PackedSparseChunkInput): Transferable[] {
  const transferables: Transferable[] = [];
  for (const chunk of [...input.dirtyChunks, ...input.haloChunks]) {
    transferables.push(
      chunk.voxels.coords.buffer,
      chunk.voxels.colors.buffer,
      chunk.voxels.materials.buffer
    );
  }
  return transferables;
}

/** Typed-array buffers to transfer alongside greedy/voxel mesh worker results. */
export function transferablesFromMeshResults(
  results: ReadonlyArray<{
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    slabThickness: Float32Array;
    indices: Uint32Array;
  }>
): Transferable[] {
  const transferables: Transferable[] = [];
  for (const r of results) {
    transferables.push(
      r.positions.buffer,
      r.normals.buffer,
      r.colors.buffer,
      r.slabThickness.buffer,
      r.indices.buffer
    );
  }
  return transferables;
}
