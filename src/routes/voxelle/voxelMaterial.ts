/**
 * Per-voxel material presets and helpers. Voxel values are { color, material }.
 */
import * as THREE from 'three';

const PLASTIC: VoxelMaterialId = 'plastic';
export const VOXEL_MATERIAL_IDS = ['plastic', 'metal', 'rubber', 'glass', 'water', 'glow'] as const;
export type VoxelMaterialId = (typeof VOXEL_MATERIAL_IDS)[number];

export type Voxel = { color: number; material: VoxelMaterialId };


/** Solid plastic voxel (common default for generators / import). */
export function plasticVoxel(color: number): Voxel {
  return { color: color & 0xffffff, material: PLASTIC };
}

/** Legacy bare RGB number → plastic voxel. */
export function normalizeLegacyVoxel(value: number): Voxel {
  return { color: value >>> 0 & 0xffffff, material: PLASTIC };
}

export function isVoxelMaterialId(s: string): s is VoxelMaterialId {
  return (VOXEL_MATERIAL_IDS as readonly string[]).includes(s);
}

export function parseVoxelMaterial(value: unknown, fallback: VoxelMaterialId = PLASTIC): VoxelMaterialId {
  if (typeof value === 'string' && isVoxelMaterialId(value)) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < VOXEL_MATERIAL_IDS.length) {
    return VOXEL_MATERIAL_IDS[value]!;
  }
  return fallback;
}

export function voxelBucketKey(v: Voxel): string {
  return `${v.color}|${v.material}`;
}

export function parseBucketKey(key: string): { color: number; material: VoxelMaterialId } | null {
  const i = key.lastIndexOf('|');
  if (i <= 0) return null;
  const color = Number(key.slice(0, i));
  const mat = key.slice(i + 1);
  if (!Number.isInteger(color) || !isVoxelMaterialId(mat)) return null;
  return { color, material: mat };
}

/** `THREE.Mesh.userData` key: selective post-process bloom applies only when `true` (glow buckets). */
export const VOXELLE_GLOW_BLOOM_USERDATA_KEY = 'voxelleGlowBloom';

/** `THREE.Mesh.userData` key: bucket `VoxelMaterialId` (shadow receive, etc.). */
export const VOXELLE_MESH_MATERIAL_USERDATA_KEY = 'voxelleMaterialId';

/** Selection / tools: same paint color regardless of material. */
export function sameVoxelColor(a: Voxel, b: Voxel): boolean {
  return a.color === b.color;
}

export function voxelEquals(a: Voxel, b: Voxel): boolean {
  return a.color === b.color && a.material === b.material;
}

/** Clay smooth: average RGB; material wins by plurality (tie → lower index in VOXEL_MATERIAL_IDS). */
export function blendVoxelsForSmooth(neighbors: Voxel[]): Voxel {
  if (neighbors.length === 0) {
    return { color: 0x888888, material: PLASTIC };
  }
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const v of neighbors) {
    sr += (v.color >> 16) & 0xff;
    sg += (v.color >> 8) & 0xff;
    sb += v.color & 0xff;
  }
  const n = neighbors.length;
  const color =
    ((Math.round(sr / n) & 0xff) << 16) | ((Math.round(sg / n) & 0xff) << 8) | (Math.round(sb / n) & 0xff);

  const counts = new Map<VoxelMaterialId, number>();
  for (const v of neighbors) {
    counts.set(v.material, (counts.get(v.material) ?? 0) + 1);
  }
  let best: VoxelMaterialId = PLASTIC;
  let bestC = -1;
  for (const id of VOXEL_MATERIAL_IDS) {
    const c = counts.get(id) ?? 0;
    if (c > bestC) {
      bestC = c;
      best = id;
    }
  }
  return { color, material: best };
}

export function cloneVoxel(v: Voxel | number): Voxel {
  if (typeof v === 'number') return normalizeLegacyVoxel(v);
  return { color: v.color & 0xffffff, material: v.material };
}

/**
 * Single preset for voxel `glass` material: shared by `createVoxelSurfaceMaterial` and glass shadow depth bias
 * (`meshManager` `createGlassShadowDepthMaterial`). Lower `transmission`, larger `thickness`, or shorter
 * `attenuationDistance` → darker cast shadows (less depth bias).
 */
