/**
 * Glass shadow AO remapping: shared by WebGL depth shader (`meshManager`) and WebGPU `castShadowNode`
 * (`glassShadowWebGPU`). Keep in sync with GLSL `glassShadowVertexAOPow` / `glassShadowVertexAOScale`.
 */
export const GLASS_SHADOW_VERTEX_AO_POW = 1.65;
export const GLASS_SHADOW_VERTEX_AO_SCALE = 1;
