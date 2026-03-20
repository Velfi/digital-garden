import { writable, get, derived } from 'svelte/store';
import {
  coordKey,
  parseCoordKey,
  getSelectionBounds,
  getVoxelCenter,
  getSelectionCenter,
  getMirrorCoordKeys,
  type SelectionBounds,
  type SymmetryAxes
} from '../coordUtils';
import {
  initShape,
  type StartShape,
  type AddShapeParams,
  getShapePositionsAt,
  rotatePositionAroundOrigin,
  rotateVectorByAxisQuarters
} from './shapes';
import {
  cloneVoxels as cloneVoxelsImpl,
  serializeVoxels,
  deserializeVoxels
} from './serialization';
import { createUndo } from './undo';

export type GridSize = number;
export type Tool =
  | 'voxel'
  | 'remove'
  | 'paint'
  | 'select'
  | 'selectByColor'
  | 'selectCoplanar'
  | 'stamp'
  | 'fly'
  | 'eyedropper'
  | 'clay'
  | 'rocks'
  | 'grass'
  | 'ashlar';

export type ClayMode =
  | 'bulk'
  | 'smooth'
  | 'level'
  | 'gouge'
  | 'branch'
  | 'melt'
  | 'rope'
  | 'wall'
  | 'inflate';

export type RopeBrushShape = 'sphere' | 'cube';
/** Rope mode: direction of gravity (sag). */
export type RopeGravityDirection = 'down' | 'up' | 'left' | 'right' | 'forward' | 'back';

export type DrawBrushShape = 'sphere' | 'cube' | 'pyramid';

const DEFAULT_COLOR = 0x888888;
/** Maximum grid size when not unbounded. Unbounded projects have no placement limit. */
export const MAX_GRID_SIZE = 65536;
/** Max brush/stamp size in voxels (index 0..MAX_BRUSH_SIZE-1 => 1..MAX_BRUSH_SIZE). */
export const MAX_BRUSH_SIZE = 25;

export type StrokeMode = 'line' | 'plane' | 'cuboid' | 'polygon' | 'fill' | 'airbrush';

/** Tools that use stroke mode (selection method). Clay/stamp/fly/eyedropper use their own flows. */
export const STROKE_TOOLS: readonly Tool[] = [
  'voxel',
  'remove',
  'paint',
  'select',
  'selectByColor',
  'selectCoplanar'
];
const DRAW_TOOLS_USING_STROKE_MODE = STROKE_TOOLS;

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect' | 'toggle';

export type PlaneAxis = 'auto' | 0 | 1 | 2;

export type FaceNormal = [number, number, number];
export type RenderingMode = 'greedy' | 'marchingCubes';

export type AddPanelState = {
  open: boolean;
  /** When true, VoxelCanvas seeds pos once from model center or orbit target. */
  placementAnchorPending: boolean;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  shape: StartShape;
  size: number;
};

const defaultAddPanel: AddPanelState = {
  open: false,
  placementAnchorPending: false,
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  shape: 'cube',
  size: 8
};

/** Draw vs Clay vs Fly vs Generators tab pane. Generators = procedural tools (e.g. rocks). */
export type ToolPane = 'draw' | 'clay' | 'fly' | 'generators';

