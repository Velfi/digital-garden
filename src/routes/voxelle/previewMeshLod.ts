/**
 * LOD for preview meshes: downsample voxels to a coarse grid, mesh, then scale/position
 * to match world extent. Enables fast first-frame preview with optional async refinement.
 */
import * as THREE from 'three';
import { coordKey, parseCoordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import {
  previewOverlapColor,
  voxelCellIntersectsWorkPlane,
  type PreviewGuidePlaneOverlap,
  type PreviewOverlapShading,
  type PreviewVoxelSource
} from './greedyMesh';

/** Coarse cell count above which stroke/add-shape preview uses LOD downsampling. */
export const PREVIEW_LOD_COARSE_TARGET = 12_000;
const MAX_STRIDE = 8;

export type MinTuple = [number, number, number];

/**
 * Choose stride so coarse cell count stays under ~LOD_COARSE_TARGET.
 * Returns 1 for full resolution when count is small.
 */
export function computePreviewLodStride(
  count: number,
  options?: { maxCoarse?: number; maxStride?: number }
): number {
  const maxCoarse = options?.maxCoarse ?? PREVIEW_LOD_COARSE_TARGET;
  const maxStride = options?.maxStride ?? MAX_STRIDE;
  if (count <= maxCoarse) return 1;
  let s = 1;
  while (s < maxStride && count / (s * s * s) > maxCoarse) s *= 2;
  return Math.min(s, maxStride);
}

/**
 * Downsample positions into a coarse voxel Map for preview meshing.
 * min = [minX, minY, minZ] of the positions AABB.
 * If existingVoxels is set, a coarse cell uses overlap shading when any fine voxel in that cell overlaps.
 * If planeOverlap is set, a coarse cell uses overlap shading when any fine voxel's cell cuts that plane.
 */
export function downsamplePositionsToPreviewMap(
  positions: [number, number, number][],
  voxel: PreviewVoxelSource,
  stride: number,
  min: MinTuple,
  existingVoxels?: Map<string, Voxel>,
  overlapShading: PreviewOverlapShading = 'invert',
  planeOverlap?: PreviewGuidePlaneOverlap
): Map<string, Voxel> {
  const [minX, minY, minZ] = min;
  const map = new Map<string, Voxel>();
  const resolveVoxel =
    typeof voxel === 'function' ? voxel : (_x: number, _y: number, _z: number) => voxel;
  const overlapCells = new Set<string>();
  for (const [x, y, z] of positions) {
    const cx = Math.floor((x - minX) / stride);
    const cy = Math.floor((y - minY) / stride);
    const cz = Math.floor((z - minZ) / stride);
    const ck = coordKey(cx, cy, cz);
    if (existingVoxels?.has(coordKey(x, y, z))) overlapCells.add(ck);
    if (
      planeOverlap &&
      voxelCellIntersectsWorkPlane(x, y, z, planeOverlap.planePoint, planeOverlap.planeNormal)
    ) {
      overlapCells.add(ck);
    }
    if (!map.has(ck)) {
      const ax = minX + cx * stride;
      const ay = minY + cy * stride;
      const az = minZ + cz * stride;
      const resolved = resolveVoxel(ax, ay, az);
      map.set(ck, { color: resolved.color, material: resolved.material });
    }
  }
  for (const ck of overlapCells) {
    const v = map.get(ck)!;
    map.set(ck, {
      ...v,
      color: previewOverlapColor(v.color, overlapShading)
    });
  }
  return map;
}

/**
 * Downsample a voxel Map (e.g. selection) to coarse keys.
 * First voxel in each coarse cell wins for color/material (selection overlay is usually single color).
 */
export function downsampleVoxelMapToPreviewMap(
  voxels: Map<string, Voxel>,
  stride: number,
  min: MinTuple
): Map<string, Voxel> {
  const [minX, minY, minZ] = min;
  const map = new Map<string, Voxel>();
  for (const [key, v] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const cx = Math.floor((x - minX) / stride);
    const cy = Math.floor((y - minY) / stride);
    const cz = Math.floor((z - minZ) / stride);
    const ck = coordKey(cx, cy, cz);
    if (!map.has(ck)) map.set(ck, v);
  }
  return map;
}

/** Set mesh scale and position so coarse geometry (unit cubes 0..n) aligns to world [min, min+stride) for cell 0. */
export function alignPreviewMeshToLod(
  mesh: THREE.Mesh,
  stride: number,
  min: MinTuple | THREE.Vector3
): void {
  const mx = Array.isArray(min) ? min[0] : min.x;
  const my = Array.isArray(min) ? min[1] : min.y;
  const mz = Array.isArray(min) ? min[2] : min.z;
  const half = stride / 2;
  mesh.scale.set(stride, stride, stride);
  mesh.position.set(mx + half, my + half, mz + half);
}

/** Reset mesh to full-resolution transform (identity scale/position). */
export function resetPreviewMeshTransform(mesh: THREE.Mesh): void {
  mesh.scale.set(1, 1, 1);
  mesh.position.set(0, 0, 0);
}

export interface PreviewRefinementScheduler {
  /** Schedule a refinement task; only the latest token's completion is applied. */
  schedule(run: () => void): void;
  /** Cancel any pending refinement and bump token so in-flight completions are ignored. */
  cancel(): void;
  /** Current generation token (monotonic). */
  readonly token: number;
}

/**
 * Scheduler for deferred full-resolution preview builds.
 * Use schedule(cb) to run cb in requestIdleCallback; cb should check scheduler.token
 * and only apply results if still current (caller can pass token into cb via closure).
 */
export function createPreviewRefinementScheduler(): PreviewRefinementScheduler {
  let token = 0;
  let idleId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  function runSoon(cb: () => void): void {
    const run = () => {
      idleId = undefined;
      timeoutId = undefined;
      cb();
    };
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 80 });
    } else {
      timeoutId = setTimeout(run, 0);
    }
  }

  return {
    get token() {
      return token;
    },
    schedule(run: () => void) {
      const gen = ++token;
      runSoon(() => {
        if (gen !== token) return;
        run();
      });
    },
    cancel() {
      token++;
      if (idleId !== undefined) {
        cancelIdleCallback(idleId);
        idleId = undefined;
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    }
  };
}
