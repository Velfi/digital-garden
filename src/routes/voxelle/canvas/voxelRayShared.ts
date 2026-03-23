import * as THREE from 'three';
import {
  DEFAULT_SHADOW_RAY_SAMPLES,
  DEFAULT_SHADOW_SOFTNESS_RADIANS
} from './gpuSoftShadow';

export const MAX_GLASS_DEPTH = 4;
export const GLASS_MIN_TRANSMITTANCE = 0.35;
export const GLASS_IOR = 1.5;
export const R0_FRESNEL = Math.pow((1 - GLASS_IOR) / (1 + GLASS_IOR), 2);
export const SHADOW_SURFACE_EPS = 2e-4;
/** Bloom source: scale glow emissive so float linear values cross typical bloom thresholds. */
export const GLOW_BLOOM_LINEAR_SCALE = 2.8;

export type VoxelRayTraceParams = {
  /** Unit vector from surface toward the directional light (world). */
  toLightWorld: [number, number, number];
  sunDiffuseR: number;
  sunDiffuseG: number;
  sunDiffuseB: number;
  ambientR: number;
  ambientG: number;
  ambientB: number;
  backgroundR: number;
  backgroundG: number;
  backgroundB: number;
  enableSky: boolean;
  enableShadows: boolean;
  /** Shadow rays toward the sun per shaded hit (1 = hard shadow). */
  shadowRaySamples: number;
  /** Cone half-angle (radians) for jittering shadow rays toward the light. */
  shadowSoftnessRadians: number;
};

export function hexToLinearRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

export function buildVoxelRayTraceParams(
  dirLight: THREE.DirectionalLight,
  hemisphereLight: THREE.HemisphereLight,
  opts: {
    enableSky: boolean;
    backgroundHex: number;
    ambientIntensity: number;
    sceneEnvironmentIntensity: number;
    enableShadows: boolean;
  }
): VoxelRayTraceParams {
  const lightPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  dirLight.getWorldPosition(lightPos);
  dirLight.target.getWorldPosition(targetPos);
  const toLight = lightPos.sub(targetPos);
  if (toLight.lengthSq() < 1e-12) toLight.set(0.3, 1, 0.2);
  toLight.normalize();
  const toLightWorld: [number, number, number] = [toLight.x, toLight.y, toLight.z];

  const sun = dirLight.color;
  const sunMul = dirLight.intensity;
  const ambSky = hemisphereLight.color;
  const ambGr = hemisphereLight.groundColor;
  const ambI = hemisphereLight.intensity * opts.ambientIntensity;
  const env = opts.sceneEnvironmentIntensity;
  const ambientR = ((ambSky.r + ambGr.r) * 0.5) * ambI * env;
  const ambientG = ((ambSky.g + ambGr.g) * 0.5) * ambI * env;
  const ambientB = ((ambSky.b + ambGr.b) * 0.5) * ambI * env;

  const [br, bg, bb] = hexToLinearRgb(opts.backgroundHex & 0xffffff);

  return {
    toLightWorld,
    sunDiffuseR: sun.r * sunMul,
    sunDiffuseG: sun.g * sunMul,
    sunDiffuseB: sun.b * sunMul,
    ambientR,
    ambientG,
    ambientB,
    backgroundR: br,
    backgroundG: bg,
    backgroundB: bb,
    enableSky: opts.enableSky,
    enableShadows: opts.enableShadows,
    shadowRaySamples: DEFAULT_SHADOW_RAY_SAMPLES,
    shadowSoftnessRadians: DEFAULT_SHADOW_SOFTNESS_RADIANS
  };
}
