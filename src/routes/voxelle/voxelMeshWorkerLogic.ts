import { parseCoordKey } from './coordUtils';
import { computeGreedyMesh } from './greedyMeshCore';
import { computeMarchingCubes } from './marchingCubesCore';
import { voxelsFromInput } from './greedyMeshWorkerLogic';
import type { PackedSparseChunkInput, PackedVoxelInput } from './meshWorkerTransfer';
import { parseBucketKey, voxelBucketKey, type Voxel } from './voxelMaterial';

export type RenderingMode = 'greedy' | 'marchingCubes' | 'ray';

const CHUNK_SIZE_DEFAULT = 0;
const GLASS_FULL_SCENE_REBUILD_THRESHOLD = 256;

export interface VoxelMeshWorkerInput {
  voxels:
    | [string, Voxel][]
    | { coords: Int32Array; colors: Uint32Array; materials?: Uint8Array }
    | PackedSparseChunkInput;
  mode?: RenderingMode;
  options?: { aoEnabled?: boolean; aoStrength?: 0 | 1 | 2; chunkSize?: number };
  dirtyChunkIds?: string[];
  gen?: number;
}

export interface VoxelMeshWorkerOutput {
  gen?: number;
  changedBuckets?: string[];
  workerTimings?: {
    parseInputMs: number;
    meshComputeMs: number;
  };
  results: Array<{
    meshKey?: string;
    bucketKey: string;
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    slabThickness: Float32Array;
    indices: Uint32Array;
  }>;
}

function workerNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

type BucketGeometry = VoxelMeshWorkerOutput['results'][number];

let cachedChunkSize = CHUNK_SIZE_DEFAULT;
let cachedChunkResults = new Map<string, BucketGeometry[]>();

function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Partition voxels by spatial chunks. chunkSize must be >= 1. */
function partitionByChunks(
  voxels: Map<string, Voxel>,
  chunkSize: number
): Map<string, Map<string, Voxel>> {
  const chunks = new Map<string, Map<string, Voxel>>();
  for (const [key, voxel] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    const cz = Math.floor(z / chunkSize);
    const ck = chunkKey(cx, cy, cz);
    let ch = chunks.get(ck);
    if (!ch) {
      ch = new Map();
      chunks.set(ck, ch);
    }
    ch.set(key, voxel);
  }
  return chunks;
}

function mergeChunkResults(
  chunkResults: VoxelMeshWorkerOutput['results']
): VoxelMeshWorkerOutput['results'] {
  const byBucket = new Map<
    string,
    {
      positions: number[];
      normals: number[];
      colors: number[];
      slabThickness: number[];
      indices: number[];
    }
  >();
  for (const r of chunkResults) {
    const pos = byBucket.get(r.bucketKey) ?? {
      positions: [],
      normals: [],
      colors: [],
      slabThickness: [],
      indices: []
    };
    if (!byBucket.has(r.bucketKey)) byBucket.set(r.bucketKey, pos);
    const base = pos.positions.length / 3;
    for (let i = 0; i < r.positions.length; i++) pos.positions.push(r.positions[i]);
    for (let i = 0; i < r.normals.length; i++) pos.normals.push(r.normals[i]);
    for (let i = 0; i < r.colors.length; i++) pos.colors.push(r.colors[i]);
    for (let i = 0; i < r.slabThickness.length; i++) pos.slabThickness.push(r.slabThickness[i]!);
    for (let i = 0; i < r.indices.length; i++) pos.indices.push(r.indices[i] + base);
    byBucket.set(r.bucketKey, pos);
  }
  const results: VoxelMeshWorkerOutput['results'] = [];
  for (const [bucketKey, pos] of byBucket) {
    results.push({
      bucketKey,
      positions: new Float32Array(pos.positions),
      normals: new Float32Array(pos.normals),
      colors: new Float32Array(pos.colors),
      slabThickness: new Float32Array(pos.slabThickness),
      indices: new Uint32Array(pos.indices)
    });
  }
  return results;
}

function mergeCachedChunkResults(
  cache: ReadonlyMap<string, BucketGeometry[]>
): VoxelMeshWorkerOutput['results'] {
  const all: BucketGeometry[] = [];
  for (const results of cache.values()) {
    for (const r of results) all.push(r);
  }
  return mergeChunkResults(all);
}

/** Per-chunk bucket meshes with meshKey; required so incremental updates match main-thread keys. */
function flattenCachedChunkResults(
  cache: ReadonlyMap<string, BucketGeometry[]>
): VoxelMeshWorkerOutput['results'] {
  const all: BucketGeometry[] = [];
  for (const results of cache.values()) {
    for (const r of results) all.push(r);
  }
  return all;
}

