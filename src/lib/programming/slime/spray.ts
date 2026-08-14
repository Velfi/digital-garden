import * as THREE from 'three';
import { BOX_HALF_Z, FLOOR_Y } from './constants';

/**
 * The mister: a half-second cone of droplets from over the front rim toward
 * the middle of the box. Pure theatre — the moisture change is `applyMist` in
 * the care sim; this is the part you watch. A single Points cloud, recycled
 * per burst, additive so overlapping droplets read as spray rather than
 * confetti.
 */

const DROPLETS = 48;
const LIFE_SEC = 0.75;

export interface SprayBundle {
  points: THREE.Points;
  /**
   * Fire a burst toward `target` (world). Returns the estimated seconds until
   * the droplets land there, so the caller can hold the care effect until the
   * mist visibly arrives.
   */
  spray(target: readonly [number, number, number]): number;
  update(dt: number): void;
  dispose(): void;
}

export function createSpray(): SprayBundle {
  const positions = new Float32Array(DROPLETS * 3);
  const velocities = new Float32Array(DROPLETS * 3);
  const ages = new Float32Array(DROPLETS).fill(Infinity);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

  const material = new THREE.PointsMaterial({
    color: 0xbfdde8,
    size: 0.0016,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;

  // The nozzle hangs over the front rim, a little off-centre like a hand.
  const nozzle = new THREE.Vector3(0.018, FLOOR_Y + 0.085, BOX_HALF_Z + 0.004);

  return {
    points,
    spray(target) {
      // Mean droplet speed, plus half the stagger window: when the middle of
      // the burst reaches the target, the misting has visibly happened.
      const flightDistance = Math.hypot(
        target[0] - nozzle.x,
        target[1] - nozzle.y,
        target[2] - nozzle.z
      );
      const travelSec = Math.min(LIFE_SEC, flightDistance / 0.13 + 0.06);
      for (let i = 0; i < DROPLETS; i++) {
        positions[i * 3] = nozzle.x;
        positions[i * 3 + 1] = nozzle.y;
        positions[i * 3 + 2] = nozzle.z;
        // Aimed at the target with a cone of jitter; a burst, not a stream,
        // so every droplet starts now with its own speed.
        const dx = target[0] - nozzle.x + (Math.random() - 0.5) * 0.03;
        const dy = target[1] - nozzle.y + (Math.random() - 0.5) * 0.02;
        const dz = target[2] - nozzle.z + (Math.random() - 0.5) * 0.03;
        const length = Math.hypot(dx, dy, dz) || 1;
        const speed = 0.09 + Math.random() * 0.08;
        velocities[i * 3] = (dx / length) * speed;
        velocities[i * 3 + 1] = (dy / length) * speed;
        velocities[i * 3 + 2] = (dz / length) * speed;
        ages[i] = Math.random() * 0.12; // staggered starts inside the burst
      }
      points.visible = true;
      return travelSec;
    },
    update(dt) {
      if (!points.visible) return;
      let alive = 0;
      for (let i = 0; i < DROPLETS; i++) {
        if (ages[i] >= LIFE_SEC) continue;
        ages[i] += dt;
        velocities[i * 3 + 1] -= 0.12 * dt; // droplets arc, gently
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        alive += 1;
      }
      positionAttribute.needsUpdate = true;
      material.opacity = 0.55 * Math.max(0, alive / DROPLETS);
      if (alive === 0) points.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
