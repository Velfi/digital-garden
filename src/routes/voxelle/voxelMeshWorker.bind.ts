import { processVoxelMeshMessage, type VoxelMeshWorkerInput } from './voxelMeshWorkerLogic';
import { transferablesFromMeshResults } from './meshWorkerTransfer';
import type { WorkerMessagePort } from './workerMessagePort';

export function attachVoxelMeshWorker(self: WorkerMessagePort): void {
  self.onmessage = (e: MessageEvent<VoxelMeshWorkerInput>) => {
    const output = processVoxelMeshMessage(e.data);
    self.postMessage(output, { transfer: transferablesFromMeshResults(output.results) });
  };
}
