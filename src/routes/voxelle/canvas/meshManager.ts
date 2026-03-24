/**
 * Manages voxel mesh rebuild (worker), grid, selection overlay, and preview mesh.
 * No tool or pointer logic; consumes store/refs and updates Three.js objects.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  getSelectionBounds,
  selectionAabbWireframePositions,
  type SelectionBounds,
  VOXELLE_SELECTION_BBOX_WIREFRAME_KEY,
  VOXELLE_SELECTION_PIVOT_CHILD_KEY
} from '../coordUtils';
import { SELECTION_OVERLAY_MESH_THRESHOLD } from '../strokePreviewBounds';
import { buildGridPositions } from '../gridLines';
import { buildGreedyMesh, buildPreviewGeometry, PREVIEW_MESH_OPTIONS } from '../greedyMesh';
import type { SceneSetupRefs } from './sceneSetup';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import {
  createVoxelSurfaceMaterial,
  parseBucketKey,
  VOXEL_GLASS_PHYSICAL,
  VOXELLE_GLOW_BLOOM_USERDATA_KEY,
  VOXELLE_MESH_MATERIAL_USERDATA_KEY
} from '../voxelMaterial';
import {
  GLASS_SHADOW_SLAB_ABSORPTION,
  GLASS_SHADOW_SLAB_MIN_TRANSMITTANCE,
  GLASS_SHADOW_VERTEX_AO_POW,
  GLASS_SHADOW_VERTEX_AO_SCALE
} from './glassShadowConstants';

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
  onVoxelMeshesRebuilt?: () => void;
}

const CHUNK_THRESHOLD = 50000;
const LARGE_REBUILD_DEFER_THRESHOLD = 150000;
const SPINNER_DELAY_MS = 2000;
const SELECTION_OVERLAY_HEX = 0x3399ff;
const GRID_SURFACE_LIFT = 0.01;

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
  const glassShadowVertexAOScaleValue = options?.marchingCubes
    ? 0
    : GLASS_SHADOW_VERTEX_AO_SCALE;
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
    const glassVertexDepthBias =
      `\n\t{\n\t\tfloat attDistV = max(uGlassAttenuationDistance, 1e-4);\n\t\tfloat dSlab = max(slabThickness, 1.0);\n\t\tfloat rawAOV = (dSlab <= 1.0) ? 1.0 : clamp(max(${minTV}, exp(-${absV} * (dSlab - 1.0))), 0.0, 1.0);\n\t\tfloat thickScaleV = mix(1.5, 0.72, rawAOV);\n\t\tfloat vertexAOFactorV = clamp(pow(rawAOV, glassShadowVertexAOPow) * glassShadowVertexAOScale, 0.0, 1.0);\n\t\tfloat netTV = clamp(uGlassTransmission * exp(-(uGlassThickness * thickScaleV) / attDistV), 0.0, 1.0);\n\t\tfloat glassPushV = glassShadowDepthPushMax * netTV * vertexAOFactorV;\n\t\tfloat dz = 2.0 * glassPushV * gl_Position.w;\n#ifdef USE_REVERSED_DEPTH_BUFFER\n\t\tgl_Position.z -= dz;\n#else\n\t\tgl_Position.z += dz;\n#endif\n\t\tfloat wLim = max(abs(gl_Position.w), 1e-6);\n\t\tgl_Position.z = clamp(gl_Position.z, -wLim + 1e-4, wLim - 1e-4);\n\t}\n`;

    const vertexZwCompactBlock =
      '\t#include <logdepthbuf_vertex>\n\t#include <clipping_planes_vertex>\n\tvHighPrecisionZW = gl_Position.zw;';
    const vertexZwCompactReplacement =
      '\t#include <logdepthbuf_vertex>\n\t#include <clipping_planes_vertex>' +
      glassVertexDepthBias +
      '\tvHighPrecisionZW = gl_Position.zw;';

    if (shader.vertexShader.includes(vertexZwCompactBlock)) {
      shader.vertexShader = shader.vertexShader.replace(vertexZwCompactBlock, vertexZwCompactReplacement);
    } else {
      console.warn('voxelle: glass shadow vertex depth patch failed (three.js depth_vert layout changed)');
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
  let spinnerTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function disposeAllVoxelMeshes() {
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
  }

  function applyVoxelMeshResults(
    results: Array<{
      bucketKey: string;
      positions: Float32Array;
      normals: Float32Array;
      colors: Float32Array;
      slabThickness: Float32Array;
      indices: Uint32Array;
    }>
  ) {
    if (!voxelGroup) return;
    disposeAllVoxelMeshes();

    const opts = getOptions();
    const envMap = scene?.environment ?? null;

    for (const { bucketKey, positions, normals, colors, slabThickness, indices } of results) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('slabThickness', new THREE.BufferAttribute(slabThickness, 1));
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
        opts.enableShadows &&
        opts.renderingMode !== 'ray' &&
        materialId !== 'glass' &&
        materialId !== 'water';
      if (materialId === 'glass' || materialId === 'water') {
        /**
         * Use the depth-material glass shadow path on both backends.
         * WebGPU transmitted shadows can render through opaque occluders.
         */
        mesh.customDepthMaterial = createGlassShadowDepthMaterial(parsed?.color ?? 0xffffff, {
          marchingCubes: opts.renderingMode === 'marchingCubes'
        });
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
    const opts = getOptions();
    if (opts.renderingMode === 'ray') {
      if (spinnerTimeoutId) {
        clearTimeout(spinnerTimeoutId);
        spinnerTimeoutId = null;
      }
      callbacks.onLoadingChange(false);
      callbacks.onSpinnerChange(false);
      disposeAllVoxelMeshes();
      callbacks.onVoxelMeshesRebuilt?.();
      callbacks.render();
      return;
    }
    callbacks.onLoadingChange(true);
    callbacks.onSpinnerChange(false);
    if (spinnerTimeoutId) clearTimeout(spinnerTimeoutId);
    spinnerTimeoutId = setTimeout(() => {
      spinnerTimeoutId = null;
      callbacks.onSpinnerChange(true);
    }, SPINNER_DELAY_MS);
    const postToWorker = () => {
      if (!meshWorker || gen !== meshRebuildGen) return;
      const voxelsArr: [string, Voxel][] = [...v];
      const chunkSize = v.size >= CHUNK_THRESHOLD ? 32 : 0;
      meshWorker.postMessage({
        voxels: voxelsArr,
        mode: opts.renderingMode,
        options: { aoStrength: opts.aoStrength, chunkSize },
        gen
      });
    };
    if (v.size >= LARGE_REBUILD_DEFER_THRESHOLD && typeof requestAnimationFrame === 'function') {
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
      }
    } else {
      const boxGeo = selectionBoundsToBoxGeometry(bounds);
      selectionMaterial = new THREE.MeshBasicMaterial({
        color: SELECTION_OVERLAY_HEX,
        vertexColors: false,
        opacity: 0.35,
        transparent: true,
        depthTest: true,
        depthWrite: false
      });
      selectionMesh = new THREE.Mesh(boxGeo, selectionMaterial);
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
      selectionOccludedMesh = new THREE.Mesh(boxGeo, selectionOccludedMaterial);
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

  function buildGrid(_size: number, v: Map<string, Voxel>) {
    if (!gridGroup || !gridLineMaterial || !scene) return;
    while (gridGroup.children.length > 0) {
      const child = gridGroup.children[0];
      gridGroup.remove(child);
      const geom = (child as { geometry?: THREE.BufferGeometry }).geometry;
      if (geom) geom.dispose();
    }
    const positions = buildGridPositions(v, GRID_SURFACE_LIFT);
    if (positions.length === 0) return;
    if (isWebGPU) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(
        geom,
        gridLineMaterial as THREE.LineBasicMaterial
      );
      lines.raycast = () => {};
      gridGroup.add(lines);
    } else {
      const geom = new LineSegmentsGeometry();
      geom.setPositions(positions);
      const lines = new LineSegments2(geom, gridLineMaterial as InstanceType<typeof LineMaterial>);
      lines.raycast = () => {};
      gridGroup.add(lines);
    }
  }

  function selectionBoundsToBoxGeometry(b: SelectionBounds): THREE.BoxGeometry {
    const wx = b.maxX - b.minX + 1;
    const wy = b.maxY - b.minY + 1;
    const wz = b.maxZ - b.minZ + 1;
    return new THREE.BoxGeometry(wx, wy, wz);
  }

  /** Voxel index k → world cube [k−0.5, k+0.5] (same as greedy mesh). */
  function positionMeshAtSelectionBounds(mesh: THREE.Mesh, b: SelectionBounds) {
    mesh.position.set(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      (b.minZ + b.maxZ) / 2
    );
  }

  /** Translucent single box; same voxel-space convention as selection AABB wireframe. */
  function updatePreviewBoundingBox(bounds: SelectionBounds, voxel: Voxel) {
    if (!previewMesh || !previewMaterial) return;
    const wx = bounds.maxX - bounds.minX + 1;
    const wy = bounds.maxY - bounds.minY + 1;
    const wz = bounds.maxZ - bounds.minZ + 1;
    if (wx <= 0 || wy <= 0 || wz <= 0) {
      previewMesh.visible = false;
      return;
    }
    if (previewMesh.geometry) previewMesh.geometry.dispose();
    previewMesh.geometry = new THREE.BoxGeometry(wx, wy, wz);
    positionMeshAtSelectionBounds(previewMesh, bounds);
    previewMaterial.vertexColors = false;
    previewMaterial.color.setHex(voxel.color & 0xffffff);
    previewMesh.visible = true;
  }

  function updatePreviewMesh(
    positions: [number, number, number][],
    voxel: Voxel,
    existingVoxels?: Map<string, Voxel>
  ) {
    if (!previewMesh || !previewMaterial) return;
    if (positions.length === 0) {
      previewMesh.visible = false;
      previewMesh.position.set(0, 0, 0);
      previewMaterial.vertexColors = true;
      previewMaterial.color.setHex(0xffffff);
      return;
    }
    previewMesh.position.set(0, 0, 0);
    previewMaterial.vertexColors = true;
    previewMaterial.color.setHex(0xffffff);
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
    prevGlassShadowParams = null;
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
    updatePreviewBoundingBox,
    destroy,
    getMeshesByBucket: () => meshesByBucket
  };
}
