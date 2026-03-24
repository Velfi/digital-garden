import { coordKey } from '../../../coordUtils';
import type { FaceNormal } from '../../core';
import type { Voxel } from '../../../voxelMaterial';
import { cloneVoxel } from '../../../voxelMaterial';
import {
  getPiscinaFinBands,
  getPiscinaPectoralParams,
  SPECIES_OUTLINES,
  SPECIES_TAIL_PARAMS
} from './species';
import type {
  GeneratePiscinaOptions,
  PiscinaFrame,
  PiscinaMedianFinMode,
  PiscinaOutlineSample,
  PiscinaPectoralParams,
  PiscinaTailParams
} from './types';
import { clampInt, cross3, normalize3, rotateAroundAxis, smoothstep } from './mathUtils';

export const PISCINA_VOXEL_CAP_MIN = 2200;
export const PISCINA_VOXEL_CAP_MAX = 52000;

/** Lateral half-width (voxels); maps to option `width`. */
export const PISCINA_LATERAL_HALF_MIN = 2;
export const PISCINA_LATERAL_HALF_MAX = 48;
/** Dorsoventral half-thickness (voxels); maps to option `thickness`. */
export const PISCINA_DV_HALF_MIN = 1;
export const PISCINA_DV_HALF_MAX = 36;

export function computePiscinaVoxelCap(L: number, W: number, T: number): number {
  const wEff = W * 0.5 + 3;
  const tEff = T * 0.5 + 3;
  const bodyEst = Math.PI * wEff * tEff * L * 0.88;
  const finEst = (W + T) * L * 0.38 + 900;
  return Math.max(
    PISCINA_VOXEL_CAP_MIN,
    Math.min(PISCINA_VOXEL_CAP_MAX, Math.ceil((bodyEst + finEst) * 1.12))
  );
}

