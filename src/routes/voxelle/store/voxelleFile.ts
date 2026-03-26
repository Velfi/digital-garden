import { get } from 'svelte/store';
import { coordKey, parseCoordKey } from '../coordUtils';
import { voxels, hiddenVoxels, gridSize, focalLength, orthographic, resetUndo } from './core';
import {
  atmosphereEnabled,
  atmosphereColor,
  atmosphereThickness,
  atmosphereDensity,
  atmosphereMode,
  atmosphereSpatialMode,
  atmosphereHeightBias,
  atmosphereHeightFalloff,
  atmosphereDriftEnabled,
  atmosphereDriftAmount,
  atmosphereDriftScale,
  atmosphereDriftSpeed,
  atmospherePlane,
  atmospherePlaneValid,
  distanceTintEnabled,
  distanceTintNearColor,
  distanceTintMidColor,
  distanceTintFarColor,
  distanceTintNearDistance,
  distanceTintFarDistance,
  distanceTintStrength,
  grainEnabled,
  grainStrength,
  grainAnimated,
  grainSpeed,
  sunShaftsEnabled,
  sunShaftsStrength,
  sunShaftsDecay,
  sunShaftsDensity,
  sunShaftsWeight,
  sunShaftsSamples
} from './atmosphere';
import { recomputeGlowVoxelCountFromMap } from './voxelDerivedStats';
import type { GridSize } from './core';
import { VOXELLE_FORMAT_VERSION, type VoxelleFileFormat } from './voxelleFormatCore';
import { canonicalizeVoxelMap } from './serialization';
import type { Voxel } from '../voxelMaterial';
import { parseVoxelMaterial } from '../voxelMaterial';

export { VOXELLE_FORMAT_VERSION, type VoxelleFileFormat };

export type ParsePayloadImpl = (bytes: Uint8Array) => Promise<VoxelleFileFormat | null>;
export type SerializeImpl = (data: VoxelleFileFormat) => Promise<Uint8Array>;

/** File System Access API (Chromium); not on `Window` in all TS lib versions. */
type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

let parsePayloadImpl: ParsePayloadImpl;
let serializeImpl: SerializeImpl;

function createFileWorker(): Worker {
  return new Worker(new URL('./voxelleFile.worker.ts', import.meta.url), { type: 'module' });
}

let workerNextId = 0;

