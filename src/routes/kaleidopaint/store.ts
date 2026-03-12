import { writable } from 'svelte/store';
import type { SymmetryMode, MosaicType } from './symmetry';
import type { BrushShape, RotationMode, ColorSource } from './brushEngine';

export type Tool = 'paint' | 'fill' | 'origin' | 'rotate' | 'eyedropper' | 'image';

export const tool = writable<Tool>('paint');
export const symmetryEnabled = writable<boolean>(true);
export const symmetryMode = writable<SymmetryMode>('polar');
export const symmetryOriginX = writable<number>(0.5);
export const symmetryOriginY = writable<number>(0.5);
export const symmetryRotation = writable<number>(0);
export const symmetryFolds = writable<number>(6);
export const mosaicType = writable<MosaicType>('hex-6');
export const color = writable<string>('#000000');
export const secondaryColor = writable<string>('#ffffff');
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
export const brushMix = writable<number>(0);
export const canvasWidth = writable<number>(900);
export const canvasHeight = writable<number>(900);
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
