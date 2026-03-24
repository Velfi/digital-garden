import { parseCoordKey } from './coordUtils';
import { computeGreedyMesh } from './greedyMeshCore';
import { computeMarchingCubes } from './marchingCubesCore';
import { voxelsFromInput } from './greedyMeshWorkerLogic';
import { parseBucketKey, voxelBucketKey, type Voxel } from './voxelMaterial';

export type RenderingMode = 'greedy' | 'marchingCubes' | 'ray';

const CHUNK_SIZE_DEFAULT = 0;

export interface VoxelMeshWorkerInput {
  voxels:
    | [string, Voxel][]
    | { coords: Int32Array; colors: Uint32Array; materials?: Uint8Array };
  mode?: RenderingMode;
  options?: { aoEnabled?: boolean; aoStrength?: 0 | 1 | 2; chunkSize?: number };
  gen?: number;
}

export interface VoxelMeshWorkerOutput {
  gen?: number;
  results: Array<{
    bucketKey: string;
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    slabThickness: Float32Array;
    indices: Uint32Array;
  }>;
}

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
    { positions: number[]; normals: number[]; colors: number[]; slabThickness: number[]; indices: number[] }
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

export function processVoxelMeshMessage(input: VoxelMeshWorkerInput): VoxelMeshWorkerOutput {
  const { voxels: voxelInput, mode = 'greedy', options = {}, gen } = input;
  if (mode === 'ray') {
    return { results: [], gen };
  }
  const voxels = voxelsFromInput(voxelInput);
  const chunkSize = options.chunkSize ?? CHUNK_SIZE_DEFAULT;

  if (chunkSize >= 16 && mode === 'greedy' && voxels.size > 0) {
    const chunks = partitionByChunks(voxels, chunkSize);
    const allChunkResults: VoxelMeshWorkerOutput['results'] = [];
    for (const ch of chunks.values()) {
      // Use full-scene occupancy for culling/AO so chunk-edge neighbors do not emit duplicate faces.
      const coreResults = computeGreedyMesh(ch, {
        aoEnabled: options.aoEnabled,
        aoStrength: options.aoStrength,
        occlusionVoxels: voxels
      });
      for (const [bucketKey, data] of coreResults) {
        allChunkResults.push({
          bucketKey,
          positions: data.positions,
          normals: data.normals,
          colors: data.colors,
          slabThickness: data.slabThickness,
          indices: data.indices
        });
      }
    }
    const merged = mergeChunkResults(allChunkResults);
    const results = replaceGlassBucketsWithFullSceneGreedy(merged, voxels, options);
    return { results, gen };
  }

  if (mode === 'marchingCubes') {
    const coreResults = computeMarchingCubes(voxels);
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
    return { results, gen };
  }

  const coreResults = computeGreedyMesh(voxels, options);
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
  return { results, gen };
}
