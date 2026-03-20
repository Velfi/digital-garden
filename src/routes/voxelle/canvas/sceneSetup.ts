/**
 * Creates the Three.js scene graph, cameras, lights, and mesh refs used by
 * VoxelCanvas. No tool or pointer logic; used by MeshManager and pointer handlers.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Sky } from 'three/addons/objects/Sky.js';

export const POLYGON_POINTS_MAX = 64;

export interface SceneSetupOptions {
  gridSize: number;
  colorHex: number;
  lightColorHex: number;
  focalLength: number;
  backgroundColorHex: number;
  enableShadows: boolean;
  lightAngle: number;
  lightElevation: number;
  aspect?: number;
}

export interface SceneSetupRefs {
  scene: THREE.Scene;
  perspectiveCamera: THREE.PerspectiveCamera;
  orthographicCamera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  envMap: THREE.CubeTexture;
  voxelGroup: THREE.Group;
  rollOverMesh: THREE.Mesh;
  rollOverMaterial: THREE.MeshBasicMaterial;
  boxGeometry: THREE.BoxGeometry;
  selectionGroup: THREE.Group;
  previewMesh: THREE.Mesh;
  previewMaterial: THREE.MeshBasicMaterial;
  addPreviewMesh: THREE.Mesh;
  addPreviewMaterial: THREE.MeshBasicMaterial;
  /** Same geometry as addPreviewMesh; draws only where preview is behind scene depth (occluded). */
  addPreviewOccludedMesh: THREE.Mesh;
  addPreviewOccludedMaterial: THREE.MeshBasicMaterial;
  polygonLineSegments: THREE.LineSegments;
  polygonLineMaterial: THREE.LineBasicMaterial;
  polygonPointsMesh: THREE.InstancedMesh;
  polygonPointsMaterial: THREE.MeshBasicMaterial;
  ropePointsMesh: THREE.InstancedMesh;
  ropePointsMaterial: THREE.MeshBasicMaterial;
  hemisphereLight: THREE.HemisphereLight;
  dirLight: THREE.DirectionalLight;
  sky: InstanceType<typeof Sky>;
  groundPlane: THREE.Mesh;
  gridGroup: THREE.Group;
  gridLineMaterial: InstanceType<typeof LineMaterial>;
  orbitControls: OrbitControls;
  flyControls: InstanceType<typeof PointerLockControls>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
}

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

function focalLengthToFov(mm: number): number {
  return (2 * Math.atan(12 / mm) * 180) / Math.PI;
}