// Stores
export const gridSize = writable<GridSize>(32);
export const voxels = writable<Map<string, number>>(new Map());
export const tool = writable<Tool>('voxel');
export const toolPane = writable<ToolPane>('draw');
/** Last selected draw tool, restored when switching from Clay back to Draw pane. */
export const lastDrawTool = writable<Tool>('remove');
export const selection = writable<Map<string, number>>(new Map());
export const selectionMode = writable<SelectionMode>('replace');
export const fillSelectDiagonals = writable<boolean>(false);
export const fillRespectsColor = writable<boolean>(true);
/** When true, fill only expands within the plane through the seed (same coordinate on planeAxis). */
export const fillConstrainToPlane = writable<boolean>(false);
export const strokeMode = writable<StrokeMode>('airbrush');
/** Stroke mode only when current tool uses it (draw tools). Null for clay/stamp/fly/eyedropper so selection method never applies. */
export const effectiveStrokeMode = derived([tool, strokeMode], ([t, sm]) =>
  DRAW_TOOLS_USING_STROKE_MODE.includes(t) ? sm : null
);
/** When true (default), line stroke is axis-aligned; when false, line is drawn on the plane through the start voxel. */
export const lineAxisAlign = writable<boolean>(true);
export const planeAxis = writable<PlaneAxis>(1);
/** When true, plane/cuboid stroke selects only perimeter (plane) or 6-face shell (cuboid). */
export const planeCuboidHollow = writable<boolean>(false);
export const clayMode = writable<ClayMode>('bulk');
/** Clay brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const clayBrushRadius = writable<number>(2);
/** Bulk mode: brush shape (cube, sphere, hemicube, hemisphere). */
export type BulkBrushShape = 'cube' | 'sphere' | 'hemicube' | 'hemisphere';
export const bulkBrushShape = writable<BulkBrushShape>('cube');
/** Branch mode: taper from thick base to thin tip. */
export const branchTaper = writable<boolean>(false);
/** Branch taper: start size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperStartSize = writable<number>(2);
/** Branch taper: end size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperEndSize = writable<number>(0);
/** Inflate mode: 0–1 probability of adding each empty face-neighbor (1=always). */
export const inflateStrength = writable<number>(1);
/** Rope mode: tension 0–1 (0=max sag, 1=taut). */
export const ropeTension = writable<number>(0.5);
/** Rope mode: brush shape (sphere or cube). */
export const ropeBrushShape = writable<RopeBrushShape>('sphere');
/** Rope brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const ropeBrushRadius = writable<number>(2);
/** Rope mode: gravity direction (rope sags toward this axis). */
export const ropeGravityDirection = writable<RopeGravityDirection>('down');
/** Airbrush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxel diameter spheres. */
export const airbrushRadius = writable<number>(2);
/** Airbrush: max voxel offset for sphere centers (0=none, 1–4=scatter/spray). */
export const airbrushScatter = writable<number>(0);
/** Airbrush: when true, radius varies between airbrushRadiusMin and airbrushRadiusMax per sphere. */
export const airbrushRadiusRange = writable<boolean>(false);
export const airbrushRadiusMin = writable<number>(0);
export const airbrushRadiusMax = writable<number>(4);
/** Airbrush plane constraint: none, camera plane (view plane), or clicked face normal plane. */
export type AirbrushPlaneConstraint = 'none' | 'camera' | 'face';
export const airbrushPlaneConstraint = writable<AirbrushPlaneConstraint>('none');
/** Wall (and legacy): direction to extend voxels. Auto = use face normal (wall only). */
export type SprayDirection =
  | 'none'
  | 'auto'
  | 'down'
  | 'up'
  | 'forward'
  | 'back'
  | 'left'
  | 'right';
export const sprayDirection = writable<SprayDirection>('auto');
/** Legacy: streak length. Wall uses wallHeight instead. */
export const sprayStreakLength = writable<number>(0);
/** Wall width index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels path thickness. */
export const wallWidth = writable<number>(0);
/** Wall: voxels to extend along direction (min 2). */
export const wallHeight = writable<number>(2);
/** Wall: keep path on starting plane (for enclosed loops). */
export const wallLockStartHeight = writable<boolean>(false);
/** Draw tool brush shape (sphere, cube, pyramid). */
export const drawBrushShape = writable<DrawBrushShape>('sphere');
/** Draw brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const drawBrushSize = writable<number>(0);
/** When true, offset brush along face normal so it sits on surface instead of through it. */
export const drawBrushSnapToSurface = writable<boolean>(true);
export const color = writable<string>('#ff5733');
/** Palette colors selected for painting (shift+click). Empty = use color. */
export const selectedColors = writable<string[]>([]);
const DEFAULT_PALETTE = [
  '#888888',
  '#ff5733',
  '#33ff57',
  '#3357ff',
  '#ff33f5',
  '#f5ff33',
  '#33fff5',
  '#000000',
  '#ffffff'
];
export const palette = writable<string[]>([...DEFAULT_PALETTE]);
export const sidebarOpen = writable<boolean>(true);
export const modalRequest = writable<
  'newGrid' | 'share' | 'add' | 'help' | 'startup' | 'exportGltf' | null
