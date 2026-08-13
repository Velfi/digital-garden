import * as THREE from 'three';
import { STONE_DETAIL, STONE_POP_OVERSHOOT, STONE_POP_SEC, STONE_SPAWN_HEIGHT } from './constants';
import { LIGHTING_GLSL, WATER_GLSL, type LightUniforms, type WaterUniforms } from './waterShader';
import {
  footprint,
  stoneExtents,
  stoneHullPoints,
  stoneKindById,
  stoneSurface,
  stoneSurfaceMix,
  type Occupant,
  type PlacedStone,
  type Stone
} from './stones';
import type { JoltBody, JoltWorld } from './joltWorld';

/**
 * River stones, as geometry and as bodies.
 *
 * Two things happen here that do not happen anywhere else in the tank. The first
 * is that a shape is baked rather than displaced: the marimo is a sphere pushed
 * about in the vertex shader every frame because its shape genuinely changes,
 * and a stone's does not, so a stone is built once into a buffer and thereafter
 * only ever moved. The second is the pop, which is the only place in this
 * project where something arrives from outside the simulation — a sticker peeled
 * off a sheet and pushed through the glass. See `popTransform`.
 *
 * The material is the tank's own opaque one with a specular term added. That
 * term is doing more work than it looks: a wet stone under water is defined
 * almost entirely by its highlight, and without one these read as grey clay.
 */

const STONE_VERTEX = /* glsl */ `
attribute vec4 aStoneColour;   // rgb, plus gloss in w

varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vColour;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vColour = aStoneColour;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const STONE_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${LIGHTING_GLSL}

varying vec3 vNormal;
varying vec3 vWorld;
varying vec4 vColour;

void main() {
  vec3 n = normalize(vNormal);
  vec3 colour = vColour.rgb * twoLightDiffuse(n) * overheadShade(vWorld.y);

  // Blinn-Phong against the same lamp direction everything else keys off. A
  // wet stone under water is a dark shape with one bright edge on it, and that
  // edge is the entire difference between a pebble and a lump of putty.
  //
  // Broad and weak. A tight hot highlight is what a polished sphere in a studio
  // does; a river cobble is micro-rough all over, so the sheen it has is a
  // smeared band rather than a dot, and the tighter version read as wet plastic.
  //
  // Named halfVector rather than half, which is a reserved word in GLSL ES:
  // the shader does not compile with it, and the failure is silent.
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 halfVector = normalize(view + KEY_DIR);
  float specular = pow(max(dot(n, halfVector), 0.0), 18.0) * vColour.w;
  colour += uKeyColour * specular * 0.45;

  gl_FragColor = vec4(applyWater(colour, vWorld) * uExposure, 1.0);
}
`;

/** What a stone's geometry knows about itself once it is built. */
export interface StoneGeometry {
  geometry: THREE.BufferGeometry;
  /** Half-extents of the built vertices, metres. */
  extents: [number, number, number];
}

const dirScratch: [number, number, number] = [0, 0, 0];
const pointScratch: [number, number, number] = [0, 0, 0];
const tangentA = new THREE.Vector3();
const tangentB = new THREE.Vector3();
const surfaceP = new THREE.Vector3();
const surfaceU = new THREE.Vector3();
const surfaceV = new THREE.Vector3();
const normalScratch = new THREE.Vector3();

/** The surface point for a direction, as a `Vector3`. */
function surfaceAt(stone: Stone, dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  dirScratch[0] = dir.x;
  dirScratch[1] = dir.y;
  dirScratch[2] = dir.z;
  stoneSurface(stone, dirScratch[0], dirScratch[1], dirScratch[2], pointScratch);
  return out.set(pointScratch[0], pointScratch[1], pointScratch[2]);
}

/**
 * Build the mesh for a stone.
 *
 * Normals are differenced off the surface function rather than averaged off the
 * triangles, which is worth a word. An icosphere is not indexed — every triangle
 * carries its own three vertices — so averaging would need the duplicates found
 * and merged first, and the usual shortcut of just using face normals gives a
 * disco ball. Differencing sidesteps both: two nudges along the tangent plane, a
 * cross product, and the normal is the surface's own at that point, seamlessly,
 * however the triangles happen to be laid out.
 *
 * It also gets the flat faces right for free, which is the part that matters now
 * there are flat faces. Across a cleaved face every sample returns the same
 * plane normal, and the rim bends through in however many triangles the blend
 * spans — an edge, drawn as an edge, with no seam and nothing special-cased.
 */
