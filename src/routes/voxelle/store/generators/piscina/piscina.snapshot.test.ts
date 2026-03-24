import { describe, expect, it } from 'vitest';
import type { FishSpeciesId } from '../../core';
import { plasticVoxel } from '../../../voxelMaterial';
import { FISH_SPECIES_DEFAULT_FIN_MODES, FISH_SPECIES_DEFAULT_NUMERIC } from './presets';
import { generatePiscinaVoxels } from './pipeline';
import type { GeneratePiscinaOptions } from './types';
import { renderVoxelMapOrthographicBmp } from './piscinaSnapshotRender';
import { assertBmpFileSnapshot } from './piscinaBmpSnapshot';

const SNAPSHOT_SEED = 0xdec0dde;
const PLACE: [number, number, number] = [0, 0, 0];
const NORMAL: [number, number, number] = [0, 0, 1];
/** Single neutral color keeps snapshots stable and easy to overlay on reference photos. */
const SNAPSHOT_VOXEL_COLOR = 0x6a737d;

const ALL_SPECIES = Object.keys(FISH_SPECIES_DEFAULT_NUMERIC) as FishSpeciesId[];

function presetSnapshotOptions(species: FishSpeciesId): GeneratePiscinaOptions {
  const n = FISH_SPECIES_DEFAULT_NUMERIC[species];
  const fm = FISH_SPECIES_DEFAULT_FIN_MODES[species];
  return {
    species,
    length: n.length,
    width: n.width,
    thickness: n.thickness,
    finDorsal: n.finDorsal,
    finAnal: n.finAnal,
    finCaudal: n.finCaudal,
    finPectoral: n.finPectoral,
    finPelvic: n.finPelvic,
    finAdipose: n.finAdipose,
    showFinDorsal: true,
    showFinAnal: true,
    showFinCaudal: true,
    showFinPectoral: true,
    showFinPelvic: true,
    showFinAdipose: species === 'trout',
    anchorOffsetU: n.anchorOffsetU,
    anchorOffsetV: n.anchorOffsetV,
    spineBend: 0,
    spineSCurve: 0,
    finDorsalPitch: 0,
    finDorsalSweep: 0,
    finAnalPitch: 0,
    finDorsalMode: fm.dorsalMode,
    finAnalMode: fm.analMode,
    finCaudalMode: 'species',
    finPectoralMode: fm.pectoralMode,
    finPelvicMode: fm.pelvicMode,
    finAdiposeMode: fm.adiposeMode,
    finDorsalLength: 1,
    finAnalLength: 1,
    finDorsalPosition: 0,
    finCaudalSpread: 0,
    finPectoralCant: 0,
    finPectoralSweep: 0
  };
}

/**
 * Orthographic BMP snapshots: generate preset fish voxels, render profile (along −Y) and top (−Z).
 * Files under `__snapshots__/` are **raw** BMP (not Vitest `toMatchFileSnapshot`, which JSON-wraps Buffers).
 * Update baselines after intentional silhouette changes:
 *   VITEST_BMP_UPDATE=1 npm run test:voxelle:piscina-snapshots
 */
describe('piscina rendering snapshots', () => {
  for (const species of ALL_SPECIES) {
    it(`${species} profile (orthographic BMP)`, () => {
      const opts = presetSnapshotOptions(species);
      const map = generatePiscinaVoxels(SNAPSHOT_SEED, PLACE, NORMAL, opts, () =>
        plasticVoxel(SNAPSHOT_VOXEL_COLOR)
      );
      expect(map.size).toBeGreaterThan(0);
      const bmp = renderVoxelMapOrthographicBmp(map, 'profile', 320);
      assertBmpFileSnapshot(bmp, `piscina-${species}-profile.bmp`);
    });

    it(`${species} top (orthographic BMP)`, () => {
      const opts = presetSnapshotOptions(species);
      const map = generatePiscinaVoxels(SNAPSHOT_SEED, PLACE, NORMAL, opts, () =>
        plasticVoxel(SNAPSHOT_VOXEL_COLOR)
      );
      const bmp = renderVoxelMapOrthographicBmp(map, 'top', 320);
      assertBmpFileSnapshot(bmp, `piscina-${species}-top.bmp`);
    });
  }
});
