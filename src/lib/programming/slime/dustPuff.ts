import * as THREE from 'three';

/**
 * The touchdown puff: a spat springtail hitting the moss kicks up a tiny
 * ring of dust that blooms outward at ground level and settles in under
 * half a second. Pure theatre, like the mica shaker — but bloom-shaped
 * rather than fall-shaped, and pooled with a rolling cursor so two
 * landings in quick succession each get their own motes instead of the
 * second cancelling the first.
 */

const MOTES = 36;
const MOTES_PER_PUFF = 12;
const LIFE_SEC = 0.45;

export interface DustPuffBundle {
  points: THREE.Points;
  /** Bloom a puff at floor position (x, groundY, z). */
  puff(x: number, z: number, groundY: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createDustPuff(): DustPuffBundle {
  const positions = new Float32Array(MOTES * 3);
  const velocities = new Float32Array(MOTES * 3);
  const ages = new Float32Array(MOTES).fill(Infinity);
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

  const material = new THREE.PointsMaterial({
    // Mossy dust, not glitter: normal blending, matte and faint.
    color: 0x9b9678,
    size: 0.0009,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;

  return {
    points,
    puff(x, z, groundY) {
      for (let n = 0; n < MOTES_PER_PUFF; n++) {
        const i = cursor;
        cursor = (cursor + 1) % MOTES;
        // A flat ring at ground level, blooming outward and barely up.
        const angle = Math.random() * Math.PI * 2;
        positions[i * 3] = x + Math.cos(angle) * 0.0008;
        positions[i * 3 + 1] = groundY + 0.0004;
        positions[i * 3 + 2] = z + Math.sin(angle) * 0.0008;
        const outward = 0.008 + Math.random() * 0.012;
        velocities[i * 3] = Math.cos(angle) * outward;
        velocities[i * 3 + 1] = 0.005 + Math.random() * 0.01;
        velocities[i * 3 + 2] = Math.sin(angle) * outward;
        ages[i] = 0;
      }
      points.visible = true;
    },
    update(dt) {
      if (!points.visible) return;
      let alive = 0;
      for (let i = 0; i < MOTES; i++) {
        if (ages[i] >= LIFE_SEC) continue;
        ages[i] += dt;
        velocities[i * 3 + 1] -= 0.05 * dt; // dust hangs, it does not drop
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        alive += 1;
      }
      positionAttribute.needsUpdate = true;
      material.opacity = 0.5 * Math.min(1, alive / MOTES_PER_PUFF);
      if (alive === 0) points.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
