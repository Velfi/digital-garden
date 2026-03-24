import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseCoordKey } from './coordUtils';
import { buildGreedyMesh } from './greedyMesh';
import type { Voxel } from './voxelMaterial';
import { createVoxelSurfaceMaterial, parseBucketKey } from './voxelMaterial';

export interface ExportGltfOptions {
  greedyRemesh?: boolean;
  /** Matches viewport environment slider; scales IBL on exported PBR materials. */
  environmentIntensity?: number;
}

/**
 * Build export scene geometry. Greedy mode: one mesh per (color, material) bucket.
 * Per-voxel mode: single merged geometry with vertex colors (one standard material).
 */
function buildExportMeshes(
  voxels: Map<string, Voxel>,
  greedyRemesh: boolean,
  environmentIntensity: number = 1
): {
  scene: THREE.Scene;
  disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
} {
  const disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  const scene = new THREE.Scene();

  if (greedyRemesh) {
    const geoByBucket = buildGreedyMesh(voxels, { aoEnabled: false });
    for (const [bucketKey, geo] of geoByBucket) {
      const parsed = parseBucketKey(bucketKey);
      const mat = createVoxelSurfaceMaterial(
        parsed?.material ?? 'plastic',
        null,
        parsed?.color ?? 0xffffff,
        environmentIntensity
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI;
      scene.add(mesh);
      disposables.push({ geometry: geo, material: mat });
    }
    return { scene, disposables };
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  const geometries: THREE.BufferGeometry[] = [];

  for (const [key, vx] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const geo = box.clone();
    geo.translate(x, y, z);

    const c = vx.color;
    const r = ((c >> 16) & 0xff) / 255;
    const g = ((c >> 8) & 0xff) / 255;
    const b = (c & 0xff) / 255;
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometries.push(geo);
  }

  box.dispose();
  const merged = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  if (!merged) return { scene, disposables };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.rotation.x = Math.PI;
  scene.add(mesh);
  disposables.push({ geometry: merged, material });
  return { scene, disposables };
}

/**
 * Exports the voxel mesh as GLTF. Greedy export uses one PBR mesh per material bucket.
 */
export async function exportVoxelsToGltf(
  voxels: Map<string, Voxel>,
  filename = 'voxelle.glb',
  options: ExportGltfOptions = {}
): Promise<void> {
  if (voxels.size === 0) return;

  const { greedyRemesh = false, environmentIntensity = 1 } = options;
  const { scene, disposables } = buildExportMeshes(voxels, greedyRemesh, environmentIntensity);
  if (disposables.length === 0) return;

  const filenameWithExt = filename.toLowerCase().endsWith('.glb') ? filename : `${filename}.glb`;

  const exporter = new GLTFExporter();
  const result = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
  const blob = new Blob([result], { type: 'model/gltf-binary' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameWithExt;
  a.click();
  URL.revokeObjectURL(url);

  for (const { geometry, material } of disposables) {
    geometry.dispose();
    material.dispose();
  }
}
