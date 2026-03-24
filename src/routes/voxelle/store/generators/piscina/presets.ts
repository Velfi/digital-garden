import type { FishSpeciesId } from '../../core';
import { clampInt } from './mathUtils';
import {
  PISCINA_DV_HALF_MAX,
  PISCINA_DV_HALF_MIN,
  PISCINA_LATERAL_HALF_MAX,
  PISCINA_LATERAL_HALF_MIN
} from './pipeline';
import type { PiscinaPresetNumericFields } from './types';
import type { PiscinaMedianFinMode } from './types';

/**
 * Legacy: single "girth" drove width with thickness = width * ratio.
 * Kept for `widthThicknessFromGirth` helper only.
 */
export const PISCINA_GIRTH_TO_THICKNESS_RATIO = 4 / 6;

/** Goldfish default body (length × lateral half × DV half); other species are scaled toward this volume. */
const GOLD_REF: Pick<PiscinaPresetNumericFields, 'length' | 'width' | 'thickness'> = {
  length: 42,
  width: 16,
  thickness: 22
};

const V_GOLD = GOLD_REF.length * GOLD_REF.width * GOLD_REF.thickness;

/** Cube-root volume scale toward `V_GOLD`, clamped so tiny/large archetypes are not crushed. */
const K_MIN = 0.82;
const K_MAX = 1.38;

function scaleBodyToGoldfishVolumeRef(p: PiscinaPresetNumericFields): PiscinaPresetNumericFields {
  const V = p.length * p.width * p.thickness;
  if (V <= 0) return p;
  let k = Math.pow(V_GOLD / V, 1 / 3);
  k = Math.min(K_MAX, Math.max(K_MIN, k));
  return {
    ...p,
    length: clampInt(Math.round(p.length * k), 4, 72),
    width: clampInt(Math.round(p.width * k), PISCINA_LATERAL_HALF_MIN, PISCINA_LATERAL_HALF_MAX),
    thickness: clampInt(Math.round(p.thickness * k), PISCINA_DV_HALF_MIN, PISCINA_DV_HALF_MAX)
  };
}

/**
 * Canonical silhouette defaults before goldfish-relative scaling (see `FISH_SPECIES_DEFAULT_NUMERIC`).
 * Goldfish row is the reference size; other rows are scaled in body L/W/T only.
 * Length / lateral half / DV half ratios follow each archetype (fusiform, deep-bodied, eel-like, etc.).
 */
const FISH_SPECIES_DEFAULT_NUMERIC_RAW: Record<FishSpeciesId, PiscinaPresetNumericFields> = {
  bass: {
    length: 46,
    width: 12,
    thickness: 17,
    finDorsal: 2,
    finAnal: 1,
    finCaudal: 2,
    finPectoral: 1,
    finPelvic: 1,
    finAdipose: 1,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  trout: {
    length: 46,
    width: 11,
    thickness: 17,
    finDorsal: 2,
    finAnal: 1,
    finCaudal: 2,
    finPectoral: 1,
    finPelvic: 1,
    finAdipose: 1,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  goldfish: {
    length: 42,
    width: 16,
    thickness: 22,
    finDorsal: 2,
    finAnal: 1,
    finCaudal: 3,
    finPectoral: 1,
    finPelvic: 1,
    finAdipose: 1,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  /** Pelagic spindle: torpedo depth (DV) up after volume-normalize still reads chunky, not blade-thin. */
  tuna: {
    length: 52,
    width: 16,
    thickness: 18,
    finDorsal: 1,
    finAnal: 1,
    finCaudal: 2,
    finPectoral: 1,
    finPelvic: 1,
    finAdipose: 1,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  eel: {
    length: 52,
    width: 3,
    thickness: 5,
    finDorsal: 2,
    finAnal: 2,
    finCaudal: 1,
    finPectoral: 1,
    finPelvic: 1,
    finAdipose: 1,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  }
};

/**
 * Default cross-section + length + fins per species.
 * **Body** L/W/T for non-goldfish species are scaled from `FISH_SPECIES_DEFAULT_NUMERIC_RAW` so default
 * voxel volume sits near **goldfish** (cube-root match, clamped). Goldfish stays fixed; fin level presets
 * are unchanged. Length:width character per species is preserved (uniform scale).
 */
export const FISH_SPECIES_DEFAULT_NUMERIC: Record<FishSpeciesId, PiscinaPresetNumericFields> =
  Object.fromEntries(
    (
      Object.entries(FISH_SPECIES_DEFAULT_NUMERIC_RAW) as [
        FishSpeciesId,
        PiscinaPresetNumericFields
      ][]
    ).map(([id, p]) => [id, id === 'goldfish' ? p : scaleBodyToGoldfishVolumeRef(p)])
  ) as Record<FishSpeciesId, PiscinaPresetNumericFields>;

/** @deprecated Use FISH_SPECIES_DEFAULT_NUMERIC */
export const PISCINA_PRESET_NUMERIC = FISH_SPECIES_DEFAULT_NUMERIC;

export type PiscinaPresetFinModes = {
  dorsalMode: PiscinaMedianFinMode;
  analMode: PiscinaMedianFinMode;
  pectoralMode: PiscinaMedianFinMode;
  pelvicMode: PiscinaMedianFinMode;
  adiposeMode: PiscinaMedianFinMode;
};

export const FISH_SPECIES_DEFAULT_FIN_MODES: Record<FishSpeciesId, PiscinaPresetFinModes> = {
  bass: {
    dorsalMode: 'pointed',
    analMode: 'rounded',
    pectoralMode: 'pointed',
    pelvicMode: 'rounded',
    adiposeMode: 'pointed'
  },
  trout: {
    dorsalMode: 'rounded',
    analMode: 'rounded',
    pectoralMode: 'rounded',
    pelvicMode: 'rounded',
    adiposeMode: 'rounded'
  },
  goldfish: {
    dorsalMode: 'rounded',
    analMode: 'rounded',
    pectoralMode: 'rounded',
    pelvicMode: 'rounded',
    adiposeMode: 'pointed'
  },
  tuna: {
    dorsalMode: 'pointed',
    analMode: 'pointed',
    pectoralMode: 'pointed',
    pelvicMode: 'pointed',
    adiposeMode: 'pointed'
  },
  eel: {
    dorsalMode: 'ribbon',
    analMode: 'ribbon',
    pectoralMode: 'ribbon',
    pelvicMode: 'ribbon',
    adiposeMode: 'pointed'
  }
};
