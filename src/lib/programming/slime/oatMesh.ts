import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';

/**
 * The oat flake, as a thing worth looking at.
 *
 * The first flake was a 5 mm box with noise on it — legible as "food
 * pellet", never as an oat. A real rolled oat is a groat squashed between
 * rollers: an irregular oval wafer half a millimetre thin, *lumpy* (the
 * roller flattens but never irons — the surface undulates at the millimetre
 * scale), curled a little from drying, cream-to-tan with lengthwise bran
 * fibres, a darker crease ghosting down the middle, and a dusty, dead-matte
 * surface. The geometry here is a hand-built grid (an extruded outline has
 * no interior vertices, and a flake with a flat top reads as a biscuit),
 * displaced by seeded lump noise; the material kills nearly all specular
 * and paints fibre, bran, crease and dust in linear-space colours.
 *
 * The same material carries the flake's two life events as uniforms, both
 * driven by the scene: `digest` (0..1) dissolves it from the edges in while
 * the slime engulfs it, and `mold` (0..1) grows *colonies* — dark velvety
 * centres with pale fuzzy frontiers, patchy by construction, because grain
 * molds in spots, not in washes.
 */

/** Flake plan radii, metres. A rolled oat runs 4-6 mm on its long axis. */
const OAT_RX = 0.0027;
const OAT_RZ = 0.00205;
/** Wafer thickness at the heart, metres. The rim runs much thinner. */
const OAT_THICKNESS = 0.0006;

/** Radial rings × angular segments of the surface grid. */
const RINGS = 9;
const SEGMENTS = 40;

export interface OatGeometry {
  geometry: THREE.BufferGeometry;
  dispose(): void;
}

/** Seeded 2D value noise for the lump field — the roller's leftovers. */
function makeNoise2(rand: () => number): (x: number, y: number) => number {
  const ox = rand() * 251;
  const oy = rand() * 257;
  const hash = (ix: number, iy: number): number => {
    const s = Math.sin((ix + ox) * 127.1 + (iy + oy) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * An irregular, gently cupped, honestly lumpy wafer. Seeded: every pet's
 * oats are its own.
 */
export function buildOatGeometry(seed: number): OatGeometry {
  const rand = mulberry32((seed ^ 0x0a7f1a4e) >>> 0);
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;
  const curl = 0.09 + rand() * 0.09;
  const noise = makeNoise2(rand);

  /** Outline wobble: rolled oats are never true ovals. */
  const outline = (theta: number): number =>
    1 +
    0.08 * Math.sin(3 * theta + phase1) +
    0.05 * Math.sin(7 * theta + phase2) +
    0.035 * Math.sin(11 * theta + phase3);

  /** Mid-surface height: cup + lumps + fine ripple, metres. */
  const midHeight = (x: number, z: number): number => {
    const rr = (x / OAT_RX) * (x / OAT_RX) + (z / OAT_RZ) * (z / OAT_RZ);
    const bowl = curl * OAT_THICKNESS * 3.2 * rr;
    // Groat lumps: ~1.2 mm features, the flake's actual topography.
    const lumps = (noise(x * 900, z * 900) - 0.5) * OAT_THICKNESS * 0.85;
    const fine = (noise(x * 2600 + 31, z * 2600 + 17) - 0.5) * OAT_THICKNESS * 0.3;
    return bowl + lumps + fine;
  };

  /** Thickness tapers hard toward the rim — a rolled edge is nearly paper. */
  const thicknessAt = (r: number): number =>
    OAT_THICKNESS * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - r * r)));

  // Vertices: for each ring/segment, a top and bottom vertex. Ring 0 is the
  // centre (one top + one bottom vertex, reused across segments via index
  // trickery kept simple: we just emit full rings and let ring 0 collapse).
  const positions: number[] = [];
  const indices: number[] = [];

  /** Emit one layer (top: +1, bottom: -1); returns base vertex index. */
  const emitLayer = (side: 1 | -1): number => {
    const base = positions.length / 3;
    for (let ring = 0; ring <= RINGS; ring++) {
      const r = ring / RINGS;
      for (let s = 0; s < SEGMENTS; s++) {
        const theta = (s / SEGMENTS) * Math.PI * 2;
        const wob = outline(theta);
        const x = Math.cos(theta) * OAT_RX * wob * r;
        const z = Math.sin(theta) * OAT_RZ * wob * r;
        const y = midHeight(x, z) + (side * thicknessAt(r)) / 2;
        positions.push(x, y, z);
      }
    }
    return base;
  };

  const topBase = emitLayer(1);
  const bottomBase = emitLayer(-1);

  const at = (base: number, ring: number, s: number): number =>
    base + ring * SEGMENTS + (s % SEGMENTS);

  for (let ring = 0; ring < RINGS; ring++) {
    for (let s = 0; s < SEGMENTS; s++) {
      // Top: wound counter-clockwise seen from above (+y out).
      indices.push(at(topBase, ring, s), at(topBase, ring + 1, s + 1), at(topBase, ring + 1, s));
      indices.push(at(topBase, ring, s), at(topBase, ring, s + 1), at(topBase, ring + 1, s + 1));
      // Bottom: the other way.
      indices.push(
        at(bottomBase, ring, s),
        at(bottomBase, ring + 1, s),
        at(bottomBase, ring + 1, s + 1)
      );
      indices.push(
        at(bottomBase, ring, s),
        at(bottomBase, ring + 1, s + 1),
        at(bottomBase, ring, s + 1)
      );
    }
  }
  // The rim: stitch the outermost rings.
  for (let s = 0; s < SEGMENTS; s++) {
    const tA = at(topBase, RINGS, s);
    const tB = at(topBase, RINGS, s + 1);
    const bA = at(bottomBase, RINGS, s);
    const bB = at(bottomBase, RINGS, s + 1);
    indices.push(tA, tB, bB);
    indices.push(tA, bB, bA);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    geometry,
    dispose() {
      geometry.dispose();
    }
  };
}

