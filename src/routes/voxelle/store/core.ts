import { writable, get, derived } from 'svelte/store';
import {
  coordKey,
  parseCoordKey,
  getVoxelBounds,
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
  rotateVectorByAxisQuarters,
  clampQuarterTurn
} from './shapes';
import {
  cloneVoxels as cloneVoxelsImpl,
  serializeVoxels,
  deserializeVoxels,
  computeUndoDelta,
  isUndoDeltaEmpty
} from './serialization';
import { createUndo } from './undo';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import { cloneVoxel } from '../voxelMaterial';

export type GridSize = number;
export type Tool =
  | 'voxel'
  | 'remove'
  | 'paint'
  | 'select'
  | 'selectByColor'
  | 'selectCoplanar'
  | 'selectCoplanarEmpty'
  | 'stamp'
  | 'punch'
  | 'hand'
  | 'fly'
  | 'eyedropper'
  | 'clay'
  | 'rocks'
  | 'grass'
  | 'ashlar'
  | 'roof'
  | 'flora'
  | 'piscina';

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

export type StrokeMode =
  | 'line'
  | 'plane'
  | 'circle'
  | 'precise'
  | 'cuboid'
  | 'polygon'
  | 'fill'
  | 'airbrush';

/** Tools that use stroke mode (selection method). Clay/stamp/fly/eyedropper use their own flows. */
export const STROKE_TOOLS: readonly Tool[] = [
  'voxel',
  'remove',
  'paint',
  'select',
  'selectByColor',
  'selectCoplanar',
  'selectCoplanarEmpty'
];
const DRAW_TOOLS_USING_STROKE_MODE = STROKE_TOOLS;

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect' | 'toggle';

export type PlaneAxis = 'auto' | 0 | 1 | 2;

export type FaceNormal = [number, number, number];
export type RenderingMode = 'greedy' | 'marchingCubes' | 'ray';

function normalizeRenderingMode(mode: RenderingMode | 'raycast'): RenderingMode {
  if (mode === 'raycast') return 'ray';
  if (mode === 'greedy' || mode === 'marchingCubes' || mode === 'ray') return mode;
  return 'greedy';
}

/** Add shape: parametric primitive. Paste: clipboard pattern (same placement gizmo). */
export type AddPanelMode = 'shape' | 'paste';

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
  mode: AddPanelMode;
  /** Clipboard entries relative to bbox min; used when `mode === 'paste'`. */
  pasteEntries: [number, number, number, number, string?][] | null;
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
  size: 8,
  mode: 'shape',
  pasteEntries: null
};

/** Reset add panel to closed defaults (shape mode, no paste). */
export function closeAddPanel(): void {
  addPanelStore.set({ ...defaultAddPanel });
}

/** Draw vs Clay vs Hand vs Fly vs Generators tab pane. Generators = procedural tools (e.g. rocks). */
export type ToolPane = 'draw' | 'clay' | 'hand' | 'fly' | 'generators';

// Stores
export const gridSize = writable<GridSize>(32);
export const voxels = writable<Map<string, Voxel>>(new Map());
/** Hidden voxels are removed from `voxels` until unhidden. */
export const hiddenVoxels = writable<Map<string, Voxel>>(new Map());
export const hasHiddenVoxels = derived(hiddenVoxels, (h) => h.size > 0);
export const tool = writable<Tool>('voxel');
export const toolPane = writable<ToolPane>('draw');
/** Last selected draw tool, restored when switching from Clay back to Draw pane. */
export const lastDrawTool = writable<Tool>('remove');
/** Tool active before entering eyedropper; restored after a successful voxel color pick. */
export const toolBeforeEyedropper = writable<Tool>('voxel');
export const selection = writable<Map<string, Voxel>>(new Map());
export const selectionMode = writable<SelectionMode>('replace');
export const fillSelectDiagonals = writable<boolean>(false);
export const fillRespectsColor = writable<boolean>(true);
/** When true, fill and airbrush respect `constrainToPlaneRef`. */
export const constrainToPlaneEnabled = writable<boolean>(false);
/**
 * Plane used for fill flood and airbrush path when `constrainToPlaneEnabled` is on.
 * Auto = dominant axis of clicked face; camera = view plane; X/Y/Z = world axis through seed.
 */
