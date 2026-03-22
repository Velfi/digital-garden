import { get } from 'svelte/store';
import {
  coordKey,
  parseCoordKey,
  inBoundsBox,
  getEffectiveBounds,
  getVoxelBounds,
  type SelectionBounds
} from '../coordUtils';
import {
  voxels,
  selection,
  commitUndoAfter,
  updateVoxelsInStroke,
  constrainToPlaneEnabled,
  constrainToPlaneRef,
  type ConstrainToPlaneRef
} from './core';
import type { FaceNormal, SelectionMode } from './core';
import type { Voxel } from '../voxelMaterial';
import { sameVoxelColor, plasticVoxel } from '../voxelMaterial';

/** Placeholder voxel for keys in selection that are empty air (e.g. coplanar void pick). */
const EMPTY_SELECTION_PLACEHOLDER_VOXEL = plasticVoxel(0x33aaff);

/**
 * Isotropic padding around content for flood fills. Large margins balloon empty-region BFS
 * (runtime + JS Set max size ~2²⁴).
 */
export const SELECTION_BOUNDS_MARGIN = 48;

/** When fill "constrain to plane" is off, warn before applying if the region is larger than this. */
export const FILL_UNCONSTRAINED_LARGE_THRESHOLD = 256;

export type FillSelectionResult = {
  region: Map<string, Voxel>;
  /** BFS stopped early because optional max region size was exceeded (actual region may be larger). */
  truncated: boolean;
};

export type FillEmptyResult = {
  region: Set<string>;
  truncated: boolean;
};

function getEffectiveBoundsForSelection(): ReturnType<typeof getEffectiveBounds> {
  return getEffectiveBounds(get(voxels), SELECTION_BOUNDS_MARGIN);
}

/** Per-click context for fill plane (face from hit, camera forward for view plane). */
export type FillPlaneSampleContext = {
  faceNormal: FaceNormal | null;
  cameraForward: { x: number; y: number; z: number } | null;
};

function dominantAxisFromFaceNormal(fn: FaceNormal): 0 | 1 | 2 {
  const ax = Math.abs(fn[0]);
  const ay = Math.abs(fn[1]);
  const az = Math.abs(fn[2]);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}

function voxelInConstrainPlane(
  nx: number,
  ny: number,
  nz: number,
  seedX: number,
  seedY: number,
  seedZ: number,
  ref: ConstrainToPlaneRef,
  ctx: FillPlaneSampleContext
): boolean {
  if (ref === 0) return nx === seedX;
  if (ref === 1) return ny === seedY;
  if (ref === 2) return nz === seedZ;
  if (ref === 'auto') {
    const fn = ctx.faceNormal;
    if (!fn) return ny === seedY;
    const axis = dominantAxisFromFaceNormal(fn);
    if (axis === 0) return nx === seedX;
    if (axis === 1) return ny === seedY;
    return nz === seedZ;
  }
  const n = ctx.cameraForward;
  if (!n) return true;
  const dx = nx - seedX;
  const dy = ny - seedY;
  const dz = nz - seedZ;
  const dot = dx * n.x + dy * n.y + dz * n.z;
  return Math.abs(dot) < 0.5;
}

function shouldConstrainFillPlane(ctx: FillPlaneSampleContext | undefined): boolean {
  if (!get(constrainToPlaneEnabled)) return false;
  if (get(constrainToPlaneRef) === 'camera' && !ctx?.cameraForward) return false;
  return true;
}

