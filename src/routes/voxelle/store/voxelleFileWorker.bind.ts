import { processVoxelleFileMessage } from './voxelleFileWorkerLogic';
import type { ParseMessage, SerializeMessage } from './voxelleFileWorkerLogic';
import type { WorkerMessagePort } from '../workerMessagePort';

export function attachVoxelleFileWorker(self: WorkerMessagePort): void {
  self.onmessage = (e: MessageEvent<ParseMessage | SerializeMessage>) => {
    const result = processVoxelleFileMessage(e.data);
    if (result.type === 'serialized') {
      self.postMessage(result, { transfer: [result.bytes] });
    } else {
      self.postMessage(result);
    }
  };
}
