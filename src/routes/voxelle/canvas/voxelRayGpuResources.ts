import * as THREE from 'three';
import type { Voxel } from '../voxelMaterial';
import {
  buildGpuVoxelAccelFromMap,
  maxDistanceForGpuAccel,
  type GpuVoxelAccel
} from './gpuVoxelAccel';

export type VoxelRayGpuMode = 0 | 1 | 2;

export type VoxelRayGpuResources = {
  accel: GpuVoxelAccel;
  mode: VoxelRayGpuMode;
  maxDistance: number;
  denseTexture: THREE.Data3DTexture | null;
  hashTexture: THREE.DataTexture | null;
  origin: [number, number, number];
  dims: [number, number, number];
  hashMask: number;
  hashTableLen: number;
  dispose(): void;
};

function makeDenseTexture(data: Uint32Array, dims: [number, number, number]): THREE.Data3DTexture {
  const [dx, dy, dz] = dims;
  // WebGPU always declares 3D texture bindings as `texture_3d<f32>` (three.js r183), while
  // integer formats make TSL infer `uvec4` from `textureLoad` — a WGSL type mismatch. Store the
  // same uint32 bits in R32Float and recover with `floatBitsToUint` in the ray shader.
  const floatView = new Float32Array(data.buffer, data.byteOffset, data.length);
  const tex = new THREE.Data3DTexture(floatView, dx, dy, dz);
  tex.type = THREE.FloatType;
  tex.format = THREE.RedFormat;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = 'voxelleRayDense';
  return tex;
}

function makeHashTexture(table: Int32Array, tableLen: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(table, tableLen, 1, THREE.RGBAIntegerFormat, THREE.IntType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'voxelleRayHash';
  return tex;
}

export function buildVoxelRayGpuResources(voxels: Map<string, Voxel>): VoxelRayGpuResources {
  const accel = buildGpuVoxelAccelFromMap(voxels);
  const maxDistance = maxDistanceForGpuAccel(accel, voxels);

  let mode: VoxelRayGpuMode = 0;
  let denseTexture: THREE.Data3DTexture | null = null;
  let hashTexture: THREE.DataTexture | null = null;
  let origin: [number, number, number] = [0, 0, 0];
  let dims: [number, number, number] = [0, 0, 0];
  let hashMask = 0;
  let hashTableLen = 0;

  if (accel.kind === 'dense') {
    mode = 1;
    origin = accel.origin;
    dims = accel.dims;
    denseTexture = makeDenseTexture(accel.data, accel.dims);
  } else if (accel.kind === 'hash') {
    mode = 2;
    hashMask = accel.mask;
    hashTableLen = accel.tableLen;
    hashTexture = makeHashTexture(accel.table, accel.tableLen);
  }

  return {
    accel,
    mode,
    maxDistance,
    denseTexture,
    hashTexture,
    origin,
    dims,
    hashMask,
    hashTableLen,
    dispose() {
      denseTexture?.dispose();
      hashTexture?.dispose();
    }
  };
}
