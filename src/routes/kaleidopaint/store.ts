import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { SymmetryMode, MosaicType } from './symmetry';
import type { BrushShape, RotationMode, ColorSource } from './brushEngine';

const KALEIDOPAINT_STORAGE_KEY = 'kaleidopaint';
const KALEIDOPAINT_SKIP_STARTUP_KEY = 'kaleidopaint-skip-startup';
let saved: { width: number; height: number; dataUrl: string } | null = null;
if (browser) {
  try {
    const raw = localStorage.getItem(KALEIDOPAINT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.width && parsed?.height && parsed?.dataUrl) saved = parsed;
    }
  } catch {
    /* ignore */
  }
}

export type Tool = 'paint' | 'fill' | 'origin' | 'rotate' | 'eyedropper' | 'image';
export type ToolPane = 'color' | 'draw' | 'symmetry';
export type ModalRequest = 'newCanvas' | 'help' | 'startup' | 'exportPng' | null;

export const tool = writable<Tool>('paint');
export const toolPane = writable<ToolPane>('color');
export const modalRequest = writable<ModalRequest>(null);
export const symmetryEnabled = writable<boolean>(true);
export const symmetryMode = writable<SymmetryMode>('polar');
export const symmetryOriginX = writable<number>(0.5);
export const symmetryOriginY = writable<number>(0.5);
export const symmetryRotation = writable<number>(0);
export const symmetryFolds = writable<number>(6);
export const mosaicType = writable<MosaicType>('hex-6');
export const color = writable<string>('#000000');
export const backgroundColor = writable<string>('#ffffff');
export const palette = writable<string[]>([]);
export const brushSize = writable<number>(5);
export const brushShape = writable<BrushShape>('round');
export const brushAngle = writable<number>(0);
export const brushRatio = writable<number>(0.3);
export const brushSpacing = writable<number>(0.25);
export const brushOpacity = writable<number>(1);
export const brushFlow = writable<number>(1);
export const brushSoftness = writable<number>(0);
export const brushSharpness = writable<number>(0);
export const brushSharpnessSoften = writable<number>(0.2);
export const brushScatterX = writable<number>(0);
export const brushScatterY = writable<number>(0);
export const brushMirrorH = writable<boolean>(false);
export const brushMirrorV = writable<boolean>(false);
export const brushRotationMode = writable<RotationMode>('fixed');
export const brushRotationAngle = writable<number>(0);
export const brushIsotropicSpacing = writable<boolean>(true);
export const brushSource = writable<ColorSource>('plain');
export const canvasWidth = writable<number>(saved?.width ?? 900);
export const canvasHeight = writable<number>(saved?.height ?? 900);
export const restoreDataUrl = writable<string | null>(saved?.dataUrl ?? null);

export function saveKaleidopaintToStorage(width: number, height: number, dataUrl: string) {
  if (!browser) return;
  try {
    localStorage.setItem(KALEIDOPAINT_STORAGE_KEY, JSON.stringify({ width, height, dataUrl }));
  } catch {
    /* ignore */
  }
}

export function getSkipStartup(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(KALEIDOPAINT_SKIP_STARTUP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipStartup(value: boolean) {
  if (!browser) return;
  try {
    localStorage.setItem(KALEIDOPAINT_SKIP_STARTUP_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}
export const canvasKey = writable<number>(0);
export const showSymmetryPreview = writable<boolean>(true);
export const brushRotateWithSymmetry = writable<boolean>(true);
export const sidebarOpen = writable<boolean>(true);
export const loadedImage = writable<HTMLImageElement | null>(null);
export const imageStampSize = writable<number>(150);
export const imageRotateWithSymmetry = writable<boolean>(true);
export const imageConstrainToSection = writable<boolean>(true);

const canUndoStore = writable(false);
const canRedoStore = writable(false);

export const history = {
  undo: () => {},
  redo: () => {},
  get canUndo() {
    return canUndoStore;
  },
  get canRedo() {
    return canRedoStore;
  }
};
export const canUndo = canUndoStore;
export const canRedo = canRedoStore;
