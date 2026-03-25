import { describe, expect, it } from 'vitest';
import type { FaceNormal } from '../../core';
import {
  generateInsectaVoxels,
  getInsectaPositions,
  INSECTA_SPECIES_DEFAULTS,
  clampInsectaOptions
} from './index';
import type { GenerateInsectaOptions } from './types';

const place: [number, number, number] = [0, 5, 0];
const normal: FaceNormal = [0, 1, 0];

function baseOpts(over: Partial<GenerateInsectaOptions> = {}): GenerateInsectaOptions {
  return { ...INSECTA_SPECIES_DEFAULTS.bee, ...over };
}

describe('insecta generator', () => {
  it('returns non-empty voxels for each species preset', () => {
    for (const species of Object.keys(INSECTA_SPECIES_DEFAULTS) as (keyof typeof INSECTA_SPECIES_DEFAULTS)[]) {
      const opts = INSECTA_SPECIES_DEFAULTS[species];
      const map = generateInsectaVoxels(1, place, normal, opts, () => ({
        color: 0xff00,
        material: 'plastic' as const
      }));
      expect(map.size).toBeGreaterThan(80);
    }
  });

  it('getInsectaPositions keys match generateInsectaVoxels keys', () => {
    const opts = baseOpts();
    const seed = 0x9e3779b9;
    const pos = getInsectaPositions(seed, place, normal, opts);
    const map = generateInsectaVoxels(seed, place, normal, opts, () => ({
      color: 0xabcdef,
      material: 'plastic'
    }));
    const keysFromPos = new Set(pos.map(([x, y, z]) => `${x},${y},${z}`));
    expect(map.size).toBe(keysFromPos.size);
    for (const k of map.keys()) {
      expect(keysFromPos.has(k)).toBe(true);
    }
  });

  it('is deterministic for fixed options', () => {
    const opts = baseOpts();
    const a = generateInsectaVoxels(42, place, normal, opts, () => ({
      color: 1,
      material: 'plastic'
    }));
    const b = generateInsectaVoxels(42, place, normal, opts, () => ({
      color: 2,
      material: 'metal'
    }));
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  });

  it('hiding hind wings reduces voxel count when hind adds non-overlapping voxels', () => {
    const base = { ...INSECTA_SPECIES_DEFAULTS.dragonfly, showWingHind: true };
    const withHind = base;
    const withoutHind = { ...base, showWingHind: false };
    const m1 = generateInsectaVoxels(3, place, normal, withHind, () => ({
      color: 0,
      material: 'plastic'
    }));
    const m2 = generateInsectaVoxels(3, place, normal, withoutHind, () => ({
      color: 0,
      material: 'plastic'
    }));
    expect(m2.size).toBeLessThan(m1.size);
  });

  it('clampInsectaOptions clamps invalid species', () => {
    const bad = baseOpts();
    (bad as { species: string }).species = 'nope';
    const c = clampInsectaOptions(bad);
    expect(c.species).toBe('bee');
  });

  it('wingShape 0 (rectangular) includes more positions than 100 (elliptical tip)', () => {
    const flat = baseOpts({ wingShape: 0, showWingHind: true });
    const tapered = baseOpts({ wingShape: 100, showWingHind: true });
    const nFlat = getInsectaPositions(0, place, normal, flat).length;
    const nTaper = getInsectaPositions(0, place, normal, tapered).length;
    expect(nFlat).toBeGreaterThan(nTaper);
  });

  it('headShape 0 vs 100 changes occupied voxels', () => {
    const blocky = baseOpts({ headShape: 0 });
    const pointy = baseOpts({ headShape: 100 });
    const key = (p: [number, number, number]) => `${p[0]},${p[1]},${p[2]}`;
    const s0 = new Set(getInsectaPositions(0, place, normal, blocky).map(key));
    const s1 = new Set(getInsectaPositions(0, place, normal, pointy).map(key));
    let diff = 0;
    for (const k of s0) if (!s1.has(k)) diff++;
    for (const k of s1) if (!s0.has(k)) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});
