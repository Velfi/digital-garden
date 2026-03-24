import { clampInt } from './mathUtils';
import { PISCINA_GIRTH_TO_THICKNESS_RATIO } from './presets';
import {
  PISCINA_DV_HALF_MAX,
  PISCINA_DV_HALF_MIN,
  PISCINA_LATERAL_HALF_MAX,
  PISCINA_LATERAL_HALF_MIN,
  PISCINA_VOXEL_CAP_MAX
} from './pipeline';

export type { FishSpeciesId } from '../../core';
export type {
  GeneratePiscinaOptions,
  PiscinaCaudalTailModeSetting,
  PiscinaFrame,
  PiscinaMedianFinMode,
  PiscinaOutlineSample,
  PiscinaPectoralParams,
  PiscinaPresetNumericFields,
  PiscinaTailMode,
  PiscinaTailParams
} from './types';
export type { PiscinaRadarProfile } from './piscinaRadarSilhouette';
export {
  buildPiscinaFrame,
  computePiscinaVoxelCap,
  generatePiscinaVoxels,
  getPiscinaPositions,
  midlineMaxPositiveDw,
  midlineMinNegativeDw,
  PISCINA_DV_HALF_MAX,
  PISCINA_DV_HALF_MIN,
  PISCINA_LATERAL_HALF_MAX,
  PISCINA_LATERAL_HALF_MIN,
  PISCINA_VOXEL_CAP_MAX,
  PISCINA_VOXEL_CAP_MIN
} from './pipeline';
export { buildPiscinaRadarProfile, getCachedPiscinaRadarProfile } from './piscinaRadarSilhouette';

/** Upper bound for voxels in one placement (tests / UI hints). */
export const PISCINA_VOXEL_CAP = PISCINA_VOXEL_CAP_MAX;
export {
  FISH_SPECIES_DEFAULT_FIN_MODES,
  FISH_SPECIES_DEFAULT_NUMERIC,
  PISCINA_GIRTH_TO_THICKNESS_RATIO,
  PISCINA_PRESET_NUMERIC
} from './presets';
export {
  getPiscinaFinBands,
  getPiscinaFinT,
  getPiscinaPectoralParams,
  SPECIES_OUTLINES,
  SPECIES_TAIL_PARAMS
} from './species';

export function widthThicknessFromGirth(girth: number): { width: number; thickness: number } {
  const width = clampInt(girth, PISCINA_LATERAL_HALF_MIN, PISCINA_LATERAL_HALF_MAX);
  const thickness = clampInt(
    Math.max(1, Math.round(width * PISCINA_GIRTH_TO_THICKNESS_RATIO)),
    PISCINA_DV_HALF_MIN,
    PISCINA_DV_HALF_MAX
  );
  return { width, thickness };
}
