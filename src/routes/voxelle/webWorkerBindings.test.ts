import { describe, it, expect } from 'vitest';
import { attachGreedyMeshWorker } from './greedyMeshWorker.bind';
import { attachVoxelMeshWorker } from './voxelMeshWorker.bind';
import { attachVoxelleFileWorker } from './store/voxelleFileWorker.bind';
import { processGreedyMeshMessage, type GreedyMeshWorkerInput } from './greedyMeshWorkerLogic';
import { processVoxelMeshMessage, type VoxelMeshWorkerInput } from './voxelMeshWorkerLogic';
import { processVoxelleFileMessage } from './store/voxelleFileWorkerLogic';
import { serializeFormatToBson } from './store/voxelleFormatCore';
import type { VoxelleFileFormat } from './store/voxelleFormatCore';
import { transferablesFromMeshResults } from './meshWorkerTransfer';
import type { WorkerMessagePort } from './workerMessagePort';
import { plasticVoxel } from './voxelMaterial';

/**
 * Exercise the same `onmessage` / `postMessage` wiring the browser worker entry files install.
 * Node/Vitest has no `Worker`, so we mock a minimal global scope.
 */
function createMockWorkerPort(): WorkerMessagePort & {
  dispatchMessage(data: unknown): void;
  getPosted(): Array<{ data: unknown; options?: StructuredSerializeOptions }>;
} {
  let handler: ((e: MessageEvent) => void) | null = null;
  const posted: Array<{ data: unknown; options?: StructuredSerializeOptions }> = [];
  return {
    get onmessage() {
      return handler;
    },
    set onmessage(h) {
      handler = h;
    },
    postMessage(data: unknown, options?: StructuredSerializeOptions) {
      posted.push({ data, options });
    },
    dispatchMessage(data: unknown) {
      if (!handler) throw new Error('onmessage not bound');
      handler({ data } as MessageEvent);
    },
    getPosted: () => posted
  };
}

const sampleFile: VoxelleFileFormat = {
  version: 1,
  gridSize: 8,
  voxels: [[0, 0, 0, 0xff5733]],
  scene: { focalLength: 29, orthographic: false }
};

describe('web worker bindings (mock global scope)', () => {
  describe('greedy mesh worker', () => {
    it('posts same payload as processGreedyMeshMessage and transfers mesh buffers', () => {
      const scope = createMockWorkerPort();
      attachGreedyMeshWorker(scope);
      const input: GreedyMeshWorkerInput = {
        voxels: [['0,0,0', plasticVoxel(0x888888)]],
        gen: 3
      };
      scope.dispatchMessage(input);
      const expected = processGreedyMeshMessage(input);
      const [post] = scope.getPosted();
      expect(post.data).toEqual(expected);
      expect(post.options?.transfer).toEqual(transferablesFromMeshResults(expected.results));
    });
  });

  describe('voxel mesh worker', () => {
    it('posts voxel mesh output with matching transferables', () => {
      const scope = createMockWorkerPort();
      attachVoxelMeshWorker(scope);
      const input: VoxelMeshWorkerInput = {
        mode: 'greedy',
        voxels: [['0,0,0', plasticVoxel(0xff5733)]],
        gen: 9
      };
      scope.dispatchMessage(input);
      const expected = processVoxelMeshMessage(input);
      const [post] = scope.getPosted();
      expect(post.data).toEqual(expected);
      expect(post.options?.transfer).toEqual(transferablesFromMeshResults(expected.results));
    });
  });

  describe('voxelle file worker', () => {
    it('parse: posts without transfer list', () => {
      const scope = createMockWorkerPort();
      attachVoxelleFileWorker(scope);
      const bson = serializeFormatToBson(sampleFile);
      const bytes = bson.buffer.slice(
        bson.byteOffset,
        bson.byteOffset + bson.byteLength
      ) as ArrayBuffer;
      const msg = { type: 'parse' as const, id: 11, bytes };
      scope.dispatchMessage(msg);
      const expected = processVoxelleFileMessage(msg);
      const [post] = scope.getPosted();
      expect(post.data).toEqual(expected);
      expect(post.options?.transfer).toBeUndefined();
    });

    it('serialize: posts bytes as transferable', () => {
      const scope = createMockWorkerPort();
      attachVoxelleFileWorker(scope);
      const msg = { type: 'serialize' as const, id: 12, data: sampleFile };
      scope.dispatchMessage(msg);
      const expected = processVoxelleFileMessage(msg);
      const [post] = scope.getPosted();
      expect(post.data).toEqual(expected);
      expect(post.options?.transfer).toEqual(
        expected.type === 'serialized' ? [expected.bytes] : []
      );
    });
  });
});
