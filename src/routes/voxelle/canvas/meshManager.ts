/**
 * Manages voxel mesh rebuild (worker), grid, selection overlay, and preview mesh.
 * No tool or pointer logic; consumes store/refs and updates Three.js objects.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  coordKey,
  parseCoordKey,
  getSelectionBounds,
  selectionAabbWireframePositions,
  type SelectionBounds,
  VOXELLE_SELECTION_BBOX_WIREFRAME_KEY,
  VOXELLE_SELECTION_PIVOT_CHILD_KEY
} from '../coordUtils';
import { SELECTION_OVERLAY_MESH_THRESHOLD } from '../strokePreviewBounds';
import { CUBE_EDGES, EDGE_NEIGHBORS } from '../gridLines';
import { buildGridPositions } from '../gridLines';
import {
  buildGreedyMesh,
  buildPreviewGeometry,
  buildPreviewGeometryFromVoxelMap,
  PREVIEW_MESH_OPTIONS,
  type PreviewOverlapShading
} from '../greedyMesh';
import { alignPreviewMeshToLod, resetPreviewMeshTransform } from '../previewMeshLod';
import { safeDisposeBufferGeometry } from './previewMeshUtils';
import type { SceneSetupRefs } from './sceneSetup';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import { PREVIEW_GRID_RENDER_ORDER } from './renderOrder';
import {
  createVoxelSurfaceMaterial,
  parseBucketKey,
  VOXEL_GLASS_PHYSICAL,
  VOXELLE_GLOW_BLOOM_USERDATA_KEY,
  VOXELLE_MESH_MATERIAL_USERDATA_KEY
} from '../voxelMaterial';
import {
  packSparseChunksForWorker,
  packVoxelsForWorker,
  transferablesFromPackedSparseChunks,
  transferablesFromPackedVoxelInput
} from '../meshWorkerTransfer';
import {
  GLASS_SHADOW_SLAB_ABSORPTION,
  GLASS_SHADOW_SLAB_MIN_TRANSMITTANCE,
  GLASS_SHADOW_VERTEX_AO_POW,
  GLASS_SHADOW_VERTEX_AO_SCALE
} from './glassShadowConstants';
import { perfLog, perfNow, voxellePerfEnabled } from './voxellePerf';
import { consumeDirtyVoxelKeys } from '../store/core';
import type { VoxelMeshWorkerOutput } from '../voxelMeshWorkerLogic';
import {
  clearPendingUndoRedoGesture,
  markEditApplyDuration,
  markEditMeshRequested,
  markEditResultStats,
  markEditRendered,
  markEditTransferStats,
  markEditWorkerRoundTrip,
  markWorkerTimingStats
} from '../store/projectPerf';

export interface MeshManagerOptions {
  enableShadows: boolean;
  renderingMode: 'greedy' | 'marchingCubes' | 'ray';
  aoStrength: number;
  sceneEnvironmentIntensity: number;
}

export interface MeshManagerCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onSpinnerChange: (show: boolean) => void;
  render: () => void;
  /** Called after greedy mesh buckets are rebuilt (worker finished). */
  onVoxelMeshesRebuilt?: (meta: { hasGlowMesh: boolean }) => void;
}

const CHUNK_THRESHOLD = 50000;
const LARGE_REBUILD_DEFER_THRESHOLD = 150000;
const SPINNER_DELAY_MS = 2000;
const INCREMENTAL_REBUILD_MAX_DIRTY_KEYS = 2048;
const INCREMENTAL_GRID_MAX_DIRTY_KEYS = 256;
const SELECTION_OVERLAY_HEX = 0x3399ff;
const GRID_SURFACE_LIFT = 0.01;
const PREVIEW_GRID_HEX = 0x2f3542;
const PREVIEW_GRID_OPACITY = 0.36;

/**
 * Max linear-depth bias in the shadow pass when net transmittance is 1 (non-reversed Z: pushes clip z
 * toward far → lighter PCF shadow). PCF uses the render target's depth texture; too large a value clamps
 * glass to the far plane so it stops occluding (looks like “no shadow”).
 * push = this × netT × vertexAOFactor; clip Δz = 2 × push × w (matches `fragCoordZ = 0.5*z/w+0.5`).
 */
const GLASS_SHADOW_DEPTH_PUSH_MAX = 0.0001;

/** Live refs for glass shadow depth uniforms (same objects as `shader.uniforms` in onBeforeCompile). */
export type VoxelleGlassShadowUniforms = {
  uGlassTransmission: { value: number };
  uGlassThickness: { value: number };
  uGlassAttenuationDistance: { value: number };
  glassShadowDepthPushMax: { value: number };
};

const VOXELLE_GLASS_SHADOW_UNIFORM_USERDATA_KEY = 'voxelleGlassShadowUniforms';

let prevGlassShadowParams: {
  transmission: number;
  thickness: number;
  attenuationDistance: number;
  pushMax: number;
} | null = null;

/**
 * Push `VOXEL_GLASS_PHYSICAL` into each glass mesh's shadow depth material; return whether GPU
 * values changed (caller should invalidate the directional shadow map when `autoUpdate` is false).
 */
