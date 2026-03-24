import { describe, it, expect } from 'vitest';
import { processVoxelleFileMessage } from './voxelleFileWorkerLogic';
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

describe('processVoxelleFileMessage', () => {
  describe('parse', () => {
    it('parses BSON bytes and returns parsed result', () => {
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
      expect(result.type).toBe('parsed');
      if (result.type !== 'parsed') {
        throw new Error('Expected parsed result');
      }
      expect(result.id).toBe(1);
      expect(result.data).not.toBeNull();
      expect(result.data!.version).toBe(sampleData.version);
      expect(result.data!.gridSize).toBe(sampleData.gridSize);
      expect(result.data!.voxels).toEqual(sampleData.voxels);
    });

    it('returns null data for invalid bytes', () => {
      const result = processVoxelleFileMessage({
        type: 'parse',
        id: 2,
        bytes: new Uint8Array([1, 2, 3, 4, 5]).buffer
      });
      expect(result.type).toBe('parsed');
      if (result.type !== 'parsed') {
        throw new Error('Expected parsed result');
      }
      expect(result.data).toBeNull();
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
      expect(parsed.type).toBe('parsed');
      if (parsed.type !== 'parsed') {
        throw new Error('Expected parsed result');
      }
      expect(parsed.data).toEqual(sampleData);
    });
  });
});
