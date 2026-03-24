import { parseCoordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { VOXEL_MATERIAL_IDS } from './voxelMaterial';

export type PackedVoxelInput = {
  coords: Int32Array;
  colors: Uint32Array;
  materials: Uint8Array;
};

/** Encode voxel map into typed arrays for worker postMessage transfer. */
export function packVoxelsForWorker(voxels: Map<string, Voxel>): PackedVoxelInput {
  const count = voxels.size;
  const coords = new Int32Array(count * 3);
  const colors = new Uint32Array(count);
  const materials = new Uint8Array(count);
  let i = 0;
  for (const [key, voxel] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const o = i * 3;
    coords[o] = x;
    coords[o + 1] = y;
    coords[o + 2] = z;
    colors[i] = voxel.color & 0xffffff;
    const mi = VOXEL_MATERIAL_IDS.indexOf(voxel.material);
    materials[i] = mi >= 0 ? mi : 0;
    i++;
  }
  return { coords, colors, materials };
}

export function transferablesFromPackedVoxelInput(input: PackedVoxelInput): Transferable[] {
  return [input.coords.buffer, input.colors.buffer, input.materials.buffer];
}

/** Typed-array buffers to transfer alongside greedy/voxel mesh worker results. */
export function transferablesFromMeshResults(
  results: ReadonlyArray<{
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    slabThickness: Float32Array;
    indices: Uint32Array;
  }>
): Transferable[] {
  const transferables: Transferable[] = [];
  for (const r of results) {
    transferables.push(
      r.positions.buffer,
      r.normals.buffer,
      r.colors.buffer,
      r.slabThickness.buffer,
      r.indices.buffer
    );
  }
  return transferables;
}
