/**
 * CPU voxel ray trace into a DataTexture with coarse-to-fine progressive refinement.
 * Lambert + ambient; metal specular; glass transmission + Fresnel; shadow rays (glass-tinted);
 * glow emissive + float bloom source texture.
 */
import * as THREE from 'three';
import type { Voxel } from '../voxelMaterial';
import {
  distToExitUnitCell,
  GLASS_ABSORPTION_PER_UNIT,
  maxRayDistanceForVoxels,
  traceRayDda,
  traceShadowRayDda
} from './voxelRayDda';
import {
  DEFAULT_SHADOW_RAY_SAMPLES,
  DEFAULT_SHADOW_SOFTNESS_RADIANS
} from './gpuSoftShadow';

/** Shared cap for internal ray trace resolution (CPU progressive + WebGPU compute). */
export const RAY_TRACE_MAX_BUFFER_DIM = 1920;
const MAX_BUFFER_DIM = RAY_TRACE_MAX_BUFFER_DIM;
const STRIDES = [8, 4, 2, 1] as const;

/** Max main-thread time per `tick()` for CPU ray mode (ms). */
export const DEFAULT_RAY_TICK_BUDGET_MS = 8;
/** Check wall clock every N primary-ray blocks to stay within budget. */
const BUDGET_CHECK_INTERVAL_BLOCKS = 64;

const MAX_GLASS_DEPTH = 4;
const GLASS_MIN_TRANSMITTANCE = 0.35;
const GLASS_IOR = 1.5;
const R0_FRESNEL = Math.pow((1 - GLASS_IOR) / (1 + GLASS_IOR), 2);
const SHADOW_SURFACE_EPS = 2e-4;
/** Bloom source: scale glow emissive so float linear values cross typical bloom thresholds. */
const GLOW_BLOOM_LINEAR_SCALE = 2.8;

export type VoxelRayTraceParams = {
  /** Unit vector from surface toward the directional light (world). */
  toLightWorld: [number, number, number];
  sunDiffuseR: number;
  sunDiffuseG: number;
  sunDiffuseB: number;
  ambientR: number;
  ambientG: number;
  ambientB: number;
  backgroundR: number;
  backgroundG: number;
  backgroundB: number;
  enableSky: boolean;
  enableShadows: boolean;
  /**
   * WebGPU soft shadows: shadow rays toward the sun per shaded hit (1 = hard shadow).
   * CPU progressive path ignores this.
   */
  shadowRaySamples: number;
  /** Cone half-angle (radians) for jittering shadow rays toward the light. */
  shadowSoftnessRadians: number;
};

function hexToLinearRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

