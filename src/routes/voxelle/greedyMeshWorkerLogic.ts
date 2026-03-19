import { computeGreedyMesh } from './greedyMeshCore';
import { coordKey } from './coordUtils';

export interface GreedyMeshWorkerInput {
  voxels: [string, number][] | { coords: Int32Array; colors: Uint32Array };
  options?: { aoEnabled?: boolean };
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

/** Parse worker input to voxel map. Testable without Worker APIs. */
export function voxelsFromInput(input: GreedyMeshWorkerInput['voxels']): Map<string, number> {
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

/** Pure logic for greedy mesh worker. Returns output without transfer. Testable without Worker APIs. */
export function processGreedyMeshMessage(input: GreedyMeshWorkerInput): GreedyMeshWorkerOutput {
  const { voxels: voxelInput, options = {}, gen } = input;
  const voxels = voxelsFromInput(voxelInput);
  const coreResults = computeGreedyMesh(voxels, options);

  const results: GreedyMeshWorkerOutput['results'] = [];
  for (const [color, data] of coreResults) {
    results.push({
      color,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      indices: data.indices
    });
  }
  return { results, gen };
}
