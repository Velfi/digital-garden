import { derived } from 'svelte/store';
import { tool, addPanelStore } from './core';

/**
 * High-level canvas interaction mode for camera vs sculpt vs UI overlays.
 * Pointer/gizmo suppression (e.g. piscina handle drag) is applied separately in VoxelCanvas.
 */
export type VoxelleCanvasInteractionMode = 'fly' | 'hand' | 'add_panel' | 'sculpt';

export const canvasInteractionMode = derived(
  [tool, addPanelStore],
  ([t, add]): VoxelleCanvasInteractionMode => {
    if (t === 'fly') return 'fly';
    if (t === 'hand') return 'hand';
    if (add.open) return 'add_panel';
    return 'sculpt';
  }
);

/** OrbitControls.enabled: false in fly mode or while a gizmo suppresses orbit. */
export function shouldEnableOrbitControls(
  currentTool: string,
  gizmoOrbitSuppressed: boolean
): boolean {
  if (currentTool === 'fly') return false;
  if (gizmoOrbitSuppressed) return false;
  return true;
}
