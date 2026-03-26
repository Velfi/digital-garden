/**
 * WebGL post-processing: capture scene depth after RenderPass, planar fog ShaderPass.
 */
import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { atmospherePlaneSoftness } from '../atmosphereMath';

export type WebGLDepthStash = { texture: THREE.DepthTexture | null };

const PLANAR_FOG_VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PLANAR_FOG_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 cameraProjectionMatrixInverse;
uniform mat4 cameraMatrixWorld;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float fogEnabled;
uniform float fogThickness;
uniform float fogMode;
uniform vec3 planeNormal;
uniform float planeC;
uniform vec2 resolution;
uniform float fogSpatialMode;
uniform float planeSoft;
uniform float fogHeightBias;
uniform float fogHeightFalloff;
uniform float fogDriftEnabled;
uniform float fogDriftAmount;
uniform float fogDriftScale;
uniform float fogDriftSpeed;
uniform float timeSeconds;
uniform float distanceTintEnabled;
uniform vec3 distanceTintNearColor;
uniform vec3 distanceTintMidColor;
uniform vec3 distanceTintFarColor;
uniform float distanceTintNearDist;
uniform float distanceTintFarDist;
uniform float distanceTintStrength;
uniform float grainEnabled;
uniform float grainStrength;
uniform float grainAnimated;
uniform float grainSpeed;
uniform float sunShaftsEnabled;
uniform vec2 sunScreenUv;
uniform float sunShaftsStrength;
uniform float sunShaftsDecay;
uniform float sunShaftsDensity;
uniform float sunShaftsWeight;
uniform float sunShaftsSamples;

