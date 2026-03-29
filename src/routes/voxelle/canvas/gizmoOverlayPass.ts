import * as THREE from 'three';
import type { VoxelleRenderer } from './sceneSetup';

/**
 * After the primary scene render, draw gizmo-layer objects on top with a fresh depth buffer
 * so handles test only each other (and stay visible inside glass / hulls).
 */
export function renderVoxelleGizmoOverlayPass(
  renderer: VoxelleRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  gizmoLayer: number
): void {
  const savedMask = camera.layers.mask;
  camera.layers.disableAll();
  camera.layers.enable(gizmoLayer);

  const savedAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(scene, camera);

  renderer.autoClear = savedAutoClear;
  camera.layers.mask = savedMask;
}
