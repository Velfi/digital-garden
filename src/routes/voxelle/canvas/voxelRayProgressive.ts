/**
 * CPU voxel ray trace into a DataTexture with coarse-to-fine progressive refinement.
 * Lambert + ambient; metal specular; glass transmission + Fresnel; shadow rays (glass-tinted);
 * glow emissive + float bloom source texture.
 */
import * as THREE from 'three';
import type { Voxel } from '../voxelMaterial';
import type { GpuVoxelAccel } from './gpuVoxelAccel';
import {
  distToExitUnitCell,
  GLASS_ABSORPTION_PER_UNIT,
  lookupVoxelAccel,
  maxRayDistanceForVoxels,
  traceRayDda,
  traceShadowRayDda
} from './voxelRayDda';
import {
  clampShadowSamples,
  shadowConeTanFromRadians,
  softShadowDiskStratified
} from './gpuSoftShadow';
import {
  GLOW_BLOOM_LINEAR_SCALE,
  GLASS_IOR,
  GLASS_MIN_TRANSMITTANCE,
  MAX_GLASS_DEPTH,
  MAX_TEMPORAL_SAMPLES,
  SHADOW_SURFACE_EPS,
  WATER_IOR,
  fresnelSchlickReflectance,
  type VoxelRayTraceParams,
  hexToLinearRgb
} from './voxelRayShared';

/** Shared cap for internal ray trace resolution (CPU progressive). */
export const RAY_TRACE_MAX_BUFFER_DIM = 1920;

/** Optional CPU progressive tuning (preferences). */
export type VoxelRayProgressiveTickOptions = {
  /** When set, DDA uses dense/hash lookups instead of string map keys. */
  accel?: GpuVoxelAccel | null;
  /** Upper bound for trace buffer dimension (default `RAY_TRACE_MAX_BUFFER_DIM`). */
  maxBufferDim?: number;
  /** Temporal accumulation cap (clamped to `MAX_TEMPORAL_SAMPLES`). */
  maxTemporalSamples?: number;
};
const STRIDES = [8, 4, 2, 1] as const;

/** Max main-thread time per `tick()` for CPU ray mode (ms). */
export const DEFAULT_RAY_TICK_BUDGET_MS = 12;
/** Check wall clock every N primary-ray blocks to stay within budget. */
const BUDGET_CHECK_INTERVAL_BLOCKS = 64;
const GLASS_CELL_NUDGE = 1e-6;
/** `traceRayDda` returns t=0 when the ray starts inside a voxel; skip entry Fresnel (bogus face normal). */
const DDA_SURFACE_HIT_EPS = 1e-5;

function isTransmissiveMaterial(material: Voxel['material']): boolean {
  return material === 'glass' || material === 'water';
}