export const VOXEL_GLASS_PHYSICAL = {
  transmission: 0.96,
  thickness: 0.65,
  ior: 1.5,
  attenuationDistance: 2.5,
  roughness: 0.06,
  clearcoat: 0.12,
  clearcoatRoughness: 0.04
} as const;

export const VOXEL_WATER_PHYSICAL = {
  transmission: 0.995,
  thickness: 0.9,
  ior: 1.333,
  attenuationDistance: 20,
  roughness: 0.03,
  clearcoat: 0.08,
  clearcoatRoughness: 0.02
} as const;

/** Base IBL strength per preset (before scene environment multiplier). */
export function voxelMaterialBaseEnvMapIntensity(materialId: VoxelMaterialId): number {
  const plastic = 0.45;
  switch (materialId) {
    case 'plastic':
      return plastic;
    case 'glass':
      return plastic * 1.25;
    case 'metal':
      return 0.52;
    case 'rubber':
      return plastic * 0.35;
    case 'glow':
      return plastic * 0.85;
    case 'water':
      return plastic * 1.2;
    default:
      return plastic;
  }
}

/**
 * Three.js material for one greedy-mesh bucket (same color + material).
 * @param color24 - Bucket RGB; used for glow emissive (vertex colors still carry AO-tinted albedo).
 */
export function createVoxelSurfaceMaterial(
  materialId: VoxelMaterialId,
  envMap: THREE.Texture | null,
  color24: number = 0xffffff,
  environmentIntensity: number = 1
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const baseIntensity = voxelMaterialBaseEnvMapIntensity(materialId) * environmentIntensity;
  const base = {
    vertexColors: true,
    envMap,
    envMapIntensity: baseIntensity
  } as const;

  if (materialId === 'glass') {
    const g = VOXEL_GLASS_PHYSICAL;
    const tint = new THREE.Color(color24 & 0xffffff);
    const m = new THREE.MeshPhysicalMaterial({
      ...base,
      metalness: 0,
      roughness: g.roughness,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      transmission: g.transmission,
      thickness: g.thickness,
      ior: g.ior,
      specularIntensity: 1,
      clearcoat: g.clearcoat,
      clearcoatRoughness: g.clearcoatRoughness,
      attenuationColor: tint,
      attenuationDistance: g.attenuationDistance
    });
    /**
     * Greedy mesh provides `slabThickness` (voxel count through the glass slab, world-query via
     * `occlusionVoxels` when chunking). Scale the physical transmission volume thickness so refraction /
     * attenuation match thick caps and stay consistent when merge topology differs per chunk.
     */
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float slabThickness;
varying float voxelleSlabThickness;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
voxelleSlabThickness = slabThickness;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying float voxelleSlabThickness;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '\tmaterial.thickness = thickness;',
        '\tmaterial.thickness = thickness * max( voxelleSlabThickness, 1.0 );'
      );
    };
    return m;
  }

  if (materialId === 'water') {
    const w = VOXEL_WATER_PHYSICAL;
    const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(color24 & 0xffffff), 0.2);
    const m = new THREE.MeshPhysicalMaterial({
      ...base,
      metalness: 0,
      roughness: w.roughness,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      transmission: w.transmission,
      thickness: w.thickness,
      ior: w.ior,
      specularIntensity: 1,
      clearcoat: w.clearcoat,
      clearcoatRoughness: w.clearcoatRoughness,
      attenuationColor: tint,
      attenuationDistance: w.attenuationDistance
    });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float slabThickness;
varying float voxelleSlabThickness;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
voxelleSlabThickness = slabThickness;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying float voxelleSlabThickness;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '\tmaterial.thickness = thickness;',
        '\tmaterial.thickness = thickness * max( voxelleSlabThickness, 1.0 );'
      );
    };
    return m;
  }

  if (materialId === 'metal') {
    return new THREE.MeshStandardMaterial({
      ...base,
      metalness: 0.88,
      roughness: 0.32
    });
  }

  if (materialId === 'glow') {
    return new THREE.MeshStandardMaterial({
      ...base,
      metalness: 0,
      roughness: 0.28,
      emissive: new THREE.Color(color24 & 0xffffff),
      emissiveIntensity: 2.5
    });
  }

  if (materialId === 'rubber') {
    return new THREE.MeshStandardMaterial({
      ...base,
      metalness: 0,
      roughness: 0.9
    });
  }

  return new THREE.MeshStandardMaterial({
    ...base,
    metalness: 0,
    roughness: 0.48
  });
}
