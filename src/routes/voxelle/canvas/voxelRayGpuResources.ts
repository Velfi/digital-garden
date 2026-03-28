import * as THREE from 'three';
import type { Voxel } from '../voxelMaterial';
import {
  buildGpuVoxelAccelFromMap,
  maxDistanceForGpuAccel,
  type GpuVoxelAccel
} from './gpuVoxelAccel';
import {
  MAX_RAY_GLOW_EMITTERS,
  type RayGlowEmitter,
  hexToLinearRgb
} from './voxelRayShared';

export type VoxelRayGpuMode = 0 | 1 | 2;

export type VoxelRayGpuResources = {
  accel: GpuVoxelAccel;
  mode: VoxelRayGpuMode;
  maxDistance: number;
  denseTexture: THREE.Data3DTexture | null;
  hashTexture: THREE.DataTexture | null;
  glowEmitterTexture: THREE.DataTexture | null;
  glowEmitterCount: number;
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

function collectGlowEmitters(voxels: Map<string, Voxel>): RayGlowEmitter[] {
  const emitters: RayGlowEmitter[] = [];
  for (const [key, v] of voxels) {
    if (emitters.length >= MAX_RAY_GLOW_EMITTERS) break;
    if (v.material !== 'glow') continue;
    const parts = key.split(',');
    if (parts.length !== 3) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const [r, g, b] = hexToLinearRgb(v.color & 0xffffff);
    emitters.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, r, g, b });
  }
  return emitters;
}

function makeGlowEmitterTexture(emitters: readonly RayGlowEmitter[]): THREE.DataTexture | null {
  const count = emitters.length;
  if (count <= 0) return null;
  const width = Math.max(2, count * 2);
  const data = new Float32Array(width * 4);
  for (let i = 0; i < count; i++) {
    const e = emitters[i]!;
    const p = i * 8;
    data[p] = e.x;
    data[p + 1] = e.y;
    data[p + 2] = e.z;
    data[p + 3] = 1;
    data[p + 4] = e.r;
    data[p + 5] = e.g;
    data[p + 6] = e.b;
    data[p + 7] = 1;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'voxelleRayGlowEmitters';
  return tex;
}

export function buildVoxelRayGpuResources(voxels: Map<string, Voxel>): VoxelRayGpuResources {
  const accel = buildGpuVoxelAccelFromMap(voxels);
  const maxDistance = maxDistanceForGpuAccel(accel, voxels);
  const glowEmitters = collectGlowEmitters(voxels);

  let mode: VoxelRayGpuMode = 0;
  let denseTexture: THREE.Data3DTexture | null = null;
  let hashTexture: THREE.DataTexture | null = null;
  let glowEmitterTexture: THREE.DataTexture | null = null;
  let glowEmitterCount = glowEmitters.length;
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
  glowEmitterTexture = makeGlowEmitterTexture(glowEmitters);

  return {
    accel,
    mode,
    maxDistance,
    denseTexture,
    hashTexture,
    glowEmitterTexture,
    glowEmitterCount,
    origin,
    dims,
    hashMask,
    hashTableLen,
    dispose() {
      denseTexture?.dispose();
      hashTexture?.dispose();
      glowEmitterTexture?.dispose();
    }
  };
}