void main() {
  vec2 texUv = gl_FragCoord.xy / resolution;
  vec4 base = texture2D(tDiffuse, texUv);
  float depth = texture2D(tDepth, texUv).r;
  if (depth >= 1.0 - 1e-5) {
    gl_FragColor = base;
    return;
  }
  vec2 ndc = texUv * 2.0 - 1.0;
  vec4 clipVec = vec4(ndc.x, ndc.y, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = cameraProjectionMatrixInverse * clipVec;
  viewPos /= viewPos.w;

  float t = max(fogThickness, 1e-4);
  float fogAmt = 0.0;

  if (fogEnabled > 0.5) {
    if (fogSpatialMode > 0.5) {
      float vz = max(0.0, -viewPos.z);
      float aerial = 1.0 - exp(-vz / t);
      fogAmt = clamp(aerial * fogDensity, 0.0, 1.0);
    } else {
      vec4 worldPos = cameraMatrixWorld * vec4(viewPos.xyz, 1.0);
      vec3 p = worldPos.xyz;
      float sd = dot(planeNormal, p) + planeC;
      float fogShape;
      if (fogMode < 0.5) {
        float u = abs(sd) / t;
        fogShape = exp(-u * u);
      } else {
        float planeMask = smoothstep(-planeSoft, 0.0, sd);
        float h = max(0.0, sd);
        fogShape = planeMask * exp(-h / t);
      }
      fogAmt = clamp(fogShape * fogDensity, 0.0, 1.0);
    }
    vec4 worldPos = cameraMatrixWorld * vec4(viewPos.xyz, 1.0);
    float hBand = exp(-abs(worldPos.y - fogHeightBias) / max(1.0, fogHeightFalloff));
    fogAmt *= (0.65 + 0.35 * hBand);
    if (fogDriftEnabled > 0.5) {
      float driftNoise = sin((worldPos.x + worldPos.z) * fogDriftScale + timeSeconds * fogDriftSpeed);
      fogAmt = clamp(fogAmt + driftNoise * fogDriftAmount * fogDensity * 0.35, 0.0, 1.0);
    }
  }
  vec3 outRgb = mix(base.rgb, fogColor, fogAmt);
  float viewDist = max(0.0, -viewPos.z);
  if (distanceTintEnabled > 0.5) {
    float nearT = clamp(viewDist / max(0.001, distanceTintNearDist), 0.0, 1.0);
    float farSpan = max(1.0, distanceTintFarDist - distanceTintNearDist);
    float farT = clamp((viewDist - distanceTintNearDist) / farSpan, 0.0, 1.0);
    vec3 tintA = mix(distanceTintNearColor, distanceTintMidColor, nearT);
    vec3 tintB = mix(distanceTintMidColor, distanceTintFarColor, farT);
    vec3 tint = mix(tintA, tintB, farT);
    outRgb = mix(outRgb, tint, clamp(distanceTintStrength, 0.0, 1.0));
  }
  if (sunShaftsEnabled > 0.5) {
    vec2 toSun = sunScreenUv - texUv;
    float radial = max(0.0, 1.0 - length(toSun));
    float shafts = pow(radial, 2.0) * sunShaftsStrength * sunShaftsDecay * sunShaftsDensity * sunShaftsWeight;
    outRgb += shafts * fogColor;
  }
  if (grainEnabled > 0.5) {
    float t = grainAnimated > 0.5 ? timeSeconds * grainSpeed : 0.0;
    float n = fract(sin(dot(texUv + vec2(t, t * 1.91), vec2(12.9898, 78.233))) * 43758.5453);
    outRgb += (n - 0.5) * grainStrength;
  }

  gl_FragColor = vec4(outRgb, base.a);
}
`;

export class VoxelleSceneRenderPass extends RenderPass {
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly depthStash: WebGLDepthStash
  ) {
    super(scene, camera);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    maskActive?: boolean
  ): void {
    super.render(renderer, writeBuffer, readBuffer, deltaTime ?? 0, maskActive ?? false);
    /** RenderPass renders into `readBuffer` (three.js postprocessing convention). */
    this.depthStash.texture = readBuffer.depthTexture ?? null;
  }
}

function createPlanarFogShaderMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
      cameraMatrixWorld: { value: new THREE.Matrix4() },
      fogColor: { value: new THREE.Color(0xc8d4e0) },
      fogDensity: { value: 0.85 },
      fogEnabled: { value: 1 },
      fogThickness: { value: 28 },
      fogMode: { value: 1 },
      planeNormal: { value: new THREE.Vector3(0, 1, 0) },
      planeC: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      fogSpatialMode: { value: 0 },
      planeSoft: { value: 1 },
      fogHeightBias: { value: 0 },
      fogHeightFalloff: { value: 120 },
      fogDriftEnabled: { value: 0 },
      fogDriftAmount: { value: 0.2 },
      fogDriftScale: { value: 0.02 },
      fogDriftSpeed: { value: 0.2 },
      timeSeconds: { value: 0 },
      distanceTintEnabled: { value: 0 },
      distanceTintNearColor: { value: new THREE.Color(0xffffff) },
      distanceTintMidColor: { value: new THREE.Color(0xc8d4e0) },
      distanceTintFarColor: { value: new THREE.Color(0x8fa3bf) },
      distanceTintNearDist: { value: 16 },
      distanceTintFarDist: { value: 140 },
      distanceTintStrength: { value: 0.35 },
      grainEnabled: { value: 0 },
      grainStrength: { value: 0.06 },
      grainAnimated: { value: 1 },
      grainSpeed: { value: 1 },
      sunShaftsEnabled: { value: 0 },
      sunScreenUv: { value: new THREE.Vector2(0.5, 0.2) },
      sunShaftsStrength: { value: 0.35 },
      sunShaftsDecay: { value: 0.92 },
      sunShaftsDensity: { value: 0.8 },
      sunShaftsWeight: { value: 0.6 },
      sunShaftsSamples: { value: 18 }
    },
    vertexShader: PLANAR_FOG_VERTEX,
    fragmentShader: PLANAR_FOG_FRAGMENT
  });
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

/** Samples depth from `depthStash` each frame (after scene RenderPass updates it). */
export class StashingPlanarAtmospherePass extends ShaderPass {
  constructor(readonly depthStash: WebGLDepthStash) {
    super(createPlanarFogShaderMaterial());
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    maskActive?: boolean
  ): void {
    const u = this.material.uniforms;
    if (u.tDepth) u.tDepth.value = this.depthStash.texture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime ?? 0, maskActive ?? false);
  }
}

const DISTANCE_TINT_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 cameraProjectionMatrixInverse;
uniform vec2 resolution;
uniform float enabled;
uniform vec3 nearColor;
uniform vec3 midColor;
uniform vec3 farColor;
uniform float nearDist;
uniform float farDist;
uniform float strength;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 base = texture2D(tDiffuse, uv);
  float depth = texture2D(tDepth, uv).r;
  if (enabled < 0.5 || depth >= 1.0 - 1e-5) {
    gl_FragColor = base;
    return;
  }
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clipVec = vec4(ndc.x, ndc.y, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = cameraProjectionMatrixInverse * clipVec;
  viewPos /= viewPos.w;
  float viewDist = max(0.0, -viewPos.z);
  float nearT = clamp(viewDist / max(0.001, nearDist), 0.0, 1.0);
  float farSpan = max(1.0, farDist - nearDist);
  float farT = clamp((viewDist - nearDist) / farSpan, 0.0, 1.0);
  vec3 tintA = mix(nearColor, midColor, nearT);
  vec3 tintB = mix(midColor, farColor, farT);
  vec3 tint = mix(tintA, tintB, farT);
  gl_FragColor = vec4(mix(base.rgb, tint, clamp(strength, 0.0, 1.0)), base.a);
}
`;

const SUN_SHAFTS_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float enabled;
uniform vec2 sunScreenUv;
uniform vec3 shaftColor;
uniform float shaftStrength;
uniform float shaftDecay;
uniform float shaftDensity;
uniform float shaftWeight;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 base = texture2D(tDiffuse, uv);
  if (enabled < 0.5) {
    gl_FragColor = base;
    return;
  }
  vec2 toSun = sunScreenUv - uv;
  float dist = max(1e-4, length(toSun));
  vec2 dir = toSun / dist;
  vec2 stepUv = dir * (0.08 * shaftDensity);
  vec3 accum = vec3(0.0);
  float decay = 1.0;
  vec2 sampleUv = uv;
  for (int i = 0; i < 12; i++) {
    sampleUv += stepUv;
    vec3 c = texture2D(tDiffuse, sampleUv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    accum += shaftColor * luma * decay * shaftWeight;
    decay *= shaftDecay;
  }
  float radial = exp(-dist * 2.4);
  float intensity = shaftStrength * (0.2 + 0.8 * radial);
  gl_FragColor = vec4(base.rgb + accum * intensity * 0.12, base.a);
}
`;

const GRAIN_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float enabled;
uniform float grainStrength;
uniform float grainAnimated;
uniform float grainSpeed;
uniform float timeSeconds;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 base = texture2D(tDiffuse, uv);
  if (enabled < 0.5 || grainStrength <= 0.0) {
    gl_FragColor = base;
    return;
  }
  float t = grainAnimated > 0.5 ? timeSeconds * grainSpeed : 0.0;
  vec2 p = uv * resolution + vec2(t * 37.0, t * 71.0);
  float n1 = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(p + vec2(19.19, 73.73), vec2(93.9898, 67.345))) * 24634.6345);
  float n3 = fract(sin(dot(p + vec2(47.77, 11.13), vec2(27.123, 98.456))) * 56445.2345);
  vec3 noise = vec3(n1, n2, n3) - 0.5;
  float luminance = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  float visibility = mix(0.45, 1.0, smoothstep(0.1, 0.9, luminance));
  gl_FragColor = vec4(base.rgb + noise * grainStrength * visibility, base.a);
}
`;

function createFullScreenMaterial(
  fragmentShader: string,
  uniforms: Record<string, { value: unknown }>
) {
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PLANAR_FOG_VERTEX,
    fragmentShader
  });
  m.depthTest = false;
  m.depthWrite = false;
  return m;
}

