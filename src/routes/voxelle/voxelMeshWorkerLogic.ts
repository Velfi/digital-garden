import { computeGreedyMesh } from './greedyMeshCore';
import { computeMarchingCubes } from './marchingCubesCore';
import { voxelsFromInput } from './greedyMeshWorkerLogic';

export type RenderingMode = 'greedy' | 'marchingCubes';

export interface VoxelMeshWorkerInput {
  voxels: [string, number][] | { coords: Int32Array; colors: Uint32Array };
  mode?: RenderingMode;
  options?: { aoEnabled?: boolean };
  gen?: number;
}

export interface VoxelMeshWorkerOutput {
  gen?: number;
  results: Array<{
    color: number;
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
  }>;
}

export function processVoxelMeshMessage(input: VoxelMeshWorkerInput): VoxelMeshWorkerOutput {
  const { voxels: voxelInput, mode = 'greedy', options = {}, gen } = input;
  const voxels = voxelsFromInput(voxelInput);

  const coreResults =
    mode === 'marchingCubes'
      ? computeMarchingCubes(voxels)
      : computeGreedyMesh(voxels, options);

  const results: VoxelMeshWorkerOutput['results'] = [];
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
