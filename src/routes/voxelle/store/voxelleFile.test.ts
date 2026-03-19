import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { voxels, gridSize, focalLength, orthographic, resetUndo } from './core';
import {
  serializeToVoxelleFormat,
  VOXELLE_FILE_VERSION,
  loadFromBytes,
  encodeForTransport,
  setWorkerImpls
} from './voxelleFile';
import {
  parseFormatPayload,
  serializeFormatToBson,
  type VoxelleFileFormat
} from './voxelleFormatCore';

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const slice = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([slice]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

describe('serializeToVoxelleFormat', () => {
  beforeEach(() => {
    voxels.set(new Map());
    gridSize.set(32);
    focalLength.set(29);
    orthographic.set(true);
  });

  it('returns format with version, gridSize, voxels, scene', () => {
    voxels.set(
      new Map([
        ['0,0,0', 0xff5733],
        ['1,1,1', 0x00ff00]
      ])
    );
    const data = serializeToVoxelleFormat();
    expect(data.version).toBe(VOXELLE_FILE_VERSION);
    expect(data.gridSize).toBe(32);
    expect(data.voxels).toHaveLength(2);
    expect(data.voxels).toContainEqual([0, 0, 0, 0xff5733]);
    expect(data.voxels).toContainEqual([1, 1, 1, 0x00ff00]);
    expect(data.scene?.focalLength).toBe(29);
    expect(data.scene?.orthographic).toBe(true);
  });

  it('returns empty voxels array when no voxels', () => {
    const data = serializeToVoxelleFormat();
    expect(data.voxels).toEqual([]);
  });
});

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

  it('round-trips large BSON file', async () => {
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

describe('loadFromBytes / encodeForTransport with injected impls', () => {
  beforeEach(() => {
    setWorkerImpls(
      async (bytes) => parseFormatPayload(bytes),
      async (data) => serializeFormatToBson(data)
    );
    voxels.set(new Map());
    gridSize.set(32);
    focalLength.set(29);
    orthographic.set(true);
    resetUndo();
  });

  afterEach(() => {
    setWorkerImpls();
  });

  it('loadFromBytes decodes raw (non-gzipped) BSON and applies to store', async () => {
    const data: VoxelleFileFormat = {
      version: 1,
      gridSize: 8,
      voxels: [[0, 0, 0, 0xff0000]],
      scene: { focalLength: 35, orthographic: true }
    };
    const rawBson = serializeFormatToBson(data);
    const result = await loadFromBytes(rawBson);
    expect(result).toBe(true);
    expect(get(gridSize)).toBe(8);
    expect(get(voxels).get('0,0,0')).toBe(0xff0000);
    expect(get(focalLength)).toBe(35);
    expect(get(orthographic)).toBe(true);
  });

  it('loadFromBytes decodes gzipped BSON and applies to store', async () => {
    const data: VoxelleFileFormat = {
      version: 1,
      gridSize: 16,
      voxels: [
        [0, 0, 0, 0xff5733],
        [1, 1, 1, 0x00ff00]
      ],
      scene: { focalLength: 50, orthographic: false }
    };
    const bsonBytes = serializeFormatToBson(data);
    const compressed = await gzipCompress(bsonBytes);
    const result = await loadFromBytes(compressed);
    expect(result).toBe(true);
    expect(get(gridSize)).toBe(16);
    expect(get(voxels).get('0,0,0')).toBe(0xff5733);
    expect(get(voxels).get('1,1,1')).toBe(0x00ff00);
    expect(get(focalLength)).toBe(50);
    expect(get(orthographic)).toBe(false);
  });

  it('encodeForTransport returns base64 string', async () => {
    voxels.set(
      new Map([
        ['0,0,0', 0xff0000],
        ['1,0,0', 0x00ff00]
      ])
    );
    const encoded = await encodeForTransport();
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(() => atob(encoded)).not.toThrow();
  });
});
