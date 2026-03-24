/**
 * Context passed to pointer handlers. Extend this (or pass sidecar deps like `GeneratorRmbDeps`)
 * as more canvas logic moves out of VoxelCanvas.
 */
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export interface PointerHandlerContext {
  getTool: () => string;
  getFlyControls: () => InstanceType<typeof PointerLockControls> | null;
  getContainer: () => HTMLDivElement | null;
}
