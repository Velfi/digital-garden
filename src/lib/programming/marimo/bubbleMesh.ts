import * as THREE from 'three';
import { FILAMENT_LENGTH_FRAC, WATER_Y } from './constants';
import {
  IOR_AIR,
  IOR_WATER,
  LIGHTING_GLSL,
  ROOM_GLSL,
  WATER_GLSL,
  type LightUniforms,
  type RoomUniforms,
  type WaterUniforms
} from './waterShader';
import {
  aspectRatio,
  attachedRadius,
  canFragment,
  clingDuration,
  FRAGMENT_COUNT,
  fragmentDecay,
  fragmentRadius,
  fragmentSpeed,
  releaseChance,
  riseSpeed,
  sampleRadius,
  spiralOmega,
  wobbleRadius
} from './bubblePhysics';

/**
 * Bubbles as actual spheres of air, not sprites.
 *
 * Every bubble is one camera-facing quad, and the fragment shader intersects
 * the view ray with the ellipsoid the quad stands in for. That gives a real
 * surface normal at every pixel, which is the whole point: an air bubble in
 * water has no colour and no texture of its own, so *all* of what it looks like
 * comes from what the normal does to the light. Draw the normal properly and
 * the bubble appears; paint a rim and a glint onto a disc and you get a decal
 * that slides as the camera turns.
 *
 * The one thing worth knowing about bubbles seen underwater is that the ray is
 * going from dense to rare — water into air — so it can be totally internally
 * reflected, and it is, for every part of the bubble beyond the critical angle.
 * On a sphere the incidence angle reaches 48.75 degrees at exactly 75% of the
 * way out to the silhouette, so the outer quarter of every bubble is a perfect
 * mirror. That is the bright silver ring you see on real bubbles, and here it
 * is not drawn — it falls out of the geometry, which is why it stays put on the
 * correct side as the bubble tumbles.
 *
 * The whole pool is one instanced draw call.
 */

/**
 * Roomy for what the jar makes on its own — the fizz alone never fills a third
 * of it. The headroom is for breaking bubbles, which arrive four at a time and
 * can do so as fast as somebody can click. Dead slots cost four degenerate
 * vertices a frame and nothing else, so the slack is close to free.
 */
const POOL = 256;

/** Quad corners, expanded in the vertex shader to cover the silhouette. */
const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const INDICES = [0, 1, 2, 2, 1, 3];

/**
 * The four directions the fragments of a broken bubble leave along: the
 * vertices of a regular tetrahedron, which is the evenest four directions there
 * are and the reason `FRAGMENT_COUNT` is what it is. They sum to zero, so the
 * cloud does not drift off sideways from an event that had no sideways to it.
 * Randomly reoriented on every break, so no two look alike.
 */
const RT3 = 1 / Math.sqrt(3);
const TETRAHEDRON: ReadonlyArray<readonly [number, number, number]> = [
  [RT3, RT3, RT3],
  [RT3, -RT3, -RT3],
  [-RT3, RT3, -RT3],
  [-RT3, -RT3, RT3]
];

/**
 * How much bigger than the bubble's radius the billboard is drawn. The extra
 * covers the perspective widening of a sphere's silhouette at close range plus
 * a pixel of antialiasing; anything the ray misses is discarded anyway.
 */
const BILLBOARD_PAD = 1.3;

const BUBBLE_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec3 iCentre;
attribute float iRadius;
attribute float iAspect;
attribute float iFade;

varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vAspect;
varying float vFade;

void main() {
  vCentre = iCentre;
  vRadius = iRadius;
  vAspect = iAspect;
  vFade = iFade;

  if (iFade <= 0.0 || iRadius <= 0.0) {
    // Dead slot: collapse it off-screen rather than paying for a discard.
    vWorld = iCentre;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // Rows of the view matrix are the camera's basis in world space.
  vec3 camRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 camUp    = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));

  vWorld = iCentre + (camRight * aCorner.x + camUp * aCorner.y) * iRadius * ${BILLBOARD_PAD.toFixed(2)};
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const BUBBLE_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${ROOM_GLSL}
${LIGHTING_GLSL}

uniform vec3  uBallCentre;
uniform float uBallRadius;
uniform vec3  uBallColour;

varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vAspect;
varying float vFade;

const float ETA_WATER_TO_AIR = ${(IOR_WATER / IOR_AIR).toFixed(6)};
const float ETA_AIR_TO_WATER = ${(IOR_AIR / IOR_WATER).toFixed(6)};
const float R0 = ${(((IOR_WATER - IOR_AIR) / (IOR_WATER + IOR_AIR)) ** 2).toFixed(6)};

/**
 * How much of what is behind the bubble we draw ourselves rather than letting
 * through. The refracted view really should be a read of the framebuffer, which
 * would cost a scene grab for objects a couple of millimetres across; instead
 * the transmitted lobe samples the same room-through-water model everything
 * else here uses, and is blended in at partial opacity so the true background
 * shows through underneath. At this size the difference is invisible and the
 * warping — which is the part you actually notice — is exact.
 */
const float TRANSMIT_OPACITY = 0.55;

/**
 * Radiance arriving at a point inside the jar from a given direction: the
 * environment a bubble mirrors and refracts.
 *
 * Underwater this is emphatically not a sphere of room. Every direction above
 * 48.75 degrees from vertical is *outside* — the whole room, lamp included,
 * squeezed into Snell's window overhead. Everything else is the inside of the
 * jar: the murk, brighter near the top where the lamp reaches it, falling away
 * to the unlit gravel below. So a bubble is bright-capped and dark-bellied for
 * the same reason the water is, and the cap moves correctly as it tumbles
 * rather than sitting on the sprite like a sticker.
 */
vec3 tankRadiance(vec3 dir, vec3 from) {
  vec3 d = normalize(dir);

  // The jar's own interior, seen at two millimetres of resolution: the volume's
  // ambient glow, shaded down toward the gravel. Standing in for the walls, the
  // bed and anything floating, none of which a bubble this size resolves.
  vec3 interior =
    uScatterColour * mix(0.22, 1.0, clamp(d.y * 0.5 + 0.5, 0.0, 1.0)) * overheadShade(from.y);

  // Except the marimo, which a bubble absolutely does resolve — the fizz is
  // born on its surface, so for the first centimetre of the climb the ball
  // fills half of what each bubble can see. Without it they mirror an empty
  // green-black room while sitting against a bright green ball, which is the
  // one place the eye is guaranteed to be looking.
  vec3 toBall = uBallCentre - from;
  float along = dot(toBall, d);
  float perpendicular2 = dot(toBall, toBall) - along * along;
  float ballR2 = uBallRadius * uBallRadius;
  if (along > 0.0 && perpendicular2 < ballR2) {
    vec3 surface = from + d * (along - sqrt(ballR2 - perpendicular2));
    vec3 lit = uBallColour * twoLightDiffuse(normalize(surface - uBallCentre)) * overheadShade(surface.y);
    vec3 midpoint;
    float crossed = waterPathLength(from, surface, midpoint);
    return applyWaterOverDistance(lit, crossed, scatteredShade(midpoint.y));
  }

  float cosWater = clamp(d.y, 0.0, 1.0);
  float sin2Air = ETA_WATER_TO_AIR * ETA_WATER_TO_AIR * (1.0 - cosWater * cosWater);
  if (sin2Air >= 1.0) return interior;    // past the critical angle: no window

  vec3 outward = refract(d, vec3(0.0, -1.0, 0.0), ETA_WATER_TO_AIR);
  vec3 midpoint;
  float depth = waterPathLength(from, from + d * 0.3, midpoint);
  vec3 window = applyWaterOverDistance(roomRadiance(outward), depth, scatteredShade(midpoint.y));

  // Fresnel at the surface, on the transmitted angle as always: near the edge
  // of the window almost nothing gets through and the surface turns back into
  // a mirror on the tank. That is the rim of Snell's window, and a bubble
  // catches it as a bright arc.
  float cosAir = sqrt(max(0.0, 1.0 - sin2Air));
  float surfaceFresnel = R0 + (1.0 - R0) * pow(1.0 - cosAir, 5.0);
  return mix(window, interior, surfaceFresnel);
}

