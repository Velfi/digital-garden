<script lang="ts">
  import { browser } from '$app/environment';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import {
    voxels,
    gridSize,
    showGrid,
    renderingMode,
    tool,
    color,
    selectedColors,
    strokeMode,
    effectiveStrokeMode,
    lineAxisAlign,
    planeAxis,
    clayMode,
    clayBrushRadius,
    inflateStrength,
    branchTaper,
    puffRadius,
    puffRadiusRange,
    puffRadiusMin,
    puffRadiusMax,
    puffScatter,
    ropeTension,
    ropeBrushShape,
    ropeBrushRadius,
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
    drawBrushShape,
    drawBrushSize,
    drawBrushSnapToSurface,
    selection,
    lightAngle,
    lightElevation,
    lightColor,
    ambientIntensity,
    enableShadows,
    aoStrength,
    backgroundColor,
    enableSky,
    focalLength,
    orthographic,
    roughness,
    metalness,
    updateVoxels,
    updateVoxelsInStroke,
    beginStroke,
    pushUndo,
    history,
    initCanvas,
    loadFromStorage,
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
    ensureGridFitsPositions,
    stampRotation,
    getBoundsFromPositions,
    rotatePositionAroundOrigin,
    getSelectionCenter,
    selectionMode,
    mergeSelection,
    fillSelectDiagonals,
    fillRespectsColor,
    getFillSelectionAt,
    getFillEmptyAt,
    getShapePositionsAt,
    addPanelStore,
    type Tool,
    type FaceNormal
  } from './store';
  import { getShareFromIndexedDB } from './shareStorage';
  import { inBounds } from './coordUtils';
  import {
    getAxisAlignedLine,
    getAxisAlignedPlaneFromNormal,
    getAxisAlignedCuboid,
    getPolygonVoxels,
    getBresenham3DLine,
    getRayDirectionPath,
    projectPointOntoPlane,
    thickenPathForStroke,
    getRopeCurveVoxels,
    applyBrushAlongPath,
    getSprayDirectionVector
  } from './strokeGeometry';
  import { applySmooth, applyLevel, applyMelt, applyInflate } from './clayOps';
  import { buildGridPositions } from './gridLines';
  import {
    FLY_MOVE_SPEED,
    FLY_POINTER_SPEED,
    createFlyMoveState,
    createFlyKeyHandlers,
    resetFlyMoveState,
    applyFlyMovement
  } from './flyControls';
  import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
  import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
  import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
  import { Sky } from 'three/addons/objects/Sky.js';
  import { buildGreedyMesh } from './greedyMesh';
  import OrbitGizmo from './OrbitGizmo.svelte';
  import ToolPanel from './ToolPanel.svelte';
  import SelectionCountPanel from './SelectionCountPanel.svelte';

  let container: HTMLDivElement;
  let gizmoRef = $state<ReturnType<typeof OrbitGizmo>>();
  let camera = $state<THREE.PerspectiveCamera | THREE.OrthographicCamera>();
  let perspectiveCamera: THREE.PerspectiveCamera;
  let orthographicCamera: THREE.OrthographicCamera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let orbitControls = $state<OrbitControls>();
  let flyControls: InstanceType<typeof PointerLockControls> | null = null;
  let lastFrameTime = 0;
  let raycaster: THREE.Raycaster;
  let pointer: THREE.Vector2;
  let voxelGroup: THREE.Group;
  let rollOverMesh: THREE.Mesh;
  let rollOverMaterial: THREE.MeshBasicMaterial;
  let dirLight: THREE.DirectionalLight;
  let hemisphereLight: THREE.HemisphereLight;
  let sky: InstanceType<typeof Sky> | null = null;
  let groundPlane: THREE.Mesh | null = null;
  let boxGeometry: THREE.BoxGeometry;
  let meshesByColor: Map<
    number,
    { mesh: THREE.InstancedMesh | THREE.Mesh; positions: [number, number, number][] | null }
  > = new Map();
  let animationFrameId: number;
  let isVoxelDrag = false;
  let isStampDrag = false;
  let lastStampTarget: [number, number, number] | null = null;
  let lastStampNormal: FaceNormal | null = null;
  /** During stamp drag: re-raycast each frame so stamp follows cursor across surfaces */
  let dragStartPos: [number, number, number] | null = null;
  let dragFaceNormal: THREE.Vector3 | null = null; // plane stays aligned to initial face
  /** Alt+scroll during plane drag: overrides plane axis (0=X, 1=Y, 2=Z). */
  let dragPlaneAxisOverride = $state<0 | 1 | 2 | null>(null);
  let dragPointerId: number | null = null;
  let pendingStrokePositions: [number, number, number][] = [];
  /** Clay bulk: last sampled position for path accumulation */
  let lastBulkPos: [number, number, number] | null = null;
  /** Branch: pointer down position for view-plane direction and length */
  let branchPointerDownX = 0;
  let branchPointerDownY = 0;

  /** Shown while worker is computing (main voxel mesh rebuild) */
  let greedyMeshLoading = $state(false);
  /** Only show spinner after build has taken >2s */
  let showGreedyMeshSpinner = $state(false);
  let greedyMeshSpinnerTimeoutId: ReturnType<typeof setTimeout> | null = null;

  let meshWorker: Worker | null = null;
  let meshRebuildGen = 0;

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
  const POLYGON_POINTS_MAX = 64;

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

  let selectionGroup: THREE.Group | null = null;
  let selectionMesh: THREE.Mesh | null = null;
  let selectionMaterial: THREE.MeshBasicMaterial | null = null;

  let gridGroup: THREE.Group | null = null;
  let gridLineMaterial: InstanceType<typeof LineMaterial> | null = null;
  let envMap: THREE.CubeTexture | null = null;

  let zoomPercent = $state(100);
  let deltaDisplay = $state<{ dx: number; dy: number; dz: number } | null>(null);
  let pointerScreen = $state({ x: 0, y: 0 });
  const ZOOM_FACTOR_IN = 1 / 1.2;
  const ZOOM_FACTOR_OUT = 1.2;
  const MIN_DISTANCE = 5;
  const MAX_DISTANCE = 5000;

  // 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength)
  function focalLengthToFov(mm: number): number {
    return (2 * Math.atan(12 / mm) * 180) / Math.PI;
  }

  const pointerHelper = new THREE.Vector3();
  const axisNormalHelper = new THREE.Vector3();
  const fitHelperBox = new THREE.Box3();
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
  const fitHelperSphere = new THREE.Sphere();
  const worldQuaternion = new THREE.Quaternion();

  function createEnvMap(): THREE.CubeTexture {
    const size = 32;
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#888888');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      canvases.push(canvas);
    }
    const envMap = new THREE.CubeTexture(canvases);
    envMap.colorSpace = THREE.SRGBColorSpace;
    return envMap;
  }

  function applyVoxelMeshResults(
    results: Array<{
      color: number;
      positions: Float32Array;
      normals: Float32Array;
      colors: Float32Array;
      indices: Uint32Array;
    }>
  ) {
    if (!voxelGroup) return;
    for (const { mesh } of meshesByColor.values()) {
      voxelGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      if (mesh instanceof THREE.Mesh && mesh.geometry) mesh.geometry.dispose();
    }
    meshesByColor.clear();

    const envMap = scene?.environment ?? null;
    const r = $roughness;
    const m = $metalness;

    for (const { color: col, positions, normals, colors, indices } of results) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeBoundingSphere();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: r,
        metalness: m,
        envMap: envMap
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = $enableShadows;
      mesh.receiveShadow = $enableShadows;
      voxelGroup.add(mesh);
      meshesByColor.set(col, { mesh, positions: null });
    }
  }

  function requestRebuildVoxelMeshes(v: Map<string, number>, _size: number) {
    if (!meshWorker || !voxelGroup) return;
    const gen = ++meshRebuildGen;
    greedyMeshLoading = true;
    showGreedyMeshSpinner = false;
    if (greedyMeshSpinnerTimeoutId) clearTimeout(greedyMeshSpinnerTimeoutId);
    greedyMeshSpinnerTimeoutId = setTimeout(() => {
      greedyMeshSpinnerTimeoutId = null;
      if (greedyMeshLoading) showGreedyMeshSpinner = true;
    }, 2000);
    const voxelsArr: [string, number][] = [...v];
    meshWorker.postMessage({
      voxels: voxelsArr,
      mode: $renderingMode,
      options: { aoStrength: $aoStrength },
      gen
    });
  }

  function setupMeshWorker() {
    if (!browser) return;
    meshWorker = new Worker(new URL('./voxelMeshWorker.ts', import.meta.url), {
      type: 'module'
    });
    meshWorker.onmessage = (e: MessageEvent<{ results: unknown[]; gen?: number }>) => {
      if (e.data.gen !== meshRebuildGen) return;
      greedyMeshLoading = false;
      showGreedyMeshSpinner = false;
      if (greedyMeshSpinnerTimeoutId) {
        clearTimeout(greedyMeshSpinnerTimeoutId);
        greedyMeshSpinnerTimeoutId = null;
      }
      applyVoxelMeshResults(e.data.results as Parameters<typeof applyVoxelMeshResults>[0]);
      render();
    };
  }

  function rebuildSelectionOverlay(sel: Map<string, number>) {
    if (!selectionGroup || !scene) return;
    if (selectionMesh) {
      selectionGroup.remove(selectionMesh);
      selectionMesh.geometry?.dispose();
      selectionMaterial?.dispose();
      selectionMesh = null;
      selectionMaterial = null;
    }
    if (sel.size === 0) return;
    const overlayMap = new Map<string, number>();
    for (const key of sel.keys()) overlayMap.set(key, 0x3399ff);
    const geoByColor = buildGreedyMesh(overlayMap, { aoEnabled: false });
    const geo = geoByColor.get(0x3399ff);
    if (!geo) return;
    selectionMaterial = new THREE.MeshBasicMaterial({
      color: 0x3399ff,
      opacity: 0.35,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    selectionMesh = new THREE.Mesh(geo, selectionMaterial);
    selectionMesh.raycast = () => {};
    selectionMesh.renderOrder = 1;
    selectionGroup.add(selectionMesh);
  }

  /** Snaps stamp to target voxel face so the correct side touches without overlapping. */
  function getStampPositionsForFace(
    target: [number, number, number],
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
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
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
    for (const { mesh } of meshesByColor.values()) {
      targets.push(mesh);
    }
    if (polygonPhase && polygonPointsMesh) {
      targets.push(polygonPointsMesh);
    }
    if (ropePhase && ropePointsMesh) {
      targets.push(ropePointsMesh);
    }
    return targets;
  }

  function getIntersection(): THREE.Intersection | null {
    if (!camera) return null;
    raycaster.setFromCamera(pointer, camera);
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

  function buildGrid(_size: number, v: Map<string, number>) {
    if (!gridGroup || !gridLineMaterial || !scene) return;
    while (gridGroup.children.length > 0) {
      const child = gridGroup.children[0];
      gridGroup.remove(child);
      const geom = (child as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    }
    const positions = buildGridPositions(v);
    if (positions.length === 0) return;
    const geom = new LineSegmentsGeometry();
    geom.setPositions(positions);
    const lines = new LineSegments2(geom, gridLineMaterial);
    lines.raycast = () => {};
    gridGroup.add(lines);
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

  function updateZoomPercent() {
    if (!camera || !orbitControls) return;
    if (camera instanceof THREE.OrthographicCamera) {
      zoomPercent = Math.round(camera.zoom * 100);
    } else {
      const dist = getCameraDistance();
      const baseDist = $gridSize * 2.5;
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
    const sz = $gridSize;
    const dist = sz * 2.5;
    orbitControls.target.set(0, 0, 0);
    camera.position.set(dist * 0.6, dist * 0.8, dist);
    camera.lookAt(0, 0, 0);
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
    const v = $voxels;
    const sz = $gridSize;
    if (v.size === 0) {
      fitHelperBox.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sz, sz, sz));
    } else {
      fitHelperBox.makeEmpty();
      for (const key of v.keys()) {
        const [x, y, z] = parseCoordKey(key);
        fitHelperBox.expandByPoint(new THREE.Vector3(x, y, z));
      }
      fitHelperBox.expandByScalar(1);
    }
    fitHelperBox.getBoundingSphere(fitHelperSphere);
    if (camera instanceof THREE.OrthographicCamera) {
      const baseHeight = sz * 2;
      const targetHeight = fitHelperSphere.radius * 3;
      camera.zoom = Math.max(0.1, baseHeight / targetHeight);
      camera.updateProjectionMatrix();
    } else {
      const fov = (camera.fov * Math.PI) / 180;
      const h = container.clientHeight;
      const w = container.clientWidth;
      const aspect = w / h;
      const vFov = fov;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const halfFov = Math.min(vFov, hFov) / 2;
      const fitDist = (fitHelperSphere.radius * 1.5) / Math.tan(halfFov);
      setCameraDistance(fitDist);
    }
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
    const getCol = getPaintColorResolver();
    updateVoxelsInStroke((v) => {
      for (const [x, y, z] of effective) {
        if (!inBounds(x, y, z, sz)) continue;
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
    clayModeVal: 'bulk' | 'smooth' | 'level' | 'gouge' | 'branch' | 'puffy' | 'melt' | 'rope' | 'wall' | 'inflate',
    levelY: number
  ) {
    ensureGridFitsPositions(positions);
    const sz = $gridSize;
    const getCol = getPaintColorResolver();
    const v = $voxels;
    if (clayModeVal === 'melt') {
      const { toAdd, toRemove } = applyMelt(v, positions, sz);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'gouge') {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, sz)) continue;
          next.delete(coordKey(x, y, z));
        }
      });
      return;
    }
    if (clayModeVal === 'bulk' || clayModeVal === 'branch' || clayModeVal === 'puffy' || clayModeVal === 'rope' || clayModeVal === 'wall') {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, sz)) continue;
          const key = coordKey(x, y, z);
          if (!next.has(key)) next.set(key, getCol());
        }
      });
      return;
    }
    if (clayModeVal === 'smooth') {
      const { toAdd, toRemove } = applySmooth(v, positions, sz);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'inflate') {
      const { toAdd, toRemove } = applyInflate(v, positions, sz, get(inflateStrength));
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'level') {
      const { toAdd, toRemove } = applyLevel(v, positions, levelY, getCol, sz);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
    }
  }

  function applySelectStroke(positions: [number, number, number][]) {
    pushUndo();
    const v = $voxels;
    const sz = $gridSize;
    const mode = get(selectionMode);
    const incoming = new Map<string, number>();
    for (const [x, y, z] of positions) {
      if (!inBounds(x, y, z, sz)) continue;
      const key = coordKey(x, y, z);
      const col = v.get(key);
      if (col !== undefined) incoming.set(key, col);
    }
    const next = mergeSelection($selection, incoming, mode);
    selection.set(next);
  }

  function placeStamp(target: [number, number, number], normal: FaceNormal) {
    const sel = $selection;
    const center = getSelectionCenter(sel);
    if (!center) return;
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = $stampRotation;
    const rotated: [number, number, number][] = [];
    const colors: number[] = [];
    for (const [key, col] of sel) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
      colors.push(col);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return;
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    const stampPositions = rotated.map(
      ([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]
    );
    ensureGridFitsPositions(stampPositions);
    beginStroke();
    updateVoxelsInStroke((v) => {
      stampPositions.forEach(([x, y, z], i) => {
        if (!inBounds(x, y, z, $gridSize)) return;
        v.set(coordKey(x, y, z), colors[i]);
      });
    });
  }

  function updatePreviewMesh(positions: [number, number, number][]) {
    if (!previewMesh || !previewMaterial) return;
    const sel = $selection;
    const filtered =
      sel.size > 0 && ($tool === 'paint' || $tool === 'remove')
        ? positions.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : positions;
    if (filtered.length === 0) {
      previewMesh.visible = false;
      return;
    }
    const hex =
      $tool === 'remove'
        ? 0xff4444
        : $tool === 'select' || $tool === 'selectByColor'
          ? 0x33aaff
          : hexToInt($color);
    const voxelMap = new Map<string, number>();
    for (const [x, y, z] of filtered) {
      voxelMap.set(coordKey(x, y, z), hex);
    }
    const geoByColor = buildGreedyMesh(voxelMap, { aoEnabled: false });
    const geo = geoByColor.get(hex);
    if (geo) {
      if (previewMesh.geometry) previewMesh.geometry.dispose();
      previewMesh.geometry = geo;
      previewMesh.visible = true;
    } else {
      previewMesh.visible = false;
    }
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
      cuboidDepth
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
      cuboidDepth
    );
    if (positions.length > 0) {
      if ($tool === 'select') {
        applySelectStroke(positions);
      } else {
        beginStroke();
        applyLineStroke(positions);
      }
    }
    deltaDisplay = null;
    cuboidPhase = null;
    cuboidPlane = null;
    pendingStrokePositions = [];
    updatePreviewMesh([]);
    render();
  }

  function cancelPolygon() {
    polygonPoints = [];
    polygonPhase = null;
    updatePolygonPreview([]);
    updatePreviewMesh([]);
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
    const centerline = getRopeCurveVoxels(a, b, t);
    const shape = get(ropeBrushShape);
    const radius = get(ropeBrushRadius);
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
    const centerline = getRopeCurveVoxels(a, b, t);
    const shape = get(ropeBrushShape);
    const radius = get(ropeBrushRadius);
    const positions = applyBrushAlongPath(centerline, shape, radius);
    if (positions.length > 0) {
      beginStroke();
      applyClayStroke(positions, 'rope', 0);
    }
    cancelRope();
    render();
  }

  function commitPolygon() {
    if (polygonPoints.length < 2) return;
    const positions = getPolygonVoxels(polygonPoints);
    if (positions.length > 0) {
      if ($tool === 'select') {
        applySelectStroke(positions);
      } else {
        beginStroke();
        applyLineStroke(positions);
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
    scene.remove(polygonLineSegments);
    if (polygonLineSegments.geometry) {
      polygonLineSegments.geometry.dispose();
      polygonLineSegments.geometry = new THREE.BufferGeometry();
    }
    if (points.length < 2) return;
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
    if (positions.length === 0) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeBoundingSphere();
    polygonLineSegments.geometry = geom;
    scene.add(polygonLineSegments);
  }

  function cancelDrag() {
    deltaDisplay = null;
    if (polygonPhase) {
      cancelPolygon();
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
      lastStampTarget = null;
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
      dragStartPos = null;
      dragFaceNormal = null;
      dragPlaneAxisOverride = null;
      lastBulkPos = null;
      pendingStrokePositions = [];
      updatePreviewMesh([]);
      // No undo - we never applied changes
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if ((event.target as Element)?.closest?.('[data-voxelle-no-passthrough]')) return;
    if ($tool === 'fly') {
      if (event.button === 0 || event.button === 2) {
        if (flyControls?.isLocked) {
          flyControls.unlock();
        } else {
          flyControls?.lock(true); // unadjustedMovement for raw mouse input
        }
        event.preventDefault();
      }
      event.stopPropagation();
      return;
    }
    if (event.button === 2) {
      if (isVoxelDrag || cuboidPhase || polygonPhase || ropePhase) {
        event.preventDefault();
        cancelDrag();
        render();
      }
      return;
    }
    if (event.button !== 0) return;

    // Cuboid depth phase: pointer down starts drag-to-adjust-depth (anywhere on canvas)
    if (get(effectiveStrokeMode) === 'cuboid' && cuboidPhase === 'depth' && cuboidPlane) {
      event.preventDefault();
      event.stopPropagation();
      depthAdjustPointerId = event.pointerId;
      lastDepthPhaseClientY = event.clientY;
      depthPhaseAccumulator = 0;
      container.setPointerCapture(event.pointerId);
      return;
    }

    // Rope tension phase: pointer down on slider track starts drag (handled in template)

    let hit = getIntersection();
    if (!hit) return;

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
          const fillPositions = polygonPoints.length >= 2 ? getPolygonVoxels(polygonPoints) : [];
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
          }
          updatePolygonPreview(polygonPoints);
          const fillPositions = polygonPoints.length >= 2 ? getPolygonVoxels(polygonPoints) : [];
          updatePreviewMesh(fillPositions);
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

    // Clay tool + path-following modes: start drag (bulk/smooth/level/gouge/puffy/melt/wall)
    if ($tool === 'clay' && (mode === 'bulk' || mode === 'smooth' || mode === 'level' || mode === 'gouge' || mode === 'puffy' || mode === 'melt' || mode === 'wall' || mode === 'inflate')) {
      // Start on voxel (grab surface) or face of voxel (extend outward)
      const pos = getVoxelPosition(hit) ?? getAddPosition(hit);
      if (pos) {
        isVoxelDrag = true;
        dragStartPos = pos;
        lastBulkPos = pos;
        pendingStrokePositions = [pos];
        if (mode === 'wall') {
          const n = getFaceNormalFromHit(hit);
          dragFaceNormal = n ? new THREE.Vector3(n[0], n[1], n[2]) : null;
        }
        updatePreviewMesh(
          thickenPathForStroke(pendingStrokePositions, {
            strokeMode: get(strokeMode),
            clayMode: mode,
            clayBrushRadius: get(clayBrushRadius) as number,
            branchTaper: get(branchTaper),
            puffRadius: get(puffRadius),
            puffScatter: get(puffScatter),
            puffRadiusRange: get(puffRadiusRange),
            puffRadiusMin: get(puffRadiusMin),
            puffRadiusMax: get(puffRadiusMax),
            airbrushRadius: get(airbrushRadius) as number,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin),
            airbrushRadiusMax: get(airbrushRadiusMax),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth),
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize),
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
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
        updatePreviewMesh(
          thickenPathForStroke(pendingStrokePositions, {
            strokeMode: get(strokeMode),
            clayMode: 'branch',
            clayBrushRadius: get(clayBrushRadius) as number,
            branchTaper: get(branchTaper),
            puffRadius: get(puffRadius),
            puffScatter: get(puffScatter),
            puffRadiusRange: get(puffRadiusRange),
            puffRadiusMin: get(puffRadiusMin),
            puffRadiusMax: get(puffRadiusMax),
            airbrushRadius: get(airbrushRadius) as number,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin),
            airbrushRadiusMax: get(airbrushRadiusMax),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth),
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize),
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
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
    if ($tool === 'select' && get(effectiveStrokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const incoming = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor)
        );
        if (incoming.size > 0) {
          pushUndo();
          const next = mergeSelection($selection, incoming, get(selectionMode));
          selection.set(next);
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Paint tool + fill method: click voxel to flood-fill connected same-color region
    if ($tool === 'paint' && get(effectiveStrokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const fillRegion = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor)
        );
        if (fillRegion.size > 0) {
          const getCol = getPaintColorResolver();
          const positions = [...fillRegion.keys()].map((k) => parseCoordKey(k));
          ensureGridFitsPositions(positions);
          beginStroke();
          updateVoxelsInStroke((v) => {
            for (const key of fillRegion.keys()) {
              v.set(key, getCol());
            }
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Voxel tool + fill method: click face to flood-fill connected empty space with voxels
    if ($tool === 'voxel' && get(effectiveStrokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
      const pos = getAddPosition(hit);
      if (pos && !$voxels.has(coordKey(pos[0], pos[1], pos[2]))) {
        const emptyRegion = getFillEmptyAt(pos[0], pos[1], pos[2], get(fillSelectDiagonals));
        if (emptyRegion.size > 0) {
          const getCol = getPaintColorResolver();
          const positions = [...emptyRegion].map((k) => parseCoordKey(k));
          ensureGridFitsPositions(positions);
          beginStroke();
          updateVoxelsInStroke((v) => {
            for (const key of emptyRegion) {
              v.set(key, getCol());
            }
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Remove tool + fill method: click voxel to flood-remove connected region
    if ($tool === 'remove' && get(effectiveStrokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const fillRegion = getFillSelectionAt(
          pos[0],
          pos[1],
          pos[2],
          get(fillSelectDiagonals),
          get(fillRespectsColor)
        );
        if (fillRegion.size > 0) {
          beginStroke();
          updateVoxelsInStroke((v) => {
            for (const key of fillRegion.keys()) {
              v.delete(key);
            }
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Select by color: when fill mode, flood-fill select; else select all of that color globally
    if ($tool === 'selectByColor' && hit.object !== polygonPointsMesh) {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const targetColor = $voxels.get(coordKey(pos[0], pos[1], pos[2]));
        if (targetColor !== undefined) {
          pushUndo();
          const incoming =
            get(effectiveStrokeMode) === 'fill'
              ? getFillSelectionAt(
                  pos[0],
                  pos[1],
                  pos[2],
                  get(fillSelectDiagonals),
                  get(fillRespectsColor)
                )
              : (() => {
                  const m = new Map<string, number>();
                  for (const [key, col] of $voxels) {
                    if (col === targetColor) m.set(key, col);
                  }
                  return m;
                })();
          const next = mergeSelection($selection, incoming, get(selectionMode));
          selection.set(next);
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Eyedropper: click voxel to pick its color
    if ($tool === 'eyedropper') {
      const pos = getVoxelPosition(hit);
      if (pos) {
        const col = $voxels.get(coordKey(pos[0], pos[1], pos[2]));
        if (col !== undefined) {
          const hex = intToHex(col);
          color.set(hex);
          selectedColors.set([hex]);
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Stamp tool: snap stamp's side to target voxel face (works on all 6 faces)
    if ($tool === 'stamp' && $selection.size > 0) {
      const target = getVoxelPosition(hit);
      const normal = getFaceNormalFromHit(hit);
      if (target && normal) {
        isStampDrag = true;
        lastStampTarget = target;
        lastStampNormal = normal;
        updatePreviewMesh(getStampPositionsForFace(target, normal));
      }
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
    hit.object.getWorldQuaternion(worldQuaternion);
    const faceNormal = hit.face!.normal.clone().applyQuaternion(worldQuaternion);
    const pa = get(planeAxis);
    dragFaceNormal = pa === 'auto' ? faceNormal : axisVector(pa);
    dragPlaneAxisOverride = null;
    pendingStrokePositions = [startPos];
    const clayModeVal = get(clayMode);
    const isClayPathFollow =
      $tool === 'clay' &&
      (clayModeVal === 'bulk' ||
        clayModeVal === 'smooth' ||
        clayModeVal === 'level' ||
        clayModeVal === 'gouge' ||
        clayModeVal === 'puffy' ||
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
      clayBrushRadius: get(clayBrushRadius) as number,
      branchTaper: get(branchTaper),
      puffRadius: get(puffRadius),
      puffScatter: get(puffScatter),
      puffRadiusRange: get(puffRadiusRange),
      puffRadiusMin: get(puffRadiusMin),
      puffRadiusMax: get(puffRadiusMax),
      airbrushRadius: get(airbrushRadius) as number,
      airbrushScatter: get(airbrushScatter),
      airbrushRadiusRange: get(airbrushRadiusRange),
      airbrushRadiusMin: get(airbrushRadiusMin),
      airbrushRadiusMax: get(airbrushRadiusMax),
      sprayDirection: get(sprayDirection),
      sprayStreakLength: get(sprayStreakLength),
      wallWidth: get(wallWidth),
      wallHeight: get(wallHeight),
      wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
      drawBrushShape: get(drawBrushShape),
      drawBrushSize: get(drawBrushSize),
      drawBrushSnapToSurface: get(drawBrushSnapToSurface),
      drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
    };
    updatePreviewMesh(thickenPathForStroke(pendingStrokePositions, strokeParams));
    requestAnimationFrame(() => render());
  }

  function handlePointerMove(event?: PointerEvent) {
    if ($tool === 'fly') return; // PointerLockControls handles mouse look
    // Stamp drag: re-raycast so stamp follows cursor onto any surface
    if (isStampDrag && $selection.size > 0) {
      const hit = getIntersection();
      if (hit) {
        const target = getVoxelPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (target && normal) {
          lastStampTarget = target;
          lastStampNormal = normal;
          updatePreviewMesh(getStampPositionsForFace(target, normal));
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
        const length = Math.max(0, Math.round(Math.sqrt(dx * dx + dy * dy) / 12));
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
            clayBrushRadius: get(clayBrushRadius) as number,
            branchTaper: get(branchTaper),
            puffRadius: get(puffRadius),
            puffScatter: get(puffScatter),
            puffRadiusRange: get(puffRadiusRange),
            puffRadiusMin: get(puffRadiusMin),
            puffRadiusMax: get(puffRadiusMax),
            airbrushRadius: get(airbrushRadius) as number,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin),
            airbrushRadiusMax: get(airbrushRadiusMax),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth),
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize),
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
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
          currentPos = $tool === 'voxel' || $tool === 'clay' ? getAddPosition(hit) : getVoxelPosition(hit);
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
            clayPathMode === 'puffy' ||
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
          } else {
            const normal = getEffectivePlaneNormal();
            if ((strokeModeVal === 'plane' || strokeModeVal === 'cuboid') && normal) {
              pendingStrokePositions = getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, normal);
            } else if (
              strokeModeVal === 'line' &&
              !get(lineAxisAlign) &&
              dragFaceNormal
            ) {
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
          // Clay path modes: show thickened preview (brush radius or puff); airbrush: sphere preview
          updatePreviewMesh(
            thickenPathForStroke(pendingStrokePositions, {
              strokeMode: (isAirbrushPath && !isClayPathFollow ? 'airbrush' : strokeModeVal ?? get(strokeMode)) as string,
              clayMode: isClayPathFollow ? clayPathMode : undefined,
              clayBrushRadius: get(clayBrushRadius) as number,
              branchTaper: get(branchTaper),
              puffRadius: get(puffRadius),
              puffScatter: get(puffScatter),
              puffRadiusRange: get(puffRadiusRange),
              puffRadiusMin: get(puffRadiusMin),
              puffRadiusMax: get(puffRadiusMax),
              airbrushRadius: get(airbrushRadius) as number,
              airbrushScatter: get(airbrushScatter),
              airbrushRadiusRange: get(airbrushRadiusRange),
              airbrushRadiusMin: get(airbrushRadiusMin),
              airbrushRadiusMax: get(airbrushRadiusMax),
              sprayDirection: get(sprayDirection),
              sprayStreakLength: get(sprayStreakLength),
              wallWidth: get(wallWidth),
              wallHeight: get(wallHeight),
              wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
              drawBrushShape: get(drawBrushShape),
              drawBrushSize: get(drawBrushSize),
              drawBrushSnapToSurface: get(drawBrushSnapToSurface),
              drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
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
    // Polygon mode: preserve polygon preview, show rollOver for next point
    if (polygonPhase) {
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
    // Stamp hover preview
    if ($tool === 'stamp' && $selection.size > 0 && !isStampDrag) {
      const hit = getIntersection();
      if (hit) {
        const target = getVoxelPosition(hit);
        const normal = getFaceNormalFromHit(hit);
        if (target && normal) {
          updatePreviewMesh(getStampPositionsForFace(target, normal));
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
    if ($tool !== 'voxel' && $tool !== 'clay') {
      rollOverMesh.visible = false;
      updatePreviewMesh([]);
      render();
      return;
    }
    const hit = getIntersection();
    if (!hit || !hit.face) {
      rollOverMesh.visible = false;
      render();
      return;
    }
    const addPos = getAddPosition(hit);
    if (addPos && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
      rollOverMesh.position.set(addPos[0], addPos[1], addPos[2]);
      rollOverMesh.visible = true;
    } else {
      rollOverMesh.visible = false;
    }
    render();
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
    if (event.button === 2 && (isVoxelDrag || cuboidPhase)) {
      cancelDrag();
    }
    if (event.button === 0 && isStampDrag) {
      if (lastStampTarget && lastStampNormal) {
        placeStamp(lastStampTarget, lastStampNormal);
      }
      isStampDrag = false;
      lastStampTarget = null;
      lastStampNormal = null;
      updatePreviewMesh([]);
    }
    if (event.button === 0 && isVoxelDrag) {
      updatePointerFromEvent(event);
      const mode = get(effectiveStrokeMode);
      const clayModeVal = get(clayMode);
      const isClayPath =
        $tool === 'clay' &&
        (clayModeVal === 'bulk' || clayModeVal === 'smooth' || clayModeVal === 'level' || clayModeVal === 'gouge' || clayModeVal === 'branch' || clayModeVal === 'puffy' || clayModeVal === 'melt' || clayModeVal === 'wall' || clayModeVal === 'inflate');
      const normal = getEffectivePlaneNormal();
      if (mode === 'cuboid' && dragStartPos && normal && !isClayPath) {
        // Enter depth phase: drag plane, then scroll for depth
        let cornerB = dragStartPos;
        const hit = getIntersection();
        if (hit) {
          const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
          if (pos) cornerB = pos;
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
          cuboidDepth
        );
        updatePreviewMesh(pendingStrokePositions);
      } else {
        // Apply the stroke on release (line/plane / clay modes)
        if (pendingStrokePositions.length > 0) {
          const isClayPath =
            $tool === 'clay' &&
            (clayModeVal === 'bulk' || clayModeVal === 'smooth' || clayModeVal === 'level' || clayModeVal === 'gouge' || clayModeVal === 'branch' || clayModeVal === 'puffy' || clayModeVal === 'melt' || clayModeVal === 'wall' || clayModeVal === 'inflate');
          const toApply = thickenPathForStroke(pendingStrokePositions, {
            strokeMode: mode as string,
            clayMode: isClayPath ? clayModeVal : undefined,
            clayBrushRadius: get(clayBrushRadius) as number,
            branchTaper: get(branchTaper),
            puffRadius: get(puffRadius),
            puffScatter: get(puffScatter),
            puffRadiusRange: get(puffRadiusRange),
            puffRadiusMin: get(puffRadiusMin),
            puffRadiusMax: get(puffRadiusMax),
            airbrushRadius: get(airbrushRadius) as number,
            airbrushScatter: get(airbrushScatter),
            airbrushRadiusRange: get(airbrushRadiusRange),
            airbrushRadiusMin: get(airbrushRadiusMin),
            airbrushRadiusMax: get(airbrushRadiusMax),
            sprayDirection: get(sprayDirection),
            sprayStreakLength: get(sprayStreakLength),
            wallWidth: get(wallWidth),
            wallHeight: get(wallHeight),
            wallFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined,
            drawBrushShape: get(drawBrushShape),
            drawBrushSize: get(drawBrushSize),
            drawBrushSnapToSurface: get(drawBrushSnapToSurface),
            drawBrushFaceNormal: dragFaceNormal ? { x: dragFaceNormal.x, y: dragFaceNormal.y, z: dragFaceNormal.z } : undefined
          });
          if ($tool === 'select') {
            applySelectStroke(toApply);
          } else if (isClayPath) {
            beginStroke();
            applyClayStroke(toApply, clayModeVal, dragStartPos?.[1] ?? 0);
          } else {
            beginStroke();
            applyLineStroke(toApply);
          }
        }
        pendingStrokePositions = [];
        updatePreviewMesh([]);
      }
      isVoxelDrag = false;
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
    if (isVoxelDrag) {
      cancelDrag();
    }
    handlePointerMove();
  }

  function onContextMenu(event: Event) {
    if (isVoxelDrag || $tool === 'fly') event.preventDefault();
  }

  function onEscapeKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && polygonPhase) {
      cancelPolygon();
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
    // Alt+scroll during plane/cuboid drag: cycle plane orientation (X/Y/Z)
    const mode = get(effectiveStrokeMode);
    if (
      event.altKey &&
      isVoxelDrag &&
      (mode === 'plane' || mode === 'cuboid') &&
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
      const currentPos = hit
        ? $tool === 'voxel'
          ? getAddPosition(hit)
          : getVoxelPosition(hit)
        : null;
      if (currentPos) {
        pendingStrokePositions = getAxisAlignedPlaneFromNormal(
          dragStartPos,
          currentPos,
          axisVector(next)
        );
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
    const frustumHeight = $gridSize * 2;
    const frustumWidth = frustumHeight * aspect;
    orthographicCamera.left = -frustumWidth / 2;
    orthographicCamera.right = frustumWidth / 2;
    orthographicCamera.top = frustumHeight / 2;
    orthographicCamera.bottom = -frustumHeight / 2;
    orthographicCamera.updateProjectionMatrix();
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
    render();
  }

  function render() {
    if (renderer && scene && camera) {
      scene.updateMatrixWorld(true);
      renderer.render(scene, camera);
    }
    gizmoRef?.draw();
  }

  function animate(now?: number) {
    animationFrameId = requestAnimationFrame(animate);
    const t = now ?? performance.now();
    const delta = lastFrameTime ? (t - lastFrameTime) / 1000 : 0;
    lastFrameTime = t;
    if (flyControls?.enabled && camera) {
      applyFlyMovement(camera, flyControls, flyMoveState, delta, { moveSpeed: FLY_MOVE_SPEED });
    } else {
      orbitControls?.update();
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
    return () => {
      unsubT();
      unsubS();
      unsubR();
    };
  });

  $effect(() => {
    const v = $voxels;
    const sz = $gridSize;
    const _ao = $aoStrength;
    const _renderingMode = $renderingMode;
    requestRebuildVoxelMeshes(v, sz);
    render();
  });

  $effect(() => {
    const sel = $selection;
    rebuildSelectionOverlay(sel);
    render();
  });

  $effect(() => {
    const shadows = $enableShadows;
    if (renderer) renderer.shadowMap.enabled = shadows;
    if (dirLight) dirLight.castShadow = shadows;
    for (const { mesh } of meshesByColor.values()) {
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
    }
    render();
  });

  $effect(() => {
    const r = $roughness;
    const m = $metalness;
    for (const { mesh } of meshesByColor.values()) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.roughness = r;
      mat.metalness = m;
    }
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
    if (!fromUrl && !loadFromStorage()) initCanvas(get(gridSize));
    const sz = get(gridSize);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(hexToInt($backgroundColor));
    envMap = createEnvMap();
    scene.environment = envMap;

    perspectiveCamera = new THREE.PerspectiveCamera(
      focalLengthToFov(get(focalLength)),
      1,
      1,
      10000
    );
    const dist = sz * 2.5;
    perspectiveCamera.position.set(dist * 0.6, dist * 0.8, dist);
    perspectiveCamera.lookAt(0, 0, 0);

    const aspect = container ? container.clientWidth / container.clientHeight : 1;
    const frustumHeight = sz * 2;
    const frustumWidth = frustumHeight * aspect;
    orthographicCamera = new THREE.OrthographicCamera(
      -frustumWidth / 2,
      frustumWidth / 2,
      frustumHeight / 2,
      -frustumHeight / 2,
      1,
      10000
    );
    orthographicCamera.position.copy(perspectiveCamera.position);
    orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);

    camera = get(orthographic) ? orthographicCamera : perspectiveCamera;

    rollOverMaterial = new THREE.MeshBasicMaterial({
      color: hexToInt($color),
      opacity: 0.5,
      transparent: true
    });
    boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    rollOverMesh = new THREE.Mesh(boxGeometry, rollOverMaterial);
    rollOverMesh.visible = false;
    scene.add(rollOverMesh);

    voxelGroup = new THREE.Group();
    scene.add(voxelGroup);

    setupMeshWorker();

    selectionGroup = new THREE.Group();
    scene.add(selectionGroup);

    previewMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: 0xffffff,
      opacity: 0.5,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), previewMaterial);
    previewMesh.visible = false;
    previewMesh.raycast = () => {};
    scene.add(previewMesh);

    addPreviewMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: 0xffffff,
      opacity: 0.5,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
    addPreviewMesh = new THREE.Mesh(new THREE.BufferGeometry(), addPreviewMaterial);
    addPreviewMesh.visible = false;
    addPreviewMesh.raycast = () => {};
    scene.add(addPreviewMesh);

    polygonLineMaterial = new THREE.LineBasicMaterial({
      color: 0x3399ff,
      linewidth: 2,
      depthTest: true,
      depthWrite: false
    });
    polygonLineSegments = new THREE.LineSegments(new THREE.BufferGeometry(), polygonLineMaterial);
    polygonLineSegments.raycast = () => {};
    scene.add(polygonLineSegments);

    polygonPointsMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      opacity: 0.9,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    polygonPointsMesh = new THREE.InstancedMesh(
      boxGeometry,
      polygonPointsMaterial,
      POLYGON_POINTS_MAX
    );
    polygonPointsMesh.count = 0;
    polygonPointsMesh.visible = false;
    polygonPointsMesh.renderOrder = 1;
    polygonPointsMesh.frustumCulled = false;
    scene.add(polygonPointsMesh);

    ropePointsMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      opacity: 0.9,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    ropePointsMesh = new THREE.InstancedMesh(boxGeometry, ropePointsMaterial, 2);
    ropePointsMesh.count = 0;
    ropePointsMesh.visible = false;
    ropePointsMesh.renderOrder = 1;
    ropePointsMesh.frustumCulled = false;
    scene.add(ropePointsMesh);

    // Hemisphere: sky (top) + ground (bottom) for natural ambient bounce
    hemisphereLight = new THREE.HemisphereLight(0xb8d4e8, 0x4a5568, 1);
    scene.add(hemisphereLight);
    dirLight = new THREE.DirectionalLight(hexToInt($lightColor), 2);
    dirLight.castShadow = $enableShadows;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0002;
    dirLight.shadow.normalBias = 0.02;
    dirLight.target.position.set(0, 0, 0);
    scene.add(dirLight.target);
    updateDirLightPosition($lightAngle, $lightElevation, sz);
    updateShadowCamera(sz);
    scene.add(dirLight);

    sky = new Sky();
    sky.scale.setScalar(20000);
    sky.renderOrder = -1;
    (sky.material as THREE.ShaderMaterial).uniforms['cloudCoverage'].value = 0;
    scene.add(sky);

    const groundGeo = new THREE.CircleGeometry(1, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d,
      roughness: 1,
      metalness: 0
    });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -sz * 0.6;
    groundPlane.scale.set(sz * 3, sz * 3, 1);
    groundPlane.receiveShadow = true;
    groundPlane.renderOrder = -1;
    scene.add(groundPlane);

    gridLineMaterial = new LineMaterial({
      color: 0x333333,
      opacity: 0.5,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      linewidth: 1.5,
      worldUnits: false,
      alphaToCoverage: true
    });
    gridGroup = new THREE.Group();
    gridGroup.renderOrder = 1;
    buildGrid(sz, $voxels);
    gridGroup.visible = $showGrid;
    scene.add(gridGroup);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = $enableShadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.addEventListener('change', updateZoomPercent);

    flyControls = new PointerLockControls(camera, container);
    flyControls.pointerSpeed = FLY_POINTER_SPEED;
    flyControls.enabled = false;

    window.addEventListener('keydown', handleFlyKeyDown, true);
    window.addEventListener('keydown', onEscapeKeyDown, true);
    window.addEventListener('keydown', onFullscreenKey);
    window.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keyup', handleFlyKeyUp, true);

    updateZoomPercent();

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('pointerup', onFlyPointerCapture, true);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onFlyPointerCapture, true);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('resize', onWindowResize);

    requestRebuildVoxelMeshes($voxels, sz);
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
    updateDirLightPosition($lightAngle, $lightElevation, sz);
    updateShadowCamera(sz);
    if (dirLight) dirLight.color.setHex(hexToInt($lightColor));
    if (hemisphereLight) hemisphereLight.intensity = $ambientIntensity;
    if (scene) {
      scene.background = useSky ? null : new THREE.Color(hexToInt($backgroundColor));
    }
    if (sky) {
      sky.visible = useSky;
      if (useSky && dirLight) {
        (sky.material as THREE.ShaderMaterial).uniforms['sunPosition'].value.copy(
          dirLight.position
        );
      }
    }
    if (groundPlane) {
      groundPlane.visible = useSky;
      if (useSky) {
        groundPlane.position.y = -sz * 0.6;
        groundPlane.scale.set(sz * 3, sz * 3, 1);
      }
    }
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
    orbitControls.enabled = !isFly;
    flyControls.enabled = isFly;
    document.removeEventListener('mousemove', onFlyPointerMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    if (isFly) {
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
    if (isFly && (cuboidPhase || polygonPhase)) {
      flyControls.unlock();
      cancelDrag();
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
    const s = $addPanelStore;
    if (!addPreviewMesh || !addPreviewMaterial) return;
    if (!s.open) {
      addPreviewMesh.visible = false;
      render();
      return;
    }
    const positions = getShapePositionsAt({
      position: [s.posX, s.posY, s.posZ],
      rotation: [
        Math.max(0, Math.min(3, Math.floor(s.rotX))) & 3,
        Math.max(0, Math.min(3, Math.floor(s.rotY))) & 3,
        Math.max(0, Math.min(3, Math.floor(s.rotZ))) & 3
      ],
      shape: s.shape,
      size: Math.max(1, Math.min(256, Math.floor(s.size)))
    });
    const sel = $selectedColors;
    const col = hexToInt(sel.length > 0 ? sel[0] : $color);
    const voxelMap = new Map<string, number>();
    for (const [x, y, z] of positions) {
      voxelMap.set(coordKey(x, y, z), col);
    }
    const geoByColor = buildGreedyMesh(voxelMap, { aoEnabled: false });
    const geo = geoByColor.get(col);
    if (geo) {
      if (addPreviewMesh.geometry) addPreviewMesh.geometry.dispose();
      addPreviewMesh.geometry = geo;
      addPreviewMesh.visible = true;
    } else {
      addPreviewMesh.visible = false;
    }
    render();
  });

  onDestroy(() => {
    if (!browser) return;
    saveToStorage();
    cancelAnimationFrame(animationFrameId);
    meshWorker?.terminate();
    meshWorker = null;
    container?.removeEventListener('pointermove', onPointerMove);
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
    renderer?.dispose();
    envMap?.dispose();
    for (const { mesh } of meshesByColor.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    boxGeometry?.dispose();
    rollOverMaterial?.dispose();
    previewMaterial?.dispose();
    addPreviewMesh?.geometry?.dispose();
    addPreviewMaterial?.dispose();
    selectionMaterial?.dispose();
    gridGroup?.traverse((obj) => {
      const geom = (obj as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    });
    gridLineMaterial?.dispose();
    polygonLineSegments?.geometry?.dispose();
    polygonLineMaterial?.dispose();
    polygonPointsMaterial?.dispose();
    ropePointsMaterial?.dispose();
  });
</script>

<div
  class="canvas-container"
  bind:this={container}
  role="application"
  aria-label="Voxel sculpting canvas"
>
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
          e.stopPropagation();
          depthSliderPointerId = e.pointerId;
          depthSliderStartY = e.clientY;
          depthSliderStartDepth = cuboidDepth;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onpointermove={(e) => {
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
          e.stopPropagation();
          ropeTensionSliderPointerId = e.pointerId;
          ropeTensionSliderStartY = e.clientY;
          ropeTensionSliderStartVal = get(ropeTension);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onpointermove={(e) => {
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
          aria-label="Decrease tension"
        >−</button
        >
        <span class="depth-slider-label">Tension: {Math.round($ropeTension * 100)}%</span>
        <button
          type="button"
          class="depth-btn"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => ropeTension.set(Math.min(1, $ropeTension + 0.05))}
          aria-label="Increase tension"
        >+</button
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
  {#if deltaDisplay}
    <div
      class="delta-display"
      aria-live="polite"
      style="left: {pointerScreen.x}px; top: {pointerScreen.y}px;"
    >
      Δ {deltaDisplay.dx}, {deltaDisplay.dy}, {deltaDisplay.dz}
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
        aria-label="Fit sculpture to view">Fit</button>
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
</style>
