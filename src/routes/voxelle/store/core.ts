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
  rotatePositionAroundOrigin
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
  | 'clay';

export type ClayMode = 'bulk' | 'smooth' | 'level' | 'gouge' | 'branch' | 'puffy' | 'melt' | 'rope' | 'wall' | 'inflate';

export type RopeBrushShape = 'sphere' | 'cube';
/** Rope mode: direction of gravity (sag). */
export type RopeGravityDirection = 'down' | 'up' | 'left' | 'right' | 'forward' | 'back';

export type DrawBrushShape = 'sphere' | 'cube' | 'pyramid';

const DEFAULT_COLOR = 0x888888;
const MAX_GRID_SIZE = 256;
/** Max brush/stamp size in voxels (index 0..MAX_BRUSH_SIZE-1 => 1..MAX_BRUSH_SIZE). */
export const MAX_BRUSH_SIZE = 25;

export type StrokeMode = 'line' | 'plane' | 'cuboid' | 'polygon' | 'fill' | 'airbrush';

/** Tools that use stroke mode (selection method). Clay/stamp/fly/eyedropper use their own flows. */
const DRAW_TOOLS_USING_STROKE_MODE: Tool[] = [
  'voxel',
  'remove',
  'paint',
  'select',
  'selectByColor',
  'selectCoplanar'
];

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect' | 'toggle';

export type PlaneAxis = 'auto' | 0 | 1 | 2;

export type FaceNormal = [number, number, number];
export type RenderingMode = 'greedy' | 'marchingCubes';

export type AddPanelState = {
  open: boolean;
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
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  shape: 'cube',
  size: 8
};

/** Draw vs Clay vs Fly tab pane. Draw = voxel/remove/paint/etc + stroke mode; Clay = clay tool + clay modes; Fly = first-person camera. */
export type ToolPane = 'draw' | 'clay' | 'fly';

// Stores
export const gridSize = writable<GridSize>(32);
export const voxels = writable<Map<string, number>>(new Map());
export const tool = writable<Tool>('remove');
export const toolPane = writable<ToolPane>('draw');
/** Last selected draw tool, restored when switching from Clay back to Draw pane. */
export const lastDrawTool = writable<Tool>('remove');
export const selection = writable<Map<string, number>>(new Map());
export const selectionMode = writable<SelectionMode>('replace');
export const fillSelectDiagonals = writable<boolean>(false);
export const fillRespectsColor = writable<boolean>(true);
/** When true, fill only expands within the plane through the seed (same coordinate on planeAxis). */
export const fillConstrainToPlane = writable<boolean>(false);
export const strokeMode = writable<StrokeMode>('line');
/** Stroke mode only when current tool uses it (draw tools). Null for clay/stamp/fly/eyedropper so selection method never applies. */
export const effectiveStrokeMode = derived(
  [tool, strokeMode],
  ([t, sm]) => (DRAW_TOOLS_USING_STROKE_MODE.includes(t) ? sm : null)
);
/** When true (default), line stroke is axis-aligned; when false, line is drawn on the plane through the start voxel. */
export const lineAxisAlign = writable<boolean>(true);
export const planeAxis = writable<PlaneAxis>(1);
/** When true, plane/cuboid stroke selects only perimeter (plane) or 6-face shell (cuboid). */
export const planeCuboidHollow = writable<boolean>(false);
export const clayMode = writable<ClayMode>('bulk');
/** Clay brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const clayBrushRadius = writable<number>(2);
/** Branch mode: taper from thick base to thin tip. */
export const branchTaper = writable<boolean>(false);
/** Branch taper: start size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperStartSize = writable<number>(2);
/** Branch taper: end size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperEndSize = writable<number>(0);
/** Puffy size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxel diameter spheres. */
export const puffRadius = writable<number>(2);
/** Puffy mode: when true, radius varies between puffRadiusMin and puffRadiusMax per sphere. */
export const puffRadiusRange = writable<boolean>(false);
/** Puffy mode: min sphere radius when range enabled. */
export const puffRadiusMin = writable<number>(0);
/** Puffy mode: max sphere radius when range enabled. */
export const puffRadiusMax = writable<number>(4);
/** Puffy mode: max voxel offset for sphere centers (0=none, 1–4=scatter range). */
export const puffScatter = writable<number>(0);
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
export type SprayDirection = 'none' | 'auto' | 'down' | 'up' | 'forward' | 'back' | 'left' | 'right';
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
  '#888888', '#ff5733', '#33ff57', '#3357ff', '#ff33f5', '#f5ff33', '#33fff5', '#000000', '#ffffff'
];
export const palette = writable<string[]>([...DEFAULT_PALETTE]);
export const sidebarOpen = writable<boolean>(true);
export const modalRequest = writable<'newGrid' | 'share' | 'add' | 'help' | 'startup' | 'exportGltf' | null>(null);
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });

export type StampRotation = { rotX: number; rotY: number; rotZ: number };
export const stampRotation = writable<StampRotation>({ rotX: 0, rotY: 0, rotZ: 0 });
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
export const history = undo.history;
export const canUndoStore = undo.canUndoStore;
export const canRedoStore = undo.canRedoStore;

// Re-exports
export { initShape, getShapePositionsAt, rotatePositionAroundOrigin };
export type { StartShape, AddShapeParams };

export function ensureGridFitsPositions(positions: Iterable<[number, number, number]>): void {
  let maxAbs = 0;
  for (const [x, y, z] of positions) {
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  const minSize = 2 * (maxAbs + 1);
  const sz = get(gridSize);
  if (minSize > sz && minSize <= MAX_GRID_SIZE) {
    gridSize.set(minSize);
  }
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
function createMirrorMap(
  underlying: Map<string, number>,
  axes: SymmetryAxes
): Map<string, number> {
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
    const target =
      axes.x || axes.y || axes.z ? createMirrorMap(next, axes) : next;
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
    const target =
      axes.x || axes.y || axes.z ? createMirrorMap(next, axes) : next;
    updater(target);
    return next;
  });
}

/** Returns a function that yields a paint color per voxel (random when multiple selected). */
export function getPaintColorResolver(): () => number {
  const sel = get(selectedColors);
  const colors =
    sel.length > 0 ? sel.map(hexToInt) : [hexToInt(get(color))];
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
