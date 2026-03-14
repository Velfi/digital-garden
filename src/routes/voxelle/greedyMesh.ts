/**
 * Greedy meshing (culled meshing) for voxels.
 * Thin wrapper over greedyMeshCore that builds Three.js BufferGeometry.
 */
import * as THREE from 'three';
import { computeGreedyMesh, getGreedyMeshFaceArea } from './greedyMeshCore';

export interface GreedyMeshOptions {
  /** When false, vertex ambient occlusion is disabled (flat vertex colors). */
  aoEnabled?: boolean;
}

export function buildGreedyMesh(
  voxels: Map<string, number>,
  options: GreedyMeshOptions = {}
): Map<number, THREE.BufferGeometry> {
  const coreResults = computeGreedyMesh(voxels, options);
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