export class StashingDistanceTintPass extends ShaderPass {
  constructor(readonly depthStash: WebGLDepthStash) {
    super(
      createFullScreenMaterial(DISTANCE_TINT_FRAGMENT, {
        tDiffuse: { value: null },
        tDepth: { value: null },
        cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
        resolution: { value: new THREE.Vector2(1, 1) },
        enabled: { value: 0 },
        nearColor: { value: new THREE.Color(0xffffff) },
        midColor: { value: new THREE.Color(0xc8d4e0) },
        farColor: { value: new THREE.Color(0x8fa3bf) },
        nearDist: { value: 16 },
        farDist: { value: 140 },
        strength: { value: 0.6 }
      })
    );
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    maskActive?: boolean
  ): void {
    const u = this.material.uniforms;
    if (u.tDepth) u.tDepth.value = this.depthStash.texture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime ?? 0, maskActive ?? false);
  }
}

export class SunShaftsPass extends ShaderPass {
  constructor() {
    super(
      createFullScreenMaterial(SUN_SHAFTS_FRAGMENT, {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        enabled: { value: 0 },
        sunScreenUv: { value: new THREE.Vector2(0.5, 0.2) },
        shaftColor: { value: new THREE.Color(0xc8d4e0) },
        shaftStrength: { value: 0.7 },
        shaftDecay: { value: 0.92 },
        shaftDensity: { value: 0.8 },
        shaftWeight: { value: 0.6 }
      })
    );
  }
}

