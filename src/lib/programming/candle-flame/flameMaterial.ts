import * as THREE from 'three';

const flameVertexShader = `
attribute vec2 aFlameParams;

varying vec2 vFlame;

void main() {
  vFlame = aFlameParams;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const flameFragmentShader = `
varying vec2 vFlame;

vec3 flamePalette(float y01, float radial, out float blueAmt) {
  vec3 white = vec3(1.0, 0.98, 0.9);
  vec3 pale = vec3(1.0, 0.92, 0.58);
  vec3 amber = vec3(1.0, 0.74, 0.2);
  vec3 orange = vec3(1.0, 0.48, 0.1);
  vec3 blue = vec3(0.15, 0.35, 1.0);
  vec3 blueDeep = vec3(0.08, 0.15, 0.75);

  float temp = clamp(y01 * 0.7 + (1.0 - radial) * 0.38, 0.0, 1.0);

  vec3 col = mix(orange, amber, smoothstep(0.05, 0.42, temp));
  col = mix(col, pale, smoothstep(0.28, 0.62, temp));

  float core = (1.0 - smoothstep(0.0, 0.42, radial));
  core *= smoothstep(0.05, 0.32, y01) * (1.0 - smoothstep(0.72, 0.98, y01));
  col = mix(col, white, core * 0.95);

  float shell = smoothstep(0.35, 0.95, radial);
  col = mix(col, amber * 1.15, shell * 0.42);

  float blueHeight = smoothstep(0.46, 0.0, y01);
  float blueSkirt = blueHeight * smoothstep(0.12, 0.92, radial);
  float blueInner = blueHeight * smoothstep(0.68, 0.0, radial) * 0.5;
  blueAmt = clamp(max(blueSkirt, blueInner), 0.0, 1.0);
  col = mix(col, mix(blueDeep, blue, radial), blueAmt * 0.88);

  float baseRound = smoothstep(0.0, 0.1, y01 + (1.0 - radial) * 0.08);
  col *= baseRound;

  float tipFade = smoothstep(0.82, 0.99, y01);
  col = mix(col, amber * 0.65, tipFade * 0.22);

  return col * 2.05;
}

float flameWeight(float y01, float radial, float blueAmt) {
  float edge = 1.0 - smoothstep(0.88, 1.08, radial);
  edge = pow(edge, 0.65);

  float tip = 1.0 - smoothstep(0.78, 1.02, y01);
  tip = pow(tip, 0.9);

  float body = mix(0.72, 1.0, smoothstep(0.04, 0.42, y01));
  float blueWeight = mix(1.0, 0.55, blueAmt * 0.7);
  float baseRound = smoothstep(0.0, 0.11, y01 + (1.0 - radial) * 0.09);

  return edge * tip * body * blueWeight * baseRound;
}

void main() {
  float y01 = vFlame.x;
  float radial = vFlame.y;

  float blueAmt;
  vec3 col = flamePalette(y01, radial, blueAmt);
  float weight = flameWeight(y01, radial, blueAmt);

  gl_FragColor = vec4(col * weight, weight);
}
`;

const coreFragmentShader = `
varying vec2 vFlame;

void main() {
  float y01 = vFlame.x;
  float radial = vFlame.y;

  float core = (1.0 - smoothstep(0.0, 0.55, radial));
  core *= smoothstep(0.08, 0.42, y01) * (1.0 - smoothstep(0.62, 0.95, y01));

  vec3 col = mix(vec3(1.0, 0.88, 0.45), vec3(1.0, 0.98, 0.92), core);
  float weight = core * 1.45;

  gl_FragColor = vec4(col * weight, weight);
}
`;

const glowFragmentShader = `
varying vec2 vFlame;

void main() {
  float y01 = vFlame.x;
  float radial = vFlame.y;

  float edge = 1.0 - smoothstep(0.32, 1.0, radial);
  edge = pow(edge, 1.1);

  vec3 col = vec3(1.0, 0.52, 0.12) * edge;
  col += vec3(0.2, 0.35, 1.0) * smoothstep(0.44, 0.0, y01) * edge * 0.35;

  float weight = edge * 0.72 * (1.0 - smoothstep(0.85, 1.0, y01));
  float baseRound = smoothstep(0.0, 0.12, y01 + (1.0 - radial) * 0.1);
  gl_FragColor = vec4(col * weight * baseRound, weight * baseRound);
}
`;

export type FlameMaterialKind = 'body' | 'core' | 'glow';

export function createFlameMaterial(kind: FlameMaterialKind = 'body'): THREE.ShaderMaterial {
  const fragment =
    kind === 'core' ? coreFragmentShader : kind === 'glow' ? glowFragmentShader : flameFragmentShader;

  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: flameVertexShader,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    lights: false,
    fog: false
  });
}

export function updateFlameMaterialCamera(_material: THREE.ShaderMaterial, _camera: THREE.Camera): void {}
