import type { FaceNormal } from '../../core';
import { getPiscinaPositions } from './pipeline';
import type { GeneratePiscinaOptions } from './types';

const RADAR_PLACE: [number, number, number] = [0, 0, 0];
/**
 * Floor normal `[0,0,1]` → `buildPiscinaFrame` spine along **+Y**, lateral +X, dorsal +Z.
 * Side view = orthographic along **+X** onto the Y–Z plane (nose→tail horizontal, belly↔back vertical).
 */
const RADAR_NORMAL: FaceNormal = [0, 0, 1];
/** Fixed seed so the radar is stable (matches one placement of caudal fork randomness). */
const RADAR_SEED = 0x9e3779b9;

export type PiscinaRadarProfile = {
  /** Sorted spine stations (rounded world Y). */
  ys: number[];
  zTop: number[];
  zBot: number[];
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};

function optionsFingerprint(o: GeneratePiscinaOptions): string {
  return [
    o.species,
    o.length,
    o.width,
    o.thickness,
    o.finDorsal,
    o.finAnal,
    o.finCaudal,
    o.finPectoral,
    o.finPelvic,
    o.finAdipose,
    o.showFinDorsal ? 1 : 0,
    o.showFinAnal ? 1 : 0,
    o.showFinCaudal ? 1 : 0,
    o.showFinPectoral ? 1 : 0,
    o.showFinPelvic ? 1 : 0,
    o.showFinAdipose ? 1 : 0,
    o.spineBend,
    o.spineSCurve,
    o.finDorsalPitch,
    o.finDorsalSweep,
    o.finAnalPitch,
    o.finDorsalMode,
    o.finAnalMode,
    o.finCaudalMode,
    o.finPectoralMode,
    o.finPelvicMode,
    o.finAdiposeMode,
    o.finDorsalLength,
    o.finAnalLength,
    o.finDorsalPosition,
    o.finCaudalSpread,
    o.finPectoralCant,
    o.finPectoralSweep
  ].join('\0');
}

/**
 * Orthographic side-view envelope of the same voxel set the generator places (Y = nose→tail, Z = belly↔back).
 * Anchor offsets are ignored so the diagram stays centered in the radar canvas.
 */
export function buildPiscinaRadarProfile(options: GeneratePiscinaOptions): PiscinaRadarProfile {
  const o: GeneratePiscinaOptions = {
    ...options,
    anchorOffsetU: 0,
    anchorOffsetV: 0
  };
  const pts = getPiscinaPositions(RADAR_SEED, RADAR_PLACE, RADAR_NORMAL, o);
  const m = new Map<number, { min: number; max: number }>();
  for (const p of pts) {
    const y = p[1]!;
    const z = p[2]!;
    const yi = Math.round(y);
    const e = m.get(yi);
    if (!e) m.set(yi, { min: z, max: z });
    else {
      e.min = Math.min(e.min, z);
      e.max = Math.max(e.max, z);
    }
  }
  const ys = [...m.keys()].sort((a, b) => a - b);
  if (ys.length === 0) {
    return { ys: [], zTop: [], zBot: [], yMin: 0, yMax: 1, zMin: 0, zMax: 1 };
  }
  const zTop = ys.map((yi) => m.get(yi)!.max);
  const zBot = ys.map((yi) => m.get(yi)!.min);
  const yMin = ys[0]!;
  const yMax = ys[ys.length - 1]!;
  const zMin = Math.min(...zBot);
  const zMax = Math.max(...zTop);
  return { ys, zTop, zBot, yMin, yMax, zMin, zMax };
}

let cachedFp = '';
let cachedProfile: PiscinaRadarProfile | null = null;

/** Reuses the last profile when options are unchanged (avoids voxel regen on radar animation frames). */
export function getCachedPiscinaRadarProfile(options: GeneratePiscinaOptions): PiscinaRadarProfile {
  const fp = optionsFingerprint(options);
  if (fp !== cachedFp || !cachedProfile) {
    cachedFp = fp;
    cachedProfile = buildPiscinaRadarProfile(options);
  }
  return cachedProfile;
}
