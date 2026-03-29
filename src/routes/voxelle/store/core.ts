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
  applyLatticeTransform,
  resolveLatticeScaleVec,
  type LatticeAxis
} from './latticeTransform';
import {
  cloneVoxels as cloneVoxelsImpl,
  serializeVoxels,
  deserializeVoxels,
  computeUndoDelta,
  computeUndoDeltaForVoxelKeys,
  computeUndoDeltaForSelectionOnly,
  computeStrokeVoxelUndoDelta,
  mergeUndoParts,
  isUndoDeltaEmpty
} from './serialization';
import { bumpGlowVoxelCount, recomputeGlowVoxelCountFromMap } from './voxelDerivedStats';
import { createUndo } from './undo';
import { measureEditDuration } from './projectPerf';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import { cloneVoxel } from '../voxelMaterial';
import {
  MATERIAL_BUILTIN_PALETTE_HEX,
  VOXELLE_BUILTIN_DEFAULT_BRUSH_HEX
} from './materialBuiltinPalette';

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
  | 'sculpt'
  | 'squishy'
  | 'rope'
  | 'cloth'
  | 'rocks'
  | 'grass'
  | 'ashlar'
  | 'roof'
  | 'flora'
  | 'piscina'
  | 'insecta'
  | 'fauna'
  | 'atmosphere'
  | 'sunShafts'
  | 'distanceTint'
  | 'grain';

export type SculptMode =
  | 'draw'
  | 'smooth'
  | 'gouge'
  | 'branch'
  | 'wall'
  | 'terrain';

/** Sculpt smooth: voxel majority vs local mesh Taubin/Laplacian + revoxelize. */
export type SculptSmoothVariant = 'majority' | 'meshLaplacian';

/** Terrain sculpt: heightfield raise / lower / smooth (Y-up columns). */
export type TerrainSculptOp = 'raise' | 'lower' | 'smooth';

export type RopeBrushShape = 'sphere' | 'cube';
/** Rope mode: direction of gravity (sag). */
export type RopeGravityDirection = 'down' | 'up' | 'left' | 'right' | 'forward' | 'back';

export type DrawBrushShape = 'sphere' | 'cube' | 'pyramid';

const DEFAULT_COLOR = 0x888888;
/** Maximum grid size when not unbounded. Unbounded projects have no placement limit. */
export const MAX_GRID_SIZE = 65536;
/** Max brush/stamp size in voxels (index 0..MAX_BRUSH_SIZE-1 => 1..MAX_BRUSH_SIZE). */
export const MAX_BRUSH_SIZE = 64;

export type StrokeMode =
  | 'line'
  | 'plane'
  | 'circle'
  | 'precise'
  | 'cuboid'
  | 'cylinder'
  | 'polygonHull'
  | 'polygon'
  | 'fill'
  | 'spray';

/** Tools that use `strokeMode` (sidebar selection method). Sculpt/stamp/fly/eyedropper use their own flows. */
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
export type RenderingMode = 'greedy' | 'marchingCubes' | 'dualContour' | 'ray';

function normalizeRenderingMode(mode: RenderingMode | 'raycast'): RenderingMode {
  if (mode === 'raycast') return 'ray';
  if (mode === 'greedy' || mode === 'marchingCubes' || mode === 'dualContour' || mode === 'ray')
    return mode;
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
  /** When false, Add shape only fills empty voxels (including mirror targets). Default true. */
  overwriteIntersecting: boolean;
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
  overwriteIntersecting: true,
  pasteEntries: null
};

/** Reset add panel to closed defaults (shape mode, no paste). */
export function closeAddPanel(): void {
  addPanelStore.set({ ...defaultAddPanel });
}

/** Draw vs Sculpt vs Squishy vs Hand vs Fly vs Generators vs Mood tab pane. */
export type ToolPane = 'draw' | 'sculpt' | 'squishy' | 'hand' | 'fly' | 'generators' | 'mood';

