import { computeGreedyMesh } from './greedyMeshCore';
import { coordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { normalizeLegacyVoxel, parseVoxelMaterial, VOXEL_MATERIAL_IDS } from './voxelMaterial';

export interface GreedyMeshWorkerInput {
  voxels: [string, Voxel][] | { coords: Int32Array; colors: Uint32Array; materials?: Uint8Array };
  options?: { aoEnabled?: boolean };
  gen?: number;
}

export interface GreedyMeshWorkerOutput {
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

/** Parse worker input to voxel map. Testable without Worker APIs. */
export function voxelsFromInput(input: GreedyMeshWorkerInput['voxels']): Map<string, Voxel> {
  if (Array.isArray(input)) {
    const m = new Map<string, Voxel>();
    for (const [k, v] of input) {
      if (v && typeof v === 'object' && typeof (v as Voxel).color === 'number') {
        m.set(k, {
          color: (v as Voxel).color & 0xffffff,
          material: parseVoxelMaterial((v as Voxel).material)
        });
      } else if (typeof v === 'number') {
        m.set(k, normalizeLegacyVoxel(v as number));
      }
    }
    return m;
  }
  const { coords, colors, materials } = input;
  const voxels = new Map<string, Voxel>();
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const x = coords[i * 3];
    const y = coords[i * 3 + 1];
    const z = coords[i * 3 + 2];
    const mi = materials && i < materials.length ? materials[i]! : 0;
    const mat =
      typeof mi === 'number' && mi >= 0 && mi < VOXEL_MATERIAL_IDS.length
        ? VOXEL_MATERIAL_IDS[mi]!
        : 'plastic';
    voxels.set(coordKey(x, y, z), { color: colors[i]! & 0xffffff, material: mat });
  }
  return voxels;
}

/** Pure logic for greedy mesh worker. Returns output without transfer. Testable without Worker APIs. */
export function processGreedyMeshMessage(input: GreedyMeshWorkerInput): GreedyMeshWorkerOutput {
  const { voxels: voxelInput, options = {}, gen } = input;
  const voxels = voxelsFromInput(voxelInput);
  const coreResults = computeGreedyMesh(voxels, options);

  const results: GreedyMeshWorkerOutput['results'] = [];
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