function jitterHash01(x: number, y: number, sampleIdx: number, axis: number): number {
  let h = Math.imul((x + 1) | 0, 0x9e3779b1);
  h ^= Math.imul((y + 1) | 0, 0x85ebca6b);
  h ^= Math.imul((sampleIdx + 1) | 0, 0xc2b2ae35);
  h ^= Math.imul((axis + 1) | 0, 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function temporalJitter(x: number, y: number, sampleIdx: number): [number, number] {
  return [jitterHash01(x, y, sampleIdx, 0) - 0.5, jitterHash01(x, y, sampleIdx, 1) - 0.5];
}

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
  const lightTint = [params.lightColorR, params.lightColorG, params.lightColorB] as const;
  const tintSkyAmt = 0.3 * params.lightStrength01;
  const tintGroundAmt = 0.12 * params.lightStrength01;
  const skyTinted: [number, number, number] = [
    sky[0] * (1 - tintSkyAmt) + lightTint[0] * tintSkyAmt,
    sky[1] * (1 - tintSkyAmt) + lightTint[1] * tintSkyAmt,
    sky[2] * (1 - tintSkyAmt) + lightTint[2] * tintSkyAmt
  ];
  const groundTinted: [number, number, number] = [
    ground[0] * (1 - tintGroundAmt) + lightTint[0] * tintGroundAmt,
    ground[1] * (1 - tintGroundAmt) + lightTint[1] * tintGroundAmt,
    ground[2] * (1 - tintGroundAmt) + lightTint[2] * tintGroundAmt
  ];
  const g = t;
  return [
    skyTinted[0] * (1 - g) + groundTinted[0] * g,
    skyTinted[1] * (1 - g) + groundTinted[1] * g,
    skyTinted[2] * (1 - g) + groundTinted[2] * g
  ];
}

function envReflectDirectional(
  params: VoxelRayTraceParams,
  reflDir: [number, number, number],
  material: Voxel['material']
): [number, number, number] {
  const [, ry] = reflDir;
  const t = Math.max(0, Math.min(1, (ry + 1) * 0.5));
  const sky = hexToLinearRgb(0x9ec8f0);
  const ground = hexToLinearRgb(0x4a5568);
  const envR = sky[0] * t + ground[0] * (1 - t);
  const envG = sky[1] * t + ground[1] * (1 - t);
  const envB = sky[2] * t + ground[2] * (1 - t);
  const [lx, ly, lz] = params.toLightWorld;
  const sunAlign = Math.max(0, reflDir[0] * lx + reflDir[1] * ly + reflDir[2] * lz);
  const sunExp = material === 'water' ? 12 : 48;
  const sunMul = material === 'water' ? 3.5 : material === 'glass' ? 1.38 : 1.2;
  const envW = material === 'glass' ? 0.78 : 0.72;
  const ambW = material === 'glass' ? 0.22 : 0.28;
  const sunLobe = Math.pow(sunAlign, sunExp) * sunMul;
  return [
    envR * envW + params.ambientR * ambW + sunLobe * params.sunDiffuseR,
    envG * envW + params.ambientG * ambW + sunLobe * params.sunDiffuseG,
    envB * envW + params.ambientB * ambW + sunLobe * params.sunDiffuseB
  ];
}

function transmissiveSunSpecular(
  material: Voxel['material'],
  faceNormal: [number, number, number],
  rayDir: [number, number, number],
  params: VoxelRayTraceParams
): [number, number, number] {
  const [nx, ny, nz] = faceNormal;
  const [rdx, rdy, rdz] = rayDir;
  const [lx, ly, lz] = params.toLightWorld;
  const vx = -rdx;
  const vy = -rdy;
  const vz = -rdz;
  const ndotl = nx * lx + ny * ly + nz * lz;
  const ndotv = nx * vx + ny * vy + nz * vz;
  if (ndotl <= 0 || ndotv <= 0) return [0, 0, 0];
  const rx = 2 * ndotl * nx - lx;
  const ry = 2 * ndotl * ny - ly;
  const rz = 2 * ndotl * nz - lz;
  const rv = Math.max(0, rx * vx + ry * vy + rz * vz);
  if (material === 'water') {
    const broad = Math.pow(rv, 6) * 1.1;
    const tight = Math.pow(rv, 32) * 0.9;
    const ndotlSoft = 0.3 + 0.7 * Math.max(0, ndotl);
    const s = (broad + tight) * ndotlSoft;
    return [s * params.sunDiffuseR, s * params.sunDiffuseG, s * params.sunDiffuseB];
  }
  const shininess = 96;
  const intensity = material === 'glass' ? 0.34 : 0.28;
  const s = Math.pow(rv, shininess) * intensity;
  return [s * params.sunDiffuseR, s * params.sunDiffuseG, s * params.sunDiffuseB];
}

function materialIor(material: Voxel['material']): number {
  if (material === 'water') return WATER_IOR;
  if (material === 'glass') return GLASS_IOR;
  return 1;
}

/** Incident medium IOR for the DDA cell containing the ray origin (1 = air / vacuum). */
function mediumIorAtRayOrigin(
  ox: number,
  oy: number,
  oz: number,
  rdx: number,
  rdy: number,
  rdz: number,
  voxels: Map<string, Voxel>,
  accel: GpuVoxelAccel | null | undefined
): number {
  const eps = 1e-9;
  const v = lookupVoxelAccel(
    accel,
    voxels,
    Math.floor(ox + eps * rdx),
    Math.floor(oy + eps * rdy),
    Math.floor(oz + eps * rdz)
  );
  if (!v || !isTransmissiveMaterial(v.material)) return 1;
  return materialIor(v.material);
}

function materialAbsorptionPerUnit(material: Voxel['material']): number {
  return material === 'water' ? GLASS_ABSORPTION_PER_UNIT * 0.09 : GLASS_ABSORPTION_PER_UNIT;
}

function transmissiveTint(material: Voxel['material'], color24: number): [number, number, number] {
  if (material === 'water') return [1, 1, 1];
  return hexToLinearRgb(color24 & 0xffffff);
}

function absorptionRgbPerUnit(material: Voxel['material']): [number, number, number] {
  if (material === 'water') {
    // Approximate visible-spectrum behavior of clear water: red attenuates fastest, blue slowest.
    return [0.03, 0.012, 0.006];
  }
  const a = materialAbsorptionPerUnit(material);
  return [a, a, a];
}

function isExposedWaterFace(
  voxels: Map<string, Voxel>,
  cell: [number, number, number],
  faceNormal: [number, number, number],
  accel: GpuVoxelAccel | null | undefined
): boolean {
  const [ix, iy, iz] = cell;
  const [nx, ny, nz] = faceNormal;
  const neighbor = lookupVoxelAccel(accel, voxels, ix + nx, iy + ny, iz + nz);
  return !neighbor || neighbor.material !== 'water';
}

function waterWaveNormal(
  px: number,
  pz: number,
  timeSeconds: number,
  signY: 1 | -1
): [number, number, number] {
  const amp1 = 0.18;
  const amp2 = 0.12;
  const f1 = 1.1;
  const f2 = 1.75;
  const ph1 = f1 * (px * 0.85 + pz * 1.05) + timeSeconds * 1.45;
  const ph2 = f2 * (px * 1.2 - pz * 0.65) + timeSeconds * 1.05;
  const dhdx = amp1 * 0.85 * f1 * Math.cos(ph1) + amp2 * 1.2 * f2 * Math.cos(ph2);
  const dhdz = amp1 * 1.05 * f1 * Math.cos(ph1) - amp2 * 0.65 * f2 * Math.cos(ph2);
  const sy = signY > 0 ? 1 : -1;
  let nx = -dhdx * sy;
  let ny = sy;
  let nz = -dhdz * sy;
  const invLen = 1 / Math.max(1e-8, Math.hypot(nx, ny, nz));
  nx *= invLen;
  ny *= invLen;
  nz *= invLen;
  return [nx, ny, nz];
}

function transmissiveShadingNormal(
  voxel: Voxel,
  faceNormal: [number, number, number],
  cell: [number, number, number],
  hitPoint: [number, number, number],
  params: VoxelRayTraceParams,
  voxels: Map<string, Voxel>,
  accel: GpuVoxelAccel | null | undefined
): [number, number, number] {
  if (voxel.material !== 'water') return faceNormal;
  const [nx, ny, nz] = faceNormal;
  if (Math.abs(ny) < 0.8 || nx !== 0 || nz !== 0) return faceNormal;
  if (!isExposedWaterFace(voxels, cell, faceNormal, accel)) return faceNormal;
  const [px, , pz] = hitPoint;
  return waterWaveNormal(px, pz, params.timeSeconds, ny > 0 ? 1 : -1);
}

function configureRayDataTexture(tex: THREE.DataTexture): void {
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
}

function orthonormalTangentBasis(
  lx: number,
  ly: number,
  lz: number
): {
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
  maxShadowDist: number,
  accel: GpuVoxelAccel | null | undefined
): [number, number, number] {
  const n = clampShadowSamples(params.shadowRaySamples);
  if (n <= 1) {
    return traceShadowRayDda(ox, oy, oz, baseLx, baseLy, baseLz, voxels, maxShadowDist, accel);
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
    const [a, b, c] = traceShadowRayDda(ox, oy, oz, jx, jy, jz, voxels, maxShadowDist, accel);
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
  maxShadowDist: number,
  accel: GpuVoxelAccel | null | undefined
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
      maxShadowDist,
      accel
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
    dr += sp * params.sunDiffuseR * sr;
    dg += sp * params.sunDiffuseG * sg;
    db += sp * params.sunDiffuseB * sb;
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

function shadeTransmissiveFallback(
  voxel: Voxel,
  faceNormal: [number, number, number],
  rayDir: [number, number, number],
  params: VoxelRayTraceParams,
  hitPoint: [number, number, number],
  voxels: Map<string, Voxel>,
  maxShadowDist: number,
  etaIncident: number,
  accel: GpuVoxelAccel | null | undefined
): { rgb: [number, number, number]; bloom: [number, number, number] } {
  const [nx, ny, nz] = faceNormal;
  const [rdx, rdy, rdz] = rayDir;
  const cosI = Math.max(0, -(nx * rdx + ny * rdy + nz * rdz));
  const etaT = materialIor(voxel.material);
  let R = fresnelSchlickReflectance(cosI, etaIncident, etaT);
  if (voxel.material === 'water') {
    R = Math.max(0.12, R);
  }
  const T = 1 - R;
  const ndoti = nx * rdx + ny * rdy + nz * rdz;
  const reflDir: [number, number, number] = [
    rdx - 2 * ndoti * nx,
    rdy - 2 * ndoti * ny,
    rdz - 2 * ndoti * nz
  ];
  const refl = envReflectDirectional(params, reflDir, voxel.material);
  const sunSpec = transmissiveSunSpecular(voxel.material, faceNormal, rayDir, params);

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
      maxShadowDist,
      accel
    );
  }

  const bgMix = voxel.material === 'water' ? 0.48 : 0.35;
  let dr = cr * params.ambientR + cr * params.sunDiffuseR * ndotl * sr;
  let dg = cg * params.ambientG + cg * params.sunDiffuseG * ndotl * sg;
  let db = cb * params.ambientB + cb * params.sunDiffuseB * ndotl * sb;
  const mixedR = dr * (1 - bgMix) + params.backgroundR * bgMix;
  const mixedG = dg * (1 - bgMix) + params.backgroundG * bgMix;
  const mixedB = db * (1 - bgMix) + params.backgroundB * bgMix;
  dr = R * refl[0] + sunSpec[0] + T * mixedR;
  dg = R * refl[1] + sunSpec[1] + T * mixedG;
  db = R * refl[2] + sunSpec[2] + T * mixedB;
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
  bufH: number,
  accel: GpuVoxelAccel | null | undefined
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

  let mediumIor = mediumIorAtRayOrigin(oox, ooy, ooz, rdx, rdy, rdz, voxels, accel);

  while (glassDepth < MAX_GLASS_DEPTH) {
    const hit = traceRayDda(oox, ooy, ooz, rdx, rdy, rdz, voxels, rem, accel);
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

    if (!isTransmissiveMaterial(hit.voxel.material)) {
      const surf = shadeOpaqueSurface(
        hit.voxel,
        hit.faceNormal,
        [rdx, rdy, rdz],
        [px, py, pz],
        params,
        voxels,
        maxShadowDist,
        accel
      );
      return {
        rgb: [accR + tr * surf.rgb[0], accG + tg * surf.rgb[1], accB + tb * surf.rgb[2]],
        bloom: [tr * surf.bloom[0], tg * surf.bloom[1], tb * surf.bloom[2]]
      };
    }

    const shadingNormal = transmissiveShadingNormal(
      hit.voxel,
      hit.faceNormal,
      hit.cell,
      [px, py, pz],
      params,
      voxels,
      accel
    );

    /** Last transmissive interface: no deeper transmission in this stack. */
    if (glassDepth >= MAX_GLASS_DEPTH - 1) {
      const fb = shadeTransmissiveFallback(
        hit.voxel,
        shadingNormal,
        [rdx, rdy, rdz],
        params,
        [px, py, pz],
        voxels,
        maxShadowDist,
        mediumIor,
        accel
      );
      return {
        rgb: [accR + tr * fb.rgb[0], accG + tg * fb.rgb[1], accB + tb * fb.rgb[2]],
        bloom: [tr * fb.bloom[0], tg * fb.bloom[1], tb * fb.bloom[2]]
      };
    }

    const [nx, ny, nz] = shadingNormal;
    const cosI = Math.max(0, -(nx * rdx + ny * rdy + nz * rdz));
    const etaT = materialIor(hit.voxel.material);
    const skipEntryFresnel = hit.t < DDA_SURFACE_HIT_EPS;

    if (!skipEntryFresnel) {
      let R = fresnelSchlickReflectance(cosI, mediumIor, etaT);
      if (hit.voxel.material === 'water') {
        R = Math.max(0.12, R);
      }
      const T = 1 - R;
      const ndoti = shadingNormal[0] * rdx + shadingNormal[1] * rdy + shadingNormal[2] * rdz;
      const reflDir: [number, number, number] = [
        rdx - 2 * ndoti * shadingNormal[0],
        rdy - 2 * ndoti * shadingNormal[1],
        rdz - 2 * ndoti * shadingNormal[2]
      ];
      const refl = envReflectDirectional(params, reflDir, hit.voxel.material);
      const sunSpec = transmissiveSunSpecular(
        hit.voxel.material,
        shadingNormal,
        [rdx, rdy, rdz],
        params
      );
      accR += tr * R * refl[0];
      accG += tg * R * refl[1];
      accB += tb * R * refl[2];
      accR += tr * sunSpec[0];
      accG += tg * sunSpec[1];
      accB += tb * sunSpec[2];

      tr *= T;
      tg *= T;
      tb *= T;
    }

    let cx = ix;
    let cy = iy;
    let cz = iz;
    let cpx = px;
    let cpy = py;
    let cpz = pz;
    let curGlass = hit.voxel;
    let step = hit.t;
    let nextAfter: Voxel | null = null;
    while (true) {
      const tThrough = distToExitUnitCell(cpx, cpy, cpz, rdx, rdy, rdz, cx, cy, cz);
      const [absR, absG, absB] = absorptionRgbPerUnit(curGlass.material);
      const attR = Math.max(GLASS_MIN_TRANSMITTANCE, Math.exp(-absR * tThrough));
      const attG = Math.max(GLASS_MIN_TRANSMITTANCE, Math.exp(-absG * tThrough));
      const attB = Math.max(GLASS_MIN_TRANSMITTANCE, Math.exp(-absB * tThrough));
      const [gcr, gcg, gcb] = transmissiveTint(curGlass.material, curGlass.color);
      tr *= attR * gcr;
      tg *= attG * gcg;
      tb *= attB * gcb;
      cpx += rdx * tThrough;
      cpy += rdy * tThrough;
      cpz += rdz * tThrough;
      step += tThrough;

      const npx = cpx + rdx * GLASS_CELL_NUDGE;
      const npy = cpy + rdy * GLASS_CELL_NUDGE;
      const npz = cpz + rdz * GLASS_CELL_NUDGE;
      const ncx = Math.floor(npx);
      const ncy = Math.floor(npy);
      const ncz = Math.floor(npz);
      const next = lookupVoxelAccel(accel, voxels, ncx, ncy, ncz);
      if (!next || !isTransmissiveMaterial(next.material) || next.material !== curGlass.material) {
        nextAfter = next;
        break;
      }
      cx = ncx;
      cy = ncy;
      cz = ncz;
      cpx = npx;
      cpy = npy;
      cpz = npz;
      curGlass = next;
      step += GLASS_CELL_NUDGE;
    }

    let etaOut = 1;
    if (nextAfter && isTransmissiveMaterial(nextAfter.material)) {
      etaOut = materialIor(nextAfter.material);
    }
    const Rexit = fresnelSchlickReflectance(cosI, materialIor(curGlass.material), etaOut);
    const Texit = 1 - Rexit;
    tr *= Texit;
    tg *= Texit;
    tb *= Texit;

    step += SHADOW_SURFACE_EPS;
    oox += rdx * step;
    ooy += rdy * step;
    ooz += rdz * step;
    rem -= step;
    mediumIor = mediumIorAtRayOrigin(oox, ooy, ooz, rdx, rdy, rdz, voxels, accel);
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
  private linearData: Float32Array;
  private bloomData: Float32Array;
  private linearBloomData: Float32Array;
  private accumData: Float32Array;
  private accumBloomData: Float32Array;
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
  /** Number of complete temporal full-res samples in the accumulation buffer. */
  private temporalSampleCount = 0;
  /** Target sample count while an in-progress temporal pass is being blended. */
  private temporalBlendTarget = 0;
  /** Effective temporal cap (from preferences, ≤ MAX_TEMPORAL_SAMPLES). */
  private temporalCap = MAX_TEMPORAL_SAMPLES;
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayFar = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();

  constructor() {
    this.data = new Uint8ClampedArray(4);
    this.linearData = new Float32Array(4);
    this.bloomData = new Float32Array(4);
    this.linearBloomData = new Float32Array(4);
    this.accumData = new Float32Array(4);
    this.accumBloomData = new Float32Array(4);
    this.texture = new THREE.DataTexture(this.data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = true;
    configureRayDataTexture(this.texture);
    this.texture.needsUpdate = true;
    this.bloomTexture = new THREE.DataTexture(
      this.bloomData,
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
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
    const strideCount = STRIDES.length;
    if (this.strideIdx < strideCount) {
      const strideFrac =
        this.totalBlocksThisStride > 0
          ? this.completedBlocksThisStride / this.totalBlocksThisStride
          : 0;
      return Math.min(0.5, ((this.strideIdx + strideFrac) / strideCount) * 0.5);
    }
    const inTemporalPass =
      this.temporalBlendTarget > this.temporalSampleCount && this.totalBlocksThisStride > 0;
    const temporalBlockFrac = inTemporalPass
      ? this.completedBlocksThisStride / this.totalBlocksThisStride
      : 0;
    const temporalProgress = Math.min(
      1,
      (this.temporalSampleCount + temporalBlockFrac) / Math.max(1, this.temporalCap)
    );
    return 0.5 + temporalProgress * 0.5;
  }

  private setRayFromPixel(
    camera: THREE.Camera,
    u: number,
    v: number,
    jitterX = 0,
    jitterY = 0
  ): void {
    const bufW = this.bufW;
    const bufH = this.bufH;
    const nx = ((u + 0.5 + jitterX) / bufW) * 2 - 1;
    const ny = -(((v + 0.5 + jitterY) / bufH) * 2 - 1);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      this.rayOrigin.setFromMatrixPosition(cam.matrixWorld);
      /** Match `Raycaster.setFromCamera`: NDC z must be 0.5, not 1, or directions miss the scene. */
      this.rayFar.set(nx, ny, 0.5).unproject(cam);
      this.rayDir.copy(this.rayFar).sub(this.rayOrigin).normalize();
    } else {
      const cam = camera as THREE.OrthographicCamera;
      this.rayOrigin.set(nx, ny, (cam.near + cam.far) / (cam.near - cam.far)).unproject(cam);
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
    budgetMs: number = DEFAULT_RAY_TICK_BUDGET_MS,
    tickOptions?: VoxelRayProgressiveTickOptions
  ): void {
    const bufferDimCap = Math.min(
      RAY_TRACE_MAX_BUFFER_DIM,
      Math.max(64, Math.floor(tickOptions?.maxBufferDim ?? RAY_TRACE_MAX_BUFFER_DIM))
    );
    this.temporalCap = Math.min(
      MAX_TEMPORAL_SAMPLES,
      Math.max(1, Math.floor(tickOptions?.maxTemporalSamples ?? MAX_TEMPORAL_SAMPLES))
    );
    const accel = tickOptions?.accel ?? null;

    let bufW = Math.max(1, Math.round(width * dpr));
    let bufH = Math.max(1, Math.round(height * dpr));
    const m = Math.max(bufW, bufH);
    if (m > bufferDimCap) {
      const s = bufferDimCap / m;
      bufW = Math.max(1, Math.round(bufW * s));
      bufH = Math.max(1, Math.round(bufH * s));
    }

    if (bufW !== this.bufW || bufH !== this.bufH) {
      this.bufW = bufW;
      this.bufH = bufH;
      this.data = new Uint8ClampedArray(bufW * bufH * 4);
      this.linearData = new Float32Array(bufW * bufH * 4);
      this.bloomData = new Float32Array(bufW * bufH * 4);
      this.linearBloomData = new Float32Array(bufW * bufH * 4);
      this.accumData = new Float32Array(bufW * bufH * 4);
      this.accumBloomData = new Float32Array(bufW * bufH * 4);
      this.texture.dispose();
      this.texture = new THREE.DataTexture(
        this.data,
        bufW,
        bufH,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.flipY = true;
      configureRayDataTexture(this.texture);
      this.texture.needsUpdate = true;
      this.bloomTexture.dispose();
      this.bloomTexture = new THREE.DataTexture(
        this.bloomData,
        bufW,
        bufH,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      this.bloomTexture.colorSpace = THREE.LinearSRGBColorSpace;
      this.bloomTexture.flipY = true;
      configureRayDataTexture(this.bloomTexture);
      this.bloomTexture.needsUpdate = true;
      this.strideIdx = 0;
      this.converged = false;
      this.resumeU = 0;
      this.resumeV = 0;
      this.completedBlocksThisStride = 0;
      this.temporalSampleCount = 0;
      this.temporalBlendTarget = 0;
    }

    if (fullInvalidated) {
      this.strideIdx = 0;
      this.converged = false;
      this.resumeU = 0;
      this.resumeV = 0;
      this.completedBlocksThisStride = 0;
      this.temporalSampleCount = 0;
      this.temporalBlendTarget = 0;
    } else if (this.converged) {
      return;
    }

    const temporalPhase = this.strideIdx >= STRIDES.length;
    const stride = temporalPhase ? 1 : STRIDES[this.strideIdx]!;
    const maxDist = maxRayDistanceForVoxels(voxels, [
      camera.position.x,
      camera.position.y,
      camera.position.z
    ]);
    const maxShadowDist = maxDist;

    const blocksW = temporalPhase ? bufW : Math.ceil(bufW / stride);
    const blocksH = temporalPhase ? bufH : Math.ceil(bufH / stride);
    this.totalBlocksThisStride = Math.max(1, blocksW * blocksH);
    if (temporalPhase && this.temporalBlendTarget <= this.temporalSampleCount) {
      this.temporalBlendTarget = this.temporalSampleCount + 1;
    }

    const effectiveBudget =
      Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : DEFAULT_RAY_TICK_BUDGET_MS;
    const deadline = performance.now() + effectiveBudget;
    let blocksSinceCheck = 0;

    for (let v = this.resumeV; v < bufH; v += stride) {
      const uStart = v === this.resumeV ? this.resumeU : 0;
      for (let u = uStart; u < bufW; u += stride) {
        let jitterX = 0;
        let jitterY = 0;
        if (temporalPhase) {
          [jitterX, jitterY] = temporalJitter(u, v, this.temporalBlendTarget);
        }
        this.setRayFromPixel(camera, u, v, jitterX, jitterY);
        const ox = this.rayOrigin.x;
        const oy = this.rayOrigin.y;
        const oz = this.rayOrigin.z;
        const dx = this.rayDir.x;
        const dy = this.rayDir.y;
        const dz = this.rayDir.z;
        const coarsePass = !temporalPhase && stride > 1;
        const shadeParams = coarsePass ? { ...params, shadowRaySamples: 1 } : params;
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
          shadeParams,
          v,
          bufH,
          accel
        );
        const [lr, lg, lb] = rgb;
        const [br, bg, bb] = bloom;
        if (temporalPhase) {
          const o = (v * bufW + u) * 4;
          const n = this.temporalBlendTarget;
          this.accumData[o] += (lr - this.accumData[o]) / n;
          this.accumData[o + 1] += (lg - this.accumData[o + 1]) / n;
          this.accumData[o + 2] += (lb - this.accumData[o + 2]) / n;
          this.accumData[o + 3] = 1;
          this.accumBloomData[o] += (br - this.accumBloomData[o]) / n;
          this.accumBloomData[o + 1] += (bg - this.accumBloomData[o + 1]) / n;
          this.accumBloomData[o + 2] += (bb - this.accumBloomData[o + 2]) / n;
          this.accumBloomData[o + 3] = 1;
          this.linearData[o] = this.accumData[o];
          this.linearData[o + 1] = this.accumData[o + 1];
          this.linearData[o + 2] = this.accumData[o + 2];
          this.linearData[o + 3] = 1;
          this.linearBloomData[o] = this.accumBloomData[o];
          this.linearBloomData[o + 1] = this.accumBloomData[o + 1];
          this.linearBloomData[o + 2] = this.accumBloomData[o + 2];
          this.linearBloomData[o + 3] = 1;
          this.data[o] = linearToSrgbByte(this.accumData[o]);
          this.data[o + 1] = linearToSrgbByte(this.accumData[o + 1]);
          this.data[o + 2] = linearToSrgbByte(this.accumData[o + 2]);
          this.data[o + 3] = 255;
          this.bloomData[o] = this.accumBloomData[o];
          this.bloomData[o + 1] = this.accumBloomData[o + 1];
          this.bloomData[o + 2] = this.accumBloomData[o + 2];
          this.bloomData[o + 3] = 1;
        } else {
          const bw = Math.min(stride, bufW - u);
          const bh = Math.min(stride, bufH - v);
          setBlock(this.data, bufW, bufH, u, v, bw, bh, lr, lg, lb);
          setBloomBlock(this.bloomData, bufW, bufH, u, v, bw, bh, br, bg, bb);
          for (let vv = v; vv < Math.min(v + bh, bufH); vv++) {
            let o = (vv * bufW + u) * 4;
            for (let uu = u; uu < Math.min(u + bw, bufW); uu++) {
              this.linearData[o] = lr;
              this.linearData[o + 1] = lg;
              this.linearData[o + 2] = lb;
              this.linearData[o + 3] = 1;
              this.linearBloomData[o] = br;
              this.linearBloomData[o + 1] = bg;
              this.linearBloomData[o + 2] = bb;
              this.linearBloomData[o + 3] = 1;
              o += 4;
            }
          }
        }

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

    if (temporalPhase) {
      this.temporalSampleCount = this.temporalBlendTarget;
      this.temporalBlendTarget = 0;
      this.converged = this.temporalSampleCount >= this.temporalCap;
    } else if (this.strideIdx < STRIDES.length - 1) {
      this.strideIdx++;
    } else {
      this.strideIdx = STRIDES.length;
      this.temporalSampleCount = 1;
      this.temporalBlendTarget = 0;
      this.accumData.set(this.linearData);
      this.accumBloomData.set(this.linearBloomData);
      this.converged = this.temporalSampleCount >= this.temporalCap;
    }

    this.texture.needsUpdate = true;
    this.bloomTexture.needsUpdate = true;
  }
}