function linearToSrgbByte(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

export function buildVoxelRayTraceParams(
  dirLight: THREE.DirectionalLight,
  hemisphereLight: THREE.HemisphereLight,
  opts: {
    enableSky: boolean;
    backgroundHex: number;
    ambientIntensity: number;
    sceneEnvironmentIntensity: number;
    enableShadows: boolean;
  }
): VoxelRayTraceParams {
  const lightPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  dirLight.getWorldPosition(lightPos);
  dirLight.target.getWorldPosition(targetPos);
  const toLight = lightPos.sub(targetPos);
  if (toLight.lengthSq() < 1e-12) toLight.set(0.3, 1, 0.2);
  toLight.normalize();
  const toLightWorld: [number, number, number] = [toLight.x, toLight.y, toLight.z];

  const sun = dirLight.color;
  const sunMul = dirLight.intensity;
  const ambSky = hemisphereLight.color;
  const ambGr = hemisphereLight.groundColor;
  const ambI = hemisphereLight.intensity * opts.ambientIntensity;
  const env = opts.sceneEnvironmentIntensity;
  const ambientR = ((ambSky.r + ambGr.r) * 0.5) * ambI * env;
  const ambientG = ((ambSky.g + ambGr.g) * 0.5) * ambI * env;
  const ambientB = ((ambSky.b + ambGr.b) * 0.5) * ambI * env;

  const [br, bg, bb] = hexToLinearRgb(opts.backgroundHex & 0xffffff);

  return {
    toLightWorld,
    sunDiffuseR: sun.r * sunMul,
    sunDiffuseG: sun.g * sunMul,
    sunDiffuseB: sun.b * sunMul,
    ambientR,
    ambientG,
    ambientB,
    backgroundR: br,
    backgroundG: bg,
    backgroundB: bb,
    enableSky: opts.enableSky,
    enableShadows: opts.enableShadows,
    shadowRaySamples: DEFAULT_SHADOW_RAY_SAMPLES,
    shadowSoftnessRadians: DEFAULT_SHADOW_SOFTNESS_RADIANS
  };
}

function shadeMiss(
  params: VoxelRayTraceParams,
  screenV: number,
  bufH: number
): [number, number, number] {
  if (!params.enableSky) {
    return [params.backgroundR, params.backgroundG, params.backgroundB];
  }
  const t = Math.max(0, Math.min(1, screenV / Math.max(1, bufH - 1)));
  const sky = hexToLinearRgb(0x9ec8f0);
  const ground = hexToLinearRgb(0x4a5568);
  const g = t;
  return [
    sky[0] * (1 - g) + ground[0] * g,
    sky[1] * (1 - g) + ground[1] * g,
    sky[2] * (1 - g) + ground[2] * g
  ];
}

function envReflectApprox(
  params: VoxelRayTraceParams,
  screenV: number,
  bufH: number
): [number, number, number] {
  const m = shadeMiss(params, screenV, bufH);
  return [
    m[0] * 0.82 + params.ambientR * 0.18,
    m[1] * 0.82 + params.ambientG * 0.18,
    m[2] * 0.82 + params.ambientB * 0.18
  ];
}

function schlickReflectance(cosI: number): number {
  const c = Math.max(0, Math.min(1, cosI));
  return R0_FRESNEL + (1 - R0_FRESNEL) * Math.pow(1 - c, 5);
}

function shadeOpaqueSurface(
  voxel: Voxel,
  faceNormal: [number, number, number],
  rayDir: [number, number, number],
  hitPoint: [number, number, number],
  params: VoxelRayTraceParams,
  voxels: Map<string, Voxel>,
  maxShadowDist: number
): { rgb: [number, number, number]; bloom: [number, number, number] } {
  const [nx, ny, nz] = faceNormal;
  const [vx, vy, vz] = rayDir;
  const [lx, ly, lz] = params.toLightWorld;
  const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
  const [cr, cg, cb] = hexToLinearRgb(voxel.color & 0xffffff);

  let sr = 1;
  let sg = 1;
  let sb = 1;
  if (params.enableShadows) {
    const [hx, hy, hz] = hitPoint;
    const ox = hx + nx * SHADOW_SURFACE_EPS;
    const oy = hy + ny * SHADOW_SURFACE_EPS;
    const oz = hz + nz * SHADOW_SURFACE_EPS;
    [sr, sg, sb] = traceShadowRayDda(ox, oy, oz, lx, ly, lz, voxels, maxShadowDist);
  }

  let dr = cr * params.ambientR + cr * params.sunDiffuseR * ndotl * sr;
  let dg = cg * params.ambientG + cg * params.sunDiffuseG * ndotl * sg;
  let db = cb * params.ambientB + cb * params.sunDiffuseB * ndotl * sb;

  let bloomR = 0;
  let bloomG = 0;
  let bloomB = 0;

  if (voxel.material === 'metal') {
    const hx = -vx;
    const hy = -vy;
    const hz = -vz;
    const reflL = 2 * ndotl * nx - lx;
    const reflM = 2 * ndotl * ny - ly;
    const reflN = 2 * ndotl * nz - lz;
    const spec = Math.max(0, hx * reflL + hy * reflM + hz * reflN);
    const sp = Math.pow(spec, 48) * 0.45;
    dr += sp * (params.sunDiffuseR + 0.2) * sr;
    dg += sp * (params.sunDiffuseG + 0.2) * sg;
    db += sp * (params.sunDiffuseB + 0.2) * sb;
  } else if (voxel.material === 'glow') {
    const [gr, gg, gb] = hexToLinearRgb(voxel.color & 0xffffff);
    const addR = gr * 0.85;
    const addG = gg * 0.85;
    const addB = gb * 0.85;
    dr += addR;
    dg += addG;
    db += addB;
    bloomR = addR * GLOW_BLOOM_LINEAR_SCALE;
    bloomG = addG * GLOW_BLOOM_LINEAR_SCALE;
    bloomB = addB * GLOW_BLOOM_LINEAR_SCALE;
  }

  return { rgb: [dr, dg, db], bloom: [bloomR, bloomG, bloomB] };
}

function shadeGlassFallback(
  voxel: Voxel,
  faceNormal: [number, number, number],
  _rayDir: [number, number, number],
  params: VoxelRayTraceParams,
  hitPoint: [number, number, number],
  voxels: Map<string, Voxel>,
  maxShadowDist: number
): { rgb: [number, number, number]; bloom: [number, number, number] } {
  const [nx, ny, nz] = faceNormal;
  const [lx, ly, lz] = params.toLightWorld;
  const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
  const [cr, cg, cb] = hexToLinearRgb(voxel.color & 0xffffff);

  let sr = 1;
  let sg = 1;
  let sb = 1;
  if (params.enableShadows) {
    const [hx, hy, hz] = hitPoint;
    const ox = hx + nx * SHADOW_SURFACE_EPS;
    const oy = hy + ny * SHADOW_SURFACE_EPS;
    const oz = hz + nz * SHADOW_SURFACE_EPS;
    [sr, sg, sb] = traceShadowRayDda(ox, oy, oz, lx, ly, lz, voxels, maxShadowDist);
  }

  let dr = cr * params.ambientR + cr * params.sunDiffuseR * ndotl * sr;
  let dg = cg * params.ambientG + cg * params.sunDiffuseG * ndotl * sg;
  let db = cb * params.ambientB + cb * params.sunDiffuseB * ndotl * sb;
  dr = dr * 0.65 + params.backgroundR * 0.35;
  dg = dg * 0.65 + params.backgroundG * 0.35;
  db = db * 0.65 + params.backgroundB * 0.35;
  return { rgb: [dr, dg, db], bloom: [0, 0, 0] };
}

function traceAndShade(
  ox: number,
  oy: number,
  oz: number,
  rdx: number,
  rdy: number,
  rdz: number,
  voxels: Map<string, Voxel>,
  maxDist: number,
  maxShadowDist: number,
  params: VoxelRayTraceParams,
  screenV: number,
  bufH: number
): { rgb: [number, number, number]; bloom: [number, number, number] } {
  let oox = ox;
  let ooy = oy;
  let ooz = oz;
  let rem = maxDist;
  let glassDepth = 0;

  let accR = 0;
  let accG = 0;
  let accB = 0;
  let tr = 1;
  let tg = 1;
  let tb = 1;

  while (glassDepth < MAX_GLASS_DEPTH) {
    const hit = traceRayDda(oox, ooy, ooz, rdx, rdy, rdz, voxels, rem);
    if (!hit) {
      const miss = shadeMiss(params, screenV, bufH);
      return {
        rgb: [accR + tr * miss[0], accG + tg * miss[1], accB + tb * miss[2]],
        bloom: [0, 0, 0]
      };
    }

    const [ix, iy, iz] = hit.cell;
    const px = oox + rdx * hit.t;
    const py = ooy + rdy * hit.t;
    const pz = ooz + rdz * hit.t;

    if (hit.voxel.material !== 'glass') {
      const surf = shadeOpaqueSurface(
        hit.voxel,
        hit.faceNormal,
        [rdx, rdy, rdz],
        [px, py, pz],
        params,
        voxels,
        maxShadowDist
      );
      return {
        rgb: [
          accR + tr * surf.rgb[0],
          accG + tg * surf.rgb[1],
          accB + tb * surf.rgb[2]
        ],
        bloom: [tr * surf.bloom[0], tg * surf.bloom[1], tb * surf.bloom[2]]
      };
    }

    /** 4th glass interface: no deeper transmission in this stack. */
    if (glassDepth >= MAX_GLASS_DEPTH - 1) {
      const fb = shadeGlassFallback(
        hit.voxel,
        hit.faceNormal,
        [rdx, rdy, rdz],
        params,
        [px, py, pz],
        voxels,
        maxShadowDist
      );
      return {
        rgb: [accR + tr * fb.rgb[0], accG + tg * fb.rgb[1], accB + tb * fb.rgb[2]],
        bloom: [tr * fb.bloom[0], tg * fb.bloom[1], tb * fb.bloom[2]]
      };
    }

    const [nx, ny, nz] = hit.faceNormal;
    const cosI = Math.max(0, -(nx * rdx + ny * rdy + nz * rdz));
    const R = schlickReflectance(cosI);
    const T = 1 - R;
    const refl = envReflectApprox(params, screenV, bufH);
    accR += tr * R * refl[0];
    accG += tg * R * refl[1];
    accB += tb * R * refl[2];

    const tThrough = distToExitUnitCell(px, py, pz, rdx, rdy, rdz, ix, iy, iz);
    const att = Math.max(GLASS_MIN_TRANSMITTANCE, Math.exp(-GLASS_ABSORPTION_PER_UNIT * tThrough));
    const [gcr, gcg, gcb] = hexToLinearRgb(hit.voxel.color & 0xffffff);

    tr *= T * att * gcr;
    tg *= T * att * gcg;
    tb *= T * att * gcb;

    const step = hit.t + tThrough + SHADOW_SURFACE_EPS;
    oox += rdx * step;
    ooy += rdy * step;
    ooz += rdz * step;
    rem -= step;
    glassDepth++;
    if (rem < 1e-6) {
      const miss = shadeMiss(params, screenV, bufH);
      return {
        rgb: [accR + tr * miss[0], accG + tg * miss[1], accB + tb * miss[2]],
        bloom: [0, 0, 0]
      };
    }
  }

  {
    const miss = shadeMiss(params, screenV, bufH);
    return {
      rgb: [accR + tr * miss[0], accG + tg * miss[1], accB + tb * miss[2]],
      bloom: [0, 0, 0]
    };
  }
}

function setBlock(
  data: Uint8ClampedArray,
  bufW: number,
  bufH: number,
  u0: number,
  v0: number,
  bw: number,
  bh: number,
  lr: number,
  lg: number,
  lb: number
) {
  const r8 = linearToSrgbByte(lr);
  const g8 = linearToSrgbByte(lg);
  const b8 = linearToSrgbByte(lb);
  const u1 = Math.min(u0 + bw, bufW);
  const v1 = Math.min(v0 + bh, bufH);
  for (let v = v0; v < v1; v++) {
    let o = (v * bufW + u0) * 4;
    for (let u = u0; u < u1; u++) {
      data[o] = r8;
      data[o + 1] = g8;
      data[o + 2] = b8;
      data[o + 3] = 255;
      o += 4;
    }
  }
}

function setBloomBlock(
  data: Float32Array,
  bufW: number,
  bufH: number,
  u0: number,
  v0: number,
  bw: number,
  bh: number,
  br: number,
  bg: number,
  bb: number
) {
  const u1 = Math.min(u0 + bw, bufW);
  const v1 = Math.min(v0 + bh, bufH);
  for (let v = v0; v < v1; v++) {
    let o = (v * bufW + u0) * 4;
    for (let u = u0; u < u1; u++) {
      data[o] = br;
      data[o + 1] = bg;
      data[o + 2] = bb;
      data[o + 3] = 1;
      o += 4;
    }
  }
}

export class VoxelRayProgressive {
  texture: THREE.DataTexture;
  /** Linear float RGB for glow-only bloom source (same resolution as `texture`). */
  bloomTexture: THREE.DataTexture;
  private data: Uint8ClampedArray;
  private bloomData: Float32Array;
  private bufW = 1;
  private bufH = 1;
  private strideIdx = 0;
  private converged = false;
  /** Next block origin (u,v) within current stride pass; multiples of stride. */
  private resumeU = 0;
  private resumeV = 0;
  /** Blocks finished in the current stride pass (for progress + resume). */
  private completedBlocksThisStride = 0;
  /** Total primary-ray blocks in current stride pass (bufW/s × bufH/s). */
  private totalBlocksThisStride = 1;
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayFar = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();

  constructor() {
    this.data = new Uint8ClampedArray(4);
    this.bloomData = new Float32Array(4);
    this.texture = new THREE.DataTexture(this.data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = true;
    this.texture.needsUpdate = true;
    this.bloomTexture = new THREE.DataTexture(this.bloomData, 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.bloomTexture.colorSpace = THREE.LinearSRGBColorSpace;
    this.bloomTexture.flipY = true;
    this.bloomTexture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.bloomTexture.dispose();
  }

  /** 0..1 coarse-to-fine refinement; 1 when converged (full-res pass done). */
  getRefinementProgress(): number {
    if (this.converged) return 1;
    const strideFrac =
      this.totalBlocksThisStride > 0 ? this.completedBlocksThisStride / this.totalBlocksThisStride : 0;
    return Math.min(1, (this.strideIdx + strideFrac) / STRIDES.length);
  }

  private setRayFromPixel(camera: THREE.Camera, u: number, v: number): void {
    const bufW = this.bufW;
    const bufH = this.bufH;
    const nx = ((u + 0.5) / bufW) * 2 - 1;
    const ny = -(((v + 0.5) / bufH) * 2 - 1);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      this.rayOrigin.setFromMatrixPosition(cam.matrixWorld);
      /** Match `Raycaster.setFromCamera`: NDC z must be 0.5, not 1, or directions miss the scene. */
      this.rayFar.set(nx, ny, 0.5).unproject(cam);
      this.rayDir.copy(this.rayFar).sub(this.rayOrigin).normalize();
    } else {
      const cam = camera as THREE.OrthographicCamera;
      this.rayOrigin
        .set(nx, ny, (cam.near + cam.far) / (cam.near - cam.far))
        .unproject(cam);
      this.rayDir.set(0, 0, -1).transformDirection(cam.matrixWorld);
    }
  }

  tick(
    _delta: number,
    width: number,
    height: number,
    dpr: number,
    voxels: Map<string, Voxel>,
    params: VoxelRayTraceParams,
    fullInvalidated: boolean,
    camera: THREE.Camera,
    budgetMs: number = DEFAULT_RAY_TICK_BUDGET_MS
  ): void {
    let bufW = Math.max(1, Math.round(width * dpr));
    let bufH = Math.max(1, Math.round(height * dpr));
    const m = Math.max(bufW, bufH);
    if (m > MAX_BUFFER_DIM) {
      const s = MAX_BUFFER_DIM / m;
      bufW = Math.max(1, Math.round(bufW * s));
      bufH = Math.max(1, Math.round(bufH * s));
    }

    if (bufW !== this.bufW || bufH !== this.bufH) {
      this.bufW = bufW;
      this.bufH = bufH;
      this.data = new Uint8ClampedArray(bufW * bufH * 4);
      this.bloomData = new Float32Array(bufW * bufH * 4);
      this.texture.dispose();
      this.texture = new THREE.DataTexture(this.data, bufW, bufH, THREE.RGBAFormat, THREE.UnsignedByteType);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.flipY = true;
      this.texture.needsUpdate = true;
      this.bloomTexture.dispose();
      this.bloomTexture = new THREE.DataTexture(this.bloomData, bufW, bufH, THREE.RGBAFormat, THREE.FloatType);
      this.bloomTexture.colorSpace = THREE.LinearSRGBColorSpace;
      this.bloomTexture.flipY = true;
      this.bloomTexture.needsUpdate = true;
      this.strideIdx = 0;
      this.converged = false;
      this.resumeU = 0;
      this.resumeV = 0;
      this.completedBlocksThisStride = 0;
    }

    if (fullInvalidated) {
      this.strideIdx = 0;
      this.converged = false;
      this.resumeU = 0;
      this.resumeV = 0;
      this.completedBlocksThisStride = 0;
    } else if (this.converged) {
      return;
    }

    const stride = STRIDES[Math.min(this.strideIdx, STRIDES.length - 1)]!;
    const maxDist = maxRayDistanceForVoxels(voxels);
    const maxShadowDist = maxDist;

    const blocksW = Math.ceil(bufW / stride);
    const blocksH = Math.ceil(bufH / stride);
    this.totalBlocksThisStride = Math.max(1, blocksW * blocksH);

    const effectiveBudget =
      Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : DEFAULT_RAY_TICK_BUDGET_MS;
    const deadline = performance.now() + effectiveBudget;
    let blocksSinceCheck = 0;

    for (let v = this.resumeV; v < bufH; v += stride) {
      const uStart = v === this.resumeV ? this.resumeU : 0;
      for (let u = uStart; u < bufW; u += stride) {
        this.setRayFromPixel(camera, u, v);
        const ox = this.rayOrigin.x;
        const oy = this.rayOrigin.y;
        const oz = this.rayOrigin.z;
        const dx = this.rayDir.x;
        const dy = this.rayDir.y;
        const dz = this.rayDir.z;
        const { rgb, bloom } = traceAndShade(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          voxels,
          maxDist,
          maxShadowDist,
          params,
          v,
          bufH
        );
        const [lr, lg, lb] = rgb;
        const [br, bg, bb] = bloom;
        const bw = Math.min(stride, bufW - u);
        const bh = Math.min(stride, bufH - v);
        setBlock(this.data, bufW, bufH, u, v, bw, bh, lr, lg, lb);
        setBloomBlock(this.bloomData, bufW, bufH, u, v, bw, bh, br, bg, bb);

        this.completedBlocksThisStride++;

        let uNext = u + stride;
        let vNext = v;
        if (uNext >= bufW) {
          uNext = 0;
          vNext = v + stride;
        }

        blocksSinceCheck++;
        if (blocksSinceCheck >= BUDGET_CHECK_INTERVAL_BLOCKS) {
          blocksSinceCheck = 0;
          const moreWork = vNext < bufH;
          if (moreWork && performance.now() >= deadline) {
            this.resumeU = uNext;
            this.resumeV = vNext;
            this.texture.needsUpdate = true;
            this.bloomTexture.needsUpdate = true;
            return;
          }
        }
      }
    }

    this.resumeU = 0;
    this.resumeV = 0;
    this.completedBlocksThisStride = 0;

    if (this.strideIdx < STRIDES.length - 1) {
      this.strideIdx++;
    } else {
      this.converged = true;
    }

    this.texture.needsUpdate = true;
    this.bloomTexture.needsUpdate = true;
  }
}
