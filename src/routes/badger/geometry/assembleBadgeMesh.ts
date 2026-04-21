import * as THREE from 'three';
import type { EnamelMaterial } from '../store/types';
import type { BadgeMeshData, BadgeMeshPiece } from './buildBadgeMeshData';

export type BadgeMeshResult = {
  group: THREE.Group;
  dispose: () => void;
};

// Turn a serializable BadgeMeshData (typically from the worker) into a live
// THREE.Group with materials, meshes, shadow flags, and transforms. All of
// the Three.js scene-graph work lives here so the data pipeline can stay
// worker-safe.
export function assembleBadgeMesh(data: BadgeMeshData): BadgeMeshResult {
  const group = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  const metalMat = new THREE.MeshPhysicalMaterial({
    color: data.finishColor,
    metalness: 1,
    roughness: data.metalSurface === 'polished' ? 0.08 : 0.55,
    envMapIntensity: data.metalSurface === 'polished' ? 1.4 : 0.9,
    clearcoat: data.metalSurface === 'polished' ? 1 : 0,
    clearcoatRoughness: data.metalSurface === 'polished' ? 0.05 : 0.4
  });
  disposables.push(metalMat);

  // Cache keyed by (material, colorHex) so identical enamel cells share GPU
  // state. Glitter uses onBeforeCompile with a color-dependent program cache
  // key so different-colored glitter cells get distinct shader programs
  // rather than clobbering each other's uniforms.
  const enamelCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const enamelMat = (
    colorHex: string,
    material: EnamelMaterial
  ): THREE.MeshPhysicalMaterial => {
    const key = `${material}|${colorHex}`;
    const cached = enamelCache.get(key);
    if (cached) return cached;
    const mat = createEnamelMaterial(colorHex, material, data.enamelFinish);
    enamelCache.set(key, mat);
    disposables.push(mat);
    return mat;
  };

  for (const piece of data.pieces) {
    const geom = pieceToGeometry(piece);
    disposables.push(geom);
    const mesh = buildMesh(piece, geom, metalMat, enamelMat, data.baseThickness);
    group.add(mesh);
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}

// Build one enamel material preset. Shared base (color, envMap-driven PBR)
// plus a per-preset deviation:
//   - plain:    current soft/hard enamel — clearcoat + mid roughness
//   - metallic: pearlescent colored metal — metalness bumps up, roughness low,
//               clearcoat on to read as lacquered pin metal rather than raw
//   - glitter:  plain base with per-fragment hash-based specular sparkles
//               injected via onBeforeCompile (no texture; sparkles stick to
//               the surface in world space so they twinkle under camera motion)
function createEnamelMaterial(
  colorHex: string,
  material: EnamelMaterial,
  enamelFinish: 'soft' | 'hard'
): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(colorHex);

  if (material === 'metallic') {
    // Real pins fire colored metallic enamel by suspending mica/aluminum
    // flakes in the enamel paste; the whole cell reads as a tinted mirror.
    // High metalness + low roughness + colored base approximates that.
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.85,
      roughness: enamelFinish === 'hard' ? 0.18 : 0.28,
      envMapIntensity: 1.2,
      clearcoat: 1,
      clearcoatRoughness: enamelFinish === 'hard' ? 0.05 : 0.12,
      reflectivity: 0.6
    });
  }

  const base = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: enamelFinish === 'hard' ? 0.12 : 0.3,
    clearcoat: 1,
    clearcoatRoughness: enamelFinish === 'hard' ? 0.04 : 0.15,
    reflectivity: 0.5
  });

  if (material === 'plain') return base;

  // --- glitter ---
  // Real glitter is a field of tiny tilted mirrors suspended in the enamel.
  // Each flake reflects the environment independently, so the sparkle you see
  // is the subset of flakes whose random orientation happens to reflect a
  // bright direction toward the eye. We emulate that with a hash grid in
  // world space: each cell gets one flake with a random tilt, and the flake
  // only lights up when its per-flake normal aligns with the view/light
  // reflection. This gives the twinkling-under-motion behavior that plain
  // white dots lack.
  base.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPosGlitter;`
    );
    // Own world position derivation — the built-in worldpos_vertex chunk is
    // gated on USE_ENVMAP/shadow/transmission flags that may not be set.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vWorldPosGlitter = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPosGlitter;

float glitterHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

// Random unit-ish normal in tangent space, biased toward +Z so flakes lie
// roughly flat in the enamel but with enough tilt that only some catch the
// light at any given view angle.
vec3 glitterFlakeNormal( vec2 gi ) {
  float a = glitterHash( gi + vec2( 3.7, 1.1 ) ) * 6.2831853;
  float t = glitterHash( gi + vec2( 5.3, 8.9 ) );
  // Max tilt ~35 degrees — enough variation to twinkle, not so much that
  // flakes point sideways into the enamel.
  float tilt = 0.55 * sqrt( t );
  return normalize( vec3( cos( a ) * tilt, sin( a ) * tilt, 1.0 ) );
}`
    );

    // Inject after opaque_fragment — that chunk has written diffuseColor into
    // gl_FragColor, so we can composite flakes on top of the fully lit enamel.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
