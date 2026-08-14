import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../marimo/rng';
import { makeStone, STONE_KINDS, type Stone, type StoneSize } from '../marimo/stones';
import { buildStoneGeometry } from '../marimo/stoneMesh';
import { BOX_HALF_X, BOX_HALF_Z, BOX_HEIGHT, FLOOR_Y, PEBBLE_COUNT } from './constants';
import { ROOM_GLSL, type SlimeRoomUniforms } from './roomLight';

/**
 * The terrarium: glass, and the substrate the slime lives on.
 *
 * Adapted from the marimo's `tankMesh.ts` with the water left behind — this
 * box is dry, which removes most of what made that file hard. What survives is
 * the one structural decision worth keeping: the two sides of the glass are
 * separate meshes with a deterministic draw order, because the far wall is a
 * backdrop that must go down first and the near wall is a transparent sheen
 * that must composite last. A single double-sided draw leaves that to triangle
 * order.
 *
 * The marimo's glass borrows its reflections from the water shader's room
 * model. There is no water shader here, so the "room" is three lines of GLSL:
 * a vertical gradient, warm above and dim below. All the glass needs from a
 * room is something plausible for the Fresnel sheen to reflect; at this size
 * on screen, a gradient is indistinguishable from a photograph.
 *
 * Everything opaque inside the box — substrate, pebbles, later the slime —
 * uses ordinary lit materials. The marimo could not (its light *was* the
 * water); a dry box has no such excuse, and MeshPhysicalMaterial's
 * transmission is exactly what a slime wants anyway.
 */

const GLASS_MARGIN = 0.004;
const IOR_GLASS = 1.52;
const IOR_AIR = 1.0;

const GLASS_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const GLASS_FRAGMENT = /* glsl */ `
precision highp float;

${ROOM_GLSL}

uniform vec3 uGlassTint;

varying vec3 vNormal;
varying vec3 vWorld;

const float R0 = ${(((IOR_GLASS - IOR_AIR) / (IOR_GLASS + IOR_AIR)) ** 2).toFixed(6)};

void main() {
  vec3 incident = normalize(vWorld - cameraPosition);
  vec3 outward = normalize(vNormal);
  // The near wall shows us its outside; the far wall its inside.
  bool nearWall = dot(outward, incident) < 0.0;
  vec3 n = nearWall ? outward : -outward;

  float cosIncident = clamp(dot(-incident, n), 0.0, 1.0);
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - cosIncident, 5.0);
  vec3 sheen = roomRadiance(reflect(incident, n)) * fresnel;

  // Every pane is genuine transparent glass: clean by default, and the only
  // dirt it ever shows is the grime quads' dried slime, laid where the pet
  // actually pressed. The glass shader's own job is just the Fresnel sheen.
  vec3 color = sheen;
  float alpha = clamp(fresnel + 0.04, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * A rock laid in the tank: the marimo generator's pure shape, at a spot, with
 * a turn. The solver collides with the same description this is drawn from,
 * and the springtails walk around the bounding circle.
 */
export interface TankRock {
  stone: Stone;
  x: number;
  y: number;
  z: number;
  /** Turn about Y, radians. A laid stone is turned, never tipped. */
  yaw: number;
  /** Horizontal bounding circle, metres — the footprint others avoid. */
  radius: number;
  /**
   * The built geometry's local-space vertices, xyz triples in metres —
   * fodder for a physics convex hull, saved here so nobody has to build
   * the stone a second time. Pose is (x, y, z) plus the yaw.
   */
  points: Float32Array;
}

export interface TerrariumBundle {
  group: THREE.Group;
  /** The tank's rocks, as the solver and the springtails need them. */
  rocks: TankRock[];
  /** The ground's height above FLOOR_Y at (x, z) — the moss bed's relief. */
  groundHeightAt(x: number, z: number): number;
  dispose(): void;
}

export function createTerrarium(
  seed: number,
  /** The shared room block from `createRoomUniforms` — repainted live by the
   * lighting settings, so every material here spreads it rather than copying
   * its values. */
  room: SlimeRoomUniforms
): TerrariumBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  // --- the room -------------------------------------------------------------
  // The analytic room, made visible: an inverted sphere painted with the same
  // radiance every reflection samples — the marimo's backdrop, next door.
  // The camera sits inside it, so it is only a way to get a direction per
  // pixel. (The painted plant hedge that used to hang here is gone: the room
  // is an unlit study with one lamp now, and the hedge blanketed it.)
  const roomGeometry = new THREE.SphereGeometry(1.5, 32, 20);
  const roomMaterial = new THREE.ShaderMaterial({
    uniforms: { ...room },
    vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,
    fragmentShader: /* glsl */ `
