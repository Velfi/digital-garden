import * as THREE from 'three';
import { buildStoneGeometry, createStoneMaterial } from './stoneMesh';
import type { Stone } from './stones';
import {
  applyLighting,
  createLightUniforms,
  createRoomUniforms,
  createWaterUniforms,
  type LightUniforms,
  type WaterUniforms
} from './waterShader';
import { DEFAULT_LIGHT_LEVEL, DEFAULT_LIGHT_SOURCE_ID, resolveLighting } from './lighting';

/**
 * The pictures on the sticker sheet.
 *
 * Same arrangement as `previewScene.ts`, and for the same reasons: one WebGL
 * context shared by every picture on the sheet, each drawn into a corner of one
 * offscreen canvas and blitted onto its own 2D canvas. Eight contexts for eight
 * pebbles would be half a browser's budget spent on a drawer.
 *
 * Where it differs is that nothing here moves. A fragment preview turns, because
 * a still picture of a ball cannot say whether the far side is round; a sticker
 * is a sticker, and a spinning one would be a small liability on a sheet of
 * eight. So each is drawn exactly once, on the frame after it is attached, and
 * then the rig goes quiet until something changes.
 *
 * The other difference is that these are drawn *dry*. The stone material reads
 * the water block for its attenuation, so the rig binds one of its own with the
 * water switched off — the sticker is a photograph of the rock, not of the rock
 * at the bottom of a jar. It is the same material either way, so what the sheet
 * shows and what the jar draws cannot drift apart.
 */

/** Where the light comes from in the picture. Matches the tank's own lamp. */
const CAMERA_FOV = 30;
/** Above the equator and off to one side, so the flat top reads as flat. */
const CAMERA_POSITION = new THREE.Vector3(0, 2.1, 3.4);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MAX_PIXEL_RATIO = 2;

/**
 * The stone is drawn to fill this fraction of the frame's smaller side.
 *
 * Exported because the pop needs it: the sticker sheet has to say how big the
 * stone looked on paper, and that is this fraction of the sticker's box — not
 * something to be measured off the canvas, and not something to be guessed at
 * twice.
 */
export const FRAME_FILL = 0.82;

interface Entry {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  stone: Stone;
  geometry: THREE.BufferGeometry;
  /** Half-extents of the built geometry. See `framingRadius`. */
  extents: readonly [number, number, number];
  dirty: boolean;
}

const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
const cameraBasis = new THREE.Matrix4();

/**
 * How wide the stone is *as seen*, in metres, across the frame's two axes.
 *
 * Not the bounding sphere, which is the easy answer and leaves every sticker
 * with its stone floating in the middle of a great deal of white: these are
 * flat, oblate things, so the sphere that contains one is far larger than the
 * silhouette from a camera looking down at its broad side. The box's projection
 * onto the view axes is exact for an axis-aligned box and costs three absolute
 * values per axis.
 */
export function framingRadius(
  extents: readonly [number, number, number],
  right: THREE.Vector3,
  up: THREE.Vector3
): { halfWidth: number; halfHeight: number } {
  const project = (axis: THREE.Vector3) =>
    extents[0] * Math.abs(axis.x) + extents[1] * Math.abs(axis.y) + extents[2] * Math.abs(axis.z);
  return { halfWidth: project(right), halfHeight: project(up) };
}

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  water: WaterUniforms;
  light: LightUniforms;
  material: THREE.ShaderMaterial;
  dispose(): void;
}

const entries = new Set<Entry>();
let rig: Rig | null = null;
let rigUnavailable = false;
let frameId = 0;

