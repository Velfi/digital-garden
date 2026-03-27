import { describe, it, expect } from 'vitest';
import {
  applyMeshLaplacianSmooth,
  countRayHitsPlusX,
  MAX_LAPLACIAN_ROI_CELLS,
  mergeGreedyMeshBuckets,
  vertexAxisBounds,
  voxelCellInsideMesh
} from './sculptMeshLaplacian';
import { coordKey } from './coordUtils';
import { computeGreedyMesh } from './greedyMeshCore';
import { plasticVoxel, type Voxel } from './voxelMaterial';

const gray = plasticVoxel(0x888888);

const bounds8 = { minX: 0, maxX: 7, minY: 0, maxY: 7, minZ: 0, maxZ: 7 };

function opts(over: Partial<Parameters<typeof applyMeshLaplacianSmooth>[3]> = {}) {
  return {
    neighborMargin: 2,
    iterations: 4,
    relaxPct: 50,
    majorityNeighborRadius: 0,
    majorityAggressiveness: 100,
    ...over
  };
}

describe('applyMeshLaplacianSmooth', () => {
  it('merged greedy mesh has valid indices and +X parity inside 2x2x2', () => {
    const v = new Map<string, Voxel>();
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          v.set(coordKey(x, y, z), gray);
        }
      }
    }
    const m = computeGreedyMesh(v, { aoStrength: 0, occlusionVoxels: v });
    const merged = mergeGreedyMeshBuckets(m);
    expect(merged).not.toBeNull();
    const { positions, indices } = merged!;
    const nVert = positions.length / 3;
    let maxIx = 0;
    for (let i = 0; i < indices.length; i++) maxIx = Math.max(maxIx, indices[i]!);
    expect(maxIx).toBeLessThan(nVert);
    const pos64 = new Float64Array(positions.length);
    for (let i = 0; i < positions.length; i++) pos64[i] = positions[i]!;
    const vb = vertexAxisBounds(pos64);
    const hits = countRayHitsPlusX(0.5001, 0.5001, 0.5001, pos64, indices);
    expect(hits % 2).toBe(1);
    const hitsStagger = countRayHitsPlusX(0.5001, 0.5002, 0.5003, pos64, indices);
    expect(hitsStagger % 2).toBe(1);
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          expect(
            voxelCellInsideMesh(x, y, z, pos64, indices, {
              wasSolid: true,
              vertexBounds: vb
            })
          ).toBe(true);
        }
      }
    }
  });

  it('proxy+occlusion greedy mesh matches full-v mesh for 2x2x2', () => {
    const v = new Map<string, Voxel>();
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          v.set(coordKey(x, y, z), gray);
        }
      }
    }
    const roi = { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 };
    const proxy = new Map<string, Voxel>();
    for (let x = roi.minX; x <= roi.maxX; x++) {
      for (let y = roi.minY; y <= roi.maxY; y++) {
        for (let z = roi.minZ; z <= roi.maxZ; z++) {
          const k = coordKey(x, y, z);
          if (v.has(k)) proxy.set(k, { color: 0x888888, material: 'plastic' });
        }
      }
    }
    const mV = computeGreedyMesh(v, { aoStrength: 0, occlusionVoxels: v });
    const mP = computeGreedyMesh(proxy, { aoStrength: 0, occlusionVoxels: v });
    const a = mergeGreedyMeshBuckets(mV)!;
    const b = mergeGreedyMeshBuckets(mP)!;
    expect(a.indices.length).toBe(b.indices.length);
    expect(a.positions.length).toBe(b.positions.length);
  });

  it('proxy+occlusion mesh: voxelCellInsideMesh marks all 8 core voxels inside', () => {
    const v = new Map<string, Voxel>();
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          v.set(coordKey(x, y, z), gray);
        }
      }
    }
    const roi = { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 };
    const proxy = new Map<string, Voxel>();
    for (let x = roi.minX; x <= roi.maxX; x++) {
      for (let y = roi.minY; y <= roi.maxY; y++) {
        for (let z = roi.minZ; z <= roi.maxZ; z++) {
          const k = coordKey(x, y, z);
          if (v.has(k)) proxy.set(k, { color: 0x888888, material: 'plastic' });
        }
      }
    }
    const m = computeGreedyMesh(proxy, { aoStrength: 0, occlusionVoxels: v });
    const merged = mergeGreedyMeshBuckets(m)!;
    const pos64 = new Float64Array(merged.positions.length);
    for (let i = 0; i < merged.positions.length; i++) pos64[i] = merged.positions[i]!;
    const vb = vertexAxisBounds(pos64);
    let inside = 0;
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          if (
            voxelCellInsideMesh(x, y, z, pos64, merged.indices, {
              wasSolid: true,
              vertexBounds: vb
            })
          ) {
            inside++;
          }
        }
      }
    }
    expect(inside).toBe(8);
  });

  it('exports ROI cap constant', () => {
    expect(MAX_LAPLACIAN_ROI_CELLS).toBe(70_000);
  });

  it('returns empty patch when brush touches no solid voxels', () => {
    const v = new Map<string, Voxel>();
    const { toAdd, toRemove } = applyMeshLaplacianSmooth(
      v,
      [[0, 0, 0]],
      bounds8,
      opts(),
      () => gray
    );
    expect(toAdd.size).toBe(0);
    expect(toRemove.size).toBe(0);
  });

  it('with relax 0 preserves a 2×2×2 block (revoxelize matches occupancy)', () => {
    const v = new Map<string, Voxel>();
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          v.set(coordKey(x, y, z), gray);
        }
      }
    }
    const brush: [number, number, number][] = [[0, 0, 0]];
    const { toAdd, toRemove } = applyMeshLaplacianSmooth(
      v,
      brush,
      bounds8,
      opts({ relaxPct: 0, iterations: 1 }),
      () => gray
    );
    expect(toRemove.size).toBe(8);
    expect(toAdd.size).toBe(8);
    for (let x = 0; x <= 1; x++) {
      for (let y = 0; y <= 1; y++) {
        for (let z = 0; z <= 1; z++) {
          expect(toAdd.has(coordKey(x, y, z))).toBe(true);
        }
      }
    }
  });

  it('falls back to majority smooth when ROI exceeds cell budget', () => {
    const v = new Map<string, Voxel>();
    v.set(coordKey(0, 0, 0), gray);
    v.set(coordKey(1, 0, 0), gray);
    const wide: [number, number, number][] = [];
    for (let x = -70; x <= 70; x++) {
      for (let y = -70; y <= 70; y++) {
        wide.push([x, y, 0]);
      }
    }
    const wideBounds = { minX: -80, maxX: 80, minY: -80, maxY: 80, minZ: -8, maxZ: 8 };
    const { toAdd, toRemove } = applyMeshLaplacianSmooth(
      v,
      wide,
      wideBounds,
      opts({ neighborMargin: 2 }),
      () => gray
    );
    expect(toAdd.size + toRemove.size).toBeGreaterThan(0);
  });

  it('does not throw on a single voxel with positive relax', () => {
    const v = new Map<string, Voxel>([[coordKey(5, 5, 5), gray]]);
    const { toAdd, toRemove } = applyMeshLaplacianSmooth(
      v,
      [[5, 5, 5]],
      bounds8,
      opts({ neighborMargin: 1, iterations: 2, relaxPct: 40 }),
      () => gray
    );
    expect(toAdd.size).toBeGreaterThan(0);
    expect(toRemove.size).toBeGreaterThan(0);
  });
});