export function syncGlassShadowUniformsFromBuckets(
  meshesByBucket: Map<
    string,
    { mesh: THREE.InstancedMesh | THREE.Mesh; positions: [number, number, number][] | null }
  >
): boolean {
  const g = VOXEL_GLASS_PHYSICAL;
  const pm = GLASS_SHADOW_DEPTH_PUSH_MAX;
  const changed =
    prevGlassShadowParams === null ||
    prevGlassShadowParams.transmission !== g.transmission ||
    prevGlassShadowParams.thickness !== g.thickness ||
    prevGlassShadowParams.attenuationDistance !== g.attenuationDistance ||
    prevGlassShadowParams.pushMax !== pm;
  prevGlassShadowParams = {
    transmission: g.transmission,
    thickness: g.thickness,
    attenuationDistance: g.attenuationDistance,
    pushMax: pm
  };

  for (const { mesh } of meshesByBucket.values()) {
    const materialId = mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY];
    if (materialId !== 'glass' && materialId !== 'water') continue;
    const u = (mesh as THREE.Mesh).customDepthMaterial?.userData[
      VOXELLE_GLASS_SHADOW_UNIFORM_USERDATA_KEY
    ] as VoxelleGlassShadowUniforms | undefined;
    if (!u) continue;
    u.uGlassTransmission.value = g.transmission;
    u.uGlassThickness.value = g.thickness;
    u.uGlassAttenuationDistance.value = g.attenuationDistance;
    u.glassShadowDepthPushMax.value = pm;
  }
  return changed;
}

type GlassShadowDepthMaterialOptions = {
  /**
   * Greedy mesh: shadow bias uses `slabThickness` (matches greedy absorption). Marching cubes uses
   * slab=1 only; `glassShadowVertexAOScale` 0 disables vertex factor so MC does not over-bias.
   */
  marchingCubes?: boolean;
};

/**
 * Glass uses depthWrite:false on the visible material; shadow pass uses this instead.
 * Clip-space Z bias only in the depth vertex shader (Metal-safe; no `gl_FragDepth`): `netT` from
 * uniforms and per-vertex `slabThickness` (Beer–Lambert, same as greedy mesh). Do not re-apply the same push in the fragment shader (doubles
 * bias and can clamp packed depth to far → invisible glass shadows).
 */
