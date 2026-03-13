import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const VOXELLE_STORAGE_KEY = 'voxelle';

export type GridSize = number; // any positive integer
export type Tool = 'add' | 'remove' | 'paint' | 'select' | 'stamp' | 'fly';

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
					const onFace =
						x === lo || x === hi || y === lo || y === hi || z === lo || z === hi;
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

const MAX_UNDO = 50;
const MAX_GRID_SIZE = 256;

export type StrokeMode = 'line' | 'plane' | 'cuboid';

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
export const strokeMode = writable<StrokeMode>('line');
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
export const showGrid = writable<boolean>(false);
export const showSSAO = writable<boolean>(true);
export const lightAngle = writable<number>(45); // degrees, rotates light around scene
export const lightColor = writable<string>('#ffffff');
export const backgroundColor = writable<string>('#f0f0f0');
export const roughness = writable<number>(0.6); // 0–1, PBR
export const metalness = writable<number>(0); // 0–1, PBR
export const envMapIntensity = writable<number>(0.5); // environment reflections, 0 to disable
export const focalLength = writable<number>(29); // mm (35mm equivalent); ~45° FOV

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
				focalLength: get(focalLength)
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
