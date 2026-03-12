import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

const VOXELLE_STORAGE_KEY = 'voxelle';

export type GridSize = 32 | 64;
export type Tool = 'add' | 'remove' | 'paint';

const DEFAULT_COLOR = 0x888888;

export function coordKey(x: number, y: number, z: number): string {
	return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function parseCoordKey(key: string): [number, number, number] {
	const [x, y, z] = key.split(',').map(Number);
	return [x, y, z];
}

export function initFilledCube(size: GridSize, color: number = DEFAULT_COLOR): Map<string, number> {
	const map = new Map<string, number>();
	const half = size / 2;
	const lo = -half;
	const hi = half - 1;
	for (let x = lo; x <= hi; x++) {
		for (let y = lo; y <= hi; y++) {
			for (let z = lo; z <= hi; z++) {
				map.set(coordKey(x, y, z), color);
			}
		}
	}
	return map;
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

export type StrokeMode = 'line' | 'plane' | 'cuboid';

export const gridSize = writable<GridSize>(32);
export const voxels = writable<Map<string, number>>(new Map());
export const tool = writable<Tool>('remove');
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

export function initCanvas(size: GridSize) {
	undoStack.length = 0;
	redoStack.length = 0;
	canUndoStore.set(false);
	canRedoStore.set(false);
	voxels.set(initFilledCube(size));
}

export function loadFromStorage(): boolean {
	if (!browser) return false;
	try {
		const raw = localStorage.getItem(VOXELLE_STORAGE_KEY);
		if (!raw) return false;
		const { gridSize: sz, voxelsJson } = JSON.parse(raw);
		if (sz !== 32 && sz !== 64) return false;
		undoStack.length = 0;
		redoStack.length = 0;
		canUndoStore.set(false);
		canRedoStore.set(false);
		gridSize.set(sz);
		voxels.set(deserializeVoxels(voxelsJson));
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
			JSON.stringify({ gridSize: get(gridSize), voxelsJson: serializeVoxels(get(voxels)) })
		);
	} catch {
		// ignore quota etc
	}
}

export function resetCanvas(size: GridSize) {
	pushUndo();
	voxels.set(initFilledCube(size));
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
