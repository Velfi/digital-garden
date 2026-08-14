import * as THREE from 'three';
import { FLOOR_Y } from './constants';

/**
 * The caustic: a soft pool of focused light on the moss beneath the slime.
 *
 * A body of clear jelly is a bad lens but a lens all the same — the reference
 * photo has a bright patch under the creature where the overhead light
 * converges. One additive quad with a two-lobe radial falloff (a tight warm
 * core, a wide faint skirt), tracked to the slime's centre by the scene and
 * faded with dryness: a parched slime is cloudy, and cloudy lenses focus
 * nothing.
 */

const CAUSTIC_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CAUSTIC_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uStrength;
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = exp(-r * r * 14.0);
  float skirt = exp(-r * r * 3.5) * 0.3;
  vec3 color = vec3(0.85, 1.0, 0.75) * (core + skirt) * uStrength;
  gl_FragColor = vec4(color, 1.0);
}
`;

export interface CausticBundle {
  mesh: THREE.Mesh;
  /** Track the slime: world x/z of its centre, and how clear the jelly is. */
  update(centerX: number, centerZ: number, clarity: number): void;
  dispose(): void;
}

export function createCaustic(): CausticBundle {
  const geometry = new THREE.PlaneGeometry(0.036, 0.036);
  const material = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    vertexShader: CAUSTIC_VERTEX,
    fragmentShader: CAUSTIC_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  // Above the trail overlay, below everything solid.
  mesh.position.y = FLOOR_Y + 0.0006;
  mesh.renderOrder = 2;

  return {
    mesh,
    update(centerX, centerZ, clarity) {
      // Offset a touch toward where the key light throws it.
      mesh.position.x = centerX - 0.004;
      mesh.position.z = centerZ + 0.002;
      material.uniforms.uStrength.value = 0.5 * Math.min(1, Math.max(0, clarity));
      mesh.visible = clarity > 0.02;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
