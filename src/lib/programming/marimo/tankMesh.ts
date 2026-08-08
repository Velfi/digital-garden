import * as THREE from 'three';
import { FLOOR_Y, TANK_HALF_X, TANK_HALF_Z, WATER_Y } from './constants';
import { createSurfaceGeometry, meniscusRise } from './meniscus';
import { mulberry32 } from './rng';
import {
  RIPPLE_GLSL,
  createRippleUniforms,
  writeRippleUniforms,
  type RippleUniforms
} from './ripple';
import { DEFAULT_RIPPLE_SIM, type RippleSimParams } from './rippleSim';
import {
  IOR_AIR,
  IOR_GLASS,
  IOR_WATER,
  LIGHTING_GLSL,
  ROOM_GLSL,
  WATER_GLSL,
  createLightUniforms,
  createRoomUniforms,
  type LightUniforms,
  type RoomUniforms,
  type WaterUniforms
} from './waterShader';

/**
 * The jar: glass, gravel, and the water surface.
 *
 * The surface is the interesting one. The camera normally sits below the
 * waterline, so looking up you are seeing water-to-air at a shallow angle —
 * past the critical angle of 48.6 degrees that interface is a perfect mirror,
 * and inside it the entire room above compresses into a 97-degree cone. That is
 * Snell's window, and it is what makes a surface read as water rather than as a
 * blue plane. Ripples perturb the normal, so the rim of the window wobbles.
 *
 * The other thing the surface does is climb the glass. That fillet is real
 * geometry here, solved once and baked into the mesh by `meniscus.ts`, so it
 * gets its brightness the same way everything else does: the surface turns
 * through most of a right angle in the last three millimetres, which walks the
 * local view angle across the critical angle and out the other side. There is
 * nothing painted on.
 */

const GLASS_MARGIN = 0.004;
const GRAVEL_COUNT = 320;

/**
 * Grid spacing across the flat middle of the water surface, metres.
 *
 * Nothing out here needs resolving — the wave normals are analytic and evaluated
 * per pixel, and the surface is not displaced — so this only has to be fine
 * enough that the plane does not visibly facet. The vertices that matter are all
 * in the fillet, which `createSurfaceGeometry` places on the profile itself.
 * Kept at the old plane's 1.7 mm so the interior is unchanged.
 */
export const SURFACE_STEP = 0.0017;

const OPAQUE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  #ifdef USE_INSTANCING
    vec4 local = instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(instanceMatrix) * normal);
  #else
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
  #endif

  vNormal = normalize(mat3(modelMatrix) * n);
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const OPAQUE_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${LIGHTING_GLSL}

uniform vec3 uColour;

varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 colour = uColour * twoLightDiffuse(normalize(vNormal)) * overheadShade(vWorld.y);
  colour = applyWater(colour, vWorld);
  gl_FragColor = vec4(colour * uExposure, 1.0);
}
`;

const SURFACE_VERTEX = /* glsl */ `
attribute vec2 aMeniscusSlope;

varying vec3 vWorld;
varying vec2 vMeniscusSlope;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  // The fillet is baked into the mesh — its height is already in the position
  // attribute, and this is the gradient that goes with it. See meniscus.ts for
  // why it is solved on the CPU and carried rather than evaluated here.
  vMeniscusSlope = aMeniscusSlope;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${ROOM_GLSL}
${RIPPLE_GLSL}

uniform sampler2D uReflectionTexture; // the tank, mirrored through this plane
uniform mat4  uReflectionMatrix;      // and the view-projection that drew it
uniform float uWaterLevel;
uniform float uHasTargets;

varying vec3 vWorld;
varying vec2 vMeniscusSlope;

const float ETA_WATER_TO_AIR = ${(IOR_WATER / IOR_AIR).toFixed(6)};
const float ETA_AIR_TO_WATER = ${(IOR_AIR / IOR_WATER).toFixed(6)};
// Normal-incidence reflectance for a water/air interface: about 2%.
const float R0 = ${(((IOR_WATER - IOR_AIR) / (IOR_WATER + IOR_AIR)) ** 2).toFixed(6)};
const float MENISCUS_RISE = ${meniscusRise().toFixed(6)};

