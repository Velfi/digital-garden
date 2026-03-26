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
uniform float fogThickness;
uniform float fogMode;
uniform vec3 planeNormal;
uniform float planeC;
uniform vec2 resolution;
uniform float fogSpatialMode;
uniform float planeSoft;

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
  float fogAmt;

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

  gl_FragColor = vec4(mix(base.rgb, fogColor, fogAmt), base.a);
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
    super.render(
      renderer,
      writeBuffer,
      readBuffer,
      deltaTime ?? 0,
      maskActive ?? false
    );
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
      fogThickness: { value: 28 },
      fogMode: { value: 1 },
      planeNormal: { value: new THREE.Vector3(0, 1, 0) },
      planeC: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      fogSpatialMode: { value: 0 },
      planeSoft: { value: 1 }
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
    super.render(
      renderer,
      writeBuffer,
      readBuffer,
      deltaTime ?? 0,
      maskActive ?? false
    );
  }
}

export function updatePlanarAtmosphereShaderUniforms(
  pass: ShaderPass,
  camera: THREE.Camera,
  opts: {
    fogColorHex: string;
    fogDensity: number;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
    width: number;
    height: number;
  }
): void {
  const u = pass.material.uniforms;
  u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
  u.cameraMatrixWorld.value.copy(camera.matrixWorld);
  u.fogColor.value.set(opts.fogColorHex);
  u.fogDensity.value = opts.fogDensity;
  u.fogThickness.value = opts.fogThickness;
  u.fogMode.value = opts.mode === 'slab' ? 0 : 1;
  u.planeNormal.value.set(opts.plane.nx, opts.plane.ny, opts.plane.nz);
  u.planeC.value = opts.plane.c;
  u.resolution.value.set(opts.width, opts.height);
  u.fogSpatialMode.value = opts.spatialMode === 'aerial' ? 1 : 0;
  u.planeSoft.value = atmospherePlaneSoftness(opts.fogThickness);
}
