/**
 * Selective glow bloom: stash non-glow materials and primary WebGL/WebGPU render branches.
 */
import { dev } from '$app/environment';
import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { VoxelleSceneRenderPass } from './planarAtmospherePass';
import { VOXELLE_GLOW_BLOOM_USERDATA_KEY } from '../voxelMaterial';
import { isWebGPURenderer } from './rendererUtils';
import type { VoxelleRenderer } from './sceneSetup';
import type { WebGPUBloomPipeline } from './webgpuBloom';
import type { VoxelRayTsl } from './voxelRayTsl';

export function stashNonGlowMaterialsForBloom(
  root: THREE.Object3D,
  bloomDarkMaterial: THREE.MeshBasicMaterial | null,
  bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]>
): void {
  if (!bloomDarkMaterial) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData[VOXELLE_GLOW_BLOOM_USERDATA_KEY] === true) return;
    const id = mesh.uuid;
    if (bloomMaterialStash[id] !== undefined) return;
    bloomMaterialStash[id] = mesh.material;
    mesh.material = bloomDarkMaterial;
  });
}

export function restoreStashedBloomMaterials(
  root: THREE.Object3D,
  bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]>
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const id = mesh.uuid;
    const st = bloomMaterialStash[id];
    if (st !== undefined) {
      mesh.material = st;
      delete bloomMaterialStash[id];
    }
  });
}

/** Stash non-glow materials, run `fn`, then restore in `finally` (survives throws). */
export function withBloomMaterialStash(
  scene: THREE.Scene,
  bloomDarkMaterial: THREE.MeshBasicMaterial | null,
  bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]>,
  fn: () => void
): void {
  if (!bloomDarkMaterial) {
    fn();
    return;
  }
  stashNonGlowMaterialsForBloom(scene, bloomDarkMaterial, bloomMaterialStash);
  try {
    fn();
  } finally {
    restoreStashedBloomMaterials(scene, bloomMaterialStash);
  }
}

export function hasGlowInVoxelGroup(voxelGroup: THREE.Group | null): boolean {
  if (!voxelGroup) return false;
  for (const child of voxelGroup.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh?.isMesh) continue;
    if (mesh.userData?.[VOXELLE_GLOW_BLOOM_USERDATA_KEY] === true) return true;
  }
  return false;
}

export type VoxelPrimaryRenderParams = {
  renderer: VoxelleRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderingMode: 'greedy' | 'marchingCubes' | 'dualContour' | 'ray';
  rayRenderer: VoxelRayTsl | null;
  webgpuBloomPipeline: WebGPUBloomPipeline | null;
  bloomComposer: EffectComposer | null;
  finalComposer: EffectComposer | null;
  sharedSceneRenderPass: RenderPass | null;
  sceneHasGlowMesh: boolean;
  voxelGroup: THREE.Group | null;
  bloomPassBackground: THREE.Color | null;
  bloomDarkMaterial: THREE.MeshBasicMaterial | null;
  bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]>;
  /** WebGL planar fog + screen mood passes (blocky modes; ray uses mood-only, no planar fog). */
  prepareWebGLAtmosphere?: () => void;
  planarAtmospherePassGL: ShaderPass | null;
  atmosphereOnlyComposer: EffectComposer | null;
  atmosphereOnlyScenePass: VoxelleSceneRenderPass | null;
  atmosphereOnlyFogPass: ShaderPass | null;
  atmosphereOnlyDistanceTintPass: ShaderPass | null;
  atmosphereOnlySunShaftsPass: ShaderPass | null;
  atmosphereOnlyGrainPass: ShaderPass | null;
  prepareWebGPUBloomAtmosphere?: () => boolean;
};

