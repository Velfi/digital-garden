import { smoothstep } from '../mathUtils';
import type { FishSpeciesId } from '../../../core';
import type { PiscinaOutlineSample, SpeciesOutlineFn } from '../types';

function sample(
  halfSide: number,
  halfUp: number,
  extra?: Partial<
    Pick<
      PiscinaOutlineSample,
      'halfDorsal' | 'halfVentral' | 'sectionPower' | 'lateralSkew' | 'halfSidePos' | 'halfSideNeg'
    >
  >
): PiscinaOutlineSample {
  const hd = extra?.halfDorsal ?? halfUp;
  const hv = extra?.halfVentral ?? halfUp;
  const hs = halfSide;
  return {
    halfSide: hs,
    halfUp: Math.max(hd, hv),
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: extra?.sectionPower ?? 2,
    lateralSkew: extra?.lateralSkew ?? 0,
    halfSidePos: extra?.halfSidePos ?? hs,
    halfSideNeg: extra?.halfSideNeg ?? hs
  };
}

/** Shared fusiform pieces (t = head 0 → tail 1). */
function trunkEnvelope(t: number): number {
  return smoothstep(0.04, 0.18, t) * (1 - smoothstep(0.68, 0.92, t));
}

function peduncleNarrow(t: number): number {
  return 1 - smoothstep(0.72, 0.92, t) * 0.92;
}

function tailFlare(t: number, amp: number): number {
  return amp * smoothstep(0.86, 1, t);
}

function upFromThickness(u: number, p: number, tail: number, k: number, minUp: number): number {
  const raw = u * (p + tail) * k;
  const uFloor = u >= 2 ? 0.18 * u : 0;
  return Math.max(minUp, raw, uFloor);
}

/**
 * Smooth convex head curve: Gaussian centered at `peak` with width `sigma`.
 * Returns a profile fraction (0–amp); multiplied by w elsewhere to get voxel extents.
 */
function headHump(t: number, amp: number, peak = 0.12, sigma = 0.1): number {
  const snout = smoothstep(0, 0.05, t);
  return amp * snout * Math.exp(-Math.pow((t - peak) / sigma, 2));
}

/** Belly-heavy dorsoventral split (fuller ventral / opercular region). */
function bellyVentralBoost(t: number, baseUp: number, amt: number): { hd: number; hv: number } {
  const belly = Math.exp(-Math.pow((t - 0.42) / 0.26, 2));
  const hv = baseUp * (1 + belly * amt);
  const hd = baseUp * (1 - belly * amt * 0.35);
  return { hd, hv };
}

export const outlineTrout: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const belly = Math.exp(-Math.pow((t - 0.38) / 0.22, 2));
  const trunk = 0.64 * trunkEnvelope(t) * (0.4 + belly * 0.68) * peduncleNarrow(t);
  const head = headHump(t, 0.43, 0.13, 0.11);
  const base = Math.max(trunk, head);
  const tailAmp = 0.28 * Math.min(1, 6 / Math.max(W, 2));
  const tail = tailFlare(t, tailAmp);
  const snoutFade = smoothstep(0, 0.06, t);
  const halfSide = Math.max(0.45 * snoutFade, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.88, 0.39) * snoutFade;
  let { hd, hv } = bellyVentralBoost(t, halfUp, 0.2);
  const snoutNarrow = Math.exp(-Math.pow((t - 0.06) / 0.12, 2));
  hd *= 1 - snoutNarrow * 0.09;
  hv *= 1 + snoutNarrow * 0.07;
  const snoutSkew = -0.95 * Math.exp(-Math.pow((t - 0.05) / 0.11, 2)) * smoothstep(0.02, 0.16, t);
  return sample(halfSide, halfUp, {
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: 1.95,
    lateralSkew: snoutSkew
  });
};

/** Slender taper: slight bullet head + caudal taper (avoids a perfect cylinder brick). */
export const outlineEel: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const head = smoothstep(0, 0.1, t);
  const taper = 1 - smoothstep(0.82, 1, t) * 0.46;
  const p = (0.5 + 0.06 * Math.exp(-Math.pow((t - 0.2) / 0.2, 2))) * head * taper;
  const halfSide = Math.max(0.34, w * p);
  const halfUp = upFromThickness(u, p, 0, 0.78, 0.34);
  const sn = smoothstep(0, 0.14, t) * (1 - smoothstep(0.12, 0.22, t));
  const hd = halfUp * (1 - sn * 0.07);
  const hv = halfUp * (1 + sn * 0.05);
  return sample(halfSide, halfUp, {
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: 2.16,
    lateralSkew: -0.32 * smoothstep(0, 0.1, t) * (1 - smoothstep(0.08, 0.2, t))
  });
};

