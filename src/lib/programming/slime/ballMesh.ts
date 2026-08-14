import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';

/**
 * The play ball: a toy for the slime to chase and bat around.
 *
 * A tiny beach ball — six alternating panels of two seeded colours painted
 * as vertex colours on a sphere, under a clearcoated plastic skin. The
 * panels are the whole point: a one-colour ball rolling reads as a ball
 * sliding, and the physics goes to the trouble of a real orientation
 * quaternion precisely so the roll is visible.
 */

/** The toy's radius, metres — sized to the pet (body ~16 mm). */
export const BALL_RADIUS = 0.0075;
/** Panels around the equator. Even, so the two colours alternate cleanly. */
const PANELS = 6;

export interface BallMeshBundle {
  mesh: THREE.Mesh;
  dispose(): void;
}

export function createBallMesh(seed: number): BallMeshBundle {
  const rand = mulberry32((seed ^ 0xba11) >>> 0);

  // Two colours a hand-span apart on the wheel, cheerful but not neon —
  // dime-store plastic under a desk lamp, not a rendering demo.
  const hue = rand();
  const colourA = new THREE.Color().setHSL(hue, 0.55, 0.55);
  const colourB = new THREE.Color().setHSL((hue + 0.45) % 1, 0.5, 0.72);

  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 36, 24);
  const positions = geometry.getAttribute('position');
  const colours = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Panel by longitude; the epsilon nudge keeps seam vertices (which the
    // sphere duplicates) from landing exactly on a panel boundary.
    const angle = Math.atan2(z, x) + Math.PI + 1e-4;
    const panel = Math.floor((angle / (2 * Math.PI)) * PANELS) % PANELS;
    const colour = panel % 2 === 0 ? colourA : colourB;
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.6
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;

  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
