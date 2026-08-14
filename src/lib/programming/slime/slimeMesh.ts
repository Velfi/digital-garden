import * as THREE from 'three';
import type { EggMesh } from './eggMesh';
import { BODY_GENOME, NUCLEUS_GENOME, createSlimeMaterial } from './slimeMaterial';
import { buildSubdivision } from './subdivision';

/**
 * The slime as Three sees it: one BufferGeometry re-skinned from the physics
 * every frame.
 *
 * The physics runs on the coarse egg; what is drawn is one Loop pass over it
 * (see `subdivision.ts`) — ~1.1k vertices from 282, smooth enough that the
 * facets stop reading as geometry. Each frame the scene hands over the coarse
 * world positions, the precomputed weights turn them into the skin, and
 * normals are recomputed. The mapping from a drawn face back to the physics
 * face it came from is `faceIndex >> 2` — children are emitted four to a
 * parent, in order — which is what the pointer raycast uses to pick a grab
 * cluster on the coarse mesh.
 *
 * Materials: two groups, split at the subdivided `yolkFaceStart` (the name
 * remembers the shape's fried-egg ancestry; the palette moved on). The body
 * is a pale jelly-green translucency, the nucleus dome a deep glossy emerald
 * — both from `slimeMaterial.ts` genomes.
 */

export interface SlimeMeshBundle {
  mesh: THREE.Mesh;
  /** Write coarse `worldPositions` (xyz per physics vertex) into the skin. */
  update(worldPositions: Float32Array): void;
  /** The physics face a drawn face descends from. */
  parentFace(subdividedFaceIndex: number): number;
  /** 0 is fresh and glossy; 1 is parched — matte, opaque, dull. */
  setDryness(dryness: number): void;
  dispose(): void;
}

export function createSlimeMesh(egg: EggMesh): SlimeMeshBundle {
  const sub = buildSubdivision(egg);
  const skinScratch = new Float32Array(sub.vertexCount * 3);

  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(sub.vertexCount * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setIndex(new THREE.BufferAttribute(sub.faces, 1));
  geometry.addGroup(0, sub.yolkFaceStart * 3, 0);
  geometry.addGroup(sub.yolkFaceStart * 3, (sub.faceCount - sub.yolkFaceStart) * 3, 1);

  const body = createSlimeMaterial(BODY_GENOME);
  const nucleus = createSlimeMaterial(NUCLEUS_GENOME);

  const mesh = new THREE.Mesh(geometry, [body, nucleus]);
  // The bounding sphere would otherwise be computed from the initial (empty)
  // positions and never again; the slime is never far from the box, so a
  // generous fixed sphere beats recomputing one per frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(worldPositions) {
      sub.apply(worldPositions, skinScratch);
      (positions.array as Float32Array).set(skinScratch);
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    },
    parentFace(subdividedFaceIndex) {
      return subdividedFaceIndex >> 2;
    },
    setDryness(dryness) {
      const d = Math.min(1, Math.max(0, dryness));
      const lerp = (a: number, b: number) => a + (b - a) * d;
      // Drying is the genome sliding toward its matte corner: the sheen goes
      // first, then the light stops passing through.
      body.roughness = lerp(BODY_GENOME.roughness, 0.93);
      body.clearcoat = lerp(BODY_GENOME.clearcoat, 0.04);
      body.transmission = lerp(BODY_GENOME.transmission, 0.3);
      nucleus.roughness = lerp(NUCLEUS_GENOME.roughness, 0.65);
      nucleus.clearcoat = lerp(NUCLEUS_GENOME.clearcoat, 0.15);
    },
    dispose() {
      geometry.dispose();
      body.dispose();
      nucleus.dispose();
    }
  };
}