export class GrainPass extends ShaderPass {
  constructor() {
    super(
      createFullScreenMaterial(GRAIN_FRAGMENT, {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        enabled: { value: 0 },
        grainStrength: { value: 0.12 },
        grainAnimated: { value: 1 },
        grainSpeed: { value: 1 },
        timeSeconds: { value: 0 }
      })
    );
  }
}

export function updatePlanarAtmosphereShaderUniforms(
  pass: ShaderPass,
  camera: THREE.Camera,
  opts: {
    fogColorHex: string;
    fogDensity: number;
    fogEnabled: boolean;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
    fogHeightBias: number;
    fogHeightFalloff: number;
    fogDriftEnabled: boolean;
    fogDriftAmount: number;
    fogDriftScale: number;
    fogDriftSpeed: number;
    timeSeconds: number;
    distanceTintEnabled: boolean;
    distanceTintNearColorHex: string;
    distanceTintMidColorHex: string;
    distanceTintFarColorHex: string;
    distanceTintNearDist: number;
    distanceTintFarDist: number;
    distanceTintStrength: number;
    grainEnabled: boolean;
    grainStrength: number;
    grainAnimated: boolean;
    grainSpeed: number;
    sunShaftsEnabled: boolean;
    sunScreenUv: { x: number; y: number };
    sunShaftsStrength: number;
    sunShaftsDecay: number;
    sunShaftsDensity: number;
    sunShaftsWeight: number;
    sunShaftsSamples: number;
    width: number;
    height: number;
  }
): void {
  const u = pass.material.uniforms;
  u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
  u.cameraMatrixWorld.value.copy(camera.matrixWorld);
  u.fogColor.value.set(opts.fogColorHex);
  u.fogDensity.value = opts.fogDensity;
  u.fogEnabled.value = opts.fogEnabled ? 1 : 0;
  u.fogThickness.value = opts.fogThickness;
  u.fogMode.value = opts.mode === 'slab' ? 0 : 1;
  u.planeNormal.value.set(opts.plane.nx, opts.plane.ny, opts.plane.nz);
  u.planeC.value = opts.plane.c;
  u.resolution.value.set(opts.width, opts.height);
  u.fogSpatialMode.value = opts.spatialMode === 'aerial' ? 1 : 0;
  u.planeSoft.value = atmospherePlaneSoftness(opts.fogThickness);
  u.fogHeightBias.value = opts.fogHeightBias;
  u.fogHeightFalloff.value = Math.max(1, opts.fogHeightFalloff);
  u.fogDriftEnabled.value = opts.fogDriftEnabled ? 1 : 0;
  u.fogDriftAmount.value = opts.fogDriftAmount;
  u.fogDriftScale.value = opts.fogDriftScale;
  u.fogDriftSpeed.value = opts.fogDriftSpeed;
  u.timeSeconds.value = opts.timeSeconds;
  u.distanceTintEnabled.value = opts.distanceTintEnabled ? 1 : 0;
  u.distanceTintNearColor.value.set(opts.distanceTintNearColorHex);
  u.distanceTintMidColor.value.set(opts.distanceTintMidColorHex);
  u.distanceTintFarColor.value.set(opts.distanceTintFarColorHex);
  u.distanceTintNearDist.value = opts.distanceTintNearDist;
  u.distanceTintFarDist.value = opts.distanceTintFarDist;
  u.distanceTintStrength.value = opts.distanceTintStrength;
  u.grainEnabled.value = opts.grainEnabled ? 1 : 0;
  u.grainStrength.value = opts.grainStrength;
  u.grainAnimated.value = opts.grainAnimated ? 1 : 0;
  u.grainSpeed.value = opts.grainSpeed;
  u.sunShaftsEnabled.value = opts.sunShaftsEnabled ? 1 : 0;
  u.sunScreenUv.value.set(opts.sunScreenUv.x, opts.sunScreenUv.y);
  u.sunShaftsStrength.value = opts.sunShaftsStrength;
  u.sunShaftsDecay.value = opts.sunShaftsDecay;
  u.sunShaftsDensity.value = opts.sunShaftsDensity;
  u.sunShaftsWeight.value = opts.sunShaftsWeight;
  u.sunShaftsSamples.value = opts.sunShaftsSamples;
}

