/**
 * Per-frame animation step for VoxelCanvas (controls, ray refinement, conditional render).
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { applyFlyMovement, FLY_MOVE_SPEED, type FlyMoveState } from '../flyControls';
import { hexToInt } from '../store/index';
import type { Voxel, VoxellePreferences } from '../store/index';
import { buildVoxelRayTraceParams } from './voxelRayShared';
import { DEFAULT_RAY_TICK_BUDGET_MS } from './voxelRayProgressive';
import { maybeSampleVoxelleRuntimeMetrics } from '../store/runtimeMetrics';
import type { VoxelRayTsl, VoxelRayTslTickContext } from './voxelRayTsl';
import type { VoxelleRenderer } from './sceneSetup';
import { isWebGPURenderer } from './rendererUtils';

export type VoxelCanvasAnimateContext = {
  nowMs: number;
  showFpsCounter: boolean;
  setFpsCounterDisplayed: (n: number) => void;
  getFpsCounterPeriodStartMs: () => number;
  setFpsCounterPeriodStartMs: (n: number) => void;
  getFpsCounterAccumFrames: () => number;
  setFpsCounterAccumFrames: (n: number) => void;
  getLastFrameTime: () => number;
  setLastFrameTime: (n: number) => void;
  flyControls: InstanceType<typeof PointerLockControls> | null;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
  flyMoveState: FlyMoveState;
  orbitControls: OrbitControls | undefined;
  getTool: () => string;
  getPendingOrbitWheelDeltaSum: () => number;
  setPendingOrbitWheelDeltaSum: (n: number) => void;
  getPendingOrbitWheelClientX: () => number;
  getPendingOrbitWheelClientY: () => number;
  orbitZoomScaleFromWheelDelta: (controls: OrbitControls, deltaY: number) => number;
  getRenderingMode: () => 'greedy' | 'marchingCubes' | 'ray';
  rayRenderer: VoxelRayTsl | null;
  container: HTMLElement;
  renderer: VoxelleRenderer;
  scene: THREE.Scene;
  dirLight: THREE.DirectionalLight;
  hemisphereLight: THREE.HemisphereLight;
  getVoxels: () => Map<string, Voxel>;
  getHiddenVoxelCount: () => number;
  getEnableSky: () => boolean;
  getBackgroundColor: () => string;
  getAmbientIntensity: () => number;
  getSceneEnvironmentIntensity: () => number;
  getEnableShadows: () => boolean;
  getDistanceTintEnabled: () => boolean;
  getDistanceTintNearColor: () => string;
  getDistanceTintMidColor: () => string;
  getDistanceTintFarColor: () => string;
  getDistanceTintNearDistance: () => number;
  getDistanceTintFarDistance: () => number;
  getDistanceTintStrength: () => number;
  getGrainEnabled: () => boolean;
  getGrainStrength: () => number;
  getGrainAnimated: () => boolean;
  getGrainSpeed: () => number;
  getGrainColorful: () => boolean;
  getSunShaftsEnabled: () => boolean;
  getSunShaftsStrength: () => number;
  getRayTraceContentDirty: () => boolean;
  setRayTraceContentDirty: (v: boolean) => void;
  getPrevRayCamInitialized: () => boolean;
  prevRayCamPos: THREE.Vector3;
  prevRayCamQuat: THREE.Quaternion;
  setRayRefinementProgress: (v: number) => void;
  isVoxelDrag: boolean;
  isStampDrag: boolean;
  selectionGizmoDragging: boolean;
  getCuboidPhase: () => 'plane' | 'depth' | null;
  getCylinderPhase: () => 'plane' | 'depth' | null;
  getPolygonPhase: () => 'placing' | null;
  getSolidPolygonPhase: () => 'placing' | 'depth' | null;
  getRoofPhase: () => 'placing' | null;
  getRopePhase: () => 'placing' | 'tension' | null;
  getClothPhase: () => 'placing' | 'tension' | null;
  getFlyControlsEnabled: () => boolean;
  /** True when mesh/grid/ray-invalidate batch ran this frame (greedy mode needs a redraw). */
  getPipelineAppliedThisFrame: () => boolean;
  /** Greedy/marching: presentation (lights, materials, prefs) changed since last draw. */
  getCanvasPresentationDirty: () => boolean;
  /** Non-ray post FX that require continuous redraw (for time animation). */
  getShouldAnimatePostFx: () => boolean;
  getVoxellePreferences: () => VoxellePreferences;
  render: () => void;
};

