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
  clampShadowSamples,
  DEFAULT_SHADOW_RAY_SAMPLES,
  DEFAULT_SHADOW_SOFTNESS_RADIANS,
  shadowConeTanFromRadians,
  softShadowDiskStratified
} from './gpuSoftShadow';
import {
  buildVoxelRayTraceParams,
  GLOW_BLOOM_LINEAR_SCALE,
  GLASS_IOR,
  GLASS_MIN_TRANSMITTANCE,
  MAX_GLASS_DEPTH,
  R0_FRESNEL,
  SHADOW_SURFACE_EPS,
  type VoxelRayTraceParams,
  hexToLinearRgb
} from './voxelRayShared';

/** Shared cap for internal ray trace resolution (CPU progressive). */
export const RAY_TRACE_MAX_BUFFER_DIM = 1920;
const MAX_BUFFER_DIM = RAY_TRACE_MAX_BUFFER_DIM;
const STRIDES = [8, 4, 2, 1] as const;

/** Max main-thread time per `tick()` for CPU ray mode (ms). */
export const DEFAULT_RAY_TICK_BUDGET_MS = 12;
/** Check wall clock every N primary-ray blocks to stay within budget. */
const BUDGET_CHECK_INTERVAL_BLOCKS = 64;

function linearToSrgbByte(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
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

function configureRayDataTexture(tex: THREE.DataTexture): void {
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
}

function orthonormalTangentBasis(lx: number, ly: number, lz: number): {
  tx: number;
  ty: number;
  tz: number;
  bx: number;
  by: number;
  bz: number;
} {
  let hx = 0;
  let hy = 0;
  let hz = 1;
  if (Math.abs(lz) > 0.95) {
    hx = 1;
    hy = 0;
    hz = 0;
  }
  let tx = hy * lz - hz * ly;
  let ty = hz * lx - hx * lz;
  let tz = hx * ly - hy * lx;
  let tLen = Math.hypot(tx, ty, tz);
  if (tLen < 1e-8) {
    hx = 0;
    hy = 1;
    hz = 0;
    tx = hy * lz - hz * ly;
    ty = hz * lx - hx * lz;
    tz = hx * ly - hy * lx;
    tLen = Math.hypot(tx, ty, tz);
  }
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;
  const bx = ly * tz - lz * ty;
  const by = lz * tx - lx * tz;
  const bz = lx * ty - ly * tx;
  return { tx, ty, tz, bx, by, bz };
}

function jitteredLightDirection(
  lx: number,
  ly: number,
  lz: number,
  sampleIdx: number,
  nSamples: number,
  softnessRad: number
): [number, number, number] {
  const tanHalf = shadowConeTanFromRadians(softnessRad);
  const { radius, angle } = softShadowDiskStratified(sampleIdx, nSamples);
  const scale = tanHalf * radius;
  const { tx, ty, tz, bx, by, bz } = orthonormalTangentBasis(lx, ly, lz);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const ox = scale * (ca * tx + sa * bx);
  const oy = scale * (ca * ty + sa * by);
  const oz = scale * (ca * tz + sa * bz);
  const jx = lx + ox;
  const jy = ly + oy;
  const jz = lz + oz;
  const len = Math.hypot(jx, jy, jz);
  if (len < 1e-12) return [lx, ly, lz];
  return [jx / len, jy / len, jz / len];
}

/** Averaged glass-tinted shadow transmission (RGB) along jittered directions toward the light. */
function traceSoftShadowTransmission(
  ox: number,
  oy: number,
  oz: number,
  baseLx: number,
  baseLy: number,
  baseLz: number,
  params: VoxelRayTraceParams,
  voxels: Map<string, Voxel>,
  maxShadowDist: number
): [number, number, number] {
  const n = clampShadowSamples(params.shadowRaySamples);
  if (n <= 1) {
    return traceShadowRayDda(ox, oy, oz, baseLx, baseLy, baseLz, voxels, maxShadowDist);
  }
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let s = 0; s < n; s++) {
    const [jx, jy, jz] = jitteredLightDirection(
      baseLx,
      baseLy,
      baseLz,
      s,
      n,
      params.shadowSoftnessRadians
    );
    const [a, b, c] = traceShadowRayDda(ox, oy, oz, jx, jy, jz, voxels, maxShadowDist);
    sr += a;
    sg += b;
    sb += c;
  }
  const inv = 1 / n;
  return [sr * inv, sg * inv, sb * inv];
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
    [sr, sg, sb] = traceSoftShadowTransmission(
      ox,
      oy,
      oz,
      lx,
      ly,
      lz,
      params,
      voxels,
      maxShadowDist
    );
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
    [sr, sg, sb] = traceSoftShadowTransmission(
      ox,
      oy,
      oz,
      lx,
      ly,
      lz,
      params,
      voxels,
      maxShadowDist
    );
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
    configureRayDataTexture(this.texture);
    this.texture.needsUpdate = true;
    this.bloomTexture = new THREE.DataTexture(this.bloomData, 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.bloomTexture.colorSpace = THREE.LinearSRGBColorSpace;
    this.bloomTexture.flipY = true;
    configureRayDataTexture(this.bloomTexture);
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
      configureRayDataTexture(this.texture);
      this.texture.needsUpdate = true;
      this.bloomTexture.dispose();
      this.bloomTexture = new THREE.DataTexture(this.bloomData, bufW, bufH, THREE.RGBAFormat, THREE.FloatType);
      this.bloomTexture.colorSpace = THREE.LinearSRGBColorSpace;
      this.bloomTexture.flipY = true;
      configureRayDataTexture(this.bloomTexture);
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
