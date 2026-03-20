/**
 * Shared helpers for dual-mesh previews (visible + occluded pass), e.g. add-shape ghost.
 */
import * as THREE from 'three';

const tintScratch = new THREE.Color();

/** Occluded-pass tint (x-ray style); used by add-shape ghost and selection gizmo materials. */
export function previewOccludedTintInto(baseHex: number, out: THREE.Color): void {
  out.setHex(baseHex);
  out.multiplyScalar(0.48);
  out.lerp(new THREE.Color(0x5577ee), 0.42);
}

/** Occluded-pass tint for add-shape preview materials. */
export function applyAddShapeOccludedPreviewTint(
  baseColorHex: number,
  occludedMaterial: THREE.MeshBasicMaterial
): void {
  previewOccludedTintInto(baseColorHex, tintScratch);
  occludedMaterial.color.copy(tintScratch);
}

/**
 * Assign the same geometry to two meshes; disposes the previous primary geometry if replaced.
 * If `geometry` is null, hides both meshes and does not dispose existing geometry.
 */
export function assignSharedDualPreviewGeometry(
  primaryMesh: THREE.Mesh,
  secondaryMesh: THREE.Mesh,
  geometry: THREE.BufferGeometry | null
): void {
  if (!geometry) {
    primaryMesh.visible = false;
    secondaryMesh.visible = false;
    return;
  }
  const prev = primaryMesh.geometry;
  if (prev && prev !== geometry) {
    prev.dispose();
  }
  primaryMesh.geometry = geometry;
  secondaryMesh.geometry = geometry;
  primaryMesh.visible = true;
  secondaryMesh.visible = true;
}
