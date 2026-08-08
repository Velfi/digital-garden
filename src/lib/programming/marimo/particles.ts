import * as THREE from 'three';
import { FLOOR_Y, TANK_HALF_X, TANK_HALF_Z, WATER_Y } from './constants';
import {
  LIGHTING_GLSL,
  WATER_GLSL,
  type LightUniforms,
  type RoomUniforms,
  type WaterUniforms
} from './waterShader';
import {
  createBubbles,
  type BubbleBundle,
  type BubbleHandle,
  type ScreenProjector
} from './bubbleMesh';

/**
 * The two kinds of loose matter in the jar.
 *
 * Debris is a `THREE.Points` cloud with a fixed pool and a ring-buffer cursor —
 * it is out-of-focus muck, and a soft dot is all it ever needs to be. Bubbles
 * are not: an air bubble underwater is defined entirely by how its surface
 * bends light, so those live in `bubbleMesh` as ray-traced spheres and only
 * their spawning is orchestrated from here.
 */

const DEBRIS_POOL = 256;

const POINT_VERTEX = /* glsl */ `
uniform float uPixelScale;

attribute float aSize;
attribute float aFade;

varying float vFade;
varying vec3 vWorld;

void main() {
  vFade = aFade;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uPixelScale / max(1e-5, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const DEBRIS_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${LIGHTING_GLSL}

uniform vec3 uDebrisColour;

varying float vFade;
varying vec3 vWorld;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0 || vFade <= 0.0) discard;
  float alpha = (1.0 - smoothstep(0.2, 1.0, d)) * vFade * 0.7;
  if (alpha < 0.01) discard;
  // Suspended muck is lit by the same lamp as everything else, so the drift near
  // the gravel sits in shadow rather than glowing against a dark floor.
  vec3 colour = applyWater(uDebrisColour * overheadShade(vWorld.y), vWorld);
  gl_FragColor = vec4(colour * uExposure, alpha);
}
`;

interface Pool {
  positions: Float32Array;
  sizes: Float32Array;
  fades: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  cursor: number;
}

function makePool(count: number): Pool {
  return {
    positions: new Float32Array(count * 3),
    sizes: new Float32Array(count),
    fades: new Float32Array(count),
    velocities: new Float32Array(count * 3),
    life: new Float32Array(count),
    cursor: 0
  };
}

function makePoints(
  pool: Pool,
  count: number,
  material: THREE.ShaderMaterial
): { points: THREE.Points; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pool.positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(pool.sizes, 1));
  geometry.setAttribute('aFade', new THREE.BufferAttribute(pool.fades, 1));
  geometry.setDrawRange(0, count);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, geometry };
}

/** Sampled water velocity at a point, written into `out`. */
export type FlowSampler = (x: number, y: number, z: number, out: [number, number, number]) => void;

export interface ParticleBundle {
  group: THREE.Group;
  burstBubbles(x: number, y: number, z: number, radius: number, count: number): void;
  /** Ambient photosynthetic fizz from the marimo's surface. */
  trickleBubbles(x: number, y: number, z: number, radius: number, dt: number, rate: number): void;
  /**
   * Shake bubbles off the marimo's coat outright, `chance` per clinging bubble.
   * A squeeze lets go of everything the coat was holding.
   */
  releaseBubbles(chance: number): void;
  /** Shed clinging bubbles because the marimo is being dragged through water. */
  shearBubbles(slipSpeed: number, dt: number): void;
  /** Every bubble within reach of a point on screen. Pixels, not metres. */
  pickBubbles(
    toScreen: ScreenProjector,
    screenX: number,
    screenY: number,
    padPx: number
  ): BubbleHandle[];
  /** Break that bubble into fragments; returns how many, 0 if it held. */
  popBubble(handle: BubbleHandle): number;
  /**
   * Where the marimo is and how it is turned, so the bubbles can mirror it and
   * the ones stuck to it ride along. Pushed every frame.
   */
  setBall(
    x: number,
    y: number,
    z: number,
    radius: number,
    qx?: number,
    qy?: number,
    qz?: number,
    qw?: number
  ): void;
  update(dt: number, fouling: number, flow: FlowSampler): void;
  /** Sweep debris out during a water change. */
  clearDebris(): void;
  setPixelScale(scale: number): void;
  dispose(): void;
}

