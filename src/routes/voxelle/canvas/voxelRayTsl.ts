import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { Voxel } from '../voxelMaterial';
import { isWebGPURenderer } from './rendererUtils';
import {
  DEFAULT_RAY_TICK_BUDGET_MS,
  RAY_TRACE_MAX_BUFFER_DIM,
  VoxelRayProgressive,
  type VoxelRayProgressiveTickOptions
} from './voxelRayProgressive';
import { buildVoxelRayGpuResources, type VoxelRayGpuResources } from './voxelRayGpuResources';
import type { VoxelRayTraceParams } from './voxelRayShared';
import { perfLog, perfNow, voxellePerfEnabled } from './voxellePerf';
import {
  createVoxelRayGpuTracePipeline,
  voxelMapHasTransmissiveMaterial,
  type VoxelRayGpuTracePipeline
} from './voxelRayGpuTslTrace';
import { maxDistanceForGpuAccel } from './gpuVoxelAccel';
import type { RayTraceBackendPreference } from '../store/preferences';

export type VoxelRayTslOutput = {
  beautyTexture: THREE.Texture;
  bloomTexture: THREE.Texture;
  refinementProgress: number;
};

export type VoxelRayTslTickContext = {
  webgpuRenderer: WebGPURenderer | null;
  rayTraceBackend: RayTraceBackendPreference;
  rayTickBudgetMs: number;
  rayMaxBufferDim: number;
  rayMaxTemporalSamples: number;
};

/**
 * WebGPU ray-mode adapter.
 *
 * When eligible, runs a TSL full-screen trace into half-float targets; otherwise uses CPU
 * `VoxelRayProgressive` with optional dense/hash accel for DDA.
 */
export class VoxelRayTsl {
  private progressive = new VoxelRayProgressive();
  private resources: VoxelRayGpuResources | null = null;
  private gpuPipeline: VoxelRayGpuTracePipeline | null = null;
  private gpuInitPromise: Promise<void> | null = null;
  /** Last frame used GPU trace (output textures differ from progressive). */
  private outputIsGpu = false;

  get output(): VoxelRayTslOutput {
    if (this.outputIsGpu && this.gpuPipeline) {
      return {
        beautyTexture: this.gpuPipeline.beautyTexture,
        bloomTexture: this.gpuPipeline.bloomTexture,
        refinementProgress: 1
      };
    }
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
    this.gpuPipeline?.dispose();
    this.gpuPipeline = null;
    this.gpuInitPromise = null;
    this.outputIsGpu = false;
  }

  private scheduleGpuPipelineInit(width: number, height: number, dpr: number): void {
    if (this.gpuPipeline || this.gpuInitPromise) return;
    this.gpuInitPromise = createVoxelRayGpuTracePipeline(width, height, dpr)
      .then((p) => {
        this.gpuPipeline = p;
        this.gpuInitPromise = null;
      })
      .catch((e) => {
        console.warn('Voxelle: GPU ray pipeline init failed', e);
        this.gpuInitPromise = null;
      });
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
    budgetMs: number = DEFAULT_RAY_TICK_BUDGET_MS,
    tickContext?: VoxelRayTslTickContext
  ): void {
    if (invalidated) {
      const t0 = voxellePerfEnabled() ? perfNow() : 0;
      this.resources?.dispose();
      this.resources = buildVoxelRayGpuResources(voxels);
      if (voxellePerfEnabled()) perfLog('rayGpu.rebuildResources', perfNow() - t0);
    }

    const rayDpr = Math.min(dpr, 1);
    const backend = tickContext?.rayTraceBackend ?? 'auto';
    const wantGpuTry =
      backend !== 'cpu' &&
      tickContext?.webgpuRenderer &&
      isWebGPURenderer(tickContext.webgpuRenderer) &&
      this.resources &&
      this.resources.mode === 1 &&
      this.resources.denseTexture !== null &&
      !voxelMapHasTransmissiveMaterial(voxels);

    const wantGpu = wantGpuTry && (backend === 'gpu' || backend === 'auto');

    if (wantGpu) {
      this.scheduleGpuPipelineInit(width, height, rayDpr);
    }

    const canRenderGpu =
      wantGpu &&
      this.gpuPipeline &&
      this.resources &&
      this.resources.denseTexture &&
      this.resources.accel.kind === 'dense';

    if (canRenderGpu) {
      const maxDist = maxDistanceForGpuAccel(this.resources.accel, voxels);
      this.gpuPipeline!.setSize(width, height, rayDpr);
      const t0 = voxellePerfEnabled() ? perfNow() : 0;
      this.gpuPipeline!.render(
        tickContext!.webgpuRenderer as WebGPURenderer,
        camera,
        this.resources.denseTexture,
        this.resources.origin,
        this.resources.dims,
        params,
        maxDist
      );
      if (voxellePerfEnabled()) perfLog('rayGpu.tslRender', perfNow() - t0);
      this.outputIsGpu = true;
      return;
    }

    this.outputIsGpu = false;

    const cpuBudget = tickContext?.rayTickBudgetMs ?? budgetMs;
    const tickOpts: VoxelRayProgressiveTickOptions = {
      accel: this.resources?.accel ?? null,
      maxBufferDim: tickContext?.rayMaxBufferDim,
      maxTemporalSamples: tickContext?.rayMaxTemporalSamples
    };

    this.progressive.tick(
      delta,
      width,
      height,
      rayDpr,
      voxels,
      params,
      invalidated,
      camera,
      cpuBudget,
      tickOpts
    );
  }

  getMaxRayBufferDim(): number {
    return RAY_TRACE_MAX_BUFFER_DIM;
  }
}
