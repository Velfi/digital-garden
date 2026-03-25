/** Draw order constants for transparent/overlay helpers in Voxelle scene. */
export const GRID_GROUP_RENDER_ORDER = 1;

/** Default preview and rollover layer (above voxel grid lines). */
export const PREVIEW_DEFAULT_RENDER_ORDER = 1001;
/** Hover/pre-drag rollover should remain above drag preview fill. */
export const ROLLOVER_DEFAULT_RENDER_ORDER = 1101;

/** Occluded preview layer draws just under the main preview pass. */
export const PREVIEW_OCCLUDED_RENDER_ORDER = 1000;
/** Preview edge/grid overlay above translucent preview fill. */
export const PREVIEW_GRID_RENDER_ORDER = 1100;

/** Precise tool temporarily raises preview to keep guide feedback on top. */
export const PRECISE_PREVIEW_RENDER_ORDER = 1050;
export const PRECISE_ROLLOVER_RENDER_ORDER = 1200;
