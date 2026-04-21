import type { Cell } from '../store/types';
import { vDist } from './geometry';

// Best-effort per-cell assignment remapping across topology edits.
// Uses nearest-centroid + area-similarity matching with a distance cap.
// Generic over value type so both color and material assignments can share
// the same matching (they must share matches — a cell's material should
// follow its color to the new cell).
export function reassignPerCell<V>(
  oldCells: Cell[],
  newCells: Cell[],
  values: Record<string, V>
): Record<string, V> {
  // Direct carry-over by ID first — this handles the common case where the
  // stable id hashing matches.
  const out: Record<string, V> = {};
  const unmatchedOld: Cell[] = [];
  for (const oc of oldCells) {
    const v = values[oc.id];
    if (v === undefined) continue;
    const still = newCells.find((n) => n.id === oc.id);
    if (still) {
      out[oc.id] = v;
    } else {
      unmatchedOld.push(oc);
    }
  }

  if (unmatchedOld.length === 0) return out;

  const availableNew = newCells.filter((n) => !out[n.id]);

  // Greedy match: for each orphaned old cell, find the nearest unclaimed new
  // cell within a radius proportional to sqrt(area).
  const claimed = new Set<string>();
  for (const oc of unmatchedOld) {
    const v = values[oc.id];
    if (v === undefined) continue;
    const threshold = Math.max(8, Math.sqrt(oc.area) * 0.6);
    let best: Cell | null = null;
    let bestScore = Infinity;
    for (const nc of availableNew) {
      if (claimed.has(nc.id)) continue;
      const d = vDist(oc.centroid, nc.centroid);
      if (d > threshold) continue;
      const areaRatio = Math.abs(Math.log(Math.max(1, nc.area) / Math.max(1, oc.area)));
      const score = d + areaRatio * 20;
      if (score < bestScore) {
        bestScore = score;
        best = nc;
      }
    }
    if (best) {
      out[best.id] = v;
      claimed.add(best.id);
    }
  }

  return out;
}

// Back-compat alias for the original color-specific name.
export function reassignColors(
  oldCells: Cell[],
  newCells: Cell[],
  colors: Record<string, string>
): Record<string, string> {
  return reassignPerCell(oldCells, newCells, colors);
}
