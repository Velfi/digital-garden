import type { FaceNormal, FishSpeciesId } from '../../core';

/** One station along the body (t = 0 nose … 1 tail). */
export type PiscinaOutlineSample = {
  /** Lateral half-extent (symmetric default); see halfSidePos/Neg for asymmetry. */
  halfSide: number;
  /** Max dorsoventral half-extent; used for bounds, fins, and legacy tests. */
  halfUp: number;
  /** Half-extent along +body up (dorsal / back). */
  halfDorsal: number;
  /** Half-extent along −body up (belly). */
  halfVentral: number;
  /** Superellipse exponent in cross-section (2 = ellipse; <2 rounder, >2 squarer). */
  sectionPower: number;
  /** Shift section along +tangent (toward tail); negative pulls snout forward. Scaled by W in pipeline. */
  lateralSkew: number;
  /** Lateral half-extent for dv ≥ 0 (along +side). */
  halfSidePos: number;
  /** Lateral half-extent for dv < 0. */
  halfSideNeg: number;
};

export type PiscinaTailMode = 'fork' | 'deepFork' | 'lunate' | 'truncate' | 'rounded';
/** Caudal tail generator: `species` uses `SPECIES_TAIL_PARAMS[species]`; otherwise overrides `mode` only. */
export type PiscinaCaudalTailModeSetting = PiscinaTailMode | 'species';
export type PiscinaMedianFinMode = 'pointed' | 'rounded' | 'ribbon';

export type PiscinaTailParams = {
  mode: PiscinaTailMode;
  /** Caudal fin voxel region begins near this t. */
  tStart: number;
  spanMul: number;
  depthMul: number;
};

export type PiscinaFinBand = { min: number; max: number; peak: number };

/**
 * Species-specific pectoral fin shape (paired with user `finPectoral` scale + cant/sweep).
 * Tuned for compact vs fan-shaped pectorals (see per-species overrides).
 */
export type PiscinaPectoralParams = {
  /** Multiplier on lateral ray step count. */
  reachMul: number;
  /** Multiplier on the triangular envelope along the body (fin “height” along t). */
  envelopeMul: number;
  /** Rows of voxels fanned along body up (+/−u from mid-flank). */
  fanRows: number;
  /** Scales spacing between fan rows along u. */
  uFanScale: number;
  /** Offset along −t between consecutive fan rows (trailing edge separation). */
  trailPerRow: number;
  /** Extra −t offset per lateral step (flowing tailward edge). */
  trailAlongStep: number;
  /** Shifts attachment toward belly (−u), voxel-scale-ish (0…0.45). */
  rootBellyBias: number;
  /**
   * Exponent on sin(π·s) width taper along the outboard ray (s = step / (steps+1)).
   * >1 yields a narrower root/tip “corn kernel” oval; 1 is a soft ellipse.
   */
  kernelPinch: number;
  /** 0–1: pull attachment in from the lateral skin (less “stuck straight out”). */
  lateralAttachMul: number;
  /** Extra ventral shift along with `rootBellyBias` (attachment lower on the flank). */
  ventralDropAdd: number;
  /** Degrees: tailward tilt after user cant/sweep (rotation around spine tangent T). */
  hangBackDeg: number;
  /** Degrees: ventral tilt (rotation around local lateral S). */
  hangDownDeg: number;
};

export type GeneratePiscinaOptions = {
  species: FishSpeciesId;
  length: number;
  width: number;
  thickness: number;
  finDorsal: number;
  finAnal: number;
  finCaudal: number;
  finPectoral: number;
  /** Paired pelvic (ventral) fins — scale like other fins. */
  finPelvic: number;
  /** Small adipose fin (dorsal, behind main dorsal) — salmonid-style. */
  finAdipose: number;
  showFinDorsal: boolean;
  showFinAnal: boolean;
  showFinCaudal: boolean;
  showFinPectoral: boolean;
  showFinPelvic: boolean;
  showFinAdipose: boolean;
  anchorOffsetU: number;
  anchorOffsetV: number;
  /** -1…1 lateral bend amplitude (pipeline scales by W). */
  spineBend: number;
  /** -1…1 secondary lateral / vertical wave. */
  spineSCurve: number;
  /** Fin orientations in degrees (-45…45), applied in local body frame at fin anchor. */
  finDorsalPitch: number;
  finDorsalSweep: number;
  finAnalPitch: number;
  finDorsalMode: PiscinaMedianFinMode;
  finAnalMode: PiscinaMedianFinMode;
  finCaudalMode: PiscinaCaudalTailModeSetting;
  finPectoralMode: PiscinaMedianFinMode;
  finPelvicMode: PiscinaMedianFinMode;
  finAdiposeMode: PiscinaMedianFinMode;
  /** Multiplier for dorsal fin base length along nose→tail axis. */
  finDorsalLength: number;
  /** Multiplier for anal fin base length along nose→tail axis. */
  finAnalLength: number;
  /** Shift dorsal fin center along nose→tail axis (negative=headward, positive=tailward). */
  finDorsalPosition: number;
  finCaudalSpread: number;
  finPectoralCant: number;
  /** Yaw around body up: fin tips toward head (−) or tail (+), degrees. */
  finPectoralSweep: number;
};

export type PiscinaPresetNumericFields = {
  length: number;
  /** Half-width along the lateral tangent (pectoral line). */
  width: number;
  /** Half-thickness along the face normal (belly ↔ back). */
  thickness: number;
  finDorsal: number;
  finAnal: number;
  finCaudal: number;
  finPectoral: number;
  finPelvic: number;
  finAdipose: number;
  anchorOffsetU: number;
  anchorOffsetV: number;
};

export type SpeciesOutlineFn = (t: number, W: number, T: number) => PiscinaOutlineSample;

export type PiscinaFrame = {
  forward: FaceNormal;
  side: FaceNormal;
  up: FaceNormal;
  center: [number, number, number];
};
