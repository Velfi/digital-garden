<script lang="ts">
  import { browser } from '$app/environment';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
  import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
  import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
  import { onMount, onDestroy } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { get } from 'svelte/store';
  import {
    voxels,
    hiddenVoxels,
    gridSize,
    glowVoxelCount,
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
    planeCylinderTaperPct,
    sculptMode,
    sculptBrushRadius,
    sculptBrushShape,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    branchBrushProfile,
    branchEndCap,
    branchExtrudeRef,
    ropeTension,
    clothTension,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    sprayBrushShape,
    sprayRadius,
    sprayScatter,
    sprayRadiusRange,
    sprayRadiusMin,
    sprayRadiusMax,
    spraySnapToSurface,
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
    insectaSpecies,
    insectaTotalLength,
    insectaHeadRatio,
    insectaThoraxRatio,
    insectaAbdomenRatio,
    insectaBodyHalfWidth,
    insectaBodyHalfHeight,
    insectaAbdomenTaper,
    insectaHeadShape,
    insectaAnchorOffsetU,
    insectaAnchorOffsetV,
    insectaBodyYaw,
    insectaBodyArch,
    insectaLegFront,
    insectaLegMid,
    insectaLegHind,
    insectaAntennaLength,
    insectaAntennaSpread,
    insectaAntennaPitch,
    insectaAntennaRoot,
    insectaMandibleLength,
    insectaMandibleSpread,
    insectaMandibleForward,
    insectaWingShape,
    insectaShowWingFore,
    insectaWingForeLength,
    insectaWingForeWidth,
    insectaWingForeSpread,
    insectaWingForePitch,
    insectaWingForeOffset,
    insectaShowWingHind,
    insectaWingHindLength,
    insectaWingHindWidth,
    insectaWingHindSpread,
    insectaWingHindPitch,
    insectaWingHindOffset,
    getPiscinaPositions,
    getInsectaPositions,
    projectOpenLoading,
    LARGE_PROJECT_OPEN_VOXEL_THRESHOLD,
    beginProjectOpenLoading,
    updateProjectOpenLoadingProgress,
    completeProjectOpenLoading,
    roofSelectionMethod,
    roofProfileCurve,
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
    atmosphereActiveForRender,
    atmosphereColor,
    atmosphereThickness,
    atmosphereDensity,
    atmosphereMode,
    atmosphereSpatialMode,
    atmospherePlane,
    atmosphereHeightBias,
    atmosphereHeightFalloff,
    atmosphereDriftEnabled,
    atmosphereDriftAmount,
    atmosphereDriftScale,
    atmosphereDriftSpeed,
    distanceTintEnabled,
    distanceTintNearColor,
    distanceTintMidColor,
    distanceTintFarColor,
    distanceTintNearDistance,
    distanceTintFarDistance,
    distanceTintStrength,
    grainEnabled,
    grainStrength,
    grainAnimated,
    grainSpeed,
    grainMode,
    sunShaftsEnabled,
    sunShaftsStrength,
    sunShaftsDecay,
    sunShaftsDensity,
    sunShaftsWeight,
    sunShaftsSamples,
    type Tool,
    type FaceNormal,
    voxellePreferences,
    type Voxel
  } from './store/index';
  import { getRockPositions, getAshlarPositions } from './store/generators/rock';
  import {
    VOXELLE_MESH_MATERIAL_USERDATA_KEY,
    voxelMaterialBaseEnvMapIntensity,
    cloneVoxel
  } from './voxelMaterial';
  import { getGrassPositions } from './store/generators/grass';
  import { generateRoofVoxels } from './store/generators/roof';
  import {
    inBounds,
    expandPositionsWithSymmetry,
    expandPositionsWithSymmetryAroundCenter,
    getMirrorCoordKeys,
    type SelectionBounds,
    type SymmetryAxes
  } from './coordUtils';
  import {
    getAxisAlignedLine,
    getAxisAlignedPlaneFromNormal,
    getAxisAlignedCircleFromNormal,
    getAxisAlignedCylinder,
    getAxisAlignedCuboid,
    getPolygonVoxels,
    getSolidPolygonBasePositions,
    getSolidPolygonDepthDeltaDisplay,
    extrudeSolidPolygonBaseAlongNormal,
    getBresenham3DLine,
    getRayDirectionPath,
    resolveBranchExtrudeDirection,
    thickenPathForStroke,
    getRopeCurveVoxels,
    getClothPatchFromPinsVoxels,
    applyBrushAlongPath,
    getSprayDirectionVector,
    mergeSphereStampIntoSeen,
    mergeCubeStampIntoSeen,
    mergePyramidStampIntoSeen,
    offsetSprayStampCenterForSnap,
    type PathThickenParams
  } from './strokeGeometry';
  import { isSculptDragPathMode, isSculptStrokePathMode } from './store/sculptModes';
  import {
    PREVIEW_BBOX_VOXEL_THRESHOLD,
    planeStrokeBounds,
    diskStrokeBounds,
    cuboidStrokeBounds,
    cuboidSolidVoxelCount,
    cylinderStrokeBounds,
    cylinderSolidVoxelCount,
    buildCylinderPreviewVolume,
    type CylinderPreviewVolume,
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
    PREVIEW_MESH_OPTIONS,
    type PreviewOverlapShading
  } from './greedyMesh';
  import {
    createSceneSetupAsync,
    POLYGON_POINTS_MAX,
    type VoxelleRenderer
  } from './canvas/sceneSetup';
  import { createMeshManager, syncGlassShadowUniformsFromBuckets } from './canvas/meshManager';
  import { perfLog, perfNow, voxellePerfEnabled } from './canvas/voxellePerf';
  import { VoxelRayTsl } from './canvas/voxelRayTsl';
  import { isWebGLRenderer, isWebGPURenderer } from './canvas/rendererUtils';
  import { createWebGPUBloomPipeline, type WebGPUBloomPipeline } from './canvas/webgpuBloom';
  import {
    applyAddShapeOccludedPreviewTint,
    assignSharedDualPreviewGeometry,
    safeDisposeBufferGeometry
  } from './canvas/previewMeshUtils';
  import {
    alignPreviewMeshToLod,
    computePreviewLodStride,
    createPreviewRefinementScheduler,
    downsamplePositionsToPreviewMap,
    PREVIEW_LOD_COARSE_TARGET,
    resetPreviewMeshTransform
  } from './previewMeshLod';
  import { toneMappingPreferenceToThree } from './toneMappingPreference';
  import { createSelectionGizmoController } from './canvas/selectionGizmo';
  import { handleFlyPointerUp } from './canvas/handlers/pointerHandler';
  import { runPointerDownPrelude, runPointerMovePrelude } from './canvas/pointerOrchestrator';
  import { isSegmentedStrokeGestureActive } from './canvas/toolPhaseState';
  import { applyGeneratorFaceClickPointerDown } from './canvas/handlers/generatorPointer';
  import { applyMoodFaceClickPointerDown } from './canvas/handlers/moodPointer';
  import {
    buildVoxelGeneratorPrimaryPointerUpDeps,
    buildVoxelGeneratorRmbDeps,
    buildVoxelMoodFaceClickDeps,
    type VoxelGeneratorPrimaryPointerUpBridge,
    type VoxelGeneratorRmbBridge
  } from './canvas/handlers/voxelPointerCore';
  import {
    createPreciseGuidePlaneInScene,
    loadVoxelCanvasBootstrapModel,
    PRECISE_GUIDE_TEX_SIZE
  } from './canvas/voxelCanvasInit';
  import { isGeneratorFaceClickTool } from './store/generators/registry';
  import { isMoodTool } from './store/mood/registry';
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
    invalidateDirectionalShadowMap as lightingInvalidateDirectionalShadowMap,
    flushPendingWebGpuDirectionalShadowInvalidate as lightingFlushPendingWebGpuShadowInvalidate
  } from './canvas/voxelCanvasLighting';
  import {
    renderVoxelCanvasPrimaryScene,
    hasGlowInVoxelGroup
  } from './canvas/voxelCanvasBloomRender';
  import {
    VoxelleSceneRenderPass,
    StashingPlanarAtmospherePass,
    StashingDistanceTintPass,
    SunShaftsPass,
    GrainPass,
    updatePlanarAtmosphereShaderUniforms,
    updateDistanceTintPassUniforms,
    updateSunShaftsPassUniforms,
    updateGrainPassUniforms,
    type WebGLDepthStash
  } from './canvas/planarAtmospherePass';
  import { runVoxelCanvasAnimateStep } from './canvas/voxelCanvasAnimate';
  import {
    PRECISE_PREVIEW_RENDER_ORDER,
    PRECISE_ROLLOVER_RENDER_ORDER,
    PREVIEW_DEFAULT_RENDER_ORDER,
    ROLLOVER_DEFAULT_RENDER_ORDER
  } from './canvas/renderOrder';
  import {
    createVoxelCanvasStrokeCommit,
    defaultPlayPlaceSound,
    getAshlarThicknessAxis,
    nextRockClusterRng,
    buildFloraOptionsFromStores,
    buildPiscinaOptionsFromStores,
    buildInsectaOptionsFromStores
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

  function sprayPlaneParamsForFaceNormal(
    faceForAuto: THREE.Vector3 | null | undefined
  ): Pick<
    PathThickenParams,
    'sprayConstrainToPlane' | 'sprayPlaneAxis' | 'sprayPlaneNormal'
  > {
    const enabled = get(constrainToPlaneEnabled);
    if (!enabled) {
      return {
        sprayConstrainToPlane: false,
        sprayPlaneAxis: undefined,
        sprayPlaneNormal: undefined
      };
    }
    const ref = get(constrainToPlaneRef);
    if (ref === 'camera') {
      return {
        sprayConstrainToPlane: true,
        sprayPlaneAxis: undefined,
        sprayPlaneNormal: getCameraPlaneNormal()
      };
    }
    if (ref === 'auto') {
      const n = faceForAuto ?? dragFaceNormal;
      return {
        sprayConstrainToPlane: true,
        sprayPlaneAxis: n ? getDominantAxisOfNormal(n) : undefined,
        sprayPlaneNormal: undefined
      };
    }
    return {
      sprayConstrainToPlane: true,
      sprayPlaneAxis: ref,
      sprayPlaneNormal: undefined
    };
  }

  function sprayPlaneParamsForStroke(): Pick<
    PathThickenParams,
    'sprayConstrainToPlane' | 'sprayPlaneAxis' | 'sprayPlaneNormal'
  > {
    return sprayPlaneParamsForFaceNormal(dragFaceNormal);
  }

  function getSprayConstrainPlaneNormalWorld(): THREE.Vector3 | null {
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

  function getSprayHoverConstrainPlaneNormal(hit: THREE.Intersection): THREE.Vector3 | null {
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
  /** Skip redundant composer/RT realloc when CSS size and pixel ratio are unchanged. */
  let lastCanvasResizeW = -1;
  let lastCanvasResizeH = -1;
  let lastCanvasResizePr = -1;
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
  let sharedSceneRenderPass: VoxelleSceneRenderPass | null = null;
  let unrealBloomPass: UnrealBloomPass | null = null;
  let bloomMixPass: ShaderPass | null = null;
  let bloomOutputPass: OutputPass | null = null;
  let bloomDarkMaterial: THREE.MeshBasicMaterial | null = null;
  /** Solid scene.background is not a mesh, so bloom pass must clear it to black or the whole RT blooms. */
  let bloomPassBackground: THREE.Color | null = null;
  /** Track glow buckets so selective bloom passes can be skipped when empty. */
  let sceneHasGlowMesh = false;
  const bloomMaterialStash: Record<string, THREE.Material | THREE.Material[]> = {};
  const webglDepthStash: WebGLDepthStash = { texture: null };
  let planarAtmospherePassGL: ShaderPass | null = null;
  let distanceTintPassGL: ShaderPass | null = null;
  let sunShaftsPassGL: ShaderPass | null = null;
  let grainPassGL: ShaderPass | null = null;
  let atmosphereOnlyComposer: EffectComposer | null = null;
  let atmosphereOnlyScenePass: VoxelleSceneRenderPass | null = null;
  let atmosphereOnlyFogPass: ShaderPass | null = null;
  let atmosphereOnlyDistanceTintPass: ShaderPass | null = null;
  let atmosphereOnlySunShaftsPass: ShaderPass | null = null;
  let atmosphereOnlyGrainPass: ShaderPass | null = null;
  let atmosphereOnlyOutputPass: OutputPass | null = null;

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
  /** Set when voxels/lighting change; coalesced via rAF flush, consumed once per frame in `animate` before ray tick. */
  let pendingRayContentInvalidate = true;
  let pendingPipelineMesh = false;
  let pendingPipelineGrid = false;
  let pendingPipelineRay = false;

  /** Set true after `createSceneSetupAsync` + core refs exist; presentation effects no-op until then. */
  let sceneReady = $state(false);
  /** Greedy/marching: lights/env/tone/etc. changed; `animate` draws once per frame max (see `markCanvasDirty`). */
  let canvasPresentationDirty = false;

  function markCanvasDirty(): void {
    canvasPresentationDirty = true;
  }

  /** Apply batched mesh/grid/ray flags once per animation frame (coalesces burst edits). */
  function applyPendingVoxelPipelineMutations(): boolean {
    let did = false;
    const v = get(voxels);
    const tAll = voxellePerfEnabled() ? perfNow() : 0;
    if (pendingPipelineMesh && meshManager) {
      const t0 = voxellePerfEnabled() ? perfNow() : 0;
      meshManager.requestRebuildVoxelMeshes(v);
      if (voxellePerfEnabled()) perfLog('voxelPipeline.meshRequest', perfNow() - t0);
      pendingPipelineMesh = false;
      did = true;
    }
    if (pendingPipelineGrid && meshManager && get(showGrid)) {
      const t0 = voxellePerfEnabled() ? perfNow() : 0;
      meshManager.buildGrid(get(gridSize), v);
      if (voxellePerfEnabled()) perfLog('voxelPipeline.gridRebuild', perfNow() - t0);
      pendingPipelineGrid = false;
      did = true;
    } else {
      pendingPipelineGrid = false;
    }
    if (pendingPipelineRay) {
      pendingRayContentInvalidate = true;
      pendingPipelineRay = false;
      did = true;
    }
    if (voxellePerfEnabled() && did) perfLog('voxelPipeline.applyTotal', perfNow() - tAll);
    return did;
  }

  function queueVoxelPipelineRebuild(opts: { mesh?: boolean; grid?: boolean; ray?: boolean }): void {
    if (opts.mesh) pendingPipelineMesh = true;
    if (opts.grid) pendingPipelineGrid = true;
    if (opts.ray) pendingPipelineRay = true;
  }
  let rollOverMesh: THREE.Mesh;
  let rollOverMaterial: THREE.MeshBasicMaterial;
  let paintHoverMesh: THREE.Mesh | null = null;
  let paintHoverMaterial: THREE.MeshBasicMaterial | null = null;
  let paintHoverOccludedMesh: THREE.Mesh | null = null;
  let paintHoverOccludedMaterial: THREE.MeshBasicMaterial | null = null;
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
  /** Next insecta placement seed (preview and apply match). */
  let nextInsectaPlacementSeed = $state(0);
  /** Next ashlar placement seed (preview and apply match). */
  let nextAshlarPlacementSeed = $state(0);
  /** Sculpt path-follow: last sampled position for path accumulation */
  let lastBulkPos: [number, number, number] | null = null;
  /** Deterministic spray (no scatter / radius range): incremental droplet union per stroke */
  let sprayIncrementalSeen: Set<string> | null = null;
  let sprayIncrementalOut: [number, number, number][] | null = null;
  let sprayIncrementalPathLen = 0;
  /** Latest full-res stroke preview positions when using LOD coarse path (idle refinement reads this). */
  let strokePreviewLodPendingFull: [number, number, number][] | null = null;
  /** Branch: pointer down position for view-plane direction and length */
  let branchPointerDownX = 0;
  let branchPointerDownY = 0;

  /** Only show spinner after build has taken >2s */
  let showGreedyMeshSpinner = $state(false);
  let awaitingFirstProjectOpenMeshBuild = false;

  $effect(() => {
    if ($projectOpenLoading.active && !awaitingFirstProjectOpenMeshBuild) {
      awaitingFirstProjectOpenMeshBuild = true;
    }
    if (!$projectOpenLoading.active && awaitingFirstProjectOpenMeshBuild && !meshManager) {
      awaitingFirstProjectOpenMeshBuild = false;
    }
  });

  // Cuboid two-phase: first drag = plane, then scroll/drag = depth
  let cuboidPhase = $state<'plane' | 'depth' | null>(null);
  let cuboidPlane: {
    a: [number, number, number];
    b: [number, number, number];
    normal: THREE.Vector3;
  } | null = null;
  let cuboidDepth = $state(1); // voxel layers; pointer drag or slider to adjust
  let cylinderPhase = $state<'plane' | 'depth' | null>(null);
  let cylinderPlane: {
    center: [number, number, number];
    edge: [number, number, number];
    normal: THREE.Vector3;
  } | null = null;
  let cylinderDepth = $state(1);
  let solidPolygonDepth = $state(1);
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

  // Solid polygon: place corner loop (projected onto first-click plane), Set depth → depth phase like cuboid
  let solidPolygonPoints = $state<[number, number, number][]>([]);
  let solidPolygonPhase = $state<'placing' | 'depth' | null>(null);
  /** Face normal from the first solid-polygon anchor; extrusion follows its dominant axis. */
  let solidPolygonInitialNormal = $state<FaceNormal | null>(null);

  const solidPolygonExtrudable = $derived.by(() => {
    if (solidPolygonPoints.length < 2 || !solidPolygonInitialNormal) return false;
    const o = solidPolygonPoints[0]!;
    const n = solidPolygonInitialNormal;
    const vec = { x: n[0], y: n[1], z: n[2] };
    return getSolidPolygonBasePositions(solidPolygonPoints, o, vec) !== null;
  });

  /** Roof generator: corner loop (reuse polygon point mesh / line preview). */
  let roofPoints = $state<[number, number, number][]>([]);
  let roofPhase = $state<'placing' | null>(null);
  let roofPlacementNormal = $state<FaceNormal | null>(null);
  /** Circle/square footprint: drag on face (same plane logic as Draw → circle stroke). */
  let isRoofShapeDrag = $state(false);
  let roofShapeDragKind = $state<'circle' | 'square' | null>(null);
  let roofDragStartPos = $state<[number, number, number] | null>(null);
  let roofShapeLiveFootprint = $state<[number, number, number][] | null>(null);
  let roofShapeCommittedFootprint = $state<[number, number, number][] | null>(null);
  let roofShapeWindingFlipped = $state(false);
  /** Last seen `roofWindingFlipTick` so UI flips only bump the counter. */
  let prevRoofWindingFlipTick = -1;
  /** Tracks `roofSelectionMethod` for “changed while placing” cancel. */
  let lastRoofSelForCancel: string | null = null;

  // Rope: two-point + tension flow
  let ropePointA = $state<[number, number, number] | null>(null);
  let ropePointB = $state<[number, number, number] | null>(null);
  let ropePhase = $state<'placing' | 'tension' | null>(null);
  let clothPoints = $state<[number, number, number][]>([]);
  let clothPlacementNormal = $state<FaceNormal | null>(null);
  let clothPhase = $state<'placing' | 'tension' | null>(null);
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
  const strokePreviewLodScheduler = createPreviewRefinementScheduler();

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
  /** Same two-phase flow as piscina: pick face, then shape and commit. */
  let insectaPhase = $state<'pick' | 'shape'>('pick');
  let insectaLockedPlace = $state<[number, number, number] | null>(null);
  let insectaLockedNormal = $state<FaceNormal | null>(null);
  let insectaHoverPlace = $state<[number, number, number] | null>(null);
  let insectaHoverNormal = $state<FaceNormal | null>(null);

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
      solidPolygonPhase,
      roofPhase,
      polygonPointsMesh,
      ropePhase,
      clothPhase,
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

  /** Intersect the current raycaster ray with a plane through planePoint with the given normal. Used for spray constrain-to-plane in empty space. */
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

  /** Camera look direction (view plane normal) for spray constrain to camera plane. */
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
      sunlightIntensity: get(sunlightIntensity),
      ambientIntensity: get(ambientIntensity),
      lightElevation: get(lightElevation),
      backgroundColorHex: get(backgroundColor)
    });
  }

  function applyToneMappingFromPreferences(): void {
    if (!renderer) return;
    renderer.toneMapping = toneMappingPreferenceToThree(get(voxellePreferences).toneMapping);
  }

  /**
   * Single place: tone mapping, shadow flags, directional/hemisphere/sky/ground/background,
   * env maps. No `render()` — call `markCanvasDirty()` from the presentation `$effect`.
   */
  function applyPresentationFromStores(): void {
    if (!sceneReady) return;

    applyToneMappingFromPreferences();

    const shadows = get(enableShadows);
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
      const rm = get(renderingMode);
      for (const { mesh } of byBucket.values()) {
        mesh.castShadow = shadows;
        const matId = mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY];
        mesh.receiveShadow = shadows && rm !== 'ray' && matId !== 'glass';
      }
    }

    const sz = get(gridSize);
    const useSky = get(enableSky);
    const renderingModeVal = get(renderingMode);
    updateDirLightPosition(get(lightAngle), get(lightElevation), sz);
    updateShadowCamera(sz);
    if (dirLight) {
      dirLight.color.setHex(hexToInt(get(lightColor)));
      dirLight.intensity = get(sunlightIntensity);
    }
    if (hemisphereLight) hemisphereLight.intensity = get(ambientIntensity);
    updateSkyLightingColors();
    if (scene) {
      if (renderingModeVal === 'ray') {
        scene.background =
          rayRenderer?.output.beautyTexture ?? new THREE.Color(hexToInt(get(backgroundColor)));
      } else {
        scene.background = useSky ? null : new THREE.Color(hexToInt(get(backgroundColor)));
      }
    }
    if (sky) {
      sky.visible = useSky && renderingModeVal !== 'ray';
      if (useSky && dirLight && sky instanceof Sky) {
        (sky.material as THREE.ShaderMaterial).uniforms['sunPosition'].value.copy(
          dirLight.position
        );
      }
    }
    if (groundPlane) {
      groundPlane.visible = useSky && renderingModeVal !== 'ray';
      if (useSky) {
        groundPlane.position.y = -sz * 0.6;
        groundPlane.scale.set(sz * 3, sz * 3, 1);
      }
    }

    syncVoxelMaterialEnvMaps();
    invalidateDirectionalShadowMap();
  }

  /** Immediate apply + draw (e.g. `onMount` first paint). */
  function syncSceneLightingAndBackgroundFromStores(): void {
    applyPresentationFromStores();
    render();
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
    if (previewMesh) previewMesh.renderOrder = PRECISE_PREVIEW_RENDER_ORDER;
    if (rollOverMesh) rollOverMesh.renderOrder = PRECISE_ROLLOVER_RENDER_ORDER;
  }

  function resetPrecisePreviewRenderOrder() {
    if (previewMesh) previewMesh.renderOrder = PREVIEW_DEFAULT_RENDER_ORDER;
    if (rollOverMesh) rollOverMesh.renderOrder = ROLLOVER_DEFAULT_RENDER_ORDER;
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
    applySculptStroke,
    applySelectStroke,
    placeStamp,
    placePunch,
    placeRocks,
    placeAshlar,
    placeGrass,
    placePiscina,
    placeInsecta,
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

  function resetInsectaPlacementFlow() {
    insectaPhase = 'pick';
    insectaLockedPlace = null;
    insectaLockedNormal = null;
    insectaHoverPlace = null;
    insectaHoverNormal = null;
    updatePreviewMesh([]);
  }

  function pickAgainInsecta() {
    resetInsectaPlacementFlow();
    render();
  }

  function commitInsectaPlacement() {
    if (insectaPhase !== 'shape' || !insectaLockedPlace || !insectaLockedNormal) return;
    const seed =
      nextInsectaPlacementSeed === 0
        ? Math.floor(Math.random() * 0xffffffff)
        : nextInsectaPlacementSeed;
    placeInsecta(insectaLockedPlace, insectaLockedNormal, seed);
    nextInsectaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
    resetInsectaPlacementFlow();
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
    /** Large cylinder preview: oriented cylinder/cone instead of selection AABB box. */
    cylinderVolume?: CylinderPreviewVolume;
  };

  function clearSprayIncrementalPuff(): void {
    sprayIncrementalSeen = null;
    sprayIncrementalOut = null;
    sprayIncrementalPathLen = 0;
  }

  function canUseSprayIncrementalPuff(): boolean {
    return (
      get(effectiveStrokeMode) === 'spray' &&
      get(sprayScatter) === 0 &&
      !get(sprayRadiusRange)
    );
  }

  function ensureSprayIncrementalBuffers(): void {
    if (!sprayIncrementalSeen || !sprayIncrementalOut) {
      sprayIncrementalSeen = new Set<string>();
      sprayIncrementalOut = [];
      sprayIncrementalPathLen = 0;
    }
  }

  function extendSprayIncrementalPuff(
    path: [number, number, number][],
    params: PathThickenParams
  ): void {
    ensureSprayIncrementalBuffers();
    const seen = sprayIncrementalSeen!;
    const out = sprayIncrementalOut!;
    const r = params.sprayRadius;
    const shape = params.sprayBrushShape ?? 'sphere';
    const snapN =
      (params.spraySnapToSurface ?? false) && params.drawBrushFaceNormal
        ? params.drawBrushFaceNormal
        : null;
    for (let i = sprayIncrementalPathLen; i < path.length; i++) {
      const p = path[i]!;
      const [cx, cy, cz] = offsetSprayStampCenterForSnap(p[0], p[1], p[2], r, snapN);
      if (shape === 'cube') {
        mergeCubeStampIntoSeen(cx, cy, cz, r, seen, out);
      } else if (shape === 'pyramid') {
        mergePyramidStampIntoSeen(cx, cy, cz, r, seen, out);
      } else {
        mergeSphereStampIntoSeen(cx, cy, cz, r, seen, out);
      }
    }
    sprayIncrementalPathLen = path.length;
  }

  function updatePreviewMesh(
    positions: [number, number, number][],
    bboxHint: StrokePreviewBboxHint | null = null
  ) {
    if (!meshManager) return;
    if (positions.length === 0) {
      strokePreviewLodScheduler.cancel();
      strokePreviewLodPendingFull = null;
    }
    const sel = $selection;
    const bboxGated = sel.size > 0 && ($tool === 'paint' || $tool === 'remove') ? null : bboxHint;

    /** Remove-only: red pre-drag ghost; other tools use real colors + invert-on-overlap (see overlap shading). */
    const useRemoveStylePreDragPreview =
      $tool === 'remove' &&
      !isVoxelDrag &&
      !isStampDrag &&
      cuboidPhase !== 'depth' &&
      cylinderPhase !== 'depth' &&
      solidPolygonPhase !== 'depth' &&
      ropePhase !== 'tension' &&
      clothPhase !== 'tension';

    const previewVoxelFor = (count: number): Voxel => {
      if (useRemoveStylePreDragPreview) {
        return count === 0
          ? { color: 0, material: 'plastic' }
          : { color: 0xff4444, material: 'plastic' };
      }
      return count === 0
        ? { color: 0, material: 'plastic' }
        : $tool === 'remove' || $tool === 'punch'
          ? { color: 0xff4444, material: 'plastic' }
          : $tool === 'select' ||
              $tool === 'selectByColor' ||
              $tool === 'selectCoplanar' ||
              $tool === 'selectCoplanarEmpty'
            ? { color: 0x33aaff, material: 'plastic' }
            : getPaintColorResolver()();
    };

    const drawBrushInflatesBounds =
      bboxGated != null &&
      bboxGated.drawBrushInflate != null &&
      (bboxGated.drawBrushInflate.drawBrushSize ?? 0) > 0;

    const useBbox =
      bboxGated !== null &&
      (bboxGated.forceUseBbox === true ||
        (bboxGated.cylinderVolume != null && !drawBrushInflatesBounds) ||
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
      strokePreviewLodScheduler.cancel();
      strokePreviewLodPendingFull = null;
      let cylVol = bboxGated.cylinderVolume;
      if (drawBrushInflatesBounds) cylVol = undefined;
      const sym = getCurrentSymmetryAxes();
      if (cylVol && (isShiftPlaneSymmetryActive() || sym.x || sym.y || sym.z)) {
        cylVol = undefined;
      }
      meshManager.updatePreviewBoundingBox(b, pv, cylVol ?? null);
      return;
    }

    const expanded = expandPositionsForActiveSymmetry(positions);
    const filtered =
      sel.size > 0 && ($tool === 'paint' || $tool === 'remove')
        ? expanded.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : expanded;
    const previewVoxel = previewVoxelFor(filtered.length);
    const previewOverlapShading: PreviewOverlapShading =
      $tool === 'remove' ? 'darken' : 'invert';
    const existingForPreview = filtered.length > 0 ? $voxels : undefined;
    const stride =
      filtered.length > PREVIEW_LOD_COARSE_TARGET
        ? computePreviewLodStride(filtered.length)
        : 1;
    const lodBounds = getBoundsFromPositions(filtered);
    if (stride > 1 && lodBounds) {
      strokePreviewLodPendingFull = filtered;
      const min: [number, number, number] = [
        lodBounds.minX,
        lodBounds.minY,
        lodBounds.minZ
      ];
      const coarseMap = downsamplePositionsToPreviewMap(
        filtered,
        previewVoxel,
        stride,
        min,
        existingForPreview,
        previewOverlapShading
      );
      meshManager.updatePreviewMeshLod(
        coarseMap,
        existingForPreview,
        previewOverlapShading,
        stride,
        min,
        lodBounds
      );
      const capturedOverlap = previewOverlapShading;
      const capturedVoxel = previewVoxel;
      strokePreviewLodScheduler.schedule(() => {
        if (!meshManager) return;
        const pts = strokePreviewLodPendingFull;
        if (!pts || pts.length === 0) return;
        const vox = get(voxels);
        meshManager.updatePreviewMesh(
          pts,
          capturedVoxel,
          vox.size > 0 ? vox : undefined,
          capturedOverlap
        );
        markCanvasDirty();
      });
      return;
    }
    strokePreviewLodScheduler.cancel();
    strokePreviewLodPendingFull = null;
    meshManager.updatePreviewMesh(
      filtered,
      previewVoxel,
      existingForPreview,
      previewOverlapShading
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

  function updateCylinderFromDepth() {
    if (!cylinderPlane) return;
    const ax = Math.abs(cylinderPlane.normal.x);
    const ay = Math.abs(cylinderPlane.normal.y);
    const az = Math.abs(cylinderPlane.normal.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const d: [number, number, number] = [0, 0, 0];
    d[axis] = cylinderDepth;
    deltaDisplay = { dx: d[0], dy: d[1], dz: d[2] };
    const cb = cylinderStrokeBounds(
      cylinderPlane.center,
      cylinderPlane.edge,
      cylinderPlane.normal,
      cylinderDepth
    );
    const bboxHintBase: StrokePreviewBboxHint = {
      primaryBounds: cb,
      cylinderVolume: buildCylinderPreviewVolume(
        cylinderPlane.center,
        cylinderPlane.edge,
        cylinderPlane.normal,
        cb,
        cylinderDepth,
        get(planeCylinderTaperPct)
      )
    };
    const solidEst =
      cylinderSolidVoxelCount(
        cylinderPlane.center,
        cylinderPlane.edge,
        cylinderPlane.normal,
        cylinderDepth
      ) * strokePreviewSymmetryExpansionFactor();
    if (solidEst >= PREVIEW_BBOX_VOXEL_THRESHOLD) {
      pendingStrokePositions = [];
      updatePreviewMesh([], { ...bboxHintBase, forceUseBbox: true });
    } else {
      pendingStrokePositions = getAxisAlignedCylinder(
        cylinderPlane.center,
        cylinderPlane.edge,
        cylinderPlane.normal,
        cylinderDepth,
        get(planeCylinderTaperPct),
        get(planeCuboidHollow),
        clampPlaneCuboidHollowWallThickness()
      );
      updatePreviewMesh(pendingStrokePositions, bboxHintBase);
    }
    render();
  }

  function commitCylinder() {
    if (!cylinderPlane) return;
    const positions = getAxisAlignedCylinder(
      cylinderPlane.center,
      cylinderPlane.edge,
      cylinderPlane.normal,
      cylinderDepth,
      get(planeCylinderTaperPct),
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
    cylinderPhase = null;
    cylinderPlane = null;
    pendingStrokePositions = [];
    updatePreviewMesh([]);
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

  function solidPolygonNormalVec(): { x: number; y: number; z: number } | null {
    const n = solidPolygonInitialNormal;
    if (!n) return null;
    return { x: n[0], y: n[1], z: n[2] };
  }

  function getSolidPolygonPlacingFillPreview(): [number, number, number][] {
    if (solidPolygonPoints.length < 2) return [];
    const vec = solidPolygonNormalVec();
    if (!vec) return [];
    const origin = solidPolygonPoints[0]!;
    const base = getSolidPolygonBasePositions(solidPolygonPoints, origin, vec);
    if (!base) return [];
    return applyPolygonNormalOffset(base, solidPolygonInitialNormal, get(polygonOffsetFromNormal));
  }

  function buildSolidPolygonStrokePositions(): [number, number, number][] {
    const vec = solidPolygonNormalVec();
    if (!vec || solidPolygonPoints.length < 2) return [];
    const origin = solidPolygonPoints[0]!;
    const base = getSolidPolygonBasePositions(solidPolygonPoints, origin, vec);
    if (!base) return [];
    const baseOff = applyPolygonNormalOffset(base, solidPolygonInitialNormal, get(polygonOffsetFromNormal));
    return extrudeSolidPolygonBaseAlongNormal(
      baseOff,
      vec,
      solidPolygonDepth,
      get(planeCuboidHollow),
      clampPlaneCuboidHollowWallThickness()
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
    if (isRoofShapeDrag && container && dragPointerId !== null) {
      try {
        container.releasePointerCapture(dragPointerId);
      } catch {
        /* ignore */
      }
      dragPointerId = null;
    }
    roofPoints = [];
    roofPhase = null;
    roofPlacementNormal = null;
    isRoofShapeDrag = false;
    roofShapeDragKind = null;
    roofDragStartPos = null;
    roofShapeLiveFootprint = null;
    roofShapeCommittedFootprint = null;
    roofShapeWindingFlipped = false;
    updatePolygonPreview([]);
    updatePreviewMesh([]);
  }

  function refreshRoofPreviewMesh() {
    if (!roofPlacementNormal) {
      updatePreviewMesh([]);
      return;
    }
    const sel = get(roofSelectionMethod);
    let pointArg: [number, number, number][];
    let footprintFromShape: [number, number, number][] | undefined;
    if (sel === 'polygon') {
      if (roofPoints.length < 4) {
        updatePreviewMesh([]);
        return;
      }
      pointArg = roofPoints;
    } else {
      const fp = roofShapeLiveFootprint ?? roofShapeCommittedFootprint;
      if (!fp || fp.length === 0) {
        updatePreviewMesh([]);
        return;
      }
      pointArg = [];
      footprintFromShape = fp;
    }
    const roofMap = generateRoofVoxels(pointArg, roofPlacementNormal, {
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
      color: getPaintColorResolver()().color,
      footprintFromShape,
      footprintWindingFlip: sel !== 'polygon' && roofShapeWindingFlipped,
      profileCurve: get(roofProfileCurve)
    });
    const positions = [...roofMap.keys()].map((k) => parseCoordKey(k) as [number, number, number]);
    updatePreviewMesh(positions);
  }

  function commitRoof() {
    if (!roofPlacementNormal) return;
    const sel = get(roofSelectionMethod);
    let pointArg: [number, number, number][];
    let footprintFromShape: [number, number, number][] | undefined;
    if (sel === 'polygon') {
      if (roofPoints.length < 4) return;
      pointArg = roofPoints;
    } else {
      const fp = roofShapeCommittedFootprint;
      if (!fp || fp.length === 0) return;
      pointArg = [];
      footprintFromShape = fp;
    }
    const roofMap = generateRoofVoxels(pointArg, roofPlacementNormal, {
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
      color: getPaintColorResolver()().color,
      footprintFromShape,
      footprintWindingFlip: sel !== 'polygon' && roofShapeWindingFlipped,
      profileCurve: get(roofProfileCurve)
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
      const ropeStrokeSeed = Math.floor(Math.random() * 0xffffffff);
      runVoxelStroke(() =>
        applySculptStroke(positions, 'rope', {
          spinePath: centerline,
          strokeSeed: ropeStrokeSeed
        })
      );
    }
    cancelRope();
    render();
  }

  function cancelCloth() {
    clothPoints = [];
    clothPlacementNormal = null;
    clothPhase = null;
    updatePolygonPreview([]);
    updateRopePointsMesh([]);
    updatePreviewMesh([]);
  }

  function finishClothPlacing() {
    if (clothPoints.length < 3) return;
    clothPhase = 'tension';
    updatePolygonPreview([]);
    if (dragPointerId !== null && container) {
      try {
        container.releasePointerCapture(dragPointerId);
      } catch {
        /* ignore */
      }
      dragPointerId = null;
    }
    updateClothFromTension();
    requestAnimationFrame(() => render());
  }

  function updateClothFromTension() {
    if (clothPoints.length < 3) return;
    const t = get(clothTension);
    const gravity = get(ropeGravityDirection);
    const brushR = get(ropeBrushRadius) * 0.5;
    const centerline = getClothPatchFromPinsVoxels(clothPoints, t, gravity, brushR);
    const shape = get(ropeBrushShape);
    const radius = brushR;
    const positions = applyBrushAlongPath(centerline, shape, radius);
    pendingStrokePositions = positions;
    updatePreviewMesh(positions);
    render();
  }

  function commitCloth() {
    if (clothPoints.length < 3) return;
    const t = get(clothTension);
    const gravity = get(ropeGravityDirection);
    const brushR = get(ropeBrushRadius) * 0.5;
    const centerline = getClothPatchFromPinsVoxels(clothPoints, t, gravity, brushR);
    const shape = get(ropeBrushShape);
    const radius = brushR;
    const positions = applyBrushAlongPath(centerline, shape, radius);
    if (positions.length > 0) {
      const clothStrokeSeed = Math.floor(Math.random() * 0xffffffff);
      runVoxelStroke(() =>
        applySculptStroke(positions, 'cloth', {
          spinePath: centerline,
          strokeSeed: clothStrokeSeed
        })
      );
    }
    cancelCloth();
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

  function cancelSolidPolygon() {
    if (depthAdjustPointerId !== null && container) {
      try {
        container.releasePointerCapture(depthAdjustPointerId);
      } catch {
        /* ignore */
      }
      depthAdjustPointerId = null;
    }
    deltaDisplay = null;
    solidPolygonPoints = [];
    solidPolygonPhase = null;
    solidPolygonInitialNormal = null;
    updatePolygonPreview([]);
    pendingStrokePositions = [];
    updatePreviewMesh([]);
  }

  function beginSolidPolygonDepth() {
    const vec = solidPolygonNormalVec();
    if (!vec || solidPolygonPoints.length < 2) return;
    const origin = solidPolygonPoints[0]!;
    if (getSolidPolygonBasePositions(solidPolygonPoints, origin, vec) === null) return;
    solidPolygonPhase = 'depth';
    solidPolygonDepth = 1;
    updateSolidPolygonFromDepth();
  }

  function updateSolidPolygonFromDepth() {
    if (solidPolygonPhase !== 'depth') return;
    const vec = solidPolygonNormalVec();
    if (!vec) return;
    const positions = buildSolidPolygonStrokePositions();
    deltaDisplay = getSolidPolygonDepthDeltaDisplay(vec, solidPolygonDepth);
    pendingStrokePositions = positions;
    updatePreviewMesh(positions);
    render();
  }

  function commitSolidPolygon() {
    if (solidPolygonPhase !== 'depth') return;
    const positions = buildSolidPolygonStrokePositions();
    if (positions.length > 0) {
      if ($tool === 'select') {
        applySelectStroke(positions, selectionModeForCurrentGesture ?? get(selectionMode));
      } else {
        runVoxelStroke(() => applyLineStroke(positions));
      }
    }
    deltaDisplay = null;
    solidPolygonPhase = null;
    solidPolygonPoints = [];
    solidPolygonInitialNormal = null;
    updatePolygonPreview([]);
    pendingStrokePositions = [];
    updatePreviewMesh([]);
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
    if (solidPolygonPhase) {
      cancelSolidPolygon();
    }
    if (roofPhase) {
      cancelRoof();
    }
    if (ropePhase) {
      cancelRope();
    }
    if (clothPhase) {
      cancelCloth();
    }
    if (cuboidPhase || cylinderPhase) {
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
      cylinderPhase = null;
      cylinderPlane = null;
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
      clearSprayIncrementalPuff();
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
    getInsectaPhase: () => insectaPhase,
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
    setNextInsectaSeed: (n) => {
      nextInsectaPlacementSeed = n;
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
          cylinderPhase,
          polygonPhase,
          solidPolygonPhase,
          roofPhase,
          ropePhase,
          clothPhase
        })
      ),
    cancelDrag
  };

  const voxelGeneratorPrimaryPointerUpBridge: VoxelGeneratorPrimaryPointerUpBridge = {
    getTool: () => get(tool),
    getAddPanelOpen: () => get(addPanelStore).open,
    getPiscinaPhase: () => piscinaPhase,
    getInsectaPhase: () => insectaPhase,
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
    getNextInsectaSeed: () => nextInsectaPlacementSeed,
    setNextInsectaSeed: (n) => {
      nextInsectaPlacementSeed = n;
    },
    commitInsectaSurfacePick: (place, normal) => {
      insectaLockedPlace = place;
      insectaLockedNormal = normal;
      insectaHoverPlace = null;
      insectaHoverNormal = null;
      insectaPhase = 'shape';
    },
    scheduleRender: () => requestAnimationFrame(() => markCanvasDirty())
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
          cylinderPhase,
          polygonPhase,
          solidPolygonPhase,
          roofPhase,
          ropePhase,
          clothPhase
        })
      ) {
        event.preventDefault();
        cancelDrag();
        render();
      }
      return;
    }
    if (event.button !== 0) return;
    if (isMoodTool($tool)) {
      applyMoodFaceClickPointerDown(
        buildVoxelMoodFaceClickDeps(voxelGeneratorPrimaryPointerUpBridge),
        event
      );
    }
    if ($tool === 'hand' || isMoodTool($tool)) return;

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

    if (
      get(effectiveStrokeMode) === 'cylinder' &&
      cylinderPhase === 'depth' &&
      cylinderPlane &&
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

    if (
      get(effectiveStrokeMode) === 'polygon' &&
      solidPolygonPhase === 'depth' &&
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

    const strokeModeAtPointerDown = get(effectiveStrokeMode);
    /** Prefer instanced corner handles over greedy voxel mesh (merged quads break voxel-center picks). */
    let hit: THREE.Intersection | null = null;
    const cornerPickMesh = polygonPointsMesh;
    const cornerPickCamera = camera;
    const tryPolygonCornerPick =
      cornerPickMesh &&
      cornerPickCamera &&
      cornerPickMesh.count > 0 &&
      ((strokeModeAtPointerDown === 'polygonHull' && polygonPhase) ||
        (strokeModeAtPointerDown === 'polygon' && solidPolygonPhase === 'placing') ||
        ($tool === 'cloth' && clothPhase === 'placing'));
    if (tryPolygonCornerPick) {
      raycaster.setFromCamera(pointer, cornerPickCamera);
      const cornerHits = raycaster.intersectObject(cornerPickMesh, false);
      if (cornerHits.length > 0) hit = cornerHits[0]!;
    }
    if (!hit) {
      if (
        !(
          strokeModeAtPointerDown === 'precise' &&
          precisePhase === 'armed' &&
          preciseAnchor &&
          preciseNormal
        )
      ) {
        hit = getIntersection();
      }
    }
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

    if (
      hit &&
      $tool === 'roof' &&
      get(roofSelectionMethod) === 'polygon' &&
      roofPhase &&
      polygonPointsMesh &&
      camera
    ) {
      raycaster.setFromCamera(pointer, camera);
      const roofPointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (roofPointHits.length > 0) hit = roofPointHits[0];
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

    if ($tool === 'cloth' && clothPhase !== 'tension') {
      event.preventDefault();
      event.stopPropagation();
      container.setPointerCapture(event.pointerId);
      dragPointerId = event.pointerId;
      if (hit.object === polygonPointsMesh && typeof hit.instanceId === 'number') {
        const idx = hit.instanceId;
        if (idx >= 0 && idx < clothPoints.length) {
          clothPoints = clothPoints.filter((_, i) => i !== idx);
          if (clothPoints.length === 0) {
            clothPhase = null;
            clothPlacementNormal = null;
          } else {
            clothPhase = 'placing';
          }
          updatePolygonPreview(clothPoints);
          const fill = clothPoints.length >= 3 ? getPolygonVoxels(clothPoints) : [];
          updatePreviewMesh(
            clothPlacementNormal
              ? applyPolygonNormalOffset(
                  fill,
                  clothPlacementNormal,
                  get(polygonOffsetFromNormal)
                )
              : fill
          );
        }
      } else {
        const pos = getAddPosition(hit) ?? getVoxelPosition(hit);
        if (pos) {
          const existingIdx = clothPoints.findIndex(
            ([x, y, z]) => x === pos[0] && y === pos[1] && z === pos[2]
          );
          if (existingIdx >= 0) {
            clothPoints = clothPoints.filter((_, i) => i !== existingIdx);
            if (clothPoints.length === 0) {
              clothPhase = null;
              clothPlacementNormal = null;
            }
          } else {
            clothPhase = 'placing';
            clothPoints = [...clothPoints, pos];
            if (!clothPlacementNormal) clothPlacementNormal = getFaceNormalFromHit(hit);
          }
          updatePolygonPreview(clothPoints);
          const fill = clothPoints.length >= 3 ? getPolygonVoxels(clothPoints) : [];
          updatePreviewMesh(
            clothPlacementNormal
              ? applyPolygonNormalOffset(
                  fill,
                  clothPlacementNormal,
                  get(polygonOffsetFromNormal)
                )
              : fill
          );
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    if (get(effectiveStrokeMode) === 'polygonHull') {
      event.preventDefault();
      event.stopPropagation();
      // Click on existing point: remove it
      if (hit.object === polygonPointsMesh && typeof hit.instanceId === 'number') {
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

    if (get(effectiveStrokeMode) === 'polygon') {
      event.preventDefault();
      event.stopPropagation();
      if (solidPolygonPhase === 'depth') {
        requestAnimationFrame(() => render());
        return;
      }
      if (hit.object === polygonPointsMesh && typeof hit.instanceId === 'number') {
        const idx = hit.instanceId;
        if (idx >= 0 && idx < solidPolygonPoints.length) {
          solidPolygonPoints = solidPolygonPoints.filter((_, i) => i !== idx);
          if (solidPolygonPoints.length === 0) solidPolygonInitialNormal = null;
          solidPolygonPhase = solidPolygonPoints.length > 0 ? 'placing' : null;
          updatePolygonPreview(solidPolygonPoints);
          updatePreviewMesh(getSolidPolygonPlacingFillPreview());
        }
      } else {
        const pos = getVoxelPosition(hit);
        if (pos) {
          const existingIdx = solidPolygonPoints.findIndex(
            ([x, y, z]) => x === pos[0] && y === pos[1] && z === pos[2]
          );
          if (existingIdx >= 0) {
            solidPolygonPoints = solidPolygonPoints.filter((_, i) => i !== existingIdx);
            if (solidPolygonPoints.length === 0) solidPolygonInitialNormal = null;
            solidPolygonPhase = solidPolygonPoints.length > 0 ? 'placing' : null;
          } else {
            const wasEmpty = solidPolygonPoints.length === 0;
            solidPolygonPhase = 'placing';
            solidPolygonPoints = [...solidPolygonPoints, pos];
            if (wasEmpty) solidPolygonInitialNormal = getFaceNormalFromHit(hit);
          }
          updatePolygonPreview(solidPolygonPoints);
          updatePreviewMesh(getSolidPolygonPlacingFillPreview());
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    if ($tool === 'roof' && !$addPanelStore.open) {
      event.preventDefault();
      event.stopPropagation();
      const roofSel = get(roofSelectionMethod);
      if (roofSel === 'polygon') {
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
      } else {
        const pos = getVoxelPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (pos && normal) {
          container.setPointerCapture(event.pointerId);
          dragPointerId = event.pointerId;
          isRoofShapeDrag = true;
          roofShapeDragKind = roofSel;
          roofDragStartPos = pos;
          roofPlacementNormal = normal;
          roofPhase = 'placing';
          roofPoints = [];
          roofShapeCommittedFootprint = null;
          roofShapeLiveFootprint = null;
          updatePolygonPreview([]);
          const faceN = { x: normal[0], y: normal[1], z: normal[2] };
          roofShapeLiveFootprint =
            roofSel === 'circle'
              ? getAxisAlignedCircleFromNormal(pos, pos, faceN, false, 1)
              : getAxisAlignedPlaneFromNormal(pos, pos, faceN, false, 1);
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

    // Rope tool: two-click flow (before sculpt path modes)
    if ($tool === 'rope') {
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

    const mode = get(sculptMode);
    // Sculpt path-following modes: start drag on surface (not branch — separate branch below)
    if ($tool === 'sculpt' && isSculptDragPathMode(mode)) {
      // Start on voxel surface or face of voxel (extend outward)
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
            sculptMode: mode,
            sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
            sculptBrushShape: get(sculptBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            branchBrushProfile: get(branchBrushProfile),
            branchEndCap: get(branchEndCap),
            sprayRadius: (get(sprayRadius) as number) * 0.5,
            sprayScatter: get(sprayScatter),
            sprayRadiusRange: get(sprayRadiusRange),
            sprayRadiusMin: get(sprayRadiusMin) * 0.5,
            sprayRadiusMax: get(sprayRadiusMax) * 0.5,
            sprayBrushShape: get(sprayBrushShape),
            ...sprayPlaneParamsForStroke(),
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
            spraySnapToSurface: get(spraySnapToSurface),
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
    // Sculpt branch mode: start drag (extrude into empty space)
    if ($tool === 'sculpt' && mode === 'branch') {
      const pos = getAddPosition(hit) ?? getVoxelPosition(hit);
      if (pos) {
        isVoxelDrag = true;
        dragStartPos = pos;
        const n = getFaceNormalFromHit(hit);
        dragFaceNormal = n ? new THREE.Vector3(n[0], n[1], n[2]) : null;
        branchPointerDownX = event.clientX;
        branchPointerDownY = event.clientY;
        pendingStrokePositions = [pos];
        currentStrokeSeed = Math.floor(Math.random() * 0xffffffff);
        updatePreviewMesh(
          thickenPathForStroke(pendingStrokePositions, {
            strokeMode: get(strokeMode),
            sculptMode: 'branch',
            sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
            sculptBrushShape: get(sculptBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            branchBrushProfile: get(branchBrushProfile),
            branchEndCap: get(branchEndCap),
            sprayRadius: (get(sprayRadius) as number) * 0.5,
            sprayScatter: get(sprayScatter),
            sprayRadiusRange: get(sprayRadiusRange),
            sprayRadiusMin: get(sprayRadiusMin) * 0.5,
            sprayRadiusMax: get(sprayRadiusMax) * 0.5,
            sprayBrushShape: get(sprayBrushShape),
            ...sprayPlaneParamsForStroke(),
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
            spraySnapToSurface: get(spraySnapToSurface),
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

    // Face-click generators: place / surface-pick on pointerdown; do not start stroke drag
    if (isGeneratorFaceClickTool(get(tool))) {
      applyGeneratorFaceClickPointerDown(
        buildVoxelGeneratorPrimaryPointerUpDeps(voxelGeneratorPrimaryPointerUpBridge),
        event
      );
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
    // Line (non-axis-aligned) and spray (constrain-to-plane): always use clicked face normal
    const lineOnFace = get(effectiveStrokeMode) === 'line' && !get(lineAxisAlign);
    const sprayUseFaceNormal = get(effectiveStrokeMode) === 'spray';
    dragFaceNormal =
      lineOnFace || pa === 'auto' || sprayUseFaceNormal ? faceNormal : axisVector(pa);
    dragPlaneAxisOverride = null;
    pendingStrokePositions = [startPos];
    const sculptModeVal = get(sculptMode);
    const isSculptDragPathFollow =
      $tool === 'sculpt' && isSculptDragPathMode(sculptModeVal);
    if (isSculptDragPathFollow) {
      lastBulkPos = startPos;
    } else if (get(effectiveStrokeMode) === 'spray') {
      lastBulkPos = startPos;
    }
    const strokeParams = {
      strokeMode: get(strokeMode),
      sculptMode: isSculptDragPathFollow ? sculptModeVal : undefined,
      sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
      sculptBrushShape: get(sculptBrushShape),
      branchTaper: get(branchTaper),
      branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
      branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
      branchBrushProfile: get(branchBrushProfile),
      branchEndCap: get(branchEndCap),
      sprayRadius: (get(sprayRadius) as number) * 0.5,
      sprayScatter: get(sprayScatter),
      sprayRadiusRange: get(sprayRadiusRange),
      sprayRadiusMin: get(sprayRadiusMin) * 0.5,
      sprayRadiusMax: get(sprayRadiusMax) * 0.5,
      sprayBrushShape: get(sprayBrushShape),
      ...sprayPlaneParamsForStroke(),
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
      spraySnapToSurface: get(spraySnapToSurface),
      drawBrushFaceNormal: dragFaceNormal
        ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
        : undefined,
      seed: currentStrokeSeed
    };
    if (
      !isSculptDragPathFollow &&
      get(effectiveStrokeMode) === 'spray' &&
      canUseSprayIncrementalPuff()
    ) {
      clearSprayIncrementalPuff();
      extendSprayIncrementalPuff(pendingStrokePositions, strokeParams);
      updatePreviewMesh(sprayIncrementalOut!, null);
    } else {
      clearSprayIncrementalPuff();
      updatePreviewMesh(thickenPathForStroke(pendingStrokePositions, strokeParams));
    }
    requestAnimationFrame(() => render());
  }

  function handlePointerMove(event?: PointerEvent) {
    if (paintHoverMesh) paintHoverMesh.visible = false;
    if (paintHoverOccludedMesh) paintHoverOccludedMesh.visible = false;
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
      if ($tool === 'hand' || isMoodTool($tool)) {
        resetPiscinaPlacementFlow();
        resetInsectaPlacementFlow();
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
      if (
        $tool === 'roof' &&
        isRoofShapeDrag &&
        roofDragStartPos &&
        roofPlacementNormal &&
        roofShapeDragKind &&
        event
      ) {
        updatePointerFromEvent(event);
        const start = roofDragStartPos;
        const n = new THREE.Vector3(
          roofPlacementNormal[0],
          roofPlacementNormal[1],
          roofPlacementNormal[2]
        );
        const planePoint = new THREE.Vector3(start[0] + 0.5, start[1] + 0.5, start[2] + 0.5);
        let currentPos = getIntersectionWithPlane(planePoint, n);
        if (!currentPos) {
          const hitMv = getIntersection();
          if (hitMv) {
            const p = getVoxelPosition(hitMv);
            if (p) currentPos = p;
          }
        }
        if (currentPos) {
          const snapped: [number, number, number] = [
            Math.floor(currentPos[0]),
            Math.floor(currentPos[1]),
            Math.floor(currentPos[2])
          ];
          const faceN = { x: n.x, y: n.y, z: n.z };
          roofShapeLiveFootprint =
            roofShapeDragKind === 'circle'
              ? getAxisAlignedCircleFromNormal(start, snapped, faceN, false, 1)
              : getAxisAlignedPlaneFromNormal(start, snapped, faceN, false, 1);
          refreshRoofPreviewMesh();
          deltaDisplay = {
            dx: snapped[0] - start[0],
            dy: snapped[1] - start[1],
            dz: snapped[2] - start[2]
          };
        }
        rollOverMesh.visible = false;
        render();
        return;
      }
      // Cuboid / cylinder depth phase: depth from pointer drag (up/down movement) or slider
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
      if (
        cylinderPhase === 'depth' &&
        cylinderPlane &&
        event &&
        depthAdjustPointerId === event.pointerId
      ) {
        const dy = lastDepthPhaseClientY - event.clientY;
        lastDepthPhaseClientY = event.clientY;
        depthPhaseAccumulator += dy / 12;
        const step = Math.trunc(depthPhaseAccumulator);
        depthPhaseAccumulator -= step;
        cylinderDepth = Math.max(-256, Math.min(256, cylinderDepth + step));
        updateCylinderFromDepth();
        return;
      }
      if (
        solidPolygonPhase === 'depth' &&
        event &&
        depthAdjustPointerId === event.pointerId
      ) {
        const dy = lastDepthPhaseClientY - event.clientY;
        lastDepthPhaseClientY = event.clientY;
        depthPhaseAccumulator += dy / 12;
        const step = Math.trunc(depthPhaseAccumulator);
        depthPhaseAccumulator -= step;
        solidPolygonDepth = Math.max(-256, Math.min(256, solidPolygonDepth + step));
        updateSolidPolygonFromDepth();
        return;
      }
      if (isVoxelDrag && dragStartPos) {
        if (event) refreshShiftPlaneSymmetryState(event.shiftKey);
        const sculptPathMode = get(sculptMode);
        if ($tool === 'sculpt' && sculptPathMode === 'branch') {
          const currX = event?.clientX ?? branchPointerDownX;
          const currY = event?.clientY ?? branchPointerDownY;
          const dx = currX - branchPointerDownX;
          const dy = branchPointerDownY - currY; // screen up = positive
          const length = Math.max(0, Math.round(Math.sqrt(dx * dx + dy * dy) / 6));
          const dir = resolveBranchExtrudeDirection(get(branchExtrudeRef), {
            camera: camera ?? null,
            screenDx: dx,
            screenDy: dy,
            faceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : null
          });
          pendingStrokePositions = getRayDirectionPath(dragStartPos, dir, length);
          updatePreviewMesh(
            thickenPathForStroke(pendingStrokePositions, {
              strokeMode: get(strokeMode),
              sculptMode: 'branch',
              sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
              sculptBrushShape: get(sculptBrushShape),
              branchTaper: get(branchTaper),
              branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
              branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
              branchBrushProfile: get(branchBrushProfile),
              branchEndCap: get(branchEndCap),
              sprayRadius: (get(sprayRadius) as number) * 0.5,
              sprayScatter: get(sprayScatter),
              sprayRadiusRange: get(sprayRadiusRange),
              sprayRadiusMin: get(sprayRadiusMin) * 0.5,
              sprayRadiusMax: get(sprayRadiusMax) * 0.5,
              sprayBrushShape: get(sprayBrushShape),
              ...sprayPlaneParamsForStroke(),
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
              spraySnapToSurface: get(spraySnapToSurface),
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
              $tool === 'voxel' || $tool === 'sculpt' ? getAddPosition(hit) : getVoxelPosition(hit);
          }
          const strokeModeVal = get(effectiveStrokeMode);
          const sculptPathMode = get(sculptMode);
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
          const isSprayPath = strokeModeVal === 'spray' && lastBulkPos;
          const isSculptDragPathFollow =
            $tool === 'sculpt' && isSculptDragPathMode(sculptPathMode) && lastBulkPos;
          // Wall + lock start height: when cursor is in empty space, intersect ray with locked plane so path extends into thin air
          if (
            currentPos === null &&
            isSculptDragPathFollow &&
            sculptPathMode === 'wall' &&
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
          // Plane/circle/cuboid/cylinder and axis-aligned line: prefer drag-plane intersection so shape
          // extends into empty space. If ray is parallel to the plane, keep voxel-hit fallback.
          if (
            (strokeModeVal === 'plane' ||
              strokeModeVal === 'circle' ||
              strokeModeVal === 'cuboid' ||
              strokeModeVal === 'cylinder' ||
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
          // Free 3D line: no voxel hit — snap endpoint on view-parallel plane through start (same idea as plane shapes)
          if (
            currentPos === null &&
            strokeModeVal === 'line' &&
            !get(lineAxisAlign) &&
            dragStartPos &&
            camera
          ) {
            const camN = getCameraPlaneNormal();
            if (camN) {
              const planePoint = new THREE.Vector3(
                dragStartPos[0] + 0.5,
                dragStartPos[1] + 0.5,
                dragStartPos[2] + 0.5
              );
              const n = new THREE.Vector3(camN.x, camN.y, camN.z);
              const planePos = getIntersectionWithPlane(planePoint, n);
              if (planePos) currentPos = planePos;
            }
          }
          // Spray + constrain to plane: prefer plane intersection over voxel hit so cursor stays on the invisible plane
          if (isSprayPath && dragStartPos) {
            const normal = getSprayConstrainPlaneNormalWorld();
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
              isSculptDragPathFollow &&
              sculptPathMode === 'wall' &&
              get(wallLockStartHeight) &&
              dragStartPos
            ) {
              const axis = getWallDirectionAxis();
              if (axis !== null) {
                currentPos = [currentPos[0], currentPos[1], currentPos[2]];
                currentPos[axis] = dragStartPos[axis];
              }
            }
            if (isSculptDragPathFollow || isSprayPath) {
              if (
                isSculptDragPathFollow &&
                sculptPathMode === 'wall' &&
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
                  strokeModeVal === 'cuboid' ||
                  strokeModeVal === 'cylinder') &&
                normal
              ) {
                const hollow = get(planeCuboidHollow);
                const hollowWall =
                  strokeModeVal === 'circle' ? 1 : clampPlaneCuboidHollowWallThickness();
                pendingStrokePositions =
                  strokeModeVal === 'circle' || strokeModeVal === 'cylinder'
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
              } else if (strokeModeVal === 'line' && !get(lineAxisAlign)) {
                pendingStrokePositions = getBresenham3DLine(dragStartPos, currentPos);
              } else {
                pendingStrokePositions = getAxisAlignedLine(dragStartPos, currentPos);
              }
            }
            let strokeBboxHint: StrokePreviewBboxHint | null = null;
            if (
              !isSculptDragPathFollow &&
              !isSprayPath &&
              dragStartPos &&
              (strokeModeVal === 'plane' ||
                strokeModeVal === 'cuboid' ||
                strokeModeVal === 'cylinder' ||
                strokeModeVal === 'line')
            ) {
              const nPlane = getEffectivePlaneNormal();
              if ((strokeModeVal === 'plane' || strokeModeVal === 'cuboid') && nPlane) {
                strokeBboxHint = {
                  primaryBounds: planeStrokeBounds(dragStartPos, currentPos, nPlane),
                  drawBrushInflate: drawBrushInflateParams()
                };
              } else if (strokeModeVal === 'cylinder' && nPlane) {
                const db = diskStrokeBounds(dragStartPos, currentPos, nPlane);
                strokeBboxHint = {
                  primaryBounds: db,
                  drawBrushInflate: drawBrushInflateParams(),
                  cylinderVolume: buildCylinderPreviewVolume(
                    dragStartPos,
                    currentPos,
                    nPlane,
                    db,
                    0,
                    get(planeCylinderTaperPct)
                  )
                };
              } else if (strokeModeVal === 'line') {
                strokeBboxHint = {
                  primaryBounds: lineStrokeBounds(
                    dragStartPos,
                    currentPos,
                    !get(lineAxisAlign)
                  ),
                  drawBrushInflate: drawBrushInflateParams()
                };
              }
            }
            // Sculpt path modes: show thickened preview (brush radius); spray: droplet preview
            const moveStrokeParams: PathThickenParams = {
              strokeMode:
                isSprayPath && !isSculptDragPathFollow
                  ? 'spray'
                  : (strokeModeVal ?? get(strokeMode)),
              sculptMode: isSculptDragPathFollow ? sculptPathMode : undefined,
              sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
              sculptBrushShape: get(sculptBrushShape),
              branchTaper: get(branchTaper),
              branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
              branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
              branchBrushProfile: get(branchBrushProfile),
              branchEndCap: get(branchEndCap),
              sprayRadius: (get(sprayRadius) as number) * 0.5,
              sprayScatter: get(sprayScatter),
              sprayRadiusRange: get(sprayRadiusRange),
              sprayRadiusMin: get(sprayRadiusMin) * 0.5,
              sprayRadiusMax: get(sprayRadiusMax) * 0.5,
              sprayBrushShape: get(sprayBrushShape),
              ...sprayPlaneParamsForStroke(),
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
              spraySnapToSurface: get(spraySnapToSurface),
              drawBrushFaceNormal: dragFaceNormal
                ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
                : undefined,
              seed: currentStrokeSeed
            };
            if (
              isSprayPath &&
              !isSculptDragPathFollow &&
              canUseSprayIncrementalPuff()
            ) {
              extendSprayIncrementalPuff(pendingStrokePositions, moveStrokeParams);
              updatePreviewMesh(sprayIncrementalOut!, strokeBboxHint);
            } else {
              if (isSprayPath && !isSculptDragPathFollow) clearSprayIncrementalPuff();
              updatePreviewMesh(
                thickenPathForStroke(pendingStrokePositions, moveStrokeParams),
                strokeBboxHint
              );
            }
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
      // Cuboid / cylinder depth phase: preserve preview when idle (not dragging)
      if (cuboidPhase === 'depth' && cuboidPlane) {
        render();
        return;
      }
      if (cylinderPhase === 'depth' && cylinderPlane) {
        render();
        return;
      }
      if (solidPolygonPhase === 'depth') {
        render();
        return;
      }
      // Rope / cloth tension phase: idle sculpt path below calls updatePreviewMesh([]) every move — keep preview
      if (ropePhase === 'tension' || clothPhase === 'tension') {
        rollOverMesh.visible = false;
        render();
        return;
      }
      // Polygon hull / solid polygon placing / roof / cloth pins: preserve point loop preview, show rollOver for next point
      if (polygonPhase || solidPolygonPhase === 'placing' || roofPhase || clothPhase === 'placing') {
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
      // Piscina: preview after face lock (shape phase)
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
      if ($tool === 'insecta') {
        if (insectaPhase === 'shape' && insectaLockedPlace && insectaLockedNormal) {
          if (nextInsectaPlacementSeed === 0) {
            nextInsectaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
          }
          const place = insectaLockedPlace;
          const normal = insectaLockedNormal;
          const opts = buildInsectaOptionsFromStores();
          updatePreviewMesh(
            getInsectaPositions(nextInsectaPlacementSeed, place, normal, opts)
          );
          rollOverMesh.visible = false;
        } else if (insectaPhase === 'pick') {
          const hit = getIntersection();
          if (hit) {
            const place = getAddPosition(hit);
            const normal = getFaceNormalFromHit(hit);
            if (place && normal) {
              if (nextInsectaPlacementSeed === 0) {
                nextInsectaPlacementSeed = Math.floor(Math.random() * 0xffffffff);
              }
              insectaHoverPlace = place;
              insectaHoverNormal = normal;
              const opts = buildInsectaOptionsFromStores();
              updatePreviewMesh(
                getInsectaPositions(nextInsectaPlacementSeed, place, normal, opts)
              );
            } else {
              insectaHoverPlace = null;
              insectaHoverNormal = null;
              updatePreviewMesh([]);
            }
          } else {
            insectaHoverPlace = null;
            insectaHoverNormal = null;
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
      if (
        $tool !== 'voxel' &&
        $tool !== 'sculpt' &&
        $tool !== 'remove' &&
        $tool !== 'paint' &&
        $tool !== 'select' &&
        $tool !== 'selectByColor' &&
        $tool !== 'selectCoplanar' &&
        $tool !== 'selectCoplanarEmpty'
      ) {
        rollOverMesh.visible = false;
        updatePreviewMesh([]);
        render();
        return;
      }
      const hit = getIntersection();
      if (!hit || !hit.face) {
        rollOverMesh.visible = false;
        if (get(effectiveStrokeMode) === 'spray') updatePreviewMesh([]);
        render();
        return;
      }
      if (get(effectiveStrokeMode) === 'spray') {
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
          const hoverPlaneN = getSprayHoverConstrainPlaneNormal(hit);
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
              strokeMode: 'spray',
              sculptMode: undefined,
              sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
              sculptBrushShape: get(sculptBrushShape),
              branchTaper: get(branchTaper),
              branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
              branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
              branchBrushProfile: get(branchBrushProfile),
              branchEndCap: get(branchEndCap),
              sprayRadius: (get(sprayRadius) as number) * 0.5,
              sprayScatter: get(sprayScatter),
              sprayRadiusRange: get(sprayRadiusRange),
              sprayRadiusMin: get(sprayRadiusMin) * 0.5,
              sprayRadiusMax: get(sprayRadiusMax) * 0.5,
              sprayBrushShape: get(sprayBrushShape),
              ...sprayPlaneParamsForFaceNormal(faceN),
              planeAxis: get(planeAxis),
              sprayDirection: get(sprayDirection),
              sprayStreakLength: get(sprayStreakLength),
              wallWidth: get(wallWidth) === 0 ? 0 : get(wallWidth) + 1,
              wallHeight: get(wallHeight),
              wallFaceNormal: faceN ? { x: faceN.x, y: faceN.y, z: faceN.z } : undefined,
              drawBrushShape: get(drawBrushShape),
              drawBrushSize: get(drawBrushSize) * 0.5,
              drawBrushSnapToSurface: get(drawBrushSnapToSurface),
              spraySnapToSurface: get(spraySnapToSurface),
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
      if ($tool === 'voxel' || $tool === 'sculpt') {
        const addPos = getAddPosition(hit);
        if (addPos && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
          rollOverMesh.position.set(addPos[0], addPos[1], addPos[2]);
          rollOverMesh.visible = true;
        } else {
          rollOverMesh.visible = false;
        }
      } else if (
        $tool === 'remove' ||
        $tool === 'paint' ||
        $tool === 'select' ||
        $tool === 'selectByColor' ||
        $tool === 'selectCoplanar' ||
        $tool === 'selectCoplanarEmpty'
      ) {
        const previewPos =
          $tool === 'selectCoplanarEmpty' ? getAddPosition(hit) : getVoxelPosition(hit);
        const isValidPreview =
          previewPos &&
          ($tool === 'selectCoplanarEmpty'
            ? !$voxels.has(coordKey(previewPos[0], previewPos[1], previewPos[2]))
            : $voxels.has(coordKey(previewPos[0], previewPos[1], previewPos[2])));
        if (previewPos && isValidPreview) {
          if (paintHoverMesh) {
            paintHoverMesh.position.set(previewPos[0], previewPos[1], previewPos[2]);
            paintHoverMesh.visible = true;
            if (paintHoverOccludedMesh) {
              paintHoverOccludedMesh.position.set(
                previewPos[0],
                previewPos[1],
                previewPos[2]
              );
              paintHoverOccludedMesh.visible = true;
            }
            rollOverMesh.visible = false;
          } else {
            rollOverMesh.position.set(previewPos[0], previewPos[1], previewPos[2]);
            rollOverMesh.visible = true;
          }
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
    if (paintHoverMesh) {
      paintHoverMesh.visible = false;
      if (paintHoverOccludedMesh) paintHoverOccludedMesh.visible = false;
      render();
    }
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
    if (event.button === 0 && $tool === 'roof' && isRoofShapeDrag) {
      updatePointerFromEvent(event);
      isRoofShapeDrag = false;
      roofShapeDragKind = null;
      roofDragStartPos = null;
      if (roofShapeLiveFootprint && roofShapeLiveFootprint.length > 0) {
        roofShapeCommittedFootprint = roofShapeLiveFootprint;
      }
      roofShapeLiveFootprint = null;
      if (dragPointerId !== null) {
        try {
          container.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        dragPointerId = null;
      }
      deltaDisplay = null;
      refreshRoofPreviewMesh();
      render();
    }
    if (
      event.button === 2 &&
      (isVoxelDrag ||
        selectionGizmo?.isGizmoDrag ||
        cuboidPhase ||
        cylinderPhase ||
        polygonPhase ||
        solidPolygonPhase ||
        roofPhase)
    ) {
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
    if (event.button === 0 && isVoxelDrag) {
      updatePointerFromEvent(event);
      const mode = get(effectiveStrokeMode);
      const sculptModeVal = get(sculptMode);
      const isSculptStrokePath =
        $tool === 'sculpt' && isSculptStrokePathMode(sculptModeVal);
      const normal = getEffectivePlaneNormal();
      if (mode === 'precise' && dragStartPos && preciseNormal && !isSculptStrokePath) {
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
      } else if (mode === 'cuboid' && dragStartPos && normal && !isSculptStrokePath) {
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
      } else if (mode === 'cylinder' && dragStartPos && normal && !isSculptStrokePath) {
        let edgePos = dragStartPos;
        const planePoint = new THREE.Vector3(
          dragStartPos[0] + 0.5,
          dragStartPos[1] + 0.5,
          dragStartPos[2] + 0.5
        );
        const planePos = getIntersectionWithPlane(planePoint, normal);
        if (planePos) {
          edgePos = planePos;
        } else {
          const hit = getIntersection();
          if (hit) {
            const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
            if (pos) edgePos = pos;
          }
        }
        cylinderPhase = 'depth';
        cylinderPlane = {
          center: dragStartPos,
          edge: edgePos,
          normal
        };
        cylinderDepth = 1;
        updateCylinderFromDepth();
      } else {
        // Apply the stroke on release (line/plane / sculpt modes)
        if (pendingStrokePositions.length > 0) {
          const toApply = thickenPathForStroke(pendingStrokePositions, {
            strokeMode: mode ?? get(strokeMode),
            sculptMode: isSculptStrokePath ? sculptModeVal : undefined,
            sculptBrushRadius: (get(sculptBrushRadius) as number) * 0.5,
            sculptBrushShape: get(sculptBrushShape),
            branchTaper: get(branchTaper),
            branchTaperStartRadius: get(branchTaperStartSize) * 0.5,
            branchTaperEndRadius: get(branchTaperEndSize) * 0.5,
            branchBrushProfile: get(branchBrushProfile),
            branchEndCap: get(branchEndCap),
            sprayRadius: (get(sprayRadius) as number) * 0.5,
            sprayScatter: get(sprayScatter),
            sprayRadiusRange: get(sprayRadiusRange),
            sprayRadiusMin: get(sprayRadiusMin) * 0.5,
            sprayRadiusMax: get(sprayRadiusMax) * 0.5,
            sprayBrushShape: get(sprayBrushShape),
            ...sprayPlaneParamsForStroke(),
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
            spraySnapToSurface: get(spraySnapToSurface),
            drawBrushFaceNormal: dragFaceNormal
              ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z }
              : undefined,
            seed: currentStrokeSeed
          });
          if ($tool === 'select') {
            applySelectStroke(toApply, selectionModeForCurrentGesture ?? get(selectionMode));
          } else if (isSculptStrokePath) {
            runVoxelStroke(() =>
              applySculptStroke(toApply, sculptModeVal, {
                terrainFalloffPath:
                  sculptModeVal === 'terrain' ? pendingStrokePositions : undefined,
                spinePath: pendingStrokePositions,
                strokeSeed: currentStrokeSeed
              })
            );
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
      clearSprayIncrementalPuff();
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
    if (e.key === 'Escape' && solidPolygonPhase) {
      cancelSolidPolygon();
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && roofPhase) {
      cancelRoof();
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && clothPhase) {
      cancelCloth();
      render();
      e.preventDefault();
    }
    if (e.key === 'Escape' && get(tool) === 'piscina' && piscinaPhase === 'shape') {
      pickAgainPiscina();
      e.preventDefault();
    }
    if (e.key === 'Escape' && get(tool) === 'insecta' && insectaPhase === 'shape') {
      pickAgainInsecta();
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
    if (e.key === 'Enter' && get(tool) === 'insecta' && insectaPhase === 'shape') {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        commitInsectaPlacement();
        e.preventDefault();
      }
    }
    if (
      e.key === 'Enter' &&
      get(tool) === 'cloth' &&
      clothPhase === 'placing' &&
      clothPoints.length >= 3
    ) {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        finishClothPlacing();
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
    const wheelTarget = event.target;
    if (
      wheelTarget instanceof Element &&
      wheelTarget.closest('[data-voxelle-no-passthrough]')
    ) {
      return;
    }
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
    // Alt+scroll during plane/cuboid/cylinder drag: cycle plane orientation (X/Y/Z)
    const mode = get(effectiveStrokeMode);
    if (
      event.altKey &&
      isVoxelDrag &&
      (mode === 'plane' || mode === 'circle' || mode === 'cuboid' || mode === 'cylinder') &&
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
        const hollowWall =
          mode === 'circle' ? 1 : clampPlaneCuboidHollowWallThickness();
        const n = axisVector(next);
        pendingStrokePositions =
          mode === 'circle' || mode === 'cylinder'
            ? getAxisAlignedCircleFromNormal(dragStartPos, currentPos, n, hollow, hollowWall)
            : getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, n, hollow, hollowWall);
        if (mode === 'plane' || mode === 'cuboid') {
          altScrollBbox = {
            primaryBounds: planeStrokeBounds(dragStartPos, currentPos, n),
            drawBrushInflate: drawBrushInflateParams()
          };
        } else if (mode === 'cylinder') {
          const db = diskStrokeBounds(dragStartPos, currentPos, n);
          altScrollBbox = {
            primaryBounds: db,
            drawBrushInflate: drawBrushInflateParams(),
            cylinderVolume: buildCylinderPreviewVolume(
              dragStartPos,
              currentPos,
              n,
              db,
              0,
              get(planeCylinderTaperPct)
            )
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
    planarAtmospherePassGL?.dispose();
    planarAtmospherePassGL = null;
    distanceTintPassGL?.dispose();
    distanceTintPassGL = null;
    sunShaftsPassGL?.dispose();
    sunShaftsPassGL = null;
    grainPassGL?.dispose();
    grainPassGL = null;
    atmosphereOnlyFogPass?.dispose();
    atmosphereOnlyFogPass = null;
    atmosphereOnlyDistanceTintPass?.dispose();
    atmosphereOnlyDistanceTintPass = null;
    atmosphereOnlySunShaftsPass?.dispose();
    atmosphereOnlySunShaftsPass = null;
    atmosphereOnlyGrainPass?.dispose();
    atmosphereOnlyGrainPass = null;
    atmosphereOnlyOutputPass?.dispose();
    atmosphereOnlyOutputPass = null;
    atmosphereOnlyComposer?.dispose();
    atmosphereOnlyComposer = null;
    atmosphereOnlyScenePass = null;
    bloomComposer?.dispose();
    bloomComposer = null;
    finalComposer?.dispose();
    finalComposer = null;
    sharedSceneRenderPass = null;
    webglDepthStash.texture = null;
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
    const finalDepthTexture = new THREE.DepthTexture(1, 1);
    const finalRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
      depthTexture: finalDepthTexture
    });

    sharedSceneRenderPass = new VoxelleSceneRenderPass(scene, camera, webglDepthStash);
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

    planarAtmospherePassGL = new StashingPlanarAtmospherePass(webglDepthStash);
    distanceTintPassGL = new StashingDistanceTintPass(webglDepthStash);
    sunShaftsPassGL = new SunShaftsPass(webglDepthStash);
    grainPassGL = new GrainPass();
    planarAtmospherePassGL.enabled = false;
    distanceTintPassGL.enabled = false;
    sunShaftsPassGL.enabled = false;
    grainPassGL.enabled = false;

    bloomOutputPass = new OutputPass();
    finalComposer = new EffectComposer(renderer, finalRenderTarget);
    finalComposer.addPass(sharedSceneRenderPass);
    finalComposer.addPass(bloomMixPass);
    finalComposer.addPass(planarAtmospherePassGL);
    finalComposer.addPass(distanceTintPassGL);
    finalComposer.addPass(sunShaftsPassGL);
    finalComposer.addPass(grainPassGL);
    finalComposer.addPass(bloomOutputPass);

    const atmosphereOnlyDepthTexture = new THREE.DepthTexture(1, 1);
    const atmosphereOnlyRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
      depthTexture: atmosphereOnlyDepthTexture
    });
    atmosphereOnlyComposer = new EffectComposer(renderer, atmosphereOnlyRT);
    atmosphereOnlyScenePass = new VoxelleSceneRenderPass(scene, camera, webglDepthStash);
    atmosphereOnlyFogPass = new StashingPlanarAtmospherePass(webglDepthStash);
    atmosphereOnlyDistanceTintPass = new StashingDistanceTintPass(webglDepthStash);
    atmosphereOnlySunShaftsPass = new SunShaftsPass(webglDepthStash);
    atmosphereOnlyGrainPass = new GrainPass();
    atmosphereOnlyFogPass.enabled = false;
    atmosphereOnlyDistanceTintPass.enabled = false;
    atmosphereOnlySunShaftsPass.enabled = false;
    atmosphereOnlyGrainPass.enabled = false;
    atmosphereOnlyOutputPass = new OutputPass();
    atmosphereOnlyComposer.addPass(atmosphereOnlyScenePass);
    atmosphereOnlyComposer.addPass(atmosphereOnlyFogPass);
    atmosphereOnlyComposer.addPass(atmosphereOnlyDistanceTintPass);
    atmosphereOnlyComposer.addPass(atmosphereOnlySunShaftsPass);
    atmosphereOnlyComposer.addPass(atmosphereOnlyGrainPass);
    atmosphereOnlyComposer.addPass(atmosphereOnlyOutputPass);

    bloomComposer.setSize(w, h);
    finalComposer.setSize(w, h);
    atmosphereOnlyComposer.setSize(w, h);
    atmosphereOnlyComposer.setPixelRatio(renderer.getPixelRatio());
  }

  function prepareWebGLAtmosphere(): void {
    if (
      !planarAtmospherePassGL ||
      !distanceTintPassGL ||
      !sunShaftsPassGL ||
      !grainPassGL ||
      !atmosphereOnlyFogPass ||
      !atmosphereOnlyDistanceTintPass ||
      !atmosphereOnlySunShaftsPass ||
      !atmosphereOnlyGrainPass ||
      !camera ||
      !renderer
    )
      return;
    const wantsAtmosphere = get(atmosphereActiveForRender);
    const wantsDistanceTint = get(distanceTintEnabled);
    const wantsGrain = get(grainEnabled);
    const wantsSunShafts = get(sunShaftsEnabled);
    const isRay = get(renderingMode) === 'ray';
    const wantsFog = wantsAtmosphere && !isRay;
    /** Ray: tint/grain stay in `applyRayPostMood`; post only adds sun shafts (screen-space, matches blocky). */
    const postDistanceTint = wantsDistanceTint && !isRay;
    const postGrain = wantsGrain && !isRay;
    const wanted = wantsFog || postDistanceTint || postGrain || wantsSunShafts;
    const hasGlow = sceneHasGlowMesh || hasGlowInVoxelGroup(voxelGroup);
    if (!wanted) {
      planarAtmospherePassGL.enabled = false;
      distanceTintPassGL.enabled = false;
      sunShaftsPassGL.enabled = false;
      grainPassGL.enabled = false;
      atmosphereOnlyFogPass.enabled = false;
      atmosphereOnlyDistanceTintPass.enabled = false;
      atmosphereOnlySunShaftsPass.enabled = false;
      atmosphereOnlyGrainPass.enabled = false;
      return;
    }
    planarAtmospherePassGL.enabled = hasGlow && wantsFog;
    distanceTintPassGL.enabled = hasGlow && postDistanceTint;
    sunShaftsPassGL.enabled = hasGlow && wantsSunShafts;
    grainPassGL.enabled = hasGlow && postGrain;
    atmosphereOnlyFogPass.enabled = !hasGlow && wantsFog;
    atmosphereOnlyDistanceTintPass.enabled = !hasGlow && postDistanceTint;
    atmosphereOnlySunShaftsPass.enabled = !hasGlow && wantsSunShafts;
    atmosphereOnlyGrainPass.enabled = !hasGlow && postGrain;
    if (bloomMixPass) bloomMixPass.enabled = hasGlow;
    const el = renderer.domElement;
    const sunUv = getSunScreenUv(camera as THREE.Camera, false);
    const opts = {
      fogColorHex: get(atmosphereColor),
      fogDensity: get(atmosphereDensity),
      fogEnabled: wantsFog,
      fogThickness: get(atmosphereThickness),
      mode: get(atmosphereMode),
      spatialMode: get(atmosphereSpatialMode),
      plane: get(atmospherePlane),
      fogHeightBias: get(atmosphereHeightBias),
      fogHeightFalloff: get(atmosphereHeightFalloff),
      fogDriftEnabled: get(atmosphereDriftEnabled),
      fogDriftAmount: get(atmosphereDriftAmount),
      fogDriftScale: get(atmosphereDriftScale),
      fogDriftSpeed: get(atmosphereDriftSpeed),
      timeSeconds: performance.now() * 0.001,
      distanceTintEnabled: false,
      distanceTintNearColorHex: '#ffffff',
      distanceTintMidColorHex: '#ffffff',
      distanceTintFarColorHex: '#ffffff',
      distanceTintNearDist: 1,
      distanceTintFarDist: 2,
      distanceTintStrength: 0,
      grainEnabled: false,
      grainStrength: 0,
      grainAnimated: false,
      grainSpeed: 0,
      grainColorful: false,
      width: el.width,
      height: el.height
    };
    if (planarAtmospherePassGL.enabled) {
      updatePlanarAtmosphereShaderUniforms(planarAtmospherePassGL, camera, opts);
    }
    if (atmosphereOnlyFogPass.enabled) {
      updatePlanarAtmosphereShaderUniforms(atmosphereOnlyFogPass, camera, opts);
    }
    const tintOpts = {
      enabled: postDistanceTint,
      nearColorHex: get(distanceTintNearColor),
      midColorHex: get(distanceTintMidColor),
      farColorHex: get(distanceTintFarColor),
      nearDist: get(distanceTintNearDistance),
      farDist: get(distanceTintFarDistance),
      strength: get(distanceTintStrength),
      width: el.width,
      height: el.height
    };
    const shaftsOpts = {
      enabled: wantsSunShafts,
      colorHex: get(atmosphereColor),
      sunScreenUv: sunUv,
      strength: get(sunShaftsStrength),
      decay: get(sunShaftsDecay),
      density: get(sunShaftsDensity),
      weight: get(sunShaftsWeight),
      samples: get(sunShaftsSamples),
      width: el.width,
      height: el.height
    };
    const grainOpts = {
      enabled: postGrain,
      strength: get(grainStrength),
      animated: get(grainAnimated),
      speed: get(grainSpeed),
      colorful: get(grainMode) === 'colorful',
      timeSeconds: performance.now() * 0.001,
      width: el.width,
      height: el.height
    };
    if (distanceTintPassGL.enabled) updateDistanceTintPassUniforms(distanceTintPassGL, camera, tintOpts);
    if (atmosphereOnlyDistanceTintPass.enabled)
      updateDistanceTintPassUniforms(atmosphereOnlyDistanceTintPass, camera, tintOpts);
    if (sunShaftsPassGL.enabled) updateSunShaftsPassUniforms(sunShaftsPassGL, camera, shaftsOpts);
    if (atmosphereOnlySunShaftsPass.enabled)
      updateSunShaftsPassUniforms(atmosphereOnlySunShaftsPass, camera, shaftsOpts);
    if (grainPassGL.enabled) updateGrainPassUniforms(grainPassGL, grainOpts);
    if (atmosphereOnlyGrainPass.enabled) updateGrainPassUniforms(atmosphereOnlyGrainPass, grainOpts);
  }

  function prepareWebGPUBloomAtmosphere(): boolean {
    if (!webgpuBloomPipeline || !camera) return false;
    const wantsAtmosphere = get(atmosphereActiveForRender);
    const isRay = get(renderingMode) === 'ray';
    const wantsFog = wantsAtmosphere && !isRay;
    const wantsDistanceTint = get(distanceTintEnabled);
    const wantsGrain = get(grainEnabled);
    const wantsSunShafts = get(sunShaftsEnabled);
    const postDistanceTint = wantsDistanceTint && !isRay;
    const postGrain = wantsGrain && !isRay;
    const wanted = wantsFog || postDistanceTint || postGrain || wantsSunShafts;
    webgpuBloomPipeline.setPlanarAtmosphereEnabled(wanted);
    if (wanted) {
      const sunUv = getSunScreenUv(camera as THREE.Camera, true);
      webgpuBloomPipeline.updatePlanarAtmosphereUniforms({
        camera,
        fogColorHex: get(atmosphereColor),
        fogDensity: get(atmosphereDensity),
        fogEnabled: wantsFog,
        fogThickness: get(atmosphereThickness),
        mode: get(atmosphereMode),
        spatialMode: get(atmosphereSpatialMode),
        plane: get(atmospherePlane),
        fogHeightBias: get(atmosphereHeightBias),
        fogHeightFalloff: get(atmosphereHeightFalloff),
        fogDriftEnabled: get(atmosphereDriftEnabled),
        fogDriftAmount: get(atmosphereDriftAmount),
        fogDriftScale: get(atmosphereDriftScale),
        fogDriftSpeed: get(atmosphereDriftSpeed),
        timeSeconds: performance.now() * 0.001,
        distanceTintEnabled: postDistanceTint,
        distanceTintNearColorHex: get(distanceTintNearColor),
        distanceTintMidColorHex: get(distanceTintMidColor),
        distanceTintFarColorHex: get(distanceTintFarColor),
        distanceTintNearDist: get(distanceTintNearDistance),
        distanceTintFarDist: get(distanceTintFarDistance),
        distanceTintStrength: get(distanceTintStrength),
        grainEnabled: postGrain,
        grainStrength: get(grainStrength),
        grainAnimated: get(grainAnimated),
        grainSpeed: get(grainSpeed),
        grainColorful: get(grainMode) === 'colorful',
        sunShaftsEnabled: get(sunShaftsEnabled),
        sunScreenUv: sunUv,
        sunShaftsStrength: get(sunShaftsStrength),
        sunShaftsDecay: get(sunShaftsDecay),
        sunShaftsDensity: get(sunShaftsDensity),
        sunShaftsWeight: get(sunShaftsWeight),
        sunShaftsSamples: get(sunShaftsSamples)
      });
    }
    return wanted;
  }

  /**
   * Screen-space sun anchor for god rays / planar sun term.
   * Project a far point along the parallel sun direction (same as Three `Vector3.project` NDC).
   * When the sun lies behind the camera plane, mirror NDC x/y through the origin — do not
   * negate the whole view direction before projecting (that skews the anchor left/right vs up/down).
   * WebGPU `screenUV` is top-left origin; pass `flipYForWebGpuFramebuffer = true` for `webgpuBloom` only.
   */
  function getSunScreenUv(
    cam: THREE.Camera,
    flipYForWebGpuFramebuffer: boolean
  ): { x: number; y: number } {
    if (!dirLight) return { x: 0.5, y: 0.2 };
    const lightPos = new THREE.Vector3();
    const targetPos = new THREE.Vector3();
    dirLight.getWorldPosition(lightPos);
    dirLight.target.getWorldPosition(targetPos);
    const toSun = new THREE.Vector3().subVectors(lightPos, targetPos);
    if (toSun.lengthSq() < 1e-10) return { x: 0.5, y: 0.2 };
    toSun.normalize();

    const forwardW = new THREE.Vector3();
    cam.getWorldDirection(forwardW);
    const behind = forwardW.dot(toSun) < 0;

    const probe = new THREE.Vector3().copy(cam.position).addScaledVector(toSun, 1e6);
    probe.project(cam);
    let ndcX = probe.x;
    let ndcY = probe.y;
    if (behind) {
      ndcX = -ndcX;
      ndcY = -ndcY;
    }

    let x = ndcX * 0.5 + 0.5;
    let y = ndcY * 0.5 + 0.5;
    if (flipYForWebGpuFramebuffer) y = 1 - y;
    x = Math.min(1.25, Math.max(-0.25, x));
    y = Math.min(1.25, Math.max(-0.25, y));
    return { x, y };
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
    const pr = renderer.getPixelRatio();
    if (w === lastCanvasResizeW && h === lastCanvasResizeH && pr === lastCanvasResizePr) {
      return;
    }
    lastCanvasResizeW = w;
    lastCanvasResizeH = h;
    lastCanvasResizePr = pr;
    if (camera instanceof THREE.OrthographicCamera) {
      updateOrthoFrustum();
    } else {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    // Keep canvas CSS-driven (100% of container) to avoid stale inline sizes after fullscreen toggles.
    renderer.setSize(w, h, false);
    bloomComposer?.setPixelRatio(pr);
    bloomComposer?.setSize(w, h);
    finalComposer?.setPixelRatio(pr);
    finalComposer?.setSize(w, h);
    atmosphereOnlyComposer?.setPixelRatio(pr);
    atmosphereOnlyComposer?.setSize(w, h);
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
        bloomMaterialStash,
        prepareWebGLAtmosphere,
        planarAtmospherePassGL,
        atmosphereOnlyComposer,
        atmosphereOnlyScenePass,
        atmosphereOnlyFogPass,
        atmosphereOnlyDistanceTintPass,
        atmosphereOnlySunShaftsPass,
        atmosphereOnlyGrainPass,
        prepareWebGPUBloomAtmosphere
      });
      lightingFlushPendingWebGpuShadowInvalidate(renderer, get(enableShadows), dirLight);
    }
    gizmoRef?.draw();
    canvasPresentationDirty = false;
  }

  function animate(now?: number) {
    animationFrameId = requestAnimationFrame(animate);
    const t = now ?? performance.now();
    const pipelineApplied = applyPendingVoxelPipelineMutations();
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
      getHiddenVoxelCount: () => get(hiddenVoxels).size,
      getEnableSky: () => get(enableSky),
      getBackgroundColor: () => get(backgroundColor),
      getAmbientIntensity: () => get(ambientIntensity),
      getSceneEnvironmentIntensity: () => get(sceneEnvironmentIntensity),
      getEnableShadows: () => get(enableShadows),
      getDistanceTintEnabled: () => get(distanceTintEnabled),
      getDistanceTintNearColor: () => get(distanceTintNearColor),
      getDistanceTintMidColor: () => get(distanceTintMidColor),
      getDistanceTintFarColor: () => get(distanceTintFarColor),
      getDistanceTintNearDistance: () => get(distanceTintNearDistance),
      getDistanceTintFarDistance: () => get(distanceTintFarDistance),
      getDistanceTintStrength: () => get(distanceTintStrength),
      getGrainEnabled: () => get(grainEnabled),
      getGrainStrength: () => get(grainStrength),
      getGrainAnimated: () => get(grainAnimated),
      getGrainSpeed: () => get(grainSpeed),
      getGrainColorful: () => get(grainMode) === 'colorful',
      getSunShaftsEnabled: () => get(sunShaftsEnabled),
      getSunShaftsStrength: () => get(sunShaftsStrength),
      getRayTraceContentDirty: () => {
        const p = pendingRayContentInvalidate;
        pendingRayContentInvalidate = false;
        return p;
      },
      setRayTraceContentDirty: (v) => {
        if (v) pendingRayContentInvalidate = true;
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
      getCylinderPhase: () => cylinderPhase,
      getPolygonPhase: () => polygonPhase,
      getSolidPolygonPhase: () => solidPolygonPhase,
      getRoofPhase: () => roofPhase,
      getRopePhase: () => ropePhase,
      getClothPhase: () => clothPhase,
      getFlyControlsEnabled: () => !!flyControls?.enabled,
      getPipelineAppliedThisFrame: () => pipelineApplied,
      getCanvasPresentationDirty: () => canvasPresentationDirty,
      getShouldAnimatePostFx: () =>
        get(renderingMode) !== 'ray' &&
        ((get(grainEnabled) && get(grainAnimated)) ||
          (get(atmosphereActiveForRender) && get(atmosphereDriftEnabled))),
      getVoxellePreferences: () => get(voxellePreferences),
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
    if (mode !== 'cylinder' && cylinderPhase) {
      cylinderPhase = null;
      cylinderPlane = null;
      pendingStrokePositions = [];
      updatePreviewMesh([]);
    }
    if (mode !== 'polygonHull' && polygonPhase) {
      cancelPolygon();
    }
    if (mode !== 'polygon' && solidPolygonPhase) {
      cancelSolidPolygon();
    }
  });

  $effect(() => {
    void $planeCylinderTaperPct;
    if (cylinderPhase === 'depth' && cylinderPlane) {
      updateCylinderFromDepth();
    }
  });

  $effect(() => {
    void $planeCuboidHollow;
    void $planeCuboidHollowWallThickness;
    if (solidPolygonPhase === 'depth') {
      updateSolidPolygonFromDepth();
    }
  });

  $effect(() => {
    const t = $tool;
    if (t !== 'rope' && ropePhase) {
      cancelRope();
    }
    if (t !== 'cloth' && clothPhase) {
      cancelCloth();
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
    if (clothPhase !== 'tension') return;
    updateClothFromTension();
    const unsubT = clothTension.subscribe(() => updateClothFromTension());
    const unsubS = ropeBrushShape.subscribe(() => updateClothFromTension());
    const unsubR = ropeBrushRadius.subscribe(() => updateClothFromTension());
    const unsubG = ropeGravityDirection.subscribe(() => updateClothFromTension());
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
    void $roofSelectionMethod;
    void $tool;
    const cur = $roofSelectionMethod;
    if ($tool === 'roof' && roofPhase && lastRoofSelForCancel !== null && lastRoofSelForCancel !== cur) {
      cancelRoof();
    }
    lastRoofSelForCancel = cur;
  });

  $effect(() => {
    const t = $roofWindingFlipTick;
    if (!roofPhase) {
      prevRoofWindingFlipTick = t;
      return;
    }
    const sel = $roofSelectionMethod;
    if (sel === 'polygon') {
      if (roofPoints.length < 2) {
        prevRoofWindingFlipTick = t;
        return;
      }
      if (t === prevRoofWindingFlipTick) return;
      prevRoofWindingFlipTick = t;
      roofPoints = [...roofPoints].reverse();
      updatePolygonPreview(roofPoints);
    } else {
      const hasShape =
        (roofShapeLiveFootprint?.length ?? 0) > 0 || (roofShapeCommittedFootprint?.length ?? 0) > 0;
      if (!hasShape && !isRoofShapeDrag) {
        prevRoofWindingFlipTick = t;
        return;
      }
      if (t === prevRoofWindingFlipTick) return;
      prevRoofWindingFlipTick = t;
      roofShapeWindingFlipped = !roofShapeWindingFlipped;
    }
    refreshRoofPreviewMesh();
    requestAnimationFrame(() => markCanvasDirty());
  });

  $effect(() => {
    if (!roofPhase) return;
    const sel = $roofSelectionMethod;
    if (sel === 'polygon' && roofPoints.length < 4) return;
    if (sel !== 'polygon') {
      const fp = roofShapeLiveFootprint ?? roofShapeCommittedFootprint;
      if (!fp?.length && !isRoofShapeDrag) return;
    }
    void roofPoints;
    void roofShapeLiveFootprint;
    void roofShapeCommittedFootprint;
    void isRoofShapeDrag;
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
    const u11 = roofProfileCurve.subscribe(() => refreshRoofPreviewMesh());
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
      u11();
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
    if (!solidPolygonPhase || solidPolygonPoints.length < 2) return;
    void solidPolygonPhase;
    void solidPolygonPoints;
    void solidPolygonInitialNormal;
    const syncSolidPolygonOffsetPreview = () => {
      if (solidPolygonPhase === 'placing') {
        updatePreviewMesh(getSolidPolygonPlacingFillPreview());
      } else if (solidPolygonPhase === 'depth') {
        updateSolidPolygonFromDepth();
      }
    };
    syncSolidPolygonOffsetPreview();
    return polygonOffsetFromNormal.subscribe(() => syncSolidPolygonOffsetPreview());
  });

  $effect(() => {
    void $voxels;
    void $gridSize;
    void $aoStrength;
    void $renderingMode;
    void $glowVoxelCount;
    sceneHasGlowMesh = $glowVoxelCount > 0;
    queueVoxelPipelineRebuild({
      mesh: true,
      grid: true,
      ray: $renderingMode === 'ray'
    });
  });

  $effect(() => {
    void $renderingMode;
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
    if ($renderingMode === 'ray') {
      queueVoxelPipelineRebuild({ ray: true });
    }
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
    markCanvasDirty();
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
    markCanvasDirty();
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
    markCanvasDirty();
  });

  $effect(() => {
    void $insectaSpecies;
    void $insectaTotalLength;
    void $insectaHeadRatio;
    void $insectaThoraxRatio;
    void $insectaAbdomenRatio;
    void $insectaBodyHalfWidth;
    void $insectaBodyHalfHeight;
    void $insectaAbdomenTaper;
    void $insectaHeadShape;
    void $insectaAnchorOffsetU;
    void $insectaAnchorOffsetV;
    void $insectaBodyYaw;
    void $insectaBodyArch;
    void $insectaLegFront;
    void $insectaLegMid;
    void $insectaLegHind;
    void $insectaAntennaLength;
    void $insectaAntennaSpread;
    void $insectaAntennaPitch;
    void $insectaAntennaRoot;
    void $insectaMandibleLength;
    void $insectaMandibleSpread;
    void $insectaMandibleForward;
    void $insectaWingShape;
    void $insectaShowWingFore;
    void $insectaWingForeLength;
    void $insectaWingForeWidth;
    void $insectaWingForeSpread;
    void $insectaWingForePitch;
    void $insectaWingForeOffset;
    void $insectaShowWingHind;
    void $insectaWingHindLength;
    void $insectaWingHindWidth;
    void $insectaWingHindSpread;
    void $insectaWingHindPitch;
    void $insectaWingHindOffset;
    void $tool;
    if ($tool !== 'insecta' || nextInsectaPlacementSeed === 0) return;
    const place = insectaPhase === 'shape' ? insectaLockedPlace : insectaHoverPlace;
    const normal = insectaPhase === 'shape' ? insectaLockedNormal : insectaHoverNormal;
    if (!place || !normal) return;
    const opts = buildInsectaOptionsFromStores();
    updatePreviewMesh(getInsectaPositions(nextInsectaPlacementSeed, place, normal, opts));
    markCanvasDirty();
  });

  $effect(() => {
    const sel = $selection;
    rebuildSelectionOverlay(sel);
    markCanvasDirty();
    selectionGizmo?.syncGizmoHoverCursor();
  });

  $effect(() => {
    void $selectionGizmoMode;
    markCanvasDirty();
    selectionGizmo?.syncGizmoHoverCursor();
  });

  $effect(() => {
    void sceneReady;
    if (!sceneReady) return;
    void $voxellePreferences.toneMapping;
    void $enableShadows;
    void $enableSky;
    void $backgroundColor;
    void $sceneEnvironmentIntensity;
    void $renderingMode;
    void $gridSize;
    void $lightAngle;
    void $lightElevation;
    void $lightColor;
    void $sunlightIntensity;
    void $ambientIntensity;
    /** Post / mood (atmosphere, tint, grain, sun shafts): applied inside `render` only — must dirty canvas when they change. */
    void $atmosphereActiveForRender;
    void $atmosphereColor;
    void $atmosphereThickness;
    void $atmosphereDensity;
    void $atmosphereMode;
    void $atmosphereSpatialMode;
    void $atmospherePlane;
    void $atmosphereHeightBias;
    void $atmosphereHeightFalloff;
    void $atmosphereDriftEnabled;
    void $atmosphereDriftAmount;
    void $atmosphereDriftScale;
    void $atmosphereDriftSpeed;
    void $distanceTintEnabled;
    void $distanceTintNearColor;
    void $distanceTintMidColor;
    void $distanceTintFarColor;
    void $distanceTintNearDistance;
    void $distanceTintFarDistance;
    void $distanceTintStrength;
    void $grainEnabled;
    void $grainStrength;
    void $grainAnimated;
    void $grainSpeed;
    void $grainMode;
    void $sunShaftsEnabled;
    void $sunShaftsStrength;
    void $sunShaftsDecay;
    void $sunShaftsDensity;
    void $sunShaftsWeight;
    void $sunShaftsSamples;
    applyPresentationFromStores();
    markCanvasDirty();
  });

  onMount(async () => {
    window.addEventListener(VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT, onProjectOpenFitCamera);

    const { loadedFromStorage, fromUrl } = await loadVoxelCanvasBootstrapModel({
      loadFromBytes,
      loadFromStorageAsync,
      initCanvas,
      getGridSize: () => get(gridSize)
    });
    const openingLargeProject =
      (loadedFromStorage || fromUrl) && get(voxels).size >= LARGE_PROJECT_OPEN_VOXEL_THRESHOLD;
    if (openingLargeProject) {
      beginProjectOpenLoading('Opening project…');
      updateProjectOpenLoadingProgress(0.22, 'Preparing scene…');
      awaitingFirstProjectOpenMeshBuild = true;
    }
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
    envMap = setupRefs.envMap;
    voxelGroup = setupRefs.voxelGroup;
    rollOverMesh = setupRefs.rollOverMesh;
    rollOverMaterial = setupRefs.rollOverMaterial;
    paintHoverMesh = setupRefs.paintHoverMesh;
    paintHoverMaterial = setupRefs.paintHoverMaterial;
    paintHoverOccludedMesh = setupRefs.paintHoverOccludedMesh;
    paintHoverOccludedMaterial = setupRefs.paintHoverOccludedMaterial;
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
    if ($projectOpenLoading.active && awaitingFirstProjectOpenMeshBuild) {
      updateProjectOpenLoadingProgress(0.46, 'Initializing renderer…');
    }
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
        onLoadingChange: (loading) => {
          if (!awaitingFirstProjectOpenMeshBuild || !$projectOpenLoading.active) return;
          if (loading) {
            updateProjectOpenLoadingProgress(0.72, 'Building first mesh…');
          }
        },
        onSpinnerChange: (v) => (showGreedyMeshSpinner = v),
        onVoxelMeshesRebuilt: ({ hasGlowMesh }) => {
          sceneHasGlowMesh = hasGlowMesh;
          invalidateDirectionalShadowMap();
          syncVoxelMaterialEnvMaps();
          if (awaitingFirstProjectOpenMeshBuild && $projectOpenLoading.active) {
            awaitingFirstProjectOpenMeshBuild = false;
            updateProjectOpenLoadingProgress(1, 'Finalizing…');
            completeProjectOpenLoading();
          }
        },
        render: markCanvasDirty
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
        cylinderPhase !== null ||
        polygonPhase !== null ||
        solidPolygonPhase !== null ||
        roofPhase !== null ||
        ropePhase !== null ||
        clothPhase !== null ||
        (get(tool) === 'piscina' && piscinaPhase === 'shape') ||
        (get(tool) === 'insecta' && insectaPhase === 'shape'),
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
      render: markCanvasDirty
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
    if ($projectOpenLoading.active && awaitingFirstProjectOpenMeshBuild) {
      updateProjectOpenLoadingProgress(0.64, 'Building first mesh…');
    }
    sceneReady = true;
    syncSceneLightingAndBackgroundFromStores();
    onWindowResize();
    if (loadedFromStorage) fitToView();
    animate();
  });

  $effect(() => {
    void sceneReady;
    void $color;
    void $tool;
    if (!sceneReady) return;
    const isRemoveHover = $tool === 'remove';
    if (rollOverMaterial) {
      if (isRemoveHover) rollOverMaterial.color.setHex(0xff4444);
      else rollOverMaterial.color.setHex(hexToInt($color));
    }
    if (paintHoverMaterial) {
      let baseHex: number;
      if ($tool === 'remove') baseHex = 0xff4444;
      else if ($tool === 'paint' || $tool === 'punch') baseHex = hexToInt($color);
      else baseHex = 0x33aaff;
      paintHoverMaterial.color.setHex(baseHex);
      if (paintHoverOccludedMaterial) applyAddShapeOccludedPreviewTint(baseHex, paintHoverOccludedMaterial);
    }
    if (isRemoveHover) {
      if (polygonPointsMaterial) polygonPointsMaterial.color.setHex(0xff4444);
      if (polygonLineMaterial) polygonLineMaterial.color.setHex(0xff4444);
      if (ropePointsMaterial) ropePointsMaterial.color.setHex(0xff4444);
    } else {
      if (polygonPointsMaterial) polygonPointsMaterial.color.setHex(0xffff00);
      if (polygonLineMaterial) polygonLineMaterial.color.setHex(0x3399ff);
      if (ropePointsMaterial) ropePointsMaterial.color.setHex(0xffff00);
    }
    markCanvasDirty();
  });

  $effect(() => {
    void $showGrid;
    if (gridGroup) gridGroup.visible = $showGrid;
    if ($showGrid) {
      queueVoxelPipelineRebuild({ grid: true });
    }
  });

  $effect(() => {
    void $gridSize;
    void $voxels;
    void $orthographic;
    if ($orthographic && orthographicCamera) updateOrthoFrustum();
    updateZoomPercent();
    markCanvasDirty();
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
  });

  $effect(() => {
    const fl = $focalLength;
    if (perspectiveCamera && !$orthographic) {
      perspectiveCamera.fov = focalLengthToFov(fl);
      perspectiveCamera.updateProjectionMatrix();
      markCanvasDirty();
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
    const isHand = t === 'hand' || isMoodTool(t);
    if (prevTool === 'piscina' && t !== 'piscina') {
      resetPiscinaPlacementFlow();
    }
    if (prevTool !== null && prevTool !== 'piscina' && t === 'piscina') {
      resetPiscinaPlacementFlow();
    }
    if (prevTool === 'insecta' && t !== 'insecta') {
      resetInsectaPlacementFlow();
    }
    if (prevTool !== null && prevTool !== 'insecta' && t === 'insecta') {
      resetInsectaPlacementFlow();
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
      (isSegmentedStrokeGestureActive({
        cuboidPhase,
        cylinderPhase,
        polygonPhase,
        solidPolygonPhase,
        roofPhase,
        ropePhase,
        clothPhase
      }) ||
        selectionGizmo?.isGizmoDrag)
    ) {
      flyControls.unlock();
      cancelDrag();
    }
    if (isHand) {
      resetPiscinaPlacementFlow();
      resetInsectaPlacementFlow();
      selectionGizmo?.clearGizmoHoverCursor();
      rollOverMesh.visible = false;
      if (paintHoverMesh) paintHoverMesh.visible = false;
      if (paintHoverOccludedMesh) paintHoverOccludedMesh.visible = false;
      updatePreviewMesh([]);
      if (
        isSegmentedStrokeGestureActive({
          cuboidPhase,
          cylinderPhase,
          polygonPhase,
          solidPolygonPhase,
          roofPhase,
          ropePhase,
          clothPhase
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
    markCanvasDirty();
  });

  $effect(() => {
    const mode = $effectiveStrokeMode;
    if (mode !== 'precise' && precisePhase !== 'idle') {
      resetPreciseState(true);
      markCanvasDirty();
    }
  });

  $effect(() => {
    const open = $addPanelStore.open;
    if (!wasAddShapePanelOpen && open) {
      if (rollOverMesh && meshManager) {
        rollOverMesh.visible = false;
        if (paintHoverMesh) paintHoverMesh.visible = false;
        if (paintHoverOccludedMesh) paintHoverOccludedMesh.visible = false;
        updatePreviewMesh([]);
        markCanvasDirty();
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
    markCanvasDirty();
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
      markCanvasDirty();
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
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, geo, (g) => safeDisposeBufferGeometry(g, canvasIsWebGPU));
      markCanvasDirty();
      return;
    }
    const symAxes: SymmetryAxes = {
      x: get(symmetryX),
      y: get(symmetryY),
      z: get(symmetryZ)
    };
    let primaries = getShapePositionsAt({
      position: [s.posX, s.posY, s.posZ],
      rotation: [clampQuarterTurn(s.rotX), clampQuarterTurn(s.rotY), clampQuarterTurn(s.rotZ)],
      shape: s.shape,
      size: Math.max(1, Math.min(1024, Math.floor(s.size)))
    });
    if (s.overwriteIntersecting === false) {
      primaries = primaries.filter(([x, y, z]) => {
        for (const k of getMirrorCoordKeys(x, y, z, symAxes)) {
          if ($voxels.has(k)) return false;
        }
        return true;
      });
    }
    let positions = expandPositionsWithSymmetry(primaries, symAxes);
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
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, coarseGeo, (g) => safeDisposeBufferGeometry(g, canvasIsWebGPU));
      if (coarseGeo) {
        alignPreviewMeshToLod(addPreviewMesh, stride, min);
        alignPreviewMeshToLod(addPreviewOccludedMesh, stride, min);
        const capturedPositions = positions;
        const capturedVoxel = addVx;
        addPanelRefinementScheduler.schedule(() => {
          const fullGeo = buildPreviewGeometry(capturedPositions, capturedVoxel, $voxels);
          if (!fullGeo || !addPreviewMesh || !addPreviewOccludedMesh) return;
          assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, fullGeo, (g) => safeDisposeBufferGeometry(g, canvasIsWebGPU));
          resetPreviewMeshTransform(addPreviewMesh);
          resetPreviewMeshTransform(addPreviewOccludedMesh);
          markCanvasDirty();
        });
      }
    } else {
      resetPreviewMeshTransform(addPreviewMesh);
      resetPreviewMeshTransform(addPreviewOccludedMesh);
      const geo = buildPreviewGeometry(positions, addVx, $voxels);
      assignSharedDualPreviewGeometry(addPreviewMesh, addPreviewOccludedMesh, geo, (g) => safeDisposeBufferGeometry(g, canvasIsWebGPU));
    }
    markCanvasDirty();
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
    paintHoverMaterial?.dispose();
    paintHoverOccludedMaterial?.dispose();
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
    projectOpenLoadingActive={$projectOpenLoading.active}
    projectOpenLoadingMessage={$projectOpenLoading.message}
    projectOpenLoadingProgress={$projectOpenLoading.progress}
    {fillBusy}
    {fillMessage}
    {fillVisited}
    {fillMatched}
    {cancelActiveFill}
    {cuboidPhase}
    bind:cuboidDepth
    {updateCuboidFromDepth}
    {commitCuboid}
    {cylinderPhase}
    bind:cylinderDepth
    {updateCylinderFromDepth}
    {commitCylinder}
    {polygonPhase}
    polygonPointCount={polygonPoints.length}
    {commitPolygon}
    {cancelPolygon}
    {solidPolygonPhase}
    solidPolygonPointCount={solidPolygonPoints.length}
    {solidPolygonExtrudable}
    {beginSolidPolygonDepth}
    bind:solidPolygonDepth
    {updateSolidPolygonFromDepth}
    {commitSolidPolygon}
    {cancelSolidPolygon}
    {roofPhase}
    roofHudVisible={roofPhase === 'placing' &&
      ($roofSelectionMethod === 'polygon'
        ? roofPoints.length >= 2
        : isRoofShapeDrag || (roofShapeCommittedFootprint?.length ?? 0) > 0)}
    roofDoneDisabled={$roofSelectionMethod === 'polygon'
      ? roofPoints.length < 4
      : !(roofShapeCommittedFootprint && roofShapeCommittedFootprint.length > 0)}
    {commitRoof}
    {cancelRoof}
    {piscinaPhase}
    {commitPiscinaFish}
    {pickAgainPiscina}
    insectaPhase={insectaPhase}
    commitInsectaPlacement={commitInsectaPlacement}
    pickAgainInsecta={pickAgainInsecta}
    {ropePhase}
    {commitRope}
    {cancelRope}
    {clothPhase}
    clothPointCount={clothPoints.length}
    {finishClothPlacing}
    {commitCloth}
    {cancelCloth}
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
