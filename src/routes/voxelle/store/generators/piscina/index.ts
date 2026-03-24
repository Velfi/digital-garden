import { clampInt } from './mathUtils';
import { PISCINA_GIRTH_TO_THICKNESS_RATIO } from './presets';
import {
  buildPiscinaFrame,
  computePiscinaVoxelCap,
  generatePiscinaVoxels,
  getPiscinaPositions,
  PISCINA_VOXEL_CAP_MAX,
  PISCINA_VOXEL_CAP_MIN
} from './pipeline';

export type { FishSpeciesId } from '../../core';
export type { GeneratePiscinaOptions, PiscinaFrame, PiscinaPresetNumericFields } from './types';
export {
  buildPiscinaFrame,
  computePiscinaVoxelCap,
  generatePiscinaVoxels,
  getPiscinaPositions,
  PISCINA_VOXEL_CAP_MAX,
  PISCINA_VOXEL_CAP_MIN
} from './pipeline';

/** Upper bound for voxels in one placement (tests / UI hints). */
export const PISCINA_VOXEL_CAP = PISCINA_VOXEL_CAP_MAX;
export {
  FISH_SPECIES_DEFAULT_NUMERIC,
  PISCINA_GIRTH_TO_THICKNESS_RATIO,
  PISCINA_PRESET_NUMERIC
} from './presets';
export { SPECIES_OUTLINES } from './species';

export function widthThicknessFromGirth(girth: number): { width: number; thickness: number } {
  const width = clampInt(girth, 2, 32);
  const thickness = clampInt(
    Math.max(1, Math.round(width * PISCINA_GIRTH_TO_THICKNESS_RATIO)),
    1,
    24
  );
  return { width, thickness };
}
