/**
 * Greedy meshing (culled meshing) for voxels.
 * Thin wrapper over greedyMeshCore that builds Three.js BufferGeometry.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coordKey, parseCoordKey, positionsToVoxelMap } from './coordUtils';
import { computeGreedyMesh, getGreedyMeshFaceArea } from './greedyMeshCore';
import type { Voxel } from './voxelMaterial';

import type { AOStrength } from './greedyMeshCore';
export type { AOStrength } from './greedyMeshCore';

const OVERLAP_DARKEN = 0.5;

/** How to shade preview voxels that sit on existing geometry. */
export type PreviewOverlapShading = 'darken' | 'invert';

function invertRgb24(hex: number): number {
  const r = ~(hex >> 16) & 0xff;
  const g = ~(hex >> 8) & 0xff;
  const b = ~hex & 0xff;
  return (r << 16) | (g << 8) | b;
}

/** Per-cell overlap tint for stroke / placement previews. */
export function previewOverlapColor(voxelColor: number, shading: PreviewOverlapShading): number {
  const c = voxelColor & 0xffffff;
  if (shading === 'darken') return darkenHex(c, OVERLAP_DARKEN);
  return invertRgb24(c);
}

export interface GreedyMeshOptions {
  /** @deprecated use aoStrength instead */
  aoEnabled?: boolean;
  /** 0 = off, 1 = subtle, 2 = strong */
  aoStrength?: AOStrength;
  /** When true, emit one quad per visible face (no merge). Faster for previews. */
  skipMerge?: boolean;
  /**
   * Voxels used only for face culling and AO neighbor checks (see greedyMeshCore).
   * When set, should be a superset of the meshed `voxels` map (e.g. scene + preview).
   */
  occlusionVoxels?: Map<string, Voxel>;
}

/** Selection / stamp thumbnails / add-panel coarse LOD: skip merge, AO off. */
export const PREVIEW_MESH_OPTIONS: GreedyMeshOptions = {
  skipMerge: true,
  aoStrength: 0
};

/** Precise / guide work plane in world space (integer voxel centers, plane from face anchor). */
export type PreviewGuidePlaneOverlap = {
  planePoint: [number, number, number];
  planeNormal: [number, number, number];
};

/** Extra greedy options for `buildPreviewGeometry*` (always uses skipMerge internally). */
export type PreviewGreedyExtras = {
  aoStrength?: AOStrength;
  /** Scene voxels for AO and culling against existing geometry (not meshed as preview surface). */
  occlusionVoxels?: Map<string, Voxel>;
  /** Highlight preview cells whose voxel AABB cuts this plane (e.g. precise work plane). */
  planeOverlap?: PreviewGuidePlaneOverlap;
};

export type PreviewVoxelSource = Voxel | ((x: number, y: number, z: number) => Voxel);

/** True if the unit cube centered at integer (cx,cy,cz) intersects the infinite plane. */
export function voxelCellIntersectsWorkPlane(
  cx: number,
  cy: number,
  cz: number,
  planePoint: [number, number, number],
  planeNormal: [number, number, number]
): boolean {
  const [px, py, pz] = planePoint;
  const [nx, ny, nz] = planeNormal;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return false;
  const nx0 = nx / len;
  const ny0 = ny / len;
  const nz0 = nz / len;
  const d = (cx - px) * nx0 + (cy - py) * ny0 + (cz - pz) * nz0;
  const extent = 0.5 * (Math.abs(nx0) + Math.abs(ny0) + Math.abs(nz0));
  return Math.abs(d) <= extent + 1e-6;
}

