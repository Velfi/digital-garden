/**
 * Manages voxel mesh rebuild (worker), grid, selection overlay, and preview mesh.
 * No tool or pointer logic; consumes store/refs and updates Three.js objects.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { buildGridPositions } from '../gridLines';
import { buildGreedyMesh, buildPreviewGeometry, PREVIEW_MESH_OPTIONS } from '../greedyMesh';
import type { SceneSetupRefs } from './sceneSetup';

export interface MeshManagerOptions {
  roughness: number;
  metalness: number;
  enableShadows: boolean;
  renderingMode: 'greedy' | 'marchingCubes';
  aoStrength: number;
}

export interface MeshManagerCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onSpinnerChange: (show: boolean) => void;
  render: () => void;
}

const CHUNK_THRESHOLD = 50000;
const SPINNER_DELAY_MS = 2000;

export function createMeshManager(
  refs: SceneSetupRefs,
  getOptions: () => MeshManagerOptions,
  callbacks: MeshManagerCallbacks
) {
  const {
    scene,
    voxelGroup,
    gridGroup,
    gridLineMaterial,
    selectionGroup,
    previewMesh,
    previewMaterial
  } = refs;

  let meshWorker: Worker | null = null;
  let meshRebuildGen = 0;
  const meshesByColor = new Map<
    number,
    { mesh: THREE.InstancedMesh | THREE.Mesh; positions: [number, number, number][] | null }
  >();
  let selectionMesh: THREE.Mesh | null = null;
  let selectionMaterial: THREE.MeshBasicMaterial | null = null;
  let spinnerTimeoutId: ReturnType<typeof setTimeout> | null = null;

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

    const opts = getOptions();
    const envMap = scene?.environment ?? null;

    for (const { color: col, positions, normals, colors, indices } of results) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: opts.roughness,
        metalness: opts.metalness,
        envMap: envMap
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = opts.enableShadows;
      mesh.receiveShadow = opts.enableShadows && opts.renderingMode !== 'marchingCubes';
      voxelGroup.add(mesh);
      meshesByColor.set(col, { mesh, positions: null });
    }
  }

  function setupWorker() {
    if (typeof window === 'undefined') return;
    meshWorker = new Worker(new URL('../voxelMeshWorker.ts', import.meta.url), {
      type: 'module'
    });
    meshWorker.onmessage = (e: MessageEvent<{ results: unknown[]; gen?: number }>) => {
      if (e.data.gen !== meshRebuildGen) return;
      callbacks.onLoadingChange(false);
      callbacks.onSpinnerChange(false);
      if (spinnerTimeoutId) {
        clearTimeout(spinnerTimeoutId);
        spinnerTimeoutId = null;
      }
      applyVoxelMeshResults(e.data.results as Parameters<typeof applyVoxelMeshResults>[0]);
      callbacks.render();
    };
  }

  function requestRebuildVoxelMeshes(v: Map<string, number>) {
    if (!meshWorker || !voxelGroup) return;
    const gen = ++meshRebuildGen;
    callbacks.onLoadingChange(true);
    callbacks.onSpinnerChange(false);
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    spinnerTimeoutId = setTimeout(() => {
      spinnerTimeoutId = null;
      callbacks.onSpinnerChange(true);
    }, SPINNER_DELAY_MS);
    const voxelsArr: [string, number][] = [...v];
    const opts = getOptions();
    const chunkSize = v.size >= CHUNK_THRESHOLD ? 32 : 0;
    meshWorker.postMessage({
      voxels: voxelsArr,
      mode: opts.renderingMode,
      options: { aoStrength: opts.aoStrength, chunkSize },
      gen
    });
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
    const geoByColor = buildGreedyMesh(overlayMap, PREVIEW_MESH_OPTIONS);
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

  function updatePreviewMesh(
    positions: [number, number, number][],
    colorHex: number,
    existingVoxels?: Map<string, number>
  ) {
    if (!previewMesh || !previewMaterial) return;
    if (positions.length === 0) {
      previewMesh.visible = false;
      return;
    }
    const geo = buildPreviewGeometry(positions, colorHex, existingVoxels);
    if (geo) {
      if (previewMesh.geometry) previewMesh.geometry.dispose();
      previewMesh.geometry = geo;
      previewMesh.visible = true;
    } else {
      previewMesh.visible = false;
    }
  }

  function destroy() {
    meshWorker?.terminate();
    meshWorker = null;
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    for (const { mesh } of meshesByColor.values()) {
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    meshesByColor.clear();
    if (selectionMesh) {
      selectionMesh.geometry?.dispose();
      selectionMaterial?.dispose();
    }
    gridGroup?.traverse((obj) => {
      const geom = (obj as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    });
  }

  setupWorker();

  return {
    requestRebuildVoxelMeshes,
    rebuildSelectionOverlay,
    buildGrid,
    updatePreviewMesh,
    destroy,
    getMeshesByColor: () => meshesByColor
  };
}
