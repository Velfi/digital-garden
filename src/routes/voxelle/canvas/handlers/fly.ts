/**
 * Fly tool pointer handling: lock/unlock pointer on click.
 */
import type { PointerHandlerContext } from './types';

export function handleFlyPointerDown(ctx: PointerHandlerContext, event: PointerEvent): boolean {
  if (ctx.getTool() !== 'fly') return false;
  if (event.button !== 0 && event.button !== 2) return false;
  const flyControls = ctx.getFlyControls();
  if (flyControls?.isLocked) {
    flyControls.unlock();
  } else {
    flyControls?.lock(true);
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function handleFlyPointerMove(ctx: PointerHandlerContext, event?: PointerEvent): boolean {
  void ctx;
  void event;
  return false; // Fly doesn't need move handling in our dispatcher; PointerLockControls handles it
}

export function handleFlyPointerUp(ctx: PointerHandlerContext, event: PointerEvent): boolean {
  if (ctx.getTool() !== 'fly') return false;
  event.stopPropagation();
  return true;
}