function getTangentVectors(normal: FaceNormal): [FaceNormal, FaceNormal] {
  const [nx, ny] = normal;
  if (nx !== 0)
    return [
      [0, 1, 0],
      [0, 0, 1]
    ];
  if (ny !== 0)
    return [
      [1, 0, 0],
      [0, 0, 1]
    ];
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

/**
 * `getTangentVectors` returns an arbitrary orthonormal pair in the face plane.
 * Use **second** tangent as nose–tail so horizontal floors (+Y) get spine along **Z** (depth),
 * with **first** tangent as lateral width — matches typical “fish along view depth” placement.
 */
function piscinaForwardSide(normal: FaceNormal): { forward: FaceNormal; side: FaceNormal } {
  const [t1, t2] = getTangentVectors(normal);
  return { forward: t2, side: t1 };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampOptions(o: GeneratePiscinaOptions): GeneratePiscinaOptions {
  const sp = o.species in SPECIES_OUTLINES ? o.species : 'trout';
  return {
    species: sp,
    length: clampInt(o.length, 4, 72),
    width: clampInt(o.width, PISCINA_LATERAL_HALF_MIN, PISCINA_LATERAL_HALF_MAX),
    thickness: clampInt(o.thickness, PISCINA_DV_HALF_MIN, PISCINA_DV_HALF_MAX),
    finDorsal: clampInt(o.finDorsal, 1, 8),
    finAnal: clampInt(o.finAnal, 1, 8),
    finCaudal: clampInt(o.finCaudal, 1, 8),
    finPectoral: clampInt(o.finPectoral, 1, 8),
    finPelvic: clampInt(o.finPelvic, 1, 8),
    finAdipose: clampInt(o.finAdipose, 1, 8),
    showFinDorsal: Boolean(o.showFinDorsal),
    showFinAnal: Boolean(o.showFinAnal),
    showFinCaudal: Boolean(o.showFinCaudal),
    showFinPectoral: Boolean(o.showFinPectoral),
    showFinPelvic: Boolean(o.showFinPelvic),
    showFinAdipose: Boolean(o.showFinAdipose),
    anchorOffsetU: clampInt(o.anchorOffsetU, -24, 24),
    anchorOffsetV: clampInt(o.anchorOffsetV, -24, 24),
    spineBend: Math.max(-1, Math.min(1, o.spineBend)),
    spineSCurve: Math.max(-1, Math.min(1, o.spineSCurve)),
    finDorsalPitch: Math.max(-45, Math.min(45, o.finDorsalPitch)),
    finDorsalSweep: Math.max(-45, Math.min(45, o.finDorsalSweep)),
    finAnalPitch: Math.max(-45, Math.min(45, o.finAnalPitch)),
    finDorsalMode:
      o.finDorsalMode === 'pointed' || o.finDorsalMode === 'rounded' || o.finDorsalMode === 'ribbon'
        ? o.finDorsalMode
        : 'rounded',
    finAnalMode:
      o.finAnalMode === 'pointed' || o.finAnalMode === 'rounded' || o.finAnalMode === 'ribbon'
        ? o.finAnalMode
        : 'rounded',
    finCaudalMode:
      o.finCaudalMode === 'species' ||
      o.finCaudalMode === 'fork' ||
      o.finCaudalMode === 'deepFork' ||
      o.finCaudalMode === 'lunate' ||
      o.finCaudalMode === 'truncate' ||
      o.finCaudalMode === 'rounded'
        ? o.finCaudalMode
        : 'species',
    finPectoralMode:
      o.finPectoralMode === 'pointed' ||
      o.finPectoralMode === 'rounded' ||
      o.finPectoralMode === 'ribbon'
        ? o.finPectoralMode
        : 'rounded',
    finPelvicMode:
      o.finPelvicMode === 'pointed' || o.finPelvicMode === 'rounded' || o.finPelvicMode === 'ribbon'
        ? o.finPelvicMode
        : 'rounded',
    finAdiposeMode:
      o.finAdiposeMode === 'pointed' ||
      o.finAdiposeMode === 'rounded' ||
      o.finAdiposeMode === 'ribbon'
        ? o.finAdiposeMode
        : 'pointed',
    finDorsalLength: Math.max(0.5, Math.min(2.5, o.finDorsalLength)),
    finAnalLength: Math.max(0.5, Math.min(2.5, o.finAnalLength)),
    finDorsalPosition: Math.max(-0.45, Math.min(0.45, o.finDorsalPosition)),
    finCaudalSpread: Math.max(0, Math.min(45, o.finCaudalSpread)),
    finPectoralCant: Math.max(-45, Math.min(45, o.finPectoralCant)),
    finPectoralSweep: Math.max(-45, Math.min(45, o.finPectoralSweep))
  };
}

function finMul(scale: number): number {
  const s = clampInt(scale, 1, 8);
  /** Deliberately exaggerated range for clearer fin shaping in UI (about 5x old max effect). */
  return 1 + ((s - 1) / 7) * 6.25;
}

function finLateralSpanRef(W: number): number {
  return Math.min(18, 3.5 + 0.45 * Math.max(0, W - 2));
}

/** Median dorsal fin height scale from body size (extent along local `u`, wing span along `s`). */
function dorsalHeightRef(W: number, T: number): number {
  return Math.min(14, 2 + 0.28 * Math.max(0, W - 2) + 0.26 * Math.max(0, T - 2));
}

function dorsalBaseWing(mulD: number): 1 | 2 {
  return Math.min(2, Math.max(1, Math.round(mulD * 1.28))) as 1 | 2;
}

/**
 * Lateral spread along `s` (side–side). Pointed/rounded taper to a tip (wing 0 on deep layers).
 * Ribbon keeps wing ≥ 1 on every layer so long dorsal/anal ribbons stay a filled sheet, not a 1-voxel “tube”.
 */
function medianFinLateralWing(layer: number, peak: 1 | 2, mode: PiscinaMedianFinMode): number {
  if (mode === 'ribbon') {
    if (layer === 1) return peak;
    return 1;
  }
  return layer === 1 ? peak : layer === 2 && peak >= 2 ? 1 : 0;
}

function medianFinHeightEnvelope(env: number, mode: PiscinaMedianFinMode): number {
  if (mode === 'pointed') return env;
  if (mode === 'rounded') return Math.sin((Math.PI * Math.max(0, Math.min(1, env))) / 2);
  return Math.max(0.42, Math.pow(Math.max(0, Math.min(1, env)), 0.45));
}

function mergePectoralShapeWithMode(
  base: PiscinaPectoralParams,
  mode: PiscinaMedianFinMode
): PiscinaPectoralParams {
  const p = { ...base };
  if (mode === 'pointed') {
    p.reachMul *= 0.9;
    p.kernelPinch = Math.min(1.45, p.kernelPinch * 1.06);
    p.trailPerRow *= 0.9;
  } else if (mode === 'rounded') {
    p.reachMul *= 0.88;
    p.envelopeMul *= 1.1;
    p.kernelPinch = Math.max(0.95, p.kernelPinch * 0.94);
  } else {
    p.reachMul *= 1.12;
    p.envelopeMul *= 1.06;
    p.trailPerRow *= 1.18;
    p.trailAlongStep *= 1.12;
    p.fanRows = Math.min(9, Math.round(p.fanRows + 1));
  }
  return p;
}

/**
 * Piecewise superellipse: lateral and dorsoventral half-axes may differ by sign of dv / dw.
 * At dv=0 or dw=0 use the larger half-axis so asymmetric outlines do not leave a voxel slot
 * on the mid-sagittal or mid-coronal plane (common head/gill gap with pos/neg radii).
 */
function insideCrossSection(
  dv: number,
  dw: number,
  halfSidePos: number,
  halfSideNeg: number,
  halfDorsal: number,
  halfVentral: number,
  p: number
): boolean {
  const hLat = dv === 0 ? Math.max(halfSidePos, halfSideNeg) : dv > 0 ? halfSidePos : halfSideNeg;
  const hDw = dw === 0 ? Math.max(halfDorsal, halfVentral) : dw > 0 ? halfDorsal : halfVentral;
  const lateralR = Math.max(hLat, 0.45);
  const dvR = Math.max(hDw, 0.35);
  const dvN = Math.abs(dv) / lateralR;
  const dwN = Math.abs(dw) / dvR;
  return Math.pow(dvN, p) + Math.pow(dwN, p) <= 1;
}

/** Largest integer dw≥0 on the midline (dv=0) still inside the cross-section — matches body voxel shell. */
export function midlineMaxPositiveDw(
  halfSidePos: number,
  halfSideNeg: number,
  halfDorsal: number,
  halfVentral: number,
  p: number,
  dwMaxScan: number
): number {
  let best = 0;
  const lim = Math.max(0, dwMaxScan);
  for (let dw = 0; dw <= lim; dw++) {
    if (insideCrossSection(0, dw, halfSidePos, halfSideNeg, halfDorsal, halfVentral, p)) {
      best = dw;
    }
  }
  return best;
}

/** Most negative integer dw on the midline still inside the cross-section. */
export function midlineMinNegativeDw(
  halfSidePos: number,
  halfSideNeg: number,
  halfDorsal: number,
  halfVentral: number,
  p: number,
  dwMaxScan: number
): number {
  let best = 0;
  const lim = Math.max(0, dwMaxScan);
  for (let dw = -1; dw >= -lim; dw--) {
    if (insideCrossSection(0, dw, halfSidePos, halfSideNeg, halfDorsal, halfVentral, p)) {
      best = dw;
    }
  }
  return best;
}

/**
 * Most negative integer dw at a fixed lateral offset dv (ventral belly at that slice).
 * Pelvic roots must use this — midline ventral depth + lateral offset along S alone leaves
 * the root below the actual superellipse shell when the belly is curved.
 */
function minNegativeDwAtDv(
  dv: number,
  halfSidePos: number,
  halfSideNeg: number,
  halfDorsal: number,
  halfVentral: number,
  p: number,
  dwMaxScan: number
): number {
  let best = 0;
  const lim = Math.max(0, dwMaxScan);
  for (let dw = -1; dw >= -lim; dw--) {
    if (insideCrossSection(dv, dw, halfSidePos, halfSideNeg, halfDorsal, halfVentral, p)) {
      best = dw;
    }
  }
  return best;
}

const FIN_ROOT_SKIN_NUDGE = 0.07;

/**
 * Shrinks outline half-axes near t≈0 so the rostrum tapers instead of a blunt “wall” of voxels.
 * Species outlines still carry floor terms; this is an extra uniform taper along the nose.
 */
function applySnoutTaper(sec: PiscinaOutlineSample, t: number): PiscinaOutlineSample {
  const ramp = smoothstep(0, 0.17, t);
  const s = 0.06 + 0.94 * ramp;
  const m = (x: number) => Math.max(0.22, x * s);
  return {
    ...sec,
    halfSide: m(sec.halfSide),
    halfSidePos: m(sec.halfSidePos),
    halfSideNeg: m(sec.halfSideNeg),
    halfDorsal: m(sec.halfDorsal),
    halfVentral: m(sec.halfVentral),
    halfUp: m(sec.halfUp)
  };
}

export function buildPiscinaFrame(
  place: [number, number, number],
  normal: FaceNormal,
  options: GeneratePiscinaOptions
): PiscinaFrame {
  const o = clampOptions(options);
  const { forward: f, side: s } = piscinaForwardSide(normal);
  const [px, py, pz] = place;
  const cx = px + o.anchorOffsetU * f[0] + o.anchorOffsetV * s[0];
  const cy = py + o.anchorOffsetU * f[1] + o.anchorOffsetV * s[1];
  const cz = pz + o.anchorOffsetU * f[2] + o.anchorOffsetV * s[2];
  return {
    forward: f,
    side: s,
    up: normal,
    center: [cx, cy, cz]
  };
}

function spineScaleRef(L: number, W: number, T: number): number {
  return Math.max(4.8, Math.min(22, W * 0.6 + T * 0.4 + L * 0.08));
}

function spineLateralOffset(
  t: number,
  L: number,
  W: number,
  T: number,
  bend: number,
  sCurve: number
): number {
  const bendCtl = mapSpineControl(bend);
  const sCtl = mapSpineControl(sCurve);
  const bodyRef = spineScaleRef(L, W, T);
  const amp = bendCtl * bodyRef * 0.32;
  const amp2 = sCtl * bodyRef * 0.24;
  const sEnvelope = smoothstep(0.06, 0.22, t) * (1 - smoothstep(0.78, 0.98, t));
  return (
    amp * Math.sin(t * Math.PI * 1.05) + amp2 * sEnvelope * Math.sin((t - 0.02) * Math.PI * 2.12)
  );
}

function spineVerticalOffset(t: number, L: number, W: number, T: number, sCurve: number): number {
  const sCtl = mapSpineControl(sCurve);
  const bodyRef = spineScaleRef(L, W, T);
  const envelope = smoothstep(0.08, 0.24, t) * (1 - smoothstep(0.72, 0.96, t));
  return sCtl * bodyRef * 0.16 * envelope * Math.sin((t - 0.08) * Math.PI * 1.18);
}

/**
 * Slider response curve:
 * - lower range (|v| < ~0.7) is gentler than linear for fine control
 * - upper range ramps up quickly for pronounced bends at the top end
 */
function mapSpineControl(v: number): number {
  const s = Math.sign(v);
  const x = Math.abs(v);
  const hi = smoothstep(0.7, 1, x);
  const gain = 0.62 + hi * 0.78;
  return s * x * gain;
}

function collectFishVoxels(
  frame: PiscinaFrame,
  options: GeneratePiscinaOptions,
  out: Map<string, [number, number, number]>,
  rng: () => number,
  voxelCap: number
): void {
  const o = clampOptions(options);
  const outline = SPECIES_OUTLINES[o.species];
  const L = o.length;
  const W = o.width;
  const T = o.thickness;
  const mulD = finMul(o.finDorsal);
  const mulA = finMul(o.finAnal);
  const mulC = finMul(o.finCaudal);
  const mulP = finMul(o.finPectoral);
  const mulPv = finMul(o.finPelvic);
  const mulAd = finMul(o.finAdipose);
  const { forward: f, side: s0, up: u0, center: c } = frame;

  const fx = f[0],
    fy = f[1],
    fz = f[2];
  const s0x = s0[0],
    s0y = s0[1],
    s0z = s0[2];
  const u0x = u0[0],
    u0y = u0[1],
    u0z = u0[2];

  const tryAdd = (x: number, y: number, z: number) => {
    if (out.size >= voxelCap) return;
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    const k = coordKey(ix, iy, iz);
    if (!out.has(k)) out.set(k, [ix, iy, iz]);
  };

  const spineStart = -Math.floor((L - 1) / 2);
  const forkSign = rng() > 0.5 ? 1 : -1;

  const pxArr = new Float64Array(L);
  const pyArr = new Float64Array(L);
  const pzArr = new Float64Array(L);
  const Tx = new Float64Array(L);
  const Ty = new Float64Array(L);
  const Tz = new Float64Array(L);
  const Sx = new Float64Array(L);
  const Sy = new Float64Array(L);
  const Sz = new Float64Array(L);
  const Ux = new Float64Array(L);
  const Uy = new Float64Array(L);
  const Uz = new Float64Array(L);

  for (let k = 0; k < L; k++) {
    const ui = spineStart + k;
    const t = L <= 1 ? 0 : k / (L - 1);
    const lat = spineLateralOffset(t, L, W, T, o.spineBend, o.spineSCurve);
    const vert = spineVerticalOffset(t, L, W, T, o.spineSCurve);
    pxArr[k] = c[0] + ui * fx + lat * s0x + vert * u0x;
    pyArr[k] = c[1] + ui * fy + lat * s0y + vert * u0y;
    pzArr[k] = c[2] + ui * fz + lat * s0z + vert * u0z;
  }

  /**
   * Tangents via phantom-end central differences so k=0 and k=L-1 match the interior scheme.
   * Forward/backward-only ends used to rotate the body frame abruptly and leave longitudinal gaps
   * after rounding (snout / gill band).
   */
  for (let k = 0; k < L; k++) {
    let ddx: number;
    let ddy: number;
    let ddz: number;
    if (L <= 1) {
      ddx = fx;
      ddy = fy;
      ddz = fz;
    } else if (k === 0) {
      const pm1x = 2 * pxArr[0]! - pxArr[1]!;
      const pm1y = 2 * pyArr[0]! - pyArr[1]!;
      const pm1z = 2 * pzArr[0]! - pzArr[1]!;
      ddx = pxArr[1]! - pm1x;
      ddy = pyArr[1]! - pm1y;
      ddz = pzArr[1]! - pm1z;
    } else if (k === L - 1) {
      const pp1x = 2 * pxArr[L - 1]! - pxArr[L - 2]!;
      const pp1y = 2 * pyArr[L - 1]! - pyArr[L - 2]!;
      const pp1z = 2 * pzArr[L - 1]! - pzArr[L - 2]!;
      ddx = pp1x - pxArr[L - 2]!;
      ddy = pp1y - pyArr[L - 2]!;
      ddz = pp1z - pzArr[L - 2]!;
    } else {
      ddx = pxArr[k + 1]! - pxArr[k - 1]!;
      ddy = pyArr[k + 1]! - pyArr[k - 1]!;
      ddz = pzArr[k + 1]! - pzArr[k - 1]!;
    }
    const [tx, ty, tz] = normalize3(ddx, ddy, ddz);
    Tx[k] = tx;
    Ty[k] = ty;
    Tz[k] = tz;

    let [sx, sy, sz] = cross3(u0x, u0y, u0z, tx, ty, tz);
    const slen = Math.hypot(sx, sy, sz);
    if (slen < 1e-6) {
      sx = s0x;
      sy = s0y;
      sz = s0z;
    } else {
      sx /= slen;
      sy /= slen;
      sz /= slen;
    }
    let [ux, uy, uz] = cross3(tx, ty, tz, sx, sy, sz);
    const ulen = Math.hypot(ux, uy, uz);
    if (ulen < 1e-6) {
      ux = u0x;
      uy = u0y;
      uz = u0z;
    } else {
      ux /= ulen;
      uy /= ulen;
      uz /= ulen;
    }
    Sx[k] = sx;
    Sy[k] = sy;
    Sz[k] = sz;
    Ux[k] = ux;
    Uy[k] = uy;
    Uz[k] = uz;
  }

  const toRad = Math.PI / 180;
  /** Fins: dorsal/anal grow from dorsal/ventral skin along `u` (median), wing along `s`; pec from lateral skin along `s`; caudal posterior along `+t`, span `u`, fork mix `s`. */
  const dorsalPitchR = o.finDorsalPitch * toRad;
  const dorsalSweepR = o.finDorsalSweep * toRad;
  const analPitchR = o.finAnalPitch * toRad;
  const caudalSpreadR = o.finCaudalSpread * toRad;
  const pectoralCantR = o.finPectoralCant * toRad;
  const pectoralSweepR = o.finPectoralSweep * toRad;
  const pecShape = mergePectoralShapeWithMode(
    getPiscinaPectoralParams(o.species),
    o.finPectoralMode
  );

  const finB = getPiscinaFinBands(o.species);
  const speciesTail = SPECIES_TAIL_PARAMS[o.species] ?? SPECIES_TAIL_PARAMS.trout;
  const tailP: PiscinaTailParams =
    o.finCaudalMode === 'species' ? speciesTail : { ...speciesTail, mode: o.finCaudalMode };

  /** Limit snout lateral skew change per spine step so slice centers do not jump >~1 voxel along T. */
  const skewScale = Math.max(0.25, W * 0.22);
  const maxSkewStepLo = 0.17;
  const maxSkewStepHi = Math.max(0.22, (0.18 * Math.min(L, 24)) / Math.max(L - 1, 1));
  let prevSkewAmt = 0;

  for (let k = 0; k < L; k++) {
    const t = L <= 1 ? 0 : k / (L - 1);
    const px = pxArr[k]!;
    const py = pyArr[k]!;
    const pz = pzArr[k]!;
    const sx = Sx[k]!;
    const sy = Sy[k]!;
    const sz = Sz[k]!;
    const ux = Ux[k]!;
    const uy = Uy[k]!;
    const uz = Uz[k]!;
    const tx = Tx[k]!;
    const ty = Ty[k]!;
    const tz = Tz[k]!;

    const sec = applySnoutTaper(outline(t, W, T), t);
    let skewAmt = sec.lateralSkew * skewScale;
    const maxSkewStep = t < 0.22 ? maxSkewStepLo : maxSkewStepHi;
    const dSk = skewAmt - prevSkewAmt;
    if (Math.abs(dSk) > maxSkewStep) {
      skewAmt = prevSkewAmt + Math.sign(dSk) * maxSkewStep;
    }
    prevSkewAmt = skewAmt;
    const bx = px + skewAmt * tx;
    const by = py + skewAmt * ty;
    const bz = pz + skewAmt * tz;

    const wLim = Math.max(sec.halfSide, sec.halfSidePos, sec.halfSideNeg);
    const tLim = Math.max(sec.halfDorsal, sec.halfVentral);
    let lateralRi = Math.min(W + 2, Math.ceil(wLim) + 1);
    let dvRi = Math.min(T + 2, Math.ceil(tLim) + 1);
    /** Rostrum / gill: spine samples are 1 voxel apart but snout skew + frame twist leave holes; bridge along T. */
    if (t < 0.32) {
      lateralRi += 1;
      dvRi += 1;
    }
    const pwr = sec.sectionPower;

    /** Extra samples along T fill holes in the gill band; at the nose they stack into a blunt front wall. */
    const alongT =
      t < 0.32 && L > 1
        ? t < 0.075
          ? ([0] as const)
          : ([0, -0.58, 0.58] as const)
        : ([0] as const);
    for (const tOff of alongT) {
      if (out.size >= voxelCap) break;
      const bxx = bx + tOff * tx;
      const byy = by + tOff * ty;
      const bzz = bz + tOff * tz;
      for (let dv = -lateralRi; dv <= lateralRi; dv++) {
        for (let dw = -dvRi; dw <= dvRi; dw++) {
          if (
            !insideCrossSection(
              dv,
              dw,
              sec.halfSidePos,
              sec.halfSideNeg,
              sec.halfDorsal,
              sec.halfVentral,
              pwr
            )
          )
            continue;
          const x = bxx + dv * sx + dw * ux;
          const y = byy + dv * sy + dw * uy;
          const z = bzz + dv * sz + dw * uz;
          tryAdd(x, y, z);
        }
      }
    }

    /**
     * Fin roots on the discrete body shell (integer dw on midline), not continuous half-axes —
     * avoids a 1-voxel air gap between body and median fins.
     */
    const maxDwD = midlineMaxPositiveDw(
      sec.halfSidePos,
      sec.halfSideNeg,
      sec.halfDorsal,
      sec.halfVentral,
      pwr,
      dvRi
    );
    const minDwV = midlineMinNegativeDw(
      sec.halfSidePos,
      sec.halfSideNeg,
      sec.halfDorsal,
      sec.halfVentral,
      pwr,
      dvRi
    );
    const dorsalReach = maxDwD > 0 ? maxDwD + FIN_ROOT_SKIN_NUDGE : sec.halfDorsal;
    const ventralReach = minDwV < 0 ? minDwV - FIN_ROOT_SKIN_NUDGE : -sec.halfVentral;
    const dorsalRootX = bx + dorsalReach * ux;
    const dorsalRootY = by + dorsalReach * uy;
    const dorsalRootZ = bz + dorsalReach * uz;
    const ventralRootX = bx + ventralReach * ux;
    const ventralRootY = by + ventralReach * uy;
    const ventralRootZ = bz + ventralReach * uz;

    if (o.showFinDorsal && out.size < voxelCap) {
      const dMin = finB.dorsal.min;
      const dMax =
        o.finDorsalMode === 'ribbon'
          ? Math.max(finB.dorsal.max, tailP.tStart - 0.02)
          : finB.dorsal.max;
      const dCenterBase = (dMin + dMax) * 0.5;
      const dCenter = Math.max(0.04, Math.min(0.96, dCenterBase + o.finDorsalPosition));
      const dHalfBase = (dMax - dMin) * 0.5;
      const dHalf = Math.max(0.07, dHalfBase * o.finDorsalLength);
      const envH = Math.max(0, 1 - Math.abs(t - dCenter) / dHalf);
      if (envH <= 0) {
        // Dorsal length/position now define fin occupancy along t; skip outside envelope.
      } else {
        const envMode = medianFinHeightEnvelope(envH, o.finDorsalMode);
        const finH = Math.max(1, Math.ceil(envMode * dorsalHeightRef(W, T) * 0.44 * mulD));
        const peak = dorsalBaseWing(mulD);
        let d0x = ux,
          d0y = uy,
          d0z = uz;
        [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, sx, sy, sz, dorsalPitchR);
        [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, tx, ty, tz, dorsalSweepR);
        for (let layer = 1; layer <= finH; layer++) {
          const wing = medianFinLateralWing(layer, peak, o.finDorsalMode);
          for (let j = -wing; j <= wing; j++) {
            const ox = j * sx * 0.9 + layer * d0x;
            const oy = j * sy * 0.9 + layer * d0y;
            const oz = j * sz * 0.9 + layer * d0z;
            tryAdd(dorsalRootX + ox, dorsalRootY + oy, dorsalRootZ + oz);
          }
        }
      }
    }

    if (o.showFinAdipose && t >= finB.adipose.min && t <= finB.adipose.max && out.size < voxelCap) {
      const adHalf = Math.max(0.04, (finB.adipose.max - finB.adipose.min) * 0.42);
      const envA = Math.max(0, 1 - Math.abs(t - finB.adipose.peak) / adHalf);
      let finAH = Math.max(1, Math.ceil(envA * 2.85 * mulAd));
      if (o.finAdiposeMode === 'rounded') finAH = Math.max(finAH, Math.ceil(finAH * 1.08));
      if (o.finAdiposeMode === 'ribbon') finAH = Math.ceil(finAH * 1.32);
      const a0x = ux,
        a0y = uy,
        a0z = uz;
      const peakAd = dorsalBaseWing(mulAd);
      for (let layer = 1; layer <= finAH; layer++) {
        let wing: number;
        if (o.finAdiposeMode === 'pointed') {
          wing = layer === 1 ? 1 : 0;
        } else {
          wing = medianFinLateralWing(layer, peakAd, o.finAdiposeMode);
        }
        for (let j = -wing; j <= wing; j++) {
          tryAdd(
            dorsalRootX + j * sx * 0.8 + layer * a0x * 0.86,
            dorsalRootY + j * sy * 0.8 + layer * a0y * 0.86,
            dorsalRootZ + j * sz * 0.8 + layer * a0z * 0.86
          );
        }
      }
    }

    if (o.showFinAnal && out.size < voxelCap) {
      const aMin = finB.anal.min;
      const aMax =
        o.finAnalMode === 'ribbon' ? Math.max(finB.anal.max, tailP.tStart - 0.02) : finB.anal.max;
      const aCenter = (aMin + aMax) * 0.5;
      const aHalfBase = (aMax - aMin) * 0.5;
      const aHalf = Math.max(0.06, aHalfBase * o.finAnalLength);
      const envA = Math.max(0, 1 - Math.abs(t - aCenter) / aHalf);
      if (envA <= 0) {
        // Anal length controls envelope along t; skip outside envelope.
      } else {
        const envMode = medianFinHeightEnvelope(envA, o.finAnalMode);
        const finH = Math.ceil(envMode * Math.min(W + T * 0.35, 22) * 0.28 * mulA);
        let d0x = -ux,
          d0y = -uy,
          d0z = -uz;
        [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, sx, sy, sz, -analPitchR);
        const finHLimited = Math.max(1, finH);
        const peakA = dorsalBaseWing(mulA);
        for (let layer = 1; layer <= finHLimited; layer++) {
          const wing = medianFinLateralWing(layer, peakA, o.finAnalMode);
          for (let j = -wing; j <= wing; j++) {
            tryAdd(
              ventralRootX + j * sx * 0.85 + layer * d0x,
              ventralRootY + j * sy * 0.85 + layer * d0y,
              ventralRootZ + j * sz * 0.85 + layer * d0z
            );
          }
        }
      }
    }

    if (o.showFinCaudal && t >= tailP.tStart && out.size < voxelCap) {
      placeCaudalFinVoxels({
        t,
        tailP,
        bx,
        by,
        bz,
        tx,
        ty,
        tz,
        ux,
        uy,
        uz,
        sx,
        sy,
        sz,
        L,
        W,
        mulC,
        forkSign,
        caudalSpreadR,
        tryAdd
      });
    }

    if (
      o.showFinPectoral &&
      t >= finB.pectoral.min &&
      t <= finB.pectoral.max &&
      out.size < voxelCap
    ) {
      const pRad = Math.max(0.055, (finB.pectoral.max - finB.pectoral.min) * 0.42);
      const pec = Math.max(
        0,
        (1 - Math.abs(t - finB.pectoral.peak) / pRad) * 3.85 * mulP * pecShape.envelopeMul
      );
      if (pec > 0.2) {
        const pecSteps = Math.max(1, Math.min(18, Math.round(2.2 * mulP * pecShape.reachMul)));
        const fanR = Math.max(1, Math.min(9, Math.round(pecShape.fanRows)));
        const uStep = 0.22 * pecShape.uFanScale;
        for (const dir of [-1, 1] as const) {
          const sSkin = dir > 0 ? sec.halfSidePos : sec.halfSideNeg;
          const latMul = pecShape.lateralAttachMul;
          let pecRx = bx + dir * sSkin * latMul * sx;
          let pecRy = by + dir * sSkin * latMul * sy;
          let pecRz = bz + dir * sSkin * latMul * sz;
          const belly = pecShape.rootBellyBias + pecShape.ventralDropAdd;
          pecRx -= ux * belly * 0.46;
          pecRy -= uy * belly * 0.46;
          pecRz -= uz * belly * 0.46;
          let lx = sx,
            ly = sy,
            lz = sz;
          [lx, ly, lz] = rotateAroundAxis(lx, ly, lz, tx, ty, tz, dir * pectoralCantR);
          [lx, ly, lz] = rotateAroundAxis(lx, ly, lz, ux, uy, uz, dir * pectoralSweepR);
          const hb = pecShape.hangBackDeg * toRad;
          const hd = pecShape.hangDownDeg * toRad;
          [lx, ly, lz] = rotateAroundAxis(lx, ly, lz, tx, ty, tz, hb);
          [lx, ly, lz] = rotateAroundAxis(lx, ly, lz, sx, sy, sz, hd);
          for (let a = 1; a <= pecSteps; a++) {
            /** Half of a sin^π envelope along the outboard ray → corn-kernel / elongated oval. */
            const sAlong = a / (pecSteps + 1);
            const kernelW = Math.pow(
              Math.sin(Math.PI * sAlong),
              Math.max(0.35, pecShape.kernelPinch)
            );
            for (let b = 0; b < fanR; b++) {
              const mid = (fanR - 1) * 0.5;
              const uOff = (b - mid) * uStep * kernelW;
              const trail = (b * pecShape.trailPerRow + a * pecShape.trailAlongStep) * kernelW;
              tryAdd(
                pecRx + dir * a * 0.9 * lx + uOff * ux - trail * tx,
                pecRy + dir * a * 0.9 * ly + uOff * uy - trail * ty,
                pecRz + dir * a * 0.9 * lz + uOff * uz - trail * tz
              );
            }
          }
        }
      }
    }

    if (o.showFinPelvic && t >= finB.pelvic.min && t <= finB.pelvic.max && out.size < voxelCap) {
      const pvHalf = Math.max(0.06, (finB.pelvic.max - finB.pelvic.min) * 0.45);
      const finPH0 = Math.ceil(
        (1 - Math.abs(t - finB.pelvic.peak) / pvHalf) * Math.min(W + T * 0.28, 18) * 0.24 * mulPv
      );
      const phMul = o.finPelvicMode === 'ribbon' ? 1.22 : o.finPelvicMode === 'rounded' ? 1.08 : 1;
      const finPH = Math.max(1, Math.ceil(finPH0 * phMul));
      const peakPv = dorsalBaseWing(mulPv);
      for (const dir of [-1, 1] as const) {
        const cap = dir > 0 ? sec.halfSidePos : sec.halfSideNeg;
        let dvUse = dir * cap * 0.52;
        let dwAtLat = minNegativeDwAtDv(
          dvUse,
          sec.halfSidePos,
          sec.halfSideNeg,
          sec.halfDorsal,
          sec.halfVentral,
          pwr,
          dvRi
        );
        if (dwAtLat >= 0) {
          dvUse *= 0.5;
          dwAtLat = minNegativeDwAtDv(
            dvUse,
            sec.halfSidePos,
            sec.halfSideNeg,
            sec.halfDorsal,
            sec.halfVentral,
            pwr,
            dvRi
          );
        }
        const dwSkin = dwAtLat < 0 ? dwAtLat - FIN_ROOT_SKIN_NUDGE : ventralReach;
        if (dwAtLat >= 0) {
          dvUse = 0;
        }
        const px0 = bx + dvUse * sx + dwSkin * ux;
        const py0 = by + dvUse * sy + dwSkin * uy;
        const pz0 = bz + dvUse * sz + dwSkin * uz;
        let d0x = -ux * 0.78 + dir * sx * 0.45;
        let d0y = -uy * 0.78 + dir * sy * 0.45;
        let d0z = -uz * 0.78 + dir * sz * 0.45;
        [d0x, d0y, d0z] = normalize3(d0x, d0y, d0z);
        for (let layer = 1; layer <= Math.max(1, finPH); layer++) {
          let wing = medianFinLateralWing(layer, peakPv, o.finPelvicMode);
          if (o.finPelvicMode === 'rounded' && layer === 1) wing = Math.min(2, wing + 1);
          if (o.finPelvicMode === 'ribbon' && layer <= 2)
            wing = Math.max(wing, Math.min(2, peakPv));
          for (let j = -wing; j <= wing; j++) {
            tryAdd(
              px0 + j * sx * 0.52 + layer * d0x * 0.92,
              py0 + j * sy * 0.52 + layer * d0y * 0.92,
              pz0 + j * sz * 0.52 + layer * d0z * 0.92
            );
          }
        }
      }
    }
  }
}

type CaudalCtx = {
  t: number;
  tailP: PiscinaTailParams;
  bx: number;
  by: number;
  bz: number;
  tx: number;
  ty: number;
  tz: number;
  ux: number;
  uy: number;
  uz: number;
  sx: number;
  sy: number;
  sz: number;
  L: number;
  W: number;
  mulC: number;
  forkSign: number;
  caudalSpreadR: number;
  tryAdd: (x: number, y: number, z: number) => void;
};

function placeCaudalFinVoxels(ctx: CaudalCtx): void {
  const {
    t,
    tailP,
    bx,
    by,
    bz,
    tx,
    ty,
    tz,
    ux,
    uy,
    uz,
    sx,
    sy,
    sz,
    L,
    W,
    mulC,
    forkSign,
    caudalSpreadR,
    tryAdd
  } = ctx;
  /** Posterior skin offset along +t (tuned with discrete body shell so the tail meets the peduncle). */
  const caudalSkin = Math.min(0.42, 0.09 + 0.01 * L);
  const rx = bx + caudalSkin * tx;
  const ry = by + caudalSkin * ty;
  const rz = bz + caudalSkin * tz;
  const mode = tailP.mode;
  const tailStr = (t - tailP.tStart) / Math.max(0.06, 1 - tailP.tStart);
  const spanMul = tailP.spanMul;
  const depthMul = tailP.depthMul;

  let forkWeak = 0.58;
  let gapCenter = true;
  let spanBoost = 1;
  let backScale = 1;
  /** Clear voxels with |j| below this fraction of spanHere (center V-notch); wider = deeper chevron. */
  let gapHalfSpan = 0.22;
  /** Drop lateral samples past this normalized |j| (1 = edge of span); higher keeps a squarer trailing edge. */
  let outerJ2Cutoff = 0.88;

  if (mode === 'lunate') {
    /** Scombrid-style: symmetric lobes, crescent trailing edge (notch deepens aft), rearward sweep at tips. */
    forkWeak = 0.99;
    gapCenter = true;
    spanBoost = 1.18;
    backScale = 1;
    gapHalfSpan = 0.5;
    outerJ2Cutoff = 0.96;
  } else if (mode === 'deepFork') {
    forkWeak = 0.48;
    gapCenter = true;
    spanBoost = 1.06;
  } else if (mode === 'truncate') {
    forkWeak = 0.94;
    gapCenter = false;
    spanBoost = 0.92;
    backScale = 0.78;
  } else if (mode === 'rounded') {
    forkWeak = 0.88;
    gapCenter = false;
    spanBoost = 0.98;
    backScale = 0.88;
  }

  const span = Math.max(
    1,
    Math.ceil(
      (1.2 + tailStr * finLateralSpanRef(W) * 0.5 + tailStr * Math.min(L, 48) * 0.028) *
        mulC *
        0.72 *
        spanMul *
        spanBoost
    )
  );
  const lunateDepthMul = mode === 'lunate' ? 1.12 : 1;
  const maxBack = Math.max(
    1,
    Math.min(
      Math.ceil((L * 0.12 + 4 * mulC) * backScale),
      Math.floor((1.35 + tailStr * 1.65) * mulC * 0.85 * depthMul * lunateDepthMul + 1)
    )
  );
  const spreadHalf = caudalSpreadR * 0.5;

  for (let back = 1; back <= maxBack; back++) {
    const backT = maxBack <= 1 ? 1 : (back - 1) / Math.max(1, maxBack - 1);
    const spanTaperDefault = 0.35 + 0.65 * (1 - backT * 0.55);
    /** Lunate: narrow at peduncle, widest at trailing edge (crescent/chevron silhouette). */
    const spanTaperLunate = 0.24 + 0.76 * backT;
    const spanTaper = mode === 'lunate' ? spanTaperLunate : spanTaperDefault;
    const spanHere = Math.max(1, Math.round(span * spanTaper));
    /** Crescent: center carve grows with backT so the rear edge curves inward (yellowfin reference). */
    const centerGapFrac = mode === 'lunate' ? gapHalfSpan * (0.38 + 0.62 * backT) : gapHalfSpan;
    const jEdgeCut =
      mode === 'lunate' ? Math.min(0.995, outerJ2Cutoff + 0.04 * backT * backT) : outerJ2Cutoff;

    for (let j = -spanHere; j <= spanHere; j++) {
      const jn = spanHere > 0 ? Math.abs(j) / spanHere : 0;
      if (jn * jn > jEdgeCut) continue;
      const fork = j * forkSign >= 0 ? 1 : forkWeak;
      if (gapCenter && Math.abs(j) < spanHere * centerGapFrac && back > 1) continue;
      let ox = back * tx * 0.92 + j * ux * fork * 0.95;
      let oy = back * ty * 0.92 + j * uy * fork * 0.95;
      let oz = back * tz * 0.92 + j * uz * fork * 0.95;
      if (j !== 0 && spanHere > 0) {
        const forkScale = mode === 'lunate' ? 0.52 : 0.42;
        const forkN = (Math.abs(j) / spanHere) * forkScale * fork;
        ox += forkN * sx * forkSign * Math.sign(j);
        oy += forkN * sy * forkSign * Math.sign(j);
        oz += forkN * sz * forkSign * Math.sign(j);
      }
      /** Tip + trailing rows: bias along +t so lobes sweep back like a sickle tail. */
      if (mode === 'lunate') {
        const sweep = backT * (0.12 + 0.62 * jn * jn);
        ox += sweep * tx;
        oy += sweep * ty;
        oz += sweep * tz;
      }
      const signRot = j >= 0 ? 1 : -1;
      [ox, oy, oz] = rotateAroundAxis(ox, oy, oz, tx, ty, tz, signRot * spreadHalf * fork);
      tryAdd(rx + ox, ry + oy, rz + oz);
    }
  }
}

export function getPiscinaPositions(
  seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GeneratePiscinaOptions
): [number, number, number][] {
  const o = clampOptions(options);
  const frame = buildPiscinaFrame(place, normal, options);
  const rng = createRng(seed ^ 0x9e3779b9);
  const cap = computePiscinaVoxelCap(o.length, o.width, o.thickness);
  const map = new Map<string, [number, number, number]>();
  collectFishVoxels(frame, options, map, rng, cap);
  return [...map.values()];
}

export function generatePiscinaVoxels(
  seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GeneratePiscinaOptions,
  getVoxel: () => Voxel
): Map<string, Voxel> {
  const o = clampOptions(options);
  const frame = buildPiscinaFrame(place, normal, options);
  const rng = createRng(seed ^ 0x9e3779b9);
  const cap = computePiscinaVoxelCap(o.length, o.width, o.thickness);
  const map = new Map<string, [number, number, number]>();
  collectFishVoxels(frame, options, map, rng, cap);
  const out = new Map<string, Voxel>();
  const base = cloneVoxel(getVoxel());
  for (const key of map.keys()) {
    out.set(key, cloneVoxel(base));
  }
  return out;
}