export function createSceneSetup(
  container: HTMLDivElement,
  options: SceneSetupOptions
): SceneSetupRefs {
  const {
    gridSize: sz,
    colorHex,
    lightColorHex,
    focalLength,
    backgroundColorHex,
    enableShadows,
    lightAngle,
    lightElevation,
    aspect = container ? container.clientWidth / container.clientHeight : 1
  } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColorHex);
  const envMap = createEnvMap();
  scene.environment = envMap;

  const perspectiveCamera = new THREE.PerspectiveCamera(
    focalLengthToFov(focalLength),
    1,
    1,
    10000
  );
  const dist = sz * 2.5;
  perspectiveCamera.position.set(dist * 0.6, dist * 0.8, dist);
  perspectiveCamera.lookAt(0, 0, 0);

  const frustumHeight = sz * 2;
  const frustumWidth = frustumHeight * aspect;
  const orthographicCamera = new THREE.OrthographicCamera(
    -frustumWidth / 2,
    frustumWidth / 2,
    frustumHeight / 2,
    -frustumHeight / 2,
    1,
    10000
  );
  orthographicCamera.position.copy(perspectiveCamera.position);
  orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);

  const rollOverMaterial = new THREE.MeshBasicMaterial({
    color: colorHex,
    opacity: 0.5,
    transparent: true
  });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const rollOverMesh = new THREE.Mesh(boxGeometry, rollOverMaterial);
  rollOverMesh.visible = false;
  scene.add(rollOverMesh);

  const voxelGroup = new THREE.Group();
  scene.add(voxelGroup);

  const selectionGroup = new THREE.Group();
  scene.add(selectionGroup);

  const previewMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0xffffff,
    opacity: 0.5,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), previewMaterial);
  previewMesh.visible = false;
  previewMesh.raycast = () => {};
  scene.add(previewMesh);

  const addPreviewMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0xffffff,
    opacity: 0.5,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const addPreviewSharedGeometry = new THREE.BufferGeometry();
  const addPreviewMesh = new THREE.Mesh(addPreviewSharedGeometry, addPreviewMaterial);
  addPreviewMesh.visible = false;
  addPreviewMesh.renderOrder = 1001;
  addPreviewMesh.raycast = () => {};
  scene.add(addPreviewMesh);

  const addPreviewOccludedMaterial = new THREE.MeshBasicMaterial({
    vertexColors: false,
    color: 0x5577cc,
    opacity: 0.4,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const addPreviewOccludedMesh = new THREE.Mesh(addPreviewSharedGeometry, addPreviewOccludedMaterial);
  addPreviewOccludedMesh.visible = false;
  addPreviewOccludedMesh.renderOrder = 1000;
  addPreviewOccludedMesh.raycast = () => {};
  scene.add(addPreviewOccludedMesh);

  const polygonLineMaterial = new THREE.LineBasicMaterial({
    color: 0x3399ff,
    linewidth: 2,
    depthTest: true,
    depthWrite: false
  });
  const polygonLineSegments = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    polygonLineMaterial
  );
  polygonLineSegments.raycast = () => {};
  scene.add(polygonLineSegments);

  const polygonPointsMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    opacity: 0.9,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const polygonPointsMesh = new THREE.InstancedMesh(
    boxGeometry,
    polygonPointsMaterial,
    POLYGON_POINTS_MAX
  );
  polygonPointsMesh.count = 0;
  polygonPointsMesh.visible = false;
  polygonPointsMesh.renderOrder = 1;
  polygonPointsMesh.frustumCulled = false;
  scene.add(polygonPointsMesh);

  const ropePointsMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    opacity: 0.9,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const ropePointsMesh = new THREE.InstancedMesh(boxGeometry, ropePointsMaterial, 2);
  ropePointsMesh.count = 0;
  ropePointsMesh.visible = false;
  ropePointsMesh.renderOrder = 1;
  ropePointsMesh.frustumCulled = false;
  scene.add(ropePointsMesh);

  const hemisphereLight = new THREE.HemisphereLight(0xb8d4e8, 0x4a5568, 1);
  scene.add(hemisphereLight);

  const dirLight = new THREE.DirectionalLight(lightColorHex, 2);
  dirLight.castShadow = enableShadows;
  dirLight.shadow.mapSize.set(4096, 4096);
  dirLight.shadow.bias = -0.0002;
  dirLight.shadow.normalBias = 0.02;
  dirLight.target.position.set(0, 0, 0);
  scene.add(dirLight.target);
  const lightDist = Math.max(sz * 2, 10);
  const az = (lightAngle * Math.PI) / 180;
  const elev = (lightElevation * Math.PI) / 180;
  const h = Math.cos(elev);
  dirLight.position.set(Math.cos(az) * h * lightDist, Math.sin(elev) * lightDist, Math.sin(az) * h * lightDist);
  if (enableShadows) {
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
  scene.add(dirLight);

  const sky = new Sky();
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
  const groundPlane = new THREE.Mesh(groundGeo, groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -sz * 0.6;
  groundPlane.scale.set(sz * 3, sz * 3, 1);
  groundPlane.receiveShadow = true;
  groundPlane.renderOrder = -1;
  scene.add(groundPlane);

  const gridLineMaterial = new LineMaterial({
    color: 0x333333,
    opacity: 0.5,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    linewidth: 1.5,
    worldUnits: false,
    alphaToCoverage: true
  });
  const gridGroup = new THREE.Group();
  gridGroup.renderOrder = 1;
  scene.add(gridGroup);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = enableShadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const initialCamera = perspectiveCamera;
  const orbitControls = new OrbitControls(initialCamera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;

  const flyControls = new PointerLockControls(initialCamera, container);
  flyControls.enabled = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    scene,
    perspectiveCamera,
    orthographicCamera,
    renderer,
    envMap,
    voxelGroup,
    rollOverMesh,
    rollOverMaterial,
    boxGeometry,
    selectionGroup,
    previewMesh,
    previewMaterial,
    addPreviewMesh,
    addPreviewMaterial,
    addPreviewOccludedMesh,
    addPreviewOccludedMaterial,
    polygonLineSegments,
    polygonLineMaterial,
    polygonPointsMesh,
    polygonPointsMaterial,
    ropePointsMesh,
    ropePointsMaterial,
    hemisphereLight,
    dirLight,
    sky,
    groundPlane,
    gridGroup,
    gridLineMaterial,
    orbitControls,
    flyControls,
    raycaster,
    pointer
  };
}
