import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const VOXELLE_STORAGE_KEY = 'voxelle';

export type GridSize = number; // any positive integer
export type Tool =
  | 'add'
  | 'remove'
  | 'paint'
  | 'select'
  | 'selectByColor'
  | 'stamp'
  | 'fly'
  | 'eyedropper';

const DEFAULT_COLOR = 0x888888;

export function coordKey(x: number, y: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function parseCoordKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/** Min corner [x,y,z] of selection bounding box; null if empty. */
export function getSelectionAnchor(sel: Map<string, number>): [number, number, number] | null {
  if (sel.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
  }
  return [minX, minY, minZ];
}

export type SelectionBounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

/** Bounding box of selection; null if empty. */
export function getSelectionBounds(sel: Map<string, number>): SelectionBounds | null {
  if (sel.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const key of sel.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Bounding box of voxels; null if empty. */
export function getVoxelBounds(v: Map<string, number>): SelectionBounds | null {
  if (v.size === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const key of v.keys()) {
    const [x, y, z] = parseCoordKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Center of voxel bounding box (voxel-space). Null if empty. */
export function getVoxelCenter(v: Map<string, number>): [number, number, number] | null {
  const b = getVoxelBounds(v);
  if (!b) return null;
  return [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2];
}

/** Center of selection bounding box. Null if empty. */
export function getSelectionCenter(sel: Map<string, number>): [number, number, number] | null {
  const b = getSelectionBounds(sel);
  if (!b) return null;
  return [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2];
}

/** Shift all voxels and selection by (dx, dy, dz). Modifies voxel positions so the origin moves. */
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

/** Move all voxels so the object center is at origin. */
export function centerOriginOnObject(): void {
  const v = get(voxels);
  const c = getVoxelCenter(v);
  if (c) shiftVoxelsAndSelection(-Math.floor(c[0]), -Math.floor(c[1]), -Math.floor(c[2]));
}

/** Move all voxels so the selection center is at origin. */
export function centerOriginOnSelection(): void {
  const sel = get(selection);
  const c = getSelectionCenter(sel);
  if (c) shiftVoxelsAndSelection(-Math.floor(c[0]), -Math.floor(c[1]), -Math.floor(c[2]));
}

/** World face normal (points outward from target voxel). */
export type FaceNormal = [number, number, number];

/**
 * Returns [dx, dy, dz] offset so the stamp snaps its correct side to the target voxel face.
 * Prevents overlap when placing on faces with negative normals (bottom, left, back).
 */
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

export type StartShape = 'cube' | 'orb' | 'cylinder' | 'hollowCube' | 'empty';

function getBounds(size: number) {
  const lo = -Math.floor(size / 2);
  const hi = Math.floor((size - 1) / 2);
  return { lo, hi };
}

export function initShape(
  size: GridSize,
  shape: StartShape,
  color: number = DEFAULT_COLOR
): Map<string, number> {
  const map = new Map<string, number>();
  if (size < 1) return map;
  const { lo, hi } = getBounds(size);

  if (shape === 'empty') return map;

  const r = (size - 1) / 2; // inscribed sphere radius
  const rSq = r * r;

  for (let x = lo; x <= hi; x++) {
    for (let y = lo; y <= hi; y++) {
      for (let z = lo; z <= hi; z++) {
        let include = false;
        if (shape === 'cube') {
          include = true;
        } else if (shape === 'orb') {
          include = x * x + y * y + z * z <= rSq;
        } else if (shape === 'cylinder') {
          include = x * x + z * z <= rSq;
        } else if (shape === 'hollowCube') {
          const onFace = x === lo || x === hi || y === lo || y === hi || z === lo || z === hi;
          include = onFace;
        }
        if (include) map.set(coordKey(x, y, z), color);
      }
    }
  }
  return map;
}

export function initFilledCube(size: GridSize, color: number = DEFAULT_COLOR): Map<string, number> {
  return initShape(size, 'cube', color);
}

/** Rotate [x,y,z] by 90° around X axis. 0=no change, 1=90°, 2=180°, 3=270°. */
function rotateX([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [out[0], -out[2], out[1]];
  }
  return out;
}

/** Rotate [x,y,z] by 90° around Y axis. */
function rotateY([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [out[2], out[1], -out[0]];
  }
  return out;
}

/** Rotate [x,y,z] by 90° around Z axis. */
function rotateZ([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [-out[1], out[0], out[2]];
  }
  return out;
}

export type AddShapeParams = {
  position: [number, number, number];
  rotation: [number, number, number]; // 0–3 quarters (0/90/180/270°) around X, Y, Z
  shape: StartShape;
  size: number;
  color: number;
};

/** Get voxel positions for a shape at given position/rotation (for preview). */
export function getShapePositionsAt(
  params: Omit<AddShapeParams, 'color'>
): [number, number, number][] {
  const { position, rotation, shape, size } = params;
  if (shape === 'empty' || size < 1) return [];
  const raw = initShape(size, shape, 0);
  const [px, py, pz] = position;
  const [rx, ry, rz] = rotation;
  const positions: [number, number, number][] = [];
  for (const key of raw.keys()) {
    let [x, y, z] = parseCoordKey(key);
    [x, y, z] = rotateX([x, y, z], rx);
    [x, y, z] = rotateY([x, y, z], ry);
    [x, y, z] = rotateZ([x, y, z], rz);
    positions.push([x + px, y + py, z + pz]);
  }
  return positions;
}

/** Add a shape at the given position and rotation. Merges into existing voxels. */
export function addShapeAt(params: AddShapeParams): void {
  const { position, rotation, shape, size, color: col } = params;
  if (shape === 'empty' || size < 1) return;
  const raw = initShape(size, shape, col);
  const [px, py, pz] = position;
  const [rx, ry, rz] = rotation;

  const positions: [number, number, number][] = [];
  for (const key of raw.keys()) {
    let [x, y, z] = parseCoordKey(key);
    [x, y, z] = rotateX([x, y, z], rx);
    [x, y, z] = rotateY([x, y, z], ry);
    [x, y, z] = rotateZ([x, y, z], rz);
    positions.push([x + px, y + py, z + pz]);
  }
  ensureGridFitsPositions(positions);
  updateVoxels((v) => {
    for (const [x, y, z] of positions) {
      v.set(coordKey(x, y, z), col);
    }
  });
}

export function cloneVoxels(voxels: Map<string, number>): Map<string, number> {
  return new Map(voxels);
}

export function serializeVoxels(voxels: Map<string, number>): string {
  return JSON.stringify([...voxels.entries()]);
}

export function deserializeVoxels(json: string): Map<string, number> {
  const entries = JSON.parse(json) as [string, number][];
  return new Map(entries);
}

/** Compact format for URL: [gridSize, [x,y,z,color], ...] */
function toCompactPayload(voxels: Map<string, number>, sz: GridSize): string {
  const arr: (number | number[])[] = [sz];
  for (const [key, c] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    arr.push([x, y, z, c]);
  }
  return JSON.stringify(arr);
}

function fromCompactPayload(
  json: string
): { gridSize: number; voxels: Map<string, number> } | null {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || arr.length < 1) return null;
    const sz = arr[0];
    if (typeof sz !== 'number' || sz < 1 || !Number.isInteger(sz)) return null;
    const voxels = new Map<string, number>();
    for (let i = 1; i < arr.length; i++) {
      const e = arr[i];
      if (!Array.isArray(e) || e.length !== 4) continue;
      const [x, y, z, c] = e;
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number' ||
        typeof c !== 'number'
      )
        continue;
      voxels.set(coordKey(x, y, z), c >>> 0);
    }
    return { gridSize: sz, voxels };
  } catch {
    return null;
  }
}

/** Gzip + base64 encode for URL sharing. */
async function compressForUrl(text: string): Promise<string> {
  const blob = new Blob([text], { type: 'application/json' });
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Base64 decode + gzip decompress. */
async function decompressFromUrl(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Encode current model for URL. Returns base64 string for hash. */
export async function encodeModelForUrl(): Promise<string> {
  const v = get(voxels);
  const sz = get(gridSize);
  const payload = toCompactPayload(v, sz);
  return compressForUrl(payload);
}

/** Load model from base64 hash payload. Returns true if loaded. */
export async function loadFromUrlHash(encoded: string): Promise<boolean> {
  try {
    const json = await decompressFromUrl(encoded);
    const result = fromCompactPayload(json);
    if (!result) return false;
    undoStack.length = 0;
    redoStack.length = 0;
    canUndoStore.set(false);
    canRedoStore.set(false);
    gridSize.set(result.gridSize);
    voxels.set(result.voxels);
    return true;
  } catch {
    return false;
  }
}

const MAX_UNDO = 50;
const MAX_GRID_SIZE = 256;

export type StrokeMode = 'line' | 'plane' | 'cuboid' | 'polygon' | 'fill';

export const gridSize = writable<GridSize>(32);

/** Expand grid to fit positions. Call before placing voxels so no cell is rejected as out of bounds. */
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
export const voxels = writable<Map<string, number>>(new Map());
export const tool = writable<Tool>('remove');
/** Selected voxels: coordKey -> color. Used for stamp/clone. */
export const selection = writable<Map<string, number>>(new Map());

/** How new selection strokes combine with existing: replace, add, subtract, intersect */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export const selectionMode = writable<SelectionMode>('replace');

/** Fill selection: true = 26-connected (diagonals), false = 6-connected (face-only). */
export const fillSelectDiagonals = writable<boolean>(false);

/** Fill selection: true = same-color only, false = all connected voxels. */
export const fillRespectsColor = writable<boolean>(true);

export const strokeMode = writable<StrokeMode>('line');

/** Plane orientation: 'auto' = use clicked face normal; 0|1|2 = force X|Y|Z axis. */
export type PlaneAxis = 'auto' | 0 | 1 | 2;
export const planeAxis = writable<PlaneAxis>(1);
export const color = writable<string>('#ff5733');
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

/** Request to open a modal from menu: 'newGrid' | 'share' | 'add' | null */
export const modalRequest = writable<'newGrid' | 'share' | 'add' | null>(null);

/** Add panel state (positioned in viewport lower-left). Open + form values. */
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
export const addPanelStore = writable<AddPanelState>({ ...defaultAddPanel });
export const showGrid = writable<boolean>(false);
export const lightAngle = writable<number>(45); // degrees azimuth, rotates light around scene
export const lightElevation = writable<number>(40); // degrees, sun height above horizon (0–90)
export const lightColor = writable<string>('#ffffff');
export const ambientIntensity = writable<number>(0.5); // 0–1.5, hemisphere/ambient light level
export const enableShadows = writable<boolean>(true);
export const enableAO = writable<boolean>(true);
export const backgroundColor = writable<string>('#f0f0f0');
export const enableSky = writable<boolean>(true); // procedural sky + horizon
export const roughness = writable<number>(0.6); // 0–1, PBR
export const metalness = writable<number>(0); // 0–1, PBR
export const envMapIntensity = writable<number>(0.5); // environment reflections, 0 to disable
export const focalLength = writable<number>(29); // mm (35mm equivalent); ~45° FOV
export const orthographic = writable<boolean>(false); // orthographic vs perspective projection

const canUndoStore = writable(false);
const canRedoStore = writable(false);

const undoStack: string[] = [];
const redoStack: string[] = [];

function pushUndo() {
  const v = get(voxels);
  redoStack.length = 0;
  undoStack.push(serializeVoxels(v));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  canUndoStore.set(undoStack.length > 0);
  canRedoStore.set(false);
}

function doUndo() {
  if (undoStack.length === 0) return;
  const current = serializeVoxels(get(voxels));
  redoStack.push(current);
  const snapshot = undoStack.pop()!;
  voxels.set(deserializeVoxels(snapshot));
  canUndoStore.set(undoStack.length > 0);
  canRedoStore.set(redoStack.length > 0);
}

function doRedo() {
  if (redoStack.length === 0) return;
  const current = serializeVoxels(get(voxels));
  undoStack.push(current);
  const snapshot = redoStack.pop()!;
  voxels.set(deserializeVoxels(snapshot));
  canUndoStore.set(undoStack.length > 0);
  canRedoStore.set(redoStack.length > 0);
}

export const history = {
  undo: doUndo,
  redo: doRedo,
  get canUndo() {
    return canUndoStore;
  },
  get canRedo() {
    return canRedoStore;
  }
};

export { canUndoStore as canUndo, canRedoStore as canRedo };

export function initCanvas(size: GridSize, shape: StartShape = 'cube') {
  undoStack.length = 0;
  redoStack.length = 0;
  canUndoStore.set(false);
  canRedoStore.set(false);
  voxels.set(initShape(size, shape));
}

export function loadFromStorage(): boolean {
  if (!browser) return false;
  try {
    const raw = localStorage.getItem(VOXELLE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const sz = data.gridSize;
    if (typeof sz !== 'number' || sz < 1 || !Number.isInteger(sz)) return false;
    undoStack.length = 0;
    redoStack.length = 0;
    canUndoStore.set(false);
    canRedoStore.set(false);
    gridSize.set(sz);
    voxels.set(deserializeVoxels(data.voxelsJson));
    if (typeof data.focalLength === 'number' && data.focalLength >= 15 && data.focalLength <= 200) {
      focalLength.set(data.focalLength);
    }
    if (typeof data.orthographic === 'boolean') {
      orthographic.set(data.orthographic);
    }
    return true;
  } catch {
    return false;
  }
}

export function saveToStorage() {
  if (!browser) return;
  try {
    localStorage.setItem(
      VOXELLE_STORAGE_KEY,
      JSON.stringify({
        gridSize: get(gridSize),
        voxelsJson: serializeVoxels(get(voxels)),
        focalLength: get(focalLength),
        orthographic: get(orthographic)
      })
    );
  } catch {
    // ignore quota etc
  }
}

export function resetCanvas(size: GridSize, shape: StartShape = 'cube') {
  pushUndo();
  voxels.set(initShape(size, shape));
}

export function updateVoxels(updater: (v: Map<string, number>) => void) {
  pushUndo();
  voxels.update((v) => {
    const next = cloneVoxels(v);
    updater(next);
    return next;
  });
}

/** Call once at stroke start; then use updateVoxelsInStroke for each change without extra undo. */
export function beginStroke() {
  pushUndo();
}

export function updateVoxelsInStroke(updater: (v: Map<string, number>) => void) {
  voxels.update((v) => {
    const next = cloneVoxels(v);
    updater(next);
    return next;
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

/** Grid bounds: x,y,z in [-size/2, size/2) */
function inBounds(x: number, y: number, z: number, size: number): boolean {
  const h = size / 2;
  return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
}

/** Face-adjacent offsets (6-connected) */
const ADJ_6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

/** Face + edge + corner offsets (26-connected) */
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

/** Flood-fill from (x,y,z): select clicked voxel and all connected voxels (optionally same-color only). */
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
        const nk = coordKey(nx, ny, nz);
        if (!visited.has(nk)) stack.push([nx, ny, nz]);
      }
    }
  }
  return next;
}

/** Merge new selection with current based on selectionMode. */
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
  // intersect
  const out = new Map<string, number>();
  for (const [k, c] of incoming) {
    if (current.has(k)) out.set(k, c);
  }
  return out;
}

export function selectAll() {
  const v = get(voxels);
  const sz = get(gridSize);
  const next = new Map<string, number>();
  for (const [key, col] of v) next.set(key, col);
  selection.set(next);
}

export function deselectAll() {
  selection.set(new Map());
}

/** Remove from selection all positions that have a voxel. */
export function deselectVoxels() {
  const v = get(voxels);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    if (!v.has(key)) next.set(key, col);
  }
  selection.set(next);
}

/** Remove from selection all positions that don't have a voxel (cleanup orphaned entries). */
export function deselectEmptySpaces() {
  const v = get(voxels);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of sel) {
    if (v.has(key)) next.set(key, col);
  }
  selection.set(next);
}

export function invertSelection() {
  const v = get(voxels);
  const sz = get(gridSize);
  const sel = get(selection);
  const next = new Map<string, number>();
  for (const [key, col] of v) {
    if (!sel.has(key)) next.set(key, col);
  }
  selection.set(next);
}

/** Expand selection by one layer of face-adjacent voxels. */
export function growSelection() {
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

/** Remove voxels on selection boundary (have at least one empty face-adjacent neighbor). */
export function shrinkSelection() {
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

/** Remove interior voxels. If selection is empty: remove all interior voxels. Otherwise: remove only voxels interior to the selection (surrounded by selected voxels). */
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

/** Clipboard format: relative voxel entries for paste. */
export type VoxelleClipboard = {
  type: 'voxelle';
  entries: [number, number, number, number][]; // [dx, dy, dz, color], relative to min corner
};

/** Copy selected voxels (that exist) to clipboard. Returns false if nothing to copy. */
export async function copySelection(): Promise<boolean> {
  if (!browser || !navigator.clipboard?.writeText) return false;
  const v = get(voxels);
  const sel = get(selection);
  const bounds = getSelectionBounds(sel);
  if (!bounds) return false;
  const entries: [number, number, number, number][] = [];
  for (const [key, col] of sel) {
    if (!v.has(key)) continue;
    const [x, y, z] = parseCoordKey(key);
    entries.push([x - bounds.minX, y - bounds.minY, z - bounds.minZ, col]);
  }
  if (entries.length === 0) return false;
  const payload: VoxelleClipboard = { type: 'voxelle', entries };
  await navigator.clipboard.writeText(JSON.stringify(payload));
  return true;
}

/** Cut: copy selection then remove those voxels. */
export async function cutSelection(): Promise<boolean> {
  if (!(await copySelection())) return false;
  const sel = get(selection);
  updateVoxels((v) => {
    for (const key of sel.keys()) v.delete(key);
  });
  selection.set(new Map());
  return true;
}

/** Paste from clipboard at origin (0,0,0). Returns false if no voxelle data. */
export async function pasteFromClipboard(): Promise<boolean> {
  if (!browser || !navigator.clipboard?.readText) return false;
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text) as VoxelleClipboard;
    if (data?.type !== 'voxelle' || !Array.isArray(data.entries)) return false;
    const positions = data.entries.map(([x, y, z]) => [x, y, z] as [number, number, number]);
    ensureGridFitsPositions(positions);
    updateVoxels((v) => {
      for (const [dx, dy, dz, col] of data.entries) {
        v.set(coordKey(dx, dy, dz), col >>> 0);
      }
    });
    return true;
  } catch {
    return false;
  }
}

/** Replace selection with connected component of same color from first selected voxel. */
export function selectConnected() {
  const v = get(voxels);
  const sz = get(gridSize);
  const sel = get(selection);
  if (sel.size === 0) return;
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
