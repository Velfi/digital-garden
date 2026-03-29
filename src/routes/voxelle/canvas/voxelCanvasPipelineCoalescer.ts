/**
 * Coalesces mesh/grid/ray rebuild requests across a frame (VoxelCanvas animation loop).
 */
import type { Voxel } from '../store/index';
import { perfLog, perfNow, voxellePerfEnabled } from './voxellePerf';
import type { createMeshManager } from './meshManager';

export type VoxelPipelineCoalescerOptions = {
  getMeshManager: () => ReturnType<typeof createMeshManager> | null;
  getVoxels: () => Map<string, Voxel>;
  getShowGrid: () => boolean;
  getGridSize: () => number;
  onRayPipelineInvalidated: () => void;
};

export function createVoxelPipelineCoalescer(options: VoxelPipelineCoalescerOptions) {
  let pendingMesh = false;
  let pendingGrid = false;
  let pendingRay = false;

  return {
    queue(opts: { mesh?: boolean; grid?: boolean; ray?: boolean }): void {
      if (opts.mesh) pendingMesh = true;
      if (opts.grid) pendingGrid = true;
      if (opts.ray) pendingRay = true;
    },

    /** Apply batched mesh/grid/ray flags once per animation frame. */
    apply(): boolean {
      let did = false;
      const v = options.getVoxels();
      const tAll = voxellePerfEnabled() ? perfNow() : 0;
      const meshManager = options.getMeshManager();
      if (pendingMesh && meshManager) {
        const t0 = voxellePerfEnabled() ? perfNow() : 0;
        meshManager.requestRebuildVoxelMeshes(v);
        if (voxellePerfEnabled()) perfLog('voxelPipeline.meshRequest', perfNow() - t0);
        pendingMesh = false;
        did = true;
      }
      if (pendingGrid && meshManager && options.getShowGrid()) {
        const t0 = voxellePerfEnabled() ? perfNow() : 0;
        meshManager.buildGrid(options.getGridSize(), v);
        if (voxellePerfEnabled()) perfLog('voxelPipeline.gridRebuild', perfNow() - t0);
        pendingGrid = false;
        did = true;
      } else {
        pendingGrid = false;
      }
      if (pendingRay) {
        options.onRayPipelineInvalidated();
        pendingRay = false;
        did = true;
      }
      if (voxellePerfEnabled() && did) perfLog('voxelPipeline.applyTotal', perfNow() - tAll);
      return did;
    }
  };
}
