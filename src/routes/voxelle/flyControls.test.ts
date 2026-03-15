import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createFlyMoveState,
  resetFlyMoveState,
  applyFlyMovement,
  FLY_MOVE_SPEED
} from './flyControls';

describe('flyControls', () => {
  describe('createFlyMoveState', () => {
    it('returns state with all zeros', () => {
      const state = createFlyMoveState();
      expect(state.forward).toBe(0);
      expect(state.back).toBe(0);
      expect(state.left).toBe(0);
      expect(state.right).toBe(0);
      expect(state.up).toBe(0);
      expect(state.down).toBe(0);
      expect(state.shift).toBe(0);
    });
  });

  describe('resetFlyMoveState', () => {
    it('clears all axes', () => {
      const state = createFlyMoveState();
      state.forward = 1;
      state.right = 1;
      state.shift = 1;
      resetFlyMoveState(state);
      expect(state.forward).toBe(0);
      expect(state.back).toBe(0);
      expect(state.left).toBe(0);
      expect(state.right).toBe(0);
      expect(state.up).toBe(0);
      expect(state.down).toBe(0);
      expect(state.shift).toBe(0);
    });
  });

  describe('applyFlyMovement', () => {
    it('no-op when controls null', () => {
      const camera = new THREE.PerspectiveCamera();
      applyFlyMovement(camera, null, createFlyMoveState(), 1);
      expect(camera.position.x).toBe(0);
      expect(camera.position.y).toBe(0);
      expect(camera.position.z).toBe(0);
    });

    it('no-op when controls disabled', () => {
      const camera = new THREE.PerspectiveCamera();
      const controls = { enabled: false, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.forward = 1;
      applyFlyMovement(camera, controls as any, state, 1);
      expect(controls.moveRight).not.toHaveBeenCalled();
    });

    it('moves forward when state.forward set', () => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 0, 0);
      const controls = { enabled: true, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.forward = 1;
      applyFlyMovement(camera, controls as any, state, 1);
      expect(camera.position.length()).toBeGreaterThan(0);
    });

    it('calls moveRight when state.right set', () => {
      const camera = new THREE.PerspectiveCamera();
      const controls = { enabled: true, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.right = 1;
      applyFlyMovement(camera, controls as any, state, 0.1);
      expect(controls.moveRight).toHaveBeenCalledWith(expect.any(Number));
    });

    it('moves up when state.up set', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 0);
      const controls = { enabled: true, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.up = 1;
      applyFlyMovement(camera, controls as any, state, 0.1);
      expect(camera.position.y).toBeGreaterThan(0);
    });

    it('uses custom moveSpeed when provided', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 0);
      const controls = { enabled: true, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.up = 1;
      applyFlyMovement(camera, controls as any, state, 1, { moveSpeed: 50 });
      expect(camera.position.y).toBe(50);
    });

    it('reduces speed when shift held', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 0);
      const controls = { enabled: true, moveRight: vi.fn() };
      const state = createFlyMoveState();
      state.up = 1;
      state.shift = 1;
      applyFlyMovement(camera, controls as any, state, 1, { moveSpeed: 80 });
      expect(camera.position.y).toBe(10);
    });
  });
});