>(null);
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });

/** Move vs rotate rings on the in-scene transform gizmo (selection / add-shape placement). */
export type SelectionGizmoMode = 'move' | 'rotate';
export const selectionGizmoMode = writable<SelectionGizmoMode>('move');

export type StampRotation = { rotX: number; rotY: number; rotZ: number };
export const stampRotation = writable<StampRotation>({ rotX: 0, rotY: 0, rotZ: 0 });

/** Rocks generator: nominal radius (1–8 voxels). */
export const rockSize = writable<number>(3);
/** Rocks generator: surface irregularity 0–1. */
export const rockRoughness = writable<number>(0.4);
/** Rocks generator: number of rocks to place per click (1–5). */
export const rockCount = writable<number>(1);
/** Rocks generator: max voxel offset for cluster centers when rockCount > 1 (0–3). */
export const rockClusterRadius = writable<number>(1);
/** Rocks generator: sink direction – none, under (buried), or over (floating). */
export type RockSinkDirection = 'none' | 'under' | 'over';
export const rockSinkDirection = writable<RockSinkDirection>('none');
/** Rocks generator: sink amount in voxel layers (0–5). */
export const rockSinkAmount = writable<number>(0);

/** Ashlar generator: block scale (1–20 voxels per dimension). */
export const ashlarSize = writable<number>(3);
/** Ashlar generator: edge irregularity 0–1 (removes boundary voxels). */
export const ashlarRoughness = writable<number>(0.3);
/** Ashlar generator: thickness along surface normal (1–20 voxels) for thin walls. */
export const ashlarThickness = writable<number>(3);

/** Grass generator: patch radius on surface (2–20 voxels). */
export const grassRadius = writable<number>(4);
/** Grass generator: density 0–1 (blade placement probability). */
export const grassDensity = writable<number>(0.6);
/** Grass generator: max blade height in voxels (1–6). */
export const grassHeight = writable<number>(3);
export const showGrid = writable<boolean>(false);
export const renderingMode = writable<RenderingMode>('greedy');
export const lightAngle = writable<number>(45);
export const lightElevation = writable<number>(40);
export const lightColor = writable<string>('#ffffff');
export const ambientIntensity = writable<number>(0.5);
export const enableShadows = writable<boolean>(true);
/** 0 = off, 1 = subtle, 2 = strong */
export const aoStrength = writable<0 | 1 | 2>(1);
export const backgroundColor = writable<string>('#f0f0f0');
export const enableSky = writable<boolean>(true);
export const roughness = writable<number>(0.6);
export const metalness = writable<number>(0);
export const focalLength = writable<number>(29);
export const orthographic = writable<boolean>(false);

/** Mirror symmetry: when enabled, voxel set/delete are applied at mirrored positions. */
export const symmetryX = writable<boolean>(false);
export const symmetryY = writable<boolean>(false);
export const symmetryZ = writable<boolean>(false);

// Undo system
const undo = createUndo(voxels, selection);
export const pushUndo = undo.pushUndo;
export const resetUndo = undo.reset;
export const getUndoSnapshot = undo.getSnapshot;
export const restoreUndoSnapshot = undo.restoreSnapshot;
export const history = undo.history;
export const canUndoStore = undo.canUndoStore;
export const canRedoStore = undo.canRedoStore;

// Re-exports
export { initShape, getShapePositionsAt, rotatePositionAroundOrigin, rotateVectorByAxisQuarters };
export type { StartShape, AddShapeParams };