function createGlassShadowDepthMaterial(
  _baseColor24: number,
  options?: GlassShadowDepthMaterialOptions
): THREE.MeshDepthMaterial {
  const glassShadowVertexAOScaleValue = options?.marchingCubes ? 0 : GLASS_SHADOW_VERTEX_AO_SCALE;
  const depthMat = new THREE.MeshDepthMaterial({
    /** Same as WebGLShadowMap's internal depth material so glass writes comparable depth to the PCF map. */
    depthPacking: THREE.BasicDepthPacking,
    vertexColors: true
  });
  const g = VOXEL_GLASS_PHYSICAL;
  const glassU: VoxelleGlassShadowUniforms = {
    uGlassTransmission: { value: g.transmission },
    uGlassThickness: { value: g.thickness },
    uGlassAttenuationDistance: { value: g.attenuationDistance },
    glassShadowDepthPushMax: { value: GLASS_SHADOW_DEPTH_PUSH_MAX }
  };
  depthMat.userData[VOXELLE_GLASS_SHADOW_UNIFORM_USERDATA_KEY] = glassU;
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.glassShadowVertexAOPow = { value: GLASS_SHADOW_VERTEX_AO_POW };
    shader.uniforms.glassShadowVertexAOScale = { value: glassShadowVertexAOScaleValue };
    shader.uniforms.glassShadowDepthPushMax = glassU.glassShadowDepthPushMax;
    shader.uniforms.uGlassTransmission = glassU.uGlassTransmission;
    shader.uniforms.uGlassThickness = glassU.uGlassThickness;
    shader.uniforms.uGlassAttenuationDistance = glassU.uGlassAttenuationDistance;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <clipping_planes_pars_vertex>',
      '#include <clipping_planes_pars_vertex>\nattribute float slabThickness;\nuniform float glassShadowVertexAOPow;\nuniform float glassShadowVertexAOScale;\nuniform float glassShadowDepthPushMax;\nuniform float uGlassTransmission;\nuniform float uGlassThickness;\nuniform float uGlassAttenuationDistance;\n#include <color_pars_vertex>'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n#include <color_vertex>'
    );

    const absV = GLASS_SHADOW_SLAB_ABSORPTION;
    const minTV = GLASS_SHADOW_SLAB_MIN_TRANSMITTANCE;
    // Bias only in the vertex stage (Metal-safe; no gl_FragDepth). Thicker slab → lower rawAOV → less push → darker shadow.
    const glassVertexDepthBias = `\n\t{\n\t\tfloat attDistV = max(uGlassAttenuationDistance, 1e-4);\n\t\tfloat dSlab = max(slabThickness, 1.0);\n\t\tfloat rawAOV = (dSlab <= 1.0) ? 1.0 : clamp(max(${minTV}, exp(-${absV} * (dSlab - 1.0))), 0.0, 1.0);\n\t\tfloat thickScaleV = mix(1.5, 0.72, rawAOV);\n\t\tfloat vertexAOFactorV = clamp(pow(rawAOV, glassShadowVertexAOPow) * glassShadowVertexAOScale, 0.0, 1.0);\n\t\tfloat netTV = clamp(uGlassTransmission * exp(-(uGlassThickness * thickScaleV) / attDistV), 0.0, 1.0);\n\t\tfloat glassPushV = glassShadowDepthPushMax * netTV * vertexAOFactorV;\n\t\tfloat dz = 2.0 * glassPushV * gl_Position.w;\n#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\tgl_Position.z -= dz;\n#else\n\t\tgl_Position.z += dz;\n#endif\n\t\tfloat wLim = max(abs(gl_Position.w), 1e-6);\n\t\tgl_Position.z = clamp(gl_Position.z, -wLim + 1e-4, wLim - 1e-4);\n\t}\n`;

    const vertexZwCompactBlock =
      '\t#include <logdepthbuf_vertex>\n\t#include <clipping_planes_vertex>\n\tvHighPrecisionZW = gl_Position.zw;';
    const vertexZwCompactReplacement =
      '\t#include <logdepthbuf_vertex>\n\t#include <clipping_planes_vertex>' +
      glassVertexDepthBias +
      '\tvHighPrecisionZW = gl_Position.zw;';

    if (shader.vertexShader.includes(vertexZwCompactBlock)) {
      shader.vertexShader = shader.vertexShader.replace(
        vertexZwCompactBlock,
        vertexZwCompactReplacement
      );
    } else {
      console.warn(
        'voxelle: glass shadow vertex depth patch failed (three.js depth_vert layout changed)'
      );
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
    previewMaterial,
    isWebGPU
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
  let previewGridLines: THREE.LineSegments | null = null;
  let previewGridMaterial: THREE.LineBasicMaterial | null = null;
  let spinnerTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const workerRequestStartByGen = new Map<number, number>();
  const gridEdgeSegments = new Map<string, [number, number, number, number, number, number]>();
  let pendingDirtyGridKeys: Set<string> | null = null;

  function deriveDirtyAndHaloChunkIds(
    keys: ReadonlySet<string>,
    chunkSize: number,
    options: { aoStrength: number; highScaleScene: boolean }
  ): { dirtyChunkIds: string[]; haloChunkIds: string[] } {
    const dirty = new Set<string>();
    const halo = new Set<string>();
    const useReducedHalo =
      options.aoStrength === 0 ||
      (options.highScaleScene && keys.size <= 8 && options.aoStrength <= 1);
    for (const key of keys) {
      const [x, y, z] = parseCoordKey(key);
      const cx = Math.floor(x / chunkSize);
      const cy = Math.floor(y / chunkSize);
      const cz = Math.floor(z / chunkSize);
      dirty.add(`${cx},${cy},${cz}`);
      if (useReducedHalo) {
        const neighbors: Array<[number, number, number]> = [
          [cx, cy, cz],
          [cx + 1, cy, cz],
          [cx - 1, cy, cz],
          [cx, cy + 1, cz],
          [cx, cy - 1, cz],
          [cx, cy, cz + 1],
          [cx, cy, cz - 1]
        ];
        for (const [nx, ny, nz] of neighbors) {
          halo.add(`${nx},${ny},${nz}`);
        }
      } else {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              halo.add(`${cx + dx},${cy + dy},${cz + dz}`);
            }
          }
        }
      }
    }
    for (const id of dirty) halo.delete(id);
    return { dirtyChunkIds: [...dirty], haloChunkIds: [...halo] };
  }

  function buildVoxelMeshEntry(
    bucketKey: string,
    positions: Float32Array,
    normals: Float32Array,
    colors: Float32Array,
    slabThickness: Float32Array,
    indices: Uint32Array
  ): { mesh: THREE.Mesh; materialId: VoxelMaterialId } {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('slabThickness', new THREE.BufferAttribute(slabThickness, 1));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const parsedForNormals = parseBucketKey(bucketKey);
    const transmissiveGreedy =
      parsedForNormals?.material === 'water' || parsedForNormals?.material === 'glass';
    if (!transmissiveGreedy) {
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();

    const opts = getOptions();
    const envMap = scene?.environment ?? null;
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
    if (materialId === 'glass') mesh.renderOrder = 1;
    else if (materialId === 'water') mesh.renderOrder = 2;
    mesh.castShadow = opts.enableShadows && materialId !== 'glow';
    mesh.receiveShadow =
      opts.enableShadows &&
      opts.renderingMode !== 'ray' &&
      materialId !== 'glass' &&
      materialId !== 'water';
    if (materialId === 'glass' || materialId === 'water') {
      mesh.customDepthMaterial = createGlassShadowDepthMaterial(parsed?.color ?? 0xffffff, {
        marchingCubes: opts.renderingMode === 'marchingCubes'
      });
    }
    return { mesh, materialId };
  }

  function disposeMeshEntry(mesh: THREE.InstancedMesh | THREE.Mesh): void {
    if (mesh instanceof THREE.Mesh && mesh.customDepthMaterial) {
      mesh.customDepthMaterial.dispose();
      mesh.customDepthMaterial = undefined;
    }
    (mesh.material as THREE.Material).dispose();
    if (mesh instanceof THREE.Mesh && mesh.geometry) {
      safeDisposeBufferGeometry(mesh.geometry, isWebGPU);
    }
  }

  function disposeAllVoxelMeshes() {
    if (!voxelGroup) return;
    for (const { mesh } of meshesByBucket.values()) {
      voxelGroup.remove(mesh);
      disposeMeshEntry(mesh);
    }
    meshesByBucket.clear();
  }

  function applyVoxelMeshResults(
    results: Array<{
      meshKey?: string;
      bucketKey: string;
      positions: Float32Array;
      normals: Float32Array;
      colors: Float32Array;
      slabThickness: Float32Array;
      indices: Uint32Array;
    }>,
    changedBuckets?: readonly string[]
  ) {
    if (!voxelGroup) return;
    const byMesh = new Map(results.map((r) => [r.meshKey ?? r.bucketKey, r]));
    if (!changedBuckets || changedBuckets.length === 0) {
      disposeAllVoxelMeshes();
      for (const [meshKey, data] of byMesh) {
        const { mesh } = buildVoxelMeshEntry(
          data.bucketKey,
          data.positions,
          data.normals,
          data.colors,
          data.slabThickness,
          data.indices
        );
        voxelGroup.add(mesh);
        meshesByBucket.set(meshKey, { mesh, positions: null });
      }
    } else {
      const dirty = new Set(changedBuckets);
      for (const meshKey of dirty) {
        const prev = meshesByBucket.get(meshKey);
        if (prev) {
          voxelGroup.remove(prev.mesh);
          disposeMeshEntry(prev.mesh);
          meshesByBucket.delete(meshKey);
        }
        const data = byMesh.get(meshKey);
        if (!data) continue;
        const { mesh } = buildVoxelMeshEntry(
          data.bucketKey,
          data.positions,
          data.normals,
          data.colors,
          data.slabThickness,
          data.indices
        );
        voxelGroup.add(mesh);
        meshesByBucket.set(meshKey, { mesh, positions: null });
      }
    }
    let hasGlowMesh = false;
    for (const { mesh } of meshesByBucket.values()) {
      const matId = mesh.userData[VOXELLE_MESH_MATERIAL_USERDATA_KEY];
      if (matId === 'glow') {
        hasGlowMesh = true;
        break;
      }
    }
    callbacks.onVoxelMeshesRebuilt?.({ hasGlowMesh });
  }

  function setupWorker() {
    if (typeof window === 'undefined') return;
    meshWorker = new Worker(new URL('../voxelMeshWorker.ts', import.meta.url), {
      type: 'module'
    });
    meshWorker.onmessage = (e: MessageEvent<VoxelMeshWorkerOutput>) => {
      if (e.data.gen !== meshRebuildGen) return;
      const workerRequestAt = workerRequestStartByGen.get(meshRebuildGen);
      if (workerRequestAt !== undefined) {
        markEditWorkerRoundTrip(perfNow() - workerRequestAt);
        workerRequestStartByGen.delete(meshRebuildGen);
      }
      markWorkerTimingStats({
        parseInputMs: e.data.workerTimings?.parseInputMs ?? null,
        meshComputeMs: e.data.workerTimings?.meshComputeMs ?? null
      });
      const t0 = voxellePerfEnabled() ? perfNow() : 0;
      const applyStart = perfNow();
      callbacks.onLoadingChange(false);
      callbacks.onSpinnerChange(false);
      if (spinnerTimeoutId) {
        clearTimeout(spinnerTimeoutId);
        spinnerTimeoutId = null;
      }
      let resultVertexCount = 0;
      let resultIndexCount = 0;
      for (const r of e.data.results) {
        resultVertexCount += Math.floor(r.positions.length / 3);
        resultIndexCount += r.indices.length;
      }
      markEditResultStats({
        changedBucketCount: e.data.changedBuckets ? e.data.changedBuckets.length : null,
        resultVertexCount,
        resultIndexCount
      });
      applyVoxelMeshResults(e.data.results, e.data.changedBuckets);
      if (voxellePerfEnabled()) perfLog('meshWorker.applyResults', perfNow() - t0);
      markEditApplyDuration(perfNow() - applyStart);
      callbacks.render();
      markEditRendered(perfNow());
    };
  }

  function ensurePreviewGridOverlay() {
    if (previewGridLines || !scene) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    previewGridMaterial = new THREE.LineBasicMaterial({
      color: PREVIEW_GRID_HEX,
      transparent: true,
      opacity: PREVIEW_GRID_OPACITY,
      depthTest: false,
      depthWrite: false
    });
    previewGridLines = new THREE.LineSegments(geom, previewGridMaterial);
    previewGridLines.visible = false;
    previewGridLines.renderOrder = PREVIEW_GRID_RENDER_ORDER;
    previewGridLines.raycast = () => {};
    scene.add(previewGridLines);
  }

  function updatePreviewGridFromPositions(positions: [number, number, number][]) {
    ensurePreviewGridOverlay();
    if (!previewGridLines) return;
    if (positions.length === 0) {
      previewGridLines.visible = false;
      previewGridLines.position.set(0, 0, 0);
      return;
    }
    const previewVoxels = new Map<string, Voxel>();
    const markerVoxel: Voxel = { color: 0xffffff, material: 'plastic' };
    for (const [x, y, z] of positions) previewVoxels.set(coordKey(x, y, z), markerVoxel);
    const gridPositions = buildGridPositions(previewVoxels, GRID_SURFACE_LIFT);
    if (gridPositions.length === 0) {
      previewGridLines.visible = false;
      previewGridLines.position.set(0, 0, 0);
      return;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const prevGridGeo = previewGridLines.geometry;
    previewGridLines.geometry = geom;
    safeDisposeBufferGeometry(prevGridGeo, isWebGPU);
    previewGridLines.position.set(0, 0, 0);
    previewGridLines.visible = true;
  }

  function updatePreviewGridFromBounds(bounds: SelectionBounds) {
    ensurePreviewGridOverlay();
    if (!previewGridLines) return;
    const wx = bounds.maxX - bounds.minX + 1;
    const wy = bounds.maxY - bounds.minY + 1;
    const wz = bounds.maxZ - bounds.minZ + 1;
    if (wx <= 0 || wy <= 0 || wz <= 0) {
      previewGridLines.visible = false;
      previewGridLines.position.set(0, 0, 0);
      return;
    }
    const boxGeo = new THREE.BoxGeometry(wx, wy, wz);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    safeDisposeBufferGeometry(boxGeo, isWebGPU);
    const prevEdgesParent = previewGridLines.geometry;
    previewGridLines.geometry = edgesGeo;
    safeDisposeBufferGeometry(prevEdgesParent, isWebGPU);
    previewGridLines.position.set(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2
    );
    previewGridLines.visible = true;
  }

  function requestRebuildVoxelMeshes(v: Map<string, Voxel>) {
    if (!meshWorker || !voxelGroup) {
      clearPendingUndoRedoGesture();
      return;
    }
    const gen = ++meshRebuildGen;
    workerRequestStartByGen.clear();
    const opts = getOptions();
    const dirtyKeys = consumeDirtyVoxelKeys();
    pendingDirtyGridKeys = dirtyKeys.size > 0 ? dirtyKeys : null;
    if (opts.renderingMode === 'ray') {
      if (spinnerTimeoutId) {
        clearTimeout(spinnerTimeoutId);
        spinnerTimeoutId = null;
      }
      callbacks.onLoadingChange(false);
      callbacks.onSpinnerChange(false);
      disposeAllVoxelMeshes();
      callbacks.onVoxelMeshesRebuilt?.({ hasGlowMesh: false });
      callbacks.render();
      markEditRendered(perfNow());
      return;
    }
    callbacks.onLoadingChange(true);
    callbacks.onSpinnerChange(false);
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    spinnerTimeoutId = setTimeout(() => {
      spinnerTimeoutId = null;
      callbacks.onSpinnerChange(true);
    }, SPINNER_DELAY_MS);
    const chunkSize = v.size >= CHUNK_THRESHOLD ? 32 : 0;
    const useIncrementalDirty =
      chunkSize >= 16 &&
      dirtyKeys.size > 0 &&
      dirtyKeys.size <= INCREMENTAL_REBUILD_MAX_DIRTY_KEYS;
    const postToWorker = () => {
      if (!meshWorker || gen !== meshRebuildGen) return;
      const tPack = voxellePerfEnabled() ? perfNow() : 0;
      const requestStart = perfNow();
      markEditMeshRequested(requestStart);
      workerRequestStartByGen.set(gen, requestStart);
      if (useIncrementalDirty) {
        const { dirtyChunkIds, haloChunkIds } = deriveDirtyAndHaloChunkIds(dirtyKeys, chunkSize, {
          aoStrength: opts.aoStrength,
          highScaleScene: v.size >= 500000
        });
        markEditTransferStats({
          dirtyChunkCount: dirtyChunkIds.length,
          haloChunkCount: haloChunkIds.length
        });
        const sparseChunks = packSparseChunksForWorker(v, dirtyChunkIds, haloChunkIds, chunkSize);
        if (sparseChunks.totalTransmissiveCount >= 256) {
          const packedVoxels = packVoxelsForWorker(v);
          if (voxellePerfEnabled()) perfLog('meshWorker.packVoxels', perfNow() - tPack);
          meshWorker.postMessage(
            {
              voxels: packedVoxels,
              mode: opts.renderingMode,
              options: { aoStrength: opts.aoStrength, chunkSize },
              gen
            },
            { transfer: transferablesFromPackedVoxelInput(packedVoxels) }
          );
          return;
        }
        if (voxellePerfEnabled()) perfLog('meshWorker.packVoxels', perfNow() - tPack);
        meshWorker.postMessage(
          {
            voxels: sparseChunks,
            mode: opts.renderingMode,
            dirtyChunkIds,
            options: { aoStrength: opts.aoStrength, chunkSize },
            gen
          },
          { transfer: transferablesFromPackedSparseChunks(sparseChunks) }
        );
        return;
      }
      markEditTransferStats({ dirtyChunkCount: null, haloChunkCount: null });
      const packedVoxels = packVoxelsForWorker(v);
      if (voxellePerfEnabled()) perfLog('meshWorker.packVoxels', perfNow() - tPack);
      meshWorker.postMessage(
        {
          voxels: packedVoxels,
          mode: opts.renderingMode,
          options: { aoStrength: opts.aoStrength, chunkSize },
          gen
        },
        { transfer: transferablesFromPackedVoxelInput(packedVoxels) }
      );
    };
    if (
      !useIncrementalDirty &&
      v.size >= LARGE_REBUILD_DEFER_THRESHOLD &&
      typeof requestAnimationFrame === 'function'
    ) {
      requestAnimationFrame(() => postToWorker());
      return;
    }
    postToWorker();
  }

  function rebuildSelectionOverlay(sel: Map<string, Voxel>) {
    if (!selectionGroup || !scene) return;
    if (selectionMesh || selectionOccludedMesh || selectionWireframe) {
      if (selectionMesh) selectionGroup.remove(selectionMesh);
      if (selectionOccludedMesh) selectionGroup.remove(selectionOccludedMesh);
      if (selectionWireframe) selectionGroup.remove(selectionWireframe);
      const overlayGeos = new Set<THREE.BufferGeometry>();
      if (selectionMesh?.geometry) overlayGeos.add(selectionMesh.geometry);
      if (selectionOccludedMesh?.geometry) overlayGeos.add(selectionOccludedMesh.geometry);
      for (const g of overlayGeos) {
        safeDisposeBufferGeometry(g, isWebGPU);
      }
      selectionMaterial?.dispose();
      selectionOccludedMaterial?.dispose();
      selectionMesh = null;
      selectionOccludedMesh = null;
      selectionMaterial = null;
      selectionOccludedMaterial = null;
      if (selectionWireframe) {
        safeDisposeBufferGeometry(selectionWireframe.geometry, isWebGPU);
        selectionWireframeMaterial?.dispose();
        selectionWireframe = null;
        selectionWireframeMaterial = null;
      }
    }
    if (sel.size === 0) return;
    const bounds = getSelectionBounds(sel);
    if (!bounds) return;

    const useBboxOnly = sel.size >= SELECTION_OVERLAY_MESH_THRESHOLD;

    if (!useBboxOnly) {
      const overlayVoxel: Voxel = { color: SELECTION_OVERLAY_HEX, material: 'plastic' };
      const overlayMap = new Map<string, Voxel>();
      for (const key of sel.keys()) overlayMap.set(key, overlayVoxel);
      const geoByBucket = buildGreedyMesh(overlayMap, PREVIEW_MESH_OPTIONS);
      const geo = geoByBucket.get(`${SELECTION_OVERLAY_HEX}|plastic`);
      if (!geo) {
        /* fall through to wireframe only */
      } else {
        selectionMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          opacity: 0.35,
          transparent: true,
          depthTest: false,
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
      }
    } else {
      const boxGeoPrimary = selectionBoundsToBoxGeometry(bounds);
      const boxGeoOccluded = boxGeoPrimary.clone();
      selectionMaterial = new THREE.MeshBasicMaterial({
        color: SELECTION_OVERLAY_HEX,
        vertexColors: false,
        opacity: 0.35,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      selectionMesh = new THREE.Mesh(boxGeoPrimary, selectionMaterial);
      selectionMesh.raycast = () => {};
      selectionMesh.renderOrder = 1001;
      selectionMesh.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
      positionMeshAtSelectionBounds(selectionMesh, bounds);
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
      selectionOccludedMesh = new THREE.Mesh(boxGeoOccluded, selectionOccludedMaterial);
      selectionOccludedMesh.raycast = () => {};
      selectionOccludedMesh.renderOrder = 1000;
      selectionOccludedMesh.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
      positionMeshAtSelectionBounds(selectionOccludedMesh, bounds);
      selectionGroup.add(selectionOccludedMesh);
    }

    const wfPos = selectionAabbWireframePositions(bounds);
    const wfGeo = new THREE.BufferGeometry();
    wfGeo.setAttribute('position', new THREE.BufferAttribute(wfPos, 3));
    selectionWireframeMaterial = new THREE.LineBasicMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.52,
      depthTest: false,
      depthWrite: false
    });
    selectionWireframe = new THREE.LineSegments(wfGeo, selectionWireframeMaterial);
    selectionWireframe.raycast = () => {};
    selectionWireframe.renderOrder = 1002;
    selectionWireframe.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY] = true;
    selectionWireframe.userData[VOXELLE_SELECTION_BBOX_WIREFRAME_KEY] = true;
    selectionGroup.add(selectionWireframe);
  }

  function buildGrid(_size: number, v: Map<string, Voxel>) {
    if (!gridGroup || !gridLineMaterial || !scene) return;
    const dirty = pendingDirtyGridKeys;
    const canPatchIncremental =
      dirty &&
      dirty.size > 0 &&
      dirty.size <= INCREMENTAL_GRID_MAX_DIRTY_KEYS &&
      gridEdgeSegments.size > 0;
    if (!canPatchIncremental) {
      gridEdgeSegments.clear();
      for (const key of v.keys()) {
        const [x, y, z] = parseCoordKey(key);
        const has = (nx: number, ny: number, nz: number) => v.has(coordKey(nx, ny, nz));
        for (let edgeIdx = 0; edgeIdx < CUBE_EDGES.length; edgeIdx++) {
          const [[dx1, dy1, dz1], [dx2, dy2, dz2]] = EDGE_NEIGHBORS[edgeIdx]!;
          const n1 = has(x + dx1, y + dy1, z + dz1);
          const n2 = has(x + dx2, y + dy2, z + dz2);
          if (n1 && n2) continue;
          const edge = CUBE_EDGES[edgeIdx]!;
          let ox = 0;
          let oy = 0;
          let oz = 0;
          if (GRID_SURFACE_LIFT > 0) {
            if (!n1) {
              ox += dx1;
              oy += dy1;
              oz += dz1;
            }
            if (!n2) {
              ox += dx2;
              oy += dy2;
              oz += dz2;
            }
            const len = Math.hypot(ox, oy, oz);
            if (len > 0) {
              const k = GRID_SURFACE_LIFT / len;
              ox *= k;
              oy *= k;
              oz *= k;
            }
          }
          gridEdgeSegments.set(`${key}|${edgeIdx}`, [
            x + edge[0] + ox,
            y + edge[1] + oy,
            z + edge[2] + oz,
            x + edge[3] + ox,
            y + edge[4] + oy,
            z + edge[5] + oz
          ]);
        }
      }
    } else {
      const affected = new Set<string>();
      for (const key of dirty) {
        const [x, y, z] = parseCoordKey(key);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              affected.add(coordKey(x + dx, y + dy, z + dz));
            }
          }
        }
      }
      for (const key of affected) {
        const [x, y, z] = parseCoordKey(key);
        for (let edgeIdx = 0; edgeIdx < CUBE_EDGES.length; edgeIdx++) {
          gridEdgeSegments.delete(`${key}|${edgeIdx}`);
        }
        if (!v.has(key)) continue;
        const has = (nx: number, ny: number, nz: number) => v.has(coordKey(nx, ny, nz));
        for (let edgeIdx = 0; edgeIdx < CUBE_EDGES.length; edgeIdx++) {
          const [[dx1, dy1, dz1], [dx2, dy2, dz2]] = EDGE_NEIGHBORS[edgeIdx]!;
          const n1 = has(x + dx1, y + dy1, z + dz1);
          const n2 = has(x + dx2, y + dy2, z + dz2);
          if (n1 && n2) continue;
          const edge = CUBE_EDGES[edgeIdx]!;
          let ox = 0;
          let oy = 0;
          let oz = 0;
          if (GRID_SURFACE_LIFT > 0) {
            if (!n1) {
              ox += dx1;
              oy += dy1;
              oz += dz1;
            }
            if (!n2) {
              ox += dx2;
              oy += dy2;
              oz += dz2;
            }
            const len = Math.hypot(ox, oy, oz);
            if (len > 0) {
              const k = GRID_SURFACE_LIFT / len;
              ox *= k;
              oy *= k;
              oz *= k;
            }
          }
          gridEdgeSegments.set(`${key}|${edgeIdx}`, [
            x + edge[0] + ox,
            y + edge[1] + oy,
            z + edge[2] + oz,
            x + edge[3] + ox,
            y + edge[4] + oy,
            z + edge[5] + oz
          ]);
        }
      }
    }
    while (gridGroup.children.length > 0) {
      const child = gridGroup.children[0];
      gridGroup.remove(child);
      const geom = (child as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) safeDisposeBufferGeometry(geom, isWebGPU);
    }
    const positions: number[] = [];
    for (const segment of gridEdgeSegments.values()) positions.push(...segment);
    if (positions.length === 0) {
      pendingDirtyGridKeys = null;
      return;
    }
    if (isWebGPU) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geom, gridLineMaterial as THREE.LineBasicMaterial);
      lines.raycast = () => {};
      gridGroup.add(lines);
    } else {
      const geom = new LineSegmentsGeometry();
      geom.setPositions(positions);
      const lines = new LineSegments2(geom, gridLineMaterial as InstanceType<typeof LineMaterial>);
      lines.raycast = () => {};
      gridGroup.add(lines);
    }
    pendingDirtyGridKeys = null;
  }

  function selectionBoundsToBoxGeometry(b: SelectionBounds): THREE.BoxGeometry {
    const wx = b.maxX - b.minX + 1;
    const wy = b.maxY - b.minY + 1;
    const wz = b.maxZ - b.minZ + 1;
    return new THREE.BoxGeometry(wx, wy, wz);
  }

  /** Voxel index k → world cube [k−0.5, k+0.5] (same as greedy mesh). */
  function positionMeshAtSelectionBounds(mesh: THREE.Mesh, b: SelectionBounds) {
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  }

  /** Translucent single box; same voxel-space convention as selection AABB wireframe. */
  function updatePreviewBoundingBox(bounds: SelectionBounds, voxel: Voxel) {
    if (!previewMesh || !previewMaterial) return;
    const wx = bounds.maxX - bounds.minX + 1;
    const wy = bounds.maxY - bounds.minY + 1;
    const wz = bounds.maxZ - bounds.minZ + 1;
    if (wx <= 0 || wy <= 0 || wz <= 0) {
      previewMesh.visible = false;
      if (previewGridLines) previewGridLines.visible = false;
      return;
    }
    previewMesh.visible = false;
    resetPreviewMeshTransform(previewMesh);
    previewMaterial.vertexColors = false;
    previewMaterial.needsUpdate = true;
    previewMaterial.color.setHex(voxel.color & 0xffffff);
    const prevPreviewGeo = previewMesh.geometry;
    const nextBoxGeo = new THREE.BoxGeometry(wx, wy, wz);
    previewMesh.geometry = nextBoxGeo;
    safeDisposeBufferGeometry(prevPreviewGeo, isWebGPU);
    positionMeshAtSelectionBounds(previewMesh, bounds);
    previewMesh.visible = true;
    updatePreviewGridFromBounds(bounds);
  }

  function updatePreviewMesh(
    positions: [number, number, number][],
    voxel: Voxel,
    existingVoxels?: Map<string, Voxel>,
    overlapShading: PreviewOverlapShading = 'invert'
  ) {
    if (!previewMesh || !previewMaterial) return;
    if (positions.length === 0) {
      previewMesh.visible = false;
      resetPreviewMeshTransform(previewMesh);
      previewMaterial.vertexColors = true;
      previewMaterial.color.setHex(0xffffff);
      if (previewGridLines) previewGridLines.visible = false;
      return;
    }
    previewMesh.visible = false;
    resetPreviewMeshTransform(previewMesh);
    previewMaterial.vertexColors = true;
    previewMaterial.needsUpdate = true;
    previewMaterial.color.setHex(0xffffff);
    const geo = buildPreviewGeometry(positions, voxel, existingVoxels, overlapShading);
    if (geo) {
      const prevPreviewGeo = previewMesh.geometry;
      previewMesh.geometry = geo;
      safeDisposeBufferGeometry(prevPreviewGeo, isWebGPU);
      previewMesh.visible = true;
      updatePreviewGridFromPositions(positions);
    } else {
      previewMesh.visible = false;
      if (previewGridLines) previewGridLines.visible = false;
    }
  }

  /** Coarse voxel map preview (scaled/positioned); grid uses full `gridBounds` AABB. */
  function updatePreviewMeshLod(
    coarseMap: Map<string, Voxel>,
    existingVoxels: Map<string, Voxel> | undefined,
    overlapShading: PreviewOverlapShading,
    stride: number,
    min: [number, number, number],
    gridBounds: SelectionBounds
  ) {
    if (!previewMesh || !previewMaterial) return;
    const geo = buildPreviewGeometryFromVoxelMap(
      coarseMap,
      existingVoxels ?? new Map(),
      overlapShading
    );
    if (!geo) {
      previewMesh.visible = false;
      if (previewGridLines) previewGridLines.visible = false;
      return;
    }
    previewMesh.visible = false;
    previewMaterial.vertexColors = true;
    previewMaterial.needsUpdate = true;
    previewMaterial.color.setHex(0xffffff);
    const prevPreviewGeo = previewMesh.geometry;
    previewMesh.geometry = geo;
    safeDisposeBufferGeometry(prevPreviewGeo, isWebGPU);
    previewMesh.visible = true;
    alignPreviewMeshToLod(previewMesh, stride, min);
    updatePreviewGridFromBounds(gridBounds);
  }

  function destroy() {
    prevGlassShadowParams = null;
    meshWorker?.terminate();
    meshWorker = null;
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    for (const { mesh } of meshesByBucket.values()) {
      disposeMeshEntry(mesh);
    }
    meshesByBucket.clear();
    gridEdgeSegments.clear();
    if (selectionMesh || selectionOccludedMesh) {
      const overlayGeos = new Set<THREE.BufferGeometry>();
      if (selectionMesh?.geometry) overlayGeos.add(selectionMesh.geometry);
      if (selectionOccludedMesh?.geometry) overlayGeos.add(selectionOccludedMesh.geometry);
      for (const g of overlayGeos) {
        safeDisposeBufferGeometry(g, isWebGPU);
      }
      selectionMaterial?.dispose();
      selectionOccludedMaterial?.dispose();
    }
    if (selectionWireframe) {
      safeDisposeBufferGeometry(selectionWireframe.geometry, isWebGPU);
      selectionWireframeMaterial?.dispose();
      selectionWireframe = null;
      selectionWireframeMaterial = null;
    }
    if (previewGridLines) {
      scene.remove(previewGridLines);
      safeDisposeBufferGeometry(previewGridLines.geometry, isWebGPU);
      previewGridMaterial?.dispose();
      previewGridLines = null;
      previewGridMaterial = null;
    }
    gridGroup?.traverse((obj) => {
      const geom = (obj as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) safeDisposeBufferGeometry(geom, isWebGPU);
    });
  }

  setupWorker();

  return {
    requestRebuildVoxelMeshes,
    rebuildSelectionOverlay,
    buildGrid,
    updatePreviewMesh,
    updatePreviewMeshLod,
    updatePreviewBoundingBox,
    destroy,
    getMeshesByBucket: () => meshesByBucket
  };
}
