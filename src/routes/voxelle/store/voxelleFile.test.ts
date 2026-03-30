import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { voxels, hiddenVoxels, gridSize, focalLength, orthographic, resetUndo } from './core';
import {
  serializeToVoxelleFormat,
  VOXELLE_FORMAT_VERSION,
  loadFromBytes,
  encodeForTransport,
  encodeForTransportBytes,
  setWorkerImpls
} from './voxelleFile';
import { plasticVoxel } from '../voxelMaterial';
import {
  isV3WirePayload,
  parseFormatPayload,
  serializeFormatToBson,
  serializeFormatToWireBytes,
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
    hiddenVoxels.set(new Map());
    gridSize.set(32);
    focalLength.set(29);
    orthographic.set(true);
  });

  it('returns format with version, gridSize, voxels, scene', () => {
    voxels.set(
      new Map([
        ['0,0,0', plasticVoxel(0xff5733)],
        ['1,1,1', plasticVoxel(0x00ff00)]
      ])
    );
    const data = serializeToVoxelleFormat();
    expect(data.version).toBe(VOXELLE_FORMAT_VERSION);
    expect(data.gridSize).toBe(32);
    expect(data.voxels).toHaveLength(2);
    expect(data.voxels).toContainEqual([0, 0, 0, 0xff5733, 'plastic']);
    expect(data.voxels).toContainEqual([1, 1, 1, 0x00ff00, 'plastic']);
    expect(data.scene?.focalLength).toBe(29);
    expect(data.scene?.orthographic).toBe(true);
  });

  it('returns empty voxels array when no voxels', () => {
    const data = serializeToVoxelleFormat();
    expect(data.voxels).toEqual([]);
    expect(data.hiddenVoxels).toEqual([]);
  });

  it('serializes hidden voxels separately', () => {
    voxels.set(new Map([['0,0,0', plasticVoxel(0xff5733)]]));
    hiddenVoxels.set(new Map([['1,0,0', plasticVoxel(0x00ff00)]]));
    const data = serializeToVoxelleFormat();
    expect(data.voxels).toContainEqual([0, 0, 0, 0xff5733, 'plastic']);
    expect(data.hiddenVoxels).toContainEqual([1, 0, 0, 0x00ff00, 'plastic']);
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
    expect(parsed!.voxels).toEqual([
      [0, 0, 0, 0xff5733, 'plastic'],
      [1, 0, 0, 0x00ff00, 'plastic'],
      [-5, 3, 2, 0x0000ff, 'plastic']
    ]);
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
    expect(parsed!.voxels[0]).toEqual([-16, -6, -16, 0x888888, 'plastic']);
  });
});

describe('loadFromBytes / encodeForTransport with injected impls', () => {
  beforeEach(() => {
    setWorkerImpls(
      async (bytes) => parseFormatPayload(bytes),
      async (data) => serializeFormatToBson(data)
    );
    voxels.set(new Map());
    hiddenVoxels.set(new Map());
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
    expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff0000));
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
    expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff5733));
    expect(get(voxels).get('1,1,1')).toEqual(plasticVoxel(0x00ff00));
    expect(get(focalLength)).toBe(50);
    expect(get(orthographic)).toBe(false);
  });

  it('loadFromBytes restores hidden voxels when present', async () => {
    const data: VoxelleFileFormat = {
      version: 1,
      gridSize: 16,
      voxels: [[0, 0, 0, 0xff5733]],
      hiddenVoxels: [[1, 0, 0, 0x00ff00]]
    };
    const bsonBytes = serializeFormatToBson(data);
    const result = await loadFromBytes(bsonBytes);
    expect(result).toBe(true);
    expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff5733));
    expect(get(hiddenVoxels).get('1,0,0')).toEqual(plasticVoxel(0x00ff00));
  });

  it('encodeForTransport returns base64 string', async () => {
    voxels.set(
      new Map([
        ['0,0,0', plasticVoxel(0xff0000)],
        ['1,0,0', plasticVoxel(0x00ff00)]
      ])
    );
    const encoded = await encodeForTransport();
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(() => atob(encoded)).not.toThrow();
  });

  it('encodeForTransportBytes matches base64 decode of encodeForTransport', async () => {
    voxels.set(new Map([['0,0,0', plasticVoxel(0xff0000)]]));
    const [asBytes, asB64] = await Promise.all([encodeForTransportBytes(), encodeForTransport()]);
    const fromB64 = Uint8Array.from(atob(asB64), (c) => c.charCodeAt(0));
    expect(asBytes).toEqual(fromB64);
  });
});

describe('v3 wire format', () => {
  it('serializeFormatToWireBytes uses v3 for large voxel counts and round-trips', () => {
    const rows = Array.from({ length: 50001 }, (_, i) => [
      (i % 8) - 4,
      0,
      0,
      0x888888,
      'plastic'
    ]) as VoxelleFileFormat['voxels'];
    const data: VoxelleFileFormat = {
      version: 2,
      gridSize: 32,
      voxels: rows,
      hiddenVoxels: [[1, 2, 3, 0xff0000, 'metal']],
      scene: { focalLength: 40, orthographic: false }
    };
    const wire = serializeFormatToWireBytes(data);
    expect(isV3WirePayload(wire)).toBe(true);
    const parsed = parseFormatPayload(wire);
    expect(parsed).not.toBeNull();
    expect(parsed!.voxels.length).toBe(50001);
    expect(parsed!.hiddenVoxels?.length).toBe(1);
    expect(parsed!.gridSize).toBe(32);
    expect(parsed!.scene?.focalLength).toBe(40);
  });

  it('parseFormatPayload reads v3 correctly when Uint8Array has non-zero byteOffset', () => {
    const rows = Array.from({ length: 50001 }, (_, i) => [
      (i % 8) - 4,
      0,
      0,
      0x888888,
      'plastic'
    ]) as VoxelleFileFormat['voxels'];
    const data: VoxelleFileFormat = {
      version: 2,
      gridSize: 32,
      voxels: rows,
      hiddenVoxels: [[1, 2, 3, 0xff0000, 'metal']],
      scene: { focalLength: 40, orthographic: false }
    };
    const wire = serializeFormatToWireBytes(data);
    const padding = 64;
    const buf = new ArrayBuffer(padding + wire.byteLength);
    new Uint8Array(buf).set(wire, padding);
    const sliced = new Uint8Array(buf, padding, wire.byteLength);
    expect(sliced.byteOffset).toBe(padding);
    const direct = parseFormatPayload(wire);
    const offsetView = parseFormatPayload(sliced);
    expect(direct).not.toBeNull();
    expect(offsetView).not.toBeNull();
    expect(offsetView!.voxels.length).toBe(direct!.voxels.length);
    expect(offsetView!.voxels[0]).toEqual(direct!.voxels[0]);
    expect(offsetView!.voxels[50000]).toEqual(direct!.voxels[50000]);
    expect(offsetView!.hiddenVoxels).toEqual(direct!.hiddenVoxels);
    expect(offsetView!.gridSize).toBe(direct!.gridSize);
  });
});
