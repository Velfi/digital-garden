import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { createCaustic } from './caustic';
import { createCondensation } from './condensation';
import { createGrimeMap } from './grimeMap';
import { createParticleEyes } from './particleEyes';
import { createRoomUniforms } from './roomLight';
import { createTerrarium } from './terrariumMesh';
import { createTrailMap } from './trailMap';
import { createVolumeMaterial } from './volumeMaterial';

/**
 * Compiles every hand-written shader in the terrarium with glslangValidator,
 * when one is on the PATH (`brew install glslang`; skipped otherwise, e.g.
 * CI). The shaders live in template strings TypeScript never parses — without
 * this, a stray semicolon ships and explodes only at runtime, on the first
 * frame, in the browser.
 *
 * three.js renders this scene over WebGL2, so shaders compile as GLSL ES
 * 3.00 behind a compatibility header much like the stubs here (the shaders
 * themselves are written in the older idiom — varying, texture2D,
 * gl_FragColor). The `onBeforeCompile` injections (oats, the genome
 * materials) are out of scope: they patch three's own shader chunks, which
 * this harness cannot reconstruct.
 */

const hasValidator = (() => {
  try {
    execFileSync('glslangValidator', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const FRAGMENT_PRELUDE = `#version 300 es
#define varying in
#define texture2D texture
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
precision highp float;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
`;

const VERTEX_PRELUDE = `#version 300 es
#define attribute in
#define varying out
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
`;

/** Every ShaderMaterial reachable from an object tree, deduped by shader. */
function collectMaterials(root: THREE.Object3D, into: Map<string, THREE.ShaderMaterial>) {
  root.traverse((object) => {
    const withMaterial = object as THREE.Mesh;
    const materials = Array.isArray(withMaterial.material)
      ? withMaterial.material
      : withMaterial.material
        ? [withMaterial.material]
        : [];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial) {
        into.set(material.vertexShader + material.fragmentShader, material);
      }
    }
  });
}

describe.runIf(hasValidator)('terrarium GLSL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slime-glsl-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function compile(source: string, name: string) {
    const path = join(dir, name);
    writeFileSync(path, source);
    try {
      execFileSync('glslangValidator', [path], { stdio: 'pipe' });
    } catch (error) {
      // The validator prints its diagnostics to stdout, not stderr.
      const out = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
      throw new Error(`${name}:\n${out}`);
    }
  }

  const room = createRoomUniforms();
  const materials = new Map<string, THREE.ShaderMaterial>();

  materials.set('volume', createVolumeMaterial(new THREE.Vector3(0, 1, 0), room).material);
  collectMaterials(createTerrarium(7, room).group, materials);
  collectMaterials(createCaustic().mesh, materials);
  collectMaterials(createGrimeMap().group, materials);
  collectMaterials(createCondensation().group, materials);
  collectMaterials(createTrailMap().mesh, materials);
  collectMaterials(createParticleEyes(7, new THREE.Vector3(0, 1, 0)).group, materials);

  it('finds a healthy crowd of shaders', () => {
    expect(materials.size).toBeGreaterThanOrEqual(6);
  });

  it('every shader compiles', () => {
    let index = 0;
    for (const material of materials.values()) {
      compile(VERTEX_PRELUDE + material.vertexShader, `shader-${index}.vert`);
      compile(FRAGMENT_PRELUDE + material.fragmentShader, `shader-${index}.frag`);
      index += 1;
    }
  });
});
