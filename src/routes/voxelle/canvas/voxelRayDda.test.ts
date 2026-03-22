import { describe, expect, it } from 'vitest';
import { plasticVoxel, type Voxel } from '../voxelMaterial';

const glass = (c: number): Voxel => ({ color: c & 0xffffff, material: 'glass' });
import {
  ddaPickVoxel,
  maxRayDistanceForVoxels,
  traceRayDda,
  traceRayThroughGlass,
  traceShadowRayDda
} from './voxelRayDda';

describe('traceRayDda', () => {
  it('hits a single voxel from -Z', () => {
    const voxels = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
    const hit = traceRayDda(0.5, 0.5, -5, 0, 0, 1, voxels, 100);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.faceNormal).toEqual([0, 0, -1]);
    expect(hit!.t).toBeGreaterThan(4);
    expect(hit!.t).toBeLessThan(6);
  });

  it('returns null when ray misses voxels', () => {
    const voxels = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
    const hit = traceRayDda(50, 50, 0.5, 0, 0, 1, voxels, 500);
    expect(hit).toBeNull();
  });

  it('records +X face normal when entering from -X', () => {
    const voxels = new Map([['0,0,0', plasticVoxel(0x00ff00)]]);
    const hit = traceRayDda(-3, 0.5, 0.5, 1, 0, 0, voxels, 100);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.faceNormal).toEqual([-1, 0, 0]);
  });

  it('ddaPickVoxel returns point on ray', () => {
    const voxels = new Map([['1,1,1', plasticVoxel(0x0000ff)]]);
    const pick = ddaPickVoxel(1.5, 1.5, -2, 0, 0, 1, voxels, 100);
    expect(pick).not.toBeNull();
    expect(pick!.point[0]).toBeCloseTo(1.5);
    expect(pick!.point[1]).toBeCloseTo(1.5);
    expect(pick!.point[2]).toBeCloseTo(1, 1);
  });
});

describe('traceShadowRayDda', () => {
  it('returns full light when path is clear', () => {
    const voxels = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
    /** Air cell (1,0,0); ray +Z misses all voxels. */
    const f = traceShadowRayDda(1.002, 0.5, 0.5, 0, 0, 1, voxels, 80);
    expect(f[0]).toBeGreaterThan(0.9);
    expect(f[1]).toBeGreaterThan(0.9);
    expect(f[2]).toBeGreaterThan(0.9);
  });

  it('returns zero when opaque blocks the light', () => {
    const voxels = new Map([
      ['0,0,0', plasticVoxel(0xff0000)],
      ['2,0,0', plasticVoxel(0x00ff00)]
    ]);
    const f = traceShadowRayDda(1.002, 0.5, 0.5, 1, 0, 0, voxels, 80);
    expect(f[0]).toBe(0);
    expect(f[1]).toBe(0);
    expect(f[2]).toBe(0);
  });

  it('attenuates and tints through glass with no opaque blocker', () => {
    const voxels = new Map([['5,0,0', glass(0xff0000)]]);
    /** Air at (4.002,0.5,0.5); +X ray traverses one red glass cell then open air to maxDist. */
    const f = traceShadowRayDda(4.002, 0.5, 0.5, 1, 0, 0, voxels, 80);
    expect(f[0]).toBeLessThan(0.98);
    expect(f[0]).toBeGreaterThan(0.15);
    expect(f[1]).toBeLessThan(f[0]);
    expect(f[2]).toBeLessThan(f[0]);
  });
});

describe('traceRayThroughGlass', () => {
  it('reaches opaque voxel behind one glass cell', () => {
    const voxels = new Map([
      ['0,0,0', glass(0xffffff)],
      ['1,0,0', plasticVoxel(0xff0000)]
    ]);
    const hit = traceRayThroughGlass(-0.5, 0.5, 0.5, 1, 0, 0, voxels, 50, 4);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([1, 0, 0]);
    expect(hit!.voxel.material).toBe('plastic');
  });
});

describe('maxRayDistanceForVoxels', () => {
  it('returns a sane default for empty map', () => {
    expect(maxRayDistanceForVoxels(new Map())).toBe(4000);
  });
});
