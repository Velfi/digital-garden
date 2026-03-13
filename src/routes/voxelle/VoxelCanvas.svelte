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
    tool,
    color,
    strokeMode,
    planeAxis,
    selection,
    lightAngle,
    lightElevation,
    lightColor,
    ambientIntensity,
    enableShadows,
    enableAO,
    backgroundColor,
    enableSky,
    focalLength,
    orthographic,
    roughness,
    metalness,
    envMapIntensity,
    updateVoxels,
    updateVoxelsInStroke,
    beginStroke,
    history,
    initCanvas,
    loadFromStorage,
    loadFromUrlHash,
    saveToStorage,
    coordKey,
    parseCoordKey,
    hexToInt,
    intToHex,
    getSelectionAnchor,
    getSelectionBounds,
    getStampOffsetForFace,
    ensureGridFitsPositions,
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
  import { ConvexHull } from 'three/addons/math/ConvexHull.js';
  import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
  import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
  import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
  import { Sky } from 'three/addons/objects/Sky.js';
  import { buildGreedyMesh } from './greedyMesh';
  import OrbitGizmo from './OrbitGizmo.svelte';

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
  const FLY_MOVE_SPEED = 120;
  const FLY_POINTER_SPEED = 1.2;

  // 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength)
  function focalLengthToFov(mm: number): number {
    return (2 * Math.atan(12 / mm) * 180) / Math.PI;
  }

  const pointerHelper = new THREE.Vector3();
  const fitHelperBox = new THREE.Box3();
  const flyMoveState = {
    forward: 0,
    back: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    shift: 0
  };
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

  function getHalf(size: number) {
    return size / 2;
  }

  function inBounds(x: number, y: number, z: number, size: number): boolean {
    const h = getHalf(size);
    return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
  }

  function rebuildVoxelMeshes(v: Map<string, number>, size: number) {
    if (!voxelGroup) return;
    for (const { mesh } of meshesByColor.values()) {
      voxelGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      // Greedy mesh has its own geometry
      if (mesh instanceof THREE.Mesh && mesh.geometry) mesh.geometry.dispose();
    }
    meshesByColor.clear();

    const envMap = scene?.environment ?? null;
    const r = $roughness;
    const m = $metalness;
    const envInt = $envMapIntensity;

    const geoByColor = buildGreedyMesh(v, { aoEnabled: $enableAO });
    for (const [col, geo] of geoByColor) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: r,
        metalness: m,
        envMap: envMap,
        envMapIntensity: envInt
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = $enableShadows;
      mesh.receiveShadow = $enableShadows;
      voxelGroup.add(mesh);
      meshesByColor.set(col, { mesh, positions: null });
    }
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
    const bounds = getSelectionBounds(sel);
    if (!bounds) return [];
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    const out: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      out.push([x + dx, y + dy, z + dz]);
    }
    return out;
  }

  function getFaceNormalFromHit(hit: THREE.Intersection): FaceNormal | null {
    if (!hit.face) return null;
    hit.object.getWorldQuaternion(worldQuaternion);
    const n = hit.face.normal.clone().applyQuaternion(worldQuaternion);
    return [
      Math.round(n.x) as -1 | 0 | 1,
      Math.round(n.y) as -1 | 0 | 1,
      Math.round(n.z) as -1 | 0 | 1
    ];
  }

  function getRaycastTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    for (const { mesh } of meshesByColor.values()) {
      targets.push(mesh);
    }
    if (polygonPhase && polygonPointsMesh) {
      targets.push(polygonPointsMesh);
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

  /** Returns voxel positions along axis-aligned line from a to b (dominant axis). */
  function getAxisAlignedLine(
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number][] {
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    const dz = Math.abs(b[2] - a[2]);
    const positions: [number, number, number][] = [];
    if (dx >= dy && dx >= dz) {
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      for (let x = x0; x <= x1; x++) positions.push([x, a[1], a[2]]);
    } else if (dy >= dx && dy >= dz) {
      const y0 = Math.min(a[1], b[1]);
      const y1 = Math.max(a[1], b[1]);
      for (let y = y0; y <= y1; y++) positions.push([a[0], y, a[2]]);
    } else {
      const z0 = Math.min(a[2], b[2]);
      const z1 = Math.max(a[2], b[2]);
      for (let z = z0; z <= z1; z++) positions.push([a[0], a[1], z]);
    }
    return positions;
  }

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

  /** Returns all voxel positions in the axis-aligned plane. Plane normal = face normal (fixed axis from start). */
  function getAxisAlignedPlaneFromNormal(
    a: [number, number, number],
    b: [number, number, number],
    faceNormal: THREE.Vector3
  ): [number, number, number][] {
    // Fixed axis = axis of plane normal (largest |component|)
    const ax = Math.abs(faceNormal.x);
    const ay = Math.abs(faceNormal.y);
    const az = Math.abs(faceNormal.z);
    const fixedAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const positions: [number, number, number][] = [];
    if (fixedAxis === 0) {
      const x = a[0];
      const y0 = Math.min(a[1], b[1]);
      const y1 = Math.max(a[1], b[1]);
      const z0 = Math.min(a[2], b[2]);
      const z1 = Math.max(a[2], b[2]);
      for (let py = y0; py <= y1; py++)
        for (let pz = z0; pz <= z1; pz++) positions.push([x, py, pz]);
    } else if (fixedAxis === 1) {
      const y = a[1];
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      const z0 = Math.min(a[2], b[2]);
      const z1 = Math.max(a[2], b[2]);
      for (let px = x0; px <= x1; px++)
        for (let pz = z0; pz <= z1; pz++) positions.push([px, y, pz]);
    } else {
      const z = a[2];
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      const y0 = Math.min(a[1], b[1]);
      const y1 = Math.max(a[1], b[1]);
      for (let px = x0; px <= x1; px++)
        for (let py = y0; py <= y1; py++) positions.push([px, py, z]);
    }
    return positions;
  }

  /** Returns all voxel positions in axis-aligned cuboid. Plane from a to b, extruded along faceNormal by depth voxels. */
  function getAxisAlignedCuboid(
    a: [number, number, number],
    b: [number, number, number],
    faceNormal: THREE.Vector3,
    depth: number
  ): [number, number, number][] {
    const planePositions = getAxisAlignedPlaneFromNormal(a, b, faceNormal);
    if (depth === 0) return planePositions;
    const positions: [number, number, number][] = [...planePositions];
    const ax = Math.abs(faceNormal.x);
    const ay = Math.abs(faceNormal.y);
    const az = Math.abs(faceNormal.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const step = faceNormal.getComponent(axis) > 0 ? 1 : -1;
    const layers = Math.abs(depth);
    const dir = depth > 0 ? step : -step;
    for (let k = 1; k <= layers; k++) {
      const dk = dir * k;
      for (const [px, py, pz] of planePositions) {
        const pos: [number, number, number] = [px, py, pz];
        pos[axis] += dk;
        positions.push(pos);
      }
    }
    return positions;
  }

  /** Returns voxels inside the convex hull of the given points. */
  function getPolygonVoxels(points: [number, number, number][]): [number, number, number][] {
    if (points.length === 0) return [];
    if (points.length === 1) return [points[0]];
    if (points.length === 2) return getAxisAlignedLine(points[0], points[1]);
    if (points.length === 3) {
      // Point-in-triangle: project to 2D, use barycentric test for each voxel center
      const [a, b, c] = points;
      const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const normal = new THREE.Vector3().crossVectors(ab, ac);
      const ax = Math.abs(normal.x);
      const ay = Math.abs(normal.y);
      const az = Math.abs(normal.z);
      const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
      const uAxis = dropAxis === 0 ? 1 : 0;
      const vAxis = dropAxis === 2 ? 1 : 2;
      const to2D = (p: [number, number, number]) => [p[uAxis], p[vAxis]] as [number, number];
      const a2 = to2D(a);
      const b2 = to2D(b);
      const c2 = to2D(c);
      const v0x = b2[0] - a2[0];
      const v0y = b2[1] - a2[1];
      const v1x = c2[0] - a2[0];
      const v1y = c2[1] - a2[1];
      const denom = v0x * v1y - v0y * v1x;
      if (Math.abs(denom) < 1e-9) return getAxisAlignedLine(a, b); // collinear fallback
      const minX = Math.floor(Math.min(a[0], b[0], c[0]));
      const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
      const minY = Math.floor(Math.min(a[1], b[1], c[1]));
      const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
      const minZ = Math.floor(Math.min(a[2], b[2], c[2]));
      const maxZ = Math.ceil(Math.max(a[2], b[2], c[2]));
      const positions: [number, number, number][] = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            const cz = z + 0.5;
            const p2: [number, number] = [0, 0];
            p2[0] = [cx, cy, cz][uAxis];
            p2[1] = [cx, cy, cz][vAxis];
            const px = p2[0] - a2[0];
            const py = p2[1] - a2[1];
            const s = (px * v1y - py * v1x) / denom;
            const t = (py * v0x - px * v0y) / denom;
            if (s >= -1e-6 && t >= -1e-6 && s + t <= 1 + 1e-6) {
              positions.push([x, y, z]);
            }
          }
        }
      }
      return positions;
    }
    // 4+ points: convex hull
    const vecs = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const hull = new ConvexHull();
    hull.setFromPoints(vecs);
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]);
      maxZ = Math.max(maxZ, p[2]);
    }
    const positions: [number, number, number][] = [];
    const test = new THREE.Vector3();
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        for (let z = Math.floor(minZ); z <= Math.ceil(maxZ); z++) {
          test.set(x, y, z);
          if (hull.containsPoint(test)) positions.push([x, y, z]);
        }
      }
    }
    return positions;
  }

  const CUBE_EDGES: number[][] = [
    [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5, -0.5, 0.5, -0.5],
    [-0.5, -0.5, -0.5, -0.5, -0.5, 0.5],
    [0.5, -0.5, -0.5, 0.5, 0.5, -0.5],
    [0.5, -0.5, -0.5, 0.5, -0.5, 0.5],
    [-0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5, -0.5, 0.5, 0.5],
    [-0.5, -0.5, 0.5, 0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
    [0.5, 0.5, -0.5, 0.5, 0.5, 0.5],
    [0.5, -0.5, 0.5, 0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
  ];
  // For each edge: the 2 neighbor offsets; edge is visible if either neighbor is empty
  const EDGE_NEIGHBORS: [number, number, number][][] = [
    [
      [0, -1, 0],
      [0, 0, -1]
    ],
    [
      [-1, 0, 0],
      [0, 0, -1]
    ],
    [
      [-1, 0, 0],
      [0, -1, 0]
    ],
    [
      [1, 0, 0],
      [0, 0, -1]
    ],
    [
      [1, 0, 0],
      [0, -1, 0]
    ],
    [
      [0, 1, 0],
      [0, 0, -1]
    ],
    [
      [-1, 0, 0],
      [0, 1, 0]
    ],
    [
      [0, -1, 0],
      [0, 0, 1]
    ],
    [
      [-1, 0, 0],
      [0, 0, 1]
    ],
    [
      [1, 0, 0],
      [0, 1, 0]
    ],
    [
      [1, 0, 0],
      [0, 0, 1]
    ],
    [
      [0, 1, 0],
      [0, 0, 1]
    ]
  ];

  function buildGrid(_size: number, v: Map<string, number>) {
    if (!gridGroup || !gridLineMaterial || !scene) return;
    // Remove existing grid lines
    while (gridGroup.children.length > 0) {
      const child = gridGroup.children[0];
      gridGroup.remove(child);
      const geom = (child as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    }
    if (v.size === 0) return;
    const positions: number[] = [];
    const has = (x: number, y: number, z: number) => v.has(coordKey(x, y, z));
    for (const key of v.keys()) {
      const [x, y, z] = parseCoordKey(key);
      for (let i = 0; i < CUBE_EDGES.length; i++) {
        const [[dx1, dy1, dz1], [dx2, dy2, dz2]] = EDGE_NEIGHBORS[i];
        const n1 = has(x + dx1, y + dy1, z + dz1);
        const n2 = has(x + dx2, y + dy2, z + dz2);
        if (n1 && n2) continue; // both neighbors exist, edge is interior
        const edge = CUBE_EDGES[i];
        positions.push(
          x + edge[0],
          y + edge[1],
          z + edge[2],
          x + edge[3],
          y + edge[4],
          z + edge[5]
        );
      }
    }
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
    // Add 0.5 * normal to reach adjacent cell center (hit.point is on face, full normal overshoots)
    pointerHelper.copy(hit.point).addScaledVector(worldNormal, 0.5);
    return snapToGrid(pointerHelper);
  }

  function getVoxelPosition(hit: THREE.Intersection): [number, number, number] | null {
    const mesh = hit.object as THREE.InstancedMesh | THREE.Mesh;
    const positions = mesh.userData?.positions as [number, number, number][] | undefined;
    if (positions && hit.instanceId != null) {
      return positions[hit.instanceId] ?? null;
    }
    // Greedy mesh: derive from hit point and face normal
    if (!hit.face) return null;
    mesh.getWorldQuaternion(worldQuaternion);
    const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
    pointerHelper.copy(hit.point).addScaledVector(worldNormal, -0.5);
    return snapToGrid(pointerHelper);
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
    const col = hexToInt($color);
    updateVoxelsInStroke((v) => {
      for (const [x, y, z] of effective) {
        if (!inBounds(x, y, z, sz)) continue;
        const key = coordKey(x, y, z);
        if ($tool === 'remove') {
          v.delete(key);
        } else if ($tool === 'voxel') {
          if (!v.has(key)) v.set(key, col);
        } else if ($tool === 'paint') {
          if (v.has(key)) v.set(key, col);
        }
      }
    });
  }

  function applySelectStroke(positions: [number, number, number][]) {
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
    const bounds = getSelectionBounds(sel);
    if (!bounds) return;
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    const stampPositions: [number, number, number][] = [];
    for (const [key, col] of sel) {
      const [sx, sy, sz] = parseCoordKey(key);
      stampPositions.push([sx + dx, sy + dy, sz + dz]);
    }
    ensureGridFitsPositions(stampPositions);
    beginStroke();
    updateVoxelsInStroke((v) => {
      for (const [key, col] of sel) {
        const [sx, sy, sz] = parseCoordKey(key);
        const x = sx + dx;
        const y = sy + dy;
        const z = sz + dz;
        if (!inBounds(x, y, z, $gridSize)) continue;
        v.set(coordKey(x, y, z), col);
      }
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
      pendingStrokePositions = [];
      updatePreviewMesh([]);
      // No undo - we never applied changes
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (
      (event.target as Element)?.closest?.(
        '.cuboid-done-btn, .polygon-done-btn, .polygon-cancel-btn, .zoom-controls, .depth-slider-container, .orbit-gizmo'
      )
    )
      return;
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
      if (isVoxelDrag || cuboidPhase || polygonPhase) {
        event.preventDefault();
        cancelDrag();
        render();
      }
      return;
    }
    if (event.button !== 0) return;

    // Cuboid depth phase: pointer down starts drag-to-adjust-depth (anywhere on canvas)
    if (get(strokeMode) === 'cuboid' && cuboidPhase === 'depth' && cuboidPlane) {
      event.preventDefault();
      event.stopPropagation();
      depthAdjustPointerId = event.pointerId;
      lastDepthPhaseClientY = event.clientY;
      depthPhaseAccumulator = 0;
      container.setPointerCapture(event.pointerId);
      return;
    }

    let hit = getIntersection();
    if (!hit) return;

    // Polygon mode: prioritize polygon point hits over voxels (points sit on voxel faces)
    if (get(strokeMode) === 'polygon' && polygonPhase && polygonPointsMesh && camera) {
      raycaster.setFromCamera(pointer, camera);
      const pointHits = raycaster.intersectObject(polygonPointsMesh, false);
      if (pointHits.length > 0) hit = pointHits[0];
    }

    // Polygon mode: click to add point or delete existing point
    if (get(strokeMode) === 'polygon') {
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
        const pos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
        if (pos) {
          polygonPhase = 'placing';
          polygonPoints = [...polygonPoints, pos];
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

    // Select tool + fill method: click voxel to select it and all connected same-color voxels
    if ($tool === 'select' && get(strokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
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
          const next = mergeSelection($selection, incoming, get(selectionMode));
          selection.set(next);
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Paint tool + fill method: click voxel to flood-fill connected same-color region
    if ($tool === 'paint' && get(strokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
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
          const col = hexToInt($color);
          const positions = [...fillRegion.keys()].map((k) => parseCoordKey(k));
          ensureGridFitsPositions(positions);
          beginStroke();
          updateVoxelsInStroke((v) => {
            for (const key of fillRegion.keys()) {
              v.set(key, col);
            }
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Voxel tool + fill method: click face to flood-fill connected empty space with voxels
    if ($tool === 'voxel' && get(strokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
      const pos = getAddPosition(hit);
      if (pos && !$voxels.has(coordKey(pos[0], pos[1], pos[2]))) {
        const emptyRegion = getFillEmptyAt(pos[0], pos[1], pos[2], get(fillSelectDiagonals));
        if (emptyRegion.size > 0) {
          const col = hexToInt($color);
          const positions = [...emptyRegion].map((k) => parseCoordKey(k));
          ensureGridFitsPositions(positions);
          beginStroke();
          updateVoxelsInStroke((v) => {
            for (const key of emptyRegion) {
              v.set(key, col);
            }
          });
        }
      }
      requestAnimationFrame(() => render());
      return;
    }

    // Remove tool + fill method: click voxel to flood-remove connected region
    if ($tool === 'remove' && get(strokeMode) === 'fill' && hit.object !== polygonPointsMesh) {
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
          const incoming =
            get(strokeMode) === 'fill'
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
          color.set(intToHex(col));
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
    updatePreviewMesh(pendingStrokePositions);
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
      // Update preview
      const hit = getIntersection();
      let currentPos: [number, number, number] | null = null;
      if (hit) {
        currentPos = $tool === 'voxel' ? getAddPosition(hit) : getVoxelPosition(hit);
      }
      if (currentPos) {
        const mode = get(strokeMode);
        const normal = getEffectivePlaneNormal();
        pendingStrokePositions =
          (mode === 'plane' || mode === 'cuboid') && normal
            ? getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, normal)
            : getAxisAlignedLine(dragStartPos, currentPos);
        deltaDisplay = {
          dx: currentPos[0] - dragStartPos[0],
          dy: currentPos[1] - dragStartPos[1],
          dz: currentPos[2] - dragStartPos[2]
        };
      } else {
        deltaDisplay = null;
      }
      updatePreviewMesh(pendingStrokePositions);
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
    if ($tool !== 'voxel') {
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
      const mode = get(strokeMode);
      const normal = getEffectivePlaneNormal();
      if (mode === 'cuboid' && dragStartPos && normal) {
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
        // Apply the stroke on release (line/plane)
        if (pendingStrokePositions.length > 0) {
          if ($tool === 'select') {
            applySelectStroke(pendingStrokePositions);
          } else {
            beginStroke();
            applyLineStroke(pendingStrokePositions);
          }
        }
        pendingStrokePositions = [];
        updatePreviewMesh([]);
      }
      isVoxelDrag = false;
      dragStartPos = null;
      dragFaceNormal = null;
      dragPlaneAxisOverride = null;
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

  // Block pointer events from reaching FlyControls when in fly mode (we handle them ourselves)
  function onFlyPointerCapture(e: PointerEvent) {
    if ($tool === 'fly') e.stopPropagation();
  }

  // Noclip: WASD + Q/E movement
  function onFlyKeyDown(e: KeyboardEvent) {
    if (e.altKey || !flyControls?.enabled) return;
    switch (e.code) {
      case 'KeyW':
        flyMoveState.forward = 1;
        break;
      case 'KeyS':
        flyMoveState.back = 1;
        break;
      case 'KeyA':
        flyMoveState.left = 1;
        break;
      case 'KeyD':
        flyMoveState.right = 1;
        break;
      case 'KeyE':
        flyMoveState.up = 1;
        break;
      case 'KeyQ':
        flyMoveState.down = 1;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        flyMoveState.shift = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function onFlyKeyUp(e: KeyboardEvent) {
    if (!flyControls?.enabled) return;
    switch (e.code) {
      case 'KeyW':
        flyMoveState.forward = 0;
        break;
      case 'KeyS':
        flyMoveState.back = 0;
        break;
      case 'KeyA':
        flyMoveState.left = 0;
        break;
      case 'KeyD':
        flyMoveState.right = 0;
        break;
      case 'KeyE':
        flyMoveState.up = 0;
        break;
      case 'KeyQ':
        flyMoveState.down = 0;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        flyMoveState.shift = 0;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onWheel(event: WheelEvent) {
    // Alt+scroll during plane/cuboid drag: cycle plane orientation (X/Y/Z)
    const mode = get(strokeMode);
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
      const speedMult = flyMoveState.shift ? 1 / 8 : 1;
      const dist = FLY_MOVE_SPEED * delta * speedMult;
      const fwd = flyMoveState.forward - flyMoveState.back;
      const right = flyMoveState.right - flyMoveState.left;
      const up = flyMoveState.up - flyMoveState.down;
      if (fwd !== 0) {
        const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(look, fwd * dist);
      }
      if (right !== 0) flyControls.moveRight(right * dist);
      if (up !== 0) camera.position.y += up * dist;
    } else {
      orbitControls?.update();
    }
    render();
  }

  $effect(() => {
    const mode = $strokeMode;
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
    const v = $voxels;
    const sz = $gridSize;
    const _ao = $enableAO;
    rebuildVoxelMeshes(v, sz);
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
    const envInt = $envMapIntensity;
    for (const { mesh } of meshesByColor.values()) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.roughness = r;
      mat.metalness = m;
      mat.envMapIntensity = envInt;
    }
    render();
  });

  onMount(async () => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const m = hash ? hash.slice(1).match(/^m=(.+)$/) : null;
    const fromUrl = m ? await loadFromUrlHash(m[1]) : false;
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
    scene.add(polygonPointsMesh);

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    window.addEventListener('keydown', onFlyKeyDown, true);
    window.addEventListener('keydown', onEscapeKeyDown, true);
    window.addEventListener('keyup', onFlyKeyUp, true);

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

    rebuildVoxelMeshes($voxels, sz);
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
    if (isFly && (cuboidPhase || polygonPhase)) {
      flyControls.unlock();
      cancelDrag();
    }
    if (!isFly && prevTool === 'fly' && camera) {
      flyControls.unlock();
      flyMoveState.forward =
        flyMoveState.back =
        flyMoveState.left =
        flyMoveState.right =
        flyMoveState.up =
        flyMoveState.down =
        flyMoveState.shift =
          0;
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
    const col = hexToInt($color);
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
    container?.removeEventListener('pointermove', onPointerMove);
    container?.removeEventListener('pointerdown', onPointerDown, true);
    container?.removeEventListener('pointerup', onFlyPointerCapture, true);
    container?.removeEventListener('pointerup', onPointerUp);
    container?.removeEventListener('pointercancel', onFlyPointerCapture, true);
    container?.removeEventListener('pointercancel', onPointerCancel);
    container?.removeEventListener?.('contextmenu', onContextMenu);
    container?.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('keydown', onFlyKeyDown, true);
    window.removeEventListener('keydown', onEscapeKeyDown, true);
    window.removeEventListener('keyup', onFlyKeyUp, true);
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
  });
</script>

<div
  class="canvas-container"
  bind:this={container}
  role="application"
  aria-label="Voxel sculpting canvas"
>
  {#if cuboidPhase === 'depth'}
    <div class="depth-slider-container">
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
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitCuboid()}
      title="Tap Done to apply"
      aria-label="Apply cuboid selection"
    >
      Done
    </button>
  {/if}
  {#if polygonPhase === 'placing' && polygonPoints.length >= 2}
    <div class="polygon-actions">
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
  {#if deltaDisplay}
    <div
      class="delta-display"
      aria-live="polite"
      style="left: {pointerScreen.x}px; top: {pointerScreen.y}px;"
    >
      Δ {deltaDisplay.dx}, {deltaDisplay.dy}, {deltaDisplay.dz}
    </div>
  {/if}
  {#if $tool === 'fly'}
    <div class="fly-hint" role="status" aria-live="polite">
      Click to capture · WASD move · E/Q up/down · Shift 1/8 speed · Move mouse to look
    </div>
  {:else}
    {#if camera && orbitControls}
      <OrbitGizmo bind:this={gizmoRef} {camera} controls={orbitControls} onRender={render} />
    {/if}
    <div
      class="zoom-controls"
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
  .canvas-container :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
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