/**
 * Bass: slightly deeper than trout, widest in a broad band behind the head — smooth
 * curves only (no stacked narrow Gaussians + extra vertical gain; that reads as a diamond).
 */
export const outlineBass: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const midDepth = Math.exp(-Math.pow((t - 0.24) / 0.26, 2)) * 0.3;
  const belly = Math.exp(-Math.pow((t - 0.44) / 0.24, 2)) * 0.37;
  const trunk = 0.6 * trunkEnvelope(t) * peduncleNarrow(t) * (0.45 + midDepth + belly);
  const head = headHump(t, 0.47, 0.125, 0.12);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.22);
  const snoutFade = smoothstep(0, 0.06, t);
  const halfSide = Math.max(0.48 * snoutFade, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.9, 0.39) * snoutFade;
  let { hd, hv } = bellyVentralBoost(t, halfUp, 0.18);
  const snoutNarrow = Math.exp(-Math.pow((t - 0.07) / 0.14, 2));
  hd *= 1 - snoutNarrow * 0.08;
  hv *= 1 + snoutNarrow * 0.06;
  return sample(halfSide, halfUp, {
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: 1.92,
    /** Softer, wider snout pull than early piscina curves — pairs with spine T-bridging in pipeline. */
    lateralSkew: -0.36 * Math.exp(-Math.pow((t - 0.08) / 0.17, 2))
  });
};

/**
 * Pelagic tuna: thick fusiform midbody, tapered snout, tighter peduncle aft — reads as tuna not pipefish.
 */
export const outlineTuna: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  /** Peduncle pinch stays strong aft; midbody uses fuller belly/shoulder so profile isn’t uniformly thin. */
  const ped = 1 - smoothstep(0.52, 0.92, t) * 0.58;
  const belly = Math.exp(-Math.pow((t - 0.52) / 0.26, 2)) * 0.48;
  const shoulder = Math.exp(-Math.pow((t - 0.24) / 0.19, 2)) * 0.28;
  const trunk = 0.62 * trunkEnvelope(t) * (0.46 + belly + shoulder) * ped;
  const head = headHump(t, 0.38, 0.095, 0.088);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.12);
  const snoutFade = smoothstep(0, 0.06, t);
  const halfSide = Math.max(0.44 * snoutFade, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.9, 0.4) * snoutFade;
  const snoutNarrow = Math.exp(-Math.pow((t - 0.045) / 0.085, 2));
  const hd = halfUp * (0.97 - snoutNarrow * 0.08);
  const hv = halfUp * (1.05 + snoutNarrow * 0.06);
  return sample(halfSide, halfUp, {
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: 2.35,
    lateralSkew: -0.88 * Math.exp(-Math.pow((t - 0.05) / 0.09, 2))
  });
};

/** Rounded cyprinid: deep midsection, shorter snout than trout. */
export const outlineGoldfish: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const pedSoft = 1 - smoothstep(0.72, 0.94, t) * 0.5;
  const hump = Math.exp(-Math.pow((t - 0.27) / 0.2, 2)) * 0.34;
  const belly = Math.exp(-Math.pow((t - 0.52) / 0.23, 2)) * 0.56;
  const trunk = 0.68 * trunkEnvelope(t) * (0.36 + hump + belly) * pedSoft;
  const head = headHump(t, 0.44, 0.11, 0.095);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.2);
  const snoutFade = smoothstep(0, 0.06, t);
  const halfSide = Math.max(0.54 * snoutFade, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.92, 0.46) * snoutFade;
  const dorsalArch = Math.exp(-Math.pow((t - 0.28) / 0.24, 2));
  const snoutNarrow = Math.exp(-Math.pow((t - 0.08) / 0.1, 2));
  const hd = halfUp * (1 + dorsalArch * 0.24 - snoutNarrow * 0.07);
  const bellyBoost = Math.exp(-Math.pow((t - 0.52) / 0.22, 2));
  const hv = halfUp * (1 + bellyBoost * 0.4);
  return sample(halfSide, halfUp, {
    halfDorsal: hd,
    halfVentral: hv,
    sectionPower: 1.58,
    lateralSkew: -0.42 * Math.exp(-Math.pow((t - 0.09) / 0.14, 2))
  });
};

export const SPECIES_OUTLINES: Record<FishSpeciesId, SpeciesOutlineFn> = {
  bass: outlineBass,
  trout: outlineTrout,
  goldfish: outlineGoldfish,
  tuna: outlineTuna,
  eel: outlineEel
};