export function updateDistanceTintPassUniforms(
  pass: ShaderPass,
  camera: THREE.Camera,
  opts: {
    enabled: boolean;
    nearColorHex: string;
    midColorHex: string;
    farColorHex: string;
    nearDist: number;
    farDist: number;
    strength: number;
    width: number;
    height: number;
  }
): void {
  const u = pass.material.uniforms;
  u.enabled.value = opts.enabled ? 1 : 0;
  u.nearColor.value.set(opts.nearColorHex);
  u.midColor.value.set(opts.midColorHex);
  u.farColor.value.set(opts.farColorHex);
  const nearDist = Math.max(0.001, opts.nearDist);
  const farDist = Math.max(nearDist + 1, opts.farDist);
  u.nearDist.value = nearDist;
  u.farDist.value = farDist;
  u.strength.value = opts.strength;
  u.resolution.value.set(opts.width, opts.height);
  u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
}

export function updateSunShaftsPassUniforms(
  pass: ShaderPass,
  opts: {
    enabled: boolean;
    colorHex: string;
    sunScreenUv: { x: number; y: number };
    strength: number;
    decay: number;
    density: number;
    weight: number;
    width: number;
    height: number;
  }
): void {
  const u = pass.material.uniforms;
  u.enabled.value = opts.enabled ? 1 : 0;
  u.shaftColor.value.set(opts.colorHex);
  u.sunScreenUv.value.set(opts.sunScreenUv.x, opts.sunScreenUv.y);
  u.shaftStrength.value = opts.strength;
  u.shaftDecay.value = opts.decay;
  u.shaftDensity.value = opts.density;
  u.shaftWeight.value = opts.weight;
  u.resolution.value.set(opts.width, opts.height);
}

export function updateGrainPassUniforms(
  pass: ShaderPass,
  opts: {
    enabled: boolean;
    strength: number;
    animated: boolean;
    speed: number;
    timeSeconds: number;
    width: number;
    height: number;
  }
): void {
  const u = pass.material.uniforms;
  u.enabled.value = opts.enabled ? 1 : 0;
  u.grainStrength.value = opts.strength;
  u.grainAnimated.value = opts.animated ? 1 : 0;
  u.grainSpeed.value = opts.speed;
  u.timeSeconds.value = opts.timeSeconds;
  u.resolution.value.set(opts.width, opts.height);
}