export function runVoxelCanvasAnimateStep(ctx: VoxelCanvasAnimateContext): void {
  const t = ctx.nowMs;

  maybeSampleVoxelleRuntimeMetrics(t, {
    renderingMode: ctx.getRenderingMode(),
    rendererPixelRatio: ctx.renderer.getPixelRatio(),
    containerWidth: ctx.container.clientWidth,
    containerHeight: ctx.container.clientHeight,
    filledVoxelCount: ctx.getVoxels().size,
    hiddenVoxelCount: ctx.getHiddenVoxelCount(),
    rayMaxBufferDim: ctx.getVoxellePreferences().rayMaxBufferDim
  });

  if (ctx.showFpsCounter) {
    let fpsCounterPeriodStartMs = ctx.getFpsCounterPeriodStartMs();
    if (!fpsCounterPeriodStartMs) {
      fpsCounterPeriodStartMs = t;
      ctx.setFpsCounterPeriodStartMs(t);
      ctx.setFpsCounterAccumFrames(0);
    }
    ctx.setFpsCounterAccumFrames(ctx.getFpsCounterAccumFrames() + 1);
    const fpsElapsed = t - fpsCounterPeriodStartMs;
    if (fpsElapsed >= 1000) {
      ctx.setFpsCounterDisplayed(Math.round((ctx.getFpsCounterAccumFrames() * 1000) / fpsElapsed));
      ctx.setFpsCounterAccumFrames(0);
      ctx.setFpsCounterPeriodStartMs(t);
    }
  } else {
    ctx.setFpsCounterPeriodStartMs(0);
  }

  const lastFt = ctx.getLastFrameTime();
  const delta = lastFt ? (t - lastFt) / 1000 : 0;
  ctx.setLastFrameTime(t);

  let controlsDirty = false;
  if (ctx.flyControls?.enabled && ctx.camera) {
    applyFlyMovement(ctx.camera, ctx.flyControls, ctx.flyMoveState, delta, {
      moveSpeed: FLY_MOVE_SPEED
    });
    controlsDirty = true;
  } else {
    controlsDirty = ctx.orbitControls?.update() ?? false;
  }

  const oc = ctx.orbitControls;
  if (
    oc &&
    ctx.getPendingOrbitWheelDeltaSum() !== 0 &&
    ctx.getTool() !== 'fly' &&
    oc.enabled &&
    oc.enableZoom
  ) {
    const dy = ctx.getPendingOrbitWheelDeltaSum();
    ctx.setPendingOrbitWheelDeltaSum(0);
    if (oc.zoomToCursor === true) {
      (
        oc as unknown as { _updateZoomParameters(x: number, y: number): void }
      )._updateZoomParameters(ctx.getPendingOrbitWheelClientX(), ctx.getPendingOrbitWheelClientY());
    }
    const scale = ctx.orbitZoomScaleFromWheelDelta(oc, dy);
    if (dy < 0) oc.dollyIn(scale);
    else if (dy > 0) oc.dollyOut(scale);
    controlsDirty = true;
  }

  if (ctx.camera && ctx.renderer && ctx.container && ctx.getRenderingMode() === 'ray') {
    ctx.camera.updateMatrixWorld(true);

    let camDirty = false;
    if (ctx.getPrevRayCamInitialized()) {
      const posMoved = ctx.prevRayCamPos.distanceToSquared(ctx.camera.position) > 1e-8;
      const rotAlign = Math.abs(ctx.prevRayCamQuat.dot(ctx.camera.quaternion));
      const rotMoved = rotAlign < 1 - 1e-6;
      camDirty = posMoved || rotMoved;
      if (camDirty) {
        ctx.prevRayCamPos.copy(ctx.camera.position);
        ctx.prevRayCamQuat.copy(ctx.camera.quaternion);
      }
    }

    const contentDirty = ctx.getRayTraceContentDirty();
    ctx.setRayTraceContentDirty(false);
    const prefs = ctx.getVoxellePreferences();
    const params = buildVoxelRayTraceParams(ctx.dirLight, ctx.hemisphereLight, {
      enableSky: ctx.getEnableSky(),
      backgroundHex: hexToInt(ctx.getBackgroundColor()),
      ambientIntensity: ctx.getAmbientIntensity(),
      sceneEnvironmentIntensity: ctx.getSceneEnvironmentIntensity(),
      enableShadows: ctx.getEnableShadows(),
      timeSeconds: performance.now() * 0.001,
      shadowRaySamples: prefs.rayShadowSamples,
      distanceTintEnabled: ctx.getDistanceTintEnabled(),
      distanceTintNearHex: hexToInt(ctx.getDistanceTintNearColor()),
      distanceTintMidHex: hexToInt(ctx.getDistanceTintMidColor()),
      distanceTintFarHex: hexToInt(ctx.getDistanceTintFarColor()),
      distanceTintNearDist: ctx.getDistanceTintNearDistance(),
      distanceTintFarDist: ctx.getDistanceTintFarDistance(),
      distanceTintStrength: ctx.getDistanceTintStrength(),
      grainEnabled: ctx.getGrainEnabled(),
      grainStrength: ctx.getGrainStrength(),
      grainAnimated: ctx.getGrainAnimated(),
      grainSpeed: ctx.getGrainSpeed(),
      grainColorful: ctx.getGrainColorful(),
      sunShaftsEnabled: ctx.getSunShaftsEnabled(),
      sunShaftsStrength: ctx.getSunShaftsStrength()
    });

    if (ctx.rayRenderer) {
      const texBefore = ctx.rayRenderer.output.beautyTexture;
      const webgpuRenderer = isWebGPURenderer(ctx.renderer)
        ? (ctx.renderer as NonNullable<VoxelRayTslTickContext['webgpuRenderer']>)
        : null;
      const tickCtx: VoxelRayTslTickContext = {
        webgpuRenderer,
        rayTraceBackend: prefs.rayTraceBackend,
        rayTickBudgetMs: prefs.rayTickBudgetMs,
        rayMaxBufferDim: prefs.rayMaxBufferDim,
        rayMaxTemporalSamples: prefs.rayMaxTemporalSamples
      };
      ctx.rayRenderer.tick(
        delta,
        ctx.container.clientWidth,
        ctx.container.clientHeight,
        ctx.renderer.getPixelRatio(),
        ctx.getVoxels(),
        params,
        contentDirty,
        camDirty,
        ctx.camera,
        prefs.rayTickBudgetMs ?? DEFAULT_RAY_TICK_BUDGET_MS,
        tickCtx
      );
      const texAfter = ctx.rayRenderer.output.beautyTexture;
      if (texBefore !== texAfter) {
        ctx.scene.background = texAfter;
      }
      ctx.setRayRefinementProgress(ctx.rayRenderer.output.refinementProgress);
    }
  } else {
    ctx.setRayRefinementProgress(0);
  }

  const mode = ctx.getRenderingMode();
  const hasActiveInteraction =
    ctx.isVoxelDrag ||
    ctx.isStampDrag ||
    ctx.selectionGizmoDragging ||
    ctx.getCuboidPhase() !== null ||
    ctx.getCylinderPhase() !== null ||
    ctx.getPolygonPhase() !== null ||
    ctx.getSolidPolygonPhase() !== null ||
    ctx.getRoofPhase() !== null ||
    ctx.getRopePhase() !== null ||
    ctx.getClothPhase() !== null;
  if (
    mode === 'ray' ||
    controlsDirty ||
    hasActiveInteraction ||
    ctx.getFlyControlsEnabled() ||
    ctx.getPipelineAppliedThisFrame() ||
    ctx.getCanvasPresentationDirty() ||
    ctx.getShouldAnimatePostFx()
  ) {
    ctx.render();
  }
}
