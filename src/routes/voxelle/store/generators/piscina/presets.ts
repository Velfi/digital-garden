import type { FishSpeciesId } from '../../core';
import type { PiscinaPresetNumericFields } from './types';

/**
 * Legacy: single "girth" drove width with thickness = width * ratio.
 * Kept for `widthThicknessFromGirth` helper only.
 */
export const PISCINA_GIRTH_TO_THICKNESS_RATIO = 4 / 6;

/** Default cross-section + length + fins per species (independent width / thickness).
 *  Target length:width ratios — trout ~3.5:1, bass ~3.8:1, carp ~3:1, pike ~6:1, tuna ~5:1. */
export const FISH_SPECIES_DEFAULT_NUMERIC: Record<FishSpeciesId, PiscinaPresetNumericFields> = {
  minnow: {
    length: 18,
    width: 5,
    thickness: 4,
    finDorsal: 3,
    finAnal: 3,
    finCaudal: 3,
    finPectoral: 3,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  trout: {
    length: 42,
    width: 12,
    thickness: 8,
    finDorsal: 5,
    finAnal: 5,
    finCaudal: 6,
    finPectoral: 5,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  sunfish: {
    length: 22,
    width: 14,
    thickness: 12,
    finDorsal: 5,
    finAnal: 4,
    finCaudal: 4,
    finPectoral: 6,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  eel: {
    length: 48,
    width: 4,
    thickness: 3,
    finDorsal: 2,
    finAnal: 2,
    finCaudal: 3,
    finPectoral: 2,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  bass: {
    length: 44,
    width: 11,
    thickness: 10,
    finDorsal: 5,
    finAnal: 5,
    finCaudal: 6,
    finPectoral: 5,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  perch: {
    length: 36,
    width: 11,
    thickness: 10,
    finDorsal: 6,
    finAnal: 4,
    finCaudal: 5,
    finPectoral: 5,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  carp: {
    length: 52,
    width: 17,
    thickness: 12,
    finDorsal: 5,
    finAnal: 5,
    finCaudal: 5,
    finPectoral: 4,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  pike: {
    length: 60,
    width: 10,
    thickness: 7,
    finDorsal: 4,
    finAnal: 3,
    finCaudal: 7,
    finPectoral: 4,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  flatfish: {
    length: 30,
    width: 22,
    thickness: 4,
    finDorsal: 4,
    finAnal: 3,
    finCaudal: 5,
    finPectoral: 3,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  },
  tuna: {
    length: 64,
    width: 13,
    thickness: 9,
    finDorsal: 5,
    finAnal: 4,
    finCaudal: 8,
    finPectoral: 5,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  }
};

/** @deprecated Use FISH_SPECIES_DEFAULT_NUMERIC */
export const PISCINA_PRESET_NUMERIC = FISH_SPECIES_DEFAULT_NUMERIC;
