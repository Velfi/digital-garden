import type { BadgeDocument, Cell, MetalSurface } from '../store/types';
import {
  buildBadgeMeshData,
  transferablesFromBadgeMeshData,
  type BadgeMeshData
} from './buildBadgeMeshData';

export type BadgeMeshWorkerInput = {
  jobId: number;
  doc: BadgeDocument;
  cells: Cell[];
  finishColor: number;
  metalSurface: MetalSurface;
  enamelFinish: 'soft' | 'hard';
};

export type BadgeMeshWorkerOutput = {
  jobId: number;
  data: BadgeMeshData;
};

// Subset of DedicatedWorkerGlobalScope so tests can pass a stub.
export type WorkerMessagePort = {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

export function attachBadgeMeshWorker(self: WorkerMessagePort): void {
  self.onmessage = (e: MessageEvent<BadgeMeshWorkerInput>) => {
    const { jobId, doc, cells, finishColor, metalSurface, enamelFinish } = e.data;
    const data = buildBadgeMeshData(doc, cells, finishColor, metalSurface, enamelFinish);
    const output: BadgeMeshWorkerOutput = { jobId, data };
    self.postMessage(output, transferablesFromBadgeMeshData(data));
  };
}