const ADJ_6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
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
  respectsColor: boolean = true,
  maxRegionSize?: number,
  planeCtx?: FillPlaneSampleContext
): FillSelectionResult {
  const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const k0 = coordKey(x, y, z);
  const targetVoxel = v.get(k0);
  if (targetVoxel === undefined) return { region: new Map(), truncated: false };
  const adj = diagonals ? ADJ_26 : ADJ_6;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Map<string, Voxel>();
  const ctx = planeCtx ?? { faceNormal: null, cameraForward: null };
  const ref = get(constrainToPlaneRef);
  const usePlane = shouldConstrainFillPlane(ctx);
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    const col = v.get(ck);
    if (col === undefined) continue;
    if (respectsColor && !sameVoxelColor(col, targetVoxel)) continue;
    next.set(ck, col);
    if (maxRegionSize !== undefined && next.size > maxRegionSize) {
      return { region: next, truncated: true };
    }
    for (const [dx, dy, dz] of adj) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (inBoundsBox(nx, ny, nz, bounds)) {
        if (usePlane && !voxelInConstrainPlane(nx, ny, nz, x, y, z, ref, ctx)) continue;
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  return { region: next, truncated: false };
}

export function getFillEmptyAt(
  x: number,
  y: number,
  z: number,
  diagonals: boolean,
  maxRegionSize?: number,
  planeCtx?: FillPlaneSampleContext
): FillEmptyResult {
  const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const k0 = coordKey(x, y, z);
  if (v.has(k0)) return { region: new Set(), truncated: false };
  const adj = diagonals ? ADJ_26 : ADJ_6;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Set<string>();
  const ctx = planeCtx ?? { faceNormal: null, cameraForward: null };
  const ref = get(constrainToPlaneRef);
  const usePlane = shouldConstrainFillPlane(ctx);
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    if (v.has(ck)) continue;
    next.add(ck);
    if (maxRegionSize !== undefined && next.size > maxRegionSize) {
      return { region: next, truncated: true };
    }
    for (const [dx, dy, dz] of adj) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (inBoundsBox(nx, ny, nz, bounds)) {
        if (usePlane && !voxelInConstrainPlane(nx, ny, nz, x, y, z, ref, ctx)) continue;
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  return { region: next, truncated: false };
}

export function mergeSelection(
  current: Map<string, Voxel>,
  incoming: Map<string, Voxel>,
  mode: SelectionMode
): Map<string, Voxel> {
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
  const out = new Map<string, Voxel>();
  for (const [k, c] of incoming) {
    if (current.has(k)) out.set(k, c);
  }
  return out;
}

export function selectAll() {
  commitUndoAfter(() => {
    const v = get(voxels);
    const next = new Map<string, Voxel>();
    for (const [key, col] of v) next.set(key, col);
    selection.set(next);
  });
}

export function deselectAll() {
  commitUndoAfter(() => {
    selection.set(new Map());
  });
}

export function deselectVoxels() {
  commitUndoAfter(() => {
    const v = get(voxels);
    const sel = get(selection);
    const next = new Map<string, Voxel>();
    for (const [key, col] of sel) {
      if (!v.has(key)) next.set(key, col);
    }
    selection.set(next);
  });
}

export function deselectEmptySpaces() {
  commitUndoAfter(() => {
    const v = get(voxels);
    const sel = get(selection);
    const next = new Map<string, Voxel>();
    for (const [key, col] of sel) {
      if (v.has(key)) next.set(key, col);
    }
    selection.set(next);
  });
}

export function invertSelection() {
  commitUndoAfter(() => {
    const v = get(voxels);
    const sel = get(selection);
    const next = new Map<string, Voxel>();
    for (const [key, col] of v) {
      if (!sel.has(key)) next.set(key, col);
    }
    selection.set(next);
  });
}

export function growSelection() {
  commitUndoAfter(() => {
    const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const sel = get(selection);
  const next = new Map(sel);
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBoundsBox(nx, ny, nz, bounds)) {
        const k = coordKey(nx, ny, nz);
        const col = v.get(k);
        if (col !== undefined) next.set(k, col);
      }
    }
  }
  selection.set(next);
  });
}

export function shrinkSelection() {
  commitUndoAfter(() => {
    const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const sel = get(selection);
  const next = new Map<string, Voxel>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    let onBoundary = false;
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBoundsBox(nx, ny, nz, bounds)) {
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
  });
}

/** Deselect any selected voxel that has all 6 face-neighbors also in the selection. */
export function deselectInnerVoxels() {
  commitUndoAfter(() => {
    const sel = get(selection);
  const next = new Map<string, Voxel>();
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
  });
}

/** Face-connected components of the selection; each returned box is that component's AABB. */
function selectionComponentBboxes(sel: Map<string, Voxel>): SelectionBounds[] {
  const visited = new Set<string>();
  const out: SelectionBounds[] = [];
  for (const start of sel.keys()) {
    if (visited.has(start)) continue;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    const stack: string[] = [start];
    visited.add(start);
    while (stack.length > 0) {
      const k = stack.pop()!;
      const [x, y, z] = parseCoordKey(k);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      for (const [dx, dy, dz] of ADJ_6) {
        const nk = coordKey(x + dx, y + dy, z + dz);
        if (!visited.has(nk) && sel.has(nk)) {
          visited.add(nk);
          stack.push(nk);
        }
      }
    }
    out.push({ minX, minY, minZ, maxX, maxY, maxZ });
  }
  return out;
}

