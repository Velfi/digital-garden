/**
 * Greedy meshing (culled meshing) for voxels.
 * Thin wrapper over greedyMeshCore that builds Three.js BufferGeometry.
 */
import * as THREE from 'three';
import { positionsToVoxelMap } from './coordUtils';
import { computeGreedyMesh, getGreedyMeshFaceArea } from './greedyMeshCore';

import type { AOStrength } from './greedyMeshCore';
export type { AOStrength } from './greedyMeshCore';

export interface GreedyMeshOptions {
  /** @deprecated use aoStrength instead */
  aoEnabled?: boolean;
  /** 0 = off, 1 = subtle, 2 = strong */
  aoStrength?: AOStrength;
  /** When true, emit one quad per visible face (no merge). Faster for previews. */
  skipMerge?: boolean;
}

/** Options for preview/overlay meshes: no AO, no quad merging. */
export const PREVIEW_MESH_OPTIONS: GreedyMeshOptions = {
  aoEnabled: false,
  skipMerge: true
};

/**
 * Build a single-color mesh from positions. Returns BufferGeometry or null if empty.
 */
export function buildPreviewGeometry(
  positions: [number, number, number][],
  color: number
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const voxelMap = positionsToVoxelMap(positions, color);
  const geoByColor = buildGreedyMesh(voxelMap, PREVIEW_MESH_OPTIONS);
  return geoByColor.get(color) ?? null;
}

export function buildGreedyMesh(
  voxels: Map<string, number>,
  options: GreedyMeshOptions = {}
): Map<number, THREE.BufferGeometry> {
  const coreResults = computeGreedyMesh(voxels, {
    aoEnabled: options.aoEnabled,
    aoStrength: options.aoStrength,
    skipMerge: options.skipMerge
  });
  const result = new Map<number, THREE.BufferGeometry>();

  for (const [col, data] of coreResults) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    result.set(col, geo);
  }

  return result;
}

export { getGreedyMeshFaceArea };