export type ConstrainToPlaneRef = 'auto' | 'camera' | 0 | 1 | 2;
export const constrainToPlaneRef = writable<ConstrainToPlaneRef>('auto');
/**
 * Polygon stroke: integer steps along the face normal from the click that added the latest point.
 * 0 = fill in the plane of anchor voxels; positive = outward along that normal (previous voxel default).
 */
export const polygonOffsetFromNormal = writable<number>(1);
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
/** Voxel layers kept from the outer surface when hollow (plane/cuboid); 1 = thinnest shell. */
export const PLANE_CUBOID_HOLLOW_WALL_MAX = 32;
export const planeCuboidHollowWallThickness = writable<number>(1);
export const clayMode = writable<ClayMode>('bulk');
/** Clay brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const clayBrushRadius = writable<number>(2);
/** Bulk mode: footprint in the surface plane (square = Chebyshev, round = Euclidean disk). */
export type BulkBrushShape = 'cube' | 'sphere';
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
/** Wall: when true, base path is axis-aligned from stroke start (like draw line); when false, freeform Bresenham polyline. */
export const wallAxisAlign = writable<boolean>(false);
/** Draw tool brush shape (sphere, cube, pyramid). */
export const drawBrushShape = writable<DrawBrushShape>('sphere');
/** Draw brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const drawBrushSize = writable<number>(0);
/** When true, offset brush along face normal so it sits on surface instead of through it. */
export const drawBrushSnapToSurface = writable<boolean>(true);
export const color = writable<string>('#ff5733');
/** Active material for new paint / voxel / clay strokes. */
export const voxelMaterial = writable<VoxelMaterialId>('plastic');
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
  | 'newGrid'
  | 'share'
  | 'add'
  | 'help'
  | 'startup'
  | 'exportGltf'
  | 'preferences'
  | 'stampBook'
  | null
>(null);
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });

/** Move vs rotate rings on the in-scene transform gizmo (selection / add-shape placement). */
export type SelectionGizmoMode = 'move' | 'rotate';
export const selectionGizmoMode = writable<SelectionGizmoMode>('move');

export type StampRotation = { rotX: number; rotY: number; rotZ: number };
export const stampRotation = writable<StampRotation>({ rotX: 0, rotY: 0, rotZ: 0 });
export type StampOriginMode = 'center' | 'corner';
/** Stamp anchor on face tangent axes: center (legacy) or min-corner aligned to click cell. */
export const stampOriginMode = writable<StampOriginMode>('center');
/** Punch: how many voxel layers to remove along the inward face normal (1 = surface slice only). */
export const PUNCH_DEPTH_MAX = 32;
export const punchDepth = writable<number>(1);

export * from './generatorSettings';

export const showGrid = writable<boolean>(false);
const renderingModeInner = writable<RenderingMode>('greedy');
export const renderingMode = {
  subscribe: renderingModeInner.subscribe,
  set: (mode: RenderingMode) => renderingModeInner.set(normalizeRenderingMode(mode)),
  update: (updater: (value: RenderingMode) => RenderingMode) =>
    renderingModeInner.update((value) => normalizeRenderingMode(updater(value)))
};
/** Active canvas renderer backend: true (WebGPU), false (WebGL), null (not initialized yet). */
export const activeRendererIsWebGPU = writable<boolean | null>(null);
/** Default lighting matches sunny-day preset in `store/lightPresets.ts`. */
export const lightAngle = writable<number>(50);
export const lightElevation = writable<number>(55);
export const lightColor = writable<string>('#fff8e8');
/** Hemisphere fill light (sky/ground). */
export const ambientIntensity = writable<number>(0.45);
/** Directional key light intensity. */
export const sunlightIntensity = writable<number>(2.3);
/** Environment (IBL) intensity multiplier for scene.environment reflections. */
export const sceneEnvironmentIntensity = writable<number>(1);
export const enableShadows = writable<boolean>(true);
/** 0 = off, 1 = subtle, 2 = strong */
export const aoStrength = writable<0 | 1 | 2>(1);
export const backgroundColor = writable<string>('#f0f0f0');
export const enableSky = writable<boolean>(true);
export const focalLength = writable<number>(29);
export const orthographic = writable<boolean>(false);

