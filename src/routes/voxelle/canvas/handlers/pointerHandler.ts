/**
 * Dispatches pointer events to per-tool handlers. Add handlers to this module as tools are extracted.
 * VoxelCanvas calls handlePointerDown / handlePointerMove / handlePointerUp with a context.
 */
import type { PointerHandlerContext } from './types';
import { handleFlyPointerDown } from './fly';
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
export function handlePointerMove(ctx: PointerHandlerContext, event?: PointerEvent): boolean {
  if (ctx.getTool() === 'fly') {
    if (event) ctx.onFlyPointerActivity?.();
    return true; // PointerLockControls handles move
  }
  return false;
}
