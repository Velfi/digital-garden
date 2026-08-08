import * as THREE from 'three';
import { ICOSPHERE_DETAIL } from './constants';
import { buildFilaments, strandTemplate } from './filaments';
import {
  applyConditionColours,
  createBodyMaterial,
  createFilamentMaterial,
  createShapeUniforms,
  writeShapeUniforms,
  type MarimoShapeUniforms
} from './marimoMaterial';
import type { MarimoShape } from './facets';
import type { LightUniforms, WaterUniforms } from './waterShader';

/**
 * The marimo as drawn: a solid displaced icosphere, plus one instanced draw
 * call of tapered filaments radiating from its surface.
 *
 * Neither mesh is ever rebuilt. Growth, the resting flat spot and a squeeze all
 * happen entirely in the vertex shader via the shared shape uniforms, so the
 * geometry is uploaded once and never touched again.
 */
export interface MarimoMeshBundle {
  group: THREE.Group;
  body: THREE.Mesh;
  filaments: THREE.Mesh;
  shape: MarimoShapeUniforms;
  /**
   * The coat's deep colour, shared by reference so anything that has to mirror
   * the marimo — the bubbles, for one — tracks it as its condition changes
   * rather than keeping its own copy in step by hand.
   */
  colour: THREE.IUniform<THREE.Color>;
  setShape(shape: MarimoShape, radiusMetres: number): void;
  setVigor(vigor: number): void;
  /** Water flow in the marimo's own frame, so the coat lies over when stirred. */
  setFlow(x: number, y: number, z: number): void;
  /** Clock for the sway. */
  setTime(seconds: number): void;
  /** Global multiplier on the sway amplitude, for reduced-motion. */
  setSwayScale(scale: number): void;
  setViewportHeight(height: number): void;
  dispose(): void;
}

export interface MarimoMeshOptions {
  filamentCount: number;
  seed: number;
  water: WaterUniforms;
  light: LightUniforms;
}

export function createMarimoMesh(options: MarimoMeshOptions): MarimoMeshBundle {
  const { filamentCount, seed, water, light } = options;

  const shape = createShapeUniforms(seed);
  const bodyMaterial = createBodyMaterial(shape, water, light);
  const filamentMaterial = createFilamentMaterial(shape, water, light);

  // --- solid body -----------------------------------------------------------
  const bodyGeometry = new THREE.IcosahedronGeometry(1, ICOSPHERE_DETAIL);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  // The shader relocates every vertex, so three's bounds are meaningless here.
  body.frustumCulled = false;

  // --- filaments ------------------------------------------------------------
  const template = strandTemplate();
  const buffers = buildFilaments(filamentCount, seed);

  const filamentGeometry = new THREE.InstancedBufferGeometry();
  filamentGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(template.side.length * 3), 3)
  );
  filamentGeometry.setAttribute('aSide', new THREE.Float32BufferAttribute(template.side, 1));
  filamentGeometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(template.along, 1));
  filamentGeometry.setIndex(new THREE.Uint16BufferAttribute(template.index, 1));
  filamentGeometry.setAttribute('aDir', new THREE.InstancedBufferAttribute(buffers.direction, 3));
  filamentGeometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(buffers.variation, 4));
  filamentGeometry.instanceCount = filamentCount;

  const filaments = new THREE.Mesh(filamentGeometry, filamentMaterial);
  filaments.frustumCulled = false;

  const group = new THREE.Group();
  group.add(body);
  group.add(filaments);

  return {
    group,
    body,
    filaments,
    shape,
    colour: bodyMaterial.uniforms.uColourDeep as THREE.IUniform<THREE.Color>,
    setShape(surface, radiusMetres) {
      writeShapeUniforms(shape, surface, radiusMetres);
    },
    setVigor(vigor) {
      applyConditionColours(bodyMaterial, filamentMaterial, vigor);
    },
    setFlow(x, y, z) {
      (filamentMaterial.uniforms.uFlow.value as THREE.Vector3).set(x, y, z);
    },
    setTime(seconds) {
      filamentMaterial.uniforms.uTime.value = seconds;
    },
    setSwayScale(scale) {
      filamentMaterial.uniforms.uSwayScale.value = scale;
    },
    setViewportHeight(height) {
      filamentMaterial.uniforms.uViewportHeight.value = height;
    },
    dispose() {
      bodyGeometry.dispose();
      filamentGeometry.dispose();
      bodyMaterial.dispose();
      filamentMaterial.dispose();
    }
  };
}