function buildRig(): Rig {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const water = createWaterUniforms();
  const light = createLightUniforms();
  const room = createRoomUniforms();
  applyLighting(
    { water, room, light },
    resolveLighting({
      lightSource: DEFAULT_LIGHT_SOURCE_ID,
      lightLevel: DEFAULT_LIGHT_LEVEL,
      // The cream room: a sticker is a thing on paper, seen in the light of
      // wherever the paper is, not through eight centimetres of tank water.
      roomTone: 'cream'
    })
  );

  // No water in the box. The volume is moved well below the stone, so no view
  // ray ever crosses it and `applyWater` is the identity.
  //
  // Moved rather than collapsed to a point, which is the obvious way to do this
  // and is wrong: the slab test divides by the ray direction on purpose, relying
  // on IEEE infinities, and a zero-width slab whose face the camera sits exactly
  // on turns that into `0 * inf` — a NaN, straight down the middle of the
  // picture. The extinction is zeroed as well, so even a path that did cross it
  // would come out unchanged.
  water.uWaterBoxMin.value.set(-1, -3, -1);
  water.uWaterBoxMax.value.set(1, -2, 1);
  water.uSigmaA.value.set(0, 0, 0);
  water.uSigmaS.value.set(0, 0, 0);
  // Nothing overhead to shade against either — the shade term keys off height in
  // the jar, and a stone on a sheet is not in one.
  water.uShadeFloor.value = 1;

  /*
   * And photographic light, rather than the jar's.
   *
   * The tank's lamp is warm, dim and deliberately moody — it is one bulb in an
   * unlit room, and everything in the jar is meant to be half in shadow. Under
   * it, pale rocks come out khaki and the whole sheet reads as one colour: milk
   * quartz and speckled granite both arrive as the same warm grey, which makes
   * the swatch beside them a lie and the choice between them pointless.
   *
   * A sticker is a photograph, and a photograph of a rock is taken under a
   * neutral light for exactly this reason. So the key goes white, the fill goes
   * slightly cool to keep the shadow side from going flat, and the exposure
   * comes up to one. Nothing about the *stone* changes — same shape, same
   * surface, same material — only the light it is being shown in.
   */
  light.uKeyColour.value.set(1.4, 1.37, 1.32);
  light.uFillColour.value.set(0.56, 0.59, 0.64);
  water.uExposure.value = 1;

  const material = createStoneMaterial(water, light);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;

  const scene = new THREE.Scene();
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 40);

  return {
    renderer,
    scene,
    camera,
    mesh,
    water,
    light,
    material,
    dispose() {
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

function getRig(): Rig | null {
  if (rig || rigUnavailable) return rig;
  try {
    rig = buildRig();
    rig.renderer.domElement.addEventListener('webglcontextrestored', markAllDirty);
  } catch {
    rigUnavailable = true;
    rig = null;
  }
  return rig;
}

function markAllDirty() {
  for (const entry of entries) entry.dirty = true;
  wake();
}

function ensureRigSize(active: Rig, width: number, height: number): void {
  const canvas = active.renderer.domElement;
  if (canvas.width >= width && canvas.height >= height) return;
  active.renderer.setSize(Math.max(canvas.width, width), Math.max(canvas.height, height), false);
}

function sizeEntry(entry: Entry): boolean {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.max(1, Math.round(entry.canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(entry.canvas.clientHeight * ratio));
  if (entry.canvas.width === width && entry.canvas.height === height) return false;
  entry.canvas.width = width;
  entry.canvas.height = height;
  return true;
}

function drawEntry(active: Rig, entry: Entry): void {
  const width = entry.canvas.width;
  const height = entry.canvas.height;
  if (width < 1 || height < 1) return;

  ensureRigSize(active, width, height);
  active.mesh.geometry = entry.geometry;

  // Fit to whichever of the two axes runs out of room first, so a sticker in a
  // narrow slot is not cropped. The camera is moved rather than the stone
  // scaled, so a big cobble and a small pebble are drawn in the same
  // perspective and the difference between them is only the framing.
  const aspect = width / height;
  const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2);

  // The view basis for a camera at CAMERA_POSITION looking at the origin. The
  // distance does not change it, which is what lets the extents be projected
  // before the distance they decide is known.
  cameraBasis.lookAt(CAMERA_POSITION, ORIGIN, WORLD_UP);
  cameraRight.setFromMatrixColumn(cameraBasis, 0);
  cameraUp.setFromMatrixColumn(cameraBasis, 1);
  const { halfWidth, halfHeight } = framingRadius(entry.extents, cameraRight, cameraUp);

  const distance = Math.max(
    halfHeight / (FRAME_FILL * tanHalfFovY),
    halfWidth / (FRAME_FILL * tanHalfFovY * aspect),
    1e-4
  );

  active.camera.aspect = aspect;
  active.camera.position.copy(CAMERA_POSITION).normalize().multiplyScalar(distance);
  active.camera.lookAt(0, 0, 0);
  active.camera.near = distance * 0.1;
  active.camera.far = distance * 4;
  active.camera.updateProjectionMatrix();

  const buffer = active.renderer.domElement;
  const bottom = buffer.height - height;
  active.renderer.setViewport(0, bottom, width, height);
  active.renderer.setScissor(0, bottom, width, height);
  active.renderer.render(active.scene, active.camera);

  entry.context.clearRect(0, 0, width, height);
  entry.context.drawImage(buffer, 0, 0, width, height, 0, 0, width, height);
}

function frame() {
  frameId = 0;
  const active = getRig();
  if (!active) return;

  for (const entry of entries) {
    const resized = sizeEntry(entry);
    if (entry.dirty || resized) {
      drawEntry(active, entry);
      entry.dirty = false;
    }
  }
}

function wake() {
  if (frameId === 0 && entries.size > 0) frameId = requestAnimationFrame(frame);
}

function releaseRig() {
  if (entries.size > 0 || !rig) return;
  rig.renderer.domElement.removeEventListener('webglcontextrestored', markAllDirty);
  rig.dispose();
  rig = null;
}

export interface StonePreviewHandle {
  update(stone: Stone): void;
  dispose(): void;
}

/**
 * Draw `stone` into `canvas`. Returns null where there is no WebGL, which is
 * the caller's cue to show the flat stand-in instead.
 */
export function attachStonePreview(
  canvas: HTMLCanvasElement,
  stone: Stone
): StonePreviewHandle | null {
  const context = canvas.getContext('2d');
  if (!context || !getRig()) return null;

  const built = buildStoneGeometry(stone);
  const entry: Entry = {
    canvas,
    context,
    stone,
    geometry: built.geometry,
    extents: built.extents,
    dirty: true
  };

  entries.add(entry);
  wake();

  return {
    update(next) {
      if (next.kind === entry.stone.kind && next.seed === entry.stone.seed) return;
      const rebuilt = buildStoneGeometry(next);
      entry.geometry.dispose();
      entry.stone = next;
      entry.geometry = rebuilt.geometry;
      entry.extents = rebuilt.extents;
      entry.dirty = true;
      wake();
    },
    dispose() {
      entries.delete(entry);
      // Never the rig's own placeholder, and never a geometry the rig is still
      // pointing at — it is handed a new one before every draw, but a disposed
      // buffer left bound would be uploaded once more on a context restore.
      if (rig && rig.mesh.geometry === entry.geometry)
        rig.mesh.geometry = new THREE.BufferGeometry();
      entry.geometry.dispose();
      if (entries.size === 0 && frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      releaseRig();
    }
  };
}
