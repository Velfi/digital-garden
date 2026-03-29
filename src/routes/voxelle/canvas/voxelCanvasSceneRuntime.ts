/**
 * Imperative canvas subsystems that are not Svelte-reactive (created after deps exist).
 */
import {
  createVoxelPipelineCoalescer,
  type VoxelPipelineCoalescerOptions
} from './voxelCanvasPipelineCoalescer';

export type VoxelCanvasSceneRuntime = {
  pipeline: ReturnType<typeof createVoxelPipelineCoalescer>;
};

export function createVoxelCanvasSceneRuntime(
  options: VoxelPipelineCoalescerOptions
): VoxelCanvasSceneRuntime {
  return { pipeline: createVoxelPipelineCoalescer(options) };
}
