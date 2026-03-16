import { get } from 'svelte/store';
import { coordKey, parseCoordKey, inBounds, getSelectionBounds } from '../coordUtils';
import { voxels, selection, gridSize, pushUndo, updateVoxels, planeAxis, fillConstrainToPlane } from './core';
import type { FaceNormal, SelectionMode } from './core';

function getPlaneAxisNumber(): 0 | 1 | 2 {
  const pa = get(planeAxis);
  return pa === 'auto' ? 1 : pa;
}

function inPlane(nx: number, ny: number, nz: number, seedX: number, seedY: number, seedZ: number): boolean {
  const axis = getPlaneAxisNumber();
  if (axis === 0) return nx === seedX;
  if (axis === 1) return ny === seedY;
  return nz === seedZ;
}

const ADJ_6: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
];

const ADJ_26: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        if (dx !== 0 || dy !== 0 || dz !== 0) out.push([dx, dy, dz]);
      }
    }
  }
  return out;
})();

export function getFillSelectionAt(
  x: number,
  y: number,
  z: number,
  diagonals: boolean,
  respectsColor: boolean = true
): Map<string, number> {
  const v = get(voxels);
  const sz = get(gridSize);
  const k0 = coordKey(x, y, z);
  const targetColor = v.get(k0);
  if (targetColor === undefined) return new Map();
  const adj = diagonals ? ADJ_26 : ADJ_6;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Map<string, number>();
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    const col = v.get(ck);
    if (col === undefined) continue;
    if (respectsColor && col !== targetColor) continue;
    next.set(ck, col);
    for (const [dx, dy, dz] of adj) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (inBounds(nx, ny, nz, sz)) {
        if (get(fillConstrainToPlane) && !inPlane(nx, ny, nz, x, y, z)) continue;
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  return next;
}

export function getFillEmptyAt(
  x: number,
  y: number,
  z: number,
  diagonals: boolean
): Set<string> {
  const v = get(voxels);
  const sz = get(gridSize);
  const k0 = coordKey(x, y, z);
  if (v.has(k0)) return new Set();
  const adj = diagonals ? ADJ_26 : ADJ_6;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Set<string>();
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    if (v.has(ck)) continue;
    next.add(ck);
    for (const [dx, dy, dz] of adj) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (inBounds(nx, ny, nz, sz)) {
        if (get(fillConstrainToPlane) && !inPlane(nx, ny, nz, x, y, z)) continue;
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  return next;
}

export function mergeSelection(
  current: Map<string, number>,
  incoming: Map<string, number>,
  mode: SelectionMode
): Map<string, number> {
  if (mode === 'replace') return new Map(incoming);
  const next = new Map(current);
  if (mode === 'add') {
    for (const [k, c] of incoming) next.set(k, c);
    return next;
  }
  if (mode === 'subtract') {
    for (const k of incoming.keys()) next.delete(k);
    return next;
  }
  if (mode === 'toggle') {
    for (const [k, c] of incoming) {
      if (next.has(k)) next.delete(k);
      else next.set(k, c);
    }
    return next;
  }
  const out = new Map<string, number>();
  for (const [k, c] of incoming) {
    if (current.has(k)) out.set(k, c);
  }
  return out;
}

export function selectAll() {
  pushUndo();
  const v = get(voxels);
  const next = new Map<string, number>();
  for (const [key, col] of v) next.set(key, col);
  selection.set(next);
}

export function deselectAll() {
  pushUndo();
  selection.set(new Map());
}

export function deselectVoxels() {
  pushUndo();
  const v = get(voxels);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    if (!v.has(key)) next.set(key, col);
  }
  selection.set(next);
}

export function deselectEmptySpaces() {
  pushUndo();
  const v = get(voxels);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    if (v.has(key)) next.set(key, col);
  }
  selection.set(next);
}

export function invertSelection() {
  pushUndo();
  const v = get(voxels);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of v) {
    if (!sel.has(key)) next.set(key, col);
  }
  selection.set(next);
}