export function buildStoneGeometry(stone: Stone): StoneGeometry {
  const kind = stoneKindById(stone.kind);
  const source = new THREE.IcosahedronGeometry(1, STONE_DETAIL);
  const directions = source.getAttribute('position') as THREE.BufferAttribute;
  const count = directions.count;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colours = new Float32Array(count * 4);

  const body = new THREE.Color(kind?.colour ?? 0x777777);
  const vein = new THREE.Color(kind?.vein ?? 0x999999);
  const grain = new THREE.Color(kind?.grain ?? 0x555555);
  const mixed = new THREE.Color();
  const dir = new THREE.Vector3();

  // Small enough to be a derivative, large enough not to be floating-point
  // noise on a stone a centimetre across. Also, deliberately, smaller than the
  // narrowest face rim any kind asks for, so an edge is differenced across
  // rather than straddled.
  const EPSILON = 4e-4;

  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;

  for (let i = 0; i < count; i++) {
    dir.fromBufferAttribute(directions, i).normalize();

    surfaceAt(stone, dir, surfaceP);
    positions[i * 3] = surfaceP.x;
    positions[i * 3 + 1] = surfaceP.y;
    positions[i * 3 + 2] = surfaceP.z;

    maxX = Math.max(maxX, Math.abs(surfaceP.x));
    maxY = Math.max(maxY, Math.abs(surfaceP.y));
    maxZ = Math.max(maxZ, Math.abs(surfaceP.z));

    // Any two vectors spanning the tangent plane will do; the cross product
    // fixes the orientation, and pointing it outward fixes the sign.
    tangentA.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.9) tangentA.set(1, 0, 0);
    tangentA.cross(dir).normalize();
    tangentB.copy(dir).cross(tangentA).normalize();

    surfaceAt(stone, surfaceU.copy(dir).addScaledVector(tangentA, EPSILON).normalize(), surfaceU);
    surfaceAt(stone, surfaceV.copy(dir).addScaledVector(tangentB, EPSILON).normalize(), surfaceV);
    surfaceU.sub(surfaceP);
    surfaceV.sub(surfaceP);
    normalScratch.copy(surfaceU).cross(surfaceV);
    if (normalScratch.lengthSq() < 1e-20) normalScratch.copy(dir);
    normalScratch.normalize();
    if (normalScratch.dot(dir) < 0) normalScratch.negate();

    normals[i * 3] = normalScratch.x;
    normals[i * 3 + 1] = normalScratch.y;
    normals[i * 3 + 2] = normalScratch.z;

    if (kind) {
      const mix = stoneSurfaceMix(stone, kind, dir.x, dir.y, dir.z);
      mixed.copy(body).lerp(vein, Math.min(1, mix.vein));
      // Signed speckle: toward the dark mineral one way, the light one the
      // other. See `stoneSurfaceMix` for why it must be able to go both ways.
      mixed.lerp(mix.grain >= 0 ? grain : vein, Math.min(1, Math.abs(mix.grain)));
      colours[i * 4] = mixed.r;
      colours[i * 4 + 1] = mixed.g;
      colours[i * 4 + 2] = mixed.b;
      colours[i * 4 + 3] = kind.gloss;
    } else {
      colours[i * 4] = body.r;
      colours[i * 4 + 1] = body.g;
      colours[i * 4 + 2] = body.b;
      colours[i * 4 + 3] = 0.4;
    }
  }

  source.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aStoneColour', new THREE.BufferAttribute(colours, 4));

  return { geometry, extents: [maxX, maxY, maxZ] };
}

export function createStoneMaterial(
  water: WaterUniforms,
  light: LightUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...water, ...light },
    vertexShader: STONE_VERTEX,
    fragmentShader: STONE_FRAGMENT,
    // As with the rest of the jar: the reflection pass inverts the winding, and
    // a one-sided stone would be inside out in the mirror.
    side: THREE.DoubleSide
  });
}

