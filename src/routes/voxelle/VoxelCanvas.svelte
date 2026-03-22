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
  import { get } from 'svelte/store';
  import {
    voxels,
    gridSize,
    showGrid,
    renderingMode,
    activeRendererIsWebGPU,
    tool,
    color,
    selectedColors,
    strokeMode,
    effectiveStrokeMode,
    lineAxisAlign,
    planeAxis,
    planeCuboidHollow,
    clayMode,
    clayBrushRadius,
    bulkBrushShape,
    inflateStrength,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    ropeTension,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
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
    updateVoxels,
    updateVoxelsInStroke,
    runVoxelStroke,
    applySelectionTranslationAlongAxis,
    applySelectionRotationInStroke,
    selectionGizmoMode,
    commitUndoAfter,
    history,
    initCanvas,
    loadFromStorageAsync,
    loadFromBytes,
    saveToStorage,
    coordKey,
    parseCoordKey,
    hexToInt,
    intToHex,
    getPaintColorResolver,
    getSelectionAnchor,
    getSelectionBounds,
    getStampOffsetForFace,
    getPunchOffsetForFace,
    ensureGridFitsPositions,
    resizeGridToContent,
    stampRotation,
    stampOriginMode,
    punchDepth,
    PUNCH_DEPTH_MAX,
    getBoundsFromPositions,
    getVoxelBounds,
    rotatePositionAroundOrigin,
    getSelectionCenter,
    selectionMode,
    type SelectionMode,
    mergeSelection,
    fillSelectDiagonals,
    fillRespectsColor,
    constrainToPlaneEnabled,
    constrainToPlaneRef,
    polygonOffsetFromNormal,
    FILL_UNCONSTRAINED_LARGE_THRESHOLD,
    getFillSelectionAt,
    getFillEmptyAt,
    type FillPlaneSampleContext,
    getCoplanarFacesSelectionAt,
    getCoplanarEmptySelectionAt,
    getShapePositionsAt,
    clampQuarterTurn,
    addPanelStore,
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
  import { generateRockVoxels, getRockPositions, generateAshlarVoxels, getAshlarPositions } from './store/generators/rock';
  import {
    VOXELLE_GLOW_BLOOM_USERDATA_KEY,
    VOXELLE_MESH_MATERIAL_USERDATA_KEY,
    voxelMaterialBaseEnvMapIntensity
  } from './voxelMaterial';
  import { generateGrassVoxels, getGrassPositions } from './store/generators/grass';
  import { generateRoofVoxels } from './store/generators/roof';
  import { getShareFromIndexedDB } from './shareStorage';
  import {
    inBounds,
    getEffectiveBounds,
    expandPositionsWithSymmetry,
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
  import { applySmooth, applyLevel, applyMelt, applyInflate } from './clayOps';
  import {
    FLY_MOVE_SPEED,
    FLY_POINTER_SPEED,
    createFlyMoveState,
    createFlyKeyHandlers,
    resetFlyMoveState,
    applyFlyMovement
  } from './flyControls';
  import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
  import { Sky } from 'three/addons/objects/Sky.js';
  import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
  import { buildGreedyMesh, buildPreviewGeometry, PREVIEW_MESH_OPTIONS } from './greedyMesh';
  import {
    createSceneSetupAsync,
    POLYGON_POINTS_MAX,
    type VoxelleRenderer
  } from './canvas/sceneSetup';
  import { createMeshManager, syncGlassShadowUniformsFromBuckets } from './canvas/meshManager';
  import { ddaPickVoxel, maxRayDistanceForVoxels } from './canvas/voxelRayDda';
  import { VoxelRayProgressive, buildVoxelRayTraceParams } from './canvas/voxelRayProgressive';
  import { isWebGLRenderer, isWebGPURenderer } from './canvas/rendererUtils';
  import {
    createWebGPUBloomPipeline,
    type WebGPUBloomPipeline
  } from './canvas/webgpuBloom';
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
  import { handlePointerDown as dispatchPointerDown, handlePointerMove as dispatchPointerMove } from './canvas/handlers/pointerHandler';
  import OrbitGizmo from './OrbitGizmo.svelte';
  import ToolPanel from './ToolPanel.svelte';
  import SelectionCountPanel from './SelectionCountPanel.svelte';

  const LARGE_UNCONSTRAINED_FILL_MSG = `This fill will affect a large number of blocks and will take some time to complete. Continue?`;

  function formatSignedDelta(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }

  /** Voxel tool + fill only: capped BFS when plane unconstrained; full flood after confirm. */
  function resolveFillEmptyForUnconstrainedPlane(
    x: number,
    y: number,
    z: number,
    diagonals: boolean,
    planeCtx: FillPlaneSampleContext
  ): Set<string> | null {
    if (get(constrainToPlaneEnabled)) {
      return getFillEmptyAt(x, y, z, diagonals, undefined, planeCtx).region;
    }
    const probe = getFillEmptyAt(
      x,
      y,
      z,
      diagonals,
      FILL_UNCONSTRAINED_LARGE_THRESHOLD,
      planeCtx
    );
    if (probe.truncated) {
      if (!confirm(LARGE_UNCONSTRAINED_FILL_MSG)) return null;
      return getFillEmptyAt(x, y, z, diagonals, undefined, planeCtx).region;
    }
    return probe.region;
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
  let gizmoRef = $state<ReturnType<typeof OrbitGizmo>>();
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
  const bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]> = {};
  let orbitControls = $state<OrbitControls>();
  let flyControls: InstanceType<typeof PointerLockControls> | null = null;
  let lastFrameTime = 0;
  let raycaster: THREE.Raycaster;
  let pointer: THREE.Vector2;
  let voxelGroup: THREE.Group;
  /** Synthetic object for DDA pick hits in ray rendering mode (face.normal used by tools). */
  let rayPickProxy: THREE.Object3D | null = null;
  let rayProgressive: VoxelRayProgressive | null = null;
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
  /** Per-stroke seed for deterministic scatter (preview and apply match). */
  let currentStrokeSeed = 0;
  /** Next rock placement seed (preview and apply match). */
  let nextRockPlacementSeed = $state(0);
  /** Next grass placement seed (preview and apply match). */
  let nextGrassPlacementSeed = $state(0);
  /** Next ashlar placement seed (preview and apply match). */
  let nextAshlarPlacementSeed = $state(0);
  /** Clay bulk: last sampled position for path accumulation */
  let lastBulkPos: [number, number, number] | null = null;
  /** Branch: pointer down position for view-plane direction and length */
  let branchPointerDownX = 0;
  let branchPointerDownY = 0;

  /** Shown while worker is computing (main voxel mesh rebuild) */
  let greedyMeshLoading = $state(false);
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
  let depthSliderPointerId: number | null = null;
  let depthSliderStartY = 0;
  let depthSliderStartDepth = 0;

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
  let ropeTensionSliderPointerId: number | null = null;
  let ropeTensionSliderStartY = 0;
  let ropeTensionSliderStartVal = 0;

  let previewMesh: THREE.Mesh | null = null;
  let previewMaterial: THREE.MeshBasicMaterial | null = null;
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

  // 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength)
  function focalLengthToFov(mm: number): number {
    return (2 * Math.atan(12 / mm) * 180) / Math.PI;
  }

  const pointerHelper = new THREE.Vector3();
  const axisNormalHelper = new THREE.Vector3();
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

  /** Same face anchor as rocks/ashlar: `place` from getAddPosition (+0.5 along normal). */
  function getStampTargetForPlaceOnFace(
    place: [number, number, number],
    normal: FaceNormal,
    bounds: NonNullable<ReturnType<typeof getBoundsFromPositions>>,
    originMode: 'center' | 'corner'
  ): [number, number, number] {
    const halfW = (bounds.maxX - bounds.minX) / 2;
    const halfH = (bounds.maxY - bounds.minY) / 2;
    const halfD = (bounds.maxZ - bounds.minZ) / 2;
    const surfaceTarget: [number, number, number] = [
      place[0] - normal[0],
      place[1] - normal[1],
      place[2] - normal[2]
    ];
    return [
      normal[0] ? surfaceTarget[0] : originMode === 'corner' ? place[0] : place[0] - halfW,
      normal[1] ? surfaceTarget[1] : originMode === 'corner' ? place[1] : place[1] - halfH,
      normal[2] ? surfaceTarget[2] : originMode === 'corner' ? place[2] : place[2] - halfD
    ];
  }

  /** Punch: anchor on the hit voxel (inside solid); tangent sliding uses that cell like stamp uses add-cell. */
  function getPunchTargetForPlaceOnFace(
    placeVoxel: [number, number, number],
    normal: FaceNormal,
    bounds: NonNullable<ReturnType<typeof getBoundsFromPositions>>,
    originMode: 'center' | 'corner'
  ): [number, number, number] {
    const halfW = (bounds.maxX - bounds.minX) / 2;
    const halfH = (bounds.maxY - bounds.minY) / 2;
    const halfD = (bounds.maxZ - bounds.minZ) / 2;
    return [
      normal[0] ? placeVoxel[0] : originMode === 'corner' ? placeVoxel[0] : placeVoxel[0] - halfW,
      normal[1] ? placeVoxel[1] : originMode === 'corner' ? placeVoxel[1] : placeVoxel[1] - halfH,
      normal[2] ? placeVoxel[2] : originMode === 'corner' ? placeVoxel[2] : placeVoxel[2] - halfD
    ];
  }

  function inwardFaceNormal(normal: FaceNormal): FaceNormal {
    return [-normal[0], -normal[1], -normal[2]] as FaceNormal;
  }

  /** Extrude punch footprint `depth` layers along `inward` (deduped). */
  function expandPunchAlongDepth(
    base: [number, number, number][],
    inward: FaceNormal,
    depth: number
  ): [number, number, number][] {
    const d = Math.floor(depth);
    const layers = Math.max(
      1,
      Math.min(PUNCH_DEPTH_MAX, Number.isFinite(d) ? d : 1)
    );
    const [ix, iy, iz] = inward;
    const seen = new Set<string>();
    const out: [number, number, number][] = [];
    for (const [x, y, z] of base) {
      for (let k = 0; k < layers; k++) {
        const px = x + k * ix;
        const py = y + k * iy;
        const pz = z + k * iz;
        const key = coordKey(px, py, pz);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([px, py, pz]);
      }
    }
    return out;
  }

  /** Snaps punch shape into the solid along -normal (same rotation/origin as stamp). */
  function getPunchPositionsForFace(
    placeVoxel: [number, number, number],
    normal: FaceNormal
  ): [number, number, number][] {
    const sel = $selection;
    const center = getSelectionCenter(sel);
    if (!center) return [];
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = $stampRotation;
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return [];
    const targetForPunch = getPunchTargetForPlaceOnFace(
      placeVoxel,
      normal,
      bounds,
      $stampOriginMode
    );
    const inward = inwardFaceNormal(normal);
    const [dx, dy, dz] = getPunchOffsetForFace(targetForPunch, inward, bounds);
    const base = rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]);
    return expandPunchAlongDepth(base, inward, get(punchDepth));
  }

  /** Snaps stamp to face under cursor (placement cell + tangent centering match generators). */
  function getStampPositionsForFace(
    place: [number, number, number],
    normal: FaceNormal
  ): [number, number, number][] {
    const sel = $selection;
    const center = getSelectionCenter(sel);
    if (!center) return [];
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = $stampRotation;
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return [];
    const targetForStamp = getStampTargetForPlaceOnFace(place, normal, bounds, $stampOriginMode);
    const [dx, dy, dz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    return rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
  }

  function dominantAxisNormal(n: THREE.Vector3): FaceNormal {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return [Math.sign(n.x) || 1, 0, 0];
    if (ay >= ax && ay >= az) return [0, Math.sign(n.y) || 1, 0];
    return [0, 0, Math.sign(n.z) || 1];
  }

  function getFaceNormalFromHit(hit: THREE.Intersection): FaceNormal | null {
    if (!hit.face) return null;
    hit.object.getWorldQuaternion(worldQuaternion);
    const n = hit.face.normal.clone().applyQuaternion(worldQuaternion);
    return dominantAxisNormal(n);
  }

  function getRaycastTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    const byBucket = meshManager?.getMeshesByBucket();
    if (byBucket) {
      for (const { mesh } of byBucket.values()) {
        targets.push(mesh);
      }
    }
    if ((polygonPhase || roofPhase) && polygonPointsMesh) {
      targets.push(polygonPointsMesh);
    }
    if (ropePhase && ropePointsMesh) {
      targets.push(ropePointsMesh);
    }
    return targets;
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
    if (!camera) return null;
    raycaster.setFromCamera(pointer, camera);
    if (get(renderingMode) === 'ray') {
      const r = raycaster.ray;
      const maxDist = maxRayDistanceForVoxels(get(voxels));
      const hit = ddaPickVoxel(
        r.origin.x,
        r.origin.y,
        r.origin.z,
        r.direction.x,
        r.direction.y,
        r.direction.z,
        get(voxels),
        maxDist
      );
      if (!hit || !rayPickProxy) return null;
      const p = new THREE.Vector3(hit.point[0], hit.point[1], hit.point[2]);
      const fn = new THREE.Vector3(hit.faceNormal[0], hit.faceNormal[1], hit.faceNormal[2]);
      return {
        distance: r.origin.distanceTo(p),
        point: p,
        face: { normal: fn, materialIndex: 0 } as THREE.Face,
        object: rayPickProxy
      };
    }
    const targets = getRaycastTargets();
    const intersects = raycaster.intersectObjects(targets, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  function snapToGrid(point: THREE.Vector3): [number, number, number] {
    return [Math.round(point.x), Math.round(point.y), Math.round(point.z)];
  }

  /** Intersect the current raycaster ray with the axis-aligned plane at lockedValue. Used when Lock start height is on and cursor is in empty space. */
  function getIntersectionWithLockedPlane(
    axis: 0 | 1 | 2,
    lockedValue: number
  ): [number, number, number] | null {
    if (!camera || !raycaster) return null;
    const normal = new THREE.Vector3(0, 0, 0).setComponent(axis, 1);
    const point = new THREE.Vector3(0, 0, 0).setComponent(axis, lockedValue);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    if (!hit) return null;
    if (target.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction) < 0) return null;
    return snapToGrid(target);
  }

  /** Intersect the current raycaster ray with a plane through planePoint with the given normal. Used for airbrush constrain-to-plane in empty space. */
  function getIntersectionWithPlane(
    planePoint: THREE.Vector3,
    normal: THREE.Vector3
  ): [number, number, number] | null {
    if (!camera || !raycaster) return null;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal.clone().normalize(),
      planePoint
    );
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    if (!hit) return null;
    if (target.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction) < 0) return null;
    return snapToGrid(target);
  }

  /** Returns voxel positions along axis-aligned line from a to b (dominant axis). */
  function axisVector(axis: 0 | 1 | 2): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0, 0);
    v.setComponent(axis, 1);
    return v;
  }

  /** Effective plane normal: Alt+scroll override, or sidebar planeAxis, or face normal. */
  function getEffectivePlaneNormal(): THREE.Vector3 | null {
    if (!dragFaceNormal) return null;
    if (dragPlaneAxisOverride !== null) return axisVector(dragPlaneAxisOverride);
    const pa = get(planeAxis);
    if (pa !== 'auto') return axisVector(pa);
    return dragFaceNormal;
  }

  /** Axis (0=X, 1=Y, 2=Z) with largest absolute component. Used for airbrush constrain plane (plane normal = that axis). */
  function getDominantAxisOfNormal(n: THREE.Vector3): 0 | 1 | 2 {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return 0;
    if (ay >= az) return 1;
    return 2;
  }

  /** Camera look direction (view plane normal) for airbrush constrain to camera plane. */
  function getCameraPlaneNormal(): { x: number; y: number; z: number } | undefined {
    if (!camera) return undefined;
    const v = new THREE.Vector3();
    camera.getWorldDirection(v);
    return { x: v.x, y: v.y, z: v.z };
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
      ? [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2]
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
      const frustumHalfHeight = Math.max(maxY * fitPadding, (maxX * fitPadding) / Math.max(aspect, 1e-6), 0.5);
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
    const az = (azimuthDeg * Math.PI) / 180;
    const elev = (elevationDeg * Math.PI) / 180;
    const h = Math.cos(elev);
    const d = Math.max(distance, 10);
    dirLight.position.set(Math.cos(az) * h * d, Math.sin(elev) * d, Math.sin(az) * h * d);
  }

  const baseZenithColor = new THREE.Color(0x7fb3e6);
  const baseHorizonColor = new THREE.Color(0xddeefe);
  const baseGroundColor = new THREE.Color(0x394555);
  const tmpSunColor = new THREE.Color();
  const tmpZenithColor = new THREE.Color();
  const tmpHorizonColor = new THREE.Color();
  const tmpGroundColor = new THREE.Color();
  const tmpBackgroundColor = new THREE.Color();
  const tmpHorizonPlaneColor = new THREE.Color();

  function updateSkyLightingColors(): void {
    if (!sky || !dirLight || !hemisphereLight) return;
    const sunIntensityN = THREE.MathUtils.clamp($sunlightIntensity / 2.3, 0, 2);
    const ambientIntensityN = THREE.MathUtils.clamp($ambientIntensity / 0.45, 0, 2);
    const elevationN = THREE.MathUtils.clamp(($lightElevation - 5) / 85, 0, 1);
    tmpSunColor.copy(dirLight.color);
    tmpZenithColor.copy(baseZenithColor).lerp(tmpSunColor, THREE.MathUtils.clamp(0.2 * sunIntensityN + 0.08 * ambientIntensityN, 0, 0.45));
    tmpHorizonColor.copy(baseHorizonColor).lerp(tmpSunColor, THREE.MathUtils.clamp(0.28 * sunIntensityN * (1 - elevationN) + 0.06 * ambientIntensityN, 0, 0.5));
    const skyBrightness = THREE.MathUtils.clamp(
      0.35 + 0.35 * ambientIntensityN + 0.5 * sunIntensityN * (0.25 + 0.75 * elevationN),
      0.2,
      1.9
    );
    tmpZenithColor.multiplyScalar(skyBrightness);
    tmpHorizonColor.multiplyScalar(THREE.MathUtils.clamp(skyBrightness * 1.06, 0.25, 2));
    tmpGroundColor.copy(baseGroundColor).lerp(tmpSunColor, THREE.MathUtils.clamp(0.08 * sunIntensityN, 0, 0.16));
    tmpGroundColor.multiplyScalar(THREE.MathUtils.clamp(0.35 + 0.35 * ambientIntensityN, 0.2, 1.25));
    tmpBackgroundColor.setHex(hexToInt($backgroundColor));

    hemisphereLight.color.copy(tmpZenithColor);
    hemisphereLight.groundColor.copy(tmpGroundColor);

    if (groundPlane?.material instanceof THREE.MeshStandardMaterial) {
      // In sky mode, the scene background picker drives the horizon plane hue.
      groundPlane.material.color.copy(
        tmpHorizonPlaneColor.copy(tmpBackgroundColor).lerp(tmpGroundColor, 0.15)
      );
      groundPlane.material.needsUpdate = true;
    }

    if (sky instanceof Sky) {
      const uniforms = (sky.material as THREE.ShaderMaterial).uniforms;
      if (uniforms['turbidity']) uniforms['turbidity'].value = THREE.MathUtils.lerp(1.8, 8.5, 1 - elevationN);
      if (uniforms['rayleigh']) uniforms['rayleigh'].value = THREE.MathUtils.lerp(0.75, 2.6, ambientIntensityN * 0.5);
      if (uniforms['mieCoefficient']) uniforms['mieCoefficient'].value = THREE.MathUtils.lerp(0.002, 0.028, 1 - elevationN);
      if (uniforms['mieDirectionalG']) uniforms['mieDirectionalG'].value = 0.78;
    } else if (sky instanceof THREE.Mesh && sky.material instanceof THREE.MeshBasicMaterial) {
      sky.material.color.copy(tmpZenithColor).lerp(tmpHorizonColor, 0.4);
      sky.material.needsUpdate = true;
    }
  }

  function updateShadowCamera(sz: number) {
    if (!dirLight?.shadow) return;
    const ext = sz * 1.2;
    const cam = dirLight.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 0.5;
    cam.far = sz * 4;
    cam.updateProjectionMatrix();
  }

  /** Re-render directional shadow map on next frame (static lighting + mesh: skip shadow pass otherwise). */
  function invalidateDirectionalShadowMap() {
    if (!renderer?.shadowMap?.enabled || !get(enableShadows) || !dirLight?.shadow) return;
    const sm = renderer.shadowMap as { needsUpdate?: boolean };
    if (typeof sm.needsUpdate === 'boolean') sm.needsUpdate = true;
    dirLight.shadow.needsUpdate = true;
  }

  function getAddPosition(hit: THREE.Intersection): [number, number, number] | null {
    if (!hit.face) return null;
    hit.object.getWorldQuaternion(worldQuaternion);
    const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
    const [nx, ny, nz] = dominantAxisNormal(worldNormal);
    // Add 0.5 * normal to reach adjacent cell center (hit.point is on face, full normal overshoots)
    pointerHelper.copy(hit.point).addScaledVector(axisNormalHelper.set(nx, ny, nz), 0.5);
    return snapToGrid(pointerHelper);
  }

  function getVoxelPosition(hit: THREE.Intersection): [number, number, number] | null {
    const mesh = hit.object as THREE.InstancedMesh | THREE.Mesh;
    const positions = mesh.userData?.positions as [number, number, number][] | undefined;
    if (positions && hit.instanceId != null) {
      return positions[hit.instanceId] ?? null;
    }
    // Mesh raycast: derive from hit point and dominant face normal
    if (!hit.face) return null;
    mesh.getWorldQuaternion(worldQuaternion);
    const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
    const [nx, ny, nz] = dominantAxisNormal(worldNormal);
    pointerHelper.copy(hit.point).addScaledVector(axisNormalHelper.set(nx, ny, nz), -0.5);
    return snapToGrid(pointerHelper);
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

  function applyLineStroke(positions: [number, number, number][]) {
    const sel = $selection;
    // When selection is active, paint/remove only affect selected voxels
    const effective =
      sel.size > 0 && ($tool === 'paint' || $tool === 'remove')
        ? positions.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : positions;
    ensureGridFitsPositions(effective);
    const sz = $gridSize;
    const boundSize: number | undefined = undefined;
    const getCol = getPaintColorResolver();
    updateVoxelsInStroke((v) => {
      for (const [x, y, z] of effective) {
        if (!inBounds(x, y, z, boundSize)) continue;
        const key = coordKey(x, y, z);
        if ($tool === 'remove') {
          v.delete(key);
        } else if ($tool === 'voxel' || $tool === 'clay') {
          if (!v.has(key)) v.set(key, getCol());
        } else if ($tool === 'paint') {
          if (v.has(key)) v.set(key, getCol());
        }
      }
    });
  }

  function applyClayStroke(
    positions: [number, number, number][],
    clayModeVal:
      | 'bulk'
      | 'smooth'
      | 'level'
      | 'gouge'
      | 'branch'
      | 'melt'
      | 'rope'
      | 'wall'
      | 'inflate',
    levelY: number
  ) {
    ensureGridFitsPositions(positions);
    const clayBoundsOrSize = getEffectiveBounds($voxels, 512);
    const boundSize: number | undefined = undefined;
    const getCol = getPaintColorResolver();
    const v = $voxels;
    if (clayModeVal === 'melt') {
      const { toAdd, toRemove } = applyMelt(v, positions, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'gouge') {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, boundSize)) continue;
          next.delete(coordKey(x, y, z));
        }
      });
      return;
    }
    if (
      clayModeVal === 'bulk' ||
      clayModeVal === 'branch' ||
      clayModeVal === 'rope' ||
      clayModeVal === 'wall'
    ) {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, boundSize)) continue;
          const key = coordKey(x, y, z);
          if (!next.has(key)) next.set(key, getCol());
        }
      });
      return;
    }
    if (clayModeVal === 'smooth') {
      const { toAdd, toRemove } = applySmooth(v, positions, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'inflate') {
      const { toAdd, toRemove } = applyInflate(
        v,
        positions,
        clayBoundsOrSize,
        get(inflateStrength)
      );
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'level') {
      const { toAdd, toRemove } = applyLevel(v, positions, levelY, getCol, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
    }
  }

  function applySelectStroke(positions: [number, number, number][], mode?: SelectionMode) {
    commitUndoAfter(() => {
      const v = $voxels;
      const boundSize: number | undefined = undefined;
      const modeToUse = mode ?? get(selectionMode);
      const incoming = new Map<string, Voxel>();
      for (const [x, y, z] of positions) {
        if (!inBounds(x, y, z, boundSize)) continue;
        const key = coordKey(x, y, z);
        const col = v.get(key);
        if (col !== undefined) incoming.set(key, col);
      }
      const next = mergeSelection($selection, incoming, modeToUse);
      selection.set(next);
    });
  }

  function placeStamp(place: [number, number, number], normal: FaceNormal) {
    const sel = $selection;
    const center = getSelectionCenter(sel);
    if (!center) return;
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = $stampRotation;
    const rotated: [number, number, number][] = [];
    const colors: Voxel[] = [];
    for (const [key, col] of sel) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
      colors.push(col);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return;
    playPlaceSound();
    const targetForStamp = getStampTargetForPlaceOnFace(place, normal, bounds, $stampOriginMode);
    const [dx, dy, dz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    const stampPositions = rotated.map(
      ([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]
    );
    ensureGridFitsPositions(stampPositions);
    const stampBoundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        stampPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, stampBoundSize)) return;
          v.set(coordKey(x, y, z), colors[i]);
        });
      });
    });
  }

  function placePunch(placeVoxel: [number, number, number], normal: FaceNormal) {
    const sel = $selection;
    const center = getSelectionCenter(sel);
    if (!center) return;
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = $stampRotation;
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return;
    const targetForPunch = getPunchTargetForPlaceOnFace(
      placeVoxel,
      normal,
      bounds,
      $stampOriginMode
    );
    const inward = inwardFaceNormal(normal);
    const [dx, dy, dz] = getPunchOffsetForFace(targetForPunch, inward, bounds);
    const base = rotated.map(
      ([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]
    );
    const punchPositions = expandPunchAlongDepth(base, inward, get(punchDepth));
    ensureGridFitsPositions(punchPositions);
    const punchBoundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        punchPositions.forEach(([x, y, z]) => {
          if (!inBounds(x, y, z, punchBoundSize)) return;
          v.delete(coordKey(x, y, z));
        });
      });
    });
  }

  /** Seeded RNG for cluster offset. Returns 0–1. */
  function nextRockClusterRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function playPlaceSound() {
    const a = new Audio('/voxelle/pop.ogg');
    a.play().catch(() => {});
  }

  function placeRocks(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver();
    const size = get(rockSize) as number;
    const roughness = get(rockRoughness) as number;
    const count = get(rockCount) as number;
    const clusterR = get(rockClusterRadius) as number;
    const sinkDir = get(rockSinkDirection) as 'none' | 'under' | 'over';
    const sinkAmount = get(rockSinkAmount) as number;
    const allPositions: [number, number, number][] = [];
    const allVoxels: Voxel[] = [];
    // Surface for placement: none = on surface; under = buried; over = floating
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

    for (let i = 0; i < count; i++) {
      const rng = nextRockClusterRng(placementSeed + i);
      const dx = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const dy = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const dz = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const placeI: [number, number, number] = [place[0] + dx, place[1] + dy, place[2] + dz];
      const rockMap = generateRockVoxels(
        placementSeed + i,
        size,
        roughness,
        getCol().color
      );
      const localPositions = [...rockMap.keys()].map(
        (k) => parseCoordKey(k) as [number, number, number]
      );
      const bounds = getBoundsFromPositions(localPositions);
      if (!bounds) continue;
      // Surface for normal axis (rock sits on plane); center on cursor in tangent plane (placeI - halfSize)
      const halfW = (bounds.maxX - bounds.minX) / 2;
      const halfH = (bounds.maxY - bounds.minY) / 2;
      const halfD = (bounds.maxZ - bounds.minZ) / 2;
      const targetForStamp: [number, number, number] = [
        normal[0] ? surfaceTarget[0] : placeI[0] - halfW,
        normal[1] ? surfaceTarget[1] : placeI[1] - halfH,
        normal[2] ? surfaceTarget[2] : placeI[2] - halfD
      ];
      const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
      for (const [key, vx] of rockMap) {
        const [lx, ly, lz] = parseCoordKey(key);
        allPositions.push([lx + ox, ly + oy, lz + oz]);
        allVoxels.push(vx);
      }
    }

    if (allPositions.length === 0) return;
    playPlaceSound();
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
  }

  function getAshlarThicknessAxis(normal: FaceNormal): 0 | 1 | 2 {
    const ax = Math.abs(normal[0]);
    const ay = Math.abs(normal[1]);
    const az = Math.abs(normal[2]);
    return ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  }

  function placeAshlar(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver();
    const size = get(ashlarSize) as number;
    const roughness = get(ashlarRoughness) as number;
    const thickness = get(ashlarThickness) as number;
    const thicknessAxis = getAshlarThicknessAxis(normal);
    const surfaceTarget: [number, number, number] = [
      place[0] - normal[0],
      place[1] - normal[1],
      place[2] - normal[2]
    ];
    const ashlarMap = generateAshlarVoxels(
      placementSeed,
      size,
      roughness,
      getCol().color,
      thickness,
      thicknessAxis
    );
    const localPositions = [...ashlarMap.keys()].map(
      (k) => parseCoordKey(k) as [number, number, number]
    );
    const bounds = getBoundsFromPositions(localPositions);
    if (!bounds) return;
    const halfW = (bounds.maxX - bounds.minX) / 2;
    const halfH = (bounds.maxY - bounds.minY) / 2;
    const halfD = (bounds.maxZ - bounds.minZ) / 2;
    const targetForStamp: [number, number, number] = [
      normal[0] ? surfaceTarget[0] : place[0] - halfW,
      normal[1] ? surfaceTarget[1] : place[1] - halfH,
      normal[2] ? surfaceTarget[2] : place[2] - halfD
    ];
    const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    const allPositions: [number, number, number][] = [];
    const allVoxelsAsh: Voxel[] = [];
    for (const [key, vx] of ashlarMap) {
      const [lx, ly, lz] = parseCoordKey(key);
      allPositions.push([lx + ox, ly + oy, lz + oz]);
      allVoxelsAsh.push(vx);
    }
    if (allPositions.length === 0) return;
    playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsAsh[i]!);
        });
      });
    });
  }

  function placeGrass(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver();
    const radius = get(grassRadius) as number;
    const density = get(grassDensity) as number;
    const height = get(grassHeight) as number;
    const grassMap = generateGrassVoxels(
      placementSeed,
      place,
      normal,
      radius,
      density,
      height,
      getCol().color
    );
    const allPositions: [number, number, number][] = [];
    const allVoxelsGrass: Voxel[] = [];
    for (const [key, vx] of grassMap) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsGrass.push(vx);
    }
    if (allPositions.length === 0) return;
    playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsGrass[i]!);
        });
      });
    });
  }

  function updatePreviewMesh(positions: [number, number, number][]) {
    if (!meshManager) return;
    const axes: SymmetryAxes = {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };
    positions = expandPositionsWithSymmetry(positions, axes);
    const sel = $selection;
    const filtered =
      sel.size > 0 && ($tool === 'paint' || $tool === 'remove')
        ? positions.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : positions;
    const previewVoxel: Voxel =
      filtered.length === 0
        ? { color: 0, material: 'plastic' }
        : $tool === 'remove' || $tool === 'punch'
          ? { color: 0xff4444, material: 'plastic' }
          : $tool === 'select' ||
              $tool === 'selectByColor' ||
              $tool === 'selectCoplanar' ||
              $tool === 'selectCoplanarEmpty'
            ? { color: 0x33aaff, material: 'plastic' }
            : getPaintColorResolver()();
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
    pendingStrokePositions = getAxisAlignedCuboid(
      cuboidPlane.a,
      cuboidPlane.b,
      cuboidPlane.normal,
      cuboidDepth,
      get(planeCuboidHollow)
    );
    updatePreviewMesh(pendingStrokePositions);
    render();
  }

  function commitCuboid() {
    if (!cuboidPlane) return;
    const positions = getAxisAlignedCuboid(
      cuboidPlane.a,
      cuboidPlane.b,
      cuboidPlane.normal,
      cuboidDepth,
      get(planeCuboidHollow)
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
      ([x, y, z]) =>
        [x + nx * steps, y + ny * steps, z + nz * steps] as [number, number, number]
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
    playPlaceSound();
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
        } catch (_) {}
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
        } catch (_) {}
        dragPointerId = null;
      }
      isVoxelDrag = false;
      selectionModeForCurrentGesture = null;
      dragStartPos = null;
      dragFaceNormal = null;
      dragPlaneAxisOverride = null;
      lastBulkPos = null;
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

  function handlePointerDown(event: PointerEvent) {
    if (dispatchPointerDown(pointerHandlerContext, event)) return;
    if (event.button === 2) {
      if ($tool === 'rocks') {
        nextRockPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        event.preventDefault();
        render();
        return;
      }
      if ($tool === 'grass') {
        nextGrassPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        event.preventDefault();
        render();
        return;
      }
      if ($tool === 'ashlar') {
        nextAshlarPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        event.preventDefault();
        const hit = getIntersection();
        if (hit) {
          const place = getAddPosition(hit);
          const normal = getFaceNormalFromHit(hit);
          if (place && normal) {
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
              const previewPositions = localPositions.map(([lx, ly, lz]) => [
                lx + ox,
                ly + oy,
                lz + oz
              ] as [number, number, number]);
              updatePreviewMesh(previewPositions);
            } else {
              updatePreviewMesh([]);
            }
            rollOverMesh.visible = false;
          }
        }
        render();
        return;
      }
      if (
        isVoxelDrag ||
        selectionGizmo?.isGizmoDrag ||
        cuboidPhase ||
        polygonPhase ||
        roofPhase ||
        ropePhase
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
    if (!hit) return;

    if ($tool === 'roof' && roofPhase && polygonPointsMesh && camera) {
      raycaster.setFromCamera(pointer, camera);
      const roofPointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (roofPointHits.length > 0) hit = roofPointHits[0];
    }

    // Polygon mode only when current tool uses stroke mode (effectiveStrokeMode is null for clay)
    if (get(effectiveStrokeMode) === 'polygon' && polygonPhase && polygonPointsMesh && camera) {
      raycaster.setFromCamera(pointer, camera);
      const pointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (pointHits.length > 0) hit = pointHits[0];
    }

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
      const pos = getVoxelPosition(hit);
      if (pos) {
        const incoming = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor),
          undefined,
          fillPlaneContextFromHit(hit)
        ).region;
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

    // Paint tool + fill method: click voxel to flood-fill connected same-color region
    if (
      $tool === 'paint' &&
      get(effectiveStrokeMode) === 'fill' &&
      hit.object !== polygonPointsMesh
    ) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const fillRegion = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor),
          undefined,
          fillPlaneContextFromHit(hit)
        ).region;
        if (fillRegion.size > 0) {
          const getCol = getPaintColorResolver();
          const positions = [...fillRegion.keys()].map((k) => parseCoordKey(k));
          ensureGridFitsPositions(positions);
          runVoxelStroke(() => {
            updateVoxelsInStroke((v) => {
              for (const key of fillRegion.keys()) {
                v.set(key, getCol());
              }
            });
          });
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
      const pos = getAddPosition(hit);
      if (pos && !$voxels.has(coordKey(pos[0], pos[1], pos[2]))) {
        const emptyRegion = resolveFillEmptyForUnconstrainedPlane(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          fillPlaneContextFromHit(hit)
        );
        if (emptyRegion === null) {
          requestAnimationFrame(() => render());
          return;
        }
        if (emptyRegion.size > 0) {
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
      const pos = getVoxelPosition(hit);
      if (pos) {
        const fillRegion = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor),
          undefined,
          fillPlaneContextFromHit(hit)
        ).region;
        if (fillRegion.size > 0) {
          runVoxelStroke(() => {
            updateVoxelsInStroke((v) => {
              for (const key of fillRegion.keys()) {
                v.delete(key);
              }
            });
          });
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
      if (
        air &&
        normal &&
        !$voxels.has(coordKey(air[0], air[1], air[2]))
      ) {
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
            incoming = getFillSelectionAt(
              pos[0],
              pos[1],
              pos[2],
              get(fillSelectDiagonals),
              get(fillRespectsColor),
              undefined,
              fillPlaneContextFromHit(hit)
            ).region;
          } else {
            incoming = new Map<string, Voxel>();
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
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Stamp / punch: stamp uses adjacent empty cell; punch uses hit voxel (cut inward)
    if (($tool === 'stamp' || $tool === 'punch') && $selection.size > 0) {
      const normal = getFaceNormalFromHit(hit);
      const place =
        $tool === 'stamp' ? getAddPosition(hit) : getVoxelPosition(hit);
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
        } catch (_) {}
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Rocks / Grass generator: click places on pointerup; do not start stroke drag
    if ($tool === 'rocks' || $tool === 'grass' || $tool === 'ashlar') {
      requestAnimationFrame(() => render());
      return;
    }

    isVoxelDrag = true;
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
      strokeMode: get(strokeMode) as string,
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
    if (dispatchPointerMove(pointerHandlerContext, event)) {
      selectionGizmo?.clearGizmoHoverCursor();
      return;
    }
    try {
      if ($tool === 'hand') {
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
    if (isStampDrag && $selection.size > 0) {
      const hit = getIntersection();
      if (hit) {
        const normal = getFaceNormalFromHit(hit);
        const place =
          stampLikeDragMode === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
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
                dx: pendingStrokePositions[pendingStrokePositions.length - 1][0] - dragStartPos[0],
                dy: pendingStrokePositions[pendingStrokePositions.length - 1][1] - dragStartPos[1],
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
        // Plane/cuboid: when cursor is in empty space, intersect ray with drag plane so plane extends into thin air
        if (
          currentPos === null &&
          (strokeModeVal === 'plane' || strokeModeVal === 'circle' || strokeModeVal === 'cuboid') &&
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
              const seen = new Set(pendingStrokePositions.map((p) => `${p[0]},${p[1]},${p[2]}`));
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
              pendingStrokePositions =
                strokeModeVal === 'circle'
                  ? getAxisAlignedCircleFromNormal(dragStartPos, currentPos, normal, hollow)
                  : getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, normal, hollow);
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
          // Clay path modes: show thickened preview (brush radius); airbrush: sphere preview
          updatePreviewMesh(
            thickenPathForStroke(pendingStrokePositions, {
              strokeMode: (isAirbrushPath && !isClayPathFollow
                ? 'airbrush'
                : (strokeModeVal ?? get(strokeMode))) as string,
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
    if (($tool === 'stamp' || $tool === 'punch') && $selection.size > 0 && !isStampDrag) {
      const hit = getIntersection();
      if (hit) {
        const normal = getFaceNormalFromHit(hit);
        const place =
          $tool === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
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
            const placeI: [number, number, number] = [place[0] + dx, place[1] + dy, place[2] + dz];
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
            const previewPositions = localPositions.map(([lx, ly, lz]) => [
              lx + ox,
              ly + oy,
              lz + oz
            ] as [number, number, number]);
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
      $tool !== 'voxel' &&
      $tool !== 'clay' &&
      $tool !== 'remove' &&
      $tool !== 'paint'
    ) {
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
        if (
          voxelPos &&
          $voxels.has(coordKey(voxelPos[0], voxelPos[1], voxelPos[2]))
        ) {
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
            drawBrushFaceNormal: faceN
              ? { x: faceN.x, y: faceN.y, z: faceN.z }
              : undefined,
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
    updatePointerFromEvent(event);
    handlePointerMove(event);
  }

  function onPointerDown(event: PointerEvent) {
    updatePointerFromEvent(event);
    handlePointerDown(event);
  }

  function onPointerUp(event: PointerEvent) {
    if ($tool === 'fly') {
      event.stopPropagation();
      return;
    }
    if (depthAdjustPointerId === event.pointerId) {
      try {
        container.releasePointerCapture(event.pointerId);
      } catch (_) {}
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
        const p =
          stampLikeDragMode === 'punch' ? getVoxelPosition(hit) : getAddPosition(hit);
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
        } catch (_) {}
        dragPointerId = null;
      }
    }
    if (event.button === 0 && $tool === 'rocks' && !$addPanelStore.open) {
      const hit = getIntersection();
      if (hit) {
        const place = getAddPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (place && normal) {
          const seed =
            nextRockPlacementSeed === 0
              ? Math.floor(Math.random() * 0xffffffff)
              : nextRockPlacementSeed;
          placeRocks(place, normal, seed);
          nextRockPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        }
      }
    }
    if (event.button === 0 && $tool === 'grass' && !$addPanelStore.open) {
      const hit = getIntersection();
      if (hit) {
        const place = getAddPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (place && normal) {
          const seed =
            nextGrassPlacementSeed === 0
              ? Math.floor(Math.random() * 0xffffffff)
              : nextGrassPlacementSeed;
          placeGrass(place, normal, seed);
          nextGrassPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        }
      }
    }
    if (event.button === 0 && $tool === 'ashlar' && !$addPanelStore.open) {
      const hit = getIntersection();
      if (hit) {
        const place = getAddPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (place && normal) {
          const seed =
            nextAshlarPlacementSeed === 0
              ? Math.floor(Math.random() * 0xffffffff)
              : nextAshlarPlacementSeed;
          placeAshlar(place, normal, seed);
          nextAshlarPlacementSeed = Math.floor(Math.random() * 0xffffffff);
        }
      }
    }
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
      if (mode === 'cuboid' && dragStartPos && normal && !isClayPath) {
        // Enter depth phase: drag plane, then scroll for depth
        let cornerB = dragStartPos;
        const hit = getIntersection();
        if (hit) {
          const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
          if (pos) cornerB = pos;
        } else {
          // No voxel hit: use invisible hit plane so cuboid can be placed in empty space
          const planePoint = new THREE.Vector3(
            dragStartPos[0] + 0.5,
            dragStartPos[1] + 0.5,
            dragStartPos[2] + 0.5
          );
          const planePos = getIntersectionWithPlane(planePoint, normal);
          if (planePos) cornerB = planePos;
        }
        cuboidPhase = 'depth';
        cuboidPlane = {
          a: dragStartPos,
          b: cornerB,
          normal
        };
        cuboidDepth = 1;
        pendingStrokePositions = getAxisAlignedCuboid(
          cuboidPlane.a,
          cuboidPlane.b,
          cuboidPlane.normal,
          cuboidDepth,
          get(planeCuboidHollow)
        );
        updatePreviewMesh(pendingStrokePositions);
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
            strokeMode: mode as string,
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
        const d = event.deltaY < 0 ? 1 : -1;
        addPanelStore.update((s) => ({
          ...s,
          size: Math.max(1, Math.min(addMax, Math.floor(s.size) + d))
        }));
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
      const hit = getIntersection();
      let currentPos = hit
        ? $tool === 'voxel'
          ? getAddPosition(hit)
          : getVoxelPosition(hit)
        : null;
      if (currentPos === null && dragStartPos) {
        const planePoint = new THREE.Vector3(
          dragStartPos[0] + 0.5,
          dragStartPos[1] + 0.5,
          dragStartPos[2] + 0.5
        );
        currentPos = getIntersectionWithPlane(planePoint, axisVector(next)) ?? null;
      }
      if (currentPos) {
        const hollow = get(planeCuboidHollow);
        const n = axisVector(next);
        pendingStrokePositions =
          mode === 'circle'
            ? getAxisAlignedCircleFromNormal(dragStartPos, currentPos, n, hollow)
            : getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, n, hollow);
      }
      updatePreviewMesh(pendingStrokePositions);
      render();
      return;
    }
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

  function stashNonGlowMaterialsForBloom(root: THREE.Object3D) {
    if (!bloomDarkMaterial) return;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData[VOXELLE_GLOW_BLOOM_USERDATA_KEY] === true) return;
      const id = mesh.uuid;
      if (bloomMaterialStash[id] !== undefined) return;
      bloomMaterialStash[id] = mesh.material;
      mesh.material = bloomDarkMaterial!;
    });
  }

  function restoreStashedBloomMaterials(root: THREE.Object3D) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = mesh.uuid;
      const st = bloomMaterialStash[id];
      if (st !== undefined) {
        mesh.material = st;
        delete bloomMaterialStash[id];
      }
    });
  }

  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (camera instanceof THREE.OrthographicCamera) {
      updateOrthoFrustum();
    } else {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(w, h);
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
            const px =
              (pointerHelper.x * 0.5 + 0.5) * rect.width + (rect.left - cr.left);
            const py =
              (-pointerHelper.y * 0.5 + 0.5) * rect.height + (rect.top - cr.top);
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

      const cpuRayBloomEligible = get(renderingMode) === 'ray' && rayProgressive != null;
      const rayProg = rayProgressive;

      if (webgpuBloomPipeline && camera && isWebGPURenderer(renderer)) {
        if (cpuRayBloomEligible && rayProg) {
          scene.background = rayProg.texture;
          webgpuBloomPipeline.renderSceneToTarget(
            renderer as Parameters<WebGPUBloomPipeline['renderSceneToTarget']>[0],
            scene,
            camera
          );
          const savedWebGpuBloomBg = scene.background;
          try {
            scene.background = rayProg.bloomTexture;
            webgpuBloomPipeline.renderBloomSourceToTarget(
              renderer as Parameters<WebGPUBloomPipeline['renderBloomSourceToTarget']>[0],
              scene,
              camera
            );
          } finally {
            scene.background = savedWebGpuBloomBg;
          }
          webgpuBloomPipeline.renderPipeline.render();
        } else if (get(renderingMode) !== 'ray') {
          const rw = renderer as Parameters<WebGPUBloomPipeline['renderSceneToTarget']>[0];
          /**
           * WebGPU + TSL bloom: beauty pass goes to a HalfFloat RT. Directional shadows then do not
           * darken receivers (ground) even though castShadow / shadow maps are configured (verified via
           * session logs). Rendering straight to the swapchain restores shadowed lighting.
           * Trade-off: glow-only bloom is skipped while shadows are enabled on WebGPU.
           */
          if (get(enableShadows)) {
            rw.setMRT(null);
            rw.setRenderTarget(null);
            rw.render(scene, camera);
          } else {
            webgpuBloomPipeline.renderSceneToTarget(rw, scene, camera);
            const savedWebGpuBloomBg = scene.background;
            stashNonGlowMaterialsForBloom(scene);
            if (bloomPassBackground) scene.background = bloomPassBackground;
            try {
              webgpuBloomPipeline.renderBloomSourceToTarget(
                renderer as Parameters<WebGPUBloomPipeline['renderBloomSourceToTarget']>[0],
                scene,
                camera
              );
            } finally {
              scene.background = savedWebGpuBloomBg;
              restoreStashedBloomMaterials(scene);
            }
            webgpuBloomPipeline.renderPipeline.render();
          }
        } else {
          renderer.render(scene, camera);
        }
      } else if (bloomComposer && finalComposer && sharedSceneRenderPass && camera) {
        sharedSceneRenderPass.camera = camera;
        if (cpuRayBloomEligible && rayProg) {
          scene.background = rayProg.bloomTexture;
          bloomComposer.render();
          scene.background = rayProg.texture;
          finalComposer.render();
        } else if (get(renderingMode) !== 'ray') {
          stashNonGlowMaterialsForBloom(scene);
          const savedSceneBackground = scene.background;
          if (bloomPassBackground) scene.background = bloomPassBackground;
          try {
            bloomComposer.render();
          } finally {
            scene.background = savedSceneBackground;
            restoreStashedBloomMaterials(scene);
          }
          finalComposer.render();
        } else {
          renderer.render(scene, camera);
        }
      } else {
        renderer.render(scene, camera);
      }
    }
    gizmoRef?.draw();
  }

  function animate(now?: number) {
    animationFrameId = requestAnimationFrame(animate);
    const t = now ?? performance.now();
    if (get(voxellePreferences).showFpsCounter) {
      if (!fpsCounterPeriodStartMs) {
        fpsCounterPeriodStartMs = t;
        fpsCounterAccumFrames = 0;
      }
      fpsCounterAccumFrames++;
      const fpsElapsed = t - fpsCounterPeriodStartMs;
      if (fpsElapsed >= 1000) {
        fpsCounterDisplayed = Math.round((fpsCounterAccumFrames * 1000) / fpsElapsed);
        fpsCounterAccumFrames = 0;
        fpsCounterPeriodStartMs = t;
      }
    } else {
      fpsCounterPeriodStartMs = 0;
    }
    const delta = lastFrameTime ? (t - lastFrameTime) / 1000 : 0;
    lastFrameTime = t;
    if (flyControls?.enabled && camera) {
      applyFlyMovement(camera, flyControls, flyMoveState, delta, { moveSpeed: FLY_MOVE_SPEED });
    } else {
      orbitControls?.update();
    }

    if (camera && renderer && container && get(renderingMode) === 'ray') {
      camera.updateMatrixWorld(true);

      let camDirty = false;
      if (prevRayCamInitialized) {
        const posMoved = prevRayCamPos.distanceToSquared(camera.position) > 1e-8;
        const rotAlign = Math.abs(prevRayCamQuat.dot(camera.quaternion));
        const rotMoved = rotAlign < 1 - 1e-6;
        camDirty = posMoved || rotMoved;
        if (camDirty) {
          prevRayCamPos.copy(camera.position);
          prevRayCamQuat.copy(camera.quaternion);
        }
      }

      const contentDirty = rayTraceContentDirty;
      rayTraceContentDirty = false;
      const params = buildVoxelRayTraceParams(dirLight, hemisphereLight, {
        enableSky: get(enableSky),
        backgroundHex: hexToInt(get(backgroundColor)),
        ambientIntensity: get(ambientIntensity),
        sceneEnvironmentIntensity: get(sceneEnvironmentIntensity),
        enableShadows: get(enableShadows)
      });

      if (rayProgressive) {
        const texBefore = rayProgressive.texture;
        // CPU fallback in WebGPU ray mode must stay responsive; use aggressive internal downscale.
        const cpuRayDpr = Math.min(renderer.getPixelRatio(), 0.5);
        rayProgressive.tick(
          delta,
          container.clientWidth,
          container.clientHeight,
          cpuRayDpr,
          get(voxels),
          params,
          contentDirty || camDirty,
          camera
        );
        if (texBefore !== rayProgressive.texture) {
          scene.background = rayProgressive.texture;
        }
        rayRefinementProgress = rayProgressive.getRefinementProgress();
      }
    } else {
      rayRefinementProgress = 0;
    }

    render();
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
    const sz = $gridSize;
    const _ao = $aoStrength;
    const _renderingMode = $renderingMode;
    meshManager?.requestRebuildVoxelMeshes(v);
    render();
  });

  $effect(() => {
    $renderingMode;
    $voxels;
    $lightAngle;
    $lightElevation;
    $lightColor;
    $ambientIntensity;
    $sunlightIntensity;
    $enableShadows;
    $enableSky;
    $backgroundColor;
    $sceneEnvironmentIntensity;
    $gridSize;
    $focalLength;
    $orthographic;
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
    const selSize = $selection.size;
    if (!meshManager || !camera) return;
    if (($tool !== 'stamp' && $tool !== 'punch') || selSize === 0) return;
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
    const sel = $selection;
    rebuildSelectionOverlay(sel);
    render();
    selectionGizmo?.syncGizmoHoverCursor();
  });

  $effect(() => {
    $selectionGizmoMode;
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
          const sm = renderer.shadowMap as { transmitted?: boolean; type?: number } | null | undefined;
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
        mesh.receiveShadow =
          shadows &&
          $renderingMode !== 'ray' &&
          matId !== 'glass';
      }
    }
    if (shadows) invalidateDirectionalShadowMap();
    render();
  });

  $effect(() => {
    $enableSky;
    $backgroundColor;
    $sceneEnvironmentIntensity;
    syncVoxelMaterialEnvMaps();
    render();
  });

  onMount(async () => {
    let fromUrl = false;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('m');
      if (id) {
        const isLocalhost = window.location.hostname === 'localhost';
        if (isLocalhost) {
          try {
            const modelBase64 = await getShareFromIndexedDB(id);
            if (modelBase64) {
              const binary = atob(modelBase64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              fromUrl = await loadFromBytes(bytes);
            }
          } catch {
            // ignore
          }
        }
        if (!fromUrl) {
          try {
            const res = await fetch(`/api/voxelle/model/${id}`);
            if (res.ok) {
              const bytes = new Uint8Array(await res.arrayBuffer());
              fromUrl = await loadFromBytes(bytes);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    if (!fromUrl && !(await loadFromStorageAsync())) initCanvas(get(gridSize));
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
      get(voxellePreferences).rendererBackend
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
        aoStrength: $aoStrength,
        sceneEnvironmentIntensity: $sceneEnvironmentIntensity
      }),
      {
        onLoadingChange: (v) => (greedyMeshLoading = v),
        onSpinnerChange: (v) => (showGreedyMeshSpinner = v),
        onVoxelMeshesRebuilt: () => {
          invalidateDirectionalShadowMap();
          syncVoxelMaterialEnvMaps();
        },
        render
      }
    );
    meshManager.buildGrid(sz, $voxels);
    gridGroup.visible = $showGrid;

    rayPickProxy = new THREE.Object3D();
    rayProgressive = new VoxelRayProgressive();
    if (get(renderingMode) === 'ray') {
      voxelGroup.visible = false;
      scene.background = rayProgressive?.texture ?? new THREE.Color(hexToInt(get(backgroundColor)));
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
        ropePhase !== null,
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
    animate();
  });

  $effect(() => {
    if (rollOverMaterial) rollOverMaterial.color.setHex(hexToInt($color));
    render();
  });

  $effect(() => {
    const sz = $gridSize;
    const useSky = $enableSky;
    $renderingMode;
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
        scene.background = rayProgressive?.texture ?? new THREE.Color(hexToInt($backgroundColor));
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
    const isFly = t === 'fly';
    const isHand = t === 'hand';
    orbitControls.enabled = !isFly;
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
    if (isFly && (cuboidPhase || polygonPhase || roofPhase || selectionGizmo?.isGizmoDrag)) {
      flyControls.unlock();
      cancelDrag();
    }
    if (isHand) {
      selectionGizmo?.clearGizmoHoverCursor();
      rollOverMesh.visible = false;
      updatePreviewMesh([]);
      if (
        cuboidPhase ||
        polygonPhase ||
        roofPhase ||
        selectionGizmo?.isGizmoDrag ||
        isVoxelDrag ||
        ropePhase
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
    if (!addPreviewMesh || !addPreviewMaterial || !addPreviewOccludedMesh || !addPreviewOccludedMaterial)
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
      const coarseMap = downsamplePositionsToPreviewMap(
        positions,
        addVx,
        stride,
        min,
        $voxels
      );
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
    window.removeEventListener('keydown', handleFlyKeyDown, true);
    window.removeEventListener('keydown', onEscapeKeyDown, true);
    window.removeEventListener('keydown', onFullscreenKey);
    window.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('keyup', handleFlyKeyUp, true);
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
    rayProgressive?.dispose();
    rayProgressive = null;
    rayPickProxy = null;
    meshManager?.destroy();
    if (moveDragLine && scene) {
      scene.remove(moveDragLine);
      moveDragLine.geometry.dispose();
      (moveDragLine.material as THREE.Material).dispose();
      moveDragLine = null;
    }
    const gizmoGeos = new Set<THREE.BufferGeometry>();
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
  {#if $renderingMode === 'ray' && rayRefinementProgress < 1}
    <div
      class="ray-refine-progress"
      role="progressbar"
      aria-live="polite"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(rayRefinementProgress * 100)}
      aria-label="Ray trace refinement"
    >
      <div class="ray-refine-progress-fill" style="transform: scaleX({rayRefinementProgress})"></div>
    </div>
  {/if}
  {#if showGreedyMeshSpinner}
    <div class="greedy-mesh-spinner" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <span>Building mesh…</span>
    </div>
  {/if}
  {#if cuboidPhase === 'depth'}
    <div class="depth-slider-container" data-voxelle-no-passthrough>
      <div
        class="depth-slider-track"
        role="slider"
        aria-label="Cuboid depth"
        aria-valuemin={-256}
        aria-valuemax={256}
        aria-valuenow={cuboidDepth}
        tabindex="0"
        onpointerdown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          depthSliderPointerId = e.pointerId;
          depthSliderStartY = e.clientY;
          depthSliderStartDepth = cuboidDepth;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onpointermove={(e) => {
          e.preventDefault();
          if (depthSliderPointerId !== e.pointerId) return;
          const dy = depthSliderStartY - e.clientY;
          cuboidDepth = Math.max(-256, Math.min(256, depthSliderStartDepth + Math.round(dy / 10)));
          updateCuboidFromDepth();
        }}
        onpointerup={(e) => {
          if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
        }}
        onpointercancel={(e) => {
          if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
        }}
      >
        <div
          class="depth-slider-thumb"
          style="bottom: {Math.min(99, Math.max(1, 50 + (cuboidDepth / 512) * 98))}%"
        ></div>
      </div>
      <div class="depth-slider-controls">
        <button
          type="button"
          class="depth-btn"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => {
            cuboidDepth = Math.max(-256, cuboidDepth - 1);
            updateCuboidFromDepth();
          }}
          aria-label="Decrease depth">−</button
        >
        <span class="depth-slider-label">Depth: {cuboidDepth}</span>
        <button
          type="button"
          class="depth-btn"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => {
            cuboidDepth = Math.min(256, cuboidDepth + 1);
            updateCuboidFromDepth();
          }}
          aria-label="Increase depth">+</button
        >
      </div>
    </div>
    <button
      type="button"
      class="cuboid-done-btn"
      data-voxelle-no-passthrough
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitCuboid()}
      title="Tap Done to apply"
      aria-label="Apply cuboid selection"
    >
      Done
    </button>
  {/if}
  {#if polygonPhase === 'placing' && polygonPoints.length >= 2}
    <div class="polygon-actions" data-voxelle-no-passthrough>
      <button
        type="button"
        class="polygon-done-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => commitPolygon()}
        title="Fill convex hull"
        aria-label="Apply polygon"
      >
        Done
      </button>
      <button
        type="button"
        class="polygon-cancel-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => cancelPolygon()}
        title="Cancel"
        aria-label="Cancel polygon"
      >
        Cancel
      </button>
    </div>
  {/if}
  {#if roofPhase === 'placing' && roofPoints.length >= 2}
    <div class="polygon-actions" data-voxelle-no-passthrough>
      <button
        type="button"
        class="polygon-done-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => commitRoof()}
        disabled={roofPoints.length < 4}
        title={roofPoints.length < 4 ? 'Need at least 4 corners' : 'Build roof'}
        aria-label="Apply roof"
      >
        Done
      </button>
      <button
        type="button"
        class="polygon-cancel-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => cancelRoof()}
        title="Cancel"
        aria-label="Cancel roof"
      >
        Cancel
      </button>
    </div>
  {/if}
  {#if ropePhase === 'tension'}
    <div class="rope-tension-slider depth-slider-container" data-voxelle-no-passthrough>
      <div
        class="depth-slider-track"
        role="slider"
        aria-label="Rope tension"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round($ropeTension * 100)}
        tabindex="0"
        onpointerdown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ropeTensionSliderPointerId = e.pointerId;
          ropeTensionSliderStartY = e.clientY;
          ropeTensionSliderStartVal = get(ropeTension);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onpointermove={(e) => {
          e.preventDefault();
          if (ropeTensionSliderPointerId !== e.pointerId) return;
          const dy = ropeTensionSliderStartY - e.clientY;
          const delta = dy / 200;
          ropeTension.set(Math.max(0, Math.min(1, ropeTensionSliderStartVal + delta)));
        }}
        onpointerup={(e) => {
          if (ropeTensionSliderPointerId === e.pointerId) ropeTensionSliderPointerId = null;
        }}
        onpointercancel={(e) => {
          if (ropeTensionSliderPointerId === e.pointerId) ropeTensionSliderPointerId = null;
        }}
      >
        <div
          class="depth-slider-thumb"
          style="bottom: {Math.min(99, Math.max(1, $ropeTension * 98))}%"
        ></div>
      </div>
      <div class="depth-slider-controls">
        <button
          type="button"
          class="depth-btn"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => ropeTension.set(Math.max(0, $ropeTension - 0.05))}
          aria-label="Decrease tension">−</button
        >
        <span class="depth-slider-label">Tension: {Math.round($ropeTension * 100)}%</span>
        <button
          type="button"
          class="depth-btn"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => ropeTension.set(Math.min(1, $ropeTension + 0.05))}
          aria-label="Increase tension">+</button
        >
      </div>
    </div>
    <div class="polygon-actions" data-voxelle-no-passthrough>
      <button
        type="button"
        class="rope-done-btn polygon-done-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => commitRope()}
        title="Apply rope"
        aria-label="Apply rope"
      >
        Done
      </button>
      <button
        type="button"
        class="rope-cancel-btn polygon-cancel-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => cancelRope()}
        title="Cancel"
        aria-label="Cancel rope"
      >
        Cancel
      </button>
    </div>
  {/if}
  {#if $voxellePreferences.showFpsCounter}
    <div class="fps-counter" role="status" aria-live="polite">
      {fpsCounterDisplayed} FPS
    </div>
  {/if}
  {#if deltaDisplay && $voxellePreferences.showMovementDeltaHint}
    <div
      class="delta-display"
      aria-live="polite"
      style="left: {pointerScreen.x}px; top: {pointerScreen.y}px;"
    >
      Δ {formatSignedDelta(deltaDisplay.dx)}, {formatSignedDelta(deltaDisplay.dy)}, {formatSignedDelta(deltaDisplay.dz)}
    </div>
  {/if}
  {#if moveGizmoDragLabel}
    <div
      class="move-gizmo-delta-label"
      role="status"
      aria-live="polite"
      style="left: {moveGizmoDragLabel.x}px; top: {moveGizmoDragLabel.y}px;"
    >
      {formatSignedDelta(moveGizmoDragLabel.dx)}, {formatSignedDelta(moveGizmoDragLabel.dy)}, {formatSignedDelta(moveGizmoDragLabel.dz)}
    </div>
  {/if}
  <ToolPanel />
  <SelectionCountPanel />
  {#if $tool === 'fly' && showFlyHint}
    <div class="fly-hint" role="status" aria-live="polite">
      Click to capture · WASD move · E/Q up/down · Shift 1/8 speed · Move mouse to look
    </div>
  {:else}
    {#if camera && orbitControls}
      <OrbitGizmo bind:this={gizmoRef} {camera} controls={orbitControls} onRender={render} />
    {/if}
    <div
      class="zoom-controls"
      data-voxelle-no-passthrough
      role="toolbar"
      aria-label="Zoom controls"
      tabindex="0"
      onpointerdown={(e) => e.stopPropagation()}
    >
      <button type="button" onclick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
      <span class="zoom-percent">{zoomPercent}%</span>
      <button type="button" onclick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
      <button
        type="button"
        class="fit-btn"
        onclick={fitToView}
        title="Fit to view"
        aria-label="Fit sculpture to view">Fit</button
      >
      <button
        type="button"
        class="fit-btn"
        onclick={resetCamera}
        title="Reset camera"
        aria-label="Reset camera to default view">Reset</button
      >
    </div>
  {/if}
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

  .ray-refine-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: rgba(255, 200, 160, 0.18);
    z-index: 2;
    pointer-events: none;
    overflow: hidden;
  }

  .ray-refine-progress-fill {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, rgba(255, 140, 40, 0.95), rgba(255, 200, 120, 0.98));
    transform-origin: left center;
    will-change: transform;
  }

  .greedy-mesh-spinner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 0.9rem;
    z-index: 10;
    pointer-events: none;
  }

  .greedy-mesh-spinner .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: greedy-mesh-spin 0.8s linear infinite;
  }

  @keyframes greedy-mesh-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .cuboid-done-btn {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 0.9rem;
    cursor: pointer;
    pointer-events: auto;
    z-index: 1;
  }

  .cuboid-done-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  .cuboid-done-btn:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .polygon-actions {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.5rem;
    z-index: 1;
  }

  .polygon-done-btn,
  .polygon-cancel-btn {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 0.9rem;
    cursor: pointer;
    pointer-events: auto;
  }

  .polygon-done-btn:hover,
  .polygon-cancel-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  .depth-slider-container {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .depth-slider-track {
    position: relative;
    width: 1rem;
    height: 6rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .depth-slider-thumb {
    position: absolute;
    left: -2px;
    right: -2px;
    height: 0.75rem;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 2px;
    pointer-events: none;
  }

  .depth-slider-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .depth-btn {
    min-width: 1.5rem;
    min-height: 1.5rem;
    padding: 0;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 3px;
    color: #fff;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .depth-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .depth-slider-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    min-width: 4rem;
    text-align: center;
  }

  .zoom-controls {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1;
  }

  .zoom-controls button {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .zoom-controls button:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .zoom-controls .fit-btn {
    width: auto;
    padding: 0 0.5rem;
  }

  .zoom-percent {
    min-width: 3ch;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .fly-hint {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
  }

  .fps-counter {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
    z-index: 1;
  }

  .delta-display {
    position: absolute;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
    z-index: 1;
  }

  .move-gizmo-delta-label {
    position: absolute;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.65);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(159, 216, 255, 0.95);
    pointer-events: none;
    z-index: 2;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  }
</style>