function mergeChunkResultsForBucketSet(
  cache: ReadonlyMap<string, BucketGeometry[]>,
  buckets: ReadonlySet<string>
): VoxelMeshWorkerOutput['results'] {
  const all: VoxelMeshWorkerOutput['results'] = [];
  for (const results of cache.values()) {
    for (const r of results) {
      const meshKey = r.meshKey ?? r.bucketKey;
      if (buckets.has(meshKey)) all.push(r);
    }
  }
  return all;
}

/** All voxels that belong to one greedy bucket (color|material). */
function voxelsForBucket(voxels: Map<string, Voxel>, bucketKey: string): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  for (const [k, v] of voxels) {
    if (voxelBucketKey(v) === bucketKey) out.set(k, v);
  }
  return out;
}

/**
 * Chunked greedy merges only within each chunk; glass quads/slabs can differ at chunk seams and break
 * shadow depth (custom depth material uses per-vertex thickness). Re-run full-scene greedy per glass
 * bucket so merges match an unchunked pass.
 */
function replaceGlassBucketsWithFullSceneGreedy(
  results: VoxelMeshWorkerOutput['results'],
  fullVoxels: Map<string, Voxel>,
  options: { aoEnabled?: boolean; aoStrength?: 0 | 1 | 2 }
): VoxelMeshWorkerOutput['results'] {
  return results.map((r) => {
    const parsed = parseBucketKey(r.bucketKey);
    if (!parsed || (parsed.material !== 'glass' && parsed.material !== 'water')) return r;
    const subset = voxelsForBucket(fullVoxels, r.bucketKey);
    if (subset.size === 0) return r;
    const core = computeGreedyMesh(subset, {
      aoEnabled: options.aoEnabled,
      aoStrength: options.aoStrength,
      occlusionVoxels: fullVoxels
    });
    const data = core.get(r.bucketKey);
    if (!data) return r;
    return {
      bucketKey: r.bucketKey,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      slabThickness: data.slabThickness,
      indices: data.indices
    };
  });
}

function countTransmissiveVoxels(voxels: Map<string, Voxel>): number {
  let count = 0;
  for (const voxel of voxels.values()) {
    if (voxel.material === 'glass' || voxel.material === 'water') count++;
  }
  return count;
}

function computeChunkGeometry(
  chunkId: string,
  chunkVoxels: Map<string, Voxel>,
  allVoxels: Map<string, Voxel>,
  options: { aoEnabled?: boolean; aoStrength?: 0 | 1 | 2 }
): BucketGeometry[] {
  const results: BucketGeometry[] = [];
  const coreResults = computeGreedyMesh(chunkVoxels, {
    aoEnabled: options.aoEnabled,
    aoStrength: options.aoStrength,
    occlusionVoxels: allVoxels
  });
  for (const [bucketKey, data] of coreResults) {
    results.push({
      meshKey: `${chunkId}|${bucketKey}`,
      bucketKey,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      slabThickness: data.slabThickness,
      indices: data.indices
    });
  }
  return results;
}

function isPackedSparseChunkInput(
  input: VoxelMeshWorkerInput['voxels']
): input is PackedSparseChunkInput {
  return !Array.isArray(input) && 'dirtyChunks' in input && 'haloChunks' in input;
}

function voxelMapFromPacked(input: PackedVoxelInput): Map<string, Voxel> {
  return voxelsFromInput(input);
}

function buildSparseChunkMaps(input: PackedSparseChunkInput): {
  dirtyByChunk: Map<string, Map<string, Voxel>>;
  occupancy: Map<string, Voxel>;
} {
  const dirtyByChunk = new Map<string, Map<string, Voxel>>();
  const occupancy = new Map<string, Voxel>();
  for (const chunk of input.haloChunks) {
    const m = voxelMapFromPacked(chunk.voxels);
    for (const [k, v] of m) occupancy.set(k, v);
  }
  for (const chunk of input.dirtyChunks) {
    const m = voxelMapFromPacked(chunk.voxels);
    dirtyByChunk.set(chunk.chunkId, m);
    for (const [k, v] of m) occupancy.set(k, v);
  }
  return { dirtyByChunk, occupancy };
}

