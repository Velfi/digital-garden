/**
 * Offscreen WebGL thumbnail for stamp voxel data (greedy mesh + basic material).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coordKey } from './coordUtils';
import { buildGreedyMesh, PREVIEW_MESH_OPTIONS } from './greedyMesh';
import type { StampBookEntryTuple } from './stampBookStorage';
import { clipboardEntryToVoxel } from './store/clipboard';
import type { Voxel } from './voxelMaterial';

function entriesToVoxelMap(entries: StampBookEntryTuple[]): Map<string, Voxel> {
  const m = new Map<string, Voxel>();
  for (const e of entries) {
    const [dx, dy, dz] = e;
    m.set(coordKey(dx, dy, dz), clipboardEntryToVoxel(e));
  }
  return m;
}

function voxelMapBounds(map: Map<string, Voxel>): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} | null {
  if (map.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const key of map.keys()) {
    const [x, y, z] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
    maxZ = Math.max(maxZ, z + 1);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
}

/**
 * Renders a PNG blob of the stamp (isometric-style view). Returns null if WebGL fails or entries empty.
 */
export async function renderStampPreviewPng(
  entries: StampBookEntryTuple[],
  pixelSize = 128
): Promise<Blob | null> {
  if (typeof window === 'undefined' || entries.length === 0) return null;

  const voxelMap = entriesToVoxelMap(entries);
  const geoByBucket = buildGreedyMesh(voxelMap, PREVIEW_MESH_OPTIONS);
  const geos = [...geoByBucket.values()];
  if (geos.length === 0) return null;

  const merged = geos.length === 1 ? geos[0]! : (mergeGeometries(geos) as THREE.BufferGeometry);
  if (geos.length > 1) geos.forEach((g) => g.dispose());

  const bounds = voxelMapBounds(voxelMap);
  if (!bounds) {
    merged.dispose();
    return null;
  }

  const center = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2
  );
  const extent = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ
  );
  const radius = Math.max(extent * 0.866, 1) * 0.75;

  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(merged, material);
  mesh.position.set(-center.x, -center.y, -center.z);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a32);
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
  const dist = Math.max(radius * 2.2, 3);
  camera.position.set(dist * 0.65, dist * 0.55, dist * 0.7);
  camera.lookAt(0, 0, 0);

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setSize(pixelSize, pixelSize);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.render(scene, camera);
  } catch {
    disposeObject3D(mesh);
    merged.dispose();
    renderer?.dispose();
    return null;
  }

  const canvas = renderer!.domElement;
  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  disposeObject3D(mesh);
  merged.dispose();
  renderer!.dispose();

  return blob;
}