void main() {
  if (vFade <= 0.0) discard;

  vec3 radii = vec3(vRadius, vRadius * vAspect, vRadius);
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);

  // Squash the ray into the space where the ellipsoid is a unit sphere.
  vec3 o = (ro - vCentre) / radii;
  vec3 d = rd / radii;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - 1.0;

  // Squared closest approach of the ray to the centre, in that space: exactly
  // 1.0 on the silhouette. Deriving the edge from it gives a screen-space
  // antialiased outline for free, which matters a lot at these sizes — a hard
  // discard makes a 6-pixel bubble crawl with stair-steps as it rises.
  float s = c + 1.0 - (b * b) / a;
  float w = max(fwidth(s), 1e-5);
  float coverage = 1.0 - smoothstep(1.0 - w, 1.0 + w, s);
  if (coverage <= 0.0) discard;

  float disc = max(0.0, b * b - a * c);
  float sq = sqrt(disc);
  float tHit = (-b - sq) / a;
  if (tHit < 0.0) discard;                       // camera is inside the bubble

  vec3 hit = ro + rd * tHit;
  vec3 n = normalize((hit - vCentre) / (radii * radii));

  // Water into air: dense to rare, so past the critical angle there is no
  // transmitted ray at all and the surface is a mirror. The normal faces the
  // camera and the view ray runs away from it, so the incidence cosine is taken
  // against the reversed ray.
  float cosI = clamp(dot(n, -rd), 0.0, 1.0);
  float sin2T = ETA_WATER_TO_AIR * ETA_WATER_TO_AIR * (1.0 - cosI * cosI);
  bool totalInternal = sin2T > 1.0;
  float cosT = sqrt(max(0.0, 1.0 - sin2T));
  // Schlick on the transmitted angle, as everywhere else here that light
  // leaves water — on the incident angle it would badly undersell the rim.
  float fresnel = totalInternal ? 1.0 : R0 + (1.0 - R0) * pow(1.0 - cosT, 5.0);

  vec3 reflected = tankRadiance(reflect(rd, n), hit);

  // Through the bubble: refract in, cross the air, refract out. Two interfaces,
  // and the sphere makes the second intersection a closed form, so this is the
  // real path rather than a single fudged offset. It is also why the middle of
  // a bubble shows the tank upside down and shrunk — a sphere of air in water
  // is a diverging lens.
  vec3 transmitted = vec3(0.0);
  if (!totalInternal) {
    vec3 inside = refract(rd, n, ETA_WATER_TO_AIR);
    if (dot(inside, inside) > 1e-12) {
      vec3 io = (hit - vCentre) / radii;
      vec3 id = inside / radii;
      float ia = dot(id, id);
      float ib = dot(io, id);
      float ic = dot(io, io) - 1.0;
      float tExit = (-ib + sqrt(max(0.0, ib * ib - ia * ic))) / ia;
      vec3 exitPoint = hit + inside * tExit;
      // Facing back into the bubble, which is the side the interior ray hits.
      vec3 exitN = normalize(-(exitPoint - vCentre) / (radii * radii));
      vec3 outward = refract(inside, exitN, ETA_AIR_TO_WATER);
      if (dot(outward, outward) > 1e-12) transmitted = tankRadiance(outward, exitPoint);
    }
  }

  float wReflect = fresnel;
  float wTransmit = (1.0 - fresnel) * TRANSMIT_OPACITY;
  float weight = max(wReflect + wTransmit, 1e-4);
  vec3 colour = (reflected * wReflect + transmitted * wTransmit) / weight;

  // Everything reaching the camera from the bubble crossed the water first.
  colour = applyWater(colour, hit);

  float alpha = weight * vFade * coverage;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour * uExposure, alpha);
}
`;

/**
 * Puts a world point on the screen: `out` receives its pixel coordinates and
 * the number of pixels a metre spans at that depth, or a scale of zero if the
 * point is behind the camera.
 *
 * Picking has to happen in pixels rather than in metres. These bubbles are a
 * quarter of a millimetre to a millimetre and a half across in a jar eleven
 * centimetres wide, which is a handful of pixels each — a world-space hit test
 * against something that small is a game of hunt-the-pixel, and it gets harder
 * the further back the bubble is, which is precisely backwards.
 */
export type ScreenProjector = (
  x: number,
  y: number,
  z: number,
  out: [number, number, number]
) => void;

/**
 * A particular bubble, or -1 for none.
 *
 * Not a pool index. A press and the release that follows it are as much as a
 * second apart, over which a bubble climbs a good few millimetres and the slot
 * it lives in may have been recycled twice by fizz from the other side of the
 * jar — so a bare index would sometimes break a completely different bubble
 * than the one that was pressed. The handle carries the slot's reuse count
 * alongside it, and goes stale the instant that slot is handed to anything
 * else. Opaque: the only things that may read it are `pick` and `pop`.
 */
export type BubbleHandle = number;

export interface BubbleBundle {
  points: THREE.Mesh;
  /**
   * A puff of bubbles, already free of the ball. This is gas being *expelled* —
   * a vent, a squeeze — not gas growing on the surface, so it does not cling.
   */
  burst(x: number, y: number, z: number, radius: number, count: number): void;
  /**
   * Ambient photosynthetic fizz: `rate` new nucleation sites per second,
   * accumulated across frames. These start pinned to the coat and stay there
   * until they have grown enough to let go.
   */
  trickle(x: number, y: number, z: number, radius: number, dt: number, rate: number): void;
  /**
   * Shake clinging bubbles loose outright. `chance` is the independent
   * per-bubble probability of detaching this instant — 1 strips the ball bare.
   */
  release(chance: number): void;
  /**
   * Shake clinging bubbles loose by dragging the ball through the water at
   * `slipSpeed`. Per-frame, and per-bubble, since which ones come off depends
   * on how big they are. Bubbles rolled under by the ball turning come off on
   * their own, in `update`.
   */
  shear(slipSpeed: number, dt: number): void;
  /** How many bubbles are currently stuck to the marimo, waiting to let go. */
  clingingCount(): number;
  /**
   * Every bubble within `padPx` of a point on screen, as handles for `pop`.
   *
   * All of them, deliberately, rather than the best of them. A bubble is a few
   * pixels across and the reach around one is a fingertip, so in a busy jar a
   * tap covers several — and picking a winner from those means inventing a rule
   * for which one you *meant*, which is a rule that can be wrong. Breaking
   * everything under the tap can't be: whatever you were aiming at is in there.
   */
  pick(toScreen: ScreenProjector, screenX: number, screenY: number, padPx: number): BubbleHandle[];
  /**
   * Break a bubble into fragments. Returns how many it made — zero if the
   * handle is stale or the bubble is too small to break, neither of which is a
   * failure so much as the answer. Works on a clinging bubble too: being torn
   * off its filament is the least of what is happening to it.
   */
  pop(handle: BubbleHandle): number;
  update(dt: number, flow: (x: number, y: number, z: number, out: Flow) => void): void;
  /**
   * Where the marimo is and how it is turned, so bubbles can mirror it and the
   * ones stuck to it can ride its surface. Pushed every frame.
   */
  setBall(
    x: number,
    y: number,
    z: number,
    radiusM: number,
    qx?: number,
    qy?: number,
    qz?: number,
    qw?: number
  ): void;
  dispose(): void;
}

type Flow = [number, number, number];

export function createBubbles(
  water: WaterUniforms,
  room: RoomUniforms,
  light: LightUniforms,
  ballColour: THREE.IUniform<THREE.Color>
): BubbleBundle {
  const centres = new Float32Array(POOL * 3);
  const radii = new Float32Array(POOL);
  const aspects = new Float32Array(POOL);
  const fades = new Float32Array(POOL);

  // Per-bubble state the shader never sees.
  const rise = new Float32Array(POOL);
  const spiralRate = new Float32Array(POOL);
  const spiralSpeed = new Float32Array(POOL);
  const phase = new Float32Array(POOL);
  const age = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const baseAspect = new Float32Array(POOL);

  // A transient velocity on top of the rise and the spiral, with its own decay
  // rate. Zero for every bubble the jar makes by itself — the only thing that
  // has ever been *thrown* in here is a fragment of a broken one.
  const vel = new Float32Array(POOL * 3);
  const velDecay = new Float32Array(POOL);

  /**
   * How many times each slot has been handed out. Wraps at 2^32, which at the
   * jar's rate of fizz is a little over four thousand years per slot.
   */
  const generation = new Uint32Array(POOL);

  // Clinging state. `anchor` is the attachment point as a unit direction in the
  // marimo's *own* frame, so a bubble stays on the tuft it grew from while the
  // ball rolls underneath it rather than sliding around the surface.
  const attached = new Uint8Array(POOL);
  const anchor = new Float32Array(POOL * 3);
  const departRadius = new Float32Array(POOL);
  const cling = new Float32Array(POOL);
  const clingFor = new Float32Array(POOL);

  let cursor = 0;
  let trickleAccumulator = 0;

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(CORNERS, 2));
  geometry.setIndex(INDICES);
  const centreAttribute = new THREE.InstancedBufferAttribute(centres, 3);
  const radiusAttribute = new THREE.InstancedBufferAttribute(radii, 1);
  const aspectAttribute = new THREE.InstancedBufferAttribute(aspects, 1);
  const fadeAttribute = new THREE.InstancedBufferAttribute(fades, 1);
  geometry.setAttribute('iCentre', centreAttribute);
  geometry.setAttribute('iRadius', radiusAttribute);
  geometry.setAttribute('iAspect', aspectAttribute);
  geometry.setAttribute('iFade', fadeAttribute);
  geometry.instanceCount = POOL;

  const ballCentre = new THREE.Vector3(0, 0, 0);
  const ballSpin = new THREE.Quaternion();
  const ballSpinInverse = new THREE.Quaternion();
  const dirScratch = new THREE.Vector3();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...water,
      ...room,
      ...light,
      uBallCentre: { value: ballCentre },
      uBallRadius: { value: 0 },
      uBallColour: ballColour
    },
    vertexShader: BUBBLE_VERTEX,
    fragmentShader: BUBBLE_FRAGMENT,
    transparent: true,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  /**
   * How far out from the surface a clinging bubble sits, as a fraction of its
   * own radius. Under 1 so it is bedded into the fuzz rather than balanced on
   * the shell — a bubble sitting exactly tangent looks stuck on with glue,
   * whereas a real one is held in a dimple of wet filaments.
   */
  const SEAT = 0.75;

  /**
   * Where the outside of the marimo really is, as a multiple of the body
   * radius. The filaments stand off the body by a fixed fraction of it, and a
   * bubble seated on the body radius is a bubble buried in fur — visible only
   * as a smudge, when it should be sitting proud of the coat with its feet in
   * it. Not the full fur length, because the fur lies over rather than standing
   * on end and a bubble presses what it lands on flat.
   */
  const COAT = 1 + FILAMENT_LENGTH_FRAC * 0.7;

  /** Give bubble `i` the free-rise parameters its current radius earns. */
  function setFreeMotion(i: number) {
    const r = radii[i];
    baseAspect[i] = aspectRatio(r);
    rise[i] = riseSpeed(r);
    spiralRate[i] = spiralOmega(r);
    // Tangential speed that traces a circle of the wobble radius at that rate.
    spiralSpeed[i] = wobbleRadius(r) * spiralRate[i];
    phase[i] = Math.random() * Math.PI * 2;
    age[i] = 0;
  }

  /**
   * Let go. Whatever size the bubble had reached is the size it leaves at, so a
   * bubble torn off early by a squeeze is a small one — its rise speed, its
   * flattening and its wobble are all read off that radius here rather than off
   * the size it would eventually have grown to.
   */
  function detach(i: number) {
    attached[i] = 0;
    setFreeMotion(i);
  }

  /**
   * A slot for a new bubble: a dead one if there is one, taken round-robin so
   * the pool wears evenly, and otherwise the bubble nearest to going anyway.
   *
   * `life` counts down for a free bubble and sits pinned at 1 for a held one,
   * so the lowest life in the pool is the oldest thing in the water and a
   * clinging bubble is only ever displaced when nothing at all is loose. The
   * fizz alone never needed this — it arrives one at a time and the ring cursor
   * had gone right round before it came back. Breaking a bubble puts four in at
   * once, and a bare cursor would step over whatever happened to be in front of
   * it, so the price of one bubble coming apart would be another one somewhere
   * else in the jar blinking out.
   */
  function claimSlot(): number {
    let dead = -1;
    let loose = -1;
    let any = -1;

    for (let n = 0; n < POOL; n++) {
      const i = (cursor + n) % POOL;
      if (life[i] <= 0) {
        dead = i;
        break;
      }
      if (any < 0 || life[i] < life[any]) any = i;
      if (!attached[i] && (loose < 0 || life[i] < life[loose])) loose = i;
    }

    // Held before loose, unconditionally, rather than by letting `life` decide.
    // A clinging bubble's life is pinned at 1 while it waits, so it is usually
    // the last thing the countdown would pick — but a jarful of bubbles that
    // are all brand new are all at 1 together, and then the tie hands the coat
    // over to a burst that has only just arrived. The bubbles on the marimo are
    // the ones being looked at.
    const chosen = dead >= 0 ? dead : loose >= 0 ? loose : any;

    cursor = (chosen + 1) % POOL;
    generation[chosen] = (generation[chosen] + 1) >>> 0;
    return chosen;
  }

  /** The handle naming whatever is in slot `i` right now. */
  function handleOf(i: number): BubbleHandle {
    return i + generation[i] * POOL;
  }

  /** The slot a handle still refers to, or -1 if it has been reused since. */
  function slotOf(handle: BubbleHandle): number {
    if (!Number.isFinite(handle) || handle < 0) return -1;
    const i = handle % POOL;
    if (!Number.isInteger(i) || i >= POOL) return -1;
    return generation[i] * POOL + i === handle ? i : -1;
  }

  /** Empty a slot outright: no fade, nothing drawn, available immediately. */
  function killSlot(i: number) {
    attached[i] = 0;
    life[i] = 0;
    fades[i] = 0;
    radii[i] = 0;
    velDecay[i] = 0;
    const o = i * 3;
    vel[o] = 0;
    vel[o + 1] = 0;
    vel[o + 2] = 0;
  }

  function spawn(x: number, y: number, z: number, radius: number, attach: boolean) {
    const i = claimSlot();

    const r = sampleRadius(Math.random());

    // Off the upper half of the ball, where a bubble would actually detach, and
    // sitting *on* the coat rather than centred in it — a bubble whose centre is
    // on the surface is half inside the marimo, and the depth buffer duly slices
    // it in two.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.8 + 0.2);
    const sp = Math.sin(phi);
    const dx = sp * Math.cos(theta);
    const dy = Math.cos(phi);
    const dz = sp * Math.sin(theta);

    const o = i * 3;
    attached[i] = attach ? 1 : 0;
    vel[o] = 0;
    vel[o + 1] = 0;
    vel[o + 2] = 0;
    velDecay[i] = 0;
    departRadius[i] = r;
    cling[i] = 0;
    clingFor[i] = attach ? clingDuration(r, Math.random()) : 0;
    radii[i] = attach ? attachedRadius(r, 0, clingFor[i]) : r;

    if (attach) {
      // The site is chosen where it is *now*, in the world, so bubbles start on
      // the upper surface you can see — then it is recorded in the ball's frame
      // and rides along with it from here on.
      dirScratch.set(dx, dy, dz).applyQuaternion(ballSpinInverse);
      anchor[o] = dirScratch.x;
      anchor[o + 1] = dirScratch.y;
      anchor[o + 2] = dirScratch.z;
    }

    const shell = radius * COAT + radii[i] * SEAT;
    centres[o] = x + shell * dx;
    centres[o + 1] = y + shell * dy;
    centres[o + 2] = z + shell * dz;

    aspects[i] = aspectRatio(radii[i]);
    baseAspect[i] = aspects[i];
    if (!attach) setFreeMotion(i);
    life[i] = 1;
    fades[i] = 1;
  }

  /**
   * One fragment of a broken bubble: a free bubble of exactly this size at
   * exactly this place, thrown along `d` and slowing to a stop.
   *
   * Unlike `spawn` it takes the size it is given rather than rolling for one,
   * and it goes where it is put rather than being seated on the marimo — a
   * fragment inherits both from the bubble it came out of, which by then may be
   * anywhere in the jar.
   */
  function seedFragment(
    x: number,
    y: number,
    z: number,
    r: number,
    dx: number,
    dy: number,
    dz: number,
    offset: number,
    speed: number,
    decay: number
  ) {
    const i = claimSlot();
    const o = i * 3;

    attached[i] = 0;
    radii[i] = r;
    departRadius[i] = r;
    cling[i] = 0;
    clingFor[i] = 0;

    centres[o] = x + dx * offset;
    centres[o + 1] = y + dy * offset;
    centres[o + 2] = z + dz * offset;

    vel[o] = dx * speed;
    vel[o + 1] = dy * speed;
    vel[o + 2] = dz * speed;
    velDecay[i] = decay;

    setFreeMotion(i);
    aspects[i] = baseAspect[i];
    life[i] = 1;
    fades[i] = 1;
  }

  const flowOut: Flow = [0, 0, 0];
  const screenOut: [number, number, number] = [0, 0, 0];
  const tumble = new THREE.Quaternion();
  const tumbleAxis = new THREE.Vector3();
  const fragmentDir = new THREE.Vector3();

  return {
    points: mesh,

    burst(x, y, z, radius, count) {
      for (let i = 0; i < count; i++) spawn(x, y, z, radius, false);
    },

    trickle(x, y, z, radius, dt, rate) {
      trickleAccumulator += dt * rate;
      while (trickleAccumulator >= 1) {
        trickleAccumulator -= 1;
        spawn(x, y, z, radius, true);
      }
    },

    release(chance) {
      if (chance <= 0) return;
      for (let i = 0; i < POOL; i++) {
        if (!attached[i] || life[i] <= 0) continue;
        if (chance >= 1 || Math.random() < chance) detach(i);
      }
    },

    clingingCount() {
      let held = 0;
      for (let i = 0; i < POOL; i++) if (attached[i] && life[i] > 0) held++;
      return held;
    },

    pick(toScreen, screenX, screenY, padPx) {
      const found: BubbleHandle[] = [];

      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0 || radii[i] <= 0) continue;
        const o = i * 3;
        toScreen(centres[o], centres[o + 1], centres[o + 2], screenOut);
        const scale = screenOut[2];
        if (scale <= 0) continue;

        // Its real silhouette, or the reach, whichever is bigger. Not the sum:
        // a padded big bubble would drag in everything drifting past behind it.
        const reach = Math.max(radii[i] * scale, padPx);
        const dx = screenX - screenOut[0];
        const dy = screenY - screenOut[1];
        if (dx * dx + dy * dy <= reach * reach) found.push(handleOf(i));
      }

      return found;
    },

    pop(handle) {
      const index = slotOf(handle);
      if (index < 0 || life[index] <= 0) return 0;

      const parent = radii[index];
      if (!canFragment(parent)) return 0;

      const o = index * 3;
      const x = centres[o];
      const y = centres[o + 1];
      const z = centres[o + 2];

      const child = fragmentRadius(parent, FRAGMENT_COUNT);
      const speed = fragmentSpeed(parent);
      const decay = fragmentDecay(parent);
      // Sitting just inside where the parent's surface was, so the fragments
      // start out filling its silhouette and push out of it rather than
      // materialising in a ring around a hole.
      const offset = parent - child;

      // Clear the parent before allocating, so one of its own children can have
      // the slot back and a break costs the pool three bubbles rather than four.
      killSlot(index);

      tumbleAxis
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize();
      if (tumbleAxis.lengthSq() < 0.5) tumbleAxis.set(0, 1, 0);
      tumble.setFromAxisAngle(tumbleAxis, Math.random() * Math.PI * 2);

      for (const [ux, uy, uz] of TETRAHEDRON) {
        fragmentDir.set(ux, uy, uz).applyQuaternion(tumble);
        seedFragment(
          x,
          y,
          z,
          child,
          fragmentDir.x,
          fragmentDir.y,
          fragmentDir.z,
          offset,
          speed,
          decay
        );
      }

      return TETRAHEDRON.length;
    },

    shear(slipSpeed, dt) {
      for (let i = 0; i < POOL; i++) {
        if (!attached[i] || life[i] <= 0) continue;
        if (Math.random() < releaseChance(radii[i], slipSpeed, dt)) detach(i);
      }
    },

    update(dt, flow) {
      const ballRadius = material.uniforms.uBallRadius.value as number;

      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0) continue;
        const o = i * 3;

        if (attached[i]) {
          cling[i] += dt;

          // Swelling. Radius is re-derived from elapsed time rather than
          // integrated, so a bubble torn off early and one left alone agree
          // exactly on the curve, and nothing drifts over a long wait.
          const r = attachedRadius(departRadius[i], cling[i], clingFor[i]);
          radii[i] = r;
          // Squashed against the coat while it is held, rounding out as it
          // grows away from the surface.
          const held = 1 - 0.18 * (1 - Math.min(1, cling[i] / Math.max(1e-4, clingFor[i])));
          aspects[i] = aspectRatio(r) * held;

          // The bubble does not wander. It is pinned to the filament it grew
          // out of, so its seat is fixed in the marimo's own frame and the
          // world position is just that seat carried around by the ball.
          dirScratch.set(anchor[o], anchor[o + 1], anchor[o + 2]).applyQuaternion(ballSpin);

          const shell = ballRadius * COAT + r * SEAT;
          centres[o] = ballCentre.x + dirScratch.x * shell;
          centres[o + 1] = ballCentre.y + dirScratch.y * shell;
          centres[o + 2] = ballCentre.z + dirScratch.z * shell;

          // Rolled under. A seat that has turned past the equator has the
          // bubble hanging off the underside of the ball with buoyancy pulling
          // it straight off the coat, and there is nothing on the far side of
          // it to hold it there — so turning the marimo over sheds whatever it
          // had been holding on that side, without any rate or threshold to
          // tune. This is what actually strips a rolling or tumbling marimo.
          if (dirScratch.y <= 0) {
            detach(i);
            continue;
          }

          // A held bubble does not age: it is being topped up from the plant
          // the whole time it waits, so its clock starts when it lets go.
          if (cling[i] >= clingFor[i]) detach(i);
          continue;
        }

        age[i] += dt;

        flow(centres[o], centres[o + 1], centres[o + 2], flowOut);

        // Spiral: a horizontal velocity that turns at the wobble rate, so the
        // path is a helix rather than a line. Small bubbles have zero amplitude
        // and go straight up.
        const angle = spiralRate[i] * age[i] + phase[i];
        const swing = spiralSpeed[i];

        centres[o] += (Math.cos(angle) * swing + flowOut[0] + vel[o]) * dt;
        centres[o + 1] += (rise[i] + flowOut[1] + vel[o + 1]) * dt;
        centres[o + 2] += (Math.sin(angle) * swing + flowOut[2] + vel[o + 2]) * dt;

        // Whatever threw this bubble bleeds off exponentially, leaving it doing
        // what every other bubble in the jar is doing. Only fragments of a
        // broken bubble ever have anything to bleed.
        if (velDecay[i] > 0) {
          const keep = Math.exp(-velDecay[i] * dt);
          vel[o] *= keep;
          vel[o + 1] *= keep;
          vel[o + 2] *= keep;
        }

        // The lens breathes as it wobbles: a rising bubble is never a static
        // shape, and the shimmer of the aspect changing is a good part of why
        // a real one catches the eye.
        aspects[i] = baseAspect[i] * (1 + 0.1 * Math.sin(2 * angle));

        // Surface: flatten against the underside of the film, then pop.
        const top = centres[o + 1] + radii[i];
        if (top >= WATER_Y) {
          life[i] = Math.max(0, life[i] - dt * 7);
          aspects[i] *= Math.max(0.35, life[i]);
        }

        life[i] = Math.max(0, life[i] - dt * 0.16);
        fades[i] = Math.min(1, life[i] * 2);
        if (life[i] <= 0) radii[i] = 0;
      }

      centreAttribute.needsUpdate = true;
      radiusAttribute.needsUpdate = true;
      aspectAttribute.needsUpdate = true;
      fadeAttribute.needsUpdate = true;
    },

    setBall(x, y, z, radiusM, qx = 0, qy = 0, qz = 0, qw = 1) {
      ballCentre.set(x, y, z);
      material.uniforms.uBallRadius.value = radiusM;
      ballSpin.set(qx, qy, qz, qw);
      ballSpinInverse.copy(ballSpin).invert();
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