// Stores
export const gridSize = writable<GridSize>(32);
export const voxels = writable<Map<string, Voxel>>(new Map());
/** Hidden voxels are removed from `voxels` until unhidden. */
export const hiddenVoxels = writable<Map<string, Voxel>>(new Map());
export const hasHiddenVoxels = derived(hiddenVoxels, (h) => h.size > 0);
export const tool = writable<Tool>('voxel');
export const toolPane = writable<ToolPane>('draw');
/** Last selected draw tool, restored when switching from Sculpt back to Draw pane. */
export const lastDrawTool = writable<Tool>('remove');
/** Tool active before entering eyedropper; restored after a successful voxel color pick. */
export const toolBeforeEyedropper = writable<Tool>('voxel');
export const selection = writable<Map<string, Voxel>>(new Map());
export const selectionMode = writable<SelectionMode>('replace');
export const fillSelectDiagonals = writable<boolean>(false);
export const fillRespectsColor = writable<boolean>(true);
/** When true, fill and Spray respect `constrainToPlaneRef`. */
export const constrainToPlaneEnabled = writable<boolean>(false);
/**
 * Plane used for fill flood and Spray path when `constrainToPlaneEnabled` is on.
 * Auto = dominant axis of clicked face; camera = view plane; X/Y/Z = world axis through seed.
 */
export type ConstrainToPlaneRef = 'auto' | 'camera' | 0 | 1 | 2;
export const constrainToPlaneRef = writable<ConstrainToPlaneRef>('auto');
/**
 * Polygon stroke: integer steps along the face normal from the click that added the latest point.
 * 0 = fill in the plane of anchor voxels; positive = outward along that normal (previous voxel default).
 */
export const polygonOffsetFromNormal = writable<number>(1);
export const strokeMode = writable<StrokeMode>('spray');
/** `strokeMode` when the active tool uses the draw stroke pipeline; null for sculpt/stamp/fly/eyedropper. */
export const effectiveStrokeMode = derived([tool, strokeMode], ([t, sm]) =>
  DRAW_TOOLS_USING_STROKE_MODE.includes(t) ? sm : null
);
/** When true (default), line stroke is axis-aligned; when false, 3D Bresenham line between start and end voxel. */
export const lineAxisAlign = writable<boolean>(true);
export const planeAxis = writable<PlaneAxis>(1);
/** When true, plane/cuboid/cylinder stroke selects only perimeter (plane) or volumetric shell. */
export const planeCuboidHollow = writable<boolean>(false);
/** Voxel layers kept from the outer surface when hollow (plane/cuboid/cylinder); 1 = thinnest shell. */
export const PLANE_CUBOID_HOLLOW_WALL_MAX = 32;
export const planeCuboidHollowWallThickness = writable<number>(1);
/** Cylinder extrusion taper: 0 = right cylinder; 100 = linear taper to a point at the far end (cone). */
export const PLANE_CYLINDER_TAPER_PCT_MAX = 100;
export const planeCylinderTaperPct = writable<number>(0);
export const sculptMode = writable<SculptMode>('draw');
/** Sculpt brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const sculptBrushRadius = writable<number>(2);
/** Sculpt stroke: 2D stamp (square, circle) or 3D brush (cube, sphere) along the stroke. */
export type SculptBrushShape = 'square' | 'circle' | 'cube' | 'sphere';
export const sculptBrushShape = writable<SculptBrushShape>('square');
/** Branch mode: axis-aligned cube vs cylinder along the stroke polyline. */
export type BranchBrushProfile = 'cube' | 'cylinder';
export const branchBrushProfile = writable<BranchBrushProfile>('cube');
/** Branch cylinder: flat disk ends, domed ends, or conical tips past the polyline ends. */
export type BranchEndCap = 'flat' | 'rounded' | 'pointed';
export const branchEndCap = writable<BranchEndCap>('flat');
/** Branch mode: taper from thick base to thin tip. */
export const branchTaper = writable<boolean>(false);
/** Branch taper: start size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperStartSize = writable<number>(2);
/** Branch taper: end size index 0..(MAX_BRUSH_SIZE-1) (when taper on). */
export const branchTaperEndSize = writable<number>(0);
/**
 * Branch (Extrude): extrusion axis reference.
 * Auto = dominant axis of start face; Camera = drag mapped through view plane (right/up); X/Y/Z = world axes (sign from drag).
 */
