/**
 * Web Worker for greedy mesh computation.
 * Receives voxel data, runs processGreedyMeshMessage, returns raw typed arrays via Transferable.
 */
import { processGreedyMeshMessage } from './greedyMeshWorkerLogic';
import type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput } from './greedyMeshWorkerLogic';

export type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput };

self.onmessage = (e: MessageEvent<GreedyMeshWorkerInput>) => {
  const output = processGreedyMeshMessage(e.data);
  const transferables: Transferable[] = [];
  for (const r of output.results) {
    transferables.push(
      r.positions.buffer as Transferable,
      r.normals.buffer as Transferable,
      r.colors.buffer as Transferable,
      r.indices.buffer as Transferable
    );
  }
  self.postMessage(output satisfies GreedyMeshWorkerOutput, { transfer: transferables });
};
