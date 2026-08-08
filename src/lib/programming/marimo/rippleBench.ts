import * as THREE from 'three';
import { TANK_HALF_X, TANK_HALF_Z, WATER_Y } from './constants';
import { createSurfaceGeometry } from './meniscus';
import {
  RIPPLE_GLSL,
  createRippleUniforms,
  writeRippleUniforms,
  type RippleParams
} from './ripple';
import { SURFACE_STEP, createSurfaceMaterial, mirrorCameraMatrix } from './tankMesh';
import { createRoomUniforms, createWaterUniforms, waterCoefficients } from './waterShader';

/**
 * A bench for looking at the ripples.
 *
 * Tuning a wave field by editing constants and reloading is miserable — the
 * numbers interact, and the thing being judged is motion, which a screenshot
 * cannot show. So this puts the real surface material in front of a camera with
 * every parameter on a live uniform.
 *
 * Two decisions do most of the work here:
 *
 * The `surface` mode uses `createSurfaceMaterial` from `tankMesh.ts`, the exact
 * material the jar draws, rather than a simplified stand-in. Ripples are not
 * judged as a height field; they are judged by what their normals do to Snell's
 * window, and a copy of the shader would answer a different question.
 *
 * The mirror is fed a checkerboard instead of a render target. Past the critical
 * angle the surface is a mirror, and a regular grid seen in a moving mirror is
 * the most legible test pattern there is — how far the squares bend *is* the
 * slope, read directly. The real scene reflects something far mushier.
 */

export type BenchMode = 'surface' | 'above' | 'normals' | 'height' | 'slope';

/** Plan views read the field from straight overhead; the two lit views need a real angle. */
const MODE_CAMERA: Record<BenchMode, { polarDeg: number; distance: number }> = {
  surface: { polarDeg: 118, distance: 0.085 },
  above: { polarDeg: 62, distance: 0.085 },
  normals: { polarDeg: 0, distance: 0.135 },
  height: { polarDeg: 0, distance: 0.135 },
  slope: { polarDeg: 0, distance: 0.135 }
};

const DEBUG_VERTEX = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The diagnostic views. These share `RIPPLE_GLSL` with the real surface, so what
 * they draw is the same field the jar uses — only the presentation differs.
 */
const DEBUG_FRAGMENT = /* glsl */ `
precision highp float;

${RIPPLE_GLSL}

uniform float uTime;
uniform float uAgitation;
uniform float uMode;        // 0 normals, 1 height, 2 slope

varying vec3 vWorld;

void main() {
  vec3 field = rippleField(vWorld.xz, uTime, uAgitation);
  vec3 colour;

  if (uMode < 0.5) {
    vec3 n = normalize(vec3(-field.y, 1.0, -field.z));
    colour = n * 0.5 + 0.5;
  } else if (uMode < 1.5) {
    // Signed height against the amplitude actually in force, so the view keeps
    // its full range as the agitation slider moves rather than fading to grey.
    float span = uRippleAmp * mix(uRippleIdle, 1.0, clamp(uAgitation, 0.0, 1.0));
    float h = clamp(field.x / max(span * 0.5, 1e-6) * 0.5 + 0.5, 0.0, 1.0);
    colour = mix(vec3(0.05, 0.18, 0.32), vec3(1.0, 0.86, 0.58), h);
  } else {
    // Slope magnitude. This is what actually drives the refraction, so it is the
    // honest measure of how hard the surface is working. Scaled so a typical
    // default lands mid-range and the red only appears on genuinely steep water.
    float s = clamp(length(field.yz) * 4.0, 0.0, 1.0);
    colour = mix(vec3(0.03, 0.05, 0.08), vec3(0.45, 0.95, 0.85), s);
    colour += vec3(0.9, 0.35, 0.25) * smoothstep(0.75, 1.0, s);
  }

  gl_FragColor = vec4(colour, 1.0);
}
`;

/** A checkerboard for the mirror to distort. Generated, so there is no asset to ship. */
function checkerTexture(): THREE.DataTexture {
  const size = 256;
  const squares = 16;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor((x / size) * squares) + Math.floor((y / size) * squares)) % 2 === 0;
      // A cool dark/light pair, so it reads as a reflection rather than as UI.
      const [r, g, b] = on ? [26, 44, 48] : [150, 196, 200];
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export interface RippleBench {
  resize(): void;
  render(timeMs: number): void;
  setParams(params: RippleParams): void;
  setMode(mode: BenchMode): void;
  setAgitation(amount: number): void;
  setPaused(paused: boolean): void;
  setFouling(fouling: number): void;
  /** Drag to orbit. Deltas are in normalised device coords. */
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  resetView(): void;
  dispose(): void;
}

