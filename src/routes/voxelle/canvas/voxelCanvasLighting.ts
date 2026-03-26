/**
 * Directional light, sky hemisphere, and shadow frustum helpers for VoxelCanvas.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { hexToInt } from '../store/index';
import { isWebGPURenderer } from './rendererUtils';

export function updateDirLightPosition(
  dirLight: THREE.DirectionalLight,
  azimuthDeg: number,
  elevationDeg: number,
  distance: number
): void {
  const az = (azimuthDeg * Math.PI) / 180;
  const elev = (elevationDeg * Math.PI) / 180;
  const h = Math.cos(elev);
  const d = Math.max(distance, 10);
  dirLight.position.set(Math.cos(az) * h * d, Math.sin(elev) * d, Math.sin(az) * h * d);
}

const baseZenithColor = new THREE.Color(0x7fb3e6);
const baseHorizonColor = new THREE.Color(0xddeefe);
const baseGroundColor = new THREE.Color(0x394555);
const tmpSunColor = new THREE.Color();
const tmpZenithColor = new THREE.Color();
const tmpHorizonColor = new THREE.Color();
const tmpGroundColor = new THREE.Color();
const tmpBackgroundColor = new THREE.Color();
const tmpHorizonPlaneColor = new THREE.Color();

export type SkyLightingColorsInput = {
  sky: InstanceType<typeof Sky> | THREE.Mesh | null;
  dirLight: THREE.DirectionalLight;
  hemisphereLight: THREE.HemisphereLight;
  groundPlane: THREE.Mesh | null;
  sunlightIntensity: number;
  ambientIntensity: number;
  lightElevation: number;
  backgroundColorHex: string;
};

export function updateSkyLightingColors(input: SkyLightingColorsInput): void {
  const {
    sky,
    dirLight,
    hemisphereLight,
    groundPlane,
    sunlightIntensity,
    ambientIntensity,
    lightElevation,
    backgroundColorHex
  } = input;
  if (!sky || !dirLight || !hemisphereLight) return;
  const sunIntensityN = THREE.MathUtils.clamp(sunlightIntensity / 2.3, 0, 2);
  const ambientIntensityN = THREE.MathUtils.clamp(ambientIntensity / 0.45, 0, 2);
  const elevationN = THREE.MathUtils.clamp((lightElevation - 5) / 85, 0, 1);
  tmpSunColor.copy(dirLight.color);
  tmpZenithColor
    .copy(baseZenithColor)
    .lerp(
      tmpSunColor,
      THREE.MathUtils.clamp(0.2 * sunIntensityN + 0.08 * ambientIntensityN, 0, 0.45)
    );
  tmpHorizonColor
    .copy(baseHorizonColor)
    .lerp(
      tmpSunColor,
      THREE.MathUtils.clamp(
        0.28 * sunIntensityN * (1 - elevationN) + 0.06 * ambientIntensityN,
        0,
        0.5
      )
    );
  const skyBrightness = THREE.MathUtils.clamp(
    0.35 + 0.35 * ambientIntensityN + 0.5 * sunIntensityN * (0.25 + 0.75 * elevationN),
    0.2,
    1.9
  );
  tmpZenithColor.multiplyScalar(skyBrightness);
  tmpHorizonColor.multiplyScalar(THREE.MathUtils.clamp(skyBrightness * 1.06, 0.25, 2));
  tmpGroundColor
    .copy(baseGroundColor)
    .lerp(tmpSunColor, THREE.MathUtils.clamp(0.08 * sunIntensityN, 0, 0.16));
  tmpGroundColor.multiplyScalar(THREE.MathUtils.clamp(0.35 + 0.35 * ambientIntensityN, 0.2, 1.25));
  tmpBackgroundColor.setHex(hexToInt(backgroundColorHex));

  hemisphereLight.color.copy(tmpZenithColor);
  hemisphereLight.groundColor.copy(tmpGroundColor);

  if (groundPlane?.material instanceof THREE.MeshStandardMaterial) {
    groundPlane.material.color.copy(
      tmpHorizonPlaneColor.copy(tmpBackgroundColor).lerp(tmpGroundColor, 0.15)
    );
    groundPlane.material.needsUpdate = true;
  }

  if (sky instanceof Sky) {
    const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    if (uniforms['turbidity'])
      uniforms['turbidity'].value = THREE.MathUtils.lerp(1.8, 8.5, 1 - elevationN);
    if (uniforms['rayleigh'])
      uniforms['rayleigh'].value = THREE.MathUtils.lerp(0.75, 2.6, ambientIntensityN * 0.5);
    if (uniforms['mieCoefficient'])
      uniforms['mieCoefficient'].value = THREE.MathUtils.lerp(0.002, 0.028, 1 - elevationN);
    if (uniforms['mieDirectionalG']) uniforms['mieDirectionalG'].value = 0.78;
  } else if (sky instanceof THREE.Mesh && sky.material instanceof THREE.MeshBasicMaterial) {
    sky.material.color.copy(tmpZenithColor).lerp(tmpHorizonColor, 0.4);
    sky.material.needsUpdate = true;
  }
}

export function updateShadowCamera(dirLight: THREE.DirectionalLight, sz: number): void {
  if (!dirLight.shadow) return;
  const ext = sz * 1.2;
  const cam = dirLight.shadow.camera;
  cam.left = -ext;
  cam.right = ext;
  cam.top = ext;
  cam.bottom = -ext;
  cam.near = 0.5;
  cam.far = sz * 4;
  cam.updateProjectionMatrix();
}

/** WebGPU: avoid needsUpdate before ShadowNode.setup allocates shadow.map.depthTexture (updateBefore runs before updateForRender). */
let pendingWebGpuDirectionalShadowInvalidate = false;

