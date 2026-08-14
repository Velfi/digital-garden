import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';
import { FLOOR_Y } from './constants';

/**
 * The sclerotium: the dry crust the slime arrives as, and returns to.
 *
 * A crust, not an egg — deliberately unlike the living shape, so waking up
 * reads as a transformation. Real Physarum ships between labs as exactly
 * this: a plasmodium poured onto filter paper and dried into a brittle,
 * crackled, amber-to-rust wafer. So the geometry is a low poured patch —
 * lobed margin, a few coalesced mounds, feathered edge — and the material
 * paints what dried crust actually shows: crackle plates separated by dark
 * seams, granular ochre speckle, a dusty matte skin.
 *
 * Moisture is its whole visual life: dry it is pale, matte and cracked;
 * soaked it darkens, glistens, and the seams flood dark first (water finds
 * the cracks). Revival plumps it a few percent and begins to close the
 * cracks — something in there has begun to take up water. The paper tells
 * the same story: mist it and a stain blooms outward from under the crust.
 */

/** Plan radius of the crust patch, metres (margin wobble swings ±~20%). */
const CRUST_RADIUS = 0.0125;
/** Height of the tallest mound, metres. A crust lies low. */
const CRUST_HEIGHT = 0.0048;
const PAPER_SIZE = 0.042;

/** Radial rings × angular segments of the crust surface grid. */
const RINGS = 26;
const SEGMENTS = 88;

export interface SclerotiumBundle {
  group: THREE.Group;
  /** Drive the look from the care state. */
  setState(moisture: number, revival: number): void;
  /**
   * The pre-shatter, 0 (quiet) → 1 (about to let go): the body swelling
   * beneath heaves the crust and pries its seams wide, and the living
   * olive shows through the cracks before a single plate has moved.
   */
  setCracking(cracked: number): void;
  /**
   * How far the emergence has consumed the crust, 0 (intact) → 1 (gone).
   * Plates shatter loose centre-out: each wears a wet olive rim as the
   * slime beneath pries it up, then leaves the mesh — the tumbling chip it
   * becomes is the host's theatre (crustShards.ts) — the whole crust
   * flattens as it breaks up, and the paper fades last. At 1 nothing is
   * left to hide — the host can drop the group.
   */
  setEmergence(gone: number): void;
  /** Crust surface height (local, above the group origin) at plan (x, z). */
  surfaceY(x: number, z: number): number;
  dispose(): void;
}

/** Plan radius of the crust, for hosts placing things on it. */
export const SCLEROTIUM_RADIUS = CRUST_RADIUS;

/** Seeded 2D value noise, same construction as the oat's lump field. */
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

/** GLSL helpers shared by crust and paper shaders. */
const NOISE_GLSL = `
float sclHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 sclHash2(vec2 p) {
  return fract(
    sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453
  );
}
float sclNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = sclHash(i);
  float b = sclHash(i + vec2(1, 0));
  float c = sclHash(i + vec2(0, 1));
  float d = sclHash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/** Crackle field: x = seam closeness (1 at a crack), y = plate id hash. */
vec2 sclCrackle(vec2 p) {
  vec2 cell = floor(p);
  vec2 frac = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(float(i), float(j));
      vec2 feature = offset + sclHash2(cell + offset) - frac;
      float d = dot(feature, feature);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = sclHash(cell + offset);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  float seam = 1.0 - smoothstep(0.0, 0.09, sqrt(f2) - sqrt(f1));
  return vec2(seam, id);
}`;