export function renderVoxelCanvasPrimaryScene(p: VoxelPrimaryRenderParams): void {
  const {
    renderer,
    scene,
    camera,
    renderingMode,
    rayRenderer,
    webgpuBloomPipeline,
    bloomComposer,
    finalComposer,
    sharedSceneRenderPass,
    sceneHasGlowMesh,
    voxelGroup,
    bloomPassBackground,
    bloomDarkMaterial,
    bloomMaterialStash,
    prepareWebGLAtmosphere,
    planarAtmospherePassGL,
    atmosphereOnlyComposer,
    atmosphereOnlyScenePass,
    atmosphereOnlyFogPass,
    atmosphereOnlyDistanceTintPass,
    atmosphereOnlySunShaftsPass,
    atmosphereOnlyGrainPass,
    prepareWebGPUBloomAtmosphere
  } = p;

  if (dev && Object.keys(bloomMaterialStash).length > 0) {
    console.warn('Voxelle: bloomMaterialStash non-empty at frame start; restoring.');
    restoreStashedBloomMaterials(scene, bloomMaterialStash);
  }

  const rayBloomEligible = renderingMode === 'ray' && rayRenderer != null;
  const rayOut = rayRenderer?.output;

  if (webgpuBloomPipeline && isWebGPURenderer(renderer)) {
    const hasGlowMeshes = sceneHasGlowMesh || hasGlowInVoxelGroup(voxelGroup);
    webgpuBloomPipeline.setGlowBloomActive(hasGlowMeshes);
    const webgpuAtm = prepareWebGPUBloomAtmosphere?.() ?? false;
    /** Ray: avoid BloomNode TSL (async WebGPU fragment validation errors); glow RT is already traced. */
    webgpuBloomPipeline.setRayBloomDirectComposite(renderingMode === 'ray' && rayRenderer != null);
    if (rayBloomEligible && rayOut) {
      /** HalfFloat ray textures: avoid `scene.background` + `render()` — WebGPU background shader can fail (invalid fragment module). */
      webgpuBloomPipeline.blitRayTexturesToBloomTargets(
        renderer as Parameters<WebGPUBloomPipeline['blitRayTexturesToBloomTargets']>[0],
        rayOut.beautyTexture,
        rayOut.bloomTexture
      );
      webgpuBloomPipeline.renderPipeline.render();
    } else if (renderingMode !== 'ray') {
      const rw = renderer as Parameters<WebGPUBloomPipeline['renderSceneToTarget']>[0];
      const hasGlow = sceneHasGlowMesh || hasGlowInVoxelGroup(voxelGroup);
      if (!hasGlow && !webgpuAtm) {
        rw.setMRT(null);
        rw.setRenderTarget(null);
        rw.render(scene, camera);
      } else if (!hasGlow && webgpuAtm) {
        webgpuBloomPipeline.renderSceneToTarget(rw, scene, camera);
        webgpuBloomPipeline.renderPipeline.render();
      } else {
        webgpuBloomPipeline.renderSceneToTarget(rw, scene, camera);
        const savedWebGpuBloomBg = scene.background;
        withBloomMaterialStash(scene, bloomDarkMaterial, bloomMaterialStash, () => {
          if (bloomPassBackground) scene.background = bloomPassBackground;
          try {
            webgpuBloomPipeline.renderBloomSourceToTarget(
              renderer as Parameters<WebGPUBloomPipeline['renderBloomSourceToTarget']>[0],
              scene,
              camera
            );
          } finally {
            scene.background = savedWebGpuBloomBg;
          }
        });
        webgpuBloomPipeline.renderPipeline.render();
      }
    } else {
      renderer.render(scene, camera);
    }
  } else if (bloomComposer && finalComposer && sharedSceneRenderPass) {
    sharedSceneRenderPass.camera = camera;
    if (rayBloomEligible && rayOut) {
      prepareWebGLAtmosphere?.();
      scene.background = rayOut.bloomTexture;
      bloomComposer.render();
      scene.background = rayOut.beautyTexture;
      finalComposer.render();
    } else if (renderingMode !== 'ray') {
      prepareWebGLAtmosphere?.();
      const hasGlow = sceneHasGlowMesh || hasGlowInVoxelGroup(voxelGroup);
      const useAtmosphereOnly =
        atmosphereOnlyComposer &&
        atmosphereOnlyScenePass &&
        atmosphereOnlyFogPass &&
        atmosphereOnlyDistanceTintPass &&
        atmosphereOnlySunShaftsPass &&
        atmosphereOnlyGrainPass &&
        (atmosphereOnlyFogPass.enabled ||
          atmosphereOnlyDistanceTintPass.enabled ||
          atmosphereOnlySunShaftsPass.enabled ||
          atmosphereOnlyGrainPass.enabled);

      if (!hasGlow && useAtmosphereOnly) {
        atmosphereOnlyScenePass.camera = camera;
        atmosphereOnlyComposer.render();
      } else if (!hasGlow) {
        if (planarAtmospherePassGL) planarAtmospherePassGL.enabled = false;
        if (atmosphereOnlyFogPass) atmosphereOnlyFogPass.enabled = false;
        if (atmosphereOnlyDistanceTintPass) atmosphereOnlyDistanceTintPass.enabled = false;
        if (atmosphereOnlySunShaftsPass) atmosphereOnlySunShaftsPass.enabled = false;
        if (atmosphereOnlyGrainPass) atmosphereOnlyGrainPass.enabled = false;
        renderer.render(scene, camera);
      } else {
        withBloomMaterialStash(scene, bloomDarkMaterial, bloomMaterialStash, () => {
          const savedSceneBackground = scene.background;
          if (bloomPassBackground) scene.background = bloomPassBackground;
          try {
            bloomComposer.render();
          } finally {
            scene.background = savedSceneBackground;
          }
        });
        finalComposer.render();
      }
    } else {
      renderer.render(scene, camera);
    }
  } else {
    renderer.render(scene, camera);
  }
}