function isInteriorInBbox(
  x: number,
  y: number,
  z: number,
  v: Map<string, Voxel>,
  bbox: SelectionBounds
): boolean {
  for (const [dx, dy, dz] of ADJ_6) {
    const nx = x + dx,
      ny = y + dy,
      nz = z + dz;
    if (!inBoundsBox(nx, ny, nz, bbox)) return false;
    const nk = coordKey(nx, ny, nz);
    if (!v.has(nk)) return false;
  }
  return true;
}

export function hollowOut(): void {
  const v = get(voxels);
  const sel = get(selection);
  if (v.size === 0) return;

  const voxelBounds = getVoxelBounds(v);
  if (!voxelBounds) return;

  const scopes =
    sel.size === 0 ? [voxelBounds] : selectionComponentBboxes(sel);

  const toRemove = new Set<string>();
  for (const bbox of scopes) {
    for (const key of v.keys()) {
      const [x, y, z] = parseCoordKey(key);
      if (!inBoundsBox(x, y, z, bbox)) continue;
      if (isInteriorInBbox(x, y, z, v, bbox)) toRemove.add(key);
    }
  }

  if (toRemove.size === 0) return;
  const removeList = [...toRemove];
  commitUndoAfter(() => {
    updateVoxelsInStroke((next) => {
      for (const k of removeList) next.delete(k);
    });
    selection.update((s) => {
      const nextSel = new Map(s);
      for (const k of removeList) nextSel.delete(k);
      return nextSel;
    });
  });
}

export function selectConnected() {
  const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const sel = get(selection);
  if (sel.size === 0) return;
  const firstKey = sel.keys().next().value;
  if (!firstKey) return;
  const targetVoxel = v.get(firstKey);
  if (!targetVoxel) return;
  const [sx, sy, z0] = parseCoordKey(firstKey);
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[sx, sy, z0]];
  const next = new Map<string, Voxel>();
  while (stack.length > 0) {
    const [x, y, z] = stack.pop()!;
    const k = coordKey(x, y, z);
    if (visited.has(k)) continue;
    visited.add(k);
    const col = v.get(k);
    if (col === undefined || !sameVoxelColor(col, targetVoxel)) continue;
    next.set(k, col);
    for (const [dx, dy, dz] of ADJ_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (inBoundsBox(nx, ny, nz, bounds)) {
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  commitUndoAfter(() => {
    selection.set(next);
  });
}

/** All voxels in the same plane as the given face (plane perpendicular to faceNormal), connected within that plane. */
export function getCoplanarFacesSelectionAt(
  x: number,
  y: number,
  z: number,
  faceNormal: FaceNormal
): Map<string, Voxel> {
  const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const k0 = coordKey(x, y, z);
  if (!v.has(k0)) return new Map();
  const [nx, ny, nz] = faceNormal;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Map<string, Voxel>();
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
      if (inBoundsBox(nx_, ny_, nz_, bounds)) {
        const nk = coordKey(nx_, ny_, nz_);
        if (!visited.has(nk)) stack.push([nx_, ny_, nz_]);
      }
    }
  }
  return next;
}

/** Connected empty cells in the same plane as the face (perpendicular to faceNormal), dual of getCoplanarFacesSelectionAt. */
export function getCoplanarEmptySelectionAt(
  x: number,
  y: number,
  z: number,
  faceNormal: FaceNormal
): Map<string, Voxel> {
  const v = get(voxels);
  const bounds = getEffectiveBoundsForSelection();
  const k0 = coordKey(x, y, z);
  if (v.has(k0)) return new Map();
  const [nx, ny, nz] = faceNormal;
  const visited = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  const next = new Map<string, Voxel>();
  while (stack.length > 0) {
    const [cx, cy, cz] = stack.pop()!;
    const ck = coordKey(cx, cy, cz);
    if (visited.has(ck)) continue;
    visited.add(ck);
    if (v.has(ck)) continue;
    next.set(ck, EMPTY_SELECTION_PLACEHOLDER_VOXEL);
    for (const [dx, dy, dz] of ADJ_6) {
      if (dx * nx + dy * ny + dz * nz !== 0) continue;
      const nx_ = cx + dx;
      const ny_ = cy + dy;
      const nz_ = cz + dz;
      if (inBoundsBox(nx_, ny_, nz_, bounds)) {
        const nk = coordKey(nx_, ny_, nz_);
        if (!visited.has(nk)) stack.push([nx_, ny_, nz_]);
      }
    }
  }
  return next;
}
