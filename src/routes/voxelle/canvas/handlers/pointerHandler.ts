/**
 * Dispatches pointer events to per-tool handlers. Add handlers to this module as tools are extracted.
 * VoxelCanvas calls handlePointerDown / handlePointerMove / handlePointerUp with a context.
 */
import type { PointerHandlerContext } from './types';
import { handleFlyPointerDown } from './fly';

export type { PointerHandlerContext } from './types';

/** Returns true if the event was handled and the caller should return. */
export function handlePointerDown(ctx: PointerHandlerContext, event: PointerEvent): boolean {
  if ((event.target as Element)?.closest?.('[data-voxelle-no-passthrough]')) return false;
  if (handleFlyPointerDown(ctx, event)) return true;
  return false;
}

/** Returns true if the event was handled and the caller should return. */
export function handlePointerMove(
  _ctx: PointerHandlerContext,
  _event?: PointerEvent
): boolean {
  if (_ctx.getTool() === 'fly') return true; // PointerLockControls handles move
  return false;
}
