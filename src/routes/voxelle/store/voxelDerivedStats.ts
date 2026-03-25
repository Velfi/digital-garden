import { writable } from 'svelte/store';
import type { Voxel } from '../voxelMaterial';

/** Count of visible voxels with `glow` material; updated incrementally on sculpt path and recomputed on bulk replaces. */
export const glowVoxelCount = writable(0);

export function recomputeGlowVoxelCountFromMap(m: Map<string, Voxel>): void {
  let c = 0;
  for (const v of m.values()) {
    if (v.material === 'glow') c++;
  }
  glowVoxelCount.set(c);
}

export function bumpGlowVoxelCount(prev: Voxel | undefined, next: Voxel | undefined): void {
  glowVoxelCount.update((c) => {
    let n = c;
    if (prev?.material === 'glow') n--;
    if (next?.material === 'glow') n++;
    return Math.max(0, n);
  });
}