precision highp float;
${ROOM_GLSL}
varying vec3 vWorld;
void main() {
  gl_FragColor = vec4(roomRadiance(normalize(vWorld - cameraPosition)), 1.0);
}
`,
    side: THREE.BackSide,
    depthWrite: false
  });
  const room3 = new THREE.Mesh(roomGeometry, roomMaterial);
  room3.renderOrder = -10;
  room3.frustumCulled = false;
  group.add(room3);
  disposables.push(roomGeometry, roomMaterial);

  // --- pedestal -------------------------------------------------------------
  // The plinth the box stands on, lit by nothing but the room (sampled along
  // the normal) and falling to darkness going down — the marimo's pedestal,
  // with the same per-tone albedo and fall-off riding the room block.
  const pedestalGeometry = new THREE.BoxGeometry(
    BOX_HALF_X * 2 * 1.45,
    0.4,
    BOX_HALF_Z * 2 * 1.45
  );
  const pedestalTop = FLOOR_Y - 0.006;
  const pedestalMaterial = new THREE.ShaderMaterial({
    uniforms: { ...room, uTopY: { value: pedestalTop } },
    vertexShader: /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,
    fragmentShader: /* glsl */ `
precision highp float;
${ROOM_GLSL}
uniform vec3  uPedestalColour;
uniform float uPedestalFalloff;
uniform float uTopY;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 colour = uPedestalColour * roomRadiance(normalize(vNormal));
  colour *= exp(-max(0.0, uTopY - vWorld.y) / uPedestalFalloff);
  gl_FragColor = vec4(colour, 1.0);
}
`
  });
  const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
  pedestal.position.y = pedestalTop - 0.2;
  pedestal.renderOrder = -8;
  group.add(pedestal);
  disposables.push(pedestalGeometry, pedestalMaterial);

  // --- substrate ------------------------------------------------------------
  // The bed is dressed in photographic PBR sets from ambientCG (CC0):
  // Ground048 (forest floor) for the soil, Moss002 for the tufts — colour,
  // normal, roughness and occlusion, vendored under /images/slime at 512px.
  // Loading is async and needs a DOM Image, so headless callers (the GLSL
  // compile test) simply get the untextured materials: the maps are dressing,
  // never structure.
  const loadMap = (
    file: string,
    opts: { srgb?: boolean; repeat?: [number, number]; channel?: number } = {}
  ): THREE.Texture | null => {
    if (typeof document === 'undefined') return null;
    const texture = new THREE.TextureLoader().load(`/images/slime/${file}`);
    if (opts.srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) texture.repeat.set(...opts.repeat);
    if (opts.channel !== undefined) texture.channel = opts.channel;
    disposables.push(texture);
    return texture;
  };
  // The box is 12 × 9 cm; two repeats across keep the leaf litter's features
  // small enough to read at terrarium scale, and 2 × 1.5 keeps texels square.
  const groundRepeat: [number, number] = [2, 1.5];
  const groundMaps = {
    map: loadMap('Ground048_1K-JPG_Color.jpg', { srgb: true, repeat: groundRepeat }),
    normalMap: loadMap('Ground048_1K-JPG_NormalGL.jpg', { repeat: groundRepeat }),
    roughnessMap: loadMap('Ground048_1K-JPG_Roughness.jpg', { repeat: groundRepeat }),
    // The floor geometry only carries `uv`; aoMap defaults to channel 1.
    aoMap: loadMap('Ground048_1K-JPG_AmbientOcclusion.jpg', { repeat: groundRepeat, channel: 0 })
  };

  // The soil's value noise survives the texturing: the ground's relief and
  // the tuft placement still ride it, so the topography stays seeded.
  const soilRand = mulberry32((seed ^ 0x51f15e) >>> 0);
  const fine = new Float32Array(16 * 16);
  for (let i = 0; i < fine.length; i++) fine[i] = soilRand();
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sampleGrid = (g: Float32Array, n: number, u: number, v: number) => {
    const x = u * n;
    const y = v * n;
    // True torus wrap. JS `%` keeps the sign, and u/v dip a hair below zero
    // in real use: the floor plane's float32 vertices round 0.045 *up*, so
    // the rim row normalises to −2e-8 — with plain `%` that indexed g[−16…],
    // and a whole edge row of the ground went NaN.
    const x0 = ((Math.floor(x) % n) + n) % n;
    const y0 = ((Math.floor(y) % n) + n) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const tx = smooth(x - Math.floor(x));
    const ty = smooth(y - Math.floor(y));
    return lerp(
      lerp(g[y0 * n + x0], g[y0 * n + x1], tx),
      lerp(g[y1 * n + x0], g[y1 * n + x1], tx),
      ty
    );
  };
  // --- the ground's lie of the land ----------------------------------------
  // A real moss bed is not a billiard table: it mounds where the moss has
  // built itself up and dips where the soil shows. A few seeded gaussian
  // mounds plus a whisper of the soil noise give the bed its topography —
  // but the *centre stays flat*, because the physics floor is a plane at
  // FLOOR_Y and the pet rests, crawls and takes its oats there; the mounds
  // belong to the margins the body never simulates against. The same
  // function seats every tuft, so moss and ground always agree.
  const moundRand = mulberry32((seed ^ 0x700d) >>> 0);
  const mounds: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    // x, z, amplitude (m), radius (m) — parked in the outer band.
    const angle = moundRand() * Math.PI * 2;
    const reach = 0.55 + moundRand() * 0.45;
    mounds.push([
      Math.cos(angle) * BOX_HALF_X * reach,
      Math.sin(angle) * BOX_HALF_Z * reach,
      0.0012 + moundRand() * 0.0022,
      0.012 + moundRand() * 0.014
    ]);
  }
  const groundHeight = (x: number, z: number): number => {
    let h = 0;
    for (const [mx, mz, amp, radius] of mounds) {
      const dx = x - mx;
      const dz = z - mz;
      h += amp * Math.exp(-(dx * dx + dz * dz) / (radius * radius));
    }
    // A whisper of the soil mottle as fine relief, ±0.4 mm.
    h +=
      (sampleGrid(fine, 16, (x / BOX_HALF_X) * 0.5 + 0.5, (z / BOX_HALF_Z) * 0.5 + 0.5) - 0.5) *
      0.0008;
    // The flat centre: fade all relief inside the pet's resting patch.
    const centre = Math.hypot(x / BOX_HALF_X, z / BOX_HALF_Z);
    const k = smooth(Math.min(1, Math.max(0, (centre - 0.3) / 0.45)));
    return Math.max(0, h * k);
  };

  const floorGeometry = new THREE.PlaneGeometry(BOX_HALF_X * 2, BOX_HALF_Z * 2, 48, 36);
  {
    const pos = floorGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Local (x, y) with rotation.x = -PI/2 lands at world (x, -y); the
      // local z axis becomes world up.
      pos.setZ(i, groundHeight(pos.getX(i), -pos.getY(i)));
    }
    floorGeometry.computeVertexNormals();
  }
  const floorMaterial = new THREE.MeshStandardMaterial({
    ...groundMaps,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  group.add(floor);
  disposables.push(floorGeometry, floorMaterial);

  // --- the soil's cross-section --------------------------------------------
  // Seen through the glass, a terrarium's bed is a *stratum*: a band of dark
  // earth pressed against the pane, with the moss on top of it. Without it
  // the displaced plane reads as a sheet of paper floating over the plinth —
  // its rim was literally zero-thickness. So the bed gets a skirt: four
  // strips dropping from the heightfield's rim down to the pedestal top,
  // sharing the soil mottle but tinted darker and damper, the way earth
  // pressed on glass actually looks.
  const SKIRT_BOTTOM = FLOOR_Y - 0.006;
  const skirtPositions: number[] = [];
  const skirtNormals: number[] = [];
  const skirtUvs: number[] = [];
  const skirtIndices: number[] = [];
  const addSkirtStrip = (
    // Parametric edge: point(t) for t in 0..1, and the outward normal.
    point: (t: number) => [number, number],
    normal: [number, number, number],
    segments: number
  ) => {
    const base = skirtPositions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const [x, z] = point(t);
      const top = FLOOR_Y + groundHeight(x, z);
      skirtPositions.push(x, top, z, x, SKIRT_BOTTOM, z);
      skirtNormals.push(...normal, ...normal);
      skirtUvs.push(t * 4, 1, t * 4, 0);
      if (i < segments) {
        const a = base + i * 2;
        skirtIndices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
  };
  const hx = BOX_HALF_X;
  const hz = BOX_HALF_Z;
  addSkirtStrip((t) => [-hx + t * 2 * hx, hz], [0, 0, 1], 48);
  addSkirtStrip((t) => [hx - t * 2 * hx, -hz], [0, 0, -1], 48);
  addSkirtStrip((t) => [-hx, -hz + t * 2 * hz], [-1, 0, 0], 36);
  addSkirtStrip((t) => [hx, hz - t * 2 * hz], [1, 0, 0], 36);
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(skirtNormals, 3));
  skirtGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUvs, 2));
  skirtGeometry.setIndex(skirtIndices);
  // The strip is 6 mm tall against 12 cm long, so it loads the ground colour
  // again with its own repeat — the baked UVs run t·4 across and 0..1 up, and
  // (1, 0.2) keeps the texels square instead of squashing a metre of forest
  // floor into the rim. (A separate load, not a clone: a clone taken before
  // the image arrives never receives it. The browser cache makes the second
  // fetch free.)
  const skirtMaterial = new THREE.MeshStandardMaterial({
    map: loadMap('Ground048_1K-JPG_Color.jpg', { srgb: true, repeat: [1, 0.2] }),
    // The litter survives; the tint takes it down to damp pressed earth.
    color: 0x8a7a66,
    roughness: 1
  });
  const skirt = new THREE.Mesh(skirtGeometry, skirtMaterial);
  skirt.receiveShadow = true;
  group.add(skirt);
  disposables.push(skirtGeometry, skirtMaterial);

  // --- moss -----------------------------------------------------------------
  // Two instanced tuft layers, dark and bright, so the bed has depth without
  // a single leaf being modelled. Low: the slime rests *on* the moss, and
  // nothing may read as impaling it.
  // Detail 2, not 1: the Moss002 displacement map needs vertices to push.
  // 162 verts × ~1000 instances is still a small draw, and the displaced
  // surface is what turns a smooth green pebble back into a cushion.
  const tuftGeometry = new THREE.IcosahedronGeometry(1, 2);
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  // Moss grows in cushions, not confetti: a set of seeded clump centres, and
  // most tufts placed as a gaussian scatter around one of them. Clumps sit
  // preferentially on the mounds (moss builds the mound in the first place),
  // and the loose remainder keeps the bed from reading as polka dots.
  const clumps: Array<[number, number]> = [];
  while (clumps.length < 26) {
    const cx = (rand() * 2 - 1) * (BOX_HALF_X - 0.004);
    const cz = (rand() * 2 - 1) * (BOX_HALF_Z - 0.004);
    // Accept-reject toward high ground: mound tops always qualify, hollows
    // only sometimes.
    if (rand() < 0.25 + groundHeight(cx, cz) / 0.0045) clumps.push([cx, cz]);
  }
  /** A gaussian-ish scatter: sum of two uniforms, centred. */
  const scatter = () => (rand() + rand() - 1) * 0.009;

  // Every tuft wears the Moss002 set; the random per-instance rotation lands
  // each one on a different patch of the mapped sphere, so no two tufts
  // repeat. The repeat zooms into a ~30 cm patch of the metre sheet: a whole
  // metre of moss wrapped around a 2 mm ball averages out to sub-texel mush,
  // where a patch keeps the fronds' clumping visible at tuft scale. The
  // texture is seamless, so the wrap stays clean.
  const mossRepeat: [number, number] = [0.3, 0.3];
  const mossMaps = {
    map: loadMap('Moss002_1K-JPG_Color.jpg', { srgb: true, repeat: mossRepeat }),
    normalMap: loadMap('Moss002_1K-JPG_NormalGL.jpg', { repeat: mossRepeat }),
    roughnessMap: loadMap('Moss002_1K-JPG_Roughness.jpg', { repeat: mossRepeat }),
    aoMap: loadMap('Moss002_1K-JPG_AmbientOcclusion.jpg', { repeat: mossRepeat, channel: 0 }),
    displacementMap: loadMap('Moss002_1K-JPG_Displacement.jpg', { repeat: mossRepeat })
  };

  const layers: Array<{
    color: number;
    count: number;
    low: number;
    high: number;
    /** What share of this layer huddles into clumps rather than scattering. */
    clumped: number;
  }> = [
    // The big dark layer carries coverage everywhere; the mid layer carries
    // the green and mostly huddles; the bright tips are new growth on the
    // cushions' crowns, sparse enough to read as catchlights, not confetti.
    // The photograph carries the green now, so these are near-neutral
    // multipliers that only keep the three layers' dark/mid/bright ranking.
    { color: 0x6e785e, count: Math.floor(PEBBLE_COUNT * 1.6), low: 0.0009, high: 0.0024, clumped: 0.45 },
    { color: 0xa2b184, count: Math.floor(PEBBLE_COUNT * 1.2), low: 0.0006, high: 0.0016, clumped: 0.75 },
    { color: 0xdce8b2, count: Math.floor(PEBBLE_COUNT * 0.2), low: 0.0005, high: 0.001, clumped: 0.85 }
  ];
  const tuftColor = new THREE.Color();
  for (const layer of layers) {
    const material = new THREE.MeshStandardMaterial({
      ...mossMaps,
      color: 0xffffff,
      roughness: 1,
      // Displacement in the unit sphere's local space, so instance scale
      // shrinks it with the tuft: ±20% of radius, centred so the mean
      // radius (and the seating depth in the bed) stays put.
      displacementScale: 0.4,
      displacementBias: -0.2
    });
    const tufts = new THREE.InstancedMesh(tuftGeometry, material, layer.count);
    // Tuft-on-tuft shadowing is what turns green gravel into a moss bed:
    // cushions shade their own flanks, hollows go genuinely dark.
    tufts.castShadow = true;
    tufts.receiveShadow = true;
    for (let i = 0; i < layer.count; i++) {
      const s = layer.low + rand() * (layer.high - layer.low);
      let x: number;
      let z: number;
      if (rand() < layer.clumped) {
        const [cx, cz] = clumps[Math.floor(rand() * clumps.length)];
        x = cx + scatter();
        z = cz + scatter();
      } else {
        x = (rand() * 2 - 1) * (BOX_HALF_X - s);
        z = (rand() * 2 - 1) * (BOX_HALF_Z - s);
      }
      x = Math.min(BOX_HALF_X - s, Math.max(-(BOX_HALF_X - s), x));
      z = Math.min(BOX_HALF_Z - s, Math.max(-(BOX_HALF_Z - s), z));
      const ground = groundHeight(x, z);
      position.set(x, FLOOR_Y + ground - s * 0.55 + rand() * s * 0.25, z);
      euler.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
      quaternion.setFromEuler(euler);
      scale.set(s, s * (0.7 + rand() * 0.5), s * (0.85 + rand() * 0.3));
      tufts.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      // Per-tuft tint jitter around the layer's green — hue wobble is what
      // separates a moss bed from green gravel. Lightness jitter stays small
      // (value contrast is grit sparkle), but high ground gets a deliberate
      // lift: cushion crowns catch the lamp, hollows hold their shadow.
      tuftColor.setHex(layer.color);
      tuftColor.offsetHSL(
        (rand() - 0.5) * 0.045,
        (rand() - 0.5) * 0.15,
        (rand() - 0.5) * 0.05 + (ground / 0.0045) * 0.045
      );
      tufts.setColorAt(i, tuftColor);
    }
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    group.add(tufts);
    disposables.push(material);
  }
  disposables.push(tuftGeometry);

  // --- the rocks ------------------------------------------------------------
  // Every tank ships with a few river stones, laid where its seed says — the
  // visitor's landmarks. They come from the marimo's stone generator:
  // `makeStone` is a pure function of kind, seed and size, so the same tank
  // seed lays the same rocks every visit, and the solver collides with the
  // very `stoneSurface` this geometry is walked from — the goo rests on
  // exactly what the visitor sees, not on an invisible shell.
  //
  // The marimo bakes its colours into an `aStoneColour` vec4 for its own
  // underwater shader; here the rgb moves into a standard `color` attribute
  // and the gloss becomes the material's roughness, because a dry stone
  // under room light needs nothing the stock material cannot do.
  const stoneRand = mulberry32((seed ^ 0x570e) >>> 0);
  const rocks: TankRock[] = [];
  const ROCK_SIZES: readonly StoneSize[] = ['medium', 'small', 'small'];
  for (const rockSize of ROCK_SIZES) {
    const kind = STONE_KINDS[Math.floor(stoneRand() * STONE_KINDS.length)];
    const stone = makeStone(kind, Math.floor(stoneRand() * 4294967296) >>> 0, rockSize);
    const built = buildStoneGeometry(stone);
    const reach = Math.hypot(built.extents[0], built.extents[2]);

    // The old single cobble's polar placement, retried until this rock is
    // clear of the ones already down. Three small rocks in a tank this size
    // always find room; the fallback is only against a pathological seed.
    let cx = 0;
    let cz = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = stoneRand() * Math.PI * 2;
      const spread = 0.35 + stoneRand() * 0.4;
      cx = Math.cos(angle) * (BOX_HALF_X - reach - 0.006) * spread * 2;
      cz = Math.sin(angle) * (BOX_HALF_Z - reach - 0.006) * spread * 2;
      cx = Math.min(BOX_HALF_X - reach - 0.006, Math.max(-(BOX_HALF_X - reach - 0.006), cx));
      cz = Math.min(BOX_HALF_Z - reach - 0.006, Math.max(-(BOX_HALF_Z - reach - 0.006), cz));
      const clear = rocks.every(
        (other) => Math.hypot(cx - other.x, cz - other.z) > reach + other.radius + 0.004
      );
      if (clear) break;
    }
    // Bedded like the marimo's own resting rule: centred about a third of
    // its half-height up from the local ground, so it sits in the moss
    // rather than on it.
    const cy = FLOOR_Y + groundHeight(cx, cz) + built.extents[1] * 0.35;
    const yaw = stoneRand() * Math.PI * 2;

    const rgba = built.geometry.getAttribute('aStoneColour') as THREE.BufferAttribute;
    const rgb = new Float32Array(rgba.count * 3);
    for (let i = 0; i < rgba.count; i++) {
      rgb[i * 3] = rgba.getX(i);
      rgb[i * 3 + 1] = rgba.getY(i);
      rgb[i * 3 + 2] = rgba.getZ(i);
    }
    built.geometry.deleteAttribute('aStoneColour');
    built.geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));

    const rockMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1 - kind.gloss * 0.55,
      metalness: 0
    });
    const rockMesh = new THREE.Mesh(built.geometry, rockMaterial);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    rockMesh.position.set(cx, cy, cz);
    rockMesh.rotation.y = yaw;
    group.add(rockMesh);
    disposables.push(built.geometry, rockMaterial);

    const positionAttr = built.geometry.getAttribute('position') as THREE.BufferAttribute;
    const points = new Float32Array(positionAttr.array as Float32Array);
    rocks.push({ stone, x: cx, y: cy, z: cz, yaw, radius: reach, points });
  }

  // --- glass ----------------------------------------------------------------
  const glassGeometry = new THREE.BoxGeometry(
    (BOX_HALF_X + GLASS_MARGIN) * 2,
    BOX_HEIGHT + GLASS_MARGIN,
    (BOX_HALF_Z + GLASS_MARGIN) * 2
  );

  function makeGlassMaterial(farWall: boolean): THREE.ShaderMaterial {
    // Both walls are transparent now — the far one composites over the
    // plants and the room dome instead of impersonating them.
    return new THREE.ShaderMaterial({
      uniforms: {
        ...room,
        uGlassTint: { value: new THREE.Vector3(0.93, 0.97, 0.98) }
      },
      vertexShader: GLASS_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: farWall ? THREE.BackSide : THREE.FrontSide
    });
  }

  const glassPosition = new THREE.Vector3(0, FLOOR_Y + (BOX_HEIGHT + GLASS_MARGIN) / 2 - 0.001, 0);

  const farGlassMaterial = makeGlassMaterial(true);
  const glassFar = new THREE.Mesh(glassGeometry, farGlassMaterial);
  glassFar.position.copy(glassPosition);
  glassFar.renderOrder = -1;
  group.add(glassFar);

  const nearGlassMaterial = makeGlassMaterial(false);
  const glassNear = new THREE.Mesh(glassGeometry, nearGlassMaterial);
  glassNear.position.copy(glassPosition);
  glassNear.renderOrder = 3;
  group.add(glassNear);

  disposables.push(glassGeometry, farGlassMaterial, nearGlassMaterial);

  const edgeGeometry = new THREE.EdgesGeometry(glassGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xd8e8ec,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.position.copy(glassPosition);
  edges.renderOrder = 4;
  group.add(edges);
  disposables.push(edgeGeometry, edgeMaterial);

  return {
    group,
    rocks,
    groundHeightAt: groundHeight,
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}
