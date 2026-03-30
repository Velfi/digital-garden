import { parseCoordKey } from '../coordUtils';

export type HaloMode = 'face' | 'omitCorners' | 'full';

export type DeriveDirtyHaloOptions = {
  aoStrength: 0 | 1 | 2;
  /** `v.size >= 500_000` — legacy: tiny edits use face halo when AO is subtle. */
  highScaleScene: boolean;
};

/**
 * Add halo chunk ids around (cx,cy,cz) into `halo` (does not remove dirty).
 */
function addHaloForChunk(
  cx: number,
  cy: number,
  cz: number,
  mode: HaloMode,
  halo: Set<string>
): void {
  if (mode === 'face') {
    const neighbors: Array<[number, number, number]> = [
      [cx, cy, cz],
      [cx + 1, cy, cz],
      [cx - 1, cy, cz],
      [cx, cy + 1, cz],
      [cx, cy - 1, cz],
      [cx, cy, cz + 1],
      [cx, cy, cz - 1]
    ];
    for (const [nx, ny, nz] of neighbors) {
      halo.add(`${nx},${ny},${nz}`);
    }
    return;
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (mode === 'omitCorners' && dx !== 0 && dy !== 0 && dz !== 0) {
          continue;
        }
        halo.add(`${cx + dx},${cy + dy},${cz + dz}`);
      }
    }
  }
}

/** Exported for tests: pick halo mode from AO + stroke size. */
export function deriveHaloMode(keys: ReadonlySet<string>, options: DeriveDirtyHaloOptions): HaloMode {
  const { aoStrength, highScaleScene } = options;
  if (aoStrength === 0) return 'face';
  if (highScaleScene && keys.size <= 8 && aoStrength <= 1) return 'face';
  if (aoStrength === 2) return 'full';
  return 'omitCorners';
}

/**
 * Dirty chunks touched by edits; halo chunks supply voxel context for greedy mesh + AO.
 *
 * - **full** — 3×3×3 (27 ids per key before dedup): strongest AO.
 * - **omitCorners** — 27 − 8 = **19** ids: drops only chunk offsets where all three of dx,dy,dz are ±1
 *   (the 8 “corner” neighbors in chunk space). Keeps **edge-diagonal** chunks like (cx+1,cy+1,cz), which
 *   face-only halo missed and caused holes; cheaper than full.
 * - **face** — 7 ids: only when AO is off or legacy high-scale tiny stroke.
 */
export function deriveDirtyAndHaloChunkIds(
  keys: ReadonlySet<string>,
  chunkSize: number,
  options: DeriveDirtyHaloOptions
): { dirtyChunkIds: string[]; haloChunkIds: string[] } {
  const dirty = new Set<string>();
  for (const key of keys) {
    const [x, y, z] = parseCoordKey(key);
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    const cz = Math.floor(z / chunkSize);
    dirty.add(`${cx},${cy},${cz}`);
  }

  const mode = deriveHaloMode(keys, options);
  const halo = new Set<string>();
  for (const key of keys) {
    const [x, y, z] = parseCoordKey(key);
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    const cz = Math.floor(z / chunkSize);
    addHaloForChunk(cx, cy, cz, mode, halo);
  }
  for (const id of dirty) halo.delete(id);
  return { dirtyChunkIds: [...dirty], haloChunkIds: [...halo] };
}
