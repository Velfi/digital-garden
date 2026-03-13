import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseCoordKey } from './store';

/**
 * Exports the voxel mesh as GLTF with vertex colors. Triggers a download.
 */
export async function exportVoxelsToGltf(
  voxels: Map<string, number>,
  filename = 'voxelle.glb'
): Promise<void> {
  if (voxels.size === 0) return;

  const box = new THREE.BoxGeometry(1, 1, 1);
  const geometries: THREE.BufferGeometry[] = [];

  for (const [key, col] of voxels) {
    const [x, y, z] = parseCoordKey(key);
    const geo = box.clone();
    geo.translate(x, y, z);

    const r = ((col >> 16) & 0xff) / 255;
    const g = ((col >> 8) & 0xff) / 255;
    const b = (col & 0xff) / 255;
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
  if (!merged) return;

  geometries.forEach((g) => g.dispose());

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.rotation.x = Math.PI;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const result = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
  const blob = new Blob([result], { type: 'model/gltf-binary' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  merged.dispose();
  material.dispose();
}
