import { smoothstep } from '../mathUtils';
import type { FishSpeciesId } from '../../../core';
import type { SpeciesOutlineFn } from '../types';

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

function upFromThickness(
  u: number,
  p: number,
  tail: number,
  k: number,
  minUp: number
): number {
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

export const outlineMinnow: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const belly = Math.exp(-Math.pow((t - 0.4) / 0.2, 2));
  const trunk = 0.65 * trunkEnvelope(t) * (0.38 + belly * 0.62) * peduncleNarrow(t);
  const base = Math.max(trunk, headHump(t, 0.38, 0.1, 0.09));
  const tail = tailFlare(t, 0.22);
  const halfSide = Math.max(0.42, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.82, 0.35);
  return { halfSide, halfUp };
};

export const outlineTrout: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const belly = Math.exp(-Math.pow((t - 0.38) / 0.22, 2));
  const trunk = 0.62 * trunkEnvelope(t) * (0.35 + belly * 0.65) * peduncleNarrow(t);
  const head = headHump(t, 0.42, 0.13, 0.11);
  const base = Math.max(trunk, head);
  const tailAmp = 0.28 * Math.min(1, 6 / Math.max(W, 2));
  const tail = tailFlare(t, tailAmp);
  const halfSide = Math.max(0.45, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.82, 0.35);
  return { halfSide, halfUp };
};

/** Deep, disk-like lateral compression — intentionally wide. */
export const outlineSunfish: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const deep = Math.exp(-Math.pow((t - 0.35) / 0.35, 2)) * 0.45 + 0.55;
  const trunk = 0.65 * trunkEnvelope(t) * deep * (0.55 + smoothstep(0, 0.14, t) * 0.25);
  const base = Math.max(trunk, headHump(t, 0.42, 0.12, 0.1)) * peduncleNarrow(t);
  const tail = tailFlare(t, 0.15);
  const halfSide = Math.max(0.48, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.88, 0.42);
  return { halfSide, halfUp };
};

/** Uniform slender cylinder with slow taper. */
export const outlineEel: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const taper = 1 - smoothstep(0.88, 1, t) * 0.35;
  const head = smoothstep(0, 0.12, t);
  const p = 0.48 * head * taper;
  const halfSide = Math.max(0.32, w * p);
  const halfUp = upFromThickness(u, p, 0, 0.72, 0.3);
  return { halfSide, halfUp };
};

/**
 * Bass: slightly deeper than trout, widest in a broad band behind the head — smooth
 * curves only (no stacked narrow Gaussians + extra vertical gain; that reads as a diamond).
 */
export const outlineBass: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const midDepth = Math.exp(-Math.pow((t - 0.24) / 0.26, 2)) * 0.26;
  const belly = Math.exp(-Math.pow((t - 0.44) / 0.24, 2)) * 0.32;
  const trunk =
    0.58 * trunkEnvelope(t) * peduncleNarrow(t) * (0.4 + midDepth + belly);
  const head = headHump(t, 0.46, 0.12, 0.12);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.22);
  const halfSide = Math.max(0.48, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.86, 0.36);
  return { halfSide, halfUp };
};

/** Tall perch profile. */
export const outlinePerch: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const tall = 0.12 * Math.exp(-Math.pow((t - 0.32) / 0.2, 2));
  const trunk = 0.6 * trunkEnvelope(t) * (0.4 + tall + Math.exp(-Math.pow((t - 0.45) / 0.22, 2)) * 0.28);
  const head = headHump(t, 0.42, 0.13, 0.11);
  const base = Math.max(trunk, head) * peduncleNarrow(t);
  const tail = tailFlare(t, 0.22);
  const halfSide = Math.max(0.46, w * base + w * tail);
  const dorsalBoost = 1 + 0.18 * Math.exp(-Math.pow((t - 0.28) / 0.16, 2));
  const halfUp = upFromThickness(u, base, tail, 0.8 * dorsalBoost, 0.38);
  return { halfSide, halfUp };
};

/** High arched back (carp). */
export const outlineCarp: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const hump = Math.exp(-Math.pow((t - 0.26) / 0.18, 2)) * 0.35;
  const belly = Math.exp(-Math.pow((t - 0.48) / 0.24, 2)) * 0.3;
  const trunk = 0.6 * trunkEnvelope(t) * (0.38 + hump + belly) * peduncleNarrow(t);
  const head = headHump(t, 0.42, 0.13, 0.11);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.2);
  const halfSide = Math.max(0.5, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.82, 0.4);
  return { halfSide, halfUp };
};

/** Long snout, elongate trunk — pike keeps a narrower, longer head. */
export const outlinePike: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const rostrum = smoothstep(0, 0.22, t);
  const narrowHead = 0.55 + 0.45 * smoothstep(0.12, 0.28, t);
  const belly = Math.exp(-Math.pow((t - 0.45) / 0.26, 2)) * 0.45;
  const base =
    0.15 * rostrum +
    0.55 * trunkEnvelope(t) * (0.32 + belly) * narrowHead * peduncleNarrow(t);
  const tail = tailFlare(t, 0.32);
  const halfSide = Math.max(0.4, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.62, 0.32);
  return { halfSide, halfUp };
};

/** Flattened: wide side, very thin along "up" (lying on substrate). */
export const outlineFlatfish: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const trunk = 0.65 * trunkEnvelope(t) * (0.5 + Math.exp(-Math.pow((t - 0.42) / 0.28, 2)) * 0.35) * peduncleNarrow(t);
  const base = Math.max(trunk, headHump(t, 0.38, 0.11, 0.09));
  const tail = tailFlare(t, 0.15);
  const halfSide = Math.max(0.52, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.32, 0.22);
  return { halfSide, halfUp };
};

/** Streamlined tuna: tapered head, narrow peduncle. */
export const outlineTuna: SpeciesOutlineFn = (t, W, T) => {
  const w = W * 0.5;
  const u = T * 0.5;
  const ped = 1 - smoothstep(0.62, 0.9, t) * 0.55;
  const belly = Math.exp(-Math.pow((t - 0.5) / 0.3, 2)) * 0.28;
  const trunk = 0.58 * trunkEnvelope(t) * (0.36 + belly) * ped;
  const head = headHump(t, 0.36, 0.1, 0.08);
  const base = Math.max(trunk, head);
  const tail = tailFlare(t, 0.15);
  const halfSide = Math.max(0.38, w * base + w * tail);
  const halfUp = upFromThickness(u, base, tail, 0.75, 0.32);
  return { halfSide, halfUp };
};

export const SPECIES_OUTLINES: Record<FishSpeciesId, SpeciesOutlineFn> = {
  minnow: outlineMinnow,
  trout: outlineTrout,
  sunfish: outlineSunfish,
  eel: outlineEel,
  bass: outlineBass,
  perch: outlinePerch,
  carp: outlineCarp,
  pike: outlinePike,
  flatfish: outlineFlatfish,
  tuna: outlineTuna
};
