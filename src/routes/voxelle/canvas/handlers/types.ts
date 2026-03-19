/**
 * Context passed to pointer handlers. Extended as more tools are moved into canvas/handlers/.
 * VoxelCanvas creates this and passes it to handlePointerDown / handlePointerMove / handlePointerUp.
 */
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export interface PointerHandlerContext {
  getTool: () => string;
  getFlyControls: () => InstanceType<typeof PointerLockControls> | null;
  getContainer: () => HTMLDivElement | null;
}