export const branchExtrudeRef = writable<ConstrainToPlaneRef>('camera');
/** Smooth mode: Chebyshev neighborhood radius beyond face-only (0 = legacy 6-neighbor window). */
export const smoothNeighborRadius = writable<number>(0);
/** Smooth mode: 0 = gentle thresholds, 100 = same rule as legacy scaled to local neighbor count. */
export const smoothAggressiveness = writable<number>(100);
/** Smooth mode: majority (voxel) vs mesh Taubin smoothing with revoxelization in a local ROI. */
export const sculptSmoothVariant = writable<SculptSmoothVariant>('majority');
/** Mesh smooth: Taubin iterations per stroke sample (1–20). */
export const smoothLaplacianIterations = writable<number>(4);
/** Mesh smooth: step scale 0–100 (higher = stronger λ/μ in Taubin). */
export const smoothLaplacianRelax = writable<number>(50);
/** Sculpt: 0–100; scales how many brush voxels apply (with falloff weights). 100 = full brush. */
export const sculptBrushStrength = writable<number>(100);
/** Sculpt: 0 = hard brush edge; 100 = soft falloff from stroke spine to brush radius. */
export const sculptBrushFalloff = writable<number>(0);
/** Terrain sculpt: raise, lower, or smooth column tops (heightfield). */
export const terrainSculptOp = writable<TerrainSculptOp>('raise');
/** Terrain: fill floor Y per column uses min(this, column min Y). */
export const terrainBaseY = writable<number>(0);
/** Terrain raise/lower: max voxels delta at brush center (falloff toward edge). */
export const terrainStrength = writable<number>(4);
/** Terrain smooth: Chebyshev neighbor radius for averaging column tops. */
export const terrainSmoothRadius = writable<number>(1);
/** Rope mode: tension 0–1 (0=max sag, 1=taut). */
export const ropeTension = writable<number>(0.5);
/** Cloth mode: tension 0–1 (0=loose/drapy, 1=stiff). */
export const clothTension = writable<number>(0.5);
/** Cloth PBD: gravity step multiplier as percent of built-in scale (50–200, default 100). */
export const clothSimGravityPct = writable<number>(100);
/** Cloth PBD: stiffness multiplier for distance constraints (50–150, default 100). */
export const clothSimStiffnessPct = writable<number>(100);
/** Cloth PBD: solver iterations; 0 = automatic from tension (28 + 22×tension). */
export const clothSimIterations = writable<number>(0);
/** Cloth PBD: constraint projection passes per outer step (1–6, default 2). */
export const clothSimConstraintPasses = writable<number>(2);
/** Rope mode: brush shape (sphere or cube). */
export const ropeBrushShape = writable<RopeBrushShape>('sphere');
/** Rope brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const ropeBrushRadius = writable<number>(2);
/** Rope mode: gravity direction (rope sags toward this axis). */
export const ropeGravityDirection = writable<RopeGravityDirection>('down');
/** Spray brush shape: same options as draw brush shapes (cube / sphere / pyramid). */
export type SprayBrushShape = DrawBrushShape;
export const sprayBrushShape = writable<SprayBrushShape>('sphere');
/** Spray size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxel diameter (stamp size). */
export const sprayRadius = writable<number>(2);
/** Spray: max voxel offset for stamp centers (0=none, 1–4=scatter). */
export const sprayScatter = writable<number>(0);
/** Spray: when true, radius varies between sprayRadiusMin and sprayRadiusMax per stamp. */
export const sprayRadiusRange = writable<boolean>(false);
export const sprayRadiusMin = writable<number>(0);
export const sprayRadiusMax = writable<number>(4);
/** When true, offset each spray droplet along the stroke face normal so it sits on the surface (like draw brush snap). */
export const spraySnapToSurface = writable<boolean>(true);
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
/** Wall footprint: freehand stroke, drag a disk on the clicked face, or click polygon corners then Done. */
export type WallAreaShape = 'brush' | 'circle' | 'polygon';
export const wallAreaShape = writable<WallAreaShape>('brush');
/** Draw tool brush shape (sphere, cube, pyramid). */
export const drawBrushShape = writable<DrawBrushShape>('sphere');
/** Draw brush size index 0..(MAX_BRUSH_SIZE-1) => 1..MAX_BRUSH_SIZE voxels (radius index*0.5). */
export const drawBrushSize = writable<number>(0);
/** When true, offset brush along face normal so it sits on surface instead of through it. */
export const drawBrushSnapToSurface = writable<boolean>(true);
/** Default brush color; must appear in DEFAULT_PALETTE (Material Blue 500). */
export const color = writable<string>(VOXELLE_BUILTIN_DEFAULT_BRUSH_HEX);
/** Active material for new paint / voxel / sculpt strokes. */
export const voxelMaterial = writable<VoxelMaterialId>('plastic');
/** Palette colors selected for painting (shift+click). Empty = use color. */
export const selectedColors = writable<string[]>([]);
/** Material Design builtin palette; see materialBuiltinPalette.ts. */
const DEFAULT_PALETTE: string[] = [...MATERIAL_BUILTIN_PALETTE_HEX];
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
  | 'projectStats'
  | null