export function createParticles(
  water: WaterUniforms,
  room: RoomUniforms,
  light: LightUniforms,
  ballColour: THREE.IUniform<THREE.Color>
): ParticleBundle {
  const debrisMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...water,
      ...light,
      uPixelScale: { value: 400 },
      uDebrisColour: { value: new THREE.Color(0x8b7c5f) }
    },
    vertexShader: POINT_VERTEX,
    fragmentShader: DEBRIS_FRAGMENT,
    transparent: true,
    depthWrite: false
  });

  const bubbles: BubbleBundle = createBubbles(water, room, light, ballColour);
  const debris = makePool(DEBRIS_POOL);
  const debrisMesh = makePoints(debris, DEBRIS_POOL, debrisMaterial);

  const group = new THREE.Group();
  group.add(bubbles.points);
  group.add(debrisMesh.points);

  const flowOut: [number, number, number] = [0, 0, 0];
  let debrisAccumulator = 0;

  function spawnDebris() {
    const i = debris.cursor;
    debris.cursor = (debris.cursor + 1) % DEBRIS_POOL;
    const o = i * 3;
    debris.positions[o] = (Math.random() * 2 - 1) * TANK_HALF_X * 0.9;
    debris.positions[o + 1] = FLOOR_Y + Math.random() * (WATER_Y - FLOOR_Y);
    debris.positions[o + 2] = (Math.random() * 2 - 1) * TANK_HALF_Z * 0.9;
    debris.velocities[o] = 0;
    debris.velocities[o + 1] = -(0.0012 + Math.random() * 0.0018);
    debris.velocities[o + 2] = 0;
    debris.sizes[i] = 0.0009 + Math.random() * 0.0014;
    debris.life[i] = 1;
    debris.fades[i] = 0.4 + Math.random() * 0.6;
  }

  return {
    group,

    burstBubbles(x, y, z, radius, count) {
      bubbles.burst(x, y, z, radius, count);
    },

    trickleBubbles(x, y, z, radius, dt, rate) {
      bubbles.trickle(x, y, z, radius, dt, rate);
    },

    releaseBubbles(chance) {
      bubbles.release(chance);
    },

    shearBubbles(slipSpeed, dt) {
      bubbles.shear(slipSpeed, dt);
    },

    pickBubbles(toScreen, screenX, screenY, padPx) {
      return bubbles.pick(toScreen, screenX, screenY, padPx);
    },

    popBubble(handle) {
      return bubbles.pop(handle);
    },

    setBall(x, y, z, radius, qx, qy, qz, qw) {
      bubbles.setBall(x, y, z, radius, qx, qy, qz, qw);
    },

    update(dt, fouling, flow) {
      bubbles.update(dt, flow);

      // Debris: spawn in proportion to fouling, drift down, settle, respawn.
      debrisAccumulator += dt * fouling * 6;
      while (debrisAccumulator >= 1) {
        debrisAccumulator -= 1;
        spawnDebris();
      }

      for (let i = 0; i < DEBRIS_POOL; i++) {
        if (debris.life[i] <= 0) continue;
        const o = i * 3;
        flow(debris.positions[o], debris.positions[o + 1], debris.positions[o + 2], flowOut);
        debris.positions[o] += (debris.velocities[o] + flowOut[0]) * dt;
        debris.positions[o + 1] += (debris.velocities[o + 1] + flowOut[1]) * dt;
        debris.positions[o + 2] += (debris.velocities[o + 2] + flowOut[2]) * dt;
        if (debris.positions[o + 1] <= FLOOR_Y) debris.life[i] = 0;
      }

      debrisMesh.geometry.attributes.position.needsUpdate = true;
      debrisMesh.geometry.attributes.aFade.needsUpdate = true;
      debrisMesh.geometry.attributes.aSize.needsUpdate = true;
    },

    clearDebris() {
      debris.life.fill(0);
      debris.fades.fill(0);
      debrisAccumulator = 0;
      debrisMesh.geometry.attributes.aFade.needsUpdate = true;
    },

    setPixelScale(scale) {
      // Debris only. Bubbles have a real radius in metres and a real silhouette,
      // so they take their on-screen size from the projection like everything
      // else in the scene — one fewer thing to keep in step with the viewport.
      debrisMaterial.uniforms.uPixelScale.value = scale;
    },

    dispose() {
      bubbles.dispose();
      debrisMesh.geometry.dispose();
      debrisMaterial.dispose();
    }
  };
}
