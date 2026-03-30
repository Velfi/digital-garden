import { describe, it, expect } from 'vitest';
import {
  buildParsePostedMessages,
  processVoxelleFileMessage
} from './voxelleFileWorkerLogic';
import { serializeFormatToBson, VOXELLE_FORMAT_VERSION } from './voxelleFormatCore';
import type { VoxelleFileFormat } from './voxelleFormatCore';

/** Normalized on parse: legacy 4-tuples become 5-tuples with material. */
const sampleData: VoxelleFileFormat = {
  version: VOXELLE_FORMAT_VERSION,
  gridSize: 16,
  voxels: [
    [0, 0, 0, 0xff5733, 'plastic'],
    [1, 0, 0, 0x00ff00, 'plastic']
  ],
  hiddenVoxels: [],
  scene: { focalLength: 29, orthographic: true }
};

describe('buildParsePostedMessages', () => {
  it('splits into multiple batches when row count exceeds threshold', () => {
    const rows = Array.from({ length: 50001 }, () => [0, 0, 0, 0x888888, 'plastic'] as const);
    const data: VoxelleFileFormat = {
      version: VOXELLE_FORMAT_VERSION,
      gridSize: 32,
      voxels: rows as unknown as VoxelleFileFormat['voxels'],
      hiddenVoxels: []
    };
    const msgs = buildParsePostedMessages(7, data);
    expect(msgs[0]?.type).toBe('parsedBatchedStart');
    expect(msgs[msgs.length - 1]?.type).toBe('parsedBatchedDone');
    const voxelBatches = msgs.filter((m) => m.type === 'parsedVoxelBatch');
    expect(voxelBatches.length).toBe(2);
    expect(
      voxelBatches.reduce((s, m) => s + (m.type === 'parsedVoxelBatch' ? m.rows.length : 0), 0)
    ).toBe(50001);
  });
});

describe('processVoxelleFileMessage', () => {
  describe('parse', () => {
    it('parses BSON bytes and returns parseMulti with a single parsed message', () => {
      const bsonBytes = serializeFormatToBson(sampleData);
      const bytes = bsonBytes.buffer.slice(
        bsonBytes.byteOffset,
        bsonBytes.byteOffset + bsonBytes.byteLength
      ) as ArrayBuffer;
      const result = processVoxelleFileMessage({
        type: 'parse',
        id: 1,
        bytes
      });
      expect(result.type).toBe('parseMulti');
      if (result.type !== 'parseMulti') {
        throw new Error('Expected parseMulti result');
      }
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({ type: 'parsed', id: 1, data: sampleData });
    });

    it('returns null data for invalid bytes', () => {
      const result = processVoxelleFileMessage({
        type: 'parse',
        id: 2,
        bytes: new Uint8Array([1, 2, 3, 4, 5]).buffer
      });
      expect(result.type).toBe('parseMulti');
      if (result.type !== 'parseMulti') {
        throw new Error('Expected parseMulti result');
      }
      expect(result.messages).toEqual([{ type: 'parsed', id: 2, data: null }]);
    });
  });

  describe('serialize', () => {
    it('serializes data and returns serialized result', () => {
      const result = processVoxelleFileMessage({
        type: 'serialize',
        id: 3,
        data: sampleData
      });
      expect(result.type).toBe('serialized');
      if (result.type !== 'serialized') {
        throw new Error('Expected serialized result');
      }
      expect(result.id).toBe(3);
      expect(result.bytes).toBeInstanceOf(ArrayBuffer);
      expect(result.bytes.byteLength).toBeGreaterThan(0);
    });

    it('round-trips with parse', () => {
      const serialized = processVoxelleFileMessage({
        type: 'serialize',
        id: 4,
        data: sampleData
      });
      expect(serialized.type).toBe('serialized');
      if (serialized.type !== 'serialized') {
        throw new Error('Expected serialized result');
      }
      const parsed = processVoxelleFileMessage({
        type: 'parse',
        id: 5,
        bytes: serialized.bytes
      });
      expect(parsed.type).toBe('parseMulti');
      if (parsed.type !== 'parseMulti') {
        throw new Error('Expected parseMulti result');
      }
      expect(parsed.messages[0]).toEqual({ type: 'parsed', id: 5, data: sampleData });
    });
  });
});