>(null);
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });

/** Move vs rotate vs uniform scale on the in-scene transform gizmo (selection / add-shape placement). */
export type SelectionGizmoMode = 'move' | 'rotate' | 'scale';
export const selectionGizmoMode = writable<SelectionGizmoMode>('move');

export type StampRotation = { rotX: number; rotY: number; rotZ: number };
export const stampRotation = writable<StampRotation>({ rotX: 0, rotY: 0, rotZ: 0 });
export type StampOriginMode = 'center' | 'corner';
/** Stamp anchor on face tangent axes: center (legacy) or min-corner aligned to click cell. */
export const stampOriginMode = writable<StampOriginMode>('center');
/**
 * Stamp/punch: integer steps along the clicked face normal before placement.
 * 0 keeps current behavior; positive moves outward, negative moves inward.
 */
export const stampPunchOffsetFromNormal = writable<number>(0);
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
/** Exposure slider range in EV stops; applied as `renderer.toneMappingExposure = 2 ** ev`. */
export const TONE_MAPPING_EXPOSURE_MIN = -5;
export const TONE_MAPPING_EXPOSURE_MAX = 5;
/**
 * EV stops for the Light exposure slider: manual mode uses absolute EV (`2**ev`);
 * with Autoexpose on, the same slider is an EV **bias** multiplied onto the auto meter.
 */
export const toneMappingExposure = writable<number>(0);
/** Adapt exposure from measured canvas luminance (screen probe). */
export const autoExposureEnabled = writable<boolean>(false);
export const focalLength = writable<number>(29);
export const orthographic = writable<boolean>(false);

/** Mirror symmetry: when enabled, voxel set/delete are applied at mirrored positions. */
export const symmetryX = writable<boolean>(false);
export const symmetryY = writable<boolean>(false);
export const symmetryZ = writable<boolean>(false);

const dirtyVoxelKeys = new Set<string>();

function noteDirtyVoxelKeysForMesh(keys: ReadonlySet<string>): void {
  for (const k of keys) dirtyVoxelKeys.add(k);
}

// Undo system
const undo = createUndo(voxels, selection, { noteVoxelKeysDirty: noteDirtyVoxelKeysForMesh });
const pushUndoDelta = undo.pushUndoDelta;

/** Baseline for one logical stroke (`beginStroke` … `endStrokeUndo`): map refs at stroke start (no full clone). */
let strokeUndoBaseline: { v: Map<string, Voxel>; s: Map<string, Voxel> } | null = null;
const strokeVoxelTouched = new Set<string>();
/** Per key: voxel at stroke start, or `null` if empty (first touch recorded on edit). */
const strokeVoxelBefore = new Map<string, Voxel | null>();

let commitUndoDepth = 0;
const commitUndoTouchedVoxels = new Set<string>();

function recordVoxelKeyForUndo(k: string): void {
  if (strokeUndoBaseline) {
    if (!strokeVoxelBefore.has(k)) {
      const p = strokeUndoBaseline.v.get(k);
      strokeVoxelBefore.set(k, p ? cloneVoxel(p) : null);
    }
    strokeVoxelTouched.add(k);
  }
  if (commitUndoDepth > 0) {
    commitUndoTouchedVoxels.add(k);
  }
}

export function resetUndo() {
  strokeUndoBaseline = null;
  strokeVoxelTouched.clear();
  strokeVoxelBefore.clear();
  undo.reset();
}