/**
 * Ease with an overshoot. `t` in 0..1, out at 1, having gone past on the way.
 *
 * The standard back-out curve. The overshoot is the pop: without it the stone
 * simply grows to size, which reads as a stone being placed rather than a
 * sticker springing off the paper into a solid thing.
 */
export function popEase(t: number, overshoot = STONE_POP_OVERSHOOT): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // c1 chosen so the peak lands `overshoot` past 1, near t = 0.75.
  const c1 = overshoot * 5.7;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Everything the pop needs to know about where the sticker was. */
export interface PopOrigin {
  /**
   * How much larger the sticker was on screen than the stone will be, as a
   * plain multiplier on the stone's size. 1 means it was already the right size.
   */
  screenScale: number;
  /** The direction the stone is flattened along at t=0: the camera's forward. */
  forward: THREE.Vector3;
}

/** A stone being dropped in: where it enters, and what it is arriving from. */
export interface StoneArrival {
  origin: PopOrigin;
  /** World height it appears at. On the waterline, so it sinks from there. */
  y: number;
}

interface Entry {
  placed: PlacedStone;
  mesh: THREE.Mesh;
  handle: JoltBody;
  extents: [number, number, number];
  /** Which side of the waterline it was on last frame, for the splash. */
  wasAbove: boolean;
  /** Seconds into the pop, or null once it is over. */
  popSec: number | null;
  origin: PopOrigin | null;
  /** The pose the pop is heading for: the body's, at the moment it was raised. */
  popRest: THREE.Quaternion;
}

/** A stone breaking the surface, for the caller to make a splash out of. */
export interface StoneSplash {
  x: number;
  z: number;
  /** Radius of the hole it punched, metres. */
  radius: number;
  /** How fast it was going down, m/s. */
  speed: number;
}

/** What a pointer ray found. */
export interface StonePick {
  id: number;
  /** Distance along the ray, metres. */
  distance: number;
  /** Where it was hit, world space. The drag hangs off this point. */
  point: THREE.Vector3;
}