/** Mirror symmetry: when enabled, voxel set/delete are applied at mirrored positions. */
export const symmetryX = writable<boolean>(false);
export const symmetryY = writable<boolean>(false);
export const symmetryZ = writable<boolean>(false);

// Undo system
const undo = createUndo(voxels, selection);
const pushUndoDelta = undo.pushUndoDelta;

/** Baseline for one logical stroke (`beginStroke` … `endStrokeUndo`). */
let strokeUndoBaseline: { v: Map<string, Voxel>; s: Map<string, Voxel> } | null = null;

export function resetUndo() {
  strokeUndoBaseline = null;
  undo.reset();
}

export function commitUndoAfter(fn: () => void): void {
  undo.clearRedo();
  const oldV = get(voxels);
  const oldS = get(selection);
  fn();
  const delta = computeUndoDelta(oldV, oldS, get(voxels), get(selection));
  if (!isUndoDeltaEmpty(delta)) {
    pushUndoDelta(delta);
  }
}

/** Start a stroke: remember voxels+selection for a single undo step when `endStrokeUndo` runs. */
export function beginStroke() {
  undo.clearRedo();
  strokeUndoBaseline = {
    v: cloneVoxelsImpl(get(voxels)),
    s: cloneVoxelsImpl(get(selection))
  };
}

/** Finish a stroke begun with `beginStroke` and record one delta on the undo stack. */
export function endStrokeUndo() {
  if (!strokeUndoBaseline) return;
  const delta = computeUndoDelta(
    strokeUndoBaseline.v,
    strokeUndoBaseline.s,
    get(voxels),
    get(selection)
  );
  strokeUndoBaseline = null;
  if (!isUndoDeltaEmpty(delta)) {
    pushUndoDelta(delta);
  }
}

export function runVoxelStroke(fn: () => void): void {
  beginStroke();
  try {
    fn();
  } finally {
    endStrokeUndo();
  }
}

export const getUndoSnapshot = undo.getSnapshot;
export const restoreUndoSnapshot = undo.restoreSnapshot;
export const history = undo.history;
export const canUndoStore = undo.canUndoStore;
export const canRedoStore = undo.canRedoStore;

// Re-exports
export {
  initShape,
  getShapePositionsAt,
  rotatePositionAroundOrigin,
  rotateVectorByAxisQuarters,
  clampQuarterTurn
};
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

/** Resize grid to tightly fit current voxel content (symmetric about origin). */
export function resizeGridToContent(): void {
  const b = getVoxelBounds(get(voxels));
  if (!b) return;
  const maxAbs = Math.max(
    Math.abs(b.minX),
    Math.abs(b.minY),
    Math.abs(b.minZ),
    Math.abs(b.maxX),
    Math.abs(b.maxY),
    Math.abs(b.maxZ)
  );
  const targetSize = Math.min(Math.max(1, 2 * (maxAbs + 1)), MAX_GRID_SIZE);
  if (targetSize !== get(gridSize)) gridSize.set(targetSize);
}

export function shiftVoxelsAndSelection(dx: number, dy: number, dz: number): void {
  const v = get(voxels);
  const sel = get(selection);
  if (v.size === 0 && sel.size === 0) return;
  const nx = Math.round(dx);
  const ny = Math.round(dy);
  const nz = Math.round(dz);
  if (nx === 0 && ny === 0 && nz === 0) return;
  commitUndoAfter(() => {
    const newVoxels = new Map<string, Voxel>();
    for (const [key, col] of v) {
      const [x, y, z] = parseCoordKey(key);
      newVoxels.set(coordKey(x + nx, y + ny, z + nz), col);
    }
    const newSel = new Map<string, Voxel>();
    for (const [key, col] of sel) {
      const [x, y, z] = parseCoordKey(key);
      newSel.set(coordKey(x + nx, y + ny, z + nz), col);
    }
    const positions = [...newVoxels.keys()].map((k) => parseCoordKey(k));
    ensureGridFitsPositions(positions);
    voxels.set(newVoxels);
    selection.set(newSel);
  });
}