export function ensureGridFitsPositions(positions: Iterable<[number, number, number]>): void {
  let maxAbs = 0;
  for (const [x, y, z] of positions) {
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  const minSize = 2 * (maxAbs + 1);
  const sz = get(gridSize);
  if (minSize > sz) gridSize.set(Math.min(minSize, MAX_GRID_SIZE));
}

export function shiftVoxelsAndSelection(dx: number, dy: number, dz: number): void {
  const v = get(voxels);
  const sel = get(selection);
  if (v.size === 0 && sel.size === 0) return;
  const nx = Math.round(dx);
  const ny = Math.round(dy);
  const nz = Math.round(dz);
  if (nx === 0 && ny === 0 && nz === 0) return;
  pushUndo();
  const newVoxels = new Map<string, number>();
  for (const [key, col] of v) {
    const [x, y, z] = parseCoordKey(key);
    newVoxels.set(coordKey(x + nx, y + ny, z + nz), col);
  }
  const newSel = new Map<string, number>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    newSel.set(coordKey(x + nx, y + ny, z + nz), col);
  }
  const positions = [...newVoxels.keys()].map((k) => parseCoordKey(k));
  ensureGridFitsPositions(positions);
  voxels.set(newVoxels);
  selection.set(newSel);
}

/**
 * Scale the whole model by 2× about the origin: each voxel at (x,y,z) becomes a 2×2×2 block
 * with the same color, occupying [2x,2x+1]×[2y,2y+1]×[2z,2z+1]. Selection is scaled the same way.
 */
export function scaleProjectBy2(): void {
  const v = get(voxels);
  if (v.size === 0) return;
  pushUndo();
  const next = new Map<string, number>();
  for (const [key, col] of v) {
    const [x, y, z] = parseCoordKey(key);
    const bx = 2 * x;
    const by = 2 * y;
    const bz = 2 * z;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          next.set(coordKey(bx + dx, by + dy, bz + dz), col);
        }
      }
    }
  }
  const sel = get(selection);
  const nextSel = new Map<string, number>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    const bx = 2 * x;
    const by = 2 * y;
    const bz = 2 * z;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          nextSel.set(coordKey(bx + dx, by + dy, bz + dz), col);
        }
      }
    }
  }
  const positions = [...next.keys()].map((k) => parseCoordKey(k));
  ensureGridFitsPositions(positions);
  voxels.set(next);
  selection.set(nextSel);
}

/** Shift only the selected voxels (and the selection). Call when selection is active. */
export function shiftSelection(dx: number, dy: number, dz: number): void {
  const v = get(voxels);
  const sel = get(selection);
  if (sel.size === 0) return;
  const nx = Math.round(dx);
  const ny = Math.round(dy);
  const nz = Math.round(dz);
  if (nx === 0 && ny === 0 && nz === 0) return;
  pushUndo();
  const nextVoxels = cloneVoxelsImpl(v);
  const newSel = new Map<string, number>();
  for (const [key, selCol] of sel) {
    const [x, y, z] = parseCoordKey(key);
    const newKey = coordKey(x + nx, y + ny, z + nz);
    newSel.set(newKey, selCol);
    const col = v.get(key);
    if (col !== undefined) {
      nextVoxels.delete(key);
      nextVoxels.set(newKey, col);
    }
  }
  const positions = [...newSel.keys()].map((k) => parseCoordKey(k));
  ensureGridFitsPositions(positions);
  voxels.set(nextVoxels);
  selection.set(newSel);
}

export function centerOriginOnObject(): void {
  const v = get(voxels);
  const c = getVoxelCenter(v);
  if (c) shiftVoxelsAndSelection(-Math.floor(c[0]), -Math.floor(c[1]), -Math.floor(c[2]));
}

export function centerOriginOnSelection(): void {
  const sel = get(selection);
  const c = getSelectionCenter(sel);
  if (c) shiftVoxelsAndSelection(-Math.floor(c[0]), -Math.floor(c[1]), -Math.floor(c[2]));
}

export function getStampOffsetForFace(
  target: [number, number, number],
  normal: FaceNormal,
  bounds: SelectionBounds
): [number, number, number] {
  const [tx, ty, tz] = target;
  const [nx, ny, nz] = normal;
  const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
  const dx = nx > 0 ? tx + 1 - minX : nx < 0 ? tx - 1 - maxX : tx - minX;
  const dy = ny > 0 ? ty + 1 - minY : ny < 0 ? ty - 1 - maxY : ty - minY;
  const dz = nz > 0 ? tz + 1 - minZ : nz < 0 ? tz - 1 - maxZ : tz - minZ;
  return [dx, dy, dz];
}

