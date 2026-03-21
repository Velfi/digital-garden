/**
 * Greedy meshing (culled meshing) for voxels.
 * Thin wrapper over greedyMeshCore that builds Three.js BufferGeometry.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coordKey, positionsToVoxelMap } from './coordUtils';
import { computeGreedyMesh, getGreedyMeshFaceArea } from './greedyMeshCore';
import type { Voxel } from './voxelMaterial';

import type { AOStrength } from './greedyMeshCore';
export type { AOStrength } from './greedyMeshCore';

const OVERLAP_DARKEN = 0.5;

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

function darkenHex(hex: number, factor: number): number {
  const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((hex >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/**
 * Build a single-color mesh from positions. Returns BufferGeometry or null if empty.
 * When existingVoxels is provided, positions that intersect existing voxels are shaded more darkly.
 */
export function buildPreviewGeometry(
  positions: [number, number, number][],
  voxel: Voxel,
  existingVoxels?: Map<string, Voxel>
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  let voxelMap: Map<string, Voxel>;
  if (existingVoxels && existingVoxels.size > 0) {
    const darkColor = darkenHex(voxel.color, OVERLAP_DARKEN);
    voxelMap = new Map();
    for (const [x, y, z] of positions) {
      const key = coordKey(x, y, z);
      voxelMap.set(key, {
        color: existingVoxels.has(key) ? darkColor : voxel.color,
        material: voxel.material
      });
    }
  } else {
    voxelMap = positionsToVoxelMap(positions, voxel);
  }
  const geoByColor = buildGreedyMesh(voxelMap, PREVIEW_MESH_OPTIONS);
  const geos = [...geoByColor.values()];
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function buildGreedyMesh(
  voxels: Map<string, Voxel>,
  options: GreedyMeshOptions = {}
): Map<string, THREE.BufferGeometry> {
  const coreResults = computeGreedyMesh(voxels, {
    aoEnabled: options.aoEnabled,
    aoStrength: options.aoStrength,
    skipMerge: options.skipMerge
  });
  const result = new Map<string, THREE.BufferGeometry>();

  for (const [bucketKey, data] of coreResults) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    result.set(bucketKey, geo);
  }

  return result;
}

export { getGreedyMeshFaceArea };
