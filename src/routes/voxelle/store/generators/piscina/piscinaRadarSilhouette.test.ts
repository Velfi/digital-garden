import { describe, expect, it } from 'vitest';
import { buildPiscinaRadarProfile } from './piscinaRadarSilhouette';
import type { GeneratePiscinaOptions } from './types';

const base = (): GeneratePiscinaOptions => ({
  species: 'trout',
  length: 24,
  width: 8,
  thickness: 6,
  finDorsal: 5,
  finAnal: 5,
  finCaudal: 5,
  finPectoral: 5,
  finPelvic: 4,
  finAdipose: 2,
  showFinDorsal: true,
  showFinAnal: true,
  showFinCaudal: true,
  showFinPectoral: true,
  showFinPelvic: true,
  showFinAdipose: true,
  anchorOffsetU: 0,
  anchorOffsetV: 0,
  spineBend: 0,
  spineSCurve: 0,
  finDorsalPitch: 0,
  finDorsalSweep: 0,
  finAnalPitch: 0,
  finDorsalMode: 'rounded',
  finAnalMode: 'rounded',
  finCaudalMode: 'species',
  finPectoralMode: 'rounded',
  finPelvicMode: 'rounded',
  finAdiposeMode: 'pointed',
  finDorsalLength: 1,
  finAnalLength: 1,
  finDorsalPosition: 0,
  finCaudalSpread: 0,
  finPectoralCant: 0,
  finPectoralSweep: 0
});

describe('buildPiscinaRadarProfile', () => {
  it('produces a wider Y span for longer fish (voxel-derived, spine along +Y)', () => {
    const shortP = buildPiscinaRadarProfile({ ...base(), length: 12 });
    const longP = buildPiscinaRadarProfile({ ...base(), length: 48 });
    expect(shortP.ys.length).toBeGreaterThan(4);
    expect(longP.ys.length).toBeGreaterThan(4);
    const shortW = shortP.yMax - shortP.yMin;
    const longW = longP.yMax - longP.yMin;
    expect(longW).toBeGreaterThan(shortW);
  });

  it('caudal on extends tail further along Y than caudal off', () => {
    const on = buildPiscinaRadarProfile(base());
    const off = buildPiscinaRadarProfile({ ...base(), showFinCaudal: false });
    expect(on.yMax).toBeGreaterThan(off.yMax + 0.5);
  });
});
