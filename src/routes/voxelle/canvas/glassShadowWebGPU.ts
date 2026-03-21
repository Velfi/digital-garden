/**
 * WebGPU transmitted shadow map: tint + Beer–Lambert-style darkness in RGB (alpha fixed to 1), matching
 * WebGL `createGlassShadowDepthMaterial` (thickScale from vertex AO, `netT`, vertexAOFactor).
 */
import type { MeshPhysicalMaterial } from 'three';
import {
  Fn,
  add,
  clamp,
  div,
  exp,
  float,
  materialReference,
  max,
  mix,
  mul,
  pow,
  reference,
  sub,
  vec3,
  vec4,
  vertexColor
} from 'three/tsl';
import { GLASS_SHADOW_VERTEX_AO_POW, GLASS_SHADOW_VERTEX_AO_SCALE } from './glassShadowConstants';

type PhysicalWithShadow = MeshPhysicalMaterial & { castShadowNode?: unknown };

const AO_POW = float(GLASS_SHADOW_VERTEX_AO_POW);
const AO_SCALE = float(GLASS_SHADOW_VERTEX_AO_SCALE);

/**
 * Requires `renderer.shadowMap.transmitted = true` on WebGPURenderer.
 */
export function attachWebGPUGlassCastShadowNode(material: MeshPhysicalMaterial): void {
  const node = Fn(() => {
    // Shadow pass uses an override material; `materialAttenuationColor` would read that (wrong).
    const color = vec3(materialReference('attenuationColor', 'color', material));
    const base = max(color, vec3(1e-4));
    const vc = vertexColor();
    const ratio = div(vc.xyz, base);
    const rawAO = clamp(div(add(add(ratio.x, ratio.y), ratio.z), float(3)), float(0), float(1));
    const thickScale = mix(float(1.5), float(0.72), rawAO);

    const transmission = reference('transmission', 'float', material);
    const thickness = reference('thickness', 'float', material);
    const attDist = max(reference('attenuationDistance', 'float', material), float(1e-4));

    const netTCore = mul(transmission, exp(mul(thickness.mul(thickScale).negate(), div(float(1), attDist))));
    const netT = clamp(netTCore, float(0), float(1));

    const vertexAOFactor = clamp(mul(pow(rawAO, AO_POW), AO_SCALE), float(0), float(1));
    const effectiveT = clamp(mul(netT, vertexAOFactor), float(0), float(1));

    // Opaque casters write shadow RGB (0,0,0); lighting uses mix(shadowColor, 1, shadowDepth), so
    // in-shadow = shadowColor. Using mix(white, color, …) made glass ~bright vs black and looked
    // like a hole over other shadows. Encode tint as dark color * small scale (same order as black).
    const shadowStrength = sub(float(1), effectiveT);
    const scale = mix(float(0.03), float(0.11), sub(float(1), shadowStrength));
    const rgb = mul(color, scale);
    return vec4(rgb, float(1));
  })();
  (material as PhysicalWithShadow).castShadowNode = node;
  material.needsUpdate = true;
}
