/**
 * Manages voxel mesh rebuild (worker), grid, selection overlay, and preview mesh.
 * No tool or pointer logic; consumes store/refs and updates Three.js objects.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  getBoundsFromPositions,
  getSelectionBounds,
  selectionAabbWireframePositions,
  VOXELLE_SELECTION_BBOX_WIREFRAME_KEY,
  VOXELLE_SELECTION_PIVOT_CHILD_KEY
} from '../coordUtils';
import { buildGridPositions } from '../gridLines';
import { buildGreedyMesh, buildPreviewGeometry, PREVIEW_MESH_OPTIONS } from '../greedyMesh';
import {
  alignPreviewMeshToLod,
  computePreviewLodStride,
  createPreviewRefinementScheduler,
  downsamplePositionsToPreviewMap,
  downsampleVoxelMapToPreviewMap,
  resetPreviewMeshTransform
} from '../previewMeshLod';
import type { SceneSetupRefs } from './sceneSetup';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import {
  createVoxelSurfaceMaterial,
  parseBucketKey,
  VOXELLE_GLOW_BLOOM_USERDATA_KEY,
  VOXELLE_MESH_MATERIAL_USERDATA_KEY
} from '../voxelMaterial';

export interface MeshManagerOptions {
  enableShadows: boolean;
  renderingMode: 'greedy' | 'marchingCubes';
  aoStrength: number;
  sceneEnvironmentIntensity: number;
}

export interface MeshManagerCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onSpinnerChange: (show: boolean) => void;
  render: () => void;
  /** Called after greedy mesh buckets are rebuilt (worker finished). */
  onVoxelMeshesRebuilt?: () => void;
}

const CHUNK_THRESHOLD = 50000;
const SPINNER_DELAY_MS = 2000;
const SELECTION_OVERLAY_HEX = 0x3399ff;

/** Remap mesh transmittance before driving shadow depth offset (darker / less “empty” glass). */
const GLASS_SHADOW_TRANSMIT_POW = 1.55;
const GLASS_SHADOW_TRANSMIT_SCALE = 0.8;
/** Max depth push (non-reversed Z) for fully transmissive glass; thick glass → ~0 push. */
const GLASS_SHADOW_DEPTH_PUSH = 0.042;

/**
 * Glass uses depthWrite:false on the visible material; shadow pass uses this instead.
 * Stochastic discard made sparse shadow-map texels → noisy PCF; we always write depth and only bias Z
 * by thickness so shadows stay smooth with a hint of transmittance.
 *
 * Tries both bundled `depth_frag` (compact) and source-style layout (comment after logdepthbuf).
 */