export interface StoneBundle {
  group: THREE.Group;
  /**
   * Put a stone in the jar. With an `arrival`, it comes in as a sticker popping
   * into three dimensions; without one, it is simply already there, which is how
   * a jar full of stones is restored on load.
   */
  add(placed: PlacedStone, arrival?: StoneArrival | null): void;
  remove(id: number): boolean;
  clear(): void;
  /** What is in the jar, in the order it was put there. */
  contents(): PlacedStone[];
  /** What the floor is already carrying, for the placement search. */
  occupants(): Occupant[];
  /**
   * Advance the pop animations. The bodies themselves are Jolt's business and
   * are stepped by the tank, once, along with everything else in the jar.
   */
  stepPop(dt: number): void;
  /**
   * Copy every body's pose out of the engine and onto its mesh, and report
   * anything that broke the surface since the last call.
   */
  sync(waterY: number, out: StoneSplash[]): StoneSplash[];
  /** The nearest stone under a ray, or null. Against the real drawn geometry. */
  pick(raycaster: THREE.Raycaster): StonePick | null;
  /** Take hold of a stone. The target is moved with `dragTo`. */
  grab(id: number, x: number, y: number, z: number): boolean;
  dragTo(x: number, y: number, z: number): void;
  release(): void;
  /** Where a stone is, for the host to anchor a drag plane on. */
  positionOf(id: number): THREE.Vector3 | null;
  /** True while anything is still moving. The host writes stones down on the edge. */
  busy(): boolean;
  /** Damp the arrival: no pop, and the stone starts where it will end up. */
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const popQuaternion = new THREE.Quaternion();
const flattenAxis = new THREE.Vector3();
const popScale = new THREE.Vector3();
const heldScratch = new THREE.Vector3();

/**
 * Where the mesh goes partway through a pop.
 *
 * The trick is that the flattening is not along any axis of the stone — it is
 * along the camera's forward, because that is the axis a picture of a stone has
 * been flattened along. So at t=0 the mesh is turned to face the camera and
 * squashed to nothing in depth, which is a sticker; at t=1 it is in its own pose
 * at its own size, which is a stone; and in between it inflates and turns over
 * at once. Nothing is faded and nothing is swapped: it is the same geometry
 * throughout, which is why the pop reads as the sticker *becoming* the stone
 * rather than as one thing being replaced by another.
 *
 * Exported for the test, which pins the two ends.
 */
export function popTransform(
  mesh: THREE.Object3D,
  rest: THREE.Quaternion,
  origin: PopOrigin,
  t: number
): void {
  const eased = popEase(t);

  // Facing the camera: the stone's short axis turned onto the view direction,
  // which is the pose the sticker was drawn in.
  flattenAxis.copy(origin.forward).normalize();
  popQuaternion.setFromUnitVectors(UP, flattenAxis);
  mesh.quaternion.copy(popQuaternion).slerp(rest, eased);

  // Sticker-sized and paper-thin at one end, its own size and solid at the
  // other. The thinness is applied in the mesh's local frame along Y, which the
  // orientation above has put on the camera's axis at t=0 and takes off it as
  // the stone turns — so the squash unwinds exactly as fast as the pose does.
  const size = origin.screenScale + (1 - origin.screenScale) * eased;
  const thickness = 0.04 + 0.96 * eased;
  popScale.set(size, size * thickness, size);
  mesh.scale.copy(popScale);
}

export function createStones(
  water: WaterUniforms,
  light: LightUniforms,
  world: JoltWorld
): StoneBundle {
  const group = new THREE.Group();
  const material = createStoneMaterial(water, light);
  const entries: Entry[] = [];
  let reducedMotion = false;
  let held: Entry | null = null;
  const grabTarget: [number, number, number] = [0, 0, 0];
  const poseScratch: [number, number, number] = [0, 0, 0];
  const spinScratch: [number, number, number] = [0, 0, 0];

  function findEntry(id: number): Entry | null {
    return entries.find((entry) => entry.placed.id === id) ?? null;
  }

  /**
   * Copy a body's pose out of the engine, onto its mesh, and into the record
   * that gets written to storage.
   *
   * `placed` is the same object the host holds, so saving is a matter of
   * serialising what is already there rather than asking for it.
   */
  function syncPose(entry: Entry) {
    const { placed } = entry;
    world.readPose(entry.handle, placed.position, placed.quaternion);
    entry.mesh.position.set(placed.position[0], placed.position[1], placed.position[2]);
    entry.mesh.quaternion.set(
      placed.quaternion[0],
      placed.quaternion[1],
      placed.quaternion[2],
      placed.quaternion[3]
    );
  }

  return {
    group,

    add(placed, arrival = null) {
      const built = buildStoneGeometry(placed.stone);
      const mesh = new THREE.Mesh(built.geometry, material);

      if (arrival && !reducedMotion) placed.position[1] = arrival.y;

      // The hull is built by Jolt from the shape's own surface samples, and the
      // mass and the full inertia tensor come out of the integral over the
      // solid it makes. Nothing about how a stone moves is written down here.
      const handle = world.addStone(
        stoneHullPoints(placed.stone),
        placed.position,
        placed.quaternion
      );
      if (!handle) {
        built.geometry.dispose();
        return;
      }

      const entry: Entry = {
        placed,
        mesh,
        handle,
        extents: built.extents,
        wasAbove: placed.position[1] > 0,
        popSec: null,
        origin: null,
        popRest: new THREE.Quaternion(
          placed.quaternion[0],
          placed.quaternion[1],
          placed.quaternion[2],
          placed.quaternion[3]
        )
      };

      if (arrival && !reducedMotion) {
        entry.popSec = 0;
        entry.origin = arrival.origin;
        // Held still while the sticker inflates. See `stepPop`.
        world.freeze(handle);
      }

      syncPose(entry);
      entries.push(entry);
      group.add(mesh);
    },

    remove(id) {
      const index = entries.findIndex((entry) => entry.placed.id === id);
      if (index < 0) return false;
      const [entry] = entries.splice(index, 1);
      world.remove(entry.handle);
      if (held === entry) held = null;
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      return true;
    },

    clear() {
      for (const entry of entries) {
        world.remove(entry.handle);
        group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
      }
      entries.length = 0;
      held = null;
    },

    contents() {
      return entries.map((entry) => entry.placed);
    },

    occupants() {
      return entries.map((entry) => ({
        x: entry.placed.position[0],
        z: entry.placed.position[2],
        footprint: footprint(entry.extents)
      }));
    },

    stepPop(dt) {
      // The pop runs before the body does anything, with the stone pinned where
      // the sticker was let go. A stone crosses this jar in a fifth of a second,
      // so running the two together would have the pop still inflating when the
      // stone hit the gravel. Held, the sequence reads in order: it becomes a
      // stone, and then it behaves like one.
      for (const entry of entries) {
        if (entry.popSec === null || !entry.origin) continue;

        // Pinned by being asleep, which costs the engine nothing and needs no
        // special case in the step: a sleeping body is simply not simulated.
        entry.popSec += dt;
        const t = entry.popSec / STONE_POP_SEC;
        if (t < 1) {
          popTransform(entry.mesh, entry.popRest, entry.origin, t);
          continue;
        }
        entry.popSec = null;
        entry.origin = null;
        entry.mesh.scale.set(1, 1, 1);
        world.wake(entry.handle);
      }
    },

    sync(waterY, out) {
      out.length = 0;
      for (const entry of entries) {
        // A stone mid-pop is a picture. Its body is asleep exactly where it was
        // put, so reading the pose back would undo the animation.
        if (entry.popSec !== null) continue;

        syncPose(entry);
        const above = entry.placed.position[1] > waterY;
        if (entry.wasAbove && !above) {
          world.readVelocity(entry.handle, poseScratch, spinScratch);
          out.push({
            x: entry.placed.position[0],
            z: entry.placed.position[2],
            radius: Math.max(entry.extents[0], entry.extents[2]),
            speed: Math.abs(poseScratch[1])
          });
        }
        entry.wasAbove = above;
      }
      return out;
    },

    pick(raycaster) {
      // Against the drawn triangles rather than the collision hull. They are the
      // same solid to within the sampling, and this way what you can click is
      // exactly what you can see — including the flat faces, which a hull test
      // would round off by its convex radius.
      const hits = raycaster.intersectObjects(group.children, false);
      for (const hit of hits) {
        const entry = entries.find((candidate) => candidate.mesh === hit.object);
        if (!entry || entry.popSec !== null) continue;
        return { id: entry.placed.id, distance: hit.distance, point: hit.point.clone() };
      }
      return null;
    },

    grab(id, x, y, z) {
      const entry = findEntry(id);
      if (!entry || entry.popSec !== null) return false;
      held = entry;
      grabTarget[0] = x;
      grabTarget[1] = y;
      grabTarget[2] = z;
      entry.handle.grabTarget = grabTarget;
      world.wake(entry.handle);
      return true;
    },

    dragTo(x, y, z) {
      grabTarget[0] = x;
      grabTarget[1] = y;
      grabTarget[2] = z;
      if (held) world.wake(held.handle);
    },

    release() {
      if (held) {
        held.handle.grabTarget = null;
        world.wake(held.handle);
      }
      held = null;
    },

    positionOf(id) {
      const entry = findEntry(id);
      if (!entry) return null;
      return heldScratch.set(
        entry.placed.position[0],
        entry.placed.position[1],
        entry.placed.position[2]
      );
    },

    busy() {
      return entries.some((entry) => entry.popSec !== null || !world.asleep(entry.handle));
    },

    setReducedMotion(reduced) {
      reducedMotion = reduced;
      if (!reduced) return;
      // Anything mid-pop is simply put down, at once, where it was going.
      for (const entry of entries) {
        if (entry.popSec === null) continue;
        entry.popSec = null;
        entry.origin = null;
        entry.mesh.scale.set(1, 1, 1);
        world.wake(entry.handle);
        syncPose(entry);
      }
    },

    dispose() {
      for (const entry of entries) entry.mesh.geometry.dispose();
      entries.length = 0;
      held = null;
      material.dispose();
    }
  };
}

/**
 * Where a dropped stone starts: lying in the surface. See `STONE_SPAWN_HEIGHT`
 * for why it is not dropped in from above, which is the obvious answer.
 */
export function spawnHeight(waterY: number): number {
  return waterY + STONE_SPAWN_HEIGHT;
}

/**
 * How big a stone is, without keeping the mesh.
 *
 * The caller needs the extents before the stone can be placed, and `add` needs
 * the geometry — so this samples the shape instead of building it. Same surface
 * function, a couple of hundred directions rather than fifteen thousand.
 */
export function measureStone(stone: Stone): [number, number, number] {
  return stoneExtents(stone);
}
