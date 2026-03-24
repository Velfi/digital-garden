/**
 * Context passed to pointer handlers. Extend this (or pass sidecar deps like `GeneratorRmbDeps`)
 * as more canvas logic moves out of VoxelCanvas.
 *
 * Generator RMB / primary-up deps for `generatorPointer.ts` are built in `voxelPointerCore.ts`
 * (`buildVoxelGeneratorRmbDeps`, `buildVoxelGeneratorPrimaryPointerUpDeps`) from `VoxelGenerator*Bridge` bags.
 */
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export interface PointerHandlerContext {
  getTool: () => string;
  getFlyControls: () => InstanceType<typeof PointerLockControls> | null;
  getContainer: () => HTMLDivElement | null;
}
