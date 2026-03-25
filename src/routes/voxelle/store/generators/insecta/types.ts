import type { ArticulatedLeg2 } from '../articulatedLeg';

export type InsectaSpeciesId = 'bee' | 'dragonfly' | 'grasshopper' | 'fly' | 'junebug';
export type { ArticulatedLeg2 };

/** Options for procedural insect placement on a face (mirrored appendages). */
export type GenerateInsectaOptions = {
  species: InsectaSpeciesId;
  totalLength: number;
  headRatio: number;
  thoraxRatio: number;
  abdomenRatio: number;
  bodyHalfWidth: number;
  bodyHalfHeight: number;
  abdomenTaper: number;
  /** 0 = squarish/blocky head, 100 = narrow snout / triangular or heart-like profile. */
  headShape: number;
  anchorOffsetU: number;
  anchorOffsetV: number;
  bodyYaw: number;
  bodyArch: number;
  /** Front / mid / hind pairs: hip on body (U,V), knee and foot as frame offsets (f,s,u). */
  legFront: ArticulatedLeg2;
  legMid: ArticulatedLeg2;
  legHind: ArticulatedLeg2;
  antennaLength: number;
  antennaSpread: number;
  antennaPitch: number;
  antennaRoot: number;
  mandibleLength: number;
  mandibleSpread: number;
  mandibleForward: number;
  /** 0 = rectangular wing planform, 100 = semi-elliptical taper toward tip (both wing pairs). */
  wingShape: number;
  showWingFore: boolean;
  wingForeLength: number;
  wingForeWidth: number;
  wingForeSpread: number;
  /** 0 = span in spread plane only; higher = rotate fore wing span toward the head (−f), dragonfly-style. */
  wingForeForwardCant: number;
  wingForePitch: number;
  wingForeOffset: number;
  showWingHind: boolean;
  wingHindLength: number;
  wingHindWidth: number;
  wingHindSpread: number;
  wingHindPitch: number;
  wingHindOffset: number;
};