export function growSelection() {
  pushUndo();
  const v = get(voxels);
  const sz = get(gridSize);
  const sel = get(selection);
  const next = new Map(sel);
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBounds(nx, ny, nz, sz)) {
        const k = coordKey(nx, ny, nz);
        const col = v.get(k);
        if (col !== undefined) next.set(k, col);
      }
    }
  }
  selection.set(next);
}

export function shrinkSelection() {
  pushUndo();
  const v = get(voxels);
  const sz = get(gridSize);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    let onBoundary = false;
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBounds(nx, ny, nz, sz)) {
        const k = coordKey(nx, ny, nz);
        if (!v.has(k)) {
          onBoundary = true;
          break;
        }
      } else {
        onBoundary = true;
        break;
      }
    }
    if (!onBoundary) next.set(key, col);
  }
  selection.set(next);
}

/** Deselect any selected voxel that has all 6 face-neighbors also in the selection. */
export function deselectInnerVoxels() {
  pushUndo();
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    let bounded = true;
    for (const [dx, dy, dz] of ADJ_6) {
      const nk = coordKey(x + dx, y + dy, z + dz);
      if (!sel.has(nk)) {
        bounded = false;
        break;
      }
    }
    if (!bounded) next.set(key, col);
  }
  selection.set(next);
}

export function hollowOut(): void {
  const v = get(voxels);
  const sel = get(selection);

  const toRemove: string[] = [];
  const isInterior = (key: string): boolean => {
    const [x, y, z] = parseCoordKey(key);
    for (const [dx, dy, dz] of ADJ_6) {
      const nk = coordKey(x + dx, y + dy, z + dz);
      const neighborExists = v.has(nk);
      const neighborInScope = sel.size === 0 ? neighborExists : sel.has(nk) && neighborExists;
      if (!neighborInScope) return false;
    }
    return true;
  };

  const candidates = sel.size === 0 ? v.keys() : [...sel.keys()].filter((k) => v.has(k));
  for (const key of candidates) {
    if (isInterior(key)) toRemove.push(key);
  }

  if (toRemove.length === 0) return;
  pushUndo();
  updateVoxels((next) => {
    for (const k of toRemove) next.delete(k);
  });
  selection.update((s) => {
    const next = new Map(s);
    for (const k of toRemove) next.delete(k);
    return next;
  });
}

export function selectConnected() {
  const v = get(voxels);
  const sz = get(gridSize);
  const sel = get(selection);
  if (sel.size === 0) return;
  pushUndo();
  const firstKey = sel.keys().next().value;
  if (!firstKey) return;
  const targetColor = sel.get(firstKey)!;
  const [sx, sy, z0] = parseCoordKey(firstKey);
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[sx, sy, z0]];
  const next = new Map<string, number>();
  while (stack.length > 0) {
    const [x, y, z] = stack.pop()!;
    const k = coordKey(x, y, z);
    if (visited.has(k)) continue;
    visited.add(k);
    const col = v.get(k);
    if (col !== targetColor) continue;
    next.set(k, col);
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBounds(nx, ny, nz, sz)) {
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  selection.set(next);
}

/** All voxels in the same plane as the given face (plane perpendicular to faceNormal), connected within that plane. */
export function getCoplanarFacesSelectionAt(
  x: number,
  y: number,
  z: number,
  faceNormal: FaceNormal
): Map<string, number> {
  const v = get(voxels);
  const sz = get(gridSize);
  const k0 = coordKey(x, y, z);
  if (!v.has(k0)) return new Map();
  const [nx, ny, nz] = faceNormal;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Map<string, number>();
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    const col = v.get(ck);
    if (col === undefined) continue;
    next.set(ck, col);
    for (const [dx, dy, dz] of ADJ_6) {
      if (dx * nx + dy * ny + dz * nz !== 0) continue;
      const nx_ = cx + dx;
      const ny_ = cy + dy;
      const nz_ = cz + dz;
      if (inBounds(nx_, ny_, nz_, sz)) {
        const nk = coordKey(nx_, ny_, nz_);
        if (!visited.has(nk)) stack.push([nx_, ny_, nz_]);
      }
    }
  }
  return next;
}
