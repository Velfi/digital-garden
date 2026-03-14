/**
 * Web Worker for greedy mesh computation.
 * Receives voxel data, runs computeGreedyMesh, returns raw typed arrays via Transferable.
 */
import { computeGreedyMesh } from './greedyMeshCore';
import { coordKey } from './coordUtils';

export interface GreedyMeshWorkerInput {
  /** Serialized voxels: [key, color] pairs for structured clone, or flat arrays for transfer. */
  voxels: [string, number][] | { coords: Int32Array; colors: Uint32Array };
  options?: { aoEnabled?: boolean };
  /** Echoed back so main thread can discard stale results. */
  gen?: number;
}

export interface GreedyMeshWorkerOutput {
  gen?: number;
  results: Array<{
    color: number;
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
  }>;
}

function voxelsFromInput(input: GreedyMeshWorkerInput['voxels']): Map<string, number> {
  if (Array.isArray(input)) {
    return new Map(input as [string, number][]);
  }
  const { coords, colors } = input;
  const voxels = new Map<string, number>();
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const x = coords[i * 3];
    const y = coords[i * 3 + 1];
    const z = coords[i * 3 + 2];
    voxels.set(coordKey(x, y, z), colors[i]);
  }
  return voxels;
}

self.onmessage = (e: MessageEvent<GreedyMeshWorkerInput>) => {
  const { voxels: voxelInput, options = {}, gen } = e.data;
  const voxels = voxelsFromInput(voxelInput);
  const coreResults = computeGreedyMesh(voxels, options);

  const results: GreedyMeshWorkerOutput['results'] = [];
  const transferables: ArrayBuffer[] = [];

  for (const [color, data] of coreResults) {
    results.push({
      color,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      indices: data.indices
    });
    transferables.push(
      data.positions.buffer,
      data.normals.buffer,
      data.colors.buffer,
      data.indices.buffer
    );
  }

  self.postMessage({ results, gen } satisfies GreedyMeshWorkerOutput, transferables);
};
