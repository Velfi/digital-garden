// Web Worker entry for badge mesh building. Receives doc+cells, runs the
// full geometry pipeline, and returns typed-array geometry data via
// Transferable.
import { attachBadgeMeshWorker } from './badgeMeshWorker.bind';

attachBadgeMeshWorker(self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
});
