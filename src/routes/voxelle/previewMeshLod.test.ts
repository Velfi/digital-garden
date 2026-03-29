import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  computePreviewLodStride,
  downsamplePositionsToPreviewMap,
  downsampleVoxelMapToPreviewMap,
  resetPreviewMeshTransform,
  alignPreviewMeshToLod,
  createPreviewRefinementScheduler
} from './previewMeshLod';
import { coordKey } from './coordUtils';
import { plasticVoxel, type Voxel } from './voxelMaterial';

describe('computePreviewLodStride', () => {
  it('returns 1 when count is at or below target', () => {
    expect(computePreviewLodStride(0)).toBe(1);
    expect(computePreviewLodStride(100)).toBe(1);
    expect(computePreviewLodStride(12_000)).toBe(1);
  });

  it('returns stride > 1 when count exceeds target', () => {
    expect(computePreviewLodStride(50_000)).toBe(2);
    expect(computePreviewLodStride(200_000)).toBe(4);
  });

  it('respects maxCoarse and maxStride options', () => {
    expect(computePreviewLodStride(50_000, { maxCoarse: 5_000 })).toBe(4);
    expect(computePreviewLodStride(1_000_000, { maxStride: 4 })).toBe(4);
  });
});

describe('downsamplePositionsToPreviewMap', () => {
  const voxel = plasticVoxel(0xffffff);

  it('stride 1 with min at origin preserves identity mapping', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 1]
    ];
    const min: [number, number, number] = [0, 0, 0];
    const map = downsamplePositionsToPreviewMap(positions, voxel, 1, min);
    expect(map.size).toBe(3);
    expect(map.has(coordKey(0, 0, 0))).toBe(true);
    expect(map.has(coordKey(1, 0, 0))).toBe(true);
    expect(map.has(coordKey(0, 1, 1))).toBe(true);
  });

  it('stride 2 maps multiple fine positions to one coarse cell', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0]
    ];
    const min: [number, number, number] = [0, 0, 0];
    const map = downsamplePositionsToPreviewMap(positions, voxel, 2, min);
    expect(map.size).toBe(1);
    expect(map.has(coordKey(0, 0, 0))).toBe(true);
  });

  it('stride 2 with offset min produces correct coarse keys', () => {
    const positions: [number, number, number][] = [
      [10, 10, 10],
      [11, 11, 11],
      [12, 12, 12]
    ];
    const min: [number, number, number] = [10, 10, 10];
    const map = downsamplePositionsToPreviewMap(positions, voxel, 2, min);
    expect(map.size).toBe(2);
    expect(map.has(coordKey(0, 0, 0))).toBe(true);
    expect(map.has(coordKey(1, 1, 1))).toBe(true);
  });

  it('marks coarse cell with invert overlap when any fine voxel overlaps existingVoxels', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 1, 1]
    ];
    const min: [number, number, number] = [0, 0, 0];
    const existing = new Map<string, Voxel>();
    existing.set(coordKey(1, 1, 1), plasticVoxel(0));
    const map = downsamplePositionsToPreviewMap(positions, voxel, 2, min, existing);
    expect(map.size).toBe(1);
    const v = map.get(coordKey(0, 0, 0))!;
    expect(v.color).toBe(0x000000);
  });

  it('marks coarse cell with invert overlap when any fine voxel intersects guide plane', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [3, 3, 3]
    ];
    const min: [number, number, number] = [0, 0, 0];
    const planeOverlap = {
      planePoint: [0, 0, 0] as [number, number, number],
      planeNormal: [0, 1, 0] as [number, number, number]
    };
    const map = downsamplePositionsToPreviewMap(
      positions,
      voxel,
      2,
      min,
      undefined,
      'invert',
      planeOverlap
    );
    expect(map.size).toBe(2);
    expect(map.get(coordKey(0, 0, 0))?.color).toBe(0x000000);
    expect(map.get(coordKey(1, 1, 1))?.color).toBe(0xffffff);
  });
});

describe('downsampleVoxelMapToPreviewMap', () => {
  it('stride 1 preserves all keys', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff0000)],
      [coordKey(1, 2, 3), plasticVoxel(0x00ff00)]
    ]);
    const min: [number, number, number] = [0, 0, 0];
    const map = downsampleVoxelMapToPreviewMap(voxels, 1, min);
    expect(map.size).toBe(2);
    expect(map.get(coordKey(0, 0, 0))?.color).toBe(0xff0000);
    expect(map.get(coordKey(1, 2, 3))?.color).toBe(0x00ff00);
  });

  it('stride 2 merges cells', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff0000)],
      [coordKey(1, 0, 0), plasticVoxel(0x00ff00)]
    ]);
    const min: [number, number, number] = [0, 0, 0];
    const map = downsampleVoxelMapToPreviewMap(voxels, 2, min);
    expect(map.size).toBe(1);
    expect(map.has(coordKey(0, 0, 0))).toBe(true);
  });
});

describe('alignPreviewMeshToLod and resetPreviewMeshTransform', () => {
  it('sets scale and position for stride and min', () => {
    const mesh = {
      scale: { set: vi.fn() },
      position: { set: vi.fn() }
    } as unknown as THREE.Mesh;
    alignPreviewMeshToLod(mesh, 4, [10, 20, 30]);
    expect(mesh.scale.set).toHaveBeenCalledWith(4, 4, 4);
    expect(mesh.position.set).toHaveBeenCalledWith(12, 22, 32);
  });

  it('resetPreviewMeshTransform restores identity', () => {
    const mesh = {
      scale: { set: vi.fn() },
      position: { set: vi.fn() }
    } as unknown as THREE.Mesh;
    resetPreviewMeshTransform(mesh);
    expect(mesh.scale.set).toHaveBeenCalledWith(1, 1, 1);
    expect(mesh.position.set).toHaveBeenCalledWith(0, 0, 0);
  });
});

describe('createPreviewRefinementScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs scheduled callback and applies result when token unchanged', async () => {
    const scheduler = createPreviewRefinementScheduler();
    const ran = vi.fn();
    scheduler.schedule(ran);
    await vi.runAllTimersAsync();
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('cancel bumps token so in-flight callback does not apply', async () => {
    const scheduler = createPreviewRefinementScheduler();
    const applied = vi.fn();
    scheduler.schedule(() => applied());
    scheduler.cancel();
    await vi.runAllTimersAsync();
    expect(applied).not.toHaveBeenCalled();
  });

  it('second schedule overwrites first; only latest runs', async () => {
    const scheduler = createPreviewRefinementScheduler();
    const first = vi.fn();
    const second = vi.fn();
    scheduler.schedule(first);
    scheduler.schedule(second);
    await vi.runAllTimersAsync();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
