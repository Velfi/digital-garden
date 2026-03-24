import type { VoxelMaterialId } from './voxelMaterial';

const TRANSMISSIVE_MATERIALS = new Set<VoxelMaterialId>(['glass', 'water']);

const MATERIAL_ABSORPTION_PER_DEPTH: Record<'glass' | 'water', number> = {
  glass: 0.16,
  water: 0.045
};

const MATERIAL_MIN_TRANSMITTANCE: Record<'glass' | 'water', number> = {
  glass: 0.34,
  water: 0.72
};

const MATERIAL_MIN_COLOR_FACTOR: Record<'glass' | 'water', number> = {
  glass: 0.55,
  water: 0.84
};

const MATERIAL_MIN_FINAL_FACTOR: Record<'glass' | 'water', number> = {
  glass: 0.2,
  water: 0.5
};

function srgbChannelToLinear(channel: number): number {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function colorLuminance(color24: number): number {
  const r = ((color24 >> 16) & 0xff) / 255;
  const g = ((color24 >> 8) & 0xff) / 255;
  const b = (color24 & 0xff) / 255;
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function isTransmissiveMaterial(material: VoxelMaterialId): material is 'glass' | 'water' {
  return TRANSMISSIVE_MATERIALS.has(material);
}

/**
 * Adaptive transmission bound used for both blocky and marching-cubes paths.
 * - Only applies to transmissive materials.
 * - Uses voxel color luminance to avoid over-darkening already-dark tints.
 * - Uses depth attenuation with a floor so thick slabs keep visible boundaries.
 */
export function computeTransmissionBound(
  color24: number,
  material: VoxelMaterialId,
  slabDepth: number
): number {
  if (!isTransmissiveMaterial(material)) return 1;
  const depth = Math.max(1, slabDepth);
  const base = Math.exp(-MATERIAL_ABSORPTION_PER_DEPTH[material] * Math.max(0, depth - 1));
  const depthBound = Math.max(MATERIAL_MIN_TRANSMITTANCE[material], base);

  const lum = colorLuminance(color24 & 0xffffff);
  const colorBound =
    MATERIAL_MIN_COLOR_FACTOR[material] + (1 - MATERIAL_MIN_COLOR_FACTOR[material]) * lum;

  const finalBound = depthBound * colorBound;
  return clamp01(Math.max(MATERIAL_MIN_FINAL_FACTOR[material], finalBound));
}