export function createSclerotium(seed: number): SclerotiumBundle {
  const group = new THREE.Group();
  const rand = mulberry32((seed ^ 0x5c1e40) >>> 0);
  const noise = makeNoise2(rand);

  // --- the crust: a poured, dried patch --------------------------------------

  // Lobed margin: dried plasmodium never pools into a circle.
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;
  const outline = (theta: number): number =>
    1 +
    0.13 * Math.sin(2 * theta + phase1) +
    0.09 * Math.sin(3 * theta + phase2) +
    0.05 * Math.sin(5 * theta + phase3) +
    0.025 * Math.sin(9 * theta + phase1 * 1.7);

  // Two or three coalesced mounds — the crust dried from puddles, not a dome.
  const mounds = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = rand() * CRUST_RADIUS * 0.45;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      sigma: CRUST_RADIUS * (0.38 + rand() * 0.25),
      amount: 0.35 + rand() * 0.4
    };
  });

  /** Crust height, metres, at plan position; r is the margin-relative radius. */
  const heightAt = (x: number, z: number, r: number): number => {
    // Base profile: a low plateau with a rolled margin — a pour, not a peak.
    const dome = Math.pow(Math.max(0, 1 - r * r), 0.55);
    let lump = 0;
    for (const m of mounds) {
      const dx = x - m.x;
      const dz = z - m.z;
      lump += m.amount * Math.exp(-(dx * dx + dz * dz) / (2 * m.sigma * m.sigma));
    }
    // Soft-compress the mound sum so coalesced puddles broaden the crust
    // instead of stacking into a summit.
    const body = dome * (0.55 + lump);
    const flat = (1.6 * body) / (1 + 0.9 * body);
    // Wrinkle: the skin of a drying pour, kept alive on the flanks.
    const texture = 0.3 + 0.7 * dome;
    const wrinkle = (noise(x * 520, z * 520) - 0.5) * 0.3 * texture;
    const fine = (noise(x * 1500 + 40, z * 1500 + 9) - 0.5) * 0.1 * texture;
    return CRUST_HEIGHT * Math.max(0, flat + wrinkle + fine) * Math.min(1, dome * 4);
  };

  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= RINGS; ring++) {
    const r = ring / RINGS;
    for (let s = 0; s < SEGMENTS; s++) {
      const theta = (s / SEGMENTS) * Math.PI * 2;
      const wobble = outline(theta);
      const x = Math.cos(theta) * CRUST_RADIUS * wobble * r;
      const z = Math.sin(theta) * CRUST_RADIUS * wobble * r;
      positions.push(x, heightAt(x, z, r), z);
    }
  }
  const at = (ring: number, s: number): number => ring * SEGMENTS + (s % SEGMENTS);
  for (let ring = 0; ring < RINGS; ring++) {
    for (let s = 0; s < SEGMENTS; s++) {
      indices.push(at(ring, s), at(ring + 1, s + 1), at(ring + 1, s));
      indices.push(at(ring, s), at(ring, s + 1), at(ring + 1, s + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wet = { value: 0 };
  const revive = { value: 0 };
  const gone = { value: 0 };
  const crackedUniform = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // albedo painted in the shader
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.4
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = wet;
    shader.uniforms.uRevive = revive;
    shader.uniforms.uGone = gone;
    shader.uniforms.uCracked = crackedUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSclLocal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSclLocal = position;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWet;
uniform float uRevive;
uniform float uGone;
uniform float uCracked;
varying vec3 vSclLocal;
${NOISE_GLSL}
/**
 * Emergence eating order: which parts of the crust the waking body drinks
 * first. Centre-out — it wells up from under the middle — but plate by
 * plate, not as a clean expanding circle: each plate's hash jitters its
 * turn, so the boundary is ragged and crust falls away in crust-sized bites.
 */
float sclEatOrder(vec2 plan, float plate, float finePlate) {
  float radial = length(plan) / ${(CRUST_RADIUS * 1.3).toFixed(6)};
  return radial + (plate - 0.5) * 0.5 + (finePlate - 0.5) * 0.18;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 plan = vSclLocal.xz;

  // Two crackle scales: coarse plates (~2.5 mm) and a finer fracture web.
  // Cracks close as revival swells the crust; wet seams flood dark first.
  vec2 crack = sclCrackle(plan * 420.0 + sclNoise(plan * 900.0) * 0.6);
  float fineSeam = sclCrackle(plan * 1150.0 + 47.0).x;
  // Cracking is patchy: some reaches shattered, others still smooth skin.
  float patchy = 0.4 + 0.6 * sclNoise(plan * 230.0 + 11.0);
  float seam = max(crack.x, fineSeam * 0.45) * patchy * (1.0 - 0.55 * uRevive);
  // The pre-shatter pries apart what revival closed: the swelling body
  // widens the seams before a plate has moved, and the shatter itself
  // (uGone) tears them wider still.
  seam = min(1.0, seam * (1.0 + 1.8 * uCracked + 2.5 * uGone));
  float plate = crack.y;
  float finePlate = sclCrackle(plan * 1150.0 + 47.0).y;

  // All colours linear-space (oat lesson: sRGB constants read as chalk).
  // Dried Physarum runs caramel through rust to near-black in the seams.
  vec3 ochre = vec3(0.34, 0.16, 0.042);
  vec3 rust = vec3(0.16, 0.058, 0.018);
  vec3 umber = vec3(0.085, 0.038, 0.016);
  vec3 seamDark = vec3(0.045, 0.021, 0.01);

  // Each plate its own shade — a crust is a mosaic, not a wash — and the
  // finer web breaks the big plates into granular islands.
  vec3 crustColor = mix(ochre, rust, plate * 0.9);
  crustColor = mix(crustColor, mix(crustColor, umber, 0.5), finePlate * 0.45);
  // Broad tonal drift so one side of the crust reads sunnier than the other.
  float drift = sclNoise(plan * 140.0);
  crustColor = mix(crustColor, umber, drift * 0.35);

  // Granule speckle: a sclerotium is packed spherules, and at close range
  // the surface glints granular, like demerara sugar in umber.
  float grain = sclNoise(plan * 2600.0);
  float fleck = smoothstep(0.75, 0.93, grain);
  crustColor = mix(crustColor, vec3(0.44, 0.25, 0.09), fleck * 0.45);

  // The seams: hairline dark. Water floods them, but gloss carries that —
  // boosting the line darkness too made the wet crust read as outlined.
  float seamShade = seam * (0.55 + 0.2 * uWet);
  crustColor = mix(crustColor, seamDark, seamShade);

  // Dust: dry crust wears a pale film that the first misting rinses off.
  float dustField = sclNoise(plan * 700.0 + 31.0);
  crustColor = mix(crustColor, vec3(0.36, 0.28, 0.17), dustField * 0.3 * (1.0 - uWet));

  // Soaked: the whole crust deepens toward wet chestnut.
  crustColor = mix(crustColor, crustColor * vec3(0.34, 0.32, 0.36), uWet * 0.7);

  // Revival: an olive translucence creeps into the thin margins — the
  // living colour showing through the crust before anything moves.
  float thin = 1.0 - smoothstep(0.0, ${(CRUST_HEIGHT * 0.45).toFixed(6)}, vSclLocal.y);
  vec3 waking = vec3(0.1, 0.14, 0.045);
  crustColor = mix(crustColor, waking, uRevive * thin * 0.55);

  // The pre-shatter: living olive wells up *in the cracks* — the slime is
  // pressing at the seams from beneath, visible before anything shatters.
  crustColor = mix(crustColor, waking, seam * uCracked * 0.5);

  // Emergence: plates already drunk are simply gone; the ones about to go
  // wear a wet olive rim — the living slime showing through from beneath
  // just before the plate lets loose.
  if (uGone > 0.0) {
    float order = sclEatOrder(plan, plate, finePlate);
    float eaten = mix(-0.45, 1.45, uGone);
    if (order < eaten - 0.05) discard;
    float rim = 1.0 - smoothstep(eaten - 0.05, eaten + 0.12, order);
    crustColor = mix(crustColor, vec3(0.1, 0.14, 0.045), rim * 0.75);
  }

  diffuseColor.rgb = crustColor;
}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
{
  // Dry: dead matte with granular sparkle. Wet: glistening, but the seams
  // and hollows keep a damp-clay dullness so it never reads as glazed.
  vec2 planR = vSclLocal.xz;
  float grainR = sclNoise(planR * 2600.0);
  vec2 crackR = sclCrackle(planR * 420.0 + sclNoise(planR * 900.0) * 0.6);
  // Per-plate jitter breaks the wet sheen into facets — one continuous
  // highlight across the whole crust read as plastic.
  float gloss = uWet * (1.0 - crackR.x * 0.5) * (0.75 + 0.5 * crackR.y);
  roughnessFactor = clamp(0.95 - grainR * 0.12 - gloss * 0.5, 0.34, 1.0);
  // The about-to-go rim glistens: it is being wetted from beneath.
  if (uGone > 0.0) {
    float finePlateR = sclCrackle(planR * 1150.0 + 47.0).y;
    float orderR = sclEatOrder(planR, crackR.y, finePlateR);
    float eatenR = mix(-0.45, 1.45, uGone);
    float rimR = 1.0 - smoothstep(eatenR - 0.05, eatenR + 0.12, orderR);
    roughnessFactor = mix(roughnessFactor, 0.32, rimR);
  }
}`
      );
  };

  const crust = new THREE.Mesh(geometry, material);
  crust.position.set(0, FLOOR_Y + 0.001, 0);
  group.add(crust);

  // --- the filter paper -----------------------------------------------------
  // A dried square warps: gentle bow, corners lifting. Grid + displacement.
  const paperGeometry = new THREE.PlaneGeometry(PAPER_SIZE, PAPER_SIZE, 20, 20);
  paperGeometry.rotateX(-Math.PI / 2);
  {
    const p = paperGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const nx = (x / PAPER_SIZE) * 2;
      const nz = (z / PAPER_SIZE) * 2;
      const corner = Math.pow(Math.max(Math.abs(nx), Math.abs(nz)), 3.5);
      const bow = (noise(x * 90 + 7, z * 90 + 3) - 0.5) * 0.0012;
      p.setY(i, corner * 0.0016 + bow * (1 - corner));
    }
    paperGeometry.computeVertexNormals();
  }

  const paperWet = { value: 0 };
  const paperMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
    // Only ever below 1 during the emergence fade; the paper lies flat on
    // the floor with nothing beneath it, so sorting can't misbehave.
    transparent: true
  });
  paperMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = paperWet;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSclLocal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSclLocal = position;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWet;
varying vec3 vSclLocal;
${NOISE_GLSL}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec2 plan = vSclLocal.xz;

  // Lab filter paper: soft buff, faint fibre mottle, never bright white —
  // the light rig is hot, so the base must sit well below blowout.
  float fibre = sclNoise(plan * 1600.0) * 0.6 + sclNoise(plan * 5200.0) * 0.4;
  vec3 paper = mix(vec3(0.3, 0.27, 0.195), vec3(0.4, 0.36, 0.27), fibre);

  // The soak stain: water blooms outward from under the crust with a
  // ragged margin — positional noise, not angular (angular wobble made
  // the edge streak radially like a star).
  float d = length(plan);
  float wobble = (sclNoise(plan * 280.0 + 5.0) - 0.5) * 0.005;
  float stainEdge = mix(${(CRUST_RADIUS * 0.55).toFixed(6)}, ${(PAPER_SIZE * 0.62).toFixed(6)}, uWet);
  float stain = 1.0 - smoothstep(stainEdge - 0.0035, stainEdge + 0.002, d + wobble);
  // Wet paper goes translucent grey-buff, darkest right under the crust.
  vec3 soaked = paper * vec3(0.3, 0.29, 0.3);
  paper = mix(paper, soaked, stain * (0.6 + 0.4 * uWet));
  float core = 1.0 - smoothstep(${(CRUST_RADIUS * 0.6).toFixed(6)}, ${(CRUST_RADIUS * 1.35).toFixed(6)}, d);
  paper = mix(paper, paper * 0.68, core * uWet);

  // A dried tide-line of leached pigment around the crust — the crust
  // bled amber into the paper long before it arrived here.
  float halo = smoothstep(${(CRUST_RADIUS * 0.85).toFixed(6)}, ${(CRUST_RADIUS * 1.05).toFixed(6)}, d) *
    (1.0 - smoothstep(${(CRUST_RADIUS * 1.05).toFixed(6)}, ${(CRUST_RADIUS * 1.5).toFixed(6)}, d));
  paper = mix(paper, vec3(0.38, 0.26, 0.12), halo * 0.3);

  diffuseColor.rgb = paper;
}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
{
  // Wet paper glosses faintly inside the stain.
  float dR = length(vSclLocal.xz);
  float stainR = 1.0 - smoothstep(0.0, mix(0.007, 0.026, uWet), dR);
  roughnessFactor = clamp(roughnessFactor - stainR * uWet * 0.25, 0.6, 1.0);
}`
      );
  };
  const paper = new THREE.Mesh(paperGeometry, paperMaterial);
  paper.position.set(0, FLOOR_Y + 0.0006, 0);
  paper.rotation.y = 0.12;
  group.add(paper);

  let plumpRevival = 0;
  let emergence = 0;
  let cracked = 0;

  /**
   * Revival plumps the crust a few percent; the pre-shatter heaves it —
   * the body beneath is swelling and the dome rises with it — and the
   * shatter drains it flat as the plates go.
   */
  function applyCrustTransform(): void {
    // Ease-in on the slump: the crust holds its shape while the first
    // plates go, then sags as its substance is drawn down into the body.
    const drained = emergence * emergence;
    const heave = 1 + 0.12 * cracked * (1 - drained);
    const spread = (1 + plumpRevival * 0.08) * (1 + drained * 0.06) * (1 + 0.03 * cracked);
    const height = (1 + plumpRevival * 0.12) * (1 - drained * 0.6) * heave;
    crust.scale.set(spread, Math.max(0.02, height), spread);
  }

  return {
    group,
    setState(moisture, revival) {
      wet.value = moisture;
      revive.value = revival;
      paperWet.value = moisture;
      plumpRevival = revival;
      applyCrustTransform();
    },
    setCracking(crackedAmount) {
      cracked = THREE.MathUtils.clamp(crackedAmount, 0, 1);
      crackedUniform.value = cracked;
      applyCrustTransform();
    },
    surfaceY(x, z) {
      const r = Math.min(1, Math.hypot(x, z) / CRUST_RADIUS);
      return heightAt(x, z, r) * crust.scale.y;
    },
    setEmergence(goneAmount) {
      emergence = THREE.MathUtils.clamp(goneAmount, 0, 1);
      gone.value = emergence;
      // The paper outlasts the crust, then soaks through and fades — by the
      // time the group is retired there is nothing left to pop.
      paperMaterial.opacity = 1 - THREE.MathUtils.smoothstep(emergence, 0.55, 1);
      paper.visible = paperMaterial.opacity > 0.002;
      applyCrustTransform();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      paperGeometry.dispose();
      paperMaterial.dispose();
    }
  };
}
