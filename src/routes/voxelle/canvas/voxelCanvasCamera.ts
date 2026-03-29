/**
 * Orbit / perspective camera math shared by VoxelCanvas and the animation step.
 */
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength) */
export function focalLengthToFov(mm: number): number {
  return (2 * Math.atan(12 / mm) * 180) / Math.PI;
}

/** Matches OrbitControls._customWheelEvent deltaY scaling. */
export function orbitWheelNormalizedDeltaY(event: WheelEvent): number {
  let dy = event.deltaY;
  switch (event.deltaMode) {
    case 1:
      dy *= 16;
      break;
    case 2:
      dy *= 100;
      break;
    default:
      break;
  }
  if (event.ctrlKey) {
    dy *= 10;
  }
  return dy;
}

/** Same base as OrbitControls._getZoomScale (three/examples OrbitControls.js). */
export function orbitZoomScaleFromWheelDelta(controls: OrbitControls, deltaY: number): number {
  const normalizedDelta = Math.abs(deltaY * 0.01);
  return Math.pow(0.95, controls.zoomSpeed * normalizedDelta);
}

export const ZOOM_FACTOR_IN = 1 / 1.2;
export const ZOOM_FACTOR_OUT = 1.2;
export const MIN_CAMERA_DISTANCE = 5;
export const MAX_CAMERA_DISTANCE = 50000;

/** three@0.183 OrbitControls internal _STATE.NONE — wheel zoom only applies in this state. */
export const ORBIT_INTERNAL_STATE_NONE = -1;
