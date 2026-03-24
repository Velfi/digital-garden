/**
 * Dispatches pointer events to per-tool handlers. Add handlers to this module as tools are extracted.
 * VoxelCanvas calls handlePointerDown / handlePointerMove / handlePointerUp with a context.
 */
import type { PointerHandlerContext } from './types';
import { handleFlyPointerDown, handleFlyPointerUp } from './fly';
import { tryHandleGeneratorToolRmb, type GeneratorRmbDeps } from './generatorPointer';

export type { PointerHandlerContext } from './types';
export type { GeneratorRmbDeps } from './generatorPointer';
export { handleFlyPointerUp } from './fly';

/** Returns true if the event was handled and the caller should return. */
export function handlePointerDown(
  ctx: PointerHandlerContext,
  event: PointerEvent,
  generatorRmb?: GeneratorRmbDeps | null
): boolean {
  if ((event.target as Element)?.closest?.('[data-voxelle-no-passthrough]')) return true;
  if (handleFlyPointerDown(ctx, event)) return true;
  if (event.button === 2 && generatorRmb && tryHandleGeneratorToolRmb(generatorRmb, event)) {
    return true;
  }
  return false;
}

/** Returns true if the event was handled and the caller should return. */
export function handlePointerMove(_ctx: PointerHandlerContext, _event?: PointerEvent): boolean {
  if (_ctx.getTool() === 'fly') return true; // PointerLockControls handles move
  return false;
}