function useWorker(): void {
  parsePayloadImpl = (bytes: Uint8Array) =>
    new Promise((resolve, reject) => {
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
  serializeImpl = (data: VoxelleFileFormat) =>
    new Promise((resolve, reject) => {
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

/** Override parse/serialize for tests. Call with no args to restore worker. */
export function setWorkerImpls(parse?: ParsePayloadImpl, serialize?: SerializeImpl): void {
  if (parse && serialize) {
    parsePayloadImpl = parse;
    serializeImpl = serialize;
  } else {
    useWorker();
  }
}

useWorker();

export function serializeToVoxelleFormat(): VoxelleFileFormat {
  const v = canonicalizeVoxelMap(get(voxels));
  const h = canonicalizeVoxelMap(get(hiddenVoxels));
  let sz = get(gridSize);
  if (v.size > 0 || h.size > 0) {
    let maxAbs = 0;
    for (const source of [v, h]) {
      for (const key of source.keys()) {
        const [x, y, z] = parseCoordKey(key);
        maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
      }
    }
    sz = Math.max(sz, 2 * (maxAbs + 1));
  }
  return {
    version: VOXELLE_FORMAT_VERSION,
    gridSize: sz,
    voxels: [...v.entries()].map(([key, vx]) => {
      const [x, y, z] = parseCoordKey(key);
      return [x, y, z, vx.color, vx.material] as VoxelleFileFormat['voxels'][number];
    }),
    hiddenVoxels: [...h.entries()].map(([key, vx]) => {
      const [x, y, z] = parseCoordKey(key);
      return [x, y, z, vx.color, vx.material] as VoxelleFileFormat['voxels'][number];
    }),
    scene: {
      focalLength: get(focalLength),
      orthographic: get(orthographic),
      atmosphere: {
        enabled: get(atmosphereEnabled),
        color: get(atmosphereColor),
        thickness: get(atmosphereThickness),
        density: get(atmosphereDensity),
        mode: get(atmosphereMode),
        spatial: get(atmosphereSpatialMode),
        heightBias: get(atmosphereHeightBias),
        heightFalloff: get(atmosphereHeightFalloff),
        driftEnabled: get(atmosphereDriftEnabled),
        driftAmount: get(atmosphereDriftAmount),
        driftScale: get(atmosphereDriftScale),
        driftSpeed: get(atmosphereDriftSpeed),
        plane: { ...get(atmospherePlane) },
        planeValid: get(atmospherePlaneValid),
        distanceTintEnabled: get(distanceTintEnabled),
        distanceTintNearColor: get(distanceTintNearColor),
        distanceTintMidColor: get(distanceTintMidColor),
        distanceTintFarColor: get(distanceTintFarColor),
        distanceTintNearDistance: get(distanceTintNearDistance),
        distanceTintFarDistance: get(distanceTintFarDistance),
        distanceTintStrength: get(distanceTintStrength),
        grainEnabled: get(grainEnabled),
        grainStrength: get(grainStrength),
        grainAnimated: get(grainAnimated),
        grainSpeed: get(grainSpeed),
        sunShaftsEnabled: get(sunShaftsEnabled),
        sunShaftsStrength: get(sunShaftsStrength),
        sunShaftsDecay: get(sunShaftsDecay),
        sunShaftsDensity: get(sunShaftsDensity),
        sunShaftsWeight: get(sunShaftsWeight),
        sunShaftsSamples: get(sunShaftsSamples)
      }
    }
  };
}

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

function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function applyModelData(data: VoxelleFileFormat): void {
  const voxelsMap = new Map<string, Voxel>();
  const hiddenMap = new Map<string, Voxel>();
  const sz = data.gridSize;
  for (const row of data.voxels) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const x = row[0] as number;
    const y = row[1] as number;
    const z = row[2] as number;
    const c = ((row[3] as number) >>> 0) & 0xffffff;
    const m =
      row.length >= 5 && typeof row[4] === 'string'
        ? parseVoxelMaterial(row[4])
        : parseVoxelMaterial(0);
    voxelsMap.set(coordKey(x, y, z), { color: c, material: m });
  }
  if (Array.isArray(data.hiddenVoxels)) {
    for (const row of data.hiddenVoxels) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const x = row[0] as number;
      const y = row[1] as number;
      const z = row[2] as number;
      const c = ((row[3] as number) >>> 0) & 0xffffff;
      const m =
        row.length >= 5 && typeof row[4] === 'string'
          ? parseVoxelMaterial(row[4])
          : parseVoxelMaterial(0);
      hiddenMap.set(coordKey(x, y, z), { color: c, material: m });
    }
  }
  resetUndo();
  gridSize.set(sz as GridSize);
  voxels.set(voxelsMap);
  recomputeGlowVoxelCountFromMap(voxelsMap);
  hiddenVoxels.set(hiddenMap);
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
    const atm = data.scene.atmosphere;
    if (atm && typeof atm === 'object') {
      if (typeof atm.enabled === 'boolean') atmosphereEnabled.set(atm.enabled);
      if (typeof atm.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(atm.color)) {
        atmosphereColor.set(atm.color.startsWith('#') ? atm.color : `#${atm.color}`);
      }
      if (
        typeof atm.thickness === 'number' &&
        Number.isFinite(atm.thickness) &&
        atm.thickness > 0
      ) {
        atmosphereThickness.set(Math.min(200, atm.thickness));
      }
      if (
        typeof atm.density === 'number' &&
        Number.isFinite(atm.density) &&
        atm.density >= 0 &&
        atm.density <= 1
      ) {
        atmosphereDensity.set(atm.density);
      }
      if (atm.mode === 'slab' || atm.mode === 'positiveSide') {
        atmosphereMode.set(atm.mode);
      }
      if (atm.spatial === 'plane' || atm.spatial === 'aerial') {
        atmosphereSpatialMode.set(atm.spatial);
      }
      if (typeof atm.heightBias === 'number' && Number.isFinite(atm.heightBias)) {
        atmosphereHeightBias.set(Math.max(-1000, Math.min(1000, atm.heightBias)));
      }
      if (typeof atm.heightFalloff === 'number' && Number.isFinite(atm.heightFalloff)) {
        atmosphereHeightFalloff.set(Math.max(1, Math.min(2000, atm.heightFalloff)));
      }
      if (typeof atm.driftEnabled === 'boolean') atmosphereDriftEnabled.set(atm.driftEnabled);
      if (typeof atm.driftAmount === 'number' && Number.isFinite(atm.driftAmount)) {
        atmosphereDriftAmount.set(Math.max(0, Math.min(1, atm.driftAmount)));
      }
      if (typeof atm.driftScale === 'number' && Number.isFinite(atm.driftScale)) {
        atmosphereDriftScale.set(Math.max(0.0001, Math.min(1, atm.driftScale)));
      }
      if (typeof atm.driftSpeed === 'number' && Number.isFinite(atm.driftSpeed)) {
        atmosphereDriftSpeed.set(Math.max(0, Math.min(10, atm.driftSpeed)));
      }
      const pl = atm.plane;
      if (
        pl &&
        typeof pl.nx === 'number' &&
        typeof pl.ny === 'number' &&
        typeof pl.nz === 'number' &&
        typeof pl.c === 'number' &&
        [pl.nx, pl.ny, pl.nz, pl.c].every(Number.isFinite)
      ) {
        atmospherePlane.set({ nx: pl.nx, ny: pl.ny, nz: pl.nz, c: pl.c });
      }
      if (typeof atm.planeValid === 'boolean') {
        atmospherePlaneValid.set(atm.planeValid);
      } else if (
        pl &&
        typeof pl.nx === 'number' &&
        typeof pl.ny === 'number' &&
        typeof pl.nz === 'number'
      ) {
        atmospherePlaneValid.set(Math.hypot(pl.nx, pl.ny, pl.nz) > 1e-6);
      }
      if (typeof atm.distanceTintEnabled === 'boolean')
        distanceTintEnabled.set(atm.distanceTintEnabled);
      if (
        typeof atm.distanceTintNearColor === 'string' &&
        /^#?[0-9a-fA-F]{6}$/.test(atm.distanceTintNearColor)
      ) {
        distanceTintNearColor.set(
          atm.distanceTintNearColor.startsWith('#')
            ? atm.distanceTintNearColor
            : `#${atm.distanceTintNearColor}`
        );
      }
      if (
        typeof atm.distanceTintMidColor === 'string' &&
        /^#?[0-9a-fA-F]{6}$/.test(atm.distanceTintMidColor)
      ) {
        distanceTintMidColor.set(
          atm.distanceTintMidColor.startsWith('#')
            ? atm.distanceTintMidColor
            : `#${atm.distanceTintMidColor}`
        );
      }
      if (
        typeof atm.distanceTintFarColor === 'string' &&
        /^#?[0-9a-fA-F]{6}$/.test(atm.distanceTintFarColor)
      ) {
        distanceTintFarColor.set(
          atm.distanceTintFarColor.startsWith('#')
            ? atm.distanceTintFarColor
            : `#${atm.distanceTintFarColor}`
        );
      }
      if (
        typeof atm.distanceTintNearDistance === 'number' &&
        Number.isFinite(atm.distanceTintNearDistance)
      ) {
        distanceTintNearDistance.set(Math.max(1, Math.min(4096, atm.distanceTintNearDistance)));
      }
      if (
        typeof atm.distanceTintFarDistance === 'number' &&
        Number.isFinite(atm.distanceTintFarDistance)
      ) {
        distanceTintFarDistance.set(Math.max(1, Math.min(8192, atm.distanceTintFarDistance)));
      }
      if (
        typeof atm.distanceTintStrength === 'number' &&
        Number.isFinite(atm.distanceTintStrength)
      ) {
        distanceTintStrength.set(Math.max(0, Math.min(1, atm.distanceTintStrength)));
      }
      if (typeof atm.grainEnabled === 'boolean') grainEnabled.set(atm.grainEnabled);
      if (typeof atm.grainStrength === 'number' && Number.isFinite(atm.grainStrength)) {
        grainStrength.set(Math.max(0, Math.min(1, atm.grainStrength)));
      }
      if (typeof atm.grainAnimated === 'boolean') grainAnimated.set(atm.grainAnimated);
      if (typeof atm.grainSpeed === 'number' && Number.isFinite(atm.grainSpeed)) {
        grainSpeed.set(Math.max(0, Math.min(20, atm.grainSpeed)));
      }
      if (typeof atm.sunShaftsEnabled === 'boolean') sunShaftsEnabled.set(atm.sunShaftsEnabled);
      if (typeof atm.sunShaftsStrength === 'number' && Number.isFinite(atm.sunShaftsStrength)) {
        sunShaftsStrength.set(Math.max(0, Math.min(4, atm.sunShaftsStrength)));
      }
      if (typeof atm.sunShaftsDecay === 'number' && Number.isFinite(atm.sunShaftsDecay)) {
        sunShaftsDecay.set(Math.max(0, Math.min(1, atm.sunShaftsDecay)));
      }
      if (typeof atm.sunShaftsDensity === 'number' && Number.isFinite(atm.sunShaftsDensity)) {
        sunShaftsDensity.set(Math.max(0, Math.min(4, atm.sunShaftsDensity)));
      }
      if (typeof atm.sunShaftsWeight === 'number' && Number.isFinite(atm.sunShaftsWeight)) {
        sunShaftsWeight.set(Math.max(0, Math.min(4, atm.sunShaftsWeight)));
      }
      if (typeof atm.sunShaftsSamples === 'number' && Number.isFinite(atm.sunShaftsSamples)) {
        sunShaftsSamples.set(Math.max(1, Math.min(64, Math.round(atm.sunShaftsSamples))));
      }
    }
  }
}

export async function saveToFile(filename = 'voxelle.voxelle'): Promise<void> {
  const data = serializeToVoxelleFormat();
  const bsonBytes = await serializeImpl(data);
  const compressed = await gzipCompress(bsonBytes);
  const slice = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([slice], { type: 'application/octet-stream' });

  const w = window as WindowWithSaveFilePicker;
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Voxelle file',
            accept: { 'application/octet-stream': ['.voxelle'] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // Fall through to legacy download on other errors
    }
  }

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
  try {
    if (isGzipped(bytes)) {
      payload = await gzipDecompress(bytes);
    }
  } catch (e) {
    console.error('[Voxelle] Decompression failed:', e);
    return false;
  }
  const data = await parsePayloadImpl(payload);
  if (!data) {
    console.error('[Voxelle] Parse failed. Decompressed payload length:', payload.length);
    return false;
  }
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
  const bsonBytes = await serializeImpl(data);
  const compressed = await gzipCompress(bsonBytes);
  let binary = '';
  for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]!);
  return btoa(binary);
}