export function cloneVoxels(v: Map<string, number>): Map<string, number> {
  return cloneVoxelsImpl(v);
}
export { serializeVoxels, deserializeVoxels };

export function initCanvas(size: GridSize, shape: StartShape = 'cube') {
  undo.reset();
  voxels.set(initShape(size, shape));
}

export function resetCanvas(size: GridSize, shape: StartShape = 'cube') {
  pushUndo();
  voxels.set(initShape(size, shape));
}

/** Map-like view that mirrors set/delete across symmetry axes. has/get delegate to underlying. */
function createMirrorMap(underlying: Map<string, number>, axes: SymmetryAxes): Map<string, number> {
  return {
    get(key: string) {
      return underlying.get(key);
    },
    set(key: string, value: number) {
      const [x, y, z] = parseCoordKey(key);
      for (const k of getMirrorCoordKeys(x, y, z, axes)) {
        underlying.set(k, value);
      }
      return underlying;
    },
    has(key: string) {
      return underlying.has(key);
    },
    delete(key: string) {
      const [x, y, z] = parseCoordKey(key);
      let deleted = false;
      for (const k of getMirrorCoordKeys(x, y, z, axes)) {
        if (underlying.delete(k)) deleted = true;
      }
      return deleted;
    },
    get size() {
      return underlying.size;
    },
    clear() {
      underlying.clear();
    },
    forEach(cb: (value: number, key: string, map: Map<string, number>) => void) {
      underlying.forEach(cb);
    },
    entries() {
      return underlying.entries();
    },
    keys() {
      return underlying.keys();
    },
    values() {
      return underlying.values();
    },
    [Symbol.iterator]() {
      return underlying[Symbol.iterator]();
    }
  } as Map<string, number>;
}

export function updateVoxels(updater: (v: Map<string, number>) => void) {
  pushUndo();
  voxels.update((v) => {
    const next = cloneVoxelsImpl(v);
    const axes: SymmetryAxes = {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };
    const target = axes.x || axes.y || axes.z ? createMirrorMap(next, axes) : next;
    updater(target);
    return next;
  });
}

export function beginStroke() {
  pushUndo();
}

export function updateVoxelsInStroke(updater: (v: Map<string, number>) => void) {
  voxels.update((v) => {
    const next = cloneVoxelsImpl(v);
    const axes: SymmetryAxes = {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };
    const target = axes.x || axes.y || axes.z ? createMirrorMap(next, axes) : next;
    updater(target);
    return next;
  });
}

/**
 * Rigid translate of selected occupied voxels (delete sources, write destinations; overwrites targets).
 * Intended after beginStroke(); updates selection keys the same way. No-op if delta is zero.
 */
export function applySelectionTranslationInStroke(dx: number, dy: number, dz: number): void {
  const nx = Math.round(dx);
  const ny = Math.round(dy);
  const nz = Math.round(dz);
  if (nx === 0 && ny === 0 && nz === 0) return;

  const v = get(voxels);
  const sel = get(selection);

  const toMove: [string, number][] = [];
  for (const [key] of sel) {
    const col = v.get(key);
    if (col !== undefined) {
      toMove.push([key, col]);
    }
  }

  const newPositions: [number, number, number][] = [];
  for (const [key] of toMove) {
    const [x, y, z] = parseCoordKey(key);
    newPositions.push([x + nx, y + ny, z + nz]);
  }
  if (newPositions.length > 0) {
    ensureGridFitsPositions(newPositions);
  }

  if (toMove.length > 0) {
    updateVoxelsInStroke((target) => {
      for (const [key] of toMove) {
        target.delete(key);
      }
      for (const [key, col] of toMove) {
        const [x, y, z] = parseCoordKey(key);
        target.set(coordKey(x + nx, y + ny, z + nz), col);
      }
    });
  }

  const newSel = new Map<string, number>();
  for (const [key, col] of sel) {
    const [x, y, z] = parseCoordKey(key);
    newSel.set(coordKey(x + nx, y + ny, z + nz), col);
  }
  selection.set(newSel);
}