// Project to the badge's top plane (XZ — mesh is rotated so Y is up) and
// quantize into a grid. Each grid cell gets at most one flake, kept ~1/4 of
// the time so the flakes feel scattered rather than regular. 3 cells/mm →
// ~0.33mm tile, which matches fine cosmetic glitter.
vec2 gp = vWorldPosGlitter.xz * 3.0;
vec2 gi = floor( gp );
vec2 gf = fract( gp );
float keep = step( 0.75, glitterHash( gi ) );
vec2 center = vec2(
  0.2 + 0.6 * glitterHash( gi + vec2( 1.3, 7.7 ) ),
  0.2 + 0.6 * glitterHash( gi + vec2( 9.1, 2.4 ) )
);
float d = distance( gf, center );
// Flake footprint — hexagonal-ish falloff from a circular disk.
float flakeMask = ( 1.0 - smoothstep( 0.05, 0.13, d ) ) * keep;

if ( flakeMask > 0.0 ) {
  // Build a per-flake normal in world space. The enamel top faces +Y, so we
  // treat tangent-space Z as world Y and spread the flake tilt over X/Z.
  vec3 flakeTan = glitterFlakeNormal( gi );
  vec3 flakeN = normalize( vec3( flakeTan.x, flakeTan.z, flakeTan.y ) );

  // View direction in world space. cameraPosition is a built-in uniform.
  vec3 V = normalize( cameraPosition - vWorldPosGlitter );
  // Approximate dominant light: reflect the view about world-up. This gives
  // us a stable "bright direction" even without reading scene lights, so the
  // sparkle twinkles based on camera motion alone.
  vec3 L = reflect( -V, vec3( 0.0, 1.0, 0.0 ) );
  vec3 H = normalize( V + L );

  // Very tight specular lobe — only flakes whose normal lines up almost
  // exactly with H flash bright. This is what separates "glitter" from
  // "noisy white texture": most flakes are dim, a few are blinding.
  float spec = pow( max( dot( flakeN, H ), 0.0 ), 180.0 );

  // A tiny baseline so flakes are faintly visible even when off-axis —
  // otherwise dark flakes read as holes in the enamel.
  float baseGlint = 0.08;
  float intensity = baseGlint + spec * 6.0;

  // Per-flake tint: biased toward white but pulls some saturation from the
  // enamel color, so red glitter reads as red glints with white pops rather
  // than flat white dots.
  vec3 flakeTint = mix( vec3( 1.0 ), gl_FragColor.rgb, 0.35 );
  vec3 sparkle = flakeTint * intensity;

  gl_FragColor.rgb += sparkle * flakeMask;
}`
    );
  };
  // Distinct cache key so glitter programs aren't confused with plain enamel.
  base.customProgramCacheKey = () => 'glitter-v3';

  return base;
}

function pieceToGeometry(piece: BadgeMeshPiece): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(piece.normals, 3));
  if (piece.indices.length > 0) g.setIndex(new THREE.BufferAttribute(piece.indices, 1));
  return g;
}

function buildMesh(
  piece: BadgeMeshPiece,
  geom: THREE.BufferGeometry,
  metalMat: THREE.MeshPhysicalMaterial,
  enamelMat: (hex: string, material: EnamelMaterial) => THREE.MeshPhysicalMaterial,
  baseThickness: number
): THREE.Mesh {
  if (piece.role === 'metal') {
    const mesh = new THREE.Mesh(geom, metalMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  if (piece.role === 'wall') {
    const mesh = new THREE.Mesh(geom, metalMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = baseThickness;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  // enamel
  const mat = piece.colorHex
    ? enamelMat(piece.colorHex, piece.material ?? 'plain')
    : metalMat;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = baseThickness;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
