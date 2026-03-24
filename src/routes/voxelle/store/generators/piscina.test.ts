import { describe, it, expect } from 'vitest';
import {
  getPiscinaPositions,
  generatePiscinaVoxels,
  getPiscinaPectoralParams,
  PISCINA_VOXEL_CAP_MAX,
  computePiscinaVoxelCap,
  midlineMaxPositiveDw,
  midlineMinNegativeDw
} from './piscina';
import { plasticVoxel } from '../../voxelMaterial';
import type { GeneratePiscinaOptions } from './piscina';
import { SPECIES_OUTLINES, SPECIES_TAIL_PARAMS } from './piscina/species';
import type { FishSpeciesId } from '../core';
import { FISH_SPECIES_DEFAULT_NUMERIC } from './piscina/presets';

const angleDefaults = {
  spineBend: 0,
  spineSCurve: 0,
  finDorsalPitch: 0,
  finDorsalSweep: 0,
  finAnalPitch: 0,
  finDorsalMode: 'rounded' as const,
  finAnalMode: 'rounded' as const,
  finCaudalMode: 'species' as const,
  finPectoralMode: 'rounded' as const,
  finPelvicMode: 'rounded' as const,
  finAdiposeMode: 'pointed' as const,
  finDorsalLength: 1,
  finAnalLength: 1,
  finDorsalPosition: 0,
  finCaudalSpread: 0,
  finPectoralCant: 0,
  finPectoralSweep: 0
};

const F4 = {
  finDorsal: 4,
  finAnal: 4,
  finCaudal: 4,
  finPectoral: 4,
  finPelvic: 4,
  finAdipose: 2
};

const allFinsOn = {
  showFinDorsal: true,
  showFinAnal: true,
  showFinCaudal: true,
  showFinPectoral: true,
  showFinPelvic: true,
  showFinAdipose: true
};

function baseOpts(over: Partial<GeneratePiscinaOptions> = {}): GeneratePiscinaOptions {
  return {
    species: 'trout',
    length: 12,
    width: 5,
    thickness: 4,
    ...F4,
    ...allFinsOn,
    anchorOffsetU: 0,
    anchorOffsetV: 0,
    ...angleDefaults,
    ...over
  };
}

