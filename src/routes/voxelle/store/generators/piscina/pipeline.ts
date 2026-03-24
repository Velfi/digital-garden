import { coordKey } from '../../../coordUtils';
import type { FaceNormal } from '../../core';
import type { Voxel } from '../../../voxelMaterial';
import { cloneVoxel } from '../../../voxelMaterial';
import { SPECIES_OUTLINES } from './species';
import type { GeneratePiscinaOptions, PiscinaFrame } from './types';
import { clampInt, cross3, normalize3, rotateAroundAxis } from './mathUtils';

export const PISCINA_VOXEL_CAP_MIN = 2200;
export const PISCINA_VOXEL_CAP_MAX = 52000;

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
  if (nx !== 0) return [[0, 1, 0], [0, 0, 1]];
  if (ny !== 0) return [[1, 0, 0], [0, 0, 1]];
  return [[1, 0, 0], [0, 1, 0]];
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
    width: clampInt(o.width, 2, 32),
    thickness: clampInt(o.thickness, 1, 24),
    finDorsal: clampInt(o.finDorsal, 1, 8),
    finAnal: clampInt(o.finAnal, 1, 8),
    finCaudal: clampInt(o.finCaudal, 1, 8),
    finPectoral: clampInt(o.finPectoral, 1, 8),
    anchorOffsetU: clampInt(o.anchorOffsetU, -24, 24),
    anchorOffsetV: clampInt(o.anchorOffsetV, -24, 24),
    spineBend: Math.max(-1, Math.min(1, o.spineBend)),
    spineSCurve: Math.max(-1, Math.min(1, o.spineSCurve)),
    finDorsalPitch: Math.max(-45, Math.min(45, o.finDorsalPitch)),
    finDorsalSweep: Math.max(-45, Math.min(45, o.finDorsalSweep)),
    finAnalPitch: Math.max(-45, Math.min(45, o.finAnalPitch)),
    finCaudalSpread: Math.max(0, Math.min(45, o.finCaudalSpread)),
    finPectoralCant: Math.max(-45, Math.min(45, o.finPectoralCant))
  };
}

function finMul(scale: number): number {
  return 0.5 + (clampInt(scale, 1, 8) / 8) * 0.95;
}

function finLateralSpanRef(W: number): number {
  return Math.min(18, 3.5 + 0.45 * Math.max(0, W - 2));
}

/** Fin stack extent: dorsal/anal grow along lateral `s`, wing along `u` — use both W and T. */
function dorsalHeightRef(W: number, T: number): number {
  return Math.min(
    14,
    2 + 0.28 * Math.max(0, W - 2) + 0.26 * Math.max(0, T - 2)
  );
}

