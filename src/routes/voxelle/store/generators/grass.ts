import { coordKey } from '../../coordUtils';
import type { FaceNormal } from '../core';
import type { Voxel } from '../../voxelMaterial';
import { plasticVoxel } from '../../voxelMaterial';

/** Blades shorter than this grow perfectly straight. */
const BEND_THRESHOLD = 5;
/** Base lateral drift per voxel of height above the threshold. */
const BEND_RATE_BASE = 0.15;
/** +/- variation applied to the bend rate per blade. */
const BEND_RATE_VARIANCE = 0.1;

/** Seeded RNG (mulberry32). Returns 0–1. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two integer tangent vectors perpendicular to normal (axis-aligned). */
function getTangentVectors(normal: FaceNormal): [FaceNormal, FaceNormal] {
  const [nx, ny] = normal;
  if (nx !== 0)
    return [
      [0, 1, 0],
      [0, 0, 1]
    ];
  if (ny !== 0)
    return [
      [1, 0, 0],
      [0, 0, 1]
    ];
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

/**
 * Generate grass/fuzz voxels on a surface. Blades grow along +normal from a disk in the tangent plane.
 * Returns world-space coordKey -> color. Uses baseColor (paint / multi-color selection for variation).
 */
export function generateGrassVoxels(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  radius: number,
  density: number,
  height: number,
  baseColor: number
): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  const R = Math.max(0, Math.floor(radius));
  const maxH = Math.max(1, Math.min(40, Math.floor(height)));
  const dens = Math.max(0, Math.min(1, density));
  const [t1, t2] = getTangentVectors(normal);
  const [cx, cy, cz] = center;

  for (let i = -R; i <= R; i++) {
    for (let j = -R; j <= R; j++) {
      if (i * i + j * j > R * R) continue;
      const bladeSeed = (seed ^ (i * 73856093) ^ (j * 19349663)) >>> 0;
      const rng = createRng(bladeSeed);
      if (rng() > dens) continue;
      const bx = cx + i * t1[0] + j * t2[0];
      const by = cy + i * t1[1] + j * t2[1];
      const bz = cz + i * t1[2] + j * t2[2];
      const bladeH = 1 + Math.floor(rng() * maxH);
      const bendAngle = rng() * Math.PI * 2;
      const bendRate = Math.max(0.02, BEND_RATE_BASE + (rng() - 0.5) * 2 * BEND_RATE_VARIANCE);
      const bendD1 = Math.cos(bendAngle);
      const bendD2 = Math.sin(bendAngle);
      for (let k = 0; k < bladeH; k++) {
        let off1 = 0,
          off2 = 0;
        if (bladeH >= BEND_THRESHOLD && k >= BEND_THRESHOLD) {
          const progress = k - BEND_THRESHOLD;
          off1 = Math.round(bendD1 * bendRate * progress);
          off2 = Math.round(bendD2 * bendRate * progress);
        }
        const x = bx + k * normal[0] + off1 * t1[0] + off2 * t2[0];
        const y = by + k * normal[1] + off1 * t1[1] + off2 * t2[1];
        const z = bz + k * normal[2] + off1 * t1[2] + off2 * t2[2];
        out.set(coordKey(x, y, z), plasticVoxel(baseColor));
      }
    }
  }

  return out;
}

/**
 * Get grass voxel positions only (for preview). Same logic as generateGrassVoxels but no colors.
 */
export function getGrassPositions(
  seed: number,
  center: [number, number, number],
  normal: FaceNormal,
  radius: number,
  density: number,
  height: number
): [number, number, number][] {
  const positions: [number, number, number][] = [];
  const R = Math.max(0, Math.floor(radius));
  const maxH = Math.max(1, Math.min(40, Math.floor(height)));
  const dens = Math.max(0, Math.min(1, density));
  const [t1, t2] = getTangentVectors(normal);
  const [cx, cy, cz] = center;

  for (let i = -R; i <= R; i++) {
    for (let j = -R; j <= R; j++) {
      if (i * i + j * j > R * R) continue;
      const bladeSeed = (seed ^ (i * 73856093) ^ (j * 19349663)) >>> 0;
      const rng = createRng(bladeSeed);
      if (rng() > dens) continue;
      const bx = cx + i * t1[0] + j * t2[0];
      const by = cy + i * t1[1] + j * t2[1];
      const bz = cz + i * t1[2] + j * t2[2];
      const bladeH = 1 + Math.floor(rng() * maxH);
      const bendAngle = rng() * Math.PI * 2;
      const bendRate = Math.max(0.02, BEND_RATE_BASE + (rng() - 0.5) * 2 * BEND_RATE_VARIANCE);
      const bendD1 = Math.cos(bendAngle);
      const bendD2 = Math.sin(bendAngle);
      for (let k = 0; k < bladeH; k++) {
        let off1 = 0,
          off2 = 0;
        if (bladeH >= BEND_THRESHOLD && k >= BEND_THRESHOLD) {
          const progress = k - BEND_THRESHOLD;
          off1 = Math.round(bendD1 * bendRate * progress);
          off2 = Math.round(bendD2 * bendRate * progress);
        }
        positions.push([
          bx + k * normal[0] + off1 * t1[0] + off2 * t2[0],
          by + k * normal[1] + off1 * t1[1] + off2 * t2[1],
          bz + k * normal[2] + off1 * t1[2] + off2 * t2[2],
        ]);
      }
    }
  }

  return positions;
}