void main() {
  vec3 incident = normalize(vWorld - cameraPosition);

  // How far up the fillet this fragment is, 0 out in the flat and 1 at the
  // glass. The mesh already carries the height, so this costs a subtraction.
  float climb = clamp((vWorld.y - uWaterLevel) / MENISCUS_RISE, 0.0, 1.0);

  // Wave slope and meniscus slope simply add — they are two contributions to one
  // height field. The waves are faded out as the fillet takes over: the contact
  // line is held by the glass, so a ripple arriving at the wall runs out of
  // surface to move rather than tilting the whole fillet with it.
  vec2 slope = rippleField(vWorld.xz).yz * (1.0 - climb) + vMeniscusSlope;
  vec3 up = normalize(vec3(-slope.x, 1.0, -slope.y));

  // Which face of the sheet the ray arrives on. Decided per fragment from the
  // surface itself rather than from the camera's height: out on the flat those
  // are the same statement, but the fillet turns through seventy degrees, and a
  // camera two millimetres under the waterline can be looking squarely at the
  // top of it. Taking the camera's word for it there clamps the incident cosine
  // to zero and reflects off a normal pointing into the wrong half-space.
  bool fromBelow = dot(incident, up) > 0.0;
  vec3 n = fromBelow ? -up : up;                       // facing the viewer
  float eta = fromBelow ? ETA_WATER_TO_AIR : ETA_AIR_TO_WATER;

  float cosIncident = clamp(dot(-incident, n), 0.0, 1.0);
  float sin2Transmitted = eta * eta * (1.0 - cosIncident * cosIncident);
  bool totalInternal = sin2Transmitted > 1.0;
  float cosTransmitted = sqrt(max(0.0, 1.0 - sin2Transmitted));

  // Schlick, using the transmitted angle when going dense to rare — otherwise
  // it badly underestimates reflectance approaching the critical angle, and the
  // rim of Snell's window loses its bright edge.
  float c = fromBelow ? cosTransmitted : cosIncident;
  float fresnel = totalInternal ? 1.0 : R0 + (1.0 - R0) * pow(1.0 - c, 5.0);

  vec3 refractDir = refract(incident, n, eta);
  vec3 reflectDir = reflect(incident, n);

  vec3 transmitted;
  vec3 reflected;

  if (fromBelow) {
    // Looking up from underwater: through the window is the room; past the
    // critical angle the surface is a mirror on the tank below.
    transmitted = totalInternal ? vec3(0.0) : roomRadiance(refractDir);

    // Follow the reflected ray to whatever it meets inside the jar, and ask the
    // mirror pass's own camera where that point came out in its picture.
    //
    // This replaces reading the target at the fragment's screen position. That
    // shortcut is exact for a fragment lying on the mirror plane — the mirrored
    // camera, the fragment and the whole reflected ray are collinear, so every
    // point along the ray projects to the same pixel and the distance cannot
    // matter. It is also the reason the old lookup needed the horizontal axis
    // negated by hand: it was borrowing the main camera's coordinates and paying
    // for the handedness a reflection reverses. Projecting through the mirror
    // camera's own matrix owes nothing.
    //
    // What breaks the collinearity is any normal that is not the plane's — the
    // ripples slightly, the meniscus by up to seventy degrees. Then the distance
    // is the entire content of the parallax, and it is measured here rather than
    // guessed at, which is what lets the fillet be sampled correctly instead of
    // faded out for being off the plane.
    vec3 seen = vWorld + reflectDir * waterBoxExit(vWorld, reflectDir);
    vec4 clip = uReflectionMatrix * vec4(seen, 1.0);
    vec2 reflectUv = clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
    reflected = uHasTargets > 0.5
      ? texture2D(uReflectionTexture, clamp(reflectUv, vec2(0.001), vec2(0.999))).rgb
      : applyWaterOverDistance(vec3(0.02, 0.05, 0.05), 0.06);
  } else {
    // Looking at the top of the sheet. The camera is held below the waterline,
    // so out on the flat this never happens — but the side fillets lean far
    // enough to show it their upper faces, so it is a real path now rather than
    // a dead branch. A plain attenuated water colour stands in for what is
    // underneath, rather than a second render target and the feedback loop it
    // would need.
    transmitted = applyWaterOverDistance(vec3(0.03, 0.06, 0.06), 0.07);
    reflected = roomRadiance(reflectDir);
  }

  vec3 colour = mix(transmitted, reflected, fresnel);

  // Whatever the surface handed back has still to reach the eye, and the water
  // it crosses on the way is measured rather than assumed — the path length is
  // the segment's overlap with the water box, which is zero for a ray that never
  // enters it, so this is unconditional.
  vec3 midpoint;
  float depth = waterPathLength(cameraPosition, vWorld, midpoint);
  colour = applyWaterOverDistance(colour, depth, scatteredShade(midpoint.y));

  gl_FragColor = vec4(colour * uExposure, 1.0);
}
`;

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

${WATER_GLSL}
${ROOM_GLSL}

uniform vec3 uGlassTint;

varying vec3 vNormal;
varying vec3 vWorld;

const float R0 = ${(((IOR_GLASS - IOR_AIR) / (IOR_GLASS + IOR_AIR)) ** 2).toFixed(6)};

void main() {
  vec3 incident = normalize(vWorld - cameraPosition);
  vec3 outward = normalize(vNormal);
  // The near wall of the jar has its outward normal pointing back at us; the far
  // wall shows us its inside. They need completely different things behind them.
  bool nearWall = dot(outward, incident) < 0.0;
  vec3 n = nearWall ? outward : -outward;

  float cosIncident = clamp(dot(-incident, n), 0.0, 1.0);
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - cosIncident, 5.0);
  vec3 sheen = roomRadiance(reflect(incident, n)) * fresnel;

  if (!nearWall) {
    // Nothing of ours is behind the far wall, so what comes through it is the
    // room — dimmed and tinted by the whole width of water in between. This is
    // what gives the tank a background instead of a void, and it is the surface
    // the suspended haze reads against.
    vec3 behind = roomRadiance(incident) * uGlassTint;
    gl_FragColor = vec4((applyWater(behind, vWorld) + sheen) * uExposure, 1.0);
    return;
  }

  // The near wall is left as a genuine transparent surface rather than
  // compositing the tank through a screen-space sample. Two reasons: a flat
  // wall viewed near head-on bends essentially nothing, so there is little to
  // win; and sampling a target that also has to contain the water surface makes
  // a framebuffer feedback loop, which the driver resolves by silently dropping
  // the draw. All that is really visible here is the Fresnel sheen, which grows
  // toward the jar's edges exactly as it should.
  gl_FragColor = vec4(sheen * uExposure, clamp(fresnel + 0.04, 0.0, 1.0));
}
`;

