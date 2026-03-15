import { describe, it, expect } from 'vitest';
import {
  parseFormatPayload,
  serializeFormatToBson,
  type VoxelleFileFormat
} from './voxelleFormatCore';

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = new Blob([slice]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

describe('voxelle file format round-trip', () => {
  it('round-trips BSON serialization and gzip compression', async () => {
    const data: VoxelleFileFormat = {
      version: 1,
      gridSize: 16,
      voxels: [
        [0, 0, 0, 0xff5733],
        [1, 0, 0, 0x00ff00],
        [-5, 3, 2, 0x0000ff]
      ],
      scene: { focalLength: 29, orthographic: true }
    };

    const bsonBytes = serializeFormatToBson(data);
    const compressed = await gzipCompress(bsonBytes);
    const decompressed = await gzipDecompress(compressed);
    const parsed = parseFormatPayload(decompressed);

    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(data.version);
    expect(parsed!.gridSize).toBe(data.gridSize);
    expect(parsed!.voxels).toEqual(data.voxels);
    expect(parsed!.scene?.focalLength).toBe(data.scene?.focalLength);
    expect(parsed!.scene?.orthographic).toBe(data.scene?.orthographic);
  });

  it('parses large BSON file (avoids 0x7b JSON/BSON first-byte collision)', async () => {
    const data: VoxelleFileFormat = {
      version: 1,
      gridSize: 32,
      voxels: Array.from({ length: 12000 }, (_, i) => [
        (i % 32) - 16,
        Math.floor(i / 1024) - 6,
        Math.floor((i % 1024) / 32) - 16,
        0x888888
      ]) as [number, number, number, number][]
    };
    const bsonBytes = serializeFormatToBson(data);
    const compressed = await gzipCompress(bsonBytes);
    const decompressed = await gzipDecompress(compressed);
    const parsed = parseFormatPayload(decompressed);
    expect(parsed).not.toBeNull();
    expect(parsed!.voxels.length).toBe(12000);
  });
});
