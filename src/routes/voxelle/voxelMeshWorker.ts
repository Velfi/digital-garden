/**
 * Web Worker for voxel mesh computation.
 * Supports greedy mesh and marching cubes output.
 */
import { processVoxelMeshMessage } from './voxelMeshWorkerLogic';
import type { VoxelMeshWorkerInput, VoxelMeshWorkerOutput } from './voxelMeshWorkerLogic';

export type { VoxelMeshWorkerInput, VoxelMeshWorkerOutput };

self.onmessage = (e: MessageEvent<VoxelMeshWorkerInput>) => {
  const output = processVoxelMeshMessage(e.data);
  const transferables: Transferable[] = [];
  for (const r of output.results) {
    transferables.push(
      r.positions.buffer as Transferable,
      r.normals.buffer as Transferable,
      r.colors.buffer as Transferable,
      r.indices.buffer as Transferable
    );
  }
  self.postMessage(output satisfies VoxelMeshWorkerOutput, { transfer: transferables });
};