export function commitUndoAfter(fn: () => void): void {
  measureEditDuration(() => {
    undo.clearRedo();
    const oldV = get(voxels);
    const oldS = get(selection);
    commitUndoDepth++;
    commitUndoTouchedVoxels.clear();
    try {
      fn();
    } finally {
      commitUndoDepth--;
    }
    const newV = get(voxels);
    const newS = get(selection);
    let delta;
    if (commitUndoTouchedVoxels.size > 0) {
      delta = mergeUndoParts(
        computeUndoDeltaForVoxelKeys(oldV, newV, commitUndoTouchedVoxels),
        computeUndoDeltaForSelectionOnly(oldS, newS)
      );
    } else if (newV === oldV) {
      delta = mergeUndoParts(
        { voxelAdded: [], voxelRemoved: [] },
        computeUndoDeltaForSelectionOnly(oldS, newS)
      );
    } else {
      delta = computeUndoDelta(oldV, oldS, newV, newS);
    }
    if (!isUndoDeltaEmpty(delta)) {
      pushUndoDelta(delta);
    }
  });
}

/** Start a stroke: remember voxels+selection for a single undo step when `endStrokeUndo` runs. */
export function beginStroke() {
  undo.clearRedo();
  strokeUndoBaseline = {
    v: get(voxels),
    s: get(selection)
  };
  strokeVoxelTouched.clear();
  strokeVoxelBefore.clear();
}

/** Finish a stroke begun with `beginStroke` and record one delta on the undo stack. */
export function endStrokeUndo() {
  if (!strokeUndoBaseline) return;
  const baseline = strokeUndoBaseline;
  strokeUndoBaseline = null;
  const vPart = computeStrokeVoxelUndoDelta(get(voxels), strokeVoxelTouched, strokeVoxelBefore);
  const sPart = computeUndoDeltaForSelectionOnly(baseline.s, get(selection));
  const delta = mergeUndoParts(vPart, sPart);
  strokeVoxelTouched.clear();
  strokeVoxelBefore.clear();
  if (!isUndoDeltaEmpty(delta)) {
    pushUndoDelta(delta);
  }
}

export function runVoxelStroke(fn: () => void): void {
  measureEditDuration(() => {
    beginStroke();
    try {
      fn();
    } finally {
      endStrokeUndo();
    }
  });
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
    recomputeGlowVoxelCountFromMap(newVoxels);
    selection.set(newSel);
  });
}

type LatticeTransformConfig = {
  axis?: LatticeAxis;
  angleRad?: number;
  scale?: number;
  scalePerAxis?: [number, number, number];
};

function shouldMergeLatticeDuplicatesFromConfig(config: LatticeTransformConfig): boolean {
  const angleRad = config.angleRad ?? 0;
  if (Math.abs(angleRad) > 1e-9) return true;
  if (config.scalePerAxis) return Math.min(...config.scalePerAxis) < 1 - 1e-9;
  return (config.scale ?? 1) < 1;
}

export function transformProjectLatticeTransform(config: LatticeTransformConfig): void {
  const v = get(voxels);
  const sel = get(selection);
  if (v.size === 0) return;
  const pivot = getVoxelCenter(v);
  if (!pivot) return;
  const allKeys = [...new Set([...v.keys(), ...sel.keys()])];
  const allEntries = allKeys.map((key) => ({ key, value: key }));
  const mapped = applyLatticeTransform(allEntries, {
    pivot,
    axis: config.axis,
    angleRad: config.angleRad,
    scale: config.scale,
    scalePerAxis: config.scalePerAxis,
    allowMergeOnDuplicate: shouldMergeLatticeDuplicatesFromConfig(config)
  });
  if (!mapped.ok) return;
  const voxelSources = new Map(v.entries());
  const next = new Map<string, Voxel>();
  for (const entry of mapped.entries) {
    const col = voxelSources.get(entry.sourceKey);
    if (col !== undefined) next.set(entry.destKey, col);
  }
  const nextSel = new Map<string, Voxel>();
  for (const entry of mapped.entries) {
    const selCol = sel.get(entry.sourceKey);
    if (selCol !== undefined) nextSel.set(entry.destKey, selCol);
  }
  commitUndoAfter(() => {
    ensureGridFitsPositions([...next.keys()].map((k) => parseCoordKey(k)));
    voxels.set(next);
    recomputeGlowVoxelCountFromMap(next);
    selection.set(nextSel);
  });
}

