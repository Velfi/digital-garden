import { describe, expect, it } from 'vitest';
import { plasticVoxel } from '../voxelMaterial';
import {
  buildGpuVoxelAccelFromMap,
  flattenGpuAccelToHash,
  hashCoords,
  lookupDense,
  lookupHashTable,
  materialIndexForGpu,
  packVoxelPayload,
  unpackVoxelPayload
} from './gpuVoxelAccel';

describe('packVoxelPayload', () => {
  it('round-trips color and material', () => {
    const p = packVoxelPayload(0xff8040, 2);
    expect(unpackVoxelPayload(p)).toEqual({ color: 0xff8040, materialIndex: 2 });
  });

  it('never returns 0 for valid voxels', () => {
    expect(packVoxelPayload(0, 0)).not.toBe(0);
  });
});

describe('materialIndexForGpu', () => {
  it('maps plastic to 0', () => {
    expect(materialIndexForGpu('plastic')).toBe(0);
  });
});

describe('buildGpuVoxelAccelFromMap', () => {
  it('returns empty for empty map', () => {
    expect(buildGpuVoxelAccelFromMap(new Map())).toEqual({ kind: 'empty' });
  });

  it('dense path: lookups match map', () => {
    const v = new Map([
      ['0,0,0', plasticVoxel(0x112233)],
      ['1,0,0', { color: 0x00ff00, material: 'metal' as const }]
    ]);
    const a = buildGpuVoxelAccelFromMap(v);
    expect(a.kind).toBe('dense');
    if (a.kind !== 'dense') return;
    expect(lookupDense(a, 0, 0, 0)).toBe(packVoxelPayload(0x112233, 0));
    expect(lookupDense(a, 1, 0, 0)).toBe(packVoxelPayload(0x00ff00, materialIndexForGpu('metal')));
    expect(lookupDense(a, 5, 5, 5)).toBe(0);
  });

  it('hash path: lookups match map for spread-out bbox', () => {
    const v = new Map<string, ReturnType<typeof plasticVoxel>>();
    /** Bbox volume must exceed DENSE_CELL_BUDGET so we take the hash path. */
    const gap = 2000;
    v.set(`0,0,0`, plasticVoxel(1));
    v.set(`${gap},0,0`, plasticVoxel(2));
    v.set(`0,${gap},0`, plasticVoxel(3));
    const a = buildGpuVoxelAccelFromMap(v);
    expect(a.kind).toBe('hash');
    if (a.kind !== 'hash') return;
    expect(lookupHashTable(a, 0, 0, 0)).toBe(packVoxelPayload(1, 0));
    expect(lookupHashTable(a, gap, 0, 0)).toBe(packVoxelPayload(2, 0));
    expect(lookupHashTable(a, 0, gap, 0)).toBe(packVoxelPayload(3, 0));
    expect(lookupHashTable(a, 99, 99, 99)).toBe(0);
  });

  it('hashCoords is deterministic', () => {
    expect(hashCoords(-3, 7, 42)).toBe(hashCoords(-3, 7, 42));
  });

  it('flattenGpuAccelToHash round-trips dense via map', () => {
    const v = new Map([['0,1,2', plasticVoxel(0xabcdef)]]);
    const dense = buildGpuVoxelAccelFromMap(v);
    expect(dense.kind).toBe('dense');
    const h = flattenGpuAccelToHash(dense);
    expect(h.kind).toBe('hash');
    if (h.kind !== 'hash') return;
    expect(lookupHashTable(h, 0, 1, 2)).toBe(packVoxelPayload(0xabcdef, 0));
  });
});
