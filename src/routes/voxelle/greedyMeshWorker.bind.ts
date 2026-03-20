import { processGreedyMeshMessage, type GreedyMeshWorkerInput } from './greedyMeshWorkerLogic';
import { transferablesFromMeshResults } from './meshWorkerTransfer';
import type { WorkerMessagePort } from './workerMessagePort';

export function attachGreedyMeshWorker(self: WorkerMessagePort): void {
  self.onmessage = (e: MessageEvent<GreedyMeshWorkerInput>) => {
    const output = processGreedyMeshMessage(e.data);
    self.postMessage(output, { transfer: transferablesFromMeshResults(output.results) });
  };
}
