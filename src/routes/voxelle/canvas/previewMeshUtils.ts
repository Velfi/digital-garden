/**
 * Shared helpers for dual-mesh previews (visible + occluded pass), e.g. add-shape ghost.
 */
import * as THREE from 'three';

/**
 * WebGPU workaround: remove geometry dispose listeners before `dispose()` to avoid a
 * Three.js `attribute.id` crash after geometry/material swaps on preview meshes.
 */
export function safeDisposeBufferGeometry(geo: THREE.BufferGeometry, isWebGPU: boolean): void {
  if (isWebGPU) {
    const listeners = (geo as unknown as { _listeners?: Record<string, unknown[]> })._listeners;
    if (listeners) delete listeners['dispose'];
  }
  geo.dispose();
}

const tintScratch = new THREE.Color();

/** Occluded-pass tint (x-ray style); used by add-shape ghost and selection gizmo materials. */
export function previewOccludedTintInto(baseHex: number, out: THREE.Color): void {
  out.setHex(baseHex);
  out.multiplyScalar(0.38);
  out.lerp(new THREE.Color(0x5577ee), 0.48);
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
 *
 * When `disposePreviousGeometry` is set, it replaces `BufferGeometry.dispose()` (e.g. WebGPU-safe).
 */
export function assignSharedDualPreviewGeometry(
  primaryMesh: THREE.Mesh,
  secondaryMesh: THREE.Mesh,
  geometry: THREE.BufferGeometry | null,
  disposePreviousGeometry?: (geo: THREE.BufferGeometry) => void
): void {
  if (!geometry) {
    primaryMesh.visible = false;
    secondaryMesh.visible = false;
    return;
  }
  const prev = primaryMesh.geometry;
  primaryMesh.geometry = geometry;
  secondaryMesh.geometry = geometry;
  if (prev && prev !== geometry) {
    if (disposePreviousGeometry) disposePreviousGeometry(prev);
    else prev.dispose();
  }
  primaryMesh.visible = true;
  secondaryMesh.visible = true;
}
