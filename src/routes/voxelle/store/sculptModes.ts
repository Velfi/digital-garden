import type { SculptMode } from './core';

/** Modes that participate in `thickenPathForStroke` (preview + apply share the same footprint). */
export const SCULPT_PATH_THICKEN_MODES: ReadonlySet<SculptMode> = new Set([
  'draw',
  'smooth',
  'gouge',
  'branch',
  'wall',
  'terrain'
]);

/**
 * Drag-to-stroke path sampling (draw-style), excluding branch (separate pointer branch in canvas).
 */
export const SCULPT_DRAG_PATH_MODES: ReadonlySet<SculptMode> = new Set([
  'draw',
  'smooth',
  'gouge',
  'wall',
  'terrain'
]);

/** Modes that commit a sculpt stroke on pointer-up (includes branch). */
export const SCULPT_STROKE_PATH_MODES: ReadonlySet<SculptMode> = new Set([
  ...SCULPT_DRAG_PATH_MODES,
  'branch'
]);

export function isSculptDragPathMode(mode: SculptMode): boolean {
  return SCULPT_DRAG_PATH_MODES.has(mode);
}

export function isSculptStrokePathMode(mode: SculptMode): boolean {
  return SCULPT_STROKE_PATH_MODES.has(mode);
}