describe('piscina generator', () => {
  const place: [number, number, number] = [2, 3, 0];
  const normal: [number, number, number] = [0, 0, 1];

  it('returns stable position count and stays within cap for fixed seed/options', () => {
    const opts = baseOpts();
    const a = getPiscinaPositions(0x12345678, place, normal, opts);
    const b = getPiscinaPositions(0x12345678, place, normal, opts);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(PISCINA_VOXEL_CAP_MAX);
  });

  it('produces voxel map with matching keys to positions', () => {
    const opts = baseOpts({
      length: 10,
      width: 4,
      thickness: 3,
      anchorOffsetU: 1,
      anchorOffsetV: -1
    });
    const seed = 42;
    const pos = getPiscinaPositions(seed, place, normal, opts);
    const map = generatePiscinaVoxels(seed, place, normal, opts, () => plasticVoxel(0x88aabb));
    expect(map.size).toBe(pos.length);
  });

  it('respects bounds roughly around anchor for axis-aligned placement', () => {
    const opts = baseOpts({ length: 8, width: 3, thickness: 2 });
    const pos = getPiscinaPositions(99, [0, 0, 0], [0, 1, 0], opts);
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, y, z] of pos) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    expect(span).toBeLessThan(80);
  });

  it('hiding all fins yields fewer voxels than full fins (same seed)', () => {
    const base = baseOpts({ length: 20, width: 6, thickness: 5 });
    const seed = 0xabc;
    const full = getPiscinaPositions(seed, place, normal, base);
    const noFins = getPiscinaPositions(seed, place, normal, {
      ...base,
      showFinDorsal: false,
      showFinAdipose: false,
      showFinAnal: false,
      showFinCaudal: false,
      showFinPectoral: false,
      showFinPelvic: false
    });
    expect(noFins.length).toBeLessThan(full.length);
    expect(noFins.length).toBeGreaterThan(40);
  });

  it('max spine bend + s-curve visibly displace body centerline', () => {
    const seed = 0x5a17;
    const opts = baseOpts({
      species: 'trout',
      length: 34,
      width: 12,
      thickness: 8,
      showFinDorsal: false,
      showFinAdipose: false,
      showFinAnal: false,
      showFinCaudal: false,
      showFinPectoral: false,
      showFinPelvic: false
    });
    const neutral = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], opts);
    const curved = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...opts,
      spineBend: 1,
      spineSCurve: 1
    });
    const meanX = (arr: [number, number, number][]) =>
      arr.reduce((sum, p) => sum + p[0], 0) / Math.max(1, arr.length);
    const meanZ = (arr: [number, number, number][]) =>
      arr.reduce((sum, p) => sum + p[2], 0) / Math.max(1, arr.length);

    const dx = Math.abs(meanX(curved) - meanX(neutral));
    const dz = Math.abs(meanZ(curved) - meanZ(neutral));
    expect(dx + dz).toBeGreaterThan(1.2);
  });

  it('eel presets still get clear bend displacement at max sliders', () => {
    const seed = 0x81e1;
    const opts = baseOpts({
      species: 'eel',
      length: 52,
      width: 3,
      thickness: 5,
      showFinDorsal: false,
      showFinAdipose: false,
      showFinAnal: false,
      showFinCaudal: false,
      showFinPectoral: false,
      showFinPelvic: false
    });
    const neutral = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], opts);
    const curved = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...opts,
      spineBend: 1,
      spineSCurve: 1
    });
    const meanX = (arr: [number, number, number][]) =>
      arr.reduce((sum, p) => sum + p[0], 0) / Math.max(1, arr.length);
    const meanZ = (arr: [number, number, number][]) =>
      arr.reduce((sum, p) => sum + p[2], 0) / Math.max(1, arr.length);
    const dx = Math.abs(meanX(curved) - meanX(neutral));
    const dz = Math.abs(meanZ(curved) - meanZ(neutral));
    expect(dx + dz).toBeGreaterThan(0.85);
  });

  it('larger caudal fin scale yields at least as many voxels as small (same seed)', () => {
    const base = baseOpts({
      length: 14,
      width: 6,
      thickness: 4,
      finDorsal: 2,
      finAnal: 2,
      finPectoral: 2
    });
    const seed = 0xdeadbeef;
    const low = getPiscinaPositions(seed, place, normal, { ...base, finCaudal: 1 });
    const high = getPiscinaPositions(seed, place, normal, { ...base, finCaudal: 8 });
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it('large body uses dynamic cap well above legacy 2200', () => {
    const opts = baseOpts({
      species: 'goldfish',
      length: 56,
      width: 22,
      thickness: 16
    });
    const cap = computePiscinaVoxelCap(opts.length, opts.width, opts.thickness);
    expect(cap).toBeGreaterThan(8000);
    const pos = getPiscinaPositions(1, place, normal, opts);
    expect(pos.length).toBeGreaterThan(1200);
    expect(pos.length).toBeLessThanOrEqual(cap);
  });

  it('outline halfUp scales with T even when T >= W (thickness slider not capped by ratio)', () => {
    const o = SPECIES_OUTLINES.trout;
    const tMid = 0.42;
    const W = 10;
    const low = o(tMid, W, 6);
    const high = o(tMid, W, 18);
    expect(high.halfUp).toBeGreaterThan(low.halfUp * 1.2);
  });

  it('trout snout tapers smoothly near t=0', () => {
    const W = 14,
      T = 9;
    const tip = SPECIES_OUTLINES.trout(0.01, W, T);
    const midHead = SPECIES_OUTLINES.trout(0.08, W, T);
    expect(tip.halfSide).toBeLessThan(0.5);
    expect(midHead.halfSide).toBeGreaterThan(tip.halfSide);
  });

  it('goldfish outline is fuller in halfSide than eel at mid-body (same W,T)', () => {
    const W = 11,
      T = 8;
    const tMid = 0.42;
    const g = SPECIES_OUTLINES.goldfish(tMid, W, T);
    const e = SPECIES_OUTLINES.eel(tMid, W, T);
    expect(g.halfSide).toBeGreaterThan(e.halfSide);
  });

  it('each species outline returns non-negative half extents', () => {
    const W = 8,
      T = 5;
    for (const id of Object.keys(SPECIES_OUTLINES) as FishSpeciesId[]) {
      const fn = SPECIES_OUTLINES[id];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const { halfSide, halfUp, halfDorsal, halfVentral, sectionPower } = fn(t, W, T);
        expect(halfSide).toBeGreaterThanOrEqual(0);
        expect(halfUp).toBeGreaterThanOrEqual(0);
        expect(halfDorsal).toBeGreaterThanOrEqual(0);
        expect(halfVentral).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(halfSide)).toBe(true);
        expect(Number.isFinite(halfUp)).toBe(true);
        expect(sectionPower).toBeGreaterThanOrEqual(1.5);
        expect(sectionPower).toBeLessThanOrEqual(2.6);
      }
    }
  });

  it('trout mid-body outline is slightly fuller on the ventral side', () => {
    const s = SPECIES_OUTLINES.trout(0.42, 12, 8);
    expect(s.halfVentral).toBeGreaterThan(s.halfDorsal * 1.02);
  });

  it('goldfish pectoral preset reaches further than eel', () => {
    const g = getPiscinaPectoralParams('goldfish');
    const e = getPiscinaPectoralParams('eel');
    expect(g.reachMul).toBeGreaterThan(e.reachMul);
    expect(g.envelopeMul).toBeGreaterThan(e.envelopeMul);
  });

  it('midline dorsal dw scan stays within discrete body shell vs continuous half-axis', () => {
    const W = 18;
    const T = 24;
    const s = SPECIES_OUTLINES.goldfish(0.35, W, T);
    const scan = 40;
    const maxDw = midlineMaxPositiveDw(
      s.halfSidePos,
      s.halfSideNeg,
      s.halfDorsal,
      s.halfVentral,
      s.sectionPower,
      scan
    );
    expect(maxDw).toBeGreaterThanOrEqual(1);
    expect(maxDw).toBeLessThanOrEqual(Math.ceil(s.halfDorsal) + 1);
  });

  it('discrete dorsal reach keeps first fin layer within one integer step of outer body dw', () => {
    const nudge = 0.07;
    const W = 18;
    const T = 12;
    const s = SPECIES_OUTLINES.bass(0.35, W, T);
    const maxDw = midlineMaxPositiveDw(
      s.halfSidePos,
      s.halfSideNeg,
      s.halfDorsal,
      s.halfVentral,
      s.sectionPower,
      40
    );
    const discReach = maxDw > 0 ? maxDw + nudge : s.halfDorsal;
    const iyFinDisc = Math.round(discReach + 1);
    const iyFinCont = Math.round(s.halfDorsal + 1);
    expect(iyFinDisc - maxDw).toBeLessThanOrEqual(1);
    if (maxDw > 0 && s.halfDorsal > maxDw + 0.25) {
      expect(iyFinCont - maxDw).toBeGreaterThan(1);
    }
  });

  it('discrete ventral reach keeps first anal layer within one integer step of belly shell dw', () => {
    const nudge = 0.07;
    const W = 18;
    const T = 12;
    const s = SPECIES_OUTLINES.goldfish(0.42, W, T);
    const minDw = midlineMinNegativeDw(
      s.halfSidePos,
      s.halfSideNeg,
      s.halfDorsal,
      s.halfVentral,
      s.sectionPower,
      40
    );
    const discReach = minDw < 0 ? minDw - nudge : -s.halfVentral;
    const iyFinDisc = Math.round(discReach - 1);
    const iyFinCont = Math.round(-s.halfVentral - 1);
    const dDisc = Math.abs(iyFinDisc - minDw);
    const dCont = Math.abs(iyFinCont - minDw);
    expect(dDisc).toBeLessThanOrEqual(1);
    if (dCont > dDisc) {
      expect(dCont).toBeGreaterThanOrEqual(2);
    }
  });

  it('goldfish back is highest behind the head (dorsal arch), not dipped at the hump', () => {
    const W = 18,
      T = 24;
    const atArch = SPECIES_OUTLINES.goldfish(0.3, W, T);
    const atSnout = SPECIES_OUTLINES.goldfish(0.05, W, T);
    expect(atArch.halfDorsal).toBeGreaterThan(atSnout.halfDorsal * 1.08);
    expect(SPECIES_TAIL_PARAMS.goldfish.mode).toBe('deepFork');
  });

  it('each species has tail params for caudal fin mode', () => {
    for (const id of Object.keys(SPECIES_TAIL_PARAMS) as FishSpeciesId[]) {
      const p = SPECIES_TAIL_PARAMS[id];
      expect(p.tStart).toBeGreaterThanOrEqual(0.7);
      expect(p.tStart).toBeLessThan(0.92);
      expect(['fork', 'deepFork', 'lunate', 'truncate', 'rounded']).toContain(p.mode);
    }
  });

  it('species default fin sliders stay conservative after fin-range expansion', () => {
    for (const id of Object.keys(FISH_SPECIES_DEFAULT_NUMERIC) as FishSpeciesId[]) {
      const d = FISH_SPECIES_DEFAULT_NUMERIC[id];
      expect(d.finDorsal).toBeGreaterThanOrEqual(1);
      expect(d.finAnal).toBeGreaterThanOrEqual(1);
      expect(d.finCaudal).toBeGreaterThanOrEqual(1);
      expect(d.finPectoral).toBeGreaterThanOrEqual(1);
      expect(d.finPelvic).toBeGreaterThanOrEqual(1);
      expect(d.finAdipose).toBeGreaterThanOrEqual(1);
      expect(d.finDorsal).toBeLessThanOrEqual(5);
      expect(d.finAnal).toBeLessThanOrEqual(5);
      expect(d.finCaudal).toBeLessThanOrEqual(6);
      expect(d.finPectoral).toBeLessThanOrEqual(5);
      expect(d.finPelvic).toBeLessThanOrEqual(4);
    }
    expect(FISH_SPECIES_DEFAULT_NUMERIC.tuna.finCaudal).toBeGreaterThan(
      FISH_SPECIES_DEFAULT_NUMERIC.tuna.finPectoral
    );
    expect(FISH_SPECIES_DEFAULT_NUMERIC.goldfish.finCaudal).toBeGreaterThanOrEqual(
      FISH_SPECIES_DEFAULT_NUMERIC.trout.finCaudal
    );
  });

  it('dorsal and anal length multipliers extend fin base along body axis', () => {
    const base = baseOpts({
      species: 'trout',
      length: 26,
      width: 9,
      thickness: 7,
      finDorsalMode: 'pointed',
      finAnalMode: 'pointed',
      showFinPectoral: false,
      showFinPelvic: false,
      showFinCaudal: false,
      showFinAdipose: false
    });
    const seed = 0x4f11;
    const short = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...base,
      finDorsalLength: 0.5,
      finAnalLength: 0.5
    });
    const long = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...base,
      finDorsalLength: 2.2,
      finAnalLength: 2.2
    });
    const ySpan = (arr: [number, number, number][]) => {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [, y] of arr) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return maxY - minY;
    };
    expect(ySpan(long)).toBeGreaterThan(ySpan(short));
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('dorsal position slider shifts dorsal fin head↔tail center', () => {
    const seed = 0x95aa;
    const opts = baseOpts({
      species: 'trout',
      length: 28,
      width: 9,
      thickness: 7,
      showFinAnal: false,
      showFinPectoral: false,
      showFinPelvic: false,
      showFinCaudal: false,
      showFinAdipose: false
    });
    const noDorsal = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...opts,
      showFinDorsal: false
    });
    const headward = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...opts,
      finDorsalPosition: -0.42
    });
    const tailward = getPiscinaPositions(seed, [0, 0, 0], [0, 1, 0], {
      ...opts,
      finDorsalPosition: 0.42
    });

    const key = (p: [number, number, number]) => `${p[0]},${p[1]},${p[2]}`;
    const bodySet = new Set(noDorsal.map(key));
    const finYs = (arr: [number, number, number][]) => {
      const ys: number[] = [];
      for (const p of arr) if (!bodySet.has(key(p))) ys.push(p[1]);
      return ys;
    };
    const mean = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);

    const yHead = mean(finYs(headward));
    const yTail = mean(finYs(tailward));
    expect(Math.abs(yTail - yHead)).toBeGreaterThan(0.25);
  });
});
