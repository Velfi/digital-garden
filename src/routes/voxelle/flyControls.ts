import * as THREE from 'three';
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const FLY_MOVE_SPEED = 120;
export const FLY_POINTER_SPEED = 1.2;

export type FlyMoveState = {
  forward: number;
  back: number;
  left: number;
  right: number;
  up: number;
  down: number;
  shift: number;
};

export function createFlyMoveState(): FlyMoveState {
  return {
    forward: 0,
    back: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    shift: 0
  };
}

export function createFlyKeyHandlers(state: FlyMoveState, options: { isEnabled: () => boolean }) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || !options.isEnabled()) return;
    switch (e.code) {
      case 'KeyW':
        state.forward = 1;
        break;
      case 'KeyS':
        state.back = 1;
        break;
      case 'KeyA':
        state.left = 1;
        break;
      case 'KeyD':
        state.right = 1;
        break;
      case 'KeyE':
        state.up = 1;
        break;
      case 'KeyQ':
        state.down = 1;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        state.shift = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!options.isEnabled()) return;
    switch (e.code) {
      case 'KeyW':
        state.forward = 0;
        break;
      case 'KeyS':
        state.back = 0;
        break;
      case 'KeyA':
        state.left = 0;
        break;
      case 'KeyD':
        state.right = 0;
        break;
      case 'KeyE':
        state.up = 0;
        break;
      case 'KeyQ':
        state.down = 0;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        state.shift = 0;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  return { onKeyDown, onKeyUp };
}

export function resetFlyMoveState(state: FlyMoveState) {
  state.forward = state.back = state.left = state.right = state.up = state.down = state.shift = 0;
}

/**
 * Apply WASD/QE movement to camera. Call from animation loop when fly mode is active.
 */
export function applyFlyMovement(
  camera: THREE.Camera,
  controls: PointerLockControls | null,
  state: FlyMoveState,
  delta: number,
  options: { moveSpeed?: number } = {}
) {
  if (!controls?.enabled) return;
  const moveSpeed = options.moveSpeed ?? FLY_MOVE_SPEED;
  const speedMult = state.shift ? 1 / 8 : 1;
  const dist = moveSpeed * delta * speedMult;
  const fwd = state.forward - state.back;
  const right = state.right - state.left;
  const up = state.up - state.down;
  if (fwd !== 0) {
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(look, fwd * dist);
  }
  if (right !== 0) controls.moveRight(right * dist);
  if (up !== 0) camera.position.y += up * dist;
}
