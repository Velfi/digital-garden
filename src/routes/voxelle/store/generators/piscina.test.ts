import { describe, it, expect } from 'vitest';
import {
  getPiscinaPositions,
  generatePiscinaVoxels,
  PISCINA_VOXEL_CAP_MAX,
  computePiscinaVoxelCap
} from './piscina';
import { plasticVoxel } from '../../voxelMaterial';
import type { GeneratePiscinaOptions } from './piscina';
import { SPECIES_OUTLINES } from './piscina/species';
import type { FishSpeciesId } from '../core';

const angleDefaults = {
  spineBend: 0,
  spineSCurve: 0,
  finDorsalPitch: 0,
  finDorsalSweep: 0,
  finAnalPitch: 0,
  finCaudalSpread: 0,
  finPectoralCant: 0
};

const F4 = {
  finDorsal: 4,
  finAnal: 4,
  finCaudal: 4,
  finPectoral: 4
};

function baseOpts(over: Partial<GeneratePiscinaOptions> = {}): GeneratePiscinaOptions {
  return {
    species: 'trout',
    length: 12,
    width: 5,
    thickness: 4,
    ...F4,
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
      species: 'carp',
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

  it('trout snout is blunt enough for multi-voxel cross-section at default-like W,T', () => {
    const W = 14,
      T = 9;
    const nose = SPECIES_OUTLINES.trout(0.04, W, T);
    expect(nose.halfSide).toBeGreaterThanOrEqual(0.85);
    expect(nose.halfUp).toBeGreaterThanOrEqual(0.75);
  });

  it('pike rostrum stays narrower than trout at the nose (same W,T)', () => {
    const W = 11,
      T = 8;
    const tNose = 0.05;
    const tr = SPECIES_OUTLINES.trout(tNose, W, T);
    const pk = SPECIES_OUTLINES.pike(tNose, W, T);
    expect(tr.halfSide).toBeGreaterThan(pk.halfSide);
  });

  it('each species outline returns non-negative half extents', () => {
    const W = 8,
      T = 5;
    for (const id of Object.keys(SPECIES_OUTLINES) as FishSpeciesId[]) {
      const fn = SPECIES_OUTLINES[id];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const { halfSide, halfUp } = fn(t, W, T);
        expect(halfSide).toBeGreaterThanOrEqual(0);
        expect(halfUp).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(halfSide)).toBe(true);
        expect(Number.isFinite(halfUp)).toBe(true);
      }
    }
  });
});
