import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Ray refine bar, mesh spinner, project-open overlay. */
export type VoxelCanvasLoadingHudProps = {
  rayRefinementProgress: number;
  showGreedyMeshSpinner: boolean;
  projectOpenLoadingActive: boolean;
  projectOpenLoadingMessage: string;
  projectOpenLoadingProgress: number;
};

export type VoxelCanvasFillHudProps = {
  fillBusy: boolean;
  fillMessage: string;
  fillVisited: number;
  fillMatched: number;
  cancelActiveFill: () => void;
};

export type VoxelCanvasViewportHudProps = {
  fpsCounterDisplayed: number;
  deltaDisplay: { dx: number; dy: number; dz: number } | null;
  preciseLocationHint: { x: number; y: number; z: number } | null;
  pointerScreen: { x: number; y: number };
  moveGizmoDragLabel: { x: number; y: number; dx: number; dy: number; dz: number } | null;
  formatSignedDelta: (n: number) => string;
  showFlyHint: boolean;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
  orbitControls: OrbitControls | null | undefined;
  render: () => void;
  zoomPercent: number;
  zoomOut: () => void;
  zoomIn: () => void;
  fitToView: () => void;
  resetCamera: () => void;
};
