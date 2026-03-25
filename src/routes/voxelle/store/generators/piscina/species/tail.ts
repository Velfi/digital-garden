import type { FishSpeciesId } from '../../../core';
import type { PiscinaFinBand, PiscinaTailParams } from '../types';

export const SPECIES_TAIL_PARAMS: Record<FishSpeciesId, PiscinaTailParams> = {
  /** Salmonid: well-forked homocerc tail. */
  trout: { mode: 'deepFork', tStart: 0.79, spanMul: 0.88, depthMul: 0.86 },
  /** Anguilliform: pointed ribbon tail. */
  eel: { mode: 'truncate', tStart: 0.9, spanMul: 0.28, depthMul: 0.34 },
  /** Largemouth-type: strong fork, moderate depth. */
  bass: { mode: 'fork', tStart: 0.81, spanMul: 0.86, depthMul: 0.84 },
  /** Scombrid: lunate caudal — wide trailing arc, long swept lobes (`lunate` in pipeline). */
  tuna: { mode: 'lunate', tStart: 0.805, spanMul: 0.98, depthMul: 0.84 },
  /** Fancy caudal: deep fork, ornamental spread. */
  goldfish: { mode: 'deepFork', tStart: 0.76, spanMul: 1.08, depthMul: 1.18 }
};

export type PiscinaFinBandsAll = {
  dorsal: PiscinaFinBand;
  anal: PiscinaFinBand;
  pectoral: PiscinaFinBand;
  /** Paired ventral fins between pectorals and anal. */
  pelvic: PiscinaFinBand;
  /** Small dorsal fin behind main dorsal (salmonids). */
  adipose: PiscinaFinBand;
};

const FIN_BANDS_DEFAULT: PiscinaFinBandsAll = {
  dorsal: { min: 0.3, max: 0.43, peak: 0.365 },
  anal: { min: 0.52, max: 0.69, peak: 0.595 },
  pectoral: { min: 0.16, max: 0.29, peak: 0.225 },
  pelvic: { min: 0.38, max: 0.5, peak: 0.44 },
  adipose: { min: 0.5, max: 0.67, peak: 0.585 }
};

const FIN_BANDS_OVERRIDES: Partial<Record<FishSpeciesId, Partial<PiscinaFinBandsAll>>> = {
  /** Salmonid: adipose between dorsal and caudal; pelvic under mid-trunk. */
  trout: {
    dorsal: { min: 0.29, max: 0.44, peak: 0.365 },
    anal: { min: 0.52, max: 0.66, peak: 0.59 },
    pectoral: { min: 0.17, max: 0.28, peak: 0.225 },
    pelvic: { min: 0.41, max: 0.5, peak: 0.455 },
    adipose: { min: 0.52, max: 0.64, peak: 0.58 }
  },
  /** Centrarchid: pelvic under pectoral insert, not floating forward. */
  bass: {
    dorsal: { min: 0.27, max: 0.42, peak: 0.345 },
    anal: { min: 0.51, max: 0.67, peak: 0.585 },
    pectoral: { min: 0.15, max: 0.27, peak: 0.21 },
    pelvic: { min: 0.4, max: 0.49, peak: 0.445 },
    adipose: { min: 0.55, max: 0.62, peak: 0.58 }
  },
  /** Anguilliform: dorsal starts ~⅓ back, anal ~⅖; both run to the caudal peduncle so ribbons meet at the tail. */
  eel: {
    dorsal: { min: 0.28, max: 0.88, peak: 0.55 },
    anal: { min: 0.38, max: 0.88, peak: 0.62 },
    pectoral: { min: 0.08, max: 0.16, peak: 0.13 },
    pelvic: { min: 0.4, max: 0.5, peak: 0.45 },
    adipose: { min: 0.55, max: 0.62, peak: 0.58 }
  },
  tuna: {
    dorsal: { min: 0.29, max: 0.44, peak: 0.365 },
    anal: { min: 0.56, max: 0.68, peak: 0.625 },
    pectoral: { min: 0.2, max: 0.28, peak: 0.235 },
    pelvic: { min: 0.46, max: 0.55, peak: 0.505 }
  },
  /** Deep round body; pectorals low and fan-shaped (see `getPiscinaPectoralParams`). */
  goldfish: {
    dorsal: { min: 0.22, max: 0.44, peak: 0.33 },
    anal: { min: 0.5, max: 0.72, peak: 0.61 },
    pectoral: { min: 0.12, max: 0.24, peak: 0.185 },
    pelvic: { min: 0.4, max: 0.54, peak: 0.47 },
    adipose: { min: 0.55, max: 0.62, peak: 0.58 }
  }
};

export function getPiscinaFinBands(species: FishSpeciesId): PiscinaFinBandsAll {
  const o = FIN_BANDS_OVERRIDES[species];
  if (!o) return FIN_BANDS_DEFAULT;
  return {
    dorsal: o.dorsal ?? FIN_BANDS_DEFAULT.dorsal,
    anal: o.anal ?? FIN_BANDS_DEFAULT.anal,
    pectoral: o.pectoral ?? FIN_BANDS_DEFAULT.pectoral,
    pelvic: o.pelvic ?? FIN_BANDS_DEFAULT.pelvic,
    adipose: o.adipose ?? FIN_BANDS_DEFAULT.adipose
  };
}