/**
 * Scale the whole model by 2× about the origin: each voxel at (x,y,z) becomes a 2×2×2 block
 * with the same color, occupying [2x,2x+1]×[2y,2y+1]×[2z,2z+1]. Selection is scaled the same way.
 */
export function scaleProjectBy2(): void {
  const v = get(voxels);
  if (v.size === 0) return;
  commitUndoAfter(() => {
    const next = new Map<string, Voxel>();
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
    const nextSel = new Map<string, Voxel>();
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
  });
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
  commitUndoAfter(() => {
    const nextVoxels = cloneVoxelsImpl(v);
    const newSel = new Map<string, Voxel>();
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
  });
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

/**
 * Like `getStampOffsetForFace` but for punch: `normal` points **into** the solid.
 * Aligns the selection bbox so the face along `-normal` lies on the hit voxel layer
 * (no extra ±1 step used for placing stamps in empty neighbors).
 */
export function getPunchOffsetForFace(
  target: [number, number, number],
  inwardNormal: FaceNormal,
  bounds: SelectionBounds
): [number, number, number] {
  const [tx, ty, tz] = target;
  const [nx, ny, nz] = inwardNormal;
  const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
  const dx = nx > 0 ? tx - minX : nx < 0 ? tx - maxX : tx - minX;
  const dy = ny > 0 ? ty - minY : ny < 0 ? ty - maxY : ty - minY;
  const dz = nz > 0 ? tz - minZ : nz < 0 ? tz - maxZ : tz - minZ;
  return [dx, dy, dz];
}

export function cloneVoxels(v: Map<string, Voxel>): Map<string, Voxel> {
  return cloneVoxelsImpl(v);
}
export { serializeVoxels, deserializeVoxels };

export function initCanvas(size: GridSize, shape: StartShape = 'cube') {
  resetUndo();
  hiddenVoxels.set(new Map());
  voxels.set(initShape(size, shape));
}

export function resetCanvas(size: GridSize, shape: StartShape = 'cube') {
  commitUndoAfter(() => {
    hiddenVoxels.set(new Map());
    voxels.set(initShape(size, shape));
  });
}

/** Merge visible and hidden voxels for persistence/export. Hidden wins on key collisions. */
export function getAllVoxels(): Map<string, Voxel> {
  const visible = get(voxels);
  const hidden = get(hiddenVoxels);
  const out = cloneVoxelsImpl(visible);
  for (const [key, vx] of hidden) out.set(key, cloneVoxel(vx));
  return out;
}

/** Move currently selected occupied voxels into `hiddenVoxels` and clear them from selection. */
export function hideSelectedVoxels(): void {
  const v = get(voxels);
  const sel = get(selection);
  if (v.size === 0 || sel.size === 0) return;
  const nextVoxels = cloneVoxelsImpl(v);
  const nextHidden = cloneVoxelsImpl(get(hiddenVoxels));
  const moved = new Set<string>();
  for (const [key] of sel) {
    const vx = v.get(key);
    if (vx === undefined) continue;
    nextVoxels.delete(key);
    nextHidden.set(key, cloneVoxel(vx));
    moved.add(key);
  }
  if (moved.size === 0) return;
  const nextSel = new Map<string, Voxel>();
  for (const [key, vx] of sel) {
    if (!moved.has(key)) nextSel.set(key, vx);
  }
  voxels.set(nextVoxels);
  hiddenVoxels.set(nextHidden);
  selection.set(nextSel);
}

/** Restore all hidden voxels back into the visible voxel map. */
export function unhideAllVoxels(): void {
  const hidden = get(hiddenVoxels);
  if (hidden.size === 0) return;
  const nextVoxels = cloneVoxelsImpl(get(voxels));
  for (const [key, vx] of hidden) {
    nextVoxels.set(key, cloneVoxel(vx));
  }
  voxels.set(nextVoxels);
  hiddenVoxels.set(new Map());
}

/** Map-like view that mirrors set/delete across symmetry axes. has/get delegate to underlying. */
function createMirrorMap(underlying: Map<string, Voxel>, axes: SymmetryAxes): Map<string, Voxel> {
  return {
    get(key: string) {
      return underlying.get(key);
    },
    set(key: string, value: Voxel) {
      const [x, y, z] = parseCoordKey(key);
      for (const k of getMirrorCoordKeys(x, y, z, axes)) {
        underlying.set(k, cloneVoxel(value));
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
    forEach(cb: (value: Voxel, key: string, map: Map<string, Voxel>) => void) {
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
  } as Map<string, Voxel>;
}

function applyVoxelUpdater(updater: (v: Map<string, Voxel>) => void): void {
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

export function updateVoxels(updater: (v: Map<string, Voxel>) => void) {
  commitUndoAfter(() => applyVoxelUpdater(updater));
}

export function updateVoxelsInStroke(updater: (v: Map<string, Voxel>) => void) {
  applyVoxelUpdater(updater);
}

/**
 * Rigid translate of selected occupied voxels (delete sources, write destinations; overwrites targets).
 * Intended after beginStroke(); updates selection keys the same way. No-op if delta is zero.
 */
export function applySelectionTranslationInStroke(dx: number, dy: number, dz: number): void {
  try {
    const nx = Math.round(dx);
    const ny = Math.round(dy);
    const nz = Math.round(dz);
    if (nx === 0 && ny === 0 && nz === 0) return;

    const v = get(voxels);
    const sel = get(selection);

    const toMove: [string, Voxel][] = [];
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

    const newSel = new Map<string, Voxel>();
    for (const [key, col] of sel) {
      const [x, y, z] = parseCoordKey(key);
      newSel.set(coordKey(x + nx, y + ny, z + nz), col);
    }
    selection.set(newSel);
  } finally {
    endStrokeUndo();
  }
}

/** Same as `applySelectionTranslationInStroke` but along one world axis by `steps` voxels. */
export function applySelectionTranslationAlongAxis(axis: 0 | 1 | 2, steps: number): void {
  if (axis === 0) applySelectionTranslationInStroke(steps, 0, 0);
  else if (axis === 1) applySelectionTranslationInStroke(0, steps, 0);
  else applySelectionTranslationInStroke(0, 0, steps);
}

/**
 * Rigid 90° rotation of selected keys (and occupied voxels) about the selection bounding-box center
 * (`getSelectionCenter`). After per-voxel rounding, an integer translation recenters the selection so
 * its bbox center matches the pre-rotation center (avoids a 1-voxel “slide” common with round-alone).
 * Skips if rounding + recenter would collapse two voxels onto one cell or intrude on non-selected solids.
 */
export function applySelectionRotationInStroke(axis: 0 | 1 | 2, deltaQuarters: number): void {
  try {
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

    const provisional = new Map<string, Voxel>();
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
    const toMove: [string, Voxel][] = [];
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

    const newSel = new Map<string, Voxel>();
    for (let i = 0; i < selEntries.length; i++) {
      newSel.set(newSelKeys[i], selEntries[i][1]);
    }
    selection.set(newSel);
  } finally {
    endStrokeUndo();
  }
}

/** Returns a function that yields a voxel (color + material) per stroke cell (random color when multi-palette). */
export function getPaintColorResolver(): () => Voxel {
  const sel = get(selectedColors);
  const mat = get(voxelMaterial);
  const colors = sel.length > 0 ? sel.map(hexToInt) : [hexToInt(get(color))];
  if (colors.length === 1) {
    const c = colors[0]! & 0xffffff;
    return () => ({ color: c, material: mat });
  }
  return () => ({
    color: colors[Math.floor(Math.random() * colors.length)]! & 0xffffff,
    material: mat
  });
}

export function addShapeAt(params: AddShapeParams): void {
  const { position, rotation, shape, size, getVoxel } = params;
  if (shape === 'empty' || size < 1) return;
  const positions = getShapePositionsAt({ position, rotation, shape, size });
  ensureGridFitsPositions(positions);
  updateVoxels((v) => {
    for (const [x, y, z] of positions) {
      v.set(coordKey(x, y, z), cloneVoxel(getVoxel()));
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
