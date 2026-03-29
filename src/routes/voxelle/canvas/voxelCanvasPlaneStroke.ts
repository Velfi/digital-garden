import * as THREE from 'three';
import type { FaceNormal, FillPlaneSampleContext } from '../store/index';
import { PLANE_CUBOID_HOLLOW_WALL_MAX } from '../store/index';

export function clampPlaneCuboidHollowWallThickness(rawSlider: number): number {
  const raw = Math.floor(rawSlider);
  return Math.min(PLANE_CUBOID_HOLLOW_WALL_MAX, Math.max(1, raw));
}

/** In-plane shell thickness for hollow wall circle (matches wall width slider, min 1 voxel). */
export function wallHollowFootprintThickness(wallWidth: number): number {
  return Math.max(1, wallWidth === 0 ? 1 : wallWidth + 1);
}

export function fillPlaneContextFromHit(
  hit: THREE.Intersection | null,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined,
  getFaceNormalFromHit: (hit: THREE.Intersection) => FaceNormal | null
): FillPlaneSampleContext {
  const faceNormal = hit ? getFaceNormalFromHit(hit) : null;
  let cameraForward: { x: number; y: number; z: number } | null = null;
  if (camera) {
    const v = new THREE.Vector3();
    camera.getWorldDirection(v);
    cameraForward = { x: v.x, y: v.y, z: v.z };
  }
  return { faceNormal, cameraForward };
}
