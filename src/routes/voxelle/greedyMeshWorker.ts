/**
 * Web Worker for greedy mesh computation.
 * Receives voxel data, runs processGreedyMeshMessage, returns raw typed arrays via Transferable.
 */
import { processGreedyMeshMessage } from './greedyMeshWorkerLogic';
import type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput } from './greedyMeshWorkerLogic';

export type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput };

self.onmessage = (e: MessageEvent<GreedyMeshWorkerInput>) => {
  const output = processGreedyMeshMessage(e.data);
  const transferables: ArrayBuffer[] = [];
  for (const r of output.results) {
    transferables.push(
      r.positions.buffer,
      r.normals.buffer,
      r.colors.buffer,
      r.indices.buffer
    );
  }
  self.postMessage(output satisfies GreedyMeshWorkerOutput, transferables);
};