/** Scale the whole model by 2× around the model pivot (nearest-neighbor fill when upscaling). */
export function scaleProjectBy2(): void {
  transformProjectLatticeTransform({ scale: 2 });
}

/** Scale the whole model by ½ around the model pivot with deterministic merge on collisions. */
export function scaleProjectByHalf(): void {
  transformProjectLatticeTransform({ scale: 0.5 });
}

/** Scale the whole model around bbox center with integer lattice resampling. */
export function scaleProjectUniform(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0) return;
  transformProjectLatticeTransform({ scale });
}

/** Rotate the whole model around bbox center by arbitrary radians around world axis. */
export function rotateProjectByAngle(axis: LatticeAxis, angleRad: number): void {
  if (!Number.isFinite(angleRad) || Math.abs(angleRad) < 1e-9) return;
  transformProjectLatticeTransform({ axis, angleRad, scale: 1 });
}

function mirrorScalePerAxis(axis: LatticeAxis): [number, number, number] {
  if (axis === 0) return [-1, 1, 1];
  if (axis === 1) return [1, -1, 1];
  return [1, 1, -1];
}

/** Mirror the whole model across the plane through the model bbox center perpendicular to `axis`. */
export function mirrorProjectAcrossAxis(axis: LatticeAxis): void {
  transformProjectLatticeTransform({ scalePerAxis: mirrorScalePerAxis(axis) });
}

/** Backward-compatible quarter-turn API. */
export function rotateProjectQuarterTurns(axis: 0 | 1 | 2, deltaQuarters: number): void {
  rotateProjectByAngle(axis, deltaQuarters * (Math.PI / 2));
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
    recomputeGlowVoxelCountFromMap(nextVoxels);
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
  const initial = initShape(size, shape);
  voxels.set(initial);
  recomputeGlowVoxelCountFromMap(initial);
}

