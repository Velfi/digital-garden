import { describe, expect, it } from 'vitest';
import { coordKey } from '../coordUtils';
import type { Voxel } from '../voxelMaterial';
import { buildGpuVoxelAccelFromMap } from './gpuVoxelAccel';
import { lookupVoxelAccel, traceRayDda } from './voxelRayDda';

describe('lookupVoxelAccel', () => {
  it('matches Map lookup for dense accel', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), { color: 0xff5733, material: 'plastic' }]
    ]);
    const accel = buildGpuVoxelAccelFromMap(voxels);
    const a = lookupVoxelAccel(accel, voxels, 0, 0, 0);
    const b = lookupVoxelAccel(null, voxels, 0, 0, 0);
    expect(a?.color).toBe(0xff5733);
    expect(b?.color).toBe(0xff5733);
    expect(a?.material).toBe('plastic');
  });

  it('traceRayDda with accel matches map path for simple hit', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(2, 0, 0), { color: 0x00ff00, material: 'metal' }]
    ]);
    const accel = buildGpuVoxelAccelFromMap(voxels);
    const a = traceRayDda(0, 0.5, 0.5, 1, 0, 0, voxels, 50, accel);
    const b = traceRayDda(0, 0.5, 0.5, 1, 0, 0, voxels, 50, null);
    expect(a?.cell).toEqual(b?.cell);
    expect(a?.voxel.color).toBe(b?.voxel.color);
  });
});
