import * as THREE from 'three';
import {
  BOX_HALF_X,
  BOX_HALF_Z,
  FLOOR_Y,
  TRAIL_HEIGHT,
  TRAIL_LAY_PER_SEC,
  TRAIL_SPLAT_RADIUS,
  TRAIL_TAU_SEC,
  TRAIL_WIDTH
} from './constants';

/**
 * The slime's wet trail: a scalar field over the floor that the underside
 * paints and time dissolves.
 *
 * The marimo's ripple sim runs on the GPU with a TS twin for the tests; this
 * is the degenerate case of that pattern — splat and exponential decay, no
 * wave equation — and at 256×192 texels the CPU does it in well under a
 * millisecond. So there is no twin: the one TS implementation *is* the sim,
 * uploaded as a DataTexture and drawn by a thin overlay quad lying on the
 * substrate. One implementation, directly unit-tested.
 *
 * Decay is `field *= exp(-dt/tau)` — multiplicative, so n small steps and one
 * big step agree exactly, the same house rule the care clock lives by.
 */

/** The field, separated from the Three wrapper so the tests need no GPU. */
export interface TrailField {
  data: Float32Array;
  decay(dt: number): void;
  /** Stamp a soft disc at world (x, z). Strength saturates at 1. */
  splat(x: number, z: number, amount: number): void;
}

export function createTrailField(): TrailField {
  const data = new Float32Array(TRAIL_WIDTH * TRAIL_HEIGHT);
  const texelX = TRAIL_WIDTH / (BOX_HALF_X * 2);
  const texelZ = TRAIL_HEIGHT / (BOX_HALF_Z * 2);
  const radiusX = Math.max(1, Math.round(TRAIL_SPLAT_RADIUS * texelX));
  const radiusZ = Math.max(1, Math.round(TRAIL_SPLAT_RADIUS * texelZ));

  return {
    data,
    decay(dt) {
      const keep = Math.exp(-dt / TRAIL_TAU_SEC);
      for (let i = 0; i < data.length; i++) data[i] *= keep;
    },
    splat(x, z, amount) {
      const cu = (x + BOX_HALF_X) * texelX;
      const cv = (z + BOX_HALF_Z) * texelZ;
      const u0 = Math.max(0, Math.floor(cu - radiusX));
      const u1 = Math.min(TRAIL_WIDTH - 1, Math.ceil(cu + radiusX));
      const v0 = Math.max(0, Math.floor(cv - radiusZ));
      const v1 = Math.min(TRAIL_HEIGHT - 1, Math.ceil(cv + radiusZ));
      for (let v = v0; v <= v1; v++) {
        for (let u = u0; u <= u1; u++) {
          const du = (u - cu) / radiusX;
          const dv = (v - cv) / radiusZ;
          const falloff = 1 - (du * du + dv * dv);
          if (falloff <= 0) continue;
          const i = v * TRAIL_WIDTH + u;
          data[i] = Math.min(1, data[i] + amount * falloff);
        }
      }
    }
  };
}

const TRAIL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  // The quad is rotated -PI/2 about X, so its local +Y (where v grows) points
  // at world -Z, while the field writes v growing toward +Z. Flip v here.
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uTrail;
uniform float uGlow;
varying vec2 vUv;

void main() {
  float trail = texture2D(uTrail, vUv).r;
  // A wet smear: slightly dark where fresh, with a cool gloss. Alpha carries
  // the fade; by the time the field is near zero the floor owns the pixel.
  vec3 sheen = mix(vec3(0.06, 0.075, 0.07), vec3(0.55, 0.62, 0.58), trail * 0.55);
  // After dark the smears phosphoresce: a faint biolight green, brightest
  // where the trail is freshest. uGlow is 0 by day and the night ramps it.
  sheen += vec3(0.18, 0.75, 0.42) * trail * uGlow;
  gl_FragColor = vec4(sheen, trail * (0.5 + 0.35 * uGlow));
}
`;

export interface TrailBundle {
  field: TrailField;
  mesh: THREE.Mesh;
  /**
   * Advance the field and repaint the texture. `contacts` holds world xz
   * pairs of vertices touching the floor this frame; `amount` is the lay-down
   * for the frame, already scaled by dt and the motion scale.
   */
  update(dt: number, contacts: ArrayLike<number>, contactCount: number, motionScale: number): void;
  /** Phosphorescence, 0 (daylight) .. 1 (lights-out night). */
  setGlow(glow: number): void;
  dispose(): void;
}

export function createTrailMap(): TrailBundle {
  const field = createTrailField();
  const pixels = new Uint8Array(TRAIL_WIDTH * TRAIL_HEIGHT);
  const texture = new THREE.DataTexture(
    pixels,
    TRAIL_WIDTH,
    TRAIL_HEIGHT,
    THREE.RedFormat,
    THREE.UnsignedByteType
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;

  const geometry = new THREE.PlaneGeometry(BOX_HALF_X * 2, BOX_HALF_Z * 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTrail: { value: texture }, uGlow: { value: 0 } },
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  // A hair above the substrate, under everything else that draws.
  mesh.position.y = FLOOR_Y + 0.0004;
  mesh.renderOrder = 1;

  return {
    field,
    mesh,
    update(dt, contacts, contactCount, motionScale) {
      field.decay(dt);
      const amount = TRAIL_LAY_PER_SEC * dt * motionScale;
      for (let i = 0; i < contactCount; i++) {
        field.splat(contacts[i * 2], contacts[i * 2 + 1], amount);
      }
      for (let i = 0; i < field.data.length; i++) {
        pixels[i] = Math.min(255, field.data[i] * 255) | 0;
      }
      texture.needsUpdate = true;
    },
    setGlow(glow) {
      material.uniforms.uGlow.value = Math.min(1, Math.max(0, glow));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  };
}