export function resetCanvas(size: GridSize, shape: StartShape = 'cube') {
  commitUndoAfter(() => {
    hiddenVoxels.set(new Map());
    const initial = initShape(size, shape);
    voxels.set(initial);
    recomputeGlowVoxelCountFromMap(initial);
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

function sameVoxelValue(a: Voxel | undefined, b: Voxel | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.color === b.color && a.material === b.material;
}

/**
 * Return and clear voxel keys changed since the last consume call.
 * Used by the mesh pipeline to derive dirty chunk updates.
 */
export function consumeDirtyVoxelKeys(): Set<string> {
  if (dirtyVoxelKeys.size === 0) return new Set();
  const out = new Set(dirtyVoxelKeys);
  dirtyVoxelKeys.clear();
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
  recomputeGlowVoxelCountFromMap(nextVoxels);
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
  recomputeGlowVoxelCountFromMap(nextVoxels);
  hiddenVoxels.set(new Map());
}

/**
 * Map API passed to `updateVoxels` / `updateVoxelsInStroke` callbacks.
 * With symmetry on, writes mirror across axes; only these methods are guaranteed.
 */
/** Map-like API for sculpt callbacks; `set` returns the same interface for chaining (not a raw `Map`). */
export type VoxelUpdaterMap = {
  get(key: string): Voxel | undefined;
  has(key: string): boolean;
  set(key: string, value: Voxel): VoxelUpdaterMap;
  delete(key: string): boolean;
};

const OVERLAY_TOMB = Symbol('voxelOverlayTomb');
type OverlayCell = Voxel | typeof OVERLAY_TOMB;

function applyVoxelUpdater(updater: (v: VoxelUpdaterMap) => void): void {
  voxels.update((readMap) => {
    const overlays = new Map<string, OverlayCell>();

    function read(k: string): Voxel | undefined {
      if (overlays.has(k)) {
        const o = overlays.get(k)!;
        return o === OVERLAY_TOMB ? undefined : o;
      }
      return readMap.get(k);
    }

    function setKey(k: string, val: Voxel) {
      const prev = read(k);
      const next = cloneVoxel(val);
      recordVoxelKeyForUndo(k);
      bumpGlowVoxelCount(prev, next);
      overlays.set(k, next);
    }

    function deleteKey(k: string): boolean {
      const prev = read(k);
      if (prev === undefined) return false;
      recordVoxelKeyForUndo(k);
      bumpGlowVoxelCount(prev, undefined);
      if (readMap.has(k)) {
        overlays.set(k, OVERLAY_TOMB);
      } else {
        overlays.delete(k);
      }
      return true;
    }

    const axes: SymmetryAxes = {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };

    const plain: VoxelUpdaterMap = {
      get(key: string) {
        return read(key);
      },
      has(key: string) {
        return read(key) !== undefined;
      },
      set(key: string, value: Voxel) {
        setKey(key, value);
        return plain;
      },
      delete(key: string) {
        return deleteKey(key);
      }
    };

    const mirrorTarget: VoxelUpdaterMap = {
      get(key: string) {
        return read(key);
      },
      has(key: string) {
        return read(key) !== undefined;
      },
      set(key: string, value: Voxel) {
        const [x, y, z] = parseCoordKey(key);
        for (const k of getMirrorCoordKeys(x, y, z, axes)) {
          setKey(k, value);
        }
        return mirrorTarget;
      },
      delete(key: string) {
        const [x, y, z] = parseCoordKey(key);
        let deleted = false;
        for (const k of getMirrorCoordKeys(x, y, z, axes)) {
          if (deleteKey(k)) deleted = true;
        }
        return deleted;
      }
    };

    const target: VoxelUpdaterMap = axes.x || axes.y || axes.z ? mirrorTarget : plain;

    updater(target);

    if (overlays.size === 0) return readMap;
    for (const [k, v] of overlays) {
      const before = readMap.get(k);
      const after = v === OVERLAY_TOMB ? undefined : v;
      if (sameVoxelValue(before, after)) continue;
      if (v === OVERLAY_TOMB) readMap.delete(k);
      else readMap.set(k, v);
      dirtyVoxelKeys.add(k);
    }
    return readMap;
  });
}

export function updateVoxels(updater: (v: VoxelUpdaterMap) => void) {
  commitUndoAfter(() => applyVoxelUpdater(updater));
}

export function updateVoxelsInStroke(updater: (v: VoxelUpdaterMap) => void) {
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

/** Lattice rotate/scale selected keys (and occupied voxels) around selection center. */
export function applySelectionLatticeTransformInStroke(config: LatticeTransformConfig): void {
  try {
    const sel = get(selection);
    if (sel.size === 0) return;
    const pivot = getSelectionCenter(sel);
    if (!pivot) return;
    const selEntries = [...sel.entries()];
    const mappedSel = applyLatticeTransform(
      selEntries.map(([key, col]) => ({ key, value: col })),
      {
        pivot,
        axis: config.axis,
        angleRad: config.angleRad,
        scale: config.scale,
        scalePerAxis: config.scalePerAxis,
        allowMergeOnDuplicate: shouldMergeLatticeDuplicatesFromConfig(config)
      }
    );
    if (!mappedSel.ok) return;

    const v = get(voxels);
    const toMove: Array<{ sourceKey: string; destKey: string; col: Voxel }> = [];
    const occupiedSelectionKeys = new Set<string>();
    for (const [key] of sel) {
      if (v.has(key)) occupiedSelectionKeys.add(key);
    }
    for (const entry of mappedSel.entries) {
      const key = entry.sourceKey;
      const col = v.get(key);
      if (col !== undefined) toMove.push({ sourceKey: key, destKey: entry.destKey, col });
    }

    const sourceKeys = occupiedSelectionKeys;
    const destKeys = toMove.map((t) => t.destKey);

    const maxScaleFactor = Math.max(
      ...resolveLatticeScaleVec({
        pivot,
        scale: config.scale,
        scalePerAxis: config.scalePerAxis,
        allowMergeOnDuplicate: shouldMergeLatticeDuplicatesFromConfig(config)
      })
    );
    const angleRad = config.angleRad ?? 0;
    const scaleUpExpandsFootprint = maxScaleFactor > 1 + 1e-9;
    /** NN rotation / hole-fill can target many cells; requiring empty neighbors made gizmo + menu no-op for typical selections. */
    const latticeRotates = Math.abs(angleRad) > 1e-9;
    const skipIntrusionCheck = scaleUpExpandsFootprint || latticeRotates;
    if (!skipIntrusionCheck) {
      for (const nk of destKeys) {
        if (v.has(nk) && !sourceKeys.has(nk)) return;
      }
    }

    if (toMove.length > 0) {
      ensureGridFitsPositions(destKeys.map((k) => parseCoordKey(k)));
      updateVoxelsInStroke((target) => {
        for (const sourceKey of sourceKeys) target.delete(sourceKey);
        for (const { destKey, col } of toMove) {
          target.set(destKey, col);
        }
      });
    }

    const newSel = new Map<string, Voxel>();
    for (const entry of mappedSel.entries) {
      newSel.set(entry.destKey, entry.value);
    }
    selection.set(newSel);
  } finally {
    endStrokeUndo();
  }
}

/** Backward-compatible quarter-turn selection rotate API. */
export function applySelectionRotationInStroke(axis: 0 | 1 | 2, deltaQuarters: number): void {
  if (deltaQuarters === 0) return;
  applySelectionLatticeTransformInStroke({
    axis,
    angleRad: deltaQuarters * (Math.PI / 2),
    scale: 1
  });
}

/** Selection rotate by arbitrary radians around one world axis. */
export function applySelectionRotationRadiansInStroke(axis: 0 | 1 | 2, angleRad: number): void {
  if (!Number.isFinite(angleRad) || Math.abs(angleRad) < 1e-9) return;
  applySelectionLatticeTransformInStroke({ axis, angleRad, scale: 1 });
}

/** Selection uniform scale around current selection center. */
export function applySelectionScaleInStroke(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 1e-9) return;
  applySelectionLatticeTransformInStroke({ scale });
}

/** Per-axis scale around selection center (world X / Y / Z). */
export function applySelectionScaleAxesInStroke(sx: number, sy: number, sz: number): void {
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return;
  if (sx <= 0 || sy <= 0 || sz <= 0) return;
  if (
    Math.abs(sx - 1) < 1e-9 &&
    Math.abs(sy - 1) < 1e-9 &&
    Math.abs(sz - 1) < 1e-9
  ) {
    return;
  }
  applySelectionLatticeTransformInStroke({ scalePerAxis: [sx, sy, sz] });
}

/** Mirror selected keys (and occupied voxels on them) across the plane through selection bbox center perpendicular to `axis`. */
export function applySelectionMirrorAcrossAxisInStroke(axis: LatticeAxis): void {
  applySelectionLatticeTransformInStroke({ scalePerAxis: mirrorScalePerAxis(axis) });
}

export type PaintColorResolver = (x: number, y: number, z: number) => Voxel;

/** Deterministic palette index for a voxel coordinate. */
export function paintColorIndexForCoord(x: number, y: number, z: number, paletteSize: number): number {
  if (paletteSize <= 1) return 0;
  const xi = Math.floor(x) | 0;
  const yi = Math.floor(y) | 0;
  const zi = Math.floor(z) | 0;
  let h =
    Math.imul(xi, 0x9e3779b1) ^ Math.imul(yi, 0x85ebca6b) ^ Math.imul(zi, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) % paletteSize;
}

/** Returns a function that yields a voxel (color + material) per stroke cell. */
export function getPaintColorResolver(): PaintColorResolver {
  const sel = get(selectedColors);
  const mat = get(voxelMaterial);
  const colors = sel.length > 0 ? sel.map(hexToInt) : [hexToInt(get(color))];
  if (colors.length === 1) {
    const c = colors[0]! & 0xffffff;
    return () => ({ color: c, material: mat });
  }
  return (x: number, y: number, z: number) => ({
    color: colors[paintColorIndexForCoord(x, y, z, colors.length)]! & 0xffffff,
    material: mat
  });
}

export function addShapeAt(params: AddShapeParams): void {
  const { position, rotation, shape, size, getVoxel } = params;
  const overwriteIntersecting = params.overwriteIntersecting !== false;
  if (shape === 'empty' || size < 1) return;
  const positions = getShapePositionsAt({ position, rotation, shape, size });
  ensureGridFitsPositions(positions);
  const axes: SymmetryAxes = {
    x: get(symmetryX),
    y: get(symmetryY),
    z: get(symmetryZ)
  };
  updateVoxels((v) => {
    for (const [x, y, z] of positions) {
      if (!overwriteIntersecting) {
        let blocked = false;
        for (const k of getMirrorCoordKeys(x, y, z, axes)) {
          if (v.has(k)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
      }
      v.set(coordKey(x, y, z), cloneVoxel(getVoxel(x, y, z)));
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
