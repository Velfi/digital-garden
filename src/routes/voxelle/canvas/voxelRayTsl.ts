import * as THREE from 'three';
import type { Voxel } from '../voxelMaterial';
import {
  DEFAULT_RAY_TICK_BUDGET_MS,
  RAY_TRACE_MAX_BUFFER_DIM,
  VoxelRayProgressive
} from './voxelRayProgressive';
import {
  buildVoxelRayGpuResources,
  type VoxelRayGpuResources
} from './voxelRayGpuResources';
import type { VoxelRayTraceParams } from './voxelRayShared';

export type VoxelRayTslOutput = {
  beautyTexture: THREE.Texture;
  bloomTexture: THREE.Texture;
  refinementProgress: number;
};

/**
 * WebGPU ray-mode adapter.
 *
 * This class owns the GPU voxel acceleration upload state and ray output textures.
 * The current shading path is intentionally shared with CPU `VoxelRayProgressive`
 * to preserve visual parity while WebGPU TSL tracing is integrated incrementally.
 */
export class VoxelRayTsl {
  private progressive = new VoxelRayProgressive();
  private resources: VoxelRayGpuResources | null = null;
  private voxelStamp = 0;

  get output(): VoxelRayTslOutput {
    return {
      beautyTexture: this.progressive.texture,
      bloomTexture: this.progressive.bloomTexture,
      refinementProgress: this.progressive.getRefinementProgress()
    };
  }

  get gpuResources(): VoxelRayGpuResources | null {
    return this.resources;
  }

  dispose(): void {
    this.progressive.dispose();
    this.resources?.dispose();
    this.resources = null;
  }

  tick(
    delta: number,
    width: number,
    height: number,
    dpr: number,
    voxels: Map<string, Voxel>,
    params: VoxelRayTraceParams,
    invalidated: boolean,
    camera: THREE.Camera,
    budgetMs: number = DEFAULT_RAY_TICK_BUDGET_MS
  ): void {
    if (invalidated) {
      this.resources?.dispose();
      this.resources = buildVoxelRayGpuResources(voxels);
      this.voxelStamp++;
    }

    // Keep ray mode responsive under high DPR while matching historical quality cap.
    const rayDpr = Math.min(dpr, 1);
    this.progressive.tick(
      delta,
      width,
      height,
      rayDpr,
      voxels,
      params,
      invalidated,
      camera,
      budgetMs
    );
  }

  getMaxRayBufferDim(): number {
    return RAY_TRACE_MAX_BUFFER_DIM;
  }
}
