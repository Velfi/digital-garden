<script lang="ts">
  import { browser } from '$app/environment';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
  import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
  import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
  import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
  import { onMount, onDestroy } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { get } from 'svelte/store';
  import {
    voxels,
    gridSize,
    showGrid,
    renderingMode,
    activeRendererIsWebGPU,
    tool,
    toolBeforeEyedropper,
    color,
    selectedColors,
    strokeMode,
    effectiveStrokeMode,
    lineAxisAlign,
    planeAxis,
    planeCuboidHollow,
    PLANE_CUBOID_HOLLOW_WALL_MAX,
    planeCuboidHollowWallThickness,
    clayMode,
    clayBrushRadius,
    bulkBrushShape,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    ropeTension,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    airbrushBrushShape,
    airbrushRadius,
    airbrushScatter,
    airbrushRadiusRange,
    airbrushRadiusMin,
    airbrushRadiusMax,
    sprayDirection,
    sprayStreakLength,
    wallWidth,
    wallHeight,
    wallLockStartHeight,
    wallAxisAlign,
    drawBrushShape,
    drawBrushSize,
    drawBrushSnapToSurface,
    selection,
    lightAngle,
    lightElevation,
    lightColor,
    ambientIntensity,
    sunlightIntensity,
    sceneEnvironmentIntensity,
    enableShadows,
    aoStrength,
    backgroundColor,
    enableSky,
    focalLength,
    orthographic,
    voxelMaterial,
    sameVoxelColor,
    updateVoxelsInStroke,
    runVoxelStroke,
    applySelectionTranslationAlongAxis,
    applySelectionRotationInStroke,
    selectionGizmoMode,
    commitUndoAfter,
    initCanvas,
    loadFromStorageAsync,
    loadFromBytes,
    saveToStorage,
    coordKey,
    parseCoordKey,
    hexToInt,
    intToHex,
    getPaintColorResolver,
    getStampOffsetForFace,
    ensureGridFitsPositions,
    resizeGridToContent,
    stampRotation,
    stampOriginMode,
    punchDepth,
    getBoundsFromPositions,
    getVoxelBounds,
    getSelectionCenter,
    bookStampPattern,
    selectionMode,
    type SelectionMode,
    mergeSelection,
    commitSelectionMergeEdit,
    fillSelectDiagonals,
    fillRespectsColor,
    constrainToPlaneEnabled,
    constrainToPlaneRef,
    polygonOffsetFromNormal,
    FILL_UNCONSTRAINED_LARGE_THRESHOLD,
    getFillSelectionAtAsync,
    getFillEmptyAt,
    getFillEmptyAtAsync,
    type FillPlaneSampleContext,
    getCoplanarFacesSelectionAt,
    getCoplanarEmptySelectionAt,
    getShapePositionsAt,
    clampQuarterTurn,
    addPanelStore,
    buildPastePlacementVoxelMap,
    clipboardEntryToVoxel,
    MAX_GRID_SIZE,
    defaultAddShapePlacementAnchor,
    symmetryX,
    symmetryY,
    symmetryZ,
    rockSize,
    rockRoughness,
    rockCount,
    rockClusterRadius,
    rockSinkDirection,
    rockSinkAmount,
    ashlarSize,
    ashlarRoughness,
    ashlarThickness,
    grassRadius,
    grassDensity,
    grassHeight,
    getFloraPositions,
    piscinaLength,
    piscinaWidth,
    piscinaThickness,
    piscinaFinDorsal,
    piscinaFinAnal,
    piscinaFinCaudal,
    piscinaFinPectoral,
    piscinaFinPelvic,
    piscinaFinAdipose,
    piscinaShowFinDorsal,
    piscinaShowFinAnal,
    piscinaShowFinCaudal,
    piscinaShowFinPectoral,
    piscinaShowFinPelvic,
    piscinaShowFinAdipose,
    piscinaAnchorOffsetU,
    piscinaAnchorOffsetV,
    piscinaSpecies,
    piscinaSpineBend,
    piscinaSpineSCurve,
    piscinaFinDorsalPitch,
    piscinaFinDorsalSweep,
    piscinaFinAnalPitch,
    piscinaFinDorsalMode,
    piscinaFinAnalMode,
    piscinaFinCaudalMode,
    piscinaFinPectoralMode,
    piscinaFinPelvicMode,
    piscinaFinAdiposeMode,
    piscinaFinDorsalLength,
    piscinaFinAnalLength,
    piscinaFinDorsalPosition,
    piscinaFinCaudalSpread,
    piscinaFinPectoralCant,
    piscinaFinPectoralSweep,
    getPiscinaPositions,
    roofStyle,
    roofHeight,
    roofThickness,
    roofShedEdgeIndex,
    roofGableOrientation,
    roofBreakRatio,
    roofWallHeight,
    roofParapetHeight,
    roofSaltSkew,
    roofWindingFlipTick,
    roofHollow,
    type Tool,
    type FaceNormal,
    voxellePreferences,
    type Voxel
  } from './store/index';
  import { getRockPositions, getAshlarPositions } from './store/generators/rock';
  import {
    VOXELLE_MESH_MATERIAL_USERDATA_KEY,
    voxelMaterialBaseEnvMapIntensity
  } from './voxelMaterial';
  import { getGrassPositions } from './store/generators/grass';
  import { generateRoofVoxels } from './store/generators/roof';
  import {
    inBounds,
    expandPositionsWithSymmetry,
    expandPositionsWithSymmetryAroundCenter,
    type SelectionBounds,
    type SymmetryAxes
  } from './coordUtils';
  import {
    getAxisAlignedLine,
    getAxisAlignedPlaneFromNormal,
    getAxisAlignedCircleFromNormal,
    getAxisAlignedCuboid,
    getPolygonVoxels,
    getBresenham3DLine,
    getRayDirectionPath,
    projectPointOntoPlane,
    thickenPathForStroke,
    getRopeCurveVoxels,
    applyBrushAlongPath,
    getSprayDirectionVector,
    type PathThickenParams
  } from './strokeGeometry';
  import {
    PREVIEW_BBOX_VOXEL_THRESHOLD,
    planeStrokeBounds,
    cuboidStrokeBounds,
    cuboidSolidVoxelCount,
    lineStrokeBounds,
    inflateStrokePreviewBoundsForDrawBrush,
    expandStrokePreviewBoundsOriginMirror,
    expandStrokePreviewBoundsAroundCenter
  } from './strokePreviewBounds';
  import {
    FLY_POINTER_SPEED,
    createFlyMoveState,
    createFlyKeyHandlers,
    resetFlyMoveState
  } from './flyControls';
  import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
  import { Sky } from 'three/addons/objects/Sky.js';
  import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
  import {
    buildGreedyMesh,
    buildPreviewGeometry,
    buildPreviewGeometryFromVoxelMap,
    PREVIEW_MESH_OPTIONS
  } from './greedyMesh';
  import {
    createSceneSetupAsync,
    POLYGON_POINTS_MAX,
    type VoxelleRenderer
  } from './canvas/sceneSetup';
  import { createMeshManager, syncGlassShadowUniformsFromBuckets } from './canvas/meshManager';
  import { VoxelRayTsl } from './canvas/voxelRayTsl';
  import { isWebGLRenderer, isWebGPURenderer } from './canvas/rendererUtils';
  import { createWebGPUBloomPipeline, type WebGPUBloomPipeline } from './canvas/webgpuBloom';
  import {
    applyAddShapeOccludedPreviewTint,
    assignSharedDualPreviewGeometry
  } from './canvas/previewMeshUtils';
  import {
    alignPreviewMeshToLod,
    computePreviewLodStride,
    createPreviewRefinementScheduler,
    downsamplePositionsToPreviewMap,
    resetPreviewMeshTransform
  } from './previewMeshLod';
  import { toneMappingPreferenceToThree } from './toneMappingPreference';
  import { createSelectionGizmoController } from './canvas/selectionGizmo';
  import { handleFlyPointerUp } from './canvas/handlers/pointerHandler';
  import { runPointerDownPrelude, runPointerMovePrelude } from './canvas/pointerOrchestrator';
  import { isSegmentedStrokeGestureActive } from './canvas/toolPhaseState';
  import { applyGeneratorFaceClickPointerUp } from './canvas/handlers/generatorPointer';
  import {
    buildVoxelGeneratorPrimaryPointerUpDeps,
    buildVoxelGeneratorRmbDeps,
    type VoxelGeneratorPrimaryPointerUpBridge,
    type VoxelGeneratorRmbBridge
  } from './canvas/handlers/voxelPointerCore';
  import {
    createPreciseGuidePlaneInScene,
    loadVoxelCanvasBootstrapModel,
    PRECISE_GUIDE_TEX_SIZE
  } from './canvas/voxelCanvasInit';
  import { isGeneratorFaceClickTool } from './store/generators/registry';
  import { shouldEnableOrbitControls } from './store/interactionMode';
  import {
    getRaycastTargetsFrom,
    getIntersectionFrom,
    axisVector,
    getDominantAxisOfNormal,
    getFaceNormalFromHit as raycastFaceNormalFromHit,
    getIntersectionWithLockedPlane as raycastIntersectionWithLockedPlane,
    getIntersectionWithPlane as raycastIntersectionWithPlane,
    getEffectivePlaneNormal as raycastEffectivePlaneNormal,
    getCameraPlaneNormal as raycastCameraPlaneNormal,
    getAddPositionFromHit,
    getVoxelPositionFromHit,
    getStrokeStartFromHit as raycastStrokeStartFromHit
  } from './canvas/voxelCanvasRaycast';
  import {
    updateDirLightPosition as lightingUpdateDirLightPosition,
    updateSkyLightingColors as lightingUpdateSkyLightingColors,
    updateShadowCamera as lightingUpdateShadowCamera,
    invalidateDirectionalShadowMap as lightingInvalidateDirectionalShadowMap
  } from './canvas/voxelCanvasLighting';
  import { renderVoxelCanvasPrimaryScene } from './canvas/voxelCanvasBloomRender';
  import { runVoxelCanvasAnimateStep } from './canvas/voxelCanvasAnimate';
  import {
    createVoxelCanvasStrokeCommit,
    defaultPlayPlaceSound,
    getAshlarThicknessAxis,
    nextRockClusterRng,
    buildFloraOptionsFromStores,
    buildPiscinaOptionsFromStores
  } from './canvas/voxelCanvasStrokeCommit';
  import VoxelCanvasOverlays from './VoxelCanvasOverlays.svelte';

  let fillBusy = $state(false);
  let fillVisited = $state(0);
  let fillMatched = $state(0);
  let fillMessage = $state<string>('Exploring fill region…');
  let fillAbortController: AbortController | null = null;

  function cancelActiveFill(): void {
    fillAbortController?.abort();
  }

  function formatSignedDelta(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }

  function clampPlaneCuboidHollowWallThickness(): number {
    const raw = Math.floor(get(planeCuboidHollowWallThickness));
    return Math.min(PLANE_CUBOID_HOLLOW_WALL_MAX, Math.max(1, raw));
  }

  /** Voxel tool + fill only: capped probe when plane unconstrained; full flood is async/cancellable. */
  async function resolveFillEmptyForUnconstrainedPlaneAsync(
    x: number,
    y: number,
    z: number,
    diagonals: boolean,
    planeCtx: FillPlaneSampleContext,
    signal: AbortSignal
  ): Promise<Set<string> | null> {
    if (get(constrainToPlaneEnabled)) {
      const full = await getFillEmptyAtAsync(x, y, z, diagonals, {
        planeCtx,
        signal,
        onProgress: (p) => {
          fillVisited = p.visited;
          fillMatched = p.matched;
        }
      });
      if (full.cancelled) return null;
      return full.region;
    }
    const probe = getFillEmptyAt(x, y, z, diagonals, FILL_UNCONSTRAINED_LARGE_THRESHOLD, planeCtx);
    if (probe.truncated) {
      fillMessage = `Large fill detected. Exploring full region…`;
    }
    const full = await getFillEmptyAtAsync(x, y, z, diagonals, {
      planeCtx,
      signal,
      onProgress: (p) => {
        fillVisited = p.visited;
        fillMatched = p.matched;
      }
    });
    if (full.cancelled) return null;
    return full.region;
  }

  function fillPlaneContextFromHit(hit: THREE.Intersection | null): FillPlaneSampleContext {
    const faceNormal = hit ? getFaceNormalFromHit(hit) : null;
    let cameraForward: { x: number; y: number; z: number } | null = null;
    if (camera) {
      const v = new THREE.Vector3();
      camera.getWorldDirection(v);
      cameraForward = { x: v.x, y: v.y, z: v.z };
    }
    return { faceNormal, cameraForward };
  }

  function airbrushPlaneParamsForFaceNormal(
    faceForAuto: THREE.Vector3 | null | undefined
  ): Pick<
    PathThickenParams,
    'airbrushConstrainToPlane' | 'airbrushPlaneAxis' | 'airbrushPlaneNormal'
  > {
    const enabled = get(constrainToPlaneEnabled);
    if (!enabled) {
      return {
        airbrushConstrainToPlane: false,
        airbrushPlaneAxis: undefined,
        airbrushPlaneNormal: undefined
      };
    }
    const ref = get(constrainToPlaneRef);
    if (ref === 'camera') {
      return {
        airbrushConstrainToPlane: true,
        airbrushPlaneAxis: undefined,
        airbrushPlaneNormal: getCameraPlaneNormal()
      };
    }
    if (ref === 'auto') {
      const n = faceForAuto ?? dragFaceNormal;
      return {
        airbrushConstrainToPlane: true,
        airbrushPlaneAxis: n ? getDominantAxisOfNormal(n) : undefined,
        airbrushPlaneNormal: undefined
      };
    }
    return {
      airbrushConstrainToPlane: true,
      airbrushPlaneAxis: ref,
      airbrushPlaneNormal: undefined
    };
  }

  function airbrushPlaneParamsForStroke(): Pick<
    PathThickenParams,
    'airbrushConstrainToPlane' | 'airbrushPlaneAxis' | 'airbrushPlaneNormal'
  > {
    return airbrushPlaneParamsForFaceNormal(dragFaceNormal);
  }

  function getAirbrushConstrainPlaneNormalWorld(): THREE.Vector3 | null {
    if (!get(constrainToPlaneEnabled)) return null;
    const ref = get(constrainToPlaneRef);
    if (ref === 'camera' && camera) {
      const v = new THREE.Vector3();
      camera.getWorldDirection(v);
      return v;
    }
    if (ref === 'auto') {
      if (dragFaceNormal) return dragFaceNormal.clone();
      return null;
    }
    if (ref === 0 || ref === 1 || ref === 2) return axisVector(ref);
    return null;
  }

  function getAirbrushHoverConstrainPlaneNormal(hit: THREE.Intersection): THREE.Vector3 | null {
    if (!get(constrainToPlaneEnabled)) return null;
    const ref = get(constrainToPlaneRef);
    if (ref === 'camera' && camera) {
      const v = new THREE.Vector3();
      camera.getWorldDirection(v);
      return v;
    }
    if (ref === 'auto') {
      const fn = getFaceNormalFromHit(hit);
      return fn ? new THREE.Vector3(fn[0], fn[1], fn[2]) : null;
    }
    if (ref === 0 || ref === 1 || ref === 2) return axisVector(ref);
    return null;
  }

  let container: HTMLDivElement;
  let containerResizeObserver: ResizeObserver | null = null;
  let gizmoRef = $state<{ draw: () => void } | undefined>(undefined);
  let camera = $state<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  let perspectiveCamera: THREE.PerspectiveCamera;
  let orthographicCamera: THREE.OrthographicCamera;
  let scene: THREE.Scene;
  let renderer: VoxelleRenderer;
  /** Matches last `createSceneSetupAsync`. */
  let canvasIsWebGPU = false;
  /** WebGPU: TSL `RenderPipeline` + bloom; null if init failed. */
  let webgpuBloomPipeline: WebGPUBloomPipeline | null = null;
  /** Selective glow bloom (glow voxels only); null if init failed. */
  let bloomComposer: EffectComposer | null = null;
  let finalComposer: EffectComposer | null = null;
  let sharedSceneRenderPass: RenderPass | null = null;
  let unrealBloomPass: UnrealBloomPass | null = null;
  let bloomMixPass: ShaderPass | null = null;
  let bloomOutputPass: OutputPass | null = null;
  let bloomDarkMaterial: THREE.MeshBasicMaterial | null = null;
  /** Solid scene.background is not a mesh, so bloom pass must clear it to black or the whole RT blooms. */
  let bloomPassBackground: THREE.Color | null = null;
  /** Track glow buckets so selective bloom passes can be skipped when empty. */
  let sceneHasGlowMesh = false;
  const bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]> = {};

  let orbitControls = $state<OrbitControls>();
  let flyControls: InstanceType<typeof PointerLockControls> | null = null;
  let lastFrameTime = 0;
  let raycaster: THREE.Raycaster;
  let pointer: THREE.Vector2;
  let voxelGroup: THREE.Group;
  /** Synthetic object for DDA pick hits in ray rendering mode (face.normal used by tools). */
  let rayPickProxy: THREE.Object3D | null = null;
  let rayRenderer: VoxelRayTsl | null = null;
  /** Baseline pose for ray progressive resets — must not use raw matrixWorld element diffs (OrbitControls damping changes them every frame). */
  const prevRayCamPos = new THREE.Vector3();
  const prevRayCamQuat = new THREE.Quaternion();
  let prevRayCamInitialized = false;
  let rayTraceContentDirty = true;
  let rollOverMesh: THREE.Mesh;
  let rollOverMaterial: THREE.MeshBasicMaterial;
  let dirLight: THREE.DirectionalLight;
  let hemisphereLight: THREE.HemisphereLight;
  let sky: InstanceType<typeof Sky> | THREE.Mesh | null = null;
  let groundPlane: THREE.Mesh | null = null;
  let boxGeometry: THREE.BoxGeometry;
  let meshManager: ReturnType<typeof createMeshManager> | null = null;
  let animationFrameId: number;
  let fpsCounterDisplayed = $state(0);
  let fpsCounterAccumFrames = 0;
  let fpsCounterPeriodStartMs = 0;
  /** CPU progressive ray refinement 0..1; hidden at 1. WebGPU one-shot path uses 1 (bar not shown). */
  let rayRefinementProgress = $state(0);
  let isVoxelDrag = false;
  /** Selection mode for the current drag (set at pointer down when select tool); used so shift-drag extends selection. */
  let selectionModeForCurrentGesture: SelectionMode | null = null;
  let isStampDrag = false;
  /** Which tool started the current stamp-like drag (stamp vs punch); used on pointerup. */
  let stampLikeDragMode: 'stamp' | 'punch' | null = null;
  let lastStampPlace: [number, number, number] | null = null;
  let lastStampNormal: FaceNormal | null = null;
  /** During stamp/punch drag: re-raycast each frame so preview follows cursor across surfaces */
  let dragStartPos: [number, number, number] | null = null;
  let dragFaceNormal: THREE.Vector3 | null = null; // plane stays aligned to initial face
  /** Alt+scroll during plane drag: overrides plane axis (0=X, 1=Y, 2=Z). */
  let dragPlaneAxisOverride = $state<0 | 1 | 2 | null>(null);
  let dragPointerId: number | null = null;
  let pendingStrokePositions: [number, number, number][] = [];
  /** Shift-held plane symmetry mirror center, captured from stroke start voxel. */
  let shiftPlaneSymmetryCenter: [number, number, number] | null = null;
  /** True while Shift is held for an active plane stroke that supports centered symmetry. */
  let shiftPlaneSymmetryActive = false;
  /** Per-stroke seed for deterministic scatter (preview and apply match). */
  let currentStrokeSeed = 0;
  /** Next rock placement seed (preview and apply match). */
  let nextRockPlacementSeed = $state(0);
  /** Next grass placement seed (preview and apply match). */
  let nextGrassPlacementSeed = $state(0);
  /** Next flora placement seed (preview and apply match). */
  let nextFloraPlacementSeed = $state(0);
  /** Next piscina placement seed (preview and apply match). */
  let nextPiscinaPlacementSeed = $state(0);
  /** Next ashlar placement seed (preview and apply match). */
  let nextAshlarPlacementSeed = $state(0);
  /** Clay bulk: last sampled position for path accumulation */
  let lastBulkPos: [number, number, number] | null = null;
  /** Branch: pointer down position for view-plane direction and length */
  let branchPointerDownX = 0;
  let branchPointerDownY = 0;

  /** Only show spinner after build has taken >2s */
  let showGreedyMeshSpinner = $state(false);

  // Cuboid two-phase: first drag = plane, then scroll/drag = depth
  let cuboidPhase = $state<'plane' | 'depth' | null>(null);
  let cuboidPlane: {
    a: [number, number, number];
    b: [number, number, number];
    normal: THREE.Vector3;
  } | null = null;
  let cuboidDepth = $state(1); // voxel layers; pointer drag or slider to adjust
  let depthAdjustPointerId: number | null = null;
  let lastDepthPhaseClientY = 0;
  let depthPhaseAccumulator = 0; // fractional pixels, accumulate to avoid jerky rounding
  // Precise two-phase: click voxel face to lock plane, then click/drag on that plane to place.
  let precisePhase = $state<'idle' | 'armed' | 'placing'>('idle');
  let preciseAnchor: [number, number, number] | null = null;
  let preciseNormal: THREE.Vector3 | null = null;

  // Polygon: click to place points, Done to fill convex hull
  let polygonPoints = $state<[number, number, number][]>([]);
  let polygonPhase = $state<'placing' | null>(null);
  let polygonLineSegments: THREE.LineSegments | null = null;
  let polygonLineMaterial: THREE.LineBasicMaterial | null = null;
  let polygonPointsMesh: THREE.InstancedMesh | null = null;
  let polygonPointsMaterial: THREE.MeshBasicMaterial | null = null;
  /** Face normal from the latest polygon anchor click; used with polygon offset along that axis. */
  let polygonPlacementNormal = $state<FaceNormal | null>(null);

  /** Roof generator: corner loop (reuse polygon point mesh / line preview). */
  let roofPoints = $state<[number, number, number][]>([]);
  let roofPhase = $state<'placing' | null>(null);
  let roofPlacementNormal = $state<FaceNormal | null>(null);
  /** Last seen `roofWindingFlipTick` so UI flips only bump the counter. */
  let prevRoofWindingFlipTick = -1;

  // Rope: two-point + tension flow
  let ropePointA = $state<[number, number, number] | null>(null);
  let ropePointB = $state<[number, number, number] | null>(null);
  let ropePhase = $state<'placing' | 'tension' | null>(null);
  let ropePointsMesh: THREE.InstancedMesh | null = null;
  let ropePointsMaterial: THREE.MeshBasicMaterial | null = null;
  let previewMesh: THREE.Mesh | null = null;
  let previewMaterial: THREE.MeshBasicMaterial | null = null;
  let preciseGuidePlaneMesh: THREE.Mesh | null = null;
  let preciseGuidePlaneMaterial: THREE.MeshBasicMaterial | null = null;
  let preciseGuidePlaneTexture: THREE.CanvasTexture | null = null;
  let preciseGuidePlaneCtx: CanvasRenderingContext2D | null = null;
  let preciseGuidePlaneSize = 192;
  let addPreviewMesh: THREE.Mesh | null = null;
  let addPreviewMaterial: THREE.MeshBasicMaterial | null = null;
  let addPreviewOccludedMesh: THREE.Mesh | null = null;
  let addPreviewOccludedMaterial: THREE.MeshBasicMaterial | null = null;
  const addPanelRefinementScheduler = createPreviewRefinementScheduler();

  let selectionGroup: THREE.Group | null = null;

  let moveGizmoGroup: THREE.Group | null = null;
  let rotateGizmoGroup: THREE.Group | null = null;
  let moveDragLine: THREE.LineSegments | null = null;
  let selectionGizmo: ReturnType<typeof createSelectionGizmoController> | null = null;
  /** `pick` = choose face; `shape` = locked anchor, slider-driven preview, Place fish to commit. */
  let piscinaPhase = $state<'pick' | 'shape'>('pick');
  let piscinaLockedPlace = $state<[number, number, number] | null>(null);
  let piscinaLockedNormal = $state<FaceNormal | null>(null);
  let piscinaHoverPlace = $state<[number, number, number] | null>(null);
  let piscinaHoverNormal = $state<FaceNormal | null>(null);

  let gridGroup: THREE.Group | null = null;
  let gridLineMaterial: InstanceType<typeof LineMaterial> | THREE.LineBasicMaterial | null = null;
  let envMap: THREE.CubeTexture | null = null;

  let zoomPercent = $state(100);
  /** Perspective zoom % uses model extent; cache because orbit `change` runs every frame while damping. */
  let zoomPercentBaseDistCache: {
    voxelsRef: Map<string, Voxel>;
    gridSize: number;
    baseDist: number;
  } | null = null;
  /** For Add panel open/close transitions (tool preview hide / restore). */
  let wasAddShapePanelOpen = false;
  let deltaDisplay = $state<{ dx: number; dy: number; dz: number } | null>(null);
  /** Integer voxel under cursor on the precise plane (snapped grid from raycast). */
  let preciseLocationHint = $state<{ x: number; y: number; z: number } | null>(null);
  /** Move gizmo: Δx,Δy,Δz label at projected original selection centroid (screen px in container). */
  let moveGizmoDragLabel = $state<{
    dx: number;
    dy: number;
    dz: number;
    x: number;
    y: number;
  } | null>(null);
  let pointerScreen = $state({ x: 0, y: 0 });
  const ZOOM_FACTOR_IN = 1 / 1.2;
  const ZOOM_FACTOR_OUT = 1.2;
  const MIN_DISTANCE = 5;
  const MAX_DISTANCE = 50000;
  /** three@0.183 OrbitControls internal _STATE.NONE — wheel zoom only applies in this state. */
  const ORBIT_INTERNAL_STATE_NONE = -1;
  let pendingOrbitWheelDeltaSum = 0;
  let pendingOrbitWheelClientX = 0;
  let pendingOrbitWheelClientY = 0;

  // 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength)
  function focalLengthToFov(mm: number): number {
    return (2 * Math.atan(12 / mm) * 180) / Math.PI;
  }

  /** Matches OrbitControls._customWheelEvent deltaY scaling. */
  function orbitWheelNormalizedDeltaY(event: WheelEvent): number {
    let dy = event.deltaY;
    switch (event.deltaMode) {
      case 1:
        dy *= 16;
        break;
      case 2:
        dy *= 100;
        break;
      default:
        break;
    }
    if (event.ctrlKey) {
      dy *= 10;
    }
    return dy;
  }

  /** Same base as OrbitControls._getZoomScale (three/examples OrbitControls.js). */
  function orbitZoomScaleFromWheelDelta(controls: OrbitControls, deltaY: number): number {
    const normalizedDelta = Math.abs(deltaY * 0.01);
    return Math.pow(0.95, controls.zoomSpeed * normalizedDelta);
  }

  const pointerHelper = new THREE.Vector3();
  const axisNormalHelper = new THREE.Vector3();
  const precisePlaneNormalBasis = new THREE.Vector3(0, 0, 1);
  const precisePlaneNormalTarget = new THREE.Vector3();
  const precisePlaneLightOffset = new THREE.Vector3();
  const preciseGuideLightUv = new THREE.Vector2(0.5, 0.5);
  const preciseGuideLocalScratch = new THREE.Vector3();
  const preciseGuideInvQuatScratch = new THREE.Quaternion();
  /** Plane local +X / +Y in world space — grid lines run parallel to these (see redrawPreciseGuideTexture). */
  const preciseGuideTanLocalXWorld = new THREE.Vector3();
  const preciseGuideTanLocalYWorld = new THREE.Vector3();
  const preciseWorkPlanePointScratch = new THREE.Vector3();

  /** Center of the clicked voxel face (matches greedy mesh [k−0.5,k+0.5] voxels). Not anchor+(½,½,½). */
  function setPreciseWorkPlanePoint(
    anchor: [number, number, number],
    normal: THREE.Vector3,
    out: THREE.Vector3
  ): THREE.Vector3 {
    return out.set(
      anchor[0] + 0.5 * normal.x,
      anchor[1] + 0.5 * normal.y,
      anchor[2] + 0.5 * normal.z
    );
  }
  const centroidToCameraScratch = new THREE.Vector3();
  const fitHelperBox = new THREE.Box3();
  const fitHelperCenter = new THREE.Vector3();
  const fitHelperPoint = new THREE.Vector3();
  const fitCameraRight = new THREE.Vector3();
  const fitCameraUp = new THREE.Vector3();
  const fitCameraForward = new THREE.Vector3();
  const fitCameraDir = new THREE.Vector3();
  const fitRelative = new THREE.Vector3();
  const fitCorners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  const VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT = 'voxelle:fit-camera-on-project-open';
  const onProjectOpenFitCamera = () => {
    fitToView();
  };
  const flyMoveState = createFlyMoveState();
  const { onKeyDown: onFlyKeyDown, onKeyUp: onFlyKeyUp } = createFlyKeyHandlers(flyMoveState, {
    isEnabled: () => !!flyControls?.enabled
  });

  const FLY_HINT_HIDE_MS = 4000;
  let showFlyHint = $state(true);
  let flyHintHideTimeout: ReturnType<typeof setTimeout> | null = null;
  function pokeFlyHint() {
    showFlyHint = true;
    if (flyHintHideTimeout != null) clearTimeout(flyHintHideTimeout);
    flyHintHideTimeout = setTimeout(() => {
      showFlyHint = false;
      flyHintHideTimeout = null;
    }, FLY_HINT_HIDE_MS);
  }
  function onFlyPointerMove() {
    if (flyControls?.enabled) pokeFlyHint();
  }
  function onPointerLockChange() {
    if (document.pointerLockElement === container) pokeFlyHint();
  }
  function handleFlyKeyDown(e: KeyboardEvent) {
    pokeFlyHint();
    onFlyKeyDown(e);
  }
  function handleFlyKeyUp(e: KeyboardEvent) {
    pokeFlyHint();
    onFlyKeyUp(e);
  }
  const worldQuaternion = new THREE.Quaternion();

  function rebuildSelectionOverlay(sel: Map<string, Voxel>) {
    meshManager?.rebuildSelectionOverlay(sel);
  }

  /** Stamp/punch footprint: book-loaded pattern wins over edit selection. */
  function getEffectiveStampPatternMap(): Map<string, Voxel> {
    const book = get(bookStampPattern);
    if (book !== null && book.size > 0) return book;
    return get(selection);
  }

  function hasStampLikePattern(): boolean {
    const book = get(bookStampPattern);
    if (book !== null && book.size > 0) return true;
    return get(selection).size > 0;
  }

  function getFaceNormalFromHit(hit: THREE.Intersection): FaceNormal | null {
    return raycastFaceNormalFromHit(hit, worldQuaternion);
  }

  function getRaycastTargets(): THREE.Object3D[] {
    return getRaycastTargetsFrom({
      meshManager,
      polygonPhase,
      roofPhase,
      polygonPointsMesh,
      ropePhase,
      ropePointsMesh
    });
  }

  function syncVoxelMaterialEnvMaps() {
    if (!scene || !meshManager) return;
    const env = scene.environment ?? null;
    const factor = get(sceneEnvironmentIntensity);
    const byBucket = meshManager.getMeshesByBucket();
    for (const { mesh } of byBucket.values()) {
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      mat.envMap = env;
      const matId = mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY];
      if (matId) {
        mat.envMapIntensity = voxelMaterialBaseEnvMapIntensity(matId) * factor;
      }
      mat.needsUpdate = true;
    }
  }

  function getIntersection(): THREE.Intersection | null {
    return getIntersectionFrom({
      camera: camera ?? null,
      raycaster,
      pointer,
      renderingMode: get(renderingMode),
      voxels: get(voxels),
      rayPickProxy,
      getTargets: getRaycastTargets
    });
  }

  /** Intersect the current raycaster ray with the axis-aligned plane at lockedValue. Used when Lock start height is on and cursor is in empty space. */
  function getIntersectionWithLockedPlane(
    axis: 0 | 1 | 2,
    lockedValue: number
  ): [number, number, number] | null {
    if (!camera || !raycaster) return null;
    raycaster.setFromCamera(pointer, camera);
    return raycastIntersectionWithLockedPlane(raycaster, axis, lockedValue);
  }

  /** Intersect the current raycaster ray with a plane through planePoint with the given normal. Used for airbrush constrain-to-plane in empty space. */
  function getIntersectionWithPlane(
    planePoint: THREE.Vector3,
    normal: THREE.Vector3
  ): [number, number, number] | null {
    if (!camera || !raycaster) return null;
    raycaster.setFromCamera(pointer, camera);
    return raycastIntersectionWithPlane(raycaster, planePoint, normal);
  }

  /** Effective plane normal: Alt+scroll override, or sidebar planeAxis, or face normal. */
  function getEffectivePlaneNormal(): THREE.Vector3 | null {
    return raycastEffectivePlaneNormal(dragFaceNormal, dragPlaneAxisOverride, get(planeAxis));
  }

  /** Camera look direction (view plane normal) for airbrush constrain to camera plane. */
  function getCameraPlaneNormal(): { x: number; y: number; z: number } | undefined {
    return raycastCameraPlaneNormal(camera ?? null);
  }

  function buildGrid(sz: number, v: Map<string, Voxel>) {
    meshManager?.buildGrid(sz, v);
  }

  function getCameraDistance(): number {
    if (!camera || !orbitControls) return 100;
    return camera.position.distanceTo(orbitControls.target);
  }

  function setCameraDistance(distance: number) {
    if (!camera || !orbitControls) return;
    const d = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
    const dir = new THREE.Vector3().subVectors(camera.position, orbitControls.target).normalize();
    camera.position.copy(orbitControls.target).add(dir.multiplyScalar(d));
    updateZoomPercent();
  }

  function perspectiveZoomBaseDist(): number {
    const v = get(voxels);
    const gsz = get(gridSize);
    const c = zoomPercentBaseDistCache;
    if (c && c.voxelsRef === v) {
      if (v.size > 0) return c.baseDist;
      if (c.gridSize === gsz) return c.baseDist;
    }
    let baseDist: number;
    if (v.size === 0) {
      baseDist = gsz * 2.5;
    } else {
      const b = getVoxelBounds(v);
      baseDist = b
        ? Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) * 1.5 + 10
        : gsz * 2.5;
    }
    zoomPercentBaseDistCache = { voxelsRef: v, gridSize: gsz, baseDist };
    return baseDist;
  }

  function updateZoomPercent() {
    if (!camera || !orbitControls) return;
    if (camera instanceof THREE.OrthographicCamera) {
      zoomPercent = Math.round(camera.zoom * 100);
    } else {
      const dist = getCameraDistance();
      const baseDist = perspectiveZoomBaseDist();
      zoomPercent = Math.round((baseDist / dist) * 100);
    }
  }

  function zoomIn() {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom /= ZOOM_FACTOR_IN;
      camera.updateProjectionMatrix();
    } else {
      setCameraDistance(getCameraDistance() * ZOOM_FACTOR_IN);
    }
    updateZoomPercent();
    render();
  }

  function zoomOut() {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom *= ZOOM_FACTOR_OUT;
      camera.updateProjectionMatrix();
    } else {
      setCameraDistance(getCameraDistance() * ZOOM_FACTOR_OUT);
    }
    updateZoomPercent();
    render();
  }

  function resetCamera() {
    if (!camera || !orbitControls) return;
    const v = $voxels;
    const b =
      v.size > 0 ? getBoundsFromPositions([...v.keys()].map((k) => parseCoordKey(k))) : null;
    const center = b
      ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2]
      : [0, 0, 0];
    const extent = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) + 2 : 64;
    const dist = extent * 2.5;
    orbitControls.target.set(center[0], center[1], center[2]);
    camera.position.set(center[0] + dist * 0.6, center[1] + dist * 0.8, center[2] + dist);
    camera.lookAt(center[0], center[1], center[2]);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      updateOrthoFrustum();
    }
    updateZoomPercent();
    render();
  }

  function fitToView() {
    if (!camera || !orbitControls || !container) return;
    resizeGridToContent();
    const v = $voxels;
    const emptyBoxSize = 64;
    if (v.size === 0) {
      fitHelperBox.setFromCenterAndSize(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(emptyBoxSize, emptyBoxSize, emptyBoxSize)
      );
    } else {
      fitHelperBox.makeEmpty();
      for (const key of v.keys()) {
        const [x, y, z] = parseCoordKey(key);
        fitHelperPoint.set(x, y, z);
        fitHelperBox.expandByPoint(fitHelperPoint);
        fitHelperPoint.set(x + 1, y + 1, z + 1);
        fitHelperBox.expandByPoint(fitHelperPoint);
      }
    }

    fitHelperBox.getCenter(fitHelperCenter);
    orbitControls.target.copy(fitHelperCenter);

    fitCameraDir.subVectors(camera.position, fitHelperCenter);
    if (fitCameraDir.lengthSq() < 1e-8) {
      fitCameraDir.set(0.6, 0.8, 1).normalize();
    } else {
      fitCameraDir.normalize();
    }

    fitCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    fitCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    fitCameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    const { min, max } = fitHelperBox;
    fitCorners[0].set(min.x, min.y, min.z);
    fitCorners[1].set(min.x, min.y, max.z);
    fitCorners[2].set(min.x, max.y, min.z);
    fitCorners[3].set(min.x, max.y, max.z);
    fitCorners[4].set(max.x, min.y, min.z);
    fitCorners[5].set(max.x, min.y, max.z);
    fitCorners[6].set(max.x, max.y, min.z);
    fitCorners[7].set(max.x, max.y, max.z);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    const fitPadding = 1.08;

    if (camera instanceof THREE.OrthographicCamera) {
      let maxX = 0;
      let maxY = 0;
      for (const corner of fitCorners) {
        fitRelative.subVectors(corner, fitHelperCenter);
        maxX = Math.max(maxX, Math.abs(fitRelative.dot(fitCameraRight)));
        maxY = Math.max(maxY, Math.abs(fitRelative.dot(fitCameraUp)));
      }
      const frustumHalfHeight = Math.max(
        maxY * fitPadding,
        (maxX * fitPadding) / Math.max(aspect, 1e-6),
        0.5
      );
      camera.left = -frustumHalfHeight * aspect;
      camera.right = frustumHalfHeight * aspect;
      camera.top = frustumHalfHeight;
      camera.bottom = -frustumHalfHeight;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    } else {
      const vFovHalfTan = Math.tan((camera.fov * Math.PI) / 360);
      const hFovHalfTan = vFovHalfTan * aspect;
      let fitDist = MIN_DISTANCE;
      for (const corner of fitCorners) {
        fitRelative.subVectors(corner, fitHelperCenter);
        const x = Math.abs(fitRelative.dot(fitCameraRight));
        const y = Math.abs(fitRelative.dot(fitCameraUp));
        const depth = fitRelative.dot(fitCameraForward);
        fitDist = Math.max(
          fitDist,
          (x * fitPadding) / Math.max(hFovHalfTan, 1e-6) - depth,
          (y * fitPadding) / Math.max(vFovHalfTan, 1e-6) - depth
        );
      }
      const clampedDist = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, fitDist));
      camera.position.copy(fitHelperCenter).addScaledVector(fitCameraDir, clampedDist);
    }
    camera.lookAt(fitHelperCenter);
    orbitControls.update();
    updateZoomPercent();
    render();
  }

  function updateDirLightPosition(azimuthDeg: number, elevationDeg: number, distance: number) {
    if (!dirLight) return;
    lightingUpdateDirLightPosition(dirLight, azimuthDeg, elevationDeg, distance);
  }

  function updateSkyLightingColors(): void {
    lightingUpdateSkyLightingColors({
      sky,
      dirLight,
      hemisphereLight,
      groundPlane,
      sunlightIntensity: $sunlightIntensity,
      ambientIntensity: $ambientIntensity,
      lightElevation: $lightElevation,
      backgroundColorHex: $backgroundColor
    });
  }

  function updateShadowCamera(sz: number) {
    if (!dirLight) return;
    lightingUpdateShadowCamera(dirLight, sz);
  }

  /** Re-render directional shadow map on next frame (static lighting + mesh: skip shadow pass otherwise). */
  function invalidateDirectionalShadowMap() {
    lightingInvalidateDirectionalShadowMap(renderer, get(enableShadows), dirLight);
  }

  function getAddPosition(hit: THREE.Intersection): [number, number, number] | null {
    return getAddPositionFromHit(hit, worldQuaternion);
  }

  function getVoxelPosition(hit: THREE.Intersection): [number, number, number] | null {
    return getVoxelPositionFromHit(hit, worldQuaternion);
  }

  function getStrokeStartFromHit(hit: THREE.Intersection): [number, number, number] | null {
    return raycastStrokeStartFromHit($tool, hit, worldQuaternion);
  }

  const PRECISE_GUIDE_GRID_DEFAULT = 'rgba(143, 211, 255, 0.82)';
  const PRECISE_GUIDE_AXIS_X = 'rgba(255, 88, 88, 0.9)';
  const PRECISE_GUIDE_AXIS_Y = 'rgba(72, 210, 118, 0.9)';
  const PRECISE_GUIDE_AXIS_Z = 'rgba(118, 168, 255, 0.9)';

  function preciseGuideColorForWorldAxisTangent(t: THREE.Vector3): string {
    const ax = Math.abs(t.x);
    const ay = Math.abs(t.y);
    const az = Math.abs(t.z);
    const th = 0.82;
    if (ax >= th && ax >= ay && ax >= az) return PRECISE_GUIDE_AXIS_X;
    if (ay >= th && ay >= ax && ay >= az) return PRECISE_GUIDE_AXIS_Y;
    if (az >= th && az >= ax && az >= ay) return PRECISE_GUIDE_AXIS_Z;
    return PRECISE_GUIDE_GRID_DEFAULT;
  }

  function redrawPreciseGuideTexture() {
    if (!preciseGuidePlaneCtx || !preciseGuidePlaneTexture) return;
    const ctx = preciseGuidePlaneCtx;
    const size = PRECISE_GUIDE_TEX_SIZE;
    const S = Math.max(1, preciseGuidePlaneSize);
    // Local plane lx, ly ∈ [-S/2, S/2] (PlaneGeometry unit quad × S). Voxel face boundaries at lx, ly = k + 0.5.
    // UV matches updatePreciseGuideLight: u = lx/S + 0.5, v = ly/S + 0.5 → canvas x = u·size, y = (1−v)·size.
    const kMin = Math.ceil(-S / 2 - 0.5);
    const kMax = Math.floor(S / 2 - 0.5);
    // Tight spotlight around cursor.
    const radiusPx = Math.max(28, Math.min(88, Math.round(size * 0.13)));
    const cx = preciseGuideLightUv.x * size;
    const cy = (1 - preciseGuideLightUv.y) * size;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    const mesh = preciseGuidePlaneMesh;
    let colorVert = PRECISE_GUIDE_GRID_DEFAULT;
    let colorHorz = PRECISE_GUIDE_GRID_DEFAULT;
    if (mesh) {
      preciseGuideTanLocalXWorld.set(1, 0, 0).applyQuaternion(mesh.quaternion).normalize();
      preciseGuideTanLocalYWorld.set(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();
      // Constant canvas x → varies v → parallel to plane local +Y in world space; constant y → parallel to local +X.
      colorVert = preciseGuideColorForWorldAxisTangent(preciseGuideTanLocalYWorld);
      colorHorz = preciseGuideColorForWorldAxisTangent(preciseGuideTanLocalXWorld);
    }
    // 1px fills + NearestFilter; boundary positions use float scale (no rounded cellPx drift).
    for (let k = kMin; k <= kMax; k++) {
      const lxB = k + 0.5;
      const u = lxB / S + 0.5;
      const xPix = Math.round(u * size);
      if (xPix < 0 || xPix >= size) continue;
      ctx.fillStyle = colorVert;
      ctx.fillRect(xPix, 0, 1, size);
    }
    for (let k = kMin; k <= kMax; k++) {
      const lyB = k + 0.5;
      const v = lyB / S + 0.5;
      const yPix = Math.round((1 - v) * size);
      if (yPix < 0 || yPix >= size) continue;
      ctx.fillStyle = colorHorz;
      ctx.fillRect(0, yPix, size, 1);
    }
    ctx.globalCompositeOperation = 'destination-in';
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    preciseGuidePlaneTexture.needsUpdate = true;
  }

  function updatePreciseGuideLight(planePos: [number, number, number] | null) {
    if (!preciseGuidePlaneMaterial || !preciseAnchor || !preciseNormal || !preciseGuidePlaneMesh)
      return;
    const target = planePos ?? preciseAnchor;
    precisePlaneLightOffset.set(
      target[0] - preciseAnchor[0],
      target[1] - preciseAnchor[1],
      target[2] - preciseAnchor[2]
    );
    // Match PlaneGeometry UVs: local (gx, gy) in [-0.5, 0.5] before scale → u = gx + 0.5.
    const sz = Math.max(1, preciseGuidePlaneSize);
    preciseGuideInvQuatScratch.copy(preciseGuidePlaneMesh.quaternion).invert();
    preciseGuideLocalScratch
      .copy(precisePlaneLightOffset)
      .applyQuaternion(preciseGuideInvQuatScratch);
    const gx = preciseGuideLocalScratch.x / sz;
    const gy = preciseGuideLocalScratch.y / sz;
    preciseGuideLightUv.set(
      THREE.MathUtils.clamp(gx + 0.5, 0, 1),
      THREE.MathUtils.clamp(gy + 0.5, 0, 1)
    );
    redrawPreciseGuideTexture();
  }

  function updatePreciseGuidePlane() {
    if (!preciseGuidePlaneMesh) return;
    const anchor = preciseAnchor;
    const normal = preciseNormal;
    const active = (precisePhase === 'armed' || precisePhase === 'placing') && anchor && normal;
    if (!active || !anchor || !normal) {
      preciseGuidePlaneMesh.visible = false;
      resetPrecisePreviewRenderOrder();
      return;
    }
    applyPrecisePreviewRenderOrder();
    const size = Math.max(192, get(gridSize) * 4);
    preciseGuidePlaneSize = size;
    preciseGuidePlaneMesh.scale.set(size, size, 1);
    preciseGuidePlaneMesh.position.copy(
      setPreciseWorkPlanePoint(anchor, normal, preciseWorkPlanePointScratch)
    );
    preciseGuidePlaneMesh.quaternion.setFromUnitVectors(
      precisePlaneNormalBasis,
      precisePlaneNormalTarget.copy(normal).normalize()
    );
    preciseGuidePlaneMesh.visible = true;
    updatePreciseGuideLight(null);
  }

  function resetPreciseState(clearPreview: boolean = true) {
    precisePhase = 'idle';
    preciseAnchor = null;
    preciseNormal = null;
    preciseLocationHint = null;
    resetPrecisePreviewRenderOrder();
    updatePreciseGuidePlane();
    if (clearPreview && !isVoxelDrag) {
      pendingStrokePositions = [];
      updatePreviewMesh([]);
    }
  }

  function applyPrecisePreviewRenderOrder() {
    if (previewMesh) previewMesh.renderOrder = 50;
    if (rollOverMesh) rollOverMesh.renderOrder = 200;
    if (rollOverMaterial) rollOverMaterial.depthTest = false;
  }

  function resetPrecisePreviewRenderOrder() {
    if (previewMesh) previewMesh.renderOrder = 0;
    if (rollOverMesh) rollOverMesh.renderOrder = 0;
    if (rollOverMaterial) rollOverMaterial.depthTest = true;
  }

  /** Axis index (0=X, 1=Y, 2=Z) for wall extension direction; used for lock start height. */
  function getWallDirectionAxis(): number | null {
    const dir = get(sprayDirection);
    if (dir === 'auto' && dragFaceNormal) {
      const d = getSprayDirectionVector('auto', {
        x: dragFaceNormal.x,
        y: dragFaceNormal.y,
        z: dragFaceNormal.z
      });
      if (d) {
        if (d[0] !== 0) return 0;
        if (d[1] !== 0) return 1;
        return 2;
      }
    }
    if (dir === 'left' || dir === 'right') return 0;
    if (dir === 'down' || dir === 'up') return 1;
    if (dir === 'forward' || dir === 'back') return 2;
    return null;
  }

  function supportsShiftPlaneSymmetry(activeTool: Tool): boolean {
    return (
      activeTool === 'voxel' ||
      activeTool === 'remove' ||
      activeTool === 'paint' ||
      activeTool === 'select'
    );
  }

  function getCurrentSymmetryAxes(): SymmetryAxes {
    return {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };
  }

  function getShiftPlaneSymmetryAxes(): SymmetryAxes {
    const axes = getCurrentSymmetryAxes();
    if (axes.x || axes.y || axes.z) return axes;
    // If no explicit symmetry axes are enabled, default to mirroring in the active plane.
    // Example: horizontal plane (normal ~Y) mirrors across X and Z for cushion/mushroom tops.
    const normal = getEffectivePlaneNormal();
    if (!normal) return { x: true, y: false, z: true };
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    const normalAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    return {
      x: normalAxis !== 0,
      y: normalAxis !== 1,
      z: normalAxis !== 2
    };
  }

  function isShiftPlaneSymmetryActive(): boolean {
    return shiftPlaneSymmetryActive && shiftPlaneSymmetryCenter !== null;
  }

  function refreshShiftPlaneSymmetryState(shiftHeld: boolean): void {
    const planeMode = get(effectiveStrokeMode) === 'plane';
    shiftPlaneSymmetryActive =
      shiftHeld &&
      planeMode &&
      isVoxelDrag &&
      dragStartPos !== null &&
      shiftPlaneSymmetryCenter !== null &&
      supportsShiftPlaneSymmetry($tool);
  }

  function clearShiftPlaneSymmetryState(): void {
    shiftPlaneSymmetryCenter = null;
    shiftPlaneSymmetryActive = false;
  }

  function expandPositionsForActiveSymmetry(
    positions: [number, number, number][]
  ): [number, number, number][] {
    if (isShiftPlaneSymmetryActive()) {
      const axes = getShiftPlaneSymmetryAxes();
      return expandPositionsWithSymmetryAroundCenter(positions, shiftPlaneSymmetryCenter!, axes);
    }
    const axes = getCurrentSymmetryAxes();
    return expandPositionsWithSymmetry(positions, axes);
  }

  const {
    applyLineStroke,
    applyClayStroke,
    applySelectStroke,
    placeStamp,
    placePunch,
    placeRocks,
    placeAshlar,
    placeGrass,
    placePiscina,
    placeFlora,
    getPunchPositionsForFace,
    getStampPositionsForFace
  } = createVoxelCanvasStrokeCommit({
    getTool: () => get(tool),
    getLiveSelection: () => get(selection),
    getLiveVoxels: () => get(voxels),
    isShiftPlaneSymmetryActive,
    expandPositionsForActiveSymmetry,
    getStampRotation: () => get(stampRotation),
    getStampOriginMode: () => get(stampOriginMode),
    getEffectiveStampPatternMap,
    playPlaceSound: defaultPlayPlaceSound
  });

  function resetPiscinaPlacementFlow() {
    piscinaPhase = 'pick';
    piscinaLockedPlace = null;
    piscinaLockedNormal = null;
    piscinaHoverPlace = null;
    piscinaHoverNormal = null;
    updatePreviewMesh([]);
  }

  function pickAgainPiscina() {
    resetPiscinaPlacementFlow();
    render();
  }

  function commitPiscinaFish() {
    if (piscinaPhase !== 'shape' || !piscinaLockedPlace || !piscinaLockedNormal) return;
    const seed =
      nextPiscinaPlacementSeed === 0
        ? Math.floor(Math.random() * 0xffffffff)
        : nextPiscinaPlacementSeed;
    placePiscina(piscinaLockedPlace, piscinaLockedNormal, seed);
    nextPiscinaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
    resetPiscinaPlacementFlow();
    render();
  }

  function strokePreviewSymmetryExpansionFactor(): number {
    if (isShiftPlaneSymmetryActive()) {
      const a = getShiftPlaneSymmetryAxes();
      return (a.x ? 2 : 1) * (a.y ? 2 : 1) * (a.z ? 2 : 1);
    }
    const a = getCurrentSymmetryAxes();
    return (a.x ? 2 : 1) * (a.y ? 2 : 1) * (a.z ? 2 : 1);
  }

  function drawBrushInflateParams(): Pick<PathThickenParams, 'drawBrushShape' | 'drawBrushSize'> {
    return {
      drawBrushShape: get(drawBrushShape),
      drawBrushSize: (get(drawBrushSize) as number) * 0.5
    };
  }

  type StrokePreviewBboxHint = {
    primaryBounds: SelectionBounds;
    drawBrushInflate?: Pick<PathThickenParams, 'drawBrushShape' | 'drawBrushSize'>;
    /** When true, use bbox preview without building voxel arrays (e.g. large cuboid depth). */
    forceUseBbox?: boolean;
  };

  function updatePreviewMesh(
    positions: [number, number, number][],
    bboxHint: StrokePreviewBboxHint | null = null
  ) {
    if (!meshManager) return;
    const sel = $selection;
    const bboxGated = sel.size > 0 && ($tool === 'paint' || $tool === 'remove') ? null : bboxHint;

    const previewVoxelFor = (count: number): Voxel =>
      count === 0
        ? { color: 0, material: 'plastic' }
        : $tool === 'remove' || $tool === 'punch'
          ? { color: 0xff4444, material: 'plastic' }
          : $tool === 'select' ||
              $tool === 'selectByColor' ||
              $tool === 'selectCoplanar' ||
              $tool === 'selectCoplanarEmpty'
            ? { color: 0x33aaff, material: 'plastic' }
            : getPaintColorResolver()();

    const useBbox =
      bboxGated !== null &&
      (bboxGated.forceUseBbox === true ||
        (positions.length > 0 &&
          positions.length * strokePreviewSymmetryExpansionFactor() >=
            PREVIEW_BBOX_VOXEL_THRESHOLD));

    if (useBbox) {
      let b = bboxGated.primaryBounds;
      if (bboxGated.drawBrushInflate) {
        b = inflateStrokePreviewBoundsForDrawBrush(b, bboxGated.drawBrushInflate);
      }
      if (isShiftPlaneSymmetryActive() && shiftPlaneSymmetryCenter) {
        b = expandStrokePreviewBoundsAroundCenter(
          b,
          shiftPlaneSymmetryCenter,
          getShiftPlaneSymmetryAxes()
        );
      } else {
        b = expandStrokePreviewBoundsOriginMirror(b, getCurrentSymmetryAxes());
      }
      const pv = previewVoxelFor(positions.length > 0 ? positions.length : 1);
      meshManager.updatePreviewBoundingBox(b, pv);
      return;
    }

    const expanded = expandPositionsForActiveSymmetry(positions);
    const filtered =
      sel.size > 0 && ($tool === 'paint' || $tool === 'remove')
        ? expanded.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : expanded;
    const previewVoxel = previewVoxelFor(filtered.length);
    meshManager.updatePreviewMesh(
      filtered,
      previewVoxel,
      filtered.length > 0 ? $voxels : undefined
    );
  }

  function updateCuboidFromDepth() {
    if (!cuboidPlane) return;
    const ax = Math.abs(cuboidPlane.normal.x);
    const ay = Math.abs(cuboidPlane.normal.y);
    const az = Math.abs(cuboidPlane.normal.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const d: [number, number, number] = [0, 0, 0];
    d[axis] = cuboidDepth;
    deltaDisplay = { dx: d[0], dy: d[1], dz: d[2] };
    const bboxHintBase: StrokePreviewBboxHint = {
      primaryBounds: cuboidStrokeBounds(
        cuboidPlane.a,
        cuboidPlane.b,
        cuboidPlane.normal,
        cuboidDepth
      )
    };
    const solidEst =
      cuboidSolidVoxelCount(cuboidPlane.a, cuboidPlane.b, cuboidPlane.normal, cuboidDepth) *
      strokePreviewSymmetryExpansionFactor();
    if (solidEst >= PREVIEW_BBOX_VOXEL_THRESHOLD) {
      pendingStrokePositions = [];
      updatePreviewMesh([], { ...bboxHintBase, forceUseBbox: true });
    } else {
      pendingStrokePositions = getAxisAlignedCuboid(
        cuboidPlane.a,
        cuboidPlane.b,
        cuboidPlane.normal,
        cuboidDepth,
        get(planeCuboidHollow),
        clampPlaneCuboidHollowWallThickness()
      );
      updatePreviewMesh(pendingStrokePositions, bboxHintBase);
    }
    render();
  }

  function commitCuboid() {
    if (!cuboidPlane) return;
    const positions = getAxisAlignedCuboid(
      cuboidPlane.a,
      cuboidPlane.b,
      cuboidPlane.normal,
      cuboidDepth,
      get(planeCuboidHollow),
      clampPlaneCuboidHollowWallThickness()
    );
    if (positions.length > 0) {
      if ($tool === 'select') {
        applySelectStroke(positions, selectionModeForCurrentGesture ?? get(selectionMode));
      } else {
        runVoxelStroke(() => applyLineStroke(positions));
      }
    }
    deltaDisplay = null;
    cuboidPhase = null;
    cuboidPlane = null;
    pendingStrokePositions = [];
    updatePreviewMesh([]);
    render();
  }

  function applyPolygonNormalOffset(
    positions: [number, number, number][],
    normal: FaceNormal | null,
    steps: number
  ): [number, number, number][] {
    if (positions.length === 0 || !normal || steps === 0) return positions;
    const [nx, ny, nz] = normal;
    return positions.map(
      ([x, y, z]) => [x + nx * steps, y + ny * steps, z + nz * steps] as [number, number, number]
    );
  }

  function cancelPolygon() {
    polygonPoints = [];
    polygonPhase = null;
    polygonPlacementNormal = null;
    updatePolygonPreview([]);
    updatePreviewMesh([]);
  }

  function cancelRoof() {
    roofPoints = [];
    roofPhase = null;
    roofPlacementNormal = null;
    updatePolygonPreview([]);
    updatePreviewMesh([]);
  }

  function refreshRoofPreviewMesh() {
    if (roofPoints.length < 4 || !roofPlacementNormal) {
      updatePreviewMesh([]);
      return;
    }
    const roofMap = generateRoofVoxels(roofPoints, roofPlacementNormal, {
      style: get(roofStyle),
      height: get(roofHeight),
      thickness: get(roofThickness),
      shedEdgeIndex: get(roofShedEdgeIndex),
      gableOrientation: get(roofGableOrientation),
      breakRatio: get(roofBreakRatio),
      wallHeight: get(roofWallHeight),
      parapetHeight: get(roofParapetHeight),
      saltSkew: get(roofSaltSkew),
      hollow: get(roofHollow),
      color: getPaintColorResolver()().color
    });
    const positions = [...roofMap.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
    updatePreviewMesh(positions);
  }

  function commitRoof() {
    if (roofPoints.length < 4 || !roofPlacementNormal) return;
    const roofMap = generateRoofVoxels(roofPoints, roofPlacementNormal, {
      style: get(roofStyle),
      height: get(roofHeight),
      thickness: get(roofThickness),
      shedEdgeIndex: get(roofShedEdgeIndex),
      gableOrientation: get(roofGableOrientation),
      breakRatio: get(roofBreakRatio),
      wallHeight: get(roofWallHeight),
      parapetHeight: get(roofParapetHeight),
      saltSkew: get(roofSaltSkew),
      hollow: get(roofHollow),
      color: getPaintColorResolver()().color
    });
    if (roofMap.size === 0) return;
    const allPositions: [number, number, number][] = [];
    const allVoxels: Voxel[] = [];
    for (const [key, vx] of roofMap) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxels.push(vx);
    }
    defaultPlayPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxels[i]!);
        });
      });
    });
    cancelRoof();
    render();
  }

  function cancelRope() {
    ropePointA = null;
    ropePointB = null;
    ropePhase = null;
    updateRopePointsMesh([]);
    updatePreviewMesh([]);
  }

  function updateRopePointsMesh(points: [number, number, number][]) {
    if (!ropePointsMesh || !ropePointsMaterial) return;
    const count = Math.min(points.length, 2);
    ropePointsMesh.count = count;
    ropePointsMesh.userData.positions = points;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const [x, y, z] = points[i];
      matrix.setPosition(x, y, z);
      ropePointsMesh.setMatrixAt(i, matrix);
    }
    ropePointsMesh.instanceMatrix.needsUpdate = true;
    ropePointsMesh.visible = count > 0;
  }

  function updateRopeFromTension() {
    const a = ropePointA;
    const b = ropePointB;
    if (!a || !b) return;
    const t = get(ropeTension);
    const gravity = get(ropeGravityDirection);
    const centerline = getRopeCurveVoxels(a, b, t, gravity);
    const shape = get(ropeBrushShape);
    const radius = get(ropeBrushRadius) * 0.5;
    const positions = applyBrushAlongPath(centerline, shape, radius);
    pendingStrokePositions = positions;
    updatePreviewMesh(positions);
    updateRopePointsMesh([a, b]);
    render();
  }

  function commitRope() {
    const a = ropePointA;
    const b = ropePointB;
    if (!a || !b) return;
    const t = get(ropeTension);
    const gravity = get(ropeGravityDirection);
    const centerline = getRopeCurveVoxels(a, b, t, gravity);
    const shape = get(ropeBrushShape);
    const radius = get(ropeBrushRadius) * 0.5;
    const positions = applyBrushAlongPath(centerline, shape, radius);
    if (positions.length > 0) {
      runVoxelStroke(() => applyClayStroke(positions, 'rope', 0));
    }
    cancelRope();
    render();
  }

  function commitPolygon() {
    if (polygonPoints.length < 2) return;
    let positions = applyPolygonNormalOffset(
      getPolygonVoxels(polygonPoints),
      polygonPlacementNormal,
      get(polygonOffsetFromNormal)
    );
    if (positions.length > 0) {
      if ($tool === 'select') {
        applySelectStroke(positions, selectionModeForCurrentGesture ?? get(selectionMode));
      } else {
        runVoxelStroke(() => applyLineStroke(positions));
      }
    }
    cancelPolygon();
    render();
  }

  function updatePolygonPointsMesh(points: [number, number, number][]) {
    if (!polygonPointsMesh || !polygonPointsMaterial) return;
    const count = Math.min(points.length, POLYGON_POINTS_MAX);
    polygonPointsMesh.count = count;
    polygonPointsMesh.userData.positions = points;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const [x, y, z] = points[i];
      matrix.setPosition(x, y, z);
      polygonPointsMesh.setMatrixAt(i, matrix);
    }
    polygonPointsMesh.instanceMatrix.needsUpdate = true;
    polygonPointsMesh.visible = count > 0;
  }

  function updatePolygonPreview(points: [number, number, number][]) {
    updatePolygonPointsMesh(points);
    if (!polygonLineSegments || !scene) return;
    const polyLines = polygonLineSegments;
    scene.remove(polyLines);

    const setPolygonLinePlaceholderGeometry = () => {
      polyLines.geometry?.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      polyLines.geometry = g;
    };

    if (points.length < 2) {
      setPolygonLinePlaceholderGeometry();
      polyLines.visible = false;
      return;
    }
    const positions: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x, y, z] = points[i];
      const [nx, ny, nz] = points[i + 1];
      positions.push(x, y, z, nx, ny, nz);
    }
    if (points.length >= 3) {
      const [x, y, z] = points[points.length - 1];
      const [nx, ny, nz] = points[0];
      positions.push(x, y, z, nx, ny, nz);
    }
    if (positions.length === 0) {
      setPolygonLinePlaceholderGeometry();
      polyLines.visible = false;
      return;
    }
    polyLines.geometry?.dispose();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeBoundingSphere();
    polyLines.geometry = geom;
    polyLines.visible = true;
    scene.add(polyLines);
  }

  function cancelDrag() {
    selectionGizmo?.cancelWithPlacementRestore();
    deltaDisplay = null;
    if (precisePhase !== 'idle') {
      resetPreciseState(true);
    }
    if (polygonPhase) {
      cancelPolygon();
    }
    if (roofPhase) {
      cancelRoof();
    }
    if (ropePhase) {
      cancelRope();
    }
    if (cuboidPhase) {
      if (depthAdjustPointerId !== null) {
        try {
          container.releasePointerCapture(depthAdjustPointerId);
        } catch {
          /* ignore */
        }
        depthAdjustPointerId = null;
      }
      cuboidPhase = null;
      cuboidPlane = null;
      pendingStrokePositions = [];
      updatePreviewMesh([]);
    }
    if (isStampDrag) {
      isStampDrag = false;
      stampLikeDragMode = null;
      lastStampPlace = null;
      lastStampNormal = null;
      updatePreviewMesh([]);
    }
    if (isVoxelDrag) {
      if (dragPointerId !== null) {
        try {
          container.releasePointerCapture(dragPointerId);
        } catch {
          /* ignore */
        }
        dragPointerId = null;
      }
      isVoxelDrag = false;
      selectionModeForCurrentGesture = null;
      dragStartPos = null;
      dragFaceNormal = null;
      dragPlaneAxisOverride = null;
      lastBulkPos = null;
      clearShiftPlaneSymmetryState();
      pendingStrokePositions = [];
      updatePreviewMesh([]);
      // No undo - we never applied changes
    }
  }

  const pointerHandlerContext = {
    getTool: () => get(tool),
    getFlyControls: () => flyControls,
    getContainer: () => container
  };

  const voxelGeneratorRmbBridge: VoxelGeneratorRmbBridge = {
    getTool: () => get(tool),
    getPiscinaPhase: () => piscinaPhase,
    render,
    randomSeed32: () => Math.floor(Math.random() * 0xffffffff),
    setNextRockSeed: (n) => {
      nextRockPlacementSeed = n;
    },
    setNextGrassSeed: (n) => {
      nextGrassPlacementSeed = n;
    },
    setNextFloraSeed: (n) => {
      nextFloraPlacementSeed = n;
    },
    setNextPiscinaSeed: (n) => {
      nextPiscinaPlacementSeed = n;
    },
    setNextAshlarSeed: (n) => {
      nextAshlarPlacementSeed = n;
    },
    getAshlarPlacementSeed: () => nextAshlarPlacementSeed,
    getIntersection,
    getAddPosition,
    getFaceNormalFromHit,
    updatePreviewMesh,
    setRollOverVisible: (v) => {
      rollOverMesh.visible = v;
    },
    shouldCancelActiveGesture: () =>
      !!(
        isVoxelDrag ||
        selectionGizmo?.isGizmoDrag ||
        isSegmentedStrokeGestureActive({
          cuboidPhase,
          polygonPhase,
          roofPhase,
          ropePhase
        })
      ),
    cancelDrag
  };

  const voxelGeneratorPrimaryPointerUpBridge: VoxelGeneratorPrimaryPointerUpBridge = {
    getTool: () => get(tool),
    getAddPanelOpen: () => get(addPanelStore).open,
    getPiscinaPhase: () => piscinaPhase,
    getIntersection,
    updatePointerFromEvent,
    getAddPosition,
    getFaceNormalFromHit,
    randomSeed32: () => Math.floor(Math.random() * 0xffffffff),
    getNextRockSeed: () => nextRockPlacementSeed,
    setNextRockSeed: (n) => {
      nextRockPlacementSeed = n;
    },
    placeRocks,
    getNextGrassSeed: () => nextGrassPlacementSeed,
    setNextGrassSeed: (n) => {
      nextGrassPlacementSeed = n;
    },
    placeGrass,
    getNextFloraSeed: () => nextFloraPlacementSeed,
    setNextFloraSeed: (n) => {
      nextFloraPlacementSeed = n;
    },
    placeFlora,
    getNextAshlarSeed: () => nextAshlarPlacementSeed,
    setNextAshlarSeed: (n) => {
      nextAshlarPlacementSeed = n;
    },
    placeAshlar,
    getNextPiscinaSeed: () => nextPiscinaPlacementSeed,
    setNextPiscinaSeed: (n) => {
      nextPiscinaPlacementSeed = n;
    },
    commitPiscinaSurfacePick: (place, normal) => {
      piscinaLockedPlace = place;
      piscinaLockedNormal = normal;
      piscinaHoverPlace = null;
      piscinaHoverNormal = null;
      piscinaPhase = 'shape';
    },
    scheduleRender: () => requestAnimationFrame(() => render())
  };

  async function handlePointerDown(event: PointerEvent) {
    if (
      runPointerDownPrelude(event, {
        pointerHandlerContext,
        generatorRmb: buildVoxelGeneratorRmbDeps(voxelGeneratorRmbBridge),
        updatePointerFromEvent
      })
    )
      return;
    if (event.button === 2) {
      if (
        isVoxelDrag ||
        selectionGizmo?.isGizmoDrag ||
        isSegmentedStrokeGestureActive({
          cuboidPhase,
          polygonPhase,
          roofPhase,
          ropePhase
        })
      ) {
        event.preventDefault();
        cancelDrag();
        render();
      }
      return;
    }
    if (event.button !== 0) return;
    if ($tool === 'hand') return;

    // Cuboid depth phase: pointer down starts drag-to-adjust-depth (anywhere on canvas)
    if (
      get(effectiveStrokeMode) === 'cuboid' &&
      cuboidPhase === 'depth' &&
      cuboidPlane &&
      !$addPanelStore.open
    ) {
      event.preventDefault();
      event.stopPropagation();
      depthAdjustPointerId = event.pointerId;
      lastDepthPhaseClientY = event.clientY;
      depthPhaseAccumulator = 0;
      container.setPointerCapture(event.pointerId);
      return;
    }

    // Rope tension phase: pointer down on slider track starts drag (handled in template)

    if (selectionGizmo?.tryPointerDown(event)) return;

    // Do not stopPropagation here — container uses capture:true; blocking would prevent
    // OrbitControls on the canvas (left-drag orbit, etc.) from receiving the event.
    if ($addPanelStore.open) {
      return;
    }

    let hit = getIntersection();
    const strokeModeAtPointerDown = get(effectiveStrokeMode);
    if (
      !hit &&
      !(
        strokeModeAtPointerDown === 'precise' &&
        precisePhase === 'armed' &&
        preciseAnchor &&
        preciseNormal
      )
    ) {
      return;
    }

    if (hit && $tool === 'roof' && roofPhase && polygonPointsMesh && camera) {
      raycaster.setFromCamera(pointer, camera);
      const roofPointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (roofPointHits.length > 0) hit = roofPointHits[0];
    }

    // Polygon mode only when current tool uses stroke mode (effectiveStrokeMode is null for clay)
    if (
      hit &&
      get(effectiveStrokeMode) === 'polygon' &&
      polygonPhase &&
      polygonPointsMesh &&
      camera
    ) {
      raycaster.setFromCamera(pointer, camera);
      const pointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (pointHits.length > 0) hit = pointHits[0];
    }

    if (strokeModeAtPointerDown === 'precise' && precisePhase === 'idle' && hit) {
      event.preventDefault();
      event.stopPropagation();
      const anchor = getStrokeStartFromHit(hit);
      const normal = getFaceNormalFromHit(hit);
      if (anchor && normal) {
        preciseAnchor = anchor;
        const pn = new THREE.Vector3(normal[0], normal[1], normal[2]);
        preciseNormal = pn;
        precisePhase = 'armed';
        updatePreciseGuidePlane();
        pendingStrokePositions = [anchor];
        applyPrecisePreviewRenderOrder();
        updatePreviewMesh(pendingStrokePositions);
        const hp = getIntersectionWithPlane(
          setPreciseWorkPlanePoint(anchor, pn, preciseWorkPlanePointScratch),
          pn
        );
        preciseLocationHint = hp
          ? { x: hp[0], y: hp[1], z: hp[2] }
          : { x: anchor[0], y: anchor[1], z: anchor[2] };
      }
      requestAnimationFrame(() => render());
      return;
    }

    if (
      strokeModeAtPointerDown === 'precise' &&
      precisePhase === 'armed' &&
      preciseAnchor &&
      preciseNormal
    ) {
      event.preventDefault();
      event.stopPropagation();
      container.setPointerCapture(event.pointerId);
      dragPointerId = event.pointerId;
      isVoxelDrag = true;
      precisePhase = 'placing';
      updatePreciseGuidePlane();
      const startPos =
        getIntersectionWithPlane(
          setPreciseWorkPlanePoint(preciseAnchor, preciseNormal, preciseWorkPlanePointScratch),
          preciseNormal
        ) ?? (hit ? getStrokeStartFromHit(hit) : null);
      if (!startPos) {
        isVoxelDrag = false;
        precisePhase = 'armed';
        updatePreciseGuidePlane();
        dragPointerId = null;
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        requestAnimationFrame(() => render());
        return;
      }
      dragStartPos = startPos;
      dragFaceNormal = preciseNormal.clone();
      dragPlaneAxisOverride = null;
      currentStrokeSeed = Math.floor(Math.random() * 0xffffffff);
      updatePreciseGuideLight(startPos);
      rollOverMesh.visible = false;
      preciseLocationHint = { x: startPos[0], y: startPos[1], z: startPos[2] };
      pendingStrokePositions = [startPos];
      updatePreviewMesh(pendingStrokePositions);
      requestAnimationFrame(() => render());
      return;
    }
    if (!hit) return;

    if (get(effectiveStrokeMode) === 'polygon') {
      event.preventDefault();
      event.stopPropagation();
      // Click on existing point: remove it
      if (hit.object === polygonPointsMesh && hit.instanceId != null) {
        const idx = hit.instanceId;
        if (idx >= 0 && idx < polygonPoints.length) {
          polygonPoints = polygonPoints.filter((_, i) => i !== idx);
          polygonPhase = polygonPoints.length > 0 ? 'placing' : null;
          updatePolygonPreview(polygonPoints);
          const fillPositions =
            polygonPoints.length >= 2
              ? applyPolygonNormalOffset(
                  getPolygonVoxels(polygonPoints),
                  polygonPlacementNormal,
                  get(polygonOffsetFromNormal)
                )
              : [];
          updatePreviewMesh(fillPositions);
        }
      } else {
        // In polygon mode, anchor points to the clicked voxel center so face choice
        // (top/side) resolves to the same coordinate.
        const pos = getVoxelPosition(hit);
        if (pos) {
          // If we clicked an already placed polygon coordinate, toggle it off.
          const existingIdx = polygonPoints.findIndex(
            ([x, y, z]) => x === pos[0] && y === pos[1] && z === pos[2]
          );
          if (existingIdx >= 0) {
            polygonPoints = polygonPoints.filter((_, i) => i !== existingIdx);
            polygonPhase = polygonPoints.length > 0 ? 'placing' : null;
          } else {
            polygonPhase = 'placing';
            polygonPoints = [...polygonPoints, pos];
            polygonPlacementNormal = getFaceNormalFromHit(hit);
          }
          updatePolygonPreview(polygonPoints);
          const fillPositions =
            polygonPoints.length >= 2
              ? applyPolygonNormalOffset(
                  getPolygonVoxels(polygonPoints),
                  polygonPlacementNormal,
                  get(polygonOffsetFromNormal)
                )
              : [];
          updatePreviewMesh(fillPositions);
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    if ($tool === 'roof' && !$addPanelStore.open) {
      event.preventDefault();
      event.stopPropagation();
      if (hit.object === polygonPointsMesh && hit.instanceId != null) {
        const idx = hit.instanceId;
        if (idx >= 0 && idx < roofPoints.length) {
          roofPoints = roofPoints.filter((_, i) => i !== idx);
          roofPhase = roofPoints.length > 0 ? 'placing' : null;
          updatePolygonPreview(roofPoints);
          refreshRoofPreviewMesh();
        }
      } else {
        const pos = getVoxelPosition(hit);
        if (pos) {
          const existingIdx = roofPoints.findIndex(
            ([x, y, z]) => x === pos[0] && y === pos[1] && z === pos[2]
          );
          if (existingIdx >= 0) {
            roofPoints = roofPoints.filter((_, i) => i !== existingIdx);
            roofPhase = roofPoints.length > 0 ? 'placing' : null;
          } else {
            roofPhase = 'placing';
            roofPoints = [...roofPoints, pos];
            roofPlacementNormal = getFaceNormalFromHit(hit);
          }
          updatePolygonPreview(roofPoints);
          refreshRoofPreviewMesh();
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Voxel click: prevent OrbitControls from receiving this and subsequent events
    event.preventDefault();
    event.stopPropagation();
    container.setPointerCapture(event.pointerId);
    dragPointerId = event.pointerId;

    // Clay tool + rope mode: two-click flow (before other clay modes)
    const mode = get(clayMode);
    if ($tool === 'clay' && mode === 'rope') {
      const pos = getAddPosition(hit) ?? getVoxelPosition(hit);
      if (pos) {
        if (ropePhase === null) {
          ropePointA = pos;
          ropePhase = 'placing';
          updateRopePointsMesh([pos]);
        } else if (ropePhase === 'placing' && ropePointA) {
          ropePointB = pos;
          ropePhase = 'tension';
          updateRopeFromTension();
        } else if (ropePhase === 'tension' && ropePointA) {
          ropePointB = pos;
          updateRopeFromTension();
        }
      } else {
        dragPointerId = null;
        container.releasePointerCapture(event.pointerId);
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Clay tool + path-following modes: start drag (bulk/smooth/level/gouge/melt/wall)
    if (
      $tool === 'clay' &&
      (mode === 'bulk' ||
        mode === 'smooth' ||
        mode === 'level' ||
        mode === 'gouge' ||
        mode === 'melt' ||
        mode === 'wall' ||
        mode === 'inflate')
    ) {
      // Start on voxel (grab surface) or face of voxel (extend outward)
      const pos = getVoxelPosition(hit) ?? getAddPosition(hit);
      if (pos) {
        isVoxelDrag = true;
        dragStartPos = pos;
        lastBulkPos = pos;
        pendingStrokePositions = [pos];
        currentStrokeSeed = Math.floor(Math.random() * 0xffffffff);
        if (mode === 'wall') {
          const n = getFaceNormalFromHit(hit);
          dragFaceNormal = n ? new THREE.Vector3(n[0], n[1], n[2]) : null;
        }
        updatePreviewMesh(
          thickenPathForStroke(pendingStrokePositions, {
            strokeMode: get(strokeMode),
            clayMode: mode,
            clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
            bulkBrushShape: get(bulkBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            airbrushRadius: (get(airbrushRadius) as number) * 0.5,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
            airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
            airbrushBrushShape: get(airbrushBrushShape),
            ...airbrushPlaneParamsForStroke(),
            planeAxis: get(planeAxis),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize) * 0.5,
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            seed: currentStrokeSeed
          })
        );
      } else {
        dragPointerId = null;
        container.releasePointerCapture(event.pointerId);
      }
      requestAnimationFrame(() => render());
      return;
    }
    // Clay tool + branch mode: start drag (extrude into empty space)
    if ($tool === 'clay' && mode === 'branch') {
      const pos = getAddPosition(hit) ?? getVoxelPosition(hit);
      if (pos) {
        isVoxelDrag = true;
        dragStartPos = pos;
        branchPointerDownX = event.clientX;
        branchPointerDownY = event.clientY;
        pendingStrokePositions = [pos];
        currentStrokeSeed = Math.floor(Math.random() * 0xffffffff);
        updatePreviewMesh(
          thickenPathForStroke(pendingStrokePositions, {
            strokeMode: get(strokeMode),
            clayMode: 'branch',
            clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
            bulkBrushShape: get(bulkBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            airbrushRadius: (get(airbrushRadius) as number) * 0.5,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
            airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
            airbrushBrushShape: get(airbrushBrushShape),
            ...airbrushPlaneParamsForStroke(),
            planeAxis: get(planeAxis),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize) * 0.5,
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            seed: currentStrokeSeed
          })
        );
      } else {
        dragPointerId = null;
        container.releasePointerCapture(event.pointerId);
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Select tool + fill method: click voxel to select it and all connected same-color voxels
    if (
      $tool === 'select' &&
      get(effectiveStrokeMode) === 'fill' &&
      hit.object !== polygonPointsMesh
    ) {
      if (fillBusy) {
        requestAnimationFrame(() => render());
        return;
      }
      const pos = getVoxelPosition(hit);
      if (pos) {
        fillBusy = true;
        fillMessage = 'Exploring fill region…';
        fillVisited = 0;
        fillMatched = 0;
        const controller = new AbortController();
        fillAbortController = controller;
        try {
          const incoming = await getFillSelectionAtAsync(
            pos[0],
            pos[1],
            pos[2],
            get(fillSelectDiagonals),
            get(fillRespectsColor),
            {
              planeCtx: fillPlaneContextFromHit(hit),
              signal: controller.signal,
              onProgress: (p) => {
                fillVisited = p.visited;
                fillMatched = p.matched;
              }
            }
          );
          if (!incoming.cancelled && incoming.region.size > 0) {
            fillMessage = 'Applying fill…';
            commitSelectionMergeEdit(incoming.region, get(selectionMode), event.shiftKey);
          }
        } finally {
          fillAbortController = null;
          fillBusy = false;
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Paint tool + fill method: click voxel to flood-fill connected same-color region
    if (
      $tool === 'paint' &&
      get(effectiveStrokeMode) === 'fill' &&
      hit.object !== polygonPointsMesh
    ) {
      if (fillBusy) {
        requestAnimationFrame(() => render());
        return;
      }
      const pos = getVoxelPosition(hit);
      if (pos) {
        fillBusy = true;
        fillMessage = 'Exploring fill region…';
        fillVisited = 0;
        fillMatched = 0;
        const controller = new AbortController();
        fillAbortController = controller;
        try {
          const fillRegion = await getFillSelectionAtAsync(
            pos[0],
            pos[1],
            pos[2],
            get(fillSelectDiagonals),
            get(fillRespectsColor),
            {
              planeCtx: fillPlaneContextFromHit(hit),
              signal: controller.signal,
              onProgress: (p) => {
                fillVisited = p.visited;
                fillMatched = p.matched;
              }
            }
          );
          if (!fillRegion.cancelled && fillRegion.region.size > 0) {
            fillMessage = 'Applying fill…';
            const getCol = getPaintColorResolver();
            const positions = [...fillRegion.region.keys()].map((k) => parseCoordKey(k));
            ensureGridFitsPositions(positions);
            runVoxelStroke(() => {
              updateVoxelsInStroke((v) => {
                for (const key of fillRegion.region.keys()) {
                  v.set(key, getCol());
                }
              });
            });
          }
        } finally {
          fillAbortController = null;
          fillBusy = false;
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Voxel tool + fill method: click face to flood-fill connected empty space with voxels
    if (
      $tool === 'voxel' &&
      get(effectiveStrokeMode) === 'fill' &&
      hit.object !== polygonPointsMesh
    ) {
      if (fillBusy) {
        requestAnimationFrame(() => render());
        return;
      }
      const pos = getAddPosition(hit);
      if (pos && !$voxels.has(coordKey(pos[0], pos[1], pos[2]))) {
        fillBusy = true;
        fillMessage = 'Exploring fill region…';
        fillVisited = 0;
        fillMatched = 0;
        const controller = new AbortController();
        fillAbortController = controller;
        try {
          const emptyRegion = await resolveFillEmptyForUnconstrainedPlaneAsync(
            pos[0],
            pos[1],
            pos[2],
            get(fillSelectDiagonals),
            fillPlaneContextFromHit(hit),
            controller.signal
          );
          if (emptyRegion && emptyRegion.size > 0) {
            fillMessage = 'Applying fill…';
            const getCol = getPaintColorResolver();
            const positions = [...emptyRegion].map((k) => parseCoordKey(k));
            ensureGridFitsPositions(positions);
            runVoxelStroke(() => {
              updateVoxelsInStroke((v) => {
                for (const key of emptyRegion) {
                  v.set(key, getCol());
                }
              });
            });
          }
        } finally {
          fillAbortController = null;
          fillBusy = false;
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Remove tool + fill method: click voxel to flood-remove connected region
    if (
      $tool === 'remove' &&
      get(effectiveStrokeMode) === 'fill' &&
      hit.object !== polygonPointsMesh
    ) {
      if (fillBusy) {
        requestAnimationFrame(() => render());
        return;
      }
      const pos = getVoxelPosition(hit);
      if (pos) {
        fillBusy = true;
        fillMessage = 'Exploring fill region…';
        fillVisited = 0;
        fillMatched = 0;
        const controller = new AbortController();
        fillAbortController = controller;
        try {
          const fillRegion = await getFillSelectionAtAsync(
            pos[0],
            pos[1],
            pos[2],
            get(fillSelectDiagonals),
            get(fillRespectsColor),
            {
              planeCtx: fillPlaneContextFromHit(hit),
              signal: controller.signal,
              onProgress: (p) => {
                fillVisited = p.visited;
                fillMatched = p.matched;
              }
            }
          );
          if (!fillRegion.cancelled && fillRegion.region.size > 0) {
            fillMessage = 'Applying fill…';
            runVoxelStroke(() => {
              updateVoxelsInStroke((v) => {
                for (const key of fillRegion.region.keys()) {
                  v.delete(key);
                }
              });
            });
          }
        } finally {
          fillAbortController = null;
          fillBusy = false;
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Select coplanar faces: click voxel to select all connected voxels in that face's plane
    if ($tool === 'selectCoplanar' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      const normal = getFaceNormalFromHit(hit);
      if (pos && normal) {
        const incoming = getCoplanarFacesSelectionAt(pos[0], pos[1], pos[2], normal);
        if (incoming.size > 0) {
          commitUndoAfter(() => {
            const next = mergeSelection(
              $selection,
              incoming,
              event.shiftKey ? 'add' : get(selectionMode)
            );
            selection.set(next);
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Select coplanar void: click face into air to select connected empty voxels in that plane
    if ($tool === 'selectCoplanarEmpty' && hit.object !== polygonPointsMesh) {
      const air = getAddPosition(hit);
      const normal = getFaceNormalFromHit(hit);
      if (air && normal && !$voxels.has(coordKey(air[0], air[1], air[2]))) {
        const incoming = getCoplanarEmptySelectionAt(air[0], air[1], air[2], normal);
        if (incoming.size > 0) {
          commitUndoAfter(() => {
            const next = mergeSelection(
              $selection,
              incoming,
              event.shiftKey ? 'add' : get(selectionMode)
            );
            selection.set(next);
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Select by color: when fill mode, flood-fill select; else select all voxels with same RGB globally
    if ($tool === 'selectByColor' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const targetVoxel = $voxels.get(coordKey(pos[0], pos[1], pos[2]));
        if (targetVoxel !== undefined) {
          let incoming: Map<string, Voxel>;
          if (get(effectiveStrokeMode) === 'fill') {
            if (fillBusy) {
              requestAnimationFrame(() => render());
              return;
            }
            fillBusy = true;
            fillMessage = 'Exploring fill region…';
            fillVisited = 0;
            fillMatched = 0;
            const controller = new AbortController();
            fillAbortController = controller;
            try {
              const fillResult = await getFillSelectionAtAsync(
                pos[0],
                pos[1],
                pos[2],
                get(fillSelectDiagonals),
                get(fillRespectsColor),
                {
                  planeCtx: fillPlaneContextFromHit(hit),
                  signal: controller.signal,
                  onProgress: (p) => {
                    fillVisited = p.visited;
                    fillMatched = p.matched;
                  }
                }
              );
              if (fillResult.cancelled) {
                requestAnimationFrame(() => render());
                return;
              }
              incoming = fillResult.region;
            } finally {
              fillAbortController = null;
              fillBusy = false;
            }
          } else {
            incoming = new SvelteMap<string, Voxel>();
            for (const [key, col] of $voxels) {
              if (sameVoxelColor(col, targetVoxel)) incoming.set(key, col);
            }
          }
          if (incoming.size === 0) {
            requestAnimationFrame(() => render());
            return;
          }
          commitUndoAfter(() => {
            const next = mergeSelection(
              $selection,
              incoming,
              event.shiftKey ? 'add' : get(selectionMode)
            );
            selection.set(next);
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Eyedropper: click voxel to pick color and material
    if ($tool === 'eyedropper') {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const vx = $voxels.get(coordKey(pos[0], pos[1], pos[2]));
        if (vx !== undefined) {
          const hex = intToHex(vx.color);
          color.set(hex);
          selectedColors.set([hex]);
          voxelMaterial.set(vx.material);
          tool.set(get(toolBeforeEyedropper));
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Stamp / punch: stamp uses adjacent empty cell; punch uses hit voxel (cut inward)
    if (($tool === 'stamp' || $tool === 'punch') && hasStampLikePattern()) {
      const normal = getFaceNormalFromHit(hit);
      const place = $tool === 'stamp' ? getAddPosition(hit) : getVoxelPosition(hit);
      if (place && normal) {
        isStampDrag = true;
        stampLikeDragMode = $tool;
        lastStampPlace = place;
        lastStampNormal = normal;
        updatePreviewMesh(
          $tool === 'punch'
            ? getPunchPositionsForFace(place, normal)
            : getStampPositionsForFace(place, normal)
        );
      } else {
        dragPointerId = null;
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Face-click generators: placement runs on pointerup; do not start stroke drag
    if (isGeneratorFaceClickTool(get(tool))) {
      requestAnimationFrame(() => render());
      return;
    }

    isVoxelDrag = true;
    clearShiftPlaneSymmetryState();
    let startPos: [number, number, number] | null = null;
    if ($tool === 'voxel') {
      startPos = getAddPosition(hit);
    } else {
      startPos = getVoxelPosition(hit);
    }
    if (!startPos) {
      isVoxelDrag = false;
      dragPointerId = null;
      container.releasePointerCapture(event.pointerId);
      return;
    }

    dragStartPos = startPos;
    shiftPlaneSymmetryCenter = [...startPos];
    refreshShiftPlaneSymmetryState(event.shiftKey);
    if ($tool === 'select') {
      selectionModeForCurrentGesture = event.shiftKey ? 'add' : get(selectionMode);
    }
    currentStrokeSeed = Math.floor(Math.random() * 0xffffffff);
    hit.object.getWorldQuaternion(worldQuaternion);
    const faceNormal = hit.face!.normal.clone().applyQuaternion(worldQuaternion);
    const pa = get(planeAxis);
    // Line (non-axis-aligned) and airbrush (constrain-to-plane): always use clicked face normal
    const lineOnFace = get(effectiveStrokeMode) === 'line' && !get(lineAxisAlign);
    const airbrushUseFaceNormal = get(effectiveStrokeMode) === 'airbrush';
    dragFaceNormal =
      lineOnFace || pa === 'auto' || airbrushUseFaceNormal ? faceNormal : axisVector(pa);
    dragPlaneAxisOverride = null;
    pendingStrokePositions = [startPos];
    const clayModeVal = get(clayMode);
    const isClayPathFollow =
      $tool === 'clay' &&
      (clayModeVal === 'bulk' ||
        clayModeVal === 'smooth' ||
        clayModeVal === 'level' ||
        clayModeVal === 'gouge' ||
        clayModeVal === 'melt' ||
        clayModeVal === 'wall' ||
        clayModeVal === 'inflate');
    if (isClayPathFollow) {
      lastBulkPos = startPos;
    } else if (get(effectiveStrokeMode) === 'airbrush') {
      lastBulkPos = startPos;
    }
    const strokeParams = {
      strokeMode: get(strokeMode),
      clayMode: isClayPathFollow ? clayModeVal : undefined,
      clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
      bulkBrushShape: get(bulkBrushShape),
      branchTaper: get(branchTaper),
      branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
      branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
      airbrushRadius: (get(airbrushRadius) as number) * 0.5,
      airbrushScatter: get(airbrushScatter),
      airbrushRadiusRange: get(airbrushRadiusRange),
      airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
      airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
      airbrushBrushShape: get(airbrushBrushShape),
      ...airbrushPlaneParamsForStroke(),
      planeAxis: get(planeAxis),
      sprayDirection: get(sprayDirection),
      sprayStreakLength: get(sprayStreakLength),
      wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
      wallHeight: get(wallHeight),
      wallFaceNormal: dragFaceNormal
        ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
        : undefined,
      drawBrushShape: get(drawBrushShape),
      drawBrushSize: get(drawBrushSize) * 0.5,
      drawBrushSnapToSurface: get(drawBrushSnapToSurface),
      drawBrushFaceNormal: dragFaceNormal
        ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
        : undefined,
      seed: currentStrokeSeed
    };
    updatePreviewMesh(thickenPathForStroke(pendingStrokePositions, strokeParams));
    requestAnimationFrame(() => render());
  }

  function handlePointerMove(event?: PointerEvent) {
    if (
      runPointerMovePrelude(event, {
        pointerHandlerContext,
        updatePointerFromEvent
      })
    ) {
      selectionGizmo?.clearGizmoHoverCursor();
      return;
    }
    try {
      if ($tool === 'hand') {
        resetPiscinaPlacementFlow();
        selectionGizmo?.clearGizmoHoverCursor();
        rollOverMesh.visible = false;
        updatePreviewMesh([]);
        return;
      }
      if (selectionGizmo?.handlePointerMove(event)) return;
      // Add shape panel: only add-preview ghost; hide active-tool rollover + meshManager preview
      if ($addPanelStore.open) {
        if (event) updatePointerFromEvent(event);
        rollOverMesh.visible = false;
        updatePreviewMesh([]);
        render();
        return;
      }
      // Stamp / punch drag: re-raycast so preview follows cursor onto any surface
      if (isStampDrag && hasStampLikePattern()) {
        const hit = getIntersection();
        if (hit) {
          const normal = getFaceNormalFromHit(hit);
          const place = stampLikeDragMode === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
          if (place && normal) {
            lastStampPlace = place;
            lastStampNormal = normal;
            updatePreviewMesh(
              stampLikeDragMode === 'punch'
                ? getPunchPositionsForFace(place, normal)
                : getStampPositionsForFace(place, normal)
            );
          }
        }
        render();
        return;
      }
      // Cuboid depth phase: depth from pointer drag (up/down movement) or slider
      if (
        cuboidPhase === 'depth' &&
        cuboidPlane &&
        event &&
        depthAdjustPointerId === event.pointerId
      ) {
        const dy = lastDepthPhaseClientY - event.clientY;
        lastDepthPhaseClientY = event.clientY;
        depthPhaseAccumulator += dy / 12;
        const step = Math.trunc(depthPhaseAccumulator);
        depthPhaseAccumulator -= step;
        cuboidDepth = Math.max(-256, Math.min(256, cuboidDepth + step));
        updateCuboidFromDepth();
        return;
      }
      if (isVoxelDrag && dragStartPos) {
        if (event) refreshShiftPlaneSymmetryState(event.shiftKey);
        const clayPathMode = get(clayMode);
        if ($tool === 'clay' && clayPathMode === 'branch') {
          // Branch: view-plane direction (drag up = grow up on screen, not into scene)
          const currX = event?.clientX ?? branchPointerDownX;
          const currY = event?.clientY ?? branchPointerDownY;
          const dx = currX - branchPointerDownX;
          const dy = branchPointerDownY - currY; // screen up = positive
          const length = Math.max(0, Math.round(Math.sqrt(dx * dx + dy * dy) / 6));
          let dir = { x: 0, y: 0, z: 0 };
          if (length > 0 && camera) {
            camera.updateMatrixWorld(true);
            const viewDir = new THREE.Vector3();
            camera.getWorldDirection(viewDir);
            const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize();
            const up = new THREE.Vector3().crossVectors(right, viewDir).normalize();
            dir = {
              x: right.x * dx + up.x * dy,
              y: right.y * dx + up.y * dy,
              z: right.z * dx + up.z * dy
            };
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
            if (len > 1e-6) {
              dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
            } else {
              dir = { x: up.x, y: up.y, z: up.z };
            }
          } else if (length > 0) {
            dir = { x: 0, y: 1, z: 0 };
          }
          pendingStrokePositions = getRayDirectionPath(dragStartPos, dir, length);
          updatePreviewMesh(
            thickenPathForStroke(pendingStrokePositions, {
              strokeMode: get(strokeMode),
              clayMode: 'branch',
              clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
              bulkBrushShape: get(bulkBrushShape),
              branchTaper: get(branchTaper),
              branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
              branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
              airbrushRadius: (get(airbrushRadius) as number) * 0.5,
              airbrushScatter: get(airbrushScatter),
              airbrushRadiusRange: get(airbrushRadiusRange),
              airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
              airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
              airbrushBrushShape: get(airbrushBrushShape),
              ...airbrushPlaneParamsForStroke(),
              planeAxis: get(planeAxis),
              sprayDirection: get(sprayDirection),
              sprayStreakLength: get(sprayStreakLength),
              wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
              wallHeight: get(wallHeight),
              wallFaceNormal: dragFaceNormal
                ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
                : undefined,
              drawBrushShape: get(drawBrushShape),
              drawBrushSize: get(drawBrushSize) * 0.5,
              drawBrushSnapToSurface: get(drawBrushSnapToSurface),
              drawBrushFaceNormal: dragFaceNormal
                ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
                : undefined,
              seed: currentStrokeSeed
            })
          );
          deltaDisplay =
            pendingStrokePositions.length > 0
              ? {
                  dx:
                    pendingStrokePositions[pendingStrokePositions.length - 1][0] - dragStartPos[0],
                  dy:
                    pendingStrokePositions[pendingStrokePositions.length - 1][1] - dragStartPos[1],
                  dz: pendingStrokePositions[pendingStrokePositions.length - 1][2] - dragStartPos[2]
                }
              : null;
        } else {
          const hit = getIntersection();
          let currentPos: [number, number, number] | null = null;
          if (hit) {
            currentPos =
              $tool === 'voxel' || $tool === 'clay' ? getAddPosition(hit) : getVoxelPosition(hit);
          }
          const strokeModeVal = get(effectiveStrokeMode);
          const clayPathMode = get(clayMode);
          if (strokeModeVal === 'precise' && dragStartPos && preciseNormal && preciseAnchor) {
            if (event) updatePointerFromEvent(event);
            updatePreciseGuidePlane();
            const planePos = getIntersectionWithPlane(
              setPreciseWorkPlanePoint(preciseAnchor, preciseNormal, preciseWorkPlanePointScratch),
              preciseNormal
            );
            if (planePos) {
              updatePreciseGuideLight(planePos);
              applyPrecisePreviewRenderOrder();
              rollOverMesh.position.set(planePos[0], planePos[1], planePos[2]);
              rollOverMesh.visible = true;
              preciseLocationHint = { x: planePos[0], y: planePos[1], z: planePos[2] };
              pendingStrokePositions = getAxisAlignedPlaneFromNormal(
                dragStartPos,
                planePos,
                preciseNormal,
                false
              );
              if (pendingStrokePositions.length === 0) pendingStrokePositions = [dragStartPos];
              updatePreviewMesh(pendingStrokePositions, {
                primaryBounds: planeStrokeBounds(dragStartPos, planePos, {
                  x: preciseNormal.x,
                  y: preciseNormal.y,
                  z: preciseNormal.z
                })
              });
              deltaDisplay = {
                dx: planePos[0] - dragStartPos[0],
                dy: planePos[1] - dragStartPos[1],
                dz: planePos[2] - dragStartPos[2]
              };
            } else {
              updatePreciseGuideLight(null);
              rollOverMesh.visible = false;
              preciseLocationHint = null;
              deltaDisplay = null;
            }
            render();
            return;
          }
          const isAirbrushPath = strokeModeVal === 'airbrush' && lastBulkPos;
          const isClayPathFollow =
            $tool === 'clay' &&
            (clayPathMode === 'bulk' ||
              clayPathMode === 'smooth' ||
              clayPathMode === 'level' ||
              clayPathMode === 'gouge' ||
              clayPathMode === 'melt' ||
              clayPathMode === 'wall' ||
              clayPathMode === 'inflate') &&
            lastBulkPos;
          // Wall + lock start height: when cursor is in empty space, intersect ray with locked plane so path extends into thin air
          if (
            currentPos === null &&
            isClayPathFollow &&
            clayPathMode === 'wall' &&
            get(wallLockStartHeight) &&
            dragStartPos &&
            camera
          ) {
            const axis = getWallDirectionAxis();
            if (axis !== null && (axis === 0 || axis === 1 || axis === 2)) {
              currentPos = getIntersectionWithLockedPlane(axis, dragStartPos[axis]);
            }
          }
          const isAxisAlignedLine = strokeModeVal === 'line' && get(lineAxisAlign);
          // Plane/circle/cuboid and axis-aligned line: prefer drag-plane intersection so shape
          // extends into empty space. If ray is parallel to the plane, keep voxel-hit fallback.
          if (
            (strokeModeVal === 'plane' ||
              strokeModeVal === 'circle' ||
              strokeModeVal === 'cuboid' ||
              isAxisAlignedLine) &&
            dragStartPos
          ) {
            const planeNormal = getEffectivePlaneNormal();
            if (planeNormal) {
              const planePoint = new THREE.Vector3(
                dragStartPos[0] + 0.5,
                dragStartPos[1] + 0.5,
                dragStartPos[2] + 0.5
              );
              const planePos = getIntersectionWithPlane(planePoint, planeNormal);
              if (planePos) currentPos = planePos;
            }
          }
          // Airbrush + constrain to plane: prefer plane intersection over voxel hit so cursor stays on the invisible plane
          if (isAirbrushPath && dragStartPos) {
            const normal = getAirbrushConstrainPlaneNormalWorld();
            if (normal) {
              const planePoint = new THREE.Vector3(
                dragStartPos[0] + 0.5,
                dragStartPos[1] + 0.5,
                dragStartPos[2] + 0.5
              );
              const planePos = getIntersectionWithPlane(planePoint, normal);
              if (planePos) currentPos = planePos;
            }
          }
          if (currentPos) {
            // Wall + lock start height: keep path on starting plane (for enclosed loops)
            if (
              isClayPathFollow &&
              clayPathMode === 'wall' &&
              get(wallLockStartHeight) &&
              dragStartPos
            ) {
              const axis = getWallDirectionAxis();
              if (axis !== null) {
                currentPos = [currentPos[0], currentPos[1], currentPos[2]];
                currentPos[axis] = dragStartPos[axis];
              }
            }
            if (isClayPathFollow || isAirbrushPath) {
              if (
                isClayPathFollow &&
                clayPathMode === 'wall' &&
                get(wallAxisAlign) &&
                dragStartPos
              ) {
                pendingStrokePositions = getAxisAlignedLine(dragStartPos, currentPos);
                lastBulkPos = currentPos;
              } else {
                // Path-following: accumulate with 3D line segments
                const segment = getBresenham3DLine(lastBulkPos!, currentPos);
                const seen = new SvelteSet(
                  pendingStrokePositions.map((p) => `${p[0]},${p[1]},${p[2]}`)
                );
                for (const p of segment) {
                  const k = `${p[0]},${p[1]},${p[2]}`;
                  if (!seen.has(k)) {
                    seen.add(k);
                    pendingStrokePositions.push(p);
                  }
                }
                lastBulkPos = currentPos;
              }
            } else {
              const normal = getEffectivePlaneNormal();
              if (
                (strokeModeVal === 'plane' ||
                  strokeModeVal === 'circle' ||
                  strokeModeVal === 'cuboid') &&
                normal
              ) {
                const hollow = get(planeCuboidHollow);
                const hollowWall =
                  strokeModeVal === 'circle' ? 1 : clampPlaneCuboidHollowWallThickness();
                pendingStrokePositions =
                  strokeModeVal === 'circle'
                    ? getAxisAlignedCircleFromNormal(
                        dragStartPos,
                        currentPos,
                        normal,
                        hollow,
                        hollowWall
                      )
                    : getAxisAlignedPlaneFromNormal(
                        dragStartPos,
                        currentPos,
                        normal,
                        hollow,
                        hollowWall
                      );
              } else if (strokeModeVal === 'line' && !get(lineAxisAlign) && dragFaceNormal) {
                const projected = projectPointOntoPlane(currentPos, dragStartPos, {
                  x: dragFaceNormal.x,
                  y: dragFaceNormal.y,
                  z: dragFaceNormal.z
                });
                pendingStrokePositions = getBresenham3DLine(dragStartPos, projected);
              } else {
                pendingStrokePositions = getAxisAlignedLine(dragStartPos, currentPos);
              }
            }
            let strokeBboxHint: StrokePreviewBboxHint | null = null;
            if (
              !isClayPathFollow &&
              !isAirbrushPath &&
              dragStartPos &&
              (strokeModeVal === 'plane' || strokeModeVal === 'cuboid' || strokeModeVal === 'line')
            ) {
              const nPlane = getEffectivePlaneNormal();
              if ((strokeModeVal === 'plane' || strokeModeVal === 'cuboid') && nPlane) {
                strokeBboxHint = {
                  primaryBounds: planeStrokeBounds(dragStartPos, currentPos, nPlane),
                  drawBrushInflate: drawBrushInflateParams()
                };
              } else if (strokeModeVal === 'line') {
                strokeBboxHint = {
                  primaryBounds: lineStrokeBounds(
                    dragStartPos,
                    currentPos,
                    !get(lineAxisAlign) && !!dragFaceNormal
                  ),
                  drawBrushInflate: drawBrushInflateParams()
                };
              }
            }
            // Clay path modes: show thickened preview (brush radius); airbrush: droplet preview
            updatePreviewMesh(
              thickenPathForStroke(pendingStrokePositions, {
                strokeMode:
                  isAirbrushPath && !isClayPathFollow
                    ? 'airbrush'
                    : (strokeModeVal ?? get(strokeMode)),
                clayMode: isClayPathFollow ? clayPathMode : undefined,
                clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
                bulkBrushShape: get(bulkBrushShape),
                branchTaper: get(branchTaper),
                branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
                branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
                airbrushRadius: (get(airbrushRadius) as number) * 0.5,
                airbrushScatter: get(airbrushScatter),
                airbrushRadiusRange: get(airbrushRadiusRange),
                airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
                airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
                airbrushBrushShape: get(airbrushBrushShape),
                ...airbrushPlaneParamsForStroke(),
                planeAxis: get(planeAxis),
                sprayDirection: get(sprayDirection),
                sprayStreakLength: get(sprayStreakLength),
                wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
                wallHeight: get(wallHeight),
                wallFaceNormal: dragFaceNormal
                  ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
                  : undefined,
                drawBrushShape: get(drawBrushShape),
                drawBrushSize: get(drawBrushSize) * 0.5,
                drawBrushSnapToSurface: get(drawBrushSnapToSurface),
                drawBrushFaceNormal: dragFaceNormal
                  ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
                  : undefined,
                seed: currentStrokeSeed
              }),
              strokeBboxHint
            );
            deltaDisplay = {
              dx: currentPos[0] - dragStartPos[0],
              dy: currentPos[1] - dragStartPos[1],
              dz: currentPos[2] - dragStartPos[2]
            };
          } else {
            deltaDisplay = null;
          }
        }
        render();
        return;
      }
      deltaDisplay = null;
      // Cuboid depth phase: preserve preview when idle (not dragging)
      if (cuboidPhase === 'depth' && cuboidPlane) {
        render();
        return;
      }
      // Rope tension phase: idle clay path below calls updatePreviewMesh([]) every move — keep catenary preview
      if (ropePhase === 'tension') {
        rollOverMesh.visible = false;
        render();
        return;
      }
      // Polygon / roof: preserve point loop preview, show rollOver for next point
      if (polygonPhase || roofPhase) {
        const hit = getIntersection();
        if (hit && hit.object !== polygonPointsMesh) {
          const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
          if (pos) {
            rollOverMesh.position.set(pos[0], pos[1], pos[2]);
            rollOverMesh.visible = true;
          } else {
            rollOverMesh.visible = false;
          }
        } else {
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Stamp / punch hover preview
      if (($tool === 'stamp' || $tool === 'punch') && hasStampLikePattern() && !isStampDrag) {
        const hit = getIntersection();
        if (hit) {
          const normal = getFaceNormalFromHit(hit);
          const place = $tool === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
          if (place && normal) {
            updatePreviewMesh(
              $tool === 'punch'
                ? getPunchPositionsForFace(place, normal)
                : getStampPositionsForFace(place, normal)
            );
            rollOverMesh.visible = false;
          } else {
            updatePreviewMesh([]);
            rollOverMesh.visible = false;
          }
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Rocks hover preview (same seed and cluster logic as placement so preview matches)
      if ($tool === 'rocks') {
        const hit = getIntersection();
        if (hit) {
          const place = getAddPosition(hit);
          const normal = getFaceNormalFromHit(hit);
          if (place && normal) {
            if (nextRockPlacementSeed === 0) {
              nextRockPlacementSeed = Math.floor(Math.random() * 0xffffffff);
            }
            const size = get(rockSize) as number;
            const roughness = get(rockRoughness) as number;
            const count = get(rockCount) as number;
            const clusterR = get(rockClusterRadius) as number;
            const sinkDir = get(rockSinkDirection) as 'none' | 'under' | 'over';
            const sinkAmount = get(rockSinkAmount) as number;
            const N = sinkDir !== 'none' ? Math.min(5, Math.max(0, sinkAmount)) : 0;
            const surfaceTarget: [number, number, number] =
              sinkDir === 'under'
                ? [
                    place[0] - (1 + N) * normal[0],
                    place[1] - (1 + N) * normal[1],
                    place[2] - (1 + N) * normal[2]
                  ]
                : sinkDir === 'over'
                  ? [
                      place[0] + (N - 1) * normal[0],
                      place[1] + (N - 1) * normal[1],
                      place[2] + (N - 1) * normal[2]
                    ]
                  : [place[0] - normal[0], place[1] - normal[1], place[2] - normal[2]];
            const previewPositions: [number, number, number][] = [];
            for (let i = 0; i < count; i++) {
              const rng = nextRockClusterRng(nextRockPlacementSeed + i);
              const dx = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
              const dy = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
              const dz = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
              const placeI: [number, number, number] = [
                place[0] + dx,
                place[1] + dy,
                place[2] + dz
              ];
              const localPositions = getRockPositions(nextRockPlacementSeed + i, size, roughness);
              const bounds = getBoundsFromPositions(localPositions);
              if (!bounds) continue;
              const halfW = (bounds.maxX - bounds.minX) / 2;
              const halfH = (bounds.maxY - bounds.minY) / 2;
              const halfD = (bounds.maxZ - bounds.minZ) / 2;
              const targetForStamp: [number, number, number] = [
                normal[0] ? surfaceTarget[0] : placeI[0] - halfW,
                normal[1] ? surfaceTarget[1] : placeI[1] - halfH,
                normal[2] ? surfaceTarget[2] : placeI[2] - halfD
              ];
              const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
              for (const [lx, ly, lz] of localPositions) {
                previewPositions.push([lx + ox, ly + oy, lz + oz]);
              }
            }
            updatePreviewMesh(previewPositions);
            rollOverMesh.visible = false;
          } else {
            updatePreviewMesh([]);
            rollOverMesh.visible = false;
          }
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Grass hover preview (same seed as placement so preview matches)
      if ($tool === 'grass') {
        const hit = getIntersection();
        if (hit) {
          const place = getAddPosition(hit);
          const normal = getFaceNormalFromHit(hit);
          if (place && normal) {
            if (nextGrassPlacementSeed === 0) {
              nextGrassPlacementSeed = Math.floor(Math.random() * 0xffffffff);
            }
            const radius = get(grassRadius) as number;
            const density = get(grassDensity) as number;
            const height = get(grassHeight) as number;
            const previewPositions = getGrassPositions(
              nextGrassPlacementSeed,
              place,
              normal,
              radius,
              density,
              height
            );
            updatePreviewMesh(previewPositions);
            rollOverMesh.visible = false;
          } else {
            updatePreviewMesh([]);
            rollOverMesh.visible = false;
          }
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Piscina: preview + gizmo only after face lock (shape phase)
      if ($tool === 'piscina') {
        if (piscinaPhase === 'shape' && piscinaLockedPlace && piscinaLockedNormal) {
          if (nextPiscinaPlacementSeed === 0) {
            nextPiscinaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
          }
          const place = piscinaLockedPlace;
          const normal = piscinaLockedNormal;
          const opts = buildPiscinaOptionsFromStores();
          updatePreviewMesh(getPiscinaPositions(nextPiscinaPlacementSeed, place, normal, opts));
          rollOverMesh.visible = false;
        } else if (piscinaPhase === 'pick') {
          const hit = getIntersection();
          if (hit) {
            const place = getAddPosition(hit);
            const normal = getFaceNormalFromHit(hit);
            if (place && normal) {
              if (nextPiscinaPlacementSeed === 0) {
                nextPiscinaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
              }
              piscinaHoverPlace = place;
              piscinaHoverNormal = normal;
              const opts = buildPiscinaOptionsFromStores();
              updatePreviewMesh(getPiscinaPositions(nextPiscinaPlacementSeed, place, normal, opts));
            } else {
              piscinaHoverPlace = null;
              piscinaHoverNormal = null;
              updatePreviewMesh([]);
            }
          } else {
            piscinaHoverPlace = null;
            piscinaHoverNormal = null;
            updatePreviewMesh([]);
          }
          rollOverMesh.visible = false;
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Flora hover preview (same seed as placement so preview matches)
      if ($tool === 'flora') {
        const hit = getIntersection();
        if (hit) {
          const place = getAddPosition(hit);
          const normal = getFaceNormalFromHit(hit);
          if (place && normal) {
            if (nextFloraPlacementSeed === 0) {
              nextFloraPlacementSeed = Math.floor(Math.random() * 0xffffffff);
            }
            const floraOpts = buildFloraOptionsFromStores();
            const previewPositions = getFloraPositions(
              nextFloraPlacementSeed,
              place,
              normal,
              floraOpts
            );
            updatePreviewMesh(previewPositions);
            rollOverMesh.visible = false;
          } else {
            updatePreviewMesh([]);
            rollOverMesh.visible = false;
          }
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      // Ashlar hover preview
      if ($tool === 'ashlar') {
        const hit = getIntersection();
        if (hit) {
          const place = getAddPosition(hit);
          const normal = getFaceNormalFromHit(hit);
          if (place && normal) {
            if (nextAshlarPlacementSeed === 0) {
              nextAshlarPlacementSeed = Math.floor(Math.random() * 0xffffffff);
            }
            const size = get(ashlarSize) as number;
            const roughness = get(ashlarRoughness) as number;
            const thickness = get(ashlarThickness) as number;
            const thicknessAxis = getAshlarThicknessAxis(normal);
            const surfaceTarget: [number, number, number] = [
              place[0] - normal[0],
              place[1] - normal[1],
              place[2] - normal[2]
            ];
            const localPositions = getAshlarPositions(
              nextAshlarPlacementSeed,
              size,
              roughness,
              thickness,
              thicknessAxis
            );
            const bounds = getBoundsFromPositions(localPositions);
            if (bounds) {
              const halfW = (bounds.maxX - bounds.minX) / 2;
              const halfH = (bounds.maxY - bounds.minY) / 2;
              const halfD = (bounds.maxZ - bounds.minZ) / 2;
              const targetForStamp: [number, number, number] = [
                normal[0] ? surfaceTarget[0] : place[0] - halfW,
                normal[1] ? surfaceTarget[1] : place[1] - halfH,
                normal[2] ? surfaceTarget[2] : place[2] - halfD
              ];
              const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
              const previewPositions = localPositions.map(
                ([lx, ly, lz]) => [lx + ox, ly + oy, lz + oz] as [number, number, number]
              );
              updatePreviewMesh(previewPositions);
            } else {
              updatePreviewMesh([]);
            }
            rollOverMesh.visible = false;
          } else {
            updatePreviewMesh([]);
            rollOverMesh.visible = false;
          }
        } else {
          updatePreviewMesh([]);
          rollOverMesh.visible = false;
        }
        render();
        return;
      }
      if (
        get(effectiveStrokeMode) === 'precise' &&
        precisePhase === 'armed' &&
        preciseAnchor &&
        preciseNormal
      ) {
        if (event) updatePointerFromEvent(event);
        updatePreciseGuidePlane();
        const planePos = getIntersectionWithPlane(
          setPreciseWorkPlanePoint(preciseAnchor, preciseNormal, preciseWorkPlanePointScratch),
          preciseNormal
        );
        updatePreciseGuideLight(planePos);
        applyPrecisePreviewRenderOrder();
        if (planePos) {
          rollOverMesh.position.set(planePos[0], planePos[1], planePos[2]);
          rollOverMesh.visible = true;
          preciseLocationHint = { x: planePos[0], y: planePos[1], z: planePos[2] };
        } else {
          rollOverMesh.visible = false;
          preciseLocationHint = null;
        }
        // Only highlight anchor while armed; full plane preview starts on drag (placing).
        pendingStrokePositions = [preciseAnchor];
        updatePreviewMesh(pendingStrokePositions);
        render();
        return;
      }
      if ($tool !== 'voxel' && $tool !== 'clay' && $tool !== 'remove' && $tool !== 'paint') {
        rollOverMesh.visible = false;
        updatePreviewMesh([]);
        render();
        return;
      }
      const hit = getIntersection();
      if (!hit || !hit.face) {
        rollOverMesh.visible = false;
        if (get(effectiveStrokeMode) === 'airbrush') updatePreviewMesh([]);
        render();
        return;
      }
      if (get(effectiveStrokeMode) === 'airbrush') {
        let anchorPos: [number, number, number] | null = null;
        if ($tool === 'remove' || $tool === 'paint') {
          const voxelPos = getVoxelPosition(hit);
          if (voxelPos && $voxels.has(coordKey(voxelPos[0], voxelPos[1], voxelPos[2]))) {
            anchorPos = voxelPos;
          }
        } else {
          const addPos = getAddPosition(hit);
          if (addPos && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
            anchorPos = addPos;
          }
        }
        if (anchorPos) {
          let hoverPos: [number, number, number] = anchorPos;
          const hoverPlaneN = getAirbrushHoverConstrainPlaneNormal(hit);
          if (hoverPlaneN) {
            const planePoint = new THREE.Vector3(
              anchorPos[0] + 0.5,
              anchorPos[1] + 0.5,
              anchorPos[2] + 0.5
            );
            const planePos = getIntersectionWithPlane(planePoint, hoverPlaneN);
            if (planePos) hoverPos = planePos;
          }
          const fn = getFaceNormalFromHit(hit);
          const faceN = fn ? new THREE.Vector3(fn[0], fn[1], fn[2]) : null;
          rollOverMesh.visible = false;
          updatePreviewMesh(
            thickenPathForStroke([hoverPos], {
              strokeMode: 'airbrush',
              clayMode: undefined,
              clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
              bulkBrushShape: get(bulkBrushShape),
              branchTaper: get(branchTaper),
              branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
              branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
              airbrushRadius: (get(airbrushRadius) as number) * 0.5,
              airbrushScatter: get(airbrushScatter),
              airbrushRadiusRange: get(airbrushRadiusRange),
              airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
              airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
              airbrushBrushShape: get(airbrushBrushShape),
              ...airbrushPlaneParamsForFaceNormal(faceN),
              planeAxis: get(planeAxis),
              sprayDirection: get(sprayDirection),
              sprayStreakLength: get(sprayStreakLength),
              wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
              wallHeight: get(wallHeight),
              wallFaceNormal: faceN ? { x: faceN.x, y: faceN.y, z: faceN.z } : undefined,
              drawBrushShape: get(drawBrushShape),
              drawBrushSize: get(drawBrushSize) * 0.5,
              drawBrushSnapToSurface: get(drawBrushSnapToSurface),
              drawBrushFaceNormal: faceN ? { x: faceN.x, y: faceN.y, z: faceN.z } : undefined,
              seed: 0
            })
          );
        } else {
          rollOverMesh.visible = false;
          updatePreviewMesh([]);
        }
        render();
        return;
      }
      if ($tool === 'voxel' || $tool === 'clay') {
        const addPos = getAddPosition(hit);
        if (addPos && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
          rollOverMesh.position.set(addPos[0], addPos[1], addPos[2]);
          rollOverMesh.visible = true;
        } else {
          rollOverMesh.visible = false;
        }
      } else {
        rollOverMesh.visible = false;
      }
      updatePreviewMesh([]);
      render();
    } finally {
      selectionGizmo?.syncGizmoHoverCursor();
    }
  }

  const TOOLTIP_OFFSET = 12;
  const TOOLTIP_MARGIN = 8;
  const TOOLTIP_ESTIMATE = { w: 100, h: 24 };

  function updatePointerFromEvent(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const desiredX = rawX + TOOLTIP_OFFSET;
    const desiredY = rawY + TOOLTIP_OFFSET;
    const maxX = rect.width - TOOLTIP_ESTIMATE.w - TOOLTIP_MARGIN;
    const maxY = rect.height - TOOLTIP_ESTIMATE.h - TOOLTIP_MARGIN;
    pointerScreen = {
      x: Math.max(TOOLTIP_MARGIN, Math.min(maxX, desiredX)),
      y: Math.max(TOOLTIP_MARGIN, Math.min(maxY, desiredY))
    };
  }

  function onContainerPointerLeave() {
    selectionGizmo?.clearGizmoHoverCursor();
  }

  function onPointerMove(event: PointerEvent) {
    handlePointerMove(event);
  }

  function onPointerDown(event: PointerEvent) {
    void handlePointerDown(event);
  }

  async function onPointerUp(event: PointerEvent) {
    if (handleFlyPointerUp(pointerHandlerContext, event)) return;
    if (depthAdjustPointerId === event.pointerId) {
      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      depthAdjustPointerId = null;
    }
    if (event.button === 2 && (isVoxelDrag || selectionGizmo?.isGizmoDrag || cuboidPhase)) {
      cancelDrag();
    }
    const gizmoCommit = selectionGizmo?.tryPrimaryPointerUp(event);
    if (gizmoCommit) {
      const gizmoAxis = gizmoCommit.axis;
      if (!gizmoCommit.wasPlacement && gizmoAxis !== null && gizmoCommit.steps !== 0) {
        runVoxelStroke(() => {
          if (gizmoCommit.kind === 'rotate')
            applySelectionRotationInStroke(gizmoAxis, gizmoCommit.steps);
          else applySelectionTranslationAlongAxis(gizmoAxis, gizmoCommit.steps);
        });
      }
      render();
    }
    if (event.button === 0 && isStampDrag) {
      updatePointerFromEvent(event);
      let place = lastStampPlace;
      let normal = lastStampNormal;
      const hit = getIntersection();
      if (hit && stampLikeDragMode) {
        const n = getFaceNormalFromHit(hit);
        const p = stampLikeDragMode === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
        if (p && n) {
          place = p;
          normal = n;
        }
      }
      if (place && normal && stampLikeDragMode) {
        if (stampLikeDragMode === 'punch') {
          placePunch(place, normal);
        } else {
          placeStamp(place, normal);
        }
      }
      stampLikeDragMode = null;
      isStampDrag = false;
      lastStampPlace = null;
      lastStampNormal = null;
      updatePreviewMesh([]);
      if (dragPointerId !== null) {
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        dragPointerId = null;
      }
    }
    applyGeneratorFaceClickPointerUp(
      buildVoxelGeneratorPrimaryPointerUpDeps(voxelGeneratorPrimaryPointerUpBridge),
      event
    );
    if (event.button === 0 && isVoxelDrag) {
      updatePointerFromEvent(event);
      const mode = get(effectiveStrokeMode);
      const clayModeVal = get(clayMode);
      const isClayPath =
        $tool === 'clay' &&
        (clayModeVal === 'bulk' ||
          clayModeVal === 'smooth' ||
          clayModeVal === 'level' ||
          clayModeVal === 'gouge' ||
          clayModeVal === 'branch' ||
          clayModeVal === 'melt' ||
          clayModeVal === 'wall' ||
          clayModeVal === 'inflate');
      const normal = getEffectivePlaneNormal();
      if (mode === 'precise' && dragStartPos && preciseNormal && !isClayPath) {
        const toApply = pendingStrokePositions.length > 0 ? pendingStrokePositions : [dragStartPos];
        if (toApply.length > 0) {
          if ($tool === 'select') {
            applySelectStroke(toApply, selectionModeForCurrentGesture ?? get(selectionMode));
          } else {
            runVoxelStroke(() => applyLineStroke(toApply));
          }
        }
        pendingStrokePositions = [];
        updatePreviewMesh([]);
        resetPreciseState(false);
      } else if (mode === 'cuboid' && dragStartPos && normal && !isClayPath) {
        // Enter depth phase: drag plane, then scroll for depth
        let cornerB = dragStartPos;
        const planePoint = new THREE.Vector3(
          dragStartPos[0] + 0.5,
          dragStartPos[1] + 0.5,
          dragStartPos[2] + 0.5
        );
        const planePos = getIntersectionWithPlane(planePoint, normal);
        if (planePos) {
          cornerB = planePos;
        } else {
          const hit = getIntersection();
          if (hit) {
            const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
            if (pos) cornerB = pos;
          }
        }
        cuboidPhase = 'depth';
        cuboidPlane = {
          a: dragStartPos,
          b: cornerB,
          normal
        };
        cuboidDepth = 1;
        updateCuboidFromDepth();
      } else {
        // Apply the stroke on release (line/plane / clay modes)
        if (pendingStrokePositions.length > 0) {
          const isClayPath =
            $tool === 'clay' &&
            (clayModeVal === 'bulk' ||
              clayModeVal === 'smooth' ||
              clayModeVal === 'level' ||
              clayModeVal === 'gouge' ||
              clayModeVal === 'branch' ||
              clayModeVal === 'melt' ||
              clayModeVal === 'wall' ||
              clayModeVal === 'inflate');
          const toApply = thickenPathForStroke(pendingStrokePositions, {
            strokeMode: mode ?? get(strokeMode),
            clayMode: isClayPath ? clayModeVal : undefined,
            clayBrushRadius: (get(clayBrushRadius) as number) * 0.5,
            bulkBrushShape: get(bulkBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            airbrushRadius: (get(airbrushRadius) as number) * 0.5,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin) * 0.5,
            airbrushRadiusMax: get(airbrushRadiusMax) * 0.5,
            airbrushBrushShape: get(airbrushBrushShape),
            ...airbrushPlaneParamsForStroke(),
            planeAxis: get(planeAxis),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize) * 0.5,
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            seed: currentStrokeSeed
          });
          if ($tool === 'select') {
            applySelectStroke(toApply, selectionModeForCurrentGesture ?? get(selectionMode));
          } else if (isClayPath) {
            runVoxelStroke(() => applyClayStroke(toApply, clayModeVal, dragStartPos?.[1] ?? 0));
          } else {
            runVoxelStroke(() => applyLineStroke(toApply));
          }
        }
        pendingStrokePositions = [];
        updatePreviewMesh([]);
      }
      isVoxelDrag = false;
      selectionModeForCurrentGesture = null;
      dragStartPos = null;
      dragFaceNormal = null;
      dragPlaneAxisOverride = null;
      lastBulkPos = null;
      clearShiftPlaneSymmetryState();
      dragPointerId = null;
    }
    updatePointerFromEvent(event);
    handlePointerMove();
  }

  function onPointerCancel(event: PointerEvent) {
    if (depthAdjustPointerId === event.pointerId) {
      depthAdjustPointerId = null;
    }
    if (isVoxelDrag || selectionGizmo?.isGizmoDrag || isStampDrag) {
      cancelDrag();
    }
    handlePointerMove();
  }

  function onContextMenu(event: Event) {
    if (isVoxelDrag || selectionGizmo?.isGizmoDrag || $tool === 'fly') event.preventDefault();
  }

  function onEscapeKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && fillBusy) {
      cancelActiveFill();
      e.preventDefault();
    }
    if (e.key === 'Escape' && precisePhase !== 'idle') {
      resetPreciseState(true);
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && polygonPhase) {
      cancelPolygon();
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && roofPhase) {
      cancelRoof();
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && get(tool) === 'piscina' && piscinaPhase === 'shape') {
      pickAgainPiscina();
      e.preventDefault();
    }
    if (e.key === 'Enter' && get(tool) === 'piscina' && piscinaPhase === 'shape') {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        commitPiscinaFish();
        e.preventDefault();
      }
    }
  }

  function onFullscreenKey(e: KeyboardEvent) {
    const target = document.activeElement;
    const isInput =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
    if (isInput) return;
    if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!container) return;
    e.preventDefault();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }

  function onFullscreenChange() {
    onWindowResize();
    // Browsers can finalize fullscreen exit layout on a later frame.
    requestAnimationFrame(() => onWindowResize());
  }

  // Block pointer events from reaching FlyControls when in fly mode (we handle them ourselves)
  function onFlyPointerCapture(e: PointerEvent) {
    if ($tool === 'fly') e.stopPropagation();
  }

  function onWheel(event: WheelEvent) {
    if ($addPanelStore.open) {
      const addMax = Math.min(1024, MAX_GRID_SIZE);
      if (event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        if ($addPanelStore.mode !== 'paste') {
          const d = event.deltaY < 0 ? 1 : -1;
          addPanelStore.update((s) => ({
            ...s,
            size: Math.max(1, Math.min(addMax, Math.floor(s.size) + d))
          }));
        }
        render();
        return;
      }
      if (event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        const d = event.deltaY < 0 ? 1 : -1;
        addPanelStore.update((s) => ({
          ...s,
          rotX: ((((Math.floor(s.rotX) + d) % 4) + 4) % 4) & 3
        }));
        render();
        return;
      }
      if (event.altKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const d = event.deltaY < 0 ? 1 : -1;
        addPanelStore.update((s) => ({
          ...s,
          rotY: ((((Math.floor(s.rotY) + d) % 4) + 4) % 4) & 3
        }));
        render();
        return;
      }
      if (event.altKey && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const d = event.deltaY < 0 ? 1 : -1;
        addPanelStore.update((s) => ({
          ...s,
          rotZ: ((((Math.floor(s.rotZ) + d) % 4) + 4) % 4) & 3
        }));
        render();
        return;
      }
    }
    // Alt+scroll during plane/cuboid drag: cycle plane orientation (X/Y/Z)
    const mode = get(effectiveStrokeMode);
    if (
      event.altKey &&
      isVoxelDrag &&
      (mode === 'plane' || mode === 'circle' || mode === 'cuboid') &&
      dragStartPos &&
      getEffectivePlaneNormal()
    ) {
      event.preventDefault();
      event.stopPropagation();
      const normal = getEffectivePlaneNormal()!;
      const ax = Math.abs(normal.x);
      const ay = Math.abs(normal.y);
      const az = Math.abs(normal.z);
      const current: 0 | 1 | 2 = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
      const next: 0 | 1 | 2 =
        event.deltaY < 0 ? (((current + 1) % 3) as 0 | 1 | 2) : (((current + 2) % 3) as 0 | 1 | 2);
      dragPlaneAxisOverride = next;
      const planePoint = new THREE.Vector3(
        dragStartPos[0] + 0.5,
        dragStartPos[1] + 0.5,
        dragStartPos[2] + 0.5
      );
      let currentPos = getIntersectionWithPlane(planePoint, axisVector(next)) ?? null;
      if (currentPos === null) {
        const hit = getIntersection();
        currentPos = hit ? ($tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit)) : null;
      }
      let altScrollBbox: StrokePreviewBboxHint | null = null;
      if (currentPos) {
        const hollow = get(planeCuboidHollow);
        const hollowWall = mode === 'circle' ? 1 : clampPlaneCuboidHollowWallThickness();
        const n = axisVector(next);
        pendingStrokePositions =
          mode === 'circle'
            ? getAxisAlignedCircleFromNormal(dragStartPos, currentPos, n, hollow, hollowWall)
            : getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, n, hollow, hollowWall);
        if (mode === 'plane' || mode === 'cuboid') {
          altScrollBbox = {
            primaryBounds: planeStrokeBounds(dragStartPos, currentPos, n),
            drawBrushInflate: drawBrushInflateParams()
          };
        }
      }
      updatePreviewMesh(pendingStrokePositions, altScrollBbox);
      render();
      return;
    }

    if ($tool === 'fly') return;
    const oc = orbitControls;
    if (!oc?.enabled || !oc.enableZoom) return;
    if ((oc as OrbitControls & { state?: number }).state !== ORBIT_INTERNAL_STATE_NONE) return;
    event.preventDefault();
    event.stopPropagation();
    pendingOrbitWheelDeltaSum += orbitWheelNormalizedDeltaY(event);
    pendingOrbitWheelClientX = event.clientX;
    pendingOrbitWheelClientY = event.clientY;
  }

  function updateOrthoFrustum() {
    if (!orthographicCamera || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const aspect = w / h;
    const v = $voxels;
    const b =
      v.size > 0 ? getBoundsFromPositions([...v.keys()].map((k) => parseCoordKey(k))) : null;
    const extent = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) + 2 : $gridSize;
    const frustumHeight = Math.max(extent * 2, 256);
    const frustumWidth = frustumHeight * aspect;
    orthographicCamera.left = -frustumWidth / 2;
    orthographicCamera.right = frustumWidth / 2;
    orthographicCamera.top = frustumHeight / 2;
    orthographicCamera.bottom = -frustumHeight / 2;
    orthographicCamera.updateProjectionMatrix();
  }

  const BLOOM_MIX_VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const BLOOM_MIX_FRAGMENT = /* glsl */ `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    uniform float bloomStrength;
    varying vec2 vUv;
    void main() {
      gl_FragColor =
        texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv) * bloomStrength;
    }
  `;

  function disposeSelectiveBloomPipeline() {
    webgpuBloomPipeline?.dispose();
    webgpuBloomPipeline = null;
    unrealBloomPass?.dispose();
    unrealBloomPass = null;
    bloomMixPass?.dispose();
    bloomMixPass = null;
    bloomOutputPass?.dispose();
    bloomOutputPass = null;
    bloomComposer?.dispose();
    bloomComposer = null;
    finalComposer?.dispose();
    finalComposer = null;
    sharedSceneRenderPass = null;
    if (bloomDarkMaterial) {
      bloomDarkMaterial.dispose();
      bloomDarkMaterial = null;
    }
    bloomPassBackground = null;
  }

  function ensureBloomAuxMaterials() {
    if (!bloomDarkMaterial) {
      bloomDarkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    }
    if (!bloomPassBackground) {
      bloomPassBackground = new THREE.Color(0x000000);
    }
  }

  function setupSelectiveBloomPipeline() {
    if (!renderer || !scene || !camera || !container) return;
    if (!isWebGLRenderer(renderer)) {
      ensureBloomAuxMaterials();
      return;
    }
    disposeSelectiveBloomPipeline();
    ensureBloomAuxMaterials();

    const w = container.clientWidth;
    const h = container.clientHeight;
    // Safari/WebGL2 can report sampler-type mismatches with float/half-float post targets
    // when mixed with shadow/transmission sampling in the same frame. Use normalized RGBA8.
    const bloomRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace
    });
    const finalRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace
    });

    sharedSceneRenderPass = new RenderPass(scene, camera);
    unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.58, 0.42, 0.15);

    bloomComposer = new EffectComposer(renderer, bloomRenderTarget);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(sharedSceneRenderPass);
    bloomComposer.addPass(unrealBloomPass);

    const mixMaterial = new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
        bloomStrength: { value: 1.05 }
      },
      vertexShader: BLOOM_MIX_VERTEX,
      fragmentShader: BLOOM_MIX_FRAGMENT,
      defines: {}
    });
    bloomMixPass = new ShaderPass(mixMaterial, 'baseTexture');
    bloomMixPass.needsSwap = true;

    bloomOutputPass = new OutputPass();
    finalComposer = new EffectComposer(renderer, finalRenderTarget);
    finalComposer.addPass(sharedSceneRenderPass);
    finalComposer.addPass(bloomMixPass);
    finalComposer.addPass(bloomOutputPass);

    bloomComposer.setSize(w, h);
    finalComposer.setSize(w, h);
  }

  async function setupWebGPUBloomPipeline() {
    if (!renderer || !scene || !camera || !container) return;
    if (!isWebGPURenderer(renderer)) return;
    ensureBloomAuxMaterials();
    webgpuBloomPipeline?.dispose();
    webgpuBloomPipeline = null;
    try {
      webgpuBloomPipeline = await createWebGPUBloomPipeline(
        renderer,
        scene,
        camera,
        container.clientWidth,
        container.clientHeight,
        renderer.getPixelRatio()
      );
    } catch (e) {
      console.warn('Voxelle: WebGPU TSL bloom disabled', e);
    }
  }

  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    const maxPr = Math.max(0, get(voxellePreferences).maxPixelRatio);
    const targetPr = maxPr > 0 ? Math.min(window.devicePixelRatio, maxPr) : window.devicePixelRatio;
    renderer.setPixelRatio(targetPr);
    if (camera instanceof THREE.OrthographicCamera) {
      updateOrthoFrustum();
    } else {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    // Keep canvas CSS-driven (100% of container) to avoid stale inline sizes after fullscreen toggles.
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    bloomComposer?.setPixelRatio(pr);
    bloomComposer?.setSize(w, h);
    finalComposer?.setPixelRatio(pr);
    finalComposer?.setSize(w, h);
    if (webgpuBloomPipeline && container) {
      webgpuBloomPipeline.setSize(container.clientWidth, container.clientHeight, pr);
    }
    render();
  }

  function render() {
    moveGizmoDragLabel = null;
    if (renderer && scene && camera) {
      selectionGizmo?.updateGizmoPreviewOffset();
      selectionGizmo?.updateMoveGizmoTransform();
      scene.updateMatrixWorld(true);

      if (meshManager && get(enableShadows) && !canvasIsWebGPU) {
        const glassUniformsChanged = syncGlassShadowUniformsFromBuckets(
          meshManager.getMeshesByBucket()
        );
        if (glassUniformsChanged) invalidateDirectionalShadowMap();
      }

      const dragDelta =
        get(voxellePreferences).showDragDeltaHint && selectionGizmo?.getMoveDragDeltaLabel();
      if (dragDelta && container) {
        const c = getSelectionCenter(get(selection));
        if (c) {
          pointerHelper.set(c[0], c[1], c[2]);
          axisNormalHelper.set(0, 0, -1).applyQuaternion(camera.quaternion);
          centroidToCameraScratch.subVectors(pointerHelper, camera.position);
          if (centroidToCameraScratch.dot(axisNormalHelper) > 0) {
            pointerHelper.set(c[0], c[1], c[2]);
            pointerHelper.project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            const cr = container.getBoundingClientRect();
            const px = (pointerHelper.x * 0.5 + 0.5) * rect.width + (rect.left - cr.left);
            const py = (-pointerHelper.y * 0.5 + 0.5) * rect.height + (rect.top - cr.top);
            const pad = 10;
            const halfW = 72;
            const halfH = 18;
            moveGizmoDragLabel = {
              dx: dragDelta.dx,
              dy: dragDelta.dy,
              dz: dragDelta.dz,
              x: Math.max(halfW + pad, Math.min(cr.width - halfW - pad, px)),
              y: Math.max(halfH + pad, Math.min(cr.height - halfH - pad, py))
            };
          }
        }
      }

      renderVoxelCanvasPrimaryScene({
        renderer,
        scene,
        camera,
        renderingMode: get(renderingMode),
        rayRenderer,
        webgpuBloomPipeline,
        bloomComposer,
        finalComposer,
        sharedSceneRenderPass,
        sceneHasGlowMesh,
        voxelGroup,
        bloomPassBackground,
        bloomDarkMaterial,
        bloomMaterialStash
      });
    }
    gizmoRef?.draw();
  }

  function animate(now?: number) {
    animationFrameId = requestAnimationFrame(animate);
    const t = now ?? performance.now();
    runVoxelCanvasAnimateStep({
      nowMs: t,
      showFpsCounter: get(voxellePreferences).showFpsCounter,
      setFpsCounterDisplayed: (n) => {
        fpsCounterDisplayed = n;
      },
      getFpsCounterPeriodStartMs: () => fpsCounterPeriodStartMs,
      setFpsCounterPeriodStartMs: (n) => {
        fpsCounterPeriodStartMs = n;
      },
      getFpsCounterAccumFrames: () => fpsCounterAccumFrames,
      setFpsCounterAccumFrames: (n) => {
        fpsCounterAccumFrames = n;
      },
      getLastFrameTime: () => lastFrameTime,
      setLastFrameTime: (n) => {
        lastFrameTime = n;
      },
      flyControls,
      camera,
      flyMoveState,
      orbitControls,
      getTool: () => get(tool),
      getPendingOrbitWheelDeltaSum: () => pendingOrbitWheelDeltaSum,
      setPendingOrbitWheelDeltaSum: (n) => {
        pendingOrbitWheelDeltaSum = n;
      },
      getPendingOrbitWheelClientX: () => pendingOrbitWheelClientX,
      getPendingOrbitWheelClientY: () => pendingOrbitWheelClientY,
      orbitZoomScaleFromWheelDelta,
      getRenderingMode: () => get(renderingMode),
      rayRenderer,
      container,
      renderer,
      scene,
      dirLight,
      hemisphereLight,
      getVoxels: () => get(voxels),
      getEnableSky: () => get(enableSky),
      getBackgroundColor: () => get(backgroundColor),
      getAmbientIntensity: () => get(ambientIntensity),
      getSceneEnvironmentIntensity: () => get(sceneEnvironmentIntensity),
      getEnableShadows: () => get(enableShadows),
      getRayTraceContentDirty: () => rayTraceContentDirty,
      setRayTraceContentDirty: (v) => {
        rayTraceContentDirty = v;
      },
      getPrevRayCamInitialized: () => prevRayCamInitialized,
      prevRayCamPos,
      prevRayCamQuat,
      setRayRefinementProgress: (v) => {
        rayRefinementProgress = v;
      },
      isVoxelDrag,
      isStampDrag,
      selectionGizmoDragging: !!selectionGizmo?.isGizmoDrag,
      getCuboidPhase: () => cuboidPhase,
      getPolygonPhase: () => polygonPhase,
      getRoofPhase: () => roofPhase,
      getRopePhase: () => ropePhase,
      getFlyControlsEnabled: () => !!flyControls?.enabled,
      render
    });
  }

  $effect(() => {
    const mode = $effectiveStrokeMode;
    if (mode !== 'cuboid' && cuboidPhase) {
      cuboidPhase = null;
      cuboidPlane = null;
      pendingStrokePositions = [];
      updatePreviewMesh([]);
    }
    if (mode !== 'polygon' && polygonPhase) {
      cancelPolygon();
    }
  });

  $effect(() => {
    const mode = $clayMode;
    if (mode !== 'rope' && ropePhase) {
      cancelRope();
    }
  });

  $effect(() => {
    if (ropePhase !== 'tension') return;
    updateRopeFromTension();
    const unsubT = ropeTension.subscribe(() => updateRopeFromTension());
    const unsubS = ropeBrushShape.subscribe(() => updateRopeFromTension());
    const unsubR = ropeBrushRadius.subscribe(() => updateRopeFromTension());
    const unsubG = ropeGravityDirection.subscribe(() => updateRopeFromTension());
    return () => {
      unsubT();
      unsubS();
      unsubR();
      unsubG();
    };
  });

  $effect(() => {
    void $tool;
    if ($tool !== 'roof' && roofPhase) {
      cancelRoof();
    }
  });

  $effect(() => {
    const t = $roofWindingFlipTick;
    if (!roofPhase) {
      prevRoofWindingFlipTick = t;
      return;
    }
    if (roofPoints.length < 2) {
      prevRoofWindingFlipTick = t;
      return;
    }
    if (t === prevRoofWindingFlipTick) return;
    prevRoofWindingFlipTick = t;
    roofPoints = [...roofPoints].reverse();
    updatePolygonPreview(roofPoints);
    refreshRoofPreviewMesh();
    requestAnimationFrame(() => render());
  });

  $effect(() => {
    if (!roofPhase || roofPoints.length < 4) return;
    void roofPoints;
    void roofPlacementNormal;
    refreshRoofPreviewMesh();
    const u1 = roofStyle.subscribe(() => refreshRoofPreviewMesh());
    const u2 = roofHeight.subscribe(() => refreshRoofPreviewMesh());
    const u3 = roofThickness.subscribe(() => refreshRoofPreviewMesh());
    const u4 = roofShedEdgeIndex.subscribe(() => refreshRoofPreviewMesh());
    const u5 = roofGableOrientation.subscribe(() => refreshRoofPreviewMesh());
    const u6 = roofBreakRatio.subscribe(() => refreshRoofPreviewMesh());
    const u7 = roofWallHeight.subscribe(() => refreshRoofPreviewMesh());
    const u8 = roofParapetHeight.subscribe(() => refreshRoofPreviewMesh());
    const u9 = roofSaltSkew.subscribe(() => refreshRoofPreviewMesh());
    const u10 = roofHollow.subscribe(() => refreshRoofPreviewMesh());
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
      u10();
    };
  });

  $effect(() => {
    if (!polygonPhase || polygonPoints.length < 2) return;
    void polygonPoints;
    void polygonPlacementNormal;
    const syncPolygonFillPreview = () => {
      updatePreviewMesh(
        applyPolygonNormalOffset(
          getPolygonVoxels(polygonPoints),
          polygonPlacementNormal,
          get(polygonOffsetFromNormal)
        )
      );
    };
    syncPolygonFillPreview();
    return polygonOffsetFromNormal.subscribe(() => syncPolygonFillPreview());
  });

  $effect(() => {
    const v = $voxels;
    void $gridSize;
    void $aoStrength;
    void $renderingMode;
    sceneHasGlowMesh = Array.from(v.values()).some((voxel) => voxel.material === 'glow');
    meshManager?.requestRebuildVoxelMeshes(v);
    render();
  });

  $effect(() => {
    void $renderingMode;
    void $voxels;
    void $lightAngle;
    void $lightElevation;
    void $lightColor;
    void $ambientIntensity;
    void $sunlightIntensity;
    void $enableShadows;
    void $enableSky;
    void $backgroundColor;
    void $sceneEnvironmentIntensity;
    void $gridSize;
    void $focalLength;
    void $orthographic;
    // Camera movement is already tracked via `camDirty` in animate(); avoid re-resetting every frame.
    if ($renderingMode === 'ray') rayTraceContentDirty = true;
  });

  $effect(() => {
    if ($activeRendererIsWebGPU === false && $renderingMode === 'ray') {
      renderingMode.set('greedy');
      return;
    }
    if (voxelGroup) voxelGroup.visible = $renderingMode !== 'ray';
    if ($renderingMode === 'ray' && camera) {
      camera.updateMatrixWorld(true);
      prevRayCamPos.copy(camera.position);
      prevRayCamQuat.copy(camera.quaternion);
      prevRayCamInitialized = true;
    } else if ($renderingMode !== 'ray') {
      prevRayCamInitialized = false;
    }
    render();
  });

  $effect(() => {
    void $stampRotation;
    void $stampOriginMode;
    void $punchDepth;
    void $tool;
    void $bookStampPattern;
    const selSize = $selection.size;
    const book = get(bookStampPattern);
    const patternSize = book !== null && book.size > 0 ? book.size : selSize;
    if (!meshManager || !camera) return;
    if (($tool !== 'stamp' && $tool !== 'punch') || patternSize === 0) return;
    const hit = getIntersection();
    if (!hit) return;
    const normal = getFaceNormalFromHit(hit);
    const place = $tool === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
    if (!place || !normal) return;
    updatePreviewMesh(
      $tool === 'punch'
        ? getPunchPositionsForFace(place, normal)
        : getStampPositionsForFace(place, normal)
    );
    render();
  });

  $effect(() => {
    void $piscinaLength;
    void $piscinaWidth;
    void $piscinaThickness;
    void $piscinaSpecies;
    void $piscinaFinDorsal;
    void $piscinaFinAnal;
    void $piscinaFinCaudal;
    void $piscinaFinPectoral;
    void $piscinaFinPelvic;
    void $piscinaFinAdipose;
    void $piscinaShowFinDorsal;
    void $piscinaShowFinAnal;
    void $piscinaShowFinCaudal;
    void $piscinaShowFinPectoral;
    void $piscinaShowFinPelvic;
    void $piscinaShowFinAdipose;
    void $piscinaAnchorOffsetU;
    void $piscinaAnchorOffsetV;
    void $piscinaSpineBend;
    void $piscinaSpineSCurve;
    void $piscinaFinDorsalPitch;
    void $piscinaFinDorsalSweep;
    void $piscinaFinAnalPitch;
    void $piscinaFinDorsalMode;
    void $piscinaFinAnalMode;
    void $piscinaFinCaudalMode;
    void $piscinaFinPectoralMode;
    void $piscinaFinPelvicMode;
    void $piscinaFinAdiposeMode;
    void $piscinaFinDorsalLength;
    void $piscinaFinAnalLength;
    void $piscinaFinDorsalPosition;
    void $piscinaFinCaudalSpread;
    void $piscinaFinPectoralCant;
    void $piscinaFinPectoralSweep;
    void $tool;
    if ($tool !== 'piscina' || nextPiscinaPlacementSeed === 0) return;
    const place = piscinaPhase === 'shape' ? piscinaLockedPlace : piscinaHoverPlace;
    const normal = piscinaPhase === 'shape' ? piscinaLockedNormal : piscinaHoverNormal;
    if (!place || !normal) return;
    const opts = buildPiscinaOptionsFromStores();
    updatePreviewMesh(getPiscinaPositions(nextPiscinaPlacementSeed, place, normal, opts));
    render();
  });

  $effect(() => {
    const sel = $selection;
    rebuildSelectionOverlay(sel);
    render();
    selectionGizmo?.syncGizmoHoverCursor();
  });

  $effect(() => {
    void $selectionGizmoMode;
    render();
    selectionGizmo?.syncGizmoHoverCursor();
  });

  $effect(() => {
    const tm = $voxellePreferences.toneMapping;
    if (renderer) {
      renderer.toneMapping = toneMappingPreferenceToThree(tm);
      render();
    }
  });

  $effect(() => {
    const shadows = $enableShadows;
    if (renderer) {
      renderer.shadowMap.enabled = shadows;
      if (isWebGLRenderer(renderer)) {
        renderer.shadowMap.type = THREE.BasicShadowMap;
      } else if (isWebGPURenderer(renderer)) {
        try {
          const sm = renderer.shadowMap as
            | { transmitted?: boolean; type?: number }
            | null
            | undefined;
          if (sm) {
            sm.transmitted = false;
            sm.type = THREE.BasicShadowMap;
          }
        } catch {
          // WebGPU shadow-map internals may not be fully initialized on this frame.
        }
      }
    }
    if (dirLight) dirLight.castShadow = shadows;
    const byBucket = meshManager?.getMeshesByBucket();
    if (byBucket) {
      for (const { mesh } of byBucket.values()) {
        mesh.castShadow = shadows;
        const matId = mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY];
        mesh.receiveShadow = shadows && $renderingMode !== 'ray' && matId !== 'glass';
      }
    }
    if (shadows) invalidateDirectionalShadowMap();
    render();
  });

  $effect(() => {
    void $enableSky;
    void $backgroundColor;
    void $sceneEnvironmentIntensity;
    syncVoxelMaterialEnvMaps();
    render();
  });

  onMount(async () => {
    window.addEventListener(VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT, onProjectOpenFitCamera);

    const { loadedFromStorage } = await loadVoxelCanvasBootstrapModel({
      loadFromBytes,
      loadFromStorageAsync,
      initCanvas,
      getGridSize: () => get(gridSize)
    });
    const sz = get(gridSize);

    const setupRefs = await createSceneSetupAsync(
      container,
      {
        gridSize: sz,
        colorHex: hexToInt($color),
        lightColorHex: hexToInt($lightColor),
        focalLength: get(focalLength),
        backgroundColorHex: hexToInt($backgroundColor),
        enableShadows: $enableShadows,
        lightAngle: $lightAngle,
        lightElevation: $lightElevation,
        directionalLightIntensity: get(sunlightIntensity),
        aspect: container ? container.clientWidth / container.clientHeight : 1
      },
      get(voxellePreferences).rendererBackend,
      get(voxellePreferences).maxPixelRatio
    );
    canvasIsWebGPU = setupRefs.isWebGPU;
    activeRendererIsWebGPU.set(canvasIsWebGPU);
    scene = setupRefs.scene;
    perspectiveCamera = setupRefs.perspectiveCamera;
    orthographicCamera = setupRefs.orthographicCamera;
    camera = get(orthographic) ? orthographicCamera : perspectiveCamera;
    renderer = setupRefs.renderer;
    renderer.toneMapping = toneMappingPreferenceToThree(get(voxellePreferences).toneMapping);
    envMap = setupRefs.envMap;
    voxelGroup = setupRefs.voxelGroup;
    rollOverMesh = setupRefs.rollOverMesh;
    rollOverMaterial = setupRefs.rollOverMaterial;
    boxGeometry = setupRefs.boxGeometry;
    selectionGroup = setupRefs.selectionGroup;

    previewMesh = setupRefs.previewMesh;
    previewMaterial = setupRefs.previewMaterial;
    const preciseGuide = createPreciseGuidePlaneInScene(scene);
    preciseGuidePlaneCtx = preciseGuide.ctx;
    preciseGuidePlaneTexture = preciseGuide.texture;
    preciseGuidePlaneMaterial = preciseGuide.material;
    preciseGuidePlaneMesh = preciseGuide.mesh;
    redrawPreciseGuideTexture();
    addPreviewMesh = setupRefs.addPreviewMesh;
    addPreviewMaterial = setupRefs.addPreviewMaterial;
    addPreviewOccludedMesh = setupRefs.addPreviewOccludedMesh;
    addPreviewOccludedMaterial = setupRefs.addPreviewOccludedMaterial;
    polygonLineMaterial = setupRefs.polygonLineMaterial;
    polygonLineSegments = setupRefs.polygonLineSegments;
    polygonPointsMesh = setupRefs.polygonPointsMesh;
    polygonPointsMaterial = setupRefs.polygonPointsMaterial;
    ropePointsMesh = setupRefs.ropePointsMesh;
    ropePointsMaterial = setupRefs.ropePointsMaterial;
    hemisphereLight = setupRefs.hemisphereLight;
    dirLight = setupRefs.dirLight;
    sky = setupRefs.sky;
    groundPlane = setupRefs.groundPlane;
    updateSkyLightingColors();
    gridGroup = setupRefs.gridGroup;
    gridLineMaterial = setupRefs.gridLineMaterial;
    orbitControls = setupRefs.orbitControls;
    flyControls = setupRefs.flyControls;
    raycaster = setupRefs.raycaster;
    pointer = setupRefs.pointer;
    flyControls.pointerSpeed = FLY_POINTER_SPEED;
    try {
      setupSelectiveBloomPipeline();
    } catch (e) {
      console.warn('Voxelle: selective bloom disabled', e);
    }
    await setupWebGPUBloomPipeline();
    orbitControls.addEventListener('change', updateZoomPercent);

    meshManager = createMeshManager(
      setupRefs,
      () => ({
        enableShadows: $enableShadows,
        renderingMode: $renderingMode,
        aoStrength: isVoxelDrag ? 0 : $aoStrength,
        sceneEnvironmentIntensity: $sceneEnvironmentIntensity
      }),
      {
        onLoadingChange: () => {},
        onSpinnerChange: (v) => (showGreedyMeshSpinner = v),
        onVoxelMeshesRebuilt: ({ hasGlowMesh }) => {
          sceneHasGlowMesh = hasGlowMesh;
          invalidateDirectionalShadowMap();
          syncVoxelMaterialEnvMaps();
        },
        render
      }
    );
    meshManager.buildGrid(sz, $voxels);
    gridGroup.visible = $showGrid;

    rayPickProxy = new THREE.Object3D();
    rayRenderer = new VoxelRayTsl();
    if (get(renderingMode) === 'ray') {
      voxelGroup.visible = false;
      scene.background =
        rayRenderer?.output.beautyTexture ?? new THREE.Color(hexToInt(get(backgroundColor)));
    }

    const moveDragLineMat = new THREE.LineBasicMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.52,
      depthTest: true,
      depthWrite: false
    });
    moveDragLine = new THREE.LineSegments(new THREE.BufferGeometry(), moveDragLineMat);
    moveDragLine.visible = false;
    moveDragLine.frustumCulled = false;
    moveDragLine.raycast = () => {};
    moveDragLine.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

    selectionGizmo = createSelectionGizmoController({
      getTool: () => get(tool),
      getIsDrawing: () =>
        isVoxelDrag ||
        isStampDrag ||
        cuboidPhase !== null ||
        polygonPhase !== null ||
        roofPhase !== null ||
        ropePhase !== null ||
        (get(tool) === 'piscina' && piscinaPhase === 'shape'),
      getSelection: () => get(selection),
      getPointer: () => pointer,
      getCamera: () => camera ?? null,
      getRaycaster: () => raycaster,
      getMoveGroup: () => moveGizmoGroup,
      getRotateGroup: () => rotateGizmoGroup,
      getSelectionGroup: () => selectionGroup,
      getVoxelGroup: () => voxelGroup,
      getMoveDragLine: () => moveDragLine,
      getShowDragDeltaHint: () => get(voxellePreferences).showDragDeltaHint,
      getGizmosAlwaysOnTop: () => get(voxellePreferences).gizmosAlwaysOnTop,
      getContainer: () => container,
      render
    });
    moveGizmoGroup = selectionGizmo.createMoveGizmo();
    rotateGizmoGroup = selectionGizmo.createRotateGizmo();
    scene.add(moveGizmoGroup, rotateGizmoGroup, moveDragLine);

    window.addEventListener('keydown', handleFlyKeyDown, true);
    window.addEventListener('keydown', onEscapeKeyDown, true);
    window.addEventListener('keydown', onFullscreenKey);
    window.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keyup', handleFlyKeyUp, true);
    updateZoomPercent();

    containerResizeObserver = new ResizeObserver(() => {
      onWindowResize();
    });
    containerResizeObserver.observe(container);

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onContainerPointerLeave);
    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('pointerup', onFlyPointerCapture, true);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onFlyPointerCapture, true);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('resize', onWindowResize);

    meshManager?.requestRebuildVoxelMeshes($voxels);
    invalidateDirectionalShadowMap();
    onWindowResize();
    if (loadedFromStorage) fitToView();
    animate();
  });

  $effect(() => {
    if (rollOverMaterial) rollOverMaterial.color.setHex(hexToInt($color));
    render();
  });

  $effect(() => {
    const sz = $gridSize;
    const useSky = $enableSky;
    void $renderingMode;
    updateDirLightPosition($lightAngle, $lightElevation, sz);
    updateShadowCamera(sz);
    if (dirLight) {
      dirLight.color.setHex(hexToInt($lightColor));
      dirLight.intensity = $sunlightIntensity;
    }
    if (hemisphereLight) hemisphereLight.intensity = $ambientIntensity;
    updateSkyLightingColors();
    if (scene) {
      if ($renderingMode === 'ray') {
        scene.background =
          rayRenderer?.output.beautyTexture ?? new THREE.Color(hexToInt($backgroundColor));
      } else {
        scene.background = useSky ? null : new THREE.Color(hexToInt($backgroundColor));
      }
    }
    if (sky) {
      sky.visible = useSky && $renderingMode !== 'ray';
      if (useSky && dirLight && sky instanceof Sky) {
        (sky.material as THREE.ShaderMaterial).uniforms['sunPosition'].value.copy(
          dirLight.position
        );
      }
    }
    if (groundPlane) {
      groundPlane.visible = useSky && $renderingMode !== 'ray';
      if (useSky) {
        groundPlane.position.y = -sz * 0.6;
        groundPlane.scale.set(sz * 3, sz * 3, 1);
      }
    }
    invalidateDirectionalShadowMap();
    render();
  });

  $effect(() => {
    const sz = $gridSize;
    const v = $voxels;
    if (gridGroup) {
      buildGrid(sz, v);
      gridGroup.visible = $showGrid;
    }
    if ($orthographic && orthographicCamera) updateOrthoFrustum();
    updateZoomPercent();
    render();
  });

  let prevOrthographic = $state<boolean | null>(null);
  $effect(() => {
    const ortho = $orthographic;
    if (!perspectiveCamera || !orthographicCamera || !orbitControls || !flyControls) return;
    const modeSwitched = prevOrthographic !== null && ortho !== prevOrthographic;
    prevOrthographic = ortho;
    if (modeSwitched) {
      const fromCam = ortho ? perspectiveCamera : orthographicCamera;
      const toCam = ortho ? orthographicCamera : perspectiveCamera;
      toCam.position.copy(fromCam.position);
      toCam.quaternion.copy(fromCam.quaternion);
    }
    if (ortho) {
      orthographicCamera.zoom = Math.max(0.1, zoomPercent / 100);
      updateOrthoFrustum();
    }
    camera = ortho ? orthographicCamera : perspectiveCamera;
    orbitControls.object = camera;
    flyControls.object = camera;
    updateZoomPercent();
    onWindowResize();
    render();
  });

  $effect(() => {
    const fl = $focalLength;
    if (perspectiveCamera && !$orthographic) {
      perspectiveCamera.fov = focalLengthToFov(fl);
      perspectiveCamera.updateProjectionMatrix();
      render();
    }
  });

  let prevTool = $state<Tool | null>(null);
  $effect(() => {
    const t = $tool;
    if (!orbitControls || !flyControls) return;
    if (prevTool !== null && t !== prevTool && precisePhase !== 'idle') {
      resetPreciseState(true);
    }
    const isFly = t === 'fly';
    const isHand = t === 'hand';
    if (prevTool === 'piscina' && t !== 'piscina') {
      resetPiscinaPlacementFlow();
    }
    if (prevTool !== null && prevTool !== 'piscina' && t === 'piscina') {
      resetPiscinaPlacementFlow();
    }
    orbitControls.enabled = shouldEnableOrbitControls(t, false);
    flyControls.enabled = isFly;
    document.removeEventListener('mousemove', onFlyPointerMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    if (isFly) {
      selectionGizmo?.clearGizmoHoverCursor();
      showFlyHint = true;
      if (flyHintHideTimeout != null) clearTimeout(flyHintHideTimeout);
      flyHintHideTimeout = setTimeout(() => {
        showFlyHint = false;
        flyHintHideTimeout = null;
      }, FLY_HINT_HIDE_MS);
      document.addEventListener('mousemove', onFlyPointerMove);
      document.addEventListener('pointerlockchange', onPointerLockChange);
    } else {
      if (flyHintHideTimeout != null) clearTimeout(flyHintHideTimeout);
      flyHintHideTimeout = null;
    }
    if (
      isFly &&
      (isSegmentedStrokeGestureActive({ cuboidPhase, polygonPhase, roofPhase, ropePhase }) ||
        selectionGizmo?.isGizmoDrag)
    ) {
      flyControls.unlock();
      cancelDrag();
    }
    if (isHand) {
      resetPiscinaPlacementFlow();
      selectionGizmo?.clearGizmoHoverCursor();
      rollOverMesh.visible = false;
      updatePreviewMesh([]);
      if (
        isSegmentedStrokeGestureActive({
          cuboidPhase,
          polygonPhase,
          roofPhase,
          ropePhase
        }) ||
        selectionGizmo?.isGizmoDrag ||
        isVoxelDrag
      ) {
        cancelDrag();
      }
    }
    if (!isFly && prevTool === 'fly' && camera) {
      flyControls.unlock();
      resetFlyMoveState(flyMoveState);
      // Sync orbit target when exiting fly mode so orbit feels natural
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      orbitControls.target.copy(camera.position).add(dir.multiplyScalar(50));
    }
    prevTool = t;
    render();
  });

  $effect(() => {
    const mode = $effectiveStrokeMode;
    if (mode !== 'precise' && precisePhase !== 'idle') {
      resetPreciseState(true);
      render();
    }
  });

  $effect(() => {
    const open = $addPanelStore.open;
    if (!wasAddShapePanelOpen && open) {
      if (rollOverMesh && meshManager) {
        rollOverMesh.visible = false;
        updatePreviewMesh([]);
        render();
      }
    } else if (wasAddShapePanelOpen && !open) {
      if (rollOverMesh && meshManager) {
        requestAnimationFrame(() => handlePointerMove(undefined));
      }
    }
    wasAddShapePanelOpen = open;
  });

  $effect(() => {
    const s = $addPanelStore;
    if (!s.open || !s.placementAnchorPending || !orbitControls) return;
    const t = orbitControls.target;
    const anchor = defaultAddShapePlacementAnchor(get(voxels), { x: t.x, y: t.y, z: t.z });
    addPanelStore.update((p) =>
      p.placementAnchorPending
        ? {
            ...p,
            posX: anchor[0],
            posY: anchor[1],
            posZ: anchor[2],
            placementAnchorPending: false
          }
        : p
    );
    render();
  });

  $effect(() => {
    const s = $addPanelStore;
    if (
      !addPreviewMesh ||
      !addPreviewMaterial ||
      !addPreviewOccludedMesh ||
      !addPreviewOccludedMaterial
    )
      return;
    if (!s.open) {
      addPanelRefinementScheduler.cancel();
      resetPreviewMeshTransform(addPreviewMesh);
      resetPreviewMeshTransform(addPreviewOccludedMesh);
      addPreviewMesh.visible = false;
      addPreviewOccludedMesh.visible = false;
      render();
      return;
    }
    if (s.mode === 'paste' && s.pasteEntries && s.pasteEntries.length > 0) {
      addPanelRefinementScheduler.cancel();
      const voxelMap = buildPastePlacementVoxelMap(
        s.pasteEntries,
        [s.posX, s.posY, s.posZ],
        [clampQuarterTurn(s.rotX), clampQuarterTurn(s.rotY), clampQuarterTurn(s.rotZ)],
        { x: get(symmetryX), y: get(symmetryY), z: get(symmetryZ) }
      );
      applyAddShapeOccludedPreviewTint(
        clipboardEntryToVoxel(s.pasteEntries[0]!).color,
        addPreviewOccludedMaterial
      );
      resetPreviewMeshTransform(addPreviewMesh);
      resetPreviewMeshTransform(addPreviewOccludedMesh);
      const geo = buildPreviewGeometryFromVoxelMap(voxelMap, $voxels);
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, geo);
      render();
      return;
    }
    let positions = getShapePositionsAt({
      position: [s.posX, s.posY, s.posZ],
      rotation: [clampQuarterTurn(s.rotX), clampQuarterTurn(s.rotY), clampQuarterTurn(s.rotZ)],
      shape: s.shape,
      size: Math.max(1, Math.min(1024, Math.floor(s.size)))
    });
    positions = expandPositionsWithSymmetry(positions, {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    });
    const sel = $selectedColors;
    const addVx: Voxel = {
      color: hexToInt(sel.length > 0 ? sel[0] : $color) & 0xffffff,
      material: $voxelMaterial
    };
    applyAddShapeOccludedPreviewTint(addVx.color, addPreviewOccludedMaterial);
    const stride = computePreviewLodStride(positions.length);
    const bounds = getBoundsFromPositions(positions);
    if (stride > 1 && bounds) {
      const min: [number, number, number] = [bounds.minX, bounds.minY, bounds.minZ];
      const coarseMap = downsamplePositionsToPreviewMap(positions, addVx, stride, min, $voxels);
      const geoByBucket = buildGreedyMesh(coarseMap, PREVIEW_MESH_OPTIONS);
      const geos = [...geoByBucket.values()];
      const coarseGeo =
        geos.length === 0
          ? null
          : geos.length === 1
            ? geos[0]!
            : (() => {
                const m = mergeGeometries(geos);
                geos.forEach((g) => g.dispose());
                return m;
              })();
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, coarseGeo);
      if (coarseGeo) {
        alignPreviewMeshToLod(addPreviewMesh, stride, min);
        alignPreviewMeshToLod(addPreviewOccludedMesh, stride, min);
        const capturedPositions = positions;
        const capturedVoxel = addVx;
        addPanelRefinementScheduler.schedule(() => {
          const fullGeo = buildPreviewGeometry(capturedPositions, capturedVoxel, $voxels);
          if (!fullGeo || !addPreviewMesh || !addPreviewOccludedMesh) return;
          assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, fullGeo);
          resetPreviewMeshTransform(addPreviewMesh);
          resetPreviewMeshTransform(addPreviewOccludedMesh);
          render();
        });
      }
    } else {
      resetPreviewMeshTransform(addPreviewMesh);
      resetPreviewMeshTransform(addPreviewOccludedMesh);
      const geo = buildPreviewGeometry(positions, addVx, $voxels);
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, geo);
    }
    render();
  });

  onDestroy(() => {
    if (!browser) return;
    activeRendererIsWebGPU.set(null);
    saveToStorage();
    cancelAnimationFrame(animationFrameId);
    container?.removeEventListener('pointermove', onPointerMove);
    container?.removeEventListener('pointerleave', onContainerPointerLeave);
    container?.removeEventListener('pointerdown', onPointerDown, true);
    container?.removeEventListener('pointerup', onFlyPointerCapture, true);
    container?.removeEventListener('pointerup', onPointerUp);
    container?.removeEventListener('pointercancel', onFlyPointerCapture, true);
    container?.removeEventListener('pointercancel', onPointerCancel);
    container?.removeEventListener?.('contextmenu', onContextMenu);
    container?.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener(VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT, onProjectOpenFitCamera);
    window.removeEventListener('keydown', handleFlyKeyDown, true);
    window.removeEventListener('keydown', onEscapeKeyDown, true);
    window.removeEventListener('keydown', onFullscreenKey);
    window.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('keyup', handleFlyKeyUp, true);
    containerResizeObserver?.disconnect();
    containerResizeObserver = null;
    document.removeEventListener('mousemove', onFlyPointerMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    if (flyHintHideTimeout != null) clearTimeout(flyHintHideTimeout);
    orbitControls?.removeEventListener?.('change', updateZoomPercent);
    orbitControls?.dispose();
    flyControls?.dispose();
    disposeSelectiveBloomPipeline();
    renderer?.dispose();
    envMap?.dispose();
    boxGeometry?.dispose();
    rollOverMaterial?.dispose();
    previewMaterial?.dispose();
    if (preciseGuidePlaneMesh && scene) scene.remove(preciseGuidePlaneMesh);
    preciseGuidePlaneMesh?.geometry?.dispose();
    preciseGuidePlaneMaterial?.dispose();
    preciseGuidePlaneTexture?.dispose();
    preciseGuidePlaneMesh = null;
    preciseGuidePlaneMaterial = null;
    preciseGuidePlaneTexture = null;
    preciseGuidePlaneCtx = null;
    addPreviewMesh?.geometry?.dispose();
    addPreviewMaterial?.dispose();
    addPreviewOccludedMaterial?.dispose();
    gridGroup?.traverse((obj) => {
      const geom = (obj as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    });
    gridLineMaterial?.dispose();
    polygonLineSegments?.geometry?.dispose();
    polygonLineMaterial?.dispose();
    polygonPointsMaterial?.dispose();
    ropePointsMaterial?.dispose();
    rayRenderer?.dispose();
    rayRenderer = null;
    rayPickProxy = null;
    meshManager?.destroy();
    if (moveDragLine && scene) {
      scene.remove(moveDragLine);
      moveDragLine.geometry.dispose();
      (moveDragLine.material as THREE.Material).dispose();
      moveDragLine = null;
    }
    const gizmoGeos = new SvelteSet<THREE.BufferGeometry>();
    for (const gg of [moveGizmoGroup, rotateGizmoGroup]) {
      gg?.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry && !gizmoGeos.has(m.geometry)) {
          gizmoGeos.add(m.geometry);
          m.geometry.dispose();
        }
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
      if (gg && scene) scene.remove(gg);
    }
    moveGizmoGroup = null;
    rotateGizmoGroup = null;
  });
</script>

<div
  class="canvas-container"
  bind:this={container}
  role="application"
  aria-label="Voxel sculpting canvas"
>
  <VoxelCanvasOverlays
    bind:gizmoRef
    {rayRefinementProgress}
    {showGreedyMeshSpinner}
    {fillBusy}
    {fillMessage}
    {fillVisited}
    {fillMatched}
    {cancelActiveFill}
    {cuboidPhase}
    bind:cuboidDepth
    {updateCuboidFromDepth}
    {commitCuboid}
    {polygonPhase}
    polygonPointCount={polygonPoints.length}
    {commitPolygon}
    {cancelPolygon}
    {roofPhase}
    roofPointCount={roofPoints.length}
    {commitRoof}
    {cancelRoof}
    {piscinaPhase}
    {commitPiscinaFish}
    {pickAgainPiscina}
    {ropePhase}
    {commitRope}
    {cancelRope}
    {fpsCounterDisplayed}
    {deltaDisplay}
    {preciseLocationHint}
    {pointerScreen}
    {moveGizmoDragLabel}
    {formatSignedDelta}
    {showFlyHint}
    {camera}
    {orbitControls}
    {render}
    {zoomPercent}
    {zoomOut}
    {zoomIn}
    {fitToView}
    {resetCamera}
  />
</div>

<style>
  .canvas-container {
    flex: 1;
    min-width: 0;
    min-height: 200px;
    position: relative;
  }
  .canvas-container:fullscreen {
    width: 100vw;
    height: 100vh;
    background: #000;
  }
  .canvas-container :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