function createGlassShadowDepthMaterial(baseColor24: number): THREE.MeshDepthMaterial {
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    vertexColors: true
  });
  const baseColor = new THREE.Color(baseColor24 & 0xffffff);
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.glassBaseColor = { value: baseColor };
    shader.uniforms.glassShadowTransmitPow = { value: GLASS_SHADOW_TRANSMIT_POW };
    shader.uniforms.glassShadowTransmitScale = { value: GLASS_SHADOW_TRANSMIT_SCALE };
    shader.uniforms.glassShadowDepthPush = { value: GLASS_SHADOW_DEPTH_PUSH };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <clipping_planes_pars_vertex>',
      '#include <clipping_planes_pars_vertex>\n#include <color_pars_vertex>'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n#include <color_vertex>'
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_pars_fragment>',
      '#include <clipping_planes_pars_fragment>\nuniform vec3 glassBaseColor;\nuniform float glassShadowTransmitPow;\nuniform float glassShadowTransmitScale;\nuniform float glassShadowDepthPush;\n#include <color_pars_fragment>'
    );

    const glassFragCoordPatch =
      '\n#ifdef USE_COLOR\n\tvec3 glassDenom = max(glassBaseColor, vec3(0.0001));\n\tvec3 glassRatio = vColor.rgb / glassDenom;\n\tfloat rawT = clamp((glassRatio.r + glassRatio.g + glassRatio.b) / 3.0, 0.0, 1.0);\n\tfloat glassT = clamp(pow(rawT, glassShadowTransmitPow) * glassShadowTransmitScale, 0.0, 1.0);\n\tfloat glassPush = glassShadowDepthPush * glassT;\n\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\tfragCoordZ -= glassPush;\n\t#else\n\tfragCoordZ += glassPush;\n\t#endif\n\tfragCoordZ = clamp(fragCoordZ, 0.0, 1.0);\n#endif\n';

    const fragCoordZCompactBlock =
      '\t#include <logdepthbuf_fragment>\n\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\tfloat fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n\t#else\n\t\tfloat fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n\t#endif\n\t#if DEPTH_PACKING == 3200';
    const fragCoordZCompactReplacement =
      '\t#include <logdepthbuf_fragment>\n\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\tfloat fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n\t#else\n\t\tfloat fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n\t#endif' +
      glassFragCoordPatch +
      '\t#if DEPTH_PACKING == 3200';

    const fragCoordZSpacedBlock =
      '\t#include <logdepthbuf_fragment>\n\n\t// Higher precision equivalent of gl_FragCoord.z\n\n\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\n\t\tfloat fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n\n\t#else\n\n\t\tfloat fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n\n\t#endif\n\n\t#if DEPTH_PACKING == 3200';
    const fragCoordZSpacedReplacement =
      '\t#include <logdepthbuf_fragment>\n\n\t// Higher precision equivalent of gl_FragCoord.z\n\n\t#ifdef USE_REVERSED_DEPTH_BUFFER\n\n\t\tfloat fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];\n\n\t#else\n\n\t\tfloat fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;\n\n\t#endif' +
      glassFragCoordPatch +
      '\n\t#if DEPTH_PACKING == 3200';

    if (shader.fragmentShader.includes(fragCoordZCompactBlock)) {
      shader.fragmentShader = shader.fragmentShader.replace(fragCoordZCompactBlock, fragCoordZCompactReplacement);
    } else if (shader.fragmentShader.includes(fragCoordZSpacedBlock)) {
      shader.fragmentShader = shader.fragmentShader.replace(fragCoordZSpacedBlock, fragCoordZSpacedReplacement);
    } else {
      console.warn('voxelle: glass shadow depth patch failed (three.js depth shader layout changed)');
    }
  };
  return depthMat;
}

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
  const meshesByBucket = new Map<
    string,
    { mesh: THREE.InstancedMesh | THREE.Mesh; positions: [number, number, number][] | null }
  >();
  let selectionMesh: THREE.Mesh | null = null;
  let selectionMaterial: THREE.MeshBasicMaterial | null = null;
  let selectionOccludedMesh: THREE.Mesh | null = null;
  let selectionOccludedMaterial: THREE.MeshBasicMaterial | null = null;
  let selectionWireframe: THREE.LineSegments | null = null;
  let selectionWireframeMaterial: THREE.LineBasicMaterial | null = null;
  let spinnerTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const selectionRefinementScheduler = createPreviewRefinementScheduler();
  const previewRefinementScheduler = createPreviewRefinementScheduler();

  function applyVoxelMeshResults(
    results: Array<{
      bucketKey: string;
      positions: Float32Array;
      normals: Float32Array;
      colors: Float32Array;
      indices: Uint32Array;
    }>
  ) {
    if (!voxelGroup) return;
    for (const { mesh } of meshesByBucket.values()) {
      voxelGroup.remove(mesh);
      if (mesh instanceof THREE.Mesh && mesh.customDepthMaterial) {
        mesh.customDepthMaterial.dispose();
        mesh.customDepthMaterial = undefined;
      }
      (mesh.material as THREE.Material).dispose();
      if (mesh instanceof THREE.Mesh && mesh.geometry) mesh.geometry.dispose();
    }
    meshesByBucket.clear();

    const opts = getOptions();
    const envMap = scene?.environment ?? null;

    for (const { bucketKey, positions, normals, colors, indices } of results) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      const parsed = parseBucketKey(bucketKey);
      const materialId: VoxelMaterialId = parsed?.material ?? 'plastic';
      const mat = createVoxelSurfaceMaterial(
        materialId,
        envMap,
        parsed?.color ?? 0xffffff,
        opts.sceneEnvironmentIntensity
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY] = materialId;
      mesh.userData[VOXELLE_GLOW_BLOOM_USERDATA_KEY] = materialId === 'glow';
      mesh.castShadow = opts.enableShadows;
      mesh.receiveShadow =
        opts.enableShadows && opts.renderingMode !== 'marchingCubes' && materialId !== 'glass';
      if (materialId === 'glass') {
        mesh.customDepthMaterial = createGlassShadowDepthMaterial(parsed?.color ?? 0xffffff);
      }
      voxelGroup.add(mesh);
      meshesByBucket.set(bucketKey, { mesh, positions: null });
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
      callbacks.onVoxelMeshesRebuilt?.();
      callbacks.render();
    };
  }

  function requestRebuildVoxelMeshes(v: Map<string, Voxel>) {
    if (!meshWorker || !voxelGroup) return;
    const gen = ++meshRebuildGen;
    callbacks.onLoadingChange(true);
    callbacks.onSpinnerChange(false);
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    spinnerTimeoutId = setTimeout(() => {
      spinnerTimeoutId = null;
      callbacks.onSpinnerChange(true);
    }, SPINNER_DELAY_MS);
    const voxelsArr: [string, Voxel][] = [...v];
    const opts = getOptions();
    const chunkSize = v.size >= CHUNK_THRESHOLD ? 32 : 0;
    meshWorker.postMessage({
      voxels: voxelsArr,
      mode: opts.renderingMode,
      options: { aoStrength: opts.aoStrength, chunkSize },
      gen
    });
  }

  function rebuildSelectionOverlay(sel: Map<string, Voxel>) {
    if (!selectionGroup || !scene) return;
    if (selectionMesh || selectionOccludedMesh || selectionWireframe) {
      if (selectionMesh) selectionGroup.remove(selectionMesh);
      if (selectionOccludedMesh) selectionGroup.remove(selectionOccludedMesh);
      if (selectionWireframe) selectionGroup.remove(selectionWireframe);
      const sharedGeo = selectionMesh?.geometry ?? selectionOccludedMesh?.geometry;
      if (sharedGeo) sharedGeo.dispose();
      selectionMaterial?.dispose();
      selectionOccludedMaterial?.dispose();
      selectionMesh = null;
      selectionOccludedMesh = null;
      selectionMaterial = null;
      selectionOccludedMaterial = null;
      if (selectionWireframe) {
        selectionWireframe.geometry.dispose();
        selectionWireframeMaterial?.dispose();
        selectionWireframe = null;
        selectionWireframeMaterial = null;
      }
    }
    if (sel.size === 0) return;
    const overlayVoxel: Voxel = { color: SELECTION_OVERLAY_HEX, material: 'plastic' };
    const overlayMap = new Map<string, Voxel>();
    for (const key of sel.keys()) overlayMap.set(key, overlayVoxel);
    const geoByBucket = buildGreedyMesh(overlayMap, PREVIEW_MESH_OPTIONS);
    const geo = geoByBucket.get(`${SELECTION_OVERLAY_HEX}|plastic`);
    if (!geo) return;

    selectionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      opacity: 0.35,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
    selectionMesh = new THREE.Mesh(geo, selectionMaterial);
    selectionMesh.raycast = () => {};
    selectionMesh.renderOrder = 1001;
    selectionMesh.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
    selectionGroup.add(selectionMesh);

    const occRgb = new THREE.Color(SELECTION_OVERLAY_HEX);
    occRgb.multiplyScalar(0.48);
    occRgb.lerp(new THREE.Color(0x5577ee), 0.42);
    selectionOccludedMaterial = new THREE.MeshBasicMaterial({
      vertexColors: false,
      color: occRgb,
      opacity: 0.32,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    selectionOccludedMesh = new THREE.Mesh(geo, selectionOccludedMaterial);
    selectionOccludedMesh.raycast = () => {};
    selectionOccludedMesh.renderOrder = 1000;
    selectionOccludedMesh.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
    selectionGroup.add(selectionOccludedMesh);

    const bounds = getSelectionBounds(sel);
    if (bounds) {
      const wfPos = selectionAabbWireframePositions(bounds);
      const wfGeo = new THREE.BufferGeometry();
      wfGeo.setAttribute('position', new THREE.BufferAttribute(wfPos, 3));
      selectionWireframeMaterial = new THREE.LineBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.52,
        depthTest: true,
        depthWrite: false
      });
      selectionWireframe = new THREE.LineSegments(wfGeo, selectionWireframeMaterial);
      selectionWireframe.raycast = () => {};
      selectionWireframe.renderOrder = 1002;
      selectionWireframe.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
      selectionWireframe.userData[VOXELLE_SELECTION_BBOX_WIREFRAME_KEY] = true;
      selectionGroup.add(selectionWireframe);
    }
  }

  function buildGrid(_size: number, v: Map<string, Voxel>) {
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
    voxel: Voxel,
    existingVoxels?: Map<string, Voxel>
  ) {
    if (!previewMesh || !previewMaterial) return;
    if (positions.length === 0) {
      previewMesh.visible = false;
      return;
    }
    const geo = buildPreviewGeometry(positions, voxel, existingVoxels);
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
    for (const { mesh } of meshesByBucket.values()) {
      if (mesh.customDepthMaterial) {
        mesh.customDepthMaterial.dispose();
        mesh.customDepthMaterial = undefined;
      }
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    meshesByBucket.clear();
    if (selectionMesh || selectionOccludedMesh) {
      const sharedGeo = selectionMesh?.geometry ?? selectionOccludedMesh?.geometry;
      if (sharedGeo) sharedGeo.dispose();
      selectionMaterial?.dispose();
      selectionOccludedMaterial?.dispose();
    }
    if (selectionWireframe) {
      selectionWireframe.geometry.dispose();
      selectionWireframeMaterial?.dispose();
      selectionWireframe = null;
      selectionWireframeMaterial = null;
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
    getMeshesByBucket: () => meshesByBucket
  };
}