export function createRippleBench(container: HTMLElement, params: RippleParams): RippleBench {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0b1113, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.002, 5);
  const mirrorCamera = new THREE.PerspectiveCamera(38, 1, 0.002, 5);
  const mirrorTarget = new THREE.Vector3();

  const water = createWaterUniforms();
  const room = createRoomUniforms();
  const ripple = createRippleUniforms(params);
  const mirror = checkerTexture();

  const surfaceMaterial = createSurfaceMaterial(water, room, ripple);
  surfaceMaterial.uniforms.uReflectionTexture.value = mirror;
  surfaceMaterial.uniforms.uHasTargets.value = 1;
  surfaceMaterial.uniforms.uWaterLevel.value = WATER_Y;

  const debugMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...ripple,
      uTime: { value: 0 },
      uAgitation: { value: 0 },
      uMode: { value: 0 }
    },
    vertexShader: DEBUG_VERTEX,
    fragmentShader: DEBUG_FRAGMENT,
    side: THREE.DoubleSide
  });

  // Deliberately the same mesh as the jar's surface, meniscus and all, so
  // anything that turns out to be a tessellation artefact shows up here too
  // rather than only in the real scene.
  const geometry = createSurfaceGeometry(TANK_HALF_X, TANK_HALF_Z, SURFACE_STEP);
  const surface = new THREE.Mesh(geometry, surfaceMaterial);
  surface.position.y = WATER_Y;
  scene.add(surface);

  let mode: BenchMode = 'surface';
  let azimuth = 0.2;
  let polar = (MODE_CAMERA.surface.polarDeg * Math.PI) / 180;
  let distance = MODE_CAMERA.surface.distance;
  let agitation = 0.5;
  let paused = false;
  let clock = 0;
  let lastFrameMs = 0;

  function placeCamera() {
    camera.position.set(
      distance * Math.sin(polar) * Math.sin(azimuth),
      WATER_Y + distance * Math.cos(polar),
      distance * Math.sin(polar) * Math.cos(azimuth)
    );
    // Straight down is a singularity for lookAt: the default up is parallel to
    // the view direction and the roll is undefined. The plan views sit exactly
    // there on purpose, so hand them an up vector that lies in the water plane.
    camera.up.set(0, 1, 0);
    if (Math.abs(Math.sin(polar)) < 0.12) camera.up.set(0, 0, -1);
    camera.lookAt(0, WATER_Y, 0);

    // The mirror camera the surface projects through. There is no mirror pass
    // here — the "reflection" is a checkerboard — but the surface still has to
    // be told where a reflected ray comes out, and it is built with the jar's
    // own helper so the bench exercises the real lookup. Bending a regular grid
    // by the true parallax is a better test pattern than bending it by a tuned
    // constant, which is what it used to be.
    mirrorTarget.set(0, WATER_Y, 0);
    mirrorCameraMatrix(
      surfaceMaterial.uniforms.uReflectionMatrix.value,
      mirrorCamera,
      camera,
      mirrorTarget,
      WATER_Y
    );
  }

  function setWaterClarity(fouling: number) {
    const coefficients = waterCoefficients(fouling);
    water.uSigmaA.value.fromArray(coefficients.sigmaA);
    water.uSigmaS.value.fromArray(coefficients.sigmaS);
    // `createWaterUniforms` leaves the box top at y = 0; the bench's surface sits
    // at WATER_Y, and without this the path length through the water is measured
    // against a box that does not reach the surface being drawn.
    water.uWaterBoxMax.value.y = WATER_Y;
  }

  placeCamera();
  // The coefficients start as zero vectors, which would make the water perfectly
  // clear and `applyWater` a no-op. Seed them before the first frame.
  setWaterClarity(0);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The mirror camera copies the aspect, so it has to be rebuilt with it.
    placeCamera();
  }

  return {
    resize,

    render(timeMs) {
      if (lastFrameMs > 0 && !paused) {
        clock += Math.min((timeMs - lastFrameMs) / 1000, 0.05);
      }
      lastFrameMs = timeMs;

      surfaceMaterial.uniforms.uTime.value = clock;
      surfaceMaterial.uniforms.uAgitation.value = agitation;
      debugMaterial.uniforms.uTime.value = clock;
      debugMaterial.uniforms.uAgitation.value = agitation;

      renderer.render(scene, camera);
    },

    setParams(next) {
      writeRippleUniforms(ripple, next);
    },

    setMode(next) {
      mode = next;
      surface.material = next === 'surface' || next === 'above' ? surfaceMaterial : debugMaterial;
      debugMaterial.uniforms.uMode.value = next === 'normals' ? 0 : next === 'height' ? 1 : 2;
      const preset = MODE_CAMERA[next];
      polar = (preset.polarDeg * Math.PI) / 180;
      distance = preset.distance;
      placeCamera();
    },

    setAgitation(amount) {
      agitation = Math.max(0, Math.min(1, amount));
    },

    setPaused(next) {
      paused = next;
    },

    setFouling(fouling) {
      setWaterClarity(fouling);
    },

    orbit(dx, dy) {
      azimuth -= dx * 1.8;
      // Never let the camera cross the surface plane: which side it is on decides
      // whether the shader runs the water-to-air branch at all, and drifting
      // across the boundary mid-drag would silently change what is being tuned.
      const [low, high] =
        mode === 'surface' ? [Math.PI / 2 + 0.06, Math.PI - 0.1] : [0, Math.PI / 2 - 0.06];
      polar = Math.max(low, Math.min(high, polar + dy * 1.2));
      placeCamera();
    },

    zoom(delta) {
      distance = Math.max(0.02, Math.min(0.45, distance * Math.exp(delta * 0.0016)));
      placeCamera();
    },

    resetView() {
      const preset = MODE_CAMERA[mode];
      azimuth = 0.2;
      polar = (preset.polarDeg * Math.PI) / 180;
      distance = preset.distance;
      placeCamera();
    },

    dispose() {
      geometry.dispose();
      surfaceMaterial.dispose();
      debugMaterial.dispose();
      mirror.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}