export function processVoxelMeshMessage(input: VoxelMeshWorkerInput): VoxelMeshWorkerOutput {
  const tParse0 = workerNow();
  const { voxels: voxelInput, mode = 'greedy', options = {}, dirtyChunkIds, gen } = input;
  if (mode === 'ray') {
    return { results: [], gen };
  }
  const isSparse = isPackedSparseChunkInput(voxelInput);
  const voxels = isSparse ? null : voxelsFromInput(voxelInput);
  const parseInputMs = Math.max(0, workerNow() - tParse0);
  const tMesh0 = workerNow();
  const chunkSize = options.chunkSize ?? CHUNK_SIZE_DEFAULT;

  if (chunkSize >= 16 && mode === 'greedy' && (isSparse || (voxels && voxels.size > 0))) {
    const transmissiveCount = isSparse
      ? voxelInput.totalTransmissiveCount
      : countTransmissiveVoxels(voxels!);
    const needsGlassRepair = transmissiveCount >= GLASS_FULL_SCENE_REBUILD_THRESHOLD;
    const canUseIncremental =
      !needsGlassRepair &&
      isSparse &&
      Array.isArray(dirtyChunkIds) &&
      dirtyChunkIds.length > 0 &&
      cachedChunkSize === chunkSize &&
      cachedChunkResults.size > 0;
    if (canUseIncremental) {
      if (voxelInput.chunkSize !== chunkSize) {
        const results = needsGlassRepair
          ? mergeCachedChunkResults(cachedChunkResults)
          : flattenCachedChunkResults(cachedChunkResults);
        return { results, gen, changedBuckets: [] };
      }
      const dirtySet = new Set(dirtyChunkIds);
      const { dirtyByChunk, occupancy } = buildSparseChunkMaps(voxelInput);
      const changedBuckets = new Set<string>();
      for (const ck of dirtySet) {
        const prev = cachedChunkResults.get(ck);
        if (prev) for (const bucket of prev) changedBuckets.add(bucket.meshKey ?? bucket.bucketKey);
        const ch = dirtyByChunk.get(ck);
        if (!ch || ch.size === 0) {
          cachedChunkResults.delete(ck);
          continue;
        }
        const next = computeChunkGeometry(ck, ch, occupancy, options);
        for (const bucket of next) changedBuckets.add(bucket.meshKey ?? bucket.bucketKey);
        cachedChunkResults.set(ck, next);
      }
      const changed = [...changedBuckets];
      const deltaResults = mergeChunkResultsForBucketSet(cachedChunkResults, changedBuckets);
      return {
        results: deltaResults,
        gen,
        changedBuckets: changed,
        workerTimings: { parseInputMs, meshComputeMs: Math.max(0, workerNow() - tMesh0) }
      };
    }

    if (isSparse) {
      const results = needsGlassRepair
        ? mergeCachedChunkResults(cachedChunkResults)
        : flattenCachedChunkResults(cachedChunkResults);
      return {
        results,
        gen,
        changedBuckets: [],
        workerTimings: { parseInputMs, meshComputeMs: Math.max(0, workerNow() - tMesh0) }
      };
    }

    const chunks = partitionByChunks(voxels!, chunkSize);
    const nextCache = new Map<string, BucketGeometry[]>();
    for (const [ck, ch] of chunks) {
      nextCache.set(ck, computeChunkGeometry(ck, ch, voxels!, options));
    }
    cachedChunkResults = nextCache;
    cachedChunkSize = chunkSize;
    const merged = mergeCachedChunkResults(cachedChunkResults);
    const results = needsGlassRepair
      ? replaceGlassBucketsWithFullSceneGreedy(merged, voxels!, options)
      : flattenCachedChunkResults(cachedChunkResults);
    return {
      results,
      gen,
      workerTimings: { parseInputMs, meshComputeMs: Math.max(0, workerNow() - tMesh0) }
    };
  }

  cachedChunkResults = new Map();
  cachedChunkSize = CHUNK_SIZE_DEFAULT;

  if (mode === 'marchingCubes') {
    const coreResults = computeMarchingCubes(voxels!);
    const results: VoxelMeshWorkerOutput['results'] = [];
    for (const [bucketKey, data] of coreResults) {
      const n = data.positions.length / 3;
      results.push({
        bucketKey,
        positions: data.positions,
        normals: data.normals,
        colors: data.colors,
        slabThickness: data.slabThickness ?? new Float32Array(n).fill(1),
        indices: data.indices
      });
    }
    return {
      results,
      gen,
      workerTimings: { parseInputMs, meshComputeMs: Math.max(0, workerNow() - tMesh0) }
    };
  }

  const coreResults = computeGreedyMesh(voxels!, options);
  const results: VoxelMeshWorkerOutput['results'] = [];
  for (const [bucketKey, data] of coreResults) {
    results.push({
      bucketKey,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      slabThickness: data.slabThickness,
      indices: data.indices
    });
  }
  return {
    results,
    gen,
    workerTimings: { parseInputMs, meshComputeMs: Math.max(0, workerNow() - tMesh0) }
  };
}
