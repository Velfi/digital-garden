/**
 * Shared pointer prelude for VoxelCanvas: UI hit-test passthrough, fly mode, generator RMB, etc.
 * Keeps dispatch logic in one place next to canvas/handlers/pointerHandler.ts.
 */
import {
  handlePointerDown as dispatchPointerDown,
  handlePointerMove as dispatchPointerMove,
  type PointerHandlerContext
} from './handlers/pointerHandler';
import type { GeneratorRmbDeps } from './handlers/generatorPointer';

export type VoxelCanvasPointerPreludeDeps = {
  pointerHandlerContext: PointerHandlerContext;
  /** Built per-frame / per-gesture from VoxelCanvas generator bridge; null when unused. */
  generatorRmb: GeneratorRmbDeps | null;
  updatePointerFromEvent: (e: PointerEvent) => void;
};

/** Update ray from event and run early handlers. Returns true if the canvas should skip sculpt logic. */
export function runPointerDownPrelude(
  event: PointerEvent,
  deps: VoxelCanvasPointerPreludeDeps
): boolean {
  deps.updatePointerFromEvent(event);
  return dispatchPointerDown(deps.pointerHandlerContext, event, deps.generatorRmb);
}

/**
 * Optional pointer sync + fly/move short-circuit. Returns true if sculpt hover/drag logic should be skipped.
 * When `event` is undefined (e.g. after pointer-up synthetic refresh), only dispatch runs.
 */
export function runPointerMovePrelude(
  event: PointerEvent | undefined,
  deps: Pick<VoxelCanvasPointerPreludeDeps, 'pointerHandlerContext' | 'updatePointerFromEvent'>
): boolean {
  if (event) deps.updatePointerFromEvent(event);
  return dispatchPointerMove(deps.pointerHandlerContext, event);
}
