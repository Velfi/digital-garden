import { serialize as bsonSerialize, deserialize as bsonDeserialize } from 'bson';
import { get } from 'svelte/store';
import { coordKey, parseCoordKey } from '../coordUtils';
import {
  voxels,
  gridSize,
  focalLength,
  orthographic,
  resetUndo
} from './core';
import type { GridSize } from './core';

export const VOXELLE_FILE_VERSION = 1;

export type VoxelleFileFormat = {
  version: number;
  gridSize: number;
  voxels: [number, number, number, number][];
  scene?: {
    focalLength?: number;
    orthographic?: boolean;
  };
};

function parseFullFormat(raw: unknown): VoxelleFileFormat | null {
  const data = raw as VoxelleFileFormat;
  if (!data || typeof data.version !== 'number' || typeof data.gridSize !== 'number') return null;
  const sz = data.gridSize;
  if (sz < 1 || !Number.isInteger(sz)) return null;
  if (!Array.isArray(data.voxels)) return null;
  const voxelsArr: [number, number, number, number][] = [];
  for (const e of data.voxels) {
    if (!Array.isArray(e) || e.length !== 4) continue;
    const [x, y, z, col] = e;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number' ||
      typeof col !== 'number'
    )
      continue;
    voxelsArr.push([Math.floor(x), Math.floor(y), Math.floor(z), col >>> 0]);
  }
  return { version: data.version, gridSize: sz, voxels: voxelsArr, scene: data.scene };
}

export function serializeToVoxelleFormat(): VoxelleFileFormat {
  const v = get(voxels);
  const sz = get(gridSize);
  return {
    version: VOXELLE_FILE_VERSION,
    gridSize: sz,
    voxels: [...v.entries()].map(([key, c]) => {
      const [x, y, z] = parseCoordKey(key);
      return [x, y, z, c];
    }),
    scene: {
      focalLength: get(focalLength),
      orthographic: get(orthographic)
    }
  };
}

function parsePayload(bytes: Uint8Array): VoxelleFileFormat | null {
  const isJson = bytes[0] === 0x7b; // '{'
  try {
    if (isJson) {
      return parseFullFormat(JSON.parse(new TextDecoder().decode(bytes)));
    }
    return parseFullFormat(bsonDeserialize(bytes));
  } catch {
    return null;
  }
}

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([data]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function saveToFile(filename = 'voxelle.voxelle'): Promise<void> {
  const data = serializeToVoxelleFormat();
  const bsonBytes = bsonSerialize(data);
  const compressed = await gzipCompress(bsonBytes);
  const blob = new Blob([compressed], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applyModelData(data: VoxelleFileFormat): void {
  const voxelsMap = new Map<string, number>();
  for (const [x, y, z, c] of data.voxels) {
    voxelsMap.set(coordKey(x, y, z), c);
  }
  resetUndo();
  gridSize.set(data.gridSize as GridSize);
  voxels.set(voxelsMap);
  if (data.scene) {
    if (
      typeof data.scene.focalLength === 'number' &&
      data.scene.focalLength >= 15 &&
      data.scene.focalLength <= 200
    ) {
      focalLength.set(data.scene.focalLength);
    }
    if (typeof data.scene.orthographic === 'boolean') {
      orthographic.set(data.scene.orthographic);
    }
  }
}

/** Decode bytes (gzipped or raw) and apply to store. Used by file load and share. */
export async function loadFromBytes(bytes: Uint8Array): Promise<boolean> {
  let payload = bytes;
  if (isGzipped(bytes)) {
    payload = await gzipDecompress(bytes);
  }
  const data = parsePayload(payload);
  if (!data) return false;
  applyModelData(data);
  return true;
}

export async function loadFromFile(file: File): Promise<boolean> {
  const buf = await file.arrayBuffer();
  return loadFromBytes(new Uint8Array(buf));
}

/** Encode model as base64(gzip(BSON)) for share URL or blob storage. */
export async function encodeForTransport(): Promise<string> {
  const data = serializeToVoxelleFormat();
  const bsonBytes = bsonSerialize(data);
  const compressed = await gzipCompress(bsonBytes);
  let binary = '';
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
  return btoa(binary);
}