export interface TankBundle {
  group: THREE.Group;
  /** Hidden while filling the mirror target — the surface must not reflect itself. */
  hideForReflection: THREE.Object3D[];
  /** The simulation's state texture, from `rippleSim.ts`. */
  setRippleTexture(texture: THREE.Texture | null): void;
  /** Retune how much relief the field is drawn with. Driven by the bench. */
  setRipple(params: RippleSimParams): void;
  setWaterLevel(y: number): void;
  setReflectionTexture(texture: THREE.Texture | null): void;
  /**
   * The view-projection the mirror pass was drawn with. The surface projects
   * through it to find what its reflected rays are looking at, so it has to be
   * the matrix of the camera that actually filled the target, pushed on every
   * frame that moves it.
   */
  setReflectionMatrix(matrix: THREE.Matrix4): void;
  dispose(): void;
}

/**
 * The water surface on its own.
 *
 * Exported so the ripple bench at `/marimo/ripples` can put the real material in
 * front of a camera without standing up the rest of the tank. Tuning ripples
 * against a copy of the shader would be worth very little — the whole question
 * is how the wave normals read once they are driving Snell's window — so the
 * bench gets this exact material and differs only in what is behind it.
 */
export function createSurfaceMaterial(
  water: WaterUniforms,
  room: RoomUniforms,
  ripple: RippleUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...water,
      ...room,
      ...ripple,
      uReflectionTexture: { value: null },
      uReflectionMatrix: { value: new THREE.Matrix4() },
      uWaterLevel: { value: WATER_Y },
      uHasTargets: { value: 0 }
    },
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    side: THREE.DoubleSide
  });
}

/**
 * Aim a camera at the mirror image of what another camera is looking at, and
 * hand back the view-projection it draws with.
 *
 * Reflecting a camera through a plane reverses handedness — the mirrored basis
 * has its right vector negated — and that used to have to be undone by hand,
 * because the surface sampled the mirror target at the main camera's screen
 * coordinate. It does not any more: the surface projects through this matrix,
 * which is the one the target was actually rasterised with, so a point is looked
 * up wherever the mirror pass happened to draw it and the handedness never comes
 * up. `reflection.test.ts` pins the two against each other.
 *
 * Shared with the ripple bench so the bench exercises the real lookup rather
 * than a stand-in. Only the aspect and field of view are taken from the source
 * camera; the mirror keeps its own clipping range, which for the jar is set for
 * a subject a few centimetres away rather than for the room.
 */
export function mirrorCameraMatrix(
  out: THREE.Matrix4,
  mirror: THREE.PerspectiveCamera,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  planeY: number
): THREE.Matrix4 {
  mirror.aspect = camera.aspect;
  mirror.fov = camera.fov;
  mirror.position.set(camera.position.x, 2 * planeY - camera.position.y, camera.position.z);
  mirror.up.set(camera.up.x, -camera.up.y, camera.up.z);
  mirror.lookAt(target.x, 2 * planeY - target.y, target.z);
  mirror.updateProjectionMatrix();
  mirror.updateMatrixWorld(true);
  return out.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);
}

