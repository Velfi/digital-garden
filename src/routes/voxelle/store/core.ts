import { writable, get } from 'svelte/store';
import {
  coordKey,
  parseCoordKey,
  getSelectionBounds,
  getVoxelCenter,
  getSelectionCenter,
  type SelectionBounds
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
  | 'stamp'
  | 'fly'
  | 'eyedropper'
  | 'clay';

export type ClayMode = 'bulk' | 'smooth' | 'level' | 'gouge' | 'branch' | 'puffy' | 'melt';

const DEFAULT_COLOR = 0x888888;
const MAX_GRID_SIZE = 256;

export type StrokeMode = 'line' | 'plane' | 'cuboid' | 'polygon' | 'fill' | 'airbrush';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

export type PlaneAxis = 'auto' | 0 | 1 | 2;

export type FaceNormal = [number, number, number];

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

/** Draw vs Clay tab pane. Draw = voxel/remove/paint/etc + stroke mode; Clay = clay tool + clay modes. */
export type ToolPane = 'draw' | 'clay';

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
export const strokeMode = writable<StrokeMode>('line');
export const planeAxis = writable<PlaneAxis>(1);
export const clayMode = writable<ClayMode>('bulk');
/** Brush radius for clay bulk (0=single voxel, 1=3³ tube, 2=5³). Like Blender F key. */
export const clayBrushRadius = writable<number>(1);
/** Branch mode: taper from thick base to thin tip. */
export const branchTaper = writable<boolean>(false);
/** Puffy mode: sphere radius (0=single voxel, 1=3³, 2=5³, 3=7³, 4=9³, 5=11³). */
export const puffRadius = writable<number>(1);
/** Puffy mode: when true, radius varies between puffRadiusMin and puffRadiusMax per sphere. */
export const puffRadiusRange = writable<boolean>(false);
/** Puffy mode: min sphere radius when range enabled. */
export const puffRadiusMin = writable<number>(0);
/** Puffy mode: max sphere radius when range enabled. */
export const puffRadiusMax = writable<number>(2);
/** Puffy mode: max voxel offset for sphere centers (0=none, 1–4=scatter range). */
export const puffScatter = writable<number>(0);
/** Airbrush stroke mode: sphere radius (0=single voxel, 1=3³, 2=5³, 3=7³, 4=9³, 5=11³). */
export const airbrushRadius = writable<number>(1);
export const color = writable<string>('#ff5733');
const DEFAULT_PALETTE = [
  '#888888', '#ff5733', '#33ff57', '#3357ff', '#ff33f5', '#f5ff33', '#33fff5', '#000000', '#ffffff'
];
export const palette = writable<string[]>([...DEFAULT_PALETTE]);
export const sidebarOpen = writable<boolean>(true);
export const modalRequest = writable<'newGrid' | 'share' | 'add' | null>(null);
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });

export type StampRotation = { rotX: number; rotY: number; rotZ: number };
export const stampRotation = writable<StampRotation>({ rotX: 0, rotY: 0, rotZ: 0 });
export const showGrid = writable<boolean>(false);
export const lightAngle = writable<number>(45);
export const lightElevation = writable<number>(40);
export const lightColor = writable<string>('#ffffff');
export const ambientIntensity = writable<number>(0.5);
export const enableShadows = writable<boolean>(true);
export const enableAO = writable<boolean>(true);
export const backgroundColor = writable<string>('#f0f0f0');
export const enableSky = writable<boolean>(true);
export const roughness = writable<number>(0.6);
export const metalness = writable<number>(0);
export const envMapIntensity = writable<number>(0.5);
export const focalLength = writable<number>(29);
export const orthographic = writable<boolean>(false);

// Undo system
const undo = createUndo(voxels);
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

export function updateVoxels(updater: (v: Map<string, number>) => void) {
  pushUndo();
  voxels.update((v) => {
    const next = cloneVoxelsImpl(v);
    updater(next);
    return next;
  });
}

export function beginStroke() {
  pushUndo();
}

export function updateVoxelsInStroke(updater: (v: Map<string, number>) => void) {
  voxels.update((v) => {
    const next = cloneVoxelsImpl(v);
    updater(next);
    return next;
  });
}

export function addShapeAt(params: AddShapeParams): void {
  const { position, rotation, shape, size, color: col } = params;
  if (shape === 'empty' || size < 1) return;
  const positions = getShapePositionsAt({ position, rotation, shape, size });
  ensureGridFitsPositions(positions);
  updateVoxels((v) => {
    for (const [x, y, z] of positions) {
      v.set(coordKey(x, y, z), col);
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