export type ShadowInvalidateRenderer =
  | THREE.WebGLRenderer
  | { shadowMap?: { enabled?: boolean; needsUpdate?: boolean } }
  | null;

function applyDirectionalShadowMapInvalidate(
  renderer: ShadowInvalidateRenderer,
  dirLight: THREE.DirectionalLight
): void {
  const sm = renderer!.shadowMap as { needsUpdate?: boolean };
  if (typeof sm.needsUpdate === 'boolean') sm.needsUpdate = true;
  dirLight.shadow.needsUpdate = true;
}

/**
 * Call once per frame after `render()` so a deferred WebGPU invalidate runs only once the
 * directional shadow target (and depthTexture) exists.
 */
export function flushPendingWebGpuDirectionalShadowInvalidate(
  renderer: ShadowInvalidateRenderer,
  enableShadows: boolean,
  dirLight: THREE.DirectionalLight | undefined
): void {
  if (!pendingWebGpuDirectionalShadowInvalidate) return;
  if (
    !isWebGPURenderer(renderer) ||
    !enableShadows ||
    !dirLight?.shadow ||
    !renderer?.shadowMap?.enabled
  ) {
    pendingWebGpuDirectionalShadowInvalidate = false;
    return;
  }
  const map = dirLight.shadow.map as THREE.RenderTarget | null | undefined;
  if (!map?.depthTexture) return;
  pendingWebGpuDirectionalShadowInvalidate = false;
  applyDirectionalShadowMapInvalidate(renderer, dirLight);
}

export function invalidateDirectionalShadowMap(
  renderer: ShadowInvalidateRenderer,
  enableShadows: boolean,
  dirLight: THREE.DirectionalLight | undefined
): void {
  if (!renderer?.shadowMap?.enabled || !enableShadows || !dirLight?.shadow) {
    pendingWebGpuDirectionalShadowInvalidate = false;
    return;
  }
  if (isWebGPURenderer(renderer)) {
    const map = dirLight.shadow.map as THREE.RenderTarget | null | undefined;
    if (!map?.depthTexture) {
      pendingWebGpuDirectionalShadowInvalidate = true;
      return;
    }
  }
  applyDirectionalShadowMapInvalidate(renderer, dirLight);
}
