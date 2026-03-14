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

function createFileWorker(): Worker {
  return new Worker(new URL('./voxelleFile.worker.ts', import.meta.url), { type: 'module' });
}

let workerNextId = 0;

function parsePayloadInWorker(bytes: Uint8Array): Promise<VoxelleFileFormat | null> {
  return new Promise((resolve, reject) => {
    const id = ++workerNextId;
    const worker = createFileWorker();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const handler = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener('message', handler);
      worker.terminate();
      if (e.data.type === 'parsed') resolve(e.data.data ?? null);
      else resolve(null);
    };
    worker.addEventListener('message', handler);
    worker.onerror = () => {
      worker.removeEventListener('message', handler);
      worker.terminate();
      reject(new Error('Worker failed'));
    };
    worker.postMessage({ type: 'parse', id, bytes: buf }, [buf]);
  });
}

function serializeInWorker(data: VoxelleFileFormat): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = ++workerNextId;
    const worker = createFileWorker();
    const handler = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener('message', handler);
      worker.terminate();
      if (e.data.type === 'serialized' && e.data.bytes) {
        resolve(new Uint8Array(e.data.bytes));
      } else {
        reject(new Error('Worker failed'));
      }
    };
    worker.addEventListener('message', handler);
    worker.onerror = () => {
      worker.removeEventListener('message', handler);
      worker.terminate();
      reject(new Error('Worker failed'));
    };
    worker.postMessage({ type: 'serialize', id, data });
  });
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

function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
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

export async function saveToFile(filename = 'voxelle.voxelle'): Promise<void> {
  const data = serializeToVoxelleFormat();
  const bsonBytes = await serializeInWorker(data);
  const compressed = await gzipCompress(bsonBytes);
  const slice = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([slice], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Decode bytes (gzipped or raw) and apply to store. Used by file load and share. */
export async function loadFromBytes(bytes: Uint8Array): Promise<boolean> {
  let payload = bytes;
  if (isGzipped(bytes)) {
    payload = await gzipDecompress(bytes);
  }
  const data = await parsePayloadInWorker(payload);
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
  const bsonBytes = await serializeInWorker(data);
  const compressed = await gzipCompress(bsonBytes);
  let binary = '';
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]!);
  return btoa(binary);
}
