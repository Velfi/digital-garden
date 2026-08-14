import * as THREE from 'three';

/**
 * The mica shaker: a pinch of pearl dust dropped from just above wherever the
 * pointer aimed. Pure theatre, like the mister's spray — the sparkle change is
 * `applySparkle` in the care sim. A single Points cloud recycled per pinch,
 * additive so the falling flakes catch and glint rather than read as sand.
 */

const FLAKES = 64;
const LIFE_SEC = 1.1;
/** How high above the aim point the pinch is released, metres. */
const DROP_HEIGHT = 0.045;

export interface PowderBundle {
  points: THREE.Points;
  /** Release a pinch over `target` (world). */
  sprinkle(target: readonly [number, number, number]): void;
  update(dt: number): void;
  dispose(): void;
}

export function createPowder(): PowderBundle {
  const positions = new Float32Array(FLAKES * 3);
  const velocities = new Float32Array(FLAKES * 3);
  const ages = new Float32Array(FLAKES).fill(Infinity);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

  const material = new THREE.PointsMaterial({
    color: 0xf1e3c2,
    size: 0.0011,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;

  return {
    points,
    sprinkle(target) {
      for (let i = 0; i < FLAKES; i++) {
        // A loose pinch: a small disc over the target, drifting apart as it
        // falls — powder from between two fingers, not a nozzle.
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * 0.007;
        positions[i * 3] = target[0] + Math.cos(angle) * radius;
        positions[i * 3 + 1] = target[1] + DROP_HEIGHT + Math.random() * 0.012;
        positions[i * 3 + 2] = target[2] + Math.sin(angle) * radius;
        velocities[i * 3] = (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 1] = -0.01 - Math.random() * 0.02;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
        ages[i] = Math.random() * 0.25; // the pinch trickles, it does not dump
      }
      points.visible = true;
    },
    update(dt) {
      if (!points.visible) return;
      let alive = 0;
      for (let i = 0; i < FLAKES; i++) {
        if (ages[i] >= LIFE_SEC) continue;
        ages[i] += dt;
        velocities[i * 3 + 1] -= 0.2 * dt; // flakes drop faster than mist
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        alive += 1;
      }
      positionAttribute.needsUpdate = true;
      material.opacity = 0.85 * Math.max(0, alive / FLAKES);
      if (alive === 0) points.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