/**
 * Rigid 90° rotation of selected keys (and occupied voxels) about the selection bounding-box center
 * (`getSelectionCenter`). After per-voxel rounding, an integer translation recenters the selection so
 * its bbox center matches the pre-rotation center (avoids a 1-voxel “slide” common with round-alone).
 * Skips if rounding + recenter would collapse two voxels onto one cell or intrude on non-selected solids.
 */
export function applySelectionRotationInStroke(axis: 0 | 1 | 2, deltaQuarters: number): void {
  let q = deltaQuarters % 4;
  if (q < 0) q += 4;
  if (q === 0) return;

  const sel = get(selection);
  const pivot = getSelectionCenter(sel);
  if (!pivot) return;

  const rawRotatedKey = (key: string) => {
    const [x, y, z] = parseCoordKey(key);
    const rel: [number, number, number] = [x - pivot[0], y - pivot[1], z - pivot[2]];
    const [rx, ry, rz] = rotateVectorByAxisQuarters(rel, axis, q);
    return coordKey(
      Math.round(pivot[0] + rx),
      Math.round(pivot[1] + ry),
      Math.round(pivot[2] + rz)
    );
  };

  const selEntries = [...sel.entries()];
  const rawKeys = selEntries.map(([k]) => rawRotatedKey(k));
  if (new Set(rawKeys).size !== rawKeys.length) return;

  const provisional = new Map<string, number>();
  for (let i = 0; i < selEntries.length; i++) {
    provisional.set(rawKeys[i], selEntries[i][1]);
  }
  const pivotAfter = getSelectionCenter(provisional);
  if (!pivotAfter) return;

  const tx = Math.round(pivot[0] - pivotAfter[0]);
  const ty = Math.round(pivot[1] - pivotAfter[1]);
  const tz = Math.round(pivot[2] - pivotAfter[2]);

  const newSelKeys = rawKeys.map((k) => {
    const [x, y, z] = parseCoordKey(k);
    return coordKey(x + tx, y + ty, z + tz);
  });
  if (new Set(newSelKeys).size !== newSelKeys.length) return;

  const v = get(voxels);
  const toMove: [string, number][] = [];
  for (const [key] of sel) {
    const col = v.get(key);
    if (col !== undefined) toMove.push([key, col]);
  }

  const sourceKeys = new Set(toMove.map((t) => t[0]));
  const destKeys = toMove.map(([key]) => {
    const rk = rawRotatedKey(key);
    const [x, y, z] = parseCoordKey(rk);
    return coordKey(x + tx, y + ty, z + tz);
  });

  for (const nk of destKeys) {
    if (v.has(nk) && !sourceKeys.has(nk)) return;
  }

  if (toMove.length > 0) {
    ensureGridFitsPositions(destKeys.map((k) => parseCoordKey(k)));
    updateVoxelsInStroke((target) => {
      for (const [key] of toMove) target.delete(key);
      for (let i = 0; i < toMove.length; i++) {
        target.set(destKeys[i], toMove[i][1]);
      }
    });
  }

  const newSel = new Map<string, number>();
  for (let i = 0; i < selEntries.length; i++) {
    newSel.set(newSelKeys[i], selEntries[i][1]);
  }
  selection.set(newSel);
}

/** Returns a function that yields a paint color per voxel (random when multiple selected). */
export function getPaintColorResolver(): () => number {
  const sel = get(selectedColors);
  const colors = sel.length > 0 ? sel.map(hexToInt) : [hexToInt(get(color))];
  if (colors.length === 1) return () => colors[0];
  return () => colors[Math.floor(Math.random() * colors.length)];
}

export function addShapeAt(params: AddShapeParams): void {
  const { position, rotation, shape, size, getColor } = params;
  if (shape === 'empty' || size < 1) return;
  const positions = getShapePositionsAt({ position, rotation, shape, size });
  ensureGridFitsPositions(positions);
  updateVoxels((v) => {
    for (const [x, y, z] of positions) {
      v.set(coordKey(x, y, z), getColor());
    }
  });
}

export function hexToInt(hex: string): number {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return DEFAULT_COLOR;
  return parseInt(m[1] + m[2] + m[3], 16);
}

export function intToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}
