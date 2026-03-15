import { processVoxelleFileMessage } from './voxelleFileWorkerLogic';
import type { VoxelleFileFormat } from './voxelleFormatCore';

export type { VoxelleFileFormat };

self.onmessage = (e: MessageEvent) => {
  const result = processVoxelleFileMessage(e.data);
  if (result.type === 'serialized') {
    self.postMessage(result, { transfer: [result.bytes] });
  } else {
    self.postMessage(result);
  }
};
