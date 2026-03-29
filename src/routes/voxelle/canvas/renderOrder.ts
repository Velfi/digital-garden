import * as THREE from 'three';

/** Draw order constants for transparent/overlay helpers in Voxelle scene. */
export const GRID_GROUP_RENDER_ORDER = 1;

/**
 * Scene layer for transform/squishy gizmos only. Main pass uses layer 0; {@link renderVoxelleGizmoOverlayPass}
 * clears depth and renders this layer on top.
 */
export const VOXELLE_GIZMO_OVERLAY_LAYER = 1;

export function assignVoxelleGizmoOverlayLayer(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.layers.set(VOXELLE_GIZMO_OVERLAY_LAYER);
  });
}

/** Default preview and rollover layer (above voxel grid lines). */
export const PREVIEW_DEFAULT_RENDER_ORDER = 1001;
/** Hover/pre-drag rollover should remain above drag preview fill. */
export const ROLLOVER_DEFAULT_RENDER_ORDER = 1101;

/** Occluded preview layer draws just under the main preview pass. */
export const PREVIEW_OCCLUDED_RENDER_ORDER = 1000;
/** Preview edge/grid overlay above translucent preview fill. */
export const PREVIEW_GRID_RENDER_ORDER = 1100;
/** Crisp voxel shell / bounds outline on top of optional soft grid. */
export const PREVIEW_BORDER_RENDER_ORDER = 1105;

/** Precise tool temporarily raises preview to keep guide feedback on top. */
export const PRECISE_PREVIEW_RENDER_ORDER = 1050;
/** Occluded stroke/squishy preview pass just under the precise main preview layer. */
export const PRECISE_PREVIEW_OCCLUDED_RENDER_ORDER = 1049;
export const PRECISE_ROLLOVER_RENDER_ORDER = 1200;