export interface OatMaterial {
  material: THREE.MeshStandardMaterial;
  /** 0..1: the engulf dissolve. */
  digest: { value: number };
  /** 0..1: the mold bloom. */
  mold: { value: number };
  dispose(): void;
}

export function createOatMaterial(): OatMaterial {
  const digest = { value: 0 };
  const mold = { value: 0 };

  // Dusty wafer: almost no specular life at all. What sheen remains comes
  // from the roughness wiggle in the shader below.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // albedo is painted entirely in the shader
    roughness: 0.95,
    envMapIntensity: 0.35
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDigest = digest;
    shader.uniforms.uMold = mold;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vOatLocal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vOatLocal = position;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDigest;
uniform float uMold;
varying vec3 vOatLocal;

float oatHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float oatNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(oatHash(i), oatHash(i + vec3(1, 0, 0)), f.x);
  float b = mix(oatHash(i + vec3(0, 1, 0)), oatHash(i + vec3(1, 1, 0)), f.x);
  float c = mix(oatHash(i + vec3(0, 0, 1)), oatHash(i + vec3(1, 0, 1)), f.x);
  float d = mix(oatHash(i + vec3(0, 1, 1)), oatHash(i + vec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
// Mold colony field + masks, shared by colour and roughness.
float oatMoldField(vec2 xz) {
  return oatNoise(vec3(xz.x * 750.0, 21.0, xz.y * 750.0)) * 0.6 +
    oatNoise(vec3(xz.x * 2100.0, 33.0, xz.y * 2100.0)) * 0.4;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  // Normalised plan position: 0 at the flake's heart, ~1 at the rim.
  vec2 plan = vec2(vOatLocal.x / ${OAT_RX.toFixed(6)}, vOatLocal.z / ${OAT_RZ.toFixed(6)});
  float rim = clamp(length(plan), 0.0, 1.4);

  // All colours linear-space. (The first pass wrote sRGB numbers straight
  // into diffuseColor and every flake came out chalk; the second overshot
  // the red and every flake came out peach.)
  vec3 cream = vec3(0.5, 0.42, 0.29);
  vec3 tan = vec3(0.3, 0.235, 0.14);
  vec3 husk = vec3(0.15, 0.105, 0.06);

  // Lengthwise bran fibres: noise stretched hard along the long axis.
  float fiber = oatNoise(vec3(vOatLocal.x * 420.0, 1.7, vOatLocal.z * 2600.0));
  fiber = fiber * 0.6 + oatNoise(vec3(vOatLocal.x * 1300.0, 4.2, vOatLocal.z * 6400.0)) * 0.4;

  // Bran blotches: broad warm patches, heavier toward the rim.
  float bran = oatNoise(vec3(vOatLocal.x * 480.0, 9.1, vOatLocal.z * 480.0));
  bran = smoothstep(0.42, 0.78, bran) * (0.4 + 0.6 * rim);

  // The groat's crease: a soft dark line ghosting along the middle.
  float crease = exp(-pow(vOatLocal.z * 1500.0, 2.0)) * smoothstep(1.0, 0.35, rim);

  vec3 oat = mix(cream, tan, fiber * 0.9);
  oat = mix(oat, husk, bran * 0.5);
  oat = mix(oat, husk, crease * 0.6);
  // Flour dust: sparse pale speckle lifting the surface — a lift, not
  // paint flecks.
  float dust = smoothstep(0.85, 0.96, oatNoise(vec3(vOatLocal.x * 5200.0, 12.0, vOatLocal.z * 5200.0)));
  oat = mix(oat, vec3(0.58, 0.52, 0.4), dust * 0.35);
  // Rim toasting: the cut edge is a shade deeper.
  oat = mix(oat, husk, smoothstep(0.92, 1.25, rim) * 0.4);
  diffuseColor.rgb = oat;

  // The engulf dissolve: noise minus progress, gone where it goes
  // negative, darkened toward the bite line so the edge reads soaked.
  float grain = oatNoise(vOatLocal * 1400.0) * 0.6 + oatNoise(vOatLocal * 4200.0) * 0.4;
  float remaining = grain - uDigest * 1.15;
  if (remaining < 0.0) discard;
  float soaked = 1.0 - smoothstep(0.0, 0.12, remaining);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.09, 0.045), soaked * 0.7);

  // Mold: colonies, not a wash. The threshold falls as the bloom advances,
  // so spots grow and merge — but the lowest-field hollows stay oat all
  // the way to full mold, which is what keeps it reading as *infested*
  // rather than dyed.
  if (uMold > 0.0) {
    float field = oatMoldField(vOatLocal.xz);
    float th = mix(0.78, 0.38, uMold);
    float colony = smoothstep(th, th + 0.14, field);
    // A narrow, broken frontier — fuzz gates it so it reads as growth
    // creeping outward, never as a piped ring.
    float fuzz = oatNoise(vec3(vOatLocal.x * 6400.0, 40.0, vOatLocal.z * 6400.0));
    float halo = (smoothstep(th - 0.07, th, field) - colony) * (0.35 + 0.65 * fuzz);
    // Damp first: the whole flake goes dull and grey-brown as it sours.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.105, 0.075), uMold * 0.45);
    // The frontier: grey-green fuzz, modest — new growth, not frosting.
    vec3 haloColor = mix(vec3(0.28, 0.33, 0.22), vec3(0.44, 0.49, 0.35), fuzz);
    diffuseColor.rgb = mix(diffuseColor.rgb, haloColor, halo * min(1.0, uMold * 1.6));
    // The colonies: velvet, olive here, slate blue-green there — molds are
    // a crowd, not one species — speckled by the fuzz, near-black cores.
    float species = oatNoise(vec3(vOatLocal.x * 300.0, 55.0, vOatLocal.z * 300.0));
    vec3 olive = vec3(0.04, 0.055, 0.03);
    vec3 slate = vec3(0.04, 0.065, 0.055);
    vec3 velvet = mix(olive, slate, smoothstep(0.35, 0.65, species)) * (0.7 + 0.9 * fuzz);
    float core = smoothstep(th + 0.1, th + 0.24, field);
    diffuseColor.rgb = mix(diffuseColor.rgb, velvet, colony * min(1.0, uMold * 1.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, velvet * 0.55, core * min(1.0, uMold * 1.2));
    // Spore dust: pinprick pale speckle over established colonies.
    float spore = smoothstep(0.93, 0.98, oatNoise(vec3(vOatLocal.x * 9000.0, 71.0, vOatLocal.z * 9000.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.34, 0.27), spore * colony * uMold);
  }
}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
{
  // Dusty wafer: rough everywhere; moldy velvet rougher still, with the
  // faintest damp sheen on the halo band.
  float sheen = oatNoise(vec3(vOatLocal.x * 2400.0, 7.0, vOatLocal.z * 2400.0));
  roughnessFactor = clamp(roughnessFactor - 0.08 + sheen * 0.1 + uMold * 0.05, 0.6, 1.0);
}`
      );
  };

  return {
    material,
    digest,
    mold,
    dispose() {
      material.dispose();
    }
  };
}
