import * as THREE from 'three';

/**
 * Depth of field, as one compositing pass — the macro-photo shallowness the
 * reference photo has: subject sharp, moss softening toward the camera, the
 * planted room melting behind.
 *
 * The screen pass renders into a colour target instead of the canvas; this
 * pass then blurs each pixel by its circle of confusion, with depth taken as
 * the *nearer* of two textures the volume rig already produces: the interior
 * pass's depth (the world without the slime) and the slime's own back-face
 * depth. The slime's front face is nearer still than its back, so using the
 * back depth slightly *understates* the slime's blur — which is the right
 * error: the pet is the subject, and the subject stays sharp.
 *
 * The blur is a single 12-tap Poisson disc scaled by CoC. At the few-pixel
 * radii a 4:3 viewport wants, one pass is indistinguishable from separable
 * Gaussian and costs half as much.
 */

const DOF_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOF_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uColor;
uniform sampler2D uSceneDepth;
uniform sampler2D uBackDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uFocusDist;
uniform float uFocusRange;
uniform float uMaxBlurPx;

varying vec2 vUv;

float linearDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

void main() {
  float sceneZ = linearDepth(texture2D(uSceneDepth, vUv).x);
  float slimeZ = linearDepth(texture2D(uBackDepth, vUv).x);
  float depth = min(sceneZ, slimeZ);

  float coc = clamp(abs(depth - uFocusDist) / uFocusRange, 0.0, 1.0);
  float radius = coc * coc * uMaxBlurPx;

  vec3 color = texture2D(uColor, vUv).rgb;
  if (radius > 0.5) {
    vec2 texel = 1.0 / uResolution;
    vec3 sum = color;
    // 12-tap Poisson disc.
    vec2 taps[12];
    taps[0] = vec2(-0.326, -0.406);
    taps[1] = vec2(-0.840, -0.074);
    taps[2] = vec2(-0.696, 0.457);
    taps[3] = vec2(-0.203, 0.621);
    taps[4] = vec2(0.962, -0.195);
    taps[5] = vec2(0.473, -0.480);
    taps[6] = vec2(0.519, 0.767);
    taps[7] = vec2(0.185, -0.893);
    taps[8] = vec2(0.507, 0.064);
    taps[9] = vec2(0.896, 0.412);
    taps[10] = vec2(-0.322, -0.933);
    taps[11] = vec2(-0.792, -0.598);
    for (int i = 0; i < 12; i++) {
      sum += texture2D(uColor, vUv + taps[i] * radius * texel).rgb;
    }
    color = sum / 13.0;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface DofBundle {
  /** Render the composite to the current render target. */
  render(
    renderer: THREE.WebGLRenderer,
    color: THREE.Texture,
    sceneDepth: THREE.Texture,
    backDepth: THREE.Texture,
    width: number,
    height: number,
    camera: THREE.PerspectiveCamera,
    focusDistance: number
  ): void;
  dispose(): void;
}

export function createDof(): DofBundle {
  const scene = new THREE.Scene();
  const camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null },
      uSceneDepth: { value: null },
      uBackDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.005 },
      uFar: { value: 3 },
      uFocusDist: { value: 0.13 },
      // Everything within ~6 cm of the subject is sharp; the room, a couple
      // of decimetres back, takes the full blur.
      uFocusRange: { value: 0.09 },
      uMaxBlurPx: { value: 9 }
    },
    vertexShader: DOF_VERTEX,
    fragmentShader: DOF_FRAGMENT,
    depthTest: false,
    depthWrite: false
  });
  scene.add(new THREE.Mesh(geometry, material));

  return {
    render(renderer, color, sceneDepth, backDepth, width, height, camera, focusDistance) {
      const u = material.uniforms;
      u.uColor.value = color;
      u.uSceneDepth.value = sceneDepth;
      u.uBackDepth.value = backDepth;
      u.uResolution.value.set(width, height);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uFocusDist.value = focusDistance;
      renderer.render(scene, camera2);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
