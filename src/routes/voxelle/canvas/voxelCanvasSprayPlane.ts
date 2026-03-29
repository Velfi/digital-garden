/**
 * Spray / wall stroke plane-constraint params derived from store + face/camera hints.
 */
import type * as THREE from 'three';
import type { ConstrainToPlaneRef } from '../store/core';
import type { PathThickenParams } from '../strokeGeometry';
import { getDominantAxisOfNormal } from './voxelCanvasRaycast';

export type SprayPlaneParamsSubset = Pick<
  PathThickenParams,
  'sprayConstrainToPlane' | 'sprayPlaneAxis' | 'sprayPlaneNormal'
>;

export function sprayPlaneParamsForFaceNormal(options: {
  constrainToPlaneEnabled: boolean;
  constrainToPlaneRef: ConstrainToPlaneRef;
  faceForAuto: THREE.Vector3 | null | undefined;
  cameraPlaneNormal: { x: number; y: number; z: number } | undefined;
}): SprayPlaneParamsSubset {
  const { constrainToPlaneEnabled, constrainToPlaneRef, faceForAuto, cameraPlaneNormal } = options;
  if (!constrainToPlaneEnabled) {
    return {
      sprayConstrainToPlane: false,
      sprayPlaneAxis: undefined,
      sprayPlaneNormal: undefined
    };
  }
  if (constrainToPlaneRef === 'camera') {
    return {
      sprayConstrainToPlane: true,
      sprayPlaneAxis: undefined,
      sprayPlaneNormal: cameraPlaneNormal
    };
  }
  if (constrainToPlaneRef === 'auto') {
    const n = faceForAuto ?? null;
    return {
      sprayConstrainToPlane: true,
      sprayPlaneAxis: n ? getDominantAxisOfNormal(n) : undefined,
      sprayPlaneNormal: undefined
    };
  }
  return {
    sprayConstrainToPlane: true,
    sprayPlaneAxis: constrainToPlaneRef,
    sprayPlaneNormal: undefined
  };
}
