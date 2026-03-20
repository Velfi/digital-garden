/** Subset of `DedicatedWorkerGlobalScope` used to bind worker entry files in tests. */
export type WorkerMessagePort = {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: StructuredSerializeOptions): void;
};
