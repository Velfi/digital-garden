/**
 * Glass shadow AO remapping shared by the depth shader path in `meshManager`.
 * Keep in sync with GLSL `glassShadowVertexAOPow` / `glassShadowVertexAOScale`.
 */
export const GLASS_SHADOW_VERTEX_AO_POW = 1.65;
export const GLASS_SHADOW_VERTEX_AO_SCALE = 1;

/**
 * Slab → transmittance for shadow depth bias; must match `greedyMeshCore` glass absorption / floor.
 */
export const GLASS_SHADOW_SLAB_ABSORPTION = 0.16;
export const GLASS_SHADOW_SLAB_MIN_TRANSMITTANCE = 0.35;
