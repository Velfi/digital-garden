import type { BadgeDocument, Cell, MetalSurface } from '../store/types';
import { effectiveMetalPaths } from '../store/effectivePaths';
import type { BadgeMeshData } from './buildBadgeMeshData';
import type {
  BadgeMeshWorkerInput,
  BadgeMeshWorkerOutput
} from './badgeMeshWorker.bind';

// Main-thread client for the badge mesh worker. Manages a single long-lived
// Worker, dispatches jobs with monotonically-increasing IDs, and ignores
// responses that have been superseded by a newer request — i.e. the caller
// only ever sees the result for the most recent `build(...)` call.
export class BadgeMeshClient {
  private worker: Worker | null = null;
  private nextJobId = 1;
  private latestJobId = 0;
  private pending = new Map<number, (data: BadgeMeshData) => void>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./badgeMeshWorker.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (e: MessageEvent<BadgeMeshWorkerOutput>) => {
      const { jobId, data } = e.data;
      const resolve = this.pending.get(jobId);
      if (!resolve) return;
      this.pending.delete(jobId);
      // Only the latest job's result is delivered. Older results are dropped
      // silently so the caller doesn't briefly swap in stale geometry
      // between a newer request and its response.
      if (jobId !== this.latestJobId) return;
      resolve(data);
    };
    this.worker = worker;
    return worker;
  }

  // Request a mesh build. Resolves when this exact call is the most recent
  // one at the time the worker replies. Supersession is silent — the
  // returned promise never rejects for that reason, it simply never settles.
  build(
    doc: BadgeDocument,
    cells: Cell[],
    finishColor: number,
    metalSurface: MetalSurface,
    enamelFinish: 'soft' | 'hard'
  ): Promise<BadgeMeshData> {
    const worker = this.ensureWorker();
    const jobId = this.nextJobId++;
    this.latestJobId = jobId;
    // Bake text elements into concrete paths on the main thread before
    // shipping to the worker. Text expansion depends on the font cache,
    // which lives in an app-level module (IndexedDB/Local Font Access), and
    // pulling that in through the worker's import graph would drag
    // $app/environment into the worker bundle.
    const bakedDoc: BadgeDocument = {
      ...doc,
      metal: {
        ...doc.metal,
        paths: effectiveMetalPaths(doc),
        texts: []
      }
    };
    const msg: BadgeMeshWorkerInput = {
      jobId,
      doc: bakedDoc,
      cells,
      finishColor,
      metalSurface,
      enamelFinish
    };
    return new Promise<BadgeMeshData>((resolve) => {
      this.pending.set(jobId, resolve);
      worker.postMessage(msg);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    this.latestJobId = 0;
  }
}