export function mergePreviewOcclusion(
  previewMap: Map<string, Voxel>,
  world?: Map<string, Voxel>
): Map<string, Voxel> | undefined {
  if (!world || world.size === 0) return undefined;
  const out = new Map(previewMap);
  for (const [k, v] of world) {
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

function darkenHex(hex: number, factor: number): number {
  const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((hex >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/**
 * Build a single-color mesh from positions. Returns BufferGeometry or null if empty.
 * When existingVoxels is provided, overlapping cells use overlap shading (invert or darken).
 */
export function buildPreviewGeometry(
  positions: [number, number, number][],
  voxel: PreviewVoxelSource,
  existingVoxels?: Map<string, Voxel>,
  overlapShading: PreviewOverlapShading = 'invert',
  extras?: PreviewGreedyExtras
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const resolveVoxel =
    typeof voxel === 'function' ? voxel : (_x: number, _y: number, _z: number) => voxel;
  const plane = extras?.planeOverlap;
  let voxelMap: Map<string, Voxel>;
  if (existingVoxels && existingVoxels.size > 0) {
    voxelMap = new Map();
    for (const [x, y, z] of positions) {
      const key = coordKey(x, y, z);
      const resolved = resolveVoxel(x, y, z);
      const onPlane =
        plane !== undefined &&
        voxelCellIntersectsWorkPlane(x, y, z, plane.planePoint, plane.planeNormal);
      voxelMap.set(key, {
        color:
          existingVoxels.has(key) || onPlane
            ? previewOverlapColor(resolved.color, overlapShading)
            : resolved.color,
        material: resolved.material
      });
    }
  } else if (plane) {
    voxelMap = new Map();
    for (const [x, y, z] of positions) {
      const key = coordKey(x, y, z);
      const resolved = resolveVoxel(x, y, z);
      const onPlane = voxelCellIntersectsWorkPlane(x, y, z, plane.planePoint, plane.planeNormal);
      voxelMap.set(key, {
        color: onPlane ? previewOverlapColor(resolved.color, overlapShading) : resolved.color,
        material: resolved.material
      });
    }
  } else {
    if (typeof voxel === 'function') {
      voxelMap = new Map();
      for (const [x, y, z] of positions) {
        const resolved = voxel(x, y, z);
        voxelMap.set(coordKey(x, y, z), {
          color: resolved.color,
          material: resolved.material
        });
      }
    } else {
      voxelMap = positionsToVoxelMap(positions, voxel);
    }
  }
  const mergedOcclusion = mergePreviewOcclusion(voxelMap, extras?.occlusionVoxels);
  const geoByColor = buildGreedyMesh(voxelMap, {
    skipMerge: true,
    aoStrength: extras?.aoStrength ?? 0,
    ...(mergedOcclusion ? { occlusionVoxels: mergedOcclusion } : {})
  });
  const geos = [...geoByColor.values()];
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

/**
 * Multi-voxel preview (e.g. paste placement ghost). Overlap cells use invert or darken.
 */
export function buildPreviewGeometryFromVoxelMap(
  voxelMap: Map<string, Voxel>,
  existingVoxels: Map<string, Voxel>,
  overlapShading: PreviewOverlapShading = 'invert',
  extras?: PreviewGreedyExtras
): THREE.BufferGeometry | null {
  if (voxelMap.size === 0) return null;
  const plane = extras?.planeOverlap;
  let map: Map<string, Voxel>;
  if (existingVoxels.size > 0) {
    map = new Map();
    for (const [key, vx] of voxelMap) {
      const [x, y, z] = parseCoordKey(key);
      const onPlane =
        plane !== undefined &&
        voxelCellIntersectsWorkPlane(x, y, z, plane.planePoint, plane.planeNormal);
      map.set(key, {
        color:
          existingVoxels.has(key) || onPlane
            ? previewOverlapColor(vx.color, overlapShading)
            : vx.color,
        material: vx.material
      });
    }
  } else if (plane) {
    map = new Map();
    for (const [key, vx] of voxelMap) {
      const [x, y, z] = parseCoordKey(key);
      const onPlane = voxelCellIntersectsWorkPlane(x, y, z, plane.planePoint, plane.planeNormal);
      map.set(key, {
        color: onPlane ? previewOverlapColor(vx.color, overlapShading) : vx.color,
        material: vx.material
      });
    }
  } else {
    map = voxelMap;
  }
  const mergedOcclusion = mergePreviewOcclusion(map, extras?.occlusionVoxels);
  const geoByBucket = buildGreedyMesh(map, {
    skipMerge: true,
    aoStrength: extras?.aoStrength ?? 0,
    ...(mergedOcclusion ? { occlusionVoxels: mergedOcclusion } : {})
  });
  const geos = [...geoByBucket.values()];
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
    skipMerge: options.skipMerge,
    occlusionVoxels: options.occlusionVoxels
  });
  const result = new Map<string, THREE.BufferGeometry>();

  for (const [bucketKey, data] of coreResults) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geo.setAttribute('slabThickness', new THREE.Float32BufferAttribute(data.slabThickness, 1));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    result.set(bucketKey, geo);
  }

  return result;
}

export { getGreedyMeshFaceArea };