function opaqueMaterial(
  water: WaterUniforms,
  light: LightUniforms,
  colour: number
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...water, ...light, uColour: { value: new THREE.Color(colour) } },
    vertexShader: OPAQUE_VERTEX,
    fragmentShader: OPAQUE_FRAGMENT,
    // Double-sided throughout, so the mirrored reflection pass — which inverts
    // winding — does not turn the jar inside out.
    side: THREE.DoubleSide
  });
}

export function createTank(
  water: WaterUniforms,
  seed: number,
  room: RoomUniforms = createRoomUniforms(),
  light: LightUniforms = createLightUniforms()
): TankBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  // --- gravel ---------------------------------------------------------------
  const pebbleGeometry = new THREE.IcosahedronGeometry(1, 0);
  const pebbleMaterial = opaqueMaterial(water, light, 0x3f4038);
  const gravel = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, GRAVEL_COUNT);
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < GRAVEL_COUNT; i++) {
    // Gravel, not boulders: a few millimetres against a 24 mm marimo.
    const s = 0.0012 + rand() * 0.0022;
    position.set(
      (rand() * 2 - 1) * (TANK_HALF_X - s),
      FLOOR_Y - s * 0.35 + rand() * s * 0.3,
      (rand() * 2 - 1) * (TANK_HALF_Z - s)
    );
    euler.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    quaternion.setFromEuler(euler);
    scale.set(s, s * (0.6 + rand() * 0.3), s * (0.85 + rand() * 0.3));
    gravel.setMatrixAt(i, matrix.compose(position, quaternion, scale));
  }
  gravel.instanceMatrix.needsUpdate = true;
  group.add(gravel);
  disposables.push(pebbleGeometry, pebbleMaterial);

  // --- jar floor ------------------------------------------------------------
  const floorGeometry = new THREE.PlaneGeometry(TANK_HALF_X * 2, TANK_HALF_Z * 2);
  const floorMaterial = opaqueMaterial(water, light, 0x3c3830);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y - 0.004;
  group.add(floor);
  disposables.push(floorGeometry, floorMaterial);

  // --- glass ----------------------------------------------------------------
  const glassGeometry = new THREE.BoxGeometry(
    (TANK_HALF_X + GLASS_MARGIN) * 2,
    WATER_Y - FLOOR_Y + 0.03,
    (TANK_HALF_Z + GLASS_MARGIN) * 2
  );
  /**
   * The two sides of the jar are drawn as separate meshes rather than one
   * double-sided one, because their draw order has to be deterministic: the far
   * wall is the backdrop and must go down first, the near wall composites the
   * whole tank through it and must go last. A single double-sided draw leaves
   * that to triangle order, which is not something to rely on.
   */
  function makeGlassMaterial(farWall: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...water,
        ...room,
        uGlassTint: { value: new THREE.Vector3(0.93, 0.97, 0.98) }
      },
      vertexShader: GLASS_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      transparent: !farWall,
      depthWrite: farWall,
      side: farWall ? THREE.BackSide : THREE.FrontSide
    });
  }

  const glassPosition = new THREE.Vector3(0, (WATER_Y + FLOOR_Y) / 2 + 0.01, 0);

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
    color: 0xbfe8f0,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.position.copy(glassPosition);
  edges.renderOrder = 4;
  group.add(edges);
  disposables.push(edgeGeometry, edgeMaterial);

  // --- water surface --------------------------------------------------------
  const surfaceGeometry = createSurfaceGeometry(TANK_HALF_X, TANK_HALF_Z, SURFACE_STEP);
  const rippleUniforms = createRippleUniforms(DEFAULT_RIPPLE_SIM);
  const surfaceMaterial = createSurfaceMaterial(water, room, rippleUniforms);
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.position.y = WATER_Y;
  surface.renderOrder = 2;
  group.add(surface);
  disposables.push(surfaceGeometry, surfaceMaterial);

  return {
    group,
    // Everything else stays visible in the mirror pass, including the far wall,
    // which is the backdrop the reflection needs.
    hideForReflection: [surface, glassNear, edges],
    setRippleTexture(texture) {
      rippleUniforms.uRippleTexture.value = texture;
    },
    setRipple(params) {
      writeRippleUniforms(rippleUniforms, params);
    },
    setWaterLevel(y) {
      surface.position.y = y;
      surfaceMaterial.uniforms.uWaterLevel.value = y;
    },
    setReflectionTexture(texture) {
      surfaceMaterial.uniforms.uReflectionTexture.value = texture;
      surfaceMaterial.uniforms.uHasTargets.value = texture ? 1 : 0;
    },
    setReflectionMatrix(matrix) {
      surfaceMaterial.uniforms.uReflectionMatrix.value.copy(matrix);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}
