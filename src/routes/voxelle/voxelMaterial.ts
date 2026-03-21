/**
 * Per-voxel material presets and helpers. Voxel values are { color, material }.
 */
import * as THREE from 'three';

const PLASTIC: VoxelMaterialId = 'plastic';
export const VOXEL_MATERIAL_IDS = ['plastic', 'metal', 'glass', 'glow'] as const;
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
    case 'glow':
      return plastic * 0.85;
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
    const m = new THREE.MeshPhysicalMaterial({
      ...base,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      transmission: 0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.03
    });
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

  return new THREE.MeshStandardMaterial({
    ...base,
    metalness: 0,
    roughness: 0.48
  });
}