function dorsalBaseWing(mulD: number): 1 | 2 {
  return Math.min(2, Math.max(1, Math.round(mulD * 1.28))) as 1 | 2;
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

function spineLateralOffset(t: number, W: number, bend: number, sCurve: number): number {
  const amp = bend * Math.min(W, 12) * 0.12;
  const amp2 = sCurve * Math.min(W, 12) * 0.1;
  return (
    amp * Math.sin(t * Math.PI * 1.05) + amp2 * Math.sin(t * Math.PI * 2 * 0.92)
  );
}

function spineVerticalOffset(t: number, W: number, sCurve: number): number {
  return sCurve * Math.min(W, 8) * 0.055 * Math.sin(t * Math.PI * 0.88);
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
    const lat = spineLateralOffset(t, W, o.spineBend, o.spineSCurve);
    const vert = spineVerticalOffset(t, W, o.spineSCurve);
    pxArr[k] = c[0] + ui * fx + lat * s0x + vert * u0x;
    pyArr[k] = c[1] + ui * fy + lat * s0y + vert * u0y;
    pzArr[k] = c[2] + ui * fz + lat * s0z + vert * u0z;
  }

  for (let k = 0; k < L; k++) {
    let ddx: number;
    let ddy: number;
    let ddz: number;
    if (k === 0 && L > 1) {
      ddx = pxArr[1]! - pxArr[0]!;
      ddy = pyArr[1]! - pyArr[0]!;
      ddz = pzArr[1]! - pzArr[0]!;
    } else if (k === L - 1 && L > 1) {
      ddx = pxArr[L - 1]! - pxArr[L - 2]!;
      ddy = pyArr[L - 1]! - pyArr[L - 2]!;
      ddz = pzArr[L - 1]! - pzArr[L - 2]!;
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
    let slen = Math.hypot(sx, sy, sz);
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
  /** Fins: dorsal/anal grow along `u` (dorsoventral), wing along `s`; pec along `s`; caudal span `u`, fork mix `s`. */
  const dorsalPitchR = o.finDorsalPitch * toRad;
  const dorsalSweepR = o.finDorsalSweep * toRad;
  const analPitchR = o.finAnalPitch * toRad;
  const caudalSpreadR = o.finCaudalSpread * toRad;
  const pectoralCantR = o.finPectoralCant * toRad;

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

    const { halfSide: wR, halfUp: tR } = outline(t, W, T);
    const wRi = Math.min(W + 2, Math.ceil(wR) + 1);
    const tRi = Math.min(T + 2, Math.ceil(tR) + 1);

    for (let dv = -wRi; dv <= wRi; dv++) {
      for (let dw = -tRi; dw <= tRi; dw++) {
        const dvN = dv / Math.max(wR, 0.45);
        const dwN = dw / Math.max(tR, 0.35);
        if (dvN * dvN + dwN * dwN > 1) continue;
        const x = px + dv * sx + dw * ux;
        const y = py + dv * sy + dw * uy;
        const z = pz + dv * sz + dw * uz;
        tryAdd(x, y, z);
      }
    }

    if (t > 0.28 && t < 0.45 && out.size < voxelCap) {
      const envH = Math.max(0, 1 - Math.abs(t - 0.365) / 0.095);
      const finH = Math.max(1, Math.ceil(envH * dorsalHeightRef(W, T) * 0.44 * mulD));
      const peak = dorsalBaseWing(mulD);
      let d0x = ux,
        d0y = uy,
        d0z = uz;
      [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, sx, sy, sz, dorsalPitchR);
      [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, tx, ty, tz, dorsalSweepR);
      for (let layer = 1; layer <= finH; layer++) {
        const wing: number =
          layer === 1 ? peak : layer === 2 && peak >= 2 ? 1 : 0;
        for (let j = -wing; j <= wing; j++) {
          const ox = j * sx * 0.9 + layer * d0x;
          const oy = j * sy * 0.9 + layer * d0y;
          const oz = j * sz * 0.9 + layer * d0z;
          tryAdd(px + ox, py + oy, pz + oz);
        }
      }
    }

    if (t > 0.48 && t < 0.72 && out.size < voxelCap) {
      const finH = Math.ceil(
        (1 - Math.abs(t - 0.58) / 0.14) *
          Math.min(W + T * 0.35, 22) *
          0.28 *
          mulA
      );
      let d0x = -ux,
        d0y = -uy,
        d0z = -uz;
      [d0x, d0y, d0z] = rotateAroundAxis(d0x, d0y, d0z, sx, sy, sz, -analPitchR);
      for (let layer = 1; layer <= Math.max(1, finH); layer++) {
        for (let j = -1; j <= 1; j++) {
          tryAdd(
            px + j * sx * 0.85 + layer * d0x,
            py + j * sy * 0.85 + layer * d0y,
            pz + j * sz * 0.85 + layer * d0z
          );
        }
      }
    }

    if (t > 0.82 && out.size < voxelCap) {
      const tailStr = (t - 0.82) / 0.18;
      const span = Math.max(
        1,
        Math.ceil(
          (1.2 + tailStr * finLateralSpanRef(W) * 0.5 + tailStr * Math.min(L, 48) * 0.028) *
            mulC *
            0.72
        )
      );
      const maxBack = Math.max(
        1,
        Math.min(
          Math.ceil(L * 0.12 + 4 * mulC),
          Math.floor((1.35 + tailStr * 1.65) * mulC * 0.85 + 1)
        )
      );
      const spreadHalf = caudalSpreadR * 0.5;
      for (let back = 1; back <= maxBack; back++) {
        const backT = maxBack <= 1 ? 1 : (back - 1) / Math.max(1, maxBack - 1);
        const spanHere = Math.max(1, Math.round(span * (0.35 + 0.65 * (1 - backT * 0.55))));
        for (let j = -spanHere; j <= spanHere; j++) {
          const jn = spanHere > 0 ? Math.abs(j) / spanHere : 0;
          if (jn * jn > 0.88) continue;
          const fork = j * forkSign >= 0 ? 1 : 0.58;
          if (Math.abs(j) < spanHere * 0.22 && back > 1) continue;
          let ox = -back * tx * 0.92 + j * ux * fork * 0.95;
          let oy = -back * ty * 0.92 + j * uy * fork * 0.95;
          let oz = -back * tz * 0.92 + j * uz * fork * 0.95;
          if (j !== 0 && spanHere > 0) {
            const forkN = (Math.abs(j) / spanHere) * 0.42 * fork;
            ox += forkN * sx * forkSign * Math.sign(j);
            oy += forkN * sy * forkSign * Math.sign(j);
            oz += forkN * sz * forkSign * Math.sign(j);
          }
          const signRot = j >= 0 ? 1 : -1;
          [ox, oy, oz] = rotateAroundAxis(ox, oy, oz, tx, ty, tz, signRot * spreadHalf * fork);
          tryAdd(px + ox, py + oy, pz + oz);
        }
      }
    }

    if (t > 0.14 && t < 0.32 && out.size < voxelCap) {
      const pec = (0.28 - Math.abs(t - 0.23)) * 4 * mulP;
      if (pec > 0.2) {
        const pecSteps = Math.max(1, Math.min(12, Math.round(2.2 * mulP)));
        for (const dir of [-1, 1] as const) {
          let lx = sx,
            ly = sy,
            lz = sz;
          [lx, ly, lz] = rotateAroundAxis(lx, ly, lz, tx, ty, tz, dir * pectoralCantR);
          for (let a = 1; a <= pecSteps; a++) {
            for (let b = 0; b < 2; b++) {
              tryAdd(
                px + dir * (wR + a * 0.9) * lx - b * 0.35 * tx,
                py + dir * (wR + a * 0.9) * ly - b * 0.35 * ty,
                pz + dir * (wR + a * 0.9) * lz - b * 0.35 * tz
              );
            }
          }
        }
      }
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
